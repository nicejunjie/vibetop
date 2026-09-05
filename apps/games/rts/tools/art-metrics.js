#!/usr/bin/env node
// Unit-art readability metrics — the measuring half of the art regression gate.
//
//   node apps/games/rts/tools/art-metrics.js                 # print a report
//   node apps/games/rts/tools/art-metrics.js --json out.json  # + write the numbers
//   node apps/games/rts/tools/art-metrics.js --record         # rewrite docs/art-baseline.json
//
// It serves rts.html from a throwaway loopback server, opens it in headless
// Chromium at devicePixelRatio 1 / zoom 1 (where a baked logical pixel IS a
// screen pixel — see unit-confusability-audit.md §Method), reads every unit's
// sprite back out of the page's own atlas via `window.__rtsTest.spr()`, and
// composes each one EXACTLY the way `drawUnit` composes it. That composition is
// the load-bearing part: hull+turret for the six turreted vehicles, envelope +
// gondola for the Kirov, `art.fr('stand', dir, 0)` for infantry, a single sheet
// for everything else. Compose it any other way and every number below is
// fiction.
//
// It also drives a REAL rendered frame and screenshots it, and it fails if any
// bake throws or the page logs an error — because this repo has already learned
// that headless numbers pass while the renderer throws
// (unit-redesign-plan.md §5, docs/design-decisions.md).
//
// The metrics are deliberately ENSEMBLE properties (pairwise separation,
// peer-vs-self, counts over a floor). Per-unit numbers that a single art commit
// could set by construction are recorded as `detail` for a human to read, and
// are NOT asserted by the gate.

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');   // repo root
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const BASELINE = path.join(RTS, 'docs', 'art-baseline.json');
const FRAME_PNG = path.join(RTS, 'art', 'out', 'art-gate-frame.png');

// ── The renderer's own constants, mirrored here so a change to either shows up
//    as a diff rather than as a silently-shifted metric.
const ZMIN = 0.55;              // rts.html:24995
const SPIKE_FLOOR_ZMIN = 2.0;   // RA2's own floor: 2 px of thickness
const SPIKE_FLOOR = SPIKE_FLOOR_ZMIN / ZMIN;   // => 3.64 px at zoom 1 (plan §2 option 1)
const FLOOR = Math.round(SPIKE_FLOOR * 100) / 100;   // the budget when §2 names no number
// A unit whose fixed (non-owner) pixels average less than this much saturation
// is painted in greys: it reads as "a machine" and never as "THAT machine".
// 0.14 is just above the census's own s > 0.12 noise floor, so a unit only
// clears it by carrying real chroma over a real area, not by one bright pixel.
const ACHROMATIC = 0.14;

// ── RA2'S OWN BROADSIDE ASPECT ────────────────────────────────────────────
// The one art property with a hard EXTERNAL number: unit-identity-reference.md
// §1.1 tabulates each ship's RA2 sprite as `w x h` measured broadside with the
// shadow removed, and w/h is a ratio, so it survives our renderer being 0.59x
// - 2.13x of RA2's scale. Nothing an art commit writes can move the reference,
// which is what keeps this from being plan §5's tautology.
//
// It exists because the fleet went unmeasured on the one axis that decides a
// ship's first read. The Aegis shipped at 78x58 — aspect 1.34 against [AEGIS]'s
// 2.60, a cruiser drawn as a tugboat — and stayed that way for weeks while
// every ensemble metric passed: `iou`, `spike` and `hue` are all invariant to
// a hull being half as long as it should be, so long as the whole fleet is
// wrong together. `legibility.js` saw the SYMPTOM (`aegis | squid` under the
// friend-vs-foe floor, two tall blobs) and named neither cause.
//
// The band is +-20%. RA2's own seven span 1.84 to 5.36, so 20% cannot let two
// size classes swap; and our isometric camera is not bit-identical to RA2's,
// so a tighter band would fail on projection error rather than on art.
// EXTERNAL REFERENCE, and the only kind of metric that can catch an error the
// WHOLE ENSEMBLE shares. A fleet of tugboats sat here for weeks because every
// other metric is a comparison between our own units: if they are all wrong
// the same way, they all still separate, and nothing complains. This table
// came from RA2's own sprite bboxes and is the one thing that noticed.
//
// It covered NAVAL ONLY. Vehicles and infantry had no external check at all,
// so the same class of drift could sit in the tanks or the troopers unseen —
// and the numbers to close that were already in the repo, in
// docs/unit-identity-reference.md §1.1, unused. They are below.
//
// NOTE what this table settles retroactively: RA2's IFV is 50x45 = 1.11 and
// its Flak Track 45x45 = 1.00. Both are as square as ours. The measured
// negative result that says "do not lengthen the IFV" was right for a reason
// nobody had written down — RA2's IFV really is nearly square.
const RA2_ASPECT = {
  // ---- vehicles (unit-identity-reference.md §1.1) ----
  drone:       21 / 14,  // [DRON]    21x14
  hornet:      27 / 15,  // [HORNET]  27x15
  flaktrack:   45 / 45,  // [HTK]     45x45 — square, and so is ours
  ifv:         50 / 45,  // [FV]      50x45
  teslatank:   52 / 37,  // [TTNK]    52x37
  lancer:      54 / 23,  // [GTNK]    54x23 — the Grizzly
  chronominer: 55 / 28,  // [CMIN]    55x28
  rhino:       56 / 28,  // [HTNK]    56x28
  mammoth:     56 / 41,  // [MTNK]    56x41 — the Apocalypse
  warminer:    56 / 48,  // [HARV]    56x48
  mirage:      59 / 39,  // [RTNK]    59x39
  prismtank:   59 / 43,  // [SREF]    59x43
  v3:          63 / 36,  // [V3]      63x36
  nighthawk:   64 / 21,  // [SHAD]    64x21
  // ---- infantry (same table) ----
  dog:         21 / 15,  // [ADOG]    21x15, running
  ivan:        12 / 25,  // [IVAN]    12x25
  engineer:    13 / 25,  // [ENGINEER]13x25
  rocketeer:   16 / 24,  // [JUMPJET] 16x24
  cleg:        15 / 26,  // [CLEG]    15x26
  tanya:       13 / 26,  // [TANY]    13x26
  conscript:   13 / 27,  // [E2]      13x27
  rifle:       12 / 28,  // [E1]      12x28
  teslatrooper:18 / 28,  // [SHK]     18x28
  yuri:        12 / 29,  // [YURI]    12x29
  flak:        12 / 37,  // [FLAKT]   12x37, gun up
  // ---- naval ----
  destroyer: 101 / 41,   // [DEST]  101x41
  aegis:      91 / 35,   // [AEGIS]  91x35
  carrier:   143 / 52,   // [CARRIER] 143x52 — the largest sprite in RA2
  dread:     133 / 45,   // [DRED]  133x45
  squid:     117 / 30,   // [SQD]   117x30
  sub:        75 / 14,   // [SUB]    75x14 — the flattest hull afloat
  seascorp:   59 / 32,   // [HYD]    59x32
};
const RA2_ASPECT_BAND = 0.20;

