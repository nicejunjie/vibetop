#!/usr/bin/env bash
# Per-user xpra display launcher (multi-user Phase 3c). Started AS the logged-in
# user by the manager via `systemd-run --uid` (installed world-executable to
# /usr/local/lib/vibetop, like the terminal helpers, so any user can exec it).
#
#   xpra-app.sh browser <display-num> <ws-port>   # a Chromium desktop
#   xpra-app.sh x11     <display-num> <ws-port>   # a bare desktop for GUI apps
#
# The flags match the (retired) shared vibetop-browser-xpra / vibetop-x11-xpra
# units — low-bandwidth tuning, uinput input, no audio/dbus/mdns. HOME /
# XDG_RUNTIME_DIR / XPRA_PING_TIMEOUT come from the manager's --setenv.
set -u
KIND="${1:?kind (browser|x11)}"; DISP="${2:?display number}"; PORT="${3:?ws port}"
case "$DISP$PORT" in *[!0-9]*) echo "display/port must be numeric" >&2; exit 2 ;; esac

COMMON=(
  --bind-ws=127.0.0.1:"$PORT" --ws-auth=none --html=on --daemon=no --xvfb=Xorg
  --start="matchbox-window-manager -use_titlebar no -use_desktop no"
  --clipboard=yes --clipboard-direction=both --sharing=yes --resize-display=yes
  --input-devices=uinput --notifications=no --mdns=no --printing=no
  --pulseaudio=no --speaker=off --microphone=off --dbus=no
  --encoding=auto --quality=80 --speed=100 --compression_level=3
  --video-scaling=auto --sync-xvfb=0 --bandwidth-detection=yes
  --min-quality=10 --min-speed=20
)

case "$KIND" in
  browser)
    exec /usr/bin/xpra start-desktop ":$DISP" "${COMMON[@]}" \
      --start="/usr/local/lib/vibetop/browser-loop.sh" ;;
  x11)
    # xhost +si:localuser:<self> so snap-confined apps (Firefox/Chromium) launched
    # outside xpra's own env can reach the display without the X auth cookie (the
    # snap `home` interface hides ~/.Xauthority). See docs/design-decisions.md.
    exec /usr/bin/xpra start-desktop ":$DISP" "${COMMON[@]}" \
      --start="xhost +si:localuser:$(id -un)" ;;
  *)
    echo "unknown kind: $KIND" >&2; exit 2 ;;
esac
