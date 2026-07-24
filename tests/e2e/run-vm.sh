#!/usr/bin/env bash
# Run the e2e suite against a disposable vibetop instance in a real KVM VM (libvirt)
# — the HOST-SAFE environment. A VM has its own kernel; it cannot hang or panic the
# host. Preferred over run.sh (which uses a privileged container that can).
#
#   1. vagrant up   → boots Ubuntu 24.04 + deploys the stack (provision.sh)
#   2. mint a vt_session cookie INSIDE the VM
#   3. Playwright against 127.0.0.1:8091 (the VM's forwarded port 80)
#   4. vagrant destroy   (unless --keep)
#
# Usage: tests/e2e/run-vm.sh [--keep] [--up-only] [-- <playwright args>]
# Requires: libvirt/KVM + vagrant + vagrant-libvirt (all present on z20), and the
# invoking user in the `libvirt` group (junjie is) — no sudo needed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VMDIR="$HERE/vm"
PORT=8091
E2E_USER="${E2E_USER:-e2e}"
KEEP=0; UP_ONLY=0; PW_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --up-only) UP_ONLY=1 ;;
    --) shift; PW_ARGS=("$@"); break ;;
    *) PW_ARGS+=("$1") ;;
  esac; shift
done

cleanup() { [ "$KEEP" = 1 ] || ( cd "$VMDIR" && vagrant destroy -f >/dev/null 2>&1 || true ); }
trap cleanup EXIT

echo "== boot the disposable VM + deploy (first run downloads the box; ~5-10 min) =="
( cd "$VMDIR" && vagrant up --provider=libvirt )
[ "$UP_ONLY" = 1 ] && { KEEP=1; echo "VM up; --up-only, not running tests"; exit 0; }

# Reach the VM directly on its libvirt IP (the host is on the same libvirt bridge)
# — more reliable than vagrant-libvirt port forwarding.
VMIP="$( cd "$VMDIR" && vagrant ssh -c "hostname -I | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | tail -1 )"
[ -n "$VMIP" ] || { echo "!! could not determine VM IP"; exit 1; }
BASE_URL="http://$VMIP"
echo "   VM IP: $VMIP  (base URL: $BASE_URL)"

echo "== wait until the VM serves =="
deadline=$(( $(date +%s) + 180 ))
until curl -fsS "$BASE_URL/login.html" >/dev/null 2>&1; do
  [ "$(date +%s)" -gt "$deadline" ] && { echo "!! VM not serving; provision log:"; ( cd "$VMDIR" && vagrant ssh -c 'sudo journalctl -n 40 --no-pager' 2>/dev/null ) || true; exit 1; }
  sleep 3
done
echo "   serving."

echo "== mint vt_session cookies inside the VM (user + a 2nd user for isolation tests) =="
TOKEN="$( cd "$VMDIR" && vagrant ssh -c "sudo python3 /home/$E2E_USER/vibetop/tools/mint-session-cookie.py $E2E_USER --value-only" 2>/dev/null | tr -d '\r' | tail -1 )"
[ -n "$TOKEN" ] || { echo "!! failed to mint cookie"; exit 1; }
TOKEN2="$( cd "$VMDIR" && vagrant ssh -c "sudo python3 /home/$E2E_USER/vibetop/tools/mint-session-cookie.py e2e2 --value-only" 2>/dev/null | tr -d '\r' | tail -1 )"

echo "== install Playwright browsers (first run only) =="
cd "$HERE"
[ -d node_modules ] || npm install
npx playwright install chromium firefox webkit >/dev/null 2>&1 || npx playwright install chromium firefox webkit

echo "== run the suite =="
VIBETOP_BASE_URL="$BASE_URL" \
VIBETOP_E2E_COOKIE="$TOKEN" \
VIBETOP_E2E_USER="$E2E_USER" \
VIBETOP_E2E_COOKIE2="$TOKEN2" \
VIBETOP_E2E_USER2="e2e2" \
  npx playwright test "${PW_ARGS[@]}"
