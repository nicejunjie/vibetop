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
const RA2_BBOX = {
  // ---- vehicles (unit-identity-reference.md §1.1) ----
  drone: [21, 14],  // [DRON]    21x14
  hornet: [27, 15],  // [HORNET]  27x15
  flaktrack: [45, 45],  // [HTK]     45x45 — square, and so is ours
  ifv: [50, 45],  // [FV]      50x45
  teslatank: [52, 37],  // [TTNK]    52x37
  lancer: [54, 23],  // [GTNK]    54x23 — the Grizzly
  chronominer: [55, 28],  // [CMIN]    55x28
  rhino: [56, 28],  // [HTNK]    56x28
  mammoth: [59, 34],  // [MTNK]    59x34 — the Apocalypse. CORRECTED 2026-09-05 from
                      // the 56x41 the document carried: that is a mid bearing, not the
                      // broadside. Measured off the real eight-bearing sheet, and the
                      // sheet also contains a 59x43 = 1.37 frame, which is where the old
                      // number came from. See docs/ra2-ref/sprites/README.md
  warminer: [56, 48],  // [HARV]    56x48
  mirage: [59, 39],  // [RTNK]    59x39
  prismtank: [59, 43],  // [SREF]    59x43
  v3: [63, 36],  // [V3]      63x36
  nighthawk: [64, 21],  // [SHAD]    64x21
  mcv: [69, 47],  // [AMCV]    69x47
  harrier: [71, 44],  // [ORCA]    71x44 — measured by SPAN, wings out
  kirov: [139, 62],  // [ZEP]    139x62 — the largest airframe in the game
  // ---- infantry (same table) ----
  dog: [21, 15],  // [ADOG]    21x15, running
  ivan: [12, 25],  // [IVAN]    12x25
  engineer: [13, 25],  // [ENGINEER]13x25
  rocketeer: [16, 24],  // [JUMPJET] 16x24
  cleg: [15, 26],  // [CLEG]    15x26
  tanya: [13, 26],  // [TANY]    13x26
  conscript: [13, 27],  // [E2]      13x27
  rifle: [12, 28],  // [E1]      12x28
  teslatrooper: [18, 28],  // [SHK]     18x28
  yuri: [12, 29],  // [YURI]    12x29
  flak: [12, 37],  // [FLAKT]   12x37, gun up
  // ---- naval ----
  destroyer: [101, 41],   // [DEST]  101x41
  aegis: [91, 35],   // [AEGIS]  91x35
  carrier: [143, 52],   // [CARRIER] 143x52 — the largest sprite in RA2
  dread: [133, 45],   // [DRED]  133x45
  squid: [117, 30],   // [SQD]   117x30
  sub: [75, 14],   // [SUB]    75x14 — the flattest hull afloat
  seascorp: [59, 32],   // [HYD]    59x32
};
// Derived, so the bbox above is the single source of truth for both the shape
// check (this) and the SIZE check further down. RA2_BBOX is what the reference
// document actually records; an aspect is a thing we compute from it.
const RA2_ASPECT = Object.fromEntries(
  Object.entries(RA2_BBOX).map(([k, [w, h]]) => [k, w / h]));
const RA2_ASPECT_BAND = 0.20;
// Wider than the aspect band: a unit's SIZE carries real design intent (a
// Kirov should dwarf a Hornet) and the group median is a coarser reference
// than a per-unit one, so 0.25 flags the mis-drawn without arguing about the
// merely large.
const RA2_SIZE_BAND = 0.25;

