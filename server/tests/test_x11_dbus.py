"""The private per-user X11 D-Bus: it must be BINDABLE, and a broken one must
never tax the terminal-start path.

Both properties were violated at once on the reference host, and the visible
symptom was neither a D-Bus error nor a GUI bug: **adding a terminal tab took
3+ seconds**. `_user_terminal_setenvs` calls `_ensure_user_x11_dbus`, which
launched a dbus-daemon that died on the spot (it could not bind its socket) and
then slept out a 30 x 100ms wait for a socket that would never appear — a dead
3s before the shell's own units were even launched, on EVERY new tab, for every
user, since the feature shipped.

The bind failure was plain DAC, not the SELinux labelling the code was written
to solve: dbus-daemon runs AS the user (`systemd-run --uid`), so creating the
socket needs WRITE on the containing directory, and the socket went straight
into a 0755 root-owned one.
"""
import os
import time


def test_socket_dir_is_writable_by_the_user_who_binds(mgr, tmp_path, monkeypatch):
    """The daemon runs as the user and CREATES the socket, so it needs write on
    the parent. The flat `<dir>/<uid>` layout put it in a 0755 root-owned dir —
    every bind died 'Permission denied' and the bus was never once up.

    The ownership asymmetry that triggers it (root creates, the USER binds)
    cannot be reproduced in an unprivileged test — run as one user, the creator
    IS the binder and any mode works. So the assertion is the structural
    property that makes the bind possible at all, checked BEFORE touching the
    module's API surface so it fails on the old build for the real reason
    (socket directly in the shared root) rather than on a changed signature.
    """
    monkeypatch.setattr(mgr, "X11DBUS_DIR", str(tmp_path / "x11bus"))
    uid, gid = os.getuid(), os.getgid()

    assert os.path.dirname(mgr._x11dbus_socket(uid)) != mgr.X11DBUS_DIR, \
        "the socket must sit in a PER-USER subdirectory, not directly in the " \
        "shared root — the daemon runs as the user and cannot create a file " \
        "in a 0755 root-owned dir ('Failed to bind socket ... Permission denied')"

    assert mgr._ensure_x11dbus_dir(uid, gid) is not False
    sock = mgr._x11dbus_socket(uid)
    parent = os.path.dirname(sock)
    assert os.path.isdir(parent)
    assert os.stat(parent).st_uid == uid, "the binding user must own the dir"
    assert os.stat(parent).st_mode & 0o077 == 0, \
        "0700: a sticky shared dir would let another user pre-bind this path " \
        "and serve a forged session bus (the file-agent socket-squatting break)"

    # The real proof: a socket can actually be created there.
    import socket as _s
    s = _s.socket(_s.AF_UNIX)
    s.bind(sock)                      # would raise PermissionError on the old layout
    s.close()
    assert os.path.exists(sock)


def test_upgrade_from_the_flat_layout_clears_the_stale_socket(mgr, tmp_path, monkeypatch):
    """A host running the old code has the dead socket at exactly the path that
    must now become a directory. Without the unlink, makedirs raises
    FileExistsError on every call and the bus stays broken across restarts."""
    monkeypatch.setattr(mgr, "X11DBUS_DIR", str(tmp_path / "x11bus"))
    uid, gid = os.getuid(), os.getgid()
    os.makedirs(mgr.X11DBUS_DIR, mode=0o755, exist_ok=True)

    import socket as _s
    stale = _s.socket(_s.AF_UNIX)
    stale.bind(mgr._x11dbus_user_dir(uid))   # the OLD flat socket path
    stale.close()

    assert mgr._ensure_x11dbus_dir(uid, gid) is not False
    assert os.path.isdir(mgr._x11dbus_user_dir(uid))


def test_a_failed_bus_is_not_re_attempted_on_every_terminal_start(mgr, monkeypatch):
    """The cost being avoided is the wait itself, so a failure is remembered.
    Without this, a persistently broken bus re-runs stop + reset-failed +
    systemd-run + the full socket wait for EVERY tab the user opens."""
    user = "nobody-x11dbus-test"
    monkeypatch.setattr(mgr, "X11_DBUS_CONF", "/nonexistent/vibetop-x11-dbus.conf")
    mgr._note_failure("x11dbus:" + user, 300)

    calls = []
    monkeypatch.setattr(mgr, "_ensure_x11dbus_dir",
                        lambda *a, **k: calls.append(a) or True)

    t0 = time.monotonic()
    assert mgr._ensure_user_x11_dbus(user, os.getuid(), os.getgid()) is None
    assert time.monotonic() - t0 < 0.5, "a known-failed bus must be free"
    assert calls == [], "a known-failed bus must not even touch the filesystem"


def test_failure_memo_expires(mgr):
    """Short-lived on purpose: a redeploy or a repaired directory must take
    effect without restarting the manager."""
    mgr._note_failure("x11dbus:expiry-probe", 0.05)
    assert mgr._recent_failure("x11dbus:expiry-probe")
    time.sleep(0.12)
    assert not mgr._recent_failure("x11dbus:expiry-probe")


def test_the_wait_loop_gives_up_when_the_unit_is_already_dead(mgr, monkeypatch):
    """A dbus-daemon that cannot bind exits in milliseconds. Polling a path that
    will never exist for the full 3s window is exactly the dead time that made
    '+ tab' slow, so the loop asks systemd instead of sleeping out the clock."""
    assert mgr._unit_alive("vibetop-ux11dbus-definitely-not-a-real-unit.service") is False
