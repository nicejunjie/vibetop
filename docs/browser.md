# vibetop-browser (project on myhost)

A persistent web browser running on myhost, viewable from any browser
at `http://192.168.1.10/browser/` (or `https://service.example.com/browser/`
via Cloudflare Tunnel). Same continuity story as the terminals: close
the tab, reopen from any device, same browser, same tabs, same scroll
position.

Project dir: `browser/` (repo-relative; prod checkout is `/opt/vibetop/app`)

## What it is

One systemd service running as user `myuser`:

**`vibetop-browser-xpra.service`** — xpra `start-desktop :99` with:
- **Xorg + dummy video driver** as the virtual display (full RANDR
  support for dynamic resize — the display resolution changes to match
  the client's browser viewport)
- **matchbox-window-manager** in kiosk mode (no titlebar, no desktop —
  chromium fills the entire display)
- **chromium** (snap) via `browser-loop.sh` wrapper for auto-restart
- **Built-in HTML5 client + WebSocket** on `127.0.0.1:14500`

Key xpra flags:
- `--xvfb=Xorg` — uses Xorg with the dummy video driver instead of Xvfb
  (Xvfb doesn't support dynamic RANDR resize)
- `--ws-auth=none` — no xpra authentication (Cloudflare Access handles
  public auth, loopback binding handles LAN security)
- `--resize-display=yes` — allow client to resize the virtual display
- `--input-devices=uinput` — precise input handling
- `--encoding=auto` with speed/quality tuning for LAN use
- `--sharing=yes` — **required** for multiple clients to coexist. Without
  it xpra runs single-client: a new connection evicts the existing one
  ("new client does not wish to share"). With a desktop tab and a phone
  open at once they would otherwise kick each other in a loop, so the
  phone "never loads." Cloudflare-tunnel clients arrive at nginx from
  `127.0.0.1`, so in the logs a tunnel client shows as a loopback address.
- `Environment=XPRA_PING_TIMEOUT=45` (in the unit) — evict a dead/stale
  client after 45s instead of the 60s default, so a freshly opened browser
  doesn't wait on a zombie session from a closed tab/laptop. Don't go
  lower: phones on power-saving WiFi can stall past 20s while alive, and
  a backgrounded Safari tab stops answering pings — at the old 20s value
  both got legitimately-connected clients evicted (frozen canvas until a
  manual reload).

## nginx integration

vibetop's site includes `/etc/nginx/snippets/vibetop-extras.d/*.conf`,
and vibetop-browser drops `browser.conf` there:

- `location = /browser` → `301` to `/browser/`
- `location /browser/` — reverse-proxy to `127.0.0.1:14500` with WS
  upgrade headers. `proxy_pass` with trailing slash strips the `/browser/`
  prefix so xpra sees clean paths.
- A **regex location** for static assets
  (`^/browser/(.+\.(js|css|wasm|woff2?|...))$`) — placed before the prefix
  block so it wins for asset requests, while the extension-less WebSocket
  path falls through to `/browser/`. It exists to fix slow first loads.

### Asset caching & compression

xpra serves its ~2.1 MB HTML5 client (jQuery, `Client.js`, decode
workers, wasm) with `Cache-Control: no-store` and **uncompressed**, so a
fresh open re-downloaded the whole bundle every time — painfully slow over
the tunnel. The asset location fixes both:

- **Caching** — `proxy_hide_header Cache-Control` + `add_header
  Cache-Control "public, max-age=86400"`. xpra's assets are immutable per
  release, so a day is safe. *Caveat:* after an `apt upgrade` of xpra a
  stale asset could be served for up to a day — hard-refresh once, or drop
  the max-age.
- **Compression** — `gzip on; gzip_proxied any;` (nginx does **not** gzip
  proxied responses without `gzip_proxied`), and `gzip_types` must include
  `text/javascript` — xpra's actual JS Content-Type, not
  `application/javascript`. With it, `jquery.js` goes 290 KB → 104 KB.
- The entry HTML stays `no-store` so the `sub_filter` patches keep running.
- Assets are proxied (not on nginx's filesystem), so `gzip_static`/the
  shipped `.br`/`.gz` files can't be used directly; nginx compresses on
  the fly instead.
- `location ~ ^/browser/background\.(jpe?g|png)$ { return 204; }` —
  xpra's wallpaper is a 4.2 MB jpeg, invisible behind the pinned canvas
  but re-downloaded on every open (it isn't matched by the asset regex's
  extension list... and shouldn't be: even one cached download is waste).
  Must appear *before* the asset regex — first regex match wins.
- `location = /xpra-patches.js` adds the same `max-age=86400` —
  the file is served from the web root, outside `/browser/`. The
  `sub_filter` injects it as `/xpra-patches.js?vN`; bump `N` whenever
  the file changes (same cache-buster pattern as filebrowser-patches).
- Why this matters extra on phones: stock iOS Safari over power-saving
  WiFi can stall individual HTTP requests for 60–100 s. The client's
  init chain is serial (`<script>` tags, then `importScripts` in the
  protocol worker, then `default-settings.txt`), so a single stalled
  request blanks the screen for minutes. Once everything is cacheable,
  a reopen needs only the WebSocket.

### sub_filter patches

nginx injects CSS and JavaScript into the HTML5 client page via
`sub_filter` to fix two xpra client issues:

1. **Mouse offset fix** — xpra's `getMouse()` uses `e.clientX`/`e.clientY`
   (viewport-relative) but the canvas element may not start at viewport
   (0,0) due to xpra's UI elements. The patch overrides `getMouse` to use
   `getBoundingClientRect()` on the canvas, making coordinates relative to
   the actual canvas position. CSS also pins `#screen` to `position:fixed`
   at (0,0) and hides all xpra UI siblings (floating menu, login overlay).

2. **Scroll fix** — xpra's default scroll handler accumulates wheel deltas
   until they reach 120 units (one "click"), which means slow trackpad
   scrolling on macOS produces no response. The patch replaces
   `on_mousescroll` entirely: every wheel event with a non-zero delta
   immediately sends at least one scroll button press/release (button 4/5
   for vertical, 6/7 for horizontal). Larger deltas send proportionally
   more clicks (1 per 30px).

## Snap chromium specifics

On Ubuntu 24.04, `chromium-browser` is snap-only. Snap confinement
**blocks** `--user-data-dir` paths outside the snap's allowed dirs,
so install.sh detects snap browsers and omits the flag, letting
chromium use its default profile at `~/snap/chromium/common/chromium/`.
That dir persists across restarts and snap refreshes. `BROWSER_CMD`
env var lets you override entirely.

## xpra.org apt repository

Ubuntu 24.04's packaged xpra is v3.1.5 (2020) which lacks the HTML5
client and many performance features. install.sh adds xpra.org's
official apt repo:
- GPG key: `/usr/share/keyrings/xpra.asc`
- Source: `/etc/apt/sources.list.d/xpra.sources` (DEB822 format)
- Packages: `xpra`, `xserver-xorg-video-dummy`, `matchbox-window-manager`

The install also:
- Disables xpra's built-in socket activation (`xpra-server.socket`)
  which conflicts with our custom unit
- Sets `allowed_users=anybody` in `/etc/X11/Xwrapper.config` (required
  for non-console users to run Xorg with the dummy driver)
- Creates `/etc/udev/rules.d/99-uinput.rules` for uinput access

## Files

- `apps/everyday/browser/install.sh` — one-command deploy (adds repo, installs
  packages, renders templates, enables service)
- `apps/everyday/browser/uninstall.sh` — clean removal (also handles legacy VNC units)
- `browser/systemd/vibetop-browser-xpra.service` — unit template
  (`@APP_USER@`, `@DISPLAY_NUM@`, `@XPRA_PORT@`, `@LOOP_SCRIPT@`, etc.)
- `apps/everyday/browser/nginx/browser.conf` — location snippet template with
  sub_filter patches (`@XPRA_PORT@`)
- `apps/everyday/browser/browser-loop.sh` — chromium restart wrapper template
  (`@BROWSER_CMD@`), deployed to `/usr/local/lib/vibetop/`

## Operations

```bash
systemctl status vibetop-browser-xpra
sudo systemctl restart vibetop-browser-xpra        # restart full session
xpra info :99                                      # session info
journalctl -u vibetop-browser-xpra -f               # logs
DISPLAY=:99 xrandr                                 # check display modes
DISPLAY=:99 xwininfo -root -children               # list X windows
ss -tlnp | grep :14500                             # confirm loopback listen
```

## Multi-client behavior

With `--sharing=yes`, multiple HTML5 clients can connect simultaneously —
they all see the same display. Clicking and typing from any client moves
the same cursor. No isolation between viewers. (Without `--sharing`, xpra
is single-client and each new connection evicts the previous one — see the
flags section above.)

## Caveats

- **Audio** — disabled (`--pulseaudio=no --speaker=off --microphone=off`).
- **Clipboard** — works natively via xpra on HTTPS (Clipboard API).
  On plain HTTP, clipboard write works but read may be restricted by
  browser security; xpra provides a fallback clipboard panel.
- **Network exit** — every page load originates from myhost's network.
- **xpra updates** — the `sub_filter` scroll/mouse patches target the
  current xpra HTML5 client JS API. If xpra updates change the
  `XpraClient.prototype.getMouse` or `on_mousescroll` signatures, the
  patches may need updating.
- **Xorg wrapper** — `allowed_users=anybody` in Xwrapper.config allows
  any user to start Xorg. This is safe since only the dummy driver is
  used (no real hardware access), but be aware if other X server
  configurations exist on the host.

---

# Architecture summary

> How the Browser (xpra `:99`) and the X11 Launcher (xpra `:98`) hang together.

## Browser stack

One systemd service:
- `vibetop-browser-xpra` — xpra `start-desktop :99` with built-in HTML5 client on loopback:14500

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
- **Re-claim the display size (`xpra-patches.js` patch 10)** — the Browser is a **single shared** xpra `start-desktop :99` display, so its resolution belongs to whichever client connected/resized last: when the phone connects it advertises its small viewport (`_screen_resized()` → `configure_display {"desktop-size":[…]}`) and the display shrinks for **every** client, incl. the desktop. xpra's `_screen_resized()` re-sends only when **this** client's `container` actually changed, so the desktop (whose window didn't change) can't grow it back on its own — same "same-size = no-op" wall as the Terminal re-claim. Fix (the Browser analogue of the Terminal's double-click/tap "claim the shape"): a **desktop double-click** *or* **mobile double-tap** busts the guard (`client.desktop_width = -1`) and calls `client._screen_resized()`, re-sending this client's real container size so the server RANDR-resizes the display to match. It re-claims **only when the display size differs from our viewport** — **two-directional** (the desktop grows it back after a phone shrank it; the phone shrinks it after the desktop grew it — a "smaller than me" test is a no-op on the phone, whose display is *bigger*), measured from the largest `id_to_window`'s `w`/`h` — so an ordinary double-click/tap doesn't spam RANDR resizes, and it **never `preventDefault`s** so word-select still reaches the remote. Desktop is detected from `pointerdown` timing (capture phase, independent of xpra/jQuery); the touch double-tap is detected in the patch-4 touch layer's `touchend` tap branch (two no-movement taps within 400ms/28px, additive to the taps already sent). Manual + symmetric like the Terminal — the other device sees this one's size until *it* re-claims (a shared display can only be one size).

## X11 Launcher (tabbed GUI-app desktop)

A tabbed remote-desktop app at `/x11launcher.html` (Start menu → **X11 Launcher**; app id `x11launcher`), modeled on the Terminal tabs: a **tab per running GUI app** + a **`+`** to launch a new one, over a live canvas. It runs on a **second, dedicated xpra display** so the Browser (Chromium) stays its own app — one xpra display can only show one canvas, so launched apps get their own.

- **Second display**: `vibetop-x11-xpra.service` runs `xpra start-desktop :98` (matchbox, **no Chromium child**), HTML5 on loopback `:14501`, proxied by nginx at **`/x11-display/`** (same sub_filter/asset-cache treatment as `/browser/`, title rebranded "Apps"). Set up by `apps/everyday/browser/install.sh` alongside the Browser display (env `X11_DISPLAY_NUM`=98, `X11_XPRA_PORT`=14501). `x11launcher.html` embeds `/x11-display/` as its canvas below the tab bar.
- **Manager endpoints** (all target the X11 display `:98` = `X11_DISPLAY` env; Chromium's `/api/browser/open` stays on `:99`):
  - `POST /api/x/launch {cmd}` — runs the command as the **request user** via a `su -` **login shell** (so bare names resolve on the user's PATH) with `DISPLAY=:<that user's X11 display>`, child reaped in a daemon thread. **D-Bus is chosen per app** (`_launch_prog` parses the program token): GNOME/GTK apps (eog, evince, …) get a **private session bus with no service activation** (`vibetop-x11-dbus`, socket `/run/user/<uid>/vibetop-x11-bus`) so they don't hang **~25s on `xdg-desktop-portal`/at-spi activation timeouts** in this sessionless desktop — ~0.2s startup instead of ~33s; **snap apps** (Firefox/Chromium, detected via `/snap/bin/<prog>`) get the **real user bus** (`/run/user/<uid>/bus`) because they exit on a bare bus (snap confinement needs the session bus) and don't block on the portal anyway. The private bus is **per-user, started on demand** by `_ensure_user_x11_dbus` (unit `vibetop-ux11dbus-<user>`, socket `/run/user/<uid>/vibetop-x11-bus`). Its policy template ships at `browser/dbus/x11-dbus.conf` → `/etc/vibetop/x11-dbus.conf` (`apps/everyday/browser/install.sh`) with **no `<servicedir>`** — but the manager does NOT run it directly: dbus-daemon 1.16 **ignores `--address` when `--config-file` is given** (it needs a `<listen>` element *inside* the config), and the socket path is per-user, so the manager renders a per-user config (`/run/user/<uid>/vibetop-x11-dbus.conf` = template + injected `<listen>`) and starts `dbus-daemon --config-file=<that>`. It also **self-heals a stale unit** (active but the socket is gone → stop + reset-failed + recreate). *(Two shipped bugs made this silently 100%-broken until repaired: a `--` inside the template's XML comment (expat rejects the file) and the missing `<listen>` — a static test now guards both. See `docs/design-decisions.md`.)* **Terminals route GUI apps to the private bus too** (as of v1.16.49): `_user_terminal_setenvs` points the terminal's `DBUS_SESSION_BUS_ADDRESS` at it, so a GNOME/GTK app *typed at the prompt* is also fast (was ~40s on the real bus). `systemctl --user`/`gsettings` are unaffected (they reach the user manager via `$XDG_RUNTIME_DIR`, not the bus address — the old "terminals must keep the real bus" reason was wrong). **Snap browsers are the one exception** — they exit on the activation-free bus (snap-confine needs `org.freedesktop.systemd1` for a transient scope), so `apps/everyday/terminal/realbus-shim.sh` is installed as `/usr/local/bin/{firefox,chromium}` (ahead of `/snap/bin`) to hand them the real bus. The command is the user's own shell command — **no allowlist** (they already have a Terminal as the same user, so it's no escalation); `_valid_launch_cmd` only rejects empty/over-1024-char/`\n``\r``\0` (which would split the `su -c` string). **Limitation:** launched apps are children of the manager's cgroup, so a manager restart (a self-update that changed a `.py`) kills them — same Popen pattern as `/api/browser/open`; rare and re-launchable.
  - `GET /api/x/windows` → **`{"windows":[{id,title}]}`** (an object, not a bare array — verified against the running manager; `self._json(200, {"windows": wins})`) from `wmctrl -l` on `:98` (ids validated `0x[0-9a-f]{1,16}` via `_valid_x_window_id`, desktop-sentinel `-1` rows skipped). Drives the tabs.
  - `POST /api/x/activate {id}` / `POST /api/x/close {id}` → `wmctrl -i -a/-c <id>` (raise / close the window). `wmctrl` is an apt dep of `apps/everyday/browser/install.sh`.
- **The page** has an **always-visible command bar** on top (type any command + Run / Enter — so you can launch without opening a terminal), a **tab bar** of running windows below it (hidden when none), and the canvas below that. It polls `/api/x/windows` every 2s (paused when the desktop switches away, via the `vibetop:active` message). Clicking a tab **raises** that window in the single canvas (no reload); a tab's **×** closes that one window (`wmctrl -c` → the app exits, which **returns a terminal that was blocked on it in the foreground**); launching focuses the new window once it appears. Because the canvas is its own **per-user** X11 display (separate from that user's Browser display), switching desktop tabs preserves state with no cross-canvas size conflict. **Closing the WHOLE X11 Launcher** (the taskbar ×) now also closes its GUI windows — `closeApp('x11launcher')` → `closeAllXWindows()` (graceful `wmctrl -c` on each) — so an app launched from a terminal doesn't keep running (and its terminal stay blocked) after you close the launcher. It fires only on an **explicit** close (taskbar ×, Start-menu ⏻, cross-device close), NOT on a deploy-reload/reset (those tear down iframes via `reload()`/`clearAllLocal()`, never `closeApp`), so a routine refresh can't kill your apps.
- **X11 apps started from the Terminal show up as tabs automatically**: `_user_terminal_setenvs` exports `DISPLAY=:<that user's X11 display>` + `DBUS_SESSION_BUS_ADDRESS` (the **private activation-free bus** — so GUI apps typed at the prompt are fast, not a ~40s portal hang) + `XDG_RUNTIME_DIR` into each per-user terminal, so a GUI app run in a terminal (gnuplot's qt terminal, matplotlib, `xeyes`, …) renders on that user's X11 desktop — no per-app routing. (The env is baked at terminal start, so it only reaches **new** terminals — open a fresh one after a deploy that changed it; snap browsers are the exception, routed back to the real bus by the `/usr/local/bin` shims.)
- **Auto-surface**: `desktop.html` polls `/api/x/windows` every 4s and, when a **new** window id appears on the X11 display (edge-triggered, seeded on first poll), opens/focuses the X11 Launcher — so terminal graphics pop to the front without manually opening it. Skipped when the launcher is already active.
- **Snap apps** (Firefox/Chromium) launched onto the X11 display need `xhost +si:localuser:@APP_USER@` (set at session start in `vibetop-x11-xpra.service`) — a confined snap can't read the X auth cookie (its `home` interface excludes dotfiles, so `~/.Xauthority` is unreadable) and falls back to the host ACL, failing with "cannot open display" / `Authorization required, but no authorization protocol specified`. Must be `si:localuser:` (server-interpreted, uses the socket peer creds) — the older `+local:`/`FamilyLocalHost` is **not** honored for the Unix-socket connection (proven; see `docs/design-decisions.md`). `x11-xserver-utils` (xhost) is an apt dep.
- `/api/reset` restarts `vibetop-x11-xpra` too, so a logout/reset clears every launched app.

