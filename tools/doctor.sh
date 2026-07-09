#!/usr/bin/env bash
#
# doctor.sh — vibetop host configuration diagnostic.
#
# The companion to tools/smoke-test.sh: smoke answers "is it up right now?",
# doctor answers "is this host configured to STAY up?". It codifies the
# hard-won, host-specific failure modes from CLAUDE.md + docs/design-decisions.md
# into automated checks, each printing PASS / WARN / FAIL with the one-line fix —
# so "why is the Browser blank on this new box?" becomes one command instead of a
# 30-minute hunt.
#
# DEV/OPS tool only: no installer runs it, it changes nothing (read-only probes).
# Run it on the host (some checks need root — run with sudo for the full set):
#
#   sudo ./tools/doctor.sh
#   ./tools/doctor.sh            # non-root: root-only checks self-skip
#
# Exit status: 0 = no hard failures (WARNs are advisory), 1 = one or more FAILs.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Resolve the install user the way the manager does: $APP_USER, else the owner of
# the manager script, else whoever's running this.
APP_USER="${APP_USER:-$(stat -c '%U' "$ROOT/terminal/terminal-manager.py" 2>/dev/null || id -un)}"
APP_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6)"
[ -n "$APP_HOME" ] || APP_HOME="/home/$APP_USER"
IS_ROOT=0; [ "$(id -u)" = 0 ] && IS_ROOT=1

pass=0; warn=0; fail=0
c() { case "$1" in g) printf '\033[32m';; y) printf '\033[33m';; r) printf '\033[31m';; b) printf '\033[1m';; *) printf '\033[0m';; esac; }
ok()   { printf '  %sPASS%s  %s\n' "$(c g)" "$(c 0)" "$1"; pass=$((pass+1)); }
adv()  { printf '  %sWARN%s  %s\n' "$(c y)" "$(c 0)" "$1"; warn=$((warn+1)); }
bad()  { printf '  %sFAIL%s  %s\n' "$(c r)" "$(c 0)" "$1"; fail=$((fail+1)); }
info() { printf '  %sINFO%s  %s\n' "$(c b)" "$(c 0)" "$1"; }
skip() { printf '  ---   %s\n' "$1"; }
head_() { printf '\n%s── %s%s\n' "$(c b)" "$1" "$(c 0)"; }

have() { command -v "$1" >/dev/null 2>&1; }
unit_exists() { [ -f "/etc/systemd/system/$1" ]; }

printf '%svibetop doctor%s — user=%s home=%s %s\n' "$(c b)" "$(c 0)" "$APP_USER" "$APP_HOME" \
    "$( [ "$IS_ROOT" = 1 ] && echo '(root)' || echo '(non-root — some checks skipped; run with sudo for all)')"

# ---------------------------------------------------------------------------
head_ "Required tools"
# name:hint pairs. chromium/soffice/docker/cloudflared are feature-optional.
for tool in ttyd nginx xpra wmctrl git setfacl; do
    if have "$tool"; then ok "$tool present"; else bad "$tool MISSING — core dependency (re-run the installer)"; fi
done
if have filebrowser || [ -x /usr/local/bin/filebrowser ]; then ok "filebrowser present"; else bad "filebrowser MISSING (files/install.sh)"; fi
if have chromium || [ -x /snap/bin/chromium ]; then ok "chromium present"; else adv "chromium not found — the Browser app needs snap chromium (browser/install.sh)"; fi
if have soffice || have libreoffice; then ok "libreoffice present (Office View)"; else adv "libreoffice not found — Office 'View' (PDF preview) disabled"; fi
have docker && ok "docker present (Office Edit / OnlyOffice)" || adv "docker not found — OnlyOffice (Office Edit) disabled"
have cloudflared && ok "cloudflared present (tunnel)" || info "cloudflared not found — tunnel not installed (LAN-only is fine)"

# ---------------------------------------------------------------------------
head_ "Services"
for u in vibetop-manager vibetop-browser-xpra vibetop-x11-xpra vibetop-x11-dbus vibetop-filebrowser; do
    if ! unit_exists "$u.service"; then adv "$u.service not installed"; continue; fi
    state="$(systemctl is-active "$u.service" 2>/dev/null || true)"
    if [ "$state" = active ]; then ok "$u active"; else bad "$u is '$state' — 'systemctl status $u' / 'journalctl -u $u'"; fi
done
if unit_exists vibetop-manager.service; then
    en="$(systemctl is-enabled vibetop-manager.service 2>/dev/null || true)"
    [ "$en" = enabled ] && ok "vibetop-manager enabled at boot" || adv "vibetop-manager not enabled — won't start on reboot ('systemctl enable vibetop-manager')"
fi

# ---------------------------------------------------------------------------
head_ "Configuration pitfalls (the codified gotchas)"

