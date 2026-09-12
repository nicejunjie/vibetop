// Iron Frontier — combat-tables.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

import { BLDS } from './blds.js';
import { armourOf, isDisguised } from './combat.js';
import { bfacOf, keyFac } from './factions.js';
import { isAir, isNaval, isSub } from './geom.js';
import { UNITS, ifvSpec } from './roster.js';
import { neutral } from './world.js';

// --------------------------------------------------------------------- //
//  Unit + structure tables.
//
//  Every field a unit/structure reads at runtime is declared in the
//  factory literals further down — this repo has been bitten twice by a
//  field read before it was ever assigned (`undefined <= 0` is false, so
//  the branch that would initialise it can never run).
// --------------------------------------------------------------------- //

// armour classes drive the counter triangle
// RA2 armour classes and warhead Verses (rules.ini): a hit deals
// damage * VERSES[warhead][target armour] / 100. Infantry are none/flak/plate,
// vehicles light/medium/heavy, structures wood/steel/concrete.
// rules.ini:19086 spells the column order out: "-vs- None, Flak, Plate //infantry
// / Light, Medium, Heavy //units / Wood, Steel, Concrete //buildings /
// Special_1, Special_2". The last two were missing here, so every Verses
// row was nine wide against RA2's eleven and the two special classes had
// nowhere to live. rules.ini says what they are, in its own comments:
//   Special_1 — "the Terror Drone's 'I'm a unit with infantry
//                vulnerabilities' armor" (and [DRON] Armor=special_1)
//   Special_2 — "spawn rockets' armor, to keep them from blowing each
//                other up when shot"
// We field no spawn rockets, so special_2 exists only to keep the columns
// aligned with RA2's; nothing is assigned it.
export var ARMOURS = ['none', 'flak', 'plate', 'light', 'medium', 'heavy', 'wood', 'steel', 'concrete',
               'special_1', 'special_2'];

