// Iron Frontier — ai.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from './blds.js';
import { bspecFor, bspecOf, harvKey, isHarv, isInfArmour } from './combat-tables.js';
import { dist, swFire } from './combat.js';
import { deployMcv, placeBld, powered, spawnUnit } from './entities.js';
import { FACTIONS, facAllows, keyFac } from './factions.js';
import { canHit, hullZone, isAir, moverOf, navReach } from './geom.js';
import { entById } from './move.js';
import { canOccupy, garrisonable, occCapOf, occCount } from './neutral.js';
import { findOre, findRefinery } from './ore.js';
import { blocked, requestPath } from './path.js';
import { canBuild, canPlace, cancelLast, countBld, countUnit, enqueue, freeTileNear, hasBld, laneOfBld, queuedCount, readyLane, spreadSpot } from './production.js';
import { rnd } from './rng.js';
import { UNITS } from './roster.js';
import { gapped } from './shroud.js';
import { DIFF, idx, inMap } from './state.js';
import { SW, reqMet, swKeysFor } from './supers.js';
import { canBoard, paxCapOf, paxCount, unloadTransport } from './transport.js';
import { orderUnitsTo } from './ui/input.js';
import { MAP, T_WATER, aiOf, oreT } from './world.js';

// [General] AIBuildsWalls=no. RA2 ships with the AI's wall builder OFF, so
// AIPickWallDefensePercent above is dead data in the shipped game and it is
// dead data here too — kept because a mod (or a future map flag) turns it on
// and because the roadmap asked for the number to be read, not guessed.
var AI_BUILDS_WALLS = false;

// AISafeDistance=20: how far from the centre of the enemy base a team
// gathers before it commits.
var AI_SAFE_DISTANCE = 20;

// "Money I cannot spend": the bank level at which the production ladder is
// allowed one building past the difficulty's appetite (see aiProduce).
var AI_HOARD = 12000;

// AIMinorSuperReadyPercent=.7 — a Curtain or a Sphere this charged is
// already counted by the AI's triggers, so a full team will wait a little
// for it rather than leave without it.
var AI_MINOR_SUPER_READY = 0.7;

// AIIonCannon*Value: the superweapon aim table, verbatim. Anything not
// named here scores AI_SW_DEFAULT; units score 1 (RA2 lists Engineer,
// Thief, Harvester, MCV and APC at 1 apiece, i.e. "not worth a shot").
var AI_SW_VALUE = {
  factory: 100, power: 60, reactor: 60, base: 10,
  sentry: 35, sentrygun: 35, tesla: 35, prism: 35, patriot: 35,
  flakcannon: 35, grandcannon: 35, gapgen: 35,
  airforce: 20, radar: 20,
  nuke: 40, chrono: 40, weather: 40, curtain: 40, psisensor: 40, spysat: 40
};

var AI_SW_DEFAULT = 15, AI_SW_UNIT = 1;

// ---- [TaskForces] + [TeamTypes] -------------------------------------- //
// force  : the task force, exactly as ai.ini writes it (count, type).
// role   : attack | siege | harass | defend | air | engineer.
// tgt    : the script's target class (see aiPickTarget).
// w      : the AITrigger weight per difficulty; 0 means "never on this one".
// max    : concurrent instances (ai.ini's TeamTypes Max=).
// need   : a structure that must stand before the trigger is even read.
// prod   : production-only. The team exists to place an order; something
//          else commands the units (aircraft have their own strike pass,
//          Engineers are driven by aiNeutrals).
export var AI_TEAMS = [
  // ---- Directorate ----
  { key: 'dirInf',   name: 'Allied Infantry Attack', fac: 'dir', role: 'attack', tgt: 'any',
    force: [{ n: 4, t: 'rifle' }, { n: 2, t: 'lancer' }],
    w: { easy: 6, normal: 5, hard: 3 }, max: 1 },
  { key: 'dirGrz',   name: 'Allied Grizzly Attack', fac: 'dir', role: 'attack', tgt: 'any',
    force: [{ n: 4, t: 'lancer' }, { n: 2, t: 'ifv' }, { n: 2, t: 'rocket' }],
    w: { easy: 2, normal: 5, hard: 5 }, max: 2, need: 'factory' },
  { key: 'dirMir',   name: 'Allied Mirage Ambush', fac: 'dir', role: 'attack', tgt: 'any',
    force: [{ n: 4, t: 'mirage' }, { n: 2, t: 'ifv' }],
    w: { easy: 0, normal: 2, hard: 4 }, max: 1, need: 'lab' },
  { key: 'dirPrism', name: 'Allied Prism Siege', fac: 'dir', role: 'siege', tgt: 'defence',
    force: [{ n: 3, t: 'prismtank' }, { n: 4, t: 'mirage' }, { n: 2, t: 'lancer' }, { n: 6, t: 'rifle' }],
    w: { easy: 0, normal: 3, hard: 7 }, max: 1, need: 'lab' },
  { key: 'dirRckt',  name: 'Allied Rocketeer Raid', fac: 'dir', role: 'harass', tgt: 'harvester',
    force: [{ n: 4, t: 'rocketeer' }],
    w: { easy: 0, normal: 1, hard: 3 }, max: 1, need: 'airforce' },
  { key: 'dirTanya', name: 'Allied Tanya Strike', fac: 'dir', role: 'harass', tgt: 'production',
    force: [{ n: 1, t: 'tanya' }, { n: 2, t: 'lancer' }],
    w: { easy: 0, normal: 0, hard: 3 }, max: 1, need: 'lab' },
  { key: 'dirHarr',  name: 'Allied Harrier Attack', fac: 'dir', role: 'air', tgt: 'production',
    force: [{ n: 4, t: 'harrier' }], prod: true,
    w: { easy: 1, normal: 3, hard: 4 }, max: 1, need: 'airforce' },
  // `mech`: the task force MOUNTS UP before it moves — ai.ini pairs a
  // LoadOntoTransport with the Move in exactly this way, and it is the only
  // reason a transport is worth building for the AI at all.
  { key: 'dirMech',  name: 'Allied Mechanised Raid', fac: 'dir', role: 'attack', tgt: 'any', mech: true,
    force: [{ n: 3, t: 'ifv' }, { n: 3, t: 'rifle' }],
    w: { easy: 0, normal: 2, hard: 3 }, max: 1, need: 'factory' },
  // The Nighthawk's whole job: five men on the far side of the map, next to
  // the refineries, without walking past the defence line to get there.
  { key: 'dirHawk',  name: 'Allied Nighthawk Insertion', fac: 'dir', role: 'harass', tgt: 'economy',
    mech: true, drop: true,
    force: [{ n: 1, t: 'nighthawk' }, { n: 4, t: 'rifle' }],
    w: { easy: 0, normal: 0, hard: 3 }, max: 1, need: 'airforce' },
  { key: 'dirEng',   name: 'Allied Tech Capture', fac: 'dir', role: 'engineer', tgt: 'tech',
    force: [{ n: 1, t: 'engineer' }], prod: true,
    w: { easy: 2, normal: 3, hard: 4 }, max: 2, need: 'barracks' },
  // ---- Directorate navy. ai.ini keeps its naval teams on their own
  // trigger and they are only ever considered once a Shipyard stands, which
  // itself only happens when the base has shore inside AINavalYardAdjacency.
  { key: 'dirFleet', name: 'Allied Destroyer Screen', fac: 'dir', role: 'attack', tgt: 'coast', naval: true,
    force: [{ n: 3, t: 'destroyer' }, { n: 1, t: 'aegis' }],
    w: { easy: 2, normal: 4, hard: 5 }, max: 1, need: 'shipyard' },
  { key: 'dirCV',    name: 'Allied Carrier Strike', fac: 'dir', role: 'siege', tgt: 'coast', naval: true,
    force: [{ n: 1, t: 'carrier' }, { n: 2, t: 'destroyer' }, { n: 1, t: 'aegis' }],
    w: { easy: 0, normal: 2, hard: 5 }, max: 1, need: 'shipyard' },
  // Hard only: twelve men put ashore behind the line, straight off the water.
  { key: 'dirLand',  name: 'Allied Landing Raid', fac: 'dir', role: 'harass', tgt: 'economy',
    naval: true, mech: true, drop: true,
    force: [{ n: 1, t: 'lcraft' }, { n: 4, t: 'rifle' }, { n: 2, t: 'lancer' }],
    w: { easy: 0, normal: 0, hard: 4 }, max: 1, need: 'shipyard' },
  { key: 'dirDef',   name: 'Allied Base Defense', fac: 'dir', role: 'defend', tgt: 'any',
    force: [{ n: 2, t: 'rocket' }, { n: 2, t: 'lancer' }],
    w: { easy: 3, normal: 3, hard: 3 }, max: 2 },
  // ---- Collective ----
  { key: 'colFlood', name: 'Soviet Conscript Flood', fac: 'col', role: 'attack', tgt: 'any',
    force: [{ n: 8, t: 'conscript' }, { n: 2, t: 'rhino' }],
    w: { easy: 6, normal: 5, hard: 3 }, max: 1 },
  { key: 'colRhino', name: 'Soviet Rhino Spearhead', fac: 'col', role: 'attack', tgt: 'any',
    force: [{ n: 5, t: 'rhino' }, { n: 2, t: 'flaktrack' }],
    w: { easy: 2, normal: 5, hard: 5 }, max: 2, need: 'factory' },
  { key: 'colApoc',  name: 'Soviet Apocalypse', fac: 'col', role: 'attack', tgt: 'any',
    force: [{ n: 2, t: 'mammoth' }, { n: 4, t: 'rhino' }],
    w: { easy: 0, normal: 2, hard: 4 }, max: 1, need: 'lab' },
  { key: 'colTtnk',  name: 'Soviet Tesla Tank', fac: 'col', role: 'attack', tgt: 'any',
    force: [{ n: 4, t: 'teslatank' }, { n: 2, t: 'flaktrack' }],
    w: { easy: 0, normal: 2, hard: 3 }, max: 1, need: 'radar' },
  { key: 'colV3',    name: 'Soviet Bombard', fac: 'col', role: 'siege', tgt: 'defence',
    force: [{ n: 3, t: 'v3' }, { n: 4, t: 'flaktrack' }, { n: 4, t: 'rhino' }],
    w: { easy: 0, normal: 3, hard: 7 }, max: 1, need: 'radar' },
  { key: 'colKirov', name: 'Soviet Kirov Raid', fac: 'col', role: 'attack', tgt: 'production',
    force: [{ n: 3, t: 'kirov' }],
    w: { easy: 0, normal: 2, hard: 4 }, max: 1, need: 'lab' },
  { key: 'colDrone', name: 'Soviet Terror Drone Attack', fac: 'col', role: 'harass', tgt: 'harvester',
    force: [{ n: 3, t: 'drone' }],
    w: { easy: 0, normal: 2, hard: 3 }, max: 1, need: 'factory' },
  { key: 'colIvan',  name: 'Soviet Ivan vs Allies', fac: 'col', role: 'harass', tgt: 'production',
    force: [{ n: 2, t: 'ivan' }, { n: 2, t: 'conscript' }],
    w: { easy: 0, normal: 1, hard: 3 }, max: 1, need: 'radar' },
  { key: 'colDeso',  name: 'Soviet Desolator Line', fac: 'col', role: 'defend', tgt: 'any',
    force: [{ n: 2, t: 'desolator' }, { n: 4, t: 'conscript' }],
    w: { easy: 0, normal: 2, hard: 3 }, max: 1, need: 'radar' },
  // The Amphibious Transport moved to the Shipyard with its rules.ini
  // prerequisite, so the LAND mounted raid rides Flak Tracks ([HTK]
  // Passengers=5) — which is what it can build on a map with no coast.
  { key: 'colMech',  name: 'Soviet Mechanised Raid', fac: 'col', role: 'attack', tgt: 'any', mech: true,
    force: [{ n: 3, t: 'flaktrack' }, { n: 6, t: 'conscript' }],
    w: { easy: 0, normal: 2, hard: 3 }, max: 1, need: 'factory' },
  { key: 'colEng',   name: 'Soviet Tech Capture', fac: 'col', role: 'engineer', tgt: 'tech',
    force: [{ n: 1, t: 'engineer' }], prod: true,
    w: { easy: 2, normal: 3, hard: 4 }, max: 2, need: 'barracks' },
  // ---- Collective navy.
  { key: 'colSub',   name: 'Soviet Submarine Pack', fac: 'col', role: 'attack', tgt: 'coast', naval: true,
    force: [{ n: 3, t: 'sub' }, { n: 1, t: 'seascorp' }],
    w: { easy: 2, normal: 4, hard: 5 }, max: 1, need: 'shipyard' },
  { key: 'colDred',  name: 'Soviet Dreadnought Bombardment', fac: 'col', role: 'siege', tgt: 'coast', naval: true,
    force: [{ n: 2, t: 'dread' }, { n: 2, t: 'sub' }, { n: 1, t: 'seascorp' }],
    w: { easy: 0, normal: 2, hard: 5 }, max: 1, need: 'shipyard' },
  { key: 'colLand',  name: 'Soviet Amphibious Raid', fac: 'col', role: 'harass', tgt: 'economy',
    naval: true, mech: true, drop: true,
    force: [{ n: 1, t: 'apc' }, { n: 6, t: 'conscript' }],
    w: { easy: 0, normal: 0, hard: 4 }, max: 1, need: 'shipyard' },
  { key: 'colDef',   name: 'Soviet Base Defense', fac: 'col', role: 'defend', tgt: 'any',
    force: [{ n: 3, t: 'conscript' }, { n: 2, t: 'flak' }],
    w: { easy: 3, normal: 3, hard: 3 }, max: 2 }
];

