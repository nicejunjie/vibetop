#!/usr/bin/env bash
# Optional Browser Lite runtime; regular updates never download dependencies.
set -euo pipefail
DIR="$(dirname "$(readlink -f "$0")")"
REPO="$DIR"
while [ ! -f "$REPO/VERSION" ] && [ "$REPO" != / ]; do REPO="$(dirname "$REPO")"; done
BASE="${VIBETOP_BROWSER_LITE_DIR:-/opt/vibetop/browser-lite}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
PREFLIGHT_USER="${PREFLIGHT_USER:-${SUDO_USER:-}}"
for argument in "$@"; do
  case "$argument" in
    --dry-run|-n) DRY_RUN=1 ;;
    --help|-h) echo 'INSTALL_DEPS=1 PREFLIGHT_USER=<user> sudo -E ./install.sh; normal updates use INSTALL_DEPS=0'; exit 0 ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done
if [ "${DRY_RUN:-0}" = 1 ]; then
  echo "Browser Lite: copy optional worker to $BASE/backend (INSTALL_DEPS=$INSTALL_DEPS)"
  exit 0
fi
if [ "$INSTALL_DEPS" != 1 ] && [ ! -f "$BASE/manifest.json" ]; then
  echo "Browser Lite optional runtime is not installed; existing apps continue. Run sudo INSTALL_DEPS=1 PREFLIGHT_USER=<user> $DIR/install.sh"
  exit 0
fi
if [ "$(id -u)" != 0 ]; then
  echo "Browser Lite runtime requires root to maintain shared read-only browser files." >&2
  exit 1
fi
install -d -m755 "$BASE" "$BASE/backend"
if [ "$INSTALL_DEPS" = 1 ]; then
  python3 -m venv "$BASE/venv"
  "$BASE/venv/bin/python" -m pip install -r "$DIR/requirements.txt"
  PLAYWRIGHT_BROWSERS_PATH="$BASE/browsers" "$BASE/venv/bin/python" -m playwright install chromium --no-shell --no-progress
  # Only these root-owned executables may create the browser's user namespace.
  if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
    abi=4.0
    [ ! -f /etc/apparmor.d/abi/5.0 ] || abi=5.0
    cat > /etc/apparmor.d/vibetop-browser-lite <<PROFILE
abi <abi/$abi>,
include <tunables/global>
profile vibetop-browser-lite $BASE/browsers/**/chrome flags=(unconfined) {
  userns,
}
PROFILE
    apparmor_parser -r /etc/apparmor.d/vibetop-browser-lite
  fi
fi
install -m644 "$DIR/backend/"*.py "$DIR/backend/collector.js" "$BASE/backend/"
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != Disabled ]; then
  # Reuse distribution integration, including Playwright's bundled Node driver.
  source "$REPO/tools/lib/osdeps.sh"
  vt_selinux_label_helpers "$BASE/backend"
  for binary_dir in "$BASE/venv/bin" "$BASE/venv/lib/python"*/site-packages/playwright/driver "$BASE/browsers/chromium-"*/chrome-linux64; do
    [ ! -d "$binary_dir" ] || vt_selinux_label_helpers "$binary_dir"
  done
fi
if [ "$INSTALL_DEPS" = 1 ]; then
  [ -n "$PREFLIGHT_USER" ] && [ "$PREFLIGHT_USER" != root ] || {
    echo "Set PREFLIGHT_USER to a real nonroot Vibetop user for sandbox verification." >&2; exit 1; }
  systemd-run --wait --pipe --collect --uid="$PREFLIGHT_USER" \
    --gid="$(id -g "$PREFLIGHT_USER")" --property=MemoryMax=2G --property=CPUQuota=200% \
    --property=TasksMax=256 --property="WorkingDirectory=$(getent passwd "$PREFLIGHT_USER" | cut -d: -f6)" \
    --setenv="HOME=$(getent passwd "$PREFLIGHT_USER" | cut -d: -f6)" \
    --setenv="PLAYWRIGHT_BROWSERS_PATH=$BASE/browsers" \
    "$BASE/venv/bin/python" "$BASE/backend/preflight.py"
  "$BASE/venv/bin/python" - "$BASE" <<'PY'
import json,sys,importlib.metadata
from pathlib import Path
base=Path(sys.argv[1])
(base/'manifest.json').write_text(json.dumps({'playwright':importlib.metadata.version('playwright'),'sandbox_preflight':True}))
PY
fi
required="$(cut -d= -f3 "$DIR/requirements.txt")"
actual="$("$BASE/venv/bin/python" -c 'import importlib.metadata;print(importlib.metadata.version("playwright"))')"
if [ "$required" != "$actual" ]; then
  echo "Browser Lite needs manual runtime upgrade; its pinned dependency does not match." >&2; exit 1
fi
# Updating just worker code may terminate only Lite units, never xpra/terminals.
if [ "${RESTART_LITE:-0}" = 1 ]; then systemctl stop 'vibetop-browserlite-*.service' || true; fi
echo "Browser Lite runtime ready (Playwright $actual); profiles remain private to each user."
