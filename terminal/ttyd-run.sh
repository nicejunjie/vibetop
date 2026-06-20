#!/usr/bin/env bash
# Launches ttyd for instance $1 (1..N), bound to loopback. nginx proxies
# /tN/ -> http://127.0.0.1:$((BASE_PORT+N))/tN/. Each instance attaches to
# the claude-session daemon for that instance.
#
# BASE_PORT must match the installer's port base (it generates the nginx port
# map from BASE_PORT). The ttyd systemd unit passes it via Environment; the
# 7680 fallback is the install.sh default, so a default deploy still works.

N="${1:?instance number required}"
case "$N" in ''|*[!0-9]*) echo "instance must be a number" >&2; exit 2 ;; esac
PORT=$(( ${BASE_PORT:-7680} + N ))
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec /usr/bin/ttyd \
  -W \
  -i 127.0.0.1 \
  -p "$PORT" \
  -b "/t${N}" \
  -t reconnect=3 \
  -t "titleFixed=Terminal ${N}" \
  -t scrollback=50000 \
  -t disableLeaveAlert=true \
  "${SCRIPT_DIR}/claude-session" attach "${N}"
