#!/usr/bin/env bash
# One-command deploy for vibetop-browser: a remote browser viewable from any
# browser via xpra's HTML5 client, persistent across disconnects.
#
# Architecture (all on myhost, mostly loopback):
#   xpra start-desktop :DISPLAY_NUM (X server + HTML5 client + WebSocket)
#        └── browser-loop.sh (chromium with auto-restart)
#                              ^
#                              |
#         nginx /browser/ ─────+
#
# Knobs (env vars):
#   APP_USER       system user the X session runs as           (default: invoking user)
#   APP_DIR        where the templates live                    (default: script dir)
#   DISPLAY_NUM    X display number (Chromium / Browser app)   (default 99)
#   XPRA_PORT      xpra WebSocket+HTML5 port (loopback)        (default 14500)
#   X11_DISPLAY_NUM  X display for the X11 desktop           (default 98)
#   X11_XPRA_PORT    xpra port for the X11 desktop (loopback)(default 14501)
#   BROWSER_CMD    full command for the browser                (default: auto-detect chromium/firefox)
#   INSTALL_DEPS   install xpra from xpra.org repo             (default 1)
#   INSTALL_SYSTEMD render & enable systemd unit               (default 1)
#   INSTALL_NGINX  drop the location snippet                   (default 1)
#   XPRA_PIN       apt version-glob to pin xpra to             (default 6.4.*; empty=no pin)
#                  (xpra 6.5 has a Browser click-offset regression — see below)
#   DRY_RUN        print actions without executing             (default 0)

set -euo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# Repo root by SEARCH, not by counting "..": these installers have already moved
# one level deeper (top level -> apps/<section>/<item>/) and a fixed ../ broke
# instantly. Walk up until the shared lib is found.
_vt_root() {
  local d; d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "$d" != / ]; do
    [ -f "$d/tools/lib/osdeps.sh" ] && { printf '%s' "$d"; return 0; }
    d="$(dirname "$d")"
  done
  echo "install.sh: could not locate the repo root (tools/lib/osdeps.sh)" >&2; exit 1
}
REPO_ROOT="$(_vt_root)"
. "$REPO_ROOT/tools/lib/osdeps.sh"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_UID="$(id -u "$APP_USER")"
DISPLAY_NUM="${DISPLAY_NUM:-99}"
XPRA_PORT="${XPRA_PORT:-14500}"
# Second xpra display for the X11 desktop (launched GUI apps + terminal X11
# apps), kept separate from Chromium's display so the Browser stays its own app.
X11_DISPLAY_NUM="${X11_DISPLAY_NUM:-98}"
X11_XPRA_PORT="${X11_XPRA_PORT:-14501}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --help|-h) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "APP_USER '$APP_USER' does not exist" >&2; exit 1
fi
if ! [ -f "$APP_DIR/xpra-app.sh" ]; then
    echo "xpra-app.sh not found under APP_DIR=$APP_DIR" >&2; exit 1
fi

run() {
    if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi
}
write_root() {
    local dest="$1"
    if (( DRY_RUN )); then echo "+ write -> $dest"; sed 's/^/    | /'
    else sudo tee "$dest" >/dev/null
    fi
}
# Write an nginx conf from stdin only if it differs; flag a single reload so a
# no-op deploy doesn't reload nginx (which severs live terminal/Browser sockets).
NGINX_DIRTY=0
# Returns 1 when changed; caller captures it across the pipe via '|| NGINX_DIRTY=1'.
nginx_write() {
    local dest="$1" tmp; tmp="$(mktemp)"; cat >"$tmp"
    if ! [ -s "$tmp" ]; then echo "nginx_write: refusing to write EMPTY config to $dest (upstream render failed?)" >&2; rm -f "$tmp"; return 0; fi
    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then rm -f "$tmp"; return 0; fi
    if (( DRY_RUN )); then echo "+ nginx: would update $dest"; else sudo install -m 0644 "$tmp" "$dest"; fi
    rm -f "$tmp"; return 1
}

