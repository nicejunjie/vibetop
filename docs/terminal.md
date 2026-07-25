# vibetop-terminal (project: vibetop on myhost)

Up to 50 browser-accessible persistent terminals at `http://192.168.1.10/tN/`,
behind nginx. Close the tab, reopen from any LAN browser (or a different
machine), and the same shell is there with its current screen state.

A tabbed UI at `/terminals/` provides add/close/reorder/rename for tabs.

Project dir: `terminal/` (repo-relative; prod checkout is `/opt/vibetop/app`)

## What it is

- Up to 50 independent `ttyd` instances on loopback ports `127.0.0.1:7681..7730`
  (base `BASE_PORT`+N, default 7680), each serving an xterm.js terminal under a
  base path (`/t1/`..`/t50/`), provisioned on demand (not pre-started).
- Each ttyd runs `vibetop-session attach N`, which connects to a
  per-instance `vibetop-session` daemon over a Unix socket. The daemon
  holds bash in a PTY and:
  - the shell process persists across disconnects;
  - output is recorded in a 2MB ring buffer and replayed on reconnect,
    so any new tab/device sees the current screen state plus recent history;
  - multiple browser tabs share the same session (daemon fans output
    to all connected clients);
  - output passes through transparently (no escape sequence processing),
    so xterm.js's 50k-line scrollback buffer works via mouse wheel.
- nginx on port 80 path-routes `/tN/` -> `127.0.0.1:$(7680+N)`.
- nginx injects `scrollback:50000` into xterm.js's Terminal constructor
  via `sub_filter` (ttyd 1.7.4's runtime setter doesn't work) and a
  clipboard polyfill for auto-copy on HTTP origins.
- Browser tab titles show "Terminal 1" through "Terminal N", and each
  shell has `$TERM_ID` set (1–N) for prompt customization.
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

## Architecture: vibetop-session + ttyd + nginx

Two systemd template units, instantiated for each terminal:

1. **`vibetop-session@N.service`** (`Type=simple`) — runs
   `vibetop-session serve N` as user `myuser`. The daemon spawns
   `/bin/bash -l` in a PTY, listens on `/tmp/vibetop-session-N.sock`,
   and records output in a 2MB ring buffer. On connect, it sends
   `\033[0m` (SGR reset) + ring buffer contents for screen repaint.
   When bash exits (e.g. user types `exit`), the daemon clears the
   ring buffer and spawns a new bash. `Restart=always` handles daemon
   crashes. `WorkingDirectory=~` makes new shells start in `$HOME`.
   Sets `TERM=xterm-256color`, `LANG=en_US.UTF-8`, `TERM_ID=N`.
2. **`vibetop-ttyd@N.service`** — runs `ttyd-run.sh N`, which execs
   `ttyd -W -i 127.0.0.1 -p $((7680+N)) -b /tN/ -t reconnect=3
   -t "titleFixed=Terminal N" -t scrollback=50000
   vibetop-session attach N`. Each browser tab spawns its own attach
   process; the daemon multiplexes them. `-t reconnect=3` makes the
   browser auto-reconnect 3 s after an *abnormal* WS drop. A *clean*
   close (code 1000 — what iOS sends when it suspends a backgrounded
   tab) instead shows ttyd's "Press ⏎ to Reconnect" overlay; a guard
   injected by the nginx `sub_filter` watches for it and synthesizes the
   Enter keypress so the terminal reconnects on its own (see the cross-
   project CLAUDE.md). `Requires=` + `After=` make the ttyd unit depend
   on its matching session unit.

Window resize: the attach process writes `rows cols` to
`/tmp/vibetop-session-N.size` and sends `SIGUSR1` to the daemon PID
(from `/tmp/vibetop-session-N.pid`). The daemon applies `TIOCSWINSZ`
to the shell's PTY — **debounced** (`RESIZE_DEBOUNCE` ~35ms): SIGUSR1 arms a
deadline and the main loop applies the *latest* size once the burst settles, so a
rapid pair of resizes collapses into one `TIOCSWINSZ` + SIGWINCH and the shell
redraws once. (Daemon change ⇒ only **new** sessions get it; serve daemons are
never restarted, since that would kill live shells.)

Re-claim shape across devices: because the PTY is **shared**, its
`rows×cols` belong to whichever device (desktop tab / phone) fitted last,
so after switching active device the TUI inside renders at the other
device's shape.

