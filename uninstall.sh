#!/usr/bin/env bash
# uninstall.sh — tear down the ENTIRE Vibetop runtime in one shot: systemd
# services, the nginx site/snippets, the OnlyOffice container, and the deployed
# web root. Best-effort (won't abort on a missing piece).
#
# KEEPS: this repo, your data (~/.local/share notes/desktop-state, ~/Documents,
# ~/Uploads), the OnlyOffice JWT secret (~/.config/vibetop), and the ~2GB
# OnlyOffice docker image. So a re-deploy is quick and nothing personal is lost.
#
#   sudo ./uninstall.sh
set -uo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
echo "== Vibetop uninstall (user: $APP_USER) =="

# 1. systemd services -------------------------------------------------------
echo "== stopping & disabling services =="
units=(claude-web-manager claude-browser-xpra claude-office-xpra claude-web-filebrowser)
for n in $(seq 1 50); do units+=("claude-web-ttyd@$n" "claude-web-session@$n"); done
for u in "${units[@]}"; do
    systemctl disable --now "$u" >/dev/null 2>&1 || true
done
rm -f /etc/systemd/system/claude-web-manager.service \
      /etc/systemd/system/claude-web-ttyd@.service \
      /etc/systemd/system/claude-web-session@.service \
      /etc/systemd/system/claude-browser-xpra.service \
      /etc/systemd/system/claude-office-xpra.service \
      /etc/systemd/system/claude-web-filebrowser.service
systemctl daemon-reload 2>/dev/null || true

# 2. OnlyOffice container ---------------------------------------------------
if command -v docker >/dev/null 2>&1; then
    echo "== removing OnlyOffice container =="
    docker rm -f vibetop-onlyoffice >/dev/null 2>&1 || true
fi

# 3. nginx ------------------------------------------------------------------
echo "== removing nginx config =="
rm -f /etc/nginx/sites-enabled/claude-web /etc/nginx/sites-available/claude-web \
      /etc/nginx/conf.d/claude-web-upgrade.conf
rm -f /etc/nginx/snippets/claude-extras.d/*.conf 2>/dev/null || true
rmdir /etc/nginx/snippets/claude-extras.d 2>/dev/null || true
if command -v nginx >/dev/null 2>&1; then
    nginx -t >/dev/null 2>&1 && systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
fi

# 4. deployed web root ------------------------------------------------------
echo "== removing deployed web root =="
rm -rf "$APP_HOME/claude-web-www"

echo
echo "Removed: services, nginx config, OnlyOffice container, web root."
echo "Kept: this repo, ~/.config/vibetop, ~/.local/share, ~/Documents, ~/Uploads, the OnlyOffice image."
echo "Re-deploy with:  sudo ./deploy.sh"
