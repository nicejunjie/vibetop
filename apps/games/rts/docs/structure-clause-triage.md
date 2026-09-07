# The remaining `clause.unmetStructures` — triage before art

> **11 -> 15 on 2026-09-06.** Four depot rows moved into the BROKEN-CHECK
> column when the Service Depot's pad was restored to a true isometric apron.
> The arithmetic, including RA2's own sprite failing the same rows at all
> eleven sweep cuts, is the first section below.

**Method.** Every row below was produced by running the *shipped* clause math —
the primitives re-exported verbatim out of `tools/clause-checks/structures.js`,
not a re-implementation — against BOTH our own bake and RA2's committed
reference sprite for the same building, chroma-keyed through the same canvas
path `art-metrics.js` uses. The harness reproduces all fourteen shipped numbers
byte-for-byte before it is allowed to say anything about a reference.

The chroma key validates on its own: the blue-keyed rips crop to exactly the
bbox `ra2-ref/sprites/README.md` records and are threshold-insensitive
(`tesla-coil.gif` → 42x81 at every tolerance from 20 to 60, `prism-tower.png` →
57x104, `allied-construction-yard.gif` → 213x137, `soviet-construction-yard.gif`
→ 204x153). The three grass-backed rips carry a soft drop shadow no single
threshold resolves, so every claim made from those is stated only where it holds
across a **sweep**, never at one cut.

**A clause its own reference fails is a BROKEN CHECK, not an art defect.** That
is the whole point of running both sides.

## Verdict

| | rows | |
|---|---|---|
| **BROKEN CHECK** — RA2's own sprite fails it, or the predicate is an identity | **7** | 1, 3, 6, 7, 10, 11, 13 |
| **REAL ART DEFECT** — the reference passes, our bake does not | **3** | 5, 12, 14 — **all three fixed** |
| **CEILING** — measurable, unreachable without redrawing the building | **4** | 2, 4, 8, 9 |

