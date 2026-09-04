# Deploying, installing, uninstalling

> `bootstrap.sh` / `deploy.sh`, the per-project installers, the `/opt/vibetop`
> prod layout, the shared nginx site, uninstall, and the conventions every
> `install.sh` follows.

## Deploy commands

**Fresh host, one line** — `bootstrap.sh` is the curl-pipe installer: it checks
the OS is supported (Debian/Ubuntu or RHEL-family), installs `git`, clones (or `git`-updates) the repo to
`~/vibetop` (full clone so the in-app Updater works), then `exec`s `deploy.sh`.
It is the only step `deploy.sh` can't do itself — getting the repo onto the box.
**Root is fine** (it no longer refuses it — vibetop installs like ordinary server
software into `/opt/vibetop` under a no-login service account and needs no
username); as root it clones to **`/usr/local/src/vibetop`** rather than `/root`.
As a non-root user it needs `sudo`. Flags after `-s --` pass through
to `deploy.sh`; env overrides `VIBETOP_DIR`/`VIBETOP_REPO`/`VIBETOP_REF`.

```bash
curl -fsSL https://raw.githubusercontent.com/nicejunjie/vibetop/main/bootstrap.sh | bash
curl -fsSL .../bootstrap.sh | bash -s -- --no-office   # forward deploy.sh flags
```

**One command, whole stack** — `deploy.sh` orchestrates everything (deps + all
sub-installers in the right order + a health check), locally or to a remote host.
It also **auto-detects a dual-homed LAN** (2+ NICs on one subnet) and applies the
"reply via the incoming NIC" routing (`tools/setup-samesubnet-routing.sh`) so such
hosts work with no manual network tweaking — a no-op on single-homed hosts (see the
dual-homed gotcha + `docs/dual-homed-network.md`):

```bash
sudo ./deploy.sh                             # deploy on this machine (re-execs under sudo if you don't)
./deploy.sh --remote junjie@192.168.1.20     # rsync to HOST:~/vibetop and deploy there
# flags: --admins a,b  --no-browser  --no-files  --no-office  --with-tunnel  --dry-run
# (HOST is any ssh destination — user@ip or an ssh-config Host, not a bare shell alias)
# --admins seeds VIBETOP_ADMINS (the operator-only gate); under sudo the invoking
#   user is seeded as the first admin, so a plain `sudo ./deploy.sh` needs no username.
sudo ./uninstall.sh                          # tear down the whole runtime (keeps repo + data + image)
```

