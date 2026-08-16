# Vibetop

**Your self-hosted machine, as a desktop in any browser tab — even your phone.**

A unified "mini-OS" desktop experience served in the browser, exposed publicly
over HTTPS via Cloudflare Tunnel with Access auth. The root page is a desktop-like
UI launchable from a Start menu with seven everyday apps — **Terminal, Browser,
X11 Launcher, Files, Office, Notes, Upload** — a **Utilities** flyout (Services,
Monitor, Token Stats), and a **System** section with a self-updating **Update**
app and a sudo-gated **Config** admin app. It is **multi-user**: everyone with a
Linux account on the host logs in with their own username and password, and gets
their own terminals, files, and browser running as themselves. Open-app state is
synced server-side so phone and computer share the same desktop; apps run
full-screen by default, with an optional floating-window mode. Installable as a
PWA; the Terminal even keeps iOS voice dictation working. One command deploys the
whole stack to a Debian/Ubuntu or RHEL-family host —
fully self-installing, Docker and all (AMD or NVIDIA).

## Features

- **Multi-user** — everyone signs in with their real Linux username + password (PAM). Terminals, Files, Browser and X11 apps all run **as that user** in their own `$HOME`, so Unix permissions are the isolation boundary — a Terminal is exactly an SSH session as yourself
- **Terminal** — persistent bash sessions over ttyd; tabs survive disconnects via a custom `vibetop-session` daemon (2 MB replay ring buffer + 50k-line xterm.js scrollback). On touch, tapping the terminal raises the keyboard via an in-page overlay that makes **iOS dictation work** (no character pile-up); on Windows, Ctrl+V pastes cleanly. Queue a message to be typed into a terminal at a set time (⏱) — for the Claude Code session that stops at its token limit overnight
- **Browser** — a real, persistent Chromium driven by xpra's HTML5 client; mobile gets tap-click, drag-scroll, two-finger pinch zoom, and a toggleable on-screen keyboard
- **X11 Launcher** — run any GUI app (evince, eog, gnuplot, a snap Firefox) on its own X11 display, one tab per window. Apps started from a Terminal show up here automatically
- **Files** — FileBrowser rooted at `/` (your reach is your Unix permissions), every toolbar action visible inline, with a purpose-built mobile layout. Open a Word/Excel/PPT file (double-click on desktop, double-tap on touch) to **View** it — the server renders a read-only PDF via headless LibreOffice in an in-app viewer with **Download** (the original file, not the PDF) and **Edit** buttons; videos open in a built-in player, and any file or folder can be turned into a **public share link**
- **Office** — full in-browser Word/Excel/PowerPoint editing via a self-hosted **OnlyOffice Document Server** (Docker), with autosave back to the file. Native browser rendering — fast, MS-compatible, no remote-desktop streaming. Open it empty to **create a new** Document / Spreadsheet / Presentation
- **Notes** — tabbed Markdown scratchpad; auto-saves and syncs across your devices while you type
- **Monitor** — live CPU/MEM/GPU charts, htop-style load average, top processes
- **Upload** — quick photo-sync drop zone; per-file progress, In-folder listing, Open-in-Files deep link
- **Update** — one-tap self-update: `git pull` from GitHub, redeploy only what changed, and an **update-history changelog** with the installed commit badged
- **Config** (admins only) — add/remove users, sign someone out, reclaim idle sessions, set per-user memory/CPU caps, check disk and service health
- **Status bar** — live system stats (CPU %/°, MEM, GPU %/°, VRAM) at the bottom of every desktop. GPU from AMD sysfs (with a debugfs fallback when it locks under compute) **or NVIDIA `nvidia-smi`**

## Why not just VNC?

VNC and remote desktops stream **pixels** — a compressed video of the whole screen. Vibetop streams **data**: each app sends its content (terminal text, file lists, documents) and renders natively in your browser, so it stays crisp and fast — especially on a phone. Only the Browser and GUI apps are pixel-streamed, via **xpra** (a modern VNC cousin).

