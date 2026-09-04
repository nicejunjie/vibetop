#!/usr/bin/env bash
# deploy.sh — one-command full deploy of Vibetop (the whole stack).
#
#   sudo ./deploy.sh              deploy on THIS machine
#   ./deploy.sh --remote HOST     rsync this repo to HOST and deploy there
#                                 (HOST is any ssh destination: user@ip or an
#                                  ssh-config Host; a bare shell alias won't work)
#
# RUN IT AS ROOT (it re-execs under sudo if you don't). Vibetop installs like
# ordinary server software — root-owned code in /opt/vibetop, owned by a no-login
# `vibetop` service account — and needs NO username. People arrive afterwards by
# logging in with their own Linux account: every per-user path is resolved at
# runtime from the session cookie, and per-user services are transient units
# created on demand. Name admins (for Update / Claude-usage) with VIBETOP_ADMINS;
# under `sudo` the invoking user is seeded as the first one.
#
# Flags:
#   --remote HOST    deploy to a remote host over SSH (rsync first)
#   --admins a,b     Linux users granted the operator-only surfaces
#   --no-browser     skip the xpra/Chromium Browser stack (heavy: xpra repo + snap)
#   --no-files       skip FileBrowser (the Files app)
#   --no-office      skip OnlyOffice Document Server (docker; heavy ~2GB image)
#   --with-tunnel    also run the interactive Cloudflare tunnel installer
#   --dry-run        print what each installer would do, change nothing
#   --help
#
# Order matters: terminal first (owns the nginx site + the extras include),
# then browser/files (drop extras snippets), then shell (static UI + apps), tunnel last.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/lib/layout.sh
. "$REPO_DIR/tools/lib/layout.sh"
# shellcheck source=tools/lib/osdeps.sh
. "$REPO_DIR/tools/lib/osdeps.sh"

REMOTE="" ; DO_BROWSER=1 ; DO_FILES=1 ; DO_OFFICE=1 ; DO_TUNNEL=0 ; DRY=0
ADMINS="${VIBETOP_ADMINS:-}"
ORIG_ARGS=("$@")   # the parse loop below shifts "$@" empty; the staging re-exec
                   # needs the ORIGINAL flags or it silently drops every one of
                   # them (--no-office, --admins, …) and deploys the wrong stack.
PASS=()   # flags forwarded to the remote invocation of this script
while [ $# -gt 0 ]; do
    case "$1" in
        --remote)      REMOTE="${2:?--remote needs a host}"; shift 2 ;;
        --admins)      ADMINS="${2:?--admins needs a list}"; PASS+=("$1" "$2"); shift 2 ;;
        --admins=*)    ADMINS="${1#--admins=}"; PASS+=("$1"); shift ;;
        --no-browser)  DO_BROWSER=0; PASS+=("$1"); shift ;;
        --no-files)    DO_FILES=0;   PASS+=("$1"); shift ;;
        --no-office)   DO_OFFICE=0;  PASS+=("$1"); shift ;;
        --with-tunnel) DO_TUNNEL=1;  PASS+=("$1"); shift ;;
        --dry-run|-n)  DRY=1;        PASS+=("--dry-run"); shift ;;
        --help|-h)     sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $1" >&2; exit 2 ;;
    esac
done

# --- Remote mode: ship the repo, run ourselves on the far side, health-check ---
if [ -n "$REMOTE" ]; then
    echo "==> syncing repo to $REMOTE:~/vibetop"
    # Include .git so the target is a real checkout (the in-app Updater runs
    # `git log`/`git pull`); it's tiny. Then repoint origin at HTTPS so the
    # Updater can pull a public repo without an SSH key on the target.
    rsync -az --delete --exclude='*.pyc' "$REPO_DIR/" "$REMOTE":vibetop/
    https_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null | sed -E 's#git@([^:]+):#https://\1/#' || true)"
    if [ -n "$https_url" ]; then
        ssh "$REMOTE" "git -C ~/vibetop remote set-url origin '$https_url' 2>/dev/null || true; git config --global --add safe.directory ~/vibetop 2>/dev/null || true"
    fi
    echo "==> deploying on $REMOTE"
    ssh "$REMOTE" "cd ~/vibetop && DEBIAN_FRONTEND=noninteractive ./deploy.sh ${PASS[*]:-}"
    echo "==> remote health check (loopback http codes)"
    ssh "$REMOTE" 'for p in / /t1/ /terminals/ /files/ /browser/ /onlyoffice/healthcheck /api/system/status; do printf "  %-24s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 --retry 6 --retry-delay 2 --retry-all-errors "http://127.0.0.1$p" || echo "ERR"; done'
    ip=$(ssh "$REMOTE" "hostname -I | awk '{print \$1}'" 2>/dev/null)
    echo "==> done. Open http://${ip:-<remote-ip>}/ on your LAN."
    exit 0
