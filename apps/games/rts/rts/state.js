// Iron Frontier — state.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { resetHash } from './combat.js';
import { labelWater } from './geom.js';
import { MAPS, computeGroundMat, computeHeight, genMap, indexBridges, placeNeutrals } from './mapgen.js';
import { netAttach } from './net.js';
import { normOpts } from './opts.js';
import { pathQ } from './path.js';
import { srand } from './rng.js';
import { swInit } from './supers.js';
import { MAP, P_AI, P_HUMAN } from './world.js';

// --------------------------------------------------------------------- //
//  Game state
// --------------------------------------------------------------------- //
export var G = null;            // the whole mutable match state

export var state = 'menu';      // menu | play | paused | over

export var difficulty = 'normal';

export var faction = 'dir';

export var headless = false;    // true inside __rtsSim (skips all rendering)

export function newState(seed, diff, mapId, opt) {
  srand(seed);
  pathQ.length = 0;                             // a previous match's pending path requests must not leak in
  // The spatial index is module-level and DERIVED, so every match has to
  // start it in the SAME condition — empty, with its rebuild clock unset —
  // whether or not a match has already been played. Left alone, `hashAt`
  // carried the previous match's final tick, which made simStep's `g.tick - hashAt >= 3` fire on tick 0 instead
  // of tick 2: from then on every rebuild in the second match landed on a
  // different tick PHASE, so near() read neighbour positions up to two ticks
  // stale in one run and fresh in the other. One separation vector differed
  // by 0.013 of a tile at 2:26 and the two matches ended differently. (The
  // arrays are also still holding the previous match's entities until the
  // first rebuild.) The reset is to HASH_UNSET rather than to -1 because -1
  // is one tick short of `>= 3`: it left the index EMPTY for ticks 0 and 1,
  // which is what a fresh page load used to do and a second match never did
  // — a Flak Track spawned at tick 0 acquired nothing until tick 2.
  resetHash();
  var g = {
    seed: seed, diff: diff, tick: 0, over: 0,   // over: 0 running, 1 won, -1 lost
    opt: normOpts(opt),                         // the skirmish strip, frozen into the match
    mapId: MAPS[mapId] ? mapId : 'frontier', theatre: (MAPS[mapId] || MAPS.frontier).theatre,
    terrain: new Uint8Array(MAP * MAP),
    ore: new Float32Array(MAP * MAP),
    occ: new Int32Array(MAP * MAP),             // entity id occupying a tile, 0 = free
    seen: new Uint8Array(MAP * MAP),            // shroud: tiles the human has ever had in sight
    units: [], blds: [], shots: [], fx: [], wrecks: [], rubble: [], storms: [], nukes: [], byId: {},
    crates: [], crateAt: 0,                     // [CrateRules] CrateMinimum / CrateRegen
    bridges: [], bwrk: new Uint8Array(MAP * MAP),   // spans + torn-deck memory
    bspan: new Int16Array(MAP * MAP),           // cell -> span index + 1, 0 = not a bridge
    wzone: new Int16Array(MAP * MAP),           // connected body of water per cell, 0 = dry (see labelWater)
    neut: [], drops: [], spread: 0, grow: 0,   // neutral spawn list, paradrops in flight,
                                                // and the ore SPREAD and GROWTH pass counters
                                                // (both feed hash3, so both must be state)
    // [Radiation]: a per-cell radiation LEVEL plus who put it there (kill
    // credit). `radAny` is the "is any cell hot" flag that keeps the whole
    // pass free when nothing on the map is irradiated, which is most of
    // every match.
    rad: new Float32Array(MAP * MAP), radOwn: new Int8Array(MAP * MAP), radAny: 0,
    // Height field, in LEVELS (not pixels). `hf` is the level at the cell
    // centre; `hgx`/`hgy` are its gradient across the cell, which is zero
    // everywhere except on a ramp -- that is what makes a unit climb
    // smoothly instead of popping a whole level at a tile boundary.
    hf: new Float32Array(MAP * MAP), hgx: new Float32Array(MAP * MAP), hgy: new Float32Array(MAP * MAP),
    hiAny: 0,                                   // does this map have any raised ground at all
    gm: new Uint8Array(MAP * MAP),              // 0 = the theatre's base ground, 1 = its ALT ground (LAT)
    bombs: [],                                  // entities carrying a live Ivan bomb
    flash: 0, mmFlash: null,                    // nuke whiteout + the minimap ping on an incoming superweapon
    nextId: 1,
    side: [ newSide(P_HUMAN), newSide(P_AI) ],
    focusFor: [true, true],
    ai: null, ai2: null
  };
  g.side[P_HUMAN].credits = g.side[P_AI].credits = g.opt.credits;   // "Starting credits"
  genMap(g);
  computeHeight(g);
  computeGroundMat(g);
  indexBridges(g);
  labelWater(g);
  placeNeutrals(g);
  // Every new game gets its own lockstep client (single-player loopback by
  // default) with an empty command schedule and its own derived caches.
  netAttach(g);
  return g;
}

function newSide(p) {
  return {
    p: p, fac: 'dir', credits: 10000, made: 0, lost: 0, killed: 0, deadFor: 0, exitTurn: 0,
    // RA2's score screen columns: structures raised and lost, and the ore
    // value actually banked (not the same as credits, which is spent).
    bmade: 0, blost: 0, bkilled: 0, harv: 0,
    powerMade: 0, powerUse: 0,
    blackout: 0,                                 // [General] SpyPowerBlackout — grid dead until this tick
    stolen: null, vetInf: false, vetVeh: false,  // what a Spy brought home
    queues: { b: newQueue(), d: newQueue(), i: newQueue(), v: newQueue(), a: newQueue(), n: newQueue() },
    pending: null,                               // a finished structure awaiting placement
    primary: { i: 0, v: 0, a: 0, n: 0 },               // building id that produces each lane (RA2 "primary")
    sw: swInit()                                 // superweapon charge timers, one per weapon
  };
}