# Auto-install Chromium (snap) when nothing is present and we're allowed to —
# the manager's /api/browser/open expects the snap-confined xpra-profile path,
# so snap chromium is the supported browser. (Gated by INSTALL_DEPS.)
if [ -z "${BROWSER_CMD:-}" ] && [ "${INSTALL_DEPS}" = 1 ] \
   && ! [ -x /snap/bin/chromium ] && ! [ -x /snap/bin/firefox ] \
   && ! command -v firefox-esr >/dev/null 2>&1 && ! command -v epiphany >/dev/null 2>&1 \
   && command -v snap >/dev/null 2>&1; then
    echo "== installing chromium (snap) =="
    run sudo snap install chromium
fi

# Distro Chromium, installed BEFORE the picker below, for every host WITHOUT
# snap. The picker exits 1 when it finds nothing, so this must not run after it.
#
# Not gated on RPM: Debian 12's cloud image has no snapd either, so the snap
# block above is skipped there too and a clean Debian host died with
# "no browser found" at step 2/6 — even though Debian packages `chromium`. Only
# Ubuntu reliably has snap, which is what masked this.
if (( INSTALL_DEPS )) && [ -z "${BROWSER_CMD:-}" ] \
   && ! [ -x /snap/bin/chromium ] && ! [ -x /snap/bin/firefox ] \
   && ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 \
   && ! command -v firefox-esr >/dev/null 2>&1 && ! command -v epiphany >/dev/null 2>&1; then
    echo "== installing chromium (distro package; no snap on this host) =="
    vt_enable_epel                       # no-op off EL
    run vt_pkg_refresh
    run vt_pkg_install chromium || echo "WARN: no chromium package — set BROWSER_CMD"
fi

# Pick a browser if not overridden.
if [ -z "${BROWSER_CMD:-}" ]; then
    if [ -x /snap/bin/chromium ]; then
        # --disable-smooth-scrolling: each wheel notch is animated over ~100ms by
        # default; on this remote xpra display that animation streams back frame
        # by frame and feels laggy/floaty. Disabling it makes every notch an
        # instant one-frame jump — crisp and responsive over the wire.
        BROWSER_CMD="/snap/bin/chromium --no-first-run --no-default-browser-check --restore-last-session --start-maximized --disable-smooth-scrolling --user-data-dir=$APP_HOME/snap/chromium/common/xpra-profile"
    elif command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1; then
        # Distro Chromium (RPM distros have no snap). The --user-data-dir MUST
        # match what the manager's _chromium_for_user() computes, or
        # /api/browser/open opens the URL in a different instance — the same
        # class of bug as the snap-profile mismatch documented in docs/gotchas.md.
        CHROME_BIN="$(command -v chromium 2>/dev/null || command -v chromium-browser)"
        BROWSER_CMD="$CHROME_BIN --no-first-run --no-default-browser-check --restore-last-session --start-maximized --disable-smooth-scrolling --user-data-dir=$APP_HOME/.config/vibetop/chromium-profile"
    elif [ -x /snap/bin/firefox ]; then
        BROWSER_CMD="/snap/bin/firefox --no-remote"
    elif command -v firefox-esr >/dev/null 2>&1; then
        BROWSER_CMD="$(command -v firefox-esr) --no-remote"
    elif command -v epiphany >/dev/null 2>&1; then
        BROWSER_CMD="$(command -v epiphany)"
    else
        echo "no browser found; set BROWSER_CMD or install chromium/firefox/epiphany" >&2
        exit 1
    fi
fi

