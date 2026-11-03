# Code review, 2026-11-03

Reviewed revision: `f7b6249` (v1.38.154), plus the uncommitted phone typing fix
in the `work/audit-phone-flash` worktree. No production changes were made.

## Scope and evidence

Repository-wide source/test inventory and regression run, with detailed review of
terminal input/geometry/transport, desktop and mobile keyboard behavior, Notes
sync/deletion, Files operations and viewers, manager handlers and persistence,
Browser Lite authentication/release boundaries, shared helpers, and lifecycle/CI
scripts. This is a risk-based review, not a claim that every line or every real
device interaction has been verified. Games and utility surfaces received the
existing test/syntax coverage and a source survey, not full interactive playthroughs.

Baseline: 1,384 manager tests, 7 Claude proxy tests, and 810 JavaScript tests passed.
The green baseline does not cover the failures below. Reproductions used fake
DOM handlers or temporary files; no personal notes, trash, or terminal sessions
were modified. Physical-phone confirmation remains outstanding.

## 1. High: typing repeatedly forces terminal redraws

`apps/everyday/terminal/terminal-kbd.js`, `claimForInteraction` / `claimSize`.

The capture-phase input/keydown handlers reclaim shared PTY geometry at most once
per second. Each reclaim sends two resize frames (columns minus one, then the
original columns), deliberately provoking a redraw. The throttle measures time
since the previous claim, not time since the previous keystroke. Continuous typing
therefore keeps nudging forever. Running the real handlers for 100 input events
at 100 ms spacing produced **20 resize frames / 10 nudge pairs in 10 seconds**.
The existing desktop test actually expects another pair after 1,001 ms.

This is a strong source-level explanation for the reported phone flash in Codex
and Claude Code, not a physical-device visual reproduction. It affects both
programs because the trigger lives in the shared terminal layer. HTTP batching
from v1.38.152 addresses separation of the two frames, not their repetition.

**Prepared fix:** touch input/keydown no longer reclaim geometry. A terminal tap
and the explicit two-finger gesture still reclaim it; typing retains the existing
return-to-live-input behavior. A new handler regression verifies that ten seconds
of typing produce no additional nudges and that typing from scrollback returns
to the live line. Desktop automatic typing claims remain a follow-up concern.

## 2. High: stale Notes tab lists can delete another device's new notes

`server/terminal-manager.py`, `_handle_notes_tabs`; `notes.html`, `persistTabs`.

The endpoint treats each incoming tab list as authoritative and deletes all note
files absent from it. There is a lock, but no revision/conflict check. If device B
creates a note while A still holds the older list, A can rename/add/close a tab
and send its stale list, deleting B's new note without an intentional close.

**Reproduced:** created `old.md` and `new.md` in a temporary notes directory,
called the actual handler with a list containing only `old`, and observed HTTP
200 with `new.md` removed. Files tabs already have a revision/409 mechanism that
Notes could follow. Prefer explicit deletion plus revision-aware updates.

## 3. Medium: an HTTP error can bypass Notes delete confirmation

`apps/everyday/notes/notes.html`, `closeNote`.

When closing an unloaded note, a non-2xx fetch resolves to null, then calls
`decide('')`, which closes without confirmation. Only a rejected fetch enters
the catch that asks for confirmation. Thus an HTTP 500 is treated as an empty
note even though its content is unknown. Confirm or cancel deletion on every
failed read. Verified by source control flow; not browser-reproduced in this pass.

## 4. Medium: the image watcher cannot recover an initial image-load failure

`apps/everyday/imageview/imageview.html`, `render` error handler / `watchImage`.

Initial failure removes the image and sets `img = null`. Later successful refresh
loads are discarded because `img !== w.img`; no replacement element is appended.
A briefly incomplete graph can leave the viewer permanently on its error message
until reopening, despite the watcher continuing to fetch.

**Reproduced:** ran the real viewer script in its test DOM, invoked initial
`onerror`, then a successful refresh's `onload`. There was still no IMG element.
Recovery should recreate the image and clear the error without resetting view
state unnecessarily. This is a gap in the recent automatic-refresh implementation.

## 5. Medium: restoring too many trash items silently reports partial success

`apps/everyday/files/fileagent.py`, `op_untrash`.

It loops over `names[:BULK_MAX]` without rejecting or reporting omitted entries,
then returns `ok: true` if the processed prefix succeeded. Other bulk operations
explicitly reject oversized requests. Actual cap: 2,000.

**Reproduced:** temporarily reduced the cap to two, restored three fixture items,
and observed `ok: true`, two reported results, and one item still in trash.
Reject above the cap or process explicit batches and report all requested items.

## 6. Improvement: CI does not explicitly install image-test dependencies

`.github/workflows/tests.yml` installs pytest and cryptography, but not Pillow.
`server/tests/test_api_image.py` uses `pytest.importorskip('PIL')`, so a clean
runner without Pillow skips the entire image endpoint suite while remaining
green. Whether a particular hosted runner happens to include Pillow is not
assumed here. Install it explicitly and make required-suite skips visible.

## Recommended order

Ship and verify the phone typing fix first. Address Notes conflict/deletion safety
next, then image recovery and trash restore completeness. Add the explicit CI
dependency while repairing image recovery. The prior banner findings (resize
occlusion, missing auto-hide on some tips, keyboard accessibility) remain separate
follow-up work, not fixed by this review.

Final validation after the phone change: **1,384 manager + 7 proxy + 811 JavaScript
checks passed (2,202 total)**. The phone-specific handler test also asserts return
to the live input line from scrollback. This validates the causal handler change,
not physical Safari/Android rendering or every possible source of flashing.


## Follow-up: Notes safety (v1.38.156)

Findings 2 and 3 are addressed by revision-checked tab updates, client conflict
rebasing and serialized writes, explicit removed-ID deletion, and confirmation
after failed reads. Requests from pre-upgrade clients without revisions receive
409 without mutating notes. Findings 4–6 remain open.
