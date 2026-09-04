# Window mode: the four "desktop-viewport gap" e2e tests — investigation + fix plan

*Status: investigation complete, nothing implemented. Written 2026-09-04 against `main`
@ `8b94407` (clean tree), measured on the live host at `http://127.0.0.1` (prod build
v1.19.270, sw v533). Every number below was taken from a real page; the scratch
scripts that produced them are described in the appendix and were never committed.*

---

## 0. The verdict, up front

**The premise recorded in the spec and in `docs/design-decisions.md` is wrong.**
These are not "window-mode geometry gaps at desktop widths that predate the cursor
work". They are two ordinary regressions shipped on **2026-09-01** (v1.19.201 +
v1.19.202) that no e2e lane was run against afterwards, and they fail on **every**
viewport that gets side-by-side windows — including the tablet lanes the skip
comment claims are still green:

| Lane (real config, today, `--retries=0`) | Result on `tests/e2e/tests/window-mode.spec.js` |
|---|---|
| `ipad-pro-11-landscape` (1194x834, touch) | **5 failed**, 26 passed, 5 skipped — the four "desktop gap" tests **plus** `every edge and corner shows its resize cursor` |
| `desktop-chromium` (1280x720) | **2 failed**, 34 skipped — the two `palette drag, for real` tests (they hover too; `DESKTOP_WM_GAP` does not cover them) |
| `desktop-webkit` (1280x720) | 28 passed, 8 skipped — green only because of the skips |
| Desktop Chrome / Firefox / Safari engines run under a tablet lane name (lab alias config, so the skips don't apply) | Chrome: the four + 1 order-dependent flake; Firefox: exactly the four; Safari: exactly the four |

Two root causes, not four:

- **Cause A — the tiled seam is owned by whoever is on top.** v1.19.202 made the seam
  between tiled windows `MARGIN/2 = 5px` (it was a 16px gutter when the grab rings
  were designed), but the rings still reach **10px (12px touch) outside** the window.
  The two rings therefore overlap across the *whole* seam and 4px into the lower
  window's body, and CSS stacking hands every contested pixel to the higher-z
  (focused) window. Tests 1 and 2 (lines 236, 413), and on touch lanes also the
  cursor test at line 494. **Pure geometry (`winmgr.js`) is correct; the bug is in
  `shell/desktop.html`'s CSS hit-testing layer.**
- **Cause B — the palette trigger moved from hover to right-click** in v1.19.201
  (`7604583`, "Layout palette moved from hover-to-open to RIGHT-CLICK"); the tests
  still `.hover()`. Tests 3 and 4 (lines 573, 636) **and** the two `palette drag,
  for real` tests (863, 925). `windowModeCapable()` is **not** involved (measured
  `true`, `body.wm` set, `layoutsFor` non-empty at 1280x720).

The user-visible bug is Cause A, on every device: **drag the divider between two
tiled windows and the wrong window resizes** (the focused one shrinks; the one you
meant to widen does nothing), and the lower window's own corner shows the
neighbour's — opposite — diagonal cursor.

---

## 1. Evidence

### 1.1 Cause A — measured on the unfixed build

Setup identical to the spec's `beforeEach`: window mode on, open Notes then Upload
(auto-tiled side by side by `autoTileIfUntouched`, Upload focused/on top).

| | Chromium 1280x720 | WebKit 1280x720 | WebKit iPad Pro 11 landscape (1194x834, `is-touch`) |
|---|---|---|---|
| `windowModeCapable()` → `body.wm` / `wm-capable` | true / true | true / true | true / true |
| `#frames` | 1280 x 608.8 | same | 1194 x 722.8 |
| `VibeWin.MARGIN` | 10 | 10 | 10 |
| Notes window (left, z) | x 10..638, **z 12**, unfocused | same | x 10..595, z 12 |
| Upload window (right, z) | x 643..1271, **z 14**, focused | same | x 600..1185, z 14 |
| **Seam width** (`upload.left - notes.right`) | **5px** (638..642) | 5px | **5px** (595..599) |
| Notes `.win-rz-e` box | x 629..647 (10 outside) | same | 582..606 (12 outside) |
| Upload `.win-rz-w` box | x **634**..652 | same | **589**..613 |
| `elementFromPoint` across x=629..651 at mid-height | 629–633 → `win-rz-e` (notes); **634–651 → `win-rz-w` (upload)**; no dead pixel, all `col-resize` | identical | 583–588 notes; **589–611 upload** |
| Drag the seam at `gapL+2` by +50px (the spec's gesture) | pointerdown target `win-rz-w in win-upload`; **notes 628→628**, upload.left 643→692, upload 628→578 | identical | notes 585→585, upload.left 600→649 |
| Notes `.win-rz-se` rect / centre | 26x26 at (621,639) → centre **(634, 652)** | same | 30x30 → centre (591, 766) |
| `elementFromPoint` at that centre | **`win-rz-sw in win-upload`** | same | **`win-rz-sw in win-upload`** |
| A real SE-corner drag (-120,-90) from that centre | target `win-rz-se in win-notes`, 628x589 → 508x499 (works) | works | works |
| `.vibe-coach` | present, `pointer-events: none`, at top:8 (not over the grips) | same | same |

Reading the numbers:

- Upload's west ring starts at `upload.left + 1(border) − 10 = 634`, i.e. **4px inside
  Notes' border box** (Notes' right edge is 638). Every contested pixel goes to Upload
  because `#win-upload` (z 14) is a higher stacking context than `#win-notes` (z 12);
  the rings' own `z-index: 3/4` only order siblings *within* a window.
- Notes' east ring is therefore reachable only at x 629–633: 5px, all inside its own
  body, none of it on the border and none in the seam. From the user's side: "I can't
  widen the left window from its right edge".
- Notes' SE-grip centre is at `right − 4 = 634`, which is *exactly* where Upload's SW
  corner ring begins (`left + 1 − 10`). `elementFromPoint` resolves the tie to Upload;
  a real mouse press at the same coordinate happened to reach Notes. That coincidence
  is why the spec's `onGrip` probe fails while the drag right after it succeeds. On
  touch (30px corners, 12px reach) the neighbour's corner starts at `right − 6`, so
  there is no tie — it fails outright.
- The extra tablet failure (`every edge and corner…`, line 494) probes Notes' NE
  corner at `(right − 6, top + 6)`. On touch Upload's NW ring starts at
  `left + 1 − 12 = right − 6` → `nwse-resize` (Upload's NW) where the test wants
  Notes' NE `nesw-resize`. Received exactly that: `Expected "nesw-resize", Received
  "nwse-resize"`. On desktop the ring starts at `right − 4`, so the probe misses it by
  2px and the test passes — by luck, not design.
- The hypothesis in the DD entry ("the shared gutter appears to hand its LEFT half to
  the RIGHT window's `.win-rz-w`") is **confirmed and understated**: it is the whole
  seam, plus 4px of the left window, on every viewport, decided by z-order.

**Why this is not in `winmgr.js`.** `gapZones(zones, box, MARGIN, MARGIN/2)` produces
exactly the 5px seam it is documented to produce (`winmgr.test.js` lines 145–163
already pin it). The CSS ring offsets in `desktop.html` (lines 746–753 and 803–810)
are hand-coupled to a gutter width that no longer exists. There is no pure-geometry
function to make fail; the guard has to couple the CSS to `VibeWin.MARGIN` (see
Commit 1).

**History that explains it** (`git log -S`):
`c7e98a9` v1.19.35 (08-26) — rings reach 10px outside for a 16px gutter (the
"one-pixel dead seam" note). `7649f3d` v1.19.199 (09-01) — `MARGIN` introduced.
`7604583` v1.19.201 (09-01) — edge gap 20→12, **hover→right-click**. `3398f9c`
v1.19.202 (09-01) — **seam = MARGIN/2**. Later tuning 12→10 (seam 5). The tablet
lanes were last fixed and run on `cf39146` (08-28). `6f32992` v1.19.269 (09-03)
added `desktop-webkit`, saw the red, and recorded it as a desktop gap.

### 1.2 Cause A — the candidate fix, measured by CSS injection (product untouched)

The same page with a `<style>` appended that only changes the rings' *outside* reach
(inside reach kept: 8px edges / 16px corners desktop, 12 / 18 touch):

| Injected outside reach | Seam ownership at x=638..642 (Chromium) | Drag at `gapL+2` +50 | Notes SE centre hit-tests to |
|---|---|---|---|
| 10 / 12 (**current**) | all five → Upload | Notes +0, Upload shrinks | Upload's SW |
| 4 symmetric | 638, 639 → Notes; **640 contested → Upload** (z); 641, 642 → Upload | at x=640: Notes **+0** | Notes' SE ✓ |
| 3 symmetric | 638, 639 → Notes; **640 → bare `#frames`, cursor `auto`**; 641, 642 → Upload | at x=640: **nothing** (pointerdown target `#frames`) | Notes' SE ✓ |
| **4 on e/s, 3 on w/n** | **638, 639, 640 → Notes; 641, 642 → Upload** — no overlap, no dead pixel | at x=640: **Notes 628→678 (+50), Upload untouched** | Notes' SE ✓ |

The last row also measured identically on WebKit iPad landscape (seam 595..599: three
to Notes, two to Upload; Notes 585→635, Upload unchanged; SE grip → itself). The
seam is 5px (odd), so a split without overlap or gap is forced to be 3/2; giving the
extra pixel to the *leading* edges (east/south — the window that comes first in
reading order) is the arbitrary half of the rule, and it is what the existing spec
gesture (`gapL + 2`) already assumes.

The rule, with `b = 1px` window border and `s = MARGIN/2` seam:

```
(r_e − b) + (r_w − b) = s            # no dead pixel, no contested pixel
r_e − b = ceil(s/2), r_w − b = floor(s/2)
s = 5  →  r_e = r_s = 4,  r_w = r_n = 3
```

(For an even seam, e.g. MARGIN 12 → s 6, both become 4; MARGIN 20 → s 10, both 6.
The formula is what the static test in Commit 1 asserts.)

### 1.3 Cause B — measured

| | Chromium 1280x720 | WebKit 1280x720 | WebKit iPad landscape |
|---|---|---|---|
| `#wm-btn.hover()` then wait 1.2s → `#win-layouts.className` | `""` | `""` | `""` |
| `#wm-btn.click({button:'right'})` → class / `.wl-name` texts | `open` / Halves, 2 : 1, Stacked | same | same |
| `VibeWin.layoutsFor(frameBox, 2)` / `(…, 3)` | 3 options / Thirds, 1 + 2 | same | same |

The product code (`shell/desktop.html` 3068–3097): `click` toggles, `contextmenu`
calls `showLayouts(wb)` (turning window mode on first if needed), and a
non-mouse `pointerdown` arms a 500ms long-press. There is **no** hover path any more;
`layoutHoverT` (line 1402) is declared and only ever cleared. So `showLayouts` never
"declines" at 1280x720 — it is never called. The failure is identical on every engine
and viewport, exactly as the spec output shows (`10 × locator resolved to <div
id="win-layouts"></div>`, `unexpected value ""`).

`docs/desktop.md` line 27 still documents the old gesture ("hover the taskbar 🗔
(mouse, 420ms hover-intent)") and the old dirty-suspends-auto-hide rule that
`hideLayoutsSoon` (desktop.html 1449–1459) no longer implements.

### 1.4 What was ruled out

- **`windowModeCapable()`** (desktop.html 1330–1348): at 1280x720 the first arm
  (`min ≥ 600 && max ≥ 900`) is already true; `body.wm` and `wm-capable` are both set
  on all three engines. Not a factor.
- **The coach banner** (test 1's title): present but `pointer-events: none` and at
  `top: 8`, nowhere near a grip. `blockedByCoach` is false; the test dies on `onGrip`.
- **Engine differences**: none. Chromium, Firefox and WebKit produce the same
  `elementFromPoint` results and the same 0px drag.
- **Viewport**: the seam is `MARGIN/2` regardless of frame size; the failure is the
  same at 1194x834 (touch) and 1280x720 (mouse).

### 1.5 One unrelated finding (not in scope, recorded so it isn't lost)

Running the whole spec on the Desktop **Chrome** alias also failed `dragging a window
marks it user-arranged…` (line 714: `after.top − placed.top` = **10**, i.e. one
MARGIN). It passed 2/2 when run in isolation and 2/2 immediately after its
predecessor, and a scripted replay (drag Notes +90/+110, open Monitor) showed
`frames.top`, `#sys-warn` height and the window's stored/applied `top` all unchanged
on both Chromium and WebKit. So it is order/state-dependent (server-side open-app
state leaks between tests in one lane run), Chromium-only, 1 of 1 full runs. Next
decisive experiment: `--project=desktop-chromium --trace on` for the full file once
Commit 3 enables that lane, and diff `vibetop:wins.notes.top` vs `style.top` at the
failing assertion. Not a blocker for anything below, but it must be understood
before that lane is declared green.

---

## 2. Fix plan — three commits, in this order

### Commit 1 — product: the grab rings own their half of the seam (Cause A)

**Files / lines**

1. `shell/desktop.html`, the ring block at **746–753** (desktop) and **803–810**
   (touch). Change only the *outside* offsets and the totals; inside reach and the
   "INVARIANT" (corner inside reach 16 < titlebar padding-right 18; touch 18 < 28)
   are untouched:

   ```
   /* desktop: leading edges (e, s) reach 4 outside, trailing (w, n) reach 3 */
   .win-rz-n  { top: -3px;    left: -3px; right: -4px;  height: 11px; }
   .win-rz-s  { bottom: -4px; left: -3px; right: -4px;  height: 12px; }
   .win-rz-e  { right: -4px;  top: -3px;  bottom: -4px; width: 12px; }
   .win-rz-w  { left: -3px;   top: -3px;  bottom: -4px; width: 11px; }
   .win-rz-ne { top: -3px;    right: -4px; width: 20px; height: 19px; }
   .win-rz-nw { top: -3px;    left: -3px;  width: 19px; height: 19px; }
   .win-rz-se { bottom: -4px; right: -4px; width: 20px; height: 20px; }
   .win-rz-sw { bottom: -4px; left: -3px;  width: 19px; height: 20px; }
   /* touch: same outside reach, inside 12 (edges) / 18 (corners) */
   body.is-touch .win-rz-n  { top: -3px; height: 15px; }   … etc. (width/height = inside + reach)
   ```

   Rewrite the comment block at 725–745: the "16px gutter / 10 and not 8" paragraph
   is now wrong and is what misled the last investigation. State the rule from §1.2
   and that the seam is `VibeWin.MARGIN/2`.
2. `shell/diagnostics/rzdbg.html` lines **48–55** — the replica handles ("same
   offsets/sizes/cursors as .win-rz in the shell", line 150). Mirror the new numbers.
3. **New hermetic guard** `shell/winrz-css.test.js` (picked up automatically by
   `run-tests.sh` lines 59–65, which `find`s every `*.test.js` under `shell/`):
   parse `shell/desktop.html`'s `.win-rz-e/w/n/s` rules (desktop and
   `body.is-touch` variants) and `shell/diagnostics/rzdbg.html`'s `.rz-*`, read
   `require('./winmgr.js').MARGIN`, and assert
   `(r_e − 1) + (r_w − 1) === MARGIN/2`, same for s/n, `r_e − 1 === ceil(seam/2)`,
   and that each corner's two offsets equal the edges it joins. It couples the CSS
   to the one constant it silently depends on; it is the failing test this bug never
   had. **Run it against HEAD first: it must fail with `(10−1)+(10−1) = 18 ≠ 5`.**
4. `tests/e2e/tests/window-mode.spec.js`:
   - delete the `test.skip(…, DESKTOP_WM_GAP)` at **237** and **414**;
   - the gutter test (413–452): keep the dead-pixel scan (429–440) as is; keep the
     `gapL + 2` drag (444–451) — with a 5px seam that is the *last* pixel the left
     window owns, which is the point; **add** a second drag at `gapR − 1` asserting
     `upload.left` grows by ≈50 and `notes.width` is unchanged, so the test pins
     *both* halves and can no longer be satisfied by one window owning everything;
   - test 1 (236–266): unchanged apart from the skip; `onGrip` becomes true because
     the neighbour's SW ring now starts at `right + 3`, outside Notes' box.
5. `VERSION` bump and `shell/sw.js` `VERSION` bump (`v533 → v534`) — the cached shell
   changed and clients must reload (CLAUDE.md release rule).

**Acceptance (all orthogonal to the CSS the fix adds):**

- `node --test shell/winrz-css.test.js` fails on HEAD, passes after.
- Live (fast lanes, §3): `ipad-pro-11-landscape` — tests at 236, 413 and 494 go
  red→green; the whole file has **0 failures**. Lab aliases for Chrome/Firefox/Safari
  at 1280x720: 236 and 413 red→green.
- `elementFromPoint` scan across the seam at mid-height returns exactly
  `[e,e,e,w,w]` by owning window; at the Notes SE-grip centre returns
  `.win-rz-se` of Notes; at the NE probe `(right−6, top+6)` returns `nesw-resize`
  on touch.
- The eight `resizes from the X edge/corner` tests (353) and `the resize cursor
  holds for the whole drag` (459) stay green — they are the guard that the
  *inside* reach still works.
- The touch trade-off is real and must be looked at on a device (memory: "Mobile UI
  needs WebKit or a device"): edge rings shrink from 24px to 15/16px and corners
  from 30 to 21/22px at a *frame* edge (at a seam the two rings still add up to a
  ~35px band). If it feels thin, widen the touch **inside** reach of `e`/`w` only
  (bounded by the 28px `padding-right`; `n`/`s` stay at 12 because of the 40px title
  bar — the vertical invariant at 786–802). Do not widen outside reach again.

**Rejected alternatives (write these into the DD entry):**

- *Symmetric 4px* — the contested middle pixel still goes to z-order; the spec's
  `gapL+2` drag still resizes 0px (measured).
- *Symmetric 3px* — a one-pixel dead seam at x=640 with cursor `auto` (measured); the
  exact v1.19.35 bug coming back.
- *Widen the seam to ≥ 19px* so 10px rings can't overlap — the user tuned the gap
  down three times (20→12→10, "8 hid under the shadow"). No.
- *JS arbitration at pointerdown* (`elementsFromPoint`, pick the nearest edge) — the
  cursor is CSS hit-testing, so the lower window's corner would still show the
  neighbour's opposite diagonal, and `elementFromPoint`-based tests would still fail.
  Fixes the drag, not the bug.
- *Linked seam drag* (moving the divider resizes both windows, tiling-WM style) — a
  genuine feature idea, and it would make "which window owns the seam" moot; but it
  changes semantics (an edge grab then never overlaps a neighbour) and is a user
  decision. Listed as an optional follow-up in §5, not a fix.

### Commit 2 — tests + docs: the palette opens on right-click (Cause B)

No product change. The product's gesture is a recorded user decision (v1.19.201:
"Hover popped the palette just from passing over the icon; right-click is the familiar
context-menu gesture") and the coach tip (`vibetop:tip:wm:v8`) and button title
already teach it. Revisiting that is out of scope here.

**Files / lines**

1. `tests/e2e/tests/window-mode.spec.js`:
   - replace `await page.locator('#wm-btn').hover()` with
     `await page.locator('#wm-btn').click({ button: 'right' })` at **588, 652, 696,
     849** (`click({button:'right'})` fires `contextmenu` in Chromium, Firefox and
     WebKit and — measured — opens the palette on the iPad touch context too);
   - rename **573** to `right-clicking the taskbar 🗔 offers exactly the layouts…`
     and fix the comment at 568–572; retitle 636 similarly if it mentions hover;
   - delete the `DESKTOP_WM_GAP` skips at **574** and **637**;
   - add to `▢ is plain maximize — it must not open the palette` (705) a sibling
     assertion: hover `#wm-btn` for 800ms → `#win-layouts` has no `open` (locks the
     user decision; note this one is green on HEAD by construction — it guards
     against hover coming *back*, which is the only direction it can regress);
   - add a **tablet-lane** test for the untested product path: dispatch a synthetic
     `pointerdown` with `pointerType: 'touch'` on `#wm-btn`, wait 600ms, expect
     `open`; then `pointerup` + `click` and assert `body.wm` is *still* on (the
     `held` guard at 3072–3076). This is new coverage, not a regression test — say
     so in its comment.
   - the two `palette drag, for real` tests (863, 925) start passing on the real
     `desktop-chromium` lane, which is currently red.
2. `docs/desktop.md` line **27**: "hover the taskbar 🗔 (mouse, 420ms hover-intent)"
   → right-click (mouse) / long-press (touch); drop "Once anything is selected or
   staged the hover auto-hide is suspended" (mouse-leave now always closes, per
   `hideLayoutsSoon`'s comment).

**Acceptance:**

- Before editing, run 573/636 on `ipad-pro-11-landscape` and 863/925 on
  `desktop-chromium`: red with `Received string: ""` (already recorded above).
- After: green on `ipad-pro-11-landscape`, `desktop-chromium`, `desktop-webkit`.
- Mutation check (local, uncommitted, revert after): comment out `showLayouts(wb)`
  inside the `contextmenu` handler (desktop.html 3086) and re-run 573 — it must go
  red. That proves the corrected test still watches the product, not itself.
- `.wl-name` texts equal `layoutsFor(frameBox, 3)` (Thirds, 1 + 2 at 1280x720 and
  1194x834) — an observable the test already has and the fix does not touch.

### Commit 3 — lanes, the skip constant, and the record

1. `tests/e2e/tests/window-mode.spec.js`:
   - delete lines **19–28** (`DESKTOP_WM_GAP` + its comment) — nothing references it
     after Commits 1–2;
   - widen the `with windows open` gate at **95–96** from
     `TABLET || 'desktop-webkit'` to *every* lane except phones
     (`!TABLET.includes(name) && !name.startsWith('desktop')`) — measured on the
     aliases: Firefox passes all 27 non-Cause-A/B tests, Chrome passes 26 with the
     §1.5 flake, Safari already runs; also fix the header comment at 3–8 ("Runs on
     the TABLET lanes") and the `TABLET` note;
   - keep `palette drag, for real` chromium-only (its reason is engine-specific and
     still valid).
2. `docs/design-decisions.md` **4079–4101**, "Window mode at a desktop viewport (the
   desktop-webkit lane's real find)": **rewrite in place, do not append a second
   entry.** Suggested heading: *"The tiled seam belonged to whoever was on top (and the
   'desktop-viewport gap' that wasn't)"*. Symptom → the five red tests and the
   desktop-chromium palette-drag pair; Cause → §1 of this plan in three paragraphs
   (seam `MARGIN/2` vs 10/12px rings decided by z-order; hover→right-click with
   stale tests; both shipped 09-01 with no lane run, then misread on 09-03 as a
   desktop gap); Fix → the 4/3 rule and the CSS↔MARGIN test; Rejected → the five
   bullets above. Then `python3 tools/gen-dd-toc.py` — the heading change
   re-anchors the Contents entry at line 112, and
   `server/tests/test_static.py::test_design_decisions_toc_is_current` (541) fails
   on a stale index.
3. `docs/testing.md`: one paragraph on the fast local lanes (§3), since this whole
   incident is "nobody ran the lanes".

**Acceptance:** `grep -c DESKTOP_WM_GAP tests/e2e/tests/window-mode.spec.js` = 0;
`./run-tests.sh` green (includes the TOC check and the new CSS test); full
`window-mode.spec.js` green on `desktop-chromium`, `desktop-firefox`,
`desktop-webkit`, `ipad-pro-11`, `ipad-pro-11-landscape`, `ipad-gen-11` from the
real config, `--retries=0`.

---

## 3. The test rule for every commit above (binding)

1. **Red first, on the unfixed build, and write the signature down.** For each test
   touched: run it against HEAD before changing product code and record the exact
   failure line + `Expected/Received`. The current signatures are in §1 and in the
   `DESKTOP_WM_GAP` comment; the new CSS test's HEAD failure must read
   `18 !== 5` (or equivalent). A test first seen green proves nothing — this repo
   has already shipped one such tautology (the `.win-body cursor === 'default'`
   assertion set by the only rule the fix added, v1.19.267).
2. **Assert observables the fix does not write.** Allowed here: `elementFromPoint`
   results, measured pixel deltas of *both* windows, `.wl-name` texts vs
   `layoutsFor`, `body.wm` after a click. Not allowed: asserting a CSS offset the
   commit sets (`getComputedStyle('.win-rz-e').right === '-4px'`), or that
   `#win-layouts` has `open` after calling `showLayouts()` directly.
3. **Where red-first is impossible, prove by mutation.** Test corrections (Commit 2)
   and guards against a past regression (the hover-must-not-open assertion) cannot be
   red on HEAD; break the product locally (§Commit 2 acceptance) and watch the test
   go red, then revert. Say in the test comment which kind it is.
4. **Run the lanes that can see the bug.** Cause A needs two side-by-side windows,
   so a portrait lane (`ipad-pro-11`, `ipad-gen-11`) legitimately skips the gutter
   test; the proof lanes are `ipad-pro-11-landscape` and the desktop lanes.

How to run the fast lanes against the live host (~1 min per lane, shell-only specs,
never the Browser/xpra app):

```bash
cd tests/e2e
export VIBETOP_BASE_URL=http://127.0.0.1 VIBETOP_E2E_USER=junjie
export VIBETOP_E2E_COOKIE="$(sudo python3 ../../tools/mint-session-cookie.py junjie --value-only)"
# ^ plain invocation, NOT bash -lc: the login MOTD pollutes the value (1479 bytes → 400). Expect ~131 chars.
npx playwright test tests/window-mode.spec.js --project=ipad-pro-11-landscape --retries=0
npx playwright test tests/window-mode.spec.js --project=desktop-webkit --retries=0
```

To run a still-skipped test on a desktop engine without editing the spec, a scratch
config that registers `devices['Desktop Safari']` under the project name
`ipad-pro-11-landscape` gets past both name-based gates (this is how the alias rows
in §0 were produced). After Commit 3 no such trick is needed.

---

## 4. Exit criteria

| When | What disappears |
|---|---|
| Commit 1 lands | `test.skip(…, DESKTOP_WM_GAP)` at lines 237 and 414 |
| Commit 2 lands | `test.skip(…, DESKTOP_WM_GAP)` at lines 574 and 637; `.hover()` at 588/652/696/849 |
| Commit 3 lands | `DESKTOP_WM_GAP` and its comment block (19–28) entirely; the tablet-only gate at 95–96; the wrong DD entry text |

Done means: zero skips in the file that name a "known gap", every lane in
`playwright.config.js` that gets windows runs the whole `with windows open` block,
and the DD entry describes the cause that was measured, not the one that was
guessed.

---

## 5. Follow-ups

1. **E2E is not in CI at all.** `.github/workflows/tests.yml` has no Playwright step;
   `run-tests.sh` (the pre-commit hook) runs hermetic tiers only. "Tablet-only in
   CI" in the spec header really means "whoever remembers to run `run-vm.sh`". Both
   09-01 regressions shipped because nobody did, and the 09-03 lane addition then
   misattributed them. Minimum fix: add the fast-lane recipe above to
   `docs/testing.md` and to the CLAUDE.md release checklist for any change under
   `shell/` that touches window mode; better: a `tests/e2e/run-local.sh` that runs
   the shell-only specs on the three desktop lanes + `ipad-pro-11-landscape`
   against `127.0.0.1` (~5 min total) so it is one command.
2. **Is this class of gap elsewhere?** The other suites already run
   `desktop-chromium` (`smoke`, `layout`, `files-native*`), so the *viewport* gap
   was specific to window mode's tablet-only gate. The *process* gap (product
   gesture or geometry changes without a lane run) is general. Cheap check once
   Commit 3 is in: run every spec on `desktop-firefox` once — it is defined in the
   config but nothing in this session ran it, and Firefox passed the alias run here,
   so it is likely cheap to keep.
3. **The Chromium order-dependent flake** in §1.5 — trace it before declaring
   `desktop-chromium` green for this file.
4. **Touch target size after Commit 1** — one on-device (or WebKit-emulated with
   `hasTouch`) check of edge grabbing at a frame edge; widen inside reach of `e`/`w`
   if needed, never outside reach.
5. **Optional feature, user's call:** a linked seam drag (both windows follow the
   divider). It would resolve the 3/2-pixel split for good, but it is new behaviour,
   not a fix, and the user prefers the quietest option — offer, don't build.
6. **`docs/desktop.md` line 27** is stale on two counts (hover gesture; dirty
   suspends auto-hide) — fixed in Commit 2; worth a sweep of that paragraph for
   other v1.19.4x-era details.

---

## Appendix — what was run (read-only; nothing committed, `git status` clean)

- `measure.js` (scratchpad): Playwright core against `http://127.0.0.1` with the
  existing `tests/e2e/.auth/state.json` cookie; enables `vibetop:wm`, opens Notes +
  Upload, dumps `windowModeCapable` state, frame/window rects, an `elementFromPoint`
  scan across the seam, the SE-grip hit test, the seam drag with a capturing
  `pointerdown` recorder (which element really receives the press), the SE drag, and
  the palette on hover vs right-click. `FIX_REACH=<e/s>,<w/n>` appends a `<style>`
  overriding only the rings' outside reach — how §1.2 was measured. Runs:
  chromium `Desktop Chrome`, webkit `Desktop Safari`, webkit `iPad Pro 11 landscape`,
  each with reach 10/12 (current), 4, 3, and 4/3.
- `measure2.js` (scratchpad): the §1.5 replay (drag by title bar, open Monitor,
  sample `#frames`, `#sys-warn`, `vibetop:wins`).
- `pw.lab.config.js` (scratchpad): real spec dir + real `global-setup`, projects
  `Desktop Safari`/`Desktop Chrome`/`Desktop Firefox` registered under tablet lane
  names, `retries: 0`.
- Real-config runs: `window-mode.spec.js` on `ipad-pro-11-landscape`,
  `desktop-chromium`, `desktop-webkit`, all `--retries=0`; results in §0.
- No Browser/xpra app was opened; no installer, `deploy.sh` or `systemctl` was run;
  the spec was not edited.
