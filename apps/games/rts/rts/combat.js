// Iron Frontier — combat.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { FANG } from './bake/kit.js';
import { lcg } from './bake/states.js';
import { BLDS } from './blds.js';
import { INF_DEATH, WH_WALL, bspecOfB, eliteOf, infCrawls, isHarv, isInfArmour, isWall, proneMul, psiImmune, versesVs, vetArmour, vetFire, vetRofU, weaponFor } from './combat-tables.js';
import { killBld, powered } from './entities.js';
import { facOf } from './factions.js';
import { altOf, canHit, edgeDist, isAir, isNaval, isSub, rngVs, subSeen, tooClose } from './geom.js';
import { PRISM_SUP_MOD } from './move.js';
import { THREAT_PER_OCCUPANT, damageBridge, occCount, paraDrop } from './neutral.js';
import { CHRONO_DELAY } from './ore.js';
import { hasBld } from './production.js';
import { _seed, rnd } from './rng.js';
import { UNITS } from './roster.js';
import { COIL_BOOST, RAD_MAX, addRad, coilCharged, defuseBomb, dropFromSel, infest, mindControl, plantBomb, popDrone, releaseMind, startErase } from './special.js';
import { headless, idx, inMap } from './state.js';
import { IRON_T, NUKE_FLIGHT, STORM_T, SW, SW_KEYS, ironed } from './supers.js';
import { killPassengers, launchSpawns } from './transport.js';
import { REPORT, eva, sfx } from './ui/audio.js';
import { say } from './ui/hud.js';
import { MAP, ME, P_AI, P_HUMAN, T_BRIDGE, T_GROUND, T_ORE, aiOf, neutral, waterish } from './world.js';

// --------------------------------------------------------------------- //
//  Spatial hash — keeps target search O(neighbourhood) instead of O(n²).
// --------------------------------------------------------------------- //
var CELL = 6;

export var hash = {};

export var HASH_UNSET = -1e9;                          // "no index yet", forces a rebuild on tick 0

export var hashAt = HASH_UNSET;                        // tick of the last rebuild

export function rebuildHash(g) {
  for (var k in hash) hash[k].length = 0;     // keep the arrays, drop contents
  function add(e) {
    var ex = e.kind === 'b' ? e.cx : e.x, ey = e.kind === 'b' ? e.cy : e.y;
    var key = ((ex / CELL) | 0) + ',' + ((ey / CELL) | 0);
    (hash[key] || (hash[key] = [])).push(e);
  }
  for (var i = 0; i < g.units.length; i++) if (!g.units[i].dead && !g.units[i].limbo) add(g.units[i]);
  for (var j = 0; j < g.blds.length; j++) {
    var b = g.blds[j];
    if (!b.dead) add(b);                      // b.cx/cy are its centre
  }
}

// A 32-bit FNV-1a fingerprint of everything the simulation owns. Two
// lockstep clients that have run the same commands over the same ticks must
// produce the same number; the first tick where they do not is the desync.
// (It is also what the save/load round-trip test compares.)
export function stateHash(g) {
  var h = 2166136261 >>> 0, i, k;
  function mix(v) { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; }
  mix(g.tick); mix(_seed); mix(Math.round(g.side[0].credits)); mix(Math.round(g.side[1].credits));
  for (i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    mix(u.id); mix(u.dead ? 1 : 0); mix(Math.round(u.x * 64)); mix(Math.round(u.y * 64));
    mix(Math.round(u.hp)); mix(u.face | 0); mix(u.target ? u.target.id : 0);
  }
  for (i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    mix(b.id); mix(b.dead ? 1 : 0); mix(Math.round(b.hp)); mix(b.target ? b.target.id : 0);
  }
  for (k = 0; k < g.ore.length; k += 7) mix(Math.round(g.ore[k]));
  return h >>> 0;
}

// Every match starts from the same derived state: emptied buckets and an
// unset rebuild clock (see newState).
export function resetHash() {
  for (var k in hash) delete hash[k];
  hashAt = HASH_UNSET;
}

export function near(x, y, r, fn) {
  var c0 = ((x - r) / CELL) | 0, c1 = ((x + r) / CELL) | 0;
  var d0 = ((y - r) / CELL) | 0, d1 = ((y + r) / CELL) | 0;
  for (var cx = c0; cx <= c1; cx++) for (var cy = d0; cy <= d1; cy++) {
    var arr = hash[cx + ',' + cy];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) fn(arr[i]);
  }
}