# 1. RestrictNamespaces must NOT be set on the manager — it blocks snap-confine's
#    mount namespace, silently breaking the embedded Browser + X11 snap apps
#    (dormant until a manager restart). See docs/design-decisions.md.
if unit_exists vibetop-manager.service; then
    rn="$(systemctl show vibetop-manager.service -p RestrictNamespaces --value 2>/dev/null)"
    if [ -z "$rn" ] || [ "$rn" = "no" ]; then ok "manager RestrictNamespaces unset (snap Browser/X11 can launch)"
    else bad "manager RestrictNamespaces='$rn' — breaks snap Browser/X11 launch. Remove it from vibetop-manager.service + daemon-reload + restart"; fi
fi

# 2. Installed unit files must have no unsubstituted @PLACEHOLDER@ (a latent
#    install bug — e.g. @BASE_PORT@ left literal makes ttyd never bind).
left=""
for f in /etc/systemd/system/vibetop-*.service; do
    [ -f "$f" ] || continue
    if grep -qE '@[A-Z0-9_]+@' "$f"; then left="$left $(basename "$f")"; fi
done
[ -z "$left" ] && ok "installed units fully stamped (no @PLACEHOLDER@ left)" || bad "unsubstituted placeholders in:$left — re-run the sub-project install.sh"

# 3. Linger enabled for APP_USER — without it, systemd-logind tears down
#    /run/user/<uid> when the deploy login ends, so snap chromium can't launch
#    (blank Browser on a 2s crash-loop) until any login for the user reappears.
if [ -e "/var/lib/systemd/linger/$APP_USER" ]; then ok "linger enabled for $APP_USER (snap chromium survives logout)"
else adv "linger NOT enabled for $APP_USER — Browser may go blank after logout. Fix: 'sudo loginctl enable-linger $APP_USER'"; fi

# 4. KillMode=process on the session unit — so closing a tab spares detached
#    processes (ssh ControlPersist, tmux, nohup).
if unit_exists vibetop-session@.service; then
    # `systemctl show` can't query an uninstantiated template, so read the unit
    # file directly (skip comment lines).
    if grep -qE '^KillMode=process' /etc/systemd/system/vibetop-session@.service; then
        ok "vibetop-session KillMode=process (detached procs survive a tab close)"
    else adv "vibetop-session is not KillMode=process — closing a tab may kill ssh/tmux/nohup"; fi
fi

# 5. The private apps D-Bus bus — GNOME/GTK launcher apps hang ~33s on portal
#    activation timeouts without it.
if unit_exists vibetop-x11-dbus.service; then ok "vibetop-x11-dbus present (GNOME apps skip the 33s portal hang)"
elif unit_exists vibetop-x11-xpra.service; then adv "X11 display present but vibetop-x11-dbus missing — GTK apps may start slowly (browser/install.sh)"; fi

# 6. xhost line in the X11 xpra unit — snap apps on the X11 display need it
#    (confined snaps can't read ~/.Xauthority) or fail 'cannot open display'.
if unit_exists vibetop-x11-xpra.service; then
    grep -q 'xhost' /etc/systemd/system/vibetop-x11-xpra.service 2>/dev/null \
        && ok "X11 unit grants xhost (snap Firefox/Chromium can open the display)" \
        || adv "vibetop-x11-xpra has no 'xhost +si:localuser' — snap apps may fail 'cannot open display'"
fi

# ---------------------------------------------------------------------------
head_ "xpra"
if have xpra; then
    xv="$(xpra --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)"
    xmaj="${xv%%.*}"
    if [ -z "$xv" ]; then adv "could not parse xpra version"
    elif [ "${xmaj:-0}" -lt 4 ]; then bad "xpra $xv is too old (no HTML5 client) — install from the xpra.org apt repo (browser/install.sh)"
    elif printf '%s' "$xv" | grep -qE '^6\.5(\.|$)'; then adv "xpra $xv — the 6.5 line has a click-offset regression (clicks land ~1 line low). Pin 6.4.4 (see docs/design-decisions.md)"
    else ok "xpra $xv (>=4, not the 6.5 regression)"; fi
else
    unit_exists vibetop-browser-xpra.service && bad "xpra missing but the Browser service is installed" || skip "xpra not installed (Browser app not deployed)"
fi

