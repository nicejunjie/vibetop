#!/usr/bin/env bash
# Auto-restart wrapper for Chromium inside a user's Browser xpra display
# (xpra's --start runs a child ONCE; this loop respawns it on crash/exit).
# Runs AS the logged-in user, so the snap profile lives in THEIR home.
#
# SHAPE-AWARE (multi-user, per-device): $PROFILE/vibetop-shape holds "mobile" or
# "desktop" (written by the manager's POST /api/browser/shape when a device
# "claims" the browser). Each (re)spawn reads it and picks the flag set — so the
# host browser renders a real MOBILE browser (mobile UA + touch + 2x DPI) for a
# phone client and a desktop browser for a desktop client, from the SAME profile
# (--restore-last-session carries tabs/logins across, so it's one browsing
# identity that follows you between devices, still on the host's network). The
# manager "reshapes" by SIGTERMing chromium; this loop respawns it. The UA Chrome
# version is derived live so the UA can't drift from the real binary.
set -u
PROFILE="${1:-$HOME/snap/chromium/common/xpra-profile}"
BROWSER_BIN="${BROWSER_BIN:-/snap/bin/chromium}"
while true; do
    EXTRA=()
    if [ "$(cat "$PROFILE/vibetop-shape" 2>/dev/null)" = "mobile" ]; then
        # Mobile shape: mobile UA (sites serve their real phone layout) + touch +
        # overlay scrollbars. NOTE: 2x-DPI crispness (--force-device-scale-factor=2)
        # is deliberately NOT here yet — it requires pairing with a client-side
        # display upscale (xpra client.scale=2) or the CSS viewport halves to ~196px
        # and the layout over-zooms. Ship mobile layout first; add DPI as a paired
        # follow-up. UA Chrome version derived live so it can't drift from the binary.
        CV="$("$BROWSER_BIN" --version 2>/dev/null | grep -o '[0-9]\+' | head -1)"
        EXTRA=( --user-agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CV:-126}.0.0.0 Mobile Safari/537.36"
                --use-mobile-user-agent --touch-events=enabled
                --enable-features=OverlayScrollbar )
    fi
    "$BROWSER_BIN" \
        --no-first-run --no-default-browser-check --restore-last-session \
        --start-maximized --disable-smooth-scrolling \
        "${EXTRA[@]}" \
        --user-data-dir="$PROFILE"
    sleep 2
done
