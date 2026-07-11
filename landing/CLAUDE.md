# landing

Unified desktop UI and supporting static pages. Deployed via `./install.sh` (no sudo).

## Files

- `desktop.html` — main desktop UI at `/` (Start menu, iframe viewport, status bar, server-side state via `/api/desktop`)
- `index.html` — Services app at `/landing.html`: auto-discovering network-service dashboard (renders `GET /api/services/discover`)
- `notes.html` — scratchpad at `/notes.html` (Notes app)
- `monitor.html` — live system dashboard at `/monitor.html` (Monitor app; CPU/MEM/GPU charts, htop-style load average, process list)
- `upload.html` — quick-sync drop zone at `/upload.html` (Upload app; per-file progress, In-folder listing with Clear-all + Open-in-Files deep link, sequential XHR uploads to `/api/upload`)
- `filebrowser-patches.js` — UI enhancements injected into FileBrowser via nginx `sub_filter` (permanent toolbar buttons, mobile flex-wrap for the header, hides `#file-selection` and `.context-menu` popups). The **Share** button is custom: it opens vibetop's passwordless **public link** flow (`/api/share` → a self-contained modal with copy/expiry/revoke/manage), for files and folders (folder → `.zip`) — not FileBrowser's native share. See root `CLAUDE.md` / `docs/design-decisions.md`
- `apph.js` — viewport-height fix for the iOS **standalone PWA** only: after a Cloudflare Access login WebKit freezes the `svh` unit too short (black band below the taskbar), while `visualViewport.height`/`clientHeight`/`dvh` stay correct (confirmed on-device). In standalone it sets `--app-h` = `max(visualViewport.height, clientHeight)` (the true usable height — keyboard-safe via a running max reset on rotation, and can't overshoot into the status-bar strip like `100vh` did); Safari keeps the `100svh` default via `body{height:var(--app-h,100svh)}`. Diagnostic overlay: `#vhdbg` or `localStorage.vhdbg='1'`. See root `CLAUDE.md` / `docs/design-decisions.md`
- `coach.js` — shared coach-tip banner (`window.vibeCoach(tips, opts)`): show-every-open-until-tapped (tap anywhere on the banner dismisses; no ×), max-3 cap, versioned keys, one-at-a-time, rotation. Loaded on the desktop shell + X11 Launcher and injected into `/tN/` pages before `terminal-kbd.js`. Tips live on 4 surfaces (terminal, Files, Browser, cross-device ⏻) — see the root `CLAUDE.md`
- `manifest.json` / `sw.js` / `icons/` — PWA: web manifest, service worker (caches the shell for instant loads; bypasses live/auth paths), and home-screen icons (regenerate with `icons/generate-icons.py`)
- `install.sh` — copies files to `~/vibetop-www/`

## Updating

1. Edit the source file(s) here.
2. Run `./install.sh` (without sudo — sudo resolves `$HOME` to `/root/`).
3. Reload the browser. No nginx reload needed — served as static files.

Full architecture: [`../CLAUDE.md`](../CLAUDE.md).