// ── RA2'S OWN STRUCTURES ──────────────────────────────────────────────────
// Everything above measures UNITS. Buildings had no external number of any
// kind: not in `size`, not in `aspect`, not in `peerVsSelf`, and
// unit-identity-reference.md §2 states no pixel budget for a single one of
// them. So nothing had ever been kept on a structure's size, and the first
// measurement said the Battle Lab was 306 px tall — the tallest sprite in the
// game, on a 3x2 foundation, taller than the 4x4 Construction Yard.
//
// THE UNIT OF COMPARISON IS THE FOOTPRINT DIAMOND, and that is what makes
// this an external check rather than a self-comparison. Both renderers build
// a structure's ground plot from the SAME datum — `Foundation=` in art.ini —
// so a `gw x gh` building stands on a diamond (gw+gh)*cellW/2 wide and
// (gw+gh)*cellH/2 tall in either game. RA2's cell is 60x30; ours is 64x32.
// Expressing a sprite as a MULTIPLE OF ITS OWN DIAMOND therefore
// cancels the cell size and every zoom, exactly the way `RA2_ASPECT` cancels
// our units being 0.88-1.42x of RA2's scale. Nothing an art commit writes can
// move the reference.
//
// HOW THESE NUMBERS WERE TAKEN (2026-09-05). RA2's own sprites, at 1:1, from
// two sources, and each one was LOOKED AT with its measured bbox drawn on it
// before it was written down:
//   * four chroma-keyed SHP renders (`C&C-RA2-ggcnstdm/ngcnstdm/ngtsladm/
//     ggprisdm.gif`) — a blue key, so the bbox is exact;
//   * eleven in-game captures whose palettes are <= 256 colours and whose
//     1-px mast highlights are hard-edged, i.e. NATIVE pixels, not resamples.
//     The Allied Barracks capture (13,646 colours — a smoothed upload) was
//     measured, found to be a resample, and THROWN AWAY rather than used.
// The bbox includes the building's own ground bib, because ours does too
// (`plot()` draws the plate as part of the sprite); it excludes the terrain.
//
// FRAME 0, ALWAYS, and this is not a detail. The four keyed files are ANIMATIONS
// and PIL hands back DELTA frames, so both "just take the max over the frames"
// readings are traps at once. Composite them properly and [GAPRIS]'s widest
// frame is 136x175 against its idle 57x104 — that is the prism BEAM, not the
// tower; [NATSLA] goes 42x81 -> 81x96, which is the lightning. Read them
// WITHOUT compositing and the deltas lie the other way: the Soviet Construction
// Yard came out 239x153 on the first pass here (its idle is 204x153) and one
// frame measured as empty. Our side of the comparison is `A.s`, the structure's
// own idle frame, so RA2's must be frame 0 too.
//
// WHY `Height=` IS NOT USED AS A BUDGET. art.ini gives every structure a
// `Height=` in cells and it is tempting: [GATECH] 12 against [GAPILL] 1 ranks
// the roster correctly. It is NOT a pixel budget, and the four keyed renders
// prove it — rise above the diamond per Height cell comes out 4.25 px on
// [GACNST], 5.5 on [NACNST], 10.2 on [NATSLA] and 12.3 on [GAPRIS], a 2.9x
// spread. Converting it would have been the `mass.groundCombatSpan` x6.8
// mistake again: an authoritative-looking number applied to a quantity it
// does not measure. It is kept below as `ht` for the record and for ORDERING
// only, never as a target.
//
// AND THE ORDERING WAS TRIED, because it is the obvious way to cover the
// structures that have no sprite: rank all 39 by `Height=`, rank ours by rise
// above the diamond, and count the pairs where RA2 says A is at least two
// cells taller than B and we draw A shorter. Measured: 87 inversions out of
// 496 ordered pairs. It is NOT shipped as a gate, because it cannot tell a
// defect from the same non-linearity above — the list it produces is led by
// `lab:dir` (Height 12, rise 165) under `barracks:col` (Height 9, rise 182),
// and the direct sprite comparison says BOTH of those are correct, at 1.08 and
// 1.13 of the house scale. `[NAMISL]`'s Height=8 is a missile's clearance out
// of a silo that is mostly below grade; `[GAGAP]`'s 6 is a mast. A gate whose
// failures cannot be argued as defects is the thing this file exists not to
// be. Recorded here so the next pass does not re-derive it.
//
// AND IT IS WHY THE TOWERS SURVIVE. A rule of the form "no building may be
// more than N footprint-heights tall" would flatten the Tesla Coil and the
// Prism Tower, which are towers and are SUPPOSED to be tall. This table does
// not have that failure mode, because each building is compared to ITSELF in
// RA2: [GAPRIS] really is 3.47 footprint-heights and passes at 3.94, while
// [NATSLA] is 2.70 and ours fails at 4.34. Same shape of object, opposite
// verdicts, decided by the reference rather than by a rule.
//
// `w`/`h` are RA2's measured sprite bbox in RA2 pixels; `foot` is its
// `Foundation=`, carried here so the reference is complete on its own and a
// disagreement with OUR footprint shows up as a bug rather than as a silent
// rescale.
const RA2_BLD = {
  'base:dir':        { sec: 'GACNST', foot: '4x4', w: 213, h: 137, ht: 4,  src: 'sprites/buildings/allied-construction-yard.gif frame 0 (blue key)' },
  'base:col':        { sec: 'NACNST', foot: '4x4', w: 204, h: 153, ht: 6,  src: 'sprites/buildings/soviet-construction-yard.gif frame 0 (blue key)' },
  'power:dir':       { sec: 'GAPOWR', foot: '2x2', w: 86,  h: 93,  ht: 4,  src: 'RA2 Power Plant.png, 244 colours, tight crop' },
  'refinery:dir':    { sec: 'GAREFN', foot: '4x3', w: 169, h: 132, ht: 4,  src: 'RA2 Ore Refinery.gif, 234 colours' },
  // MEASURED BY EYE, at 4x, because this is the one file in the corpus that
  // defeats segmentation: `soviet-barracks.png` is a SCENE, and the statue's
  // steel sits at the same VALUE as the road it stands on, so a tolerance
  // sweep collapses to a 16x14 blob at every threshold. The row previously
  // carried 117x205 — the whole IMAGE FILE, road included — which flattered
  // our own barracks into an acquittal it had not earned.
  // The building spans x 11-97, y 8-172: rifle tip to the base plate's south
  // vertex, with ~33 rows of paved apron below it that are terrain, not
  // structure.
  'barracks:col':    { sec: 'NAHAND', foot: '2x2', w: 86, h: 165, ht: 9,  src: 'soviet-barracks.png measured by eye at 4x (x 11-97, y 8-172); the file is a scene and its lower ~33 rows are road. The statue IS the building' },
  'factory:dir':     { sec: 'GAWEAP', foot: '5x3', w: 207, h: 155, ht: 4,  src: 'RA2 Allied War Factory.gif, 224 colours (h includes the flag the auto-bbox cut)' },
  'radar:col':       { sec: 'NARADR', foot: '2x2', w: 103, h: 136, ht: 6,  src: 'RA2 Radar Tower.png, tight crop' },
  'depot:col':       { sec: 'NADEPT', foot: '4x3', w: 161, h: 146, ht: 6,  src: 'RA2 Soviet Service Depot.gif' },
  'lab:dir':         { sec: 'GATECH', foot: '3x2', w: 120, h: 213, ht: 12, src: 'RA2 Allied Battle Lab.gif, 247 colours — drum stack + four antenna masts. RA2 DOES draw this one 2.84 footprint-heights tall; it is the tallest structure in the game and art.ini agrees (Height=12, three times the Construction Yard)' },
  'lab:col':         { sec: 'NATECH', foot: '3x3', w: 152, h: 168, ht: 8,  src: 'RA2 Soviet Battle Lab.gif — the onion dome, cross included' },
  'reactor:col':     { sec: 'NANRCT', foot: '4x4', w: 166, h: 129, ht: 4,  src: 'RA2 Nuclear Reactor.gif, 241 colours' },
  'tesla:col':       { sec: 'NATSLA', foot: '1x1', w: 42,  h: 81,  ht: 5,  src: 'sprites/buildings/tesla-coil.gif frame 0 (blue key)' },
  'prism:dir':       { sec: 'GAPRIS', foot: '1x1', w: 57,  h: 104, ht: 6,  src: 'sprites/prism-tower.png = C&C-RA2-ggprisdm.gif frame 0 (blue key)' },
  'shipyard:col':    { sec: 'NAYARD', foot: '4x4', w: 176, h: 200, ht: 10, src: 'RA2 Soviet Naval Yard.png (h includes the crane tip the auto-bbox cut)' },
  'grandcannon:dir': { sec: 'GTGCAN', foot: '2x2', w: 117, h: 85,  ht: 3,  src: 'docs/ra2-ref/sprites/grand-cannon.png, already in the repo and verified by eye there' },
};
// Same band as the aspect gate, and for the same reason: our isometric camera
// is not bit-identical to RA2's and a tighter band would fail on projection
// error rather than on art. It is applied to a building's deviation from the
// GROUP's own median scale, not to the raw ratio — buildings, like units, are
// allowed a deliberate house scale (they bake at ~1.2x RA2 relative to the
// grid, in line with vehicles at 1.27x); what is not allowed is one structure
// drawn to a different scale from its neighbours.
const RA2_BLD_BAND = 0.20;

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
  // THE LENGTH DEMAND IS DROPPED, and it is the GATE that was wrong, not the art.
  // `spikeOf` finds the run where the profile falls below 55% of max — it
  // measures a PROTRUSION CLEAR OF THE BODY. The citation asks for a rifle
  // "9 px LONG held horizontal", which is the whole rifle, most of which lies
  // ACROSS the torso. Demanding 9 columns of protrusion is a stricter thing
  // than the sentence it quotes, and RA2 settles it: [CLEG] is 15 px WIDE IN
  // TOTAL while carrying that rifle, so 9 px of it cannot be standing clear of
  // a body — there would be 6 px of man left.
  //
  // This was measured the expensive way first. With len 9 in place the unit's
  // two budgets are mutually exclusive: at his RA2-relative height the band
  // allows 24 px and the rifle claims 9, leaving 15 for the figure §2.1 calls
  // the WIDEST Allied infantry. Five routes were built and each traded one
  // gate for another, which is the signature of a contradictory spec rather
  // than of bad art.
  //
  // The thickness FLOOR still applies, so the rifle must still survive ZMIN.
  // A protrusion-based length demand for this unit would need a number §2.1
  // does not give, so none is invented here. `spy` carries `len: null` for the
  // same reason: a hat brim is not a spike either.
  cleg:         { axis: 'h', budget: FLOOR, len: null, src: 'rifle >= 9 px LONG held horizontal — a LENGTH, and spikeOf measures PROTRUSION, so this cannot be checked as a spike run; see the note above',
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
  // THE <= 0 TARGET IS UNREACHABLE FOR ELONGATED GROUPS, and there is now
  // evidence rather than suspicion. When the fleet was wrong this could not be
  // told apart from a real fault; now that every naval, vehicle and infantry
  // unit sits INSIDE RA2's aspect band, the units still flagged are:
  //     aegis, destroyer, dread, squid, sub, v3
  // — the six longest on the board, mean aspect 2.68 against 1.22 for the 35
  // that are clean. Their proportions are verified correct against RA2's own
  // sprite bboxes, so the flag cannot be reporting a proportion fault.
  //
  // corr(aspect, peersBeatingSelf) is +0.477 AFTER the metric's asymmetry was
  // repaired (it was +0.529 before, +0.487 immediately after). The repair made
  // both sides average over the same bearing pairs, which removed the
  // indefensible part; what remains is that ten long low hulls genuinely do
  // resemble each other BY MASK. legibility.js — which sees colour, value and
  // superstructure — finds ZERO confusable naval pairs in all three windows.
  //
  // So this debt is a property of a MASK-ONLY comparison of a correctly
  // proportioned fleet, not unfinished art. Do not "close" it by making ships
  // rounder: that is exactly the tugboat error the aspect gate exists to catch.
  //
  // AND IT IS NOW A PROOF, NOT A CORRELATION (2026-09-06). Elongation is the
  // correlate; the CAUSE is how much a unit's silhouette SWINGS as it turns,
  // and elongated things swing most. `tools/peer-vs-self-control.js` runs the
  // arithmetic below on filled RECTANGLES, which cannot carry an art defect:
  // eight at the V3's own measured aspects, against eight identical ones at
  // their mean, give a margin of -0.0786 against the V3's measured -0.0787.
  // The whole of that unit's failure is reproduced with no missile, no truck
  // and no pixels. The control's sweep flips sign at a swing of 1.0, so the
  // only silhouette this row cannot fault is one that does not change as the
  // unit turns — the opposite of what it is for.
  //
  // The 2026-09-05 repair argued the aspect term "appears on both and
  // cancels". What cancels is a CONSTANT aspect; what survives is a CHANGING
  // one, because `self` is the mean dissimilarity WITHIN a unit's cloud of
  // eight silhouettes while `peer` is the mean from that cloud to another
  // unit's, and a compact peer near the cloud's centre beats the cloud's own
  // spread. That is a property of means. Repairing it moves all six rows at
  // once and wants its own pass; until then, do not spend art against it.
  'peerVsSelf.total':            { want: 0,    dir: 'down', note: 'reference §1.2/§0 bar: no unit beaten by a peer. SEE THE NOTE ABOVE — the residue is elongation, not art' },
  'peerVsSelf.vehicle':          { want: 0,    dir: 'down', note: 'audit §2: 11 of 13 today. The one flagged is the V3, the only vehicle whose silhouette is a long member held at an angle ABOVE the hull, so it swings from an 80x55 diagonal to a 39x70 near-vertical to a 39x45 box across the eight bearings — aspect swing 2.61, second only to the Grizzly and the largest that has peers its own size. MEASURED, one lever at a time: dropping the rail rise to ZERO (the missile flat on the bed) leaves it beaten by 2, lengthening the truck 22 -> 28 makes it 5, narrowing the beam 19 -> 15 makes it 5, and DELETING THE MISSILE ENTIRELY still leaves it beaten by 2 while opening aspect.vehicleOutsideRA2Band and clause.vehicleUnmet. There is no V3 that passes this row. See the block note above and tools/peer-vs-self-control.js' },
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
  'aspect.airOutsideRA2Band':    { want: 0,    dir: 'down', note: 'The Harrier was CLOSED at span 13.4 (1.21 -> 0.98). The wing() call is genuinely shared with the Hornet — both fall through the same `else` off `kind === kirov` — so the Hornet moves too, 0.97 -> 0.89, still well inside the band; total error across the pair 0.24 -> 0.13, and harrier|nighthawk in the union window IMPROVES 51.7 -> 52.4. An earlier pass refused this change on numbers from a BROKEN sweep that widened only the far wing of four calls, producing an asymmetric jet whose widest bearing flipped. || The NIGHTHAWK closed last, 1.622 -> 2.606 (0.53 -> 0.86 of RA2), and it took three wrong causes first. It was NOT the disc: mrR 15/19/23 moves the aspect 1.585/1.622/1.755, because an iso-squashed circle is 2:1 by construction and shrinking it loses width as fast as height. It was NOT `len`: sweeping 34/42/50 does not move the third decimal, because `len` sizes only the cabin (`len * 0.30`). It was the TAIL BOOM, a separate constant (`bmB`), which ended under the disc at 16.5 — plus a landing gear splayed 5 px under the belly and a cabin as deep as it was long. Boom 26 / gear tucked to `by-4.4` / cabin 6.4 -> 5.0 / mast 9.6 -> 8.0 / mrR 19 -> 16 (derived: a UH-60 rotor is 0.83 of overall length, and the airframe now runs 38 units). The sheet had to grow to 136 px with it — at 26 units the boom reached 48 px from the anchor and octants 3 and 7 came back with the fin sliced flat against a 104 px canvas, so the FIRST measurement of the fix was of a clipped sprite. || the same check for AIRCRAFT. The Nighthawk was 1.62 against RA2\'s 3.05 — the single worst offender on the whole board at 0.53 of reference, a helicopter drawn barely half as long as it should be' },
  // SIZE, the axis every gate above is blind to (aspect is scale-invariant).
  // Per-unit reference is RA2's own bbox width; normalisation is the GROUP's
  // median of ours/RA2, so our deliberate per-group scales are respected and
  // only a unit mis-drawn against its OWN peers is flagged. Full rationale at
  // the ra2Size block.
  'size.navalOutsideRA2Band':    { want: 0,    dir: 'down', note: 'the fleet is the proof this standard is REACHABLE rather than a wish: 7 hulls, spread 1.06x, every one within 5% of the group scale, and it was 0 the day the metric was written. That is what a group rebuilt by proportion looks like' },
  'size.vehicleOutsideRA2Band':  { want: 0,    dir: 'down', note: 'the same check for GROUND vehicles; spread 1.66x and 1 outside on the day it was added — the Apocalypse at +25%, drawn 89 px against RA2\'s 56 where the group scale says 71. Note the Prism Tank (+21%), Chrono Miner (-21%), Drone (+20%) and MCV (+20%) sit just inside the band, so this group is the least uniform after air' },
  'size.infantryOutsideRA2Band': { want: 0,    dir: 'down', note: 'the same check for INFANTRY; spread 1.59x and 1 outside — the DOG at +31%, 39 px against RA2\'s 21 where the group scale says 30. Every man is within 18%, so the dog is the outlier among its own kind, not evidence the scale is wrong' },
  'size.airOutsideRA2Band':      { want: 0,    dir: 'down', note: 'the WORST group on this axis: spread 1.83x. The Nighthawk left the 2026-09-05 aspect pass at 86 px broadside against the Harrier\'s 52, where RA2 has [SHAD] 64 against [ORCA] 71 — ours 1.65x the jet where RA2 draws it 0.90x. The aspect pass that produced it was correct and this number is why it was not the whole story: a unit can reach the right SHAPE at the wrong SIZE and no scale-invariant gate will ever say so' },
  // Integrity, not aesthetics: does the sprite we measured survive its own sheet?
  // The Engineer's ONE read, which had no measurement until 2026-09-05.
  'value.soldiersLighterThanEngineer':{ want: 0, dir: 'down', note: '§2.2 calls the Engineer "the ONLY light-value soldier on the field" and every other infantryman "mid-to-dark" — so this is his identity stated as a number, and the number was 2 on the day it was written: the Tesla Trooper at 32.3% of torso+legs above value 0.75 and Tanya at 27.9%, against the Engineer\'s 26.0%. His SPIKES entry measures the TOOLBOX, so the read that actually names him was never checked. The dog is excluded: he is not a soldier and his coat is a fixed tan' },
  'value.engineerLightPct':          { want: 0.55, dir: 'up', note: 'the same clause as a fraction — §2.2 asks "body value >= 0.75 across >= 55% of the torso+legs". Measured over the whole sprite here, which is the quantity the bake can see; the helmet makes it read slightly high against the row\'s torso+legs wording, so treat 0.55 as a floor rather than a match. Kept alongside the ordering because they fail differently: a roster that goes pale WITH him leaves him first and still unreadable' },
  'value.engineerMarginOverNext':    { want: 0.15, dir: 'up', note: 'how far clear of the second-lightest infantryman he stands. The read is a CONTRAST, so a dead heat is a failure even when he wins it — coming first by a point would satisfy the ordering and still leave a player unable to pick him out of a squad, which is the whole job of an inverted value' },
  // §2's pixel budgets, checked one clause at a time (tools/clause-checks/).
  // STRUCTURES. Everything above this line is about units; these four are the
  // first numbers ever kept on a building.
  'size.bldOutsideRA2Band':      { want: 0,    dir: 'down', note: "structures more than +-20% off the BUILDING house scale, measured as sprite-height-over-footprint-diamond against RA2's own sprite for that same structure (see RA2_BLD). 15 of the 43 buildable structures carry a real RA2 measurement; the rest are unreferenced and therefore ungated, which is debt this metric makes VISIBLE (detail.bldSummary.covered) rather than hides. THREE were outside on the day it was added and two were fixed in the same pass: the Tesla Coil at 1.61x RA2 (139 px on a 1x1 -> 103) and the Soviet Battle Lab at 1.55 (278 -> 202, VPOW lab 1 -> 0, which also took the Allied lab 306 -> 245). The third was the ALLIED POWER PLANT at 1.40, closed 2026-09-06 (139 -> 127 px, dev 0.2202 -> 0.1149) and NOT by the lever the previous note nominated. That note said the vertical-scale lever was blocked because the plant's ground pad is a private `octa()` outside `plot()`'s VS division. Two things are wrong with it. `VS` is `Math.max(1, ...)` and `FOOT0.power` is 4 against a 2x2 plot, so VS is exactly 1 here and the lever is inert in BOTH directions -- it can only ever GROW a structure whose Foundation= moved, and this one's never did. And the pad is not what sets the sprite's bottom: the 36 px below the ground line are the SHARED bevelled platform every land structure stands on, which is drawn through `plot()` and was protected all along. The actual defect was per-element and visible in the rip: [GAPOWR] is three IDENTICAL capacitor towers staggered across the pad, and ours drew the back column at 42 px against the front pair's 25 and 23. The back tower sets the top row, so that difference WAS the height error. One shared COL_H of 30 for all three, the stagger left to placement -- which is both the size fix and the more faithful sprite. NOTE WHAT THIS METRIC ACQUITS — the Allied Battle Lab was the tallest sprite in the game at 306 px on a 3x2 plot, 3.83 footprint-heights, and the raw ratio reads like a 3.8x blunder. RA2's own [GATECH] is 2.84 footprint-heights and art.ini gives it Height=12, three times the Construction Yard's: the real error was 11%, not 3.8x. The Soviet Barracks is the same story and was not touched at all — 3.84 footprint-heights, because RA2 draws [NAHAND] as a statue and measures 3.42" },
  'size.bldWorstOffHouseScale':  { want: 0.20, dir: 'down', note: "the furthest any structure sits from the building house scale, as |ours/RA2 / median - 1|. 0.33 (the Tesla Coil) before that pass, 0.22 (the Allied Power Plant) after it, and 0.1586 (the Soviet Radar Tower) since the plant came down on 2026-09-06 -- note what that hands over: the number now names a DIFFERENT structure, and the next 0.02 of headroom costs the Radar Tower, not the plant. Kept beside the count because a count can go to zero while one structure sits just inside the band, and because this is the number that moves when a fix is partial. Watch the interaction: the house scale IS the median of the fifteen, so fixing a tall structure pulls the median DOWN and can push a second one over the band — which is what happened here, the median falling 1.21 -> 1.15 as the coil and the two labs came down. That is the metric working, not thrashing: the median was being held up by the very structures that were wrong" },
  'size.bldFootprintMismatch':   { want: 0,    dir: 'down', note: "structures whose BLDS `gw x gh` disagrees with the `Foundation=` recorded in RA2_BLD. Zero today — every footprint in the game matches RA2's, which is why this pass is about drawing and not about the grid — and it is gated so that a future footprint edit cannot silently invalidate a size row instead of failing: the whole comparison is denominated in the footprint diamond, so a wrong diamond makes every number on that row precise and meaningless" },
  'clip.structuresTouchingSheetEdge': { want: 0, dir: 'down', note: "structures whose idle-frame bbox touches the border of its own bake canvas — art the canvas CUT, the `clip.unitsTouchingSheetEdge` check extended to buildings. It matters more here than it looks: `bakeBuilding` sizes the canvas from a per-key `head` allowance and then multiplies BOTH the allowance and the drawing by `VS`, so a change to a structure's footprint or to VPOW can outgrow the headroom and the first measurement of the change is then of a sprite that does not exist" },
  'clause.checked':              { want: 57,   dir: 'up',   note: '§2 states 96 budget clauses across 41 units and each unit has exactly ONE SPIKES entry, so 57 clauses were honoured by intention only. This counts how many of those now have a real measurement behind them, and 57 IS REACHABLE: every one of the 57 emits a row. Three of them are not owed against the art — two STRUCK (clause.struck) and one WAIVED (clause.waived) — and each of those emits a row too, whose check is of the strike or of the waiver rather than of the art. That is deliberate and it is the whole accounting: an earlier pass resolved two impossible clauses by DELETING them from their module, which held this metric at 55 against a want of 57 and made the target permanently unreachable, and a gate red forever gets disabled. Striking still cannot BUY anything, because the row it adds here is immediately spent on a counter that must not rise' },
  'clause.unmet':                { want: 0,    dir: 'down', note: 'clauses that are checked AND FAILING. A rising `checked` with a rising `unmet` is the tool working, not the art getting worse — the first two clauses ever checked by hand were both unmet (Tesla Trooper carapace 8% vs 40%, Engineer third on a row saying "the only")' },
  'clause.struck':               { want: 2,    dir: 'down', note: 'of the checked clauses, the ones whose §2 row is STRUCK — a bar the row itself makes unreachable, so the check asserts the CONTRADICTION\'s premises rather than the art, and the row goes red the moment the contradiction dissolves. Two today: the Nighthawk\'s "rotor span >= 1.25x fuselage length" (an iso disc of span S is S/2 tall, so the span bar caps the airframe at aspect 1.6-2.0 against the 3.05 the same row demands — a closed arithmetic proof) and the IFV\'s "turret >= 45% of total height" (h = w/2 + V under this camera, so the aspect clause beside it caps the whole above-footprint budget; the exclusion rests on a MEASURED frontier of 0.420 rather than on arithmetic alone, and the check says so). The target is DOWN so that striking can never be a way to move `clause.checked`: a strike ADDS a row there and spends it again here, so the net is zero and a third strike is debt until its own premises are beside it. The honest way to clear one is to remove the contradiction from §2, not to add another' },
  'clause.waived':               { want: 1,    dir: 'down', note: 'of the checked clauses, the ones whose §2 row is WAIVED. WAIVED IS NOT STRUCK and the two are counted apart on purpose: a struck clause is IMPOSSIBLE, while a waived one is perfectly reachable and is overridden by a recorded MEASURED decision — so its check asserts the waiver\'s premises AND that the clause is still unmet, because a waiver whose clause has since been met is stale and hides an honestly satisfied row. One today: the Flak Track\'s "body aspect 0.95-1.10", measuring 0.878, where both measured routes to 0.95 walk into the `flaktrack | ifv` mask pair — the clause asks for exactly the property that separation is bought with — and the ground the waiver stands on is that the unit is still inside the aspect gate\'s own +-20% RA2 band. Same ratchet as `clause.struck` and for the same reason: waiving ADDS a row to `clause.checked` and spends it again here, so neither is a route to a green number' },
  'clause.unmatchedToReference': { want: 0, dir: 'down', note: "checks whose stated clause matches NO budget string in §2 for that unit. A check is only worth having if it measures the clause the reference actually wrote; without this, \"measured\" can quietly become \"measured something adjacent and easier\", which is the failure mode this whole file is built against, one level up. Matching is on shared words against that unit's own budget list, so a faithful paraphrase passes and an invented clause does not" },
  'clause.infantryUnmet':        { want: 0,    dir: 'down', note: 'the same, for the 23 unmeasured infantry clauses' },
  'clause.vehicleUnmet':         { want: 0,    dir: 'down', note: 'the same, for the 18 unmeasured vehicle clauses' },
  'clause.navalUnmet':           { want: 0,    dir: 'down', note: 'the same, for the 9 unmeasured naval clauses' },
  'clause.airUnmet':             { want: 0,    dir: 'down', note: 'the same, for the 7 unmeasured air clauses' },
  // STRUCTURE CLAUSES (§2.5-2.9, tools/clause-checks/structures.js). A
  // SEPARATE metric from the four above, never folded in — see the long
  // comment beside `isBld` in the clause loader for why, and
  // clause-inventory.md's own words ("a separate metric, not a bigger 57").
  'clause.checkedStructures':    { want: 73,   dir: 'up',   note: "§2.5-2.9 states 91 budget clauses across 25 structures (clause-inventory.md). 73 IS REACHABLE and is what structures.js emits today: every clause it can honestly measure emits a row, and the remainder (23 distinct clause statements, a few doubled across dir/col) are logged as UNMEASURABLE WITH A REASON rather than faked — e.g. no line/edge detector exists for ribs, ducts or straight edges, no shape test tells a chimney from a tower or a drum from a chute, and several §2.9 rows state no number at all (the Nuclear Missile Silo's own admission, the Spy Satellite's composition-from-plate-only clause). `want` is set to what this file actually reaches, the same rule that governs `clause.checked`'s 57; some of the 91 are also fragments of ONE clause split by a semicolon inside a parenthetical aside (the Yard's, War Factory's and Grand Cannon's width-floor rows) and are checked once, not twice" },
  'clause.unmetStructures':      { want: 0,    dir: 'down', note: 'of the 73 checked structure clauses, the ones checked AND FAILING — 35 on the day this file first ran. This is NOT a regression: no art changed, a measurement route opened that did not exist before. Real findings worth naming here rather than in a commit message: the Refinery bakes only ONE stack where §2.6 wants two on both facs; the War Factory bakes 2 flag/mast crown blobs on `dir` (wants exactly 1) and its `col` bake fails the width floor outright at 1.085 against >=1.25; the Service Depot\'s pad never reaches the stated 0.50 Sw on either fac (0.08/0.152); the Battle Lab\'s Collective dome bake carries 3 crown blobs where the row wants exactly 1; the SAM Site (sentrygun) and Sentry Gun (patriot-side pillbox) barrel/mast counts miss on both keys; the Weather Controller and Iron Curtain bakes fuse their named parts into ONE connected blob so the "exactly 3 masses" / "exactly one ring" counts read 1 and 2 respectively. Every failing row carries its own measured number and want in `detail.clauses` — this count is the gate, not the report' },
  'clause.struckStructures':     { want: 0,    dir: 'down', note: 'of the checked structure clauses, the ones whose §2 row is STRUCK. Zero today: no structure clause has yet been proven unreachable by its own arithmetic the way the Nighthawk\'s rotor span was. Same ratchet as `clause.struck` and for the same reason — a strike here would add a row to `checkedStructures` and spend it again on this counter, so striking can never be how that number moves' },
  'clause.waivedStructures':     { want: 0,    dir: 'down', note: 'of the checked structure clauses, the ones whose §2 row is WAIVED. Zero today. Same distinction as `clause.waived`: reserved for a clause that is reachable but overridden by a recorded MEASURED decision, not for one this tool merely finds inconvenient' },
  'clip.unitsTouchingSheetEdge':  { want: 0,    dir: 'down', note: 'units with at least one bearing whose opaque bbox touches the border of its sheet cell — i.e. art the canvas CUT. Every other metric in this file is downstream of the bake, so a clipped sprite makes aspect, IoU, spike and size all precise and all wrong, with nothing to show for it: the sprite still renders and still looks plausible. The Nighthawk shipped an entire measured pass this way on 2026-09-05 — a 26-unit tail boom reached 48 px on a 104 px sheet and octants 3 and 7 came back with the fin flat against the edge — and it was caught by a hand-written probe, not by anything standing. This is that probe, made standing' },
  'clip.unitsClippedOnGatedOctant':{ want: 0,   dir: 'down', note: "the subset clipped on the unit's own BROADSIDE bearing — the one the aspect and size gates actually read, so a clip there corrupts a headline number rather than a footnote. Per-unit, not a fixed pair: the Nighthawk's broadside is octant 3/7, the Apocalypse's is 0, and a first draft of this metric hardcoded 3 and 7 and would have reported a clean sheet for a unit clipped anywhere else" },
  'size.crossGroupSpread':       { want: 1.61, dir: 'down', note: 'widest group bake scale over narrowest, against RA2 sprite widths. RA2 measures every group in the SAME pixels so its own spread is 1.00 by construction; ours is infantry 1.417 / vehicle 1.270 / air 0.973 / naval 0.881 = 1.61x. This is the blind spot the ra2Size block declares in its own comment — both size gates normalise per GROUP, so a whole group at the wrong scale is invisible to them, and it took a §2 clause to surface it: "[DEST] length >= 1.7x any land vehicle" measures 0.848, our Destroyer being SHORTER than our MCV where RA2 has it 1.46x longer. 1.00 is not the target: infantry are deliberately enlarged for ZMIN legibility (the 1.12x over vehicles is intended). The unexplained part is the fleet at 0.881. RATCHETED, not chased — closing it means rescaling the best-proportioned group on the board, so this exists to stop the spread growing silently' },
  'size.worstOffGroupScale':     { want: 0.25, dir: 'down', note: "the furthest any unit sits from its own group's scale, as |ours/RA2 / groupMedian - 1|; 0.38 (the Nighthawk) on the day the metric was added" },
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
      // CLIPPING. The composed canvas IS the sheet cell, so opaque pixels on
      // its border mean the art ran out of sheet and the sprite we are about
      // to measure is a CUT one. This is not hypothetical: the Nighthawk's
      // lengthened tail boom reached 48 px from the anchor on a 104 px sheet,
      // and octants 3 and 7 — the two the aspect gate actually reads — came
      // back with the fin sliced flat against the canvas edge. The first
      // measurement of that fix was of a sprite that does not exist.
      const edges = (x0 === 0 ? 'L' : '') + (y0 === 0 ? 'T' : '')
                  + (x1 === cm.W - 1 ? 'R' : '') + (y1 === cm.H - 1 ? 'B' : '');
      // one byte per pixel of the bbox: 0 or 1. Masks are all the metrics need.
      const m = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
        m[y * bw + x] = id[((y + y0) * cm.W + (x + x0)) * 4 + 3] > 8 ? 1 : 0;
      let bin = '';
      for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
      // ...and the bbox's RGBA beside the mask. Every metric in this file used
      // to work off the silhouette alone, which is why §2's COLOUR and VALUE
      // clauses ("carapace value >= 0.70 across >= 40% of the torso", "legs
      // must read olive, not tan") had nothing measuring them: the data was
      // thrown away at the page boundary. Node-side clause checks need pixels.
      const rgba = new Uint8Array(bw * bh * 4);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const si = ((y + y0) * cm.W + (x + x0)) * 4, di = (y * bw + x) * 4;
        rgba[di] = id[si]; rgba[di + 1] = id[si + 1];
        rgba[di + 2] = id[si + 2]; rgba[di + 3] = id[si + 3];
      }
      let rbin = '';
      for (let i = 0; i < rgba.length; i += 0x8000) rbin += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
      // --- colour census, from the owner-0 vs owner-1 difference -----------
      let col = null;
      try {
        const cb = compose(d, artB, face);
        const ib = cb.g.getImageData(0, 0, cb.W, cb.H).data;
        let opaque = 0, remap = 0, ha = 0, hb = 0, hn = 0, light = 0;
        const hist = new Float64Array(12);
        const px = [];
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const i = ((y + y0) * cm.W + (x + x0)) * 4;
          if (id[i + 3] <= 8) continue;
          opaque++;
          // VALUE census. §2.2 gives the Engineer one silhouette feature and it
          // is a value one — "a near-white/orange hazmat body where every other
          // infantryman is mid-to-dark, the ONLY light-value soldier on the
          // field". Nothing measured it, and when it finally was he came THIRD.
          if (rgb2hs(id[i], id[i + 1], id[i + 2]).v >= 0.75) light++;
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
                lightPct: opaque ? light / opaque : 0,
                impostorPct: opaque ? impostor / opaque : 0,
                chroma: opaque ? hs / opaque : 0,
                hist: Array.from(hist, (v) => (hs ? v / hs : 0)) };
      } catch (e) { errors.push(key + '@' + face + ' colour census threw: ' + e); }

      recs.push({
        key, name: d.name, cls: d.cls, fac: d.fac || null, air: !!d.air, nav: !!d.nav,
        oct, bw, bh, mask: btoa(bin), rgba: btoa(rbin), col, edges, cellW: cm.W, cellH: cm.H,
      });
    }
  }

  // ── DEPLOYED COMPOSITES ────────────────────────────────────────────────
  // The loop above bakes the STANDING frame, which is the only one a §2
  // silhouette clause could see — and that is why the Guardian GI's "deployed
  // dome >= 15w x 12h" was recorded as unmeasurable. It is not: `UNITS.rocket`
  // carries `depFire: true` ([GGI] Deployer=yes/DeployFire=yes), `stepUnit`
  // sets `u.deployed` on BOTH sides when armour or aircraft come inside the
  // missile's range, and `drawUnit` keys the sandbag emplacement off
  // `u.deployed` alone, not off the unit type. A deployed Guardian GI is a
  // frame the player sees; nothing was baking it.
  //
  // Composed exactly as drawUnit composes it: bags.back at the sheet anchor,
  // the man's stand frame dropped `DEPLOY_DY` px ("he drops down behind the
  // bags"), bags.front over him. Every layer is a `unitCanvas()` on the same
  // (w/2, h - UPAD) anchor, so drawing all three at (0,0) reproduces the
  // relative geometry exactly. Kept OUT of `recs` on purpose: a 38 px dome
  // would become the Guardian's widest bearing and silently reset the
  // broadside every aspect, size and IoU metric reads.
  const deployed = {};
  const DEPLOY_DY = 9;
  const bags = S.bags && S.bags[0];
  if (bags) {
    const bbox = (g, W, H) => {
      const id = g.getImageData(0, 0, W, H).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (id[(y * W + x) * 4 + 3] > 8) {
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1, px: n };
    };
    // the emplacement on its own, so a check can say which reading of "dome"
    // it took — the ring, or the ring with the man in it.
    let ring = null;
    {
      const c = document.createElement('canvas');
      c.width = bags.back.w; c.height = bags.back.h;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(bags.back.c, 0, 0, bags.back.w, bags.back.h);
      g.drawImage(bags.front.c, 0, 0, bags.front.w, bags.front.h);
      ring = bbox(g, c.width, c.height);
    }
    for (const key of Object.keys(U)) {
      const d = U[key];
      if (!(d.dep || d.depFire || d.deployRad)) continue;   // the three that can enter it
      const art = S.unit[0][d.fac || 'dir'][key];
      if (!art || !art.fr) continue;
      const per = [];
      for (let oct = 0; oct < 8; oct++) {
        const man = art.fr('stand', oct * 4, 0);
        const c = document.createElement('canvas');
        c.width = man.w; c.height = man.h;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        g.drawImage(bags.back.c, 0, 0, bags.back.w, bags.back.h);
        g.drawImage(man.c, 0, DEPLOY_DY, man.w, man.h);
        g.drawImage(bags.front.c, 0, 0, bags.front.w, bags.front.h);
        const b = bbox(g, c.width, c.height);
        per.push(b ? { oct, w: b.w, h: b.h, px: b.px } : { oct, w: 0, h: 0, px: 0 });
      }
      deployed[key] = { per, ring, dy: DEPLOY_DY };
    }
  }

  // ── STRUCTURES ─────────────────────────────────────────────────────────
  // Buildings are not in `recs` and must not be: `recs` is keyed by unit and
  // every metric above it (aspect, IoU, spike, peerVsSelf, the colour census)
  // is defined over UNITS. Baked separately, the way `deployed` is.
  //
  // The measured frame is `A.s` — the structure's own IDLE frame — and the
  // bbox is recomputed FROM PIXELS rather than read off `A.s.bb`, because
  // bakeOwned() overwrites `bb` with the UNION over the six idle-animation
  // phases for the twenty-odd animated structures. That union is the right
  // box for the selection brackets and the build-up wipe (its job) and the
  // wrong one for a size measurement: it would credit the Construction Yard
  // with its crane's furthest slew and quietly compare a union against RA2's
  // single frame.
  const blds = [];
  const B = window.__rtsTables.BLDS, spec = window.__rtsTables.bspecFor;
  // MEASURED ON A CANVAS WITH A MARGIN, and the margin is the whole point.
  // Several bake canvases are FRACTIONAL — the civilian blocks are
  // `mkCanvas(78 * 1.45, 100 * 1.45)` = 113.1 x 145 — so `canvas.width = 113.1`
  // truncates, `drawImage(c, 0, 0, 113.1, 145)` RESAMPLES by a hundredth of a
  // pixel, and the resample smears a column of near-transparent pixels onto the
  // border. Measured that way the Filling Station reported a left- and
  // right-edge clip that an independent probe of the same sprite could not
  // reproduce (its opaque box is x 5..112 of 114). Drawing into a canvas PAD px
  // larger and testing the sprite's own rectangle instead of the canvas's
  // removes both artefacts: the extra room means a smear has somewhere to go
  // that is not the edge under test, and the edge under test is the sprite's.
  const PAD = 4;
  const bbox = (spr) => {
    const W = Math.ceil(spr.w), H = Math.ceil(spr.h);
    const c = document.createElement('canvas');
    c.width = W + PAD * 2; c.height = H + PAD * 2;
    const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false;
    g2.drawImage(spr.c, PAD, PAD, spr.w, spr.h);
    const id = g2.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
      if (id[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // bbox MASK + RGBA, the same one-byte/four-byte encoding as the unit bake
    // above (see the comment there) — the blocker §2.5-2.9's structure clauses
    // (counts, crowns, gaps, house fraction) needed closed: a structure used to
    // carry only `{ key, fac, name, cat, gw, gh, w, h, edges }`, so no clause
    // check had per-pixel data to measure. Purely additive: every existing
    // consumer of a `blds` record (`ra2Bld`, `bldSummary`, `size.bld*`,
    // `clip.structuresTouchingSheetEdge`) reads only the fields that already
    // existed, so this cannot move a single existing metric.
    const m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
      m[y * bw + x] = id[((y + y0) * c.width + (x + x0)) * 4 + 3] > 8 ? 1 : 0;
    let bin = '';
    for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
    const rgba = new Uint8Array(bw * bh * 4);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const si = ((y + y0) * c.width + (x + x0)) * 4, di = (y * bw + x) * 4;
      rgba[di] = id[si]; rgba[di + 1] = id[si + 1];
      rgba[di + 2] = id[si + 2]; rgba[di + 3] = id[si + 3];
    }
    let rbin = '';
    for (let i = 0; i < rgba.length; i += 0x8000) rbin += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
    return { x0: x0 - PAD, y0: y0 - PAD, x1: x1 - PAD, y1: y1 - PAD,
             w: bw, h: bh, cellW: W, cellH: H, mask: btoa(bin), rgba: btoa(rbin) };
  };
  for (const key of Object.keys(B)) {
    for (const fk of ['dir', 'col']) {
      const A = (S.bld[0][fk] || {})[key];
      if (!A || !A.s) continue;
      // The faction-resolved footprint, not BLDS[key].gw/gh: RA2's
      // `Foundation=` is per faction (a Soviet Battle Lab is 3x3 where the
      // Allied one is 3x2), and measuring a 3x3 sprite against a 3x2 diamond
      // would report a height fault that is really a footprint mismatch.
      let sp = B[key];
      try { sp = spec(key, fk) || sp; } catch (e) { /* keep the base spec */ }
      let bb = null;
      try { bb = bbox(A.s); } catch (e) { errors.push('bld ' + key + '/' + fk + ' bbox threw: ' + e); continue; }
      if (!bb) { errors.push('EMPTY structure sprite ' + key + '/' + fk); continue; }
      blds.push({ key, fac: fk, name: sp.name || B[key].name, cat: B[key].cat,
                  gw: sp.gw, gh: sp.gh, w: bb.w, h: bb.h,
                  edges: (bb.x0 === 0 ? 'L' : '') + (bb.y0 === 0 ? 'T' : '')
                       + (bb.x1 === bb.cellW - 1 ? 'R' : '') + (bb.y1 === bb.cellH - 1 ? 'B' : ''),
                  mask: bb.mask, rgba: bb.rgba });
    }
  }
  // THE NEUTRAL HOUSE IS DRAWN FROM A DIFFERENT ATLAS, and measuring the wrong
  // one is silent. `bakeBuilding` has a generic fallback for every civilian
  // key, so `SPR.bld[0].dir.civoffice` bakes a 67x60 box — and the game never
  // draws it. What a player sees is `SPR.neut`, where the Office Block is
  // 90x131 on the same 1x1 plot: 4.09 footprint-heights, the most vertical
  // thing on the board. A table that reported 1.88 for it would be precise,
  // reproducible and about a sprite nobody has ever seen.
  const N = S.neut || {};
  for (const key of Object.keys(N)) {
    const A = N[key], d = B[key];
    if (!A || !A.s || !d) continue;
    let bb = null;
    try { bb = bbox(A.s); } catch (e) { errors.push('neut ' + key + ' bbox threw: ' + e); continue; }
    if (!bb) { errors.push('EMPTY neutral sprite ' + key); continue; }
    blds.push({ key, fac: 'neut', name: d.name, cat: d.cat, gw: d.gw, gh: d.gh,
                w: bb.w, h: bb.h,
                edges: (bb.x0 === 0 ? 'L' : '') + (bb.y0 === 0 ? 'T' : '')
                     + (bb.x1 === bb.cellW - 1 ? 'R' : '') + (bb.y1 === bb.cellH - 1 ? 'B' : ''),
                mask: bb.mask, rgba: bb.rgba });
  }

  return { recs, errors, deployed, blds, dpr: window.devicePixelRatio, zoom: window.__rtsTest.zoom(),
           units: Object.keys(U).length, structures: blds.length };
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

function compute(recs, extra) {
  extra = extra || {};
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
    // `thick`, `budget` and `floor` are all ZOOM-1 px and compare directly.
    // `atZmin` is a DIFFERENT SPACE (thick * ZMIN, i.e. what the player sees
    // at furthest zoom, floor 2.0) and compares to nothing else on this line.
    // Printed next to `budget` it reads like a failing comparison whenever the
    // two happen to be close: the dog's 'atZmin 3.58, budget 3.64' cost a pass
    // that concluded its spike had no headroom and could not be shrunk, when
    // the real comparison is thick 6.5 against a 3.64 floor -- 1.79x of room,
    // and the shrink was fine. Hence the explicit floors on both.
    unit[k].spike = { axis: sp.axis, len: best.len, thick: round(best.thick, 2),
                      budget: sp.budget, floor: round(SPIKE_FLOOR, 2),
                      atZmin: round(best.thick * ZMIN, 2), floorAtZmin: SPIKE_FLOOR_ZMIN,
                      lenBudget: sp.len,
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
                     chroma: avg((c) => c.chroma), lightPct: avg((c) => c.lightPct), hist };
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

  // ── broadside SIZE against RA2's own sprites (reference §1.1) ───────────
  // Aspect is scale-INVARIANT, so every gate above is blind to a unit drawn at
  // the wrong size: double a sprite and not one number moves. That blindness
  // hid a real defect — the Nighthawk left the 2026-09-05 aspect pass at 86 px
  // broadside against the Harrier's 52, where RA2 has [SHAD] 64 against
  // [ORCA] 71. Ours was 1.65x the jet where RA2 draws it 0.90x, and nothing
  // could see it.
  //
  // The check is a HYBRID and deliberately so: the per-unit reference is
  // EXTERNAL (RA2's own bbox width), while the normalisation is our own
  // ensemble (the group's median of ours/RA2). Scaling the whole game up or
  // down moves no number, which is right — our pixels-per-unit is our choice.
  // Normalising per GROUP is also a choice: our infantry sit at 1.42x RA2 and
  // our fleet at 0.88x, a 1.6x difference that is deliberate (men have to stay
  // legible at ZMIN; hulls have to fit the map). Per-group means those
  // decisions are respected instead of being reported as 30 faults.
  //
  // What it therefore CANNOT see: a whole group scaled wrong together, because
  // the median moves with it. That is the same blind spot the peer metrics
  // have, and the same answer applies — it is why RA2_BBOX exists at all.
  const ra2Size = (() => {
    const med = (xs) => { const a = [...xs].sort((x, y) => x - y);
      return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const rows = [];
    for (const [k, [rw, rh]] of Object.entries(RA2_BBOX)) {
      if (!unit[k]) continue;
      const ow = Number(String(unit[k].broadsideWH).split('x')[0]);
      rows.push({ key: k, group: unit[k].group, ours: ow, ra2: rw,
                  ra2WH: rw + 'x' + rh, scale: round(ow / rw, 4) });
    }
    const scaleOf = {};
    for (const g of new Set(rows.map((r) => r.group)))
      scaleOf[g] = med(rows.filter((r) => r.group === g).map((r) => r.scale));
    for (const r of rows) { r.groupScale = round(scaleOf[r.group], 4);
                            r.dev = round(r.scale / scaleOf[r.group] - 1, 4); }
    rows.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
    const byG = (g) => rows.filter((r) => r.group === g);
    const cnt = (rs) => rs.filter((r) => Math.abs(r.dev) > RA2_SIZE_BAND).length;
    const spread = (rs) => (rs.length
      ? round(Math.max(...rs.map((r) => r.scale)) / Math.min(...rs.map((r) => r.scale)), 3) : 1);
    // CROSS-GROUP SCALE — the blind spot this block's own comment declares.
    // Both size gates normalise against the unit's OWN group median, so a
    // whole group drawn at the wrong scale is invisible to them by
    // construction. It is not hypothetical: naval bakes at 0.881 of RA2's
    // sprite widths and infantry at 1.417, a 1.61x spread, where RA2 measures
    // every group in the SAME pixels and is 1.00 by definition.
    //
    // Found by a §2 clause, not by a gate — "[DEST] length >= 1.7x any land
    // vehicle" measures 0.848x, i.e. our Destroyer is SHORTER than our MCV
    // where RA2's is 1.46x longer. The sign is wrong, and no per-group metric
    // could ever have said so.
    //
    // 1.00 is NOT the target. Infantry are deliberately enlarged to stay
    // legible at ZMIN (1.417 against vehicles' 1.270 is the intended part, a
    // 1.12x stretch). The unexplained part is the FLEET at 0.881 — hulls
    // shrunk to fit the map, which then makes a destroyer smaller than a tank.
    // Ratcheted rather than targeted: closing it means rescaling the fleet,
    // which spends the best-proportioned group on the board, so this exists to
    // stop the spread growing silently while somebody optimises one group.
    const gs = Object.values(scaleOf);
    const crossSpread = gs.length ? round(Math.max(...gs) / Math.min(...gs), 3) : 1;
    return { rows, groupScale: scaleOf, crossSpread,
             outside: cnt(rows),
             worstOff: rows.length ? round(Math.abs(rows[0].dev), 4) : 0,
             navalOutside: cnt(byG('naval')), navalSpread: spread(byG('naval')),
             vehOutside: cnt(byG('vehicle')), vehSpread: spread(byG('vehicle')),
             infOutside: cnt(byG('infantry')), infSpread: spread(byG('infantry')),
             airOutside: cnt(byG('air')), airSpread: spread(byG('air')) };
  })();

  // ── STRUCTURE SIZE, against RA2's own structures ───────────────────────
  // The first external number buildings have ever had. Shape mirrors
  // `ra2Size` above on purpose: per-building RA2 reference, normalised by the
  // GROUP's own median so a deliberate house scale is respected, and only a
  // structure drawn to a different scale from its neighbours is flagged.
  //
  // TWO axes, and they are NOT interchangeable:
  //   `hScale` — H / footprint-diamond height, ours over RA2's. This is the
  //              gated one. It is what "the Battle Lab is ridiculously big"
  //              actually refers to, and it is the axis every existing metric
  //              in this file is blind to.
  //   `wScale` — the same for width, REPORTED ONLY. Our structures fill their
  //              plot (1.02 of the diamond, near-universally) because `plot()`
  //              draws the ground plate on the cells the building owns;
  //              RA2's underfill it by a wildly varying margin (0.69 on
  //              [NANRCT], 1.03 on [GAPRIS]). That difference is a rendering
  //              decision of ours, not a per-building fault, and gating it
  //              would demand thirty structures be redrawn narrower than the
  //              ground they stand on. It is measured so the claim stays
  //              falsifiable rather than assumed.
  const ra2Bld = (() => {
    const med = (xs) => { const a = [...xs].sort((x, y) => x - y);
      return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const all = (extra.blds || []).map((b) => {
      const fW = (b.gw + b.gh) * 32, fH = (b.gw + b.gh) * 16;   // our TW/2, TH/2
      return Object.assign({}, b, { footW: fW, footH: fH,
        hOverFoot: round(b.h / fH, 3), wOverFoot: round(b.w / fW, 3) });
    });
    const rows = [];
    for (const b of all) {
      const ref = RA2_BLD[b.key + ':' + b.fac];
      if (!ref) continue;
      const [rgw, rgh] = ref.foot.split('x').map(Number);
      // A footprint disagreement invalidates the comparison rather than
      // shifting it, so it is reported as its own fault and the row is not
      // silently scaled to fit.
      const footMatch = (rgw === b.gw && rgh === b.gh);
      const rfW = (rgw + rgh) * 30, rfH = (rgw + rgh) * 15;     // RA2's 60x30 cell
      rows.push({ key: b.key + ':' + b.fac, name: b.name, sec: ref.sec,
                  foot: b.gw + 'x' + b.gh, ra2Foot: ref.foot, footMatch,
                  ours: b.w + 'x' + b.h, ra2: ref.w + 'x' + ref.h,
                  hOverFoot: round(b.h / ((b.gw + b.gh) * 16), 3),
                  ra2HOverFoot: round(ref.h / rfH, 3),
                  wOverFoot: round(b.w / ((b.gw + b.gh) * 32), 3),
                  ra2WOverFoot: round(ref.w / rfW, 3),
                  hScale: round((b.h / ((b.gw + b.gh) * 16)) / (ref.h / rfH), 4),
                  wScale: round((b.w / ((b.gw + b.gh) * 32)) / (ref.w / rfW), 4),
                  ht: ref.ht });
    }
    const hs = rows.map((r) => r.hScale), ws = rows.map((r) => r.wScale);
    const hMed = rows.length ? med(hs) : 1, wMed = rows.length ? med(ws) : 1;
    for (const r of rows) {
      r.houseScale = round(hMed, 4);
      r.dev = round(r.hScale / hMed - 1, 4);
      r.wDev = round(r.wScale / wMed - 1, 4);
    }
    rows.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
    const outside = rows.filter((r) => Math.abs(r.dev) > RA2_BLD_BAND);
    // The tallest sprite in the game, whatever it is. A pure observation, but
    // the one that started this: 306 px on a 3x2 plot went unremarked for
    // months because nothing printed it.
    const tallest = all.slice().sort((a, b) => b.h - a.h)[0] || null;
    return { rows, all,
             covered: rows.length, total: all.length,
             houseScaleH: round(hMed, 4), houseScaleW: round(wMed, 4),
             outside: outside.length,
             outsideKeys: outside.map((r) => r.key),
             footMismatch: rows.filter((r) => !r.footMatch).length,
             worstOff: rows.length ? round(Math.abs(rows[0].dev), 4) : 0,
             spread: rows.length ? round(Math.max(...hs) / Math.min(...hs), 3) : 1,
             tallestPx: tallest ? tallest.h : 0,
             tallest: tallest ? tallest.key + ':' + tallest.fac : null,
             clipped: all.filter((b) => b.edges).map((b) => b.key + ':' + b.fac + ' ' + b.edges) };
  })();

  // ── INVERTED VALUE: the Engineer's whole silhouette feature ─────────────
  // §2.2 gives every unit ONE read, and the Engineer's is not a shape at all:
  // "a near-white/orange hazmat body where every other infantryman is
  // mid-to-dark. The only light-value soldier on the field." His SPIKES entry
  // measures the toolbox against the floor, so the read that actually names
  // him had no measurement behind it — and the first time it was measured he
  // came THIRD, at 26% of torso+legs against a clause asking 55%, behind the
  // Tesla Trooper's 32.3% and Tanya's 27.9%.
  //
  // The fraction and the ORDERING are both kept, because they fail differently:
  // a light-enough Engineer in a roster that went pale with him still has no
  // read, and being the lightest at 26% is not the "near-white body" the row
  // describes. The ordering is the sharper of the two and the one that is
  // robust to where exactly the torso is judged to start.
  const valueRead = (() => {
    const inf = keys.filter((k) => grp[k] === 'infantry' && colByUnit[k] && k !== 'dog');
    const lit = inf.map((k) => ({ key: k, name: meta.get(k).name,
                                  lightPct: round(colByUnit[k].lightPct, 4) }))
                   .sort((a, b) => b.lightPct - a.lightPct);
    const eng = lit.find((r) => r.key === 'engineer');
    return { rows: lit, engineer: eng ? eng.lightPct : 0,
             lighterThanEngineer: eng ? lit.filter((r) => r.lightPct > eng.lightPct).length : 0,
             // how far clear of the SECOND-lightest he stands; the read is a
             // contrast, so a dead heat is a failure even if he wins it
             marginOverNext: eng
               ? round(eng.lightPct - Math.max(...lit.filter((r) => r.key !== 'engineer')
                                                     .map((r) => r.lightPct)), 4)
               : 0 };
  })();

  // ── §2 CLAUSE CHECKS ───────────────────────────────────────────────────
  // §2 of unit-identity-reference.md states 96 pixel-budget clauses. Each unit
  // has exactly ONE SpIKES entry, so at most one clause per unit was ever
  // gated and the other 57 were honoured by intention only. Two of the first
  // few checked by hand turned out unmet — the Tesla Trooper's carapace at 8%
  // against a 40% spec, and the Engineer's "only light-value soldier" who
  // measured THIRD — so the unmeasured set is where the defects are.
  //
  // Checks live in tools/clause-checks/<group>.js, ONE FILE PER GROUP, and are
  // loaded here. That is deliberate: the clauses are being worked through by
  // several passes at once, and a single shared table would put every pass in
  // the same lines of this file. A module returns
  //   [{ unit, clause, ok, measured, want, note }]
  // and gets `ctx` = { units, recs, byUnitOct(k, o), meta, grp, round }, where
  // byUnitOct hands back { w, h, mask, rgba } for one baked bearing — mask for
  // silhouette clauses, rgba for the colour and value ones.
  const clause = (() => {
    const dir = path.join(__dirname, 'clause-checks');
    const ctx = {
      units: unit, recs, meta, grp, round,
      // RA2's own sprite bboxes (§1.1), so a check can DERIVE a threshold from
      // the reference instead of hardcoding one somebody chose. Two §2 rows
      // turned out to state ratios ABOVE the game they cite — the Destroyer's
      // "1.7x any land vehicle" against RA2's own 101/69 = 1.46, and the MCV's
      // "1.20x the widest tank" against RA2's own 69/59 = 1.17 — and neither
      // was catchable while the number lived in the check as a literal.
      ra2Bbox: RA2_BBOX,
      byUnitOct(k, o) {
        const r = recs.find((q) => q.key === k && q.oct === o);
        if (!r) return null;
        return { w: r.bw, h: r.bh,
                 mask: Buffer.from(r.mask, 'base64'),
                 rgba: r.rgba ? Buffer.from(r.rgba, 'base64') : null };
      },
      // STRUCTURES (§2.5-2.9's 25 keys, `extra.blds`) — the building analogue
      // of byUnitOct. There is no owner-1 bake for buildings (only
      // `S.bld[0]` is ever baked — grep the sheet builder, there is no
      // `S.bld[1]`), so unlike units there is no colour census route to a
      // per-unit owner hue; every structure's house-colour clause below is
      // read off this SAME single bake using vehicle.js's already-derived
      // OWNER_HUE=197 convention (the owner-0 render is blue for both
      // factions), not a fresh one invented here.
      byBldFac(k, fac) {
        const b = (extra.blds || []).find((q) => q.key === k && q.fac === fac);
        if (!b || !b.mask) return null;
        return { key: b.key, fac: b.fac, name: b.name, cat: b.cat,
                 gw: b.gw, gh: b.gh, w: b.w, h: b.h, edges: b.edges,
                 mask: Buffer.from(b.mask, 'base64'),
                 rgba: b.rgba ? Buffer.from(b.rgba, 'base64') : null };
      },
      // the bearing the aspect and size gates read, per unit
      broadsideOct(k) {
        let best = null;
        for (const r of recs) if (r.key === k && (!best || r.bw > best.bw)) best = r;
        return best ? best.oct : 0;
      },
      // The DEPLOYED composite, for the three units that have a deployed
      // state — bags + man + parapet, as drawUnit stacks them. Deliberately
      // NOT in `recs`: the emplacement is 38 px wide against a standing
      // Guardian's 25, so a deployed frame in the rec set would become his
      // broadside and quietly re-base aspect, size, IoU and spike.
      // { per: [{oct,w,h,px}], ring: {w,h,px}, dy }
      deployed: extra.deployed || {},
    };
    const rows = [];
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort(); } catch (e) { /* none yet */ }
    for (const f of files) {
      let mod;
      try { mod = require(path.join(dir, f)); }
      catch (e) { rows.push({ unit: '-', clause: f + ' failed to load', ok: false, note: String(e) }); continue; }
      try { for (const r of mod.check(ctx) || []) rows.push({ ...r, module: f }); }
      catch (e) { rows.push({ unit: '-', clause: f + ' threw', ok: false, note: String(e) }); }
    }
    // INTEGRITY: a check only counts if the clause it names is a real §2
    // clause. Without this, "measured" can quietly become "measured something
    // adjacent and easier" — the failure mode this whole file is written
    // around, one level up. Each reported clause is matched against the actual
    // budget strings in unit-identity-reference.md for THAT unit; anything
    // that matches nothing is reported separately and is not counted as
    // coverage.
    const REF = path.join(ROOT, 'apps', 'games', 'rts', 'docs', 'unit-identity-reference.md');
    const budgets = {};
    try {
      const md = fs.readFileSync(REF, 'utf8');
      const re = /^\|\s*`([a-z0-9]+)`([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/gm;
      for (let m; (m = re.exec(md));) {
        const b = m[6].trim();
        if (!b || b === '—' || budgets[m[1]]) continue;
        budgets[m[1]] = b.split(';').map((c) => c.trim()).filter(Boolean);
      }
    } catch (e) { /* reference unreadable; leave every row unverified */ }
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/).filter((w) => w.length > 2);
    for (const r of rows) {
      const cs = budgets[r.unit] || [];
      const mine = norm(r.clause);
      let best = 0;
      for (const c of cs) {
        const theirs = new Set(norm(c));
        const hit = mine.filter((w) => theirs.has(w)).length;
        const sc = mine.length ? hit / Math.max(mine.length, theirs.size) : 0;
        if (sc > best) best = sc;
      }
      r.refMatch = round(best, 2);
    }
    const unmatched = rows.filter((r) => r.unit !== '-' && r.refMatch < 0.34);
    const byG = (g) => rows.filter((r) => (unit[r.unit] || {}).group === g);
    const bad = (rs) => rs.filter((r) => !r.ok).length;
    // STRUCK and WAIVED clauses — EMITTED, never deleted, and never merged.
    //
    // A §2 row can state a bar the same row makes unreachable (STRUCK — the
    // Nighthawk's rotor span, struck through in the reference itself with an
    // arithmetic proof, and the IFV's turret fraction), or a bar a recorded
    // MEASURED decision overrides (WAIVED — the Flak Track's body aspect,
    // where both routes to the number walk into the mask pair the unit's
    // separation is bought with). Either way the clause is still CHECKED: the
    // check is of the STRIKE or of the WAIVER, asserting the premises that
    // excuse the row, so a change that dissolves them turns the row red
    // instead of leaving a permanently excused clause behind.
    //
    // THE TWO ARE COUNTED APART BECAUSE THEY ARE NOT THE SAME THING. A strike
    // is a claim about what is possible; a waiver is a claim about what was
    // decided, and only a waiver can go stale — its check therefore also
    // asserts that its clause is still UNMET. Flattening them into one flag
    // would lose exactly the property that makes the second one retirable.
    //
    // WHY EMITTING MATTERS, learned the expensive way: an earlier pass
    // resolved two impossible clauses by REMOVING them from their module. That
    // held `clause.checked` at 55 against a want of 57 — permanently
    // unreachable — while `clause.struck` read 1 with three clauses excused,
    // so the ledger said neither the truth about coverage nor the truth about
    // debt. Emitting costs nothing and buys nothing: a struck or waived row
    // adds to `checked` and immediately spends it again on `struck`/`waived`,
    // both of which are targets of their own and both of which go the wrong
    // way. That is what keeps striking from being the cheap green number.
    // STRUCTURES ARE A SEPARATE METRIC, NEVER FOLDED INTO THE 57.
    //
    // `clause.checked` above is `want: 57` — a number that is REACHABLE
    // (every one of the 41 units' 57 honoured clauses emits a row) and was
    // made unreachable once already by a pass that deleted rows instead of
    // marking them struck. Merging structures.js's rows into that same
    // count would either drag `want` up to chase whatever structures.js
    // manages this run (turning the target into whatever the tool already
    // does — decoration) or leave `checked` free to rise past 57 with no
    // corresponding `want` bump (silently loosening a gate nobody re-read).
    // clause-inventory.md's own doctrine: "a separate metric, not a bigger
    // 57". So `module === 'structures.js'` rows are excluded from
    // `checked`/`unmet`/`struck`/`waived` (which is why those four numbers
    // do not move by adding this file) and counted again below under their
    // own `Structures`-suffixed counters with their own `want`.
    //
    // `unmatchedToReference` stays a SINGLE global integrity check across
    // both partitions — a structure check naming a clause §2 never wrote is
    // exactly as dishonest as a unit check doing it, and one counter that
    // must read 0 is simpler to trust than two.
    const isBld = (r) => r.module === 'structures.js';
    const uRows = rows.filter((r) => !isBld(r));
    const bRows = rows.filter(isBld);
    return { rows, unmatched: unmatched.length,
             unmatchedRows: unmatched.map((r) => ({ unit: r.unit, clause: r.clause, refMatch: r.refMatch })),
             checked: uRows.length, unmet: bad(uRows),
             struck: uRows.filter((r) => r.struck).length,
             waived: uRows.filter((r) => r.waived).length,
             infUnmet: bad(byG('infantry')), vehUnmet: bad(byG('vehicle')),
             navUnmet: bad(byG('naval')), airUnmet: bad(byG('air')),
             // §2.5-2.9's 91 budget clauses across 25 structures. Unlike the
             // unit side, `want` here is NOT 91: a mask/rgba-only bake gives
             // no owner-diff census (no `S.bld[1]`) and several rows are
             // plate-only or state no number at all (§2.9), so some of the
             // 91 are logged as unmeasurable rather than checked — see each
             // row's own note in structures.js. `want` is set to what this
             // file actually reaches, per the "a target that cannot be
             // reached gets disabled" rule that already governs `checked`.
             checkedStructures: bRows.length, unmetStructures: bad(bRows),
             struckStructures: bRows.filter((r) => r.struck).length,
             waivedStructures: bRows.filter((r) => r.waived).length };
  })();

  // ── SHEET CLIPPING ─────────────────────────────────────────────────────
  // Not a judgement about art — a check that the thing every other metric
  // measured actually IS the sprite. A bbox touching its sheet cell's border
  // means the art was cut off by the canvas, and then aspect, IoU, spike and
  // size are all measuring a shape the bake invented. It is silent by nature:
  // a clipped sprite renders, looks plausible at a glance, and returns a
  // perfectly precise wrong number. The Nighthawk shipped a whole measured
  // pass this way before a clip probe caught it by hand.
  const clip = (() => {
    const hits = [];
    for (const r of recs) {
      if (!r.edges) continue;
      hits.push({ key: r.key, oct: r.oct, edges: r.edges,
                  bbox: r.bw + 'x' + r.bh, cell: r.cellW + 'x' + r.cellH });
    }
    const units = [...new Set(hits.map((h) => h.key))].sort();
    // The BROADSIDE octant is what the aspect and size gates read, so a clip
    // there corrupts a headline number rather than a footnote. It is per-unit,
    // not a fixed pair: the Nighthawk's is 3/7, the Apocalypse's is 0. An
    // earlier draft of this metric hardcoded 3 and 7 and would have reported a
    // clean sheet for any unit clipped on any other bearing.
    const widest = {};
    for (const r of recs)
      if (!widest[r.key] || r.bw > widest[r.key].bw) widest[r.key] = r;
    const onGated = [...new Set(hits.filter((h) => widest[h.key].oct === h.oct)
                                    .map((h) => h.key))].sort();
    return { hits, units, onGated };
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
      'size.navalOutsideRA2Band': ra2Size.navalOutside,
      'size.vehicleOutsideRA2Band': ra2Size.vehOutside,
      'size.infantryOutsideRA2Band': ra2Size.infOutside,
      'size.airOutsideRA2Band': ra2Size.airOutside,
      'size.worstOffGroupScale': ra2Size.worstOff,
      'size.crossGroupSpread': ra2Size.crossSpread,
      'size.bldOutsideRA2Band': ra2Bld.outside,
      'size.bldWorstOffHouseScale': ra2Bld.worstOff,
      'size.bldFootprintMismatch': ra2Bld.footMismatch,
      'clip.structuresTouchingSheetEdge': ra2Bld.clipped.length,
      // §2's pixel budgets, checked one clause at a time (tools/clause-checks/).
      'clip.unitsTouchingSheetEdge': clip.units.length,
      'clip.unitsClippedOnGatedOctant': clip.onGated.length,
      'clause.checked': clause.checked,
      'clause.unmet': clause.unmet,
      'clause.struck': clause.struck,
      'clause.waived': clause.waived,
      'clause.infantryUnmet': clause.infUnmet,
      'clause.vehicleUnmet': clause.vehUnmet,
      'clause.navalUnmet': clause.navUnmet,
      'clause.airUnmet': clause.airUnmet,
      'clause.unmatchedToReference': clause.unmatched,
      'clause.checkedStructures': clause.checkedStructures,
      'clause.unmetStructures': clause.unmetStructures,
      'clause.struckStructures': clause.struckStructures,
      'clause.waivedStructures': clause.waivedStructures,
      'value.soldiersLighterThanEngineer': valueRead.lighterThanEngineer,
      'value.engineerLightPct': valueRead.engineer,
      'value.engineerMarginOverNext': valueRead.marginOverNext,
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
      ra2Size: ra2Size.rows,
      ra2Bld: ra2Bld.rows,
      // Every structure, one compact line each — the 15 with an RA2 reference
      // AND the 28 without. The unreferenced ones are the whole point: they are
      // what the gate cannot see, and a table nobody can read is how they stay
      // unseen. Tallest first, so "which building is enormous" is answerable
      // without running anything.
      bldAll: ra2Bld.all.slice()
        .sort((a, b) => b.h / ((b.gw + b.gh) * 16) - a.h / ((a.gw + a.gh) * 16))
        .map((b) => [b.key + ':' + b.fac, b.gw + 'x' + b.gh, b.w + 'x' + b.h,
                     b.hOverFoot, b.wOverFoot, RA2_BLD[b.key + ':' + b.fac] ? 'ref' : '']),
      bldSummary: { covered: ra2Bld.covered, total: ra2Bld.total,
                    houseScaleH: ra2Bld.houseScaleH, houseScaleW: ra2Bld.houseScaleW,
                    spread: ra2Bld.spread, outside: ra2Bld.outsideKeys,
                    tallest: ra2Bld.tallest, tallestPx: ra2Bld.tallestPx,
                    clipped: ra2Bld.clipped },
      clauses: clause.rows,
      valueRead: valueRead.rows,
      clipped: clip.hits,
      ra2GroupScale: ra2Size.groupScale,
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

    const out = compute(raw.recs, { deployed: raw.deployed, blds: raw.blds });
    out.env = { dpr: raw.dpr, zoom: raw.zoom, ZMIN, spikeFloorAtZoom1: round(SPIKE_FLOOR, 2),
                units: raw.units, sprites: raw.recs.length, structures: raw.structures,
                scene, framePng: path.relative(ROOT, FRAME_PNG) };
    // Raw per-bearing records, kept on the result (never serialised into the
    // baseline) so a pass can ask WHERE a sprite's height lives instead of
    // inferring it from the drawing code. That inference is unreliable: the
    // Apocalypse's turret mast is the topmost thing in the source and
    // shortening it moves the bbox by zero.
    out.recs = raw.recs;
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
