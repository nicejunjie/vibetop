# Design decisions & hard-won fixes

A running log of non-obvious problems this project has hit and how they were
solved — the *why* behind choices that aren't self-evident from the code, and
the dead ends that were ruled out. Read this before re-litigating a design or
"simplifying" something that looks odd; it's probably odd on purpose.

> **Maintenance rule:** whenever you solve a new non-obvious problem (a bug whose
> cause was surprising, a workaround for an external tool, a design fork with a
> rejected alternative), **add an entry here** in the same Problem → Cause →
> Fix → Alternatives-rejected shape. Keep the canonical architecture in
> [`../CLAUDE.md`](../CLAUDE.md); this file is the *reasoning* and *history*.

Each entry: **Symptom** (what you'd observe), **Cause** (root cause, ideally
with evidence), **Fix** (what we did), **Rejected** (what we tried or considered
and why it lost).

---

## Notes tabs didn't live-sync across devices

- **Symptom:** Adding / renaming / closing / reordering a Notes tab on one device
  didn't show up on another until a manual reload. Terminal and Files tabs sync
  live; Notes didn't.
- **Cause:** `notes.html` fetched `/api/notes` **once** at init and never polled —
  it had no reconcile loop at all (unlike `files.html`'s ~2s `tick`).
- **Fix:** A ~2s `tick()` (plus focus / visibility triggers): if our tab set
  changed we push (`persistTabs`), else we pull `/api/notes` and `reconcile()` the
  shared set. The shared signature is ids + names + order only. Guarded against
  clobbering an in-progress rename (`contenteditable` tab) or drag.
- **Rejected:** Syncing the **active** tab too (as `files.html` does). Notes is a
  live text editor — adopting a remote active would yank the editor to a different
  note mid-type. So active stays **device-local**; we only jump if our active tab
  was *closed* on another device (like the Terminal tabs' "set membership syncs,
  active stays local").
- **Follow-up — content sync:** tabs synced but the note *body* didn't. Added
  `syncContent()` to the same `tick()`: poll the **active** note's content and
  apply a remote change into the editor — but **only while we're not mid-edit**
  (`saveTimer !== null || savingInFlight`), so local typing always wins (same
  last-writer-wins model as the autosave; no OT/CRDT). Programmatic `editor.value
  = …` doesn't fire `input`, so there's no save loop; caret offset is preserved
  best-effort so a background refresh doesn't jump the cursor. Only the *open*
  note is polled (bounded cost); non-active notes refresh on switch.

---

## Mobile key bar stuck visible on iPad (but fine on iPhone)

- **Symptom:** The on-screen `esc / tab / ^C / arrows` bar (`#sys-keybar`) is
  stuck at the bottom of the desktop on iPad with **no keyboard up**, never
  auto-hides, and overlaps the taskbar so the status bar looks "boxed." iPhone is
  fine. (Reported via screenshot in `~/Uploads`.)
- **Cause:** The keyboard detector in `desktop.html`'s `syncBar` decides "keyboard
  up" by `curH() < baseH - 150`, where `baseH` is the no-keyboard baseline. But
  `baseH` was **monotonic — it only ever grew** (`if (h > baseH) baseH = h`).
  iPad gets rotated constantly: visit in portrait → `baseH` = tall portrait
  height; rotate to landscape → height drops ~300px (> the 150 threshold) but
  `baseH` stays stuck at the portrait value, so `kbUp` is **permanently true** in
  landscape. iPhone escapes it because it's used in one orientation, so `baseH`
  never inflates.
- **Fix:** Re-baseline on a **viewport width change** — the soft keyboard shrinks
  height but never width, while rotation / Split View change width. On `w !==
  baseW`, reset `baseH = 0` so it re-climbs from the new orientation's no-keyboard
  height. Also bound to `orientationchange`. (`landing/desktop.html`, sw v145->v146.)
- **Rejected:** A timed re-measure after `orientationchange` (racy if the keyboard
  opens within the delay; could wedge `baseH` too low → bar never shows). Using
  `window.innerHeight - visualViewport.height` as the inset — dead on iOS, where
  the keyboard shrinks **both** (see the keybar-detection commit `aa145ea`).

---

## Black band below the taskbar after a Cloudflare Access login (installed PWA only, iOS)

- **Symptom:** In the **installed (Add-to-Home-Screen) PWA** on iOS, the **first**
  desktop load *after being made to re-authenticate with Cloudflare Access* renders
  the whole shell (Claude strip, app area, taskbar) in the **top ~80%** of the screen
  with a dead **black band** filling the bottom ~20%. It does **not** self-heal;
  closing the PWA and reopening fixes it. It happens **only in the standalone PWA**
  (the same site in the normal Safari browser is fine) and **only on the auth
  navigation** (a normal open with a valid session is fine). (Reported via screenshot
  in `~/Uploads`.)
- **Cause:** A known, still-open **WebKit standalone-PWA bug**, not our code and not
  Cloudflare's. In an installed web app WebKit resolves `100svh` (and
  `-webkit-fill-available`, and even `visualViewport.height`) **too short** — WebKit
  [bug 254868](https://bugs.webkit.org/show_bug.cgi?id=254868) (open, reproduced on
  iOS 18.3.1). Cloudflare Access sends the shell through a **cross-origin redirect**
  (`service…` → `*.cloudflareaccess.com` login → back); iOS shows in-app browser
  chrome for that out-of-scope page, and on the return the **short "small viewport"
  gets frozen with no corrective `resize` ever fired** (the `innerHeight`/`resize`
  half of WebKit [bug 170595](https://bugs.webkit.org/show_bug.cgi?id=170595) — stale
  in app web views but not MobileSafari; the exact OAuth-return band is reported at
  [discussions.apple.com/thread/251535534](https://discussions.apple.com/thread/251535534)).
  So `body{height:100svh}` fills the frozen-short viewport → band. Regular Safari has
  no scope boundary / no chrome transition, so it's unaffected.
- **What an on-device diagnostic actually showed (overturning the research):** an
  on-screen readout in the frozen state (screen 956px, dpr 3) reported `svh=753`,
  `bodyH=753` (the band) — but `visualViewport.height=894`, `clientHeight=894`,
  `innerHeight=894`, `dvh=894` (= 956 − ~62px status bar = the TRUE usable height), and
  `lvh=vh=956` (full screen). So on this device **only `svh` is frozen-short**;
  `visualViewport.height`/`clientHeight`/`dvh` are all correct (the WebKit-bug write-ups
  claiming those are *also* poisoned did not hold here). A **reload did NOT unfreeze `svh`**
  (`reload=tried`, still 753). `vh`/`lvh` = 956 is why an earlier `100vh` swap overshot and
  cut off the taskbar (they include the opaque status-bar strip).
- **Fix — `landing/apph.js` drives the height from the CORRECT metric (`svh` is the
  only broken one):** `body`/`html` default to `100svh` (`height: var(--app-h, 100svh)`) —
  correct in Safari and untouched there. In **standalone only**, `apph.js` sets `--app-h`
  to `max(visualViewport.height, documentElement.clientHeight)`, clamped to `screen.height`.
  Those two both measure the content area **below** the opaque status bar, so the value can
  only ever equal the true usable height — it can **never overshoot** into the status-bar
  strip the way `100vh`/`lvh` (956) did, and it's **not frozen** the way `svh` is. It keeps
  the running **max** (reset on an `innerWidth` change = rotation), so the soft keyboard —
  which only shrinks the *visual* viewport — can never shrink the shell. `--app-h` is set on
  both `html` and `body` so `html`'s `overflow:hidden` doesn't clip a taller body (no
  `position:fixed` needed — the band was purely `body` being too short, not mis-positioned).
  Ships with a `#vhdbg` / `localStorage.vhdbg='1'` diagnostic overlay (metrics + a colored
  line at each candidate height) — the tool that produced the numbers above. (sw v209→v214.)
- **Dead ends (each shipped, observed to fail, reverted):**
  - `@media (display-mode: standalone){ height:100vh }` — **overshot**, cutting the taskbar
    off the bottom (`vh`=956 includes the opaque status bar; the true usable area is 894).
  - A "learned known-good height + engage-only-when-suspect" adaptive module — over-built on
    the false premise that `visualViewport`/`clientHeight` were also poisoned; a variant of
    it produced a *bigger* band. The diagnostic showed those metrics are fine, so the simple
    "use them directly" fix above is right.
  - `location.reload()` on detecting the short viewport (to automate "reopen") — the reload
    does **not** unfreeze `svh` (diagnostic: `reload=tried`, still 753); reopening works only
    because it's a brand-new web view. Removed.
  - Naive `--app-h = innerHeight`/`visualViewport.height` *without* a keyboard guard — both
    shrink when the soft keyboard opens (iOS: 796→476), which would collapse the shell mid-
    type; the running-max (reset on width change) is what makes it keyboard-safe.

---

## GNOME apps (eog, evince) take ~33s to start in the X11 Launcher

- **Symptom:** Launching a GTK/GNOME app (eog, evince) from the X11 Launcher on
  the X11 display showed a blank canvas for ~33s before the window appeared;
  Firefox/Chromium/native apps (xterm) were instant.
- **Cause:** The X11 display (`:98`) is a bare `xpra start-desktop` + matchbox
  session — **no GNOME session**. GNOME services like `xdg-desktop-portal` are
  *activatable but hang* there (their backends wait for a session that doesn't
  exist). GTK apps query the portal on startup and block the **25-second D-Bus
  method-call timeout**. Evidence: `strace` showed eog threads each blocking in
  `poll()` for exactly ~25.0s on D-Bus fds; a direct probe of
  `org.freedesktop.portal.Desktop` activation timed at exactly 25.0s while
  gvfs/dconf/a11y returned in 0.0s.
- **Fix:** Run launcher apps against a **private D-Bus session with no service
  activation** (`vibetop-x11-dbus`, a `dbus-daemon` with no `<servicedir>`,
  socket `/run/user/<uid>/vibetop-x11-bus`). On it, those service calls fail
  fast (ServiceUnknown) instead of hanging → eog starts in ~0.2s. The bus is
  chosen **per app**: snap apps (Firefox/Chromium, detected via `/snap/bin/<prog>`)
  get the **real user bus** instead, because they *exit* on a bare bus (snap
  confinement needs the session bus) and never block on the portal anyway.
- **Rejected:**
  - `GTK_USE_PORTAL=0` (per-app env): it *did* stop portal activation, but eog
    was still ~33s — there was a second hanging service too. Whack-a-mole.
  - Pointing **terminal** shells at the private bus as well: breaks
    `systemctl --user`/`gsettings` (they need the real user bus). So terminals
    keep the user bus; only the launcher routes to the private bus.
  - Masking `xdg-desktop-portal` globally: would affect a physical GNOME login
    on the host (if any). The private bus is isolated to launcher apps.

## Snap apps (Firefox/Chromium) won't open the X11 display

- **Symptom:** `firefox` from the launcher did nothing; log showed
  `Authorization required, but no authorization protocol specified` /
  `cannot open display :98`. Native apps (xterm) and `wmctrl` worked fine.
- **Cause:** Snap confinement — a confined snap launched *outside* xpra's own
  process can't read the X authority cookie, so the X server rejects it. Native
  same-user clients connect fine.
- **Fix:** `xhost +local:` at Apps-display startup (a `--start` in
  `vibetop-x11-xpra.service`) disables X access control for local clients. Safe:
  the display is loopback-only and the host is single-user behind Access.
  `x11-xserver-utils` (provides `xhost`) is an apt dep.

## Browser must stay its own app, but Apps needs its own canvas

- **Symptom:** Wanting a tabbed "launch GUI apps" experience *and* keeping the
  Browser (Chromium) as a separate app.
- **Cause:** One xpra display can only present **one canvas**. Chromium and any
  launched app share a single display, so two canvas iframes of the same display
  fight over size (a hidden iframe measures 0×0 and shrinks the display) — the
  same reason multi-device window mirroring was dropped.
- **Fix:** A **second xpra display** (`:98`, `vibetop-x11-xpra`, matchbox, no
  Chromium) dedicated to launched apps, proxied at `/x11-display/`. The Browser
  keeps `:99`. The X11 Launcher (`x11launcher.html`) embeds the `:98` canvas with a tab
  bar; the two displays never conflict.
- **Rejected:** Merging Chromium into one tabbed "Desktop" (user wanted Browser
  separate); embedding a second canvas of `:99` in the launcher (size conflict).

## X11 apps launched from a Terminal should appear in the launcher

- **Symptom:** Running `gnuplot` (or any GUI app) in a Terminal had nowhere to
  render.
- **Fix:** `vibetop-session@.service` exports `DISPLAY=:98` +
  `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR`, so terminal-started GUI apps
  render on the X11 desktop and show up as tabs. The desktop also polls
  `/api/x/windows` and auto-opens the X11 Launcher when a new window appears.
  (`XDG_RUNTIME_DIR` silences/fixes Qt apps like gnuplot's qt terminal.)
  Note: this is a systemd-unit change — it only lands on a full deploy /
  `terminal/install.sh`, and only for **newly started** sessions.

## eog/evince single-instance hand-off

- **Symptom:** Launching eog a second time opened no new window; A/B timing
  tests gave nonsense ("NONE") results.
- **Cause:** GNOME apps are **GApplication single-instance** — a second launch
  hands off to the running primary (and with no file, opens nothing). It also
  made repeated benchmarking unreliable until the `org.gnome.eog` bus name was
  confirmed released between runs.
- **Fix / note:** Not "fixed" (it's expected GNOME behavior) — documented so the
  launcher's "nothing happened" isn't mistaken for a bug, and so future
  measurements force a clean primary instance.

## `@BASE_PORT@` left unsubstituted in the ttyd unit (latent install bug)

- **Symptom:** A *fresh* install would render `Environment=BASE_PORT=@BASE_PORT@`
  in `vibetop-ttyd@.service`; `ttyd-run.sh`'s `$(( @BASE_PORT@ + N ))` is a
  syntax error → ttyd never binds → terminals fail.
- **Cause:** The unit-render loop in `terminal/install.sh` only substituted
  `@APP_USER@`/`@APP_DIR@`, not `@BASE_PORT@`. Masked on existing hosts because
  the in-app Update runs `install.sh` with `INSTALL_SYSTEMD=0` (doesn't re-render
  units), so they keep their old correctly-rendered files.
- **Fix:** Added `@BASE_PORT@` (and the new `@X11_DISPLAY@`/`@APP_UID@`) to the
  loop's `sed`.

## Tabs in the Files app (multiple folders)

- **Goal:** view several folders at once, switching tabs instead of navigating
  back and forth.
- **Approach:** FileBrowser is a single-folder SPA, so the Files app is now a
  wrapper (`files.html`) hosting **one FileBrowser iframe per tab** (like the
  Terminal tabs), kept alive so switching is instant and preserves each folder's
  state. Tab labels are the live folder name, read from each iframe's
  `contentWindow.location` (same-origin). Open paths persist in `localStorage`.
- **Gotcha — the location-memory patch fought the tabs:** `filebrowser-patches.js`
  has a single-key "restore last folder" that `location.replace`s any `/files/`
  root load to the saved path — which would yank *every* tab to one folder. Fix:
  the wrapper names each iframe `fbtab` (survives the SPA's in-iframe nav), and
  the patch skips its location-memory when `window.name === "fbtab"` (the wrapper
  owns path memory). The SW BYPASS token was tightened from `files` to `files/`
  so the wrapper page `/files.html` is cacheable while the live SPA at `/files/*`
  stays network-only.
- **Deep links:** the Upload app's "Open in Files" used to overwrite the Files
  iframe `src` (would destroy the tabs); now the desktop posts a `files-open-tab`
  message (a few times, to beat the first-load race; the wrapper dedupes) and the
  wrapper opens a tab at that path.

## Auto-refresh every client on deploy (SSE push)

- **Goal:** after a deploy, every connected client should land on the new shell
  on its own — so fixes/features (e.g. the cross-device close) aren't defeated by
  a device sitting on a stale cached shell, with no per-app refresh logic.
- **Mechanism:** the manager serves an **SSE stream `GET /api/events`** that
  watches the deployed `sw.js` VERSION and pushes a `reload` event when it changes.
  The client (EventSource) responds by calling `registration.update()`; the new
  service worker takes control → `controllerchange` → a **full
  `window.location.reload()`** of the whole desktop (one reload re-loads every app
  iframe too — thorough, no per-app code). Guarded by `hadController` so the first
  install doesn't reload mid-load.
- **Why SSE, not polling:** first built as `registration.update()` polling
  (~90s + on focus). The user (rightly) wanted push to avoid wasted polling. SSE
  fits the threaded `http.server` (one held thread per client), needs **no nginx
  change** (`X-Accel-Buffering: no` disables response buffering; ~18s pings keep
  nginx/Cloudflare from idling the stream out and detect a dead client), and one
  server-side version-check replaces N client polls.
- **The reliability gap (and fix) — learned the hard way:** the naïve SSE only
  notices a version change *while a connection is live*. A tab that's
  disconnected at deploy time (manager restart, network blip, or a **backgrounded
  tab whose stream the browser suspended**) reconnects, baselines to the
  now-current version, and **never learns it should reload** → stale forever. This
  is exactly the case where stateless polling is more reliable. Fix that keeps the
  push: the client remembers the version from its **first `hello`**, and on every
  reconnect compares — if the server's version differs, it **self-heals** (reloads)
  the moment it reconnects or is brought to the foreground. Plus a second client
  bug: the reload was driven by `controllerchange`, which an **uncontrolled** page
  (after a hard reload, `hadController=false`) never fires — so on an explicit
  `reload`/version-mismatch the client now reloads **directly** (`doSwReload`), not
  via `controllerchange`. A tab-focus `registration.update()` remains as a last
  fallback. (`/api/events` logs `[events] pushed reload v…->v…` so a deploy
  propagating is visible in the journal.)
- **Why a full reload (not gentle/deferred):** a thorough refresh is intended —
  persistent state survives the reload (terminals/Browser reconnect, notes
  autosave, Files/Notes tabs are server-side), so the brief blip is acceptable and
  guarantees consistency.
- **Bootstrap:** a client must already run the auto-refresh build for this to
  fire; pre-existing open tabs need one manual reload to get onto it.

## Close an app on all devices

- **Problem:** windows are per-instance (opening on one device doesn't open on
  another — deliberate), and closing was local-only, so an app left open on
  device A couldn't be closed from device B; its Start-menu union dot stayed green.
- **Mechanism:** `POST /api/desktop/close {app}` records the **live instances that
  currently have the app open** in `close_targets` (`{appId:[instanceId,…]}`).
  Each instance closes the app when it sees its own id in a heartbeat reply, then
  reports an open-set without it and the server prunes it (also pruned when stale).
  - *First tried* a per-app counter (`close_ops`) with clients baselining the seen
    value on load. **Rejected after hitting it live:** a device that held the app
    on a *stale shell* during the close didn't act, and after reloading it
    *baselined* the existing counter and still wouldn't close — so the app stayed
    stuck. Targeting by instance id fixes both: reloading the holder (same
    `INSTANCE_ID`) still closes it, and a stuck holder can't poison the app for
    other devices (a global flag would).
- **UX (why a visible Start-menu button, not the alternatives):** the close
  affordance lives as a **✕ button on the Start-menu row, shown only when the app
  is running**, with a **confirm**. Rejected: a window-corner overlay button
  (apps fill the pane with their own top toolbars → it'd cover their controls, and
  it can't reach an app open only on another device); a tiny inline ✕ (hard to hit
  / easy to mis-tap); a hidden long-press/right-click (invisible and finicky on
  touch). A real tap-target + confirm addresses both "hard to click" and "easy to
  mis-click," and the Start menu is the one surface that lists apps open on *other*
  devices. The taskbar × stays local ("close here").

## Tabs in the Notes app (multiple, renameable notes)

- **Goal:** multiple notes with tabs, renameable like the Terminal tabs.
- **Approach:** Notes went from a single file + single-doc API to **multi-document,
  server-side**: each note is `~/.local/share/desktop-notes/<id>.md`, the tab index
  (`{tabs:[{id,name}], active}`) is `index.json` in that dir — server-side so
  names/order/active propagate across devices (like terminal tab names). API:
  `GET /api/notes` (index), `GET /api/notes?id=` (content), `POST /api/notes
  {id,content}` (save), `POST /api/notes/tabs {tabs,active}` (the client owns the
  tab list; the manager stores it and deletes files for closed tabs).
- **Data safety:** note ids are sanitized (`_safe_note_id`, `[A-Za-z0-9_-]{1,64}`)
  so an id can only ever be a plain filename inside the notes dir (no `../`
  traversal). The **legacy single-note file** (`desktop-notes.md`) is migrated into
  tab `"1"` on first use and **left intact** (not deleted) as a safety net.
  Closing a tab deletes its note file, so the frontend **confirms** before closing
  a non-empty note. Verified end-to-end (migration, create/save/read, close-deletes,
  traversal-id rejection).
- **Rejected:** keeping closed-note files as orphans (avoids accidental loss but
  accumulates dead files) — chose delete-on-close + a frontend confirm instead.

## Launcher "spins forever" on a not-installed / mistyped command

- **Symptom:** Typing a command that isn't installed (e.g. `gimp` when it's not
  on the host) left the progress bar spinning indefinitely — looked like a slow
  load, but nothing was ever going to appear.
- **Cause:** `/api/x/launch` returned `{ok:true}` the instant it spawned the
  `su -c` shell; it had no idea the command then failed (`command not found`,
  exit 127), so the window-poll never cleared the bar.
- **Fix:** After spawning, the manager does a short `proc.wait(timeout=3)`. A
  missing/mistyped command exits fast with non-zero (127 = not found) → return a
  `400` with "‘<prog>’ didn't start (exit 127) — not found / not installed?"; a
  real GUI app is still running at 3s → return ok and reap it in the background.
  The launcher shows it as a friendly message ("‘gimp’ isn't installed (or not
  in PATH).") with a Dismiss, not a spinning bar.
  The 3s only delays the *response* on the rare failure path — success still
  shows its window via the poll, independent of the response.
- **Note:** No precheck (`command -v`) — that risked false negatives (aliases,
  custom PATH) blocking valid launches. Watching the actual exit is accurate.

## Slow app launch looked broken (blank canvas)

- **Symptom:** After hitting Run, the canvas was blank for seconds (esp. cold
  GNOME apps) and looked frozen.
- **Fix:** An indeterminate **progress bar** overlay in `x11launcher.html` ("Launching
  `<cmd>`…") shown until the window appears, with a "still starting / may have
  failed" hint after 25s and a Dismiss. (Largely moot now that the portal fix
  makes GNOME apps fast, but it still covers genuinely slow first launches.)

## No server-side logs made debugging slow ("limited logs on the server side")

- **Symptom:** Several hard bugs this cycle (eog portal hang, snap firefox not
  launching, an instance stuck not auto-refreshing) were diagnosed almost blind —
  `terminal-manager.py` did its work silently. `log_message` was a bare `pass`
  (HTTP access lines suppressed) and the only prints were a handful of `[office]`
  stderr lines, so the journal carried almost nothing about what the manager did
  or why a request failed.
- **Fix:** A single `logging` logger (`vibetop`) set up at import
  (`_setup_logging`): a `StreamHandler` to stderr (→ journald, which stamps the
  time) **and** a `RotatingFileHandler` at `/var/log/vibetop/manager.log`. Level
  is `INFO` by default, `LOG_LEVEL` env overrides. Selective, not chatty — INFO
  on the actions that matter (terminal start/stop, `x/launch` with which bus,
  cross-device close, reset summary, update outcome, SSE reload push) and WARNING
  on failures (office callback/forcesave/save-back, launch fast-fail, status
  collection error, update pull failure). The noisy per-request HTTP access log is
  routed to `log.debug`, so it's off at INFO but available via `LOG_LEVEL=DEBUG`.
- **Self-cleaning:** `RotatingFileHandler(maxBytes=2_000_000, backupCount=5)` caps
  the on-disk log at ~12 MB total (1 active + 5 rotated) and rotates in place — no
  cron/logrotate needed, so it can't grow unbounded. journald applies its own
  retention to the stderr copy. The dir is created on first run; if `/var/log`
  isn't writable the handler is skipped (journal-only) rather than crashing.
- **Shadowing gotcha:** `_handle_update` had a local `log = []` (its step list)
  that shadowed the module logger; renamed to `steps` so `log.*` in that method
  reaches the logger.
- **Rejected:** print-to-stderr only (no file, no levels — can't dial verbosity,
  and journald-only loses the easy `tail -f` a file gives); a verbose access log
  at INFO (drowns the signal — kept at DEBUG); external logrotate (the rotating
  handler is self-contained and needs no host config).

## Killing the terminal "shake" silently broke the double-click/tap re-claim

- **Symptom:** Double-click (desktop) / double-tap (touch) on a terminal used to
  re-claim the shared PTY's shape for this device. After the fix that stopped the
  content from "shaking" on double-click, the gesture stopped reshaping anything —
  no shake, but no re-claim either.
- **Cause:** The shake came from `claimSize()` resizing the *visible xterm grid*
  (`term.resize(c, r-1); term.resize(c, r)`) — the rows jump. The shake-fix sent
  the resize straight to ttyd's WebSocket instead (no grid resize), but sent the
  **current** dims `{columns:c, rows:r}` — exactly the size this client's ttyd PTY
  was **already** at. ttyd dutifully calls `TIOCSWINSZ(c,r)`, but the **kernel
  raises SIGWINCH only when the winsize actually changes**, so no SIGWINCH fired —
  and SIGWINCH is the whole propagation chain: `vibetop-session attach`'s SIGWINCH
  handler (`send_resize`, line ~439) writes the size + SIGUSR1s the serve daemon,
  which `TIOCSWINSZ`es the *shared* bash PTY and SIGWINCHes the shell. No SIGWINCH
  ⇒ nothing propagates ⇒ silent no-op. The old visible nudge worked precisely
  because `r-1 ≠ r` forced two real size changes (two SIGWINCHes).
- **Fix:** Keep sending straight to the socket (so the visible grid never resizes
  → no shake), but **nudge over the socket**: send a neighbour size and back. Two
  genuine size changes → two SIGWINCHes → the shared PTY ends up at this device's
  shape, all without touching the visible xterm grid. Same trick as the original,
  one layer lower.
- **Residual shake (the nudge's intermediate frame), fixed in two parts:** the
  nudge's *first* size still streams a redraw back to this device. (1) **Nudge the
  COLUMN, not the row** (`{c-1,r}` then `{c,r}`): a row nudge makes a bottom-anchored
  TUI (prompt/input box) bounce up a row and back — very visible; a column nudge
  keeps every row in place, so the blip is one column of width for one frame. (2)
  **Debounce the resize in the `vibetop-session` serve daemon** (`RESIZE_DEBOUNCE`
  ~35ms): SIGUSR1 no longer applies the resize inline — it arms a deadline and the
  main loop applies the *latest* saved size once the burst settles, collapsing the
  nudge's two rapid resizes into a single `TIOCSWINSZ` + SIGWINCH. So the shell
  redraws **once, at the final size** — the intermediate frame never reaches it.
  This is what made the shake intermittent ("once every few double-clicks"): the
  two SIGWINCHes sometimes coalesced in the shell and sometimes didn't; the
  debounce makes the single-redraw outcome deterministic. (Daemon change ⇒ only
  **new** sessions get it — the serve daemons are never restarted, since that would
  kill live shells; existing terminals get the column-nudge mitigation until
  reopened.)
- **Rejected:** sending `c×r` once (the regression — same size, no SIGWINCH);
  a row nudge (visible vertical bounce — switched to a column nudge); a magic
  input-escape to re-assert size without a nudge (could collide with real
  input/paste). The column nudge + daemon debounce together cover both the
  re-claim correctness and the residual shake with minimal surface area.

## "Random characters" appear at the prompt (`2RR0;276;0c10;rgb:…$y`)

- **Symptom:** An idle terminal periodically shows bursts of garbage the user
  never typed, e.g. `…$ 2RR0;276;0c10;rgb:d2d2/d2d2/d2d211;rgb:2b2b/2b2b/2b2b12;2$y`
  repeated several times after the prompt. Harmless (Enter clears it) but noisy.
- **Cause:** These are terminal **query *responses***, not random bytes — decode
  to a Cursor-Position Report, Secondary Device Attributes (`…;276;…c`), OSC 10/11
  foreground/background color replies, and a DECRPM mode report. Some program
  (a prompt hook, a bg-color-sniffing tool, a TUI — often re-firing on `SIGWINCH`,
  which vibetop generates a lot via the resize/reshape machinery) writes a
  capability **probe** to the PTY. That probe is PTY *output*, so it lands in
  `vibetop-session`'s ring buffer. Two shared-session mechanisms then turn one
  probe into repeated garbage: (1) **broadcast** — the live PTY stream fans out to
  *every* attached xterm.js client, so each connected browser/tab/device answers
  the same probe, and all answers are written back into the *one* shared PTY and
  echoed at the prompt; (2) **replay** — `vibetop-session` replays its ring buffer
  to each freshly (re)connected client to restore the screen, and vibetop
  reconnects often (mobile suspend/resume, the reconnect guard). A probe sitting in
  the ring gets **re-sent to every reconnecting xterm, which re-answers it** — so
  one stale probe produces a fresh burst on every reconnect. (1) adds one copy per
  extra live client; (2) is what makes it *recurring*.
- **Fix:** Strip terminal query-**request** sequences (DA `…c`, DSR/CPR `…n`,
  DECRQM `…$p`, OSC color/palette `…;?…`) from the ring-buffer **replay only**
  (`strip_terminal_queries` in `vibetop-session`, applied where a new client is
  sent `ring.read_all()`). The **live** broadcast path is untouched — a real probe
  still reaches clients and is answered once, which is correct; only *replayed*
  (stale) probes are dropped, so a reconnect never re-answers. Color/cursor *set*
  sequences (real screen state, e.g. `OSC 11;rgb:…` with no `?`, and a window
  title that merely *contains* a `?`) are deliberately preserved. Pure function,
  unit-tested in `terminal/tests/test_claude_session.py` (strip-vs-preserve table).
- **Rejected:** stripping queries from what's *stored* in the ring (a probe split
  across two `os.read()` chunks could be written non-contiguously — strip at replay
  time instead, where `read_all()` is one contiguous snapshot); de-duplicating the
  near-simultaneous responses from multiple **live** clients in the serve daemon
  (timing-fragile, and the per-extra-client duplication is minor and non-recurring
  — usually 1–2 clients); fixing it shell-side (can't, the emitter is arbitrary
  user software). Daemon change ⇒ only **new** sessions get it (serve daemons are
  never restarted — that would kill live shells); existing terminals stop on the
  next fresh session.

## macOS "error beep" when copying in a terminal (Cmd+C)

- **Symptom:** On macOS, pressing Cmd+C in a terminal plays the system error
  sound (NSBeep) — even when the copy itself works.
- **Cause:** Two things compounded. (1) xterm.js's selection is **not** a DOM
  selection (it paints to a canvas), so when the native Cmd+C key-equivalent
  reaches the browser it finds nothing selected to copy and macOS beeps. (2) The
  copy handler (the `attachCustomKeyEventHandler` injected via the `/tN/`
  `sub_filter`) returned `false` to "consume" Cmd+C — but **returning `false`
  from an xterm custom key handler does NOT call `preventDefault()`**: xterm's
  `_keyDown` returns early *before* its internal `_cancel()` (which is what
  preventDefaults). So the native Cmd+C still fired → beep. The no-selection case
  was worse: the handler fell through to `return true`, never even trying to
  consume it.
- **Fix:** Call `e.preventDefault()` **explicitly** on the copy chord (don't rely
  on `return false`). The handler now: with a selection → `copySelection()` +
  `preventDefault()` + `return false` (no native copy to clobber it or beep);
  Cmd+C with no selection on macOS → `preventDefault()` + `return false` (swallow
  it — Cmd never means SIGINT). The **non-Mac `Ctrl+C` with no selection still
  returns `true`** so it passes through as SIGINT (the interrupt must survive).
- **Rejected:** relying on `return false` alone (the original bug — doesn't
  preventDefault); mirroring the xterm selection into a hidden DOM selection so
  the native copy has something to grab (more moving parts than just
  preventDefaulting and doing our own `execCommand('copy')`). Lives in the
  `sub_filter` (inline, no-store on `/tN/`), so it ships on the next
  `terminal/install.sh` / in-app Update + nginx reload — no cache-bust needed.

## Closing a tab killed detached processes (ssh ControlPersist, tmux, nohup)

- **Symptom:** With `ControlMaster auto` / `ControlPersist`, an ssh connection
  re-authenticated every time — closing the terminal you'd `ssh`'d from dropped
  the persistent master, so the next connection re-prompted. Same for `tmux`,
  `nohup`, and disowned jobs: things that survive closing a *normal* terminal got
  killed when a vibetop tab closed.
- **Cause:** A vibetop terminal is a systemd unit (`vibetop-session@N`). Closing
  a tab does `systemctl stop`, and the default **`KillMode=control-group`** SIGKILLs
  *every* process in the unit's cgroup. A normal terminal close only sends SIGHUP
  to the foreground session — daemonized processes (ssh's `ControlPersist` master
  `setsid`s itself, as do tmux servers and `nohup`/disowned jobs) escape that and
  live on. vibetop's cgroup-kill was strictly more aggressive, so it killed the
  very processes the user detached *on purpose*.
- **Fix:** Set **`KillMode=process`** on `vibetop-session@.service`, so a tab-close
  `stop` signals only the serve daemon (the unit's main process). When it exits it
  closes the PTY master; the kernel hangs up the foreground shell (SIGHUP), bash
  forwards SIGHUP to its jobs and exits, and `setsid`'d daemons survive — exactly
  like closing a real terminal. The serve daemon's SIGTERM handler also now sends
  the shell **SIGHUP** (not SIGTERM, which interactive bash ignores) for an
  immediate, explicit hangup. **Logout/reset still wipes everything:** `_handle_reset`
  now `systemctl kill --kill-whom=all --signal=SIGKILL`s the cgroups *before*
  stopping (that hits every process regardless of `KillMode`), so "clean slate on
  logout" is preserved — only single-tab-close is gentle.
- **Tradeoff (accepted):** closing a tab no longer guarantees zero leftover
  processes — a stuck/SIGHUP-trapping background process now lingers until logout
  or reboot, the same way it would on any real terminal. This is the cost of
  matching normal-terminal semantics; logout/reboot remain the hard reset.
- **Rejected:** a `~/.bashrc` `ssh` wrapper that runs the master in a transient
  `systemd-run --user` scope (works, but pushes the fix onto every user and only
  covers interactive ssh — should be solved once, server-side); `KillMode=mixed`
  (still SIGKILLs the whole cgroup at the end — no better than control-group for
  this); leaving it and documenting the wrapper (the platform should behave like a
  terminal, not require per-user setup). **Deploy:** unit change ⇒ needs a full
  `terminal/install.sh` (systemd) + `daemon-reload`, *not* the in-app Updater (it
  skips units); after daemon-reload even existing terminals stop gently. The
  serve-daemon SIGHUP tweak only affects *new* sessions (daemons aren't restarted),
  but `KillMode=process` alone already does the job via the kernel PTY hangup.

## Root manager service is only *partially* sandboxed (on purpose)

- **Symptom:** A code review flagged that `vibetop-manager.service` runs as root
  with **zero** systemd hardening while the unprivileged child units (session,
  browser-xpra) carry `ProtectKernel*`/`ProtectControlGroups` — backwards on its
  face.
- **Cause:** The manager genuinely needs broad power: it drives `systemctl`,
  drops to `APP_USER` via `su`/`sudo` (both **setuid**), reads sysfs/debugfs, and
  during an in-app Update it rewrites `/etc/nginx`, `/etc/systemd`, and the web
  root, then runs the per-project `install.sh` scripts. Almost every heavyweight
  directive breaks one of those.
- **Fix:** Add only the directives that harden without touching that surface:
  `ProtectKernelTunables/Modules/Logs`, `ProtectClock`, `ProtectHostname`,
  `RestrictNamespaces`, `RestrictRealtime`, `LockPersonality`. Plus an
  application-layer `_csrf_ok()` Origin/Host check on state-changing POSTs (see
  below), since the real exposure is a browser-driven request, not a local FS
  escape.
- **Rejected:** `NoNewPrivileges=yes` / `RestrictSUIDSGID=yes` — both break
  `su`/`sudo`, which the manager uses for every git op and app launch (symptom
  would be "sudo: a password is required" / EPERM). `ProtectSystem=strict` +
  `ReadWritePaths` — the Updater writes `/etc` and `/usr/local`; the allow-list
  would be large, fragile, and silently break a redeploy. `ProtectHome` — it
  writes the user's web root and `~/.config`. `PrivateTmp` — would hide the
  `/tmp/vibetop-session-*.sock` world the session children live in. `ProtectControlGroups` —
  left off because the manager spawns transient units via `systemd-run`.

## CSRF on the no-auth manager API (Origin check, not tokens)

- **Symptom:** Every `/api/*` endpoint trusts whatever reaches `127.0.0.1` — and
  some are destructive or RCE-shaped (`/api/x/launch` runs a shell command as
  `APP_USER`, `/api/reset`, `/api/update`). The trust model is "Cloudflare Access
  at the edge + a trusted LAN," so there's no app-layer auth. That leaves a CSRF
  hole: a malicious web page the user visits can `fetch()` the LAN/origin manager
  (a `text/plain` POST whose body is `json.loads`-parsed needs no CORS preflight,
  and the browser still attaches the user's Access cookie over the tunnel).
- **Fix:** `_csrf_ok()` rejects a POST whose `Origin` header is present but
  doesn't match `Host`. That blocks the cross-site browser case while leaving the
  legitimate non-browser callers untouched — `curl`/the operational CLI and the
  **OnlyOffice container's** server-side callback send *no* `Origin`, so they pass.
- **Rejected:** A CSRF token / session — there's no login or session to hang it
  on (auth is entirely at the Cloudflare edge), so a token would need its own
  bootstrap and storage for marginal gain over the Origin check. Blanket-blocking
  no-Origin requests — would break `curl`, health probes, and the OnlyOffice
  callback (the one server-to-server caller).

## `vibetop-session` shell-respawn needs backoff

- **Symptom:** Review flagged that the serve daemon's main loop respawns the shell
  the instant the child dies (`if reap_child(): ring.clear(); spawn_shell()`).
- **Cause:** If `/bin/bash` can't `exec` (missing, not executable, bad mount), the
  forked child `_exit(127)`s immediately, the PTY master goes readable with `EIO`
  so `select` returns at once, `reap_child()` is true next iteration, and it forks
  again — a **tight fork loop** pinning a CPU, with nothing throttling it.
- **Fix:** Track `last_spawn`; if a shell lived <1s, count it and `sleep` with
  capped exponential backoff + jitter (0.1s→8s) before respawning, resetting the
  counter once a shell survives. Normal `exit`-respawn (the shell lived a while)
  is unaffected — it respawns instantly as before.
- **Rejected:** A hard "give up after N" that leaves the terminal dead — a
  transient cause (a deploy mid-swap of `/bin/bash`) should self-heal; backoff
  recovers without a permanent dead tab.

## Mobile on-screen key bar (arrows/Esc/^C) lives at the TOP, not above the keyboard

- **Symptom:** The iOS soft keyboard has no arrows/Esc/Tab/Ctrl, so TUIs you
  navigate with ↑/↓ (Claude Code's picker, `git rebase -i`, `vim`) were unusable
  on a phone. Many attempts to put an accessory bar in the strip *just above the
  keyboard* failed: it either showed under iOS's own AutoFill/`^v Done` rows, or
  covered the terminal's prompt, or didn't show at all.
- **Cause:** The bottom strip is hostile on iOS and unfixable by tuning. (1) When
  the keyboard is raised by an input inside a *nested iframe* (the terminal is 2
  frames down), the **top frame's `visualViewport` doesn't shrink**, so the
  desktop can't even measure the keyboard to position a bar there. (2) iOS paints
  its **own accessory rows** (AutoFill/domain pill, form `^ v Done`) in that strip,
  over our content, at heights we can't measure or suppress (`autocomplete=off`
  doesn't stop the domain pill). Offsets became a per-device guessing game; a
  content-shift transform broke layout.
- **Fix:** Render ONE system-wide bar at the **desktop level, pinned to the TOP**
  of the screen (`#sys-keybar`, below the status-bar safe-area), shown while a
  keyboard is up. It never collides with the keyboard, the prompt (which the
  existing caret-park keeps just above the keyboard), or iOS keyboard chrome.
  Each tap routes `{type:'kbd-key', key}` to the active app's frame — the Browser
  (xpra-patches) already understood it; the Terminal relays it desktop →
  terminals.html → `/tN/`, where `terminal-kbd.js` maps it to PTY bytes (arrows =
  `ESC[A/B/C/D`). The terminal reports keyboard up/down so the desktop shows/hides.
- **Rejected:** Bottom placement with a per-context offset (`IOS_ACCESSORY`
  guess) — unverifiable and wrong on some devices. A CSS-transform "shift the
  terminal up" — fought iOS auto-scroll and broke layout. Relying on iOS to
  auto-scroll a focused textarea above the bar — doesn't work 3 iframes deep.
- **Testing lesson:** This was verified in **Playwright WebKit** (Safari's
  engine) driving the live stack with a `visualViewport`-mocked keyboard +
  screenshots, against a **throwaway terminal** (never the user's sessions).
  Chromium emulation passed a test the real iPhone failed — see
  [[mobile-ui-needs-webkit-or-device]] in memory: don't ship iOS UI blind.

## Mobile terminal typing: dropped keystrokes, dropped first letter, input lag

- **Symptom:** After the mobile keyboard work landed, typing in the **terminal
  only** (every other app was fine) would intermittently **drop the first
  letter**, **drop keystrokes entirely**, or feel **laggy** — "I have to type it
  a few times." None of this reproduced in the Browser/Notes overlays.
- **Cause:** Three independent bugs in the touch input path (the transparent
  overlay `terminal-kbd.js` + the `focusin` guard injected by
  `terminal/install.sh`), root-caused with an ultracode multi-agent workflow:
  1. **Blur-to-nothing.** The guard's job is to stop xterm's hidden
     `.xterm-helper-textarea` from raising the keyboard on load, so it blurred
     the helper whenever it took focus. But it blurred to **`document.body`** —
     not a text field. xterm re-focuses that helper constantly (WS-connect, every
     render), so mid-typing a steal → blur → **focus on `<body>` → the keystroke
     went nowhere.** Terminal-only because no other app fights xterm for focus.
  2. **Stale value-diff baseline.** Input is sent by diffing the overlay's value
     against `lastSent`, which was reset **only on Enter**. A typing session that
     began with leftover state (keyboard dismissed/re-summoned, an un-Entered
     line) mis-computed the **first** char's diff — swallowing it or emitting
     spurious backspaces.
  3. **Artificial 80 ms debounce.** Every keystroke sat in a `setTimeout(…, 80)`
     before reaching the PTY — batching meant for dictation, but pure latency for
     normal typing (Notes is a native field with none).
- **Fix:**
  1. The guard **bounces the stolen focus back to the overlay** instead of
     blurring to `<body>` — gated by `window.__termArmed` (set on the overlay's
     first genuine focus, so the keyboard still doesn't pop up on load) and
     `window.__termBouncing` (set around the guard's `focus()` call so the
     genuine-focus baseline reset below can tell a bounce from a real refocus and
     **never wipes in-flight input**). Focus can no longer land on `<body>`.
  2. **Reset the diff baseline (`ov.value`/`lastSent`) on a genuine refocus**
     (skipped when `__termBouncing`), so the first char of every session is sent
     as-is. The empty-value guard is also scoped to `composing` so a real line
     clear isn't swallowed.
  3. **Flush normal typing immediately** (synchronously in the `input` handler);
     only `composing` (dictation/IME) keeps the 400 ms debounce. The remaining
     gap from Notes is the **unavoidable PTY-echo round-trip** — the shell, not
     the browser, renders the char; small on LAN, = network RTT over the tunnel.
- **Rejected:** Lowering/removing the debounce alone (didn't address the focus
  drops). Resetting the baseline on **every** focus (the guard's bounce re-focus
  fires mid-typing, so this wiped in-flight chars — hence the `__termBouncing`
  gate). Letting the helper keep focus (xterm's native input streams half-formed
  dictation to the PTY — the very pile-up the overlay exists to prevent).
- **Testing lesson:** Same WebKit-on-throwaway-terminal harness as above. The
  focus-steal/bounce and the synchronous-vs-debounced flush are deterministic DOM
  behavior WebKit reproduces faithfully (unlike the keyboard-viewport quirks),
  so the harness caught all three before deploy. Don't touch the 80 ms→0 flush
  without re-checking the `composing` path still batches dictation.

---

## OnlyOffice "Download failed" over the Cloudflare tunnel (but fine on the LAN)

- **Symptom:** Opening/creating a doc in the Office app showed OnlyOffice's
  native **"Error: Download failed"** dialog — but **only over the tunnel**
  (`https://service…`), on *both* phone and desktop. The **LAN**
  (`http://z20.local`) worked. First mis-reported as phone-only (the phone was
  just the tunnel client), which echoes — but is **not** — the older mobile-editor
  "Download failed" (that one was the Community mobile web editor; fixed by
  forcing `cfg.type='desktop'`, still in place). Here the desktop editor loads
  fully, then the document never appears.
- **Cause:** **Mixed content.** The editor UI loads, then the browser fetches the
  converted document at `…/onlyoffice/cache/files/data/<key>/Editor.bin`. Over
  the tunnel that request **never reached the origin** (0 hits in nginx; a
  browser-side block, not an edge block — a request killed *before* it's sent).
  Why: OnlyOffice builds that as an **absolute** URL whose scheme comes from
  `X-Forwarded-Proto`. Our `onlyoffice.conf` sent `X-Forwarded-Proto $scheme`,
  but over the tunnel the `cloudflared → nginx` hop is plain **http**, so
  `$scheme=http` even though the client is on **https**. So the DS handed the
  browser an `http://service…/…/Editor.bin` link; on an **https** page that's
  active mixed content → blocked → "Download failed." On the **http** LAN page the
  http link is same-scheme, so it always worked. (Two red herrings ruled out
  first: the container *does* download the original doc fine — `GET /api/office/doc
  → 200` over the tunnel — and OnlyOffice's own `document_editor_service_worker.js`
  only registers in a secure context, but its scope is `/onlyoffice/<version>/`,
  so it never touches the `/onlyoffice/cache/` path.)
- **Fix:** Forward the **external** scheme: `proxy_set_header X-Forwarded-Proto
  $http_x_forwarded_proto;` in `office/nginx/onlyoffice.conf`. `cloudflared` sends
  `X-Forwarded-Proto: https`, so the DS now builds `https://` URLs over the
  tunnel; on a direct LAN request the header is absent → nginx omits it → the DS's
  own nginx (`http-common.conf`'s `$the_scheme` map) falls back to its `http`
  `$scheme`. Verified with `tcpdump` on loopback `:8087`: `X-Forwarded-Proto:
  https` now reaches the container and the `Editor.bin` GETs hit the origin.
- **Rejected:** Hardcoding `https` (breaks the http LAN — the reverse mixed-content
  problem). Patching the container's nginx (its `$the_scheme` map already honors
  the incoming header — the only broken hop was ours). An Access bypass for
  `/onlyoffice/*` (wrong layer — the request never reached Cloudflare; and it'd
  needlessly expose the editor/cache publicly). Chasing the server-side download
  path (the *container's* download was always 200; the failing fetch was the
  *browser's*).
- **Note:** purely an nginx-snippet change — no `sw.js`/shell bump (the PWA SW
  bypasses `/onlyoffice` and `office-editor.html` is network-only). Deploy gap
  found + closed alongside this: the in-app Updater redeployed
  `landing/`/`browser/`/`terminal/` but **not** `office/`, so this fix wouldn't
  have reached a host that updates via the app. The Updater now runs
  `office/install.sh` on an `office/` change — with the new `INSTALL_CONTAINER=0`
  knob so it only re-renders the nginx snippet and **leaves the live OnlyOffice
  container running** (tearing it down would drop open editors + cost ~1-2 min);
  container arg/image changes still need a full `deploy.sh`, exactly like
  systemd-unit changes for `browser/`/`terminal/`.

---

## Browser clicks land ~one line low after an xpra restart (xpra 6.5 regression)

- **Symptom:** In the Browser app, clicks registered ~one character/line **below**
  the cursor. Appeared with no Browser code change — it started right after an
  unrelated `systemctl restart vibetop-browser-xpra` (done while fixing other
  things). A second, **older deployment (`legion`, v1.9.10) did NOT have it**.
- **Cause:** **A server-side regression in xpra 6.5.** `apt` had upgraded
  `xpra 6.4.4 → 6.5` (here: 2026-06-27) but the *running* `vibetop-browser-xpra`
  process kept executing the old 6.4.4 binaries — and was fine. The restart loaded
  the new **6.5** binaries, which mis-place the click. Proof it's the server, not
  our code: the xpra **HTML5 client JS is byte-identical** between 6.4.4 and 6.5
  (`getMouse`, cursor `xhot/yhot` handling all the same), and `legion` (xpra 6.4)
  is immune. The 6.5 changelog documents **no** pointer/cursor change, so it's an
  unintended side effect (xpra has a long history of HTML5 mouse-offset bugs).
- **Fix:** Downgrade to the known-good version and pin it:
  `apt-get install --allow-downgrades xpra*=6.4.4-r0-1` (all 9 xpra packages) then
  `apt-mark hold` them, then restart `vibetop-browser-xpra` + `vibetop-x11-xpra`.
  Verify with `xpra info :99 | grep build.version` → `6.4`. Revisit (unhold +
  test) when a fixed xpra ships (6.5.x/6.6) or report it upstream.
- **Rejected (wasted ~2h):** Patching the click mapping in `xpra-patches.js`
  (`getMouse` canvas-rect math, then a native-cursor override). All no-ops/worse —
  the client coordinates were already correct (a debug overlay showed `getMouse`
  mapping 1:1 at top/middle/bottom). The bug was never in the JS.
- **Diagnostic lessons (the fast path next time):** (1) **Trust a known-good peer
  host** — `legion` running an older build immediately localized it to *something
  that changed on z20*, not the app. (2) For a "was-fine-now-broken with no code
  change" service bug, **check running-binary vs installed-package version**
  (`xpra info :99` build.version vs `dpkg -l xpra`): an `apt` upgrade doesn't
  restart the daemon, so a restart can silently swap in new, regressed binaries
  long after the upgrade. (3) A green on-screen debug overlay reporting
  `client→remote` coords (temporary, in `xpra-patches.js`) proved the client math
  was right and stopped the guess-and-deploy loop. See [[bisect-against-known-good-first]].

## Browser "loading" spinner every few seconds with TWO devices (stale xpra client state — NOT a code/version bug)

- **Symptom:** The Browser app reloads to the connecting/"loading" spinner every
  few seconds — **only the Browser** (Terminal is rock-solid), and **only when it's
  open on 2+ clients at once** (desktop + phone, or two tabs). A **single** client
  is always stable. Reported as version-specific (works on the older `legion` host,
  broken on `z20`).
- **Cause (validated):** **Accumulated stale runtime state, not code.** The session
  ended back on the *exact* stock build it started on (v1.11.6) and the Browser was
  fixed — so no code change cured it. What did: a full teardown+redeploy (1)
  **restarted `vibetop-browser-xpra` from zero** (`clients=0`), dropping accumulated
  **stale/zombie xpra clients** (backgrounded tabs, suspended-phone connections that
  hadn't hit `XPRA_PING_TIMEOUT` yet) all contending for the single shared session;
  and (2) made **both devices reload onto one consistent shell**, ending a
  cache-mismatch fight. The reload itself is `xpra-patches.js` patch 6 firing on
  each `connection-lost`, which turns the contention into a visible loop.
- **Cure (no redeploy/downgrade needed):** `sudo systemctl restart
  vibetop-browser-xpra` (or the desktop **Logout/reset** button, which does the
  same), then reload both devices. Clears the stale clients and resyncs the shells.
- **Why Terminal is immune:** ttyd + `vibetop-session` let many viewers share one
  PTY with no steal/session-ownership semantics; xpra has a single shared session
  that stale clients can wedge.
- **Rejected / dead ends (do NOT re-chase — each cost real time):**
  - **xpra 6.5** — the running binary was 6.4.4; 6.5 is the *click-offset* bug
    (separate entry above), unrelated to this loop.
  - **A vibetop version regression** — `git diff 689bb6e(v1.9.10=legion) HEAD --
    browser/` shows the Browser stack is byte-identical to legion (same xpra flags,
    same `/browser/` iframe); downgrading the code changes nothing for the Browser.
  - **Forcing client sharing via the iframe URL** (`/browser/?sharing=true&steal=false`):
    made it **worse** — a non-sharing/steal mismatch across mixed cached shells
    caused `Disconnecting … session busy (this session is already active)`
    reject-loops. Reverted.
  - **`--clipboard-direction=to-server`** to kill the clipboard-storm
    (`Warning: more than 30 clipboard requests per second!`): the storm is a
    *symptom* of two clients syncing, not the disconnect cause; didn't fix the loop.
  - **A full v1.9.10 redeploy** as the apples-to-apples legion test: tripped a
    **separate** xpra failure on z20 — `authentication failed: missing remote
    username` (the HTML5 login window) despite `--ws-auth=none`, which v1.11.6 does
    NOT exhibit. Left uninvestigated; it broke the Browser entirely, so the legion
    comparison never actually ran.
- **Operational gotchas hit along the way (worth caution):**
  - **`deploy.sh` must run as the user, NOT `sudo`.** `sudo ./deploy.sh` runs the
    no-sudo `landing/install.sh` as root → web root deploys to `/root/...www`
    instead of `~/...www`, and `/browser/` 404s/ERRs. Run `./deploy.sh` (it `sudo`s
    per-step internally).
  - **Don't deploy mismatched shells to a multi-client xpra.** Flip-flopping the
    deployed shell while two devices are connected leaves them on different cached
    builds that can't agree to share — it manufactures the very loop you're chasing.
    If you must change the iframe/shell, bump `sw.js` VERSION and reload **all**
    devices before judging the result.
- **Diagnostic fast-path:** `xpra info :99 | grep clients=` — **one client = stable**
  immediately localizes it to multi-client stale state. Then read the live journal
  disconnect **reason** (`journalctl -u vibetop-browser-xpra -f`) *before* changing
  anything — `same uuid` = a client reconnecting, `session busy` = a sharing/steal
  mismatch, `missing remote username` = an auth/deploy problem. See
  [[bisect-against-known-good-first]], [[fix-root-cause-keep-the-feature]].

## Browser stuck at the phone's tiny size on the desktop (no way to re-claim)

- **Symptom:** Open the Browser on a phone and the shared xpra display shrinks to
  the phone's viewport **for every client**, including the desktop — and unlike the
  Terminal (double-click re-claims the shape) there was **no way** to grow it back
  on the desktop. It stayed the little size.
- **Cause:** The Browser is a **single shared** xpra `start-desktop :99` display, so
  its resolution belongs to whichever client connected/resized last. xpra's HTML5
  client advertises its size via `_screen_resized()` → `send([configure_display,
  {"desktop-size":[container.clientWidth, container.clientHeight], …}])`, and the
  server RANDR-resizes the one display to match. When the phone connects it sends
  its small size and the display shrinks everywhere. The desktop **can't** re-send
  its size on its own: `_screen_resized()` early-returns unless **this client's**
  `container` actually changed (`container.clientWidth !== desktop_width`) — and the
  desktop's window never changed, the *phone* shrank the display. Same "same-size =
  no-op" wall as the Terminal re-claim (SIGWINCH only fires on a real change).
- **Fix:** Patch 10 in `xpra-patches.js` — the Browser analogue of the Terminal's
  double-click/double-tap re-claim. On a **desktop double-click** *or* **mobile
  double-tap**, bust the guard (`client.desktop_width = -1`) and call
  `client._screen_resized()`, which re-sends **this** client's real container size →
  the server resizes the shared display to match. Reuses xpra's own packet-builder
  (monitors/dpi/vrefresh) so it survives xpra API drift. Two guards keep it
  unsurprising: (1) it re-claims **only when the display size DIFFERS from our
  viewport** — measured from the largest mapped window's `w`/`h` (`id_to_window`),
  which tracks the display in start-desktop mode — so an ordinary double-click/tap
  doesn't spam server RANDR resizes. **The mismatch is two-directional on purpose:**
  the desktop needs to GROW the display back (a phone shrank it) while the phone
  needs to SHRINK it (the desktop grew it), so a "smaller than me" test would work
  for the desktop but be a no-op on the phone (the display is *bigger* than the phone
  there) — the first cut shipped that one-directional guard and the phone double-tap
  did nothing; `abs(diff) > tol` fixes both. (2) It **never `preventDefault`s** the
  mouse path, so the double-click still reaches the remote Chromium (word-select etc.
  keep working); on touch the double-tap still fires its taps to the remote exactly
  as before — the re-claim is purely additive. Desktop double-click is detected from
  `pointerdown` timing (two within 400ms / 12px); the touch double-tap is detected in
  the patch-4 touch layer's `touchend` tap branch (two no-movement taps within
  400ms / 28px). Manual, like the Terminal — a shared display can only be one size,
  so the other device sees this one's size until *it* re-claims (symmetric; the
  accepted single-shared-display tradeoff, same reason window mirroring was removed).
- **Rejected:** **auto-reclaim** when the desktop is the active app — stable (the
  phone, whose container is unchanged, doesn't fight back) but it means the phone can
  **never** hold the display small while the desktop tab is open; manual keeps both
  devices in control, matching the Terminal. A dedicated **on-screen "Fit" button** —
  no gesture conflict, but adds chrome the desktop Browser doesn't have and breaks
  the Terminal muscle-memory the user already has. Hijacking double-click
  **unconditionally** (no "smaller than me" guard) — floods the server with a RANDR
  resize on every word-select double-click. See [[fix-root-cause-keep-the-feature]].

## Claude plan-usage strip: capturing the real Max-plan % (there is no query API), and the pinned-session footgun

- **Context:** The desktop wanted a live "session 51% · week 5%" strip showing the
  **real** Claude Max-plan usage. There is **no API to query plan usage** — the
  numbers exist only as `anthropic-ratelimit-unified-*` **response headers** on
  live API calls (`…-5h-utilization` = session 0..1, `…-5h-reset` = unix ts,
  `…-7d-utilization` = weekly, `…-representative-claim` = which limit binds). ccusage
  gives token/cost estimates, not the real plan %. So the only way to the real
  numbers is to **observe Claude Code's own traffic**.
- **Design:** an opt-in pass-through proxy (`claude-usage/vibetop-claude-proxy`,
  stdlib streaming, loopback) forwards every request to `api.anthropic.com` verbatim
  and records the usage headers to `~/.local/share/vibetop-claude-usage.json`. Claude
  Code is pointed at it via `ANTHROPIC_BASE_URL=http://127.0.0.1:7690`, set in
  `~/.claude/settings.json`'s `env` block — **verified** that `env` applies to
  Claude's *own* API base URL, not just the Bash tool, so it's the whole toggle (add
  the key = on, remove = off). The manager serves `GET/POST /api/claude/usage`;
  `desktop.html` renders the strip + a Start▸System toggle. Fail-open (a proxy error
  relays 502; capture never affects the relayed stream); the connection is closed
  per-response to delimit the de-chunked body.
- **Symptom (the footgun):** while test-toggling the feature, **this operator's own
  live Claude session started throwing `API Error: Unable to connect to API
  (ConnectionRefused)`** — repeatedly — while *other* Claude sessions on the box were
  fine. It looked like the proxy was crashing/flapping.
- **Cause:** NOT a crash — `NRestarts=0`, no OOM. A Claude Code session reads
  `ANTHROPIC_BASE_URL` **once at startup** and is **pinned** to it for its whole
  life. The operator's session had started while the feature was on, so it was
  routing through `127.0.0.1:7690`. The **disable** path ran `systemctl stop` on the
  proxy — pulling the socket out from under that still-running, pinned session →
  ConnectionRefused on every request until systemd's `Restart=` brought it back.
  Removing the env from settings.json does **not** rescue a process that already
  cached it; only a restart of that session would. Lightweight standalone sessions
  weren't pinned, so they were unaffected — which masked the cause as
  session-specific flakiness.
- **Fix:** **disable must never stop a proxy that live sessions are pinned to.**
  `_set_claude_usage(False)` now removes the env (so NEW sessions stop routing) and
  runs `systemctl disable` **without `--now`** — the boot-time start is removed but
  the running process is **left alive** for pinned sessions. The idle loopback proxy
  is harmless when nothing routes to it and is gone on the next reboot, by when no
  session is still pinned. Enable stays `enable --now` **then** write env (start
  before routing). A unit test (`test_claude_usage.py::test_toggle_ordering_and_proxy_left_running`)
  pins "no `--now` on disable" so this can't regress.
- **Corollary — testing the toggle can knock over the tester.** Because the dev
  session doing the work can itself be pinned to the proxy, exercising the on/off
  toggle from that session is self-endangering. Test proxy/settings changes from an
  **isolated subagent or a nested `claude -p` with its own env**, and **never stop
  the proxy** while any pinned session is live. (The disable-doesn't-stop fix makes
  the common case safe, but a hard stop/reboot/uninstall still breaks pinned
  sessions — that's inherent to routing a long-lived client through a local proxy.)
- **Rejected:** **OTEL / ccusage for the real %** — ccusage is tokens/cost only (an
  estimate, not the plan %); OTEL (if it even exports the unified gauge) is more
  moving parts than a header tap. **A TLS-intercepting forward proxy** (mitmproxy +
  a trusted CA) — captures HTTPS headers too but needs cert trust; pointing
  `ANTHROPIC_BASE_URL` at a plain-HTTP local proxy that does its own upstream TLS
  avoids all of that. **Scoping the env to vibetop terminals only** (instead of the
  global settings.json that also catches the operator's dev session) would avoid
  pinning the dev session at all — a cleaner future design, but it needs per-terminal
  env injection; the global toggle is simpler and, with disable-doesn't-stop, safe
  enough. See [[fix-root-cause-keep-the-feature]].
- **Second bug — the toggle "did nothing" in the UI (silent swallowed error).**
  *Symptom:* clicking Start ▸ System ▸ Claude Usage flipped the **server** state
  (POST succeeded) but the desktop never showed the strip or updated the row — on
  load *or* after clicking — with **zero console errors**. *Cause:* the usage
  `(function claudeUsage(){…})()` IIFE was appended **outside** desktop.html's main
  script wrapper (the same wrapper whose local `var`s make `window.APPS`
  `undefined`), so `updateToggleRow()`'s reference to the outer `menuEl` closure var
  was a `ReferenceError`. `render()` calls `updateToggleRow()` **first**, so it threw
  before touching the strip — and `poll()`'s `.then(render).catch(function(){})`
  **swallowed** the throw, so every render silently died with no log. `toggleClaudeUsage`
  itself only touches IIFE-local vars, which is why the POST still worked and masked
  it as a "server didn't react" bug. *Fix:* the IIFE is now self-contained — it looks
  the row up with `document.querySelector('.sm-item[data-id="claudeusage"]')` instead
  of the outer `menuEl` — plus an **optimistic** update (reflect the new state
  instantly, since the POST runs `systemctl` and isn't immediate, then reconcile on
  the next `poll()`). *Lesson:* a blanket `.catch(()=>{})` on a fetch chain hides
  render-time exceptions; when a handler's network side-effect works but the DOM never
  changes, suspect a **swallowed throw in the render path**, and verify by driving the
  real page headlessly (CDP) rather than by reading the code — static review kept
  reporting the logic as "correct." Same family as the "clickable chrome next to an
  app iframe" runtime traps that only a real browser catches.

## Terminal/Files link → embedded Browser silently stopped opening (RestrictNamespaces vs snap-confine)

*Symptom:* clicking a URL in a terminal (or a Services card's "⧉ Browser", or a
Files "Open in Browser") **switched to the Browser app but the page never
loaded** — the embedded Chromium stayed on its previous tab. `POST
/api/browser/open` returned `{"ok":true}`, and running the *exact same*
`su - <user> -c '… /snap/bin/chromium --user-data-dir=… "<url>"'` command by hand
(or via `systemd-run`, or a root `subprocess.Popen`) opened + foregrounded the tab
correctly. Only the invocation **from the running `vibetop-manager` service**
failed — deterministically. "It worked 20 minutes ago" was the tell: it broke the
moment the manager was **restarted** (for an unrelated feature), not on any code
change to the browser path.

*Cause:* the manager unit carried **`RestrictNamespaces=yes`** (added in v1.11.0's
security hardening). Snap Chromium launches through **`snap-confine`, which creates
a mount namespace** — `RestrictNamespaces=yes` blocks that syscall for the service
*and all its children*, so the hand-off `chromium <url>` couldn't start its confined
sandbox and died before reaching the already-running instance's singleton socket.
`Popen` still succeeded (it forked `su`), so the handler reported success and the
failure was invisible. It stayed dormant for months because the *running* manager
process predated the directive being loaded; restarting it activated the
restriction for the first time. (The same directive silently breaks the X11
Launcher's snap-app launches — Firefox/Chromium on `:98`.)

*Fix:* remove `RestrictNamespaces` from `terminal/systemd/vibetop-manager.service`.
The manager already turns OFF `NoNewPrivileges`/`ProtectHome`/`PrivateTmp`
on purpose (they'd break `su`/home/session-sockets); `RestrictNamespaces` belongs
in that same "incompatible with what this service must do" bucket, because the
service's job includes launching confined **snap** apps. A unit change needs
`daemon-reload` + manager restart (the in-app Update runs with `INSTALL_SYSTEMD=0`,
so it will NOT pick this up — a full `deploy.sh`/`terminal/install.sh` or manual
unit edit is required).

*How it was found:* isolate manager-vs-manual by handing the URL off directly and
watching the xpra window title flip (`DISPLAY=:99 wmctrl -l`) — title change =
hand-off + foreground both worked. Every context (manual `su -`, `systemd-run`,
root `Popen`) foregrounded; only the live service didn't, and adding
`-p RestrictNamespaces=yes` to a `systemd-run` reproduced the failure exactly.

*Rejected:* allowlisting namespace types (`RestrictNamespaces=mnt user …`) — snap
-confine's exact set is fiddly and version-dependent; launching the hand-off via
`systemd-run --scope` to escape the sandbox — extra moving parts for a service
that's already root-with-`su` (so the directive bought little real isolation
anyway).

## Mobile haptics for the arrow-key trackpad — no usable iOS web path (Android only)

*Goal:* a small buzz when a slide on the on-screen arrow keys locks into
"trackpad" mode, so there's tactile confirmation the pad engaged.

*What works:* `navigator.vibrate(12)` on the axis-lock. Fires on **Android
Chrome**. On **iOS Safari (incl. standalone PWA) the Vibration API doesn't
exist**, so it's a silent no-op there.

*The iOS dead-end:* iOS 17.4+ plays a subtle system haptic when an
`<input type="checkbox" switch>` toggles, and the community trick is to click a
hidden one from within a user gesture. It does **not** work here, for two
compounding reasons found by testing on-device:
- **Off-screen (`top:-9999px`) → no haptic at all.** iOS only plays the toggle
  haptic when the switch is actually **rendered in the viewport**. (Confirmed the
  device's system haptics were on — the terminal's native long-press *text
  selection* buzzed fine the whole time; only our synthetic toggle was silent.)
- **In-viewport → it steals focus and drops the keyboard.** Rendered at 1×1
  opacity:0 so it *can* buzz, clicking the `<label>`/switch moves focus to the
  checkbox, which blurs the terminal's input (2 iframes down) → iOS hides the
  on-screen keyboard → **the arrow keybar itself disappears** (it only shows
  while a keyboard is up). Blurring the switch + refocusing afterward doesn't
  help: from the top document `activeElement` is the *iframe element*, not the
  inner input, so the keyboard's already gone. `preventScroll`/`pointer-events`
  don't stop the focus move.

So on iOS the switch hack is strictly lose-lose: off-screen = no buzz,
on-screen = broken keyboard. Reverted to `navigator.vibrate`-only.

*Rejected:*
- `<input switch>` toggle hack (both placements — see above).
- Reaching cross-frame to refocus the terminal input after the toggle — fragile,
  and the keyboard has already begun animating down by then; not worth it for a
  buzz.

*If revisited:* the only real iOS haptic path is native (a WKWebView host app
bridging `UIImpactFeedbackGenerator`, or a Capacitor/Cordova wrapper) — out of
scope for a pure PWA. Don't re-try the `<input switch>` route; it was tested
on-device (iOS PWA) and fails as documented.

## Mobile terminal goes fully blank after `clear` (stale iOS reveal-scroll)

*Symptom:* On the phone, running `clear` (or anything that redraws from the top —
`Ctrl-L`, a TUI repaint) turns the terminal into an **all-black screen**. The
prompt is gone; it comes back only once you type a key or drag to scroll. Desktop
is unaffected.

*Cause:* The mobile input overlay (`terminal-kbd.js`) parks its transparent
textarea caret at `cursorY × rowHeight + KBD_BAR_RESERVE` (`positionCaret`), and
relies on **iOS to reveal-scroll the document** so that caret sits above the
keyboard. iOS only reveal-scrolls on *user* caret events — it never scrolls when
*we* move the caret. So when `clear` yanks the cursor from a deep row to row 0,
`paddingTop` drops but the document stays scrolled down (iOS left it where the
deep caret was), now over the **cleared/empty** region — the prompt is at the top,
scrolled off the top of the screen. Verified with Playwright/WebKit: after `clear`
the xterm **buffer is correct** (prompt at row 0, `viewportY 0`, scrollback
cleared), but `document.scrollingElement.scrollTop` stayed non-zero and the
`.xterm-screen` top measured **above** the viewport (negative `top`). It self-heals
on the next keystroke/scroll because that re-triggers an iOS reveal.

*Fix:* In `positionCaret`, after updating `paddingTop`, if the caret is high
enough that everything above it already fits in the visible band
(`y <= visualViewport.height - rowHeight`), pin the document back to the top
ourselves (`document.scrollingElement.scrollTop = 0`). This runs on `onCursorMove`
(which `clear` fires), so the reset lands exactly when the cursor jumps up. The
guard is deliberately one-sided:
- **Deep caret** (`y > visible height`, i.e. typing at the bottom of a full screen
  with the keyboard up) → **left alone**, so the working bottom-reveal is untouched.
- **Manual scrollback** fires no cursor-move, so `positionCaret` doesn't run and
  the reset never fights a user drag.
- **Keyboard down** → `visualViewport.height` is full, so the caret always "fits"
  and any residual reveal-scroll is cleared — which is correct, since the document
  should never be scrolled when the keyboard is down (xterm's own viewport picks
  the visible rows).

*Rejected:*
- Detecting the `ED 2`/`ED 3` (`\E[2J`/`\E[3J`) escape specifically to scroll to
  top — narrower and more fragile than keying off the caret position, which also
  covers `Ctrl-L` and any TUI that redraws from the top.
- Resetting scroll on overlay `blur` — would fight a user who scrolled back through
  history and then dismissed the keyboard.

## Mobile terminal: the trackpad slide / a device switch corrupts typing (stale value-diff mirror)

*Symptom:* On the phone, "occasionally the touch slide interferes with the
keyboard — it can't type, types in the wrong place, or even dumps a bundle of
characters. Happens most during device switching."

*Cause:* The touch overlay (`terminal-kbd.js`) mirrors the current input line in a
hidden `<textarea>` and forwards a **value-diff** (`ov.value` vs `lastSent`) to the
PTY. That mirror silently desyncs whenever the shell line changes **out-of-band**
from the overlay — and then the next diff is computed against a stale baseline,
emitting spurious backspaces or dumping the whole delta as a bundle. Two triggers,
matching the report exactly:
- **The arrow-key trackpad slide.** It sends `Ctrl+F`/`Ctrl+B`/arrows straight to
  the PTY (`kbd-key` → `sendRaw`), moving the **shell** cursor — but the overlay
  still assumes edits append at its textarea's end. The next backspace/keystroke is
  diffed against a line whose cursor has moved → wrong place / bundle.
- **Device switching.** Returning from the background reconnects the WS and redraws
  the shell line, but the refocus arrives as a **bounce** (xterm steals focus on
  reconnect → the `focusin` guard bounces it back with `__termBouncing=1`). The
  focus handler deliberately **skips** the baseline reset during a bounce (to protect
  a char in flight during *active* typing) — so the stale mirror survives into the
  new session and the first keystroke corrupts the line.

*Fix (`terminal-kbd.js`):* re-ground the mirror whenever the line may have changed
out-of-band. `resetBaseline()` (`ov.value=''`, `lastSent=''`, drop any pending
flush) is now called: (1) in the `kbd-key` handler after every trackpad/arrow/^C/
Esc/Tab byte; (2) on `visibilitychange`→visible (the device-switch path); and (3)
the bounce-skip in the focus handler is **time-gated** — it only preserves the
baseline for a bounce within 1.5 s of the last real keystroke (genuinely mid-typing);
a bounce after any idle gap (reconnect / background return) resets. After a reset the
next keystroke is sent as a clean delta from the shell's real cursor: append → the
char; backspace on an empty overlay → a single DEL. Verified with Playwright/WebKit
by capturing the PTY byte stream: `hello` + `ArrowLeft` + `hi` now sends
`h,e,l,l,o,\e[D,h,i` (was `…,\x7f\x7f\x7f\x7f,i`); a hidden→visible cycle then `x`
sends just `x`; normal typing + backspace is unchanged (`a,b,c,\x7f`).

*Rejected:*
- Teaching the mirror to track the shell cursor position (so mid-line edits map
  correctly) — the overlay can't observe the shell's cursor without parsing the
  output stream; re-grounding to empty is simpler and robust, at the cost of losing
  textarea-native mid-line editing (rare on a terminal, and already unsupported once
  the shell cursor moves).
- Resetting on the overlay's `blur` — would fight a user who scrolled back and then
  dismissed the keyboard, and misses the trackpad case (no blur happens there).

## Mobile terminal resize: two-finger tap, not single-finger double-tap (iOS keyboard conflict)

*Goal:* a touch gesture to re-claim the shared PTY's shape for this device
(`claimSize()`), the mobile analogue of the desktop's double-click.

*Symptom (the dead end):* a single-finger **double-tap** on the terminal was tried
first. With the keyboard **hidden** it was unusable: the first tap raises the iOS
keyboard (native focus of the input overlay), which slides up **under the finger**,
so the **second tap lands on a keyboard key and types a stray character** — and iOS
delivers that tap to the system keyboard, not to our overlay, so there's *also* no
resize. Even with the keyboard already up, a double-tap on the editable overlay pops
iOS's native **Paste** bubble / word-select. Tuning the double-tap detection
(duration vs. `didScroll`, window/px tolerances) improved *registration* but could
never fix the stray-key problem — that tap is physically on the system keyboard.

*Root cause:* iOS only raises the keyboard when an input is focused **inside the tap
gesture itself**. So the first tap *must* raise the keyboard for single-tap-to-type
to work, and a delayed/deferred `focus()` (to "wait and see" if a second tap is
coming) does **not** raise the keyboard on iOS. There is no way to have "single tap
raises the keyboard" and "double tap raises no keyboard" from the same finger.

*Fix:* make the resize a **two-finger tap**. Two fingers never focus the overlay
textarea, so **no keyboard ever rises** — safe regardless of keyboard state.
`preventDefault` on every touchend of the two-finger gesture blocks stray focus;
`claimSize()` fires once all fingers lift within 600ms. Single-finger double-tap is
left entirely to iOS (native selection / Paste). A versioned-key coach hint
("two-finger tap to resize…") teaches it. Verified in Playwright/WebKit with the
legacy `document.createTouch`/`createTouchList` API (Playwright's `touchscreen` is
single-finger only): two-finger dispatch fires the resize and leaves the overlay
unfocused (keyboard down); real-device confirmation from the operator.

*Rejected:*
- **Single-finger double-tap, any variant** — stray key from the risen keyboard
  (hidden) or the Paste bubble (up); unfixable, it's how iOS routes the 2nd tap.
- **Gating single-finger double-tap to keyboard-up only** (an interim step, on
  `ovFocused`) — removed: still popped the Paste menu, and split the gesture
  confusingly across keyboard states.
- **Deferring the keyboard to disambiguate** — a `setTimeout`'d `focus()` won't
  raise the iOS keyboard (must be in-gesture), so single-tap-to-type would break.

## Coach banners: show every time until ×, with a persisted max-showings cap

*Context:* the two blue coach tips (terminal two-finger-resize; desktop arrow-key
trackpad) started as "nudge a few times per session, then auto-hide, and retire the
moment the user does the gesture." The operator wanted them **more discoverable**:
show **every time** and only disappear when the user explicitly taps the **×**.

*Design:* no auto-hide, no per-session cap, and doing the gesture does **not**
dismiss the banner — only the × persists `done` (localStorage). Safety net so it
can't nag forever if the × is never tapped: a **persisted show-count** capped at
`TF_MAX`/`HINT_MAX` (10); the count is stored under the same key (an integer) until
the × writes the `done` sentinel. The banner text states the cap ("shows up to 10
times — tap × to dismiss") with the number interpolated from the constant so copy
and behavior can't drift.

*Gotcha — resetting dismissed state:* changing a tip's behavior doesn't re-show it
to anyone who already dismissed the old one (their `done` flag suppresses it). The
fix is to **version the localStorage key** (`…:v2`); bumping the `:vN` suffix
re-runs the "campaign" for everyone. This is why the operator "didn't see the tip"
after the behavior change — their old `vibetop:2fingerhint` was still `done`.

## Mobile terminal: can't scroll back through a *live* Claude/TUI response (desktop was fine)

**Symptom.** On the phone, scrolling up to read earlier output *while Claude Code
(or any full-screen TUI) is mid-response* snapped the view straight back to the
bottom on every frame — you could only scroll once the turn finished. On the
**desktop the exact same session scrolled fine.** The desktop-vs-mobile split is
the whole clue.

**Cause.** *Not* the scroll buffer. xterm's `viewportY` holds its scrolled-up
position through streaming output on both platforms — verified once the test
stopped sending a stray `\r` (an Enter counts as user input and triggers xterm's
own `scrollOnUserInput` snap-to-bottom, which faked a "yank" in every early
repro). The real culprit is the **mobile-only input overlay** (`terminal-kbd.js`):
on touch it parks a transparent textarea's caret on the cursor row via a dynamic
`padding-top` (`positionCaret`) so iOS reveal-scrolls the *prompt* above the
keyboard. `positionCaret` is bound to `onCursorMove` — and a TUI repaints its
region **in place**, moving the cursor on every frame (Claude Code doesn't even
grow scrollback mid-turn: `baseY` stays put while it rewrites the live screen). So
each repaint re-parked the caret at the bottom and iOS re-revealed it, dragging
the *visible* view down even though `viewportY` never moved. Desktop has no
overlay/caret/reveal, so its scroll just held.

**Fix.** Gate `positionCaret`: when the user has scrolled up into scrollback
(`baseY - viewportY > 1`) it early-returns and does nothing. Its only job is
revealing the prompt while you type *at the bottom*; up in history it was purely
fighting the user. Normal cases are unaffected (at the bottom the gate is off, so
caret-park + the `clear` scroll-reset still run). Verified on WebKit: scrolled-up
view HELD + `padding-top` frozen during a TUI animation, while typing at the
bottom still tracked the cursor row.

**Rejected.** A terminal-side "scroll lock" (buffer output while scrolled up, catch
up on release) — Claude Code (Ink) emits cursor **queries** mid-render and waits
for replies, so intercepting/buffering its byte stream risks stalling it. Not
worth the fragility when the actual bug was our own overlay, not xterm.

## Snap GUI apps fail on the X11 display with "Authorization required" (xhost +local: is not enough)

**Symptom.** Launching a **snap** GUI app (Firefox, Chromium) from a Terminal or
`/api/x/launch` onto the X11 display `:98` prints snapd mount-namespace warnings
(harmless) and then dies with **`Authorization required, but no authorization
protocol specified`** — even though the unit already runs `xhost +local:` and the
`:98` ACL shows `LOCAL:`. Native apps (`eog`, `xterm`, `xeyes`) work fine.

**Cause.** Two things compound:
1. A confined snap **can't read `~/.Xauthority`** — the snap `home` interface
   grants non-hidden files in the real home but **excludes dotfiles**, and that's
   exactly where the `:98` cookie lives (Xorg was started `-auth ~/.Xauthority`).
   So the snap sends **no auth cookie** and must fall back to the host ACL.
2. `xhost +local:` (`FamilyLocalHost`) is **not honored for the Unix-socket
   connection** by this X server. Proven directly: a no-cookie client
   (`env XAUTHORITY=/dev/null xdpyinfo`) got `Authorization required` under the
   `LOCAL:` ACL, but connected (`name of display: :98`) the moment
   `xhost +si:localuser:<user>` was added.

**Fix.** Use the **server-interpreted local-user** grant, not `local:`:
`--start="xhost +si:localuser:@APP_USER@"` in `vibetop-x11-xpra.service`
(`browser/install.sh` renders `@APP_USER@`). `si:localuser:` uses the socket peer's
credentials (`getpeereid`) and reliably grants that user with no cookie. Tighter
than `+local:` too (one user, not any local user) and safe here (loopback-only,
single-user, behind Access). Native apps are unaffected — they read the cookie.
NB: a unit change only lands on a full deploy / `browser/install.sh`
(`INSTALL_SYSTEMD=1`), **not** the in-app Update (`INSTALL_SYSTEMD=0`); patch the
installed unit + `daemon-reload` (no restart needed — a live `xhost` on the
running display holds until it restarts) to fix an existing host in place.

**Rejected.** `xhost +` (disable access control entirely) — works, but broader than
needed; `+si:localuser:` grants exactly the one user. Relocating the xauth cookie
to a non-dotfile the snap can read — more moving parts than a one-line ACL grant.

---

## Public file-share links (Files app) — punching a hole through Access, safely

- **Symptom / need:** the Files app can browse the host as `APP_USER`, but there was
  no way to hand a file to someone who isn't a vibetop user — every URL is behind
  Cloudflare Access (tunnel) or the LAN boundary. Ask: a **passwordless, read-only
  public link** to a file (and, later, a folder), secured by an unguessable token.
- **Cause:** a public link is deliberately reachable **without** auth, so the whole
  existing trust model ("anyone past Access is `APP_USER`") doesn't apply to it — the
  token has to be the *only* gate, and the serving path has to be locked down.
- **Fix — capability token + tightly-fenced serving** (`terminal-manager.py` +
  `/s/` nginx location + `filebrowser-patches.js`):
  - **Token = `secrets.token_urlsafe(16)`** (128-bit random), stored in a server-side
    registry (`~/.local/share/vibetop-shares.json`). Random > "hash of the path" (a
    path hash is guessable if the path is known). Stateful (not a self-signed JWT) so
    links can be **listed and revoked** — revocation is a safety feature, and a
    stateless token can't be revoked.
  - **Read-only, GET/HEAD only**, on a dedicated top-level path `/s/<token>` (not under
    `/api/`) so the Cloudflare Access **Bypass** app is cleanly scoped (manual operator
    step — can't be automated in code; see `tunnel/README.md` §8). On the LAN nginx is
    the only gate, so it just works.
  - **Fenced to `SHARE_ROOT` (default = home) + no dotfiles** via `_safe_share_target`
    — stricter than `_resolve_under_home`: rejects any dot-segment (`~/.ssh`,
    `~/.config/*`) and anything outside home, so a public link can never publish
    `/etc/*` or a secret even though FileBrowser's root is `/`. Re-validated on **every**
    fetch (symlink-resolved) so a moved/replaced/now-dotfile target 404s.
  - **Same-origin XSS guard** (the subtle one — the file is served from the app's own
    origin): every `/s/` response sets `X-Content-Type-Options: nosniff` +
    `Content-Security-Policy: default-src 'none'; sandbox`, and only a safe allowlist
    (images / PDF / text / audio / video) is served `inline`; **everything else —
    notably `.html`/`.svg` — is forced to an `attachment` download** as
    `application/octet-stream`, so a shared file can't run JS in-origin. `?dl=1` forces
    download for anything. Unit-tested (`test_api_share.py`).
  - **Folders → on-the-fly `.zip`** (`_serve_share_zip`): built to a temp file then
    streamed, skipping dotfiles/dot-dirs and any symlink escaping the fence, capped by
    `SHARE_ZIP_MAX_FILES`/`_BYTES`. Files stream in 64 KB chunks with single-`Range`
    (`206`) support for media seek.
  - **Expiry (default 7 days) + revoke**, both lazily pruned; the Share dialog's
    **Manage links** lists all active shares with per-link copy/revoke.
- **Rejected:** a stateless signed token (`_jwt_sign`) — no revocation/listing; a
  path *hash* as the token — guessable; serving under `/api/share/<token>` — muddies
  the Access-bypass scope with the authed API; allowing the whole FS (FileBrowser's
  root) — unsafe for a public link, so home-only is the default (`SHARE_ROOT` env
  widens it); `X-Accel-Redirect` offload to nginx — better for huge files but splits
  the security-critical serve across two components; kept it in one auditable place
  (noted as a future perf option). A separate `share.example.com` origin would beat
  the same-origin XSS risk outright but needs extra DNS/Access setup — the
  attachment+`nosniff`+sandbox-CSP mitigation covers it for v1.

---

## Multi-user auth (Phase 1): Linux-account login, where the gate lives

- **Context:** Making vibetop multi-user (Option B — a web remote-desktop for the
  host's *real* Linux users; see `docs/multi-user.md`). Identity = the host's Linux
  accounts via **PAM**; login is username+password (LAN direct, tunnel behind
  Cloudflare Access first), remembered 7 days. Isolation is Unix permissions =
  SSH-equivalent (a host-root user is root through vibetop — by design). This entry
  records the non-obvious *where/how* of the auth gate; the per-user runtime
  (services running as each user) is a later phase.
- **PAM via `ctypes`, not a pip module.** The manager is stdlib-only (hand-rolled
  JWT, multipart, sd_notify). `_pam_authenticate` loads `libpam.so.0` via ctypes and
  runs a single-shot conversation (`pam_authenticate` + `pam_acct_mgmt`) against the
  `vibetop` PAM service (`/etc/pam.d/vibetop` → `common-auth`/`common-account`, dropped
  by `terminal/install.sh`). The session cookie **reuses `_jwt_sign`/`_jwt_verify`**
  (one signing primitive) over `{u, exp}`, keyed by a root-owned
  `/etc/vibetop/session.secret`. `_authenticate` is a seam tests monkeypatch, so the
  whole flow is hermetic (no real creds).
- **The gate: nginx `auth_request` → the manager's `/api/authcheck`, with the
  public-path allowlist IN THE MANAGER.** Every protected location
  (`/`, `/api/`, `/tN/`, `/browser/`, `/x11-display/`, `/files/`, `/onlyoffice/`) has
  one line — `auth_request /internal/authcheck` — and `/internal/authcheck` proxies to
  `/api/authcheck`, which allowlists the public paths (login/logout/authcheck,
  ping/health/metrics, `/api/office/{callback,doc}`) via the `X-Original-URI` header.
  - **Why the allowlist lives in Python, not nginx:** it's *one* testable policy
    (`_is_public_path`) instead of a dozen nginx carve-out `location` blocks, and it
    keeps the OnlyOffice **container** callbacks (server-to-server, no browser cookie,
    HMAC-authed) reachable without duplicating their proxy config. Verified end-to-end:
    a cookieless `/api/office/doc` returns **403** (allowlist let it *past the session
    gate*, then the manager's own HMAC rejected the forged path) — exactly the intended
    layering, not a 401.
  - **Loopback admin tooling is unaffected** because it hits `127.0.0.1:7680`
    **directly**, bypassing nginx and therefore the gate — the watchdog's `/api/ping`,
    `doctor.sh`, and `smoke-test.sh` keep working with no cookie. (Browser traffic can
    only reach the manager *through* nginx, where the gate applies.)
- **Rejected: gating `/api/` inside the manager.** Tempting (defense in depth,
  hermetic), but nginx-proxied browser requests and direct loopback-admin requests
  **both** arrive at the manager from `127.0.0.1`, so the manager can't tell "trusted
  local curl" from "hostile LAN client via nginx" by source IP. Gating at nginx (which
  loopback admin bypasses) draws that line cleanly.
- **LAN TLS: redirect http→https only for LAN clients, only on the credential pages.**
  A Linux password is POSTed to `/api/login`, so LAN clients must use https
  (self-signed by default, `TLS_CERT`/`TLS_KEY` to override; `ENABLE_TLS=0` opts out
  with a cleartext warning). The redirect is `set $vt_up "$scheme$vt_is_lan"; if
  ($vt_up = "http1") return 301 https…`, placed **only** in `location = /` and
  `location = /login.html`.
  - **Two carve-outs that a blanket redirect would break:** (1) the **tunnel** — over
    Cloudflare the browser is already https and cloudflared reaches nginx on http from
    **loopback**; `$vt_is_lan` is 0 for `127.0.0.1`/`::1`, so the tunnel hop is never
    redirected (TLS is terminated at Cloudflare's edge). (2) the **OnlyOffice Docker
    callback** — the container reaches the host via `host.docker.internal`, i.e. the
    Docker bridge IP (non-loopback → `$vt_is_lan`=1), so a *server-wide* redirect would
    301 its http callback; scoping the redirect to `/` and `/login.html` (never
    `/api/`) leaves the callback on http. Both verified live: loopback http `/` → 302
    to `/login.html` over **http** (not https); LAN-IP http `/` → **301 to https**;
    LAN-IP http `/api/office/callback` → **not** redirected.
  - **`http2 on;` avoided** — it's nginx ≥1.25 syntax; Ubuntu 24.04 ships 1.24 (fails
    config test). HTTP/2 does nothing for the WebSocket-heavy traffic anyway.
- **Rejected: a separate front "gateway" service** (the Firecracker-era design). For a
  single host with the manager already central and root, extending nginx (`auth_request`)
  + the manager (PAM + session) is far less moving-parts than a new reverse-proxy
  process, and reuses the existing loopback trust boundary.

---

## Multi-user Phase 3: per-user terminals run AS the logged-in user

- **Context:** A Terminal must be a real shell as the *authenticated* Linux user in
  their own `$HOME` (not the single deploy user). Each `(user, N)` runs as a
  `systemd-run --uid=<user>` transient unit — `vibetop-uterm-<user>-<N>` (the
  session daemon) + `vibetop-uttyd-<user>-<N>` (ttyd) — with the `vibetop-session`
  instance id `<user>-<N>` (socket `/tmp/vibetop-session-<user>-<N>.sock`) and a
  **per-user ttyd port** from a small registry-assigned slot
  (`/var/lib/vibetop/users.json`: `port = USER_TERM_BASE + slot*PER_USER_TERMS + N`).
  nginx routes `/tN/` to that port via the `authcheck` subrequest (`X-Term-Port` →
  `auth_request_set` → `proxy_pass`), cold-starting the terminal on first hit.
- **Why `systemd-run` transient units, not the `@N` templates:** a system-unit
  template can't set `User=` from its instance (`%i`), so per-user terminals can't
  reuse `vibetop-ttyd@N`. `systemd-run --uid` runs as the user with no pre-installed
  per-user unit files and cleans up on stop (`--collect`). (The `@N` templates are
  still installed but unused.)
- **The 203/EXEC trap — the per-user helper scripts must live OUTSIDE the operator's
  home.** First live run failed silently: `/api/terminals/1/start` returned 200 but
  the unit died instantly with `Failed to execute …/vibetop-session: Permission
  denied` (status **203/EXEC**). Cause: the checkout lives in the operator's `$HOME`
  (mode **0750**), so *another* Linux user can't traverse in to exec `vibetop-session`
  / `ttyd-run.sh`. Fix: `terminal/install.sh` installs **root-owned 0755 copies** to
  `/usr/local/lib/vibetop/` (matching the existing `browser-loop.sh` precedent) and
  the manager execs them from there (`_term_helper`, falling back to the checkout for
  dev/tests). This is the *minimum* of the `docs/multi-user.md` `/opt/vibetop` move —
  enough to let per-user terminals launch; the full relocation is Phase 4 hardening.
  Only surfaced on a real multi-user host (the deploy user could always exec its own
  files; the hermetic tests don't launch real units).
- **ttyd-run.sh generalized** to `(<instance-id> <port> <base-N>)` — the instance id
  drives `vibetop-session attach` (per-user), while `-b /tN/` + the title use the base
  number the browser reaches; the legacy single-arg numeric form still works.
- **Everything per-user is scoped by identity:** `_list_running_terminals(user)` (its
  `_cached` key is `running_terminals:<user>`), `/api/terminals/status`, and
  `/api/reset` all act on the request user's own terminals only. `vibetop-session`
  already accepted a *string* instance (socket path is `…-{instance}.sock`), so the
  compound `<user>-<N>` id namespaced cleanly with no daemon change.
- **Rejected: `systemd --user` per user.** Cleaner in theory (implicit `User=`) but
  needs a live user manager + linger + `XDG_RUNTIME_DIR` wiring per user before any
  terminal can start; `systemd-run --uid` from the root manager is simpler and has no
  such bootstrap. (Linger is still enabled in `_provision_user` so `/run/user/<uid>`
  D-Bus/XDG exist for GUI apps launched from the shell.)

---

## Multi-user Phase 3b/review: per-user Files + "admin-gate the not-yet-per-user"

- **Per-user Files.** FileBrowser now runs per user (a `systemd-run --uid` transient
  unit `vibetop-ufiles-<user>`, per-user port `FB_APP_BASE + slot`, per-user DB),
  **rooted at the user's home** (`--root/--scope <home>`) so it opens at `~`, can't
  escape it, and its writes have the user's own permissions. The shared single-user
  `vibetop-filebrowser.service` is retired. Rooting at home (not `/`) also let the
  `@APP_HOME@` front-end patches keep working by stamping it **empty** (home = the
  FileBrowser root = `/`), avoiding a runtime `whoami` fetch in the fragile
  `filebrowser-patches.js`. nginx `/files/` routes to the per-user port via
  `authcheck` → `X-App-Port` (the `/tN/` pattern). A `_wait_tcp` after launch stops
  the first hit from 502-ing before the service is listening.
- **The invariant the fable review caught — and the fix pattern.** A model-driven
  adversarial review found the real bug class: **the login gate was widened to every
  Linux user before Browser/X11/Files-raw-view/Claude-usage/Update were made
  per-user, so those still acted as `APP_USER`.** Concretely: `/fileview/` was
  *ungated* (unauthenticated arbitrary file read as the nginx worker — **critical**);
  `/api/x/launch` + `/api/browser/open` gave any user **RCE as the operator**;
  `/api/reset` tore down the shared Browser/X11 for everyone; `/api/claude/usage`
  read/wrote `APP_USER`'s `~/.claude`; `/api/update` let any user redeploy the host.
  - **Fix = `_require_admin()` (`_ctx_user() == APP_USER`) on every subsystem that
    still acts as the operator**, until it is per-user. Cookieless loopback/admin
    tooling is `APP_USER`, so it still passes; a non-admin session gets 403. `/reset`
    keeps the per-user terminal/desktop teardown for everyone but gates the shared
    Browser/X11 reset to the operator. `/fileview/`'s admin check lives in `authcheck`
    (not an nginx `if`, which evaluates in the rewrite phase *before* `auth_request`
    populates the user variable — so an `if ($vt_user != …)` 403s everyone, including
    the admin). **Takeaway: widen the authN gate and lock down authZ in the same pass
    — a per-request identity is not per-user isolation until every subsystem consumes
    it.**
- **Exact-match the public allowlist.** `_is_public_path` (and the CSRF exemption)
  matched `/api/office/{callback,doc}` with `startswith`, so `/api/office/doc-anything`
  was needlessly public. Now exact-match (split off the query, compare `==`). Not
  currently exploitable (the raw URI is forwarded unchanged and those handlers are
  HMAC-gated), but the fragile pattern is gone.
- **Verified live on Legion:** unauth `/fileview/etc/passwd` → login redirect (was a
  raw read); a non-admin session → 403 on `/fileview/` and every shared subsystem;
  per-user Files serves each user their own home; the operator (via an `APP_USER`
  session) still has everything.