export var VERSES = {
  SA: [100,  80,  70,  50,  25,  25,  75,  50,  25, 100, 100],
  SSA: [100, 100,  70,  60,  40,  40,  75,  50,  25, 100, 100],
  AP: [ 25,  25,  25,  75, 100, 100,  65,  45,  60,  60, 100],
  ApocAP: [ 25,  25,  25,  75, 100, 100, 100, 100,  70,  60, 100],
  HE: [100,  90,  80,  70,  35,  35,  75,  40,  20,  80, 100],
  Shock: [100, 100, 100,  85, 100, 100,  50,  50,  50, 200, 100],
  Electric: [100, 100, 100,  85, 100, 100,  50,  50,  50, 200, 100],
  IonWH: [100, 100, 100, 100, 100, 100, 100, 100,   3, 100, 100],   // the lightning storm ([IonWH]): everything but concrete
  CometWH: [100, 100, 100,  75,  50,  50, 200, 200, 200, 100, 100],   // Prism Tank: a siege gun, double vs structures, half vs armour
  FlakGuyWH: [150, 100,  50,  80,  20,  20,   0,   0,   0, 100, 100],   // Flak Trooper's AA gun (rulesmd.ini)
  NukeWH: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],   // a nuke does not care what you are made of
  HollowPoint: [200, 100, 100,   1,   1,   1,   1,   1,   1,   1, 100],
  Super: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  IvanBomb: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  Parasite: [100, 100, 100, 100, 100, 100,   0,   0,   0,   0,   0],
  MirageWH: [100, 100,  80, 100, 100, 100,  30,  20,  20, 100, 100],
  PrismWarhead: [200, 100, 100, 100, 100, 100,  50,  50,  50, 200, 100],
  GUARDWH: [ 20,  20,  20, 100,  50, 100,  10,  10,  10, 100, 100],
  FlakTWH: [150, 100,  50,  60,  10,  10,  30,  20,  10, 100, 100],
  FlakWH: [150,  80,  50, 100,  20,  20,   0,   0,   0, 100, 100],
  SAMWH: [100, 100, 100, 100, 100, 100,   0,   0,   0, 100, 100],
  ORCAAP: [100, 100, 100, 100, 100, 100, 100, 100,  75, 100, 100],
  BlimpHE: [100, 100, 100,  70,  35,  35,  85,  75,  50, 100, 100],
  // [ParasiteDog] Verses=100,100,100,0,0,0,0,0,0 — a dog's teeth are for men
  // and nothing else. Parasite=yes on top of that means the leap does not
  // wound the man, it takes him off the board (see fire()).
  ParasiteDog: [100, 100, 100,   0,   0,   0,   0,   0,   0,   0,   0],
  // [GrandCannonWH] Verses=...,50%,100%,50% on wood/steel/concrete.
  GrandCannonWH: [100, 100, 100, 100, 100, 100,  50, 100,  50, 100, 100],
  // [HARVWH] — the War Miner's 20mm. Good on men and light skins, useless
  // on armour, and (Verses[9]=200%) it chews wooden structures.
  HARVWH: [100,  80,  70,  50,  20,  20,  20,  15,  10, 200, 100],
  // [RadBeamWarhead] / [RadSite] — the Desolator's beam and the pool it
  // leaves. Infantry only: 20%/15%/10% against armour, nothing on buildings.
  RadBeamWH: [100, 100, 100,  20,  15,  10,   0,   0,   0, 100, 100],
  RadSite: [100, 100, 100,  50,  10,  10,   0,   0,   0, 100, 100],
  // [ChronoBeam] Temporal=yes — the Verses row is 100% across the board
  // because it never does damage at all; it erases (see fire()).
  ChronoBeam: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  // [Controller] MindControl=yes — same story: it skips damage entirely.
  Controller: [100, 100, 100, 100, 100, 100,   0,   0,   0, 100, 100],
  // [IvanWH] — the bomb going off, not the bomb being placed.
  IvanWH: [100, 100, 100, 100, 100, 100, 100, 250,  20, 100, 100],
  // [PsiPulse] PsychicDamage=yes, CellSpread=3 — a Yuri in an IFV throws a
  // wave that only minds feel: 0% against anything with a hull or a wall.
  PsiPulse: [100, 100, 100,   0,   0,   0,   0,   0,   0,   0,   0],
  // ---- naval warheads, read straight off rules.ini ------------------ //
  // [ARTYHE] (the Destroyer's 155mm), [APSplash] (Typhoon torpedo and the
  // Destroyer's depth charge), [SonicWarhead] (the Dolphin's sonic zap).
  ARTYHE: [100,  80,  60, 100,  60,  60, 100,  80,  60, 100, 100],
  APSplash: [ 25,  25,  25,  75, 100, 100,  65,  65,  60,  25, 100],
  SonicWH: [100, 100, 100, 100,  80,  80, 100,  60,  60, 100, 100],
  // ---- the ELITE warheads (`ElitePrimary=` swaps the whole weapon) ---- //
  // Each is its base warhead with the ANTI-INFANTRY rows opened up: a tank
  // that has learned its trade stops wasting armour-piercing shot on men.
  // [RHINAPE] (Rhino, was [AP]) and [GRIZAPE] (Grizzly, was [AP]) are the
  // same row — rules.ini:19412 and :19400 are byte-identical — and both are
  // [AP] with 25/25/25 raised to 100/100/100 against none/flak/plate.
  RHINAPE: [100, 100, 100, 100, 100, 100,  65,  45,  60,  60, 100],
  GRIZAPE: [100, 100, 100, 100, 100, 100,  65,  45,  60,  60, 100],
  // [ApocAPE] (rules.ini:19434, was [ApocAP]) — the same trade, on the row
  // that already flattened structures.
  ApocAPE: [100, 100, 100,  75, 100, 100, 100, 100,  70,  60, 100],
  // [HowitzerWH] (rules.ini:19482) — the elite War Miner's gun stops being
  // a pest-control 20mm and becomes a real shell: better against every
  // armour AND every structure than [HARVWH]. The one place it gives
  // ground is special_1 (the Terror Drone), 200% -> 80%: RA2's own trade,
  // not a transcription slip.
  HowitzerWH: [100,  90,  80,  60,  40,  40,  50,  40,  25,  80, 100],
  // [DredWH] — the Dreadnought's missile. A siege warhead: it is aimed at
  // the shore, and everything it lands on is a building or standing beside
  // one. Same shape as [HE] with the structure rows opened up.
  DredWH: [100,  90,  80,  80,  60,  60, 100,  90,  60, 100, 100]
};

