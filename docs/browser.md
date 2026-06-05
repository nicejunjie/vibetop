# claude-browser (project on myhost)

A persistent web browser running on myhost, viewable from any browser
at `http://192.168.1.10/browser/` (or `https://service.example.com/browser/`
via Cloudflare Tunnel). Same continuity story as the terminals: close
the tab, reopen from any device, same browser, same tabs, same scroll
position.

Project dir: `~/vibe-coding/service-in-browser/browser/`

## What it is

One systemd service running as user `myuser`:

**`claude-browser-xpra.service`** — xpra `start-desktop :99` with:
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

## nginx integration

claude-web's site includes `/etc/nginx/snippets/claude-extras.d/*.conf`,
and claude-browser drops `browser.conf` there:

- `location = /browser` → `301` to `/browser/`
- `location /browser/` — reverse-proxy to `127.0.0.1:14500` with WS
  upgrade headers. `proxy_pass` with trailing slash strips the `/browser/`
  prefix so xpra sees clean paths.

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

- `browser/install.sh` — one-command deploy (adds repo, installs
  packages, renders templates, enables service)
- `browser/uninstall.sh` — clean removal (also handles legacy VNC units)
- `browser/systemd/claude-browser-xpra.service` — unit template
  (`@APP_USER@`, `@DISPLAY_NUM@`, `@XPRA_PORT@`, `@LOOP_SCRIPT@`, etc.)
- `browser/nginx/browser.conf` — location snippet template with
  sub_filter patches (`@XPRA_PORT@`)
- `browser/browser-loop.sh` — chromium restart wrapper template
  (`@BROWSER_CMD@`), deployed to `/usr/local/lib/claude-browser/`

## Operations

```bash
systemctl status claude-browser-xpra
sudo systemctl restart claude-browser-xpra        # restart full session
xpra info :99                                      # session info
journalctl -u claude-browser-xpra -f               # logs
DISPLAY=:99 xrandr                                 # check display modes
DISPLAY=:99 xwininfo -root -children               # list X windows
ss -tlnp | grep :14500                             # confirm loopback listen
```

## Multi-client behavior

Multiple HTML5 clients can connect simultaneously — they all see the
same display. Clicking and typing from any client moves the same cursor.
No isolation between viewers.

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
