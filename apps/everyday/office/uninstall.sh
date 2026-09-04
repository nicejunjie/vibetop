#!/usr/bin/env bash
# Remove vibetop-office (OnlyOffice Document Server). Leaves the JWT secret.
set -euo pipefail
CONTAINER="vibetop-onlyoffice"
echo "== removing container $CONTAINER =="
docker rm -f "$CONTAINER" 2>/dev/null || true
echo "== removing nginx snippet =="
sudo rm -f /etc/nginx/snippets/vibetop-extras.d/onlyoffice.conf
sudo nginx -t && sudo systemctl reload nginx || true   # best-effort: never abort cleanup on a broken/absent nginx
echo "done. (The ~2GB image is kept; 'docker rmi onlyoffice/documentserver' to reclaim it.)"