// ── SPIKES ────────────────────────────────────────────────────────────────
// One entry per key in the UNITS map, and every number is TRACEABLE: `src`
// quotes the sentence in unit-identity-reference.md §2 the number comes from,
// so a budget can be checked rather than believed.
//
// `budget` is the THIN dimension — what `spikeOf` returns as `thick`, the
// dimension that dies first when the renderer scales to ZMIN. `len` is the
// spike's extent ALONG the axis, which is a different number and was being
// conflated with the thin one (2026-09-04 audit): §2.1 asks the Chrono
// Legionnaire for a "rifle >= 9 px LONG held horizontal", and that 9 was
// entered as a 9 px THICKNESS, demanding a slab where the reference asks for a
// rifle. Same class of error as the `mass.groundCombatSpan` x6.8 corrected
// above. A unit is below its declared budget if it fails EITHER.
//
// Where §2 gives no pixel number at all, the budget is `FLOOR` and `src` says
// so. Four budgets were previously invented rather than transcribed (the
// Destroyer's 5, the Landing Craft's 4, the MCV's 4, the Kirov's 4) — an
// invented number is worse than the floor, because it fails a unit for missing
// a bar nobody set. The floor is the honest bar: 2 px at ZMIN, RA2's own.
//
// `axis` says which way the spike protrudes, and so which profile measures it:
//   'h' — it breaks the outline sideways (a barrel, a missile, a rotor span,
//         a dog's spine): measured off the column profile, as the run of thin
//         columns beyond the body (unit-identity-reference.md §1.3's method).
//   'v' — it stands above the body (a crystal, coils, a raised gun, a tube):
//         measured off the row profile, the "crown" rule the audit validated
//         against the six real turret layers (audit §3b).
// A missing entry is a hard failure, not a skip: a silent gap is exactly the
// failure mode this gate exists to remove.
const SPIKES = {
  // ── Directorate infantry (reference §2.1)
  rifle:        { axis: 'v', budget: 5,   len: null, src: 'helmet >= 5x3',
                  feature: 'grey pot helmet over a house torso block (no usable silhouette)' },
  rocket:       { axis: 'v', budget: 2.5, len: 4,    src: 'tube >= 8 px long x 2.5 px thick, clearing the helmet by >= 4 px',
                  feature: 'shoulder missile tube, ~30° up, clearing the helmet by >=4 px' },
  rocketeer:    { axis: 'v', budget: 4,   len: 6,    src: 'pack >= 4w x 6h and strictly below the helmet crown',
                  feature: 'airborne: altitude offset + pack tanks behind the shoulders' },
  engineer:     { axis: 'v', budget: FLOOR, len: null, src: 'NONE — the toolbox is at hand height, not a crown; the floor applies',
                  feature: 'inverted value — the only light-value soldier; toolbox at hand height' },
  // The 19 px in §2.1 is the BODY's length, and `spikeOf` measures only what
  // protrudes PAST the body — entering it as a spike length would repeat the
  // very conflation this table was rewritten to remove.
  dog:          { axis: 'h', budget: FLOOR, len: null, src: 'NONE — its numbers are a body length (19) and a height MAXIMUM (<= 9)',
                  feature: 'quadruped: horizontal spine, aspect 1.4 against everyone else 0.45' },
  tanya:        { axis: 'h', budget: FLOOR, len: 2,  src: 'pistols break the outline by >= 2 px each side',
                  feature: 'two pistols out to the sides, breaking the outline >=2 px each' },
  cleg:         { axis: 'h', budget: FLOOR, len: 9,  src: 'rifle >= 9 px LONG held horizontal — a length, not a thickness',
                  feature: 'powered-suit shoulder line >=15 px + a long level rifle' },
  spy:          { axis: 'v', budget: 7,   len: null, src: 'hat brim >= 7 px wide, >= 1.5x the head',
                  feature: 'fedora brim >=7 px wide over an unbroken coat hem' },
  // ── Collective infantry (reference §2.2)
  conscript:    { axis: 'v', budget: FLOOR, len: null, src: 'NONE — "cap silhouette flat, not domed" gives no number; the floor applies',
                  feature: 'flat peaked cap over tan trousers (the GI twin; legs carry the read)' },
  flak:         { axis: 'v', budget: 2.5, len: 8,    src: 'barrel >= 10 px long x 2.5 px thick, clearing the helmet crown by >= 8 px',
                  feature: 'flak barrel raised 45-60°, 9-10 px of spike above the helmet' },
  teslatrooper: { axis: 'h', budget: FLOOR, len: null, src: 'NONE — "shoulder line >= 18 px" is the BODY, not a protrusion; the floor applies',
                  feature: 'pauldrons — the widest infantry, shoulder line >=18 px' },
  ivan:         { axis: 'h', budget: FLOOR, len: 2,  src: 'ushanka flaps break the head outline >= 2 px each side',
                  feature: 'ushanka flaps breaking the head outline >=2 px each side' },
  desolator:    { axis: 'v', budget: 5,   len: 8,    src: 'pack >= 5w x 8h above the shoulder line',
                  feature: 'backpack tank above the shoulder line + a fat beam muzzle' },
  yuri:         { axis: 'v', budget: FLOOR, len: null, src: 'NONE — "hem block >= 9 px wide" is the body; the bare dome carries no number',
                  feature: 'bald dome over one unbroken coat hem — no leg split' },
  // ── Directorate vehicles / aircraft (reference §2.3)
  lancer:       { axis: 'h', budget: 2.2, len: 13,   src: 'barrel >= 13 px x 2.2 px, entirely clear of the hull',
                  feature: 'a 13 x 2.2 px gun barrel overhanging 24% of the flattest hull' },
  ifv:          { axis: 'v', budget: 8,   len: 8,    src: 'four turret models visually distinct at >= 8x8 px each',
                  feature: 'a boxy turret >=45% of total height on a near-square body' },
  mirage:       { axis: 'v', budget: FLOOR, len: 6,  src: 'housing >= 6 px tall (its WIDTH is given as 60% of hull, not an absolute)',
                  feature: 'a wide flat emitter housing proud of the deck, and NO long gun' },
  prismtank:    { axis: 'v', budget: 5,   len: 10,   src: 'crystal >= 10 px tall x >= 5 px wide',
                  feature: 'the upright prism crystal, >=10 px tall x >=5 px wide' },
  chronominer:  { axis: 'h', budget: FLOOR, len: 8,  src: 'nose drum >= 8 px LONG, violet',
                  feature: 'ribbed violet chrono drum for a nose; zero turret mass' },
  nighthawk:    { axis: 'h', budget: 2,   len: null, src: 'blades 2 px with >= 40% value contrast',
                  feature: 'tandem rotor discs — 1-2 px blade lines past the fuselage' },
  harrier:      { axis: 'h', budget: 5,   len: null, src: 'wing >= 5 px chord at the root',
                  feature: 'a broad swept delta wing, >=5 px chord at the root' },
  hornet:       { axis: 'h', budget: FLOOR, len: null, src: 'NONE — its budget is a MAXIMUM ("<= 0.45x the Harrier, add no detail")',
                  feature: 'the smallest thing that flies — identity is size, not detail' },
  mcv:          { axis: 'v', budget: FLOOR, len: null, src: 'NONE — its budget is "zero barrel, zero turret ring"; the floor applies',
                  feature: 'amber folded crane boom on a slab works body; zero barrel' },
  destroyer:    { axis: 'v', budget: FLOOR, len: null, src: 'NONE — "one turret forward of amidships" gives no pixel number',
                  feature: 'a forward gun turret and an aft helipad on a 101 px hull' },
  aegis:        { axis: 'v', budget: 8,   len: 8,    src: 'radar panel >= 8x8 px, vertical, explicitly no barrel',
                  feature: 'a vertical flat-panel radar face >=8x8 px, explicitly no barrel' },
  carrier:      { axis: 'h', budget: FLOOR, len: null, src: 'NONE — the deck spec is a PROPORTION (>= 80% of length)',
                  feature: 'a flat flight deck >=80% of length with 3 parked airframes' },
  dolphin:      { axis: 'v', budget: FLOOR, len: 3,  src: 'fin >= 3 px ABOVE the back — a height, not a thickness',
                  feature: 'a dorsal fin >=3 px above an organic back, no orthogonal edges' },
  lcraft:       { axis: 'h', budget: FLOOR, len: null, src: 'NONE — "ramp plane distinct from the deck" gives no pixel number',
                  feature: 'an open bow ramp, a plane distinct from the deck' },
  // ── Collective vehicles / aircraft (reference §2.4)
  rhino:        { axis: 'h', budget: 3.5, len: null, src: 'gun >= 1.6x the Grizzly barrel thickness (1.6 x 2.2 = 3.5)',
                  feature: 'a gun 1.6x the Grizzly barrel thickness on a taller hull' },
  mammoth:      { axis: 'h', budget: FLOOR, len: 19, src: 'twin barrels >= 19 px LONG, visibly two, tapering',
                  feature: 'twin barrels >=19 px, visibly TWO — the only two-barrelled thing' },
  teslatank:    { axis: 'v', budget: 3,   len: 9,    src: 'each column >= 9 px tall x 3 px wide',
                  feature: 'two coil columns >=9 px tall, gap >=5 px so the pair reads as two' },
  v3:           { axis: 'h', budget: FLOOR, len: 5,  src: 'missile overhanging >= 5 px at the nose — a reach, not a thickness',
                  feature: 'a white missile overhanging the truck >=5 px at the nose' },
  flaktrack:    { axis: 'v', budget: FLOOR, len: 10, src: 'gun raised >= 10 px above the bed line — a height',
                  feature: 'a gun raised >=10 px off the bed of the only square vehicle' },
  warminer:     { axis: 'v', budget: 6,   len: 6,    src: 'turret >= 6x6 px on the bin shoulder',
                  feature: 'a >=6x6 turret on the bin shoulder — a harvester that shoots' },
  drone:        { axis: 'h', budget: FLOOR, len: 4,  src: 'legs >= 4 px REACH beyond the core, tapered blades not wires',
                  feature: 'four splayed blade legs reaching >=4 px beyond a tiny core' },
  apc:          { axis: 'h', budget: FLOOR, len: null, src: 'NONE — "a continuous rounded band" gives no pixel number',
                  feature: 'a continuous inflatable skirt round a house-hued open deck' },
  kirov:        { axis: 'v', budget: FLOOR, len: null, src: 'NONE — its 4 px is the GAP BELOW the envelope, which no crown measures',
                  feature: 'mass — and a gondola separated below the envelope by >=4 px' },
  sub:          { axis: 'v', budget: FLOOR, len: null, src: 'NONE — "height <= 0.20 x length" is a MAXIMUM on the hull',
                  feature: 'a conning tower — the only vertical mass on a 5.36-aspect hull' },
  seascorp:     { axis: 'v', budget: FLOOR, len: null, src: 'NONE — "gun matches the Flak Track silhouette" names no number of its own',
                  feature: 'the Flak Track gun on the fleet smallest armed hull' },
  dread:        { axis: 'v', budget: 10,  len: 10,   src: 'two launch boxes >= 10x10 px, countable, standing proud of the deck',
                  feature: 'two countable missile boxes >=10x10 px standing on the deck' },
  squid:        { axis: 'h', budget: 3,   len: null, src: '>= 4 tentacles resolvable at 3 px each',
                  feature: '>=4 tentacles resolvable at 3 px each; zero straight edges' },
};

