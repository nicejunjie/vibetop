# The 14 remaining `clause.unmetStructures` — triage before art

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
