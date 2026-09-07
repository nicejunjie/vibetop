# The RTS art debt ledger — what is settled and what is owed

**Written 2026-09-06. Audit only: no art, no tool and no clause check was
touched to produce it.** Every number below was read off a fresh
`node apps/games/rts/tools/art-metrics.js` run at `ca8fbfe`, and every verdict
carries a citation to the pass that earned it.

## Why this file exists

`art-metrics.js` prints nine debt rows and prints them all the same way. Some of
them are **finished work** — investigated, measured, and left standing with
arithmetic showing that closing them costs more than it buys. Others are **work
nobody has done**. A third group is neither: the art is right and the *check* is
measuring the wrong object, in two cases provably, because RA2's own reference
sprite fails the clause when the shipped math is run over it.

Nothing in the tool's output distinguishes these, so every new pass has to
re-derive the split before it can start, and two passes have already spent
themselves re-litigating settled ground. This file is the split.

### The three verdicts

| verdict | means | what a pass may do with it |
|---|---|---|
| **CEILING** | Attempted, measured, and left standing on arithmetic. The cost of closing it is recorded and is larger than the gain. | **Do not re-open without NEW evidence.** Re-running a sweep that is already in the citation is not new evidence. |
| **BROKEN-CHECK** | The art is not the failure. The clause's own segmentation reads the wrong object; where noted, RA2's own sprite fails the same check. | Fix the **checker**, in `tools/clause-checks/structures.js`. Do **not** distort a sprite to satisfy it — that trade is forbidden by `docs/qa-charter.md`'s two-pillar rule and has been rejected on sight three times. |
| **OPEN** | Real remaining work. Nobody has closed it, and no argument says it cannot be closed. | Do the work. The next-step column says what. |

### Headline counts

**22 substantive rows: 8 CEILING · 7 BROKEN-CHECK · 7 OPEN.**

> **Superseded in part — see "Update, 2026-09-06" below.** The structure count
> has moved 14 -> 11 -> 15 since this audit, and Table B's rows O5 and O7 are
> closed. The eight non-structure rows in Table A are unchanged.

`clause.unmetStructures` is a roll-up, not a row of its own — its 14 are
enumerated individually in table B, and they are the 7 BROKEN-CHECK and 7 OPEN.
**Every one of the eight non-structure debt rows is a documented ceiling.** All
of the genuinely open work in this project's art gate is in structures.

---

## Update, 2026-09-06 — `clause.unmetStructures` is now **15**, and two rows below are stale

Two later passes have moved this count since the audit above was written at
`ca8fbfe`. Read this section before trusting Table B's row list.

**14 -> 11** (`106f9e8`): the three real art defects in
`structure-clause-triage.md` were fixed — `depot:dir`'s crown, `prism:dir`'s
waist, `gapgen:dir`'s third collar ring. That closes **O7** and **O5** in Table
B below, and moves `prism:dir` off the BROKEN-CHECK list.

**11 -> 15** (the Service Depot repair-yard pass): FOUR new rows, all of them
the same broken check, all of them on the depot's pad. Full arithmetic in
`structure-clause-triage.md`, first section. The short version:

| verdict | rows | why |
|---|---|---|
| **BROKEN-CHECK** | `depot:dir` + `depot:col`, "flat pad >= 0.50 Sw" and "works confined <= 0.50 Sw" | The clause's "pad column" is one **<= 15% of Sh tall**. A flat plate in 2:1 isometric is by construction half as tall on screen as it is wide, so a pad at RA2's own 0.71 Sw runs to ~0.32 Sh — over twice the allowance — before anything is drawn on it. **RA2's own `soviet-service-depot.gif` fails the row at 0 of 11 sweep cuts** (padFrac 0.086-0.385, works 0.615-0.914). The predicate wants rewriting as a GROUND-BAND test, not a thinness test. |