// ── TARGETS ───────────────────────────────────────────────────────────────
// What unit-redesign-plan.md §0/§5 and unit-identity-reference.md §1 say the
// numbers should BE. The game does not meet these today; the gate ratchets the
// baseline toward them and prints the remaining gap every run so the debt stays
// visible instead of quietly becoming the new normal.
const TARGETS = {
  'peerVsSelf.total':            { want: 0,    dir: 'down', note: 'reference §1.2/§0 bar: no unit beaten by a peer' },
  'peerVsSelf.vehicle':          { want: 0,    dir: 'down', note: 'audit §2: 11 of 13 today' },
  'peerVsSelf.infantry':         { want: 0,    dir: 'down', note: 'audit §2: 11 of 14 today' },
  'peerVsSelf.naval':            { want: 0,    dir: 'down', note: 'audit §2: 8 of 10 today' },
  'peerVsSelf.air':              { want: 0,    dir: 'down', note: 'audit §2: 0 of 4 — the control that says this is real' },
  'iou.groundCombat.mean':       { want: 0.45, dir: 'down', note: 'plan §0 headline 0.679; 0.45 is the air groups 0.30 with slack for a shared ground plane' },
  'iou.vehicle.mean':            { want: 0.45, dir: 'down', note: 'as above, over all 13 ground vehicles' },
  'iou.infantry.mean':           { want: 0.55, dir: 'down', note: 'RA2 infantry share a silhouette by design (ref §1.2); colour carries them, so the ceiling is looser' },
  'iou.naval.mean':              { want: 0.45, dir: 'down', note: '' },
  'iou.air.mean':                { want: 0.45, dir: 'down', note: 'already met — the control group' },
  'iou.sameFactionOver75':       { want: 0,    dir: 'down', note: 'plan §5: no same-roster pair over the 0.75 ceiling' },
  'spike.belowFloor':            { want: 0,    dir: 'down', note: 'plan §2 option 1: every spike >=3.64 px at zoom 1 so it clears 2 px at ZMIN' },
  'spike.minThickAtZmin':        { want: SPIKE_FLOOR_ZMIN, dir: 'up', note: 'RA2 bottoms out at 2 px of thickness' },
  'spike.belowDeclaredBudget':   { want: 0,    dir: 'down', note: 'every unit meets its own §2 pixel budget' },
  'mass.groundCombatSpan':       { want: 2.04, dir: 'up',   note: "RA2's span over the NINE ground-combat vehicles this metric covers: Grizzly 54x23 -> Prism 59x43 = x2.04. The x6.8 originally written here was RA2's whole vehicle-AND-SHIP class (Terror Drone 21px -> Carrier 143px) applied to a metric that measures neither — a target-definition error, corrected 2026-09-04. We sit ABOVE RA2 deliberately: our renderer goes to 0.55x where RA2's never left 1.0x" },
  'mass.tightestBand6':          { want: 2.0,  dir: 'up',   note: 'six of nine ground combat vehicles sit inside a x1.38 band today (audit §5)' },
  // --- colour. Every metric above is computed off the ALPHA MASK, so none of
  // them can see a colour change at all: C2 raised the infantry remap by a
  // third and moved them by zero. For infantry that is the whole mechanism
  // (ref §1.2/§1.5 — seven of twelve RA2 troopers share a silhouette), so a
  // gate blind to colour cannot grade the work it exists to grade.
  'hue.infantryOwnerMean':       { want: 0.29, dir: 'up',   note: "reference §1.4 measures RA2's infantry rips at 14.3-47.9% owner colour with a MEDIAN of ~29%, put on the torso as one block. Two honest caveats on comparing our number to it, neither of them a reason to move the target: this is a MEAN, which §1.4 does not report, and it is taken over all fourteen kinds INCLUDING the two that hue.infantryBelowBudget exempts — so the dog and Tanya, which RA2 itself keeps drab, drag the figure that RA2's uniformed troopers set. RA2's own 14.3% low end IS Tanya, so her presence is fair; the dog is an extra our roster has and the rip set did not. detail.hue carries the median and the exempt-excluded mean beside it — close the gap on the other twelve, never by painting those two" },
  'hue.infantryBelowBudget':     { want: 0,    dir: 'down', note: "uniformed troopers under 20% owner colour. EXEMPT: dog (an animal — collar and harness only, ref §2.2) and tanya (RA2's own exception at 14.3%). The Spy is NOT exempt: a disguise argument is plausible but undocumented, so he stays visible as debt rather than quietly excused" },
  'hue.vehicleOwnerMean':        { want: 0.115, dir: 'up',  note: 'reference §1.4: RA2 vehicles 11.5-27%. Ours already sit inside it — this pins the budget so C3 stays a PLACEMENT change' },
  'hue.vehicleOwnerMax':         { want: 0.27, dir: 'down', note: 'the top of RA2 vehicle range; going over means C3 overshot into re-adding paint (plan §4)' },
  'hue.maxImpostor':             { want: 0.02, dir: 'down', note: "a FIXED colour sitting on the other owner's hue reads as their unit — the Conscript's #7d5148 trousers were 39% red" },
  'aspect.navalOutsideRA2Band':  { want: 0,    dir: 'down', note: 'every hull with an RA2 sprite in reference §1.1 within +-20% of its broadside aspect; 5 of 7 were outside it before the 2026-09-05 pass — the Typhoon at 0.40 of RA2, the Dreadnought 0.50, the Aegis 0.52' },
  'aspect.vehicleOutsideRA2Band':{ want: 0,    dir: 'down', note: 'the same external check for GROUND vehicles, whose RA2 bboxes were sitting unused in reference §1.1 while only the fleet was gated. 4 of 14 outside on the day it was added: Rhino 1.39 vs 2.00, V3 1.22 vs 1.75, Chrono Miner 1.49 vs 1.96, Prism Tank 1.05 vs 1.37 — all SHORTER than RA2, the same direction the fleet was. Note the IFV comes out at 0.97 of RA2 and the Flak Track 0.88, which is why the measured "do not lengthen the IFV" result was right: RA2 draws both nearly square' },
  'aspect.infantryOutsideRA2Band':{ want: 0,   dir: 'down', note: 'the same check for INFANTRY, and the fault runs the other way: ours are too WIDE, not too short. 4 of 11 outside — Engineer 0.86 vs 0.52, Chrono Legionnaire 0.93 vs 0.58, Tanya 0.71 vs 0.50, Flak Trooper 0.44 vs 0.32. A camera cannot widen a man, so unlike the vehicles this is not explained by the isometric projection' },
  'aspect.airOutsideRA2Band':    { want: 0,    dir: 'down', note: 'the same check for AIRCRAFT. The Nighthawk is 1.62 against RA2\'s 3.05 — the single worst offender on the whole board at 0.53 of reference, a helicopter drawn barely half as long as it should be' },
  'aspect.navalWorstOffRA2':     { want: 0.20, dir: 'down', note: "the furthest any hull sits from RA2's aspect, as |ours/RA2 - 1|; 0.60 (the Typhoon, 2.15 against 5.36) before that pass" },
  'colour.infantry.meanDist':    { want: 0.45, dir: 'up',   note: 'mean pairwise hue-histogram distance between infantry kinds: what actually separates them' },
  // C5 ("ACCENT earns its name") had NO measurement at all until 2026-09-04,
  // which is why nine of thirteen ground vehicles could quietly settle on the
  // same near-neutral grey: the hue histogram only bins pixels at s > 0.12, so
  // a grey accent contributes nothing and two grey vehicles sit at distance ~0.
  // Every other metric in this file is computed off the alpha mask, so none of
  // them could see it either.
  //
  // The 0.45 target is BORROWED from the infantry metric above, not measured
  // off RA2 — no rip-derived vehicle figure exists, and inventing one would
  // repeat the `mass.groundCombatSpan` x6.8 mistake corrected earlier in this
  // file. Its job is to make C5's work stick under the ratchet, not to encode
  // an RA2 fact; if a vehicle number is ever measured from the sprites, replace
  // this and say so here.
  'colour.vehicle.meanDist':     { want: 0.45, dir: 'up',   note: 'mean pairwise hue-histogram distance between ground-vehicle kinds. C5: a fixed ACCENT that is near-neutral grey on nine of thirteen vehicles carries no identity, because it never enters the histogram at all' },
  // The mean above is carried by the three vehicles that DO have a chromatic
  // accent (both miners and the MCV), which is precisely why C5 could go
  // unnoticed: the average looks healthy while nine of thirteen vehicles sit at
  // a pairwise distance of 0.03-0.24 from each other. C5's claim is a COUNT,
  // so this counts it directly, off the un-normalised saturation of a unit's
  // own fixed colours.
  'colour.vehicleAchromatic':    { want: 0,    dir: 'down', note: "plan C5, made falsifiable: ground vehicles whose FIXED colours carry no hue — mean saturation of their non-remap pixels below " + ACHROMATIC + ". Seven of thirteen on 2026-09-04 (Grizzly .084, Flak Track .106, Mirage .115, IFV .121, V3 .127, Terror Drone .134, Apocalypse .135) against the three the plan named as chromatic (War Miner .280, Chrono Miner .252, MCV .183). EXEMPT: units the reference explicitly paints a neutral — see ACHROMATIC_EXEMPT. NOTE the target is 0 only for the unexempted set; do not force paint onto a unit RA2 keeps grey, cite the reference and exempt it instead" },
};

