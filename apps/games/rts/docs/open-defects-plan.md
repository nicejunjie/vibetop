# RTS — the execution plan

Written 2026-09-04 after the order-target pass closed two cases and left six
unsettled; extended the same day with the two gaps the first draft missed
(swept out of `gap-audit-art.md` / `gap-audit-features.md`).

**This is a plan, not a backlog.** Every phase states what it may start from,
the exact edit, the test that proves it, and what has to be true to call it
done. Phases are ordered so that **no phase optimises against a number a later
phase invalidates** — which is why the metric question (Phase 3) sits in front
of all map art, not after it.

Two rules bind every phase:

- **Prove each new test RED against the unfixed build first.** A test that only
  ever ran green proves nothing, and an assertion made true by the fix's own
  CSS or state is a tautology.
- **This checkout is shared.** A peer session edits the same tree — on
  2026-09-04 two terminal files went from clean to modified between two
  `git status` calls minutes apart. Release from a worktree, run
  `git diff --cached --name-only` immediately before every commit, never assume
  a fast-forward, never bump `VERSION`/`sw.js` while prod is dirty.

---

## Phase 1 — orders and veterancy stop lying · ONE release

Both are small, both are in `rts.html`, both are "a rank or an order silently
does not apply". They ship together under one `sw.js` bump.

### 1.1 Force-fire honours veteran ROF
**Evidence (read, not inferred).** `fireGround()` sets
`u.cool = spec.rate * (u.rank === 2 ? 0.6 : 1)` — rts.html:29149. That is an
**elite-only** multiplier left behind when the file moved to `[General]
VeteranROF=0.6` **per level**. Both real fire paths already use `vetRof(rank)`
(:20900, :22637). A **veteran** force-firing at bare ground therefore fires at
rookie cadence; the same unit shooting a target does not.

**Edit.** One line: `spec.rate * vetRof(u.rank)`.

**Test.** A rank-1 unit force-fires at ground; assert its `cool` equals
`rate * 0.6`. Red on the unfixed build (it returns `rate * 1`).

### 1.2 An aircraft can be sent home to rearm
**Evidence.** Both probe runs: `order: null`, target confirmed a built
`airforce`. `rightOrder()` (:29179) has **no `wantsOwn` rung for aircraft**, so
the click falls to `cmd('move', …)` at the bottom, and that move is discarded for
an aircraft already in its pad cycle (`u.ammo <= 0 && pad -> u.rtb = true`,
:22474; a stopped aircraft re-arms anyway, :25951). The order never survives to
become one.

**Edit.** Add the rung — an air unit with `ammo` right-clicking its own
`airforce` issues an explicit return-and-rearm, setting the same state auto-RTB
already sets — plus the matching branch in the `'own'` command handler, exactly
as the miner and depot rungs were added.

**Test.** Right-click own Airforce Command with an out-of-ammo Harrier selected;
assert `rtb` is set. Red on the unfixed build (`order: null`).

**Exit.** Both tests green, both proved red first. Bump `VERSION` **and**
`shell/sw.js` `VERSION`, commit, push, **then** deploy — in that order, or open
tabs stay stale.

---

## Phase 2 — one hardened probe, then two questions · investigation

Do **not** start by fixing anything. The blocker is that the probe is not
trustworthy: three cases gave **different answers across two runs**.

### 2.1 Rebuild the probe (this is the deliverable)
Three traps are already paid for and must not be re-paid:
- `__rtsScreen()` returns **canvas**-relative coordinates; `page.mouse` takes
  **page** coordinates. The app's top bar put every click ~40 px high until the
  canvas bounding box was added.
- Spawning cases at a shared offset **stacks** the units, so the click selects
  whichever is on top. Give every case its own patch of ground.
- Units **drift**; the click chases a stale screen position. **Settle each unit
  before clicking** — this is the fix for the run-to-run variance.

**Exit condition for 2.1: the same probe, run twice, returns identical results.**
Nothing downstream means anything until that holds.

### 2.2 Why the depot click misses
The predicate is **not** the bug — tested directly in-page: lancer `cls 'v'`,
`air false`; depot `kind 'b'`, `type 'depot'`; **condition true**. So
`pickAt(px, py)` did not return the depot. Log what `pickAt` returns across the
depot's **whole footprint**. **Do not "fix" the predicate; it is already right.**

### 2.3 Read the three unsettled cases in one run
Terror Drone, Chrono Legionnaire, Yuri right-clicking **our own tank**. With 2.1
holding, read all three from a single run and record the real answers.

**Exit.** `order-target-audit.md` updated with settled verdicts. Any fix that
falls out is a follow-on commit, not part of this phase.