var AI_TEAM_BY_KEY = {};

(function () { for (var i = 0; i < AI_TEAMS.length; i++) AI_TEAM_BY_KEY[AI_TEAMS[i].key] = AI_TEAMS[i]; })();

export function newAI(diff) {
  return {
    // The NAME as well as the knobs: save/load deep-copies the AI, so
    // `cfg === DIFF.hard` stops being true across a reload and every
    // identity test on it silently answered "normal".
    diff: DIFF[diff] ? diff : 'normal',
    cfg: DIFF[diff] || DIFF.normal,
    posture: 'build', t: 0, lastStrat: 0, lastTac: 0, lastScout: 0,
    shore: false,                              // AINavalYardAdjacency: is a navy possible at all

    seen: { inf: 0, veh: 0, bld: 0, air: 0 }, seenAt: 0, airAt: -1e9,
    army: [], attacking: false, rally: null, scout: null, placeFail: 0,
    wave: [], waveN: 0, waveTarget: 0, scoutSent: 0, garrison: [],
    // team layer
    teams: [], teamId: 0, lastTeam: -1e9, failed: 0, lastFail: -1e9, siege: false
  };
}

// What the AI can see: only tiles within sight of something it owns.
// AINavalYardAdjacency: settled once, from the Construction Yard's own
// start position, because neither the map nor the start moves.
function aiCheckShore(g, ai, me) { ai.shore = hasShore(g, me); ai.shoreAt = 1; }

function scoutEnemy(g, ai, me, foe) {
  if (!ai.shoreAt) aiCheckShore(g, ai, me);
  var seen = { inf: 0, veh: 0, bld: 0, air: 0 };
  var eyes = [];
  var i;
  for (i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    if (!u.dead && u.p === me) eyes.push({ x: u.x, y: u.y, r: UNITS[u.type].sight });
  }
  for (i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (!b.dead && b.p === me) eyes.push({ x: b.cx, y: b.cy, r: BLDS[b.type].sight });
  }
  function visible(x, y) {
    // An enemy Gap Generator blinds the AI exactly as it blinds a human:
    // whatever stands in the disc is not counted, so its production pass
    // answers an army it cannot see.
    if (gapped(g, me, Math.round(x), Math.round(y))) return false;
    for (var k = 0; k < eyes.length; k++) {
      var dx = eyes[k].x - x, dy = eyes[k].y - y;
      if (dx * dx + dy * dy <= eyes[k].r * eyes[k].r) return true;
    }
    return false;
  }
  for (i = 0; i < g.units.length; i++) {
    var e = g.units[i];
    if (e.dead || e.p !== foe) continue;
    if (!visible(e.x, e.y)) continue;
    if (UNITS[e.type].air) { seen.air++; ai.airAt = g.tick; }
    else if (isInfArmour(UNITS[e.type].armour)) seen.inf++; else seen.veh++;
  }
  for (i = 0; i < g.blds.length; i++) {
    var eb = g.blds[i];
    if (eb.dead || eb.p !== foe) continue;
    if (visible(eb.cx, eb.cy)) seen.bld++;
  }
  if (seen.inf + seen.veh + seen.bld > 0) { ai.seen = seen; ai.seenAt = g.tick; }
}

// [General] AIVirtualPurifiers=4,2,0 — the AI houses only, never the human.
export function aiVirtualPurifiers(g, p) {
  var ai = aiOf(g, p);
  return ai ? (ai.cfg.purifiers || 0) : 0;
}

function aiArmy(g, me) {
  var a = [];
  for (var i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    // `dmg > 0` is "can it shoot", not "is it a soldier". [HARV] is
    // ToProtect=yes / ThreatPosed=0 — a War Miner carries a 20mm and is
    // still never part of a team. Without the isHarv guard, giving the
    // Collective's miner its gun conscripted the whole economy into the
    // attack wave and the faction lost 6 of 6 soak matches to it.
    // A transport is part of a task force even when it has no gun of its
    // own — [SAPC] carries the wave, it is not baggage.
    if (!u.dead && u.p === me && !UNITS[u.type].ammo && !isHarv(u) &&
        (UNITS[u.type].dmg > 0 || UNITS[u.type].pax)) a.push(u);
  }
  return a;
}

// What a wave walks into: the enemy's live defences, valued like units.
// Under RA2 numbers a Tesla Coil or Prism Tower shreds a small wave, so
// committing on army value alone feeds units into it piecemeal.
function defenceValue(g, p) {
  var v = 0;
  for (var i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (!b.dead && b.p === p && BLDS[b.type].dmg > 0 && powered(g, p)) v += BLDS[b.type].cost * (b.hp / b.maxhp);
  }
  return v;
}

function armyValue(g, p) {
  var v = 0;
  for (var i = 0; i < g.units.length; i++) {
    var u = g.units[i];
    if (!u.dead && u.p === p && UNITS[u.type].dmg > 0 && !isHarv(u)) v += UNITS[u.type].cost * (u.hp / u.maxhp);
  }
  return v;
}

// ---- team plumbing ---------------------------------------------------- //
// "Can this house make one of these at all", ignoring the bank. canBuild()
// folds the price in, which would make a team ineligible for the whole match
// simply because the AI happened to be broke at the tick the trigger fired.
export function aiCanMake(g, p, key) {
  var spec = UNITS[key];
  if (!spec) return false;
  // The same one predicate canBuild uses, so a house that took an enemy
  // War Factory may field its tanks and a house that never captured
  // anything behaves exactly as before. AI_TEAMS only ever names its own
  // faction's units, so this widens what the AI CAN do without changing
  // what it asks for — it cannot queue something it has no shed for.
  return facAllows(g, p, spec, false) && reqMet(g, p, spec);
}

function aiTeamCount(ai, key) {
  var n = 0;
  for (var i = 0; i < ai.teams.length; i++) if (ai.teams[i].def.key === key) n++;
  return n;
}

function aiRoleCount(ai, role) {
  var n = 0;
  for (var i = 0; i < ai.teams.length; i++) if (ai.teams[i].def.role === role) n++;
  return n;
}

function aiTeamFull(t) {
  for (var i = 0; i < t.def.force.length; i++) {
    var f = t.def.force[i], n = 0;
    for (var j = 0; j < t.units.length; j++) if (t.units[j].type === f.t) n++;
    if (n < f.n) return false;
  }
  return true;
}

// Everything an unfilled team still wants, most urgent first. This is what
// replaced the ad-hoc "roll a die and pick a unit" in aiProduce: RA2's AI
// builds because a team is short of a member, not because it feels like a
// tank. Types the house cannot currently make are skipped, so a team whose
// Battle Lab has just been shot does not jam the whole request list.
function aiTeamNeeds(g, ai, me, cls) {
  var s = g.side[me], want = [], seenT = {};
  var order = ai.teams.slice().sort(function (a, b) { return aiTeamPri(ai, b) - aiTeamPri(ai, a); });
  for (var i = 0; i < order.length; i++) {
    var t = order[i];
    // A production-only team (Engineers, the Harrier flight) does not
    // compete with the battle groups for the infantry and vehicle lanes —
    // it has its own gate below. Letting it in had the Collective buying
    // $500 Engineers where it wanted $100 Conscripts and sitting on $22 000
    // at five minutes with eleven men on the field.
    if (t.def.prod && cls !== t.def.role) continue;
    for (var k = 0; k < t.def.force.length; k++) {
      var f = t.def.force[k], have = 0;
      if (t.def.prod) have = countUnit(g, me, f.t);
      else for (var j = 0; j < t.units.length; j++) if (t.units[j].type === f.t) have++;
      var short = f.n - have - queuedCount(s, f.t);
      if (short <= 0) continue;
      if (!aiCanMake(g, me, f.t)) continue;
      if (seenT[f.t]) { seenT[f.t].n += short; continue; }
      var rec = { t: f.t, n: short };
      seenT[f.t] = rec; want.push(rec);
    }
  }
  return want;
}

function aiTeamPri(ai, t) {
  var r = t.def.role;
  if (r === 'siege') return ai.siege ? 100 : 40;
  if (r === 'defend') return ai.posture === 'defend' ? 90 : 30;
  if (r === 'engineer') return 35;
  if (r === 'air') return 45;
  if (r === 'harass') return 38;
  return 50;                                       // attack
}

// rules.ini's AI trigger weighting, all three keys:
//   AITriggerSuccessWeightDelta=20   a trigger whose team achieved something
//   AITriggerFailureWeightDelta=-50  ...and failure is punished 2.5x harder
//   AITriggerTrackRecordCoefficient=1
// RA2's AI keeps a per-TRIGGER record and re-weights it, so it learns which
// attacks work on this map against this opponent. Only the posture switch
// was modelled here (a global +20 to siege when the enemy out-guns a push),
// which is a different thing: it re-weights a ROLE for everyone, and forgets
// nothing and learns nothing.
var AI_TRIG_WIN = 20, AI_TRIG_LOSS = -50, AI_TRIG_COEF = 1;

function aiRec(ai, key, delta) {
  if (!ai.rec) ai.rec = {};
  // Bounded, or one lucky rush makes a trigger permanent and one bad one
  // makes it unreachable for the rest of the match.
  ai.rec[key] = Math.max(-60, Math.min(60, (ai.rec[key] || 0) + delta));
}

function aiReleaseTeam(ai, t) {
  var i = ai.teams.indexOf(t);
  if (i >= 0) ai.teams.splice(i, 1);
}

