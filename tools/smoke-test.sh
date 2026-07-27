#!/usr/bin/env bash
#
# smoke-test.sh — post-deploy live-host regression gate for vibetop.
#
# This is the ONE tier that needs the running stack (systemd + nginx + xpra +
# FileBrowser + optionally the OnlyOffice container). It formalizes the "Health
# check" section of CLAUDE.md into asserting checks with a pass/fail summary and
# a non-zero exit on any failure — so a deploy can be gated on it.
#
# It is a DEV/OPS tool only: no installer runs it, and it deploys nothing. Run it
# by hand on the host after ./deploy.sh or an in-app Update:
#
#   sudo ./tools/smoke-test.sh                 # probe 127.0.0.1 on this host
#   sudo ./tools/smoke-test.sh --no-office     # skip OnlyOffice checks
#   ./tools/smoke-test.sh --base http://192.168.1.10 --cookie 'vt_session=…'
#
# AUTH: a multi-user host gates every surface behind `auth_request`, so an
# unauthenticated probe gets 302/401 and EVERY check would fail on a perfectly
# healthy host. So the script mints a real `vt_session` cookie via
# tools/mint-session-cookie.py (needs root — it reads /etc/vibetop/session.secret)
# and sends it on every request. Pass --cookie to supply one yourself (required
# for a remote --base, whose secret this host can't read), or --user to mint as
# somebody other than the auto-detected admin. On a host with no auth gate (a
# legacy single-user install) it probes unauthenticated, as before.
#
# SIDE EFFECT: per-user services start ON DEMAND, so probing /tN/, /browser/,
# /x11-display/ and /files/ as the probe user will cold-start that user's
# terminal / Browser / X11 / FileBrowser if they aren't already up. That IS the
# surface being verified (it's what a real visit does), but it means the script
# is not read-only on a live host.
#
# Exit status: 0 = all checks passed, 1 = one or more failed, 2 = inconclusive
# (the auth gate is on but no cookie could be obtained, so the core surface/API
# checks never ran — never report that as a pass to an automated caller).
# Skipped shared units (a multi-user host runs per-user ones) do not fail the run.
set -uo pipefail

BASE="http://127.0.0.1"
CHECK_OFFICE=1
CHECK_BROWSER=-1        # -1 = auto-detect from the installed nginx snippet
COOKIE=""
PROBE_USER=""
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"

while [ $# -gt 0 ]; do
    case "$1" in
        --no-office) CHECK_OFFICE=0 ;;
        --no-browser) CHECK_BROWSER=0 ;;
        --base) BASE="${2:-}"; shift ;;
        --base=*) BASE="${1#--base=}" ;;
        --cookie) COOKIE="${2:-}"; shift ;;
        --cookie=*) COOKIE="${1#--cookie=}" ;;
        --user) PROBE_USER="${2:-}"; shift ;;
        --user=*) PROBE_USER="${1#--user=}" ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done
BASE="${BASE%/}"

pass=0
fail=0
skip=0
green() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass + 1)); }
red()   { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }
grey()  { printf '  \033[33mSKIP\033[0m  %s\n' "$1"; skip=$((skip + 1)); }
note()  { printf '        %s\n' "$1"; }

# curl with the session cookie when we have one.
fetch() {
    if [ -n "$COOKIE" ]; then
        curl -s --max-time 8 -H "Cookie: $COOKIE" "$@"
    else
        curl -s --max-time 8 "$@"
    fi
}

# ---- auth gate detection + cookie ------------------------------------------
# An unauthenticated GET / on a multi-user build redirects (302) or 401s; a
# legacy no-auth install answers 200. This is the cheapest reliable signal for
# "does this host gate its surfaces", and it decides both whether we need a
# cookie and whether the shared legacy units are expected to be running.
root_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$BASE/" 2>/dev/null || echo 000)"
AUTH_GATE=0
case "$root_code" in 301|302|303|307|308|401|403) AUTH_GATE=1 ;; esac

