# Vibetop QA charter — what "reviewed" means here

**Read this before any QA, code review, or e2e pass. It is binding scope, not a
suggestion.** Every QA effort covers **two pillars**. A change that is functionally
correct but annoying, confusing, inconsistent, or rough is **not** done.

Adopt the mindset of a **very picky, experienced user** — someone who uses
best-in-class software daily, assumes nothing works until they've seen it work,
notices every rough edge, and is irritated by friction, surprise, and
inconsistency. Walk the real flows on real viewports (desktop **and** mobile
WebKit). Report even minor polish issues, ranked by severity.

---

## Pillar 1 — Correctness (necessary, not sufficient)

- **Works**: the feature does what it claims; no crashes, JS errors, 500s, dead-ends.
- **Data integrity**: nothing is silently lost, clobbered, or corrupted (saves,
  autosave, cross-device sync, reloads, reconnects).
- **Security & isolation**: auth gates hold; per-user state stays per-user; no
  privilege leak; inputs are validated.
- **State & persistence**: state survives reload / reconnect / device-switch /
  backgrounding exactly as documented — no surprising resets.
- **Edge cases**: long names, many tabs, empty states, slow/flaky network, offline,
  rapid clicking, rotation, resize, two devices at once.

## Pillar 2 — Experience (the part usually skipped — do NOT skip it)

Evaluate every touched surface against these. Each is a first-class finding.

1. **Discoverability** — can a user find the feature without being told? Are
   affordances obvious? Flag anything hidden or undiscoverable (e.g. an action
   reachable only by reopening an app, a gesture with no hint).
2. **Feedback & responsiveness** — every action gives immediate, visible feedback
   (hover/press/active states, spinners, toasts, optimistic updates). Nothing feels
   dead, laggy, or "did that work?".
3. **Consistency** — similar things look and behave the same across apps: buttons,
   modals, tabs, icons, spacing, terminology, keyboard shortcuts. Matches the
   platform metaphor (Windows-style shell) and its own established patterns.
4. **Error states & recovery** — errors are clear, calm, actionable, and
   recoverable. No scary raw stack traces, no dead-ends, no confusing empty states.
5. **Efficiency / ergonomics** — common tasks take few clicks/taps; frequent actions
   are fast; keyboard shortcuts exist where expected; no needless steps.
6. **Mobile ergonomics** — touch targets ≥ ~44px; thumb-reachable; no accidental
   triggers; the on-screen keyboard doesn't obscure the field; gestures are
   intuitive and don't fight the OS; no desktop-only interaction stranded with no
   mobile equivalent.
7. **Visual polish** — alignment, spacing, and rhythm; no overflow/truncation/
   overlap; legible text and adequate contrast (light **and** dark); no layout jank
   or elements shifting as values change.
8. **Accessibility** — keyboard-navigable; visible focus states; meaningful labels
   (aria/title); never rely on color alone; respects reduced-motion where it matters.
9. **Performance perception** — fast to first meaningful paint; no jank on scroll/
   animation; no spinner that hangs; perceived speed matters as much as real speed.
10. **Microcopy** — labels are clear and jargon-free; confirmations phrased well;
    tooltips helpful; nothing ambiguous or truncated into nonsense.

---

## How to run a QA pass

1. **Use the real app**, not just code reads and unit tests — drive it in a real
   browser (desktop + mobile WebKit) against a running instance. See
   `tests/e2e/README.md`; use the **host-safe VM** (`run-vm.sh`), never a privileged
   container on a machine you care about.
2. **Walk complete user journeys**, not isolated widgets: first-run, the common
   task, the error path, the recovery, the second device, the small phone.
3. **Be adversarial and picky**: try to break it, then try to be annoyed by it.
4. **Report findings ranked by severity** with a concrete repro and, for UX issues,
   *why it's friction* and a suggested fix. UX findings are real findings — file
   them alongside bugs, don't drop them.
5. **Capture evidence**: screenshots/video from the real run for anything visual.

## Recurring-regression watchlist (re-check EVERY QA pass)

These have each broken **more than once** — cheap to re-verify, expensive to ship
broken. Most need a real device / the live X11 stack, so they live here, not (only)
in CI. Where a unit test now guards the class, it's noted — run it, but also spot-
check the real behaviour.