function newQueue() { return { list: [], prog: 0, ready: null, paid: 0, hold: false, pause: false }; }

export function idx(x, y) { return y * MAP + x; }

export function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP && y < MAP; }

// --------------------------------------------------------------------- //
//  AI opponent
//
//  Layered on purpose: a strategy pass sets a posture, a production pass
//  turns that posture (plus what it has SEEN of our army) into build
//  orders, and a tactical pass moves the army. It reads the same world
//  every player does — no free credits, no map knowledge it did not scout.
// --------------------------------------------------------------------- //
// ===================================================================== //
//  AI — RA2's task-force / team-type layer
// ===================================================================== //
// Every number below is read off the real game: `rules.ini [General]` for
// the cadences and caps, `ai.ini` [TaskForces]/[ScriptTypes]/[TeamTypes]/
// [AITriggerTypes] for the compositions and the trigger weights.
//
// One conversion is deliberate and is NOT a straight copy. RA2 runs its
// logic at 15 frames per second; we run 60 ticks per second. TeamDelays is
// used here as TICKS, not multiplied by four: at 4x, hard's 3500 would be
// 3 m 53 s between team-creation passes and a 30-minute skirmish would see
// seven teams in total.  DissolveUnfilledTeamDelay is a TIMEOUT rather than
// a cadence, so there the real-world length is what matters and 5000 frames
// is converted properly (20 000 ticks, about five and a half minutes) — at
// 5000 ticks a 15-strong siege force was binned before it could ever fill.
// See docs/design-decisions.md.
export var DIFF = {
  // group = how many fighters it masses before committing. A LOW number is
  // a weakness, not a strength: it feeds units piecemeal into defences.
  // give = the fraction of a wave that must survive before it presses on.
  // focus: does it concentrate fire or just shoot the nearest thing. apm:
  // how many orders it can issue per tactical pass (a big army it cannot
  // command is a real weakness). opening: ticks of grace before it will
  // commit an attack at all. A human needs time to read the panel before
  // the first wave arrives; an AI that rushes a beginner at three minutes
  // is not "hard", it is unplayable.
  // wave / fact / bar: RA2's Easy and Medium AIs attack with small teams and
  // run one or two production buildings; only Brutal throws 40 units at
  // minute six (playtest pass 2: Normal killed a clean opening at 6:53).
  //
  // The RA2 [General] block, by difficulty (rules.ini lists most of these
  // hardest-first, a few easiest-first — each line says which):
  //   teamDelay  TeamDelays=2000,2500,3500                 (easy,med,hard)
  //   teamCap    TotalAITeamCap=30,30,30                   (hardest first)
  //   dissolve   DissolveUnfilledTeamDelay=5000            (flat)
  //   defMin/Max Minimum/MaximumAIDefensiveTeams=1,1,1 / 2,2,2
  //   defCount   Allied/SovietBaseDefenseCounts=25,20,6    (h,m,e)
  //   wallPct    AIPickWallDefensePercent=50,25,10         (h,m,e)
  //   purifiers  AIVirtualPurifiers=4,2,0                  (h,m,e)
  //   hate       AIHateDelays=30,50,70                     (hardest first)
  //   safeDist   AISafeDistance=20                         (flat)
  easy: {
    react: 72, apm: 22, focus: false, harass: false, group: 6, expand: 1,
    scoutEvery: 0, give: 0.30, opening: 60 * 600, wave: 8, fact: 1, bar: 1,
    teamDelay: 2000, teamCap: 30, dissolve: 20000, defMin: 1, defMax: 2,
    defCount: 6, wallPct: 10, purifiers: 0, hate: 70, attackTeams: 1, aicm: 0
  },
  normal: {
    react: 36, apm: 55, focus: true, harass: false, group: 9, expand: 2,
    // Playtest pass 3: with RA2's two virtual purifiers Normal out-harvested a
    // clean human opening 2:1 and killed it at 8:48. RA2's Medium is weak in
    // ways we do not copy (dumb scripts), so Normal gets no economy bonus, a
    // later first push and a smaller wave. Hard keeps the RA2 curve.
    scoutEvery: 1800, give: 0.40, opening: 60 * 480, wave: 12, fact: 2, bar: 2,
    teamDelay: 2500, teamCap: 30, dissolve: 20000, defMin: 1, defMax: 2,
    defCount: 20, wallPct: 25, purifiers: 0, hate: 50, attackTeams: 2, aicm: 0
  },
  hard: {
    react: 12, apm: 999, focus: true, harass: true, group: 10, expand: 3,
    scoutEvery: 1000, give: 0.45, opening: 60 * 165, wave: 999, fact: 4, bar: 4,
    teamDelay: 3500, teamCap: 30, dissolve: 20000, defMin: 1, defMax: 2,
    defCount: 25, wallPct: 50, purifiers: 4, hate: 30, attackTeams: 3, aicm: 400
  }
};

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function setG(v) { G = v; }
export function setDifficulty(v) { difficulty = v; }
export function setFaction(v) { faction = v; }
export function setHeadless(v) { headless = v; }
export function setState(v) { state = v; }
