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
# Resolve Chromium instead of hardcoding the snap path. This script is what
# ACTUALLY launches the browser (xpra-app.sh --start=…, with no arguments), so a
# hardcoded /snap/bin/chromium meant that on any distro without snap the loop
# spun forever on "No such file or directory" and the Browser app was a blank
# desktop — while /browser/ still answered 200, because xpra's HTML5 server is up
# regardless of whether its child started. Keep this candidate list and the
# profile rule identical to _chromium_for_user() in terminal/terminal-manager.py:
# /api/browser/open must reuse the SAME --user-data-dir or a forwarded URL opens
# in a different instance.
if [ -z "${BROWSER_BIN:-}" ]; then
    for _c in /snap/bin/chromium /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/chrome; do
        [ -x "$_c" ] && { BROWSER_BIN="$_c"; break; }
    done
fi
if [ -z "${BROWSER_BIN:-}" ]; then
    echo "browser-loop: no chromium found (looked in /snap/bin, /usr/bin)" >&2
    exit 127
fi
case "$BROWSER_BIN" in
    /snap/*) _def_profile="$HOME/snap/chromium/common/xpra-profile" ;;
    *)       _def_profile="$HOME/.config/vibetop/chromium-profile" ;;
esac
PROFILE="${1:-$_def_profile}"
mkdir -p "$PROFILE" 2>/dev/null || true
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
