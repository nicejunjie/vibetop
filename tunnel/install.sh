#!/usr/bin/env bash
# Install cloudflared from Cloudflare's apt repo. The tunnel itself is
# created interactively after install — see README.md for the full
# walkthrough (cloudflared tunnel login, create, route dns, etc.).
#
# Idempotent. Doesn't touch any tunnel that may already exist.

set -euo pipefail
DRY_RUN="${DRY_RUN:-0}"
DEPS_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --deps-only) DEPS_ONLY=1 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }

if command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared already installed: $(cloudflared --version 2>&1 | head -1)"
else
    [ "${INSTALL_DEPS:-1}" = 1 ] || { echo "Missing required command: cloudflared" >&2; exit 1; }
    echo "== adding Cloudflare apt repo =="
    run sudo mkdir -p --mode=0755 /usr/share/keyrings
    if [ ! -f /usr/share/keyrings/cloudflare-main.gpg ]; then
        run bash -o pipefail -c "curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null"
    fi
    if [ ! -f /etc/apt/sources.list.d/cloudflared.list ]; then
        run bash -c "echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null"
    fi
    echo "== installing cloudflared =="
    run sudo apt-get update -qq
    run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared
fi

if (( ! DRY_RUN )); then
    command -v cloudflared >/dev/null || { echo "Missing required command: cloudflared" >&2; exit 1; }
fi
if (( DEPS_ONLY )); then exit 0; fi

echo
echo "cloudflared installed. Now follow README.md for the interactive setup:"
echo "  1. cloudflared tunnel login           (browser auth to Cloudflare)"
echo "  2. cloudflared tunnel create myhost"
echo "  3. populate /etc/cloudflared/config.yml from config.yml.template"
echo "  4. cloudflared tunnel route dns myhost service.example.com"
echo "  5. sudo cloudflared service install   (creates the systemd unit)"
echo "  6. set up Cloudflare Access in the Zero Trust dashboard"
