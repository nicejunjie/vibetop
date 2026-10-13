#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }
systemctl stop 'vibetop-browserlite-*.service' || true
if [ -f /etc/apparmor.d/vibetop-browser-lite ]; then
  apparmor_parser -R /etc/apparmor.d/vibetop-browser-lite || true
  rm -f /etc/apparmor.d/vibetop-browser-lite
fi
rm -rf /run/vibetop/browser-lite /opt/vibetop/browser-lite
printf 'Browser Lite runtime removed. User website profiles are preserved.\n'
