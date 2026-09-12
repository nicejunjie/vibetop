// Iron Frontier — transport.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { uspd } from './combat-tables.js';
import { dist, fire, infCorpse, isVeh, near } from './combat.js';
import { spawnUnit } from './entities.js';
import { canHit } from './geom.js';
import { entById, flyToward, hoverIdle } from './move.js';
import { standSpot } from './production.js';
import { UNITS, ifvSpec } from './roster.js';
import { dropFromSel, releaseMind } from './special.js';
import { headless } from './state.js';
import { sfx } from './ui/audio.js';
import { neutral } from './world.js';

// --------------------------------------------------------------------- //
//  Carrier air group ([CARRIER] Spawns=HORNET / SpawnsNumber=3 /
//  SpawnReloadRate=150). The Hornets ARE the carrier's weapon: they are
//  TechLevel -1 so they never reach a build list, they take no orders of
//  their own, and one that makes it back to the deck is re-armed there.
//  The Airforce Command's pad cycle is reused wholesale — the carrier is
//  the pad, `u.mother` is the slot.
// --------------------------------------------------------------------- //
function spawnStock(u) {
  var d = UNITS[u.type];
  if (!d.spawns) return 0;
  if (u.brood == null) u.brood = d.spawnN;
  return u.brood;
}

export function stepSpawner(g, u) {
  var d = UNITS[u.type];
  if (u.brood == null) u.brood = d.spawnN;
  if (u.brood < d.spawnN && (g.tick % d.spawnReload) === 0) u.brood++;
}

export function launchSpawns(g, src, tgt) {
  var d = UNITS[src.type], n = spawnStock(src);
  if (n <= 0) { src.cool = 60; return; }       // empty deck: try again shortly
  var sd = UNITS[d.spawns];
  for (var i = 0; i < n; i++) {
    var h = spawnUnit(g, d.spawns, src.p, src.x, src.y);
    h.mother = src.id; h.tgtId = tgt.id; h.ammo = sd.ammo; h.born = g.tick;
    h.guardX = src.x; h.guardY = src.y;
    h.face = ((Math.round(Math.atan2((tgt.kind === 'b' ? tgt.cy : tgt.y) - src.y,
                                     (tgt.kind === 'b' ? tgt.cx : tgt.x) - src.x) / (Math.PI / 4)) % 8) + 8) % 8;
  }
  src.brood = 0;
  if (!headless) sfx('boom3', src.x, src.y);
}

export function stepSpawned(g, u) {
  var d = UNITS[u.type];
  var mom = u.mother ? g.byId[u.mother] : null;
  if (mom && mom.dead) mom = null;
  var t = u.tgtId ? entById(g, u.tgtId) : null;
  if (t && (t.dead || !canHit(d, t, u))) t = null;
  if (!u.rtb && t && u.ammo > 0) {
    var tx = t.kind === 'b' ? t.cx : t.x, ty = t.kind === 'b' ? t.cy : t.y;
    if (dist(u, t) <= d.rng) {
      u.face = ((Math.round(Math.atan2(ty - u.y, tx - u.x) / (Math.PI / 4)) % 8) + 8) % 8;
      if (u.cool <= 0) fire(g, u, t);
      if (u.ammo <= 0) u.rtb = true;
    } else flyToward(g, u, tx, ty, uspd(u));
    return;
  }
  u.rtb = true;
  // Nothing to go home to: it circles where it is until something shoots it
  // down, which is exactly what RA2 does with an orphaned spawn.
  if (!mom) { hoverIdle(g, u); return; }
  if (!flyToward(g, u, mom.x, mom.y, uspd(u))) {
    u.dead = true; u.limbo = true;             // recovered, not lost
    if (u.sel) dropFromSel(u);
    mom.brood = Math.min(UNITS[mom.type].spawnN, (mom.brood == null ? 0 : mom.brood) + 1);
  }
}

// --------------------------------------------------------------------- //
//  Transports (RA2 `Passengers=`)
// --------------------------------------------------------------------- //
//  Flak Track 5, IFV 1, Nighthawk 5, Amphibious Transport 12. A passenger
//  is stored the way a garrison's occupants are — a plain record, not a live
//  unit — so it is off the map by construction: not targetable, not in the
//  army, not band-selectable, and it comes back out with the health and the
//  rank it went in with. RA2 does NOT eject a load when the hull dies
//  (rules.ini's only survivor mechanism is [General] CrewEscape, which
//  spawns ONE crewman for a Crewed= vehicle, not the cargo), so the men
//  inside go with it.
export function paxCapOf(u) { return (u && UNITS[u.type] && UNITS[u.type].pax) || 0; }

