#!/usr/bin/env bash
# Reverse what install.sh did. Idempotent. Leaves apt packages installed.
#
# Usage:
#   ./uninstall.sh                 # remove everything
#   ./uninstall.sh --dry-run

set -euo pipefail

NGINX_SITE_NAME="${NGINX_SITE_NAME:-vibetop}"
APP_HOME="$(getent passwd "${SUDO_USER:-$(id -un)}" | cut -d: -f6)"
LANDING_DIR="${LANDING_DIR:-$APP_HOME/vibetop-www}"
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() {
    if (( DRY_RUN )); then
        printf '+ %s\n' "$*"
    else
        "$@"
    fi
}

echo "== stopping & disabling terminal manager =="
run sudo systemctl disable --now vibetop-manager.service 2>/dev/null || true

echo "== stopping all terminal instances =="
for i in $(seq 1 99); do
    if systemctl is-active --quiet "vibetop-ttyd@$i.service" 2>/dev/null || \
       systemctl is-active --quiet "vibetop-session@$i.service" 2>/dev/null; then
        run sudo systemctl stop "vibetop-ttyd@$i.service" "vibetop-session@$i.service" 2>/dev/null || true
    fi
done

echo "== removing systemd units =="
run sudo rm -f /etc/systemd/system/vibetop-session@.service \
               /etc/systemd/system/vibetop-ttyd@.service \
               /etc/systemd/system/vibetop-manager.service
run sudo systemctl daemon-reload

echo "== removing nginx config =="
run sudo rm -f "/etc/nginx/sites-enabled/$NGINX_SITE_NAME" \
               "/etc/nginx/sites-available/$NGINX_SITE_NAME" \
               /etc/nginx/conf.d/vibetop-upgrade.conf
if [ -f /etc/nginx/sites-available/default ] && [ ! -L /etc/nginx/sites-enabled/default ]; then
    run sudo ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    echo "   re-enabled default site"
fi
run sudo nginx -t && run sudo systemctl reload nginx

echo "== removing landing files =="
run rm -f "$LANDING_DIR/index.html" "$LANDING_DIR/landing.html" \
          "$LANDING_DIR/terminals.html" "$LANDING_DIR/xpra-patches.js"

echo "== removing leftover sockets =="
run sudo rm -f /tmp/vibetop-session-*.sock /tmp/vibetop-session-*.pid /tmp/vibetop-session-*.size

echo "done."
