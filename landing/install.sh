#!/usr/bin/env bash
# Install the desktop UI and landing page into the location nginx serves from.
# Override DST_DIR=... to write somewhere else.
set -e
DIR="$(dirname "$(readlink -f "$0")")"
DST_DIR="${DST_DIR:-$HOME/claude-web-www}"
DRY_RUN="${DRY_RUN:-0}"
case "${1:-}" in --dry-run|-n) DRY_RUN=1 ;; esac
run() { if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }

run mkdir -p "$DST_DIR"
run install -m 644 "$DIR/desktop.html" "$DST_DIR/index.html"
run install -m 644 "$DIR/index.html" "$DST_DIR/landing.html"
run install -m 644 "$DIR/filebrowser-patches.js" "$DST_DIR/filebrowser-patches.js"
run install -m 644 "$DIR/monitor.html" "$DST_DIR/monitor.html"
run install -m 644 "$DIR/notes.html" "$DST_DIR/notes.html"
run install -m 644 "$DIR/upload.html" "$DST_DIR/upload.html"
run install -m 644 "$DIR/update.html" "$DST_DIR/update.html"
run install -m 644 "$DIR/office-editor.html" "$DST_DIR/office-editor.html"
# PWA: manifest, service worker, and home-screen icons
run install -m 644 "$DIR/manifest.json" "$DST_DIR/manifest.json"
run install -m 644 "$DIR/sw.js" "$DST_DIR/sw.js"
run install -d -m 755 "$DST_DIR/icons"
run install -m 644 "$DIR/icons/"*.png "$DST_DIR/icons/"
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