// [AITriggerTypes]: every pass reads every trigger, rolls its weight and
// creates the teams that come up. TeamDelays is the interval between passes,
// TotalAITeamCap the ceiling on live teams, Minimum/MaximumAIDefensiveTeams
// the floor and ceiling on the ones that stay home.
function aiTeamPass(g, ai, me, foe) {
  var cfg = ai.cfg, s = g.side[me], i, t;
  // dissolve: a team that has not filled inside DissolveUnfilledTeamDelay
  // gives its members back to the pool and the trigger is read again.
  for (i = ai.teams.length - 1; i >= 0; i--) {
    t = ai.teams[i];
    t.units = t.units.filter(function (u) { return u && !u.dead; });
    if (t.def.prod) continue;
    if (!t.launched && !t.loaded && g.tick - t.born > cfg.dissolve && !aiTeamFull(t)) aiReleaseTeam(ai, t);
  }
  // How many fighters are standing around in no team at all. RA2 calls a
  // team with LooseRecruit=yes on the loose pool; the effect here is that an
  // idle army does not wait out a 58-second TeamDelays pass — a pool big
  // enough for another task force gets one straight away.
  var claimed = {}, free = 0;
  for (i = 0; i < ai.teams.length; i++) {
    if (ai.teams[i].def.prod) continue;
    for (var ci = 0; ci < ai.teams[i].units.length; ci++) claimed[ai.teams[i].units[ci].id] = 1;
  }
  for (i = 0; i < ai.army.length; i++) if (!claimed[ai.army[i].id]) free++;
  var loose = free >= cfg.group * 2;
  // "One task force recruits at a time" is a LAND rule and a NAVAL rule,
  // not one rule across both. ai.ini keeps its naval teams on their own
  // trigger for exactly this reason: a fleet is built out of a different
  // production lane and cannot absorb a rifleman, so a half-filled
  // Destroyer Screen has no business freezing the Grizzly Attack behind it.
  // Sharing the interlock cost the Directorate two of twelve Coastal soak
  // matches the moment its navy became buildable — the yard's slow $2000
  // hulls held the land ladder for a whole DissolveUnfilledTeamDelay.
  var filling = [false, false];
  for (i = 0; i < ai.teams.length; i++) {
    var ft = ai.teams[i];
    if (ft.def.prod || ft.launched) continue;
    if (ft.def.role === 'defend') continue;
    if (g.tick - ft.born < cfg.dissolve * 0.5) filling[ft.def.naval ? 1 : 0] = true;
  }
  if (g.tick - ai.lastTeam < (loose ? 600 : cfg.teamDelay)) return;
  ai.lastTeam = g.tick;
  if (ai.teams.length >= cfg.teamCap) return;
  // TotalAITeamCap bounds the whole list; the offensive slice is
  // attackTeams, widened while a big loose pool is going to waste.
  var atkCap = cfg.attackTeams + Math.floor(free / 12);
  // The fleet gets its own slice of the ceiling. Two hulls' worth of task
  // force is the whole naval ladder (a screen and a bombardment, or a
  // screen and a landing), so it never needs the land allowance.
  var navCap = 2;
  function offCount(nav) {
    var n = 0;
    for (var k = 0; k < ai.teams.length; k++) {
      var td = ai.teams[k].def;
      if (td.prod || td.role === 'defend' || td.role === 'engineer' || td.role === 'air') continue;
      if (!!td.naval === !!nav) n++;
    }
    return n;
  }

  // The defensive floor is a hard requirement, not a weighted roll.
  var nDef = aiRoleCount(ai, 'defend');
  var cand = [], total = 0;
  for (i = 0; i < AI_TEAMS.length; i++) {
    var d = AI_TEAMS[i];
    if (d.fac !== s.fac) continue;
    var w = d.w[ai.diff] || 0;
    if (!w) continue;
    if (aiTeamCount(ai, d.key) >= d.max) continue;
    if (d.need && !hasBld(g, me, d.need)) continue;
    if (d.role === 'defend' && nDef >= cfg.defMax) continue;
    if (d.role === 'attack' || d.role === 'siege' || d.role === 'harass') {
      if (offCount(d.naval) >= (d.naval ? navCap : atkCap)) continue;
      // One task force recruits at a time, per domain. Eight half-filled
      // teams sharing fifty units is how the Collective ended a 30-minute
      // match with every team still in `fill` and nothing on the field
      // (measured) — but a fleet filling out of the naval lane is not
      // competing for those fifty units at all.
      if (filling[d.naval ? 1 : 0]) continue;
    }
    // Every member has to be buildable, or the team can never fill.
    var ok = true;
    for (var k = 0; k < d.force.length; k++) if (!aiCanMake(g, me, d.force[k].t)) { ok = false; break; }
    if (!ok) continue;
    // AITriggerSuccessWeightDelta=20: a posture that is failing re-weights
    // the triggers. Ours is the siege switch — when the enemy base out-guns
    // a straight push, the artillery team is what the AI reaches for.
    if (ai.siege && d.role === 'siege') w += 20;
    if (ai.siege && d.role === 'attack') w = Math.max(1, w - 2);
    if (ai.posture === 'defend' && d.role === 'defend') w += 10;
    // ...and the TRIGGER's own track record, which is the part rules.ini
    // actually describes. Floored at 1 rather than 0: a trigger that has had
    // a bad run should become unlikely, never impossible, or the AI can talk
    // itself out of its whole roster on one unlucky map.
    w = Math.max(1, w + (ai.rec ? (ai.rec[d.key] || 0) : 0) * AI_TRIG_COEF);
    cand.push({ d: d, w: w }); total += w;
  }
  if (nDef < cfg.defMin) {
    for (i = 0; i < cand.length; i++) if (cand[i].d.role === 'defend') { aiMakeTeam(g, ai, cand[i].d); return; }
  }
  if (!total) return;
  var roll = rnd() * total;
  for (i = 0; i < cand.length; i++) {
    roll -= cand[i].w;
    if (roll <= 0) { aiMakeTeam(g, ai, cand[i].d); return; }
  }
  aiMakeTeam(g, ai, cand[cand.length - 1].d);
}

function aiMakeTeam(g, ai, d) {
  ai.teams.push({ def: d, id: ++ai.teamId, units: [], born: g.tick,
                  launched: 0, mode: 'fill', n0: 0, tgt: 0, gatherAt: 0 });
}

// Recruiting: a free fighter joins the neediest team that wants its type.
// ai.ini calls this Recruiter/LooseRecruit; the effect is that production
// and the battle group are the same list, which is why the AI stops
// dribbling one new tank at a time into a dead attack.
function aiRecruit(g, ai, me) {
  var i, j, t, claimed = {};
  for (i = 0; i < ai.teams.length; i++) {
    t = ai.teams[i];
    if (t.def.prod) continue;
    for (j = 0; j < t.units.length; j++) claimed[t.units[j].id] = 1;
  }
  var free = [];
  for (i = 0; i < ai.army.length; i++) {
    var u = ai.army[i];
    if (u.dead || claimed[u.id] || u === ai.scout) continue;
    free.push(u);
  }
  if (!free.length) return;
  var order = ai.teams.slice().sort(function (a, b) { return aiTeamPri(ai, b) - aiTeamPri(ai, a); });
  for (i = 0; i < order.length; i++) {
    t = order[i];
    if (t.def.prod || aiTeamFull(t)) continue;
    for (var k = 0; k < t.def.force.length; k++) {
      var f = t.def.force[k], have = 0;
      for (j = 0; j < t.units.length; j++) if (t.units[j].type === f.t) have++;
      for (j = 0; j < free.length && have < f.n; j++) {
        if (!free[j] || free[j].type !== f.t) continue;
        t.units.push(free[j]); free[j] = null; have++;
      }
    }
  }
}

export function stepAI(g, ai, me, foe) {
  var s = g.side[me], cfg = ai.cfg;
  ai.t++;
  // [General] MultiplayerAICM=400,0,0 (Genius, Smart, Easy) — the skirmish
  // AI's Coefficient of Money, paid once at the start of the match.
  if (ai.t === 1 && cfg.aicm) s.credits += cfg.aicm;

  // ---- scouting: send one cheap unit to look, on a timer ----
  if (ai.scout && ai.scout.dead) ai.scout = null;
  if (ai.scout) {
    var sv = g.start[foe];
    var sd = Math.sqrt((ai.scout.x - sv.x) * (ai.scout.x - sv.x) +
                       (ai.scout.y - sv.y) * (ai.scout.y - sv.y));
    if (sd < 9 || ai.t - ai.scoutSent > 2400) {
      // seen enough (or given up): walk home and rejoin the next wave
      var back = aiStaging(g, me, foe);
      ai.scout.order = { t: 'move', x: back.x, y: back.y, id: 0 };
      ai.scout.guardX = back.x; ai.scout.guardY = back.y;
      ai.scout.repathAt = -999;
      ai.scout = null;
    }
  }
  if (cfg.scoutEvery && !ai.scout && ai.t - ai.lastScout > cfg.scoutEvery) {
    ai.lastScout = ai.t;
    var pool = aiArmy(g, me);
    if (pool.length > 3) {
      ai.scout = pool[0];
      ai.scoutSent = ai.t;
      var tgt = g.start[foe];
      ai.scout.order = { t: 'move', x: tgt.x, y: tgt.y, id: 0 };
      ai.scout.guardX = tgt.x; ai.scout.guardY = tgt.y;
      ai.scout.repathAt = -999;
      requestPath(g, ai.scout, tgt.x, tgt.y);
    }
  }
  scoutEnemy(g, ai, me, foe);

  // ---- strategy, every 2s ----
  if (ai.t - ai.lastStrat > 120) {
    ai.lastStrat = ai.t;
    var myArmy = armyValue(g, me), theirArmy = armyValue(g, foe);
    var harv = countUnit(g, me, 'harvester');
    ai.army = aiArmy(g, me);

    // ---- SIEGE POSTURE ------------------------------------------------
    // RA2's AI does not keep walking a line company into a Tesla Coil. Two
    // signals switch it to artillery: the defence line is worth more than
    // half its own army (a straight push loses on arithmetic), or two waves
    // in a row have already died on it. Once set it stays set for four
    // minutes, so the artillery team has time to be built and to fill.
    var dv = defenceValue(g, foe);
    var wantSiege = (dv > 900 && dv > myArmy * 0.45) || (ai.failed >= 2 && g.tick - ai.lastFail < 60 * 240);
    ai.siege = !!wantSiege && ai.diff !== 'easy';
    var mayAttack = ai.t > cfg.opening;

    // An economy that can still be repaired is worth repairing; one with no
    // refinery AND no yard to build another is not, and an army that stands
    // in the wreckage waiting for a miner has already lost. RA2's AI throws
    // what is left at you.
    var ruined = !hasBld(g, me, 'refinery') && !hasBld(g, me, 'base') && !countUnit(g, me, 'mcv');
    if (ruined && mayAttack && ai.army.length >= cfg.group) ai.posture = 'attack';
    else if (harv < 2 || !hasBld(g, me, 'refinery')) ai.posture = 'eco';
    else if (mayAttack && ai.army.length >= cfg.group && myArmy > theirArmy * 0.95 + dv * 0.6) ai.posture = 'attack';
    // No fallback here deadlocked a 58-unit army in 'build' behind a wall of
    // defences it could have rolled over, so a big army that OUT-VALUES the
    // enemy field army pushes anyway and ignores the defence line. What it
    // may not do is push on unit COUNT alone: the Collective's $100
    // Conscript made `army.length >= group * 4` trip while the enemy's GIs,
    // IFVs and Grizzlies were worth twice as much, and Normal-as-Collective
    // threw 42 units into a fortified Directorate at 8:00 and lost 32 of
    // them in one minute (seed 111, measured). That single clause was worth
    // six of the twelve normal-vs-easy losses on the Collective side.
    else if (mayAttack && ai.army.length >= cfg.group * 2.5 && myArmy > theirArmy * 0.95) ai.posture = 'attack';
    else if (theirArmy > myArmy * 1.5 && theirArmy > 2500) ai.posture = 'defend';   // three GIs are not a threat worth a $1500 coil
    else ai.posture = 'build';

    aiProduce(g, ai, me, foe);
    aiSuper(g, ai, me, foe);
  }

  // ---- teams: create, dissolve, recruit ----
  aiTeamPass(g, ai, me, foe);

  // ---- placement: the AI places its finished structures ----
  if (readyLane(s)) aiPlace(g, ai, me, foe);

  // ---- tactics ----
  if (ai.t - ai.lastTac > cfg.react) {
    ai.lastTac = ai.t;
    aiTactics(g, ai, me, foe);
  }
}

// Ore fields the base can actually work: RA2 sizes its refinery count on
// the ore it can reach, not on a flat number.
function aiOreFields(g, me) {
  var home = g.start[me], n = 0, ter = g.terrain, ore = g.ore;
  for (var y = 0; y < MAP; y++) for (var x = 0; x < MAP; x++) {
    var dx = x - home.x, dy = y - home.y;
    if (dx * dx + dy * dy > 34 * 34) continue;
    var i = y * MAP + x;
    if (oreT(ter[i]) && ore[i] > 40) n++;
  }
  return n;
}

// AlliedBaseDefenseCounts=25,20,6 / SovietBaseDefenseCounts=25,22,6 are the
// ceilings; rules.ini records the formula they replaced right beside them —
// ((TotalBaseCost-2000)/1500 * Coefficient) + 3*(Level-1), with
// GDIBaseDefenseCoefficient=1.5 and NodBaseDefenseCoefficient=1.2. The
// explicit numbers were tuned for RA2's much richer maps; the formula is
// what makes the plan grow with the base actually standing, so we run the
// formula and clamp it with the explicit ceiling.
export function aiDefencePlan(g, ai, me) {
  var cost = 0, coef = g.side[me].fac === 'col' ? 1.2 : 1.5;
  for (var i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (!b.dead && b.p === me && !BLDS[b.type].dmg) cost += BLDS[b.type].cost;
  }
  var lvl = ai.diff === 'hard' ? 3 : ai.diff === 'normal' ? 2 : 1;
  var n = Math.floor((cost - 2000) / 1500 * coef) + 3 * (lvl - 1);
  return Math.max(1, Math.min(ai.cfg.defCount, n));
}

