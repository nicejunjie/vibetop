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

## Phase 3 — settle the map metric BEFORE any more map art · blocking decision

**Why this blocks.** The art study questioned `legibility.js` itself and built a
second metric that keeps relative size instead of normalising every unit into a
28 px box. The two disagree sharply:

| metric | infantry confusable | worst pair |
|---|---|---|
| normalise-to-28px (current) | **11** | `ivan\|spy` 16.1 |
| union-footprint | **0** | `harrier\|nighthawk` 41.6 |

`aegis|squid` — the pair carried for weeks as the last outstanding one — does not
even appear in the union-footprint worst list. **Size difference is itself a
cue, and the current metric throws it away.** If that holds, some past map
ratcheting optimised an artefact, and any further map art would too.

**Work.** Decide which metric describes what a player sees; fix or replace
`legibility.js`; **regenerate `art-baseline.json`** against the chosen metric;
rewrite this plan's map items against the new numbers. One `CELL=96` run OOM'd
node — finish that leg or record why it cannot be run.

**Exit.** One metric, written down with its reason, and a baseline regenerated
under it. Only then does map art resume.

---

## Phase 4 — cameo legibility · the largest player-visible win

**Evidence, measured against a real bar** (74 RA2 cameos, 2701 pairs — min 58.5,
5th pct 81.7, median 100.5):

| | RA2 | Directorate | Collective |
|---|---|---|---|
| min pair | 58.5 | **27.2** | 23.1 |
| 5th pct | 81.7 | 36.7 | 32.5 |

**All 780 of our pairs sit under RA2's 5th percentile.** Greyed-out rows collapse
to **12.2**. Two numbers name the cause, and colour is **not** it — ours are
*more* saturated (0.29 vs 0.21) and *less* legible:

- **`subjectFill`: RA2 75.7%, ours 31%** — our subjects float in an empty plate.
- **cross-plate brightness spread: RA2 22.6, ours 10.2** — every plate is the
  same overall value.

**Prototyped and measured, so the order is by measured gain:**

| variant | min | 5th pct | median |
|---|---|---|---|
| base | 27.2 | 36.7 | 51.2 |
| + name banner | 41.1 | 52.8 | 63.7 |
| + per-item background | 44.3 | 58.5 | 80.6 |
| **+ both** | **53.5** | **69.2** | **88.1** |

Plus portrait-cropping infantry ×2.2, which lifts that tab's 5th pct 32 → 58.4.

**Ship in that order, measuring after each** — banner, then per-item background,
then the infantry crop — so each step's gain is attributable. Target: clear
RA2's **min 58.5**; stretch: its 5th pct 81.7. Re-measure the **greyed** state
every time; it is the worst case and the one the tool must gate on.

**Cross-surface note:** `Nighthawk` is the worst offender on **both** surfaces —
5 of the 8 worst cameo pairs, and the worst map pair under the new metric. Fix it
once, in the silhouette, and both improve.

*(Supersede this phase with the study's ranked plan when it lands; the numbers
above are its own in-flight measurements.)*

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
Phase 1  orders + veterancy      ── one release, small, unblocks nothing but is cheap and real
Phase 2  hardened probe          ── investigation; gates any order fix that follows
Phase 3  settle the map metric   ── BLOCKS all map art; a wrong metric mis-aims Phase 4/6
Phase 4  cameos                  ── largest measured player-visible win
Phase 5  ElitePrimary            ── one change, five steps, biggest single body of work
Phase 6  cliff seams             ── terrain, standalone
Phase 7  riders + blocked
```

Phase 3 is early **only** because it is a gate. Phase 4 carries the biggest
measured win and would be first otherwise — its map-side sibling would be aimed
by the wrong ruler if the metric were still unsettled.
