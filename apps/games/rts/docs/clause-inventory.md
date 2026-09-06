# The §2 clause inventory — what is measured and what is not

Derived 2026-09-05 from `unit-identity-reference.md` §2 and the SPIKES table
in `tools/art-metrics.js`. **96 budget clauses across 41 units; 57 had nothing
measuring them, and as of 2026-09-07 all 57 emit a row —
`clause.checked` 57.** Each unit has exactly one
SPIKES entry, so at most one clause per unit is gated by the spike gate; every
other clause on that row was honoured by intention only until the
`tools/clause-checks/` modules landed.

Why this matters, measured rather than asserted: of the clauses checked on the
day this was written, two were UNMET — the Tesla Trooper's carapace at 8%
against a 40% spec, and the Engineer's inverted value, which put him THIRD on a
row that calls him "the only light-value soldier on the field". Both are fixed
and gated now. The unmeasured set WAS where the remaining defects were, and
working through it found more of them (the Grizzly's single house blob, the
Apocalypse's fused canisters, the War Miner's undersized bin, the Terror Drone's
scale); `clause.unmet` is what carries the ones left standing as recorded
ceilings.

**And a check can be the defect.** The Apocalypse's canister row asked for
`>= 2` house blocks when §2 says **four**, so it PASSED against the very build
whose four drums baked as one fused 22x31 blob — verified by re-running it on
that build. The two blocks it was counting were the house-coloured flank plates,
not canisters. Tightened 2026-09-07 to the row's own count, with a canister
defined as a standing cylinder (`h >= 1.5w`, from the drums' drawn 9.6-on-4.0
proportion) so a plate can no longer stand in for a drum. On the old build it now
reports **0 at the gated bearing and a 1 px seam**; on today's art it reports
**2 of 4**, which is a **new UNMET row** — the near/far pair is still fused, the
same anti-aliasing bridge one axis over. That is the tool working.

`gated` = this clause is the one the unit's SPIKES entry measures. It says
NOTHING about the clause-check modules: every row in the table below has a check
in `tools/clause-checks/`, `gated` or not. The rows whose clause text is
~~struck through~~ are not owed against the art — see "The ledger" below and
`unit-identity-reference.md` §2.3/§2.4.

**Corrected 2026-09-06 — two thresholds were above RA2's own, one bearing was
wrong.** `mcv` ">= 1.20x the widest tank" and `destroyer` "length >= 1.7x any
land vehicle" both stated ratios the game they cite does not reach (RA2's own
are 69/59 = 1.17 and 101/69 = 1.46), so they are re-derived from §1.1's bboxes
inside the checks; **both remained UNMET after the correction**, which is why the
correction was not a closure. **`mcv` closed on 2026-09-06 by SHRINKING the
Prism** (`VSC.spectre` 1.460 -> 1.420, 91 -> 89 px, ratio 1.180) — the row asks
which of the two most oversized vehicles is more oversized, so bringing the
leader down is the only fix that is also a fidelity gain; the cost is
`iou.groundCombat.mean` 0.4652 -> 0.4695 and `mass.tightestBand6` 2.208 ->
2.149, and it is structural rather than a tuning miss (see the log). **`destroyer`
stays UNMET, now with its ceiling measured rather than estimated**: the only
route that does not spend the fleet is the whole vehicle group at x0.571, which
does close the row at 1.483 and simultaneously takes `size.crossGroupSpread`
1.607 -> 1.899, `spike.belowDeclaredBudget` 0 -> 4 and `clause.unmet` 5 -> 9 —
one row closes and five open. `chronominer` "height <= 0.55 x length" was read at
the WIDEST octant, which for that unit is the diagonal one, where a flat ground
body's h/w is pinned at exactly 0.500 whatever its length — a check bug, not an
art defect. Read at the hull broadside it is **0.522 and MET**. Working, sweeps
and both measured ceilings: `per-unit-art-log.md`.

**Measured since:** the fifteen measurable NAVAL and AIR rows below now have real
checks in `tools/clause-checks/naval-air.js` (the sixteenth, the Nighthawk's rotor
span, is struck). Working and thresholds: `per-unit-art-log.md`, "The sixteen
unmeasured NAVAL and AIR clauses of §2".
**Measured since:** all 57 rows below now have a check behind them
(`tools/clause-checks/{infantry,vehicle,naval-air}.js`, `clause.checked` 57).
Working and thresholds per group: `per-unit-art-log.md`.

