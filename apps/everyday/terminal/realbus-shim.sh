#!/bin/sh
# vibetop real-bus shim for SNAP browsers (firefox / chromium).
#
# A vibetop terminal points DBUS_SESSION_BUS_ADDRESS at the per-user PRIVATE,
# activation-free D-Bus session bus (/run/user/<uid>/vibetop-x11-bus) so GNOME/GTK
# apps (evince, eog, …) start in ~0.1s instead of hanging ~40s on the
# xdg-desktop-portal / at-spi activation timeout (this headless desktop has no
# GNOME session to satisfy that activation).
#
# Snap apps are the exception: snap-confine creates a transient systemd scope via
# org.freedesktop.systemd1 on the session bus, which the activation-free bus does
# NOT provide, so a snap launched on it exits immediately with:
#   cannot create transient scope: … org.freedesktop.DBus.Error.ServiceUnknown:
#   The name org.freedesktop.systemd1 was not provided by any .service files
#
# This shim is installed as /usr/local/bin/firefox and /usr/local/bin/chromium
# (ahead of /snap/bin on PATH). It puts the REAL user session bus back for the
# snap, then hands off to the snap binary. Name is taken from $0 so one script
# serves both via symlinks. If no snap build exists it defers to the real binary.
app=$(basename "$0")
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/bus"
if [ -x "/snap/bin/$app" ]; then
    exec "/snap/bin/$app" "$@"
elif [ -x "/usr/bin/$app" ]; then
    exec "/usr/bin/$app" "$@"       # not a snap here — real bus is harmless
else
    echo "vibetop: $app not found" >&2
    exit 127
fi
