# shellcheck shell=bash
# layout.sh — the system install layout, defined ONCE.
#
# Sourced (never executed) by deploy.sh and tools/migrate-to-opt.sh so a fresh
# root install and a migration of an existing home install cannot drift apart.
# That drift is not hypothetical: the web root is `vibetop-www`, and a stale
# doc/script that said `www` is how xpra-patches.js once 404'd after the /opt
# move (see docs/design-decisions.md).
#
# Vibetop installs like ordinary server software: root-owned code in a system
# tree, owned by a no-login service account. It needs NO human username — every
# per-user path is resolved at RUNTIME from the session cookie (_ctx_home()),
# and per-user services are transient systemd-run units created on demand.
#
# Env overrides: VIBETOP_OPT (tree root), VIBETOP_SVC_USER (service account).
#
# shellcheck disable=SC2034  # these are consumed by the scripts that source us

VT_OPT="${VIBETOP_OPT:-/opt/vibetop}"
VT_SVC="${VIBETOP_SVC_USER:-vibetop}"
VT_APP="$VT_OPT/app"           # git checkout the manager execs from (Updater pulls here)
VT_WWW="$VT_OPT/vibetop-www"   # nginx root — MUST match the installers' LANDING_DIR default
VT_ETC="$VT_OPT/etc"           # secrets (0700 root)
VT_VAR="$VT_OPT/var"           # shared state (idle/hints/resources policy, logs)
VT_ENV_FILE="/etc/vibetop/manager.env"

# vt_require_root — installers touch /etc, /opt and systemd; there is nothing to
# do unprivileged. Re-exec under sudo rather than lecturing the user.
vt_require_root() {
    [ "$(id -u)" -eq 0 ] && return 0
    command -v sudo >/dev/null 2>&1 || { echo "must run as root (sudo not found)" >&2; exit 1; }
    echo "==> re-executing under sudo (installing system software)" >&2
    exec sudo -E "$@"
}

# vt_ensure_service_account — the no-login account that owns the code and web
# root. Created if absent; never a human, never a login shell.
vt_ensure_service_account() {
    if ! id "$VT_SVC" >/dev/null 2>&1; then
        echo "-- creating system account $VT_SVC (no login, home $VT_OPT)"
        useradd --system --home-dir "$VT_OPT" --shell /usr/sbin/nologin "$VT_SVC"
    fi
}

# vt_ensure_dirs — the tree itself. Idempotent.
vt_ensure_dirs() {
    install -d -m 0755 -o "$VT_SVC" -g "$VT_SVC" "$VT_OPT" "$VT_WWW" "$VT_VAR"
    install -d -m 0700 -o root      -g root      "$VT_ETC"
    install -d -m 0755 /etc/vibetop
}

# vt_write_manager_env <admins> — read by vibetop-manager.service via
# EnvironmentFile=-. `admins` may be empty: with no admin named, the
# operator-only surfaces (Update, Claude-usage) are simply unavailable, which is
# the safe default for an unattended install. Everything else is per-user.
# Never clobbers an existing VIBETOP_ADMINS with an empty value.
vt_write_manager_env() {
    local admins="${1:-}" existing=""
    if [ -z "$admins" ] && [ -r "$VT_ENV_FILE" ]; then
        existing="$(sed -n 's/^[[:space:]]*VIBETOP_ADMINS=//p' "$VT_ENV_FILE" | head -1)"
        admins="$existing"
    fi
    install -d -m 0755 /etc/vibetop
    cat > "$VT_ENV_FILE" <<EOF
# Managed by vibetop. Human admin(s) + secret paths for the system tree.
# VIBETOP_ADMINS is a comma-separated list of Linux users who get the
# operator-only surfaces (Update, Claude-usage). Empty = nobody; everything
# else in vibetop is per-user and needs no entry here.
VIBETOP_ADMINS=$admins
ONLYOFFICE_SECRET_FILE=$VT_ETC/onlyoffice.secret
SESSION_SECRET_FILE=$VT_ETC/session.secret
EOF
    chmod 0644 "$VT_ENV_FILE"
}

# vt_installer_env_array — the environment every sub-installer must see so the
# service identity and system paths are used instead of an invoking human's
# $HOME. Sets VT_ENV_ARRAY; an array (not a string) so nothing word-splits.
#     vt_installer_env_array
#     env "${VT_ENV_ARRAY[@]}" ./terminal/install.sh
#
# VIBETOP_ADMINS is in here for a reason. It names the human OPERATOR, which is
# a different identity from APP_USER (the service account) — see the
# operator-vs-service-account trap in CLAUDE.md. Omitting it doesn't fail; it
# makes every installer that needs the operator silently fall back to APP_USER.
# That is exactly how the Claude-usage proxy came to run as `vibetop` and write
# its capture into /opt/vibetop/.local/share, where the manager never looks
# (v1.18.4). Read from the manager env file this same library writes, so there is
# ONE authority for who the operator is.
vt_installer_env_array() {
    local admins=""
    [ -r "$VT_ENV_FILE" ] && \
        admins="$(sed -n 's/^[[:space:]]*VIBETOP_ADMINS=//p' "$VT_ENV_FILE" | head -1)"
    VT_ENV_ARRAY=(
        APP_USER="$VT_SVC"
        APP_HOME="$VT_OPT"
        LANDING_DIR="$VT_WWW"
        DST_DIR="$VT_WWW"
        VIBETOP_ADMINS="${VIBETOP_ADMINS:-$admins}"
        SECRET_FILE="$VT_ETC/onlyoffice.secret"
        ONLYOFFICE_SECRET_FILE="$VT_ETC/onlyoffice.secret"
        SESSION_SECRET_FILE="$VT_ETC/session.secret"
    )
}

# vt_existing_home_install — echoes the web root of a pre-/opt install if nginx
# is currently serving one out of somebody's home, else nothing. Used so a
# re-run of deploy.sh on a legacy host does NOT silently relocate it (that is
# migrate-to-opt.sh's job, with its backups and secret preservation).
vt_existing_home_install() {
    # The site file is at sites-available/ on Debian and conf.d/ on RHEL — check
    # both, or this silently reports "no existing install" on RPM distros.
    local site root=""
    for site in /etc/nginx/sites-available/vibetop /etc/nginx/conf.d/vibetop.conf; do
        [ -r "$site" ] && break
        site=""
    done
    [ -n "$site" ] || return 0
    root="$(sed -n 's/^[[:space:]]*root[[:space:]]\+\([^;]*\);.*/\1/p' "$site" | head -1)"
    case "$root" in
        /home/*) printf '%s' "$root" ;;
        *) : ;;
    esac
}