1. **X11 GUI apps open fast (~1s, not ~25s).** Launch evince/eog from a terminal (or
   the X11 Launcher); the window must appear almost immediately. A ~25s stall means
   a GNOME/GTK app is on the real session bus and hanging on the xdg-desktop-portal/
   at-spi activation timeout — it must use the **private, activation-free D-Bus bus**
   (`_ensure_user_x11_dbus`). Guarded by `test_x_launch_gnome_app_uses_private_*` and
   two static config guards (`test_xml_config_files_are_well_formed`,
   `test_x11_dbus_template_ready_for_listen_injection` — the private bus was once
   silently 100%-broken by a `--` in an XML comment *and* a missing `<listen>`; see
   `docs/design-decisions.md`). **MEASURE IT RIGHT — this bit us TWICE:** time until
   **`wmctrl -l` LISTS the window** (the usable, WM-managed top-level — what the desktop's
   auto-surface AND the human see), matching the *document/title* text, e.g.
   `for i in $(seq 1 400); do wmctrl -l | grep -qiE 't.pdf|Document' && break; sleep 0.1; done`.
   Two traps: (a) **`xdotool search --sync --class evince` LIES** — it matches a
   premature/transient evince window at ~0.5s while the real document window is still ~40s
   away on a hanging bus (this is what made me wrongly "verify" it fast); (b) **`wmctrl -l |
   grep evince` also lies** — evince's title is the *document* name, not "evince", so it
   never matches and reports a phantom hang. Grep the title text, list-wait on `wmctrl`.
   Cross-check X liveness first: one `wmctrl -l` returns in <10ms and `xterm` maps in <1s.
   **Test BOTH launch paths:** the X11 Launcher (`/api/x/launch`) AND **typing the app in a
   terminal** — they use different D-Bus buses; both must be ~0.1s now (the terminal points
   at the private bus too, snap browsers excepted via `/usr/local/bin` real-bus shims). The
   terminal env is baked at start, so test in a **fresh** terminal. On the private bus the
   a11y lookup fast-fails (eog stderr: `org.a11y.Bus … ServiceUnknown` in 0.0s). **Automated
   guard:** `tests/e2e/tests/x11-lifecycle.spec.js` (full-stack VM or a real host) launches an
   app and asserts it lists in `/api/x/windows` within seconds, then that closing the whole
   launcher empties the list.

6. **Every per-user app serves 200 (no silent 502).** As a logged-in user, `/`, `/files/`,
   `/browser/`, `/x11-display/`, `/terminals/`, `/tN/` must render — not an nginx 502/500. The
   recurring cause is a per-user transient unit (xpra / FileBrowser) left on a **stale
   baked-in port** after a port-scheme change while nginx routes to the new port. Guarded by
   `tests/e2e/tests/surface-health.spec.js` and the `_start_user_{xpra,filebrowser}`
   self-heal (verify the expected port is listening before reusing an "active" unit).
2. **Chinese / IME input in the mobile terminal.** Type pinyin (e.g. `shou ji`), watch
   the candidate bar, select 手机 — the shell must show **只有 手机**, never the raw
   `shou ji` mid-composition. Guarded by `terminal/lib/kbd-input.test.js`, but IME
   itself only reproduces on a device.
3. **iOS standalone-PWA viewport.** After backgrounding the installed PWA and
   reopening (repeat a few times), the terminal's active bottom line must stay
   on-screen and scrollable — never hidden below the physical edge. Real iPhone only.
4. **Terminal reconnect / device-switch.** After idle, network blips, or switching
   devices, the terminal reconnects in place (no reload loop, scrollback preserved).
5. **Browser (xpra) with two devices + reopen.** No reload loop; typing works after a
   new device connects (keymap re-applied).

Adding a fix for any recurring bug? Add its check here AND a unit test on the
extracted logic where possible.

## Scope enforcement

- Automated e2e (`tests/e2e/`) covers Pillar 1 and the mechanical parts of Pillar 2
  (layout-in-viewport, focus, state-through-reload). The **judgment** parts of
  Pillar 2 (discoverability, polish, microcopy, "does this feel good") require a
  human-style walkthrough every pass — automation supplements it, never replaces it.
- Any review that reports only correctness findings is **incomplete** and must be
  sent back for the experience pass.