// rules.ini per-warhead `Wall=`: a warhead without it cannot scratch a wall
// segment. Taken verbatim from the 37 sections that carry `Wall=yes` — note
// that RA2 DOES let every tank shell (AP/ApocAP) and the artillery family
// through, and does NOT let small arms, flak, Tanya's C4 or a Prism Tank's
// CometWH touch a wall.
export var WH_WALL = { AP: 1, ApocAP: 1, HE: 1, IonWH: 1, Electric: 1, PrismWarhead: 1,
                ORCAAP: 1, BlimpHE: 1, GrandCannonWH: 1, ARTYHE: 1, APSplash: 1, DredWH: 1 };

export function isWall(e) { return e.kind === 'b' && !!BLDS[e.type].wall; }

// verses() with RA2's wall rule folded in, so target PICKING and the damage
// itself agree: a Sentry Gun never wastes its burst on concrete.
export function versesVs(wh, tgt) {
  if (isWall(tgt) && !WH_WALL[wh]) return 0;
  return verses(wh, armourOf(tgt));
}

export function verses(wh, armour) { var v = VERSES[wh]; var i = ARMOURS.indexOf(armour); return v && i >= 0 ? v[i] / 100 : 1; }

// rules.ini:19102 `ProneDamage=` — what a man flat on his face actually
// takes. Small arms lose most of their effect, an air-bursting shell keeps
// 70%, and anything that does not care about cover (electricity, a crush,
// a bomb strapped to your leg) keeps all of it. Default 50%, as RA2's is.
// rules.ini ProneDamage= per warhead; the documented default is 100%
// (rules.ini:19102 "def=1.0"), so lasers, bolts, flak and beams hit a
// prone man in full — only bullets and shells lose to the dirt.
var PRONE_DMG = {
  SA: 0.70, SSA: 0.50, HE: 0.70, BlimpHE: 0.70,
  AP: 0.50, ApocAP: 0.50, ORCAAP: 0.50, GUARDWH: 0.50, HARVWH: 0.50,
  ARTYHE: 0.50, APSplash: 0.50, SonicWH: 0.50, DredWH: 0.50,
  GrandCannonWH: 0.30
};

export function proneMul(wh) { var v = PRONE_DMG[wh]; return v === undefined ? 1.0 : v; }

// rules.ini:19096 `InfDeath=` — the KILLING warhead picks the animation:
// 1 twirl, 2 explodes (no body), 3 flying death, 4 burn, 5 electro. 6 is
// ours, for a man under a tank. RA2's 7 (nuke melt) folds into the burn.
export var INF_DEATH = {
  SA: 1, SSA: 1, HollowPoint: 1, Parasite: 1, ParasiteDog: 1,
  HE: 2, BlimpHE: 2, Super: 2, IvanBomb: 2,
  AP: 3, ApocAP: 3, ORCAAP: 3, SAMWH: 3, GUARDWH: 3,
  ARTYHE: 2, DredWH: 2, APSplash: 3, SonicWH: 5,
  FlakWH: 3, FlakTWH: 3, FlakGuyWH: 3,
  MirageWH: 4, NukeWH: 4, RadBeamWH: 4, RadSite: 4,   // InfDeath=7 (radiation melt) folds into the burn
  IvanWH: 2,
  Electric: 5, Shock: 5, IonWH: 5, PrismWarhead: 5, CometWH: 5,
  PsiPulse: 6                                      // [PsiPulse] InfDeath=6
};

// art.ini `Crawls=` (art.ini:27): [ROCK] and [FLAKT] are `no` — they run
// instead, so they never hit the dirt. Everyone else (including [SHK] and
// [TANY], which do have crawl frames) goes prone under fire.
export function infCrawls(type) { return type !== 'rocketeer' && type !== 'flak' && type !== 'dog'; }

