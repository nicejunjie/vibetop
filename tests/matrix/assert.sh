#!/usr/bin/env bash
# Assertions for one matrix VM. Runs INSIDE the guest as root.
#
# Emits machine-readable lines the host-side runner greps out:
#     MATRIX_CHECK <name> <PASS|FAIL|SKIP> <detail…>
#     MATRIX_RESULT <PASS|FAIL>
# Everything else on stdout is human context for the per-distro log.
#
# The checks are ordered by what they prove:
#   1. deploy   — the installer completed as root, with no username
#   2. layout   — code/web root landed in the system tree, not a home
#   3. serving  — nginx + manager are actually up (via tools/smoke-test.sh)
#   4. login    — PAM auth works, which is the most distro-sensitive surface
#                 (the stack names differ: Debian common-auth vs RHEL system-auth)
#   5. isolation— a non-admin is refused the operator-only surfaces
set -uo pipefail

SRC=/opt/vibetop-src
fails=0
check() {   # check <name> <status> <detail...>
    local name="$1" status="$2"; shift 2
    echo "MATRIX_CHECK $name $status $*"
    [ "$status" = FAIL ] && fails=$((fails + 1))
    return 0
}

# 1. deploy ------------------------------------------------------------------
if [ "${DEPLOY_RC:-1}" = "0" ]; then
    check deploy PASS "deploy.sh exited 0 as root"
else
    check deploy FAIL "deploy.sh exited ${DEPLOY_RC:-?}"
fi

# 2. layout ------------------------------------------------------------------
layout_ok=1
for p in /opt/vibetop/app /opt/vibetop/vibetop-www; do
    [ -d "$p" ] || { layout_ok=0; echo "  missing $p"; }
done
[ -s /opt/vibetop/vibetop-www/index.html ] || { layout_ok=0; echo "  no index.html in the web root"; }
if [ "$layout_ok" = 1 ]; then
    check layout PASS "/opt/vibetop/{app,vibetop-www} populated"
else
    check layout FAIL "system tree incomplete (see above)"
fi

# The whole point: nothing was installed into a human's home.
if ls -d /home/*/vibetop-www >/dev/null 2>&1; then
    check no-home-install FAIL "found a web root under /home"
else
    check no-home-install PASS "nothing installed into a user home"
fi

# 3. serving -----------------------------------------------------------------
SMOKE_ARGS=(--no-office)
[ "${VT_FULL:-0}" = "1" ] && SMOKE_ARGS=()   # full run asserts Office too
smoke_out="$( "$SRC/tools/smoke-test.sh" "${SMOKE_ARGS[@]}" 2>&1 )"; smoke_rc=$?
echo "$smoke_out" | sed 's/^/  smoke| /'
case "$smoke_rc" in
    0) check serving PASS "$(echo "$smoke_out" | tail -1)" ;;
    2) check serving FAIL "INCONCLUSIVE — could not mint a session cookie" ;;
    *) check serving FAIL "$(echo "$smoke_out" | tail -1)" ;;
esac

# 4. login (PAM) -------------------------------------------------------------
login_cookie() {   # login_cookie <user> <pass> -> prints the vt_session cookie
    curl -s -D- -o /dev/null -H 'Content-Type: application/json' \
        -d "{\"username\":\"$1\",\"password\":\"$2\"}" http://127.0.0.1/api/login \
        | grep -i '^set-cookie' | sed 's/.*\(vt_session=[^;]*\).*/\1/' | tr -d '\r'
}
CK1="$(login_cookie "${VT_U1:-}" "${VT_P1:-}")"
CK2="$(login_cookie "${VT_U2:-}" "${VT_P2:-}")"
who() { curl -s -D- -o /dev/null -H "Cookie: $1" http://127.0.0.1/api/authcheck \
        | grep -i 'x-vibetop-user' | tr -d '\r' | awk '{print $2}'; }

if [ -n "$CK1" ] && [ "$(who "$CK1")" = "${VT_U1:-}" ]; then
    check pam-login PASS "$VT_U1 authenticated via PAM"
else
    check pam-login FAIL "PAM login failed for ${VT_U1:-?} (Debian common-auth vs RHEL system-auth?)"
fi

bad="$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
       -d "{\"username\":\"${VT_U1:-x}\",\"password\":\"definitely-wrong\"}" \
       http://127.0.0.1/api/login)"
if [ "$bad" = 401 ]; then
    check pam-reject PASS "wrong password -> 401"
else
    check pam-reject FAIL "wrong password -> $bad (want 401)"
fi

