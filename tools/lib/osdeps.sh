# shellcheck shell=bash
# osdeps.sh — everything that differs between distro families, in ONE place.
#
# Sourced (never executed) by the installers. Every fact here was OBSERVED in a
# matrix VM (tests/matrix/), not inferred from documentation — see
# docs/design-decisions.md §"Porting the installers off apt".
#
# Families: `debian` (apt) and `rhel` (dnf: RHEL/Rocky/Alma/Fedora).
#
# shellcheck disable=SC2034  # consumed by the scripts that source us

VT_OS_ID=""; VT_OS_LIKE=""; VT_FAMILY=""; VT_OS_VER=""
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    VT_OS_ID="${ID:-}"; VT_OS_LIKE="${ID_LIKE:-}"; VT_OS_VER="${VERSION_ID:-}"
fi
case " $VT_OS_ID $VT_OS_LIKE " in
    *" debian "*|*" ubuntu "*) VT_FAMILY=debian ;;
    *" rhel "*|*" fedora "*|*" centos "*) VT_FAMILY=rhel ;;
    *) case "$VT_OS_ID" in
           fedora|rocky|almalinux|centos|rhel) VT_FAMILY=rhel ;;
           debian|ubuntu) VT_FAMILY=debian ;;
       esac ;;
esac

# vt_pkg_name <generic> — the package name on THIS family, or "" if the generic
# name has no equivalent here. Only names that actually DIFFER are listed; the
# fallback is the generic name unchanged.
#
#   xserver-xorg-video-dummy -> xorg-x11-drv-dummy   (Alma 9, Fedora 44)
#   x11-xserver-utils        -> xorg-x11-server-utils on EL9; SPLIT on Fedora,
#                               where that umbrella package does not exist and
#                               /usr/bin/xhost comes from `xhost`
#   fonts-liberation         -> liberation-fonts
#   dbus (daemon binary)     -> dbus-daemon (separate package from `dbus`)
#   docker.io                -> NONE on EL9/Fedora (podman only) — caller decides
vt_pkg_name() {
    local g="$1"
    if [ "$VT_FAMILY" != rhel ]; then printf '%s' "$g"; return 0; fi
    case "$g" in
        xserver-xorg-video-dummy) printf 'xorg-x11-drv-dummy' ;;
        x11-xserver-utils)
            # Fedora split the umbrella package; EL9 still ships it.
            if [ "$VT_OS_ID" = fedora ]; then printf 'xhost'; else printf 'xorg-x11-server-utils'; fi ;;
        fonts-liberation)  printf 'liberation-fonts' ;;
        dbus-daemon)       printf 'dbus-daemon' ;;
        docker.io)         printf '' ;;          # no docker package in any enabled EL/Fedora repo
        *) printf '%s' "$g" ;;
    esac
}

vt_pkg_refresh() {
    case "$VT_FAMILY" in
        debian) sudo apt-get update -qq ;;
        rhel)   sudo dnf -q makecache 2>/dev/null || true ;;
    esac
}

# vt_enable_epel — EL (not Fedora) keeps ttyd/wmctrl/xdotool/xpra in EPEL only,
# so without this four core packages are simply unresolvable. No-op elsewhere.
vt_enable_epel() {
    [ "$VT_FAMILY" = rhel ] || return 0
    [ "$VT_OS_ID" = fedora ] && return 0
    rpm -q epel-release >/dev/null 2>&1 && return 0
    echo "== enabling EPEL (ttyd/wmctrl/xdotool live there on EL) =="
    sudo dnf install -y epel-release >/dev/null 2>&1 \
        || echo "WARN: could not enable EPEL — some packages may be unavailable" >&2
}