function isVehArmour(a) { return a === 'light' || a === 'medium' || a === 'heavy'; }

function isBldArmour(a) { return a === 'wood' || a === 'steel' || a === 'concrete'; }

export function isInfArmour(a) { return a === 'none' || a === 'flak' || a === 'plate'; }

// RA2 primary/secondary weapons: the secondary is picked by what it is for
// (Guardian GI missile vs armour, Tanya C4 vs structures).
export function weaponFor(spec, tgt, u) {
  // [FV] Gunner=yes: the IFV's weapon is not a property of the vehicle, it
  // is a property of its passenger. Resolve that FIRST, then let the AA and
  // secondary rules below run against the weapon it actually has.
  if (spec.ifv && u && u.pax && u.pax.length) spec = ifvSpec(u);
  // RA2 AA secondaries: a Flak Track swaps FlakTWH for FlakWH against a
  // flyer, an Apocalypse unlimbers its MammothTusk missiles. The ground
  // gun is never the thing that shoots the sky.
  if (spec.aaW && isAir(tgt)) return eliteOf(spec.aaW, u);
  // [DEST] Secondary=ASWLauncher: the 155mm cannot reach a submarine, the
  // Osprey's depth charge is what answers one.
  if (spec.asw && isSub(tgt)) return eliteOf(spec.asw, u);
  var w2 = spec.w2;
  // [GGI] Deployer=yes + DeployFire=yes: the Guardian GI's missile is a
  // DEPLOYED weapon. Standing up he is an ordinary rifleman; braced, he is
  // an anti-armour and anti-air emplacement. Ours fired the missile while
  // walking, which made the deploy state decorative and the unit strictly
  // better than RA2's.
  if (w2 && spec.depFire && !(u && u.deployed)) w2 = null;
  if (w2) { var a = armourOf(tgt); if ((w2.use === 'veh' && isVehArmour(a)) || (w2.use === 'bld' && isBldArmour(a)) || (w2.use === 'inf' && isInfArmour(a)) || (w2.use === 'ship' && isNaval(tgt))) return eliteOf(w2, u); }
  if (u && u.deployed && spec.dep) return eliteOf(spec.dep, u);   // a deployed GI fires from its sandbags
  // `ElitePrimary=` lands HERE and on the four returns above, so whichever
  // weapon the resolver picked is the one that gets swapped — the Giant
  // Squid's `SquidGrabE` is on its secondary, not its primary.
  return eliteOf(spec, u);
}

export function reachOf(spec, u) {
  if (spec.ifv && u && u.pax && u.pax.length) spec = ifvSpec(u);
  // Twelve of the 34 elite weapons bump `Range`, two of them hugely, so the
  // reach a unit will OPEN FIRE at has to see the swap too — otherwise an
  // elite Tesla Trooper keeps walking to 3 cells to use a 5-cell bolt.
  var es = eliteOf(spec, u);
  var w2 = eliteOf(spec.w2, u);
  var w2r = spec.w2 && (!spec.depFire || (u && u.deployed)) ? w2.rng : 0;
  var r = w2r > es.rng ? w2r : es.rng;
  if (spec.aaW) { var aw = eliteOf(spec.aaW, u), ar = aw.aaRng || aw.rng; if (ar > r) r = ar; }
  if (spec.asw && eliteOf(spec.asw, u).rng > r) r = eliteOf(spec.asw, u).rng;
  if (u && u.deployed && spec.dep && eliteOf(spec.dep, u).rng > r) r = eliteOf(spec.dep, u).rng;
  return r;
}

// What a DeployFire unit braces FOR: the nearest live enemy inside the
// deployed weapon's range that the deployed weapon is actually for —
// vehicles and aircraft, for the Guardian GI's [MissileLauncher]. Kept
// separate from findTarget on purpose; see the caller.
export function depFireTarget(g, u, rng) {
  var best = null, bd = rng * rng;
  for (var i = 0; i < g.units.length; i++) {
    var o = g.units[i];
    if (o.dead || o.limbo || o.p === u.p || neutral(o.p)) continue;
    if (!isAir(o) && !isVehArmour(armourOf(o))) continue;
    if (isDisguised(g, o) || isSub(o)) continue;
    var dx = o.x - u.x, dy = o.y - u.y, dd = dx * dx + dy * dy;
    if (dd <= bd) { bd = dd; best = o; }
  }
  return best;
}

