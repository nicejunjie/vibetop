#!/usr/bin/env bash
# One-command deploy for vibetop-office: OnlyOffice Document Server in Docker,
# fronted by nginx at /onlyoffice/. Powers the Files app's "Edit" (fast,
# native-in-browser editing) and saves back to the file via the manager's
# /api/office/{config,doc,callback,forcesave} endpoints.
#
#   browser <-> nginx /onlyoffice/ <-> 127.0.0.1:ONLYOFFICE_PORT (docker)
#   docker  <-> host.docker.internal/api/office/* (doc fetch + save callback)
#
# Env knobs:
#   ONLYOFFICE_PORT   loopback port for the container         (default 8087)
#   ONLYOFFICE_IMAGE  image to run               (default onlyoffice/documentserver)
#   INSTALL_DEPS      install docker + pull the image         (default 1)
#   INSTALL_CONTAINER (re)create the OnlyOffice container     (default 1)
#   INSTALL_NGINX     render & reload the nginx snippet       (default 1)
#   DRY_RUN           print actions only                      (default 0)
set -euo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# shellcheck source=../tools/lib/osdeps.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tools/lib/osdeps.sh"
if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "APP_USER '$APP_USER' does not exist on this system" >&2; exit 1
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8087}"
# Fully qualified ON PURPOSE: podman (EL9/Fedora) ships
# short-name-mode="enforcing" and must prompt to disambiguate an unqualified
# name — impossible non-interactively, so `podman pull onlyoffice/...` dies
# with "short-name resolution enforced but cannot prompt without a TTY".
# Docker silently assumes docker.io, which is why Ubuntu never hit this.
ONLYOFFICE_IMAGE="${ONLYOFFICE_IMAGE:-docker.io/onlyoffice/documentserver:latest}"
CONTAINER="vibetop-onlyoffice"
SECRET_FILE="${SECRET_FILE:-$APP_HOME/.config/vibetop/onlyoffice.secret}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
INSTALL_CONTAINER="${INSTALL_CONTAINER:-1}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --no-container) INSTALL_CONTAINER=0 ;;
        --no-nginx) INSTALL_NGINX=0 ;;
        --help|-h) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }
write_root() { if (( DRY_RUN )); then echo "+ write -> $1"; sed 's/^/    | /'; else sudo tee "$1" >/dev/null; fi; }
# Write an nginx conf from stdin only if it actually differs, and flag a single
# reload. Skipping no-op writes avoids reloading nginx (which severs live
# terminal/Browser/Office WebSockets) when nothing changed.
NGINX_DIRTY=0
# Returns 1 when it changed the file (0 when unchanged). Because it's used in a
# pipe (subshell), the caller captures that as the pipe exit status:
#   <render> | nginx_write "$dest" || NGINX_DIRTY=1
nginx_write() {
    local dest="$1" tmp; tmp="$(mktemp)"; cat >"$tmp"
    if ! [ -s "$tmp" ]; then echo "nginx_write: refusing to write EMPTY config to $dest (upstream render failed?)" >&2; rm -f "$tmp"; return 0; fi
    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then rm -f "$tmp"; return 0; fi
    if (( DRY_RUN )); then echo "+ nginx: would update $dest"; else sudo install -m 0644 "$tmp" "$dest"; fi
    rm -f "$tmp"; return 1
}

# Container runtime: docker on Debian/Ubuntu, podman on RPM distros — there is
# NO docker package in any enabled EL/Fedora repo (only podman/podman-docker).
# podman is CLI-compatible for everything used here, including
# --add-host=host.docker.internal:host-gateway, which the OnlyOffice container
# needs to call back to the manager.
OCI="${OCI:-}"
if [ -z "$OCI" ]; then
    if command -v docker >/dev/null 2>&1; then OCI=docker
    elif command -v podman >/dev/null 2>&1; then OCI=podman
    fi
fi
if [ -z "$OCI" ]; then
    if (( INSTALL_DEPS )); then
        if [ "$VT_FAMILY" = rhel ]; then
            echo "== installing podman (dnf; no docker package on RPM) =="
            run vt_pkg_install podman && OCI=podman
            # podman honours --restart policies only via this unit; without it
            # the container would not come back after a reboot.
        else
            echo "== installing docker (apt: docker.io) =="
            run vt_pkg_refresh
            run vt_pkg_install docker.io && OCI=docker
            run sudo systemctl enable --now docker
        fi
    else
        echo "a container runtime (docker or podman) is required but not installed (INSTALL_DEPS=0)." >&2
        exit 1
    fi
fi
[ -n "$OCI" ] || { echo "no container runtime available" >&2; exit 1; }
echo "   container cli : $OCI"
# podman honours --restart policies only via this unit. Enabling it ONLY inside
# the install branch meant a host that already had podman (most cloud images)
# silently lost restart-on-boot — the exact failure the unit exists to prevent.
if [ "$OCI" = podman ]; then
    run sudo systemctl enable --now podman-restart.service 2>/dev/null || true
