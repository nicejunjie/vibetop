// Iron Frontier — special.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from './blds.js';
import { bspecOfB, eliteOf, psiImmune, radImmune } from './combat-tables.js';
import { boom, damage, dist, entX, entY, near } from './combat.js';
import { recalcPower } from './entities.js';
import { bfacOf } from './factions.js';
import { isAir } from './geom.js';
import { killOccupants } from './neutral.js';
import { freeTileNear, freeWaterNear } from './production.js';
import { UNITS } from './roster.js';
import { G, headless, idx, inMap } from './state.js';
import { eva, sfx } from './ui/audio.js';
import { creditPop, say } from './ui/hud.js';
import { refreshPanel } from './ui/panel.js';
import { sel } from './ui/screen.js';
import { MAP, ME, neutral, otherSide } from './world.js';

// ===================================================================== //
//  Phase 4c — the special-unit mechanics. Every one of these is a weapon
//  whose warhead does something OTHER than subtract hit points, which is
//  why they all hang off fire() rather than off damage().
// ===================================================================== //

// ---- Terror Drone ([DRON] / [DroneJump] / [Parasite] Parasite=yes) ------
// RA2's drone does not shoot a tank. `LimboLaunch=yes` removes the drone
// from the map at the moment it fires and puts it INSIDE the victim, where
// it grinds the vehicle down until one of them is finished. A Service Depot
// is the only cure, and a drone whose host died climbs back out.
// [DroneJump] Damage=50, ROF=60 frames. RA2 runs its logic at 15 fps, which rules.ini states in its own
// comment beside IronCurtainDuration (line 693): "In frames 900 is a
// minute for 15fps". This file said 30 fps in three places and 15 in the
// rest, and every constant derived from the 30 was half what RA2 gives.
// At 15 fps ROF 60 is 50 points every FOUR seconds — 240 ticks here. At 120
// the drone chewed at twice RA2's rate (a 300-hp Grizzly died in 720 ticks
// instead of 1440) and a pair of them could carry a whole match.
export var PARASITE_DMG = 50, PARASITE_ROF = 240;

var SQUID_DMG = 100, SQUID_ROF = 60, SQUID_D0 = 15;   // SQUID_D0 = [SquidGrab] Damage=15, what SQUID_DMG was tuned at

export function infest(g, dr, v) {
  if (v.drone || dr.limbo) return false;
  v.drone = dr;
  dr.limbo = true; dr.inside = v.id; dr.sel = false;
  dr.order = null; dr.path = null; dr.wp = null; dr.target = null;
  dr.x = v.x; dr.y = v.y; dr.gnaw = g.tick;
  if (!headless) sfx('bark');
  if (v.p === ME) eva('Our vehicle has been infested', 12000);
  return true;
}

// The host died (or was repaired out from under it): put the drone back on
// the map beside the wreck, exactly as RA2 does.
export function popDrone(g, v) {
  var dr = v.drone;
  v.drone = null;
  if (!dr || dr.dead) return;
  var sp = (UNITS[dr.type].nav ? freeWaterNear(g, Math.round(v.x), Math.round(v.y))
                               : freeTileNear(g, Math.round(v.x), Math.round(v.y)));
  dr.limbo = false; dr.inside = 0; dr.cool = 30;
  dr.x = sp ? sp.x : v.x; dr.y = sp ? sp.y : v.y;
  dr.guardX = dr.x; dr.guardY = dr.y; dr.path = null; dr.repathAt = -999;
}

export function killDrone(g, v) {
  var dr = v.drone;
  v.drone = null;
  if (!dr || dr.dead) return;
  dr.dead = true; dr.limbo = false;
  g.side[dr.p].lost++;
  boom(g, v.x, v.y, 9);
}

