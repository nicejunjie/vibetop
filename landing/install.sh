#!/usr/bin/env bash
# Install the desktop UI and landing page into the location nginx serves from.
# Override DST_DIR=... to write somewhere else.
set -e
DIR="$(dirname "$(readlink -f "$0")")"
DST_DIR="${DST_DIR:-$HOME/claude-web-www}"
mkdir -p "$DST_DIR"
install -m 644 "$DIR/desktop.html" "$DST_DIR/index.html"
install -m 644 "$DIR/index.html" "$DST_DIR/landing.html"
install -m 644 "$DIR/filebrowser-patches.js" "$DST_DIR/filebrowser-patches.js"
install -m 644 "$DIR/monitor.html" "$DST_DIR/monitor.html"
echo "Installed desktop -> $DST_DIR/index.html"
echo "Installed landing -> $DST_DIR/landing.html"
echo "Installed filebrowser-patches.js -> $DST_DIR/filebrowser-patches.js"
echo "Installed monitor -> $DST_DIR/monitor.html"
