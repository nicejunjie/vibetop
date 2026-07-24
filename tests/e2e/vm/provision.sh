#!/usr/bin/env bash
# Provisions the disposable vibetop VM (runs as root via Vagrant). A real Ubuntu VM
# is a faithful host — systemd is fully functional and `apt install nginx` starts
# it normally, so deploy.sh "just works" here (unlike the container, which needed
# nginx pre-started and python3 added). NOT set -e: tolerate a non-zero deploy and
# ensure services ourselves.
set -uo pipefail

E2E_USER=e2e
E2E_PASS=e2e-passw0rd

echo "== create the e2e login user (APP_USER + default admin) =="
id "$E2E_USER" &>/dev/null || useradd -m -s /bin/bash "$E2E_USER"
echo "$E2E_USER:$E2E_PASS" | chpasswd
echo "$E2E_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$E2E_USER
chmod 0440 /etc/sudoers.d/$E2E_USER
usermod -aG sudo "$E2E_USER"          # sudo GROUP membership (what _can_sudo checks -> Config app gate)
loginctl enable-linger "$E2E_USER" 2>/dev/null || true

echo "== create a SECOND ordinary login user (for multi-user isolation tests) =="
# e2e2 is a plain user (NOT sudo, NOT an admin) — used to prove per-user isolation:
# their notes/files/session are separate from e2e's, and they can't reach the
# operator-only surfaces.
id e2e2 &>/dev/null || useradd -m -s /bin/bash e2e2
echo "e2e2:e2e2-passw0rd" | chpasswd
loginctl enable-linger e2e2 2>/dev/null || true
mkdir -p /home/e2e2/.local/share /home/e2e2/Documents /home/e2e2/Uploads
chown -R e2e2:e2e2 /home/e2e2

echo "== copy the synced repo into the e2e user's home (deploy refuses root, wants \$HOME) =="
mkdir -p /home/$E2E_USER/vibetop
rsync -a --delete --exclude 'tests/e2e/node_modules' --exclude '.git' \
  /home/vagrant/vibetop/ /home/$E2E_USER/vibetop/
chown -R "$E2E_USER:$E2E_USER" /home/$E2E_USER/vibetop

echo "== deploy the lean stack as the e2e user =="
sudo -u "$E2E_USER" bash -lc 'cd ~/vibetop && ./deploy.sh --no-browser --no-office' \
  || echo "deploy.sh returned non-zero (tolerated); ensuring services below"

echo "== ensure core services + neutralize the LAN http->https upgrade =="
systemctl enable --now vibetop-manager || true
systemctl enable --now nginx || true
# No TLS terminator in this test VM, so strip the cleartext->https redirect that
# fires for non-loopback clients (a forwarded Playwright request), then reload.
sed -i '/vt_up = "http1"/d' /etc/nginx/sites-enabled/vibetop || true
nginx -t && { systemctl reload nginx || systemctl restart nginx; } || true

echo "== provision complete =="
curl -fsS http://127.0.0.1/login.html >/dev/null 2>&1 && echo "stack is serving" || echo "WARN: not serving yet"