export function stepInfest(g) {
  for (var i = 0; i < g.units.length; i++) {
    var v = g.units[i];
    if (v.dead || !v.drone) continue;
    if (v.drone.dead) { v.drone = null; continue; }
    var pd = UNITS[v.drone.type];
    if (g.tick - (v.drone.gnaw || 0) < (pd.grab ? SQUID_ROF : PARASITE_ROF)) continue;
    v.drone.gnaw = g.tick;
    // [SquidGrab] Culling=yes: a squid does not nibble a hull, it holds it
    // under until it goes down. Twice a Terror Drone's bite, twice as often.
    // [SquidGrabE] (rules.ini:18102) takes the grab from 15 to 40, so the
    // hold scales with the grab weapon our own table carries rather than
    // with a constant that cannot see the promotion.
    var gw = pd.grab && pd.w2 ? eliteOf(pd.w2, v.drone) : null;
    damage(g, v.drone, v, gw ? SQUID_DMG * (gw.dmg / SQUID_D0) : (pd.grab ? SQUID_DMG : PARASITE_DMG), 'Parasite');
  }
}

// ---- Crazy Ivan ([IVAN] / [IvanBomber] / [IvanBomb] IvanBomb=yes) -------
// [General] IvanTimedDelay=450 frames. RA2 runs its logic at 15 fps, which rules.ini states in its own
// comment beside IronCurtainDuration (line 693): "In frames 900 is a
// minute for 15fps". This file said 30 fps in three places and 15 in the
// rest, and every constant derived from the 30 was half what RA2 gives.
// At 15 fps the fuse is THIRTY seconds — 1800 ticks here, twice what it was.
// The bomb is PLACED (the warhead does no damage at all); what goes off is
// [IvanWH]: 400 damage, CellSpread 1.5, PercentAtMax=.25.
export var IVAN_BOMB_T = 1800, IVAN_DMG = 400, IVAN_SPREAD = 1.5, IVAN_ATMAX = 0.25;

var DEFUSE_RNG = 1.5;                            // [DefuseKit] Range=1.5

export function plantBomb(g, u, tgt, dmg) {
  if (tgt.bomb || tgt.dead) return false;
  // The yield is a property of the CHARGE, fixed when it is planted, not of
  // whoever is standing near it thirty seconds later: [IvanBomberE]
  // (rules.ini:17942) is 600 where [IvanBomber] is 400, so an elite Ivan
  // leaves a bigger bomb behind and it stays bigger after he dies.
  tgt.bomb = { p: u.p, at: g.tick + IVAN_BOMB_T, dmg: dmg > 0 ? dmg : IVAN_DMG };
  g.bombs.push(tgt);
  if (!headless) sfx('click');
  if (tgt.p === ME && u.p !== ME) { eva('Warning: bomb planted', 6000); say('A bomb has been planted on ' + describeShort(tgt), true, 260); }
  else if (u.p === ME) say('Bomb planted — ' + Math.round(IVAN_BOMB_T / 60) + 's');
  return true;
}

export function defuseBomb(g, e) {
  if (!e.bomb) return false;
  e.bomb = null;
  var i = g.bombs.indexOf(e);
  if (i >= 0) g.bombs.splice(i, 1);
  return true;
}

export function stepBombs(g) {
  for (var i = g.bombs.length - 1; i >= 0; i--) {
    var e = g.bombs[i];
    if (!e.bomb || e.dead) { e.bomb = null; g.bombs.splice(i, 1); continue; }
    if (g.tick < e.bomb.at) {
      // [IVANBOMB] the charge ticks audibly, and faster as the timer runs out.
      if (!headless) { var _left = e.bomb.at - g.tick; if ((g.tick % (_left < 120 ? 20 : 40)) === 0) sfx('ivantick', entX(e), entY(e)); }
      continue;
    }
    var src = { kind: 'u', type: 'ivan', p: e.bomb.p, rank: 0 };
    var bx = entX(e), by = entY(e);
    // Read the yield BEFORE the charge is unhooked — it is the bomb's own
    // number ([IvanBomber] 400 / [IvanBomberE] 600), and `e.bomb` is gone
    // on the next line.
    var bdmg = e.bomb.dmg > 0 ? e.bomb.dmg : IVAN_DMG;
    e.bomb = null; g.bombs.splice(i, 1);
    boom(g, bx, by, 26);
    sfx('boom3', bx, by);
    // The carrier itself takes the full charge; everything inside
    // CellSpread takes it scaled down to PercentAtMax at the rim.
    damage(g, src, e, bdmg, 'IvanWH');
    (function (skip) {
      near(bx, by, IVAN_SPREAD + 1, function (o) {
        if (o.dead || o === skip || isAir(o)) return;
        var dd = Math.sqrt((entX(o) - bx) * (entX(o) - bx) + (entY(o) - by) * (entY(o) - by));
        if (dd > IVAN_SPREAD) return;
        damage(g, src, o, bdmg * (1 - (1 - IVAN_ATMAX) * dd / IVAN_SPREAD), 'IvanWH');
      });
    })(e);
  }
}