cat <<EOF
vibetop-browser install (xpra)
  user          : $APP_USER (uid $APP_UID)
  app dir       : $APP_DIR
  display       : :$DISPLAY_NUM (Browser)  :$X11_DISPLAY_NUM (X11)
  xpra port     : $XPRA_PORT (Browser)  $X11_XPRA_PORT (X11)  [loopback]
  browser cmd   : $BROWSER_CMD
  deps          : $INSTALL_DEPS    systemd: $INSTALL_SYSTEMD    nginx: $INSTALL_NGINX
  dry run       : $DRY_RUN
EOF
echo

# 1. Dependencies ------------------------------------------------------------
# vt_xpra_repo_rpm — xpra.org's RPM repos, verified to exist at
# packaging/repos/<distro>/xpra.repo (Fedora | almalinux | rockylinux; RHEL and
# CentOS use the almalinux file). EPEL's xpra is 5.0.2, far behind the 6.x this
# project runs, and Ubuntu's 3.1.5 was already rejected as too old for the HTML5
# client — so on RPM we must use xpra.org, not the distro/EPEL package.
vt_xpra_repo_rpm() {
    local distro
    # EL9 clones all take the almalinux repo, INCLUDING Rocky. xpra.org ships a
    # rockylinux/ directory too, but it demonstrably lacks the 6.4.x builds:
    # a matrix run with the same pin got 6.4.4 on almalinux-9 and fell back to
    # 6.5.2 (the click-offset regression line) on rocky-9, from the same
    # $releasever/$basearch. The packages are binary-compatible across EL9
    # rebuilds, and xpra.org's own docs already say RHEL/CentOS use the
    # almalinux file — so Rocky joins them rather than taking a worse repo.
    case "$VT_OS_ID" in
        fedora) distro=Fedora ;;
        *)      distro=almalinux ;;
    esac
    if [ -f /etc/yum.repos.d/xpra.repo ]; then
        echo "   xpra.repo already present"; return 0
    fi
    echo "== adding xpra.org repository ($distro) =="
    # RHEL clones need CRB + EPEL for xpra's dependencies (xpra.org's own docs).
    if [ "$VT_OS_ID" != fedora ]; then
        run sudo dnf config-manager --set-enabled crb 2>/dev/null \
            || run sudo dnf config-manager --set-enabled powertools 2>/dev/null || true
    fi
    run sudo curl -fsSL -o /etc/yum.repos.d/xpra.repo \
        "https://raw.githubusercontent.com/Xpra-org/xpra/master/packaging/repos/$distro/xpra.repo"
}