**Prod layout (multi-user hosts) — `/opt/vibetop/`.** A home-owned checkout (`~/vibetop`) is fine for a single trusted operator, but a multi-user host relocates the shared, root-run code out of every home into one root-owned tree so a tenant can't tamper with root-run code or another tenant's data: `/opt/vibetop/{app,vibetop-www,etc,var}` (app = git checkout the manager runs from + in-app Update pulls; **`vibetop-www` = nginx root**; etc = secrets; var = shared DB/logs), owned by a no-login `vibetop` account, prod git remote **HTTPS** (public repo → keyless self-update). **The web root is `vibetop-www`, NOT `www`** — the installers default to `$APP_HOME/vibetop-www` and an in-app Update doesn't pass `LANDING_DIR`/`DST_DIR`, so it re-renders the nginx root to `vibetop-www` and deploys there; anything written to a `www/` would be silently orphaned (this is how `xpra-patches.js` 404'd after the `/opt` move). A stale `/opt/vibetop/www/` may still exist on migrated hosts — it is not served. **`sudo tools/doctor.sh` §*Web root* now checks all of this automatically** (nginx `root` exists; every sub_filter-injected script and every deployed page's local script ref resolves under it; a sibling `*www*` dir is flagged — FAIL if it's *newer* than the served root, i.e. the last deploy went to the wrong place; deployed `sw.js` VERSION vs the checkout's). Manual equivalent: `grep root /etc/nginx/sites-available/vibetop`. Migrate an existing home install with `sudo tools/migrate-to-opt.sh` (idempotent; `--rollback` points prod back at the home checkout; it creates the service account, copies secrets preserving values, writes `/etc/vibetop/manager.env` with `VIBETOP_ADMINS=`, re-renders units+nginx). **Dev/prod split on `z20`:** the home checkout is edit/commit/push only — it is NOT what runs; ship via commit+push then the in-app Update (or re-run `migrate-to-opt.sh`). See `docs/multi-user.md` §"Filesystem layout".

It is fully self-installing on any supported host (incl. the container runtime) — no manual
prerequisites. Or run the per-project installers by hand (the order `deploy.sh`
uses). Each is idempotent, supports `--dry-run`, env-var configurable (see script
headers), and **only reloads nginx when its config actually changed** (a re-run
that changes nothing won't reload — which would otherwise sever live terminal/
Browser WebSockets; `nginx_write` returns the change as its pipe exit status):

```bash
sudo ./terminal/install.sh   # 1. nginx site skeleton (extras include) + manager API + ttyd
sudo ./apps/everyday/browser/install.sh    # 2. xpra + Chromium (snap) + LibreOffice (office View) — extras snippet
sudo ./apps/everyday/files/install.sh      # 3. FileBrowser at /files/ (binary + noauth config + extras snippet)
sudo ./apps/everyday/office/install.sh     # 4. Docker + OnlyOffice Document Server at /onlyoffice/ (office Edit)
./shell/install.sh         # 5. desktop UI + static apps (no sudo — $HOME must resolve to the user's)
sudo ./tunnel/install.sh     # 6. cloudflared (tunnel setup is interactive — see tunnel/README.md)
```

Deps the installers handle automatically: `ttyd`/`nginx`/`acl` (apt), `xpra` (xpra.org
apt repo, suite derived from the OS codename) + `chromium` (snap) + `libreoffice`
(apt), the `filebrowser` release binary (pinned `FB_VERSION`, arch-aware), and
**Docker** (`docker.io`) running `onlyoffice/documentserver` (~2 GB pull, loopback
`:8087`, generated JWT secret at `~/.config/vibetop/onlyoffice.secret`). Scoped to
**Supported distros** (every one proven green by the full-stack matrix,
`tests/matrix/run.sh --all -j3`, 14 checks per row incl. a live shell, a live
Chromium process, OnlyOffice and a real PAM login): **Ubuntu 22.04/24.04,
Debian 12, Rocky 9, AlmaLinux 9, Fedora 43**. Package names, the nginx layout
(`sites-available` vs `conf.d`), the PAM stack (`common-auth` vs `system-auth`),
SELinux and the container runtime (docker vs podman) all differ by family and are
resolved in one place — `tools/lib/osdeps.sh`. Validated on AMD+NVIDIA and AMD+AMD hosts (GPU stats use
sysfs/amdgpu with an `nvidia-smi` fallback).

## Shared nginx

One nginx site at `/etc/nginx/sites-available/vibetop` (`listen 80 default_server`). The terminal project owns this file. A `map $uri $term_port` directive (generated for 1..50) routes `/tN/` to port `7680+N` via a single regex location block. Sibling projects extend via `include /etc/nginx/snippets/vibetop-extras.d/*.conf`.

## Uninstall

Top-level `uninstall.sh` tears down the WHOLE runtime in one shot (services, nginx site + snippets, the OnlyOffice container, web root), keeping the repo, user data (`~/.local/share`, `~/Documents`, `~/Uploads`), the JWT secret, and the ~2 GB image:

```bash
sudo ./uninstall.sh                   # everything; re-deploy with ./deploy.sh
```

Sub-projects also keep their own idempotent `uninstall.sh` (leave apt packages + user data in place):

```bash
sudo ./terminal/uninstall.sh          # stops units, removes nginx site
sudo ./apps/everyday/browser/uninstall.sh           # stops units, removes nginx snippet
sudo ./apps/everyday/office/uninstall.sh            # removes the OnlyOffice container + nginx snippet
sudo ./tunnel/uninstall.sh            # N/A — uninstall cloudflared manually
```

Most support `--dry-run`.

## Install script conventions

All `install.sh` scripts share the same patterns:
- Idempotent and re-runnable. `--dry-run` (or `-n`) previews without acting.
- Env vars override defaults (e.g. `MAX_INSTANCES=50`, `XPRA_PORT=14500`). See the header comment in each script for the full list.
- Systemd unit files under `*/systemd/` are templates with `@PLACEHOLDER@` tokens (e.g. `@APP_USER@`, `@DISPLAY_NUM@`). install.sh renders them via `sed` and writes to `/etc/systemd/system/`.
- nginx configs under `*/nginx/` follow the same pattern.