// ---- veterancy: the [General] scalars apply ONCE, not once per level ---- //
//
// THE DECISION, and why it is not the one this file used to make.
//
// A promotion in RA2 grants ABILITIES — named flags out of the list
// rules.ini:2997-3000 documents, `[FASTER,STRONGER,FIREPOWER,SCATTER,ROF,
// SIGHT,...]`. `VeteranAbilities=` is what rank 1 grants, `EliteAbilities=`
// what rank 2 adds. The four `[General]` numbers (rules.ini:15-21,
// VeteranCombat=1.1 / VeteranArmor=1.5 / VeteranROF=0.6 / VeteranSpeed=1.2,
// VeteranCap=2) are the SIZE of those flags, not a per-level exponent.
//
// This file used to compound them — `Math.pow(k, rank)` — on the reading
// that `[General]` "calls them per level". It does not. Three things in
// rules.ini itself settle it:
//
//  1. In that same seven-line comment block, exactly ONE key carries the
//     annotation: `VeteranRatio=3.0 ; ... [per level]` (rules.ini:15). The
//     four combat scalars, written by the same hand on the next four lines,
//     do not. The note is about the KILL THRESHOLD for each promotion.
//  2. `EliteAbilities` is documented as "cumulative with veteran abilities"
//     (rules.ini:2996) — cumulative over the SET, not over the factor. The
//     proof is `[XCOMET]`, the one unit in the file with
//     `VeteranAbilities=STRONGER,FIREPOWER,SIGHT,FASTER` and NO
//     `EliteAbilities=` at all: without the union rule its elite would lose
//     firepower on promotion. 48 of the 49 units re-list FIREPOWER in both
//     lists, which under a compounding rule would make x1.21 universal and
//     the key pointless; under the union rule it is merely redundant.
//  3. An ability is a FLAG. Nothing in the documented list can be held
//     twice, so nothing in it can be applied twice.
//
// (Corroborating, but second-hand and not the basis of the decision: the
// decompiled lookup is `VeteranAbilities[i] || EliteAbilities[i]`, a
// short-circuiting OR; Starkku and two independent in-game tests report the
// same. See the research note in docs/ if it is ever re-litigated.)
//
// So rank 1 and rank 2 carry the SAME multipliers. What elite actually adds
// is `SELF_HEAL` (44 of the 49 units with an ability list, and never at
// rank 1) and `ElitePrimary=` — a different weapon,
// handled by eliteOf() below. That is the whole content of the second
// promotion, and it is why this had to be settled before the weapon swap:
// under the old compounding rule an elite was 1.83x a veteran no matter
// what weapon it held, which would have made the "elite is never weaker
// than veteran" guard true by construction and worth nothing.
export function vetFire(rank) { return (rank || 0) > 0 ? 1.1 : 1; }

// ROF is the one ability that genuinely varies by unit: 29 of 49 grant it in
// `VeteranAbilities`, 18 only in `EliteAbilities`, and `[XCOMET]` and
// `[HORNET]` never. A
// unit's `rofAt` says which (default 1; 2 = elite only; 0 = never), and it
// is load-bearing rather than cosmetic — `[HARV]`'s elite gun trades ROF
// 20 -> 50 for Damage 30 -> 50, so an elite War Miner comes out WEAKER than
// its veteran unless the x0.6 arrives at rank 2 the way RA2 has it.
//
// FASTER is left flat at rank 1 for every unit: RA2 withholds it from
// [TANY] and [HORNET] only, it plays no part in the elite-weapon question,
// and the six units with no ability lists at all ([DRON], the miners,
// [SPY], [SAPC], [SMCV] — which should get no multipliers whatever) are the
// same unclosed row. Both are recorded gaps, not oversights.
// Ticks per idle-animation frame. Six baked phases, so a full cycle is
// IDLE_T * 6 ticks -> 5.0 s at 60 fps. See drawBld for why.
export var IDLE_T = 50;