export function dist(a, b) {
  var ax = a.kind === 'b' ? a.cx : a.x, ay = a.kind === 'b' ? a.cy : a.y;
  var bx = b.kind === 'b' ? b.cx : b.x, by = b.kind === 'b' ? b.cy : b.y;
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

export function armourOf(e) { return (e.kind === 'b' ? BLDS[e.type] : UNITS[e.type]).armour; }

// RA2 Mirage Tank: standing still, it dresses itself as a tree of the
// local theatre. Firing blows the disguise for two seconds, and an enemy
// that walks within 1.5 tiles is close enough to see the barrel.
var MIRAGE_IDLE = 120;

// `DetectDisguise=yes` is on exactly one thing in rules.ini's buildable set:
// the Attack Dog. A hostile dog inside its Sight of 9 strips a Mirage of its
// tree, for everybody — the tank is drawn, hoverable and shootable again.
export function detected(g, u) {
  for (var i = 0; i < g.units.length; i++) {
    var d = g.units[i];
    if (d.dead || d.p === u.p || !UNITS[d.type].detect) continue;
    var r = UNITS[d.type].sight, dx = d.x - u.x, dy = d.y - u.y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

export function isDisguised(g, u) {
  if (u.kind !== 'u' || u.dead) return false;
  // [SPY] CanDisguise + PermaDisguise=yes: unlike the Mirage it does not
  // have to stand still, and moving never blows it — only a dog does
  // (DetectDisguise=yes, the same key that sees through a Mirage).
  if (UNITS[u.type].spy) return !detected(g, u);
  return u.type === 'mirage' && !u.order &&
         g.tick - (u.movedAt || -9999) > MIRAGE_IDLE &&
         g.tick - (u.fireAt || -9999) > MIRAGE_IDLE &&
         !detected(g, u);
}

export function findTarget(g, e, rng) {
  // -Infinity, not -1: the score is a PREFERENCE between candidates, never a
  // threshold for engaging at all. With a -1 floor, a target this weapon is
  // merely bad against scored negative and was ignored entirely — a Sentry
  // Gun (vs.bld 0.3) would sit and watch an enemy structure it could damage,
  // because 0.3*100 - dist*6 - 40 is negative at every distance.
  var best = null, bs = -Infinity;
  var ex = e.kind === 'b' ? e.cx : e.x, ey = e.kind === 'b' ? e.cy : e.y;
  var spec = e.kind === 'b' ? BLDS[e.type] : UNITS[e.type];
  // `ElitePrimary=` can widen both of these ([MedusaE] Range 12 -> 14 and
  // aaRng with it), and a scan window narrower than the weapon that gets
  // resolved inside it silently never offers the target.
  var espec = e.kind === 'u' ? eliteOf(spec, e) : spec;
  var reach = Math.max(rng, espec.aa && espec.aaRng ? espec.aaRng : 0, espec.rng || 0);
  near(ex, ey, reach + 1, function (o) {
    if (o.dead || o.p === e.p) return;
    if (o.limbo) return;                   // inside a vehicle, or out of phase mid-warp
    if (!canHit(spec, o, e.kind === 'u' ? e : null)) return;   // a GI cannot shoot a Kirov; a Patriot cannot shoot a tank
    if (isSub(o) && !subSeen(g, o, e.p)) return;                // running submerged and undetected
    var d = dist(e, o);
    // A Mirage reads as a tree until you are almost touching it; a Spy in
    // the enemy's own uniform is never shot at at all until a dog says so.
    if (isDisguised(g, o) && (UNITS[o.type].spy || d > 1.5)) return;
    // ThreatPosed=0 on [GAWALL]/[NAWALL]: nothing ever CHOOSES to shoot a
    // wall. You can force-fire one, and splash will chew it, but a tank on
    // attack-move walks past concrete looking for something that matters.
    if (isWall(o)) return;
    // Insignificant=yes on every civilian and tech section: an empty city
    // block, a derrick or a repair hut is scenery, and nothing chooses to
    // shoot it. The moment men are firing out of the windows it is a
    // building like any other — worth [General] ThreatPerOccupant=10 a head.
    if (o.kind === 'b' && BLDS[o.type].neut && !occCount(o) && neutral(o.p)) return;
    if (o.kind === 'b' && BLDS[o.type].immune) return;
    var w = weaponFor(spec, o, e);
    // A [Controller] shot at anything ImmuneToPsionics is a wasted 200-frame
    // reload, and a Chrono Legionnaire cannot erase a wall.
    if (w.wh === 'Controller' && psiImmune(o)) return;
    if (w.wh === 'ChronoBeam' && isWall(o)) return;
    var mult = w.wh ? versesVs(w.wh, o) : 1;
    var de = edgeDist(e, o);                                    // range is to the WALL, not the centre
    if (mult <= 0 || de > rngVs(w, o) || tooClose(w, de)) return;   // this weapon cannot hurt / reach it
    var score;
    if (g.focusFor[e.p]) {
      // Prefer what we hurt most, then what is closest to dying: focus fire
      // falls out of the scoring rather than needing a separate pass.
      score = mult * 100 - d * 6 - (o.hp / o.maxhp) * 40;
      // `ThreatPosed=` decides what a threat scan WANTS: 20-25 on a
      // soldier or a tank, and 0 on [HARV]/[CMIN] — which is the whole
      // reason RA2's War Miner can carry a gun without becoming the first
      // thing every enemy in range turns to shoot at. Without the isHarv
      // guard, giving the miner its 20mm made it read as a "shooter" and
      // the Collective's own economy became the priority target on the
      // field (measured: hard-Collective lost 6 of 6 soak matches).
      if (o.kind === 'u' && UNITS[o.type].dmg > 0 && !isHarv(o)) score += 25;   // shooters first
      if (o.kind === 'u' && isHarv(o)) score += 12;                            // then economy
      if (o.kind === 'b' && occCount(o)) score += THREAT_PER_OCCUPANT * occCount(o);
    } else {
      score = -d;                       // unfocused: just shoot the nearest
    }
    if (score > bs) { bs = score; best = o; }
  });
  return best;
}

export function damage(g, src, tgt, amount, wh) {
  if (ironed(g, tgt)) return;                 // Iron Curtain: the hit never lands
  if (tgt.kind === 'b' && BLDS[tgt.type].immune) return;    // [CABHUT] Immune=yes
  var spec = src.kind === 'b' ? BLDS[src.type] : UNITS[src.type];
  if (wh === undefined) wh = spec.wh;
  // rules.ini `Wall=` on the warhead: a wall segment is simply not a legal
  // victim of a warhead that does not carry the flag. Small arms, flak,
  // C4 and a Prism Tank's CometWH bounce off; every tank shell does not.
  if (isWall(tgt) && !WH_WALL[wh]) return;
  var mult = wh ? versesVs(wh, tgt) : 1;
  if (tgt.kind === 'u' && tgt.prone) mult *= proneMul(wh);         // rules.ini ProneDamage
  if (tgt.kind === 'u' && tgt.rank) mult /= vetArmour(tgt.rank);   // veterans are tougher (VeteranArmor)
  if (tgt.arMul) mult /= tgt.arMul;                                // [Powerups] Armor crate, x1.5
  tgt.hp -= amount * mult;
  // RA2 infantry hit the dirt the moment they are shot at and stay down
  // while the fire lasts. A man executing a real move order keeps running;
  // one holding, guarding or already in place drops.
  if (tgt.kind === 'u' && tgt.hp > 0 && !tgt.air && !tgt.deployed &&
      UNITS[tgt.type].cls === 'i' && infCrawls(tgt.type)) {
    tgt.hitAt = g.tick;
    // A deployed GI is already behind his own parapet — RA2 does not drop
    // him flat and neither do we.
    // RA2 drops a soldier who is standing still; one walking a live path
    // (a move, or an attack whose target is still out of reach) keeps going.
    var walking = (tgt.order && tgt.order.t === 'move') || (tgt.path && tgt.pi < tgt.path.length);
    if (!tgt.prone && !walking) { tgt.prone = true; tgt.downAt = g.tick; }
  }
  if (tgt.kind === 'u' && isHarv(tgt)) tgt.fleeAt = g.tick;
  if (isAir(src)) { var hitAI = aiOf(g, tgt.p); if (hitAI) hitAI.airAt = g.tick; }
  if (tgt.p === ME && src.p !== ME) {
    if (tgt.kind === 'b') eva('Our base is under attack', 20000);
    else if (isHarv(tgt)) eva('Ore miner under attack', 20000);
    // keyboard.ini CenterOnRadarEvent=32 (Space) needs somewhere to go:
    // the last of ours that was shot at. Rate-limited so a running battle
    // does not drag the key's destination one tile at a time.
    if (!g.radarEvent || g.tick - g.radarEvent.tick > 90)
      g.radarEvent = { x: tgt.kind === 'b' ? tgt.cx : tgt.x, y: tgt.kind === 'b' ? tgt.cy : tgt.y, tick: g.tick };
  }
  if (tgt.hp <= 0 && !tgt.dead) {
    if (!neutral(src.p)) g.side[src.p].killed++;
    if (!neutral(tgt.p)) g.side[tgt.p].lost++;
    if (src.kind === 'u') {
      src.kills = (src.kills || 0) + 1;
      // [General] VeteranRatio=3: promotion at 3x the unit's OWN cost in kill
      // value (elite at 6x), so a GI does not rank up on three Conscripts.
      var tc = tgt.kind === 'b' ? bspecOfB(g, tgt).cost : UNITS[tgt.type].cost, oc = UNITS[src.type].cost || 1;
      src.kv = (src.kv || 0) + tc;
      var nr = src.kv >= oc * 6 ? 2 : (src.kv >= oc * 3 ? 1 : 0);
      if (nr > (src.rank || 0)) { src.rank = nr; if (src.p === ME) { sfx('promote'); eva(nr === 2 ? 'Unit promoted to elite' : 'Unit promoted', 3000); } }
    }
    // A dead Yuri lets his victim go; a dead host spits its drone back out;
    // a dead victim frees its controller to take someone else.
    if (tgt.kind === 'u') {
      if (tgt.mcTarget) releaseMind(g, tgt);
      if (tgt.mcBy) { var mcc = g.byId[tgt.mcBy]; if (mcc) mcc.mcTarget = 0; }
      if (tgt.drone) popDrone(g, tgt);
      if (tgt.bomb) defuseBomb(g, tgt);
      if (tgt.eraseId) { var er = g.byId[tgt.eraseId]; if (er) { er.erasedBy = 0; er.erase = 0; } tgt.eraseId = 0; }
    } else if (tgt.bomb) defuseBomb(g, tgt);
    if (tgt.p === ME) eva(tgt.kind === 'b' ? 'Structure lost' : 'Unit lost', 5000);
    if (tgt.kind === 'b') { killBld(g, tgt); sfx('bldboom', tgt.cx, tgt.cy); }   // killBld runs the whole death sequence
    else if (isAir(tgt)) { tgt.dead = true; killPassengers(g, tgt); crashAircraft(g, tgt); }
    else { tgt.dead = true; killPassengers(g, tgt); if (!infCorpse(g, tgt, wh, src.crushKill)) vehicleDeath(g, tgt); sfx(isInfArmour(UNITS[tgt.type].armour) ? 'die' : 'vdie', tgt.x, tgt.y); }
  }
}

// A dead soldier is an fx object, not a unit: the unit is gone the tick it
// dies, and the body plays out on its own. Which of the five RA2 deaths it
// plays is read off the KILLING warhead's `InfDeath=`, so the same GI is
// blown apart by a shell, thrown back by an AP round and lit up by a Tesla
// coil. Only vehicles fall through to the generic 12px blast.
var INF_DEATH_LIFE = 84;

export function infCorpse(g, u, wh, crushed) {
  if (u.kind !== 'u' || !UNITS[u.type] || UNITS[u.type].cls !== 'i') return false;
  if (headless) return true;
  var mode = crushed ? 6 : INF_DEATH[wh];
  if (mode === undefined || mode === 0) mode = 1;
  if (mode === 2) {
    // "Explodes": there is no body left, just the mist and the burst.
    g.fx.push({ x: u.x, y: u.y, t: 0, life: 20, size: 10 });
    g.fx.push({ x: u.x, y: u.y, t: 0, life: 28, mist: true });
    return true;
  }
  g.fx.push({ corpse: true, x: u.x, y: u.y, t: 0, life: INF_DEATH_LIFE,
              type: u.type, p: u.p, fac: facOf(g, u.p) || 'dir',
              face: u.face || 0, mode: mode });
  if (mode === 4) for (var k = 0; k < 3; k++)
    g.fx.push({ x: u.x, y: u.y, t: -k * 9, life: 40, fire: true, big: 0.5 });
  return true;
}

// Decals live on `g.rubble` (the ground layer, under units) beside the
// structure rubble, and are capped: a long game with a lot of shelling
// would otherwise stamp thousands of them and the ground pass would
// start costing more than the units standing on it.
var DECAL_LIFE = 90 * 60, DECAL_MAX = 56;          // ~90 s, RA2's scorch weathers away

function decal(g, x, y, kind) {
  if (headless) return;
  // Water keeps no scorch and no crater. A shell that bursts on the sea
  // leaves a ring of foam and then nothing — a burnt patch floating in a
  // bay is the single loudest tell that the naval layer was bolted on.
  var dcx = Math.round(x), dcy = Math.round(y);
  if (inMap(dcx, dcy) && waterish(g.terrain[idx(dcx, dcy)])) return;
  var n = 0, oldest = -1, i;
  for (i = 0; i < g.rubble.length; i++) if (g.rubble[i].fx) { n++; if (oldest < 0) oldest = i; }
  if (n >= DECAL_MAX && oldest >= 0) g.rubble.splice(oldest, 1);
  g.rubble.push({ x: x, y: y, gw: 1, gh: 1, t: 0, life: DECAL_LIFE, fx: kind,
                  v: (((x * 7 + y * 13) | 0) % 3 + 3) % 3 });
}

// `size` picks the family AND what the ground keeps: art.ini flags every
// EXPLO*/TWLT*/S_* anim `Crater=yes` `Scorch=yes`, but rules.ini only
// deforms the ground above `DeformThreshhold` (120-300), so a rifle round
// marks nothing, a medium blast scorches, and a shell digs.
export function boom(g, x, y, size, dig) {
  if (headless) return;
  g.fx.push({ x: x, y: y, t: 0, life: size > 30 ? 44 : (size > 20 ? 34 : 20), size: size });
  if (dig || size >= 24) decal(g, x, y, 'crater');
  else if (size >= 14) decal(g, x, y, 'scorch');
}

// A vehicle does not go out like a rifleman. RA2 gives it the large
// family, throws chunks (`DebrisAnims=` / `MinDebris`-`MaxDebris`) and
// leaves a smoke column standing over the wreck.
// [General] ShipSinkingWeight=3.0 — a surface ship of that weight or more
// does not explode, it SINKS: it lists, settles by the stern and goes under
// in a ring of foam, and the wreck is gone. Everything lighter (a Sea
// Scorpion, a Dolphin, a Squid) blows up like a vehicle.
var SINK_LIFE = 150;

export function shipSinks(u) {
  var d = UNITS[u.type];
  return !!d.nav && d.hp >= 300 && d.cls === 'n' && u.type !== 'seascorp';
}

function shipSink(g, u) {
  if (headless) return;
  boom(g, u.x, u.y, 16); sfx('sink', u.x, u.y);
  g.wrecks.push({ type: u.type, p: u.p, x: u.x, y: u.y, face: u.face || 0, t: 0,
                  life: SINK_LIFE, alt0: 0, spin: 0, vx: 0, vy: 0, sink: true });
  for (var i = 0; i < 3; i++)
    g.fx.push({ x: u.x, y: u.y, t: -i * 16, life: 70, smoke: true, big: 1.0, ox: 0, oy: -6, lift: 0 });
}

function vehicleDeath(g, u) {
  if (headless) return;
  if (shipSinks(u)) { shipSink(g, u); return; }
  var rnd = lcg(((u.id * 2654435761) >>> 0) || 1), i;
  boom(g, u.x, u.y, 26);
  g.fx.push({ x: u.x, y: u.y, t: 5, life: 26, size: 13 });          // a second cook-off
  for (i = 0; i < 3 + ((rnd() * 4) | 0); i++) {                     // 3-6 chunks
    var da = rnd() * 6.2832, dv = 0.35 + rnd() * 0.85;
    g.fx.push({ x: u.x, y: u.y, t: -((i * 2) % 5), life: 28 + ((rnd() * 14) | 0), deb: true,
                vx: Math.cos(da) * dv, vy: Math.sin(da) * dv * 0.5, vz: 1.7 + rnd() * 1.9,
                dw: 1.8 + rnd() * 2.6, spin: (rnd() - 0.5) * 0.5 });
  }
  for (i = 0; i < 4; i++) {                                         // a short smoke column
    g.fx.push({ x: u.x, y: u.y, t: -i * 8, life: 96, smoke: true, big: 0.8,
                ox: (rnd() - 0.5) * 6, oy: -4 - rnd() * 6, lift: 0 });
  }
}

// RA2: a shot-down aircraft is not a puff of smoke where it was hit. It
// falls — spinning, trailing smoke — and detonates where it lands, and a
// Kirov takes its bomb load down with it (250 / splash 2, BlimpHE).
var CRASH_LIFE = 40, CRASH_LIFE_BOMB = 90;

function crashAircraft(g, u) {
  var d = UNITS[u.type];
  boom(g, u.x, u.y, 10); sfx('boom3', u.x, u.y);
  g.wrecks.push({
    type: u.type, p: u.p, x: u.x, y: u.y, face: u.face || 0, t: 0,
    life: d.bomb ? CRASH_LIFE_BOMB : CRASH_LIFE,
    alt0: altOf(u) || d.alt, spin: d.bomb ? 0.16 : 0.48,
    // A jet keeps its forward momentum into the ground; a gasbag drops
    // straight down where it was holed.
    vx: d.bomb ? 0 : Math.cos(u.face * FANG) * d.spd * 0.4,
    vy: d.bomb ? 0 : Math.sin(u.face * FANG) * d.spd * 0.4
  });
}

export function wreckAlt(w) { var k = 1 - w.t / w.life; return w.alt0 * k * k; }   // it accelerates downward

export function stepWrecks(g) {
  for (var i = g.wrecks.length - 1; i >= 0; i--) {
    var w = g.wrecks[i];
    w.t++; w.x += w.vx; w.y += w.vy;
    // A ship that has gone under leaves foam, not a crater full of casualties.
    if (w.sink) { if (w.t >= w.life) g.wrecks.splice(i, 1); continue; }
    if (w.t >= w.life) { g.wrecks.splice(i, 1); crashBoom(g, w); }
  }
}

function crashBoom(g, w) {
  var d = UNITS[w.type];
  var dmg = d.bomb ? d.dmg : (d.cls === 'a' ? 50 : 25);
  var spl = d.bomb ? d.splash : (d.cls === 'a' ? 1 : 0.6);
  var wh = d.bomb ? d.wh : 'HE';
  boom(g, w.x, w.y, d.bomb ? 30 : 18); sfx(d.bomb ? 'boom3' : 'boom1', w.x, w.y);
  // A wreck is indiscriminate: it hurts whoever is standing where it lands,
  // including its own side. It cannot touch anything still flying.
  var src = { kind: 'u', type: w.type, p: w.p, kills: 0, rank: 0 };
  near(w.x, w.y, spl + 1, function (o) {
    if (o.dead || isAir(o)) return;
    var ox = (o.kind === 'b' ? o.cx : o.x) - w.x, oy = (o.kind === 'b' ? o.cy : o.y) - w.y;
    var dd = Math.sqrt(ox * ox + oy * oy);
    if (dd <= spl) damage(g, src, o, dmg * (1 - dd / (spl + 0.8)), wh);
  });
}

// --------------------------------------------------------------------- //
//  Superweapon runtime: charge, target, fire.
// --------------------------------------------------------------------- //
// Every entity in a radius, buildings included. The spatial hash is tuned
// for unit-sized queries; a nuke reaches four tiles across three-tile
// footprints, so this walks the lists instead of the grid.
function swNear(g, x, y, r, fn) {
  var i;
  for (i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    if (u.dead) continue;
    if (Math.abs(u.x - x) <= r && Math.abs(u.y - y) <= r) fn(u, Math.sqrt((u.x - x) * (u.x - x) + (u.y - y) * (u.y - y)));
  }
  for (i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (b.dead) continue;
    if (Math.abs(b.cx - x) <= r + b.gw && Math.abs(b.cy - y) <= r + b.gh)
      fn(b, Math.sqrt((b.cx - x) * (b.cx - x) + (b.cy - y) * (b.cy - y)));
  }
}

export function entX(e) { return e.kind === 'b' ? e.cx : e.x; }

export function entY(e) { return e.kind === 'b' ? e.cy : e.y; }

export function isInf(u) { return u.kind === 'u' && UNITS[u.type].cls === 'i'; }

export function isVeh(u) { return u.kind === 'u' && UNITS[u.type].cls === 'v' && !u.air; }

// The countdown. RA2 charges a superweapon only while the base has power,
// and a destroyed charger loses the progress with it.
function stepSW(g, p) {
  var s = g.side[p], pw = powered(g, p);
  for (var i = 0; i < SW_KEYS.length; i++) {
    var k = SW_KEYS[i], st = s.sw[k];
    if (!hasBld(g, p, SW[k].bld)) { st.t = 0; st.ready = false; st.armed = false; continue; }
    if (st.ready || !pw) continue;
    if (++st.t >= SW[k].charge) {
      st.t = SW[k].charge; st.ready = true;
      if (p === ME) {
        eva(SW[k].ready, 60000); sfx('swready');
        say(SW[k].name + ' ready — click its icon top-left, then the map', false, 300);
      }
    }
  }
}

export function stepSuper(g) {
  stepSW(g, P_HUMAN); stepSW(g, P_AI);
  var i;
  for (i = g.storms.length - 1; i >= 0; i--) if (stepStorm(g, g.storms[i])) g.storms.splice(i, 1);
  for (i = g.nukes.length - 1; i >= 0; i--) if (stepNuke(g, g.nukes[i])) g.nukes.splice(i, 1);
  if (g.flash > 0) g.flash--;
  if (g.mmFlash && g.tick > g.mmFlash.until) g.mmFlash = null;
}

// RA2's Lightning Storm is a sustained barrage, not a bolt now and then.
// [General] LightningStormDuration=180 frames, LightningHitDelay=10 (how
// often the DIRECT target is hit), LightningScatterDelay=5 (random bolts
// between them), LightningCellSpread=10 (an n-by-n square), and
// LightningSeparation=3 (city-block cells between successive bolts), each
// one LightningDamage=250 on LightningWarhead=IonWH. One rules frame is
// four of our ticks (a Grizzly's ROF=60 is our `rate: 240`), so the storm
// runs twelve seconds and lands about fifty bolts -- where the old one
// fired ten in twenty seconds and a playtest watched it miss everything.
export var LIGHT_HIT = 40, LIGHT_SCATTER = 20, LIGHT_SPREAD = 5, LIGHT_SEP = 3;

function stormBolt(g, st, bx, by, direct) {
  var src = { kind: 'b', type: 'weather', p: st.p };
  swNear(g, bx, by, 1.6, function (e, d) {
    if (isAir(e)) return;                                    // the storm strikes the ground
    if (e.kind === 'b') { if (d > 1.4 + Math.max(e.gw, e.gh) / 2) return; }
    else if (d > 1.1) return;
    damage(g, src, e, 250, 'IonWH');   // [General] LightningDamage=250
  });
  if (!headless) {
    st.lit = g.tick;                                         // the deck flares on every strike
    g.fx.push({ x: bx, y: by, t: 0, life: direct ? 17 : 14, bolt: true,
                big: direct ? 1 : 0.74, seed: (g.tick * 7 + ((bx * 31 + by * 17) | 0)) | 0 });
    g.fx.push({ x: bx, y: by, t: 0, life: 22, size: direct ? 17 : 12 });
    if (direct) decal(g, bx, by, 'scorch');
  }
  sfx(direct ? 'thunder' : 'boom1', bx, by);   // one clap per bolt, over the storm's own bed
}

function stepStorm(g, st) {
  st.t++;
  if (!headless && (st.t % 80) === 1) sfx('wind');     // the bed the bolts land in

  if (st.t <= st.life) {
    if (st.t >= st.next) { st.next = st.t + LIGHT_HIT; stormBolt(g, st, st.x, st.y, true); }
    if (st.t >= st.nextS) {
      st.nextS = st.t + LIGHT_SCATTER;
      var bx = st.x, by = st.y, tries = 0;
      do {                                                   // LightningSeparation=3
        bx = st.x + (rnd() * 2 - 1) * LIGHT_SPREAD;
        by = st.y + (rnd() * 2 - 1) * LIGHT_SPREAD;
        tries++;
      } while (tries < 6 && Math.abs(bx - st.lx) + Math.abs(by - st.ly) < LIGHT_SEP);
      st.lx = bx; st.ly = by;
      stormBolt(g, st, bx, by, false);
    }
  }
  return st.t > st.life + 45;      // the deck hangs on a moment after the last bolt
}

// The missile flies for ten seconds, then a falling blast: RA2's warhead
// applies per CELL, so a three-by-three refinery over ground zero eats far
// more of it than a pillbox does. 500 at the centre, nothing at four tiles.
function stepNuke(g, nk) {
  nk.t++;
  if (nk.t < nk.life) return false;
  var src = { kind: 'b', type: 'nuke', p: nk.p }, x = nk.x, y = nk.y;
  swNear(g, x, y, 5.5, function (e) {
    var tot = 0, x0 = e.kind === 'b' ? e.x : Math.round(e.x), y0 = e.kind === 'b' ? e.y : Math.round(e.y);
    var w = e.kind === 'b' ? e.gw : 1, h = e.kind === 'b' ? e.gh : 1;
    for (var ty = 0; ty < h; ty++) for (var tx = 0; tx < w; tx++) {
      var px = e.kind === 'b' ? x0 + tx : e.x, py = e.kind === 'b' ? y0 + ty : e.y;
      var d = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
      if (d < 4) tot += 500 * (1 - d / 4);
    }
    if (tot > 0) damage(g, src, e, tot, 'NukeWH');
  });
  // Ore in the blast is simply gone, and the flash burns the shroud off.
  for (var oy = Math.max(0, (y - 6) | 0); oy <= Math.min(MAP - 1, y + 6); oy++)
    for (var ox = Math.max(0, (x - 6) | 0); ox <= Math.min(MAP - 1, x + 6); ox++) {
      var dd = Math.sqrt((ox - x) * (ox - x) + (oy - y) * (oy - y));
      var ii = idx(ox, oy);
      if (dd <= 4 && g.terrain[ii] === T_ORE) { g.terrain[ii] = T_GROUND; g.ore[ii] = 0; }
      if (dd <= 5) damageBridge(g, ox, oy, 900);
      g.seen[ii] = 1;                                  // the flash burns the shroud off
    }
  // [NukePayload] RadLevel=500: the ground stays lethal to infantry long
  // after the fireball is gone. The audit had this missing entirely.
  addRad(g, x, y, RAD_MAX, 5);
  if (!headless) {
    g.fx.push({ x: x, y: y, t: 0, life: 240, mush: true });     // ~4 s of mushroom
    g.fx.push({ x: x, y: y, t: 0, life: 44, size: 46 });
    // Fallout on the crater. [Radiation] RadLevelMax=500 and the nuke lays
    // 2000 units down, so ground zero stays poisoned long after the cloud
    // is gone; a green-tinted scorch stands in until the radiation ground
    // layer lands.
    decal(g, x, y, 'rad');
    var rl = lcg(((x * 733 + y * 977) | 0) >>> 0);
    for (var ri = 0; ri < 6; ri++) {
      var ra2 = rl() * 6.2832, rr2 = 0.9 + rl() * 2.4;
      decal(g, x + Math.cos(ra2) * rr2, y + Math.sin(ra2) * rr2, ri < 4 ? 'rad' : 'crater');
    }
    g.flash = 34;
  }
  sfx('nuke', x, y);
  if (nk.p !== ME) { eva('Nuclear missile impact', 20000); say('Nuclear detonation', true, 260); }
  return true;
}

// Fire one. Returns false if it was not charged — every path (icon, AI,
// test hook) goes through here, so the timer can only be spent once.
export function swFire(g, p, key, x, y, x2, y2) {
  var s = g.side[p], st = s.sw[key];
  if (!st || !st.ready) return false;
  if (!inMap(Math.round(x), Math.round(y))) return false;
  st.ready = false; st.t = 0; st.armed = false; st.fired++;
  var mine = p === ME, W = SW[key], i, u;
  if (key === 'para') {
    paraDrop(g, p, x, y);
    if (!headless) { mmPing(g, x, y); g.fx.push({ x: x, y: y, t: 0, life: 26, size: 0, ping: true }); }
  } else if (key === 'storm') {
    g.storms.push({ p: p, x: x, y: y, t: 0, life: STORM_T, next: 24, nextS: 12, lx: x, ly: y, lit: -99 });
    if (mine) eva('Lightning storm created', 20000);
    else { eva('Warning: lightning storm created', 20000); say('Warning — lightning storm created', true, 300); mmPing(g, x, y); }
  } else if (key === 'nuke') {
    g.nukes.push({ p: p, x: x, y: y, t: 0, life: NUKE_FLIGHT });
    sfx('siren');
    if (mine) { eva('Nuclear missile launched', 20000); say('Nuclear missile launched', false, 300); }
    else { eva('Warning: nuclear missile launched', 20000); say('WARNING — nuclear missile launched', true, 400); mmPing(g, x, y); }
  } else if (key === 'curtain') {
    var n = 0;
    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      if (u.dead || u.p !== p || Math.abs(u.x - x) > 1.5 || Math.abs(u.y - y) > 1.5) continue;
      // RA2: the Iron Curtain kills the infantry it is thrown over.
      if (isInf(u)) { u.dead = true; g.side[p].lost++; boom(g, u.x, u.y, 12); continue; }
      u.ironUntil = g.tick + IRON_T; n++;
    }
    for (i = 0; i < g.blds.length; i++) {
      var b = g.blds[i];
      if (b.dead || b.p !== p || Math.abs(b.cx - x) > 1.5 + b.gw / 2 || Math.abs(b.cy - y) > 1.5 + b.gh / 2) continue;
      b.ironUntil = g.tick + IRON_T; n++;
    }
    sfx('curtain', x, y);
    if (mine) { eva('Iron Curtain activated', 20000); say('Iron Curtain — ' + n + ' invulnerable for fifty seconds', false, 260); }
    else { eva('Warning: enemy Iron Curtain activated', 20000); mmPing(g, x, y); }
  } else if (key === 'chrono') {
    var lift = [];
    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      if (u.dead || u.p !== p || Math.abs(u.x - x) > 1.5 || Math.abs(u.y - y) > 1.5) continue;
      // RA2 chronoshifts vehicles; infantry that stand in the field die.
      if (isInf(u)) { u.dead = true; g.side[p].lost++; boom(g, u.x, u.y, 12); continue; }
      if (isVeh(u) && lift.length < 9) lift.push(u);
    }
    // RA2's Chronosphere is a ONE-WAY trip (the return leg was RA1's):
    // ChronoDelay=60 is how long the vehicle spends out of phase, and what
    // decides its fate is the ground it lands on. Solid ground and it stays
    // there for good; water and it goes in with it.
    var drowned = 0;
    for (i = 0; i < lift.length; i++) {
      u = lift[i];
      var nx = Math.max(0, Math.min(MAP - 1, Math.round(x2 + (u.x - x))));
      var ny = Math.max(0, Math.min(MAP - 1, Math.round(y2 + (u.y - y))));
      var wet = waterish(g.terrain[idx(nx, ny)]) && g.terrain[idx(nx, ny)] !== T_BRIDGE;
      if (wet) drowned++;
      if (!headless) g.fx.push({ x: u.x, y: u.y, t: 0, life: 24, chrono: true });
      u.warp = { x: nx, y: ny, at: g.tick + CHRONO_DELAY, out: g.tick, drown: wet };
      u.limbo = true; u.path = null; u.pi = 0; u.order = null; u.repathAt = -999; u.target = null;
    }
    sfx('chronofx', x2, y2);
    if (mine) { eva('Chronosphere activated', 20000);
                say('Chronosphere — ' + lift.length + ' vehicle' + (lift.length === 1 ? '' : 's') + ' shifted' +
                    (drowned ? ', ' + drowned + ' dropped over water' : ''), !!drowned, 260); }
    else { eva('Warning: enemy Chronosphere activated', 20000); mmPing(g, x2, y2); }
  }
  sfx(key === 'para' ? 'ready' : 'boom');
  return true;
}

export function mmPing(g, x, y) {
  g.mmFlash = { x: x, y: y, until: g.tick + 60 * 8 };
  g.radarEvent = { x: x, y: y, tick: g.tick };     // a superweapon always wins Space
}

export function fire(g, src, tgt) {
  var spec = weaponFor(src.kind === 'b' ? BLDS[src.type] : UNITS[src.type], tgt, src);
  src.cool = spec.rate * vetRofU(src);                // [General] VeteranROF=0.6, at the rank this unit's own ability list grants it
  // Prism support: every tower that beamed into this one adds 150%.
  var supMul = 1;
  if (src.kind === 'b' && src.type === 'prism' && src.sup) { supMul = 1 + PRISM_SUP_MOD * src.sup; src.sup = 0; }
  // [NASAM] PrimaryFireFLH=90,50,100 / SecondaryFireFLH=90,-50,100: the
  // Patriot alternates its left and right tube.
  if (src.kind === 'b' && src.type === 'patriot') src.tube = src.tube ? 0 : 1;
  if (src.kind === 'u') src.fireAt = g.tick;        // a Mirage that shoots is a Mirage again
  // `DecloakToFire=no` is on the torpedo and the sonic zap, but RA2 still
  // shows the wake and the launch: firing is what gives a submerged hull
  // away for SUB_SURFACE ticks.
  if (src.kind === 'u' && isSub(src)) src.surfAt = g.tick;
  if (src.kind === 'u' && spec.ammo) src.ammo = Math.max(0, (src.ammo || 0) - 1);
  if (!headless) {
    var tx0 = tgt.kind === 'b' ? tgt.cx : tgt.x, ty0 = tgt.kind === 'b' ? tgt.cy : tgt.y;
    g.shots.push({
      x: src.kind === 'b' ? src.cx : src.x, y: src.kind === 'b' ? src.cy : src.y,
      tx: tx0, ty: ty0,
      t: 0, life: src.type === 'tesla' ? 12 : (src.type === 'grandcannon' ? 26 : (src.kind === 'u' && src.type === 'v3' ? 30 : (spec.bomb ? 14 : (isAir(tgt) ? 9 : 7)))), id: g.nextId++,
      shell: src.type === 'grandcannon',
      v3: src.kind === 'u' && src.type === 'v3',
      // A TESLA TANK ARCS LIGHTNING TOO. The flag was `src.type === 'tesla'`,
      // i.e. the Tesla COIL only, so the tank fired a plain bullet tracer and
      // nothing at all appeared between it and its target — which is what a
      // rendered firefight showed, and no static roster ever could.
      tesla: src.type === 'tesla' || src.type === 'teslatank',
      beam: src.type === 'prism' || src.type === 'prismtank',
      // ...AND THE EMITTER IS WHERE THE EMITTER IS. Both beam branches
      // subtracted a fixed height — 68 for the coil's electrode, 86 for the
      // prism crown's hub — which are BUILDING heights. Fired by a TANK the
      // bolt or beam therefore started ~90 px above the vehicle, off the top
      // of the frame, so the Prism Tank's beam appeared to come out of the
      // sky and the Tesla Tank's went nowhere. Carry the height on the shot.
      // The coil's 104 became 68 when the Tesla Coil was brought down to
      // RA2's own [NATSLA] proportion (bakeBuilding `eY`); leaving it would
      // have fired the bolt out of thin air 36 px over the electrode. This
      // is a HAND-MIRRORED constant — the bake and the shot pass do not
      // share it — so `eY` and these two numbers move together or not at all.
      // 68 -> 70 when the electrode was lifted to clear the neck band.
      oz: src.kind === 'b' ? (src.type === 'tesla' ? 70 : 86) : 15,
      rocket: src.kind === 'u' && UNITS[src.type] && UNITS[src.type].splash > 0.2 ||
              src.type === 'rocket' || src.type === 'patriot' || src.type === 'harrier',
      bomb: !!spec.bomb, flak: !!spec.flak && isAir(tgt),
      // launch heights: an aircraft fires from its altitude, an AA site from its mount
      alt: src.kind === 'u' ? altOf(src) : (spec.launch || 0),
      talt: tgt.kind === 'u' ? altOf(tgt) : 0,
      ox: (src.kind === 'b' && src.type === 'patriot') ? (src.tube ? 7 : -7) : 0,
      sup: (src.kind === 'b' && src.type === 'prism') ? (supMul > 1 ? supMul : 0) : 0
    });
    // A Kirov bomb takes its whole flight to land: the blast is queued with
    // a negative age so it appears when the bomb does, not when it is dropped.
    if (spec.bomb) {
      g.fx.push({ x: tx0, y: ty0, t: -13, life: 30, size: 24 });
      g.rubble.push({ x: tx0, y: ty0, gw: 1, gh: 1, t: -13, life: DECAL_LIFE, fx: 'crater', v: 2 });
    }
    // A splash weapon bursts where it lands whether or not it killed
    // anything -- in RA2 every shell and rocket carries its own EXPLO*/
    // TWLT* anim, and the ground keeps the mark (`Crater=yes`).
    else if (spec.splash > 0.25 && !isAir(tgt) && src.type !== 'grandcannon') {
      g.fx.push({ x: tx0, y: ty0, t: 4, life: 26, size: 11 + spec.splash * 9 });
      if (spec.splash >= 0.8) decal(g, tx0, ty0, 'crater');
      else if (spec.splash >= 0.5) decal(g, tx0, ty0, 'scorch');
    }
    // [GrandCannonWeapon] Projectile=GrandCannonBall Speed=1: a genuinely
    // SLOW shell that arcs over. The burst and the crater are queued to
    // appear when it lands, not when it is fired — you watch it travel.
    if (src.type === 'grandcannon') {
      g.fx.push({ x: tx0, y: ty0, t: -25, life: 30, size: 26 });
      g.rubble.push({ x: tx0, y: ty0, gw: 1, gh: 1, t: -25, life: DECAL_LIFE, fx: 'crater', v: 1 });
    }
  }
  if (!headless) sfx(spec.rep || REPORT[src.type] || (spec.flak ? 'flak' : spec.bomb ? 'kbomb' : src.kind === 'b' ? 'mg' : 'cannon'),
                     src.kind === 'b' ? src.cx : src.x, src.kind === 'b' ? src.cy : src.y);
  // ---- warheads that do something other than subtract hit points -------
  // Each of these RETURNS: the shot has been drawn and the cooldown set,
  // but no damage is dealt, because rules.ini's flag on the warhead
  // (Parasite / IvanBomb / MindControl / Temporal) replaces the damage.
  if (spec.wh === 'Parasite' && tgt.kind === 'u' && (isVeh(tgt) || isNaval(tgt)) && !tgt.drone) { infest(g, src, tgt); return; }
  if (spec.wh === 'IvanBomb') { plantBomb(g, src, tgt, spec.dmg); return; }
  if (spec.wh === 'Controller') { mindControl(g, src, tgt); return; }
  if (spec.wh === 'ChronoBeam') { startErase(g, src, tgt); src.cool = 8; return; }
  // [DredLauncher] / [HornetLauncher] `Spawner=yes`: the launcher itself
  // does nothing. What leaves the deck is the payload, and the damage is
  // the payload's.
  if (spec.spawns) { launchSpawns(g, src, tgt); return; }
  // rules.ini `Burst=2` — the Dreadnought puts BOTH missiles in the air on
  // one trigger pull.
  var burst = spec.burst || 1;
  var amt = spec.dmg * burst * vetFire(src.rank) * (src.fpMul || 1) * supMul;   // [Powerups] Firepower crate
  // Three Tesla Troopers on a coil turn [TeslaZap] into [OPCoilBolt].
  if (src.kind === 'b' && src.type === 'tesla' && coilCharged(g, src)) amt *= COIL_BOOST;
  // [ParasiteDog] Parasite=yes + [GoodTeeth] LimboLaunch=yes: the dog does
  // not shoot a man for 30 points, it LEAPS at him and he is gone. The 30
  // damage in rules.ini never gets a chance to matter, so neither does it
  // here — the bite is lethal to anything wearing an infantry armour class
  // and, by the Verses row, worth exactly nothing against anything else.
  if (spec.wh === 'ParasiteDog') {
    src.leapAt = g.tick; src.leapX = tgt.x; src.leapY = tgt.y;
    if (tgt.kind === 'u' && isInfArmour(armourOf(tgt))) amt = tgt.hp + 1e4;
  }
  damage(g, src, tgt, amt, spec.wh);
  if (spec.splash > 0) {
    var tx = tgt.kind === 'b' ? tgt.cx : tgt.x, ty = tgt.kind === 'b' ? tgt.cy : tgt.y;
    var tAir = isAir(tgt);
    near(tx, ty, spec.splash + 1, function (o) {
      if (o.dead || o.p === src.p || o === tgt) return;
      // Splash stays in the domain it burst in: flak over a Rocketeer does not
      // rake the infantry below, and a bomb does not clip a passing Harrier.
      if (isAir(o) !== tAir || !canHit(spec, o)) return;
      var d = Math.sqrt((o.x - tx) * (o.x - tx) + (o.y - ty) * (o.y - ty));
      if (d <= spec.splash) damage(g, src, o, amt * 0.45 * (1 - d / (spec.splash + 0.4)), spec.wh);
    });
  }
  // [CRNuke]/[CRTerrorBomb] Suicide=yes, and [FV] DeathWeapon=CRNuke: an
  // Ivan (or a Terrorist) riding an IFV drives it into the target and the
  // hull goes with the charge — the blast above is the whole attack, and
  // this is the vehicle being written off by it.
  if (spec.suicide && src.kind === 'u' && !src.dead) {
    src.hp = 0; src.dead = true;
    killPassengers(g, src);
    if (!neutral(src.p)) g.side[src.p].lost++;
    if (!headless) { vehicleDeath(g, src); sfx('vdie', src.x, src.y); }
    if (src.sel) dropFromSel(src);
  }
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setHash(v) { hash = v; }
export function setHashAt(v) { hashAt = v; }
