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

## GNOME apps (eog, evince) take ~33s to start in the X11 Launcher

- **Symptom:** Launching a GTK/GNOME app (eog, evince) from the X11 Launcher on
  the Apps display showed a blank canvas for ~33s before the window appeared;
  Firefox/Chromium/native apps (xterm) were instant.
- **Cause:** The Apps display (`:98`) is a bare `xpra start-desktop` + matchbox
  session — **no GNOME session**. GNOME services like `xdg-desktop-portal` are
  *activatable but hang* there (their backends wait for a session that doesn't
  exist). GTK apps query the portal on startup and block the **25-second D-Bus
  method-call timeout**. Evidence: `strace` showed eog threads each blocking in
  `poll()` for exactly ~25.0s on D-Bus fds; a direct probe of
  `org.freedesktop.portal.Desktop` activation timed at exactly 25.0s while
  gvfs/dconf/a11y returned in 0.0s.
- **Fix:** Run launcher apps against a **private D-Bus session with no service
  activation** (`claude-apps-dbus`, a `dbus-daemon` with no `<servicedir>`,
  socket `/run/user/<uid>/vibetop-apps-bus`). On it, those service calls fail
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

## Snap apps (Firefox/Chromium) won't open the Apps display

- **Symptom:** `firefox` from the launcher did nothing; log showed
  `Authorization required, but no authorization protocol specified` /
  `cannot open display :98`. Native apps (xterm) and `wmctrl` worked fine.
- **Cause:** Snap confinement — a confined snap launched *outside* xpra's own
  process can't read the X authority cookie, so the X server rejects it. Native
  same-user clients connect fine.
- **Fix:** `xhost +local:` at Apps-display startup (a `--start` in
  `claude-apps-xpra.service`) disables X access control for local clients. Safe:
  the display is loopback-only and the host is single-user behind Access.
  `x11-xserver-utils` (provides `xhost`) is an apt dep.

## Browser must stay its own app, but Apps needs its own canvas

- **Symptom:** Wanting a tabbed "launch GUI apps" experience *and* keeping the
  Browser (Chromium) as a separate app.
- **Cause:** One xpra display can only present **one canvas**. Chromium and any
  launched app share a single display, so two canvas iframes of the same display
  fight over size (a hidden iframe measures 0×0 and shrinks the display) — the
  same reason multi-device window mirroring was dropped.
- **Fix:** A **second xpra display** (`:98`, `claude-apps-xpra`, matchbox, no
  Chromium) dedicated to launched apps, proxied at `/apps-display/`. The Browser
  keeps `:99`. The X11 Launcher (`apps.html`) embeds the `:98` canvas with a tab
  bar; the two displays never conflict.
- **Rejected:** Merging Chromium into one tabbed "Desktop" (user wanted Browser
  separate); embedding a second canvas of `:99` in the launcher (size conflict).

## X11 apps launched from a Terminal should appear in the launcher

- **Symptom:** Running `gnuplot` (or any GUI app) in a Terminal had nowhere to
  render.
- **Fix:** `claude-web-session@.service` exports `DISPLAY=:98` +
  `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR`, so terminal-started GUI apps
  render on the Apps desktop and show up as tabs. The desktop also polls
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
  in `claude-web-ttyd@.service`; `ttyd-run.sh`'s `$(( @BASE_PORT@ + N ))` is a
  syntax error → ttyd never binds → terminals fail.
- **Cause:** The unit-render loop in `terminal/install.sh` only substituted
  `@APP_USER@`/`@APP_DIR@`, not `@BASE_PORT@`. Masked on existing hosts because
  the in-app Update runs `install.sh` with `INSTALL_SYSTEMD=0` (doesn't re-render
  units), so they keep their old correctly-rendered files.
- **Fix:** Added `@BASE_PORT@` (and the new `@APPS_DISPLAY@`/`@APP_UID@`) to the
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
- **Fix:** An indeterminate **progress bar** overlay in `apps.html` ("Launching
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
  and SIGWINCH is the whole propagation chain: `claude-session attach`'s SIGWINCH
  handler (`send_resize`, line ~439) writes the size + SIGUSR1s the serve daemon,
  which `TIOCSWINSZ`es the *shared* bash PTY and SIGWINCHes the shell. No SIGWINCH
  ⇒ nothing propagates ⇒ silent no-op. The old visible nudge worked precisely
  because `r-1 ≠ r` forced two real size changes (two SIGWINCHes).
- **Fix:** Keep sending straight to the socket (so the visible grid never resizes
  → no shake), but **nudge over the socket**: send `{c, r-1}` then `{c, r}`. Two
  genuine size changes → two SIGWINCHes → the shared PTY ends up at this device's
  shape, all without touching the visible xterm grid. Same trick as the original,
  one layer lower.
- **Rejected:** sending `c×r` once (the regression — same size, no SIGWINCH);
  a server-side "force resize even if unchanged" in claude-session (more surface
  area, and the kernel SIGWINCH suppression is upstream of it anyway — you'd have
  to bypass the SIGWINCH path entirely). The client-side nudge is the smallest fix.
