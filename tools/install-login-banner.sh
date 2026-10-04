#!/usr/bin/env bash
# Install the compact hardware login banner; retain Ubuntu maintenance notices.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
    exec sudo "$0" "$@"
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
for hw in /sys/class/hwmon/hwmon*; do
    if [ -r "$hw/name" ] && [ "$(cat "$hw/name")" = amdgpu ]; then
        command -v amd-smi >/dev/null || [ -x /opt/rocm/bin/amd-smi ] || {
            echo 'amd-smi is required to wake AMD GPUs for the login snapshot' >&2; exit 1;
        }
        break
    fi
done
[ -d /etc/update-motd.d ] || { echo '/etc/update-motd.d is required' >&2; exit 1; }
# Verify the complete banner before changing the active login configuration.
python3 "$SCRIPT_DIR/login-banner.py" --color always > /dev/null
install -d -m 0755 /usr/local/lib/vibetop
install -m 0755 "$SCRIPT_DIR/login-banner.py" /usr/local/lib/vibetop/login-banner.py
backup="/var/backups/vibetop-motd/$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$backup"
# Suppress generic greetings/help/news; security-update and reboot notices stay.
for name in 00-header 10-help-text 50-motd-news; do
    file="/etc/update-motd.d/$name"
    if [ -x "$file" ]; then
        cp -a "$file" "$backup/"
        chmod a-x "$file"
    fi
done
if [ -f /etc/update-motd.d/00-vibetop-banner ]; then
    cp -a /etc/update-motd.d/00-vibetop-banner "$backup/"
fi
cat > /etc/update-motd.d/00-vibetop-banner <<'WRAPPER'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/vibetop/login-banner.py --color always
WRAPPER
chmod 0755 /etc/update-motd.d/00-vibetop-banner
chown root:root /etc/update-motd.d/00-vibetop-banner /usr/local/lib/vibetop/login-banner.py
run-parts /etc/update-motd.d > /run/motd.dynamic.new
chmod 0644 /run/motd.dynamic.new
mv /run/motd.dynamic.new /run/motd.dynamic
printf 'Login banner installed. Backups: %s\n' "$backup"