// Can the other house put anything in the air AT ALL? RA2's aircraft all
// hang off two structures: [ORCA]/[ROCK]/[SHAD] need an Airforce Command,
// and the Collective's [ZEP] needs a Battle Lab with a War Factory to build
// it in. The AI already reads the enemy's base directly everywhere else
// (target picking, superweapon aim), so this reads it the same way.
function aiFoeCanFly(g, foe) {
  if (hasBld(g, foe, 'airforce')) return true;
  return g.side[foe].fac === 'col' && hasBld(g, foe, 'lab') && hasBld(g, foe, 'factory');
}

function aiProduce(g, ai, me, foe) {
  var s = g.side[me], cfg = ai.cfg;
  // RA2's AI rebuilds its base rather than dying with it: with no yard
  // standing it unfolds an MCV on the spot, shuffling one tile at a time if
  // the ground under it is blocked, and buys one if it still has the War
  // Factory + Service Depot pair and the $3000.
  if (!hasBld(g, me, 'base')) {
    for (var mi = 0; mi < g.units.length; mi++) {
      var mu = g.units[mi];
      if (mu.dead || mu.p !== me || mu.type !== 'mcv') continue;
      if (deployMcv(g, mu)) return;
      if (!mu.order && (g.tick & 31) === 0) {                 // nudge it clear, deterministically
        var step = ((g.tick >> 5) % 4), dxs = [2, 0, -2, 0][step], dys = [0, 2, 0, -2][step];
        orderUnitsTo(g, [mu], Math.max(0, Math.min(MAP - 1, Math.round(mu.x) + dxs)),
                              Math.max(0, Math.min(MAP - 1, Math.round(mu.y) + dys)));
      }
      return;
    }
    if (!s.queues.v.list.length && !queuedCount(s, 'mcv') && canBuild(g, me, 'mcv', false)) {
      enqueue(g, me, 'mcv', 'v'); return;
    }
  }
  // Cheap gun first, the tier-2 tower second (def2 used to equal def for the
  // Collective, so it never built a Sentry Gun and its defence cap halved).
  var F = FACTIONS[s.fac], def = s.fac === 'col' ? 'sentrygun' : 'sentry';
  var def2 = s.fac === 'col' ? 'tesla' : 'prism';
  var nRef = countBld(g, me, 'refinery');
  var harv = countUnit(g, me, 'harvester');
  var net = s.powerMade - s.powerUse;
  // Power the way a player counts it: what is already queued in either
  // structure lane draws too. Committing a radar while a coil is building
  // put the Soviet AI at -35 for three minutes of 0.4x production.
  var draw = function (k) { return bspecOf(g, k, me).power; };
  var netQ = net;
  s.queues.b.list.forEach(function (k) { netQ += draw(k); }); if (s.queues.b.ready) netQ += draw(s.queues.b.ready);
  s.queues.d.list.forEach(function (k) { netQ += draw(k); }); if (s.queues.d.ready) netQ += draw(s.queues.d.ready);
  var hasFac = hasBld(g, me, 'factory'), hasBar = hasBld(g, me, 'barracks');
  var radarKey = s.fac === 'col' ? 'radar' : 'airforce', ecoKey = s.fac === 'col' ? 'reactor' : 'purifier';
  // HarvestersPerRefinery=2, and the refinery count follows the ore the base
  // can actually reach rather than a flat "expand" number.
  // One refinery per ~25 reachable ore tiles, bounded by the difficulty's
  // expansion appetite. Sampling every FOURTH tile (and dividing by 30)
  // counted 18 fields on the reference map and capped every difficulty at
  // two refineries, which quietly deleted the hard AI's economic lead — it
  // ran 2 refineries and 4 miners where the pre-team build ran 3 and 5.
  var maxRef = Math.max(2, Math.min(cfg.expand + 1, 1 + Math.floor(aiOreFields(g, me) / 40)));

  // ---- structures -----------------------------------------------------
  // Order matters more than it looks. Harvesters come out of the factory,
  // and income comes out of harvesters, so a destroyed factory with a thin
  // harvester count is a DEATH SPIRAL: no factory, no harvesters, no
  // income, never enough to rebuild the factory. It is rebuilt first, and
  // power is only ever built when the grid is actually short — an earlier
  // "rich? build a power plant" rule had the AI sitting on twelve of them
  // while its barracks lay in rubble.
  if (!s.queues.b.list.length && !s.queues.b.ready && hasBld(g, me, 'base')) {
    var want = null;
    // RA2 opening: Power → Refinery → Barracks. A base that starts on a
    // $1500 coil with no plant runs unpowered at 0.4x for three minutes.
    if (!hasBld(g, me, 'power')) want = 'power';
    else if (!nRef) want = 'refinery';                  // no income at all
    else if (net < 20) want = 'power';                  // grid is short
    else if (!hasBar) want = 'barracks';                // War Factory needs Refinery + Barracks (rules.ini)
    else if (!hasFac) want = 'factory';
    else if (nRef < maxRef && s.credits > 2000 && (nRef < 2 || ai.army.length >= 6)) want = 'refinery';
    // [GAYARD]/[NAYARD] AIBuildThis=yes. `AINavalYardAdjacency=20` is the
    // whole gate: on a map with no water within twenty cells of its
    // Construction Yard the AI never considers a yard at all, which is why
    // Iron Frontier plays exactly as it did before the navy existed. It
    // sits HERE — ahead of the second factory and the tech ladder — because
    // [NAYARD] is TechLevel 2, one rung behind the War Factory, and a fleet
    // that only starts building at minute twelve never reaches the water.
    else if (hasFac && !hasBld(g, me, 'shipyard') && ai.shore && s.credits > 1600 &&
             ai.army.length >= cfg.group * 0.5) want = 'shipyard';
    // A full lane and a fat bank is the AI saying "I have money I cannot
    // spend". The answer a human reaches for is a SECOND factory, and the
    // multi-building speed-up makes it pay twice. ONE extra factory, and
    // none for infantry: three factories tripled the fielded army and the
    // matches stopped resolving. Two is the point where the money gets
    // spent and the map still has room to walk.
    //
    // `fact`/`bar` are the difficulty's APPETITE, not a hard ceiling: a
    // house sitting on AI_HOARD dollars has already proved it cannot spend
    // what it earns, and one more building is the only answer to that. This
    // is what Normal's tier was actually short of — at 10:00 on seed 222 it
    // held $21 000 behind two factories while an easy Directorate, poorer
    // by four to one, fielded an army worth twice as much (normal vs easy
    // 15/24 -> 17/24). It fires for every tier, but only for the tier that
    // is drowning in money, which is never the hard one.
    else if (s.queues.v.list.length >= 2 && s.credits > 2200 &&
             countBld(g, me, 'factory') < Math.min((cfg.fact || 4) + (s.credits > AI_HOARD ? 1 : 0), 2 + Math.floor(s.credits / 4000))) want = 'factory';
    // A full infantry lane and a fat bank: more barracks, not a deeper queue
    // (a $200 GI takes twice a Conscript's 4 s; the soak showed hard sitting
    // on $9500 with two barracks while easy fielded 64 Conscripts).
    // Same escape on the infantry side of the house.
    else if (s.queues.i.list.length >= 2 && s.credits > 3000 && countBld(g, me, 'barracks') < Math.min((cfg.bar || 4) + (s.credits > AI_HOARD ? 1 : 0), s.credits > 7000 ? 4 : s.credits > 4500 ? 3 : 2)) want = 'barracks';
    // Tech only once an army stands: a $1000 radar and a $2000 lab before
    // ten fighters is how the hard AI lost to a seven-minute infantry flood.
    else if (nRef >= 2 && !hasBld(g, me, radarKey) && s.credits > 1200 && ai.army.length >= cfg.group * 0.6) want = radarKey;
    else if (hasBld(g, me, radarKey) && !hasBld(g, me, 'lab') && s.credits > 2200 && ai.army.length >= cfg.group) want = 'lab';
    // Service Depot once the tech is up: it gates the MCV (and the base
    // rebuild) and repairs the tanks — the soak found it never built.
    else if (hasBld(g, me, radarKey) && hasFac && !hasBld(g, me, 'depot') && s.credits > 1800 && ai.army.length >= cfg.group * 0.6) want = 'depot';
    // Superweapons before the economy building: a 7-10 minute charge has to
    // start early enough to fire inside a match. The army has to stand
    // first and the bank has to be deep enough that the silo is spare cash.
    else if (hasBld(g, me, 'lab') && s.credits > 3000 && ai.army.length >= cfg.group && aiSwWant(g, me)) want = aiSwWant(g, me);
    else if (hasBld(g, me, 'lab') && !hasBld(g, me, ecoKey) && s.credits > 2600) want = ecoKey;
    if (want && want !== 'power' && netQ + draw(want) < 30 && canBuild(g, me, 'power', true)) want = 'power';   // headroom first
    if (want && canBuild(g, me, want, true)) enqueue(g, me, want, laneOfBld(want));
  }

  // Defence builds in its own lane now, so a turret never delays a refinery
  // for the AI either — it is a separate decision, not a queue position.
  //
  // AlliedBaseDefenseCounts / SovietBaseDefenseCounts (25,20,6 h,m,e): the
  // number of base defences the house PLANS on making over a match. It is a
  // ceiling, not a schedule — the affordability slack below is what paces
  // it, so a rich hard AI fortifies and a poor one still buys tanks. The AA
  // screen is a PROPORTION of that same plan, so it scales with the base
  // instead of being a flat count.
  var defCap = aiDefencePlan(g, ai, me);
  // Anti-air used to wait for `ai.airAt` — the tick an enemy aircraft was
  // last SEEN or FELT. That is a reaction, and a reaction is too late: an
  // easy Directorate could open an Airforce Command at 12:00 and have its
  // Harriers eating a Normal Collective's miners from 14:00 with nothing in
  // the sky to answer them, because the first sortie was also the first
  // sighting. RA2's AI plans against what the enemy CAN field. So the
  // screen goes up once the other house owns the buildings that make
  // aircraft possible at all — an Airforce Command (Harriers, Rocketeers,
  // Nighthawks) or, for the Collective, the Battle Lab + War Factory pair
  // that a Kirov needs — and it deepens if they actually come.
  var aaKey = s.fac === 'col' ? 'flakcannon' : 'patriot';
  var airThreat = g.tick - ai.airAt < 60 * 90;          // seen, or felt: being bombed counts
  var airPoss = aiFoeCanFly(g, foe);
  var nAA = countBld(g, me, aaKey);
  // Bombed: half the defence plan, never fewer than three guns. Merely able
  // to fly: a third of it, never fewer than two. Neither: the single tower
  // the old rule put up after the radar, so nothing regressed for a house
  // whose enemy has no airfield at all.
  var aaWant = airThreat ? Math.max(3, Math.min(6, Math.ceil(defCap * 0.5)))
             : airPoss ? Math.max(2, Math.min(4, Math.ceil(defCap * 0.3)))
             : (hasBld(g, me, radarKey) && countBld(g, me, def) + countBld(g, me, def2) >= 2 ? 1 : 0);
  // A pre-emptive screen is bought out of spare cash, not out of the army's
  // money — the same slack rule the gun towers below use. Once the bombs
  // are actually falling it stops being optional.
  var aaCash = airThreat ? 1100 : airPoss ? 1600 : 2400;
  if (!s.queues.d.list.length && !s.queues.d.ready && hasBld(g, me, 'base') &&
      canBuild(g, me, aaKey, true) && nAA < aaWant && s.credits > aaCash) {
    enqueue(g, me, aaKey, 'd');
  }
  if (ai.posture !== 'defend') defCap = Math.round(defCap * 0.7);
  // A turret is bought out of money the ARMY is not already asking for.
  // Without this the plan above turned into ten pillboxes and eleven men.
  var defSpare = ai.posture === 'defend' || ai.army.length >= cfg.group ||
                 s.queues.i.list.length >= 2 || s.queues.v.list.length >= 2;
  if (defSpare && !s.queues.d.list.length && !s.queues.d.ready && hasBld(g, me, 'base') &&
      countBld(g, me, def) + countBld(g, me, def2) < defCap &&
      s.credits > 600) {
    // Cheap guns up to a third of the plan, the tier-2 tower for the rest
    // (a shared cap let three Sentry Guns lock the Tesla Coil out for good).
    var nDef = countBld(g, me, def), nDef2 = countBld(g, me, def2);
    var pick = (canBuild(g, me, def2, true) && nDef2 < Math.ceil(defCap * 0.5) && nDef >= 1) ? def2 : (nDef < Math.ceil(defCap * 0.5) ? def : null);
    if (!pick) pick = def;
    // AIBuildsWalls=no in the shipped rules.ini, so this never fires; when a
    // mod turns it on, AIPickWallDefensePercent is the chance that a defence
    // slot is spent on a wall segment instead of a gun.
    if (AI_BUILDS_WALLS && rnd() * 100 < cfg.wallPct && canBuild(g, me, 'wall', true)) pick = 'wall';
    // RA2 defences cost $500-1500: buy one when it is affordable beside the
    // army, not at a flat bank level a $500 Sentry Gun never needed.
    var slack = ai.posture === 'defend' ? 1.2 : (pick === def2 ? 1.5 : 2);   // a $1500 coil at 2x never cleared the bank
    if (s.credits < bspecOf(g, pick, me).cost * slack) pick = def;
    if (s.credits < bspecOf(g, pick, me).cost * slack) pick = null;
    if (pick && netQ + draw(pick) < 0) pick = def;                   // never a coil into a power deficit
    if (pick && netQ + draw(pick) >= 0 && canBuild(g, me, pick, true)) enqueue(g, me, pick, 'd');
  }
  // Tier-3 Directorate defences, one of each, and only out of genuinely
  // spare money — a Gap Generator buys no kills and a Grand Cannon is a
  // $2000 turret, so both come after the army and the superweapon.
  if (s.fac === 'dir' && !s.queues.d.list.length && !s.queues.d.ready && hasBld(g, me, 'base')) {
    var t3 = (hasBld(g, me, 'airforce') && !countBld(g, me, 'grandcannon') && s.credits > 5000) ? 'grandcannon'
           : (hasBld(g, me, 'lab') && !countBld(g, me, 'gapgen') && s.credits > 6000) ? 'gapgen' : null;
    if (t3 && netQ + draw(t3) >= 0 && canBuild(g, me, t3, true)) enqueue(g, me, t3, 'd');
  }

  // ---- harvesters before soldiers -------------------------------------
  // [General] HarvestersPerRefinery=2 — two miners a refinery, capped by the
  // ore the base can reach.
  var wantHarv = Math.min(2 * nRef, 2 * maxRef);
  var qHarv = queuedCount(s, harvKey(s.fac));
  // Replacing a lost miner may NOT wait for an empty vehicle lane. Under the
  // team layer that lane is permanently four deep, so the old "only when the
  // lane is idle" rule meant a Collective that lost its four War Miners
  // never built a fifth and died of economyDead at fourteen minutes with a
  // 41-man army standing (soak: six of twelve turtle matches).
  var harvIdle = !s.queues.v.list.length;
  if (harv + qHarv < wantHarv && hasFac && qHarv < 1 && (harvIdle || harv < 2) &&
      canBuild(g, me, 'harvester', false)) {
    enqueue(g, me, 'harvester', 'v');
    if (harvIdle) return;
  }
  // Below two harvesters the economy is dying: hold the credits for one.
  // Only while the credits are actually SCARCE, though — a side whose miners
  // have been killed under a lightning storm sat on $41 000 and built
  // nothing at all while its Construction Yard was dismantled around it.
  if (harv < 2 && hasFac && s.credits < 3000) return;

  // ---- army: the teams place the orders ------------------------------
  var seen = ai.seen, stale = g.tick - ai.seenAt > 3600;
  // Under RA2 verses a shell does 25% to infantry, so an unscouted enemy
  // is assumed to be fielding infantry until proven otherwise.
  var infHeavy = stale || seen.inf >= seen.veh;
  var vehHeavy = !stale && seen.veh > seen.inf * 0.8;

  var depth = s.credits > 6000 ? 4 : s.credits > 3000 ? 3 : 2;   // spend the bank
  // Saving for a superweapon: with the lab up and an army standing, keep a
  // reserve the unit lanes may not spend, or the bank never clears the
  // silo's price at a strategy tick (144 soak matches: 0 built).
  var reserve = hasBld(g, me, 'lab') && ai.army.length >= cfg.group * 1.5 && g.tick > 60 * 60 * 10 && aiSwWant(g, me) ? 2500 : 0;
  // RA2's AI fields capped team types, never a 64-Conscript blob.
  var infCap = 18 + 8 * cfg.expand;

  var pickFrom = function (cls, role) {
    var needs = aiTeamNeeds(g, ai, me, role || null);
    for (var i = 0; i < needs.length; i++) {
      var k = needs[i].t;
      if (UNITS[k].cls !== cls) continue;
      if (canBuild(g, me, k, false)) return k;
    }
    return null;
  };
  // ai.ini's "Engineer Oil" trigger: ONE engineer at a time, and only when
  // there is something on the map worth walking into.
  if (hasBar && !s.queues.i.list.length && countUnit(g, me, 'engineer') === 0 &&
      queuedCount(s, 'engineer') === 0 && s.credits > 1500 && canBuild(g, me, 'engineer', false)) {
    var capTgt = false;
    for (var ci2 = 0; ci2 < g.blds.length && !capTgt; ci2++) {
      var cbb = g.blds[ci2];
      if (cbb.dead) continue;
      if ((BLDS[cbb.type].tech && cbb.p !== me) || BLDS[cbb.type].hut ||
          (cbb.p === me && cbb.hp < cbb.maxhp * 0.6)) capTgt = true;
    }
    if (capTgt) enqueue(g, me, 'engineer', 'i');
  }

  if (s.queues.i.list.length < depth && hasBar && s.credits > reserve + 300 && countUnit(g, me, null, 'i') < infCap) {
    var atInf = s.fac === 'col' ? 'flak' : 'rocket';        // the faction's AA-capable trooper
    var pick = pickFrom('i');
    if (!pick) {
      // Nothing a team is short of: spend the surplus the old way, on the
      // answer to what has been SEEN.
      pick = (airThreat && rnd() < 0.6) ? atInf
           : vehHeavy ? (s.fac === 'col' && rnd() < 0.5 ? 'teslatrooper' : atInf)
           : (infHeavy ? F.inf : (rnd() < 0.6 ? F.inf : atInf));
      // A couple of dogs when the enemy is fielding men: $200 for something
      // that removes a GI per bite is the answer RA2's AI reaches for, and
      // they are the only eyes it has against a Mirage.
      if (infHeavy && countUnit(g, me, 'dog') < 3 && rnd() < 0.30 && canBuild(g, me, 'dog', false)) pick = 'dog';
      else if (s.fac === 'dir' && vehHeavy && countUnit(g, me, 'cleg') < 1 && rnd() < 0.06 && canBuild(g, me, 'cleg', false)) pick = 'cleg';
      else if (s.fac === 'col' && vehHeavy && countUnit(g, me, 'yuri') < 1 && rnd() < 0.06 && canBuild(g, me, 'yuri', false)) pick = 'yuri';
    }
    if (canBuild(g, me, pick, false)) enqueue(g, me, pick, 'i');
  }
  if (s.queues.v.list.length < depth && hasFac && s.credits > 1200 + reserve) {
    var vpick = pickFrom('v');
    if (!vpick) {
      // Tier-3 armour when the lab is up, fast anti-infantry when the enemy
      // masses infantry, else the line tank. Against massed (and prone)
      // infantry the answer is a weapon with no ProneDamage penalty:
      // Mirage / Prism for the Directorate, Tesla Tank for the Collective.
      var heavy = s.fac === 'col' ? ((infHeavy && rnd() < 0.5 && canBuild(g, me, 'teslatank', false)) ? 'teslatank' : 'mammoth')
                : (infHeavy ? ((rnd() < 0.4 && canBuild(g, me, 'prismtank', false)) ? 'prismtank' : 'mirage')
                            : ((rnd() < 0.5 && canBuild(g, me, 'prismtank', false)) ? 'prismtank' : 'mirage'));
      var light = s.fac === 'col' ? 'flaktrack' : 'ifv';
      vpick = (hasBld(g, me, 'lab') && rnd() < (infHeavy ? 0.55 : 0.4) && canBuild(g, me, heavy, false)) ? heavy
            : (infHeavy && rnd() < 0.55 && canBuild(g, me, light, false)) ? light
            : F.tank;
    }
    if (canBuild(g, me, vpick, false)) enqueue(g, me, vpick, 'v');
    else if (s.fac === 'dir' && canBuild(g, me, 'prismtank', false) &&
             countUnit(g, me, 'prismtank') < 4) enqueue(g, me, 'prismtank', 'v');
  }
  // Aircraft lane: whatever the air team is short of, up to the pad count.
  // The naval lane. Same shape as the aircraft lane: whatever the fleet
  // teams are short of, capped so a yard never eats the land army's money.
  if (hasBld(g, me, 'shipyard') && !s.queues.n.list.length && s.credits > 1500 &&
      countUnit(g, me, null, 'n') < 8) {
    var navWant = pickFrom('n', null);
    if (navWant && canBuild(g, me, navWant, false)) enqueue(g, me, navWant, 'n');
    else {
      var fallback = s.fac === 'col' ? 'sub' : 'destroyer';
      if (canBuild(g, me, fallback, false)) enqueue(g, me, fallback, 'n');
    }
  }
  if (s.fac === 'dir' && !s.queues.a.list.length && s.credits > 1800) {
    var apick = pickFrom('a', 'air') || 'harrier';
    if (canBuild(g, me, apick, false)) enqueue(g, me, apick, 'a');
  }
}

