#!/usr/bin/env bash
# Install the Vibetop "Files" app.
#
# The app itself is vibetop's own code and needs no service: `filesx.html` is a
# static page deployed by shell/install.sh, and every listing/mutation goes
# through the per-user file agent (`fileagent.py`, launched on demand by the
# manager straight from the checkout). So this installer only owns the three
# things around it:
#
#   1. ffmpeg        — powers the in-Files video player (optional).
#   2. the /fileview/ nginx snippet — raw-file serving for "Open in Browser".
#   3. cleanup       — retire FileBrowser, which used to BE this app (its
#                      binary, its legacy service, its per-user transient units
#                      and its /files/ nginx snippet). Idempotent, and a no-op
#                      on a host that never had it.
#
# It also stops any running per-user file agents so new agent code takes effect
# immediately. Idempotent and re-runnable. --dry-run previews.
#
# Run AFTER server/install.sh (which creates the nginx extras dir + include).
#
# Configurable via env vars (all optional):
#   APP_USER         system user that owns the files          (default: invoking user)
#   APP_DIR          where this script lives                  (default: script dir)
#   INSTALL_DEPS     install ffmpeg if absent                  (default 1)
#   INSTALL_SYSTEMD  touch systemd units (the FB cleanup)      (default 1)
#   INSTALL_NGINX    write the /fileview/ nginx snippet        (default 1)
#   DRY_RUN          print actions without executing           (default 0)
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
if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "APP_USER '$APP_USER' does not exist on this system" >&2; exit 1
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
NGINX_EXTRAS="/etc/nginx/snippets/vibetop-extras.d"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
DRY_RUN="${DRY_RUN:-0}"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n) DRY_RUN=1 ;;
        --help|-h) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

run() { if (( DRY_RUN )); then printf '+ %s\n' "$*"; else "$@"; fi; }
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

cat <<EOF
files install
  user        : $APP_USER   (home $APP_HOME)
  app         : filesx.html (static, deployed by shell/install.sh) + fileagent.py
  nginx       : $NGINX_EXTRAS/fileview.conf   ->  /fileview/
  deps        : $INSTALL_DEPS   systemd: $INSTALL_SYSTEMD   nginx: $INSTALL_NGINX
  dry run     : $DRY_RUN
EOF
echo

# 1. ffmpeg — powers the in-Files video player (probe tracks, remux per audio
# track to a browser-playable MP4, extract subtitles to WebVTT). The manager
# degrades gracefully if it's absent (the player shows "ffmpeg not installed").
if (( INSTALL_DEPS )) && ! command -v ffprobe >/dev/null 2>&1; then
    echo "== installing ffmpeg (in-Files video player) =="
    # ffmpeg is OPTIONAL, so a failure must not abort the deploy — but it must
    # also not be silent. The previous form was
    #     run sudo apt-get update -qq && run sudo apt-get install -y ffmpeg
    # where, as a non-final element of an `&&` list, the failure was exempt from
    # `set -e`: on any distro without an ffmpeg package the installer sailed on
    # reporting success while the video player was quietly degraded.
    if vt_pkg_refresh && vt_pkg_install ffmpeg; then
        :
    else
        echo "   NOTE: ffmpeg not installed (no package on ${VT_OS_ID:-this distro}?)." >&2
        echo "   The in-Files video player will show 'ffmpeg not installed'; everything else works." >&2
    fi
fi

# 2. Retire FileBrowser -----------------------------------------------------
# FileBrowser WAS this app until the native Files app replaced it. A host that
# ran it still has: per-user transient units (vibetop-ufiles-<user>.service,
# started by the manager), possibly the legacy shared unit from a pre-multi-user
# deploy, the binary this installer downloaded, and the /files/ nginx snippet
# this installer wrote. All four are removed here — once, and then this section
# is a no-op every later deploy. USER DATA IS NEVER TOUCHED: each user's
# ~/.config/filebrowser/filebrowser.db is left exactly where it is (it is
# theirs, it is tiny, and deleting files in a home directory is not an
# installer's business).
echo "== retiring FileBrowser (the app it replaced) =="
if (( INSTALL_SYSTEMD )) && command -v systemctl >/dev/null 2>&1; then
    # Per-user transient units, if any are still running.
    fb_units=$(systemctl list-units --all --plain --no-legend 'vibetop-ufiles-*.service' \
                 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$fb_units" ]; then
        echo "   stopping per-user units: $(echo "$fb_units" | tr '\n' ' ')"
        # shellcheck disable=SC2086
        run sudo systemctl stop $fb_units 2>/dev/null || true
        # shellcheck disable=SC2086
        run sudo systemctl reset-failed $fb_units 2>/dev/null || true
    fi
    # The legacy shared unit from a pre-multi-user deploy.
    run sudo systemctl disable --now vibetop-filebrowser.service 2>/dev/null || true
    if [ -f /etc/systemd/system/vibetop-filebrowser.service ]; then
        run sudo rm -f /etc/systemd/system/vibetop-filebrowser.service
        run sudo systemctl daemon-reload
    fi
fi
# The binary this installer used to download. Only ever ours (/usr/local/bin).
if [ -e /usr/local/bin/filebrowser ]; then
    echo "   removing /usr/local/bin/filebrowser"
    run sudo rm -f /usr/local/bin/filebrowser
fi
# The /files/ nginx snippet this installer used to write. It proxies to a
# per-user port that authcheck no longer returns, so leaving it behind would
# serve an error page at a URL nothing links to.
if [ -e "$NGINX_EXTRAS/filebrowser.conf" ]; then
    echo "   removing $NGINX_EXTRAS/filebrowser.conf"
    run sudo rm -f "$NGINX_EXTRAS/filebrowser.conf"
    NGINX_DIRTY=1
fi

# 3. nginx snippet -----------------------------------------------------------
if (( INSTALL_NGINX )); then
    echo "== installing /fileview/ nginx snippet =="
    if ! [ -d "$NGINX_EXTRAS" ]; then
        echo "   $NGINX_EXTRAS does not exist — run server/install.sh first" >&2
        exit 1
    fi
    nginx_write "$NGINX_EXTRAS/fileview.conf" <"$APP_DIR/nginx/fileview.conf" || NGINX_DIRTY=1
fi
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

echo
echo "done. the Files app is served from the web root (/files.html)."

# Files-native: restart any running per-user file agents so a deploy takes
# effect immediately (they respawn on demand with the new code; without this
# an old agent lingers up to its 15-min idle exit and answers with the old
# op set — bit v1.19.100's hash op on deploy day).
if [ "${INSTALL_SYSTEMD:-1}" != "-1" ]; then
  systemctl list-units --plain --no-legend 'vibetop-fileagent-*.service' 2>/dev/null \
    | awk '{print $1}' | xargs -r systemctl stop 2>/dev/null || true
fi
