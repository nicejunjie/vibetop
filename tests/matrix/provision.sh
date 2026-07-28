#!/usr/bin/env bash
# Provision one matrix VM: create two ordinary login users, install vibetop AS
# ROOT from the synced source, then assert. Deliberately distro-agnostic — this
# script must not assume apt, because proving where the RPM path breaks is the
# whole point of the matrix.
#
# NOT set -e: a failing deploy is a RESULT, not a crash. assert.sh reports it.
set -uo pipefail

SRC=/opt/vibetop-src
U1=vtuser ; P1=vt-passw0rd          # ordinary user + named admin
U2=vtuser2; P2=vt2-passw0rd         # ordinary user, no admin, no sudo

echo "=== distro ==="
. /etc/os-release 2>/dev/null || true
echo "ID=${ID:-?} VERSION_ID=${VERSION_ID:-?} PRETTY=${PRETTY_NAME:-?}"

echo "=== create login users (they have NOTHING to do with installing) ==="
# useradd/chpasswd exist on both families. The sudo group differs: Debian uses
# `sudo`, RHEL uses `wheel` — add to whichever exists so the Config app's
# _can_sudo gate can be exercised on either.
for spec in "$U1:$P1" "$U2:$P2"; do
    u=${spec%%:*}
    id "$u" >/dev/null 2>&1 || useradd -m -s /bin/bash "$u"
    echo "$spec" | chpasswd || echo "WARN: chpasswd failed for $u"
done
for g in sudo wheel; do
    getent group "$g" >/dev/null 2>&1 && usermod -aG "$g" "$U1" && break
done
loginctl enable-linger "$U1" 2>/dev/null || true
loginctl enable-linger "$U2" 2>/dev/null || true

# FULL means FULL: Browser (xpra + Chromium) *and* Office (the ~2GB OnlyOffice
# container). The previous "full" still passed --no-office, so Office was never
# exercised by the matrix at all — the green table was quietly narrower than it
# looked.
if [ "${VIBETOP_MATRIX_FULL:-0}" = "1" ]; then
    FLAGS=""
else
    FLAGS="--no-browser --no-office"
fi

echo "=== deploy AS ROOT ($FLAGS) — no username passed to the installer ==="
deploy_rc=0
# shellcheck disable=SC2086  # FLAGS is a deliberate word-split flag list
( cd "$SRC" && ./deploy.sh --admins "$U1" $FLAGS ) || deploy_rc=$?
echo "DEPLOY_RC=$deploy_rc"

# No TLS terminator here, so drop the cleartext->https upgrade that fires for
# non-loopback clients; assertions are loopback-only but keep it consistent.
if [ -f /etc/nginx/sites-enabled/vibetop ]; then
    sed -i '/vt_up = "http1"/d' /etc/nginx/sites-enabled/vibetop 2>/dev/null || true
elif [ -f /etc/nginx/conf.d/vibetop.conf ]; then
    sed -i '/vt_up = "http1"/d' /etc/nginx/conf.d/vibetop.conf 2>/dev/null || true
fi
nginx -t >/dev/null 2>&1 && { systemctl reload nginx || systemctl restart nginx; } || true

# Wait for something to answer before asserting — a reload is not instant, and
# probing too early makes a healthy host look broken.
for _ in $(seq 1 30); do
    curl -sf -o /dev/null http://127.0.0.1/api/ping && break
    sleep 1
done

echo "=== assert ==="
VT_U1="$U1" VT_P1="$P1" VT_U2="$U2" VT_P2="$P2" DEPLOY_RC="$deploy_rc" \
    VT_FULL="${VIBETOP_MATRIX_FULL:-0}" \
    bash "$SRC/tests/matrix/assert.sh"