**The last three, closed 2026-09-06.** Two were on record as *unmeasurable* and
one was struck, and none of the three closed the way the record expected:

* **`rocket` "deployed dome >= 15w x 12h" — the record was WRONG.** It said our
  Guardian GI does not deploy. He does: `UNITS.rocket` carries `depFire: true`
  (`[GGI] Deployer=yes, DeployFire=yes`) and `stepUnit` braces him automatically
  on both sides, with the sandbag emplacement drawn off `u.deployed` alone. The
  frame was always on screen; nothing was BAKING it. Now measured at **38x42**
  (emplacement alone 38x23) on the tightest of eight bearings. No gameplay
  change was needed or made.
* **`chronominer` "zero turret mass" — measurable after all, on a fifth
  statistic.** The four rejected ones were each rejected for failing to recover
  the renderer's hull+turret split; the clause never asked for that, and it is
  unavailable anyway (the War Miner's drum is on its facing sheet, so layer mass
  is zero for BOTH miners). A local deck-line crown in absolute pixels, bar
  taken from §2.4's own War Miner turret budget, reads **0x0 on all 8 bearings**
  against the War Miner's **14x9**.
* **`nighthawk` rotor span — STRUCK, and now CHECKED AS STRUCK.** The strike
  stands (arithmetic below), but it is no longer a blank row: the check asserts
  the strike's two premises out of the source, so the excuse dies with the
  contradiction. Counted in `clause.checked` and, separately, in
  **`clause.struck`**, pointing DOWN, so striking can never become a way to move
  `clause.checked`.

## STRUCTURES (§2.5-2.9) are in the reference and are NOT in this count

**Added 2026-09-06.** `unit-identity-reference.md` §2 used to state a pixel
budget for no structure at all; §2.5-2.9 now carry **25 structures and 91 budget
clauses**. **None of them is in the 96, none of them is in `clause.checked`, and
that is deliberate** — the paragraphs below say exactly why, because the
alternative is a metric that drifts without anyone deciding to move it.

### There is no generator, and the word "Generated" above was misleading

The header said this file was *generated* from §2 and the SPIKES table. **No
such script exists** — `grep -rn clause-inventory` over the repo returns only
prose references from the three check modules. This file is written and
maintained by hand, and the header now says "derived" instead. Anyone adding
rows to §2 has to add them here too; nothing will do it for them and nothing
will notice if they don't.

### What DOES read §2 automatically, and what it did with the new rows

One parser does, and it is the integrity check inside `art-metrics.js`'s clause
block (`tools/art-metrics.js:1406-1420`). It scans the WHOLE document for any
five-column row that opens with a backticked lowercase key and files the last
cell as that key's budget list. That is not scoped to units, so **it picked up
all 25 structure rows on its own**. Measured on the edited document:

| | before | after |
|---|---|---|
| budget keys parsed out of §2 | 41 | **66** |
| clauses filed under the 41 UNIT keys | **96** | **96** |
| clauses filed under new structure keys | 0 | 91 |
| `clause.checked` | 57 | **57** |
| `clause.unmatchedToReference` | 0 | **0** |
| every other `art-metrics` number | — | **byte-identical** |

Nothing moved, for two reasons worth writing down because both are load-bearing:

* **No structure key collides with a unit key.** The 25 are `base`, `power`,
  `refinery`, `barracks`, `factory`, `shipyard`, `depot`, `radar`, `airforce`,
  `lab`, `reactor`, `purifier`, `spysat`, `sentry`, `sentrygun`, `tesla`,
  `prism`, `patriot`, `flakcannon`, `grandcannon`, `gapgen`, `chrono`,
  `weather`, `curtain`, `nuke`; the `UNITS` map shares not one of them. Had it
  (`mcv` is the near miss — a UNIT here, and a structure in most RTS rosters)
  the parser's `if (budgets[key]) continue` would have silently kept whichever
  row came first in the file and a unit's clause list would have changed
  underneath its own checks.
* **`clause.checked` counts rows returned by `tools/clause-checks/*.js`, not
  rows in the document.** No module reports a structure key, so the count cannot
  move — and because every reported clause is still matched against that key's
  own budget list, `clause.unmatchedToReference` cannot move either.

### Why they are deliberately kept out of the 96