# 5. isolation ---------------------------------------------------------------
if [ -n "$CK2" ]; then
    upd="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $CK2" \
           -H 'Content-Type: application/json' -d '{}' http://127.0.0.1/api/update)"
    cfg="$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $CK2" \
           http://127.0.0.1/api/config/sessions)"
    if [ "$upd" = 403 ] && [ "$cfg" = 403 ]; then
        check authz PASS "non-admin refused Update ($upd) and Config ($cfg)"
    else
        check authz FAIL "non-admin got Update=$upd Config=$cfg (want 403/403)"
    fi
else
    check authz SKIP "second user could not log in"
fi

# 6. full stack (only when deployed) -----------------------------------------
# The lean rows deliberately skip these; a FULL run must actually prove them, or
# "matrix green" means less than it appears. Authenticated, because every one of
# these surfaces is behind the auth gate.
if [ "${VT_FULL:-0}" = "1" ]; then
    code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Cookie: $CK1" "http://127.0.0.1$1"; }
    for probe in "/browser/:Browser (xpra+Chromium)" "/x11-display/:X11 display"; do
        p="${probe%%:*}"; label="${probe#*:}"
        c="$(code "$p")"
        if [ "$c" = 200 ]; then check "full${p//\//-}" PASS "$label -> 200"
        else check "full${p//\//-}" FAIL "$label ($p) -> $c, want 200"; fi
    done
    # /browser/ returning 200 is NOT proof the Browser works: xpra's HTML5 server
    # answers whether or not its child app started. On RPM, browser-loop.sh was
    # spinning on a missing /snap/bin/chromium forever and this row was still
    # "green" while the Browser app was a blank desktop. So assert the actual
    # Chromium process, with the profile the manager expects.
    if pgrep -af 'chromium.*--user-data-dir' >/dev/null 2>&1; then
        _cprof="$(pgrep -af 'chromium.*--user-data-dir' | head -1 | grep -o '\-\-user-data-dir=[^ ]*' | head -1)"
        check full-chromium PASS "chromium running (${_cprof:-profile?})"
    else
        check full-chromium FAIL "no chromium process — browser-loop failed to launch it (xpra serves 200 regardless)"
    fi

    # xpra VERSION, not just "a display serves". 6.5.x carries the Browser
    # click-offset regression this project pins away from — and the pin failed
    # SILENTLY once already (an epoch-blind grep), installing the bad version
    # while every other check stayed green. Assert the version itself.
    _xv="$( (rpm -q --qf '%{VERSION}' xpra 2>/dev/null \
             || dpkg-query -W -f='${Version}' xpra 2>/dev/null) | head -1 )"
    case "${_xv:-unknown}" in
        6.5*) check xpra-version FAIL "xpra $_xv — the click-offset regression line; the 6.4 pin did not take" ;;
        6.*)  check xpra-version PASS "xpra $_xv" ;;
        *)    check xpra-version SKIP "could not determine the xpra version (${_xv:-none})" ;;
    esac

    # OnlyOffice: the container must be running AND answering through nginx.
    # docker on Debian, podman on RPM — check whichever exists.
    _oci="$(command -v docker || command -v podman || true)"
    if [ -n "$_oci" ] && "$_oci" ps --filter name=vibetop-onlyoffice --format '{{.Names}}' 2>/dev/null | grep -q vibetop-onlyoffice; then
        hc="$(curl -s --max-time 30 -H "Cookie: $CK1" http://127.0.0.1/onlyoffice/healthcheck || true)"
        if printf '%s' "$hc" | grep -q true; then check full-office PASS "OnlyOffice healthcheck true"
        else check full-office FAIL "OnlyOffice container up but healthcheck said '${hc:-<empty>}'"; fi
    else
        check full-office FAIL "vibetop-onlyoffice container is not running"
    fi
    # A real GUI app on the X11 display proves the launcher path end to end.
    # Shape is {"windows": [...]} (terminal-manager.py `self._json(200, {"windows": wins})`),
    # NOT a bare array — an empty list is a healthy answer on a fresh desktop.
    xw="$(curl -s --max-time 15 -H "Cookie: $CK1" http://127.0.0.1/api/x/windows || true)"
    if printf '%s' "$xw" | grep -q '"windows"'; then check full-x11-api PASS "/api/x/windows -> ${xw:0:40}"
    else check full-x11-api FAIL "/api/x/windows -> '${xw:0:60}'"; fi
fi

echo "MATRIX_RESULT $([ "$fails" -eq 0 ] && echo PASS || echo FAIL)"
[ "$fails" -eq 0 ]