---

## Phase 3 — the two false premises · cheap, and they unblock everything else

Both are hours, both are our own code or tooling asserting something untrue, and
both were found by the art study (`art-legibility-plan.md`). **The menu track and
the map track are independent and do not block each other** — that is the study's
finding, and it is why these two sit together rather than one gating the other.

### 3.1 M1 — print the item's name on the cameo *(menu; user-visible)*
**The premise we built on is false.** `rts.html:27751` reads:

> `// No prose on the cameo — RA2 puts none there.`

RA2 puts one on **every shipped-style plate**: an outlined-white-caps detector
finds a caption on 59 of the 74-plate corpus, a 60th uses grey text the detector
misses, and the remaining 14 are visibly pre-release alpha/beta plates in another
style. **Verified by eye** in `docs/ra2-ref/cameo-ours-vs-ra2.png` — "G.I.",
"GUARDIAN G.I.", "AEGIS CRUISER", "FLAK-TROOPER", "대공포". Today our name lives
only in the hover tooltip: it costs a hover and a wait, which is exactly the
learned-not-discoverable pattern this project rejects everywhere else.

**Edit.** In `cameoFor()`, after the sprite and before the bevel, draw the name
across the bottom of the 60×48 plate — bold condensed caps, white over a ~2.5 px
black stroke, wrapping to two lines when needed. Use **RA2's own caption
strings** read off the corpus, not our internal `spec.name` (RA2 says WEATHER
MACHINE, not "Weather Control Device"). Delete the false comment. Keep the
`.nm`/`.ct` spans and the tooltip — RA2 has both.

**Expected, prototyped on the real pixels:** worst pair **27.2 → 41.1** (DIR,
+51%) and **23.1 → 42.3** (COL, +83%); 5th pct 36.7 → 52.8 and 32.5 → 52.3;
greyed 12.2 → 21.1 and 11.0 → 24.0.

**Exit.** Every `min` and `5th pct` in `cameo-legibility.js` moves by at least
those amounts, in both sidebars **and** the greyed row; then look at `--sheet` at
1:1 and confirm the caption is legible without burying the subject.

### 3.2 P1 — fix the measurement window before any more map art *(tooling only)*
**`legibility.js` normalises into a `CELL = 28` box and centre-crops everything
larger** — all 13 vehicles, all 10 ships, and 4 px off each end of every trooper
(a GI is 16×36, the Aircraft Carrier 84×74). Three windows give three verdicts:

| window | threshold | infantry under the floor |
|---|---|---|
| CELL = 28 *(as shipped)* | 32.0 | **0** infantry, 1 naval |
| CELL = 64 *(nothing cropped)* | 18.3 | **11** infantry, 0 naval |
| union-footprint | 42.2 | 0 infantry, 1 air |

The crop throws away the head, the weapon and the feet — **where infantry
identity lives** — and keeps the torso, where it does not. At CELL 64 the worst
pairs are `ivan|spy` 16.1, `ivan|yuri` 16.6, `conscript|tanya` 17.6, `tanya|ivan`
17.8 … eleven under the floor. **That list is the owner's complaint, in numbers,
and the shipped report does not contain it.**

**Edit.** Make `CELL` env-overridable; default it to at least the largest drawn
unit; document that padding dilutes distances uniformly so the threshold moves
with the window and only same-window comparisons mean anything; and report the
**union-footprint** variant as a second column so no one cites one number in
isolation again. A CELL 96 run OOM'd node — raise `--max-old-space-size` or store
thumbnails as `Uint8Array`.

**Exit.** The three tables above reproduce. No art changes.

**This gates the MAP track only (Phase 5). It does not gate the menu track.**

---

## Phase 4 — the rest of the menu · measured, in order of gain

Run after 3.1, re-measuring between each so every step's gain is attributable.

- **M2 — one background per item, not one wash for eighty.** *(2–4 days)*
  Across-plate luminance SD is **10.2 / 8.2** against RA2's **22.6**, and only
  34% of our plate is picture against RA2's 76%. The existing subject-mean tint
  was already the attempted fix and the measurement says it failed, because
  nearly every sprite is grey-blue steel. Replace it with a small vocabulary of
  **category scenes** — sky for air, sea horizon for naval, ground-and-horizon
  for vehicles and structures, a close dark backdrop for infantry — varying hue
  *and plate value* per item. With M1 this measured **53.5 / 51.9** worst pair
  and **69.2 / 64.7** at the 5th pct, against RA2's floor of 58.5. **Risk is
  taste:** the unconstrained prototype is a rainbow and looks wrong. Build one
  category, put one tab in front of a human, then extend.
