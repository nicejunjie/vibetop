# The §2 clause inventory — what is measured and what is not

Generated 2026-09-05 from `unit-identity-reference.md` §2 and the SPIKES table
in `tools/art-metrics.js`. **96 budget clauses across 41 units; 57 have nothing
measuring them.** Each unit has exactly one SPIKES entry, so at most one clause
per unit is gated; every other clause on that row is honoured by intention only.

Why this matters, measured rather than asserted: of the clauses checked on the
day this was written, two were UNMET — the Tesla Trooper's carapace at 8%
against a 40% spec, and the Engineer's inverted value, which put him THIRD on a
row that calls him "the only light-value soldier on the field". Both are fixed
and gated now. The unmeasured set is where the remaining defects are.

`gated` = this clause is the one the unit's SPIKES entry measures.

**Measured since:** the fifteen measurable NAVAL and AIR rows below now have real
checks in `tools/clause-checks/naval-air.js` (the sixteenth, the Nighthawk's rotor
span, is struck). Working and thresholds: `per-unit-art-log.md`, "The sixteen
unmeasured NAVAL and AIR clauses of §2".

**Also measured since:** the 23 INFANTRY rows (`clause-checks/infantry.js`) and
the 18 VEHICLE rows (`clause-checks/vehicle.js`). **52 of the 57 are checked.**
The five that are not each say why at the site rather than being silently
absent, and a struck or waived clause costs `clause.checked` rather than buying
it — striking must never be the cheap route to a green number:

| clause | state | why |
|---|---|---|
| `nighthawk` rotor span >= 1.25x fuselage length | **struck** (2026-09-05) | impossible with a blur-disc rotor; arithmetic in §2.3 |
| `rocket` deployed dome >= 15w x 12h | **unmeasurable** | our Guardian GI does not deploy — no frame exists |
| `chronominer` zero turret mass | **unmeasurable** | four silhouette statistics tried, each inverts on a control unit |
| `ifv` turret >= 45% of total height | **struck** (2026-09-07) | mutually exclusive with the aspect clause on its own row; frontier measured at 0.420 |
| `flaktrack` body aspect 0.95-1.10 | **waived** (2026-09-07) | both routes to 0.95 walk into the `flaktrack \| ifv` pair; cited in §2.4 |

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
| `ifv` IFV | vehicle | ~~turret >= 45% of total height~~ (**struck**, see above) | — |
| `ifv` IFV | vehicle | four distinct turret models must be visually distinct at >= 8x8 px each | **yes** |
| `mirage` Mirage Tank | vehicle | housing >= 60% of hull width, >= 6 px tall, sitting proud of the deck | **yes** |
| `mirage` Mirage Tank | vehicle | gun stub <= 6 px (any longer and it reads as a Grizzly) | — |
| `prismtank` Prism Tank | vehicle | crystal >= 10 px tall x >= 5 px wide, standing above the turret roof | **yes** |
| `prismtank` Prism Tank | vehicle | total height >= 1.15x the Mirage's | — |
| `chronominer` Chrono Miner | vehicle | height <= 0.55 x length | — |
| `chronominer` Chrono Miner | vehicle | nose drum >= 8 px long, violet and unmistakably not house hue | **yes** |
| `chronominer` Chrono Miner | vehicle | zero turret mass | — |
| `nighthawk` Nighthawk | air | ~~rotor span >= 1.25x fuselage length~~ (**impossible with our blur disc, see below**) | — |
| `nighthawk` Nighthawk | air | blades 2 px with >= 40% value contrast | **yes** |
| `nighthawk` Nighthawk | air | fuselage height <= 0.35 x length | — |
| `harrier` Harrier | air | wing span >= 1.5x fuselage width | — |
| `harrier` Harrier | air | wing >= 5 px chord at the root | **yes** |
| `harrier` Harrier | air | nose cone >= 4 px | — |
| `hornet` Hornet | air | total span <= 0.45x the Harrier's | **yes** |
| `hornet` Hornet | air | do not add detail it cannot carry | — |
| `mcv` MCV | vehicle | >= 1.20x the widest tank | — |
| `mcv` MCV | vehicle | zero barrel, zero turret ring | **yes** |
| `destroyer` Destroyer | naval | length >= 1.7x any land vehicle | — |
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
| `mammoth` Apocalypse | vehicle | each canister >= 6x6 px and individually countable (gaps >= 2 px) | — |
| `mammoth` Apocalypse | vehicle | twin barrels >= 19 px, visibly two, tapering | **yes** |
| `teslatank` Tesla Tank | vehicle | each column >= 9 px tall x 3 px wide | **yes** |
| `teslatank` Tesla Tank | vehicle | gap between them >= 5 px so the pair reads as two | — |
| `v3` V3 Launcher | vehicle | missile >= 1.10x the truck length, overhanging >= 5 px at the nose | **yes** |
| `v3` V3 Launcher | vehicle | nose cone and fins in house hue, midbody pure white | — |
| `flaktrack` Flak Track | vehicle | ~~body aspect 0.95-1.10~~ (**waived**, see above) | — |
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
