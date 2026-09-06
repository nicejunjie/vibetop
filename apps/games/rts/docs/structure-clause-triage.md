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

| | rows |
|---|---|
| **BROKEN CHECK** — RA2's own sprite fails it, or the predicate is an identity | **7** |
| **REAL ART DEFECT** — the reference passes, our bake does not | **5** |
| **CEILING** — measurable, unreachable by the primitive available | **2** |

## The table

| # | key | clause | ours | RA2 reference, same math | verdict |
|---|---|---|---|---|---|
| 1 | `base:dir` | exactly ONE crane/boom group above the hall roofline | 0 groups, `crown:false` | **[GACNST] 0 groups, `crown:false` — identical**; [NACNST] **3 groups** | **BROKEN** |
| 2 | `refinery:dir` | 2 stacks, clear gap >= 0.08 Sw | 2 stacks, gap 0.018 | [GAREFN] passes at 2 of 15 sweep cuts — inconclusive | **ART** |
| 3 | `refinery:dir` | each stack 0.12-0.15 Sw | 0.425 / 0.123 | [GAREFN] **fails at 15 of 15 cuts** (0.276/0.220/0.178/0.155/0.144/0.121/0.069/0.063 — never all in band) | **BROKEN** |
| 4 | `refinery:col` | 2 stacks | 1 blob @ 0.491 Sw | (no `col` rip; the `dir` rip fuses the same way) | **ART** |
| 5 | `depot:dir` | exactly ONE crane/gantry group | 4 blobs | rip too shadow-noisy to segment (311/149/51 blobs across the sweep) | **ART** |
| 6 | `radar:col` | dish >= 0.55 Sw, aspect 0.90-1.10 | Sw **1.000**, aspect 0.78 | [NARADR] Sw **1.000**, aspect **0.831 — fails**; prism 1.000/0.570; tesla 1.000/0.538 | **BROKEN** |
| 7 | `radar:col` | dish wholly inside the top 45% Sh | 0.888 | [NARADR] **0.904 — fails**; prism 0.952; tesla 0.951 | **BROKEN** |
| 8 | `reactor:col` | tallest tower's crown inside top 0.10 Sh | 0.247 | — | **CEILING** (known) |
| 9 | `sentrygun:col` | exactly 2 barrels, gap >= 2px, topmost mass | 1 blob | — | **CEILING** (known) |
| 10 | `sentrygun:col` | zero enclosing drum or roof | 1 blob @ **1.000 Sw** | **100 of 100** structure bakes and **4 of 4** rips read exactly 1 @ 1.000 Sw | **BROKEN** |
| 11 | `tesla:col` | a neck pinching to <= 0.10 Sw | 0.627 | [NATSLA] **0.333 — fails by 3.3x** | **BROKEN** |
| 12 | `prism:dir` | a waist beneath it <= 0.25 Sw | 0.261 | [GAPRIS] **0.211 — passes** | **ART** |
| 13 | `gapgen:dir` | 4 talons, each 2px at >= 25% contrast | **0** bright-outlier blobs | (no rip) — 3 **dark**-outlier blobs on the same mask; RA2's talons are black | **BROKEN** (polarity) |
| 14 | `gapgen:dir` | exactly 2 house collar rings | 3 blobs | (no rip) — third blob is **one pixel** | **ART** |

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

## The five real art defects

| # | key | what is actually wrong |
|---|---|---|
| 14 | `gapgen:dir` | **one pixel**, `(32,14)`, `rgba(60,76,100,64)` — a 25%-opaque anti-aliasing fringe that lands inside the house band (s 0.40 >= 0.25, v 0.392 >= 0.20, hueGap 19 <= 20) and counts as a third collar ring. The two real rings are 289px and 178px. |
| 12 | `prism:dir` | our column flares too early and too fat. Scanned rows: ours opens at row 63 already 18px (0.261) and only ever widens; RA2's dips to **12px (0.211) at row 57** before flaring. Moving toward the rip closes the clause. |
| 5 | `depot:dir` | three 14x3 slivers at `y74-76` (x3-16, x34-47, x131-144) poke exactly **3 rows** above a roofline at 77, so three flat roofs are counted as three extra cranes beside the real 56x77 gantry. |
| 2 | `refinery:dir` | the vault apex and the near stack bake as one 97px-wide (0.425 `Sw`) crown mass with a **4px seam** to the far stack — the anti-aliasing-fusion pattern. |
| 4 | `refinery:col` | the same fusion, complete: the entire crown is ONE 112px blob at 0.491 `Sw`. |