# Was the Browser stack deployed? Its nginx snippet is the authoritative local
# signal; for a remote --base we can't look, so assume yes unless --no-browser.
if [ "$CHECK_BROWSER" = -1 ]; then
    if [ -d /etc/nginx/snippets/vibetop-extras.d ]; then
        CHECK_BROWSER=0
        [ -f /etc/nginx/snippets/vibetop-extras.d/browser.conf ] && CHECK_BROWSER=1
    else
        CHECK_BROWSER=1
    fi
fi

detect_probe_user() {
    local u=""
    if [ -r /etc/vibetop/manager.env ]; then
        u="$(sed -n 's/^[[:space:]]*VIBETOP_ADMINS=//p' /etc/vibetop/manager.env \
             | tr -d '"'"'"' ' | cut -d, -f1 | head -1)"
    fi
    [ -n "$u" ] || u="$(stat -c %U "$REPO/terminal/terminal-manager.py" 2>/dev/null || true)"
    [ -n "$u" ] || u="${SUDO_USER:-}"
    printf '%s' "$u"
}

if [ "$AUTH_GATE" = 1 ] && [ -z "$COOKIE" ]; then
    [ -n "$PROBE_USER" ] || PROBE_USER="$(detect_probe_user)"
    minter="$REPO/tools/mint-session-cookie.py"
    if [ -n "$PROBE_USER" ] && [ -r "$minter" ]; then
        COOKIE="$(python3 "$minter" "$PROBE_USER" 2>/dev/null | tail -1)"
        case "$COOKIE" in vt_session=*) ;; *) COOKIE="" ;; esac
    fi
fi

# ALWAYS validate the cookie against the server before trusting it — a
# shape check is not enough. The manager's _session_secret() falls back to an
# ephemeral in-memory key when it can't read the root-owned 0600 secret, so a
# NON-ROOT mint returns a perfectly well-formed, correctly-prefixed token signed
# with the wrong key. Believing it turned every surface check into a red FAIL
# that looked like a broken host. /api/authcheck is the cheap arbiter (200 for a
# valid session, 401 otherwise) and has no side effects.
COOKIE_USER_NOTE=""
if [ -n "$COOKIE" ]; then
    ac="$(fetch -o /dev/null -w '%{http_code}' "$BASE/api/authcheck" 2>/dev/null || echo 000)"
    if [ "$ac" != "200" ]; then
        COOKIE_USER_NOTE="session cookie rejected by the server (/api/authcheck -> $ac)"
        COOKIE=""
    fi
fi

# http_is <name> <path> <expected-code>
http_is() {
    local name="$1" path="$2" want="$3" got
    got="$(fetch -o /dev/null -w '%{http_code}' "$BASE$path" 2>/dev/null || echo 000)"
    if [ "$got" = "$want" ]; then green "$name ($path -> $got)"; else red "$name ($path -> $got, want $want)"; fi
}

# body_has <name> <path> <extended-regex>
body_has() {
    local name="$1" path="$2" needle="$3" body
    body="$(fetch "$BASE$path" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -Eq -- "$needle"; then green "$name"; else red "$name (missing /$needle/)"; fi
}

# unit_active <unit>
unit_active() {
    local u="$1" state
    if ! command -v systemctl >/dev/null 2>&1; then red "$u (no systemctl)"; return; fi
    state="$(systemctl is-active "$u" 2>/dev/null || true)"
    if [ "$state" = "active" ]; then green "$u active"; else red "$u is '$state'"; fi
}

# shared_unit <unit> <per-user-glob> <label>
# The shared xpra/FileBrowser units are the LEGACY single-user services. A
# multi-user host runs one transient unit PER USER instead (started on demand),
# so an inactive shared unit there is correct, not a defect — and with nobody
# signed in, zero per-user units is also correct. The real per-user health check
# is the authenticated HTTP probe below, which cold-starts and then serves.
shared_unit() {
    local u="$1" glob="$2" label="$3" state n
    if ! command -v systemctl >/dev/null 2>&1; then red "$u (no systemctl)"; return; fi
    state="$(systemctl is-active "$u" 2>/dev/null || true)"
    if [ "$state" = "active" ]; then green "$u active"; return; fi
    if [ "$AUTH_GATE" = 1 ]; then
        n="$(systemctl list-units --type=service --state=running --no-legend "$glob" 2>/dev/null | wc -l)"
        grey "$u inactive — multi-user host uses per-user $label ($n running)"
    else
        red "$u is '$state'"
    fi
}

