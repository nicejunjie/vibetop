#!/usr/bin/env bash
# Automated Cloudflare Tunnel setup for myhost.
# Prerequisites: cloudflared installed, authenticated (run `cloudflared tunnel login` first).
#
# Usage:
#   sudo ./setup-tunnel.sh
#   sudo TUNNEL_NAME=myhost HOSTNAME=service.example.com ./setup-tunnel.sh
#   sudo ./setup-tunnel.sh --dry-run

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-myhost}"
TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME:-service.example.com}"
APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --help|-h) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() {
    if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi
}

cat <<EOF
Cloudflare Tunnel setup
  tunnel name   : $TUNNEL_NAME
  hostname      : $TUNNEL_HOSTNAME
  user          : $APP_USER
  dry run       : $DRY_RUN
EOF
echo

# 1. Check prerequisites
if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared not found. Install it first." >&2
    exit 1
fi

CERT="$APP_HOME/.cloudflared/cert.pem"
if [ ! -f "$CERT" ]; then
    echo "No cert.pem found at $CERT" >&2
    echo "Run 'cloudflared tunnel login' first and authenticate." >&2
    exit 1
fi
echo "== cert.pem found at $CERT =="

# 2. Create tunnel (or reuse existing)
echo "== checking for existing tunnel =="
EXISTING_UUID=$(sudo -u "$APP_USER" cloudflared tunnel list 2>/dev/null | grep -w "$TUNNEL_NAME" | awk '{print $1}' || true)

if [ -n "$EXISTING_UUID" ]; then
    UUID="$EXISTING_UUID"
    echo "   tunnel '$TUNNEL_NAME' already exists: $UUID"
else
    echo "== creating tunnel '$TUNNEL_NAME' =="
    if (( DRY_RUN )); then
        echo "+ cloudflared tunnel create $TUNNEL_NAME"
        UUID="<UUID>"
    else
        OUTPUT=$(sudo -u "$APP_USER" cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
        echo "$OUTPUT"
        UUID=$(echo "$OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
        if [ -z "$UUID" ]; then
            echo "Failed to extract tunnel UUID from output" >&2
            exit 1
        fi
    fi
    echo "   tunnel UUID: $UUID"
fi

# 3. Copy credentials to /etc/cloudflared/
echo "== setting up /etc/cloudflared/ =="
run sudo mkdir -p /etc/cloudflared

CRED_SRC="$APP_HOME/.cloudflared/$UUID.json"
CRED_DST="/etc/cloudflared/$UUID.json"
if [ -f "$CRED_SRC" ]; then
    run sudo cp "$CRED_SRC" "$CRED_DST"
    run sudo chmod 600 "$CRED_DST"
elif [ -f "$CRED_DST" ]; then
    echo "   credentials already at $CRED_DST"
else
    echo "   warning: credentials file not found at $CRED_SRC or $CRED_DST" >&2
fi

# 4. Render config.yml from template
echo "== rendering config.yml =="
if [ -f "$APP_DIR/config.yml.template" ]; then
    sed "s/@TUNNEL_UUID@/$UUID/g" "$APP_DIR/config.yml.template" \
        | run sudo tee /etc/cloudflared/config.yml > /dev/null
    if (( DRY_RUN )); then
        echo "   would write /etc/cloudflared/config.yml"
    else
        echo "   written to /etc/cloudflared/config.yml"
    fi
else
    echo "   template not found at $APP_DIR/config.yml.template" >&2
    exit 1
fi

# 5. Add DNS route
echo "== adding DNS route: $TUNNEL_HOSTNAME -> $TUNNEL_NAME =="
if (( DRY_RUN )); then
    echo "+ cloudflared tunnel route dns $TUNNEL_NAME $TUNNEL_HOSTNAME"
else
    sudo -u "$APP_USER" cloudflared tunnel route dns "$TUNNEL_NAME" "$TUNNEL_HOSTNAME" 2>&1 || true
fi

# 6. Install systemd service
echo "== installing cloudflared service =="
if systemctl list-unit-files cloudflared.service >/dev/null 2>&1; then
    echo "   service already installed, restarting"
    run sudo systemctl restart cloudflared
else
    run sudo cloudflared service install
    run sudo systemctl enable --now cloudflared
fi

echo
echo "== verifying =="
sleep 2
if systemctl is-active --quiet cloudflared 2>/dev/null; then
    echo "cloudflared is running."
else
    echo "cloudflared failed to start. Check: sudo journalctl -u cloudflared -n 20" >&2
fi

echo
echo "done. $TUNNEL_HOSTNAME should now point to this machine's port 80."
echo "Cloudflare Access (email PIN + Google) can be configured at:"
echo "  https://one.dash.cloudflare.com/ -> Access -> Applications"