// An Engineer carries the [DefuseKit] and RA2 gives him `BombSight=4` to
// spot one with. He does not spend himself doing it.
export function engineerDefuse(g, u) {
  for (var i = g.bombs.length - 1; i >= 0; i--) {
    var e = g.bombs[i];
    if (!e.bomb || e.dead || e.bomb.p === u.p) continue;
    var dx = entX(e) - u.x, dy = entY(e) - u.y;
    if (dx * dx + dy * dy > DEFUSE_RNG * DEFUSE_RNG) continue;
    defuseBomb(g, e);
    if (u.p === ME) { eva('Bomb defused', 4000); say('Bomb defused'); }
    return true;
  }
  return false;
}

// ---- Tesla Trooper charging a coil ([SHK] + [OPCoilBolt]) --------------
// RA2 lets up to three Shock Troopers hold a Tesla Coil. A charged coil
// fires with no power at all and swaps its bolt for [OPCoilBolt] — 300
// damage against the coil's own 200.
export var COIL_CREW_MAX = 3, COIL_BOOST = 300 / 200;

export function coilCharged(g, b) { return b.type === 'tesla' && b.crewTick >= g.tick - 2 && b.crewN > 0; }

export function coilCrew(g, b) {
  if (b.crewTick !== g.tick) { b.crewTick = g.tick; b.crewN = 0; }
  if (b.crewN >= COIL_CREW_MAX) return false;
  b.crewN++;
  return true;
}

// ---- Desolator + the radiation layer ([Radiation]) ---------------------
// rules.ini [Radiation]: RadLevelMax=500, RadLevelFactor=0.2 (damage per
// level), RadApplicationDelay=16 frames, RadDurationMultiple=1 (the site
// lasts Level frames), RadColor=0,255,0. RA2 runs its logic at 15 fps, which rules.ini states in its own
// comment beside IronCurtainDuration (line 693): "In frames 900 is a
// minute for 15fps". This file said 30 fps in three places and 15 in the
// rest, and every constant derived from the 30 was half what RA2 gives.
// At 15 fps RadApplicationDelay=16 is one application about every SECOND —
// 64 ticks here, not 32. The decay pair below is ours, not RA2's, and is
// left alone: RadDurationMultiple is a per-level lifetime we do not model.
export var RAD_MAX = 500, RAD_FACTOR = 0.2, RAD_APPLY = 64, RAD_DECAY_T = 10, RAD_DECAY = 5;

export var DESO_RAD_LEVEL = 90, DESO_RAD_R = 3, DESO_RAD_T = 30;

export function addRad(g, cx, cy, level, radius) {
  var x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(MAP - 1, Math.ceil(cx + radius));
  var y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(MAP - 1, Math.ceil(cy + radius));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    if (d > radius) continue;
    var i = idx(x, y);
    g.rad[i] = Math.min(RAD_MAX, g.rad[i] + level * (1 - 0.55 * d / radius));
    g.radOwn[i] = 0;
    g.radAny = 1;
  }
}

export function radAt(g, x, y) {
  var xi = Math.round(x), yi = Math.round(y);
  return inMap(xi, yi) ? g.rad[idx(xi, yi)] : 0;
}

var RAD_SRC = { kind: 'u', type: 'desolator', p: 0, rank: 0 };

// A unit can change hands (mind control) or leave the board (erasure) while
// it is in the player's selection; `sel` is a presentation array, so the sim
// pokes it through this one hook and never touches it directly.
export function dropFromSel(u) {
  if (headless || typeof sel === 'undefined' || !sel) return;
  var i = sel.indexOf(u);
  if (i >= 0) sel.splice(i, 1);
}