// ── the page under test, served from a throwaway loopback server ──────────
const SERVE = {
  // ART_HTML points the tool at a DIFFERENT build of the page, which is how a
  // new metric is proved RED against the unfixed one before it is recorded.
  '/rts.html':      [process.env.ART_HTML || path.join(RTS, 'rts.html'), 'text/html'],
  '/gamescore.js':  [path.join(ROOT, 'shared', 'gamescore.js'), 'text/javascript'],
  '/vibe-modal.js': [path.join(ROOT, 'shared', 'vibe-modal.js'), 'text/javascript'],
};
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const hit = SERVE[req.url.split('?')[0]];
      if (!hit || !fs.existsSync(hit[0])) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-store' });
      rep.end(fs.readFileSync(hit[0]));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}

// ── in-page extraction: composed exactly as drawUnit composes ─────────────
/* c8 ignore start */
function pageExtract() {
  const S = window.__rtsTest.spr(), U = window.__rtsTables.UNITS;
  const UPAD = 27;
  const recs = [], errors = [];

  // Mirror of drawUnit's layer stack for a healthy, idle, undisguised unit.
  function compose(d, art, face) {
    // The Kirov is baked at the size it is DRAWN (`VSC.kirov = 1.30`); there is
    // no longer a 1.3x fudge at draw time to mirror. Leaving `uk` here
    // re-applied it, so the harness composed a Kirov 1.3x larger than the game
    // shows and every air metric was measured against a sprite that does not
    // exist. Flagged by the pass that removed the fudge.
    const uk = 1;
    const layers = [];
    if (Array.isArray(art)) {
      if (art.hull && art.turret) { layers.push(art.hull[face]); layers.push(art.turret[face]); }
      else if (art.lay) { const L = art.lay(); layers.push(L.hull[face]); layers.push(L.gond[face]); }
      else layers.push(art[face]);
    } else if (art.fr) {
      layers.push(art.fr('stand', face, 0));
    } else layers.push(art);
    const base = layers[0];
    const W = Math.round(base.w * uk), H = Math.round(base.h * uk);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (const s of layers) if (s) g.drawImage(s.c, 0, 0, s.w * uk, s.h * uk);
    return { g, W, H, uk };
  }

  // Owner colour, defined EMPIRICALLY. The palette is not exposed to the test
  // hook, and it does not need to be: bake the same unit as owner 0 and owner 1
  // and the pixels that CHANGE are, by construction, exactly the remap. That
  // also hands us each owner's real hue (the mean hue of its own changed
  // pixels), which is what catches a fixed drab colour impersonating an owner.
  function rgb2hs(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn;
    let h = 0;
    if (dv) {
      if (mx === r) h = ((g - b) / dv + 6) % 6;
      else if (mx === g) h = (b - r) / dv + 2;
      else h = (r - g) / dv + 4;
      h *= 60;
    }
    return { h, s: mx ? dv / mx : 0, v: mx / 255 };
  }
  function hueGap(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  for (const key of Object.keys(U)) {
    const d = U[key];
    const fk = d.fac || 'dir';
    const art = S.unit[0][fk][key];
    const artB = S.unit[1][fk][key];
    if (!art) { errors.push('no art for ' + key); continue; }
    for (let oct = 0; oct < 8; oct++) {
      const face = oct * 4;
      let cm;
      try { cm = compose(d, art, face); }
      catch (e) { errors.push(key + '@' + face + ' threw: ' + e); continue; }
      const id = cm.g.getImageData(0, 0, cm.W, cm.H).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cm.H; y++) for (let x = 0; x < cm.W; x++) {
        if (id[(y * cm.W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) { errors.push('EMPTY sprite ' + key + '@' + face); continue; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      // one byte per pixel of the bbox: 0 or 1. Masks are all the metrics need.
      const m = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
        m[y * bw + x] = id[((y + y0) * cm.W + (x + x0)) * 4 + 3] > 8 ? 1 : 0;
      let bin = '';
      for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
      // --- colour census, from the owner-0 vs owner-1 difference -----------
      let col = null;
      try {
        const cb = compose(d, artB, face);
        const ib = cb.g.getImageData(0, 0, cb.W, cb.H).data;
        let opaque = 0, remap = 0, ha = 0, hb = 0, hn = 0;
        const hist = new Float64Array(12);
        const px = [];
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const i = ((y + y0) * cm.W + (x + x0)) * 4;
          if (id[i + 3] <= 8) continue;
          opaque++;
          const dr = Math.abs(id[i] - ib[i]), dg = Math.abs(id[i + 1] - ib[i + 1]),
                db = Math.abs(id[i + 2] - ib[i + 2]);
          const changed = (dr + dg + db) > 24;
          const A = rgb2hs(id[i], id[i + 1], id[i + 2]);
          if (changed) {
            remap++;
            const B = rgb2hs(ib[i], ib[i + 1], ib[i + 2]);
            if (A.s > 0.15) { ha += A.h; hn++; }
            if (B.s > 0.15) { hb += B.h; }
          } else {
            px.push(A);
            if (A.s > 0.12) hist[Math.min(11, Math.floor(A.h / 30))] += A.s;
          }
        }
        const ownerHueA = hn ? ha / hn : 0, ownerHueB = hn ? hb / hn : 0;
        // A NON-remap pixel that sits on the OTHER owner's hue reads as that
        // player's unit. This is the Conscript's #7d5148 trousers: drab, fixed,
        // and 11 degrees off red — 39% "red" to anyone scanning by colour.
        let impostor = 0;
        for (const q of px) if (q.s > 0.25 && q.v > 0.15 && hueGap(q.h, ownerHueB) < 18) impostor++;
        let hs = 0; for (let k = 0; k < 12; k++) hs += hist[k];
        // CHROMA — the saturation the unit's own FIXED colours carry, per
        // opaque pixel. `hist` is normalised below, which throws this away, so
        // a vehicle painted entirely in greys and one painted in a real hue
        // look identical to every histogram metric. C5's claim ("nine of
        // thirteen ground vehicles picked a near-neutral grey") is a statement
        // about exactly this number, so it has to survive normalisation.
        col = { ownerPct: opaque ? remap / opaque : 0,
                impostorPct: opaque ? impostor / opaque : 0,
                chroma: opaque ? hs / opaque : 0,
                hist: Array.from(hist, (v) => (hs ? v / hs : 0)) };
      } catch (e) { errors.push(key + '@' + face + ' colour census threw: ' + e); }

      recs.push({
        key, name: d.name, cls: d.cls, fac: d.fac || null, air: !!d.air, nav: !!d.nav,
        oct, bw, bh, mask: btoa(bin), col,
      });
    }
  }
  return { recs, errors, dpr: window.devicePixelRatio, zoom: window.__rtsTest.zoom(),
           units: Object.keys(U).length };
}

// A real rendered frame, out of the live renderer — not the bake canvas.
function pageScene() {
  const T = window.__rtsTest;
  document.querySelectorAll('.show').forEach((e) => e.classList.remove('show'));
  document.body.classList.remove('atmenu');
  T.begin(7, 'normal', null, false, true);           // 5th arg: renderer ON
  const rows = [
    ['lancer', 'rhino', 'mirage', 'prismtank', 'teslatank', 'flaktrack'],
    ['mammoth', 'ifv', 'v3', 'chronominer', 'warminer', 'drone'],
    ['rifle', 'conscript', 'rocket', 'flak', 'engineer', 'tanya'],
    ['desolator', 'ivan', 'teslatrooper', 'cleg', 'spy', 'yuri'],
  ];
  const ox = 40, oy = 40; let n = 0;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const u = T.spawn(rows[r][c], 0, ox + c * 3, oy + r * 3);
    if (u) { u.face = 12; u.tface = 12; n++; }       // one common bearing
  }
  T.centerOn(ox + 7, oy + 5);
  T.zoom(1);
  for (let i = 0; i < 3; i++) T.render();
  return { spawned: n, zoom: T.zoom() };
}
/* c8 ignore stop */

// ── mask maths (pure JS; no numpy, on purpose) ────────────────────────────
function decode(rec) {
  const raw = Buffer.from(rec.mask, 'base64');
  return { w: rec.bw, h: rec.bh, d: raw };
}
/** silhouette IoU with both masks centred on their bbox centre. */
function iou(A, B) {
  const H = Math.max(A.h, B.h) + 4, W = Math.max(A.w, B.w) + 4;
  const ay = (H - A.h) >> 1, ax = (W - A.w) >> 1;
  const by = (H - B.h) >> 1, bx = (W - B.w) >> 1;
  const canvas = new Uint8Array(W * H);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++)
    if (A.d[y * A.w + x]) canvas[(y + ay) * W + (x + ax)] |= 1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++)
    if (B.d[y * B.w + x]) canvas[(y + by) * W + (x + bx)] |= 2;
  let inter = 0, union = 0;
  for (let i = 0; i < canvas.length; i++) { const v = canvas[i]; if (v) { union++; if (v === 3) inter++; } }
  return union ? inter / union : 0;
}
function mass(M) { let n = 0; for (let i = 0; i < M.d.length; i++) if (M.d[i]) n++; return n; }
function colProfile(M) {
  const p = new Int32Array(M.w);
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.d[y * M.w + x]) p[x]++;
  return p;
}
function rowProfile(M) {
  const p = new Int32Array(M.h);
  for (let y = 0; y < M.h; y++) { let n = 0; for (let x = 0; x < M.w; x++) if (M.d[y * M.w + x]) n++; p[y] = n; }
  return p;
}
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
/**
 * The spike, by unit-identity-reference.md §1.3's own method: the BODY is the
 * run of profile entries at >= 55% of the profile's max (the rule audit §3b
 * validated against the six real turret layers); the SPIKE is the thin run that
 * protrudes past it. Returns the run's length along the spike, and the median
 * cross-extent — the "2 px of thickness" the floor is about.
 */
