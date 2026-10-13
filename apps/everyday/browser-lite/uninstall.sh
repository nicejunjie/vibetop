#!/usr/bin/env bash
set -euo pipefail
DIR="$(dirname "$(readlink -f "$0")")"
exec python3 "$DIR/install-proxy.py" --uninstall "$@"