if (( INSTALL_DEPS )) && [ "$VT_FAMILY" = rhel ]; then
    vt_enable_epel
    vt_xpra_repo_rpm
    echo "== installing xpra + X11 helpers (dnf) =="
    run vt_pkg_refresh
    # Names differ from Debian: xorg-x11-drv-dummy, and x11-xserver-utils maps to
    # xorg-x11-server-utils on EL but `xhost` on Fedora (see tools/lib/osdeps.sh).
    # xpra 6.5 has the Browser click-offset regression this project holds back
    # from on Debian (XPRA_PIN=6.4.*). Prefer 6.4.x where the repo offers it —
    # Fedora's xpra.org repo carries 6.4.4; EL9's carries ONLY 6.5.x, so this is
    # best-effort and must not fail the install.
    XPRA_RPM_PIN="${XPRA_RPM_PIN:-6.4}"
    _xpra_pkg=xpra
    # TWO traps here, both of which made this pin a silent no-op:
    #  1. Argument ORDER. Fedora 43 ships dnf5, which rejects the dnf4 form
    #     `dnf --showduplicates list xpra` with
    #     'Unknown argument "--showduplicates" ... It has to be placed after the
    #     command' — exiting rc=2 with no output, so the grep matched nothing.
    #     `dnf list --showduplicates xpra` is accepted by both dnf4 and dnf5.
    #  2. Strip the RPM EPOCH before matching. dnf prints "1:6.4.4-10.r0.fc43", so a
    # naive `grep " 6.4\."` never matches — the "1:" sits between the space and
    # the version — and the pin silently no-opped, installing the very 6.5 build
    # it exists to avoid while the matrix stayed green.
    if [ -n "$XPRA_RPM_PIN" ] && (( ! DRY_RUN )) \
       && dnf list --showduplicates xpra 2>/dev/null \
          | awk '{print $2}' | sed 's/^[0-9]*://' | grep -q "^$XPRA_RPM_PIN\."; then
        _xpra_pkg="xpra-${XPRA_RPM_PIN}*"
        echo "   pinning xpra to ${XPRA_RPM_PIN}.x (6.5 has the click-offset regression)"
    else
        echo "   NOTE: no xpra ${XPRA_RPM_PIN}.x in this repo — installing the newest available."
        echo "         xpra 6.5 carries a known Browser click-offset regression."
    fi
    run vt_pkg_install "$_xpra_pkg" xserver-xorg-video-dummy matchbox-window-manager \
        wmctrl x11-xserver-utils xdotool dbus-daemon
    if ! command -v soffice >/dev/null 2>&1; then
        echo "== installing libreoffice (office view/edit) =="
        run vt_pkg_install libreoffice-writer libreoffice-calc libreoffice-impress \
            fonts-liberation || echo "WARN: libreoffice install incomplete (office View may not render)"
    fi
    # Without this the per-user displays cannot start at all under SELinux —
    # and it reports no AVC, so it looks like a plain permission bug.
    run vt_selinux_allow_xpra
    # Disable xpra's own socket activation under BOTH packaging names: Debian
    # ships xpra-server.socket, the RPM ships xpra.socket. Checking only the
    # Debian name left the RPM unit enabled and LISTENING ON *:14500 — vibetop's
    # own XPRA_PORT, and a non-loopback listener on a host that binds everything
    # else to 127.0.0.1.
    for _sock in xpra-server.socket xpra.socket; do
        if systemctl is-enabled "$_sock" >/dev/null 2>&1; then
            run sudo systemctl disable --now "$_sock"
        fi
    done
    if [ ! -f /etc/udev/rules.d/99-uinput.rules ]; then
        echo 'KERNEL=="uinput", MODE="0666"' | write_root /etc/udev/rules.d/99-uinput.rules
    fi
    INSTALL_DEPS=0      # the Debian block below is apt-only; we're done here
fi

if (( INSTALL_DEPS )); then
    echo "== adding xpra.org repository =="
    if [ ! -f /usr/share/keyrings/xpra.asc ]; then
        run sudo wget -qO /usr/share/keyrings/xpra.asc https://xpra.org/xpra.asc
    else
        echo "   GPG key already present"
    fi
    if [ ! -f /etc/apt/sources.list.d/xpra.sources ]; then
        CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-noble}")"
        DEB_ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
        cat <<REPO_EOF | write_root /etc/apt/sources.list.d/xpra.sources
Types: deb
URIs: https://xpra.org
Suites: $CODENAME
Components: main
Signed-By: /usr/share/keyrings/xpra.asc
Architectures: $DEB_ARCH
REPO_EOF
    else
        echo "   apt source already present"
    fi

    # Pin xpra to 6.4.x. xpra 6.5 has a server-side click-offset regression in
    # start-desktop + HTML5 (clicks land ~1 line below the cursor; the HTML5
    # client JS is identical 6.4.4<->6.5, and xpra 6.4 hosts are immune — so it's
    # the 6.5 server). See docs/design-decisions.md. Priority 1001 forces 6.4.x
    # even over an already-installed 6.5 (self-heals). To move to a fixed xpra
    # later: re-run with XPRA_PIN= (empty) and `apt-mark unhold xpra*`, then test.
    XPRA_PIN="${XPRA_PIN-6.4.*}"
    if [ -n "$XPRA_PIN" ]; then
        cat <<PIN_EOF | write_root /etc/apt/preferences.d/vibetop-xpra.pref