**15 -> 12** (the clause-rewrite pass): B2, B3 and B6 are **closed by fixing the
checker**, exactly as this table said they should be, and B1 is closed as a
broken check and **re-opened as a real art defect**. All four had located a real
part with a WIDTH FRACTION (`bodyRun`'s 55% roofline, or the largest top-half
blob's bottom edge) instead of with a part boundary; two threshold-free
primitives — `pinch()` (deepest interior waist) and `solidBands()` (wide + solid
+ deep top-half mass) — replace it. RA2's own sprites now PASS all four:
`[NARADR]` 0.643-0.700 `Sw` / aspect 1.050-1.068 where the shipped math read
1.000/0.831; `[NATSLA]` 0.071 `Sw` where it read 0.310; `[NALASR]` — **fetched
and committed by this pass, closing B6's "no reference sprite was run against
it" caveat** — 0 enclosing bands at every valid sweep cut, against `[GACNST]`'s
1. Each rewrite is proved to still BITE against a deliberately broken
`ART_HTML` build. `checkedStructures` held at 75; full arithmetic in
`structure-clause-triage.md`'s last section.

| row | was | now | verdict |
|---|---|---|---|
| **B1** `tesla:col` neck | 0.627 (buttress spread) | **0.269** (row 27, 18 px) | **now OPEN — real art.** The collar at `rts.html:16555` is 7.2 px and *is* the neck, but the 26 px electrode sits on it with no gap and the 16 px helix wraps past it, so no row is ever narrow. RA2 leaves ~8 rows of bare 3 px stalk |
| **B2** `radar:col` dish Sw/aspect | `Sw 1.000`, aspect 0.780 | **0.695 / 1.071** | **CLOSED — MET.** The ledger's own prediction ("fixing the segmentation should close B2 and B3 together with no further art work") is confirmed |
| **B3** `radar:col` top 45% | 0.888 (`body.hi/Sh`) | **0.447** | **CLOSED — MET.** Note the reference lands at 0.460-0.465 on a tight bbox, so this ceiling is ~1.5 pp tighter than RA2's own tower |
| **B6** `sentrygun:col` drum | 1 blob @ 1.000 `Sw` | **0 bands** | **CLOSED — MET**, and no longer the weakest proof of the seven: it now has a reference sprite and a two-sided control |

**These four rows going red is a deliberate, user-directed trade.** They were
green only because the pad had been squashed to satisfy them: `dpb` driven
`fh*0.70 -> 0.19 -> 0.01` (a 157 px apron ONE PIXEL deep) plus three anamorphic
X-only scales (0.45 works cluster, 0.55 guide rail, 0.10 beam reach). The user's
report on the result was "it looks terrible, and it doesn't look like RA2".
Do not close them by re-squashing anything — `docs/qa-charter.md`'s two-pillar
rule forbids it, and it has now been tried twice.

**O5 in Table B is closed and its premise is void.** It asked for the four
detached works fragments to be merged; the fragments were an artefact of the
0.45/0.55 scales, which are gone. The row reads **1 blob** and is MET, and RA2's
own sprite passes it at 1 too.

---

## Table A — the eight non-structure debt rows

All eight are CEILINGS. They reduce to **four** underlying facts: elongation,
the un-normalised IoU, the dog, and the cross-group bake scale.

| metric | value | target | verdict | evidence |
|---|---|---|---|---|
| `peerVsSelf.total` | 6 | `<= 0` | **CEILING** | Roll-up of the two rows below. `tools/art-metrics.js:396-414` (the comment block that OPENS `TARGETS`, above the five `peerVsSelf.*` rows) names all six flagged units — `aegis, destroyer, dread, squid, sub, v3` — and records `corr(aspect, peersBeatingSelf) = +0.477` *after* the metric's asymmetry was repaired. **Re-verified here: those are exactly the six that flag today.** |
| `peerVsSelf.naval` | 5 | `<= 0` | **CEILING** | `per-unit-art-log.md`, "STATE OF PLAY", debt table row 2: the metric measures ELONGATION. **Re-computed from this run's `detail.perUnit`: `corr(broadsideAspect, selfIoU)` over the ten hulls is `-0.893`, to three decimals — the documented figure is exact.** The three least-elongated hulls (`seascorp` 1.486, `apc` 1.538, `lcraft` 1.795) are all clean; the two most (`squid` 3.467, `sub` 4.400) both flag. Driving it to 0 means making the fleet stubbier, which is the tugboat error the aspect gate exists to catch, and `legibility.js` reports **zero** confusable naval pairs in all six windows (three `VIEWS` at two `ZOOMS`, `tools/legibility.js:56` and `:368`). |
| `peerVsSelf.vehicle` | 1 | `<= 0` | **CEILING** *(weakest of the eight — see caveat)* | The single unit is **`v3`** (verified: `peersBeatingSelf` 4, `bestPeer` Tesla Tank at 0.6321). It is named explicitly in the `art-metrics.js:396-414` list, and the block asserts the whole set is a mask-only artefact of correctly-proportioned art. **Caveat this audit records rather than hides:** the argument rests on the six being "the six longest on the board, mean aspect 2.68", and the V3's broadside aspect is **1.455** — well below that mean and below three *clean* naval hulls. Its proportion is verified (`vsRA2` 0.831 against `ra2Aspect` 1.750), so the ceiling holds; but if anyone ever brings new evidence to a `peerVsSelf` row, this is the one row where it could bite. |
| `iou.groundCombat.mean` | 0.466 | `<= 0.45` | **CEILING** | `per-unit-art-log.md`, "STATE OF PLAY", debt table row 3, plus **the mechanism verified in source**: `iou()` at `tools/art-metrics.js:897-909` pads both masks to a common canvas and centres them on their bbox centres — it applies **no size normalisation at all**, so a size difference alone lowers IoU. The nine-member `GROUND_COMBAT` set (`art-metrics.js:974`) carries an internal scale spread of **1.579x** today (`flaktrack` 0.956 → `prismtank` 1.509), and that raggedness is what buys the 0.466. **Two independent measurements confirm the gates are structurally opposed**, both recorded before this audit: shrinking the Prism 91→89 px to close the `mcv` clause cost `iou.groundCombat.mean` 0.4652 → 0.4695 (`clause-inventory.md`, "Corrected 2026-09-06"), and the whole-vehicle x0.571 rescale costs it 0.4652 → 0.4745 (`detail.clauses` destroyer note). Every move toward RA2's uniform scale raises this number. |
| `size.infantryOutsideRA2Band` | 1 | `<= 0` | **CEILING** | The unit is **the dog** (verified: 39 px against RA2's 21, `scale` 1.8571 against a `groupScale` of 1.4167). `per-unit-art-log.md`, "STATE OF PLAY", debt table row 4, and the working at lines 333-396 of that file: his LENGTH is what separates him from Tanya, `CELL 96` is a footprint window (~1100 px of dog in a 9216 px cell, so internal colour dilutes ~8x), **six configurations were swept and nothing below full width clears ZMIN**, and paint moved the pair 0.1. Shrinking him closes this gate and breaks the friend-vs-foe floor — recorded as rule 3 of that section, "the gates are not independent". |
| `size.worstOffGroupScale` | 0.3109 | `<= 0.25` | **CEILING** | **The same unit and the same fact** — verified: the 0.3109 IS the dog's `dev`, and the runner-up is `flaktrack` at -0.2474, already inside 0.25. This row cannot move until the row above does. Same citation. |
| `clause.unmet` | 1 | `<= 0` | **CEILING** | The one failing unit clause is **`destroyer` "length >= 1.46x any land vehicle"** at 0.848. `detail.clauses` carries the full derivation in the row's own note, and `clause-inventory.md`'s "Corrected 2026-09-06" paragraph states it: the threshold is RA2's own (`[DEST]` 101 px / `[AMCV]` 69 px = 1.464), so it may not be struck; what the row actually measures is the **cross-group bake scale** (our 0.848 = 1.464 x 0.8812/1.5217 to four decimals, and this run confirms `ra2GroupScale` naval **0.8814** / vehicle **1.2698**); the only route that does not spend the fleet is the whole vehicle group at x0.571, **which was BAKED and measured, not estimated** — it closes this row at 1.483 and opens five others (`crossGroupSpread` 1.607→1.899, `vehicleOutsideRA2Band` 0→2, `spike.belowDeclaredBudget` 0→4, `colour.vehicleAchromatic` 0→4, `clause.unmet` 5→9). One row closes, five open. |
| `clause.navalUnmet` | 1 | `<= 0` | **CEILING** | **The same clause counted a second time** — the Destroyer is naval, and `infantryUnmet`/`vehicleUnmet`/`airUnmet` are all 0. Not independent debt. Same citation. |

---

## Table B — the 14 `clause.unmetStructures`, one row each

`clause.checkedStructures` is **75**; 14 fail. **7 are broken checks and 7 are
real open art work. None is a ceiling** — no structure clause has yet been
argued to arithmetic the way the Destroyer's was.

Sprite widths referenced below, from this run's `detail.bldAll`:
`base:dir` 248x157 · `refinery:dir` 228x170 · `refinery:col` 228x196 ·
`depot:dir` 166x115 · `radar:col` 131x188 · `reactor:col` 259x158 ·
`sentrygun:col` 56x59 · `tesla:col` 67x103 · `prism:dir` 69x126 ·
`gapgen:dir` 75x86.

### The 7 BROKEN-CHECK rows

> **B1, B2, B3 and B6 were rewritten on 2026-09-06** — see the update section
> above. B2, B3 and B6 are MET; B1 is now a real art defect with an honest
> number. B4 (`prism:dir`) was already closed by `106f9e8`. The rows are kept
> below as the diagnosis that earned the fix.

| # | key | clause (§2 text as the check states it) | measured | want | verdict | evidence |
|---|---|---|---|---|---|---|
| B1 | `tesla:col` | *"a neck beneath the sphere pinching to `<= 0.10 Sw`, off the sphere, the entire silhouette pinch"* | 0.627 | `<= 0.10 Sw` | **BROKEN-CHECK — proven on the reference sprite** | Commit **`bc5edfb`** and `docs/design-decisions.md`, "Two more structure clauses measure the wrong object — and RA2's own sprite fails one of them". The neck scan starts at `top.y1 + 1`, where `top` is the largest blob in the **top half**, so it reads the buttress spread and not the neck. Run over `docs/ra2-ref/sprites/buildings/tesla-coil.gif` (blue-key removed; opaque bbox **exactly 42x81**, the size §2.7 records, narrowest row the documented 3 px = 0.071 `Sw`), the shipped math reports **0.333 `Sw` against its own `<= 0.10` demand — RA2's own Tesla Coil fails by 3.3x.** No drawing of a Tesla Coil can pass this check as written. |
| B2 | `radar:col` | *"[col] dish `>= 0.55 Sw` and essentially circular, aspect 0.90-1.10"* | `Sw 1, aspect 0.78` | `>= 0.55 Sw`, aspect 0.90-1.10 | **BROKEN-CHECK — the measured values are identities, not measurements** | Same commit **`bc5edfb`** / same DD entry. The dish predicate is `y <= body.hi`, and `body.hi` is the last row at or above 55% of the widest row — which for **any tower** lies in the base. So the predicate admits crown + neck + base as one 4-connected blob, and **`dw` is 1.000 and `dish.y1` is `body.hi` for every connected sprite**. Neither number is a property of a dish. Ours has a real 0.198 `Sw` pinch at rows 101-107 that the check walks straight past. **The art already satisfies this clause**: commit **`06c3f11`** re-proportioned the dish off the rip's own rowProfile to **0.695 `Sw`, aspect 1.071** (within 3% of `soviet-radar-tower-idle.png` on both), and confirmed zero clause movement, exactly as predicted. |
| B3 | `radar:col` | *"[col] the dish lies wholly inside the top 45% of `Sh`"* | 0.888 | `<= 0.45` | **BROKEN-CHECK — same predicate, and the art now clears it too** | Same citations. `0.888` is `body.hi/Sh`, not a dish bottom. Measured off the real pinch the dish bottom is **0.447 `Sh`** after `06c3f11` (it was 0.518 before, which was the genuine art gap the broken clause was hiding). 0.447 is inside the `<= 0.45` ceiling. **Fixing the segmentation should close B2 and B3 together with no further art work** — a prediction this ledger states so the next pass can falsify it cheaply. |
| B4 | `prism:dir` | *"[dir] a waist beneath it `<= 0.25 Sw`"* | 0.261 | `<= 0.25 Sw` | **BROKEN-CHECK — the scan reads the wrong 20 rows** | Same commit **`bc5edfb`** / same DD entry. The waist is scanned from `top.y1 + 1`, where `top` is the largest blob in the **top half** — so on a continuous tower `top` is everything above the midline, clipped at `y = h/2 - 1`. The prism's genuine waist is rows 42-53, **10 px at row 49 = 0.145 `Sw`**, comfortably inside the `<= 0.25` asked for; because it sits ABOVE the midline the scan starts *below* it, on the flare at row 63 (18 px = 0.261). **Explicitly rejected, do not retry:** reshaping the column so the flare below the midline dips under 0.25 — it distorts a sprite whose real waist is already 0.145. |
| B5 | `sentrygun:col` | *"[col] exactly 2 barrels, resolvable as two at 2px each with a gap `>= 2px` between them, and they are the topmost mass"* | `1 crown blob(s)` | 2 blobs, gap `>= 2px` | **BROKEN-CHECK — proven unreachable by exhaustive sweep** | `docs/design-decisions.md`, "The fix for bodyRun's phantom crown", closing section: **no horizontal roofline whatsoever resolves these two barrels — 1 component at every cut from 1 to 58** — because they are drawn diagonally staggered. "That clause is unreachable by a crown primitive, not merely unmet by this art." Prior history in commit **`fab7549`**: a crown fix that made it pass numerically rendered the twin guns floating off the receiver, and three remediations (minimal pivot raise, bridging stalk, wider tip separation) each stayed detached or re-fused. **Reverted to pristine on the two-pillar rule.** |
| B6 | `sentrygun:col` | *"[col] zero enclosing drum or roof"* | `1 wide (>=0.5 Sw) below-roofline blob(s)` | 0 blobs | **BROKEN-CHECK — diagnosed, but the weakest proof of the seven** | `docs/design-decisions.md`, "bodyRun's 55%-of-max cutoff invents a 'crown' part on smooth silhouettes": both `sentrygun` rows fail "with no corresponding defect visible in the rendered sprite", and `body.lo = 38 of 59` puts nearly the whole upper assembly (barrels + trunnion + housing) inside the crown region, so "no local edit can satisfy the clause honestly". Commit **`fab7549`** adds that two independent local nudges made the metric *strictly worse*, consistent with `bodyRun` being a global non-monotonic function. **What is missing, and this ledger says so rather than inflating the verdict:** unlike B1/B2/B4 no reference sprite was run against it, and unlike B5 no exhaustive roofline sweep was published for *this* row. Confirm it the way `6c941a3` established — render the `sentrygun:col` bake with its roofline drawn on and look — before spending checker work on it. Note `49bc2a1` already removed the shared `fw*2` platform diamond for this key so the splayed legs stop reading as one solid below-roofline mass, and the row still reads 1. |
| B7 | `gapgen:dir` | *"[dir] exactly 4 talons, countable, each 2px at `>= 25%` contrast, splaying so the crown is wider at its top than the column beneath it"* | `0 bright-outlier crown blob(s) >=2px; crown span 46px` | 4 blobs | **BROKEN-CHECK — polarity, verified in source by this audit** | Commit **`278a866`** reports it as a checker-polarity bug. **Confirmed here by reading both checks:** `tools/clause-checks/structures.js:694` filters gapgen's talons with `(p.v - med) >= CONTRAST` — a **bright** outlier — while the sibling clause at `:624`, patriot's four tube mouths, correctly filters `(med - p.v) >= CONTRAST`, a **dark** outlier. §2.7's gapgen row (`unit-identity-reference.md:772`) says only *"each 2 px at >= 25% contrast"* and names no polarity; RA2's talons and this game's own reference art are **black**. The second half of the clause already passes — `crown span 46px > 0`, i.e. the crown IS wider than the column — and `278a866` separately fixed the real geometry defect underneath (`ta = tk/4*2pi + 0.7854` put the near/far talon on each side at the mathematically identical x, so four talons rendered as two columns; replaced with four explicit talon definitions). |

### The 7 OPEN rows

| # | key | clause (§2 text as the check states it) | measured | want | verdict | what the next pass should actually do |
|---|---|---|---|---|---|---|
| O1 | `base:dir` | *"[dir] exactly ONE crane/boom group above the hall roofline, its jib `>= 3 px` thick and clearing the roof by `>= 0.10 Sh`"* | `0 crown group(s), thickest 0px, clearance 0` | 1 group, `>=3px` thick, clearance `>= 0.10` | **OPEN — real art, and it was a FALSE PASS for the row's whole life** | **Raise the Allied crane above the hall's arch, or lower the arch.** Evidence: `6c941a3` and `docs/design-decisions.md`, "The fix for bodyRun's phantom crown" — the monotonicity veto took this row 1 → 0 groups, "an ART finding the phantom was hiding: the hall's arch is the topmost mass and the yellow crane sits entirely below it, so that row had never once measured a crane". `base:col`, which has a real waist, reads its crane and passes. **Note the trap:** `61b1f9d` nudged this crane's anchor 12 px DOWN to satisfy the phantom reading — that edit was aimed at the wrong target and should be reconsidered, not built on. |
| O2 | `refinery:dir` | *"[dir] exactly 2 stacks with a clear gap `>= 0.08 Sw` between them"* | `2 stacks, gap 0.018 Sw` | 2 stacks, gap `>= 0.08 Sw` | **OPEN — real art (diagnosis owed first)** | **Render `refinery:dir` with its roofline drawn on — the method `6c941a3` established — and identify what the two crown components actually contain before editing anything.** On 228 px, 0.018 `Sw` is ~4 px against the ~18 px the clause wants. The stacks are already spread to `cx-3` / `ssx = cx+47` (`rts.html:14842`, comment: *"far enough apart that the crown reads as two, not one"*), landed in **`7b4467a`** — a commit whose own subject says INCOMPLETE, UNVERIFIED. |
| O3 | `refinery:dir` | *"[dir] each stack 0.12-0.15 `Sw`"* | `0.425/0.123` | 0.12-0.15 `Sw` each | **OPEN — real art, same two components as O2** | **Same diagnosis as O2, and this row is the tell that makes it cheap.** `0.123` is inside the band; `0.425` is **97 px of a 228 px sprite**, 2.8x the ceiling, so that component is not a stack. `rts.html:14847-14851`'s own comment names the predicted culprit — *"the plate is a flat roof/apron… its ridge must stay low enough that the tall stack's own crown never fuses with a diagonal roofline poking up beside it"*. If the 97 px blob is stack-plus-ridge, this is the anti-aliasing fusion signature that has accounted for most of this project's structure defects (`per-unit-art-log.md`, "STATE OF PLAY", "The pattern that produced most of today's fixes"), and O2 and O3 close together. |
| O4 | `refinery:col` | *"[col] exactly 2 stacks with a clear gap `>= 0.08 Sw` between them"* | `1 stack-sized crown blob(s) found` | 2 stacks | **OPEN — real art, and the cause is already proven to be FUSION, not missing geometry** | **Separate the two Collective stacks; both are drawn.** `2dec9cc` is the authority and it exists precisely to stop this being re-derived: a cause-diagnosis pass labelled this row "stacks (1 of 2) — MISSING", and spot-checking falsified it on the first case tried — the source draws two (the `tsx`/`ssx` pair, today `rts.html:14842`). **`per-unit-art-log.md`'s closing section warns that that pass's whole 33-of-35 "missing geometry" split is unsafe; re-diagnose against the drawing code before fixing.** No committed RA2 sprite exists for this faction (§2.9), so the clause rests on `[GAREFN]`. |
| O5 | `depot:dir` | *"[dir] exactly ONE crane/gantry group with its jib tip horizontally over the pad"* | `4 crown blob(s)` | 1 blob | **OPEN — real art, fully diagnosed, named as remaining work by the pass that caused it** | **Merge the four disconnected works fragments back into one connected crane/gantry blob.** Commit **`e4128ca`** states it in as many words: the `g.scale(0.45,1)` on the scoop/hull/houses assembly and the `g.scale(0.55,1)` on the C guide rail — the coordinated shrink that closed both `padFrac` clauses — "detached them further from each other and from the main mass… merging the fragments into one connected blob is real remaining work". The row was unmet before that change and unmet after, so there is no regression to unwind: this is additive work on top of a fix worth keeping. |
| O6 | `reactor:col` | *"[col] the tallest tower's crown is inside the top 0.10 `Sh`"* | 0.247 | `<= 0.10` | **OPEN — and explicitly NOT claimed as a broken clause by the pass that got closest** | **Get a clean alpha rip of the Soviet Nuclear Reactor, or find a clearance measurement that does not need background segmentation, before touching the art again.** Commit **`94a8890`** improved this from 0.380 → 0.247 by moving the two flanking cooling towers `cx±45/46` → `cx±60/61` (3 tower-sized crown blobs where there was 1), then stopped honestly: pushing to `±72/73` bought nothing more, because `rowProfile` counts per-row pixel MASS and not span. Its own words: *"its achievability against RA2's own reference is inconclusive — a flood-fill background segmentation of `docs/ra2-ref/soviet-nuclear-reactor.png` (no clean alpha rip exists) was too threshold-sensitive to trust (clearance read 0.380/0.346/0.066/0.331 at thresholds 34/45/55/65), so this is reported as open, not claimed as a proven-broken clause."* `ca8fbfe` re-affirms it as "left honestly open rather than chased". §2.6's own reference reading is y≈8 of 129 → 0.06 (`unit-identity-reference.md:718`). |
| O7 | `gapgen:dir` | *"[dir] exactly 2 house collar rings and nothing else remapped"* | `3 house-coloured blob(s)` | 2 blobs | **OPEN — real art, and the smallest job on this page** | **Kill one sub-pixel anti-aliasing speck.** Commit **`278a866`**: the two real collar rings are correct and the third blob is *"one remaining sub-pixel antialiasing speck (down from a pre-existing baseline of 4)"*. That commit already paled the three decorative strokes that were leaking into the count — the near-talon glint, the animated field ring and the navy instrument-pod glow dot, all of which sat inside `isHouse`'s tolerance band (`s ≈ 0.32-0.45`, hueGap 13-20 of `OWNER_HUE` 197) by coincidence of reading as "cool blue" — sweeping the full blend range rather than the pure endpoints. One speck survived. |

---

## Appendix — three things that look like debt on this page and are not

**1. `power:dir` is a proven-broken clause that our art nevertheless PASSES, so
it is not a debt row.** The brief that commissioned this ledger listed it beside
tesla/radar/prism, and the evidence is real: commit **`cb69523`** and
`docs/design-decisions.md`, "The Allied Power Plant's fused crowns", record that
RA2's own `[GAPOWR]`, chroma-keyed, presents **TWO** crown blobs at 0.395 / 0.163
`Sw` over a 0.419 `Sh` roofline — its copper basin welds its middle and right
towers exactly the way our drum used to weld all three — so §2.6's "16-18 px on
86" was measured by eye on the columns, not by `bodyRun` plus connected
components. Ours passes anyway, closed by an **ink budget** rather than by
spacing: the roofline sits at 55% of the widest row (the ground pad), so the
whole crown band has `0.55 Sw` = 72 px to spend across three towers, which makes
`r*1.82` arithmetically impossible at *any* spacing. Columns held at `r`=9
(0.137 `Sw` against RA2's 0.135), the width moved into the ~8-row cap
(`r*1.04` → `r*1.28`), drum narrowed to `r*1.50`. Two of three rip proportions
moved *toward* the reference. **Do not re-open it, and do not cite it as an open
broken check.**

**2. `size.bldOutsideRA2Band` is 0 and `size.bldWorstOffHouseScale` is 0.1759 —
but a known-bad reference is holding one of them up.** `RA2_BLD['barracks:col']`
records `soviet-barracks.png` as 117x205 annotated "Tight crop"; it is not a
crop, it is a whole small SCENE, and the building runs roughly 86x163 with ~36
rows of road below the base plate (`per-unit-art-log.md`, "§2 had no identity row
for a single STRUCTURE", section 2; commit **`9c65961`**). Correcting it takes
`[NAHAND]` height-over-footprint 3.417 → ~2.72 and would make our Soviet Barracks
the **worst** structure in the set at `hScale` ~1.41, deviation ~+0.23 — a second
`size.bldOutsideRA2Band` failure. It was deliberately not fixed in the pass that
found it, to keep that pass byte-identical. **A future pass that re-crops the file
will open a debt row that does not exist today; that is the reference getting more
honest, not a regression.** It is also, per the same section, the one file in the
corpus that defeats border-flood segmentation at every tolerance from 30 to 60,
because the statue's steel is the same VALUE as the road.

**3. `GI | Spy` at 61.1 is not on this page because it is not an
`art-metrics.js` row** — it is the `cameo-legibility.js` Directorate floor. It is
nonetheless a **CEILING**, and the most thoroughly falsified one in the project:
the pair is figure-bound (the figure carries 95.6% of the squared distance), the
cause is an **FNV-1a hash collision** putting `rifle` and `spy` within 0.7% in the
`hv` axis (instrumented: lit0 70.3 / subL 32.0 and 69.9 / 43.4, hatch fires on
neither), and forcing the Spy's plate 26 points away moves the pair
**61.1 → 61.4** while costing two other pairs. Three separate mechanisms were
proposed and measured — the escape hatch, a bigger fixed push, and rank-based
plate luminance — and the third was built, measured, regressed and reverted
(`1da95b0`) before the actual fix landed in **`e43ee2f`** (a rank-aware hatch:
Directorate UNDER 344 → 225, Collective 459 → 250, neither floor dropped). The
floor itself did not move and is not expected to.

---

## The rules this ledger inherits, restated because they bound every row above

1. **A green metric bought with a visible defect is a loss.** `docs/qa-charter.md`'s
   two pillars. The radar `destination-out` cut, the `sentrygun` crown fix and the
   Flak Cannon's invented ammo feed were each reverted on this rule alone — the
   radar cut twice, which is why it is written down.
2. **Nothing may regress.** A defensible art gain that costs one cameo pair is
   left out: the Power Plant's seam strokes (`61b1f9d`) and the Radar Tower's
   trunnion widening (`06c3f11`, measured at both 13 px and 11 px, so not a
   threshold to tune past) both died here.
3. **Render the boundary your checker believes in before you tune the checker.**
   The five phantom crowns and the four false passes were indistinguishable from
   real parts in the numbers and separable in one glance at the sprite with the
   roofline drawn on it (`6c941a3`).
4. **A null result must prove the edit landed; a spectacular positive result must
   prove the build still runs.** Both traps have been paid for in this project —
   `STATURE.dog` moving zero pixels, and a "8x cameo improvement" that was 24 of
   40 bakes throwing (`per-unit-art-log.md`, "The trap this pass paid for").
