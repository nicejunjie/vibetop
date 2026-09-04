#!/usr/bin/env bash
# uninstall.sh — tear down the ENTIRE Vibetop runtime in one shot: the transient
# per-user services, the static systemd units, the nginx site/snippets, the
# OnlyOffice container, and the deployed web root. Best-effort (won't abort on a
# missing piece).
#
# KEEPS: this repo (or /opt/vibetop/app), every user's data (~/.local/share
# notes/desktop-state, ~/Documents, ~/Uploads), the shared state and secrets
# under /opt/vibetop/{etc,var}, and the ~2GB OnlyOffice docker image. So a
# re-deploy is quick and nothing personal is lost.
#
#   sudo ./uninstall.sh
#   sudo ./uninstall.sh --dry-run     # print what would happen, touch nothing
#
# WEB ROOT RESOLUTION. This script used to derive the web root from $SUDO_USER
# ("$APP_HOME/vibetop-www"). On the system layout that is the invoking human's
# home, not /opt/vibetop/vibetop-www — so a plain `sudo ./uninstall.sh` on prod
# printed "Removed: ... web root" while the live web root was never touched.
# The served root is whatever the nginx site says it is, so ASK NGINX first.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/lib/layout.sh
. "$HERE/tools/lib/layout.sh"

DRY_RUN=0
for a in "$@"; do
    case "$a" in
        --dry-run|-n) DRY_RUN=1 ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "unknown option: $a" >&2; exit 2 ;;
    esac
done
run() { if (( DRY_RUN )); then echo "  [dry-run] $*"; else "$@" >/dev/null 2>&1 || true; fi; }

# --- resolve the web root ---------------------------------------------------
# Priority: the live nginx site (authoritative — it is what is actually served),
# then the system layout, then a legacy home install.
WWW="$(vt_nginx_root)" && WWW_SRC="nginx site" || WWW=""
if [ -z "$WWW" ]; then
    if [ -d "$VT_WWW" ]; then
        WWW="$VT_WWW"; WWW_SRC="system layout"
    else
        legacy_user="${SUDO_USER:-$(id -un)}"
        legacy_home="$(getent passwd "$legacy_user" | cut -d: -f6)"
        if [ -n "$legacy_home" ] && [ -d "$legacy_home/vibetop-www" ]; then
            WWW="$legacy_home/vibetop-www"; WWW_SRC="legacy home install ($legacy_user)"
        fi
    fi
fi
WWW_SRC="${WWW_SRC:-none}"

echo "== Vibetop uninstall =="
(( DRY_RUN )) && echo "   (dry run — nothing will be changed)"
echo "   web root: ${WWW:-<none found>}${WWW:+  [$WWW_SRC]}"

# 1. transient per-user services --------------------------------------------
# These are independent `systemd-run --collect` units with no PartOf= relation
# to the manager, so stopping the manager does NOT stop them. Left behind they
# keep each user's ttyd, login shell, FileBrowser, xpra, Chromium, X11, D-Bus
# and file-agent processes (and their ports and sockets) alive after the
# operator believes the service is gone.
echo "== stopping per-user (transient) services =="
mapfile -t transient < <(systemctl list-units --all --no-legend --plain \
    'vibetop-uterm-*' 'vibetop-uttyd-*' 'vibetop-fileagent-*' 'vibetop-ufiles-*' \
    'vibetop-ubrowser-*' 'vibetop-ux11-*' 'vibetop-ux11dbus-*' 'vibetop-cfg-restart-*' \
    2>/dev/null | awk '{print $1}')
if [ ${#transient[@]} -eq 0 ]; then
    echo "   none running"
else
    printf '   %s\n' "${transient[@]}"
    run systemctl stop "${transient[@]}"
fi

# 2. static services ---------------------------------------------------------
echo "== stopping & disabling services =="
units=(vibetop-manager vibetop-browser-xpra vibetop-x11-xpra vibetop-x11-dbus
       vibetop-filebrowser vibetop-claude-proxy.socket vibetop-claude-proxy
       vibetop-backup.timer vibetop-backup)
for n in $(seq 1 50); do units+=("vibetop-ttyd@$n" "vibetop-session@$n"); done
for u in "${units[@]}"; do
    run systemctl disable --now "$u"
done
# Glob the unit FILES rather than listing them: a name added to an installer but
# not to a hand-written list here is exactly how vibetop-backup.timer and
# vibetop-claude-proxy.socket survived every uninstall.
if (( DRY_RUN )); then
    ls -1 /etc/systemd/system/vibetop-* 2>/dev/null | sed 's/^/  [dry-run] rm /'
else
    rm -f /etc/systemd/system/vibetop-*.service /etc/systemd/system/vibetop-*.socket \
          /etc/systemd/system/vibetop-*.timer /etc/systemd/system/vibetop-*.service.bak \
          2>/dev/null || true
fi
run systemctl daemon-reload

# 3. OnlyOffice container ----------------------------------------------------
if command -v docker >/dev/null 2>&1; then
    echo "== removing OnlyOffice container =="
    run docker rm -f vibetop-onlyoffice
fi

# 4. nginx -------------------------------------------------------------------
echo "== removing nginx config =="
if (( DRY_RUN )); then
    echo "  [dry-run] rm nginx site + snippets"
else
    rm -f /etc/nginx/sites-enabled/vibetop /etc/nginx/sites-available/vibetop \
          /etc/nginx/conf.d/vibetop.conf /etc/nginx/conf.d/vibetop-upgrade.conf
    rm -f /etc/nginx/snippets/vibetop-extras.d/*.conf 2>/dev/null || true
    rmdir /etc/nginx/snippets/vibetop-extras.d 2>/dev/null || true
    if command -v nginx >/dev/null 2>&1; then
        nginx -t >/dev/null 2>&1 && systemctl reload nginx 2>/dev/null \
            || systemctl restart nginx 2>/dev/null || true
    fi
fi

# 5. runtime state -----------------------------------------------------------
# Sockets and per-user runtime dirs the transient units left behind. NOT
# /opt/vibetop/var — that holds the user registry, session-revocation epochs and
# policy, which a re-deploy must find intact.
echo "== removing runtime sockets =="
run rm -rf /run/vibetop

# 6. deployed web root -------------------------------------------------------
echo "== removing deployed web root =="
if vt_is_web_root "$WWW"; then
    if (( DRY_RUN )); then
        echo "  [dry-run] rm -rf ${WWW%/}"
    else
        rm -rf "${WWW%/}"
    fi
else
    echo "   SKIPPED — '${WWW:-<none>}' does not look like a deployed vibetop web"
    echo "   root (expected a .../vibetop-www or .../www directory containing"
    echo "   index.html or sw.js). Nothing was deleted; remove it by hand if you"
    echo "   are sure."
fi

echo
echo "Removed: per-user services, static services, nginx config, OnlyOffice container, web root."
echo "Kept: the checkout, every user's ~/.local/share, ~/Documents, ~/Uploads,"
echo "      $VT_ETC (secrets), $VT_VAR (registry/policy), the OnlyOffice image."
echo "Re-deploy with:  sudo ./deploy.sh"