# vt_pkg_install <generic…> — install, translating names. Returns non-zero if any
# package failed, but never aborts the caller: an optional package (ffmpeg) must
# not take the whole install down, and the caller decides what is fatal.
vt_pkg_install() {
    local g n missing=0 pkgs=()
    for g in "$@"; do
        n="$(vt_pkg_name "$g")"
        [ -n "$n" ] || { echo "  (no $g package on $VT_OS_ID — skipping)"; missing=1; continue; }
        pkgs+=("$n")
    done
    [ ${#pkgs[@]} -gt 0 ] || return "$missing"
    case "$VT_FAMILY" in
        debian) sudo apt-get install -y "${pkgs[@]}" || return 1 ;;
        rhel)   sudo dnf install -y "${pkgs[@]}" || return 1 ;;
        *) echo "unsupported distro '${VT_OS_ID:-unknown}' — install manually: ${pkgs[*]}" >&2; return 1 ;;
    esac
    return "$missing"
}

# --- nginx layout -----------------------------------------------------------
# Debian: sites-available + sites-enabled symlink. RHEL/Fedora: conf.d only —
# nginx.conf includes `conf.d/*.conf` and there is NO sites-enabled include, so
# creating the directories is not enough; the site must live in conf.d.
vt_nginx_uses_sites_dirs() { [ -d /etc/nginx/sites-enabled ]; }
vt_nginx_site_path() {   # vt_nginx_site_path <site-name>
    if vt_nginx_uses_sites_dirs; then printf '/etc/nginx/sites-available/%s' "$1"
    else printf '/etc/nginx/conf.d/%s.conf' "$1"; fi
}

# vt_nginx_user — the account nginx workers run as, read from nginx.conf. Debian
# uses www-data; RHEL/Fedora use `nginx` and have NO www-data at all, so a
# hardcoded `setfacl -m u:www-data:x` fails with "Invalid argument near
# character 3" and aborts the installer.
vt_nginx_user() {
    local u=""
    u="$(sed -n 's/^[[:space:]]*user[[:space:]]\+\([A-Za-z0-9_-]\+\).*;.*/\1/p' \
         /etc/nginx/nginx.conf 2>/dev/null | head -1)"
    if [ -n "$u" ] && id "$u" >/dev/null 2>&1; then printf '%s' "$u"; return 0; fi
    for u in www-data nginx http; do
        id "$u" >/dev/null 2>&1 && { printf '%s' "$u"; return 0; }
    done
    printf ''
}

# --- PAM --------------------------------------------------------------------
# Debian delegates to common-auth/common-account; RHEL/Fedora have neither and
# use system-auth/password-auth (symlinked through authselect on Fedora).
# Getting this wrong is not subtle: the manager logs
# "_pam_load_conf_file: unable to open config for common-auth" and every login 401s.
vt_pam_auth_stack() {
    if [ -r /etc/pam.d/common-auth ]; then printf 'common-auth'
    elif [ -r /etc/pam.d/system-auth ]; then printf 'system-auth'
    else printf 'system-auth'; fi
}
vt_pam_account_stack() {
    if [ -r /etc/pam.d/common-account ]; then printf 'common-account'
    elif [ -r /etc/pam.d/system-auth ]; then printf 'system-auth'
    else printf 'system-auth'; fi
}

# --- SELinux ----------------------------------------------------------------
# The one that is invisible until everything else works: with SELinux enforcing,
# nginx may not open a TCP connection to our loopback upstreams, so EVERY route
# 502s. Observed as:
#   avc: denied { name_connect } for comm="nginx" dest=7680 ... tclass=tcp_socket
#   nginx: connect() to 127.0.0.1:7680 failed (13: Permission denied)
# httpd_can_network_connect is the documented boolean for exactly this.
vt_selinux_allow_proxy() {
    command -v getenforce >/dev/null 2>&1 || return 0
    [ "$(getenforce 2>/dev/null || echo Disabled)" = Enforcing ] || return 0
    command -v setsebool >/dev/null 2>&1 || {
        echo "WARN: SELinux is Enforcing but setsebool is missing; nginx->loopback" >&2
        echo "      proxying will fail. Install policycoreutils." >&2
        return 0; }
    echo "== SELinux: allowing nginx -> loopback upstreams (httpd_can_network_connect) =="
    sudo setsebool -P httpd_can_network_connect 1 \
        || echo "WARN: setsebool httpd_can_network_connect failed" >&2
}
