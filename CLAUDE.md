# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Six sub-projects deliver a unified "mini-OS" desktop experience on myhost (`192.168.1.10`), exposed publicly at `https://service.example.com/` via Cloudflare Tunnel with Access auth. The root page (`/`) is a desktop-like UI launchable from a Start menu with eight everyday apps (Home Service, Terminal, Browser, Files, Office, Notes, Monitor, Upload) plus an **Update** app in a separate "System" section.

| Sub-project | URL path | What |
|---|---|---|
| terminal | `/t1/`..`/t50/`, `/terminals/`, `/api/` | Dynamic persistent bash terminals (ttyd + claude-session) + manager API |
| browser | `/browser/` | Persistent Chromium viewable via xpra HTML5 client |
| landing | `/` | Unified desktop UI with tab bar, iframe viewport, and status bar |
| files | `/files/` | FileBrowser file manager rooted at `~` |
| office | `/onlyoffice/` | OnlyOffice Document Server (Docker) — in-browser Office editing via the manager's `/api/office/*` |
| tunnel | — | Cloudflare Tunnel + Access config for public HTTPS |

## Deploy commands

**Fresh host, one line** — `bootstrap.sh` is the curl-pipe installer: it checks
the OS is Debian/Ubuntu, installs `git`, clones (or `git`-updates) the repo to
`~/vibetop` (full clone so the in-app Updater works), then `exec`s `deploy.sh`.
It is the only step `deploy.sh` can't do itself — getting the repo onto the box.
Runs as a normal sudo user (it refuses root: the desktop runs as `APP_USER` and
`landing/install.sh` would deploy to `/root`). Flags after `-s --` pass through
to `deploy.sh`; env overrides `VIBETOP_DIR`/`VIBETOP_REPO`/`VIBETOP_REF`.

```bash
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
curl -fsSL .../bootstrap.sh | bash -s -- --no-office   # forward deploy.sh flags
```

**One command, whole stack** — `deploy.sh` orchestrates everything (deps + all
sub-installers in the right order + a health check), locally or to a remote host:

```bash
./deploy.sh                                  # deploy on this machine
./deploy.sh --remote junjie@192.168.1.20     # rsync to HOST:~/vibetop and deploy there
# flags: --no-browser  --no-files  --no-office  --with-tunnel  --dry-run
# (HOST is any ssh destination — user@ip or an ssh-config Host, not a bare shell alias)
sudo ./uninstall.sh                          # tear down the whole runtime (keeps repo + data + image)
```

It is fully self-installing on a Debian/Ubuntu host (incl. Docker) — no manual
prerequisites. Or run the per-project installers by hand (the order `deploy.sh`
uses). Each is idempotent, supports `--dry-run`, env-var configurable (see script
headers), and **only reloads nginx when its config actually changed** (a re-run
that changes nothing won't reload — which would otherwise sever live terminal/
Browser WebSockets; `nginx_write` returns the change as its pipe exit status):

```bash
sudo ./terminal/install.sh   # 1. nginx site skeleton (extras include) + manager API + ttyd
sudo ./browser/install.sh    # 2. xpra + Chromium (snap) + LibreOffice (office View) — extras snippet
sudo ./files/install.sh      # 3. FileBrowser at /files/ (binary + noauth config + extras snippet)
sudo ./office/install.sh     # 4. Docker + OnlyOffice Document Server at /onlyoffice/ (office Edit)
./landing/install.sh         # 5. desktop UI + static apps (no sudo — $HOME must resolve to the user's)
sudo ./tunnel/install.sh     # 6. cloudflared (tunnel setup is interactive — see tunnel/README.md)
```

Deps the installers handle automatically: `ttyd`/`nginx`/`acl` (apt), `xpra` (xpra.org
apt repo, suite derived from the OS codename) + `chromium` (snap) + `libreoffice`
(apt), the `filebrowser` release binary (pinned `FB_VERSION`, arch-aware), and
**Docker** (`docker.io`) running `onlyoffice/documentserver` (~2 GB pull, loopback
`:8087`, generated JWT secret at `~/.config/vibetop/onlyoffice.secret`). Scoped to
Debian/Ubuntu. Validated on AMD+NVIDIA and AMD+AMD hosts (GPU stats use
sysfs/amdgpu with an `nvidia-smi` fallback).

## Tests

Unit tests for the manager's security-critical and pure logic live in
`terminal/tests/` (pytest). They run without root or any of the systemd/nginx/
Docker stack — `conftest.py` loads the hyphenated `terminal-manager.py` via
`importlib` and puts `terminal/` on `sys.path` so its `import system_status`
resolves:

```bash
cd terminal && python -m pytest tests/ -q
```

Coverage targets the things where a silent regression is dangerous: the
shell-injection guard (`_valid_browser_url`), path-traversal guard
(`_resolve_under_home`/`OFFICE_RE`), hand-rolled JWT/HMAC (`_jwt_*`,
`_onlyoffice_sig`), the streaming multipart parser, upload-name sanitization,
atomic writes, the desktop-union liveness math, and the `system_status`
collector. Prefer adding a test here when touching any of those.

## Health check

```bash
systemctl status claude-web-manager claude-browser-xpra claude-web-filebrowser
docker ps --filter name=vibetop-onlyoffice                      # OnlyOffice container (office Edit)
curl -sI http://127.0.0.1/ http://127.0.0.1/t1/ http://127.0.0.1/browser/ http://127.0.0.1/files/
curl -s http://127.0.0.1/onlyoffice/healthcheck                 # -> true when the doc server is up
curl -s http://127.0.0.1/api/system/status
curl -s http://127.0.0.1/api/terminals/status
sudo systemctl status cloudflared
```

## Architecture

### Unified desktop (`landing/desktop.html`)

