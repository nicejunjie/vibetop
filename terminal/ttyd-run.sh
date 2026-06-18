#!/usr/bin/env bash
# Launches ttyd for instance $1 (1..N), bound to loopback. nginx proxies
# /tN/ -> http://127.0.0.1:$((7680+N))/tN/. Each instance attaches to
# the claude-session daemon for that instance.

N="${1:?instance number required}"
PORT=$((7680 + N))
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
