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
smoke_out="$( "$SRC/tools/smoke-test.sh" --no-office 2>&1 )"; smoke_rc=$?
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

echo "MATRIX_RESULT $([ "$fails" -eq 0 ] && echo PASS || echo FAIL)"
[ "$fails" -eq 0 ]
