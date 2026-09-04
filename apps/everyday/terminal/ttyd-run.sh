#!/usr/bin/env bash
# Launches ttyd for instance $1 (1..N), bound to loopback. nginx proxies
# /tN/ -> http://127.0.0.1:$((BASE_PORT+N))/tN/. Each instance attaches to
# the vibetop-session daemon for that instance.
#
# BASE_PORT must match the installer's port base (it generates the nginx port
# map from BASE_PORT). The ttyd systemd unit passes it via Environment; the
# 7680 fallback is the install.sh default, so a default deploy still works.

# Args (multi-user Phase 3):
#   $1  session instance id  — passed to `vibetop-session attach` (e.g. "alice-3"
#                              per-user, or a bare "3" in the single-user fallback)
#   $2  ttyd bind port       — optional; defaults to BASE_PORT+N for the legacy
#                              numeric single-user path
#   $3  base number N        — optional; the /tN/ the browser reaches (base path +
#                              title). Defaults to $1 when $1 is numeric.
INST="${1:?instance id required}"
BASE_N="${3:-$INST}"
case "$BASE_N" in ''|*[!0-9]*) echo "base number must be numeric" >&2; exit 2 ;; esac
PORT="${2:-$(( ${BASE_PORT:-7680} + BASE_N ))}"
case "$PORT" in ''|*[!0-9]*) echo "port must be numeric" >&2; exit 2 ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve ttyd rather than hardcoding /usr/bin/ttyd: where a distro has no ttyd
# package (Debian, RPM distros) the installer drops the upstream binary in
# /usr/local/bin, and a hardcoded path fails with a bare status 127 —
# "/usr/bin/ttyd: No such file or directory" — which surfaces only as a terminal
# that never serves. $TTYD_BIN lets the unit override explicitly.
TTYD="${TTYD_BIN:-}"
if [ -z "$TTYD" ]; then
    for c in /usr/local/bin/ttyd /usr/bin/ttyd /bin/ttyd; do
        [ -x "$c" ] && { TTYD="$c"; break; }
    done
fi
[ -n "$TTYD" ] || TTYD="$(command -v ttyd 2>/dev/null)"
if [ -z "$TTYD" ]; then
    echo "ttyd not found (looked in /usr/local/bin, /usr/bin, \$PATH)" >&2
    exit 127
fi

exec "$TTYD" \
  -W \
  -i 127.0.0.1 \
  -p "$PORT" \
  -b "/t${BASE_N}" \
  -t reconnect=3 \
  -t "titleFixed=Terminal ${BASE_N}" \
  -t scrollback=50000 \
  -t disableLeaveAlert=true \
  "${SCRIPT_DIR}/vibetop-session" attach "${INST}"
