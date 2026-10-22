#!/usr/bin/env bash
# Optional rewrite runtime. An ordinary update skips an absent installation.
set -euo pipefail
DIR="$(dirname "$(readlink -f "$0")")"
exec python3 "$DIR/install-proxy.py" "$@"