| | VNC | Vibetop |
|---|---|---|
| Sends over the wire | Pixels of the whole screen | App **data** — pixels only for the Browser + GUI apps |
| Text | Blurry when compressed | Crisp DOM text at any zoom |
| Mobile | Mouse emulation, no real keyboard | Native keyboard + iOS dictation, touch gestures |
| Bandwidth / latency | Heavy, laggy on slow links | Light and responsive for text work |
| Access | A VNC port + (often weak) auth | Behind HTTPS + Cloudflare Access, no open ports |
| Scope | The whole desktop | Curated apps **+** an X11 Launcher for any GUI app |

**In short:** VNC gives you your screen as video; Vibetop gives you your machine as fast, crisp, mobile-native apps — falling back to a stream only where a real browser or GUI app needs it.

## Sub-projects

| Sub-project | URL path | What |
|---|---|---|
| `terminal` | `/t1/`..`/t50/`, `/terminals/`, `/api/` | Dynamic persistent bash terminals (ttyd + vibetop-session) + manager API |
| `browser`  | `/browser/`, `/x11-display/` | Persistent Chromium via xpra HTML5, plus a second display for the X11 Launcher's GUI apps |
| `landing`  | `/` | Unified desktop UI with taskbar, iframe viewport, and status bar |
| `files`    | `/files/` | FileBrowser file manager rooted at `/` (as the authenticated user) |
| `office`   | `/onlyoffice/` | OnlyOffice Document Server (Docker) — in-browser Office editing, autosaved via the manager's `/api/office/*` endpoints |
| `claude-usage` | `/api/claude/usage` | Opt-in proxy that captures real Claude Max-plan usage headers for the desktop's usage strip |
| `tunnel`   | — | Cloudflare Tunnel + Access config for public HTTPS |

## Deploy

**One line on a fresh host** (Ubuntu 22.04/24.04, Debian 12, Rocky 9,
AlmaLinux 9, Fedora 43) — installs git, clones the repo to
`~/vibetop`, then runs the full deploy:

```bash
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
```

Run it as root, or as a normal user with sudo — either works. Vibetop installs
like ordinary server software (root-owned code under `/opt/vibetop`, owned by a
no-login `vibetop` service account) and needs **no username**: people arrive
afterwards by logging in with their own Linux accounts. Forward `deploy.sh` flags
after `-s --`:

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
sudo ./deploy.sh                           # deploy on this machine
./deploy.sh --remote user@host             # rsync to host:~/vibetop and deploy there
# flags: --admins a,b  --no-browser  --no-files  --no-office  --with-tunnel  --dry-run
```

`--admins` names the Linux users who get the admin-only surfaces (Update, Claude
usage); under `sudo` the invoking user is seeded as the first admin, so you can
usually leave it off.

It is fully self-installing — no prerequisites beyond a supported host with
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

See [`CLAUDE.md`](CLAUDE.md) for the doc index and the rules that bind every
change; the architecture, health checks, and operational commands live in
[`docs/`](docs/).

## Screenshots

| Desktop — Files | Desktop — Browser |
|---|---|
| ![Files app on the desktop: FileBrowser toolbar with every action (Browser, Share, Rename, Copy, Move, Delete, Download, View, Upload, Info, Select) inline. Taskbar at the bottom shows the Start button, open apps (Terminal, Files, Browser), and live CPU/MEM/GPU/VRAM stats.](docs/images/desktop-files.jpg) | ![Browser app on the desktop: an embedded Chromium served via the xpra HTML5 client, with floating zoom controls (−/⟲/+) at lower-left and an on-screen keyboard chip at lower-right for touch use.](docs/images/desktop-browser.jpg) |

| Mobile — Start menu | Mobile — Terminal + keyboard |
|---|---|
| ![Mobile view: Terminal app showing four persistent ttyd tabs (T1–T4) with `echo "hello world"` running in T2. The Start menu is open over the app, listing Home Service, Terminal, Browser, Files, Notes, Monitor, and Upload — running apps marked with a green dot.](docs/images/mobile-startmenu.jpg) | ![Mobile view: tapping inside Terminal pops the native iOS keyboard. xterm.js fits the visible portion and the iOS text-suggestion bar sits between the terminal and the keyboard.](docs/images/mobile-keyboard.jpg) |