Because `clause.checked` is a coverage metric with a stated want of 57, and this
file's own doctrine is that a number you cannot reach gets disabled. **The
structure clauses are not reachable today**: `pageExtract` stores a structure as
`{ key, fac, name, cat, gw, gh, w, h, edges }` (`tools/art-metrics.js:790`) with
**no mask and no rgba**, where a unit record carries both. Of the 91 clauses,
only the handful about bbox, aspect and footprint could be asserted at all; the
counts, crowns, gaps, profiles and house fractions — which is where §2.5's Rule
S2 says structure identity actually lives — have nothing to read.

Folding 91 unreachable clauses into a 57-of-57 metric would take it to 57 of 148
overnight and turn a green gate red for a reason nobody chose. So:

* the structure rows are **stated and unchecked**, exactly as all 96 unit
  clauses were before `tools/clause-checks/` existed;
* they are counted here and nowhere else;
* the enabling change is named rather than assumed — carry `mask` and `rgba` on
  the `blds` push in `pageExtract` and add a `byBldFac(key, fac)` helper to the
  clause-check `ctx`, then a `clause-checks/structures.js` can start on them and
  `clause.checkedStructures` can be raised as its OWN metric with its OWN want.
  A separate metric, not a bigger 57: units and structures were measured on
  different days against different reference sets, and merging their coverage
  would hide which of the two a regression came from.

### The 91, by structure

| structure | section | clauses | strongest source |
|---|---|---|---|
| `base` Construction Yard | §2.6 | 4 | both blue-key SHP sprites, exact masks |
| `power` Power Plant | §2.6 | 5 | `[GAPOWR]` native capture; the Collective half is count-only |
| `refinery` Ore Refinery | §2.6 | 4 | `[GAREFN]` native capture |
| `barracks` Barracks | §2.6 | 5 | `[NAHAND]` capture — **but see the bbox warning in §2.6**; the Directorate half is a resample, shape only |
| `factory` War Factory | §2.6 | 5 | `[GAWEAP]` native capture |
| `shipyard` Naval Yard | §2.6 | 4 | `[NAYARD]` native capture |
| `depot` Service Depot | §2.6 | 4 | `[NADEPT]` native capture |
| `radar` Radar Tower | §2.6 | 4 | `[NARADR]` native capture, tight |
| `airforce` Airforce Command | §2.6 | 4 | plate + a cited-but-absent rip; counts only |
| `lab` Battle Lab | §2.6 | 4 | both native captures |
| `reactor` Nuclear Reactor | §2.6 | 4 | `[NANRCT]` native capture |
| `purifier` Ore Purifier | §2.6 | 4 | plate + a cited-but-absent rip; counts only |
| `spysat` SpySat Uplink | §2.6 | 2 | plate only; counts only |
| `sentry` Pillbox | §2.7 | 3 | `art.ini` `Height=` ordering + plate |
| `sentrygun` Sentry Gun | §2.7 | 3 | plate + a cited-but-absent rip; counts only |
| `tesla` Tesla Coil | §2.7 | 4 | **blue-key SHP, exact mask, profile measured row by row** |
| `prism` Prism Tower | §2.7 | 4 | **blue-key SHP, exact mask, profile measured row by row** |
| `patriot` Patriot Missile | §2.7 | 3 | plate + a cited-but-absent rip; counts only |
| `flakcannon` Flak Cannon | §2.7 | 3 | `Height=` ordering + plate |
| `grandcannon` Grand Cannon | §2.7 | 5 | `[GTGCAN]` native capture, verified by eye in `sprites/README.md` |
| `gapgen` Gap Generator | §2.7 | 2 | plate and a cited rip that **agree independently** |
| `chrono` Chronosphere | §2.8 | 4 | plate + a cited-but-absent rip; counts and ordering only |
| `weather` Weather Control | §2.8 | 3 | plate + a cited-but-absent rip; counts only |
| `curtain` Iron Curtain | §2.8 | 3 | plate + a cited-but-absent rip; counts only |
| `nuke` Nuclear Missile Silo | §2.8 | 1 | **ordering only — the row states no feature budget, on purpose** |

