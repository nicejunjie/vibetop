# vibetop-terminal (project: vibetop on myhost)

Up to 50 browser-accessible persistent terminals at `http://192.168.1.10/tN/`,
behind nginx. Close the tab, reopen from any LAN browser (or a different
machine), and the same shell is there with its current screen state.

A tabbed UI at `/terminals/` provides add/close/reorder/rename for tabs.

Project dir: `apps/everyday/terminal/` (the app) + `server/` (the manager) (repo-relative; prod checkout is `/opt/vibetop/app`)

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

**Caret parking — and what it deliberately does NOT do.** The textarea's caret
is parked on the real xterm cursor row via a dynamic `padding-top` =
`buffer.active.cursorY` × row-height (clamped a row inside the box, so iOS never
sees the focused caret as clipped and never fires its reveal-scroll against us).
The `/tN/` document is **exactly frame-height and never scrolls** — keeping the
active line clear of the soft keyboard / key bar is the **desktop's** job: it
computes a lift from its own `visualViewport` (the only one that shrinks for the
keyboard) and applies it as a `translateY` on `terminals.html`'s `.frames`
(see `docs/desktop.md` §Mobile and the key-bar saga in `design-decisions.md` —
every design that relayed a measured figure down here for this page to scroll
went stale when iOS flipped viewport regimes). Two parking rules remain:

1. Re-anchor **only on `onCursorMove`**, never on `onRender`. Render also fires on
   scroll, so re-anchoring there made iOS yank the view back to the prompt the
   instant you dragged — you couldn't scroll with the keyboard up.
2. **`positionCaret` early-returns unless the view is at the bottom**
   (`baseY - viewportY > 1`). Scrolled up into scrollback it does nothing, because
   a full-screen TUI (Claude Code, htop) repaints *in place* — moving the cursor
   every frame — so the re-park + iOS reveal would drag you back to the bottom on
   each repaint, making a *live* response unscrollable. Desktop has no overlay or
   reveal, which is why the bug was mobile-only.

Net: typing always keeps the line you're typing visible (the desktop's lift);
manual scrollback stays where you left it.

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

- `apps/everyday/terminal/vibetop-session` — Python session daemon/attach tool.
- `apps/everyday/terminal/ttyd-run.sh` — ttyd launcher; takes instance
  number, computes port and attach command.
- `apps/everyday/terminal/terminals.html` — tabbed UI page.
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

---

# Architecture summary

> How the terminal stack hangs together, plus scheduled messages and URL
> forwarding. Deep mechanism for the daemon/ttyd/nginx layer is above.

## Terminal stack

**Dynamic provisioning** — terminals are created/destroyed on demand via a manager API, not pre-provisioned.

