# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file is the index, not the manual.** It stays short on purpose: what the
project is, the rules that bind every change, and where the detail lives. The
exhaustive per-area detail was split into `docs/` — jump there by task, don't
re-derive it here, and put new detail in the area doc rather than growing this file.

## Where to look

| Task | Read |
|---|---|
| Deploy / install / uninstall, prod `/opt/vibetop` layout, installer conventions | `docs/deploy.md` |
| Run or add tests (`./run-tests.sh`, tiers, e2e VM, install matrix) | `docs/testing.md` |
| A host is misbehaving | `sudo ./tools/doctor.sh` first, then `docs/operations.md` |
| Desktop shell: Start menu, taskbar, window mode, heartbeat, PWA/sw, mobile | `docs/desktop.md` |
| Terminal stack (ttyd + vibetop-session), scheduled messages, URL forwarding | `docs/terminal.md` |
| Browser (xpra/Chromium) + X11 Launcher | `docs/browser.md` |
| Files, Notes, Upload, Update, Config, Claude-usage, Token Stats, Services, Tunnel | `docs/apps.md` |
| Multi-user / identity (`APP_USER` vs `OPERATOR` vs the request user) | `docs/multi-user.md` |
| Non-obvious traps that bite on real hosts | `docs/gotchas.md` |
| **Why** something odd is the way it is (Symptom→Cause→Fix→Rejected) | `docs/design-decisions.md` |
| **QA / review / e2e — binding scope** (correctness *and* experience) | `docs/qa-charter.md` |
| Security review of the manager's auth paths + trust model | `docs/security-review.md` |
| Network topology options · dual-homed host · tunnel setup | `docs/single-port-options.md` · `docs/dual-homed-network.md` · `tunnel/README.md` |
| End-to-end / real-app testing (host-safe KVM VM, Playwright) | `tests/e2e/README.md` |

**Whenever you solve a new non-obvious problem** (surprising bug, external-tool
workaround, a design fork with a rejected alternative), add an entry to
`docs/design-decisions.md`. Read it before re-litigating a design that looks odd.

## Overview

Six sub-projects deliver a unified "mini-OS" desktop experience on myhost (`192.168.1.10`), exposed publicly at `https://service.example.com/` via Cloudflare Tunnel with Access auth. The root page (`/`) is a desktop-like UI launchable from a Start menu.

**It is multi-user** (Option B — see the identity rules below): each of the host's **real Linux users** logs in with their PAM (username+password) credentials and gets their own terminals / Files / Browser / X11 running **as themselves** in their real `$HOME`; Unix permissions are the isolation boundary (a Terminal ≡ SSH as *that* user). Prod on the reference host (`z20`) runs from `/opt/vibetop/` owned by a no-login `vibetop` service account, with the human admin(s) named in `VIBETOP_ADMINS`. The only operator-only surfaces are **Claude-usage** and **Update** (gated by `_is_admin()`); every other surface is per-user.

| Sub-project | URL path | What |
|---|---|---|
| terminal | `/t1/`..`/t50/`, `/terminals/`, `/api/` | Dynamic persistent bash terminals (ttyd + vibetop-session) + manager API |
| browser | `/browser/`, `/x11-display/` | Persistent Chromium via xpra HTML5 (`:99`) + a second xpra display (`:98`) for the X11 Launcher's GUI apps |
| landing | `/` | Unified desktop UI with taskbar, iframe viewport, and status bar |
| files | `/files/` | FileBrowser file manager rooted at `/` (whole filesystem, as the authenticated user) |
| office | `/onlyoffice/` | OnlyOffice Document Server (Docker) — in-browser Office editing via the manager's `/api/office/*` |
| claude-usage | `/api/claude/usage` | Opt-in pass-through proxy that captures the real Claude Max-plan usage headers for the desktop's usage strip |
| tunnel | — | Cloudflare Tunnel + Access config for public HTTPS |

**Canonical app inventory** (source of truth: the `APPS` map in `landing/desktop.html` — the README groups these more loosely):

| Start-menu section | Apps |
|---|---|
| Everyday (un-sectioned) | Terminal, Browser, X11 Launcher, Files, Office, Notes, Upload |
| **Utilities** flyout | Services (`home`), Monitor, Token Stats + the Claude-Usage / System-Stats / **Window-mode** **toggles** |
| **System** | Update, Config (sudo-gated) |
| *(not in the menu)* | **Video player** (`video`, `hidden:true`) — opened by Files on a video double-click, registered only so the taskbar/title can render it |

## Identity model — three users, never interchangeable

Conflating these caused real bugs. Detail + the multi-user runtime (`systemd-run`
transient units, per-user ports, the auth gate) is in `docs/multi-user.md`.