Package: xpra xpra-server xpra-x11 xpra-common xpra-codecs xpra-codecs-extras xpra-client xpra-client-gtk3 xpra-audio
Pin: version $XPRA_PIN
Pin-Priority: 1001
PIN_EOF
    else
        run sudo rm -f /etc/apt/preferences.d/vibetop-xpra.pref
    fi

    echo "== installing xpra (pinned: ${XPRA_PIN:-none}) =="
    run sudo apt-get update -qq
    # wmctrl: the X11 Launcher lists/raises/closes windows on the xpra display.
    # x11-xserver-utils: provides xhost, used to allow snap apps (Firefox/Chromium)
    # to open the X11 display (they can't read the X auth cookie when confined).
    # xdotool: server-side Unicode text injection into the Browser (the mobile
    # keyboard delivers committed text via /api/browser/type -> `xdotool type`,
    # which can carry CJK/emoji/accents that the X key-event path cannot).
    # dbus: provides dbus-daemon for the private, activation-free per-user X11 app bus.
    run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
        -o Dpkg::Options::=--force-confold \
        xpra xserver-xorg-video-dummy matchbox-window-manager wmctrl x11-xserver-utils xdotool dbus
    # Disable xpra's built-in socket activation (conflicts with our own unit)
    # Disable xpra's own socket activation under BOTH packaging names: Debian
    # ships xpra-server.socket, the RPM ships xpra.socket. Checking only the
    # Debian name left the RPM unit enabled and LISTENING ON *:14500 — vibetop's
    # own XPRA_PORT, and a non-loopback listener on a host that binds everything
    # else to 127.0.0.1.
    for _sock in xpra-server.socket xpra.socket; do
        if systemctl is-enabled "$_sock" >/dev/null 2>&1; then
            run sudo systemctl disable --now "$_sock"
        fi
    done
    # Allow non-console users to run Xorg (needed for the dummy video driver)
    if grep -q 'allowed_users=console' /etc/X11/Xwrapper.config 2>/dev/null; then
        run sudo sed -i 's/allowed_users=console/allowed_users=anybody/' /etc/X11/Xwrapper.config
    fi
    # Allow uinput access for precise wheel scrolling
    if [ ! -f /etc/udev/rules.d/99-uinput.rules ]; then
        echo 'KERNEL=="uinput", MODE="0666"' | write_root /etc/udev/rules.d/99-uinput.rules
    fi

    # LibreOffice — powers the Files app's office support: "View" renders the
    # doc to PDF headlessly, "Edit" opens it on this xpra desktop. Slim set
    # (Writer/Calc/Impress) + Liberation fonts for faithful Arial/Times layout.
    if ! command -v soffice >/dev/null 2>&1; then
        echo "== installing libreoffice (office view/edit) =="
        run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
            libreoffice-writer libreoffice-calc libreoffice-impress \
            libreoffice-gtk3 fonts-liberation
    fi
fi

# 2. Stop legacy VNC services if present -------------------------------------
echo "== cleaning up legacy VNC services (if any) =="
for legacy in vibetop-browser-app vibetop-browser-novnc \
              vibetop-browser-wm vibetop-browser-xserver; do
    if systemctl list-unit-files "${legacy}.service" >/dev/null 2>&1; then
        run sudo systemctl disable --now "${legacy}.service" 2>/dev/null || true
        run sudo rm -f "/etc/systemd/system/${legacy}.service"
    fi
done

# 3. Per-user xpra launcher scripts ------------------------------------------
# Multi-user: the manager starts a Browser + X11 xpra PER USER via systemd-run
# (`_start_user_xpra`), so the scripts they exec must be reachable by EVERY user
# — root-owned 0755 in a shared dir, not APP_USER's 0750 home (same as the
# terminal helpers). browser-loop.sh is self-contained now (profile from $HOME).
echo "== installing per-user xpra launcher scripts =="
run sudo install -d -m 0755 /usr/local/lib/vibetop
run sudo install -m 0755 "$APP_DIR/xpra-app.sh" /usr/local/lib/vibetop/xpra-app.sh
run sudo install -m 0755 "$APP_DIR/browser-loop.sh" /usr/local/lib/vibetop/browser-loop.sh

