#!/usr/bin/env bash
# deploy.sh — one-command full deploy of Vibetop (the whole stack).
#
#   ./deploy.sh                   deploy on THIS machine
#   ./deploy.sh --remote HOST     rsync this repo to HOST:~/vibetop and deploy there
#                                 (HOST is any ssh destination: user@ip or an
#                                  ssh-config Host; a bare shell alias won't work)
#
# Flags:
#   --remote HOST    deploy to a remote host over SSH (rsync first)
#   --no-browser     skip the xpra/Chromium Browser stack (heavy: xpra repo + snap)
#   --no-files       skip FileBrowser (the Files app)
#   --no-office      skip OnlyOffice Document Server (docker; heavy ~2GB image)
#   --with-tunnel    also run the interactive Cloudflare tunnel installer
#   --dry-run        print what each installer would do, change nothing
#   --help
#
# Order matters: terminal first (owns the nginx site + the extras include),
# then browser/files (drop extras snippets), then landing (static UI), tunnel last.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REMOTE="" ; DO_BROWSER=1 ; DO_FILES=1 ; DO_OFFICE=1 ; DO_TUNNEL=0 ; DRY=0
PASS=()   # flags forwarded to the remote invocation of this script
while [ $# -gt 0 ]; do
    case "$1" in
        --remote)      REMOTE="${2:?--remote needs a host}"; shift 2 ;;
        --no-browser)  DO_BROWSER=0; PASS+=("$1"); shift ;;
        --no-files)    DO_FILES=0;   PASS+=("$1"); shift ;;
        --no-office)   DO_OFFICE=0;  PASS+=("$1"); shift ;;
        --with-tunnel) DO_TUNNEL=1;  PASS+=("$1"); shift ;;
        --dry-run|-n)  DRY=1;        PASS+=("--dry-run"); shift ;;
        --help|-h)     sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
export DEBIAN_FRONTEND=noninteractive
DRYFLAG=(); (( DRY )) && DRYFLAG=(--dry-run)
step() { echo; echo "### $*"; }

step "1/6  Terminal — nginx site + manager + ttyd"
sudo "$REPO_DIR/terminal/install.sh" "${DRYFLAG[@]}"

if (( DO_BROWSER )); then
    step "2/6  Browser — xpra + Chromium"
    sudo "$REPO_DIR/browser/install.sh" "${DRYFLAG[@]}"
else
    step "2/6  Browser — skipped (--no-browser)"
fi

if (( DO_FILES )); then
    step "3/6  Files — FileBrowser"
    sudo "$REPO_DIR/files/install.sh" "${DRYFLAG[@]}"
else
    step "3/6  Files — skipped (--no-files)"
fi

if (( DO_OFFICE )); then
    step "4/6  Office — OnlyOffice Document Server (docker, ~2GB)"
    sudo "$REPO_DIR/office/install.sh" "${DRYFLAG[@]}"
else
    step "4/6  Office — skipped (--no-office)"
fi

step "5/6  Landing — desktop UI + static apps"
"$REPO_DIR/landing/install.sh" "${DRYFLAG[@]}"

step "5b/6 Claude usage — opt-in usage-capture proxy (unit installed, left off)"
sudo "$REPO_DIR/claude-usage/install.sh" "${DRYFLAG[@]}"

if (( DO_TUNNEL )); then
    step "6/6  Tunnel — Cloudflare (interactive)"
    sudo "$REPO_DIR/tunnel/install.sh" "${DRYFLAG[@]}"
else
    step "6/6  Tunnel — skipped (run with --with-tunnel; it's interactive)"
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
    step "health check (loopback http codes)"
    for p in / /t1/ /terminals/ /files/ /browser/ /onlyoffice/healthcheck /api/system/status; do
        printf "  %-24s " "$p"
        curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 --retry 6 --retry-delay 2 --retry-all-errors "http://127.0.0.1$p" || echo "ERR"
    done
fi
echo
echo "Vibetop deployed. Open http://<this-host>/ on your LAN."