The root page at `/` is a Windows-style shell:
- **Start button** — always present at the taskbar's left. Clicking it toggles the **Start menu**, a launcher listing eight everyday apps (Home Service, Terminal, Browser, Files, Office, Notes, Monitor, Upload), then a separated **System** subsection with the **Update** app (set apart since it's rarely used), each with icon + description. Picking one opens it. (This replaced the old always-pinned tab bar.) **Home Service** is the old service-list page (`landing/index.html`, served at `/landing.html`) wrapped as a launchable app — it shows the service cards, health dots, and dynamic terminal chips. Its extra service cards (and their health-check targets) are **not** in the repo: they're read at runtime from a host-local, gitignored `~/claude-web-www/services.json` (format in `landing/services.example.json`). The page renders them from a direct `/services.json` fetch (LAN) or a parent `postMessage` relay (tunnel), and `terminal-manager.py` merges each entry's `key`/`health` into `/api/health` so the dots work — keeping personal hostnames/IPs out of git.
- **Taskbar apps** — only *opened* apps get a button (Windows-style), each with a close (×). Multiple apps can be open at once; the focused one is highlighted with a per-app accent underline. Buttons are **drag-reorderable** (HTML5 DnD — desktop only; it's a no-op on touch so tap/scroll are unaffected): dragover reshuffles the DOM live, dragend reads the new order back into `openApps` and persists it. The set of open apps, their order, and the active one are persisted **server-side** via `GET/POST /api/desktop` (file `~/.local/share/desktop-state.json`). **Windows are local to each instance** — opening an app on the phone does NOT open a window on the computer (window mirroring was tried and removed: the Browser is a single shared-size xpra display, so a wide desktop client connecting would force desktop layout onto the phone, and windows silently appearing is jarring). What *is* shared across instances: (1) the Start-menu **"running" dots show the UNION** of apps open on any live instance (awareness), and (2) a **logout/reset clears every instance**. Each browser has a stable `INSTANCE_ID` (localStorage); the manager keeps a **per-instance registry** (`{instances:{id:{open,active,ts}}, reset_epoch}`) — a 5s heartbeat (`pushDesktop`, plus a re-register on `visibilitychange`) keeps an instance in the "live" union (`DESKTOP_TTL` 120s — must exceed browsers' ~60s background-tab timer throttling or an idle machine's dots wrongly go dark elsewhere), and the same id lets a device **restore its own windows** (`GET /api/desktop?instance=`) on reload, not the other device's. Closing is awareness-only (drops from this instance's set; the dot goes dark once no live instance has it — no reaching across to close another device's window). `/api/reset` bumps `reset_epoch`; every other instance sees it advance on its next heartbeat and tears its own desktop down (`clearAllLocal`). On a fresh desktop with nothing open the Start menu auto-opens.
- **App frames** — each app is a full-viewport iframe, **created** on first open but only `src`-loaded on first activation (`loadIfNeeded`) so the inner content always measures the real viewport (otherwise xterm.js / FitAddon initialise at 0×0 and the terminal renders truncated). Closed apps are **removed from the DOM** (true unload). All iframes carry `allow="clipboard-read; clipboard-write"` for cross-iframe clipboard.
- **Status bar** — live system stats updated every 5s via `/api/system/status`: CPU% + temp, MEM used/total, GPU% + temp, VRAM used/total. Rendered in a fixed-width CSS grid (`ch`-sized columns + `tabular-nums`) so labels don't shift sideways as values change digit-count. CPU temp from `k10temp` (Tctl), GPU temp from `amdgpu` (edge). When the GPU driver locks sysfs during heavy compute (EBUSY), util/temp/power **fall back to parsing `/sys/kernel/debug/dri/N/amdgpu_pm_info`** (manager already runs as root) so the numbers stay populated. The full 1/5/15-minute load average is shown only in the Monitor app's CPU card title.
- **Logout button** — taskbar far right (⏻ glyph). Clicking it does a full **fresh-start reset** then logs out: after a `confirm()`, it `POST`s `/api/reset` (stops every running terminal + its background processes, clears the saved desktop layout, drops in-memory office edit sessions, and resets the Browser to a blank Chromium) and only then navigates to `/cdn-cgi/access/logout`. The `href` stays as the no-JS fallback. Over the tunnel `/cdn-cgi/access/logout` is handled at Cloudflare's edge (its own signed-out page); on the **LAN** there's no Cloudflare in front so that path hits the origin — nginx serves a friendly `loggedout.html` via `location = /cdn-cgi/access/logout` (terminal site) instead of a 404.
- **PWA / installable** — `landing/manifest.json` (+ `apple-*` meta tags and an `apple-touch-icon` in `desktop.html`) makes "Add to Home Screen" launch the desktop **standalone** (no Safari chrome — which is why the `100svh`/URL-bar juggling matters less once installed). `landing/sw.js` is a service worker that caches the shell + static app pages (`/`, `landing.html`, `notes.html`, `monitor.html`, `upload.html`, patches JS, icons) for instant cold loads. It is **deliberately conservative**: page loads (`navigate` requests) are **network-first with a 2.5s timeout** — so Cloudflare Access redirects still work (an expired session returns a redirect that's passed through and never cached) while a *stalled* network falls back to the cached shell (the iOS-Safari-on-flaky-wifi case); static sub-resources are cache-first/stale-while-revalidate; and everything live or auth-sensitive (`/api`, `/browser`, `/tN`, `/terminals`, `/files`, `/fileview`, `/services.json`, `/cdn-cgi`) is **bypassed** entirely (network only, never cached). Bump `VERSION` in `sw.js` to invalidate the cache after a shell change; `activate` deletes old caches, and nginx serves `sw.js` `no-store` so the browser re-checks it. The SW uses `skipWaiting()`+`clients.claim()`, and the desktop reloads once on `controllerchange` so an *updated* shell takes effect immediately — but **only when replacing an existing controller** (`hadController`): the first install's `claim()` also fires `controllerchange` (controller `null`→SW), and reloading on a brand-new computer's first visit threw the page away mid-load and interrupted a Terminal still connecting ("had to refresh a few times before I could type"). Icons are generated by `landing/icons/generate-icons.py` (a 2×2 launcher grid in the app accent colors). On iOS an installed PWA has its own cookie jar, so the first launch may require a one-time Access re-auth.
- Relays `/api/health`, `/api/terminals/status`, and `/services.json` to the Home Service app via `postMessage`, only while it's open — required for the Cloudflare tunnel where an iframe's own fetches don't carry the Access cookie, so the parent fetches and forwards. (Monitor fetches `/api/system/status` itself and uses no relayed data.)
- Listens for `postMessage` from the terminal app to open a clicked URL in the Browser app (launching Browser if it isn't already open). Also handles `open-files-at` (from the Upload app) to deep-link the Files app at a given path.
- **Mobile** — viewport meta is pinned (`user-scalable=no`) since iOS pinch-zoom is page-wide and once stuck can't be reliably reset; each app handles its own zoom internally (xpra zooms the canvas, Monitor and FileBrowser have their own responsive layouts). Body uses `100svh` so the taskbar stays in the always-visible region under the URL bar. The taskbar is horizontally scrollable when narrow, the Start menu spans the screen, and `monitor.html`'s 736px breakpoint collapses its two-column grid into a single scrollable column. xterm.js auto-focus is **suppressed on touch devices** so auto-switching into Terminal doesn't pop up the on-screen keyboard — the user taps the terminal to summon it. This has two sources: the desktop's `focus-terminal` `postMessage` (skipped on touch) **and ttyd's own focus when its WebSocket connects** (the one that fires on a fresh load — e.g. closing Browser auto-switches to a never-yet-loaded Terminal). The latter is caught by a guard injected into every `/tN/` page via the `sub_filter` in `terminal/install.sh`: on touch, it blurs any focus of the `.xterm-helper-textarea` unless it lands within 700ms of a real touch **inside the terminal page** (a genuine tap whitelists itself in the capture phase; the parent's close-× tap does not).

### Shared nginx

One nginx site at `/etc/nginx/sites-available/claude-web` (`listen 80 default_server`). The terminal project owns this file. A `map $uri $term_port` directive (generated for 1..50) routes `/tN/` to port `7680+N` via a single regex location block. Sibling projects extend via `include /etc/nginx/snippets/claude-extras.d/*.conf`.

### Terminal stack

**Dynamic provisioning** — terminals are created/destroyed on demand via a manager API, not pre-provisioned.

Services:
- `claude-web-manager.service` — threaded Python HTTP server on `127.0.0.1:7680` (runs as root; `ThreadingHTTPServer` so a slow request — a multi-GB upload, health probes — can't block the status polls). Manages terminal lifecycle and provides system status. Endpoints:
  - Terminal: `POST /api/terminals/{n}/start|stop`, `GET /api/terminals/status`
  - System: `GET /api/system/status` (CPU + per-core, MEM, GPU, VRAM, load_avg, etc.), `GET /api/health`
  - Browser: `POST /api/browser/open` (validated URL → remote Chromium via the xpra display)
  - Office **View**: `GET /api/office/preview?path=<rel-to-~>` (headless LibreOffice → PDF, cached by mtime under `~/.cache/vibetop-office`, served inline for the shell's read-only doc viewer). Needs `libreoffice-writer/calc/impress` (installed by `browser/install.sh`).
  - Office **Edit**: the **OnlyOffice Document Server** (Docker, `office/install.sh`, nginx `/onlyoffice/`). The shell's Office app loads `/office-editor.html?path=…`, which fetches a JWT-signed editor config from `GET /api/office/config`. The container reaches back via `host.docker.internal` to `GET /api/office/doc` (file bytes) and `POST /api/office/callback` (save) — both authorized by an HMAC `t=` over the path. Autosave: the editor calls `POST /api/office/forcesave` (debounced, on app-switch, and on `pagehide` via `sendBeacon`); the manager issues a `forcesave` command to OnlyOffice (per-session key in `_office_sessions`), which fires the callback and writes the file back atomically. JWT (HS256) signed/verified with the shared secret at `~/.config/vibetop/onlyoffice.secret`. All office paths gate on `_resolve_under_home` + `OFFICE_RE`.
  - Office **new doc**: `POST /api/office/new {type}` stamps a blank file from a bundled template (`office/templates/new.{docx,xlsx,pptx}`) into `~/Documents` and returns its path — the Office app opened with no file shows a Document/Spreadsheet/Presentation chooser.
  - Office **download**: `GET /api/office/download?path=` serves the ORIGINAL file as an attachment (the viewer shows a PDF rendition, so its Download button must give the real `.docx/.xlsx/…`; the preview iframe uses `#toolbar=0` to hide the browser's native PDF download).
  - Opening an office file in Files (`filebrowser-patches.js`): the interceptor matches FileBrowser's own open gesture — single click only **selects**, **double-click** opens (desktop, detected on the click events so the second click is blocked before FileBrowser navigates to its dead-end "Preview not available" page); a single **tap** opens on touch.
  - Notes: `GET/POST /api/notes` (`~/.local/share/desktop-notes.md`)
  - Desktop state: `GET /api/desktop?instance=<id>` (this instance's own windows for restore + the live cross-instance `running` union for Start-menu dots + `reset_epoch`) and `POST /api/desktop {instance, open, active}` (upserts that instance into the registry + heartbeat; returns `{running, reset_epoch}`). File `~/.local/share/desktop-state.json` = `{instances:{id:{open,active,ts}}, reset_epoch}`; per-instance registry with a `DESKTOP_TTL` (120s) liveness window and `DESKTOP_MAX_INSTANCES` cap, guarded by `_desktop_lock`
  - Reset: `POST /api/reset` — the logout button's "fresh start": stops all running terminals (session + ttyd units), clears the desktop registry **and bumps `reset_epoch`** (so every other live instance detects the logout and clears itself), clears in-memory `_office_sessions`, and resets the Browser (stop `claude-browser-xpra` → wipe Chromium's session-restore files → start) so the next login is pristine
  - Upload: `POST /api/upload` (streaming multipart parser, writes into `UPLOAD_DIR`, default `~/Uploads`), `GET /api/upload/list`, `POST /api/upload/clear`
  - Update: `GET /api/update` (installed commit/date/subject), `POST /api/update` (`git fetch` + fast-forward to `origin/main` + redeploy; ignores untracked files; auto-resets a dirty tree that already matches upstream — the rsync case; refuses to clobber genuine tracked-file edits unless called with `{force:true}`, which `git stash`es them first — recoverable)
- `claude-web-session@N.service` — `claude-session serve N` (Python daemon holding bash in a PTY, started on demand)
- `claude-web-ttyd@N.service` — ttyd on `127.0.0.1:$((7680+N))`, base path `/tN/` (started on demand)

nginx proxies `/tN/` to the corresponding loopback port via the `map`-based regex location. `sub_filter` injects scrollback config, clipboard polyfill, and a `window.open` override that sends URL clicks to the embedded Chromium browser via `/api/browser/open`.

`claude-session` is a custom lightweight replacement for tmux that passes terminal output through transparently (no screen repainting), enabling xterm.js's 50k-line scrollback buffer. It records output in a 256KB ring buffer and replays it on reconnect so the screen state is preserved. Typing `exit` respawns a fresh shell within ~1s; ttyd's `reconnect=3` auto-reconnects the browser tab. ttyd only auto-reconnects on an **abnormal** WS close; a *clean* close (code 1000, which iOS produces when it suspends a backgrounded tab) instead shows a **"Press ⏎ to Reconnect"** overlay and waits for a keypress. A guard injected into every `/tN/` page (the `sub_filter` in `terminal/install.sh`) watches for that overlay via `MutationObserver` and synthesizes the Enter keypress ttyd's `onKey` handler is waiting for, so the terminal reconnects on its own like the other apps — riding ttyd's in-place reconnect (xterm scrollback preserved; `claude-session` replays its ring buffer). The observer is attached only once `document.body` exists (the script runs in `<head>`, so it retries via `startObs`) and also checks for an already-present overlay on load. If the overlay persists, the guard **keeps retrying the in-place reconnect with exponential backoff + jitter** (≈0.7s → cap 8s, plus up to 1s random) rather than reloading — so a transient outage (an nginx reload during a deploy/Update, or a network blip) recovers in place, and simultaneous drops across tabs don't synchronize into a thundering herd. Only after **20 s of continuous failure** (the in-place reconnect is genuinely stuck — e.g. a socket `error` set `doReconnect=false`, where only a fresh page helps) does it fall back to a single `location.reload()`, guarded to **once per 30 s** via `sessionStorage`. This is the key fix for the old "had to refresh many times" pain: the previous version reloaded the whole page after just 1.2 s (every 8 s), which during a reconnect storm threw the page away mid-load and reload-looped. The observer is attached only once `document.body` exists (the script runs in `<head>`, so it retries via `startObs`) and also checks for an already-present overlay on load.

A tabbed UI at `/terminals/` (`terminal/terminals.html`) manages terminal tabs with add (+), close (x, stops the service), drag-reorder, and double-click-to-rename. Tab order/active persist in localStorage; **tab names are server-side** (`GET/POST /api/terminals/names` → `~/.local/share/terminal-tab-names.json`, keyed by instance number) so a rename shows up in every session/device — terminal N is the same shared session everywhere; localStorage is just an instant-load offline cache, and the tab UI refreshes names on focus/visibility. Closing a tab kills the terminal for a clean slate; clicking "+" starts a fresh instance. Switching tabs auto-focuses the xterm.js terminal via `postMessage` so the cursor is ready for typing (skipped on touch devices — see the Mobile note above).

**Mobile keyboard/dictation** — `landing/terminal-kbd.js`, injected into every `/tN/` page via the `sub_filter` `<script src>` (a no-op on non-touch; **desktop keeps native xterm** — all keys, tap-to-focus, selection). On touch it lays a **full-height transparent `<textarea>`** over the terminal: tapping it focuses it, so iOS raises the keyboard and **dictation buffers into a real field natively** (like Notes) instead of xterm streaming half-finished revisions to the PTY (the pile-up). Input is forwarded as a debounced value-diff via xterm's `coreService.triggerDataEvent` (ignoring iOS dictation's transient clear-to-`""`); Enter→CR, Backspace→DEL, Tab→TAB; arrows/Ctrl/Esc aren't on the iOS keyboard so they're not forwarded. **The textarea's caret is parked on the actual xterm cursor row** — dynamic `padding-top` = `buffer.active.cursorY` × row-height — so iOS scrolls the shell to reveal *wherever the prompt really is*: the **top** on a freshly-opened terminal (few lines, prompt near the top), the **bottom** on a full one. The caret is re-anchored to the cursor **only on `onCursorMove`** (i.e. when you type), **not** on every `onRender` — render also fires on scroll, and re-anchoring there made iOS yank the view back to the prompt the instant you dragged, so you couldn't scroll while the keyboard was up. Net: typing always keeps the line you're typing visible (top *or* bottom), while manual scrollback stays where you left it. (Earlier the textarea was a fixed `bottom:0` strip whose caret was pushed down with `padding-top` — that only revealed the bottom, so a fresh terminal's top-of-window prompt was pushed off-screen.) xterm's own helper textarea is blocked from taking focus on touch (the `focusin` guard in the sub_filter) so only this input raises the keyboard. Because the overlay covers xterm and would otherwise eat every touch (so you couldn't select text), gestures are **routed**: a quick **tap** → keyboard; a **vertical drag** → scrollback; a **long-press (~0.5s) + drag** → text selection, mapping touch coords to a cell and driving xterm's `select()` (the sub_filter's copy-on-`onSelectionChange` then auto-copies it to the clipboard). The desktop shell's ⌨ button is therefore **Browser-only** now (the Browser is an xpra canvas with no DOM input; the Terminal no longer needs it).

### Browser stack

One systemd service:
- `claude-browser-xpra` — xpra `start-desktop :99` with built-in HTML5 client on loopback:14500

xpra handles the virtual X display (Xorg + dummy video driver for RANDR), window management (matchbox in kiosk mode), browser launching (via `browser-loop.sh` wrapper for auto-restart), and the HTML5 client + WebSocket serving. The display dynamically resizes to match the client's browser viewport. Clipboard is handled natively by xpra. xpra is installed from the xpra.org apt repo. `--sharing=yes` lets multiple clients (e.g. desktop + phone) view the same session at once; `XPRA_PING_TIMEOUT=45` (env in the unit) evicts dead clients faster than the 60s default — but not lower than 45: phones on power-saving WiFi stall past 20s while alive, and backgrounded Safari tabs stop answering pings, so a 20s timeout evicted live clients.

**Low-bandwidth tuning** (unit encoding flags): targets `quality=80`/`speed=100` but with low floors `min-quality=10`, `min-speed=20`, and `bandwidth-detection=yes` so xpra degrades hard (lower quality, heavier compression) on a constrained link like mobile while a good connection stays sharp. (xpra v6's `--bandwidth-limit` is a fixed bits/sec value, not `auto`; the floors are what let auto-detection actually drop quality.)

nginx proxies `/browser/` to xpra's HTTP/WebSocket port with `sub_filter` patches: CSS pins `#screen` to the viewport via `z-index` (hiding xpra's toolbar/login UI and window-decoration chrome like `.windowhead`/`.window-title` without removing keyboard capture elements like `#pasteboard`), and loads `xpra-patches.js` for mouse offset correction, scroll fix, and **mobile touch handling**. The patches JS file is served from the web root and wrapped in `try/catch` for graceful degradation on xpra updates. A separate regex location caches (`max-age=86400`) and gzips xpra's ~2.1MB HTML5 client assets, which xpra otherwise serves uncompressed and `no-store` — the main fix for slow first loads over the tunnel. See `docs/browser.md`.

**Mobile touch in xpra-patches.js** — the parent desktop disables iOS pinch-zoom, so all touch gestures are interpreted inside the iframe. A single capture-phase set of `touchstart`/`touchmove`/`touchend` listeners on `window` (xpra binds on `#screen` so we must run first) routes gestures by finger count:
- **1-finger tap (< 10px movement)** → synthetic `mousedown`/`mouseup`/`click` dispatched on the canvas inside `#screen` so xpra forwards a click to the remote.
- **2-finger pinch** → **Safari-style view magnification**: a client-side CSS `transform: translate() scale()` on `#screen` (`VIEWZOOM` state), anchored at the pinch midpoint. The remote layout is **unchanged** — it just magnifies the rendered canvas and lets you pan, exactly like Safari zooms a page (an earlier version sent `Ctrl+=`/`Ctrl+-` to Chromium, which reflowed the layout / enlarged fonts — not what "zoom" should do). Purely local; the remote never sees it. `getMouse` (patch 1) divides click coords by `VIEWZOOM.z` so taps still land correctly while magnified. Zoom resets to 1× on `orientationchange`. No on-screen zoom buttons — pinch out to zoom, pinch back to return to 1×.
- **1-finger drag** → **pan when magnified, scroll at 1×**: zoomed in, the drag pans the CSS-magnified view (clamped to the viewport); at 1× it scrolls the remote page on **both axes** via synthetic `wheel` events on the canvas (vertical `deltaY` + horizontal `deltaX`, accumulated per-axis into `SCROLL_TICK` chunks, default 33, so speed roughly matches the finger).
- **Native keyboard** — xpra's drawn `.simple-keyboard` is hidden; instead a real **`<input>` (`#xpra-kbd`) IS the round ⌨ button** on the right edge. This is the crux: **iOS only raises the keyboard when the user taps a real text input directly** — programmatically `focus()`-ing a separate hidden input (from a `<div>` button, or from a canvas tap) does *not* work. So the input itself is the tap target (transparent text/caret, `font-size:16px` to avoid focus-zoom; the ⌨/✕ glyph is a `pointer-events:none` sibling overlay). Tapping it focuses it → keyboard; a second tap (when already focused) blurs to dismiss (`pointerdown` + `activeElement` check). The window-capture touch layer (patch 4) **ignores taps on `#vkb-toggle`** (`onChip` guard) so the input's native focus isn't prevented. Typed characters are forwarded to the remote as synthetic key events (xpra reads `event.code`/`key`/`keyCode`; its handlers don't check `isTrusted`), built by **diffing the input's value** on each `input` event so backspace and autocorrect replacements work; Enter/Tab/empty-backspace go via `keydown`.
- **Paste on non-Mac** — xpra uses Meta as its clipboard modifier on macOS but Control elsewhere, via the browser `paste` event, which is unreliable on Windows (Cmd+V works, Ctrl+V often doesn't). On non-Mac the patch intercepts `Ctrl+V` (capture phase, before xpra's document handler), reads the local clipboard, and types it into the remote via the same synthetic-key path. The working Mac Cmd+V path is untouched.
- **Auto-reconnect (never show the disconnect screen)** — xpra's HTML5 client only auto-reconnects on *abnormal* WS close codes (`1006/1008/1010/1014/1015`); a **clean close (1000)** — iOS suspending a backgrounded tab, or the server's `XPRA_PING_TIMEOUT` eviction — does **not** reconnect, so xpra's "connection lost" page sticks. The patch listens for xpra's own `connection-lost`/`connection-established` document events: on lost it arms a 2.5s timer to `location.reload()` `/browser/` (reconnects fresh; the remote session/windows are untouched), cancelled if `connection-established` fires first (xpra's own reconnect won). Reload is deferred while the tab is hidden (retried on `visibilitychange`) and floored to once per 8s via `sessionStorage` so a genuinely-down server can't reload-loop. This is the Browser analogue of the ttyd "Press ⏎ to Reconnect" guard.

### File manager

- `claude-web-filebrowser.service` — [FileBrowser](https://filebrowser.org/) on `127.0.0.1:8085`, base URL `/files`, root at `~`, no auth (Cloudflare Access handles public auth).
- nginx snippet at `/etc/nginx/snippets/claude-extras.d/filebrowser.conf` proxies `/files/` to it. The nginx config injects `filebrowser-patches.js` via `sub_filter` on both the exact `/files/` and prefix `/files/*` locations.
- Config stored in `~/.config/filebrowser/filebrowser.db`. Hidden files are hidden by default (toggle in FileBrowser's UI).

**UI patches** (`landing/filebrowser-patches.js`, served from web root):

FileBrowser's icon-only toolbar buttons are enhanced with text labels and an "Open in Browser" action:
- **Text labels** — header and inline `#dropdown` action buttons get column layout (icon above, label below) via injected CSS. Verbose labels are shortened (e.g. "Copy file" → "Copy", "Switch view" → "View").
- **Permanent action buttons** — Browser, Share, Rename, Copy, Move, Delete, Download buttons are always visible in the header toolbar. They are greyed out (25% opacity, non-clickable) when no file/folder is selected, and active when a selection exists. Vue's own conditional buttons are hidden to avoid duplication. The Browser button is only active for files, not folders. When clicked, non-Browser buttons delegate to Vue's hidden original button via programmatic `.click()` — the hiding CSS must not use `pointer-events:none` or the click delegation breaks.
- **"Open in Browser" action** — opens the selected file in the embedded Chromium via `POST /api/browser/open` and auto-switches to the Browser tab via `postMessage`. (The native right-click `.context-menu` is hidden by these patches, so nothing is injected into it.) The `/fileview/` location it relies on is a template — render `@APP_HOME@` when deploying `files/nginx/filebrowser.conf`.
- **MutationObserver** — patches run on every DOM change (with `aria-selected` attribute filter) so labels, button state, and Vue button hiding apply instantly without flicker. A 2s fallback interval covers edge cases.
- **Mobile (≤736px)** — the header toolbar uses `flex-wrap: wrap` so every action button is visible across multiple rows instead of being clipped or hidden behind a `…` overflow trigger; `#dropdown` is forced to render inline (not as a popup) and the more-button is hidden. FileBrowser's stock bottom-floating selection bar (`#file-selection`) and the long-press `.context-menu` are hidden globally — every action already lives in the top toolbar so the popups are redundant. nginx sub_filter loads `filebrowser-patches.js` with a content-hash `?v=` cache-buster (see the cache-buster gotcha — derived automatically by the installer, no manual bump).

### Notes

A persistent scratchpad at `/notes.html`. Auto-saves 800ms after typing, supports Tab and Cmd+S. Content stored at `~/.local/share/desktop-notes.md`, managed via `GET/POST /api/notes` on the manager API. No external service — just a static HTML page + the existing API server. A **link bar** above the textarea auto-detects every `http(s)` URL in the note (a textarea can't host clickable text) and shows each as a tappable chip; tapping one opens it in the embedded Browser via the parent desktop's `open-in-browser` `postMessage` (direct `/api/browser/open` fallback when standalone). URLs are percent-escaped for the manager's metacharacter filter (`( ) ' " \` $ ;`) so links with parens/semicolons aren't rejected.

### Upload

A quick-sync drop zone at `/upload.html` — useful for getting photos off a phone fast. Tap-to-pick fires the OS picker (iOS opens the photo gallery / files / camera); drag-and-drop works on desktop. Files upload **sequentially**, one XHR per file, so each item in the queue shows its own live percentage badge (0 % → 100 % → ✓ Done / Failed) while the top bar shows aggregate progress. Below the queue, an **In folder** panel lists files currently in `UPLOAD_DIR` (newest first) with Refresh and Clear-all controls, refreshed after every successful upload. An **Open in Files** button deep-links the Files app at the upload folder via an `open-files-at` `postMessage` to the parent desktop. Default destination is `~/Uploads/` (override with `UPLOAD_DIR` env on the manager unit); files are chowned to `APP_USER` after save. nginx's `/api/` location sets `client_max_body_size 5G` and `proxy_request_buffering off` so multi-GB uploads stream through. The manager's multipart parser is hand-rolled and streaming (does NOT spool to temp via `cgi.FieldStorage`).

### Update

A self-update app at `/update.html` (Start menu → **System** section) that pulls the latest commit from GitHub and redeploys, driven by the manager. `GET /api/update` shows the installed commit/date/subject **plus a `history` array** — the **real per-host self-update log** for THIS deployment (not the git changelog): events `deployed` (a baseline seeded with the current commit on the manager's first start ≈ deploy time), `updated` (with `from`/`to` and the list of commits actually pulled), and `failed`. Newest-first, persisted at `~APP_USER/.local/share/vibetop-update-history.json` (capped at 200). The app renders it as an **Update history** list with a **Clear** button → `POST /api/update/history/clear` (writes `[]`). `POST /api/update`:
1. `git fetch` then fast-forward to `origin/main` in `REPO_DIR` (the manager's own checkout, `<repo>/terminal/terminal-manager.py` → `<repo>`). Git runs as `APP_USER` via **`sudo -u APP_USER -H`** (not `su -`, which would print the host MOTD banner into the output) — the repo owner, who also holds the GitHub SSH key (root would trip git's "dubious ownership" guard). Non-interactive SSH must work (passphraseless key / agent). **Dirty-tree handling:** a plain `git pull --ff-only` aborts if the working tree is dirty — which happens when a host was deployed by **rsync** (`deploy.sh --remote` / manual rsync copies files in *without* committing). The dirtiness check is `git status --porcelain --untracked-files=no` — **untracked files are ignored**: they never block a fast-forward, and counting them made the next check (`git diff --quiet origin/main`) always read as "local edits" whenever the host was *behind* (the tracked tree always differs from upstream then), so a host with any untracked cruft could never self-update. For genuine **tracked** dirtiness the manager checks: if the tree already **matches `origin/main`** (`git diff --quiet origin/main` — the rsync case, changes are redundant), it `git reset --hard origin/main`; if the changes are **genuine local edits not upstream**, it bails — returning `blocked:"dirty"` plus the file list so `update.html` shows them with a **"Discard local changes & update"** button. That button re-POSTs `{force:true}`, which `git stash push --include-untracked` (recoverable via `git stash list`/`pop` on the host — *not* a destructive `reset --hard`) and then fast-forwards. Upshot: prefer the in-app Update (or `git pull` on the host) over rsync for sharing committed work; rsync-deployed hosts self-heal on the next Update, and stray edits can be cleared self-service from the app.
2. If the pull brought changes, redeploy **only what changed** (by `git diff --name-only`): `landing/` → `landing/install.sh` (as `APP_USER`); `browser/` → `browser/install.sh`; `terminal/` → `terminal/install.sh` (regenerates the nginx site). The browser/terminal scripts run **as root** (the manager is root) with `APP_USER=… INSTALL_DEPS=0 INSTALL_SYSTEMD=0` so they only redeploy files + reload nginx.
3. If a manager module changed — **any `.py` directly under `terminal/`** (`terminal-manager.py` or a sibling like `system_status.py`; `tests/` and the path-independent `claude-session` are excluded) — the manager restarts **out-of-band** via `systemd-run --on-active=3 systemctl restart claude-web-manager` (a transient timer, so the restart survives the manager's own death — a child in the manager's cgroup would be killed mid-restart). The response is sent first; `update.html` re-polls the version after the blip.

The whole log (each step's stdout/stderr + ok/fail) is returned and shown in the app. **After a successful update that changed something, the app reloads the whole desktop** (the top window, after a short countdown — waiting for the API to come back if the manager restarted) so the new cached shell + service worker take effect; nothing reloads if already up to date. **Bootstrap:** the *first* deploy of this feature needs a manual `sudo systemctl restart claude-web-manager` (the running manager predates the `/api/update` route); after that it self-updates.

### Landing page (`landing/index.html`)

The old service listing page, preserved at `/landing.html` and loaded in the Home tab. Shows cards for each service with health-check dots. Terminal section dynamically shows chips for each running terminal (fetched from `/api/terminals/status`). Health data is relayed from the parent desktop via `postMessage` to work through the Cloudflare tunnel. All external service links use `target="_blank"` to open in new native tabs (required since the page is inside an iframe).

### URL forwarding (terminal/files → browser)

Clicking a URL in a terminal (Cmd+click / Ctrl+click) or using the "Open in Browser" action in Files opens it in the embedded Chromium. Implementation:
- nginx `sub_filter` injects a `window.open` override into terminal pages
- The override intercepts xterm.js's link handler (which calls `window.open()` then sets `.location.href`) and returns a proxy object
- The proxy sends the URL to `POST /api/browser/open`, which runs `chromium <url>` on the xpra display
- The manager passes `DBUS_SESSION_BUS_ADDRESS` and `--user-data-dir` matching the xpra profile so the URL opens in the correct Chromium instance
- A `postMessage` to the parent desktop auto-switches to the Browser tab
- Files opened from FileBrowser use the `/fileview/` nginx location (alias to `~`) to serve raw files to Chromium

### Tunnel

`cloudflared` maintains an outbound connection to Cloudflare. All traffic for `service.example.com` routes to `localhost:80`. Cloudflare Access handles auth (email PIN + Google). Config lives at `/etc/cloudflared/config.yml` (rendered from `tunnel/config.yml.template`).

## Uninstall

Top-level `uninstall.sh` tears down the WHOLE runtime in one shot (services, nginx site + snippets, the OnlyOffice container, web root), keeping the repo, user data (`~/.local/share`, `~/Documents`, `~/Uploads`), the JWT secret, and the ~2 GB image:

```bash
sudo ./uninstall.sh                   # everything; re-deploy with sudo ./deploy.sh
```

Sub-projects also keep their own idempotent `uninstall.sh` (leave apt packages + user data in place):

```bash
sudo ./terminal/uninstall.sh          # stops units, removes nginx site
sudo ./browser/uninstall.sh           # stops units, removes nginx snippet
sudo ./office/uninstall.sh            # removes the OnlyOffice container + nginx snippet
sudo ./tunnel/uninstall.sh            # N/A — uninstall cloudflared manually
```

Most support `--dry-run`.

## Key operational commands

```bash
# Terminal operations
curl -X POST http://127.0.0.1/api/terminals/5/start  # start terminal 5
curl -X POST http://127.0.0.1/api/terminals/5/stop   # stop terminal 5
curl http://127.0.0.1/api/terminals/status            # list running terminals
sudo systemctl restart claude-web-manager             # restart manager API

# Browser operations
sudo systemctl restart claude-browser-xpra            # restart xpra + chromium
xpra info :99                                         # session info

# File manager
sudo systemctl restart claude-web-filebrowser         # restart file manager

# System status
curl http://127.0.0.1/api/system/status               # CPU, memory, uptime, GPU
curl http://127.0.0.1/api/health                       # service health checks

# Nginx after config changes
sudo nginx -t && sudo systemctl reload nginx

# Tunnel
sudo journalctl -u cloudflared -f
```

## Which docs to read

- Terminal details (claude-session daemon, ttyd flags, dynamic provisioning, tabbed UI): `docs/terminal.md`
- Browser details (xpra, snap chromium, multi-client): `docs/browser.md`
- Network topology options: `docs/single-port-options.md`
- Tunnel setup walkthrough: `tunnel/README.md`

## Install script conventions

All `install.sh` scripts share the same patterns:
- Idempotent and re-runnable. `--dry-run` (or `-n`) previews without acting.
- Env vars override defaults (e.g. `MAX_INSTANCES=50`, `XPRA_PORT=14500`). See the header comment in each script for the full list.
- Systemd unit files under `*/systemd/` are templates with `@PLACEHOLDER@` tokens (e.g. `@APP_USER@`, `@DISPLAY_NUM@`). install.sh renders them via `sed` and writes to `/etc/systemd/system/`.
- nginx configs under `*/nginx/` follow the same pattern.

## Versioning & commits

- The root **`VERSION`** file (e.g. `1.5.6`) is a hand-maintained release number — it is **not** read by any build/deploy script (the `VERSION` strings in `browser/install.sh`/`files/install.sh` are the OS `VERSION_CODENAME` and `FB_VERSION`, unrelated). Bump it when cutting a user-visible release and commit with a `vX.Y.Z: <summary>` subject (see `git log -- VERSION`).
- **Shell/static-page changes** that affect the cached PWA shell must bump the service-worker cache version: `VERSION` in `landing/sw.js`. The convention is a `(sw vNN->vNN)` suffix on the commit subject (e.g. `… (sw v47->v48)`). Sub-resource JS injected via `sub_filter` (`xpra-patches.js`, `filebrowser-patches.js`, `terminal-kbd.js`) is content-hash cache-busted automatically — never bump those by hand.
- Per-sub-project `CLAUDE.md` files (`terminal/`, `browser/`, `landing/`) are thin pointers back to this root file and `docs/` — the canonical architecture lives here; keep edits here, not duplicated there.

## Gotchas

- Snap chromium can't use `--user-data-dir` outside its confinement — the xpra profile lives at `~/snap/chromium/common/xpra-profile`. The `/api/browser/open` handler must pass this profile and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus` when running `chromium` via `su`, otherwise the URL silently goes nowhere ("Opening in existing browser session" fails without D-Bus, and without `--user-data-dir` it targets the wrong Chromium instance)
- **Snap chromium needs lingering enabled for `APP_USER`** (`browser/install.sh` runs `loginctl enable-linger` in its systemd step). The xpra service runs as `APP_USER` with no login session; snap launches chromium inside a transient user scope (`snap.chromium.chromium-<uuid>.scope`), which requires the user's systemd instance + `$XDG_RUNTIME_DIR` (`/run/user/<uid>`). Without lingering, systemd-logind tears down `/run/user/<uid>` once the deploying login session ends, so every chromium launch fails — the journal shows `is not a snap cgroup for tag snap.chromium.chromium` (snapd) and `Failed to create secure directory (/run/user/<uid>/pulse)` (xpra) on a 2s loop while `browser-loop.sh` crash-loops, and the Browser app stays **blank**. It "recovers" the instant any login session for that user appears (e.g. an SSH login recreates `/run/user/<uid>`), which masks the bug. Fix on an affected host: `sudo loginctl enable-linger <user>` then `sudo systemctl restart claude-browser-xpra`
- xpra is installed from xpra.org's apt repo (GPG key at `/usr/share/keyrings/xpra.asc`, source at `/etc/apt/sources.list.d/xpra.sources`) — Ubuntu's packaged v3.1.5 is too old (no HTML5 client)
- The browser-loop.sh wrapper (at `/usr/local/lib/claude-browser/browser-loop.sh`) auto-restarts chromium on crash — xpra's `--start-child` only runs the command once
- Desktop page at `~/claude-web-www/index.html` is `landing/desktop.html`; old landing page preserved at `~/claude-web-www/landing.html`
- `www-data` gets traversal on `/home/myuser` via ACL (`setfacl`), preserving the home dir's 0750 mode
- xterm.js scrollback requires `sub_filter` injection in nginx — ttyd 1.7.4's runtime option setter doesn't resize the buffer
- Clipboard in terminals uses a DOM-based copy technique injected via nginx `sub_filter`: on selection change, the selected text is written into xterm.js's helper textarea, selected via `ta.select()`, then copied via `document.execCommand('copy')`. This is the only approach that works inside nested iframes — the async Clipboard API (`navigator.clipboard.writeText`) and `clipboardData.setData()` in copy event handlers are both silently blocked by browsers in iframe contexts. Ctrl+C/Cmd+C with a selection copies instead of sending SIGINT. **Paste:** Mac Cmd+V pastes natively. On non-Mac, the `customKeyEventHandler` **returns false for Ctrl+V** so xterm never emits a literal `^V` — which a TUI like Claude Code reads as a paste-image keystroke ("no image in clipboard"). The actual paste then rides xterm's **own `paste` event** — the exact path right-click-paste uses — so it works in both secure and insecure (HTTP-LAN) origins with no Clipboard API. (An earlier attempt called `navigator.clipboard.readText()`, but that object is `undefined` on an HTTP origin, so the handler fell through to `return true` and `^V` was sent.) The `/tN/` page is served `Cache-Control: no-store` so a stale browser cache can't silently keep old sub_filter behaviour after an update
- All desktop iframes use `allow="clipboard-read; clipboard-write"` — without this, clipboard paste into the xpra browser iframe fails
- Terminal iframes in `terminals.html` also need `allow="clipboard-read; clipboard-write"` for clipboard to work through the double-nested iframe chain (desktop → terminals → /tN/)
- `claude-session` attach client clears `ICRNL` from terminal input flags so `\r` (Enter) passes through to TUI apps like Claude Code without being converted to `\n`. Does NOT use full `tty.setraw()` to preserve output post-processing
- xpra CSS uses `z-index` overlay (not `display:none`) to hide the toolbar — hiding body children with `display:none` breaks keyboard input because xpra's `#pasteboard` textarea (used for keyboard capture) must remain in the DOM
- **xpra "new computer can't type in the Browser (mouse works)"** — the HTML5 client sends its keymap on connect as `["keymap-changed", {keymap}, false]`; that trailing `false` is the server's `force` flag. xpra's long-lived `start-desktop` session keeps the keyboard config from the *first* client that ever connected, and since every HTML5 client hashes to the same keymap, a later client (different computer/session) matches and is **skipped** (`keyboard mapping already configured (skipped)` in the xpra log) — its keys translate against the stale config and are dropped, so the mouse works but typing does nothing. Fix is **patch 7** in `xpra-patches.js`: wrap `XpraClient.prototype.send` and flip the `keymap-changed` packet's force flag to `true`, so the server re-applies the keymap for whichever client is connecting.
- **Cache-busters are content-hash-derived — never bump a `?vN` by hand.** The three nginx-`sub_filter`-injected scripts use a `?v=@PATCH_VER@` placeholder in their config templates; the installer computes `md5sum | cut -c1-10` of the JS and seds it in: `xpra-patches.js` (`browser/install.sh`→`browser/nginx/browser.conf`), `filebrowser-patches.js` (`files/install.sh`→`files/nginx/filebrowser.conf` ×2), `terminal-kbd.js` (`terminal/install.sh`, interpolated into the site config as `${KBD_VER}`). Editing any of these files changes its hash → the `?v=` changes → nginx + the service worker fetch the new copy, and `nginx_write` sees the changed config and reloads. This makes "forgot to bump the version → shipped stale JS" structurally impossible. The shell pages (`desktop.html` etc.) are still covered by `sw.js` `VERSION` (bump that for shell/static-page edits).
- **Service worker only caches known shell pages.** `sw.js` caches a *navigation* only when its pathname is in `SHELL_PAGES` (derived from `PRECACHE`: `/`, `landing.html`, `notes.html`, `monitor.html`, `upload.html`); any other HTML (`office-editor.html`, `update.html`, `loggedout.html`, …) is **network-only**, so it can never be served stale after a deploy that didn't bump `VERSION`. Sub-resources (JS/CSS/icons) are cache-first/SWR keyed by full URL incl. `?v=` — so the content-hash cache-busters above invalidate them correctly.
- **ttyd waits for the session socket before serving** (`claude-web-ttyd@.service` `ExecStartPre`). `After=`/`Requires=` only order process *start*, not socket readiness; without the wait, on a cold start (first terminal after a reboot/reset) ttyd could accept a WebSocket and spawn `claude-session attach` before the daemon bound `/tmp/claude-session-N.sock`, failing the first connection. Because ttyd serves HTTP only after `ExecStartPre`, `terminals.html`'s `waitReady()` (polls `/tN/` for HTTP 200) now also implies the backend is ready.
- **Manager state files are written atomically** (`_atomic_write`: temp in the same dir + `os.replace`) for `desktop-state.json`, the update-history, and `desktop-notes.md`. A plain `open('w')`+write can be observed mid-write by a concurrent reader (the registry GET/POST run on multiple `ThreadingHTTPServer` threads) — for the desktop registry that would reset `reset_epoch` and drop every instance's state. Update-history read-modify-write is additionally serialized by `_update_lock`; office save-back uses a per-thread temp name so concurrent OnlyOffice callbacks can't corrupt the file.
- **Desktop iframe activation messaging is deferred to the frame's `load`** (`loadIfNeeded`→`notifyActiveFrame` in `desktop.html`). On first open the frame's `src` was just set, so `focus()`/`postMessage`/`resize`/`focus-terminal` fired synchronously would land in `about:blank` and be lost — the "first open doesn't focus / misses its `vibetop:active` broadcast" race. The deferred notify is guarded so a frame that finishes loading after the user switched away doesn't steal focus.
- xpra patches (`browser/xpra-patches.js`) are served as a standalone JS file from the web root, wrapped in `try/catch` for graceful degradation if xpra updates change the API
- System status API auto-detects the discrete GPU by picking the card with the most VRAM. CPU temp from `k10temp` (hwmon), GPU temp from `amdgpu` edge sensor (hwmon). During heavy GPU compute, the driver locks sysfs files (`EBUSY`); util/temp/power then fall back to parsing `/sys/kernel/debug/dri/N/amdgpu_pm_info` ("GPU Load", "GPU Temperature", "W (average SoC|GPU)") so the numbers stay populated. The manager runs as root, which is required for debugfs (0700)
- **The status collection itself lives in `terminal/system_status.py`**, a sibling module the manager imports (`system_status.get_system_status(running_terminals, cached)`), not in the 1900→1425-line `terminal-manager.py`. The CPU/RAPL/disk/process snapshot globals moved with it; the manager injects its running-terminal list and the shared `_cached` memoizer (which stays in the main module because terminal start/stop invalidates its `running_terminals` entry). The manager runs **in-place from the git checkout** (`ExecStart=…/terminal-manager.py`), so the sibling import needs no install change — but the self-update restart trigger in `_handle_update` treats **any `.py` directly under `terminal/`** (not just `terminal-manager.py`) as a manager module, so a pulled change to `system_status.py` still restarts the API
- Terminal manager API validates URLs for `/api/browser/open` by rejecting shell metacharacters to prevent command injection
- Terminal instances are dynamic (on-demand via `/api/terminals/`). Systemd template units are not pre-enabled; the manager API starts/stops them. Only `claude-web-manager.service` is enabled at boot
- **Moving/renaming the repo directory requires re-rendering the 3 systemd units' `@APP_DIR@` AND restarting `claude-web-ttyd@N`.** `ttyd-run.sh` bakes the absolute `claude-session` path into ttyd's per-connection spawn command (`${SCRIPT_DIR}/claude-session attach N`) at ttyd start time, so a running ttyd keeps spawning the *old* path on every fresh WebSocket connect — which fails instantly and shows as a terminal that flashes "connected" in a reconnect loop (existing connections survive because their attach client was already spawned). The `claude-session serve` daemons are path-independent at runtime — they `execv('/bin/bash')` for shells and serve `/tmp/claude-session-N.sock` — so they keep working and must NOT be restarted (that would kill the live shells). So after a move: fix the units, `systemctl restart claude-web-ttyd@N` (sessions preserved), and restart `claude-web-manager` (its `REPO_DIR` is computed from its own script path)
- The `window.open` override in terminal pages intercepts xterm.js link clicks by returning a proxy object with a setter on `.location.href` — this matches xterm.js's pattern of `window.open()` then `obj.location.href = url`
- nginx uses a `map $uri $term_port` directive (generated for 1..50) and one regex location block instead of per-instance location blocks
- FileBrowser config is in `~/.config/filebrowser/filebrowser.db` (set via `filebrowser config set`), not CLI flags
- FileBrowser patches (`landing/filebrowser-patches.js`) are loaded via nginx `sub_filter` injection, not bundled with FileBrowser. The patches hide Vue's conditional action buttons and replace them with permanent always-visible buttons — CSS for these must be scoped to `.fb-permanent` to avoid overriding the `display:none` hiding of Vue's buttons. On desktop widths (>736px), `#dropdown` content renders inline in the header (not as a popup), so dropdown buttons also need label styling
- `landing/install.sh` must run without `sudo` — with `sudo`, `$HOME` resolves to `/root/` and files deploy to the wrong directory
- tunnel's `install.sh` only installs the `cloudflared` binary — tunnel creation and Access setup are interactive (see `tunnel/README.md`)
- xpra is single-client by default — without `--sharing=yes`, opening the Browser tab on a second device evicts the first, and a desktop+phone pair kick each other in a loop so the phone "never loads." Cloudflare-tunnel clients arrive from `127.0.0.1`, so in xpra logs a remote tunnel client appears as a loopback address (not the real client IP)
- xpra's HTML5 client assets are served `no-store` and uncompressed; the `/browser/` nginx snippet adds a regex asset location that caches + gzips them. nginx won't gzip proxied responses without `gzip_proxied any`, and xpra's JS Content-Type is `text/javascript` (not `application/javascript`) — both must be set or compression silently no-ops
- Desktop iframes get their `src` set on first activation (`loadIfNeeded`), not at iframe-creation time. ttyd inside an iframe whose ancestor is `display:none` initialises xterm.js with a 0×0 viewport, leading to truncated history that only a refresh fixes; deferring the `src` lets the inner content measure the real viewport on the first paint
- `/api/upload` uses a hand-rolled streaming multipart parser (`_BoundaryReader` + `_iter_multipart_files`). Reads from `self.rfile` are capped by `_LimitedReader(rfile, Content-Length)` because once the body is exhausted, a bare `rfile.read(n)` blocks forever on a keep-alive socket waiting for n more bytes
- iOS pinch-zoom is page-wide and irreversibly sticky once activated, so the desktop shell's viewport meta uses `user-scalable=no,maximum-scale=1`; per-app zooming (xpra canvas, FileBrowser UI) is the inner app's responsibility. Each app's iframe handles its own scroll on `100svh` body so the taskbar stays in the always-visible viewport region
- xpra's HTML5 client renders its own window chrome (`.windowhead`/`.window-title`/`.title-bar`) where the WM name ("matchbox") would otherwise be visible — these selectors are added to the CSS hide list in the `/browser/` nginx sub_filter