// The AI's next superweapon: the cheaper one of its faction's pair first.
function aiSwWant(g, p) {
  var ks = swKeysFor(g.side[p].fac);
  for (var i = 0; i < ks.length; i++) {
    var key = SW[ks[i]].bld;
    if (!hasBld(g, p, key) && canBuild(g, p, key, true)) return key;
  }
  return null;
}

// Where a nuke or a storm hurts most. RA2 scores every cell by the
// AIIonCannon*Value of what stands in it: a War Factory is worth 100, a
// power plant 60, a base defence 35, a helipad/radar 20, the Construction
// Yard only 10, and a harvester or an MCV 1 — the AI aims at PRODUCTION,
// not at the biggest building. The blast is summed over its radius so a
// tight cluster still beats a lone factory.
export function aiSwValue(e) {
  if (e.kind !== 'b') return AI_SW_UNIT;
  var v = AI_SW_VALUE[e.type];
  return v == null ? AI_SW_DEFAULT : v;
}

export function aiSwTarget(g, foe) {
  var best = null, bs = -1, i, j;
  for (i = 0; i < g.blds.length; i++) {
    var b = g.blds[i];
    if (b.dead || b.p !== foe) continue;
    var score = 0;
    for (j = 0; j < g.blds.length; j++) {
      var o = g.blds[j];
      if (o.dead || o.p !== foe) continue;
      var d = Math.sqrt((o.cx - b.cx) * (o.cx - b.cx) + (o.cy - b.cy) * (o.cy - b.cy));
      if (d <= 4) score += aiSwValue(o) * (1 - d / 5);
    }
    for (j = 0; j < g.units.length; j++) {
      var un = g.units[j];
      if (un.dead || un.p !== foe) continue;
      var du = Math.sqrt((un.x - b.cx) * (un.x - b.cx) + (un.y - b.cy) * (un.y - b.cy));
      if (du <= 4) score += AI_SW_UNIT * (1 - du / 5);
    }
    if (score > bs) { bs = score; best = b; }
  }
  return best ? { x: best.cx, y: best.cy, b: best } : null;
}

function aiArmyCentre(army) {
  var n = 0, ax = 0, ay = 0;
  for (var i = 0; i < army.length; i++) {
    if (army[i].dead) continue;
    ax += army[i].x; ay += army[i].y; n++;
  }
  return n ? { x: ax / n, y: ay / n } : null;
}

