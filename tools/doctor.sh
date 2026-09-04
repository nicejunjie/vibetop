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

# The nginx site (both distro layouts) — used by the Services and Web-root checks.
SITE="${VT_SITE_FILE:-/etc/nginx/sites-available/vibetop}"      # overridable = testable
[ -f "$SITE" ] || SITE=/etc/nginx/conf.d/vibetop.conf           # RHEL-family layout

# Is this a MULTI-USER host? Decided from the deployed nginx config: the
# multi-user build gates every surface with `auth_request /internal/authcheck`.
# It matters because the shared vibetop-{browser-xpra,x11-xpra,x11-dbus,
# filebrowser} units are the LEGACY single-user services — a multi-user host runs
# one transient unit PER USER instead, so those being inactive is CORRECT there.
# Reporting them as failures made doctor print 5 FAILs on a perfectly healthy
# host, and a diagnostic that cries wolf is one people stop reading.
# (tools/smoke-test.sh draws the same distinction from an unauthenticated GET /;
# doctor is offline/read-only, so it reads the config instead.)
MULTIUSER=0
[ -f "$SITE" ] && grep -q 'auth_request */internal/authcheck' "$SITE" 2>/dev/null && MULTIUSER=1

# Config authority for the system tree (secret paths + the admin list). Anything
# that resolves one of these independently drifts — see docs/design-decisions.md
# §"a config value with two resolvers".
VT_ENV="${VT_ENV_FILE:-/etc/vibetop/manager.env}"
vt_env_get() {  # vt_env_get KEY -> value from the manager env file, else empty
    [ -r "$VT_ENV" ] || return 0
    sed -n "s/^[[:space:]]*$1=//p" "$VT_ENV" | head -1
}

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
[ "$MULTIUSER" = 1 ] && info "multi-user host — shared xpra/FileBrowser units are legacy; per-user transient units replace them"

# The manager is the one service that must be up on every layout.
if ! unit_exists vibetop-manager.service; then adv "vibetop-manager.service not installed"
else
    state="$(systemctl is-active vibetop-manager.service 2>/dev/null || true)"
    [ "$state" = active ] && ok "vibetop-manager active" \
        || bad "vibetop-manager is '$state' — 'systemctl status vibetop-manager' / 'journalctl -u vibetop-manager'"
fi

# shared_unit <unit> <per-user-glob> <label> — see the MULTIUSER note above.
# Mirrors tools/smoke-test.sh's shared_unit: active => PASS; inactive on a
# multi-user host => SKIP (with the per-user count, so "nothing running" is still
# visible); inactive on a single-user host => FAIL, which is the real defect.
shared_unit() {
    local u="$1" glob="$2" label="$3" state n
    n="$(systemctl list-units --type=service --state=running --no-legend "$glob" 2>/dev/null | wc -l)"
    # ABSENT is not a defect on a multi-user host — these shared units are the
    # legacy single-user path and per-user transient units replace them, so a host
    # that never had one (or had a pre-multi-user leftover removed) is healthy.
    # Warning here is exactly the cries-wolf failure this file was rewritten to
    # avoid; note smoke-test.sh cannot hit it, since is-active reports a missing
    # unit as inactive and it takes the same branch as below.
    if ! unit_exists "$u.service"; then
        if [ "$MULTIUSER" = 1 ]; then
            skip "$u not installed — multi-user host uses per-user $label ($n running)"
        else
            adv "$u.service not installed"
        fi
        return
    fi
    state="$(systemctl is-active "$u.service" 2>/dev/null || true)"
    if [ "$state" = active ]; then ok "$u active"; return; fi
    if [ "$MULTIUSER" = 1 ]; then
        skip "$u inactive — multi-user host uses per-user $label ($n running)"
    else
        bad "$u is '$state' — 'systemctl status $u' / 'journalctl -u $u'"
    fi
}
shared_unit vibetop-browser-xpra 'vibetop-ubrowser-*'  "Browser xpra"
shared_unit vibetop-x11-xpra     'vibetop-ux11-*'      "X11 xpra"
shared_unit vibetop-x11-dbus     'vibetop-ux11dbus-*'  "X11 D-Bus"
shared_unit vibetop-filebrowser  'vibetop-ufiles-*'    "FileBrowser"
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
head_ "Operator identity (APP_USER vs the human admin)"
# Three identities exist and must not be conflated (CLAUDE.md §Multi-user):
# APP_USER (service account), OPERATOR (the human admin in VIBETOP_ADMINS), and
# the per-request user. Anything that means "the operator's home" — Claude usage
# capture, ~/.claude settings — must resolve to OPERATOR. When a producer falls
# back to APP_USER the failure is SILENT and asymmetric: it writes to one home
# while the manager reads the other, so the surface serves stale-but-plausible
# data indefinitely. That is the shape of the v1.18.4 bug; these checks make the
# divergence visible instead of leaving it to be noticed by eye.
ADMINS="$(vt_env_get VIBETOP_ADMINS)"      # VT_ENV + vt_env_get are defined once, up top
OPERATOR="${ADMINS%%,*}"