export function paxCount(u) { return u && u.pax ? u.pax.length : 0; }

// Can THIS unit ride in THAT transport? Only our own, only one with room,
// and only the classes rules.ini lets aboard: everything but the
// Amphibious Transport is infantry-only, and nothing carries a transport.
export function canBoard(g, tr, u) {
  if (!tr || tr.dead || !u || u.dead || tr === u) return false;
  if (tr.kind !== 'u' || u.kind !== 'u' || tr.p !== u.p) return false;
  if (!paxCapOf(tr) || paxCount(tr) >= paxCapOf(tr)) return false;
  var d = UNITS[u.type], td = UNITS[tr.type];
  if (paxCapOf(u)) return false;                       // no transport rides a transport
  if ((d.harv && !td.paxHarv) || d.deploysInto || d.air) return false;  // no MCV, nothing that flies;
                                                      // a miner only rides an AMPHIBIOUS hull (island ore)
  if (d.cls === 'i') return !!td.paxInf;
  return !!td.paxVeh;
}

export function boardTransport(g, tr, u) {
  if (!canBoard(g, tr, u)) return false;
  if (!tr.pax) tr.pax = [];
  tr.pax.push({ type: u.type, hp: u.hp, rank: u.rank || 0, kv: u.kv || 0 });
  u.dead = true; u.order = null; u.path = null;
  if (u.sel) dropFromSel(u);
  if (u.mcTarget) releaseMind(g, u);
  if (!headless) sfx('garrin', tr.x, tr.y);            // EnterTransportSound=EnterTransport
  return true;
}

// Everybody out, onto free cells around the hull, at the health they went
// in with. Returns how many made it out; a transport parked in a hole keeps
// whoever it could not put down.
// The whole load steps out in ONE tick, so the neighbour index has not been
// rebuilt between men: standSpot alone would put all twelve on the same
// cell. The cells handed out are tracked here, exactly as spreadSpot does.
export function unloadTransport(g, tr) {
  var out = [], used = {};
  if (!tr || !tr.pax || !tr.pax.length) return out;
  while (tr.pax.length) {
    var sp = standSpot(g, Math.round(tr.x), Math.round(tr.y), used);
    if (!sp) break;
    used[sp.x + ',' + sp.y] = 1;
    var o = tr.pax[0];
    var u = spawnUnit(g, o.type, tr.p, sp.x, sp.y);
    u.hp = Math.max(1, o.hp); u.rank = o.rank; u.kv = o.kv;
    u.guardX = u.x; u.guardY = u.y;
    tr.pax.shift(); out.push(u);
  }
  if (out.length && !headless) sfx('garrout', tr.x, tr.y);   // LeaveTransportSound=ExitTransport
  return out;
}

// The hull went up with the load aboard.
export function killPassengers(g, tr) {
  if (!tr || !tr.pax || !tr.pax.length) return 0;
  var n = tr.pax.length;
  for (var i = 0; i < n; i++) {
    if (!headless) infCorpse(g, { kind: 'u', type: tr.pax[i].type, p: tr.p, x: tr.x, y: tr.y }, 'HE');
    if (!neutral(tr.p)) g.side[tr.p].lost++;
  }
  tr.pax.length = 0;
  return n;
}

// [RepairBullet] Damage=-50, ROF=80, Range=1.8, Warhead=Mechanical (0%
// against every infantry armour): an Engineer riding an IFV welds the
// friendly VEHICLES around it and has no gun at all.
export function stepRepairIFV(g, u) {
  var m = ifvSpec(u);
  if (!m.repair) return false;
  if (u.cool > 0) return true;
  var best = null, bw = 0;
  near(u.x, u.y, m.rng + 1, function (o) {
    if (o.dead || o.p !== u.p || o === u) return;
    if (o.kind !== 'u' || !isVeh(o) || o.hp >= o.maxhp) return;
    if (dist(u, o) > m.rng) return;
    var w = o.maxhp - o.hp;
    if (w > bw) { bw = w; best = o; }
  });
  if (!best) return true;
  best.hp = Math.min(best.maxhp, best.hp + m.repair);
  u.cool = m.rate;
  u.fireAt = g.tick;
  if (!headless) {
    g.fx.push({ x: best.x, y: best.y, t: 0, life: 14, size: 0, ping: true });
    sfx('repairifv', u.x, u.y);
  }
  return true;
}
