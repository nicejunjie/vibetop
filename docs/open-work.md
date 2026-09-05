# Open work — the repo-wide index

Written 2026-09-04. **This file exists because there wasn't one.** The codebase
carries **zero** `TODO`/`FIXME` markers in source (verified across
`server/ shell/ apps/ tools/`), so the backlog lives entirely in docs — and
nothing pointed at all of it at once. A queue assembled from what surfaced in a
session is not a backlog; this is the sweep.

One line per effort, pointing at the doc that holds the detail. Keep it current:
an effort that finishes gets struck here, not silently in its own file.

---

## 1. Live regressions — shipped, currently masked

### 1.1 Window mode: side-by-side windows are broken on every viewport
`docs/plans/window-mode-desktop-gap.md` — **investigation complete, nothing
implemented.** Its verdict overturns what `docs/design-decisions.md` records:
these are not old geometry gaps, they are **two regressions shipped 2026-09-01**
(v1.19.201 + v1.19.202) that no e2e lane was run against afterwards.

- **Cause A** — the seam between tiled windows became `MARGIN/2 = 5px` while the
  resize grab rings still reach **10px (12px touch)** outside the window. The
  rings overlap the whole seam and 4px into the neighbour; CSS stacking gives
  every contested pixel to the focused window. The geometry in `winmgr.js` is
  **correct** — the bug is the CSS hit-testing layer in `shell/desktop.html`.
- **Cause B** — the layout palette moved from hover to right-click in v1.19.201;
  the tests still `.hover()`.

Measured: iPad Pro landscape **5 failed**, desktop-chromium **2 failed**,
desktop-webkit *"green only because of the skips"*. **This outranks fidelity
work** — it is a live product defect hidden behind skip comments that claim the
tablet lanes are still green.

Also to fix when it lands: the entry in `docs/design-decisions.md` that records
the wrong premise.

---

## 2. Planned, verdict given, not started

- **`docs/plans/desktop-html-split.md`** — *"Do it — but only three extractions,
  not a wholesale split."*
- **`docs/plans/filesx-html-split.md`** — *"Do a reduced subset now. Do not do
  the big split."* ~180 lines of pure logic into one plain-global script.

Both are scoped-down verdicts, deliberately. Do not widen them on execution.

---

## 3. RTS

The full queue is `apps/games/rts/docs/open-defects-plan.md` (two confirmed
defects, one unresolved, three unestablished, ElitePrimary parked, art pending).
Two items that queue does **not** carry, found in the gap audits:

- **Cliff seams** — `gap-audit-art.md` #26 records what was explicitly NOT
  closed: *"a cliff run still reads as one panel per tile"*, because each cell
  bakes its columns with independent juts so the two sides of a shared vertex do
  not match. Needs seam-matched construction, **not more texture**.
- **Two keyboard nits** — `CenterView` (numpad 5) and `AllToCheer=67`. Both
  recorded as nits; `INF_SEQ` already has the cheer animation, only the key and
  the ordering are absent.

---

## 4. Accepted risks — open by decision, not defects

- **VT-14** (`docs/code-audit-2026-09.md`) — E2E/CI tool versions are not locked.
  Recorded as an accepted risk. Revisit only if CI starts changing without a
  repository change.

---

## 5. Cancelled — do not pick this up

- **`docs/plans/lightweight-remote-desktop-usability.md`** — the shared-clipboard
  and pinned-note feature. The user cancelled it outright on 2026-09-04
  (*"this is a mess. ignore it, we are not going to do it."*) after the design
  kept surfacing new problems. The document is a 624-line plan that reads as
  live work; it is **not**. Delete it or leave it only with this note attached.

---

## Standing hazard: this checkout is shared

A peer session edits the same working tree. On 2026-09-04, `terminals.html` and
`ttyd-run.sh` went from clean to modified between two `git status` calls minutes
apart. Therefore: **release from a worktree**, run `git diff --cached
--name-only` immediately before every commit, never assume a fast-forward, and
never bump `VERSION`/`sw.js` while prod is dirty.