Five structures carry **no row at all** and §2.9 names each with its reason:
`wall` and `gate` (a wall's identity is its connection mask, not a silhouette),
`psisensor` (plate only, and it is one of the three recorded near-misses from
reading proportion off a plate), `cloningvats` (its only plate is a blurred
upload) and the whole neutral house (no reference of any kind).

## The ledger — every clause emits a row, and the excuses are counted

**Corrected 2026-09-07. Three clauses were excused in two different ways and the
accounting could not add up.** The Nighthawk's struck rotor row was EMITTED with
`struck: true` — counted in `clause.checked`, counted again in `clause.struck`
so a second strike shows as debt. The IFV's turret row and the Flak Track's
aspect row were instead REMOVED from `clause-checks/vehicle.js`. The result was a
ledger that told the truth about neither side: `clause.checked` stuck at **55**
against a want of 57 that had become **permanently unreachable**, and
`clause.struck` reading **1** while three clauses were struck or waived. This
file's own doctrine is that a gate red forever gets disabled, so that could not
stand.

**All three are now EMITTED rows carrying their state**, the Nighthawk's shape
everywhere. `clause.checked` reaches **57**.

**STRUCK and WAIVED are different things and are counted apart:**

* **STRUCK** — the clause is **impossible**: the row states a bar the same row
  makes unreachable. The check asserts the **strike's premises**, so the row goes
  red the moment the contradiction dissolves and the strike has to be re-argued.
  Counted in **`clause.struck`** (`<= 2`, DOWN).
* **WAIVED** — the clause is **reachable** and **unmet**, overridden by a
  recorded **measured** decision. The check asserts the **waiver's premises** AND
  that the clause is **still unmet** — a waiver whose clause has since been met
  is stale, and a stale waiver hides an honestly satisfied row, so that turns it
  red too. Counted in **`clause.waived`** (`<= 1`, DOWN).

**Neither is a route to a green number, and that property is the point.**
Emitting a struck or waived row adds 1 to `clause.checked` and immediately spends
it again on a counter that must not rise. The net is zero, both counters are
ratcheted DOWN, and the honest way to clear one is to remove the contradiction
from §2 — not to add another.

| clause | state | counted in | what the check asserts |
|---|---|---|---|
| `nighthawk` rotor span >= 1.25x fuselage length | **struck** (2026-09-05) | `clause.struck` | the 2:1 camera and the ground-plane disc, source-verified: an iso disc of span S is S/2 tall, so 1.25L of span caps the airframe at 1.60/2.00 against the 3.05 the same row demands |
| `ifv` turret >= 45% of total height | **struck** (2026-09-07) | `clause.struck` | the 2:1 camera (`h = w/2 + V`), that the aspect clause beside it still binds and the unit is still inside it, and that the crown is still short of 45%. **Stated limit:** the analytic headroom at the shipped aspect is 0.459, *above* 0.45, so this is not the closed contradiction the Nighthawk's is — the exclusion rests on the measured frontier (0.420 at aspect 1.000), and the check says so rather than dressing it up |
| `flaktrack` body aspect 0.95-1.10 | **waived** (2026-09-07) | `clause.waived` | that the clause is still **unmet** (0.878) and that the waiver's own ground still holds — the unit inside the aspect gate's +-20% RA2 band, `0.122` off `[HTK]`'s own 1.00 |

Two clauses remain recorded as **unmeasurable** rather than struck or waived, and
both now have measurements after all (see "The last three" above): `rocket`
deployed dome (the record was wrong — the frame was never baked) and
`chronominer` zero turret mass (measurable on a fifth statistic).

| unit | group | clause | gated |
|---|---|---|---|
| `rifle` GI | infantry | torso block >= 7w x 6h | — |
| `rifle` GI | infantry | helmet >= 5x3 in a value distinct from both torso and legs | — |
| `rifle` GI | infantry | legs must read olive, not tan (this is the only thing separating him from a Conscript) | — |
| `rocket` Guardian GI | infantry | tube >= 8 px long x 2.5 px thick, clearing the helmet by >= 4 px | **yes** |
| `rocket` Guardian GI | infantry | deployed dome >= 15w x 12h | — |
| `rocketeer` Rocketeer | infantry | altitude offset >= 10 px | — |
| `rocketeer` Rocketeer | infantry | shadow blob >= 9x4 separated from the feet | — |
| `rocketeer` Rocketeer | infantry | pack >= 4w x 6h and strictly below the helmet crown | **yes** |
| `engineer` Engineer | infantry | body value >= 0.75 across >= 55% of the torso+legs | — |
| `engineer` Engineer | infantry | toolbox >= 4x3 at hand height | **yes** |
| `dog` Attack Dog | infantry | body <= 9 px tall and >= 19 px long | — |
| `dog` Attack Dog | infantry | no vertical torso mass | — |
| `dog` Attack Dog | infantry | house colour on the collar/harness, never the coat | — |
| `tanya` Tanya | infantry | head patch >= 3x2 at >= 0.85 value | — |
| `tanya` Tanya | infantry | limbs >= 30% of body px in skin tone | — |
| `tanya` Tanya | infantry | pistols break the outline by >= 2 px each side | **yes** |
| `cleg` Chrono Legionnaire | infantry | shoulder line >= 15 px (>= 20% wider than a GI's 12) | — |
| `cleg` Chrono Legionnaire | infantry | rifle >= 9 px long held horizontal | **yes** |
| `spy` Spy | infantry | hat brim >= 7 px wide, >= 1.5x the head | **yes** |
| `spy` Spy | infantry | coat hem one unbroken block >= 8 px wide, no vertical gap | — |
| `conscript` Conscript | infantry | legs must be tan/brown, >= 20 hue-degrees off the GI's olive | — |
| `conscript` Conscript | infantry | cap silhouette flat, not domed | **yes** |
| `flak` Flak Trooper | infantry | barrel >= 10 px long x 2.5 px thick, clearing the helmet crown by >= 8 px | **yes** |
| `flak` Flak Trooper | infantry | total height >= 1.25x a Conscript's | — |
| `teslatrooper` Tesla Trooper | infantry | shoulder line >= 18 px | **yes** |
| `teslatrooper` Tesla Trooper | infantry | carapace value >= 0.70 (silver) across >= 40% of the torso | — |
| `teslatrooper` Tesla Trooper | infantry | the roadmap already caught the pauldrons swallowing the helmet — bowl must clear the caps by >= 2 px | — |
| `ivan` Crazy Ivan | infantry | house fraction >= 35% | — |
| `ivan` Crazy Ivan | infantry | ushanka flaps break the head outline >= 2 px each side | **yes** |
| `ivan` Crazy Ivan | infantry | bundle >= 4x3 at waist height | — |
| `desolator` Desolator | infantry | pack >= 5w x 8h above the shoulder line | **yes** |
| `desolator` Desolator | infantry | gun muzzle >= 4 px across (fat, not a rifle) | — |
| `desolator` Desolator | infantry | deployed pool >= 1 tile | — |
| `yuri` Yuri | infantry | hem block >= 9 px wide with zero vertical gap for >= 8 px of height | **yes** |
| `yuri` Yuri | infantry | head dome bare, no helmet | — |
| `lancer` Grizzly Tank | vehicle | hull height <= 0.45 x length | — |
| `lancer` Grizzly Tank | vehicle | barrel >= 13 px x 2.2 px, entirely clear of the hull | **yes** |
| `lancer` Grizzly Tank | vehicle | exactly 2 house blocks, each 4-8 px, individually countable (gap >= 2 px, no fusing) — *the 6-8/>= 4 numbers were corrected on 2026-09-07, see §2.3* | — |
| `ifv` IFV | vehicle | body aspect 1.0-1.2 | — |
| `ifv` IFV | vehicle | ~~turret >= 45% of total height~~ (**struck**, see the ledger — emitted, `clause.struck`) | — |
| `ifv` IFV | vehicle | four distinct turret models must be visually distinct at >= 8x8 px each | **yes** |
| `mirage` Mirage Tank | vehicle | housing >= 60% of hull width, >= 6 px tall, sitting proud of the deck | **yes** |
| `mirage` Mirage Tank | vehicle | gun stub <= 6 px (any longer and it reads as a Grizzly) | — |
| `prismtank` Prism Tank | vehicle | crystal >= 10 px tall x >= 5 px wide, standing above the turret roof | **yes** |
| `prismtank` Prism Tank | vehicle | total height >= 1.15x the Mirage's | — |
| `chronominer` Chrono Miner | vehicle | height <= 0.55 x length | — (**MET** 0.522 — was read at the wrong bearing) |
| `chronominer` Chrono Miner | vehicle | nose drum >= 8 px long, violet and unmistakably not house hue | **yes** |
| `chronominer` Chrono Miner | vehicle | zero turret mass | — |
| `nighthawk` Nighthawk | air | ~~rotor span >= 1.25x fuselage length~~ (**impossible with our blur disc, see the ledger — emitted, `clause.struck`**) | — |
| `nighthawk` Nighthawk | air | blades 2 px with >= 40% value contrast | **yes** |
| `nighthawk` Nighthawk | air | fuselage height <= 0.35 x length | — |
| `harrier` Harrier | air | wing span >= 1.5x fuselage width | — |
| `harrier` Harrier | air | wing >= 5 px chord at the root | **yes** |
| `harrier` Harrier | air | nose cone >= 4 px | — |
| `hornet` Hornet | air | total span <= 0.45x the Harrier's | **yes** |
| `hornet` Hornet | air | do not add detail it cannot carry | — |
| `mcv` MCV | vehicle | >= ~~1.20x~~ **1.17x** the widest tank (RA2's own) | — (**MET** 1.180 — closed 2026-09-06 by shrinking the Prism; the prose above says so and this row did not) |
| `mcv` MCV | vehicle | zero barrel, zero turret ring | **yes** |
| `destroyer` Destroyer | naval | length >= ~~1.7x~~ **1.46x** any land vehicle (RA2's own) | — (**UNMET** 0.848) |
| `destroyer` Destroyer | naval | one turret forward of amidships | **yes** |
| `aegis` Aegis Cruiser | naval | radar panel >= 8x8 px, vertical | **yes** |
| `aegis` Aegis Cruiser | naval | explicitly no barrel | — |
| `carrier` Aircraft Carrier | naval | deck a single unbroken flat plane >= 80% of length | **yes** |
| `carrier` Aircraft Carrier | naval | 3 visible parked airframes | — |
| `dolphin` Dolphin | naval | no orthogonal edges anywhere | — |
| `dolphin` Dolphin | naval | fin >= 3 px above the back | **yes** |
| `lcraft` Landing Craft | naval | ramp plane distinct from the deck | **yes** |
| `lcraft` Landing Craft | naval | visible cargo when loaded | — |
| `rhino` Rhino Tank | vehicle | hull height >= 1.25x the Grizzly's | — |
| `rhino` Rhino Tank | vehicle | 5 discrete house blocks, each 4-6 px, gaps >= 3 px | — |
| `rhino` Rhino Tank | vehicle | gun >= 1.6x the Grizzly's barrel thickness | **yes** |
| `mammoth` Apocalypse | vehicle | each canister >= 6x6 px and individually countable (gaps >= 2 px) | — (**UNMET** 2 of 4) |
| `mammoth` Apocalypse | vehicle | twin barrels >= 19 px, visibly two, tapering | **yes** |
| `teslatank` Tesla Tank | vehicle | each column >= 9 px tall x 3 px wide | **yes** |
| `teslatank` Tesla Tank | vehicle | gap between them >= 5 px so the pair reads as two | — |
| `v3` V3 Launcher | vehicle | missile >= 1.10x the truck length, overhanging >= 5 px at the nose | **yes** |
| `v3` V3 Launcher | vehicle | nose cone and fins in house hue, midbody pure white | — |
| `flaktrack` Flak Track | vehicle | ~~body aspect 0.95-1.10~~ (**waived**, see the ledger — emitted, `clause.waived`) | — (**0.878**) |
| `flaktrack` Flak Track | vehicle | gun raised >= 10 px above the bed line | **yes** |
| `warminer` War Miner | vehicle | turret >= 6x6 px on the bin's shoulder | **yes** |
| `warminer` War Miner | vehicle | bin >= 35% of body px | — |
| `drone` Terror Drone | vehicle | total <= 0.55x the smallest tank | — |
| `drone` Terror Drone | vehicle | legs >= 4 px reach beyond the core, tapered blades not wires | **yes** |
| `drone` Terror Drone | vehicle | core in house hue | — |
| `apc` Amphibious Transport | naval | skirt a continuous rounded band round the whole hull | **yes** |
| `apc` Amphibious Transport | naval | deck cavity visible as a house-hued interior | — |
| `kirov` Kirov Airship | air | span >= 2.0x the Harrier's *on screen* | — |
| `kirov` Kirov Airship | air | gondola visibly separated below the envelope by >= 4 px | **yes** |
| `kirov` Kirov Airship | air | the existing 1.3x draw scale (`rts.html:29398`) is a symptom of the bake being too small | — |
| `sub` Typhoon Attack Sub | naval | height <= 0.20 x length | **yes** |
| `sub` Typhoon Attack Sub | naval | conning tower the only vertical mass | — |
| `seascorp` Sea Scorpion | naval | shortest armed hull afloat | — |
| `seascorp` Sea Scorpion | naval | gun matches the Flak Track's silhouette | **yes** |
| `dread` Dreadnought | naval | two launch boxes >= 10x10 px, countable, standing proud of the deck | **yes** |
| `squid` Giant Squid | naval | zero straight edges | — |
| `squid` Giant Squid | naval | >= 4 tentacles resolvable at 3 px each | **yes** |