**Automatic self-heal (desktop).** The terminal can also drift to a wrong width
*mid-session on the same device* — every line wrapping ~1 column too narrow
("the screen wrapped itself, I did nothing"), most often when a brief WebSocket
blip reconnects and **replays the ring buffer at a stale width** (a scrollbar or
layout shift does it too). `terminal-kbd.js`'s non-touch branch fires a
`resize`→FitAddon heal on its own: after each ttyd (re)connect's replay settles,
on a `ResizeObserver` of the terminal box, and when the tab returns to the
foreground. Debounced and guarded to a non-zero size; ttyd only resizes the PTY
when the computed cols/rows actually change, so a steady terminal sees no churn.

**Manual re-claim.** A **double-click** (desktop) / **two-finger tap** (touch)
re-sends *this* device's size via `claimSize()`, which writes straight to ttyd's
WebSocket (`RESIZE_TERMINAL="1"` + `{columns,rows}`; the socket is captured by
wrapping `window.WebSocket` before ttyd opens it) so the **visible xterm grid
never resizes** — resizing the grid is what made the content visibly "shake".
Because the kernel raises SIGWINCH only when the winsize actually *changes*,
sending the current dims would be a silent no-op, so `claimSize` **nudges the
column and back** (`{c-1,r}` then `{c,r}`): two real changes → two SIGWINCHes →
the shared PTY ends up at this device's shape. A *row* nudge was rejected — it
makes a bottom-anchored TUI bounce a row; a column nudge keeps every row in
place. Falls back to the old visible `term.resize()` pair if the socket wasn't
captured. The other device sees mis-shaped output until *it* re-claims — the PTY
can't be two shapes at once. Full derivation, incl. the regression where killing
the shake silently killed the re-claim: `docs/design-decisions.md` §"Killing the
terminal 'shake'…"; the touch gesture choice (two-finger tap, and why a
single-finger double-tap is deliberately NOT a resize) is in the same file under
§"Mobile terminal resize".

**Windows Chromium focus fix.** Any `term.resize()` — the reshape's, *or* the
desktop shell's re-fit when the Terminal app is (re)activated/refreshed, *or* a
window resize — **blurs xterm's hidden input textarea on Windows Chromium and it
never refocuses**, leaving the terminal untypable (macOS and touch restore focus
on their own). This made the v1.6.6 reshape break typing the instant you
double-clicked to focus the terminal, and a plain refresh leave Windows unable to
type, while Mac/iPhone were fine. The cure is a single root fix in
`terminal-kbd.js`'s non-touch branch: re-`term.focus()` right after
`term.onResize`, deferred a tick and **guarded by `document.hasFocus()`** so it
only refocuses while this page is actually focused (never stealing focus from
another app). With that in place the double-click reshape stays — it's no longer
the input-killer it was.

## Mobile touch layer (`terminal-kbd.js`)

Injected into every `/tN/` page by the nginx `sub_filter`. **Non-touch is
untouched** — desktop keeps native xterm (all keys, tap-to-focus, selection); only
the auto-refit and Windows focus fix above run there.

**Why an overlay at all.** On touch the script lays a full-height transparent
`<textarea>` over the terminal. Tapping it focuses *it*, so iOS raises the
keyboard and **dictation buffers into a real field natively** (like Notes) instead
of xterm streaming half-finished revisions to the PTY. Input is forwarded as a
debounced value-diff via xterm's `coreService.triggerDataEvent`, ignoring iOS
dictation's transient clear-to-`""`; Enter→CR, Backspace→DEL, Tab→TAB. Arrows/
Ctrl/Esc aren't on the iOS keyboard, so they come from the desktop shell's system
key bar instead. xterm's own helper textarea is blocked from taking focus on touch
(the `focusin` guard in the sub_filter) so only this input raises the keyboard.