if [ ! -r "$VT_ENV" ]; then
    info "$VT_ENV absent — single-operator home install, APP_USER is the operator"
elif [ -z "$OPERATOR" ]; then
    adv "VIBETOP_ADMINS is empty in $VT_ENV — Update + Claude-usage are unavailable to everyone ('VIBETOP_ADMINS=<you>' then restart vibetop-manager)"
elif ! id "$OPERATOR" >/dev/null 2>&1; then
    bad "VIBETOP_ADMINS names '$OPERATOR', who is not a user on this host — fix $VT_ENV"
else
    ok "operator = $OPERATOR (VIBETOP_ADMINS in $VT_ENV)"
    # The operator must be a real human login, never the service account: the
    # service account's home is /opt/vibetop, which has no ~/.claude to observe.
    if [ "$OPERATOR" = "$APP_USER" ] && [ "${APP_HOME#/opt/}" != "$APP_HOME" ]; then
        bad "operator == APP_USER ($APP_USER), whose home is $APP_HOME — the operator must be the HUMAN admin; set VIBETOP_ADMINS in $VT_ENV and re-run claude-usage/install.sh"
    fi
fi

# The rendered proxy unit's User= is the check that would have caught v1.18.4.
if unit_exists vibetop-claude-proxy.service; then
    PU="$(sed -n 's/^User=//p' /etc/systemd/system/vibetop-claude-proxy.service | head -1)"
    if [ -z "$PU" ]; then
        adv "vibetop-claude-proxy has no User= — it would run as root"
    elif [ -z "$OPERATOR" ]; then
        skip "vibetop-claude-proxy User=$PU (no operator named — nothing to compare against)"
    elif [ "$PU" != "$OPERATOR" ]; then
        bad "vibetop-claude-proxy runs as '$PU' but the operator is '$OPERATOR' — its usage capture lands in the WRONG home and the desktop strip freezes. Fix: 'sudo env APP_USER=$APP_USER APP_DIR=$ROOT $ROOT/claude-usage/install.sh'"
    else
        ok "vibetop-claude-proxy User=$PU matches the operator"
    fi
    # Cheap corroboration: the symptom itself, straight from the proxy's journal.
    # Scoped to THIS run of the unit (not a flat -24h window) — otherwise the
    # failures logged before a fix keep the check red long after it's repaired,
    # and a check that stays red after you fix it stops being read.
    if [ "$IS_ROOT" = 1 ] && have journalctl && \
       [ "$(systemctl is-active vibetop-claude-proxy 2>/dev/null)" = active ]; then
        # "Wed 2026-07-29 14:16:20 CDT" -> "2026-07-29 14:16:20" (journalctl --since)
        since="$(systemctl show vibetop-claude-proxy -p ActiveEnterTimestamp --value 2>/dev/null \
                 | cut -d' ' -f2-3)"
        [ -n "$since" ] || since="-1h"
        wf="$(journalctl -u vibetop-claude-proxy --since "$since" --no-pager 2>/dev/null \
              | grep -c 'usage write failed' || true)"
        [ "${wf:-0}" -gt 0 ] \
            && bad "$wf 'usage write failed' entries since the proxy started — it is relaying but storing nothing, so the usage strip is frozen ('journalctl -u vibetop-claude-proxy | tail')" \
            || ok "proxy has stored every capture since it started (no write failures)"
    fi
fi