export function stepRad(g) {
  if (!g.radAny) return;
  var r = g.rad, i;
  if ((g.tick % RAD_DECAY_T) === 0) {
    var any = 0;
    for (i = 0; i < r.length; i++) if (r[i] > 0) { r[i] = r[i] > RAD_DECAY ? r[i] - RAD_DECAY : 0; if (r[i] > 0) any = 1; }
    g.radAny = any;
    if (!any) return;
  }
  if ((g.tick % RAD_APPLY) !== 0) return;
  for (i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    if (u.dead || u.air || u.limbo || radImmune(u)) continue;
    var lvl = radAt(g, u.x, u.y);
    if (lvl <= 0) continue;
    RAD_SRC.p = otherSide(u.p);                       // nobody owns a puddle; credit the other side
    damage(g, RAD_SRC, u, lvl * RAD_FACTOR, 'RadSite');
  }
}

// ---- Yuri ([YURI] / [MindControl] / [Controller] MindControl=yes) -------
// One victim at a time, permanently, until Yuri dies. `ImmuneToPsionics=yes`
// is the whole gate: miners, Terror Drones and Yuri himself are exempt, and
// a warhead with MindControl=yes has Verses 0% against every structure.
export function mindControl(g, y, tgt) {
  if (tgt.kind !== 'u' || tgt.dead || psiImmune(tgt) || tgt.p === y.p) return false;
  releaseMind(g, y);
  tgt.mcHome = tgt.mcBy ? tgt.mcHome : tgt.p;      // the ORIGINAL owner, through a re-capture
  var prev = tgt.mcBy && g.byId[tgt.mcBy];
  if (prev && prev !== y) prev.mcTarget = 0;
  tgt.p = y.p; tgt.mcBy = y.id; tgt.mcAt = g.tick;
  tgt.order = null; tgt.path = null; tgt.wp = null; tgt.target = null;
  tgt.guard = false; tgt.stopped = false; tgt.guardX = tgt.x; tgt.guardY = tgt.y;
  if (tgt.sel) { tgt.sel = false; if (!headless) dropFromSel(tgt); }
  y.mcTarget = tgt.id;
  if (y.p === ME) { eva('Mind control engaged', 6000); say('Mind-controlled ' + describeShort(tgt)); }
  else if (tgt.mcHome === ME) { eva('Warning: our unit has been mind-controlled', 8000); say('One of ours has been mind-controlled', true, 260); }
  return true;
}

export function releaseMind(g, y) {
  var t = y.mcTarget && g.byId[y.mcTarget];
  y.mcTarget = 0;
  if (!t || t.dead || t.mcBy !== y.id) return false;
  t.p = t.mcHome; t.mcBy = 0;
  t.order = null; t.path = null; t.target = null;
  t.guard = false; t.guardX = t.x; t.guardY = t.y;
  if (t.sel) { t.sel = false; if (!headless) dropFromSel(t); }
  return true;
}

// ---- Chrono Legionnaire ([CLEG] / [NeutronRifle] / [ChronoBeam]) --------
// `Temporal=yes`: the beam does not damage the target, it erases it from
// the timeline, and RA2 scales how long that takes by the victim's
// Strength. Break the beam and the victim snaps back to whole.
// A `Temporal=yes` weapon's Damage is not damage: it is the RATE the victim
// is erased at, against its Strength. [NeutronRifle] is 8 and its
// [NeutronRifleE] (rules.ini:17889) is 16, so an elite Chrono Legionnaire
// erases exactly twice as fast — the only thing its promotion changes.
var ERASE_D0 = 8;                                // [NeutronRifle] Damage=8, the rate ERASE_K was measured at

var ERASE_K = 0.96;                              // 125 hp erased in ~2 s, an 800 hp Apocalypse in ~13 s

var CLEG_MIN_DELAY = 32, CLEG_PER_CELL = 10;     // [General] ChronoMinimumDelay / 256/ChronoDistanceFactor