fi

# --- Local mode -------------------------------------------------------------
vt_require_root "$0" "$@"          # no-op when already root; re-execs otherwise
export DEBIAN_FRONTEND=noninteractive
DRYFLAG=(); (( DRY )) && DRYFLAG=(--dry-run)
step() { echo; echo "### $*"; }

# Under `sudo`, seed the admin list with the invoking human so the operator-only
# surfaces (Update, Claude-usage) aren't locked out on a normal interactive
# install. Pure root with no --admins leaves it empty: nobody gets those two
# surfaces until VIBETOP_ADMINS is set, which is the safe unattended default.
if [ -z "$ADMINS" ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    ADMINS="$SUDO_USER"
fi

# A pre-/opt install (nginx serving out of somebody's home) is NOT silently
# relocated — moving the web root and secrets is migrate-to-opt.sh's job, which
# preserves live sessions and keeps a rollback. Just deploy it where it already is.
LEGACY_WWW="$(vt_existing_home_install)"
if [ -n "$LEGACY_WWW" ]; then
    echo "==> existing home-based install detected (nginx root: $LEGACY_WWW)"
    echo "    Deploying in place, NOT relocating. To move it to $VT_OPT:"
    echo "        sudo tools/migrate-to-opt.sh"
else
    # --- System layout: root-owned tree, no-login service account, no username -
    step "0/6  Layout — $VT_OPT (service account: $VT_SVC)"
    if (( DRY )); then
        echo "+ create account $VT_SVC; mkdir $VT_OPT{,/app,/vibetop-www,/etc,/var}"
        echo "+ write $VT_ENV_FILE (VIBETOP_ADMINS=$ADMINS)"
        [ "$REPO_DIR" = "$VT_APP" ] || \
            echo "+ stage $REPO_DIR -> $VT_APP, then re-run from there"
        echo "  (dry run does NOT stage, so the paths below still show $REPO_DIR)"
    else
        vt_ensure_service_account
        vt_ensure_dirs
        vt_write_manager_env "$ADMINS"
        echo "-- $VT_ENV_FILE: VIBETOP_ADMINS=${ADMINS:-<none — set it to enable Update/Claude-usage>}"

        # Stage the checkout into the system tree and continue from THERE: the
        # manager execs in-place from its checkout and the in-app Updater pulls
        # into it, so it must not live in anyone's home.
        if [ "$REPO_DIR" != "$VT_APP" ] && [ -z "${VIBETOP_STAGED:-}" ]; then
            step "0b/6 Staging the checkout -> $VT_APP"
            install -d -m 0755 -o "$VT_SVC" -g "$VT_SVC" "$VT_APP"
            if command -v rsync >/dev/null 2>&1; then
                # .git included: the Updater needs a real checkout. --delete so a
                # re-run can't leave removed files behind.
                rsync -a --delete --exclude='*.pyc' --exclude='tests/e2e/node_modules/' \
                      "$REPO_DIR"/ "$VT_APP"/
            else
                cp -a "$REPO_DIR"/. "$VT_APP"/
            fi
            chown -R "$VT_SVC:$VT_SVC" "$VT_APP"
            sudo -u "$VT_SVC" git config --global --add safe.directory "$VT_APP" 2>/dev/null || true
            echo "==> continuing from $VT_APP"
            exec env VIBETOP_STAGED=1 "$VT_APP/deploy.sh" "${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}"
        fi
    fi
    # Every sub-installer runs with the service identity + system paths, so
    # nothing keys off the invoking user's $HOME.
    vt_installer_env_array
fi

# Installers inherit the layout env when we set one up (empty on a legacy host,
# where their own defaults still resolve to the existing home install).
INST_ENV=(); [ -n "$LEGACY_WWW" ] || INST_ENV=("${VT_ENV_ARRAY[@]}")

step "1/6  Terminal — nginx site + manager + ttyd"
env "${INST_ENV[@]}" "$REPO_DIR/server/install.sh" "${DRYFLAG[@]}"

if (( DO_BROWSER )); then
    step "2/6  Browser — xpra + Chromium"
    env "${INST_ENV[@]}" "$REPO_DIR/apps/everyday/browser/install.sh" "${DRYFLAG[@]}"
else
    step "2/6  Browser — skipped (--no-browser)"
fi

if (( DO_FILES )); then
    step "3/6  Files — FileBrowser"
    env "${INST_ENV[@]}" "$REPO_DIR/apps/everyday/files/install.sh" "${DRYFLAG[@]}"
else
    step "3/6  Files — skipped (--no-files)"
fi

if (( DO_OFFICE )); then
    step "4/6  Office — OnlyOffice Document Server (docker, ~2GB)"
    env "${INST_ENV[@]}" "$REPO_DIR/apps/everyday/office/install.sh" "${DRYFLAG[@]}"
else
    step "4/6  Office — skipped (--no-office)"
fi

# Landing writes the web root. On the system layout that is $VT_WWW owned by the
# service account, so run it AS that account; on a legacy home install it still
# re-execs itself as $SUDO_USER to land in that person's home.
step "5/6  Landing — desktop UI + static apps"
if [ -n "$LEGACY_WWW" ]; then
    "$REPO_DIR/shell/install.sh" "${DRYFLAG[@]}"
else
    sudo -u "$VT_SVC" -H env "${INST_ENV[@]}" "$REPO_DIR/shell/install.sh" "${DRYFLAG[@]}"
fi

step "5b/6 Claude usage — opt-in usage-capture proxy (unit installed, left off)"
env "${INST_ENV[@]}" "$REPO_DIR/apps/utilities/claude-usage/install.sh" "${DRYFLAG[@]}"

if (( DO_TUNNEL )); then
    step "6/6  Tunnel — Cloudflare (interactive)"
    env "${INST_ENV[@]}" "$REPO_DIR/tunnel/install.sh" "${DRYFLAG[@]}"
else
    step "6/6  Tunnel — skipped (run with --with-tunnel; it's interactive)"
fi

# Firewall LAST: firewalld is not on the base cloud images — xpra's RPM
# dependency chain installs it (ENABLED) during the Browser step, so any earlier
# call finds no firewall-cmd and silently does nothing. It stays INACTIVE for the
# rest of this boot, so everything works and the matrix passes; the host then
# comes back after a reboot with only ssh/mdns allowed and vibetop is
# LAN-unreachable. Must run after every installer that can pull it in.
if (( ! DRY )); then
    vt_firewall_open_web
fi

# Same-subnet dual-homing: if 2+ NICs share a LAN subnet, the host would answer
# some clients on the wrong interface (asymmetric routing) and long-lived
# WebSockets (terminals/Browser) flap ~10s in. Auto-apply per-interface "reply via
# the incoming NIC" routing so deployment stays portable with no manual host
# networking. No-op on single-homed hosts. See docs/dual-homed-network.md.
if (( ! DRY )) && ip -4 route show scope link 2>/dev/null | awk '$3 !~ /^(docker|veth|br-|virbr|lo)/ {print $1}' | sort | uniq -d | grep -q .; then
    step "network — dual-homed on one subnet; routing replies via the incoming NIC"
    sudo "$REPO_DIR/tools/setup-samesubnet-routing.sh" || echo "  (same-subnet routing setup failed — see docs/dual-homed-network.md)"
fi

# The manager runs in-place from the checkout, so a git-pull + redeploy otherwise
# leaves the OLD process serving new code. Restart it (quick, watchdog-backed;
# does NOT touch terminals/Browser — those are separate units). The in-app Updater
# restarts itself out-of-band and never runs this script, so this only affects a
# manual ./deploy.sh.
if (( ! DRY )); then
    step "restart manager (load new code)"
    sudo systemctl try-restart vibetop-manager || echo "  (manager restart failed — check: systemctl status vibetop-manager)"
fi

if (( ! DRY )); then
    step "health check"
    # Wait for the manager we just restarted BEFORE probing. Every protected
    # location goes through auth_request -> the manager, so probing during its
    # restart made all seven paths print ERR on a perfectly healthy deploy —
    # a false alarm on every single run.
    for _ in $(seq 1 30); do
        curl -sf -o /dev/null --max-time 2 http://127.0.0.1/api/ping && break
        sleep 1
    done
    # Prefer the real gate: smoke-test authenticates, so it reports the actual
    # state instead of the 302s an unauthenticated probe gets on a gated host.
    if [ -x "$REPO_DIR/tools/smoke-test.sh" ]; then
        # Forward --no-office. Without it the smoke check tests a component this
        # very run was told to skip, so every --no-office deploy ended with a
        # permanent, meaningless "2 failed" (OnlyOffice container + healthcheck) —
        # which is exactly the noise that made the e2e VM look like a broken image.
        smoke_args=(); [ "$DO_OFFICE" = "0" ] && smoke_args+=(--no-office)
        "$REPO_DIR/tools/smoke-test.sh" "${smoke_args[@]}" || echo "  (see failures above)"
    else
        for p in /api/ping / /t1/ /files/; do
            printf "  %-24s " "$p"
            curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 "http://127.0.0.1$p" || echo "ERR"
        done
    fi
fi
echo
echo "Vibetop deployed. Open http://<this-host>/ on your LAN."
