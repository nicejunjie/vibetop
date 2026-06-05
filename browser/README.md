# claude-browser

A web browser running on myhost, viewable from any browser via xpra's HTML5
client at `http://<host>/browser/`. Same persistence story as claude-web's
terminals — close the tab, reopen from any device, same browser session,
same tabs, same scroll position.

## One-command deploy

Prerequisite: claude-web's `install.sh` must have been run on this host
first, so the nginx site exists and includes
`/etc/nginx/snippets/claude-extras.d/*.conf`.

```bash
cd ~/vibe-coding/service-in-browser/browser
sudo ./install.sh
```

Open `http://<host>/browser/` from any browser.

## What it builds

- **xpra** `start-desktop :99` — virtual X display (Xorg + dummy video
  driver for full RANDR support), window management (matchbox in
  kiosk/fullscreen mode), HTML5 client + WebSocket server on
  `127.0.0.1:14500`. Single process replaces the previous 4-service VNC
  stack (Xvnc + openbox + chromium + noVNC/websockify).
- **chromium** (snap) running on `:99` via `browser-loop.sh` auto-restart
  wrapper. Profile persists at `~/snap/chromium/common/chromium/`.
- An nginx snippet at `/etc/nginx/snippets/claude-extras.d/browser.conf`
  that proxies `/browser/` to xpra's HTTP/WebSocket port with CSS/JS
  patches injected via `sub_filter` for mouse offset correction and
  scroll fix.

The single `claude-browser-xpra` unit has `Restart=on-failure`. If xpra
dies, systemd brings it back. If chromium crashes, `browser-loop.sh`
restarts it within 2 seconds.

## Key features vs the old VNC setup

- **Dynamic resize** — display resizes to match your browser window
  (Xorg dummy driver provides full RANDR)
- **Better performance** — xpra uses per-region encoding (h264/vp8 for
  motion, lossless for text), fewer protocol layers than VNC+websockify
- **Native clipboard** — xpra handles clipboard natively (no manual
  clipboard bar)
- **Smooth scrolling** — custom scroll handler replaces xpra's
  120-unit accumulation threshold with immediate per-event dispatch

## Configurable knobs

| Var | Default | Meaning |
|---|---|---|
| `APP_USER` | invoking user | System user the X session runs as |
| `DISPLAY_NUM` | `99` | X display number |
| `XPRA_PORT` | `14500` | xpra WebSocket+HTML5 port (loopback only) |
| `BROWSER_CMD` | auto-detected | Full command for the browser |
| `INSTALL_DEPS` | `1` | install xpra from xpra.org repo |
| `INSTALL_SYSTEMD` | `1` | render & enable systemd unit |
| `INSTALL_NGINX` | `1` | drop the nginx snippet |
| `DRY_RUN` | `0` | print actions without executing |

Examples:

```bash
BROWSER_CMD="/usr/bin/firefox-esr --no-remote" sudo ./install.sh
sudo ./install.sh --dry-run
```

### About snap browsers and `--user-data-dir`

On Ubuntu 24.04 (noble), `chromium-browser` and `firefox` are snap-only.
Snap confinement blocks `--user-data-dir` paths outside the snap's
allowed dirs. install.sh detects snap browsers and omits the flag, letting
the snap use its default profile dir, which persists fine. Override with
`BROWSER_CMD` if needed.

## Files written

```
/etc/systemd/system/claude-browser-xpra.service    # xpra session
/etc/nginx/snippets/claude-extras.d/browser.conf   # /browser/ location
/usr/local/lib/claude-browser/browser-loop.sh      # chromium restart wrapper
/etc/apt/sources.list.d/xpra.sources               # xpra.org apt repo
/usr/share/keyrings/xpra.asc                       # xpra.org GPG key
/etc/udev/rules.d/99-uinput.rules                  # uinput access for input
~/snap/chromium/common/chromium/                    # snap chromium's profile
```

## Operations

```bash
systemctl status claude-browser-xpra
sudo systemctl restart claude-browser-xpra   # restart full session
xpra info :99                                 # session info
journalctl -u claude-browser-xpra -f          # logs
DISPLAY=:99 xrandr                            # check display resolution
```

## Multi-client behavior

Multiple HTML5 clients can connect simultaneously — they all see the same
display. Clicking and typing from any client moves the same cursor. No
isolation between viewers.

## Caveats

- **Audio** — xpra can forward audio but it's disabled (no use case).
- **Clipboard** — works natively via xpra on HTTPS. On plain HTTP,
  clipboard write works but read may require the xpra clipboard panel.
- **Network exit** — every page load originates from myhost's network.
- **xpra.org repo** — xpra is installed from the xpra.org apt repo
  (Ubuntu's packaged v3.1.5 is too old). GPG key at
  `/usr/share/keyrings/xpra.asc`.

## Uninstall

```bash
sudo ./uninstall.sh
```

Stops and disables the xpra service, removes the nginx snippet and
browser-loop.sh. Leaves apt packages, the xpra.org repo, and the browser
profile in place.