- **`APP_USER`** — the service/code owner that runs deploys and owns the checkout (`vibetop` on prod). Only the request user on a cookieless loopback call (trusted local tooling).
- **`OPERATOR` / `ADMIN_USERS`** — the *human* admin(s), named in **`VIBETOP_ADMINS`** (from `/etc/vibetop/manager.env`; defaults to `[APP_USER]`). `OPERATOR = ADMIN_USERS[0]`; `_is_admin()` gates **Claude-usage** and **Update** only.
- **The per-request authenticated user** — `_ctx_user()`. **All per-user state and file ops resolve under `_ctx_home()`**, so notes/desktop/files-tabs/uploads/office land in each user's own home by construction.

> **Operator-vs-service-account trap:** any `~`-path meaning *"the human operator's home"* (Claude usage/settings, `~/.claude`) must use **`OPERATOR`**, not `APP_USER`.
>
> **`VIBETOP_ADMINS` has ONE authority: `/etc/vibetop/manager.env`.** Every installer receives it through `vt_installer_env_array` (`tools/lib/layout.sh`) — **do not add another resolver**; one that resolves the operator itself silently falls back to `APP_USER` on every deploy.

## Working rules

- **First-time setup in a fresh clone:** `git config core.hooksPath .githooks` so commits run `./run-tests.sh` (bypass one commit with `SKIP_TESTS=1`).
- **Dev/prod flow (reference host `z20`):** dev work lives on the **`multi-user`** branch (a home checkout that only edits/commits/pushes — it is NOT what runs). Prod runs from `/opt/vibetop/app` as the `vibetop` service account and self-updates by fast-forwarding to **`origin/main`**. Committed work reaches prod only via merge → `main` → the in-app **Update** (or `tools/migrate-to-opt.sh`); **a push alone deploys nothing**.
- **Tests:** `./run-tests.sh` runs every hermetic tier (what CI + the pre-commit hook run). `--live` adds `tools/smoke-test.sh` (run it with `sudo`). See `docs/testing.md`.
- **QA scope is two pillars** — correctness **and** experience, judged as a very picky experienced user (`docs/qa-charter.md`). A review reporting only correctness findings is incomplete.
- **Per-sub-project `CLAUDE.md` files** (`terminal/`, `browser/`, `landing/`) are thin pointers back here and to `docs/` — keep edits in `docs/`, not duplicated there.

## Versioning & commits

- The root **`VERSION`** file (e.g. `1.5.6`) is a hand-maintained release number — it is **not** read by any build/deploy script (the `VERSION` strings in `browser/install.sh`/`files/install.sh` are the OS `VERSION_CODENAME` and `FB_VERSION`, unrelated). Bump it when cutting a user-visible release and commit with a `vX.Y.Z: <summary>` subject (see `git log -- VERSION`).
- **Bump `VERSION` in `landing/sw.js` for ANY user-visible change**, not only cached-shell ones. That string is two things: the PWA cache key *and* the deploy signal the SSE stream (`/api/events`) watches — clients only reload when it changes. Skip it and a page that is `no-store`/sw-bypassed (`/terminals/`, `/tN/`) still ships stale to every already-open tab, because nothing tells them to refresh (this bit v1.19.12 and v1.19.16). The convention is a `(sw vNN->vNN)` suffix on the commit subject. Sub-resource JS injected via `sub_filter` (`xpra-patches.js`, `filebrowser-patches.js`, `terminal-kbd.js`) is content-hash cache-busted automatically — never bump those by hand.
- **Release checklist (order matters):** 1) bump `VERSION` **and** `landing/sw.js`'s `VERSION` (if the cached shell changed), 2) **commit + push**, 3) **then deploy** — via the in-app **Update** app or `./deploy.sh`. The SSE auto-refresh (`/api/events`) only pushes a `reload` when the **deployed** `sw.js` VERSION changes, so deploying *before* the sw bump is committed leaves every client stale. If you bump-then-deploy out of order, redeploy landing (`./landing/install.sh`).

## Command cheat-sheet

```bash
# Deploy (full detail: docs/deploy.md)
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
sudo ./deploy.sh                             # whole stack on this machine
./deploy.sh --remote junjie@192.168.1.20     # rsync + deploy to a remote host
sudo ./uninstall.sh                          # tear down the runtime (keeps repo + data)

# Tests (docs/testing.md)
./run-tests.sh                               # all hermetic tiers
./run-tests.sh --live                        # + live-host smoke test
tests/e2e/run-vm.sh                          # real-app click-through in a KVM VM (never run.sh)
VIBETOP_MATRIX_FULL=1 tests/matrix/run.sh    # install matrix (always with FULL=1)

# Health (docs/operations.md)
sudo ./tools/doctor.sh                       # read-only config diagnostic — first stop
sudo ./tools/smoke-test.sh                   # "is it up?" (needs sudo to mint a session)
sudo systemctl restart vibetop-manager
sudo tail -f /var/log/vibetop/manager.log
```
