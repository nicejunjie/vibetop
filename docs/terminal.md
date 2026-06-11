# claude-terminal (project: claude-web on myhost)

Up to 20 browser-accessible persistent terminals at `http://192.168.1.10/tN/`,
behind nginx. Close the tab, reopen from any LAN browser (or a different
machine), and the same shell is there with its current screen state.

A tabbed UI at `/terminals/` provides add/close/reorder/rename for tabs.

Project dir: `~/vibe-coding/service-in-browser/terminal/`

## What it is

- Up to 20 independent `ttyd` instances on loopback ports `127.0.0.1:7681..7700`,
  each serving an xterm.js terminal under a base path (`/t1/`..`/t20/`).
- Each ttyd runs `claude-session attach N`, which connects to a
  per-instance `claude-session` daemon over a Unix socket. The daemon
  holds bash in a PTY and:
  - the shell process persists across disconnects;
  - output is recorded in a 256KB ring buffer and replayed on reconnect,
    so any new tab/device sees the current screen state plus recent history;
  - multiple browser tabs share the same session (daemon fans output
    to all connected clients);
  - output passes through transparently (no escape sequence processing),
    so xterm.js's 50k-line scrollback buffer works via mouse wheel.
- nginx on port 80 path-routes `/tN/` -> `127.0.0.1:$(7680+N)`.
- nginx injects `scrollback:50000` into xterm.js's Terminal constructor
  via `sub_filter` (ttyd 1.7.4's runtime setter doesn't work) and a
  clipboard polyfill for auto-copy on HTTP origins.
- Browser tab titles show "Terminal 1" through "Terminal 20", and each
  shell has `$TERM_ID` set (1–20) for prompt customization.
- **Scroll**: trackpad / mouse wheel scrolls xterm.js's 50k-line buffer.
- **Select + copy**: native browser drag-select, auto-copies to clipboard.
  On HTTP origins uses `document.execCommand('copy')` fallback.

## Tabbed UI

`/terminals/` serves `terminals.html` — a single page with iframes:
- **+** button adds the next available terminal (up to T20)
- **×** closes a tab (hides it; the session daemon keeps running)
- **Drag** tabs to reorder
- **Double-click** a tab to rename (e.g. `T2:claude`)
- Tab order, names, and active tab persist in localStorage

## Access

- `http://192.168.1.10/terminals/` — tabbed terminal UI.
- `http://192.168.1.10/t1/` .. `/t20/` — direct terminal URLs.
- No auth. LAN-only. Exposed publicly via Cloudflare Tunnel at
  `https://service.example.com/` with Access auth.

## Architecture: claude-session + ttyd + nginx

Two systemd template units, instantiated for each terminal:

1. **`claude-web-session@N.service`** (`Type=simple`) — runs
   `claude-session serve N` as user `myuser`. The daemon spawns
   `/bin/bash -l` in a PTY, listens on `/tmp/claude-session-N.sock`,
   and records output in a 256KB ring buffer. On connect, it sends
   `\033[0m` (SGR reset) + ring buffer contents for screen repaint.
   When bash exits (e.g. user types `exit`), the daemon clears the
   ring buffer and spawns a new bash. `Restart=always` handles daemon
   crashes. `WorkingDirectory=~` makes new shells start in `$HOME`.
   Sets `TERM=xterm-256color`, `LANG=en_US.UTF-8`, `TERM_ID=N`.
2. **`claude-web-ttyd@N.service`** — runs `ttyd-run.sh N`, which execs
   `ttyd -W -i 127.0.0.1 -p $((7680+N)) -b /tN/ -t reconnect=3
   -t "titleFixed=Terminal N" -t scrollback=50000
   claude-session attach N`. Each browser tab spawns its own attach
   process; the daemon multiplexes them. `-t reconnect=3` makes the
   browser auto-reconnect 3 s after an *abnormal* WS drop. A *clean*
   close (code 1000 — what iOS sends when it suspends a backgrounded
   tab) instead shows ttyd's "Press ⏎ to Reconnect" overlay; a guard
   injected by the nginx `sub_filter` watches for it and synthesizes the
   Enter keypress so the terminal reconnects on its own (see the cross-
   project CLAUDE.md). `Requires=` + `After=` make the ttyd unit depend
   on its matching session unit.

Window resize: the attach process writes `rows cols` to
`/tmp/claude-session-N.size` and sends `SIGUSR1` to the daemon PID
(from `/tmp/claude-session-N.pid`). The daemon applies `TIOCSWINSZ`
to the shell's PTY.

## Files

- `~/vibe-coding/service-in-browser/terminal/claude-session` — Python session daemon/attach tool.
- `~/vibe-coding/service-in-browser/terminal/ttyd-run.sh` — ttyd launcher; takes instance
  number, computes port and attach command.
- `~/vibe-coding/service-in-browser/terminal/terminals.html` — tabbed UI page.
- `/etc/systemd/system/claude-web-session@.service` — session daemon template.
- `/etc/systemd/system/claude-web-ttyd@.service` — ttyd template.
- `/etc/nginx/sites-available/claude-web` — per-instance `location /tN/`
  proxy blocks with `sub_filter` for scrollback and clipboard, plus
  `include /etc/nginx/snippets/claude-extras.d/*.conf` so sibling
  projects (claude-browser) can drop in their own location blocks.
- `/etc/nginx/conf.d/claude-web-upgrade.conf` — `$connection_upgrade`
  map (only present if not already defined elsewhere on the host).

## Operations

```bash
sudo systemctl status 'claude-web-*@*'
sudo systemctl restart claude-web-ttyd@2          # reconnect t2; session daemon untouched
sudo systemctl restart claude-web-session@2       # kills daemon + shell, restarts fresh
journalctl -u claude-web-ttyd@2 -f
journalctl -u claude-web-session@2 -f
```

All 40 units (20 sessions + 20 ttyd) auto-start on boot via `WantedBy=multi-user.target`.

## Resetting a terminal

Type `exit` in the shell. The bash exits, the daemon spawns a new
bash and clears the ring buffer. The browser auto-reconnects after
the 3 s `reconnect` delay and lands on a fresh login shell.

## Adding more terminals

Terminals are created dynamically on demand via the manager API — click
"+" in the tabbed UI or `POST /api/terminals/N/start`. Up to 50 slots
are pre-configured in the nginx `map`. To increase beyond 50, bump
`MAX_INSTANCES` and re-run `install.sh`.

## Why claude-session (after tmux)

The original architecture used tmux for session persistence. tmux
manages its own screen by repainting with cursor positioning (escape
sequences like `\e[H`, `\e[K`) instead of letting output scroll
naturally. This prevents xterm.js scrollback from working — users
got only ~80 lines of mouse-wheel scroll.

`claude-session` is a lightweight Python daemon (~250 lines) that
holds bash in a PTY and passes output through transparently. No
escape sequence processing, no screen management. xterm.js sees
raw output and accumulates it in its scrollback buffer. On reconnect,
the daemon replays its 256KB ring buffer so the screen state and
recent history are restored.

Before tmux, `dtach` was tried but it doesn't preserve screen state
on reconnect. `abduco` would work but isn't packaged for Ubuntu.