# ---------------------------------------------------------------------------
head_ "Web root (nginx root vs where the installers deploy)"
# The second instance of the same class as the operator checks above: the nginx
# `root` is rendered by terminal/install.sh from LANDING_DIR, while the files are
# put there by shell/install.sh from DST_DIR. Two resolvers, one path — and an
# in-app Update passes NEITHER, so both fall back to $APP_HOME/vibetop-www. A
# deploy that once used a different value leaves a fully-populated directory that
# nginx never serves, and the only symptom is a 404 on an injected asset (this is
# how xpra-patches.js went missing after the /opt move and the mobile Browser
# silently lost every patch).
# $SITE is resolved once at the top (both distro layouts).
# Paths nginx PROXIES rather than serving from disk — a ref into one of these is
# not a missing file. Mirrors sw.js's BYPASS list.
PROXIED_RE='^/(api|browser|x11-display|office|onlyoffice|t[0-9]|terminals|files|fileview|cdn-cgi|s)/'

if [ ! -f "$SITE" ]; then
    adv "no vibetop nginx site found — is terminal/install.sh deployed?"
else
    WEBROOT="$(sed -n 's/^[[:space:]]*root[[:space:]]\{1,\}\([^;]*\);.*/\1/p' "$SITE" | head -1)"
    if [ -z "$WEBROOT" ]; then
        bad "no 'root' directive in $SITE — nginx has nothing to serve the shell from"
    elif [ ! -d "$WEBROOT" ]; then
        bad "nginx root '$WEBROOT' does not exist — the desktop will 404 ('shell/install.sh')"
    else
        ok "nginx serves $WEBROOT"
        for f in index.html sw.js; do
            [ -f "$WEBROOT/$f" ] && ok "$f present in the web root" \
                || bad "$WEBROOT/$f missing — re-run shell/install.sh"
        done

        # Every asset the nginx config INJECTS by sub_filter must exist at the
        # served root. This is the exact check the xpra-patches.js 404 needed.
        miss=""
        for ref in $(grep -rhoE '/[A-Za-z0-9_.-]+\.js\?v=[A-Za-z0-9]+' \
                        "$SITE" /etc/nginx/snippets/vibetop-extras.d/ 2>/dev/null \
                     | sed 's/?.*//' | sort -u); do
            [ -f "$WEBROOT$ref" ] || miss="$miss $ref"
        done
        [ -n "$miss" ] \
            && bad "nginx injects scripts that are NOT at the served root:$miss — the pages load but their patches silently do nothing (re-run the owning install.sh)" \
            || ok "every sub_filter-injected script resolves under the web root"

        # Same test for the deployed pages' own local <script src="/…"> refs.
        miss=""
        for ref in $(grep -rhoE '<script src="/[^"?]+' "$WEBROOT"/*.html 2>/dev/null \
                     | sed 's/.*"//' | sort -u); do
            printf '%s' "$ref" | grep -qE "$PROXIED_RE" && continue   # proxied, not on disk
            [ -f "$WEBROOT$ref" ] || miss="$miss $ref"
        done
        [ -n "$miss" ] \
            && bad "deployed pages reference scripts missing from the web root:$miss (re-run shell/install.sh)" \
            || ok "deployed pages' local script refs all resolve"

        # An ORPHANED web root beside the served one: the signature of a deploy
        # that used a different LANDING_DIR/DST_DIR. Harmless if stale, but if it
        # is NEWER than what nginx serves, the last deploy went to the wrong
        # place and you are looking at old files wondering why nothing changed.
        for sib in "$(dirname "$WEBROOT")"/*www*/; do
            sib="${sib%/}"
            [ -d "$sib" ] && [ "$sib" != "$WEBROOT" ] || continue
            [ -f "$sib/index.html" ] || [ -f "$sib/sw.js" ] || continue
            if [ "$sib/index.html" -nt "$WEBROOT/index.html" ]; then
                bad "$sib is NEWER than the served root $WEBROOT — a deploy landed in the wrong directory and is not being served (check LANDING_DIR/DST_DIR)"
            else
                adv "$sib looks like an orphaned web root (older than the served one, not served) — safe to remove once confirmed"
            fi
        done

        # "Bumped sw.js but never deployed" — the documented release-checklist
        # trap: without the DEPLOYED version changing, no client auto-refreshes.
        src_sw="$(sed -n "s/^const VERSION = '\(v[0-9]*\)'.*/\1/p" "$ROOT/shell/sw.js" 2>/dev/null | head -1)"
        dep_sw="$(sed -n "s/^const VERSION = '\(v[0-9]*\)'.*/\1/p" "$WEBROOT/sw.js" 2>/dev/null | head -1)"
        if [ -n "$src_sw" ] && [ -n "$dep_sw" ]; then
            [ "$src_sw" = "$dep_sw" ] && ok "deployed sw.js matches the checkout ($dep_sw)" \
                || adv "checkout has sw.js $src_sw but $dep_sw is deployed — clients won't auto-refresh until shell/install.sh runs"
        fi
    fi
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
        # nginx (www-data) can traverse the home iff the OTHER-execute bit is set,
        # i.e. the LAST octal digit is odd (1/3/5/7). Match on that directly — the
        # old glob (*7[0-4]|75[0-5]|0*) was wrong: it PASSED 700 (no other access!)
        # and WARNed 755 (which is traversable).
        case "$perm" in
            "") adv "could not stat $APP_HOME to check nginx traversal" ;;
            *[1357]) ok "$APP_HOME mode $perm is world-traversable (nginx can enter)" ;;
            *) adv "no www-data ACL on $APP_HOME (mode $perm) — nginx may 403 static files. Fix: 'setfacl -m u:www-data:--x $APP_HOME'" ;;
        esac
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