Rows 2 and 4 (the Refinery's stacks) were opened as art defects and **downgraded
to ceilings after measurement** — see "The Refinery" below, including the finding
that the obvious un-fusing fix makes the gate WORSE, not better.

`clause.unmetStructures` **14 -> 11**, and no other metric in the gate moves.
Cameo floors stay at Directorate 234 / Collective 252.

## The table

| # | key | clause | ours | RA2 reference, same math | verdict |
|---|---|---|---|---|---|
| 1 | `base:dir` | exactly ONE crane/boom group above the hall roofline | 0 groups, `crown:false` | **[GACNST] 0 groups, `crown:false` — identical**; [NACNST] **3 groups** | **BROKEN** |
| 2 | `refinery:dir` | 2 stacks, clear gap >= 0.08 Sw | 2 stacks, gap 0.018 | [GAREFN] passes at 2 of 15 sweep cuts — inconclusive | **CEILING** |
| 3 | `refinery:dir` | each stack 0.12-0.15 Sw | 0.425 / 0.123 | [GAREFN] **fails at 15 of 15 cuts** (0.276/0.220/0.178/0.155/0.144/0.121/0.069/0.063 — never all in band) | **BROKEN** |
| 4 | `refinery:col` | 2 stacks | 1 blob @ 0.491 Sw | (no `col` rip; the `dir` rip fuses the same way) | **CEILING** |
| 5 | `depot:dir` | exactly ONE crane/gantry group | 4 blobs | rip too shadow-noisy to segment (311/149/51 blobs across the sweep) | **ART — FIXED** |
| 6 | `radar:col` | dish >= 0.55 Sw, aspect 0.90-1.10 | Sw **1.000**, aspect 0.78 | [NARADR] Sw **1.000**, aspect **0.831 — fails**; prism 1.000/0.570; tesla 1.000/0.538 | **BROKEN** |
| 7 | `radar:col` | dish wholly inside the top 45% Sh | 0.888 | [NARADR] **0.904 — fails**; prism 0.952; tesla 0.951 | **BROKEN** |
| 8 | `reactor:col` | tallest tower's crown inside top 0.10 Sh | 0.247 | — | **CEILING** (known) |
| 9 | `sentrygun:col` | exactly 2 barrels, gap >= 2px, topmost mass | 1 blob | — | **CEILING** (known) |
| 10 | `sentrygun:col` | zero enclosing drum or roof | 1 blob @ **1.000 Sw** | **100 of 100** structure bakes and **4 of 4** rips read exactly 1 @ 1.000 Sw | **BROKEN** |
| 11 | `tesla:col` | a neck pinching to <= 0.10 Sw | 0.627 | [NATSLA] **0.333 — fails by 3.3x** | **BROKEN** |
| 12 | `prism:dir` | a waist beneath it <= 0.25 Sw | 0.261 | [GAPRIS] **0.211 — passes** | **ART — FIXED** |
| 13 | `gapgen:dir` | 4 talons, each 2px at >= 25% contrast | **0** bright-outlier blobs | (no rip) — 3 **dark**-outlier blobs on the same mask; RA2's talons are black | **BROKEN** (polarity) |
| 14 | `gapgen:dir` | exactly 2 house collar rings | 3 blobs | (no rip) — third blob is **one pixel** | **ART — FIXED** |

## 2026-09-06 — the depot's PAD rows join the broken list (11 -> 15)

Four rows were added to `clause.unmetStructures` by the pass that gave the
Service Depot its repair yard back, and all four are the SAME broken check:

| key | clause | ours after | ours before | RA2 `[NADEPT]`, shipped math |
|---|---|---|---|---|
| `depot:dir` | flat pad >= 0.50 Sw | **0.006** | 0.536 | **0.098** |
| `depot:dir` | works confined <= 0.50 Sw | **0.994** | 0.464 | **0.902** |
| `depot:col` | flat pad >= 0.50 Sw | **0.045** | 0.530 | **0.098** |
| `depot:col` | works confined <= 0.50 Sw | **0.955** | 0.470 | **0.902** |

### Why the check cannot be satisfied by any drawing of a pad

The predicate is, verbatim:

    for (let x = 0; x < f.w; x++) if (cp[x] > 0 && cp[x] <= 0.15 * f.h) padCols++;

A "pad column" is one **at most 15% of the sprite's height tall**. But a flat
plate in 2:1 isometric projection is *by construction* half as tall on screen as
it is wide: a pad `W` px across has a centre column `W/2` px deep. RA2 gives the
depot a pad 0.71 of the sprite's own width, and the sprite is about 1.1 Sw tall,
so those centre columns run to ~0.32 `Sh` — **more than twice the 0.15 the clause
allows**, before a single mark is painted on the deck.

So the clause does not describe a flat pad. It describes a pad drawn as a
HAIRLINE, and that is exactly what the codebase did to satisfy it: `dpb` (the
Directorate pad ellipse's semi-minor axis) was driven `fh*0.70 -> 0.19 -> 0.01`,
a 157 px apron **one pixel deep**, and when that was still not enough three
anamorphic X-only scales (0.45 on the works cluster, 0.55 on the guide rail,
0.10 on the beam reach) were stacked on top. The user's report was "it looks
terrible, and it doesn't look like RA2" — correct on both counts.

### The reference, swept

RA2's own `soviet-service-depot.gif` keyed off its grass at eleven cuts of the
green-dominance margin (16..56 in steps of 4), the largest component taken as
the building, and the shipped predicate run over it:

    cut   bbox      padFrac   works    0.15*Sh   tallest column
     16   104x124    0.385    0.615     18.6      102
     20   104x124    0.385    0.615     18.6      102
     24   162x152    0.173    0.827     22.8      106
     28   162x152    0.086    0.914     22.8      109
     32   164x152    0.098    0.902     22.8      109
     36   164x152    0.098    0.902     22.8      109
     40   165x152    0.103    0.897     22.8      110
     44   165x152    0.103    0.897     22.8      110
     48   165x152    0.091    0.909     22.8      112
     52   165x152    0.091    0.909     22.8      112
     56   165x152    0.091    0.909     22.8      114

**RA2 passes the pad row at 0 of 11 cuts** — 0.086 to 0.385 against a demanded
0.50 — and fails "works confined <= 0.50 Sw" at 0.615-0.914 at every cut. Our
0.006/0.994 and 0.045/0.955 are now in the same regime as the reference's
0.098/0.902; the old 0.536/0.464 was the number a hairline produces, not the
number a repair yard produces.

**BROKEN CHECK, 4 rows.** What the row is trying to say — that most of the
footprint is open apron with nothing standing on it — is *true* of the art now
and was false before. Rewriting the predicate is the fix (it wants a
GROUND-PLANE test: columns whose opaque mass is confined to the ground band,
not columns that are thin). Distorting the sprite to satisfy it is forbidden by
`docs/qa-charter.md`'s two-pillar rule, and has now been tried twice.

### What was NOT broken, and is now MET

`[dir] exactly ONE crane/gantry group` read **3** blobs on the rebuilt sprite —
1988 px of works plus two of 4 px each, one row tall, at x 73-76 and x 126-129.
Ablation named them the two **running lamps** on the octagon's rear chamfer
corners (moving the clamps changed nothing), whose caps stood exactly one row
above the pad's own topmost row; on a pad-dominated sprite `bodyRun`'s roofline
lands on the deck, so each cap was its own component above it. Lamp centres
`dpy-3.4 -> dpy-1.6` and the crown reads 1.

That row is REAL, not broken: run the shipped math over RA2's own sprite and the
reference **passes it at exactly 1**. The two verdicts sit side by side in the
same clause block, which is the whole argument for running both sides.

## The seven broken checks, with the arithmetic

### 1 — `base:dir`, and it is not the "ART finding" the note claims

`bodyRun` vetoes a crown when the row profile never dips between row 0 and the
proposed 55% roofline. RA2's own Allied Construction Yard is monotone over
exactly that span:

    [GACNST] rows 0..24   3 7 8 12 17 22 27 28 34 46 54 61 65 70 86 96 103 106 112 114 114 115 115 116 125
    ours dir rows 0..36   10 19 27 36 46 55 61 64 71 77 83 87 90 91 94 96 99 99 102 105 107 109 110 111 112 112 114 114 116 118 121 123 126 128 130 133 135

Neither profile dips once, so both report `crown:false`, `lo:0`, and **0 crane
groups**. The Soviet Yard does have a waist and reports **3** groups, not the
one the clause demands. **Both of RA2's committed Construction Yards fail this
clause**, one at 0 and one at 3. The note added in 6c941a3 — "the dir bake reads
ZERO groups and that is an ART finding" — is falsified: RA2 draws its Allied
Yard's crane below the hall's own apex too.

### 3 — `refinery:dir` stack widths

Swept `[GAREFN]`'s flood key from tolerance 14 to 56 in steps of 3. The crown
blob widths it yields, over the whole sweep, are 0.276, 0.220, 0.178, 0.155,
0.144, 0.121, 0.069, 0.063 `Sw`. At **no** cut are all its crown blobs inside
the 0.12-0.15 the clause demands. Our own second stack, at 0.123, *is* in band;
what fails the row is the fused 0.425 vault mass, which is row 2's problem.

### 6, 7 — `radar:col`, an identity twice over

The dish is `components(f, (p,x,y) => !!p && y <= body.hi)`, and `body.hi` is
the LAST row at or above 55% of the widest. For any building whose base is its
widest mass — every one ever drawn — that predicate admits crown, neck and base
as one connected blob. So `dish.w === f.w` and `dish.y1 === body.hi` are
*identities*:

    ours radar   Sw 1.000   aspect 0.780   bottom 0.888
    [NARADR]     Sw 1.000   aspect 0.831   bottom 0.904   <- the reference, failing both
    prism rip    Sw 1.000   aspect 0.570   bottom 0.952
    tesla rip    Sw 1.000   aspect 0.538   bottom 0.951

Four sprites, four different buildings, `Sw` exactly 1.000 on every one. And
RA2's own Radar Tower fails BOTH rows: aspect 0.831 against a 0.90-1.10 band,
bottom 0.904 against `<= 0.45`. Our sprite's real 0.198 `Sw` pinch at rows
101-107 is walked straight past.

### 10 — `sentrygun:col` "zero enclosing drum", a 100/100 identity

`components(f, y >= body.lo).filter(w >= 0.5 * Sw)` returns the below-roofline
mass of any connected sprite. Because the bbox is cut TO the sprite, its widest
row is 1.000 `Sw` by construction and lies below the roofline by definition.
Run over the whole corpus: **100 of 100 structure bakes** report exactly one
such blob at exactly **1.000 Sw** — `sentry`, `radar`, `prism`, `patriot`,
`flakcannon`, `tesla`, `gapgen`, every one — and so do all four RA2 rips. The
clause cannot read 0 for any drawing of anything. No art change can close it.

### 11 — `tesla:col` neck

`top` is the largest blob in the whole TOP HALF, so the scan starts at
`top.y1 + 1`, below the neck rather than at it. On the reference's own mask
(42x81, the bbox §2.7 records) the "sphere" comes out `x12..41 y0..40` = 0.714
`Sw` where the row says the sphere is 0.476, and the neck scan — starting at row
41 — reports **0.333 `Sw` against a clause demanding <= 0.10**. The reference
fails by 3.3x. Our 0.627 is therefore not evidence about our art either.

### 13 — `gapgen:dir` talons, a polarity bug

`(p.v - med) >= CONTRAST` filters for **bright** outliers. RA2's Gap Generator
talons, and ours, are **black**. On the same mask, same threshold, same crown
region: **0 bright** blobs, **3 dark** ones. The sibling `patriot` row correctly
filters for dark outliers. No legal drawing of a black talon passes a
bright-outlier filter, and painting them light to satisfy it would break both
the reference and the colour rule.

## The two ceilings

- **8, `reactor:col`** — 0.247 against `<= 0.10`, improved from 0.380 in
  94a8890 and deliberately left: the flood-fill segmentation of that silhouette
  is not stable enough to tune against (0.380/0.346/0.066/0.331 at thresholds
  34/45/55/65). Not re-derived here.
- **9, `sentrygun:col`** — the barrel clause resolves 1 component at *every*
  roofline from `lo=1` to `58`, because the barrels are diagonally staggered and
  a horizontal-cut primitive cannot separate them.

## The three real art defects — all fixed

| # | key | what was wrong | fix | before -> after |
|---|---|---|---|---|
| 14 | `gapgen:dir` | **one pixel**, `(32,14)`. A dark 24-alpha fringe already sat in the hue band at v 0.082 (under the 0.20 floor, harmless); the navy pod's specular cap **overhung its own rim** and its ~50-alpha fringe composited over it to `rgba(60,76,100,64)` — v 0.392, s 0.40, hueGap 19, house. Neither ingredient is in the band; the composite is. | tuck the cap onto the rim, `npy - 5.0` -> `npy - 4.6`. Geometry, not colour, so the specular is untouched | 3 blobs -> 2 |
| 12 | `prism:dir` | INK, not spread. `rowProfile` counts pixels per row: the four struts' 2.2px dark backing haloes lay 8.8px of ink across a 10px column. Ablating the struts flattens rows 55-76 to a constant 10px — the real waist | backing halo 2.2 -> 1.8, lit stroke untouched. RA2 laces its own column with 1px lines | 0.261 -> 0.232 |
| 5 | `depot:dir` | three 14x3 slivers clearing a roofline at 77 by exactly **3 rows** — named by ablation as the left and right house clamps and the three-drum fuel stack, not cranes. The roofline lands on the pad deck because this sprite has no hall | clamp ring +4px nearer, drums `fh*0.10` -> `0.18`. The block's own note says the clamps "reach IN FROM THE RIM"; at the old y they straddled the amber kerb and chopped the running lamps | 4 blobs -> 1 |

## The Refinery — opened as art, closed as a ceiling, and the fix that makes it WORSE

`refinery:dir` reads 2 crown blobs already; its only failure is the **gap**,
0.018 against 0.08 `Sw`. Mapped column by column, the near-touch is at **row 76**
between the vault arc's tapering tail (x145, rows 75-76) and the second stack's
base (x150). Closing it to the 18.24px the clause wants needs the arc's right rim
pulled back 14px — 40% of its own radius — or the second stack moved 14px off the
skirt it stands on. RA2's own refinery stands its second stack hard against its
vault in exactly the same way.

`refinery:col` reads ONE blob, and the cause **was** found: `grille1`, the first
of the two fanned grilles, is drawn AFTER both furnaces and bridges them across
the only seam column (x134) in the crown band. Ablating it alone splits the crown
cleanly into two. This is the textbook "a later shape bridges two earlier ones".

**And un-bridging it is a regression, which is why it was not done.** The clause
block emits ONE row when `crown.length < 2` and **THREE** when it is >= 2.
Measured on a build with `grille1` shifted 6px clear:

    crown = 1 (today)   "2 stacks"  FAIL                      -> 1 row,  1 unmet
    crown = 2 (fixed)   gap       0.004 vs >= 0.08   FAIL
                        widths    0.320/0.167 vs 0.12-0.15  FAIL
                        clearance 0.474 vs >= 0.30    PASS    -> 3 rows, 2 unmet

So separating the two furnaces takes `clause.unmetStructures` **11 -> 12** and
`checkedStructures` 75 -> 77. The seam it exposes is 1 column wide, nowhere near
the 18px the gap row wants, and the back furnace's cone would have to drop below
the roofline entirely for the width row to come into range. Both Refinery rows
are therefore recorded as ceilings: not reachable without redrawing the
building, and reachable-looking only until the arithmetic is done.

---

## 2026-09-06 — the depot's four pad rows and the refinery's stack row are REWRITTEN (15 -> 10)

The four depot rows added above, plus row 3, are closed **in the checker**. No
art changed; `rts.html` was not touched. `checkedStructures` held at **75** and
`unmatchedToReference` at **0** — every rewritten row still names a real §2
clause (refMatch 0.42-0.93).

### Method

Both halves, for every row, because either alone proves nothing:

**(a) the reference must PASS.** The shipped module is `require`d and run with a
`ctx` whose `byBldFac` hands back RA2's own sprite in place of our bake, across
the full chroma sweep. **(b) the row must still BITE.** The same module is run
against bakes produced from a deliberately broken `ART_HTML` build — for the
depot pad, `6ab22eb`, which *is* the four-squash build the user rejected.

### The three rewrites

| | old predicate | new predicate |
|---|---|---|
| pad | `cp[x] > 0 && cp[x] <= 0.15 * f.h`, counted over `Sw` | `groundPlate()` — the largest hardstanding component (`s < 0.28`, `v >= 0.37`) — asked for width `>= 0.50 Sw`, **aspect 1.40-2.60** (2:1 iso ±30%) and its front edge inside the bottom `0.10 Sh` |
| works | `1 - padFrac`, an identity | the share of ink standing clear above a ground band as deep as the plate, anchored at the sprite's BASE |
| stack | `blob.w / f.w`, a crown bbox | `stackWidth()` — the blob's width above the FLARE into the roof, band `0.10-0.15` (floor re-based on the reference; ceiling untouched) |

`0.28 / 0.37` are not chosen numbers: `soviet-service-depot.gif` returns the same
**115x58 px** apron at every saturation cut from 0.24 to 0.32, on the **raw**
image with no chroma key applied — the grass is saturated green, the machinery
saturated navy/red, the concrete neither. That is the same 0.71 `Sw` / 1.85-1.98
plate `4a9e9d8` measured independently.

### (a) The reference, swept — every row PASSES

    [NADEPT] soviet-service-depot.gif        pad row                 works row
      cut 16  103x122  key collapsed         FAIL 0.184/0.90         FAIL 0.941
      cut 20  103x122  key collapsed         FAIL 0.184/0.90         FAIL 0.948
      cut 24  161x149                        PASS 0.702 Sw / 2.40    FAIL 0.582
      cut 28  161x149                        PASS 0.714 Sw / 1.98    PASS 0.400
      cut 32..56 (7 cuts)                    PASS 0.701-0.710 / 1.98 PASS 0.402-0.461

    [GAREFN] allied-ore-refinery.gif         stack row
      cut 14..23  (the 4 cuts whose key resolves two crown blobs at all)
                                             PASS 0.112-0.121 Sw each
      cut 26..50  (single fused blob, so the row is not emitted — the "2 stacks"
                   row takes over) stackWidth still reads 0.118-0.129 Sw
      cut 53, 56  key stops separating the grass; "bbox" is the whole 176x138
                   plate, so those two cuts measure nothing

Cuts 16 and 20 crop the depot to 103x122 — a **rip failure**, not a clause
failure, the same way cuts 53+ are for the refinery. On the nine valid cuts the
pad row passes 9 of 9 and the works row 8 of 9 (cut 24 keys away the apron's
rear, so the band shallows to 47 px and the ink share rises to 0.582).

Against **0 of 11** and **0 of 15** for the predicates these replaced.

### (b) The bite, on deliberately broken builds

| build | row | reading | |
|---|---|---|---|
| `6ab22eb` — the four squashes, `dpb fh*0.01` | `depot:dir` pad | plate **37x35 = 0.223 `Sw`, aspect 1.06**, base 0.122 | **FAIL** |
| `6ab22eb` | `depot:col` pad | plate **52x107 = 0.257 `Sw`, aspect 0.49**, base 0.212 | **FAIL** |
| `6ab22eb` | `depot:dir` works | **0.593** | **FAIL** |
| `dpb fh*0.01` + `sdB fh*0.15` only | `depot:dir` pad / works | **0.077 `Sw` / 0.43** · **0.796** | **FAIL** |
| Collective works `x2.5` (`shHw/shHh 0.26 -> 0.66`, lift 50 -> 132) | `depot:col` works | **0.774** | **FAIL** |
| refinery stacks re-drawn at `r=20` | `refinery:dir` stack | **0.184/0.184** | **FAIL** |

The squash build scored **0.524 / 0.530** — GREEN — under the old predicate. It
is the build the user reported as "it looks terrible". Old check: passed the bad
sprite, failed the reference. New check: the exact opposite, on both.

### What each row now catches, in one line

- **pad** — a Service Depot whose apron is not an isometric plate: a hairline, a
  sliver, a pale mass that isn't at the ground, or an apron so far from 2:1 that
  it no longer reads as a ground plane.
- **works** — a depot whose machinery has eaten the parking apron: more than half
  the sprite's ink standing clear of the ground band.
- **stack** — a refinery chimney drawn at the wrong calibre (fat enough to read
  as a tower, thin enough to read as a pipe), independent of the vault it stands on.

### Two findings recorded rather than fixed

1. **§2's own depot sentence is wrong about the reference.** It says "the pad
   octagon runs x≈62..160 of 161 = 0.61 `Sw`, and over those columns the sprite
   is a thin ground band only". Measured on the sprite it cites, RA2's works
   stand over the apron's left third: only **63 of the 115 pad columns** (0.39
   `Sw`) carry nothing above them. No column-purity reading of that row can reach
   0.50 for the reference, which is why the row is now read as a plate and not as
   a column count.
2. **The hardstanding key cannot separate pale machinery from concrete.** Our own
   silver `#b6bac6` (s 0.081) is *less* saturated than the concrete `#9b9787`
   (s 0.129). A bake that welds a pale machine face to its apron returns one
   fused mass and the aspect row goes red carrying the fused number — the safe
   direction, and observed on two probe builds. Not an art defect today: both
   shipped bakes segment cleanly at every cut.