**Caret parking — two rules that look redundant and are not.** The textarea's
caret is parked on the real xterm cursor row via a dynamic `padding-top` =
`buffer.active.cursorY` × row-height, so iOS's "reveal the caret" scroll lands on
wherever the prompt actually is — the *top* of a freshly-opened terminal, the
*bottom* of a full one. (An earlier fixed `bottom:0` strip only ever revealed the
bottom, pushing a fresh terminal's prompt off-screen.) Then:

1. Re-anchor **only on `onCursorMove`**, never on `onRender`. Render also fires on
   scroll, so re-anchoring there made iOS yank the view back to the prompt the
   instant you dragged — you couldn't scroll with the keyboard up.
2. **`positionCaret` early-returns unless the view is at the bottom**
   (`baseY - viewportY > 1`). Scrolled up into scrollback it does nothing, because
   a full-screen TUI (Claude Code, htop) repaints *in place* — moving the cursor
   every frame — so the re-park + iOS reveal would drag you back to the bottom on
   each repaint, making a *live* response unscrollable. Desktop has no overlay or
   reveal, which is why the bug was mobile-only.

Net: typing always keeps the line you're typing visible; manual scrollback stays
where you left it.

**Gesture routing.** The overlay covers xterm and would otherwise eat every touch,
so gestures are dispatched explicitly:

| Gesture | Result |
|---|---|
| quick tap | raise the keyboard — **or**, if the tap lands on an `http(s)` URL, open it in the Browser (`urlAt`/`logicalLineAt` reassemble the wrapped logical line under the finger and hand it to the sub_filter's overridden `window.open`) |
| vertical drag | scrollback |
| long-press (~0.45s) | select the word under the finger, drag to extend, then a floating **Copy** button + two iOS-style drag handles |
| two-finger tap | re-claim the terminal shape (see above) |

**Selection internals (each line is a fixed bug).** The long-press **blurs the
overlay** on select-start *and* on touchend — `preventDefault` alone didn't
reliably un-focus the textarea iOS had already focused, so the keyboard popped up
mid-selection. The target cell is **captured at `touchstart`** (`startCell`), not
re-measured when the 450ms timer fires: the keyboard animating up between those
moments scrolls the terminal, so a late re-measure mapped a stale finger-y onto
shifted rows and selected ~2 rows too low. `cellAt` measures **`.xterm-screen`**
(the actual rows), not `.element` — the latter carries ~5px top / ~8px bottom
padding that skews both the origin and the per-row height. Handles are a 2px stem
the height of the edge cell (marks the boundary without hiding content) capped by
a knob placed *above* the start / *below* the end, inside a 34px transparent hit
target; the drag is **relative** (`touchstart` pins the finger's offset from the
cell centre as `offY`) so it never jumps on grab. `selStart`/`selEnd` are absolute
buffer cells, so `positionHandles` on `onScroll` tracks them through scrollback and
hides a handle that scrolls out of view. iOS's own long-press selection/loupe is
suppressed on the overlay (`user-select:none` + `-webkit-touch-callout:none`) so
these handlers own the gesture — the desktop copy-on-`onSelectionChange` path
doesn't work on touch, hence the explicit Copy button.

## Files

- `terminal/vibetop-session` — Python session daemon/attach tool.
- `terminal/ttyd-run.sh` — ttyd launcher; takes instance
  number, computes port and attach command.
- `terminal/terminals.html` — tabbed UI page.
- `/etc/systemd/system/vibetop-session@.service` — session daemon template.
- `/etc/systemd/system/vibetop-ttyd@.service` — ttyd template.
- `/etc/nginx/sites-available/vibetop` — per-instance `location /tN/`
  proxy blocks with `sub_filter` for scrollback and clipboard, plus
  `include /etc/nginx/snippets/vibetop-extras.d/*.conf` so sibling
  projects (vibetop-browser) can drop in their own location blocks.
- `/etc/nginx/conf.d/vibetop-upgrade.conf` — `$connection_upgrade`
  map (only present if not already defined elsewhere on the host).

## Operations

```bash
sudo systemctl status 'vibetop-*@*'
sudo systemctl restart vibetop-ttyd@2          # reconnect t2; session daemon untouched
sudo systemctl restart vibetop-session@2       # kills daemon + shell, restarts fresh
journalctl -u vibetop-ttyd@2 -f
journalctl -u vibetop-session@2 -f
```

Terminal units are **provisioned on demand** by the manager API (the systemd
template units are not pre-enabled); only `vibetop-manager.service` starts at
boot. Starting terminal N brings up `vibetop-session@N` + `vibetop-ttyd@N`.

## Resetting a terminal

Type `exit` in the shell. The bash exits, the daemon spawns a new
bash and clears the ring buffer. The browser auto-reconnects after
the 3 s `reconnect` delay and lands on a fresh login shell.

## Adding more terminals

Terminals are created dynamically on demand via the manager API — click
"+" in the tabbed UI or `POST /api/terminals/N/start`. Up to 50 slots
are pre-configured in the nginx `map`. To increase beyond 50, bump
`MAX_INSTANCES` and re-run `install.sh`.

## Why vibetop-session (after tmux)

The original architecture used tmux for session persistence. tmux
manages its own screen by repainting with cursor positioning (escape
sequences like `\e[H`, `\e[K`) instead of letting output scroll
naturally. This prevents xterm.js scrollback from working — users
got only ~80 lines of mouse-wheel scroll.

`vibetop-session` is a lightweight Python daemon (~250 lines) that
holds bash in a PTY and passes output through transparently. No
escape sequence processing, no screen management. xterm.js sees
raw output and accumulates it in its scrollback buffer. On reconnect,
the daemon replays its 2MB ring buffer so the screen state and
recent history are restored.

Before tmux, `dtach` was tried but it doesn't preserve screen state
on reconnect. `abduco` would work but isn't packaged for Ubuntu.