export function vetRofAt(u) { var r = u && UNITS[u.type] ? UNITS[u.type].rofAt : 1; return r == null ? 1 : r; }

export function vetRof(rank) { return (rank || 0) > 0 ? 0.6 : 1; }

// The unit-aware form: every fire path should use this, because whether the
// ROF bonus has arrived yet is a property of the SHOOTER, not of the rank.
export function vetRofU(u) { var a = vetRofAt(u); return a > 0 && (u.rank || 0) >= a ? vetRof(1) : 1; }

export function vetSpeed(rank) { return (rank || 0) > 0 ? 1.2 : 1; }

// A unit's ground speed after the [Powerups] Speed crate (x1.2). Every
// mover reads it through here so one crate cannot be applied twice or
// missed on one of the fifteen advance() call sites.
// [General] VeteranSpeed=1.2 per level goes HERE, not in advance(): the
// comment above is the file's own rule — every mover reads speed through
// uspd so a multiplier cannot be applied twice or missed on one of the
// fifteen advance() call sites. The elite-only form this replaces sat in
// advance() and had exactly that shape of risk.
export function uspd(u) { var m = UNITS[u.type].spd * vetSpeed(u.rank); return u.spMul ? m * u.spMul : m; }

export function vetArmour(rank) { return (rank || 0) > 0 ? 1.5 : 1; }

// rules.ini `ElitePrimary=` (documented at :2963, "new primary weapon when
// at elite veteran status") — at rank 2 a unit does not get a bigger
// multiplier, it gets a DIFFERENT WEAPON. 34 sections carry one; 26 of them
// are units we field. The `elite` on a weapon spec is baked at load into a
// COMPLETE weapon (bakeElite, below), so every consumer that reads
// .dmg/.rate/.rng/.wh/.burst off what weaponFor returns gets the swap for
// free. Buildings are `Trainable=no` (:2982) and never carry a rank, so
// this is safely false for the building spec weaponFor is handed.
export function eliteOf(w, u) { return (w && w.elite && u && u.rank === 2) ? w.elite : w; }

// Structures that differ per faction (Allied Power Plant $800/+200 vs Tesla Reactor $600/+150).
var _bspec = {};

export function bspecFor(key, fac) {
  var b = BLDS[key]; if (!b.byFac || !b.byFac[fac]) return b;
  var ck = key + '|' + fac; if (_bspec[ck]) return _bspec[ck];
  var o = {}; for (var k in b) o[k] = b[k]; for (k in b.byFac[fac]) o[k] = b.byFac[fac][k];
  return (_bspec[ck] = o);
}

// The spec of an item ABOUT TO BE BUILT: its own faction where the key is
// one side's alone, else the builder's. (facOf handles the neutral house
// (-1): killing a derrick used to throw here.)
export function bspecOf(g, key, p) { return bspecFor(key, keyFac(g, p, key, true)); }

// The spec of a structure that EXISTS — read off ITS faction, not its
// holder's, so a captured Soviet Barracks keeps the 2x2 [NAHAND] footprint
// it was placed on and a captured Soviet slip keeps [NAYARD]'s power draw.
export function bspecOfB(g, b) { return bspecFor(b.type, bfacOf(g, b)); }

export function ucap(g, u) { var d = UNITS[u.type]; return g.side[u.p].fac === 'col' && d.capCol ? d.capCol : d.cap; }

// RA2 has no unit called "harvester" — it has a Chrono Miner and a War
// Miner. The word survives here as the ROLE, resolved to the faction's
// actual type at every boundary (spawn, build, count) so the AI, the tests
// and orderUnitsTo can still say "harvester" and mean "our miner".
export function harvKey(fac) { return fac === 'col' ? 'warminer' : 'chronominer'; }

export function isHarv(u) { var d = u && u.type && UNITS[u.type]; return !!(d && d.harv); }

export function psiImmune(u) { return u.kind !== 'u' || !!UNITS[u.type].psiImmune; }

export function radImmune(u) { return !!UNITS[u.type].radImmune; }
