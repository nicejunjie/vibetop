#!/usr/bin/env bash
# Reverse what install.sh + the interactive setup did. Idempotent.
# Leaves the cloudflared binary installed (apt package stays).
# Does NOT remove the DNS CNAME — do that manually in Cloudflare dashboard.

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }

echo "== stopping cloudflared service =="
run sudo systemctl disable --now cloudflared 2>/dev/null || true

echo "== removing cloudflared service files =="
run sudo cloudflared service uninstall 2>/dev/null || true

echo "== removing config =="
run sudo rm -f /etc/cloudflared/config.yml

echo "done."
echo "NOTE: DNS CNAME (service.example.com) still exists in Cloudflare — remove it manually if needed."
echo "NOTE: Tunnel credentials at /etc/cloudflared/<UUID>.json left in place."
echo "NOTE: cloudflared apt package left installed."