export function startErase(g, u, tgt) {
  if (tgt.dead || (tgt.kind === 'b' && (BLDS[tgt.type].wall || BLDS[tgt.type].gate))) return false;
  if (tgt.erasedBy && tgt.erasedBy !== u.id) return false;
  tgt.erasedBy = u.id;
  if (tgt.erase == null) tgt.erase = 0;
  u.eraseId = tgt.id;
  return true;
}

export function stepErase(g) {
  // RA2's Chrono Legionnaire erases STRUCTURES as well as units, and the
  // Strength scaling is what makes a Construction Yard a two-man job.
  stepEraseList(g, g.units);
  stepEraseList(g, g.blds);
}

function stepEraseList(g, list) {
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t.dead || !t.erasedBy) continue;
    var by = g.byId[t.erasedBy];
    var live = by && !by.dead && by.eraseId === t.id &&
               dist(by, t) <= UNITS[by.type].rng + (t.kind === 'b' ? Math.max(t.gw, t.gh) / 2 : 0) + 0.6;
    if (!live) {                                  // beam broken: RA2 restores the victim
      t.erasedBy = 0; t.erase = 0;
      if (by && by.eraseId === t.id) by.eraseId = 0;
      continue;
    }
    t.erase += (eliteOf(UNITS[by.type], by).dmg / ERASE_D0) / (t.maxhp * ERASE_K);
    if (t.erase < 1) continue;
    // Gone. Not killed — removed; there is no body, no wreck, no rubble.
    t.erase = 1; t.erasedBy = 0; by.eraseId = 0;
    by.kills = (by.kills || 0) + 1;
    if (!neutral(t.p)) g.side[t.p].lost++;
    if (!neutral(by.p)) g.side[by.p].killed++;
    if (t.kind === 'b') {
      t.dead = true;
      killOccupants(g, t);
      for (var ey = t.y; ey < t.y + t.gh; ey++) for (var ex = t.x; ex < t.x + t.gw; ex++)
        if (inMap(ex, ey) && g.occ[idx(ex, ey)] === t.id) g.occ[idx(ex, ey)] = 0;
      recalcPower(g, t.p);
    } else {
      t.dead = true;
      if (t.drone) popDrone(g, t);
      if (t.mcTarget) releaseMind(g, t);
      if (t.mcBy) { var mb = g.byId[t.mcBy]; if (mb) mb.mcTarget = 0; }
    }
    if (!headless) g.fx.push({ x: entX(t), y: entY(t), t: 0, life: 26, chrono: true });
    if (t.p === ME) eva(t.kind === 'b' ? 'Structure lost' : 'Unit lost', 5000);
  }
}

// The teleport locomotor: `ChronoTrigger=yes` means the delay VARIES with
// distance — 256/ChronoDistanceFactor(48) frames per cell, floored at
// ChronoMinimumDelay=16, doubled for our tick rate.
export function chronoDelayFor(d) { return Math.max(CLEG_MIN_DELAY, Math.round(d * CLEG_PER_CELL)); }

export function beginWarp(g, u, tx, ty) {
  var d = Math.sqrt((tx - u.x) * (tx - u.x) + (ty - u.y) * (ty - u.y));
  if (d < 0.6) return false;
  u.warp = { x: tx, y: ty, at: g.tick + chronoDelayFor(d), out: g.tick };
  u.path = null; u.pi = 0;
  if (!headless) g.fx.push({ x: u.x, y: u.y, t: 0, life: 24, chrono: true });
  return true;
}

export function stepWarp(g, u) {
  // Out of phase: untargetable, unmovable, and it re-materialises on time.
  if (g.tick < u.warp.at) { u.limbo = true; return; }
  if (u.warp.drown) {
    // Rematerialised over open water: RA2 loses the vehicle.
    u.x = u.warp.x; u.y = u.warp.y; u.limbo = false; u.warp = null;
    u.dead = true; g.side[u.p].lost++;
    if (u.drone) popDrone(g, u);
    boom(g, u.x, u.y, 14);
    if (u.sel) dropFromSel(u);
    if (u.p === ME) eva('Unit lost', 5000);
    return;
  }
  var sp = freeTileNear(g, Math.max(0, Math.min(MAP - 1, Math.round(u.warp.x))),
                           Math.max(0, Math.min(MAP - 1, Math.round(u.warp.y))));
  if (sp) { u.x = sp.x; u.y = sp.y; }
  u.limbo = false; u.warp = null;
  u.guardX = u.x; u.guardY = u.y; u.repathAt = -999; u.movedAt = g.tick;
  if (u.order && u.order.t === 'move') u.order = null;
  if (!headless) g.fx.push({ x: u.x, y: u.y, t: 0, life: 24, chrono: true });
}

