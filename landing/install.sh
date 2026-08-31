#!/usr/bin/env bash
# Install the desktop UI and landing page into the location nginx serves from.
# Override DST_DIR=... to write somewhere else.
set -euo pipefail

# Root is fine ONLY when the destination is stated explicitly (the system layout:
# deploy.sh runs this as the `vibetop` service account with DST_DIR=/opt/vibetop/
# vibetop-www). Without DST_DIR this script falls back to $HOME, and as root that
# is /root — files nginx will never serve. So in that case re-exec as the invoking
# human (legacy home install), or refuse.
if [ "$(id -u)" -eq 0 ] && [ -z "${DST_DIR:-}" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    echo "landing/install.sh: running as root with no DST_DIR — re-executing as \$SUDO_USER ($SUDO_USER) so files land in that user's home" >&2
    exec sudo -u "$SUDO_USER" -H "$0" "$@"
  fi
  echo "landing/install.sh: running as root with no DST_DIR — it would deploy to /root." >&2
  echo "Pass DST_DIR=<web root> (deploy.sh does this), or run it as your normal user." >&2
  exit 1
fi

DIR="$(dirname "$(readlink -f "$0")")"
DST_DIR="${DST_DIR:-$HOME/vibetop-www}"
DRY_RUN="${DRY_RUN:-0}"
case "${1:-}" in --dry-run|-n) DRY_RUN=1 ;; esac
run() { if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }

# Refuse an empty/`/`-rooted destination (e.g. $HOME unset) — a `mkdir -p ""`
# or writes to `/` are never intended.
if [ -z "$DST_DIR" ] || [ "$DST_DIR" = "/" ]; then
  echo "DST_DIR is empty or '/' (is \$HOME set?) — refusing." >&2
  exit 1
fi

run mkdir -p "$DST_DIR"
# Stamp the release number (root VERSION file) AND the service-worker build
# (sw.js VERSION) into the Start-menu build tag so neither can drift from a
# hardcoded literal — and so the build number renders instantly on load with NO
# runtime dependency (it reflects the actual shell that was deployed, which is
# exactly what "did a fresh shell load?" wants to show).
VERSION="$(cat "$DIR/../VERSION" 2>/dev/null | tr -d ' \t\r\n')"
VERSION="${VERSION:-dev}"
SW_VERSION="$(grep -o "VERSION = 'v[0-9]\+'" "$DIR/sw.js" 2>/dev/null | grep -o 'v[0-9]\+')"
SW_VERSION="${SW_VERSION:-?}"
if [ "$DRY_RUN" = 1 ]; then
  printf '+ install index.html (sed @VERSION@ -> %s, @SW_VERSION@ -> %s)\n' "$VERSION" "$SW_VERSION"
else
  sed -e "s/@VERSION@/$VERSION/g" -e "s/@SW_VERSION@/$SW_VERSION/g" "$DIR/desktop.html" > "$DST_DIR/index.html"
  chmod 644 "$DST_DIR/index.html"
fi
if [ "$DRY_RUN" = 1 ]; then
  printf '+ install rzdbg.html (sed @VERSION@ -> %s, @SW_VERSION@ -> %s)\n' "$VERSION" "$SW_VERSION"
else
  # Standalone cursor-diagnostic page — deliberately NOT in the service worker's
  # shell set, so it is network-only and can never be served stale.
  sed -e "s/@VERSION@/$VERSION/g" -e "s/@SW_VERSION@/$SW_VERSION/g" "$DIR/rzdbg.html" > "$DST_DIR/rzdbg.html"
  chmod 644 "$DST_DIR/rzdbg.html"
fi
run install -m 644 "$DIR/index.html" "$DST_DIR/landing.html"
if [ "$DRY_RUN" = 1 ]; then
  printf '+ install filebrowser-patches.js (sed @APP_HOME@ -> %s)\n' "$HOME"
else
  # Multi-user: each user's FileBrowser is rooted at THEIR home, so the app's
  # "home" IS the FileBrowser root — stamp @APP_HOME@ empty (home = "/"). MUST
  # stamp here too: deploy.sh runs landing/install.sh AFTER files/install.sh, so a
  # raw copy would clobber files/install.sh's stamped copy with a literal @APP_HOME@.
  sed -e "s|@APP_HOME@||g" "$DIR/filebrowser-patches.js" > "$DST_DIR/filebrowser-patches.js"
  chmod 644 "$DST_DIR/filebrowser-patches.js"
