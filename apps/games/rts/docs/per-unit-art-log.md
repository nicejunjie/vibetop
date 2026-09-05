# The per-unit art walk

The user's instruction, 2026-09-05: *"you have to do it one unit after another,
menu item and actually unit inplay"*.

Aggregate tools (`legibility.js`, `cameo-legibility.js`) answer **"is the SET
separable"**. They cannot answer **"does the Rocketeer read as a Rocketeer"**,
and that is the question that decides whether the art is good. So each unit is
taken one at a time, on BOTH surfaces it is met on — the menu cameo and the
thing on the ground — beside RA2's own plate.

**The rig:** `node apps/games/rts/tools/unit-compare.js <key> [...]` writes
`art/out/cmp-<key>.png` — our cameo at the drawn size, our in-play sprite at
zoom 1 on the game's own ground, RA2's real plate. It follows the unit's
faction (an early version only built a Directorate base, so every Collective
unit came back "(not in the panel)" — the rig's fault, not the art's).

## Fixed

| unit | what was wrong | fix |
|---|---|---|
| **G.I.** (and all 14 troopers) | cameo was interpolated MUSH — a grey smear for a helmet — and the scale was driven by WIDTH, so only the top 38% showed: head and shoulders, **no weapon, at any crop depth** (0.72 and 0.82 rendered identically) | nearest-neighbour for portraits; scale driven by the crop's HEIGHT. Every trooper now shows its identifying prop |
| **Grizzly** (and all vehicles) | cameo used `ICON_FACE 4`, "front-on" — a tank becomes a symmetrical lump with no barrel and no hull. Our own side bearings read as tanks instantly | bearing is per class now: vehicles 3/4 side, infantry front-on (RA2 shoots infantry as portraits) |
| **V3 Launcher** | missile lay near-flat on the bed and read as a truck with a pipe; RA2 raises it to ~40° and that diagonal IS the unit. The code comment already said "an angled rail… so nothing competes with that diagonal" — the geometry just never delivered it (25°) | rail, jack strut and rocket raised together |
| **Terror Drone** | a squat body with stubby legs; RA2's splayed spider legs ARE the silhouette | leg reach +25%, arch deliberately unchanged (it is what carries the scale gate at ZMIN) |
| **Tesla Trooper** | §2.2 asks for a silver carapace over >= 40% of the torso; the chest measured 7-8% silver and 74% house colour, and the block's own comment said the budget "cannot go there" while drawing house colour there | torso split horizontally — silver yoke + steel pauldrons and vambraces over a house breastplate; the owner colour moved to a neck gorget and new thigh plates. 43.3% |
| **superweapon clocks** | M1's caption was baked onto the 56x42 clock icon, straight across the countdown numerals | `cameoFor(..., noCap)`, cache key carries it |

## Looked at, and deliberately LEFT ALONE

Not inventing work is part of the job.

- **Power Plant, War Factory** — already match their plates (three towers; the
  ribbed Quonset hangar with its arched opening). Art pass 8 did this properly.
- **Tesla Tank** — ours has tall copper coils with a live arc between them.
  RA2's emitter is more compact, but ours reads instantly as a Tesla Tank at
  our size, and the arc is exactly the energy signature the specialists should
  have. A deliberate stylisation that works.
- **Flak Track** — its barrel is near-vertical where RA2's sits at ~45°. This
  is **deliberate and measured**: the code records that a shallower jib left
  its crown "the same fat box the IFV wears — the two lightest vehicles in the
  game, and the pair the gate scored at 0.709". Do not "fix" it.

## FIXED — Tesla Trooper's carapace, §2.2's one unmeasured clause (2026-09-05)

§2.2's budget for `[SHK]` is **"carapace value >= 0.70 (silver) across >= 40%
of the torso"**. It was not met, and **the code already knew**: the drawing
block carried both of these, a few lines apart —

> "a barrel chest in solid house colour with rounded shoulder caps"

> "He was the lowest uniformed trooper in the roster at 20.6%, and §2.2 spoke
> for his chest — *carapace value >= 0.70 (silver) across >= 40% of the torso*
> — so the budget cannot go there"

The second sentence states the constraint correctly and routes NEW house colour
to the hips *because of it*. The first describes the chest as house colour. The
pixels agreed with the first. No gate saw it: his spike is the shoulder LINE
(thick 13.5 against a 3.64 floor) and nothing measured the carapace.

**Measured, banding the sprite by fraction of its own height** (8 octants x both
owner bakes; silver = `v >= 0.70 && s < 0.20`; owner = pixels that CHANGE
between the owner-0 and owner-1 bake):

| band | silver before | silver AFTER | owner before | owner AFTER |
|---|---|---|---|---|
| helmet 0-22% | 28.4% | 30.3% | 9.1% | 19.8% |
| **CHEST 24-44%** | **7.3%** | **43.3%** | 74.4% | 15.4% |
| hips 44-60% | 1.0% | 3.2% | 88.1% | 88.5% |
| legs 60-100% | 0.0% | 0.0% | 0.0% | 37.5% |