# OnlyOffice JWT secret (only relevant if Office Edit is deployed). The path has
# ONE authority — ONLYOFFICE_SECRET_FILE in the manager env file — and only falls
# back to the legacy home location when that file doesn't name it. Resolving
# $APP_HOME/.config/... unconditionally (as this check used to) reported the
# secret MISSING on every /opt host, where it lives in /opt/vibetop/etc: a FAIL
# on a host whose Office Edit works fine.
if [ -f /etc/nginx/snippets/vibetop-extras.d/onlyoffice.conf ]; then
    OO_SECRET="$(vt_env_get ONLYOFFICE_SECRET_FILE)"
    [ -n "$OO_SECRET" ] || OO_SECRET="$APP_HOME/.config/vibetop/onlyoffice.secret"
    OO_DIR="$(dirname "$OO_SECRET")"
    if [ -f "$OO_SECRET" ]; then
        ok "OnlyOffice JWT secret present ($OO_SECRET)"
    elif [ "$IS_ROOT" != 1 ] && [ ! -r "$OO_DIR" ]; then
        # /opt/vibetop/etc is 0700 root:root — a non-root probe can't stat inside
        # it, and "can't look" must not be reported as "isn't there".
        skip "OnlyOffice JWT secret: $OO_DIR not readable as $(id -un) — re-run with sudo"
    else
        bad "OnlyOffice nginx snippet present but the JWT secret is missing ($OO_SECRET)"
    fi
fi

# The manager runs in-place from a FULL git clone (so the in-app Updater works).
# `-c safe.directory` is required, not cosmetic: on a prod host the checkout is
# owned by the service account while doctor runs as root, so git refuses it with
# "detected dubious ownership" — which read as "not a git checkout" and warned on
# a host whose in-app Update works fine. Same rule as everywhere else here:
# "I can't look" must not be reported as "it isn't there".
vt_git() { git -c safe.directory="$ROOT" -C "$ROOT" "$@"; }
if vt_git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    vt_git remote get-url origin >/dev/null 2>&1 && ok "repo is a full git clone with an 'origin' remote (in-app Update works)" \
        || adv "repo has no 'origin' remote — the in-app Update can't fetch (was this a tarball, not a clone?)"
else adv "$ROOT is not a git checkout — the in-app Update needs a full clone"; fi

# ---------------------------------------------------------------------------
printf '\n%s────────────────────────────────────────%s\n' "$(c b)" "$(c 0)"
printf 'doctor: %s%d pass%s, %s%d warn%s, %s%d fail%s\n' \
    "$(c g)" "$pass" "$(c 0)" "$(c y)" "$warn" "$(c 0)" "$(c r)" "$fail" "$(c 0)"
[ "$fail" -eq 0 ]