fi
run install -m 644 "$DIR/vibe-modal.js" "$DST_DIR/vibe-modal.js"
run install -m 644 "$DIR/coach.js" "$DST_DIR/coach.js"
run install -m 644 "$DIR/winmgr.js" "$DST_DIR/winmgr.js"
run install -m 644 "$DIR/keybar.js" "$DST_DIR/keybar.js"
run install -m 644 "$DIR/apph.js" "$DST_DIR/apph.js"
run install -m 644 "$DIR/gamescore.js" "$DST_DIR/gamescore.js"
run install -m 644 "$DIR/monitor.html" "$DST_DIR/monitor.html"
run install -m 644 "$DIR/token-stats.html" "$DST_DIR/token-stats.html"
run install -m 644 "$DIR/notes.html" "$DST_DIR/notes.html"
run install -m 644 "$DIR/upload.html" "$DST_DIR/upload.html"
run install -m 644 "$DIR/imageview.html" "$DST_DIR/imageview.html"
run install -m 644 "$DIR/filesx.html" "$DST_DIR/filesx.html"
# Games (Start ▸ Games) — self-contained pages, loaded on demand (not precached).
run install -m 644 "$DIR/minesweeper.html" "$DST_DIR/minesweeper.html"
run install -m 644 "$DIR/solitaire.html" "$DST_DIR/solitaire.html"
run install -m 644 "$DIR/game2048.html" "$DST_DIR/game2048.html"
run install -m 644 "$DIR/circuit.html" "$DST_DIR/circuit.html"
if [ "$DRY_RUN" = 1 ]; then
  printf '+ install files.html (sed @APP_HOME@ -> %s)\n' "$HOME"
else
  # Multi-user: FileBrowser is rooted at each user's home, so the default folder
  # is the FileBrowser root — stamp @APP_HOME@ empty (HOME = '/files/files/').
  sed -e "s|@APP_HOME@||g" "$DIR/files.html" > "$DST_DIR/files.html"
  chmod 644 "$DST_DIR/files.html"
fi
run install -m 644 "$DIR/x11launcher.html" "$DST_DIR/x11launcher.html"
run install -m 644 "$DIR/update.html" "$DST_DIR/update.html"
run install -m 644 "$DIR/config.html" "$DST_DIR/config.html"
run install -m 644 "$DIR/office-editor.html" "$DST_DIR/office-editor.html"
run install -m 644 "$DIR/video.html" "$DST_DIR/video.html"
run install -m 644 "$DIR/loggedout.html" "$DST_DIR/loggedout.html"
run install -m 644 "$DIR/login.html" "$DST_DIR/login.html"
# PWA: manifest, service worker, and home-screen icons
run install -m 644 "$DIR/manifest.json" "$DST_DIR/manifest.json"
run install -m 644 "$DIR/sw.js" "$DST_DIR/sw.js"
run install -d -m 755 "$DST_DIR/icons"
run install -m 644 "$DIR/icons/"*.png "$DST_DIR/icons/"
# favicon at the web root so the browser's automatic /favicon.ico probe resolves
run install -m 644 "$DIR/icons/favicon.ico" "$DST_DIR/favicon.ico"
run install -m 644 "$DIR/services.example.json" "$DST_DIR/services.example.json"
# Seed services.json from the example only if the host doesn't already have one
# (it's host-local and gitignored — never overwrite the real list on re-install).
if [ ! -f "$DST_DIR/services.json" ]; then
  run install -m 644 "$DIR/services.example.json" "$DST_DIR/services.json"
  echo "Created $DST_DIR/services.json (edit to list your host's services)"
fi
echo "Installed desktop -> $DST_DIR/index.html"
echo "Installed landing -> $DST_DIR/landing.html"
echo "Installed filebrowser-patches.js -> $DST_DIR/filebrowser-patches.js"
echo "Installed monitor -> $DST_DIR/monitor.html"
echo "Installed PWA -> $DST_DIR/manifest.json, sw.js, icons/"