43.3% against the clause's 40%, and 41.7% under the stricter mapping that cuts
the contact shadow out of the bbox before banding. On value alone (the clause's
own words, without the saturation half of the log's probe) the chest is 75.4%.

**Nothing regressed and three things improved.** `spike.belowFloor` 0,
`aspect/size.infantryOutsideRA2Band` 0, `clip` 0/0, `peerVsSelf.infantry` 0, and
he is still 27 px broadside — the widest infantry, unchanged, bbox 27x37 and
aspect 0.73 identical to before. `iou.infantry.mean` 0.5376 -> 0.5375,
`colour.infantry.meanDist` 1.3788 -> 1.3904, `hue.infantryOwnerMean` 0.2972 ->
0.2976. His own owner share went **UP**, 0.3429 -> 0.3488 — mid-pack in a field
running 0.063 to 0.401, and near RA2's own 32.1% for `[SHK]` (§1.1). Every
legibility mean improved and no min moved; the Collective sidebar went 79.4 ->
79.7 mean with 476 -> 465 pairs under RA2's bar.

### What the fix is

The torso splits **HORIZONTALLY**: a silver yoke over the pectorals and the
shoulder line, a house-colour breastplate under it running into the hip armour.
The pauldron caps are steel throughout (§2.2: *"armoured pauldrons ... over a
silver carapace"*), the forearms get steel vambraces, and the owner colour the
chest gave up lands on a **house gorget at the neck** and **house thigh plates**
(a new optional 6th argument to `legs()`, cut from the leg's own quad so it
tapers and swings with the stride).

### The three measurements that actually decided it

**1. The chest's flanks are COVERED, so a vertical plastron paints nothing.**
The first version drew a house plastron down the middle with silver either
side, which is the obvious armour idiom. It moved the chest **7.3% -> 8.8%**.
The arms sit at `sp 6.5` and the pauldron caps reach `cx±4.0`, so the shell is
hidden from `cx±4.0` outward and the VISIBLE torso is only ~9.6 units wide —
the silver was painted behind the arms. Horizontal is the only division this
figure has room for.

**2. The band is the WHOLE chest slab, not its top.** Derived from the drawing
geometry, §2.2's 24-44% looked like the upper chest, and a yoke placed there
measured 8.8%. It is not: the bbox is 37 px and includes the **contact shadow**
below the boots, and the anchor is not `h - UPAD`. Measured off the bake instead
— a per-row profile printing each row's silver and owner counts — the band is
sprite rows 38-45, which is by-21.6 to by-13.6 in drawing coordinates, i.e.
essentially the entire chest polygon. **Read the band off the rows, never off
the source.**

**3. ANTI-ALIASING is most of the budget.** With the yoke in the right place the
chest still measured 38.9% while looking silver, because at ~9 px of visible
torso a facet is 2-3 px and every outline beside it is 1 px of near-black plus
its blend. Those blends land at v 0.55-0.65 — they look like silver and measure
as not-silver. Taking the carapace's and the arm plates' outlines from `#565d68`
to a mid `#98a0ae` moved the chest **38.9% -> 45.6%** on its own, more than any
geometry change in the pass.

### Levers tried, with what each one did

| lever | chest silver |
|---|---|
| vertical house plastron, silver flanks | 7.3 -> 8.8 (**inert** — behind the arms) |
| horizontal yoke at `by-18.2` + brighter steel | 8.8 -> 19.4 |
| yoke to `by-16.0`, bolt amplitude cut, wash .20 -> .12 | -> 24.0 |
| steel vambraces on the forearms, steel fist | -> 29.4 |
| pauldron skirt steel instead of house | -> 34.9 (only once the steel cleared v 0.70 — at `#9ba3af`, v 0.686, it did nothing) |
| yoke to `by-15.2`, deeper hips, longer thigh plates | -> 41.2 |
| carapace + arm-plate outlines `#565d68` -> `#98a0ae` | 38.9 -> **45.6** |
| arc restored to full strength (halo .32, mid `#2b96e0`) | 45.6 -> **43.3** (the price of a readable bolt, paid deliberately) |

**Measured NEGATIVES, recorded so nobody re-runs them:**
* *A steel SLEEVE colour passed to `arms()` does nothing.* `arms()` shades the
  far arm to 0.66 and the near one to 0.76, so no base bright enough to survive
  0.66x and still measure silver exists. It moved the chest 38.6 -> 38.9. The
  arm silver has to be a plate drawn at full value in the callback.
* *Softening the tesla arc is not free in the direction you expect.* Cutting
  the additive wash from .12 to .07 LOWERED the chest 34.9 -> 34.0: the wash is
  drawn `lighter`, so it was raising value faster than it was raising
  saturation. It is tuned as a pair with the halo, not independently.

### Why he is not starved

His owner colour moved rather than shrank. The chest band is 15.4% owner where
it was 74.4%, but the neck gorget (0.21 of the figure's height — **above** the
measured band, so it costs the carapace nothing) and the thigh plates put it
back: the legs were 34% of his mass at **0% remap** and are now 37.5%. The
sidebar crops an infantry cameo to its top 72%, which is why the gorget matters
more than its area suggests — without it his plate is a grey man in a grey
helmet.

## The Engineer has no identity at all (2026-09-05)

Worth stating plainly because it is the largest single art defect found today,
and it was found by asking a question nobody had asked: **which of §2's budget
clauses does any gate actually check?**

Inventory: §2 states **96 clauses** across 41 units. Every unit has exactly one
SPIKES entry. **55 clauses have no measurement behind them.**

The Engineer's row is the one that matters, because his ONE read is not a shape:

> **Inverted value** — a near-white/orange hazmat body where every other
> infantryman is mid-to-dark. **The only light-value soldier on the field.**
> budget: body value >= 0.75 across >= 55% of the torso+legs

His SPIKES entry measures the TOOLBOX. So the thing that names him was never
checked. Measuring torso+legs above value 0.75 across the whole roster:

| | unit | light |
|---|---|---|
| 1 | Tesla Trooper | 32.3% |
| 2 | Tanya | 27.9% |
| **3** | **Engineer** | **26.0%** |
| 4 | Rocketeer | 24.1% |
| ... | ... | ... |
| 13 | Desolator | 4.7% |

He is **third**, at 26% against a clause asking 55%. "The only light-value
soldier" is not merely under-delivered, it is false. And the roster runs 4.7%
to 32.3%, so nobody is light — the inversion the design turns on does not exist
for anyone, which is why he cannot stand out by having it.

Gated now, three ways, because they fail differently:

- `value.soldiersLighterThanEngineer` (want 0, is **2**) — the identity claim
  stated as a number, and robust to where the torso is judged to start.
- `value.engineerLightPct` (want >= 0.55, is **0.194** whole-sprite) — the
  clause as a fraction. A roster that goes pale WITH him would leave him first
  and still unreadable.
- `value.engineerMarginOverNext` (want >= 0.15, is **-0.0745**) — the read is a
  CONTRAST. Coming first by a point satisfies the ordering and still leaves a
  player unable to pick him out of a squad.

Not fixed here: the fix is a repaint, and he already carries the HIGHEST owner
share of any infantry (0.401 in a field of 0.063-0.401), so light body against
owner colour is a real trade that needs its own measured pass.

## FIXED — the Engineer's inverted value, and the trade never had to be made (2026-09-05)

**0.194 -> 0.638 whole-sprite; torso+legs 21.1% -> 71.3% against a clause asking
55%; first by 0.280 where he was third by -0.164.** All three gates green.

The pass above closes with "light body against owner colour is a real trade".
**It is not a trade at all, and that is the finding.** His owner share went UP —
0.4007 -> 0.4098 — while he became the only light-value soldier on the field.
Not one square pixel of house colour was given back.

### Why the trade looked real, and why it was not

`lightPct` counts `v = max(r,g,b)/255 >= 0.75`, and **every one of the eight
house colours already clears that bar** — blue `#4aa3db` is 0.859, red
`#e5646c` 0.898, and the darkest, green `#5ec468`, is 0.769. So an owner pixel
is only dark when the code *shades it down*. Measured on the sprite, 76% of his
owner pixels sat below the line — not because they were house colour but
because they were house colour at `shade(col, 0.38..0.76)`: panel outlines,
strap outlines, the toolbox edge, the shaded fold. **The waistcoat was never
what made him dark. The waistcoat's SHADING was.**

### What the sprite is actually made of, which is the whole lesson

The colour census (`opaque` px over 8 bearings, owner-0 vs owner-1 bakes):

| surface | %area | value | light? |
|---|---|---|---|
| contact shadow, pure black | **11.7%** | 0.000 | never |
| shirt OUTLINE `shade(SHIRT,0.52)` + its AA | **7.0%** | 0.59 | no |
| shirt FILL | 2.9% | 0.855 | yes |
| owner pixels below `shade(col,0.80)` | **~30%** | 0.49-0.76 | no |

The outline of one garment covered **more of the sprite than the garment**.
That is the finding to carry forward: at 21x34 an infantryman is roughly half
EDGE, so **the outline colour is a first-class design decision, not trim** —
independently the same conclusion the Tesla Trooper's carapace pass reached the
same afternoon, which is worth taking as corroboration rather than coincidence.

The value ladder could never have found this. `INF_VALUE` is a gamma, so it
lifts a fill and its edge *by the same ratio* and the figure keeps its shape in
value. Only an absolute floor moves an edge relative to its fill.

### The fix, in three levers, with what each one bought

Whole-sprite `value.engineerLightPct`, cumulative:

| lever | -> | note |
|---|---|---|
| baseline | 0.194 | |
| owner shade factors 0.38-0.76 -> 0.82-0.88 | **0.398** | +0.204, and ownerPct went UP |
| `INF_EDGE.engineer = 0.70` (new edge floor) | **0.464** | +0.066 |
| near-white coverall `#efece1` / `#e9e5d6` | **0.638** | +0.174 |

* **`INF_EDGE`** is a per-kind FLOOR on the shade factor of an edge, read once
  in `bakeInfantry` and applied through a one-line `edge()` wrapper so the
  shared `legs()` / `arms()` / `helmet()` each keep a single call site. A floor
  and not a multiplier, so every LIT face (1.02-1.42) is untouched and the man
  is still lit from the same corner, on a shorter value range. Absent from the
  table means 0, i.e. `edge()` IS `shade()`.
* **The vest is HI-VIS, not house paint** — the same AREA, drawn at
  `shade(col, 1.16)` with a 1.38 lit strip. Sky blue against coral red.
* **The toolbox stays solid `col`.** A deliberate split: the garment is pale,
  the PROP is the most saturated thing on him, which is what the §2.2 spike is.

### Swept, and what each measured — including the three that did nothing

* **`INF_EDGE` 0.58 / 0.62 / 0.70 / 0.78 / 0.86** -> 0.464 / 0.492 / **0.638** /
  0.670 / 0.676. Not linear, and the knee is arithmetic, not taste: a coverall
  at 238 crosses the light line at `160/238 = 0.672`, so 0.62 leaves every edge
  just under and 0.70 takes them all over at once. 0.78+ buys 3 more points by
  flattening the shading further, for no gate. **0.70 is the smallest floor
  that clears the clause, and it keeps a visible 20% step at every edge.**
* **Vest `shade(col,1.16)` vs plain `col`** -> 0.6438 vs 0.6429, threshold
  identical, `meanDist` identical. **Metric-inert.** Kept on art grounds only
  (a hi-vis waistcoat over a white coverall is the garment §2.1 names), and
  recorded as inert so nobody re-measures it hoping for a number.
* **Boot `#6d6653` -> `#8d8263`** -> 0.6384 vs 0.6438. Worth 0.005. **Reverted:**
  a near-white figure needs one dark note at the ground or he floats.
* **Coverall alone** (`#efece1` back to `#d8d4c6`, edge floor kept) -> 0.587,
  and **trousers alone** (back to `#c6bfa6`) -> 0.561. Both still clear 0.55,
  so the edge floor is the load-bearing lever and the whitening is the design.
* **Which `edge()` call sites actually FIRE**, checked one at a time rather
  than assumed, because a floor makes some of its own call sites no-ops:
  `helmet()`'s outline at 0.38 is worth **0.040** by itself, but
  `edge(CAP, 0.78)` and `edge(ACCENT.engineer, 0.72)` are **exactly inert** —
  0.72 and 0.78 already clear the 0.70 floor. They are left written as `edge()`
  as policy (they participate if the floor ever rises), and recorded here as
  doing nothing today so the next reader does not credit them.

### The gate that moved that nobody was watching: `dog | tanya`'s FLOOR

`legibility.js`'s threshold is the MEDIAN over units of the same unit in the
two owners' colours. Per-unit, CELL 96 zoom 1, the Engineer's own friend-vs-foe
distance went **11.7 -> 14.1** (rank 20th of 40 -> 29th) — the largest single
gain in the roster, and every other unit byte-identical. That pushed the median
one place, so the threshold went **12 -> 12.2**.

`dog | tanya` did not move. Its MARGIN did: 12.5 against 12.0 is now 12.5
against 12.2. Still clear, still 0 confusable, ZMIN untouched (9.5 vs 8.6) —
but this is the same lesson the reverted dog shrink taught from the other side,
met from a direction nobody had considered: **you can disturb a pair you never
touched by making a THIRD unit easier to tell friend from foe.** The bar rose
because the art got better. Worth knowing before reading a threshold move as a
regression.

Everything else held. All six legibility windows: infantry MEANS up
(52.8->54.0, 41.1->42.1, 16.6->16.9, 12.1->12.3, 72.1->73.6, 68.5->70.0), every
minimum unchanged, 0 confusable throughout. Cameos: `GI | Engineer` 59.7 left
the Directorate worst list entirely, pairs under RA2's bar 380 -> 371, 5th pct
68.4 -> 69.1, DPR 2 149 -> 146, greyed 11 -> 10; Collective 460 -> 458.

### Two traps paid for

* **A null result must prove the edit landed.** Both null-checks here are the
  other 13 infantry: their `lightPct` and their torso+legs band are
  byte-identical before and after, which is what proves `INF_EDGE` is
  kind-scoped rather than proving nothing happened.
* **Read the band off a per-row profile, never off the draw coordinates.** The
  bbox includes the contact shadow (11.7% of opaque px, pure black, and it
  extends below the boots), and `by - 19.4` is pre-STATURE, pre-TURN and
  pre-`USC_I`. `scratchpad/engv-band.js` segments the shadow off by colour,
  re-derives the figure's own bottom from what is left, and bands from 24% of
  THAT height. Its main-baseline number for the Engineer is 21.1% where the
  entry above records 26.0% — same ordering, same verdict, different band
  convention; cite one or the other, never both as one number.

## The dog's size and `dog | tanya` pull the same lever (2026-09-05) — REVERTED

Commit a7759b1 shrank the Attack Dog to [0.84, 0.84], closing
`size.infantryOutsideRA2Band`. **It has been reverted**: it pushed
`dog | tanya` under the friend-vs-foe floor in the CELL 96 window at both
zooms, and that was caught by another pass reading the legibility output, not
by the run that shipped it — the size sweep never opened `legibility.js`.

The two gates pull on ONE lever, in opposite directions. A dog's LENGTH is
exactly what separates a quadruped from an upright figure, and RA2 fidelity
wants that length shorter. Measured, cell96 zoom 1 / zoom 0.75 against floors
of 12 / 8.6:

| STATURE.dog | z1 | z0.75 | size dev |
|---|---|---|---|
| **[1.00, 1.00]** | **12.5** | **9.5** | **+31%** |
| [0.94, 0.94] | 12.0 | 8.5 | +24% |
| [0.90, 0.90] | 12.1 | 8.5 | +18% |
| [0.84, 0.84] | 11.7 | 8.5 | +11% |
| [0.94, 0.86] | 11.8 | 8.3 | +24% |
| [1.00, 0.86] | 12.0 | 8.7 | +31% |

**Nothing below full width clears ZMIN.** Flattening him does not rescue it
either — and the one flattened row that passes does so by keeping full width,
so it buys no size at all. A legibility floor is player-facing and outranks a
fidelity gap, so the size debt stays.

What is KEPT from that commit: `bakeDog` now reads `STATURE.dog`. The row had
existed forever with nothing reading it, and the lever works now — it is simply
parked at 1.00. My first guidance here was to attack the COLOUR axis instead - a tan dog and a
Tanya whose own §2 row asks for ">= 30% of body px in skin tone" are two tan
masses of a size. **That was tested the same day and it is WRONG.** Deepening
the dog's black saddle down the flank moved his composition by a measurable
amount - dark 24.1% -> 26.1%, tan 63.9% -> 61.8%, and the edit was grepped to
prove it landed - and moved `dog | tanya` by 0.1 at zoom 1 and by NOTHING at
ZMIN (12.5 -> 12.6, 9.5 -> 9.5).

The reason is arithmetic, and it applies to every future attempt in this
window. CELL 96 pads both sprites into a 96x96 = 9216 px cell that a ~1100 px
dog fills about 12% of. The distance is an RMS over the whole cell, so 88% of
it is background contributing zero and any difference INSIDE the silhouette is
diluted roughly eightfold. A size change alters which pixels are covered at
all, which is why length moves this metric and paint does not.

So CELL 96 is a FOOTPRINT window, not a colour one, and `dog | tanya` cannot be
separated there by repainting either animal. The options that remain are
honest ones: leave the size debt (current choice), or change the dog's
footprint in a way that is not a uniform shrink - a longer, lower dog was tried
and fails the aspect band. Do not spend another pass on paint.

The wider lesson, and the reason this is written up rather than quietly fixed:
**a size sweep that never opens `legibility.js` is not a finished sweep.** The
art gates are not independent.

## The ratio clauses, checked against measured bboxes (2026-09-05)

Six of §2's unmeasured clauses state a plain ratio, so they can be checked
against `broadsideWH` with no new machinery. **These are INDICATIVE, not
verdicts** — a bbox includes turret, load and barrel, and most of these clauses
name a sub-part.

| unit | clause | measured | verdict |
|---|---|---|---|
| `lancer` | hull height <= 0.45 x length | 0.42 | ok |
| `ifv` | body aspect 1.0-1.2 | 1.08 | ok |
| `chronominer` | height <= 0.55 x length | **0.60** | over by 9% |
| `nighthawk` | fuselage height <= 0.35 x length | 0.38 | not a fair test — the clause says FUSELAGE and the bbox is dominated by the rotor disc |
| `flaktrack` | body aspect 0.95-1.10 | 0.88 | already-documented deliberate choice — its near-vertical barrel is measured and recorded above; do not "fix" |
| `sub` | height <= 0.20 x length | 0.23 | conning tower is inside the bbox |

**Nothing changed.** The one real candidate is the Chrono Miner at 0.60 against
0.55, and it was looked at on both surfaces: long low body, violet ribbed drum
nose, tan bin behind, no turret — it matches its row, and its broadside aspect
sits inside the RA2 band at 0.849. A 9% overshoot on a clause whose bbox
includes the raised bin sides is not enough to deform art that reads correctly.
Recorded so the next pass starts from a measurement instead of re-deriving it.

The useful part is the method: of the 55 unmeasured clauses, the ratio-shaped
ones cost nothing to check, and doing so cleared four units in one pass.

## Why the G.I. is in five of the sidebar's eight worst pairs (2026-09-05)

The Directorate sidebar's worst pairs are not a scatter — they are a HUB:

    53.6  GI | Spy                    61.4  Battle Lab | GI
    58.8  GI | Rocketeer              62.2  GI | Chrono Legionnaire
    59.7  GI | Engineer

Looked at side by side, the five plates are one picture: an owner-blue torso
filling the centre of the frame, head-and-shoulders, same framing, same value
range, with identity carried by a small low-contrast prop — a rifle, a
briefcase, a cap, a chrono gun. The props are what a *reader* is asked to
compare; the *metric*, and the eye at sidebar size, sees the blue.

Measured — owner-hue blue as a fraction of the plate's centre band:

| unit | centre blue | in a worst pair? |
|---|---|---|
| Chrono Legionnaire | 54.8% | yes |
| Spy | 50.8% | yes |
| **G.I.** | **47.6%** | **yes, five times** |
| Rocketeer | 38.3% | yes |
| Engineer | 37.6% | yes |
| Crazy Ivan | 30.7% | no |
| Yuri | 21.2% | no |
| Flak Trooper | 19.6% | no |
| Tanya | 15.0% | no |

The cut is clean at about 35%, and their blue FOOTPRINTS overlap too — Jaccard
0.36 on a 4 px grid for `spy|engineer`, `rifle|engineer`, `spy|cleg`,
`rifle|spy`. Same colour, same place, same size.

**This is one defect with many names, not five pairs to tune.** And the two
fixes made today are both instances of the cure rather than one-offs: the Tesla
Trooper's silver carapace and the Engineer's coming light body each break the
shared blue centre mass with a large-area feature of their own. Tanya at 15% is
the existence proof — she is the least owner-coloured uniformed figure on the
board and she is in none of the worst pairs.

So the principle for the next passes, and it is the same one §2 states unit by
unit: **identity has to live in the LARGE areas.** A plate whose centre half is
the same blue as its neighbour's cannot be rescued by a better briefcase.

## Recorded disagreement, NOT changed

- **Mirage Tank** — RA2's plate shows a clear gun barrel; ours has essentially
  none. The code states this was deliberate — *"No turret, and almost no gun:
  just a stubby muzzle under the stack's chin"* — citing a reference. Two
  cited readings disagree; changing it against a prior deliberate decision
  needs better evidence than one plate, so it is written down instead.

## The Spy is CORRECT — I was reading the cameo again (third time)

I recorded, in a commit message, that "the Spy is still BLUE where RA2's is a
man in a dark suit" and that he needs the Rocketeer's fix. **That is wrong.**
The code says why, citing the identity reference:

> "THE COAT IS THE HOUSE ZONE. §1.5's table gives the Spy `fedora / long coat /
> coat hem, no split legs / briefcase`, and the middle column of that table is
> headed 'mid zone (HOUSE)' — RA2 remaps the coat, exactly as it remaps a GI's
> torso."

His coat is blue because it is the house zone, by design and by reference. RA2's
*painted plate* shows a dark suit; RA2's *sprite* remaps. Same trap as the Grand
Cannon and the Psychic Sensor, and I walked into it a third time — after writing
the rule down twice.

**And the budget move I was going to make to pay for it is also forbidden.**
Tanya sits at 15.7% owner colour, second-lowest after the dog, so raising her
looked like free headroom. She is EXEMPT on purpose: `hue.infantryBelowBudget`
is **0**, and its note reads *"RA2's own 14.3% low end IS Tanya"* and *"close
the gap on the other twelve, never by painting those two."* Ours at 15.7% is
already RA2's own figure.

So there is no Spy work and no Tanya work. Checking the recorded design cost two
lookups; doing it would have cost two units moved away from RA2.

## Open — re-checked 2026-09-05

Two of the three items that stood here are CLOSED, and were verified rather
than assumed before being struck:

- ~~The Aegis is drawn 54x65, TALLER THAN WIDE~~ — **closed.** She measures
  82x37, aspect 2.216, 0.852 of RA2's cruiser, inside the band. `aegis | squid`
  is no longer a confusable pair in any window.
- ~~The Tesla Trooper has no electric arc at all~~ — **closed.** He carries a
  live arc across the gauntlets (`TT_STUD`), and the carapace pass of
  2026-09-05 deliberately restored it to full strength, paying 45.6% -> 43.3%
  of chest silver for a readable bolt.

Still open:

- ~~The Desolator has no ENERGY SIGNATURE~~ — **closed, and the item was
  measuring the wrong thing.** The complaint compared our CAMEO to RA2's plate,
  which is dominated by a yellow-green glow. But §2.2 does not ask his body for
  a glow at all. It asks for "charcoal hazard suit with house-colour plates",
  and puts the green somewhere else entirely: *"Deployed: crouched inside a
  green radiation pool — **the pool is the silhouette**"*, budget `deployed
  pool >= 1 tile`.
  That clause is MET, and implemented with care: `DESO_RAD_R = 3` tiles, drawn
  as shimmering green tile diamonds plus motes lifting off the hottest cells,
  `source-over` rather than `lighter` for a recorded reason (under `lighter` a
  1 px bleed doubled every shared edge and the pool read as a green wireframe
  grid instead of a wash).
  **A body glow was built, measured and thrown away.** `source-atop` green
  underlighting from the emitters took the hue from 5.4% to 29% of the figure
  and `colour.infantry.meanDist` from 1.3898 to 1.4175 — every number liked it
  — and he came out a green blob with the charcoal suit and the house plates
  both swamped. That is the row violated in order to satisfy a requirement the
  row never made. Backing it down to 11% left the sprite defensible and the
  CAMEO still over-green, because the portrait crop takes the top of the figure
  where the emitters are.
  The lesson is the one this file keeps re-learning from the other end: **read
  the row before believing the complaint.** "Ours does not look like RA2's
  plate" is a statement about a cameo; the clause was about the ground.

## Measured NEGATIVE results — recorded so nobody re-runs them

- **`peerVsSelf.naval` measures ELONGATION, and the aspect gate demands
  elongation (2026-09-05).** This debt has been carried for a long time and it
  is worth knowing what it is before spending another pass on it.
  `selfIoU` is a unit's mean silhouette overlap across its own eight bearings.
  For a long low hull that number is inherently small — a destroyer seen bow-on
  and a destroyer seen broadside genuinely ARE different shapes under a 2:1 iso
  camera — so `peersBeatingSelf` fires as soon as any neighbour overlaps more
  than the unit overlaps itself. Correlation of broadside aspect against
  selfIoU: **−0.893 across the ten hulls, −0.759 across all 41 units.**

  | hull | aspect | selfIoU | peers beating |
  |---|---|---|---|
  | Typhoon | 4.40 | 0.3228 | 2 |
  | Giant Squid | 3.47 | 0.3044 | 6 |
  | Dreadnought | 2.42 | 0.4602 | 2 |
  | Aegis | 2.22 | 0.5129 | 2 |
  | Destroyer | 2.12 | 0.4763 | 3 |
  | Landing Craft | 1.79 | 0.6944 | **0** |
  | Amph. Transport | 1.54 | 0.7052 | **0** |
  | Sea Scorpion | 1.49 | 0.6558 | **0** |

  The three hulls that pass are the three LEAST elongated on the board. Every
  hull above aspect ~2.1 fails, and `aspect.navalOutsideRA2Band` is what put
  them there: RA2's fleet is long and low, and the 2026 naval pass rebuilt ours
  to match. **Driving `peerVsSelf.naval` to 0 means making the fleet stubbier,
  which is the fidelity work undone.**
  Not "fixed", and the target deliberately NOT moved — moving a target to make
  a number go green is the thing this whole file exists to prevent. What is
  warranted is knowing that this debt is a property of the METRIC meeting a
  correct fleet, not of the art. If it is ever worth closing, the change is to
  the comparison (bearing-matched, the way `crossIoU` already works), not to
  the hulls.

- **The SPIKES budgets are NOT quietly weakened to the generic floor (2026-09-05).**
  24 of 41 units carry `budget: 3.64`, the generic floor, and that looks at
  first like 24 specific clauses replaced by a default. It is not. Of those 24,
  ten quote a specific number in their `src`, and **nine encode it correctly as
  `lenBudget`** rather than as a thickness, because the number is a LENGTH, a
  HEIGHT or a REACH and `thick` is the wrong axis for it — Chrono Miner 8,
  Dolphin 3, Terror Drone 4, Flak Track 10, Crazy Ivan 2, Apocalypse 19, Mirage
  6, Tanya 2, V3 5. The other 17 units carry a real declared budget above the
  floor. So the spike layer is in good order.
  The single exception is the **Chrono Legionnaire**, whose `lenBudget` is null,
  and its `src` says why: *"rifle >= 9 px LONG held horizontal — a LENGTH, and
  spikeOf measures PROTRUSION, so this cannot be checked as a spike run"*. That
  is correct rather than an excuse: a 9 px rifle overlapping the body by 2 px
  protrudes 7 px, and 7 is exactly what the tool measures. Do not "fix" it by
  setting `lenBudget: 9` — that asserts a protrusion the geometry does not
  produce, and it would fail a unit that meets its clause.
  His shape clauses do hold, checked separately: the row asks for a shoulder
  line ">= 20% wider than a GI's", and ours is 23 px against the GI's 17, i.e.
  35% wider. His place in the sidebar's worst pairs is the shared blue centre
  mass documented above, not his silhouette.

**The IFV: do not lengthen it.** It is 17 long against 15 wide, by far the
shortest thing that drives, and it appears in FOUR of the sidebar's eight worst
pairs — so stretching it toward RA2's longer eight-wheeled car is the obvious
move. It is wrong. At len 24 the art gate returned `peerVsSelf.vehicle` 1 -> 3
(three vehicles matching a PEER better than their own other bearings),
`iou.groundCombat.mean` over its 0.45 ceiling, and `mass.tightestBand6`
2.093 -> 1.801, under its floor of 2. At len 20 it still failed. Lengthening
crowds the 22-24 band that mirage, flaktrack and v3 already share, so the IFV
stops being separable BY SIZE. **Its shortness is its place in the size
ladder.** Fix its cameo collisions with value or a prop, never length.

## A CAMEO is not a SPRITE — do not read proportion off a plate

**Psychic Sensor.** RA2's plate shows a tall slender tower; ours is a wide flat
drum, and it collides with the Cloning Vats, the Nuclear Reactor and the Flak
Cannon, which are also squat. The obvious read is "our proportion is inverted".
But the code cites `[NAPSIS]` as "a squat armoured drum", and RA2's in-game
Psychic Sensor IS drum-like — its cameo is a dramatic low-angle hero shot, the
way most of the corpus is.

So: use RA2's plates to judge COMPOSITION, LIGHTING and what the subject's
identifying feature is. Do NOT read in-game proportion off them; that is what
the sprite rips in `docs/ra2-ref/` are for. The Aegis case is different and
still stands, because there the in-play sprite is measurably taller than wide,
which no camera angle explains.

**The Grand Cannon confirmed this within the hour, and it had already bitten
once.** RA2's plate is dominated by an enormous barrel; ours is a stubby gun on
a fat dome, and it collides with the IFV and the Ore Purifier — so lengthening
it looked like the same win the V3's raised rail had been. The code stopped it,
because a previous pass had already made and undone exactly that mistake,
citing a 1:1 re-read of the in-game render
(`docs/ra2-ref/allied-grand-cannon.png`, 181x133):

> "The previous pass had this the wrong way round: it drew a low drum on a big
> parade slab with a forty-pixel barbette gun, and nearly all of the sprite was
> that barrel. The real French emplacement is the OPPOSITE — a fat rounded
> ARMOURED DOME, taller than it is wide once the gun is on ... and the gun
> poking out of its shoulder is SHORT and thick."

Two units, two hours apart, the same trap with opposite answers: the V3's
raised rail was RIGHT (its sprite really does carry the missile high) and the
Grand Cannon's long barrel would have been WRONG. **The plate cannot tell you
which. Only the sprite rip can.** Check the rip before changing a proportion.

## The standing lesson

Three of the five fixes above were **invisible to every aggregate metric**, and
two of them made the aggregate slightly WORSE while making the unit obviously
better: the infantry crop cost 4% of pairs-under-RA2's-bar because showing more
of each man makes the men more alike. The metric cannot see "reads as a G.I.".
Keep both instruments; when they disagree, the picture wins and the trade gets
written down.

---

# Where the art stands, 2026-09-05

## The map: DONE by the measure we have

**Zero confusable pairs in every group, in all three windows, at both zooms.**
Not one vehicle, trooper, aircraft or hull is closer to a peer than a player is
to telling friend from foe. `aegis | squid`, carried for weeks, is gone —
closed by PROPORTION once the fleet was measured on the rendered frame instead
of on plan geometry.

## The sidebar: most of the way, and the rest is the medium

|  | at the start | now | RA2 |
|---|---|---|---|
| worst pair | 27.2 | **53.6** | 58.5 |
| 5th percentile | 36.7 | **68.4** | 81.7 |
| median | 51.2 | **82.6** | 100.5 |
| greyed floor | 12.2 | **35.1** | — |
| pairs under RA2's bar | 780 / 780 | **372** | — |
| at DPR 2 | 717 | **150** | — |
| plate luminance SD | 10.2 | ~21 | 22.6 |

Four of RA2's five differences are closed: the NAME is on the plate, each plate
has its own ENVIRONMENT, the subject FILLS the frame, and the CAMERA varies by
class (infantry front-on portraits, everything else three-quarter). What is
left is the medium — RA2's plates are painted scenes and ours are our own
sprites, well framed.

## The current worst pair, and a measured dead end

`GI | Spy` 53.6. Both read as a pale head over a blue torso at 60x48.
Brightening the rifle's barrel glint (#5c636e -> #a7aeb9) to make the G.I.'s
weapon read — RA2's plate is dominated by it — made the pair **worse**, 53.6 ->
53.4: the extra pale pixels push him TOWARD the pale-hatted Spy. Reverted.

It also arrived as a deliberate trade: it was 56.1 before the Rocketeer
whitening and the stature moves, which took the MAP to zero confusable infantry.
The two surfaces do not always move together, and when they disagree the map is
the one being played.

## Structures: checked, and the answer keeps being "already deliberate"

Power Plant, War Factory, Airforce Command, Battle Lab, Ore Refinery, Barracks,
Grand Cannon, Psychic Sensor — all walked through the rig against their plates.
**None needed work.** Two produced near-misses that the code itself stopped
(Grand Cannon's barrel, Psychic Sensor's proportion) and one more nearly did:

* **Airforce Command helipads.** The four pad slots carry a house-coloured
  double diamond over an OLIVE field with dark blades and a tan centre, which
  at a glance reads more like carpet than concrete. It is deliberate and laid
  out from the geometry, not eyeballed — *"the four quadrant centres ARE the
  Harrier pad slots (PAD_SLOTS), so the markings are laid out from them"*. With
  no sprite rip of RA2's own pads to check against, a documented decision beats
  my hunch. Left alone.

**This is the signal that the per-unit walk has done its work.** It is now
returning "already correct, and here is the reference" far more often than it
returns a defect — six of the last eight units. The remaining sidebar gap to
RA2 is not art direction any more; it is that RA2's plates are painted
illustrations and ours are our own sprites, well framed. That is a different
project, and it should be started deliberately rather than arrived at by
another lap of this one.

## The composited FRAME — the measurement the tool asked for, finally taken

`legibility.js`'s own header has said this since it was written, and nobody had
done it:

> "the reporter was looking at a BATTLE, where units are at eight facings,
> overlap, and carry bars and effects. This tool compares one facing, isolated,
> side by side, which is the most flattering arrangement there is. **Do not read
> a pass here as 'vehicles are fine on the map.'** The honest next step for that
> complaint is to measure a composited FRAME, not a roster."

Done: two full armies, twelve kinds each, mixed arms, overlapping, some
damaged so the health bars are up, at zoom 1 and at ZMIN
(`scratchpad/frame/battle-z*.png`). No page errors.

**It passes, and it passes on the thing that matters most.** Friend-from-foe is
instant — blue army left, red army right — which is the read a player makes
every second. And the units whose identity this pass rebuilt are exactly the
ones that announce themselves in the crowd: the V3's raised white missile, the
Tesla Tank's copper coils, the Terror Drone's splayed legs, the Prism Tank's
mast, Yuri's robe, the Desolator's glow.

**One hypothesis formed by looking, and MEASURED FALSE.** In the frame the red
army seemed to carry less owner colour than the blue. It does not:

    Directorate vehicles 0.172   infantry 0.268
    Collective  vehicles 0.164   infantry 0.323

Essentially equal on vehicles, and the Collective's infantry carry MORE. The
impression comes from red-on-sand having less contrast than blue-on-sand, which
is a property of the colour pair and the terrain, not of our art — and it is
the player who picks the colour. Recorded so the next person who sees it in a
desert frame does not go looking for an asymmetry that is not there.

## COMBAT ART — reviewed for the first time, and it held two real defects

Every check this project had was a STATIC ROSTER: units standing still, one
facing, isolated. None of it fires a weapon, so none of it could see a weapon
effect. Rendering actual firefights found three defects in an hour that
`legibility.js`, `art-metrics.js` and `cameo-legibility.js` are all structurally
blind to.

| effect | verdict |
|---|---|
| **tracers** | **FIXED.** Trail ran `f-0.25` to `f`, so its length was a QUARTER OF THE FLIGHT — tracer length scaled with the weapon's RANGE. Now a fixed screen dash (11 px, 20 for rockets), clamped to the distance actually covered |
| **Tesla Tank bolt** | **FIXED.** The `tesla` flag was `src.type === 'tesla'` — the COIL BUILDING only — so the tank fired an invisible bullet and drew no arc at all |
| **Prism Tank beam** | **FIXED.** Both beam branches subtracted a fixed BUILDING emitter height (104 coil / 86 prism crown), so a tank's beam started ~90 px above itself, off the top of the frame, and appeared to come out of the sky |
| explosions | correct — orange burst over a dark core, resolving to proportionate scorch marks |
| infantry death | correct — upright at the instant of the hit, prone corpses by t=30, as RA2 does |
| vehicle wrecks | scorch plus small debris; no persistent husk. Left alone, not investigated as a defect |

**A FOURTH "defect" that was not one, and it nearly cost a fix to working
code.** I rendered four Grizzlies at 100 / 60 / 30 / 10% health, looked at the
frame, and concluded they were pixel-identical — no smoke, no fire, no damage
state at all — with `fx: 0` after 120 ticks as apparent confirmation. The code
for it already exists (`u.hp < u.maxhp * 0.5`, smoke below half, flames below a
quarter) so I went looking for why it was disabled: `art.fr` (infantry only,
not vehicles — gate is correct), `oy` in scope (it is), an early return (none),
NaN arc coordinates (none).

The answer is that it was never broken. Rendering the SAME tank at full health
and at 20% and diffing the two images gives **594 differing pixels in a 28x47
box directly above the hull** — and magnified, the damaged tank plainly carries
orange flames at the hull and a dark smoke column above it. `fx: 0` was a red
herring: this is drawn straight to the canvas each frame, not pushed onto the
`fx` list.

I could not see it in a 2x downscaled crop of a four-unit scene. **A diff of two
renders is worth more than a careful look at one**, and it took four eliminations
to reach for it. The look is what finds defects; the diff is what confirms one
is real before you touch working code.

**Superweapons reviewed too, and both are correct.** The nuke shows a target
reticle for its 600-tick flight, then a mushroom cloud with a white-hot core,
an expanding green radiation ring and a scorched crater with a lingering
fallout tint. The lightning storm lays real cloud cover, darkens the ground
under it and damages what stands there. Neither needed work.

**Naval art seen on real water, and one thing NOT verified.** On the coastal
map the Destroyer and Aegis read as long low warships — the proportion fix
visible in situ, not just in a metric — and a submerged submarine is a clean
dark silhouette under the surface. **Wakes in motion remain UNCHECKED**: the
fixture spawned one hull on sand and aimed its move order at land, so
`moving: 0` and nothing was under way. Recorded as unverified rather than
claimed, because a static hull tells you nothing about a wake.

To pick water on a generated map: `MAP` is 64 and the index is `y * MAP + x`
(there is no `g.w`); T_WATER is **3**; and only the `coastal` map has a
worthwhile sea — `frontier` has none at all.

**Ore harvesting reviewed — no defect.** The miner drives out, mines (cargo
climbs to 286), warps home rather than driving — which is RA2's Chrono Miner —
and delivers, with credits rising to prove it. The chronoshift draws PAIRED
cyan diamond markers, one where the hull left and one where it arrived, and
the ore field visibly thins on the worked side. Its effect lives 24 ticks out
of a harvest cycle over a thousand long, so it can only be caught by
conditioning the capture on `g.fx.some(f => f.chrono)` — a fixed tick count
misses it every time, which is how I first concluded there was no effect at all.

**Warheads reviewed — the last surface with no coverage. No defect.**
* **Radiation** ([RadSite], a dug-in Desolator) is unmistakable: bright green
  irradiated ground spreading round the pit, with anything standing in it
  taking damage. Very visible, correct.
* **Flak** ([FlakWH] vs an aircraft) is a short dark tracer up and then a small
  grey puff that hangs at the target — exactly what its own comment describes.
  It is SUBTLE, and RA2's is more prominent, but it exists and is placed
  correctly. Not called a defect: after three false alarms in this stretch the
  bar for "this is wrong" is higher than "I would have drawn it bigger".

**THE LAST FIXTURE TRAP, and the nastiest.** The page's own requestAnimationFrame
loop KEEPS RUNNING after `page.evaluate()` returns, and it steps the sim. A
`waitForTimeout(60)` before the screenshot therefore advances the game by
several frames. A flak shot's whole life is **9 ticks, about 150 ms**, so the
wait ate it and the frame came back empty — I chased that through pinning the
aircraft, matching the shot's target coordinates (12.45,10.01 against the
Harrier's 12,10 — they agreed) and re-deriving the burst geometry before the
answer turned out to be the 60 ms. **For any effect shorter than ~15 ticks,
screenshot with NO delay after the evaluate.**

**The harness matters more than any one fix.** It captures on the CONDITION
that a shot or effect exists rather than on a timer, and it is parameterised per
weapon — so the remaining warheads, damage smoke and naval wakes are inspectable
the same way. `scratchpad/frame/{fight,fx,death}.js`.

Three fixture traps paid for and worth not re-paying:
* `H.begin(seed, diff)` sets `headless = !arguments[4]`, and a HEADLESS SIM
  NEVER PUSHES SHOTS OR FX. The first pass "found no combat art" because it had
  rendered none. Pass a fifth truthy argument.
* `damage(g, src, tgt, amount, wh)` — src is second and may NOT be null; it
  reads `src.kind`.
* Spawn victims on YOUR side or the whole scene is under fog and only the
  explosions show through it.
* Spawn a harvester CLEAR of its refinery: the building is 4x3 about its
  origin, so `s.x+2, s.y+2` lands inside the footprint and the miner sits in
  `tomine` forever, never pathing out. It looks exactly like a broken harvest.
* `swFire` returns false unless `side.sw[key].ready` is set — charge it first.
* A bare match sets `g.over = 1` on TICK 0 (no enemy base), and `finish()` fires
  180 ticks later, so any capture past ~180 ticks lands on the SCORE SCREEN. Building
  an enemy structure does not help; the flag is already set. Re-zero `g.over`
  and `g.overAt` inside the step loop. This is the same trap the order probe
  documented, met from a different direction.

## Selection and order feedback — reviewed, correct

Cyan corner brackets scaled to each unit's footprint, health bars on the
selection, enemy hulls correctly unbracketed. RA2 uses the same corner-reticle
idiom. No work needed.

## This is where the art pass ends, and why

Every surface now has coverage: units (all 60, individually, against RA2's own
plates), cameos, terrain and cliffs, combat effects, damage states,
superweapons, naval wakes, ore harvesting, warheads, and selection feedback.

**The tell is the hit rate.** The first two units through the per-unit rig
found two SYSTEMIC defects (the infantry crop, the vehicle bearing). The last
stretch found four real fixes against four verified-correct and THREE FALSE
ALARMS of my own — damage smoke, and the wake twice. When the misses start
outnumbering the hits, the remaining signal is below the noise of the method.

What is left is not art direction:
* RA2's cameo plates are painted illustrations; ours are well-framed sprites.
  Closing that means commissioning art, and should be decided deliberately.
* `peerVsSelf` still correlates +0.487 with aspect after the fix. Whether that
  residue is artefact or the real similarity of ten long hulls is unresolved,
  and the <= 0 target may simply be wrong for a mask-only metric.
* `GI | Spy` at 53.6 is the worst cameo pair; one attempt made it worse.

Anyone picking this up should start from the harness notes above, not from the
units. The units are fine; the instruments are what made them findable.

## The nine aspect outliers — and the Nighthawk, which took three wrong causes

Extending the external RA2 aspect gate to the whole roster (see
`art-metrics.js`) named nine units and their directions. The last one left was
the Nighthawk, and it is worth reading end to end: it was called "pinned" twice
on evidence that did not support it, and the thing actually holding it was a
constant nobody had swept.

**CLOSED 2026-09-05: 73x45 / 1.622 / 0.53 of RA2 -> 86x33 / 2.606 / 0.86.**

### The three wrong causes, and what each one really proved

* **"It is the hull length."** `len` swept 34 / 42 / 50 does not move the
  aspect in the third decimal. TRUE, and it means only that `len` is not the
  bbox — in this block `len` sizes the CABIN and nothing else (`len * 0.30`
  long, `len * 0.24` for the roof). It says nothing about the airframe's
  length, which is a different constant.
* **"It is the rotor disc."** mrR 15 / 19 / 23 moves `selfIoU` 0.722 / 0.851 /
  0.943 but the aspect only 1.585 / 1.622 / 1.755, and 15 is WORSE than 19.
  Also true, and for a reason that is arithmetic rather than art: a ground
  circle under a 2:1 isometric camera projects to an ellipse of aspect exactly
  2, so a disc that owns the bbox pins the whole unit near 2 whatever its
  radius — and while it overhangs the airframe, shrinking it loses width as
  fast as height. (mrR 23 also trips `peerVsSelf.air` 0 -> 1, the regression an
  earlier pass hit widening 19 -> 21. That still stands: do not go up.)
* **"Then it is the mast."** Dropping `mry = hy - 9.6` to -6.6 / -3.6 / -1.6
  gives 1.825 / 2.028 / 2.086 and saturates at 0.68 of RA2, with the rotor
  sunk into the cabin. True again, and the saturation is the tell: the mast
  stops paying once the disc's top reaches the cabin roof, so the number it was
  really measuring was the CABIN's depth.

Three levers, three honest measurements, three wrong conclusions — because
"lever X does not move it" identifies what is not the cause and never what is.

### What actually held it

The **TAIL BOOM**, `bmB`, a constant the sweeps had never touched. At 16.5 it
ended *underneath* the rotor disc, so the airframe was a cabin with a stub and
the disc was the widest thing on the sprite — the block's own comment promised
"a long slim TAIL BOOM running most of the sprite's length" and the code did
not draw one. `bmB` 16.5 -> 20 / 24 / 28 moves the aspect 1.622 -> 1.778 /
1.933 / 2.022 on its own.

The rest is height, and it decomposes cleanly (measured by baking the parts
separately):

| part | rows of the 45 | fix |
|---|---|---|
| landing gear, splayed 5 px below a belly at `by - 5.4` | 8 | rails to `by - 4.4`, shortened; **2 rows** |
| the disc standing above the airframe | 15 | mrR 19 -> 16, mast `hy-9.6` -> `hy-8.0`; **9 rows** |
| cabin as deep as it was long | — | depth 6.4 -> 5.0, roof 8.0 -> 6.4 |

mrR 16 is derived, not tuned: a UH-60's rotor is 16.36 m across a 19.76 m
overall length (0.83), and the redrawn airframe runs 38 units nose to tail
rotor, so 0.83 x 38 / 2 = 15.8. The disc only starts paying once the boom owns
the width — alone it does not, which is exactly why the second wrong cause
measured what it did.

### The trap that made the first measurement of the fix a fiction

A 26-unit boom reaches 26 x 1.2649 x `USC_V` = 48 px from the ground anchor,
and the shared vehicle sheet is 104 px wide. Octants 3 and 7 — the two
broadside facings, i.e. the two the gate measures — came back with the fin
sliced flat against the canvas edge, and the aspect was being read off a
clipped sprite. The Nighthawk now gets its own 136 px sheet, the same fix (and
the same reasoning) the Apocalypse's barrels and the Kirov already have.

### The one budget clause this cannot honour

`unit-identity-reference.md` §2.3 asks for three things at once: aspect 3.05,
fuselage height <= 0.35 x length, and **rotor span >= 1.25 x fuselage length**.
With a rotor drawn as a filled blur disc the third is impossible, and provably
so: an iso disc of span S is S/2 tall, so span >= 1.25L forces height >= 0.625L
and aspect <= 1.6. RA2 gets all three because it draws the rotor as 1-2 px
BLADE LINES, not a disc. We draw the disc on purpose — at alpha .09 it was
~1400 px three luminance points off the grass, invisible to a player but
counted as body by every mask metric, and that is why `harrier | nighthawk`
was the union window's only failure. Extending the blades alone does not
recover the clause either: the sheet is baked at a fixed blade phase, so a
blade at 1.25L reaches 0.91 x its radius in SCREEN Y on the near-vertical
arms and puts the height straight back.

So the budget is met on two of three clauses (aspect 0.86 of RA2, fuselage
height 24/79 = 0.30) and knowingly missed on the third, at 0.84 x fuselage.

### Not fixed here — CLOSED as far as it goes, see "the air group's SIZE" below

**Absolute size.** The unit is 86 px broadside against the Harrier's 52, where
RA2 has [SHAD] at 64 and [ORCA] at 71 — i.e. ours is 1.65x the jet where RA2 is
0.90x, and the change made it worse (73 -> 86). Aspect is scale-invariant so
the gate cannot see it, and `VSC` is the documented tool for exactly this
("a vehicle's SIZE moves without a single proportion moving with it"). It was
left alone deliberately: a uniform 0.86 would put the boom tip's 2.9 px at
2.5 and the spike floor is 3.64 px at zoom 1, so it needs its own measured
pass rather than a number appended to this one.

*That pass was taken and is written up at the end of this file. The spike fear
above did NOT reproduce — the redrawn boom measures 8 px of thickness, not 2.9,
so scale was never what the floor was protecting. The thing that actually
binds is `peerVsSelf.air`.*

The other eight (Rhino 0.70, V3 0.70, Chrono Miner 0.76, Prism Tank 0.77,
Engineer 1.65, Chrono Legionnaire 1.62, Tanya 1.42, Flak Trooper 1.37) closed
in their own passes.

## THE RULE'S OWN PRECONDITION IS MISSING — the sprite rips are not in the repo

The lesson this pass earned three times over is **"a cameo is not a sprite —
check the rip"**. It cannot currently be followed.

`docs/ra2-ref/` contains the 74-plate CAMEO corpus and nothing else. Every
sprite rip the code cites by filename is ABSENT:
`allied-grand-cannon.png` (quoted as 181x133, "the in-game render"),
`soviet-terror-drone.png`, `allied-ore-refinery-idle.png`,
`soviet-barracks-idle.png`, `nighthawk.png`. Those comments record real
measurements someone once made against real images, and the images are gone —
so the numbers can be trusted only as far as the person who wrote them.

**And a naive re-fetch does NOT recover them.** I tried the obvious thing: the
C&C wiki file search, the same API that fetched the cameo corpus successfully.
It is unreliable for sprites because the filenames are inconsistent —
    "Nighthawk"    -> File:RA2 Allied Battle Lab.gif      (a different BUILDING)
    "Rhino Tank"   -> File:C&C-RA2-ggprisdm.gif           (same file as Prism Tank)
    "V3 Launcher"  -> File:RA2 V3 Launcher Icons.png      (60x48 — a cameo, not a sprite)
Only "Grand Cannon" returned something plausible, and at 117x85 it does not
match the 181x133 the code cites, so even that one is unconfirmed.

**The fetched files were DELETED rather than committed.** A wrong reference
sprite is worse than none: it does not fail loudly, it silently anchors every
future proportion decision to the wrong unit — which is exactly the failure
mode this whole section exists to warn about.

Recovering them needs per-unit verification (open the image, confirm it is the
unit and the theatre) rather than a search loop. Until then, `RA2_ASPECT` in
`art-metrics.js` is the trustworthy reference: its numbers come from
unit-identity-reference.md §1.1, which cites bboxes rather than files.

## GI | Spy, the standing worst cameo pair — investigated and LEFT

53.6 against RA2's floor of 58.5, and it is the last number on the board that
looks like it wants fixing. It does not.

* Both units MEET THEIR SPECS. `spike.belowDeclaredBudget` and
  `spike.belowFloor` are both 0, so the Spy's fedora brim already satisfies
  §2.1's ">= 7 px wide, >= 1.5x the head" and the G.I.'s rifle its own budget.
  There is no compliance failure to repair.
* They are VISUALLY DISTINCT. Looked at side by side at 2x: green plate against
  pink, helmet against fedora, and the Spy carries a tan briefcase the G.I. has
  no equivalent of. The confusion the number describes is not one a player
  meets.
* The one lever I tried made it WORSE. Brightening the rifle's barrel glint
  (#5c636e -> #a7aeb9) to make the G.I.'s weapon read took the pair 53.6 ->
  53.4, because the extra pale pixels push him TOWARD the pale-hatted Spy.
* And the bar is unusually high here. 58.5 is RA2's own CLOSEST pair out of
  2701 — the hardest single number in the whole corpus — while our median sits
  at 82 against their 100.5. Being 5 points under the tightest pair Westwood
  ever shipped is a different situation from being broadly worse.

It also arrived as a deliberate trade: it was 56.1 before the Rocketeer
whitening and the infantry stature work, both of which took the MAP to zero
confusable pairs. Recorded, not chased.

## The rule this whole pass earned

**A CAMEO IS NOT A SPRITE.** It cost three near-misses to learn and one to
un-learn:
  * the *Psychic Sensor* looked like an inverted proportion — RA2's in-game
    sensor is a squat drum, and its plate is a low-angle hero shot;
  * the *Grand Cannon*'s enormous plate barrel had ALREADY been built and undone
    once against the in-game render;
  * the *Spy* looked blue where RA2's plate is a dark suit — his coat IS the
    house zone, by reference;
  * and the *V3*, where the raised rail was RIGHT, because its sprite really
    does carry the missile high.
The plate cannot tell you which. Only the sprite rip can. Read plates for
composition, lighting and identifying feature; read rips for proportion.

## The air group's SIZE — closed to its ceiling, and the ceiling is a different gate

**86 x 52 -> 76 x 60.** `size.airOutsideRA2Band` 1 -> 0, air spread 1.835 ->
1.405, and `size.worstOffGroupScale` 0.3807 -> 0.2474, which takes the size
gate GREEN across the whole roster for the first time (the Nighthawk was the
last unit over the 0.25 band; the worst is now the Flak Track at -0.2474).
Everything else held: 33 of 36 metrics did not move at all.

| unit | RA2 | before | after | scale/group | aspect vs RA2 |
|---|---|---|---|---|---|
| nighthawk | `[SHAD]` 64 | 86 | **76** | +0.381 -> **+0.220** | 0.855 -> 0.860 |
| harrier | `[ORCA]` 71 | 52 | **60** | -0.248 -> **-0.132** | 0.977 -> 0.979 |
| hornet | `[HORNET]` 27 | 24 | 24 | -0.087 | 0.889 |
| kirov | `[ZEP]` 139 | 147 | 147 | +0.087 | 0.993 |

`VSC` is the whole change: `harrier: 1.150, nighthawk: 0.880`. No geometry
moved, so no proportion moved with it — which is the point of that lever.

### The trap the brief predicted, and what it actually was

**The shared `wing()` call is real but `VSC` routes around it.** The Harrier
and the Hornet do fall through the same `else`, so growing the wing geometry
grows both. `VSC` is keyed per KIND and applied as a canvas transform, so the
Hornet stayed at exactly 24 px through every sweep — verified after each one.
Its span/Harrier ratio goes 0.46 -> 0.40, i.e. TOWARD RA2's own 27/71 = 0.38,
so the growth improves the clause rather than straining it.

**The spike floor was not the obstacle.** The prediction was that a uniform
shrink would starve the identity spike, from a measurement of a 2.9 px boom
tip. The boom was redrawn since: it measures `thick` **8.0** px at zoom 1
against a 3.64 floor, i.e. 2.2x of room. At 0.88 it is 6.5 (1.8x); it survives
0.73 (5.9) and even 0.68. `spike.belowFloor` stayed 0 in every one of the ~40
configurations swept, and `spike.minThickAtZmin` never moved off 2.2. **A
uniform scale was never the thing that could not work.**

**Sheet clipping never fired**, because both moves were checked against a
purpose-built probe before any number was trusted, and then against the clip
gate that landed mid-pass. The Harrier's sheet grows with it automatically
(`VSC > 1` -> `104*VSC+8`), 104x103 -> 128x112, min slack 32 px. The Nighthawk
keeps its 136 px sheet and still needs it: its airframe is not centred on the
ground anchor, and octant 3 reaches 47 px right of it against a 104 px sheet's
52 — four pixels, which is not a margin.

### The ceiling: `peerVsSelf.air`, and it is bought with the size error

The RA2-correct sizes are Nighthawk ~62 px and Harrier ~69 px. They are
reachable on every gate except one:

    harrier VSC x nighthawk VSC, 16 cells:  size.airOutsideRA2Band = 0
    for every nhVSC <= 0.88, and peerVsSelf.air = 1 for every cell where the
    two get closer in size than about 76:60.

The discriminator is `crossIoU(harrier, nighthawk)` against the **Harrier's own
`selfIoUCross`, 0.401-0.408** — the lowest of the four aircraft, because a
broad swept delta changes shape more between bearings than anything else that
flies. That number is scale-INVARIANT (measured at VSC 1.00 / 1.10 / 1.20 /
1.33: 0.4062 / 0.4028 / 0.4049 / 0.4014 — pure rasterisation noise, +-0.007).
Meanwhile the cross term rises monotonically as the two converge in size:

| nighthawk px (harrier 68) | 86 | 82 | 78 | 73 | 70 | 63 | 52 |
|---|---|---|---|---|---|---|---|
| crossIoU vs harrier | .278 | .318 | .351 | .401 | .437 | .443 | .452 |

So the 0 we have today is **purchased by the very defect this pass closes**.
The shipped 76/60 sits at margin +0.024 against noise of +-0.007; 1.18/0.87
and 1.15/0.84 also pass the gate but at +0.0035 and +0.0057, inside the noise,
and were rejected for that reason rather than taken for the better spread.

**The arithmetic floor on the spread.** With the Hornet (0.889) and the Kirov
(1.058) held as anchors, no configuration can beat **1.190** — that is their
own ratio. 1.405 is what `peerVsSelf.air` leaves on the table; the remaining
0.215 is not art, it is that gate.

### Levers swept, with what each one measured — including the ones that failed

* **`VSC` uniform, both units.** Reaches the target sizes exactly (Nighthawk 63,
  Harrier 68 at 1.33/0.73), aspect and spike and clip all still 0. Breaks
  `peerVsSelf.air`. This is the honest answer to "why not just scale them".
* **`mrR`, the rotor disc, 16/14/12/10/8.** A SEE-SAW, and the clearest negative
  result of the pass. Shrinking the disc drops crossIoU (.443 -> .299) and
  rescues the Harrier — but it collapses the Nighthawk's OWN `selfIoUCross`
  (.476 -> .233), because without the disc the airframe becomes strongly
  directional, and then the Harrier beats *it*. Margins at mrR 16 / 14 / 12:
  harrier -.042 / -.006 / +.039 while nighthawk +.033 / -.006 / -.036. They
  cross at 14 with BOTH at zero. There is no window anywhere on this axis.
* **`bmB`, the tail boom, 26/30/34/38 at VSC 0.73.** Same see-saw from the
  other direction, and it costs more to learn: a longer boom is exactly what
  §2.3 asks for (aspect vsRA2 0.83 -> 0.97 -> 1.04, i.e. it reaches RA2's own
  3.05 at bmB 38) and the Nighthawk's selfIoUCross falls .476 -> .326 -> .268
  as it does. **The aspect gate and `peerVsSelf` pull in opposite directions
  for this unit** — which is the residual aspect bias `art-metrics.js` already
  records as unresolved ("corr(aspect, peersBeatingSelf) +0.487"), met here as
  a hard blocker rather than a footnote.
* **Raising the Harrier's `selfIoUCross`.** Not attempted, and deliberately.
  Its 28-pair matrix is FLAT (0.33-0.56, no bad pair to repair); the one
  structural asymmetry — octant 1 at 68x45 against octant 5's 68x34 — is the
  vertical fin, which projects screen-upward at every bearing because that is
  what a vertical surface does under this camera. Making the jet read the same
  from every angle is the opposite of identity.
* **Hollowing the rotor blur so its core falls under the mask's alpha
  threshold.** Costed, not run. The gradient's hub stop is 5% against a 3.1%
  threshold, so reaching a real hole needs the whole inner ramp flattened —
  about 25% of the disc's area for maybe 0.03-0.05 of crossIoU. That is
  blinding the gate rather than moving the art, and the disc's alpha is a
  deliberate prior decision. Recorded so nobody re-costs it.

### Both surfaces, looked at

**The cameo is size-INVARIANT by construction and this is worth knowing.**
`cameoFor` fits the sprite's bbox with `min((W-3)/pw, (H-4)/ph) * 1.35`, so the
drawn width is `(W-3)*1.35` whatever the source measures — the Harrier's plate
is pixel-for-pixel the same composition at 52 px and at 60 px, only sharper.
So "a cameo is not a sprite" cuts the other way here: a pure SIZE change cannot
show up on the cameo at all, and checking it is a check that nothing else
broke, not a check of the fix.

In play, both read better. The Harrier's delta, white nose and cyan wingtips
carry more pixels; the Nighthawk is no longer the longest thing in the sky
after the Kirov. `harrier | nighthawk` improved in ALL SIX legibility windows
— 60.3 -> 64.8, 49.9 -> 57.2, 25.0 -> 25.6, 17.8 -> 18.9, 58.5 -> 66.5,
55.3 -> 64.7 — which is the opposite of what "make them the same size" sounds
like it should do, and is worth taking as the warning it is: the mask metric
and the picture metric disagreed about this change, and the picture won.

Live frames at zoom 1 and ZMIN with four of each airframe: no page errors, and
the three Directorate aircraft still separate instantly at furthest zoom (the
rotor disc is the tell).
---

# The eight nobody had ever looked at — six naval, two Collective infantry

Amphibious Transport, Aircraft Carrier, Dolphin, Dreadnought, Landing Craft,
Sea Scorpion, Conscript, Crazy Ivan. Both surfaces each, against their own §2
rows, with the clause measured wherever it could be measured rather than
judged. **Two real defects, six units correct, three findings recorded and not
acted on.** New instrument: `tools/unit-probe.js` — see its header; the ASCII
map is what found the first defect, and no contact sheet would have.

## FIXED — the Dolphin's eye was baking as a detached blob in the water

`[DLPH]`, §2.3: *"Organic — a curved body with a dorsal fin, no straight
lines"*, budget *"no orthogonal edges anywhere; fin >= 3 px above the back."*

The fin is fine (6 rows clear of the back against a 3 px budget). The eye was
not. It was drawn as

    var nq = P(L * 0.98, 0, FR + 1.2);            // her BEAK, in plan space
    g.ellipse(nq[0] - 4.0, nq[1] - 1.8, ...)      // ...then shoved 4 SCREEN px left

so the offset points the same way on the monitor whichever way the animal is
pointing. At every bearing where her snout runs leftward it walks straight off
her. Measured on the baked sheet, octant by octant:

| octant | before | after |
|---|---|---|
| 3 (broadside, the gated one) | **44**x15, eye a detached 2x3 blob 4 px clear | **38**x15 |
| 4 | 34x19, blob detached | 28x19 |
| 5 | 13x23, blob detached | 12x22 |
| 0 / 1 / 2 / 6 / 7 | attached | unchanged |

So at the octant the aspect and IoU gates actually read, **16% of the Dolphin's
measured width was a bug** — a floating black rectangle, which is also the one
orthogonal edge on the animal her §2.3 row forbids.

**The block's own header is a paragraph about exactly this class of bug** — the
body and fin were moved out of screen space *because* they never turned — and
the eye was missed in that pass. It is now `P(L * 0.70, nearS * W * 0.30,
FR + 2.4)`: just abaft the melon, inside the 0.475 half-beam the DOL profile
has there, on whichever flank the camera can see.

Effect on the gates: `iou.naval.mean` 0.4022 -> **0.4018**, nothing else moved;
`peerVsSelf.naval` still 5, `aspect.navalOutsideRA2Band` and
`size.navalOutsideRA2Band` still 0. Honest note: the Typhoon's own
`peersBeatingSelf` went 1 -> 2 on a 0.0012 IoU move, because a Dolphin without a
6-px spur is a slightly cleaner lozenge. The headline count is unchanged and
0.0012 is noise, but it is recorded rather than hidden.

## FIXED — the Amphibious Transport's cargo well was painted near-black

`[SAPC]`, §2.4: *"An open-topped hovercraft — a fat inflatable skirt round a
**RED (HOUSE) INNER DECK** with visible seat blocks"*, budget *"skirt a
continuous rounded band round the whole hull; **deck cavity visible as a
house-hued interior**."*

The skirt is right — a real `stadium()` band round the whole plan. The interior
was one flat plate of `#1d201a`: **value 0.11, the darkest thing on the craft.**
The named identity feature was painted black, and every blue pixel a player
could see was on the two rubbing strakes and the bridge roof — so at 13.0%
owner colour she read as an olive hull with trim stripes, which is the Landing
Craft's read, not a troop hovercraft's.

**This is the Tesla Trooper's carapace again, one day later.** The comment sat
directly above the line and named the part correctly — `// the open cargo well,
to starboard of the bridge` — and the fill under it was black. A §2 clause with
no measurement behind it went unmet, and the code knew what the part was.

The dark box stays as the COAMING (a cavity needs a rim or the colour is just
another stripe) with an owner-coloured floor inside it and two thwarts across
that floor, which is the "visible seat blocks" half of the same sentence. All of
it sits inside the hull outline at z ~ +1, so **not one silhouette pixel moves**
and no mask metric can see it: ownerPct 0.1303 -> **0.1567**, against a 0.27
ceiling; `hue.maxImpostor` unchanged at 0.0051. On the cameo the change is the
whole difference between "olive thing with an arrow on it" and "an open well
with seats in it".

## Looked at, and deliberately LEFT ALONE — six of eight

* **Crazy Ivan** `[IVAN]`. All three clauses measured MET, and it is worth
  recording the numbers because two of the three read like they would fail.
  *House fraction >= 35%*: **37.45%** (RA2's own is 47.9%, but 35 is what the
  row asks). *Ushanka flaps break the head outline >= 2 px each side*: crown
  ellipse `rx 2.8`, flaps reach 4.9 — **2.1 px clear each side**, and the code
  carries `// flap: >=2 px clear of the crown (§2.2)` on the line that does it.
  *Bundle >= 4x3 at waist height*: three sticks spanning 3.98 with a 4.4
  lashing band, 4.9 tall — measured on the sheet as a **4x5 tan block at rows
  13-17**. The block also records why the bundle is neutral tan (red is a house
  colour here) and why it sits at belt height (at hand height it collided with
  Tanya's pistols and cost a peer-vs-self). Nothing to do.
* **Conscript** `[E2]`. *Legs >= 20 hue-degrees off the GI's olive*: measured
  off both sheets, the Conscript's trousers run **h30-33** (`#654621`,
  `#342310`, `#7e552c`) and the G.I.'s **h84-92** (`#232d14`, `#2f421e`,
  `#475f2e`) — a **56-degree** gap against a 20-degree budget. *Cap flat, not
  domed*: his cap is **7 px wide over 5 rows**; the G.I.'s pot helmet beside it
  is **5 px wide over 7 rows**. The two are inverted, which is exactly the
  separation the row asks for. Correct.
* **Aircraft Carrier** `[CARRIER]`. *Deck a single unbroken flat plane >= 80%
  of length*: one `fpoly` plane at `FR + 2.6` running the full plan at 1.02 of
  its length, ~88% of the sprite's width at broadside, with the dashed
  centreline and the angled landing strip clipped inside it. *3 visible parked
  airframes*: three, countable, on both surfaces — the cameo shows all three.
  Correct, and the block's comment already records the 1.78 -> 1.42 deck-width
  correction that got it there.
* **Dreadnought** `[DRED]`. *Two launch boxes >= 10x10 px, countable, standing
  proud of the deck*: measured at broadside, **two boxes 32 px x 14 px with 2 px
  of daylight between them** over rows 6-13, each with a house-coloured launch
  head and three exhaust tubes. Comfortably over budget and plainly countable on
  both surfaces. The boxes being wider than tall is a **recorded decision** —
  the block explains that 25-unit towers rendered 109x67 (aspect 1.63 against
  RA2's 2.96) and "read as a container ship, not a battleship". Not overridden.
* **Landing Craft** `[LCRF]`. *Ramp plane distinct from the deck*: the ramp
  bakes at value **0.6-0.7** against a deck at **0.1-0.3** — the strongest value
  step on the hull. *Visible cargo when loaded*: drawn. Both clauses MET on the
  sprite. Its cameo is a separate finding, below.
* **Sea Scorpion** `[HYD]`. *Shortest armed hull afloat*: 52 px broadside
  against the Typhoon's 66 and the Destroyer's 89 — the shortest armed hull, by
  a class. Its gun is the finding below. Its aspect is **0.806 of RA2, the worst
  in the fleet and the number `aspect.navalWorstOffRA2` (0.194 against a 0.2
  ceiling) is reporting** — so nothing on this hull's proportions should be
  touched without moving that gate first.

## Why the G.I. is in five of the sidebar's eight worst pairs (2026-09-05)

The Directorate sidebar's worst pairs are not a scatter — they are a HUB:

    53.6  GI | Spy                    61.4  Battle Lab | GI
    58.8  GI | Rocketeer              62.2  GI | Chrono Legionnaire
    59.7  GI | Engineer

Looked at side by side, the five plates are one picture: an owner-blue torso
filling the centre of the frame, head-and-shoulders, same framing, same value
range, with identity carried by a small low-contrast prop — a rifle, a
briefcase, a cap, a chrono gun. The props are what a *reader* is asked to
compare; the *metric*, and the eye at sidebar size, sees the blue.

Measured — owner-hue blue as a fraction of the plate's centre band:

| unit | centre blue | in a worst pair? |
|---|---|---|
| Chrono Legionnaire | 54.8% | yes |
| Spy | 50.8% | yes |
| **G.I.** | **47.6%** | **yes, five times** |
| Rocketeer | 38.3% | yes |
| Engineer | 37.6% | yes |
| Crazy Ivan | 30.7% | no |
| Yuri | 21.2% | no |
| Flak Trooper | 19.6% | no |
| Tanya | 15.0% | no |

The cut is clean at about 35%, and their blue FOOTPRINTS overlap too — Jaccard
0.36 on a 4 px grid for `spy|engineer`, `rifle|engineer`, `spy|cleg`,
`rifle|spy`. Same colour, same place, same size.

**This is one defect with many names, not five pairs to tune.** And the two
fixes made today are both instances of the cure rather than one-offs: the Tesla
Trooper's silver carapace and the Engineer's coming light body each break the
shared blue centre mass with a large-area feature of their own. Tanya at 15% is
the existence proof — she is the least owner-coloured uniformed figure on the
board and she is in none of the worst pairs.

So the principle for the next passes, and it is the same one §2 states unit by
unit: **identity has to live in the LARGE areas.** A plate whose centre half is
the same blue as its neighbour's cannot be rescued by a better briefcase.

## Recorded disagreement, NOT changed

**The Sea Scorpion's gun does not match the Flak Track's, and both are
deliberate.** §2.4 asks `[HYD]` for *"the same gun read as the Flak Track"* and
*"gun matches the Flak Track's silhouette"*. Measured off the two baked sheets
at the same bearing:

| | barrels | elevation off horizontal |
|---|---|---|
| Flak Track | **one**, fat (3.6 px stroke) | **~77°**, near-vertical |
| Sea Scorpion | **two**, thin (2.4 px) | **~48°** |

Neither is careless. The Sea Scorpion's block cites `[HYD]`'s own sprite —
*"the two tubes standing at roughly 45 degrees off the tub"* — and the Flak
Track's near-vertical jib is the entry already in this log's "left alone"
section, where the shallower angle *"left its crown the same fat box the IFV
wears — the two lightest vehicles in the game, and the pair the gate scored at
0.709."* Two cited decisions that satisfy everything except each other, and the
clause that asks them to match has no measurement behind it. Changing either
one undoes a measured result to satisfy a sentence. Written down instead.

**The Landing Craft's ONE identity feature is not in its cameo.** §2.3 gives it
*"an open bow ramp"* and nothing else; the sprite delivers it. The plate does
not. At the shared cameo bearing (`ICON_FACE_SIDE = 0`) the bow points to the
**bottom-right**, which is the one corner the caption bar owns. Measured: bbox
68x43, so `k = min(57/68, 44/43) x 1.35 = 1.13`, drawn 77 px wide on a 60 px
plate — **27% of the ramp is cropped off the right edge and ~29% of what is
left is under "LANDING CRAFT"**. What a player sees is a pile of olive boxes on
a dark hull with a blue band, which is why she is in **three of the Directorate
sidebar's worst pairs** (Chrono Miner 41.8 greyed, Aegis Cruiser 43.5 greyed /
63.0 lit) — the Chrono Miner is also a low hull with a boxy load and the Aegis
is also a long dark hull with a blue band.

The obvious lever is a per-unit cameo bearing in `iconFaceOf`, and it is one
line. **It was not taken, because per-class camera is a shipped design
decision** — this log's own scoreboard counts "the CAMERA varies by class
(infantry front-on portraits, everything else three-quarter)" as one of the four
RA2 differences that were closed. One ship facing the other way in a grid of
forty breaks it. If it is ever revisited, revisit it for the whole ship class at
once, and measure the sidebar before and after.

## MEASURED — "fitted items are barely rescaled" is false for six units

`cameoFor` turns interpolation OFF only on the infantry portrait path
(`g.imageSmoothingEnabled = !fill`), justified by *"Fitted items are barely
rescaled, so they keep the smoothing."* The Dolphin's cameo is visibly MUSH
beside the Sea Scorpion's and the Dreadnought's — a soft grey smear where every
other plate is crisp pixel art. It is the same defect this log's "Fixed" table
records for infantry (*"a grey smear for a helmet"*), and the nearest-neighbour
cure was scoped to `fill` only.

So the premise was measured. `k = min((57)/w, (44)/h) x 1.35`, capped at 3.0,
over every non-infantry unit's own oct-0 bbox:

| unit | bbox | k |
|---|---|---|
| Hornet | 20x14 | **3.00** |
| **Dolphin** | 30x20 | **2.56** |
| Terror Drone | 32x21 | **2.40** |
| Grizzly | 43x27 | **1.79** |
| Harrier | 44x29 | **1.75** |
| **Sea Scorpion** | 46x33 | **1.67** |
| Typhoon | 52x27 | 1.48 |
| *(the other 20)* | | 0.63 - 1.43 |

**Six of twenty-seven are smoothed upscales, three of them past 2.4x.** The fix
is one clause — `!fill && k < 1.5` — but it is a SHARED path, and two of the six
are air units another agent holds right now. It belongs in one deliberate pass
over all six with `cameo-legibility.js` measured either side, not smuggled in
under a naval review. Recorded with the table so nobody has to re-derive it.

## The thing that nearly became a seventh finding

Every ship's baked sprite includes its **bow wave**, and it is large: 8-13 rows
of near-white foam below the hull, which is 20-25% of the Carrier's measured
height. The first read is "every naval aspect number is measured off a mask
that is a quarter wake". It is not a defect. It is deliberate and documented
(*"A bow wave on every surface hull ... so a ship reads as sitting IN
something"*), it applies uniformly to all nine hulls, the whole fleet's
proportions were tuned with it in, and the block already records the one time it
DID cause a bug — the Landing Craft's wave becoming her widest protrusion and
being scored as her identity feature. Read the fleet's numbers knowing the wake
is in them; do not take it out to make an aspect look better.