- **M3 — crop infantry to RA2's portrait.** *(~2 days)* Infantry plates are 30%
  subject. A ×2.2 crop measured 28.9 → **38.7** (DIR) and 25.8 → **42.8** (COL).
  **Do M1 and M2 first and re-measure** — our troopers are ~16×36 at bake
  resolution and a hard crop will expose that a helmet is four pixels, which may
  pull sprite rework in behind it.
- **M4 — reconsider the greyed style.** *(hours, after M1–M3)*
  `grayscale(.65) brightness(.6)` roughly halves every distance, and the early
  game is **mostly** greyed cameos — the dominant reading condition, not an edge
  case. Keep the caption at full white, which needs it on a CSS overlay or a
  canvas-side desaturation that skips the caption band.
- **M5 — the Nighthawk plate.** *(mostly free after M1–M2)* Five of the eight
  worst Directorate pairs contain it. Re-measure first; M2's air category may
  already fix it.

---

## Phase 5 — map art · P3 and P2 DONE (2026-09-05); P4 still free

**Status.** 3.2 landed, and with the fixed tool P3 and P2 were both executed.
Measured with `node apps/games/rts/tools/legibility.js`, pairs under the
friend-vs-foe floor, before -> after:

| window | zoom 1 | ZMIN |
|---|---|---|
| CELL 28 *(shipped)* | 1 naval -> 1 naval | 0 -> 0 |
| CELL 96 *(uncropped)* | **11 infantry** -> **0** | **8 infantry** -> **0** |
| union footprint | **1 air** -> **0** | **1 air** -> **0** |

`harrier | nighthawk` now clears every window at both zooms (union 40.2 -> 51.7
at zoom 1, 38.1 -> 49.3 at ZMIN). The infantry ladder is `INF_VALUE` +
`valuePass` — a per-channel gamma on the finished sprite with the inverse
pre-applied to the house colour, so the owner block is untouched; see
`docs/design-decisions.md`. `legibility.js` also grew the `--sheet` its own
header had promised since it was written.

**What is NOT closed.** The margins are thin — three infantry pairs sit 1-2%
over the floor at CELL 96 (`ivan|yuri` 12.35, `rifle|conscript` 12.45 at zoom 1;
`rifle|conscript` 8.98 at ZMIN against 8.91). Any future infantry change must
re-run the tool. The Nighthawk's bbox is 1 px narrower than it was (73x48 vs
74x48, aspect 1.538 vs 1.546) — an aspect already 2x off RA2's 3.05, and the two
obvious ways to buy it back both cost more than the pixel is worth (see the
design-decisions entry). And the `--sheet` is a roster line-up, not a battle:
"do not read a pass here as *vehicles are fine on the map*" still stands.

- **P3 — `harrier | nighthawk`. DONE.** The only pair that fails under
  **every** window: 41.6 vs 42.2 (union footprint, zoom 1), 39.5 vs 41.7 at ZMIN,
  and 30.3 in the Directorate cameo list. Two grey aircraft of similar span.
  RA2's own plates show a swept-delta jet at altitude against blue versus a squat
  twin-rotor helicopter over ground — a distinction we have flattened. **Both
  surfaces improve from the same work**, so it is the best value here after P1.
- **P2 — infantry silhouette and value. DONE (value; silhouette untouched).**
  Eight kinds within **11 luminance points and 0.08 saturation** of each other at
  14–22 px wide. The measured lever is **plate value, not more owner colour** —
  pushing owner-colour area was already tried and made map legibility worse. This
  is `unit-identity-reference.md` §3 R1–R6. **Do not start before 3.2:** grading
  infantry with a tool that crops the head off is how three art passes closed the
  metrics while the screen stayed a blue mass.
  **Closed on VALUE alone**, which is all the measurement asked for. **R5's
  silhouette work and the STATURE table were NOT touched** — deliberately: every
  infantry bounding box is byte-identical before and after, because the value
  pass changes no alpha, and the STATURE numbers are derived from RA2's own
  measured sizes. If a future pass wants outline mass as a second lever, it
  starts from an unspent budget.
- **P4 — `aegis | squid`: re-measure, do NOT redraw.** *(free)* The shipped
  tool's only failure, but both are drawn at 54×65 and 79×69 — far outside the
  28 px window — so 27.6 compares their middles. It passes under CELL 64 (27.2 vs
  18.3) and is not in the union-footprint worst eight. **This is a week of hull
  work the measurement does not justify.** Re-run after 3.2, then decide.
  **Re-measured 2026-09-05 and unchanged:** 27.6 against a CELL 28 floor that
  has risen to 34.1, and it is now the ONLY unit pair under any floor in any
  window at either zoom. It clears the union footprint comfortably (56.1 vs
  43.0 at zoom 1, 54.1 vs 39.6 at ZMIN) and does not appear in the CELL 96
  worst-16 at all. Verdict stands: do not redraw.