Services:
- `vibetop-manager.service` — threaded Python HTTP server on `127.0.0.1:7680` (runs as root; `ThreadingHTTPServer` so a slow request — a multi-GB upload, health probes — can't block the status polls). Manages terminal lifecycle and provides system status. Endpoints:
  - Terminal: `POST /api/terminals/{n}/start|stop`, `GET /api/terminals/status`
  - Scheduled terminal messages (see *Scheduled terminal messages* below): `GET/POST /api/terminals/schedules`, `POST /api/terminals/schedules/cancel`
  - System: `GET /api/system/status` (CPU + per-core, MEM, GPU, VRAM, load_avg, etc.), `GET /api/health`
  - Services: `GET /api/services/discover` — auto-discovered network services from listening non-loopback sockets (`ss -tlnp` + `/proc` cmdline naming, via the `service_discovery` sibling module; powers the Services dashboard)
  - Browser: `POST /api/browser/open` (validated URL → remote Chromium via the xpra display)
  - Office **View**: `GET /api/office/preview?path=<rel-to-~>` (headless LibreOffice → PDF, cached by mtime under `~/.cache/vibetop-office`, served inline for the shell's read-only doc viewer). Needs `libreoffice-writer/calc/impress` (installed by `apps/everyday/browser/install.sh`).
  - Office **Edit**: the **OnlyOffice Document Server** (Docker, `apps/everyday/office/install.sh`, nginx `/onlyoffice/`). The shell's Office app loads `/office-editor.html?path=…`, which fetches a JWT-signed editor config from `GET /api/office/config`. The container reaches back via `host.docker.internal` to `GET /api/office/doc` (file bytes) and `POST /api/office/callback` (save) — both authorized by an HMAC `t=` over the path. Autosave: the editor calls `POST /api/office/forcesave` (debounced, on app-switch, and on `pagehide` via `sendBeacon`); the manager issues a `forcesave` command to OnlyOffice (per-session key in `_office_sessions`), which fires the callback and writes the file back atomically. JWT (HS256) signed/verified with the shared secret at `~/.config/vibetop/onlyoffice.secret`. All office paths gate on `_resolve_under_home` + `OFFICE_RE`.
  - Office **new doc**: `POST /api/office/new {type}` stamps a blank file from a bundled template (`apps/everyday/office/templates/new.{docx,xlsx,pptx}`) into `~/Documents` and returns its path — the Office app opened with no file shows a Document/Spreadsheet/Presentation chooser.
  - Office **download**: `GET /api/office/download?path=` serves the ORIGINAL file as an attachment (the viewer shows a PDF rendition, so its Download button must give the real `.docx/.xlsx/…`; the preview iframe uses `#toolbar=0` to hide the browser's native PDF download).
  - Public share links (Files app **Share** button — passwordless read-only links): `POST /api/share {path, ttl}` mints a `/s/<token>` capability URL (`secrets.token_urlsafe(16)`), `GET /api/share/list` + `POST /api/share/revoke {token}` manage them, and the **public** `GET/HEAD /s/<token>[?dl=1]` serves the file (no auth — the token is the gate). Files stream with `Range`; a shared **folder** streams as an on-the-fly `.zip`. Registry `~/.local/share/vibetop-shares.json`; fenced to `SHARE_ROOT` (default home) with **no dotfiles** (`_safe_share_target`); same-origin-XSS guard (`nosniff` + sandbox CSP, `attachment` for `.html`/`.svg`, `inline` only for images/PDF/text/av); default 7-day expiry + revoke. Reachable over the tunnel only after a manual Cloudflare Access **Bypass** app for `/s/*` (`tunnel/README.md` §8; the `/s/` nginx location is in `server/install.sh`). See `docs/design-decisions.md`.
  - Opening an office/video file in Files (`filebrowser-patches.js`): the interceptor matches FileBrowser's own open gesture — a single click/**tap** only **selects**, a **double-click / double-tap** opens (detected on the click events so the second is blocked before FileBrowser navigates to its dead-end "Preview not available" page). Touch uses the same double-tap path as mouse (a single tap must never play a video); FileBrowser selects a file on a single tap on touch, so the first tap just falls through to it. A video opens in the **Video player** — `APPS.video` (`/video.html`), a `hidden:true` app that never appears in the Start menu and is registered only so the taskbar/title bar can render it; Files opens it by pushing `'video'` into `openApps` directly. (Why a custom player rather than FileBrowser's preview, and why it must reach files **outside** `~`: `docs/design-decisions.md`.)
  - Notes (multi-document — see `docs/apps.md` §Notes): `GET /api/notes` (tab index) · `GET /api/notes?id=N` (one note's content) · `POST /api/notes {id,content}` (save) · `POST /api/notes/tabs {tabs,active}` (rename/reorder/add/close). Files under `~/.local/share/desktop-notes/` (`<id>.md` + `index.json`); ids sanitized by `_safe_note_id`
  - X11 Launcher (GUI apps on the `:98` X11 display — see `docs/browser.md` §X11 Launcher): `POST /api/x/launch {cmd}`, `GET /api/x/windows`, `POST /api/x/activate|close {id}`
  - Files tabs: `GET/POST /api/files/tabs` — the Files app's shared, live-synced folder-tab set (`~/.local/share/desktop-files-tabs.json`)
  - Auto-refresh: `GET /api/events` (SSE) — pushes a `reload` event when the deployed `sw.js` VERSION changes, so every client refreshes on deploy (see `docs/desktop.md` §PWA / service worker)
  - Claude usage/stats (opt-in — see `docs/apps.md` §Claude plan-usage strip / §Token consumption stats): `GET/POST /api/claude/usage` (Max-plan usage strip + on/off toggle) and `GET /api/claude/stats` (token/cost analytics parsed from `~/.claude/projects/**/*.jsonl`, via the `claude_stats` sibling module)
  - Desktop state: `GET /api/desktop?instance=<id>` (this instance's own windows for restore + the live cross-instance `running` union for Start-menu dots + `reset_epoch` + `close_targets`) and `POST /api/desktop {instance, open, active}` (upserts that instance into the registry + heartbeat). Both responses also carry the **shared shell-level UI toggles** — `sys_stats` (System Stats readout on/off) and `claude_usage` (Claude Usage strip on/off, read from `_claude_usage_enabled()`) — so both converge across clients on this same 5s channel (`onDesktopResp` → `applyServerSysStats`/`applyServerClaudeUsage`), plus the **folded-in shell polls**: `terminals_running` (count for the Start-menu Terminal badge) always, `system` (the `/api/system/status` payload for the taskbar readout) when `sys_stats` is on, and `claude` (the `/api/claude/usage` numbers, via `_claude_usage_payload()`) when `claude_usage` is on, and **`warnings`** (system-health alerts, **always** — see below) — all memoized/cheap and collected outside `_desktop_lock`. This makes the desktop heartbeat the single shell-tier poll: system stats, terminal badge, and Claude-Usage numbers all ride it (the standalone `/api/system/status`, `/api/terminals/status`, and 30s `/api/claude/usage` client loops were all removed). `POST /api/desktop/close {app}` records the live instances holding `app` so each closes it (cross-device "close on all devices"). `POST /api/desktop/ui {sysStats}` sets the shared System-Stats preference on the state. File `~/.local/share/desktop-state.json` = `{instances:{id:{open,active,ts}}, reset_epoch, close_targets, sys_stats}`; per-instance registry with a `DESKTOP_TTL` (120s) liveness window and `DESKTOP_MAX_INSTANCES` cap, guarded by `_desktop_lock` (`claude_usage` is NOT stored here — it derives from `~/.claude/settings.json`, computed fresh per response)
  - Reset: `POST /api/reset` — the logout button's "fresh start": stops all running terminals (session + ttyd units), clears the desktop registry **and bumps `reset_epoch`** (so every other live instance detects the logout and clears itself), clears in-memory `_office_sessions`, and resets the Browser (stop `vibetop-browser-xpra` → wipe Chromium's session-restore files → start) so the next login is pristine
  - Upload: `POST /api/upload` (streaming multipart parser, writes into `UPLOAD_DIR`, default `~/Uploads`), `GET /api/upload/list`, `POST /api/upload/clear`
  - Update: `GET /api/update` (installed commit/date/subject), `POST /api/update` (`git fetch` + fast-forward to `origin/main` + redeploy; ignores untracked files; auto-resets a dirty tree that already matches upstream — the rsync case; refuses to clobber genuine tracked-file edits unless called with `{force:true}`, which `git stash`es them first — recoverable)
- `vibetop-session@N.service` — `vibetop-session serve N` (Python daemon holding bash in a PTY, started on demand)
- `vibetop-ttyd@N.service` — ttyd on `127.0.0.1:$((7680+N))`, base path `/tN/` (started on demand)

nginx proxies `/tN/` to the corresponding loopback port via the `map`-based regex location. `sub_filter` injects scrollback config, clipboard polyfill, and a `window.open` override that sends URL clicks to the embedded Chromium browser via `/api/browser/open`.

`vibetop-session` is a custom lightweight replacement for tmux that passes terminal output through transparently (no screen repainting), enabling xterm.js's 50k-line scrollback buffer. It records output in a 2MB ring buffer and replays it on reconnect so the screen state is preserved. Typing `exit` respawns a fresh shell within ~1s; ttyd's `reconnect=3` auto-reconnects the browser tab. ttyd only auto-reconnects on an **abnormal** WS close; a *clean* close (code 1000, which iOS produces when it suspends a backgrounded tab) instead shows a **"Press ⏎ to Reconnect"** overlay and waits for a keypress. A guard injected into every `/tN/` page (the `sub_filter` in `server/install.sh`) watches for that overlay via `MutationObserver` and synthesizes the Enter keypress ttyd's `onKey` handler is waiting for, so the terminal reconnects on its own like the other apps — riding ttyd's in-place reconnect (xterm scrollback preserved; `vibetop-session` replays its ring buffer). The observer is attached only once `document.body` exists (the script runs in `<head>`, so it retries via `startObs`) and also checks for an already-present overlay on load. If the overlay persists, the guard **keeps retrying the in-place reconnect with exponential backoff + jitter** (≈0.7s → cap 8s, plus up to 1s random) rather than reloading — so a transient outage (an nginx reload during a deploy/Update, or a network blip) recovers in place, and simultaneous drops across tabs don't synchronize into a thundering herd. Only after **20 s of continuous failure** (the in-place reconnect is genuinely stuck — e.g. a socket `error` set `doReconnect=false`, where only a fresh page helps) does it fall back to a single `location.reload()`, guarded to **once per 30 s** via `sessionStorage`. This is the key fix for the old "had to refresh many times" pain: the previous version reloaded the whole page after just 1.2 s (every 8 s), which during a reconnect storm threw the page away mid-load and reload-looped. The observer is attached only once `document.body` exists (the script runs in `<head>`, so it retries via `startObs`) and also checks for an already-present overlay on load.

A tabbed UI at `/terminals/` (`apps/everyday/terminal/terminals.html`) manages terminal tabs with add (+), close (×, stops the service), drag-reorder, and double-click-to-rename.

- **What's device-local vs shared.** Tab order/active persist in `localStorage` (device-local, like windows). **Tab names are server-side** (`GET/POST /api/terminals/names` → `~/.local/share/terminal-tab-names.json`, keyed by instance number) so a rename shows up on every device — terminal N is the same session across **that user's own** devices (per-user, run as them; names/state scoped to `_ctx_home()`). localStorage is only an instant-load cache; names refresh on focus/visibility.
- **The tab SET is live-synced** by reconciling against the shared backend running set (`GET /api/terminals/status`, polled ~2.5s + on focus/visibility + immediately when the desktop activates the Terminal app via `focus-terminal`) — open/close a tab on one client and it appears/disappears on the others, needing no new endpoint since running sessions are already shared state. Only set membership syncs; order/active stay device-local and a client never drops below one tab.
- **The reconcile is `(running ∪ pending) − closing`.** `pending` (opened here, not yet confirmed running) and `closing` (closed here, not yet confirmed stopped) are per-client sets covering the poll-lag races, so a just-opened tab isn't dropped and a just-closed one isn't re-added; `nextAvailable` also consults the last-known running set so two clients don't grab the same free number. Pure math, unit-tested in `apps/everyday/terminal/lib/tab-sync.js`.
- **Empty/dead → cold start.** If a reconcile finds every terminal was closed elsewhere (tab bar would be empty, or the last tab's session is dead — a 502), it starts a fresh terminal rather than leaving a dead tab.
- **Names are forgotten on close**, so a reused terminal number never inherits the old label — on tab close and on `/api/reset`, and (the backstop for an **abnormal** close: browser crash, host reboot, manager restart, where the client's handler never runs) the manager also forgets the name whenever a genuinely fresh session starts for that number (`_forget_tab_name` in `_start_user_terminal`, gated on the number not already running so a live-session reconnect keeps its label; `forgetLocalName` mirrors it client-side so a new tab shows `TN` immediately).
- Switching tabs auto-focuses the xterm.js terminal via `postMessage` (skipped on touch — see `docs/desktop.md` §Mobile). **Tab clickability rests on two iframe traps** (paint order + the swallowed first click) — see `docs/gotchas.md` §"Clickable chrome next to an app iframe", which covers both the tab bar and the desktop taskbar.

**Mobile keyboard/dictation (`landing/terminal-kbd.js`)** — injected into every `/tN/` page via the `sub_filter` `<script src>`; a **no-op on non-touch** (desktop keeps native xterm — all keys, tap-to-focus, selection). On touch it lays a **full-height transparent `<textarea>`** over the terminal so that tapping focuses *it*: iOS then raises the keyboard and **dictation buffers into a real field natively** (like Notes) instead of xterm streaming half-finished revisions to the PTY. Input is forwarded as a debounced value-diff via xterm's `coreService.triggerDataEvent`; xterm's own helper textarea is blocked from taking focus (the `focusin` guard in the sub_filter) so only this input raises the keyboard.

Two invariants in there are load-bearing and look redundant — **don't "simplify" either**:
- The caret is re-anchored to the cursor row **only on `onCursorMove`**, never on `onRender` (render also fires on scroll → iOS yanked the view back to the prompt the moment you dragged).
- `positionCaret` **early-returns unless the view is at the bottom** (`baseY - viewportY > 1`) — a full-screen TUI repaints in place every frame, so re-parking would drag you back to the bottom on each repaint and make a *live* response unscrollable (mobile-only; desktop has no overlay/reveal).

Because the overlay would otherwise eat every touch, gestures are routed: **tap** → keyboard (or, on an `http(s)` URL, open it in the Browser — the touch equivalent of Cmd/Ctrl+click); **vertical drag** → scrollback; **long-press (~0.45s)** → word select + drag-to-extend with a floating **Copy** button and two iOS-style handles; **two-finger tap** → re-claim the terminal shape. The desktop shell's ⌨ button is therefore **Browser-only** now (the Browser is an xpra canvas with no DOM input; the Terminal no longer needs it). Full mechanism + the selection-geometry bugs each line encodes: `docs/terminal.md` §"Mobile touch layer".

**Re-claim the terminal shape (`terminal-kbd.js`)** — terminal N is **one shared `vibetop-session` PTY**, so its `rows×cols` belong to whichever device resized last; after you switch active device the TUI inside renders at the *other* device's shape (phone-shaped text on the desktop, and vice versa). The PTY can't be two shapes at once, so re-claiming is inherently symmetric — the other device sees mis-shaped output until *it* re-claims. Three mechanisms:

- **Auto-refit self-heal (desktop, v1.16.53).** The terminal can also drift to a wrong width *mid-session on the same device* — every line wrapping ~1 col too narrow ("the screen wrapped itself, I did nothing"), most often when a WebSocket blip reconnects and **replays the ring buffer at a stale width**. `terminal-kbd.js`'s non-touch branch fires a `resize`→FitAddon heal on its own: after each ttyd (re)connect's replay settles, on a `ResizeObserver` of the terminal box, and when the tab returns to the foreground. Debounced + guarded to non-zero size; ttyd only resizes the PTY when the computed cols/rows actually change, so a steady terminal sees no churn.
- **Manual re-claim** — **double-click** (desktop) / **two-finger tap** (touch). `claimSize()` writes straight to ttyd's WebSocket so the visible xterm grid never resizes, and **nudges the column and back** (`{c-1,r}` → `{c,r}`) because the kernel raises SIGWINCH only on an actual size *change* — sending the current dims is a silent no-op. **Do not "simplify" that nudge away**: doing so once killed the re-claim while looking like a clean fix.
- **Windows Chromium focus fix** — any `term.resize()` blurs xterm's hidden input textarea on Windows Chromium and it never refocuses, leaving the terminal untypable (macOS/touch self-restore). Cure: re-`term.focus()` right after `term.onResize`, deferred a tick, **guarded by `document.hasFocus()`**.

Mechanism + derivations: §"Architecture: vibetop-session + ttyd + nginx" above (socket nudge, self-heal, focus fix) and `docs/design-decisions.md` §"Killing the terminal 'shake'…" / §"Mobile terminal resize" (why two-finger tap, and why a single-finger double-tap is deliberately NOT a resize — it belongs to iOS's Paste bubble).

## Scheduled terminal messages (⏱ on the Terminal tab bar)

Queue text to be **typed into a terminal and submitted at a given time** — the answer to a Claude Code session that stops at its 5h token limit overnight. A `⏱` button sits at the right of the Terminal tab bar (outside the scrolling `.tabs` strip, so a long tab list scrolls *under* it — the same `flex:1 1 auto` + fixed-sibling split as the desktop taskbar), badged with the **active terminal's** pending count; it opens a panel listing this user's entries (the active terminal's first, others tagged with their tab name) plus a form: message, `datetime-local`, and `+30m / +1h / +5h` quick-fill. The client sends an **epoch** (`at`), so the server does no timezone parsing. A **Send now** button sits beside Schedule and posts `at = now`: it takes the same path as any scheduled message — typed in **by the server** — so it reaches the right session even when that tab is not the one on screen, and it is listed like any other entry. For that to mean anything, `POST /schedules` **fires an already-due entry in the request itself** rather than leaving it for the sweeper: `SCHED_TICK` is 15s, and a button labelled "now" that does nothing for fifteen seconds reads as broken. Future entries are untouched by that path, and a delivery failure is recorded on the entry (`status: failed`) which the client re-reads immediately — so a Send-now into a dead terminal says so instead of falsely reporting success.

**The timer is server-side** — a client `setTimeout` dies with the tab, the device sleeping, or the deploy reload, i.e. exactly the unattended case. A sweeper thread (`_schedule_loop`, `SCHED_TICK` 15s, started next to `_reaper_loop`) fires due entries via **`_inject_terminal`**, which needs no new mechanism: `vibetop-session`'s Unix socket is a raw byte stream whose every received byte is written into the PTY master, so it connects to `/tmp/vibetop-session-<user>-<N>.sock`, sends the text, and — **after an `INJECT_ENTER_GAP` (0.3s) beat — sends `b"\r"` as its own separate write** (**`\r`** — the attach client clears `ICRNL`). The Enter must **never be glued onto the text**: one write reaches the foreground app as one stdin read, and a paste-detecting TUI (Claude Code — the flagship target) treats a rapid multi-char chunk as a *paste*, turning the `\r` into a composer newline instead of a submit, so the message sits at the prompt unexecuted; bash survives either shape (readline is per-byte), which is exactly why bash-only verification missed it (guarded by `test_inject_sends_the_enter_as_its_own_later_keypress`). It then **drains and discards for `INJECT_DRAIN` (0.75s) before closing, which is load-bearing**: the daemon pushes its whole replay ring at every new client, and closing with that unread makes the daemon's *own* `recv()` fail (ECONNRESET) so it hits `if not data: remove_client(fd)` **before** writing our bytes to the PTY — the message vanishes while the sweeper still reports `sent`. (Verified on a live terminal, and guarded by `test_inject_survives_the_replay_the_daemon_queues_on_connect`, whose fake server queues ~600 KB like a warm ring. Do not "simplify" the drain away.) It **refuses a stopped terminal** rather than cold-starting one: a fresh bash has none of the session the message was for. A late entry still fires for up to `SCHED_LATE_GRACE` (2h) so a manager restart doesn't drop it; past that it's marked `missed`. The idle reaper skips reaping a user's **terminals** while they hold a pending schedule.

**Repeat makes it a loop.** One toggle in the panel's action row, beside Schedule (a stroked SVG on `currentColor`, not an emoji — see `docs/design-decisions.md`). It hands the single `datetime-local` a second meaning, **`at` → `until`**, relabelled on screen so the shared field is never ambiguous, and reveals an `every` `<select>` (1 min … 1 day, default 5h — the token-limit case). The two date meanings park in separate JS vars, so toggling Repeat back and forth loses nothing.

**The quick row serves BOTH fields, and says which.** `Now · +/− · 1m/5m/30m/1h/5h` moves the row whose label is **lit**. Both labels carry a `▸` caret in loop mode — one caret alone reads as decoration, two read as a choice, which is the whole discoverability story for a new user. The caret is space-reserved (`visibility`, not `display`) and the label column is a fixed 48px, so turning Repeat on never shifts the labels or resizes the date field beside them; the caret and the lit colour appear only in loop mode, since with one row there is no choice to advertise. `until` is lit by default, and focusing the `every` picker (or clicking its label) moves the aim to the cadence. The labels are real `<label for>` so the association is native, but their click is **cancelled** and focus moved in JS — a label forwards its click to its control, and Chromium opens the date picker on a click in a `datetime-local`, so aiming the row would otherwise throw a calendar over the panel every time. `focus()` alone opens no picker, and focus is what arms a row, so the lit label and the focused control can never disagree. Clicking the field itself still opens it. `Now` **disables** rather than hides while the cadence is armed — an interval has no "now", and hiding it would reflow the row you are aiming at. Nudging the cadence inserts an ad-hoc option for the exact value (`5h 30m`) and prunes the previous one, so walking it with the buttons cannot grow a junk entry per tap.

This is the third shape of that row and the first correct one. It shipped re-pointed at the interval whenever Repeat was on, with no on-screen tell, and the buttons stopped being predictable — you could not know what a tap would move without first recalling the mode. The fix is not "pick one target" (that was the second shape, which gave up the reuse) but **"say which target"**: the two words `every` and `until` already existed as labels, so making them the switch costs no width — and at 320px the quick row is already exactly full, with its buttons shrunk to 28px, so a target label *inside* the row was never an option. The interval also owns a `<select>`, which reaches cadences the additive row never did conveniently (2h, 12h, a day); editing an entry whose cadence predates that picker inserts an option for its exact value rather than snapping a running loop to the nearest listed one.

The client posts `{at: now + every, every, until}` — **the first run is one interval out**, not immediate: you turn a loop on because you are rate-limited *now*, so firing at once would burn a run.

Server-side a loop is **ONE registry entry the sweeper re-arms**, not N queued messages: on firing it stays `pending` with `at` moved to the next slot and `runs` incremented, so it counts once against the pending cap, holds the idle reaper off its terminal for its whole life, and is cancelled with one `×`. `_sched_next_slot` steps the **`at + k·every` grid** rather than adding to the wall clock: a pass that runs 7s late still re-arms on the original minute, and — the reason it matters — a two-day suspend collapses to the next *future* slot in one step instead of machine-gunning the shell with 576 owed messages (a slot older than `SCHED_LATE_GRACE` is skipped, not fired). A **failed** injection does not end a loop, unlike a one-shot: the terminal may simply be stopped now and back before the next slot. The loop finishes when the next slot passes `until`, taking its last run's outcome as its status. `_sched_every()` sanitises the stored interval on **every read**, because the re-arm is `at + every`: a corrupt or hand-edited `0` would make the entry due again every single tick — a message typed into someone's PTY every 15s. Creation also bounds the whole loop, not just its cadence (`SCHED_MIN_INTERVAL` 60s, `SCHED_MAX_RUNS` 500) — "every 1m for 30 days" is 43 200 messages, which is a mistake rather than a plan.

State is one **root-owned `0600`** registry at `/var/lib/vibetop/schedules.json` (`{user:[{id,term,text,at,status,fired,error,every,until,runs}]}`), guarded by `_schedules_lock`; `_var_lib_dir()` also forces that directory to `0700 root:root`. **This ownership is load-bearing, not tidiness:** the sweeper is root and writes into whichever user's PTY an entry names, so a tenant-writable registry would be code execution as another user — hence `_write_schedules` passes `owner="root"` to `_atomic_write` (whose default chowns to the *request* user, right for per-user home state, wrong here), and the owner always comes from the session, never a body field. Validation: `term` 1..`MAX_INSTANCE`, text a single non-empty line ≤2000 chars (**any C0 control rejected** — we append the Enter, and `\r`/`\n` would let one entry chain commands), `at` between +20s and +30d, ≤20 pending per user; for a loop, `every` ≥60s, `until` ≥ `at` and within the same horizon, and ≤500 total runs. The list shows **six entries and then scrolls** — the cap is computed in JS from the heights of the rows actually rendered, not as a pixel constant, because a row is one line or two depending on whether it carries a note (`until 9/6 17:33 · 2 sent`), so any fixed height would show six of one kind and four of the other. It is a ceiling, not a floor: flex still shrinks the list further on a short viewport (five rows at 600px), which is what keeps the compose form and Schedule button above the fold. Without it a full queue grew the panel to 840px of a 900px screen before scrolling engaged. **A tap in the terminal dismisses it too.** The click-away handler lives on this document, which never sees a click inside an iframe — and the terminal iframe is nearly the whole window, so "click away to dismiss" was true everywhere except the one place you actually click. Each same-origin `/tN/` frame gets the same `pointerdown` handler, re-attached on every `load` because ttyd replaces the document when it reconnects. Same class of bug as the desktop's Start menu (`docs/design-decisions.md`). The list **rides the existing 2.5s `/api/terminals/status` poll** (folded in as `schedules`) rather than adding a second client loop. Tested in `server/tests/test_api_schedule.py` (incl. a real AF_UNIX socket asserting the exact `b"continue\r"` bytes); rationale + rejected alternatives in `docs/design-decisions.md`.

## URL forwarding (terminal/files → browser)

Clicking a URL in a terminal (Cmd+click / Ctrl+click) or using the "Open in Browser" action in Files opens it in the embedded Chromium. Implementation:
- nginx `sub_filter` injects a `window.open` override into terminal pages
- The override intercepts xterm.js's link handler (which calls `window.open()` then sets `.location.href`) and returns a proxy object
- The proxy sends the URL to `POST /api/browser/open`, which runs `chromium <url>` on the xpra display
- The manager passes `DBUS_SESSION_BUS_ADDRESS` and `--user-data-dir` matching the xpra profile so the URL opens in the correct Chromium instance
- A `postMessage` to the parent desktop auto-switches to the Browser tab
- Files opened from FileBrowser use the `/fileview/` nginx location (alias to `~`) to serve raw files to Chromium

**Server-side "open a browser" (CLI/OAuth logins, e.g. Claude Code).** The click path above needs the front-end; a CLI that shells out to `xdg-open`/`$BROWSER` (an OAuth login) has no front-end. So every terminal exports **`BROWSER=/usr/local/bin/xdg-open`** (a shim, `apps/everyday/terminal/xdg-open-shim.sh`, installed by `server/install.sh` ahead of `/usr/bin` on PATH) plus **`VIBETOP_SESSION`** (a long-lived per-user session token, `_sign_session(user, BROWSER_TOKEN_TTL)`) and `VIBETOP_MGR_PORT` (`_user_terminal_setenvs`). The shim POSTs the URL to the manager's `POST /api/browser/open` on loopback with `Cookie: vt_session=$VIBETOP_SESSION`, so the manager resolves the **right user** from the cookie (loopback TCP can't carry peer creds) and opens it in **that user's** Browser (starting their xpra display if needed). Outside a vibetop terminal (no `VIBETOP_SESSION`) the shim `exec`s the real `/usr/bin/xdg-open`, so system behaviour is unchanged; a non-http(s) target also defers. OAuth URLs pass `_valid_browser_url` because the URL is double-quoted in the `su -c` string, so only quote-breaking chars (`"` `` ` `` `$` `(` `)` `\`) are rejected — `&`/`?`/`=` are fine. There's **no auto-switch** to the Browser app (server-side, no front-end), so the shim prints "switch to Browser to continue" and falls back to printing the URL if the manager is unreachable. Env only lands on **new** terminals (open a fresh one after a deploy).