# Private, activation-free D-Bus config for X11 GUI apps (evince/eog/…). The manager
# starts one dbus-daemon per user with this config (no <servicedir>) so GNOME/GTK
# apps don't hang ~25s on the xdg-desktop-portal/at-spi activation timeout. See
# terminal-manager.py:_ensure_user_x11_dbus and docs/design-decisions.md.
if [ -f "$APP_DIR/dbus/x11-dbus.conf" ]; then
    run sudo install -d -m 0755 /etc/vibetop
    run sudo install -m 0644 "$APP_DIR/dbus/x11-dbus.conf" /etc/vibetop/x11-dbus.conf
fi

# 4. Retire the shared single-user xpra services -----------------------------
# Browser/X11 are per-user now (launched on demand by the manager). Keep APP_USER
# lingering (snap chromium needs /run/user/<uid>; the manager also enables linger
# per user on first Browser/X11 use), and disable any shared instance from an
# older deploy.
if (( INSTALL_SYSTEMD )); then
    if [ "$(loginctl show-user "$APP_USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
        echo "== enabling lingering for $APP_USER =="
        run sudo loginctl enable-linger "$APP_USER"
    fi
    echo "== retiring shared xpra services (Browser/X11 are per-user now) =="
    for u in vibetop-browser-xpra vibetop-x11-xpra vibetop-x11-dbus; do
        run sudo systemctl disable --now "$u.service" 2>/dev/null || true
    done
    run sudo systemctl daemon-reload
fi

# 5. HTML5 client default settings -------------------------------------------
# The xpra-html5 package ships its own default-settings.txt; ours tunes the
# client for this deployment (no floating menu, speed-biased encoding). Apt
# upgrades overwrite it — re-running this script restores it.
if [ -d /usr/share/xpra/www ] && [ -f "$APP_DIR/default-settings.txt" ]; then
    echo "== installing HTML5 client default settings =="
    cat "$APP_DIR/default-settings.txt" | write_root /usr/share/xpra/www/default-settings.txt
fi

# 6. nginx snippet -----------------------------------------------------------
if (( INSTALL_NGINX )); then
    echo "== installing nginx snippet =="
    if ! [ -d /etc/nginx/snippets/vibetop-extras.d ]; then
        echo "   /etc/nginx/snippets/vibetop-extras.d does not exist —"
        echo "   re-run vibetop's install.sh first so the include path is wired up." >&2
        exit 1
    fi
    # Deploy xpra patches JS to web root (served as static file at /xpra-patches.js)
    LANDING_DIR="${LANDING_DIR:-$(getent passwd "$APP_USER" | cut -d: -f6)/vibetop-www}"
    run sudo install -m 0644 "$APP_DIR/xpra-patches.js" "$LANDING_DIR/xpra-patches.js"
    # Cache-buster derived from the patch file's CONTENT, so editing it always
    # changes the ?v= (busting nginx + the service worker) — no manual version
    # bump to forget. (This is how the "stale xpra-patches after deploy" class
    # is made impossible.)
    PATCH_VER=$(md5sum "$APP_DIR/xpra-patches.js" | cut -c1-10)
    sed -e "s|@PATCH_VER@|$PATCH_VER|g" \
        "$APP_DIR/nginx/browser.conf" \
        | nginx_write /etc/nginx/snippets/vibetop-extras.d/browser.conf || NGINX_DIRTY=1
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

# 7. (No shared services to start — Browser/X11 xpra are launched per user on
#    demand by the manager via systemd-run.)

echo
echo "done. Browser/X11 are per-user, started on demand. Open:"
echo "  http://<host>/browser/"
