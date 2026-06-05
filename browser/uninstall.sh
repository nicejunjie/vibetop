#!/usr/bin/env bash
# Reverse what install.sh did. Idempotent. Leaves apt packages, the xpra.org
# repo, and the browser profile in place.

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }

echo "== stopping and disabling xpra service =="
run sudo systemctl disable --now claude-browser-xpra.service 2>/dev/null || true

echo "== cleaning up legacy VNC services (if any) =="
for legacy in claude-browser-app claude-browser-novnc \
              claude-browser-wm claude-browser-xserver; do
    if [ -f "/etc/systemd/system/${legacy}.service" ]; then
        run sudo systemctl disable --now "${legacy}.service" 2>/dev/null || true
        run sudo rm -f "/etc/systemd/system/${legacy}.service"
    fi
done

echo "== removing systemd unit files =="
run sudo rm -f /etc/systemd/system/claude-browser-xpra.service
run sudo systemctl daemon-reload

echo "== removing browser loop script =="
run sudo rm -f /usr/local/lib/claude-browser/browser-loop.sh
run sudo rmdir /usr/local/lib/claude-browser 2>/dev/null || true

echo "== removing nginx snippet =="
run sudo rm -f /etc/nginx/snippets/claude-extras.d/browser.conf
if sudo nginx -t 2>/dev/null; then
    run sudo systemctl reload nginx
fi

echo "done."