// The team that is doing the pushing, if any: the Iron Curtain goes over it
// and the Chronosphere drops it on the far side of the defence line.
function aiSpearhead(ai) {
  var best = null;
  for (var i = 0; i < ai.teams.length; i++) {
    var t = ai.teams[i];
    if (t.def.prod || t.mode !== 'attack' || !t.units.length) continue;
    if (!best || t.units.length > best.units.length ||
        (t.def.role === 'siege' && best.def.role !== 'siege')) best = t;
  }
  return best;
}

function aiSuper(g, ai, me, foe) {
  var s = g.side[me];
  if (!s.sw.nuke.ready && !s.sw.storm.ready && !s.sw.curtain.ready && !s.sw.chrono.ready) return;
  var hit = aiSwTarget(g, foe);
  if (hit && s.sw.nuke.ready) swFire(g, me, 'nuke', hit.x, hit.y);
  if (hit && s.sw.storm.ready) swFire(g, me, 'storm', hit.x, hit.y);
  // The Iron Curtain goes over the wave at the moment it commits, and the
  // Chronosphere drops that same wave next to the enemy defence line.
  var spear = aiSpearhead(ai);
  var army = spear ? spear.units : (ai.army || []);
  if (!spear && ai.posture !== 'attack') return;
  if (army.length < 4) return;
  var c = aiArmyCentre(army);
  if (!c) return;
  if (s.sw.curtain.ready) swFire(g, me, 'curtain', c.x, c.y);
  if (s.sw.chrono.ready) {
    // A siege team that is still walking gets chrono'd to the edge of its
    // own reach of the target; otherwise the old refinery drop.
    var land = null;
    if (spear && spear.def.role === 'siege') {
      var st = entById(g, spear.tgt);
      if (st && dist({ x: c.x, y: c.y }, st) > 16) {
        var sx0 = st.kind === 'b' ? st.cx : st.x, sy0 = st.kind === 'b' ? st.cy : st.y;
        var vx = g.start[me].x - sx0, vy = g.start[me].y - sy0, vl = Math.sqrt(vx * vx + vy * vy) || 1;
        land = { x: Math.round(sx0 + vx / vl * 8), y: Math.round(sy0 + vy / vl * 8) };
      }
    }
    if (!land) {
      var ref = findRefinery(g, foe, g.start[me].x, g.start[me].y);
      if (ref) {
        var dx = g.start[me].x - ref.cx, dy = g.start[me].y - ref.cy;
        var dl = Math.sqrt(dx * dx + dy * dy) || 1;
        land = { x: Math.round(ref.cx + dx / dl * 3.5), y: Math.round(ref.cy + dy / dl * 3.5) };
      }
    }
    if (land && inMap(land.x, land.y)) swFire(g, me, 'chrono', c.x, c.y, land.x, land.y);
  }
}

// How boxed-in a footprint would be: blocked tiles in the ring around it.
function crowding(g, gx, gy, d) {
  var n = 0;
  for (var y = gy - 1; y <= gy + d.gh; y++) {
    for (var x = gx - 1; x <= gx + d.gw; x++) {
      if (x >= gx && x < gx + d.gw && y >= gy && y < gy + d.gh) continue;
      if (x < 0 || y < 0 || x >= MAP || y >= MAP || blocked(g, x, y)) n++;
    }
  }
  return n;
}

function aiPlace(g, ai, me, foe) {
  var s = g.side[me];
  var rl = readyLane(s), key = s.queues[rl].ready;
  var d = bspecFor(key, keyFac(g, me, key, true));   // per-faction Foundation=
  var home = g.start[me];
  // Turrets go toward the enemy; everything else hugs the base.
  var aim = (key === 'sentry' || key === 'tesla' || key === 'sentrygun' || key === 'prism')
    ? { x: (home.x * 0.62 + g.start[foe].x * 0.38), y: (home.y * 0.62 + g.start[foe].y * 0.38) }
    : home;

  var best = null, bd = 1e9;
  // Two passes: first only spots with a clear one-tile gap all round (how a
  // human lays out an RA2 base — roads between buildings, units can leave),
  // then, if the base has grown into its walls, anything not too crowded.
  // The ring searched has to grow with the footprint: a 5x3 War Factory that
  // wants a clear one-tile skirt needs a 7x5 hole, and at the old radius 14
  // a mature base simply ran out of legal spots and started refunding its
  // own production (`placeFail` -> cancelLast), which reads as an AI that
  // stopped building. Radius scales with the plot's longest side.
  var rMax = 14 + 2 * Math.max(d.gw, d.gh);
  for (var pass = 0; pass < 2 && !best; pass++)
  for (var r = 1; r < rMax; r++) {
    for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      var gx = Math.round(home.x + ox), gy = Math.round(home.y + oy);
      if (!canPlace(g, me, key, gx, gy)) continue;
      // Packing structures shoulder to shoulder walls the AI's own army
      // inside its own base — measured: 33 of one side's infantry frozen
      // behind its own buildings, and the match a stalemate because the
      // attack could never leave home. Half the ring around a footprint
      // must stay open. This is a hard rule, not a preference: a preference
      // still seals the base once the good tiles are gone.
      var ring = 2 * (d.gw + 2) + 2 * d.gh;
      var crowd = crowding(g, gx, gy, d);
      // A `WaterBound=yes` plot is surrounded by water, which `crowding`
      // scores as solid — the yard would never pass either sieve. Its
      // placement rule IS canPlace (all water, one shore cell).
      if (!d.water && (pass === 0 ? crowd > 0 : crowd > ring * 0.35)) continue;
      if (d.water) crowd = 0;
      var dd = (gx - aim.x) * (gx - aim.x) + (gy - aim.y) * (gy - aim.y);
      // Breathing room reads as a base, not a pile: every blocked tile
      // touching the footprint costs as much as being ~2.5 tiles further out.
      dd += crowd * 6;
      // Refineries want to be near ore, not near the middle of the base.
      if (key === 'refinery') {
        var ore = findOre(g, gx, gy, 16);
        dd = ore ? (gx - ore.x) * (gx - ore.x) + (gy - ore.y) * (gy - ore.y) : dd + 400;
      }
      if (dd < bd) { bd = dd; best = { x: gx, y: gy }; }
    }
    if (best && r > 5) break;
  }
  if (best) {
    placeBld(g, key, me, best.x, best.y);
    s.queues[rl].ready = null;
    if (key === 'refinery') {
      var sp = freeTileNear(g, best.x, best.y + d.gh + 1);
      if (sp) spawnUnit(g, 'harvester', me, sp.x, sp.y);
    }
    ai.placeFail = 0;
  } else if (++ai.placeFail > 8) {
    // Nowhere to put it. A ready building blocks the WHOLE structure lane
    // (`aiProduce` only queues when that lane's `ready` is clear), so a base that has
    // run out of room would stop building anything at all — for the rest of
    // the match. Give the credits back and let the ladder pick again; by
    // then something may have died, or it will choose a smaller footprint.
    cancelLast(g, me, rl, key);
    ai.placeFail = 0;
  }
}

// ---- ScriptTypes: what a team's script points it at ------------------- //
// RA2's scripts pick a target CLASS, not a building: "Attack Nearest
// Target: base defenses / power / factories / harvesters". `from` is the
// team's own centre, so "nearest" means nearest to the team.
// [General] AINavalYardAdjacency=20 — how far from its Construction Yard
// the AI will look for water to put a Shipyard on. It is also the test for
// "is this a map where a navy is worth anything at all": no shore inside
// that radius and the naval half of the build ladder never runs.
export var AI_NAVAL_ADJ = 20;

// The nearest cell of open water to (x,y), out to `r`. Used both for
// "can we build a yard here" and for pointing a fleet at a shore target.
// `zone`, when given, restricts the answer to ONE body of water — the body
// the asking hull is already floating in. `undefined` means any water, so
// the placement caller ("is there a shore near the Construction Yard") is
// unchanged.
export function nearestWater(g, x, y, r, zone) {
  for (var rr = 0; rr <= r; rr++) {
    for (var oy = -rr; oy <= rr; oy++) for (var ox = -rr; ox <= rr; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== rr) continue;
      var nx = Math.round(x) + ox, ny = Math.round(y) + oy;
      if (!inMap(nx, ny) || g.terrain[idx(nx, ny)] !== T_WATER) continue;
      if (zone && g.wzone[idx(nx, ny)] !== zone) continue;
      return { x: nx, y: ny };
    }
  }
  return null;
}

export function hasShore(g, p) { return !!nearestWater(g, g.start[p].x, g.start[p].y, AI_NAVAL_ADJ); }

var AI_DEF_KEYS = { sentry: 1, sentrygun: 1, tesla: 1, prism: 1, patriot: 1, flakcannon: 1, grandcannon: 1 };

var AI_POWER_KEYS = { power: 1, reactor: 1 };

var AI_PROD_KEYS = { factory: 1, barracks: 1, airforce: 1, radar: 1, lab: 1, base: 1 };

export function aiPickTarget(g, ai, me, foe, cls, from) {
  var i, best = null, bd = 1e9;
  cls = cls || 'any';
  var fx = from ? from.x : g.start[me].x, fy = from ? from.y : g.start[me].y;
  // 'coast': a target a hull can actually shoot — one with open water
  // within a Destroyer's reach of it. Falls back to 'any' if the enemy has
  // nothing on the waterfront at all.
  if (cls === 'coast') {
    var cbest = null, cbd = 1e9;
    for (var ci2 = 0; ci2 < g.blds.length; ci2++) {
      var cb2 = g.blds[ci2];
      if (cb2.dead || cb2.p !== foe) continue;
      if (!nearestWater(g, cb2.cx, cb2.cy, 8)) continue;
      var cdd = (cb2.cx - fx) * (cb2.cx - fx) + (cb2.cy - fy) * (cb2.cy - fy);
      if (cdd < cbd) { cbd = cdd; cbest = cb2; }
    }
    if (cbest) return cbest;
    cls = 'any';
  }
  function nearer(e) {
    var ex = e.kind === 'b' ? e.cx : e.x, ey = e.kind === 'b' ? e.cy : e.y;
    var dd = (ex - fx) * (ex - fx) + (ey - fy) * (ey - fy);
    if (dd < bd) { bd = dd; best = e; }
  }
  if (cls === 'harvester' || (cls === 'any' && ai.cfg.harass && rnd() < 0.35)) {
    for (i = 0; i < g.units.length; i++) {
      var h = g.units[i];
      if (!h.dead && h.p === foe && isHarv(h)) nearer(h);
    }
    if (best) return best;
  }
  if (cls === 'defence' || cls === 'power' || cls === 'production') {
    var set = cls === 'defence' ? AI_DEF_KEYS : cls === 'power' ? AI_POWER_KEYS : AI_PROD_KEYS;
    for (i = 0; i < g.blds.length; i++) {
      var db = g.blds[i];
      if (db.dead || db.p !== foe || !set[db.type]) continue;
      nearer(db);
    }
    if (best) return best;
    // A siege team that has flattened the defence line moves on to the
    // power grid, then to production — RA2's scripts chain the same way.
    if (cls === 'defence') return aiPickTarget(g, ai, me, foe, 'power', from);
    if (cls === 'power') return aiPickTarget(g, ai, me, foe, 'production', from);
  }
  // The refineries: what a Nighthawk squad is put down next to.
  if (cls === 'economy') {
    for (i = 0; i < g.blds.length; i++) {
      var eb = g.blds[i];
      if (!eb.dead && eb.p === foe && eb.type === 'refinery') nearer(eb);
    }
    if (best) return best;
  }
  if (cls === 'nearest') {
    for (i = 0; i < g.blds.length; i++) {
      var nb = g.blds[i];
      if (nb.dead || nb.p !== foe || BLDS[nb.type].wall) continue;
      nearer(nb);
    }
    if (best) return best;
  }
  var pref = ['factory', 'barracks', 'refinery', 'power', 'reactor', 'base', 'lab', 'airforce', 'radar', 'purifier', 'depot', 'sentry', 'sentrygun', 'prism', 'tesla', 'patriot', 'flakcannon'];
  for (var pi = 0; pi < pref.length; pi++) {
    for (i = 0; i < g.blds.length; i++) {
      var b = g.blds[i];
      if (!b.dead && b.p === foe && b.type === pref[pi]) return b;
    }
  }
  // Anything else still standing (a type added later must never stall the AI).
  for (i = 0; i < g.blds.length; i++) if (!g.blds[i].dead && g.blds[i].p === foe && !BLDS[g.blds[i].type].wall) return g.blds[i];
  return null;
}

