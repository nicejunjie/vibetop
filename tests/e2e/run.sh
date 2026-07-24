#!/usr/bin/env bash
# One command to run the e2e suite against a disposable vibetop instance:
#   1. build a systemd container and deploy the real stack (deploy.sh) inside it
#   2. wait until it serves
#   3. mint a vt_session cookie inside the container (docker exec)
#   4. run Playwright against http://localhost:$PORT
#   5. tear the container down (unless --keep)
#
# Usage: tests/e2e/run.sh [--keep] [--build-only] [-- <playwright args>]
# Env:   PORT (default 8080), E2E_USER (default e2e), IMAGE/CONTAINER names.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
IMAGE="${IMAGE:-vibetop-e2e}"
CONTAINER="${CONTAINER:-vibetop-e2e}"
PORT="${PORT:-8080}"
E2E_USER="${E2E_USER:-e2e}"
KEEP=0; BUILD_ONLY=0; PW_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --) shift; PW_ARGS=("$@"); break ;;
    *) PW_ARGS+=("$1") ;;
  esac; shift
done

cleanup() { [ "$KEEP" = 1 ] || docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ============================ SAFETY GUARD ============================
# This env runs systemd as PID 1 in a PRIVILEGED container. Do NOT run it on a
# workstation you care about: a privileged systemd container can destabilize the
# HOST's systemd/cgroup tree and hang/crash the machine (it did — once). Run this
# ONLY on a throwaway host / VM / CI runner dedicated to e2e. Refuse to run on a
# box that has a real vibetop install unless the operator explicitly overrides.
if systemctl is-active --quiet vibetop-manager.service 2>/dev/null; then
  if [ "${VIBETOP_E2E_ON_DISPOSABLE_HOST:-}" != "1" ]; then
    echo "!! REFUSING to run: this machine has a running vibetop-manager (a real"     >&2
    echo "!! install). A privileged systemd container here can crash the host."       >&2
    echo "!! Run this on a disposable host/VM/CI runner instead, or — only if you"     >&2
    echo "!! are certain this box is disposable — re-run with"                          >&2
    echo "!!     VIBETOP_E2E_ON_DISPOSABLE_HOST=1 tests/e2e/run.sh"                     >&2
    echo "!! Or point Playwright at an already-running instance (see README):"          >&2
    echo "!!     VIBETOP_BASE_URL=… VIBETOP_E2E_COOKIE=… npx playwright test"           >&2
    exit 2
  fi
  echo "!! WARNING: vibetop-manager is running on this host and you set"
  echo "!! VIBETOP_E2E_ON_DISPOSABLE_HOST=1 — proceeding, but this is at your own risk."
fi

echo "== build image ($IMAGE) from repo root =="
docker build -f "$HERE/docker/Dockerfile" -t "$IMAGE" "$REPO"
[ "$BUILD_ONLY" = 1 ] && { KEEP=1; echo "built; --build-only, not running"; exit 0; }

echo "== run disposable instance ($CONTAINER on :$PORT) =="
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
# systemd in a container. NOTE: we do NOT use --cgroupns=host or a rw bind of the
# host's /sys/fs/cgroup — that shares the host cgroup tree and is what crashed a
# workstation. The container gets its OWN (private) cgroup namespace under docker's
# slice; a read-only host cgroup mount + private /run is the host-safer shape.
docker run -d --name "$CONTAINER" --privileged \
  --tmpfs /run --tmpfs /run/lock -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  -p "$PORT:80" "$IMAGE" >/dev/null

echo "== wait for firstboot deploy to FULLY complete (up to ~6 min) =="
# Wait for the firstboot unit to reach a terminal state — NOT a transient HTTP 200,
# which can appear mid-deploy while deploy.sh is still restarting the manager /
# reloading nginx (that dropped connections mid-test). `active` (RemainAfterExit)
# means firstboot.sh returned 0 = the stack is deployed and settled.
deadline=$(( $(date +%s) + 380 ))
while :; do
  st="$(docker exec "$CONTAINER" systemctl is-active vibetop-firstboot 2>/dev/null || echo '?')"
  [ "$st" = "active" ] && { echo "   firstboot complete."; break; }
  [ "$st" = "failed" ] && { echo "!! firstboot failed; deploy log:"; docker exec "$CONTAINER" journalctl -u vibetop-firstboot --no-pager | tail -60 || true; exit 1; }
  [ "$(date +%s)" -gt "$deadline" ] && { echo "!! timed out waiting for firstboot"; docker exec "$CONTAINER" journalctl -u vibetop-firstboot --no-pager | tail -60 || true; exit 1; }
  sleep 4
done
# Small settle + confirm it actually serves before handing off to Playwright.
sleep 2
curl -fsS "http://localhost:$PORT/login.html" >/dev/null 2>&1 || echo "   (note: /login.html not 200 yet; continuing)"

echo "== mint a vt_session cookie inside the container =="
TOKEN="$(docker exec "$CONTAINER" python3 /home/e2e/vibetop/tools/mint-session-cookie.py "$E2E_USER" --value-only)"
[ -n "$TOKEN" ] || { echo "!! failed to mint cookie"; exit 1; }

echo "== install Playwright browsers (first run only) =="
cd "$HERE"
[ -d node_modules ] || npm install
npx playwright install --with-deps chromium firefox webkit >/dev/null 2>&1 || npx playwright install chromium firefox webkit

echo "== run the suite =="
VIBETOP_BASE_URL="http://localhost:$PORT" \
VIBETOP_E2E_COOKIE="$TOKEN" \
VIBETOP_E2E_USER="$E2E_USER" \
  npx playwright test "${PW_ARGS[@]}"