// ---- Spy ([SPY] Agent/Infiltrate, [MakeupKit]/[Snapshot]) --------------
// [General] SpyPowerBlackout=1000 frames, SpyMoneyStealPercent=.5. The EVA
// lines are eva.ini #88-95: the victim hears "Building infiltrated…", the
// owner of the Spy hears the short form.
export var SPY_BLACKOUT = 60 * 60, SPY_STEAL = 0.5;

export function spyInfiltrate(g, u, b) {
  var vic = g.side[b.p], mine = g.side[u.p], key = b.type, amt = 0;
  var yours = u.p === ME, theirs = b.p === ME;
  if (key === 'refinery' || key === 'purifier') {
    amt = Math.round(vic.credits * SPY_STEAL);
    vic.credits -= amt; mine.credits += amt;
    if (yours) { eva('Cash stolen', 6000); say('Spy stole $' + amt); if (!headless) { creditPop(amt); sfx('cash'); } }
    if (theirs) { eva('Building infiltrated: cash stolen', 8000); say('A spy emptied half our bank', true, 300); }
  } else if (key === 'power' || key === 'reactor') {
    vic.blackout = g.tick + SPY_BLACKOUT;
    if (yours) { eva('Power sabotaged', 6000); say('Spy blacked out the enemy grid for a minute'); }
    if (theirs) { eva('Building infiltrated: power sabotaged', 8000); say('A spy has blacked out our grid', true, 300); }
  } else if (key === 'radar' || key === 'airforce') {
    // eva.ini #89/#93 "Radar sabotaged": the victim loses the map he has
    // uncovered and has to scout it again.
    if (b.p === ME) { for (var i = 0; i < g.seen.length; i++) g.seen[i] = 0; g.debugSeen = false; }
    if (yours) { eva('Radar sabotaged', 6000); say('Spy wiped the enemy radar'); }
    if (theirs) { eva('Building infiltrated: radar sabotaged', 8000); say('A spy wiped our radar — the map is dark again', true, 300); }
  } else if (key === 'barracks' || key === 'factory') {
    // RA2: a spied production building turns out VETERAN units from then on.
    if (key === 'barracks') mine.vetInf = true; else mine.vetVeh = true;
    if (yours) { eva('Unit promoted to veteran', 6000); say('Spy stole their training — new ' + (key === 'barracks' ? 'infantry' : 'vehicles') + ' come out veteran'); }
    if (theirs) { eva('Building infiltrated', 8000); say('A spy has been in our ' + bspecOfB(g, b).name, true, 300); }
  } else if (key === 'lab') {
    // eva.ini #88/#92 "Technology stolen": the enemy's Battle Lab unit
    // joins YOUR build list.
    var loot = bfacOf(g, b) === 'col' ? 'teslatank' : 'mirage';   // the LAB's technology, not its holder's
    (mine.stolen || (mine.stolen = [])).indexOf(loot) < 0 && mine.stolen.push(loot);
    if (yours) { eva('Technology stolen', 8000); say('Technology stolen — the ' + UNITS[loot].name + ' is on your list now'); if (!headless) refreshPanel(); }
    if (theirs) { eva('Building infiltrated: technology stolen', 8000); say('A spy has stolen our technology', true, 300); }
  } else {
    if (yours) say('Nothing worth taking in there', true);
    return false;
  }
  return true;
}

// A short name for the EVA/status lines above, without the hp tail that
// describe() adds (which the sim has no business computing headless).
export function describeShort(e) {
  return e.kind === 'b' ? bspecOfB(G || { side: [{ fac: 'dir' }, { fac: 'col' }] }, e).name
                        : UNITS[e.type].name;
}
