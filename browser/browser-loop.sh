#!/usr/bin/env bash
# Auto-restart wrapper for Chromium inside a user's Browser xpra display
# (xpra's --start runs a child ONCE; this loop respawns it on crash/exit).
# Runs AS the logged-in user, so the snap profile lives in THEIR home.
# Multi-user: self-contained (no install-time @BROWSER_CMD@ rendering) — the
# profile is derived from $HOME; override the binary with $BROWSER_BIN.
set -u
PROFILE="${1:-$HOME/snap/chromium/common/xpra-profile}"
BROWSER_BIN="${BROWSER_BIN:-/snap/bin/chromium}"
while true; do
    "$BROWSER_BIN" \
        --no-first-run --no-default-browser-check --restore-last-session \
        --start-maximized --disable-smooth-scrolling \
        --user-data-dir="$PROFILE"
    sleep 2
done
