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
#   ./tools/smoke-test.sh                 # probe 127.0.0.1 on this host
#   ./tools/smoke-test.sh --no-office     # skip OnlyOffice checks
#   ./tools/smoke-test.sh --base http://192.168.1.10   # probe a remote origin
#
# Exit status: 0 = all checks passed, 1 = one or more failed.
set -uo pipefail

BASE="http://127.0.0.1"
CHECK_OFFICE=1

while [ $# -gt 0 ]; do
    case "$1" in
        --no-office) CHECK_OFFICE=0 ;;
        --base) BASE="${2:-}"; shift ;;
        --base=*) BASE="${1#--base=}" ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done
BASE="${BASE%/}"

pass=0
fail=0
green() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass + 1)); }
red()   { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }

# http_is <name> <path> <expected-code>
http_is() {
    local name="$1" path="$2" want="$3" got
    got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$BASE$path" 2>/dev/null || echo 000)"
    if [ "$got" = "$want" ]; then green "$name ($path -> $got)"; else red "$name ($path -> $got, want $want)"; fi
}

# body_has <name> <path> <extended-regex>
body_has() {
    local name="$1" path="$2" needle="$3" body
    body="$(curl -s --max-time 8 "$BASE$path" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -Eq -- "$needle"; then green "$name"; else red "$name (missing /$needle/)"; fi
}

# unit_active <unit>
unit_active() {
    local u="$1" state
    if ! command -v systemctl >/dev/null 2>&1; then red "$u (no systemctl)"; return; fi
    state="$(systemctl is-active "$u" 2>/dev/null || true)"
    if [ "$state" = "active" ]; then green "$u active"; else red "$u is '$state'"; fi
}

echo "vibetop smoke test @ $BASE"
echo "── systemd units ─────────────────────────────"
unit_active vibetop-manager.service
unit_active vibetop-browser-xpra.service
unit_active vibetop-x11-xpra.service
unit_active vibetop-filebrowser.service

echo "── HTTP endpoints ────────────────────────────"
http_is "desktop shell" "/" 200
http_is "terminal t1"   "/t1/" 200
http_is "browser xpra"  "/browser/" 200
http_is "x11 display"   "/x11-display/" 200
http_is "file manager"  "/files/" 200

echo "── manager API ───────────────────────────────"
body_has "/api/ping is ok"         "/api/ping" '"ok": *true'
body_has "/api/events emits retry" "/api/events" 'retry:'
body_has "/api/system/status"      "/api/system/status" 'cpu|error'
body_has "/api/terminals/status"   "/api/terminals/status" 'running'

if [ "$CHECK_OFFICE" = 1 ]; then
    echo "── OnlyOffice (Office Edit) ──────────────────"
    if command -v docker >/dev/null 2>&1 && docker ps --filter name=vibetop-onlyoffice --format '{{.Names}}' 2>/dev/null | grep -q vibetop-onlyoffice; then
        green "OnlyOffice container running"
    else
        red "OnlyOffice container not running (use --no-office to skip)"
    fi
    body_has "/onlyoffice/healthcheck" "/onlyoffice/healthcheck" 'true'
fi

echo "──────────────────────────────────────────────"
echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