function spikeOf(M, axis) {
  const p = axis === 'h' ? colProfile(M) : rowProfile(M);
  let mx = 0; for (let i = 0; i < p.length; i++) if (p[i] > mx) mx = p[i];
  if (!mx) return { len: 0, thick: 0 };
  const cut = 0.55 * mx;
  let lo = -1, hi = -1;
  for (let i = 0; i < p.length; i++) if (p[i] >= cut) { if (lo < 0) lo = i; hi = i; }
  // 'v' (a crown) only counts what stands ABOVE the body — the row profile runs
  // top-down, so that is the leading run. 'h' takes whichever end protrudes further.
  const runs = axis === 'v'
    ? [[0, lo]]
    : [[0, lo], [hi + 1, p.length]];
  let best = { len: 0, thick: 0 };
  for (const [a, b] of runs) {
    const vals = [];
    for (let i = a; i < b; i++) if (p[i] > 0) vals.push(p[i]);
    if (vals.length > best.len) best = { len: vals.length, thick: median(vals) };
  }
  return best;
}

function groupOf(r) {
  if (r.nav) return 'naval';
  if (r.cls === 'i') return 'infantry';
  if (r.air) return 'air';
  return 'vehicle';
}
// audit §2's "ground combat vehicles" set: the ground vehicles a player reads
// in a fight — no MCV, no miners, no drone.
// Infantry that are SUPPOSED to carry little owner colour, with the reason.
// Anything not named here is measured, so an unjustified drab trooper shows up
// as debt instead of hiding behind an average.
const HUE_EXEMPT = new Set(['dog', 'tanya']);
// Vehicles whose FIXED colour the reference explicitly names as a neutral, so
// a grey reading is the spec being honoured rather than C5 debt. Keep this set
// as small as the evidence allows: an entry needs a sentence in
// unit-identity-reference.md naming the colour, not an argument that grey suits
// the unit. Today that is one sentence, §1.4's Grizzly:
//   "**Grizzly Tank** (blue owner): two discrete panels ... on a PALE SILVER body"
// Everything else on the field is debt until its own citation turns up.
const ACHROMATIC_EXEMPT = new Set(['lancer']);
const GROUND_COMBAT = ['lancer', 'rhino', 'mammoth', 'mirage', 'prismtank',
                       'teslatank', 'flaktrack', 'ifv', 'v3'];
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function compute(recs) {
  const by = new Map(), meta = new Map();
  for (const r of recs) {
    by.set(r.key + '@' + r.oct, decode(r));
    if (!meta.has(r.key)) meta.set(r.key, r);
  }
  const keys = [...meta.keys()];
  const OCT = [0, 1, 2, 3, 4, 5, 6, 7];
  const M = (k, o) => by.get(k + '@' + o);
  const grp = {}; for (const k of keys) grp[k] = groupOf(meta.get(k));

  // per-unit basics
  const unit = {};
  for (const k of keys) {
    const ms = OCT.map((o) => mass(M(k, o)));
    const ws = OCT.map((o) => M(k, o).w), hs = OCT.map((o) => M(k, o).h);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    unit[k] = {
      name: meta.get(k).name, group: grp[k], fac: meta.get(k).fac,
      mass: round(mean(ms), 0), bboxW: Math.max(...ws), bboxH: Math.max(...hs),
      aspect: round(mean(ws.map((w, i) => w / hs[i])), 3),
    };
    // BROADSIDE, not the mean over bearings. RA2's §1.1 numbers are measured
    // on the broadside frame; the mean mixes it with the bow-on one, where a
    // ship is short by definition, so the two are not the same quantity and
    // comparing them would compare nothing.
    const bs = OCT.reduce((a, o) => (M(k, o).w > M(k, a).w ? o : a), 0);
    unit[k].broadsideWH = M(k, bs).w + 'x' + M(k, bs).h;
    unit[k].broadsideAspect = round(M(k, bs).w / M(k, bs).h, 3);
    if (RA2_ASPECT[k]) {
      unit[k].ra2Aspect = round(RA2_ASPECT[k], 3);
      unit[k].vsRA2 = round(unit[k].broadsideAspect / RA2_ASPECT[k], 3);
    }
  }
  // self-IoU across a unit's own 8 bearings
  for (const k of keys) {
    const v = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) v.push(iou(M(k, i), M(k, j)));
    unit[k].selfIoU = round(v.reduce((a, b) => a + b, 0) / v.length, 4);
  }
  // pairwise IoU, within group only (cross-group pairs are not confusable in play)
  const pair = new Map();
  const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i], b = keys[j];
    if (grp[a] !== grp[b]) continue;
    let s = 0; for (const o of OCT) s += iou(M(a, o), M(b, o));
    pair.set(pkey(a, b), s / 8);
  }
  const P = (a, b) => pair.get(pkey(a, b));

  // ── peer-vs-self: is a unit's best silhouette match a PEER, or itself at
  //    another bearing? No threshold to tune — audit §2's most diagnostic line.
  //
  // IT USED TO MEASURE ASPECT, NOT IDENTITY, and it took a fleet of tugboats
  // to expose it. The two sides were not the same quantity:
  //   self  = mean over the 28 pairs of DIFFERENT bearings
  //   peer  = mean over the 8 bearings, SAME bearing for both units
  // Rotating an elongated hull changes its mask enormously, so its self term
  // collapses while the peer term does not. For a centred rectangle of aspect
  // a the orthogonal term is exactly 1/(2a-1) — 1.00 at a=1, 0.26 at a=2.4.
  // MEASURED over all 41 units before this fix: corr(aspect, selfIoU) = -0.737
  // and corr(aspect, peersBeatingSelf) = +0.529; flagged units averaged aspect
  // 2.29 against 1.13 for the rest. In other words it punished units for being
  // DIRECTIONAL, which is the property that makes a silhouette readable, and
  // it would have argued against every correct proportion fix forever.
  //
  // Both sides now average over the SAME set of cross-bearing pairs, so the
  // aspect term appears on both and cancels. The question it asks is unchanged
  // in spirit — "across every relative orientation, is a peer's shape closer to
  // mine than my own rotations are?" — and it still has no threshold to tune.
  const crossPair = new Map();
  const ckey = (a, b) => a + '>' + b;
  const crossIoU = (a, b) => {
    const ck = ckey(a, b);
    if (crossPair.has(ck)) return crossPair.get(ck);
    let s2 = 0, n2 = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      if (a === b && i === j) continue;          // self at its own bearing is 1 by definition
      s2 += iou(M(a, i), M(b, j)); n2++;
    }
    const v2 = s2 / n2; crossPair.set(ck, v2); return v2;
  };
  for (const k of keys) unit[k].selfIoUCross = round(crossIoU(k, k), 4);
  const peerVsSelf = { total: 0, vehicle: 0, infantry: 0, naval: 0, air: 0 };
  for (const k of keys) {
    const peers = keys.filter((j) => j !== k && grp[j] === grp[k]);
    if (!peers.length) continue;
    const beaten = peers.filter((j) => crossIoU(k, j) > unit[k].selfIoUCross);
    const best = peers.reduce((x, j) => (P(k, j) > P(k, x) ? j : x), peers[0]);
    unit[k].bestPeer = unit[best].name;
    unit[k].bestPeerIoU = round(P(k, best), 4);
    unit[k].peersBeatingSelf = beaten.length;
    unit[k].peers = peers.length;
    if (beaten.length) { peerVsSelf.total++; peerVsSelf[grp[k]]++; }
  }

  // ── pairwise IoU summaries
  const groups = ['vehicle', 'infantry', 'naval', 'air'];
  const ioum = {};
  const meanOf = (ks) => {
    const v = [];
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) v.push(P(ks[i], ks[j]));
    return { mean: round(v.reduce((a, b) => a + b, 0) / v.length, 4), pairs: v.length,
             max: round(Math.max(...v), 4), over75: v.filter((x) => x > 0.75).length };
  };
  for (const g of groups) ioum[g] = meanOf(keys.filter((k) => grp[k] === g));
  ioum.groundCombat = meanOf(GROUND_COMBAT);

  // same-faction pairs over the 0.75 ceiling. A unit with no `fac` is shared,
  // so it stands in BOTH rosters and pairs with everything in its group.
  const sameFac = (a, b) => !unit[a].fac || !unit[b].fac || unit[a].fac === unit[b].fac;
  let over = 0; const overList = [];
  for (const [k, v] of pair) {
    const [a, b] = k.split('|');
    if (v > 0.75 && sameFac(a, b)) { over++; overList.push({ a: unit[a].name, b: unit[b].name, iou: round(v, 4) }); }
  }
  overList.sort((x, y) => y.iou - x.iou);
  ioum.sameFactionOver75 = over;

  // ── the spike floor (plan §2)
  let below = 0, belowBudget = 0, worst = Infinity;
  const missing = keys.filter((k) => !SPIKES[k]);
  const orphan = Object.keys(SPIKES).filter((k) => !unit[k]);
  for (const k of keys) {
    const sp = SPIKES[k];
    if (!sp) continue;
    // The broadside is the bearing where the spike protrudes furthest; that is
    // where a unit is read (reference §1.6.3 licenses the head-on collapse).
    let best = { len: -1, thick: 0 };
    for (const o of OCT) { const s = spikeOf(M(k, o), sp.axis); if (s.len > best.len) best = s; }
    const thin = best.thick < sp.budget;
    const short = sp.len != null && best.len < sp.len;
    unit[k].spike = { axis: sp.axis, len: best.len, thick: round(best.thick, 2),
                      atZmin: round(best.thick * ZMIN, 2), budget: sp.budget, lenBudget: sp.len,
                      fails: thin ? (short ? 'thin+short' : 'thin') : (short ? 'short' : null),
                      src: sp.src, feature: sp.feature };
    if (best.thick < SPIKE_FLOOR) below++;
    if (thin || short) belowBudget++;
    if (best.thick * ZMIN < worst) worst = round(best.thick * ZMIN, 2);
  }
  if (!Number.isFinite(worst)) worst = 0;

  // ── the mass hierarchy (audit §5)
  const gc = GROUND_COMBAT.slice().sort((a, b) => unit[a].mass - unit[b].mass);
  const span = unit[gc[gc.length - 1]].mass / unit[gc[0]].mass;
  let tight = Infinity, tightAt = null;
  for (let i = 0; i + 6 <= gc.length; i++) {           // the tightest 6-unit band
    const r = unit[gc[i + 5]].mass / unit[gc[i]].mass;
    if (r < tight) { tight = r; tightAt = gc.slice(i, i + 6).map((k) => unit[k].name); }
  }

  // ── colour aggregates ────────────────────────────────────────────────────
  // Per UNIT, not per sprite: average each unit's census over its 8 bearings,
  // then aggregate across units, so a unit with an unusual facing cannot skew a
  // group. Sprites whose census failed are skipped rather than counted as zero.
  const colByUnit = {};
  for (const k of keys) {
    const cs = recs.filter((r) => r.key === k && r.col).map((r) => r.col);
    if (!cs.length) continue;
    const avg = (f) => cs.reduce((a, c) => a + f(c), 0) / cs.length;
    const hist = new Array(12).fill(0);
    for (const c of cs) for (let i = 0; i < 12; i++) hist[i] += c.hist[i] / cs.length;
    colByUnit[k] = { ownerPct: avg((c) => c.ownerPct), impostorPct: avg((c) => c.impostorPct),
                     chroma: avg((c) => c.chroma), hist };
  }
  const inf = keys.filter((k) => grp[k] === 'infantry' && colByUnit[k]);
  const veh = keys.filter((k) => grp[k] === 'vehicle' && colByUnit[k]);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const infOwner = inf.map((k) => colByUnit[k].ownerPct);
  const vehOwner = veh.map((k) => colByUnit[k].ownerPct);
  // Manhattan distance between normalised hue histograms, 0..2 -> report as is.
  // Two units whose fixed colours are the same family score ~0 here even when
  // their masks are wholly different, which is the ONLY way C3/C5's placement
  // work is visible to this gate.
  const histDist = (ks) => {
    const d = [], pairs = [];
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = colByUnit[ks[i]].hist, b = colByUnit[ks[j]].hist;
      let s = 0; for (let n = 0; n < 12; n++) s += Math.abs(a[n] - b[n]);
      d.push(s);
      pairs.push({ a: ks[i], b: ks[j], dist: round(s, 3) });
    }
    pairs.sort((x, y) => x.dist - y.dist);
    return { d, pairs };
  };
  const infD = histDist(inf), vehD = histDist(veh);
  const cd = infD.d, worstColourPairs = infD.pairs;
  const impostorAll = keys.filter((k) => colByUnit[k])
    .map((k) => ({ key: k, pct: colByUnit[k].impostorPct }))
    .sort((a, b) => b.pct - a.pct);

  // ── broadside aspect against RA2's own sprites (reference §1.1) ─────────
  const ra2Asp = (() => {
    const rows = [];
    for (const k of Object.keys(RA2_ASPECT)) {
      if (!unit[k]) continue;
      rows.push({ key: k, wh: unit[k].broadsideWH, ours: unit[k].broadsideAspect,
                  ra2: round(RA2_ASPECT[k], 3), ratio: unit[k].vsRA2 });
    }
    const off = (r) => Math.abs(r.ratio - 1);
    rows.sort((a, b) => off(b) - off(a));
    // Per GROUP, because the two directions are different faults with
    // different causes: our vehicles and hulls are systematically SHORTER than
    // RA2's (the naval pass measured a consistent ~15% that is the isometric
    // camera, not the art), while our infantry are systematically WIDER, which
    // is not a camera effect at all.
    const byG = (g) => rows.filter((r) => (unit[r.key] || {}).group === g);
    const cnt = (rs) => rs.filter((r) => off(r) > RA2_ASPECT_BAND).length;
    const wor = (rs) => (rs.length ? round(Math.max(...rs.map(off)), 4) : 0);
    return { rows,
             outside: rows.filter((r) => off(r) > RA2_ASPECT_BAND).length,
             worstOff: rows.length ? round(off(rows[0]), 4) : 0,
             navalOutside: cnt(byG('naval')), navalWorst: wor(byG('naval')),
             vehOutside: cnt(byG('vehicle')), vehWorst: wor(byG('vehicle')),
             infOutside: cnt(byG('infantry')), infWorst: wor(byG('infantry')),
             airOutside: cnt(byG('air')), airWorst: wor(byG('air')) };
  })();

  return {
    metrics: {
      'peerVsSelf.total': peerVsSelf.total,
      'peerVsSelf.vehicle': peerVsSelf.vehicle,
      'peerVsSelf.infantry': peerVsSelf.infantry,
      'peerVsSelf.naval': peerVsSelf.naval,
      'peerVsSelf.air': peerVsSelf.air,
      'iou.groundCombat.mean': ioum.groundCombat.mean,
      'iou.vehicle.mean': ioum.vehicle.mean,
      'iou.infantry.mean': ioum.infantry.mean,
      'iou.naval.mean': ioum.naval.mean,
      'iou.air.mean': ioum.air.mean,
      'iou.sameFactionOver75': ioum.sameFactionOver75,
      'spike.belowFloor': below,
      'spike.minThickAtZmin': worst,
      'spike.belowDeclaredBudget': belowBudget,
      'mass.groundCombatSpan': round(span, 3),
      'mass.tightestBand6': round(tight, 3),
      'hue.infantryOwnerMean': round(mean(infOwner), 4),
      'hue.infantryBelowBudget': inf.filter((k) => !HUE_EXEMPT.has(k) && colByUnit[k].ownerPct < 0.20).length,
      'hue.vehicleOwnerMean': round(mean(vehOwner), 4),
      'hue.vehicleOwnerMax': round(Math.max(...vehOwner), 4),
      'hue.maxImpostor': round(impostorAll.length ? impostorAll[0].pct : 0, 4),
      'aspect.navalOutsideRA2Band': ra2Asp.navalOutside,
      'aspect.navalWorstOffRA2': ra2Asp.navalWorst,
      'aspect.vehicleOutsideRA2Band': ra2Asp.vehOutside,
      'aspect.infantryOutsideRA2Band': ra2Asp.infOutside,
      'aspect.airOutsideRA2Band': ra2Asp.airOutside,
      'colour.infantry.meanDist': round(mean(cd), 4),
      'colour.vehicle.meanDist': round(mean(vehD.d), 4),
      'colour.vehicleAchromatic': veh.filter((k) => !ACHROMATIC_EXEMPT.has(k) && colByUnit[k].chroma < ACHROMATIC).length,
    },
    detail: {
      // Per-unit numbers, exported so the METRICS themselves can be audited.
      // Without these you cannot ask "is this metric measuring identity, or is
      // it measuring aspect?" — which is exactly the question the naval pass
      // raised and could not answer from the tool's own output.
      perUnit: Object.fromEntries(keys.map((k) => [k, {
        group: grp[k], aspect: unit[k].broadsideAspect, selfIoU: unit[k].selfIoU,
        selfIoUCross: unit[k].selfIoUCross,
        broadsideAspect: unit[k].broadsideAspect, ra2Aspect: unit[k].ra2Aspect, vsRA2: unit[k].vsRA2,
        bestPeer: unit[k].bestPeer, bestPeerIoU: unit[k].bestPeerIoU,
        peersBeatingSelf: unit[k].peersBeatingSelf,
      }])),
      counts: { units: keys.length, sprites: recs.length,
                perGroup: Object.fromEntries(groups.map((g) => [g, keys.filter((k) => grp[k] === g).length])) },
      iouGroups: ioum,
      worstSameFactionPairs: overList.slice(0, 12),
      closestColourPairs: worstColourPairs.slice(0, 10),
      closestVehicleColourPairs: vehD.pairs.slice(0, 10),
      topImpostors: impostorAll.slice(0, 8).map((r) => ({ key: r.key, pct: round(r.pct, 4) })),
      ownerPctByUnit: Object.fromEntries(keys.filter((k) => colByUnit[k])
        .map((k) => [k, round(colByUnit[k].ownerPct, 4)])),
      chromaByUnit: Object.fromEntries(keys.filter((k) => colByUnit[k])
        .map((k) => [k, round(colByUnit[k].chroma, 4)])),
      // Stated three ways, because the gate's headline is a mean over all
      // fourteen and reference §1.4 reports a MEDIAN over RA2's rips. Nobody
      // should have to re-derive which comparison they are looking at.
      hue: (() => {
        const srt = infOwner.slice().sort((x, y) => x - y);
        const mid = srt.length % 2 ? srt[(srt.length - 1) / 2]
                                  : (srt[srt.length / 2 - 1] + srt[srt.length / 2]) / 2;
        const kept = inf.filter((k) => !HUE_EXEMPT.has(k)).map((k) => colByUnit[k].ownerPct);
        return { infantryOwnerMedian: round(mid, 4), infantryOwnerMeanUnexempt: round(mean(kept), 4),
                 exempt: [...HUE_EXEMPT], n: infOwner.length };
      })(),
      tightestMassBand: tightAt,
      ra2Aspect: ra2Asp.rows,
      units: Object.fromEntries([...keys].sort().map((k) => [k, unit[k]])),
    },
    missing, orphan,
  };
}

