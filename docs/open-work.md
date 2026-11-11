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

### 1.1 ~~Window mode: side-by-side windows are broken on every viewport~~ — fixed
`docs/plans/window-mode-desktop-gap.md` describes two regressions from
2026-09-01. Both are fixed: the grab rings now own their half of the seam
(4px outside on east/south, 3px on west/north, pinned by
`shell/winrz-css.test.js`), and the e2e tests open the palette by right-click
(`2bff47b`, `6d82297`).

Re-measured 2026-11-10 on the v1.38.168 build (desktop Chromium 1280x720 and
iPad Pro 11 landscape WebKit, static copy of the shell): the 5px seam splits
3/2 with no contested or dead pixel, dragging it widens the left window and
leaves the right one alone, each corner hit-tests to its own window, and the
palette opens on right-click. Nothing is currently listed in this section.

---

## 2. Planned, verdict given, not started

- **`docs/plans/desktop-html-split.md`** — *"Do it — but only three extractions,
  not a wholesale split."*
- **`docs/plans/filesx-html-split.md`** — *"Do a reduced subset now. Do not do
  the big split."* ~180 lines of pure logic into one plain-global script.

Both are scoped-down verdicts, deliberately. Do not widen them on execution.

---

## 3. RTS

Moved out. The game (Iron Frontier) and its whole backlog now live in the
separate `rts-war` project (`~/vibe-coding/rts-war`), linked into vibetop as an
optional sibling checkout (see `docs/desktop.md`).

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
apart. Start each task with `tools/new-worktree.sh NAME`; commit only inside that
worktree, then run `tools/publish-worktree.sh` there. The publish command rejects
a dirty tree or a remote that moved since the task branched, so a second session
cannot silently publish the same release number. If the remote moved, rebase and
bump `VERSION`/`sw.js` again before publishing. Do not stage the shared checkout.

After a successful push, `publish-worktree.sh` fast-forwards the home checkout's
`main` to what it just published. Nothing else ever moves it, and it once sat 109
commits behind (2026-10-21) and again 7 behind (2026-11-06), with a release's
source edits still showing as uncommitted changes in home. Files that exactly
match the release, including new files never added, are discarded so the fast-forward can go through, since they
are copies of it. Anything else is kept: an edit that differs from the release, a
branch other than `main`, or local commits all leave home as it is and print a
note. The push has already happened by then, so this step never fails the publish.
