#!/usr/bin/env bash
# Runs once at container boot (as the e2e user) to install the vibetop stack.
# When this unit reaches `active` (RemainAfterExit), the stack is fully deployed
# and settled — that's the signal the test runner waits on (NOT a transient HTTP
# 200, which can appear mid-deploy while deploy.sh is still restarting services).
#
# NOT `set -e`: on a real host `apt install nginx` starts nginx via systemd, so
# install.sh's reload-on-change works; in a container apt's policy-rc.d suppresses
# that, so we tolerate a non-zero deploy and bring services up ourselves.
set -uo pipefail
DONE=/home/e2e/.vibetop-deployed
[ -f "$DONE" ] && { echo "already deployed"; exit 0; }

cd /home/e2e/vibetop
# Lean stack: no xpra/Chromium, no OnlyOffice/Docker — the shell smoke suite needs
# only nginx + manager + ttyd + FileBrowser. deploy.sh restarts the manager and
# reloads nginx as its final steps; let it finish before we touch anything.
./deploy.sh --no-browser --no-office || echo "deploy.sh returned non-zero (tolerated in-container)"

# Ensure the core services are running (install.sh only *reloads* nginx, assuming
# apt already started it — untrue in a container).
sudo systemctl enable --now vibetop-manager || true
sudo systemctl enable --now nginx || true

# LAST, after deploy has regenerated + reloaded the site for the final time:
# neutralize the LAN "upgrade cleartext logins to https" redirect. This headless
# HTTP env has no TLS terminator (prod gets https from Cloudflare), so
# `if ($vt_up = "http1") return 301 https://…` would bounce every request to an
# https URL nothing listens on. Strip just those lines, then reload once more.
sudo sed -i '/vt_up = "http1"/d' /etc/nginx/sites-enabled/vibetop || true
sudo nginx -t && { sudo systemctl reload nginx || sudo systemctl restart nginx; } || true

touch "$DONE"
echo "vibetop e2e deploy complete"