// ── the ratchet's vocabulary ──────────────────────────────────────────────
// `dir` says which way is BETTER for a metric, so the gate can tell a
// regression ("worse than the baseline — fix it") from an improvement
// ("better — re-record the baseline so the gain sticks").
function dirOf(name) { return (TARGETS[name] && TARGETS[name].dir) || 'down'; }
function better(name, v, ref) { return dirOf(name) === 'down' ? v < ref : v > ref; }
function debtOf(name, v) {
  const t = TARGETS[name];
  if (!t) return null;
  const gap = t.dir === 'down' ? v - t.want : t.want - v;
  return gap > 1e-9 ? round(gap, 4) : 0;
}

async function measure(opts) {
  opts = opts || {};
  const pw = playwright();
  const srv = await serve();
  const port = srv.address().port;
  const b = await pw.chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
    const pageErrs = [];
    p.on('pageerror', (e) => pageErrs.push('pageerror: ' + e));
    p.on('console', (m) => { if (m.type() === 'error') pageErrs.push('console.error: ' + m.text()); });
    await p.goto(`http://127.0.0.1:${port}/rts.html`);
    await p.waitForFunction(() => !!window.__rts && !!window.__rtsTables && !!window.__rtsTest,
      null, { timeout: 30000 });

    const raw = await p.evaluate(pageExtract);
    // A live frame, and a look at it — headless numbers pass while the
    // renderer throws (plan §5).
    const scene = await p.evaluate(pageScene);
    await p.waitForTimeout(300);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__rtsTest.render(); });
    fs.mkdirSync(path.dirname(FRAME_PNG), { recursive: true });
    const el = await p.$('canvas');
    if (el) await el.screenshot({ path: FRAME_PNG });

    const out = compute(raw.recs);
    out.env = { dpr: raw.dpr, zoom: raw.zoom, ZMIN, spikeFloorAtZoom1: round(SPIKE_FLOOR, 2),
                units: raw.units, sprites: raw.recs.length,
                scene, framePng: path.relative(ROOT, FRAME_PNG) };
    out.bakeErrors = raw.errors;
    out.pageErrors = pageErrs;
    return out;
  } finally {
    await b.close();
    srv.close();
  }
}