echo "vibetop smoke test @ $BASE"
if [ "$AUTH_GATE" = 1 ]; then
    if [ -n "$COOKIE" ]; then
        note "auth gate on; probing as '${PROBE_USER:-supplied cookie}'"
    else
        [ -z "$COOKIE_USER_NOTE" ] || note "$COOKIE_USER_NOTE"
        note "auth gate on but NO valid session cookie — authenticated checks will be skipped."
        note "run with sudo (only root can read the signing secret) or pass --cookie 'vt_session=…'"
    fi
fi

echo "── systemd units ─────────────────────────────"
unit_active vibetop-manager.service
shared_unit vibetop-browser-xpra.service 'vibetop-ubrowser-*' "Browser displays"
shared_unit vibetop-x11-xpra.service     'vibetop-ux11-*'     "X11 displays"
shared_unit vibetop-filebrowser.service  'vibetop-ufiles-*'   "file managers"

echo "── HTTP endpoints ────────────────────────────"
if [ "$AUTH_GATE" = 1 ] && [ -z "$COOKIE" ]; then
    grey "surfaces (no session cookie — see the note above)"
else
    http_is "desktop shell" "/" 200
    http_is "terminal t1"   "/t1/" 200
    # A lean deploy (--no-browser) never installs the xpra snippet, so /browser/
    # and /x11-display/ 404 by design. Assert them only when the stack is
    # actually deployed; otherwise this reports a red failure for a correct host.
    if [ "$CHECK_BROWSER" = 0 ]; then
        grey "browser xpra + x11 display (browser stack not deployed)"
    else
        http_is "browser xpra"  "/browser/" 200
        http_is "x11 display"   "/x11-display/" 200
    fi
    http_is "file manager"  "/files/" 200
fi

echo "── manager API ───────────────────────────────"
body_has "/api/ping is ok" "/api/ping" '"ok": *true'    # public: the watchdog probe
if [ "$AUTH_GATE" = 1 ] && [ -z "$COOKIE" ]; then
    grey "manager API (no session cookie — see the note above)"
else
    body_has "/api/events emits retry" "/api/events" 'retry:'
    body_has "/api/system/status"      "/api/system/status" 'cpu|error'
    body_has "/api/terminals/status"   "/api/terminals/status" 'running'
fi

if [ "$CHECK_OFFICE" = 1 ]; then
    echo "── OnlyOffice (Office Edit) ──────────────────"
    if command -v docker >/dev/null 2>&1 && docker ps --filter name=vibetop-onlyoffice --format '{{.Names}}' 2>/dev/null | grep -q vibetop-onlyoffice; then
        green "OnlyOffice container running"
    else
        red "OnlyOffice container not running (use --no-office to skip)"
    fi
    # The container check is local (docker, no HTTP); the healthcheck endpoint is
    # proxied through nginx and therefore behind the same auth gate.
    if [ "$AUTH_GATE" = 1 ] && [ -z "$COOKIE" ]; then
        grey "/onlyoffice/healthcheck (no session cookie — see the note above)"
    else
        body_has "/onlyoffice/healthcheck" "/onlyoffice/healthcheck" 'true'
    fi
fi

echo "──────────────────────────────────────────────"
if [ "$skip" -gt 0 ]; then
    echo "smoke: $pass passed, $fail failed, $skip skipped"
else
    echo "smoke: $pass passed, $fail failed"
fi
[ "$fail" -eq 0 ] || exit 1
# The core checks never ran — that is INCONCLUSIVE, not a pass. Exit 2 so a
# caller gating a deploy can't mistake "couldn't test" for "tested and fine".
if [ "$AUTH_GATE" = 1 ] && [ -z "$COOKIE" ]; then
    echo "smoke: INCONCLUSIVE — surface/API checks were skipped (no session cookie)"
    exit 2
fi
exit 0