// Move a group to a point without stacking it on one tile: each unit gets
// its own passable tile on a spiral around the target (the soak found 34
// units parked on one staging tile, all sharing an identical order).
// Where a fleet gathers: the water nearest the land staging point.
function aiNavalStage(g, me, foe, zone) {
  var st = aiStaging(g, me, foe);
  return nearestWater(g, st.x, st.y, AI_NAVAL_ADJ + 6, zone) ||
         (zone ? nearestWater(g, st.x, st.y, AI_NAVAL_ADJ + 6) : null) || st;
}

// The body of water a naval task force is actually in — its first hull's.
function teamZone(g, t) {
  for (var i = 0; i < t.units.length; i++) {
    var u = t.units[i];
    if (u && !u.dead && UNITS[u.type].nav && !UNITS[u.type].amph) {
      var z = hullZone(g, u); if (z) return z;
    }
  }
  return 0;
}

function aiMoveSpread(g, units, at) {
  var taken = {};
  for (var i = 0; i < units.length; i++) {
    var u = units[i]; if (!u || u.dead) continue;
    // A hull ordered into a body of water it is not in never arrives, and
    // the order is re-issued on the next tactical pass — the churn the soak
    // saw as 419 B1-stuck flags in one match. Leave it where it is instead.
    var zone = 0;
    if (UNITS[u.type].nav && !UNITS[u.type].amph) {
      zone = hullZone(g, u);
      if (zone && !navReach(g, u, at.x, at.y, 3)) continue;
    }
    var sp = spreadSpot(g, at.x, at.y, taken, moverOf(u), zone), tx = sp.x, ty = sp.y;
    u.order = { t: 'move', x: tx, y: ty, id: 0 };
    u.guardX = tx; u.guardY = ty; u.repathAt = -999;
    requestPath(g, u, tx, ty);
  }
}

function aiStaging(g, me, foe) {
  var home = g.start[me], ft = g.start[foe];
  return { x: Math.round(home.x * 0.88 + ft.x * 0.12), y: Math.round(home.y * 0.88 + ft.y * 0.12) };
}

// Orders are rationed by difficulty. A low-APM AI cannot re-task every unit
// every pass, so its big armies drift — a genuine command weakness rather
// than an invented stat penalty.
function aiBudget(cfg) { return Math.max(3, Math.round(cfg.apm * cfg.react / 60)); }

function aiOrderAttack(g, u, tgt) {
  var tx = tgt.kind === 'b' ? tgt.cx : tgt.x, ty = tgt.kind === 'b' ? tgt.cy : tgt.y;
  // A hull cannot drive up the beach at what it is shooting. Point it at
  // the nearest water to the target instead and let its guns reach ashore
  // from there — which is how a bombardment works and why a Dreadnought's
  // 25-cell missile matters. The attack ORDER still names the target, so it
  // fires the moment the shore comes inside its reach.
  if (UNITS[u.type].nav && !UNITS[u.type].amph &&
      (tgt.kind === 'b' || !UNITS[tgt.type].nav) && !isAir(tgt)) {
    if (u.navHold && g.tick < u.navHold) return;   // it just proved it cannot get there
    // Water THIS hull can reach: a bay on the far side of a spit is not a
    // firing position, it is fourteen minutes of re-issued orders.
    var w = nearestWater(g, tx, ty, 14, hullZone(g, u));
    if (!w) return;                            // nothing afloat can reach it: leave the hull on station
    tx = w.x; ty = w.y;
  }
  u.order = { t: 'attack', x: tx, y: ty, id: tgt.id };
  u.guardX = tx; u.guardY = ty;
}

// A wall in the way is shot, not walked around: a unit that has been making
// no progress with an enemy wall segment beside it re-aims at the wall.
// (RA2's warheads carry Wall=yes for exactly this.)
function aiClearWall(g, u, me, foe) {
  if (u.noProg < 90) return false;
  var bx = Math.round(u.x), by = Math.round(u.y);
  for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
    var x = bx + ox, y = by + oy;
    if (!inMap(x, y)) continue;
    var id = g.occ[y * MAP + x];
    if (!id) continue;
    var b = g.byId[id];
    if (!b || b.dead || b.kind !== 'b' || b.p !== foe || !BLDS[b.type].wall) continue;
    aiOrderAttack(g, u, b);
    return true;
  }
  return false;
}

// RA2's AI does two things with the neutral house that ours did not: it
// puts riflemen into the city blocks around its own base when it is on the
// back foot, and it sends spare Engineers to the nearest uncaptured tech
// building. Both are cheap, both are checked once a second.
//
// Engineer priority is ai.ini's: the Oil Derrick first (it is the only one
// that pays), then the other tech buildings, then a bridge repair hut, then
// one of our own damaged structures, and last an enemy structure nobody is
// standing near.
function aiNeutrals(g, ai, me, foe, defending) {
  if ((g.tick % 60) !== (me * 17) % 60) return 0;
  var i, used = 0, base = null;
  for (i = 0; i < g.blds.length && !base; i++) {
    var hb = g.blds[i];
    if (!hb.dead && hb.p === me && hb.type === 'base') base = hb;
  }
  if (!base) return 0;
  function guarded(b) {
    for (var k = 0; k < g.units.length; k++) {
      var e = g.units[k];
      if (e.dead || e.p !== foe || UNITS[e.type].dmg <= 0) continue;
      if (dist(e, b) < 8) return true;
    }
    for (k = 0; k < g.blds.length; k++) {
      var d = g.blds[k];
      if (d.dead || d.p !== foe || !BLDS[d.type].dmg) continue;
      if (dist(d, b) < 9) return true;
    }
    return false;
  }
  for (i = 0; i < g.units.length; i++) {
    var eu = g.units[i];
    if (eu.dead || eu.p !== me || !UNITS[eu.type].capture || eu.order) continue;
    var tb = null, tscore = -1;
    for (var j = 0; j < g.blds.length; j++) {
      var nb = g.blds[j], sc = -1;
      if (nb.dead) continue;
      var nd = BLDS[nb.type];
      if (nd.tech && nb.p !== me) sc = (nb.type === 'oilderrick' ? 400 : 250);
      else if (nd.hut) sc = 120;
      else if (nb.p === me && nb.hp < nb.maxhp * 0.6 && !nd.hut) sc = 100;
      else if (nb.p === foe && !nd.wall && !guarded(nb)) sc = 60;
      if (sc < 0) continue;
      var dd = dist(eu, nb);
      if (dd > 40) continue;
      // Never send an Engineer past the far side of the map for a building
      // we cannot hold: an enemy structure has to be inside our reach.
      if (nb.p === foe && dist(nb, { x: g.start[me].x, y: g.start[me].y, kind: 'u' }) > 34) continue;
      sc -= dd;
      if (sc > tscore) { tscore = sc; tb = nb; }
    }
    if (!tb) continue;
    eu.order = { t: 'capture', x: 0, y: 0, id: tb.id }; eu.repathAt = -999;
    requestPath(g, eu, Math.round(tb.cx), Math.round(tb.cy));
    used++;
  }
  if (!defending) return used;
  // ---- Garrison: fill the blocks near home with Occupiers, two apiece,
  // rather than leaving them for the attacker to shoot from.
  for (i = 0; i < g.blds.length; i++) {
    var cb = g.blds[i];
    if (cb.dead || !BLDS[cb.type].occCap) continue;
    if (dist(cb, base) > 18) continue;
    if (!garrisonable(g, cb, me) || occCount(cb) >= Math.min(2, occCapOf(cb))) continue;
    for (var k2 = 0; k2 < g.units.length; k2++) {
      var mu = g.units[k2];
      if (mu.dead || mu.p !== me || !canOccupy(mu.type)) continue;
      if (mu.order && mu.order.t === 'garrison') continue;
      if (dist(mu, cb) > 22) continue;
      mu.order = { t: 'garrison', x: 0, y: 0, id: cb.id }; mu.repathAt = -999;
      mu.guard = false; mu.stopped = false;
      requestPath(g, mu, Math.round(cb.cx), Math.round(cb.cy));
      used++;
      break;
    }
  }
  return used;
}

// A minor superweapon this close to charged is already in RA2's trigger
// list, so a full team waits a moment rather than leaving without it.
function aiMinorSuperSoon(g, me) {
  var s = g.side[me], ks = ['curtain', 'chrono'];
  for (var i = 0; i < ks.length; i++) {
    var sw = s.sw[ks[i]], spec = SW[ks[i]];
    if (!sw || sw.ready || !hasBld(g, me, spec.bld)) continue;
    var f = sw.t / spec.charge;
    if (f >= AI_MINOR_SUPER_READY && (spec.charge - sw.t) < 900) return true;
  }
  return false;
}