function report(m) {
  const L = [];
  L.push('unit-art metrics — zoom 1, DPR 1, 8 bearings, composed as drawUnit composes');
  L.push(`  ${m.env.units} units / ${m.env.sprites} sprites; live frame -> ${m.env.framePng}`);
  L.push('');
  L.push('  metric                          measured    plan target     remaining debt');
  for (const [k, v] of Object.entries(m.metrics)) {
    const t = TARGETS[k];
    const gap = t ? (t.dir === 'down' ? v - t.want : t.want - v) : 0;
    L.push(`  ${k.padEnd(30)} ${String(v).padStart(8)}  ${t ? (t.dir === 'down' ? '<= ' : '>= ') + t.want : ''.padStart(8)}`.padEnd(64)
      + (t && gap > 1e-9 ? `debt ${round(gap, 4)}` : t ? 'MET' : ''));
  }
  return L.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf('--json');
  const m = await measure();
  if (m.bakeErrors.length) { console.error('BAKE ERRORS:', m.bakeErrors); process.exitCode = 1; }
  if (m.pageErrors.length) { console.error('PAGE ERRORS:', m.pageErrors); process.exitCode = 1; }
  if (m.missing.length) { console.error('UNITS with no SPIKES entry:', m.missing); process.exitCode = 1; }
  if (m.orphan.length) { console.error('SPIKES entries with no unit:', m.orphan); process.exitCode = 1; }
  console.log(report(m));
  const payload = {
    _: 'Recorded by apps/games/rts/tools/art-metrics.js — do not hand-edit except to '
     + 'RE-RECORD after a deliberate art improvement (node apps/games/rts/tools/art-metrics.js --record). '
     + '`metrics` is ratcheted by apps/games/rts/rts-art.test.js: a regression fails, and so does an '
     + 'improvement, which is what makes progress stick. `detail` is informational only.',
    recorded: new Date().toISOString().slice(0, 10),
    env: m.env, targets: TARGETS, metrics: m.metrics, detail: m.detail,
  };
  if (jsonAt >= 0 && argv[jsonAt + 1]) {
    fs.writeFileSync(argv[jsonAt + 1], JSON.stringify(payload, null, 2) + '\n');
    console.log('\nwrote ' + argv[jsonAt + 1]);
  }
  if (argv.includes('--record')) {
    fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
    console.log('\nre-recorded ' + path.relative(ROOT, BASELINE));
  }
}

module.exports = { SPIKES, TARGETS, ZMIN, SPIKE_FLOOR, BASELINE, FRAME_PNG,
                    measure, report, compute, dirOf, better, debtOf };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
