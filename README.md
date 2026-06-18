# Vibetop

**Your self-hosted machine, as a desktop in any browser tab — even your phone.**

A unified "mini-OS" desktop experience served in the browser, exposed publicly
over HTTPS via Cloudflare Tunnel with Access auth. The root page is a desktop-like
UI launchable from a Start menu with eight everyday apps — **Home Service,
Terminal, Browser, Files, Office, Notes, Monitor, Upload** — plus a self-updating
**Update** app. Open-app state is synced server-side so phone and computer share
the same desktop. Installable as a PWA; the Terminal even keeps iOS voice
dictation working. One command deploys the whole stack to a Debian/Ubuntu host —
fully self-installing, Docker and all (AMD or NVIDIA).

## Features

- **Terminal** — persistent bash sessions over ttyd; tabs survive disconnects via a custom `claude-session` daemon (256 KB ring buffer + 50k-line xterm.js scrollback). On touch, tapping the terminal raises the keyboard via an in-page overlay that makes **iOS dictation work** (no character pile-up); on Windows, Ctrl+V pastes cleanly
- **Browser** — a real, persistent Chromium driven by xpra's HTML5 client; mobile gets tap-click, drag-scroll, two-finger pinch zoom, and a toggleable on-screen keyboard
- **Files** — FileBrowser rooted at `~`, every toolbar action visible inline (wraps to multiple rows on mobile). Open a Word/Excel/PPT file (double-click on desktop, tap on touch) to **View** it — the server renders a read-only PDF via headless LibreOffice in an in-app viewer with **Download** (the original file, not the PDF) and **Edit** buttons
- **Office** — full in-browser Word/Excel/PowerPoint editing via a self-hosted **OnlyOffice Document Server** (Docker), with autosave back to the file. Native browser rendering — fast, MS-compatible, no remote-desktop streaming. Open it empty to **create a new** Document / Spreadsheet / Presentation
- **Notes** — single-page Markdown scratchpad, auto-saves
- **Monitor** — live CPU/MEM/GPU charts, htop-style load average, top processes
- **Upload** — quick photo-sync drop zone; per-file progress, In-folder listing, Open-in-Files deep link
- **Update** — one-tap self-update: `git pull` from GitHub, redeploy only what changed, and an **update-history changelog** with the installed commit badged
- **Status bar** — live system stats (CPU %/°, MEM, GPU %/°, VRAM) at the bottom of every desktop. GPU from AMD sysfs (with a debugfs fallback when it locks under compute) **or NVIDIA `nvidia-smi`**

## Sub-projects

| Sub-project | URL path | What |
|---|---|---|
| `terminal` | `/t1/`..`/t50/`, `/terminals/`, `/api/` | Dynamic persistent bash terminals (ttyd + claude-session) + manager API |
| `browser`  | `/browser/` | Persistent Chromium viewable via xpra HTML5 client |
| `landing`  | `/` | Unified desktop UI with tab bar, iframe viewport, and status bar |
| `files`    | `/files/` | FileBrowser file manager rooted at `~` |
| `office`   | `/onlyoffice/` | OnlyOffice Document Server (Docker) — in-browser Office editing, autosaved via the manager's `/api/office/*` endpoints |
| `tunnel`   | — | Cloudflare Tunnel + Access config for public HTTPS |

## Deploy

**One line on a fresh Debian/Ubuntu host** — installs git, clones the repo to
`~/vibetop`, then runs the full deploy:

```bash
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
```

Run it as a normal user with sudo (not root — the desktop runs as *your* user).
Forward `deploy.sh` flags after `-s --`:

```bash
# skip the heavy bits:
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash -s -- --no-office --no-browser
# preview without changing anything:
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash -s -- --dry-run
```

Already have the repo checked out? `deploy.sh` does the whole stack (installs
deps, runs every sub-installer in order, health-checks), locally or to a remote
host over SSH:

```bash
./deploy.sh                                # deploy on this machine
./deploy.sh --remote user@host             # rsync to host:~/vibetop and deploy there
# flags: --no-browser  --no-files  --no-office  --with-tunnel  --dry-run
```

It is fully self-installing — no prerequisites beyond a Debian/Ubuntu host with
SSH + sudo. To tear the whole runtime down again (keeping the repo, your data,
and the OnlyOffice image):

```bash
sudo ./uninstall.sh
```

Or run the per-project installers by hand (the order `deploy.sh` uses; each is
idempotent, `--dry-run`-able, env-var configurable, and only reloads nginx when
its config actually changed — so a re-run won't blip live terminals):

```bash
sudo ./terminal/install.sh   # nginx skeleton + manager API + ttyd
sudo ./browser/install.sh    # xpra + Chromium (snap) + LibreOffice (office View)
sudo ./files/install.sh      # FileBrowser at /files/
sudo ./office/install.sh     # Docker + OnlyOffice Document Server at /onlyoffice/
./landing/install.sh         # desktop UI + static apps (no sudo)
sudo ./tunnel/install.sh     # cloudflared (tunnel setup is interactive)
```

The installers pull their own dependencies — `ttyd`/`nginx`/`acl` (apt), `xpra`
(xpra.org repo) + `chromium` (snap) + `libreoffice` (apt), the `filebrowser`
release binary, and **Docker** (`docker.io`) for the OnlyOffice container
(`onlyoffice/documentserver`, ~2 GB pull) — and set up the systemd units, nginx
site, and the www-data home-dir ACL. Validated end-to-end on AMD+NVIDIA and
AMD+AMD Ubuntu 24.04 hosts. Remotely-deployed hosts are full installs — they
self-update code from the Start menu like the primary box (heavy deps like the
OnlyOffice image are installed only by `deploy.sh`/`office/install.sh`, not the
in-app Update).

See [`CLAUDE.md`](CLAUDE.md) for full architecture, health checks, and operational
commands, and [`docs/`](docs/) for deep dives.

## Screenshots

| Desktop — Files | Desktop — Browser |
|---|---|
| ![Files app on the desktop: FileBrowser toolbar with every action (Browser, Share, Rename, Copy, Move, Delete, Download, View, Upload, Info, Select) inline. Taskbar at the bottom shows the Start button, open apps (Terminal, Files, Browser), and live CPU/MEM/GPU/VRAM stats.](docs/images/desktop-files.jpg) | ![Browser app on the desktop: an embedded Chromium served via the xpra HTML5 client, with floating zoom controls (−/⟲/+) at lower-left and an on-screen keyboard chip at lower-right for touch use.](docs/images/desktop-browser.jpg) |

| Mobile — Start menu | Mobile — Terminal + keyboard |
|---|---|
| ![Mobile view: Terminal app showing four persistent ttyd tabs (T1–T4) with `echo "hello world"` running in T2. The Start menu is open over the app, listing Home Service, Terminal, Browser, Files, Notes, Monitor, and Upload — running apps marked with a green dot.](docs/images/mobile-startmenu.jpg) | ![Mobile view: tapping inside Terminal pops the native iOS keyboard. xterm.js fits the visible portion and the iOS text-suggestion bar sits between the terminal and the keyboard.](docs/images/mobile-keyboard.jpg) |
