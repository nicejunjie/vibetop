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
LOOP_SCRIPT="/usr/local/lib/vibetop-browser/browser-loop.sh"

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
if ! [ -d "$APP_DIR/systemd" ]; then
    echo "templates not found under APP_DIR=$APP_DIR" >&2; exit 1
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

# Pick a browser if not overridden.
if [ -z "${BROWSER_CMD:-}" ]; then
    if [ -x /snap/bin/chromium ]; then
        # --disable-smooth-scrolling: each wheel notch is animated over ~100ms by
        # default; on this remote xpra display that animation streams back frame
        # by frame and feels laggy/floaty. Disabling it makes every notch an
        # instant one-frame jump — crisp and responsive over the wire.
        BROWSER_CMD="/snap/bin/chromium --no-first-run --no-default-browser-check --restore-last-session --start-maximized --disable-smooth-scrolling --user-data-dir=$APP_HOME/snap/chromium/common/xpra-profile"
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
    run sudo apt-get install -y xpra xserver-xorg-video-dummy matchbox-window-manager wmctrl x11-xserver-utils
    # Disable xpra's built-in socket activation (conflicts with our own unit)
    if systemctl is-enabled xpra-server.socket >/dev/null 2>&1; then
        run sudo systemctl disable --now xpra-server.socket
    fi
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
        run sudo apt-get install -y --no-install-recommends \
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

# 3. Browser loop script -----------------------------------------------------
echo "== installing browser loop script =="
run sudo install -d -m 0755 "$(dirname "$LOOP_SCRIPT")"
sed -e "s|@BROWSER_CMD@|$BROWSER_CMD|g" \
    "$APP_DIR/browser-loop.sh" | write_root "$LOOP_SCRIPT"
run sudo chmod 0755 "$LOOP_SCRIPT"

# 4. systemd unit ------------------------------------------------------------
if (( INSTALL_SYSTEMD )); then
    # Enable lingering for APP_USER so systemd-logind keeps user@$APP_UID.service
    # and $XDG_RUNTIME_DIR (/run/user/$APP_UID) alive even with no login session.
    # snap chromium needs the user systemd instance + runtime dir to create its
    # transient tracking scope (snap.chromium.chromium-<uuid>.scope); without
    # lingering, once the deploying login session ends the runtime dir is torn
    # down and every browser launch fails ("is not a snap cgroup ..."), leaving
    # browser-loop.sh crash-looping and the Browser app blank.
    if [ "$(loginctl show-user "$APP_USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
        echo "== enabling lingering for $APP_USER (keeps /run/user/$APP_UID alive headless) =="
        run sudo loginctl enable-linger "$APP_USER"
    else
        echo "   lingering already enabled for $APP_USER"
    fi

    echo "== installing systemd unit =="
    sed \
        -e "s|@APP_USER@|$APP_USER|g" \
        -e "s|@APP_HOME@|$APP_HOME|g" \
        -e "s|@APP_UID@|$APP_UID|g" \
        -e "s|@DISPLAY_NUM@|$DISPLAY_NUM|g" \
        -e "s|@XPRA_PORT@|$XPRA_PORT|g" \
        -e "s|@LOOP_SCRIPT@|$LOOP_SCRIPT|g" \
        "$APP_DIR/systemd/vibetop-browser-xpra.service" \
        | write_root /etc/systemd/system/vibetop-browser-xpra.service
    # Second display for the X11 desktop (no Chromium child).
    sed \
        -e "s|@APP_USER@|$APP_USER|g" \
        -e "s|@APP_HOME@|$APP_HOME|g" \
        -e "s|@APP_UID@|$APP_UID|g" \
        -e "s|@X11_DISPLAY_NUM@|$X11_DISPLAY_NUM|g" \
        -e "s|@X11_XPRA_PORT@|$X11_XPRA_PORT|g" \
        "$APP_DIR/systemd/vibetop-x11-xpra.service" \
        | write_root /etc/systemd/system/vibetop-x11-xpra.service
    # Private D-Bus session for launcher apps (no service activation) so GNOME
    # apps don't hang ~25s on xdg-desktop-portal/at-spi activation timeouts.
    run sudo install -d -m 0755 /etc/vibetop
    sed -e "s|@APP_UID@|$APP_UID|g" "$APP_DIR/dbus/x11-dbus.conf" \
        | write_root /etc/vibetop/x11-dbus.conf
    sed \
        -e "s|@APP_USER@|$APP_USER|g" \
        -e "s|@APP_UID@|$APP_UID|g" \
        "$APP_DIR/systemd/vibetop-x11-dbus.service" \
        | write_root /etc/systemd/system/vibetop-x11-dbus.service
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
    LANDING_DIR="$(getent passwd "$APP_USER" | cut -d: -f6)/vibetop-www"
    run sudo install -m 0644 "$APP_DIR/xpra-patches.js" "$LANDING_DIR/xpra-patches.js"
    # Cache-buster derived from the patch file's CONTENT, so editing it always
    # changes the ?v= (busting nginx + the service worker) — no manual version
    # bump to forget. (This is how the "stale xpra-patches after deploy" class
    # is made impossible.)
    PATCH_VER=$(md5sum "$APP_DIR/xpra-patches.js" | cut -c1-10)
    sed -e "s|@XPRA_PORT@|$XPRA_PORT|g" \
        -e "s|@X11_XPRA_PORT@|$X11_XPRA_PORT|g" \
        -e "s|@X11_DISPLAY_NUM@|$X11_DISPLAY_NUM|g" \
        -e "s|@PATCH_VER@|$PATCH_VER|g" \
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

# 7. Enable & start ----------------------------------------------------------
if (( INSTALL_SYSTEMD )); then
    echo "== enabling and starting xpra =="
    run sudo systemctl enable --now vibetop-x11-dbus.service
    run sudo systemctl enable --now vibetop-browser-xpra.service
    run sudo systemctl enable --now vibetop-x11-xpra.service
fi

echo
echo "done. open:"
echo "  http://<host>/browser/"