# ---------------------------------------------------------------------------
head_ "Networking"
# Dual-homed: 2+ global IPv4 addresses on the SAME subnet (heuristic /24) cause
# ARP flux that flaps terminal/Browser WebSockets on ~10s cycles for some clients.
if have ip; then
    dupe="$(ip -o -4 addr show scope global 2>/dev/null \
        | awk '{split($4,a,"/"); split(a[1],o,"."); print o[1]"."o[2]"."o[3]}' \
        | sort | uniq -d)"
    if [ -n "$dupe" ]; then
        # Routing installed = the samesubnet dispatcher file, or active policy
        # rules pointing at the per-interface tables (100 + ifindex).
        routed=0
        for d in /etc/NetworkManager/dispatcher.d/*samesubnet-routing; do [ -e "$d" ] && routed=1; done
        ip rule show 2>/dev/null | grep -qE 'lookup 1[0-9][0-9]' && routed=1
        if [ "$routed" = 1 ]; then
            ok "dual-homed subnet ($dupe.*) — same-subnet source routing is applied"
        else
            adv "dual-homed: 2+ IPs on subnet $dupe.* — ARP flux can flap WebSockets. Fix: re-run ./deploy.sh (auto-applies routing) or 'nmcli radio wifi off' (see docs/dual-homed-network.md)"
        fi
    else ok "single-homed (no two global IPs share a subnet)"; fi
else skip "iproute2 'ip' not available — skipping dual-homed check"; fi

# nginx config validity (needs root to read the full config on most hosts).
if have nginx; then
    if [ "$IS_ROOT" = 1 ]; then
        if nginx -t >/dev/null 2>&1; then ok "nginx -t OK"; else bad "nginx -t FAILED — 'sudo nginx -t' for details"; fi
    else skip "nginx -t needs root (re-run with sudo)"; fi
    ss -tlnp 2>/dev/null | grep -q ':80 ' && ok "something is listening on :80 (nginx front door)" || adv "nothing listening on :80 — nginx down?"
fi

# Manager liveness (standalone — doesn't need the smoke test).
if have curl; then
    if curl -s --max-time 5 http://127.0.0.1/api/ping 2>/dev/null | grep -qE '"ok": *true'; then ok "manager answering /api/ping"
    else adv "manager not answering http://127.0.0.1/api/ping — see 'journalctl -u vibetop-manager'"; fi
fi

# ---------------------------------------------------------------------------
head_ "Filesystem & resources"
# Home traversal ACL for www-data (nginx worker) — 0750 home needs it to serve.
if have getfacl; then
    if getfacl -p "$APP_HOME" 2>/dev/null | grep -q 'user:www-data:'; then ok "www-data has an ACL on $APP_HOME (nginx can traverse)"
    else
        perm="$(stat -c '%a' "$APP_HOME" 2>/dev/null || echo '')"
        case "$perm" in *7[0-4]|75[0-5]|0*) adv "no www-data ACL on $APP_HOME (mode $perm) — nginx may 403 static files. Fix: 'setfacl -m u:www-data:--x $APP_HOME'";; *) ok "$APP_HOME mode $perm is world-traversable";; esac
    fi
fi

# Disk on / — mirror the manager's banner thresholds.
if have df; then
    read -r _ _ _ avail usep _ < <(df -P / | tail -1)
    usep_n="${usep%\%}"; avail_gb=$((avail / 1024 / 1024))
    if [ "${usep_n:-0}" -ge 95 ] || [ "$avail_gb" -lt 2 ]; then bad "root disk ${usep} used, ${avail_gb}G free — CRITICAL (writes/saves will fail)"
    elif [ "${usep_n:-0}" -ge 90 ] || [ "$avail_gb" -lt 10 ]; then adv "root disk ${usep} used, ${avail_gb}G free — getting full"
    else ok "root disk ${usep} used, ${avail_gb}G free"; fi
fi

# OnlyOffice JWT secret (only relevant if Office Edit is deployed).
if [ -f /etc/nginx/snippets/vibetop-extras.d/onlyoffice.conf ]; then
    [ -f "$APP_HOME/.config/vibetop/onlyoffice.secret" ] && ok "OnlyOffice JWT secret present" \
        || bad "OnlyOffice nginx snippet present but the JWT secret is missing ($APP_HOME/.config/vibetop/onlyoffice.secret)"
fi

# The manager runs in-place from a FULL git clone (so the in-app Updater works).
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT" remote get-url origin >/dev/null 2>&1 && ok "repo is a full git clone with an 'origin' remote (in-app Update works)" \
        || adv "repo has no 'origin' remote — the in-app Update can't fetch (was this a tarball, not a clone?)"
else adv "$ROOT is not a git checkout — the in-app Update needs a full clone"; fi

# ---------------------------------------------------------------------------
printf '\n%s────────────────────────────────────────%s\n' "$(c b)" "$(c 0)"
printf 'doctor: %s%d pass%s, %s%d warn%s, %s%d fail%s\n' \
    "$(c g)" "$pass" "$(c 0)" "$(c y)" "$warn" "$(c 0)" "$(c r)" "$fail" "$(c 0)"
[ "$fail" -eq 0 ]