fi
# Make sure the daemon is up (freshly installed, or stopped). podman is daemonless.
[ "$OCI" = docker ] && run sudo systemctl start docker 2>/dev/null || true

echo "== vibetop-office (OnlyOffice Document Server) =="
echo "   user: $APP_USER   port: $ONLYOFFICE_PORT   image: $ONLYOFFICE_IMAGE"

# 1. JWT secret — shared between the container and the manager. Generated once.
# Written as ROOT, into whatever directory SECRET_FILE names: on the system
# layout that is /opt/vibetop/etc (0700 root), where an `sudo -u $APP_USER tee`
# fails with "Permission denied" and leaves the deploy half-done. The only
# reader is the manager, which runs as root, so root:root 0600 is both correct
# and tighter than the old APP_USER-owned file.
if [ ! -s "$SECRET_FILE" ]; then
    echo "== generating JWT secret =="
    run sudo install -d -m 0700 -o root -g root "$(dirname "$SECRET_FILE")"
    if (( ! DRY_RUN )); then
        openssl rand -hex 32 | sudo tee "$SECRET_FILE" >/dev/null
        sudo chown root:root "$SECRET_FILE"
        sudo chmod 0600 "$SECRET_FILE"
    fi
fi
if (( DRY_RUN )); then
    SECRET=DRYRUN
else
    # Read explicitly so a failed cat doesn't abort silently under `set -e`,
    # and assert non-empty — an empty JWT_SECRET would disable OnlyOffice's
    # JWT integrity check.
    SECRET="$(sudo cat "$SECRET_FILE" 2>/dev/null || true)"
    if [ -z "$SECRET" ]; then
        echo "ERROR: OnlyOffice JWT secret missing/empty at $SECRET_FILE" >&2
        exit 1
    fi
fi

# 2. Image
if (( INSTALL_DEPS )); then
    echo "== pulling image (large, ~2GB first time) =="
    run $OCI pull "$ONLYOFFICE_IMAGE"
fi

# 3. (Re)create the container — loopback only; reachable back to the host for
#    the doc fetch + save callback via host.docker.internal. Skipped on a
#    snippet-only redeploy (INSTALL_CONTAINER=0, e.g. the in-app Updater): a
#    proxy-snippet refresh must NOT tear down a live OnlyOffice (it would drop
#    every open editor + cost ~1-2 min downtime). Container arg/image changes
#    therefore need a full deploy, like systemd-unit changes for browser/terminal.
if (( INSTALL_CONTAINER )); then
    echo "== (re)creating container $CONTAINER =="
    run $OCI rm -f "$CONTAINER" 2>/dev/null || true
    # The JWT secret goes in via a 0600 --env-file (not -e JWT_SECRET=...) so it
    # never shows up in the docker CLI's process args (ps).
    if (( DRY_RUN )); then
        run $OCI run -d --name "$CONTAINER" --restart unless-stopped \
            -p "127.0.0.1:${ONLYOFFICE_PORT}:80" \
            -e JWT_ENABLED=true --env-file "<jwt-secret-env-file>" -e JWT_HEADER=Authorization \
            --add-host=host.docker.internal:host-gateway \
            "$ONLYOFFICE_IMAGE"
    else
        ENVFILE="$(umask 077; mktemp)"
        trap 'rm -f "$ENVFILE"' EXIT
        printf 'JWT_SECRET=%s\n' "$SECRET" > "$ENVFILE"
        $OCI run -d --name "$CONTAINER" --restart unless-stopped \
            -p "127.0.0.1:${ONLYOFFICE_PORT}:80" \
            -e JWT_ENABLED=true --env-file "$ENVFILE" -e JWT_HEADER=Authorization \
            --add-host=host.docker.internal:host-gateway \
            "$ONLYOFFICE_IMAGE"
        rm -f "$ENVFILE"
        trap - EXIT
    fi
else
    echo "== keeping existing container (INSTALL_CONTAINER=0) =="
fi

# 4. nginx snippet
if (( INSTALL_NGINX )); then
    if ! [ -d /etc/nginx/snippets/vibetop-extras.d ]; then
        echo "   /etc/nginx/snippets/vibetop-extras.d missing — run terminal/install.sh first." >&2
        exit 1
    fi
    echo "== installing nginx snippet =="
    sed -e "s|@ONLYOFFICE_PORT@|$ONLYOFFICE_PORT|g" \
        "$APP_DIR/nginx/onlyoffice.conf" \
        | nginx_write /etc/nginx/snippets/vibetop-extras.d/onlyoffice.conf || NGINX_DIRTY=1
    if (( NGINX_DIRTY )); then
        if run sudo nginx -t; then
            run sudo systemctl reload nginx
        else
            echo "ERROR: generated nginx config failed validation — not reloading" >&2
            exit 1
        fi
    else
        echo "   nginx unchanged — skipping reload"
    fi
fi

echo
echo "done."
if (( INSTALL_CONTAINER )); then
    echo "The Document Server takes ~1-2 min to become healthy on first start:"
    echo "  curl -s http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck   # -> true"
    echo "  open the Office app via Files -> Edit"
fi
