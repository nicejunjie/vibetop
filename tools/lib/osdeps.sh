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

# DEBIAN_FRONTEND must be passed THROUGH sudo, not merely exported: sudo strips
# the environment by default, so `export DEBIAN_FRONTEND=noninteractive` in
# deploy.sh never reaches `sudo apt-get`. That was survivable while we only
# installed ttyd/nginx/acl (none of which prompt) — but installing chromium on a
# snap-less Debian pulls in keyboard-configuration, which opens an interactive
# debconf dialog and BLOCKS FOREVER. Observed as a matrix row sitting at
# "Setting up keyboard-configuration" for 5h19m at zero host load.
vt_pkg_refresh() {
    case "$VT_FAMILY" in
        debian) sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq ;;
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
        debian) sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
                    -o Dpkg::Options::=--force-confold "${pkgs[@]}" || return 1 ;;
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
# vt_selinux_allow_xpra — let xpra start a display when launched by systemd-run.
#
# xpra.org's RPM ships its OWN SELinux policy module, which contains:
#     type_transition initrc_t     xpra_exec_t:process xpra_t;
#     type_transition unconfined_t xpra_exec_t:process unconfined_t;
# The manager starts each per-user display with `systemd-run` (_start_user_xpra),
# and that unit runs as initrc_t — so xpra transitions into the CONFINED xpra_t
# domain, which may not create its session directory under /run/user/<uid>
# (user_tmp_t) nor the /tmp/<display> fallback. It dies with:
#     PermissionError: [Errno 13] Permission denied: '/run/user/<uid>'
# and /browser/ + /x11-display/ then 502.
#
# Two things make this genuinely nasty to diagnose:
#  1. The SAME command run interactively (`su - user`) WORKS, because the
#     transition from unconfined_t deliberately does not confine it. So it looks
#     like a uid/permissions bug in our systemd-run wiring, which it is not.
#  2. NO AVC is ever recorded — `ausearch -m avc` stays empty even with dontaudit
#     disabled (semodule -DB) — so the usual SELinux diagnostic says "not me".
#
# Making just this one domain permissive keeps the rest of the system Enforcing.
# It is narrow and reversible (`semanage permissive -d xpra_t`). The alternative,
# a custom policy granting xpra_t write access to user_tmp_t and user_home_t,
# would be a broader grant than this and needs a maintained policy module.
vt_selinux_allow_xpra() {
    command -v getenforce >/dev/null 2>&1 || return 0
    [ "$(getenforce 2>/dev/null || echo Disabled)" = Enforcing ] || return 0
    # Only relevant when the xpra policy module is actually installed.
    command -v semodule >/dev/null 2>&1 && semodule -l 2>/dev/null | grep -qx xpra || return 0
    if ! command -v semanage >/dev/null 2>&1; then
        echo "== installing policycoreutils-python-utils (for semanage) =="
        sudo dnf install -y policycoreutils-python-utils >/dev/null 2>&1 || {
            echo "WARN: semanage unavailable; xpra displays will fail to start under SELinux" >&2
            return 0; }
    fi
    if semanage permissive -l 2>/dev/null | grep -qx xpra_t; then
        echo "   SELinux: xpra_t already permissive"
        return 0
    fi
    echo "== SELinux: making the xpra_t domain permissive (system stays Enforcing) =="
    sudo semanage permissive -a xpra_t \
        || echo "WARN: could not make xpra_t permissive; the Browser/X11 displays will not start" >&2
}

# vt_firewall_open_web — open 80/443 when firewalld is present.
#
# This is a REBOOT-LATENT trap, which is why it is easy to miss: the base cloud
# images have no firewalld, but xpra's RPM dependency chain pulls it in and it
# lands ENABLED. It is inactive for the rest of that boot (it was installed after
# boot), so everything works and the matrix goes green — and then the host comes
# back after a reboot with the default `public` zone, which permits only ssh/mdns/
# dhcpv6-client. vibetop becomes LAN-unreachable. A matrix that never reboots
# cannot catch this, so the installer has to be unconditionally correct.
vt_firewall_open_web() {
    command -v firewall-cmd >/dev/null 2>&1 || return 0
    systemctl is-enabled --quiet firewalld 2>/dev/null || \
        systemctl is-active --quiet firewalld 2>/dev/null || return 0
    echo "== firewalld present — opening http/https =="
    local svc
    if systemctl is-active --quiet firewalld 2>/dev/null; then
        for svc in http https; do
            sudo firewall-cmd --permanent --add-service="$svc" >/dev/null 2>&1 || true
        done
        sudo firewall-cmd --reload >/dev/null 2>&1 || true
    else
        # Installed but not running (xpra's deps pull it in AFTER boot). The
        # --permanent calls fail with rc=252 "FirewallD is not running" in that
        # state, so use the offline tool — otherwise the rules are never written
        # and the host loses :80/:443 on its next reboot.
        for svc in http https; do
            sudo firewall-offline-cmd --add-service="$svc" >/dev/null 2>&1 || true
        done
    fi
    return 0
}

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