function aiTactics(g, ai, me, foe) {
  var cfg = ai.cfg;
  ai.army = aiArmy(g, me);
  var i, j, u, t, budget = aiBudget(cfg);

  // ---- teams: prune the dead, recruit the new
  for (i = ai.teams.length - 1; i >= 0; i--) {
    t = ai.teams[i];
    t.units = t.units.filter(function (w) { return w && !w.dead; });
    if (!t.def.prod && t.launched && !t.units.length) {
      aiRec(ai, t.def.key, AI_TRIG_LOSS);            // AITriggerFailureWeightDelta
      aiReleaseTeam(ai, t); ai.failed++; ai.lastFail = g.tick;
    }
  }
  aiRecruit(g, ai, me);

  // Which units are committed to an attack: everything else is the home
  // guard and answers a raid.
  var busy = {}, attacking = 0;
  for (i = 0; i < ai.teams.length; i++) {
    t = ai.teams[i];
    if (t.def.prod || t.def.role === 'defend') continue;
    if (t.mode !== 'attack') continue;
    attacking++;
    for (j = 0; j < t.units.length; j++) busy[t.units[j].id] = 1;
  }
  ai.attacking = attacking > 0;
  var spear = aiSpearhead(ai);
  ai.wave = spear ? spear.units : [];
  ai.waveN = spear ? spear.n0 : 0;
  ai.waveTarget = spear ? spear.tgt : 0;

  // ---- defending our own base outranks any push
  // "Our base" is the buildings around the start position, not every
  // structure we own: an Engineer capture on the far side of the map used to
  // read as a raid on the homeland and marched the entire production line
  // across the field to die (measured: 247 GIs killed at the enemy's door in
  // eight minutes). AISafeDistance=20 is the radius RA2 uses for the same
  // "is this near the base" question.
  var homeC = g.start[me], threat = null;
  for (i = 0; i < g.units.length && !threat; i++) {
    var e = g.units[i];
    if (e.dead || e.p !== foe || UNITS[e.type].dmg <= 0) continue;
    for (j = 0; j < g.blds.length; j++) {
      var b = g.blds[j];
      if (b.dead || b.p !== me) continue;
      var bhx = b.cx - homeC.x, bhy = b.cy - homeC.y;
      if (bhx * bhx + bhy * bhy > AI_SAFE_DISTANCE * AI_SAFE_DISTANCE) continue;
      if (dist(e, b) < 16) { threat = e; break; }
    }
  }
  aiNeutrals(g, ai, me, foe, !!threat);
  if (threat) {
    var answered = 0;
    for (i = 0; i < ai.army.length && budget > 0; i++) {
      if (busy[ai.army[i].id]) continue;                       // do not recall a live push
      if (!canHit(UNITS[ai.army[i].type], threat, ai.army[i])) continue;   // a tank cannot answer a Kirov
      aiOrderAttack(g, ai.army[i], threat); budget--; answered++;
    }
    if (answered) return;
    if (!attacking && !isAir(threat)) return;
  }

  // ---- Harrier strikes: every pad full and rearmed launches at the
  // enemy's economy (a harvester, then a refinery), RA2-AI style.
  var mayAttackAir = ai.t > cfg.opening;
  var ready = [], planes = 0;
  for (i = 0; i < g.units.length; i++) {
    u = g.units[i];
    if (u.dead || u.p !== me || !UNITS[u.type].ammo) continue;
    planes++;
    if (u.landed && u.ammo >= UNITS[u.type].ammo && !u.order) ready.push(u);
  }
  // The air arm is bound by the same opening grace as the ground teams:
  // ai.ini gates its Harrier TeamTypes through AITriggerTypes like every
  // other attack, and an easy AI that bombs your miners at three minutes
  // while it "has not started attacking yet" reads as a cheat.
  if (mayAttackAir && ready.length && ready.length >= Math.min(planes, cfg.harass ? 2 : 4)) {
    var st = null;
    for (i = 0; i < g.units.length && !st; i++) { var hv = g.units[i]; if (!hv.dead && hv.p === foe && isHarv(hv)) st = hv; }
    for (i = 0; i < g.blds.length && !st; i++) { var rb = g.blds[i]; if (!rb.dead && rb.p === foe && rb.type === 'refinery') st = rb; }
    if (!st) st = aiPickTarget(g, ai, me, foe, 'production');
    if (st) for (i = 0; i < ready.length && budget > 0; i++, budget--) aiOrderAttack(g, ready[i], st);
  }

  // ---- run every team's script
  var stage = aiStaging(g, me, foe);
  var mayAttack = ai.t > cfg.opening;
  for (i = 0; i < ai.teams.length && budget > 0; i++) {
    t = ai.teams[i];
    if (t.def.prod || !t.units.length) continue;
    budget = aiRunTeam(g, ai, me, foe, t, stage, mayAttack, budget);
  }

  // ---- Reinforce=yes: the loose pool joins the push
  // ai.ini sets Reinforce on the offensive TeamTypes, and RA2's own "Big
  // Team" task forces are three times the size of its opening ones. Our
  // economy fields far more units than one task force, so a spearhead that
  // is already moving absorbs the fighters standing at the staging point —
  // capped by `wave`, which is what makes an easy AI attack in eights and a
  // hard one in one mass. A quarter of the loose pool always stays home: a
  // base with nothing in it is free to raid.
  var spear2 = aiSpearhead(ai);
  if (spear2 && spear2.def.role !== 'harass' && (ai.posture === 'attack' || ai.siege)) {
    var held = {}, loosePool = [];
    for (i = 0; i < ai.teams.length; i++) {
      if (ai.teams[i].def.prod) continue;
      for (j = 0; j < ai.teams[i].units.length; j++) held[ai.teams[i].units[j].id] = 1;
    }
    for (i = 0; i < ai.army.length; i++) {
      u = ai.army[i];
      if (u.dead || held[u.id] || u === ai.scout) continue;
      loosePool.push(u);
    }
    var keepHome = Math.max(2, Math.round(loosePool.length * 0.25));
    var room = Math.max(0, (cfg.wave || 999) - spear2.units.length);
    var join = loosePool.slice(keepHome, keepHome + room);
    if (join.length) {
      for (i = 0; i < join.length; i++) spear2.units.push(join[i]);
      spear2.n0 = spear2.units.length;
      var jt = entById(g, spear2.tgt);
      if (jt) for (i = 0; i < join.length && budget > 0; i++, budget--) aiOrderAttack(g, join[i], jt);
    }
  }

  // ---- everything not in a team holds the base
  var home = g.start[me];
  var claimed = {};
  for (i = 0; i < ai.teams.length; i++) {
    if (ai.teams[i].def.prod) continue;
    for (j = 0; j < ai.teams[i].units.length; j++) claimed[ai.teams[i].units[j].id] = 1;
  }
  ai.garrison = [];
  var toStage = [], tileN = {};
  for (i = 0; i < ai.army.length; i++) {
    u = ai.army[i];
    if (u.dead || u.air || u.order || claimed[u.id]) continue;
    var tk = Math.round(u.x) + ',' + Math.round(u.y);
    tileN[tk] = (tileN[tk] || 0) + 1;
  }
  for (i = 0; i < ai.army.length; i++) {
    u = ai.army[i];
    if (u === ai.scout || claimed[u.id] || u.air) continue;
    ai.garrison.push(u);
    if (u.order) continue;
    var dd = Math.sqrt((u.x - stage.x) * (u.x - stage.x) + (u.y - stage.y) * (u.y - stage.y));
    if (dd > 4 || tileN[Math.round(u.x) + ',' + Math.round(u.y)] >= 3) toStage.push(u);
  }
  if (toStage.length) aiMoveSpread(g, toStage, stage);
}

// One team's script. RA2 writes these as a list of ScriptTypes actions —
// "Gather at enemy base", "Attack nearest target", "Move to waypoint" — and
// ours is the same shape: fill, gather at the staging point, attack a target
// class, retreat when the team has been broken.
function aiRunTeam(g, ai, me, foe, t, stage, mayAttack, budget) {
  var cfg = ai.cfg, i, u;
  var def = t.def;
  // A fleet musters ON THE WATER, in the body its own hulls are floating
  // in. The land staging point it used to be handed is a beach: every hull
  // sent there re-pathed for the rest of the match.
  if (def.naval) stage = aiNavalStage(g, me, foe, teamZone(g, t));
  // Defensive teams never leave: they sit between the base and the enemy
  // and are re-posted whenever they drift.
  if (def.role === 'defend') {
    var post = { x: Math.round(g.start[me].x * 0.80 + g.start[foe].x * 0.20),
                 y: Math.round(g.start[me].y * 0.80 + g.start[foe].y * 0.20) };
    var stray = [];
    for (i = 0; i < t.units.length; i++) {
      u = t.units[i];
      if (u.order) continue;
      var pd = Math.sqrt((u.x - post.x) * (u.x - post.x) + (u.y - post.y) * (u.y - post.y));
      if (pd > 6) stray.push(u);
    }
    if (stray.length && budget > 0) { aiMoveSpread(g, stray, post); budget -= stray.length; }
    return budget;
  }
  // ai.ini writes Full=no on nearly every attack TeamType: a team runs its
  // script as soon as it is worth running, and stragglers join later. Ours
  // waits for the full task force while it is fresh, then goes with what it
  // has once a TeamDelays pass has come and gone.
  var size = 0;
  for (i = 0; i < def.force.length; i++) size += def.force[i].n;
  var enough = t.loaded || aiTeamFull(t) ||
               (t.units.length >= Math.ceil(size * 0.6) && g.tick - t.born > cfg.teamDelay);
  if (!enough && !t.launched) {
    // Still filling: hold what we have at the staging point.
    var wait = [];
    for (i = 0; i < t.units.length; i++) if (!t.units[i].order) wait.push(t.units[i]);
    if (wait.length && budget > 0) {
      var far = [];
      for (i = 0; i < wait.length; i++) {
        var wd = Math.sqrt((wait[i].x - stage.x) * (wait[i].x - stage.x) + (wait[i].y - stage.y) * (wait[i].y - stage.y));
        if (wd > 5) far.push(wait[i]);
      }
      if (far.length) { aiMoveSpread(g, far, stage); budget -= far.length; }
    }
    return budget;
  }
  // Mount up. Every man who has a seat gets an Enter order; a Nighthawk in
  // the force sets down so they can reach it. The team is `loaded` once
  // nobody is still walking to a hull, or once it has waited long enough —
  // whoever missed the ride simply marches with it.
  if (def.mech && !t.loaded) {
    var trs = [], inf = [], k2, waiting = false;
    for (i = 0; i < t.units.length; i++) {
      u = t.units[i];
      if (paxCapOf(u)) trs.push(u); else inf.push(u);
    }
    for (i = 0; i < inf.length; i++) {
      u = inf[i];
      if (u.order && u.order.t === 'enter') { waiting = true; continue; }
      var ride = null;
      for (k2 = 0; k2 < trs.length; k2++) {
        var pend = 0, pj;
        for (pj = 0; pj < inf.length; pj++)
          if (inf[pj].order && inf[pj].order.t === 'enter' && inf[pj].order.id === trs[k2].id) pend++;
        if (canBoard(g, trs[k2], u) && paxCount(trs[k2]) + pend < paxCapOf(trs[k2])) { ride = trs[k2]; break; }
      }
      if (!ride) continue;
      u.order = { t: 'enter', x: 0, y: 0, id: ride.id }; u.repathAt = -999; u.path = null;
      u.guard = false; u.stopped = false;
      requestPath(g, u, Math.round(ride.x), Math.round(ride.y));
      if (ride.air) { ride.landReq = 1; ride.order = null; ride.path = null; }
      waiting = true; budget--;
    }
    if (waiting && g.tick - t.born < cfg.dissolve) return budget;
    t.loaded = 1;
    t.units = t.units.filter(function (x) { return x && !x.dead; });
    t.n0 = t.units.length;
    for (i = 0; i < t.units.length; i++) if (t.units[i].air) t.units[i].landReq = 0;
    if (!t.units.length) { aiReleaseTeam(ai, t); return budget; }
  }
  if (!t.launched) {
    if (!mayAttack) return budget;
    // A filled task force still has to be worth committing. RA2's
    // AITriggerTypes carry their own comparison conditions; ours is the
    // posture ladder, which weighs our army against theirs PLUS their
    // defence line. Launching on "the team is full" alone threw 41 units
    // into an easy AI at seven minutes and lost 29 of them in one crossing.
    // A siege force is the exception — it out-ranges the defence line, so
    // the value comparison that holds a line company back does not apply —
    // and so is a raid, which is meant to be small and annoying.
    if (def.role === 'attack' && ai.posture !== 'attack') return budget;
    if (def.role === 'siege' && ai.posture !== 'attack' && !ai.siege) return budget;
    // AIMinorSuperReadyPercent: an Iron Curtain or a Chronosphere about to
    // finish charging is worth thirty seconds of waiting.
    if (aiMinorSuperSoon(g, me) && g.tick - t.born < 60 * 60) return budget;
    t.launched = g.tick; t.n0 = t.units.length; t.mode = 'attack';
  }
  if (t.mode === 'retreat') {
    var home2 = def.naval ? aiNavalStage(g, me, foe, teamZone(g, t)) : aiStaging(g, me, foe);
    var back = [];
    for (i = 0; i < t.units.length; i++) if (!t.units[i].order) back.push(t.units[i]);
    if (back.length) { aiMoveSpread(g, back, home2); budget -= back.length; }
    if (g.tick - t.retreatAt > 900) aiReleaseTeam(ai, t);
    return budget;
  }
  // Broken: pull the survivors out and count the failure. Feeding
  // replacements into a dead attack one at a time is how this AI once lost
  // 129 units without taking a single building.
  if (t.units.length < t.n0 * cfg.give) {
    t.mode = 'retreat'; t.retreatAt = g.tick;
    aiRec(ai, t.def.key, AI_TRIG_LOSS);              // AITriggerFailureWeightDelta
    ai.failed++; ai.lastFail = g.tick;
    aiMoveSpread(g, t.units, aiStaging(g, me, foe));
    return budget - t.units.length;
  }
  var centre = aiArmyCentre(t.units) || stage;
  var cur = entById(g, t.tgt);
  if (t.tgt && (!cur || cur.dead) && t.units.length) {
    aiRec(ai, def.key, AI_TRIG_WIN);                  // AITriggerSuccessWeightDelta
  }
  if (!cur || cur.dead) cur = aiPickTarget(g, ai, me, foe, def.tgt, centre);
  if (!cur) { aiReleaseTeam(ai, t); return budget; }
  t.tgt = cur.id;
  for (i = 0; i < t.units.length && budget > 0; i++, budget--) {
    u = t.units[i];
    // Close enough: the doors open. A Nighthawk touches down first (RA2's
    // BlackHawk cannot unload in the air); a halftrack just stops and drops.
    if (paxCount(u) && dist(u, cur) < (def.drop ? 6 : 3.5)) {
      if (UNITS[u.type].air) {
        u.landReq = 1; u.unloadReq = 1; u.order = null; u.path = null;
        continue;
      }
      var got = unloadTransport(g, u);
      for (var gi = 0; gi < got.length; gi++) t.units.push(got[gi]);
      continue;
    }
    // An empty transport with no gun of its own has nothing left to do at
    // the sharp end: it goes home rather than driving into a Tesla Coil.
    if (paxCapOf(u) && !paxCount(u) && !UNITS[u.type].dmg) {
      if (!u.order) aiMoveSpread(g, [u], aiStaging(g, me, foe));
      continue;
    }
    if (aiClearWall(g, u, me, foe)) continue;
    aiOrderAttack(g, u, cur);
  }
  return budget;
}