---

## Phase 5 — ElitePrimary · one change, five ordered steps

26 of 34 rules.ini rows map to units we field. Ships as **one** change because a
half-applied elite table is worse than none.

1. **Unify `Burst` first.** Three models coexist: a damage multiplier
   (`spec.dmg * burst`, :20969), damage **pre-doubled into the table**
   (`[DredLauncher]` — "100 was the launcher's own Damage=50", :1642-1644), and
   prose in a comment (`[HoverMissile]`, :1350). `[120mmE]` adds `Burst=2`, so
   elite Rhinos land straight on this. Unify **before**, not during.
2. **Settle the veterancy stacking rule by evidence.** Ours compounds
   (`Math.pow`, :1155-1176) → ×1.21 firepower / ×0.36 ROF at elite. The file's
   own comment argues `[General]`'s multipliers are per level and `VeteranCap=2`
   makes that the intent; the competing reading is each ability applies once.
   **This is a decision, not a known bug.** It must precede the swap, because the
   swap changes which numbers the multipliers land on.
3. **Add the 4 missing elite warheads** — `ApocAPE`, `RHINAPE`, `GRIZAPE`,
   `HowitzerWH` — with their real `Verses=` rows, or record the substitution.
4. **Swap the weapon at rank 2**, at the single `spec` site both fire paths read.
5. **Guard the one failure a player notices instantly.** `[120mm]` 90 →
   `[120mmE]` 85 means elite can come out *weaker*. Walk every mapped unit and
   assert **elite DPS >= veteran DPS**.

Out of scope, deliberately: `EliteSecondary`, elite animations and report sounds,
and rebalancing anything RA2 does not itself change.

---

## Phase 6 — cliff seams · the largest remaining terrain gap

`gap-audit-art.md` #26 records what pass 26 did **not** close: each cliff cell
bakes its own columns with independent juts, so **the two sides of a shared
vertex do not match** and a ridge reads as tiled panels. The audit is explicit
that the fix is **seam-matched construction** — carrying crest and jut across the
cell boundary — and **not more texture**. Everything else in pass 26 shipped
(16 masks × 3 variants, sloped crests, unclipped rim lumps, seven-boulder talus).

---

## Phase 7 — riders and blocked items

- **Two keyboard.ini nits**, to ride along with any keyboard pass rather than
  earn their own: `CenterView=12` (numpad 5; `Space` and `H` already cover the
  two cases a player reaches for) and `AllToCheer=67` (`INF_SEQ` already has the
  cheer animation and fires it on victory — only the binding and ordering are
  absent).
- **"The map follows my cursor."** Five release scenarios on `/rts.html` showed
  **zero** leak; the shell-iframe path is untested (no app-open hook found).
  **Blocked on two answers:** does the map track **1:1 or drift steadily**, and
  does **a single click stop it**? Either answer picks the mechanism. Guessing
  picks a rewrite.

---

## Sequence, and why

```
Phase 1  orders + veterancy      ── one release; small, real, unblocks nothing
Phase 2  hardened probe          ── investigation; gates any order fix after it
Phase 3  the two false premises  ── M1 name on plate (menu) + P1 fix the tool
                                    hours each; M1 is the best gain/cost on the board
Phase 4  rest of the menu        ── M2 backgrounds, M3 crop, M4 greyed, M5 Nighthawk
Phase 5  map art  [blocked 3.2]  ── P3 harrier|nighthawk, then P2 infantry (weeks)
Phase 6  ElitePrimary            ── one change, five steps
Phase 7  cliff seams
Phase 8  riders + blocked
```

Phase 3 is early because it is **both** the cheapest work on the board and the
gate. Its two halves are independent: **M1 is the single best gain-per-hour item
anywhere in this plan** (+51% / +83% on the worst pair, for hours of work,
because it deletes a false premise rather than adding art), and P1 unblocks the
whole map track. Menu and map are separate tracks — only Phase 5 waits.

**A correction this study forced.** An earlier reading of these numbers had the
artefact backwards: it credited the **shipped** tool with reporting 11
confusable infantry pairs and the union-footprint metric with reporting 0, and
concluded the old metric was over-reporting because it discarded size as a cue.
The opposite is true. The shipped `CELL = 28` tool reports **0** infantry
failures; it is **hiding** the problem by cropping off exactly the head, weapon
and feet that separate one trooper from another. Infantry map art (P2) is
therefore real, expensive, outstanding work — not something the measurement
argues away.
