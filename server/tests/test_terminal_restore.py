"""Terminals come back after a reboot: output, working directory, tab name, tab.

A reboot used to lose every terminal outright: the session daemon holds its
output in memory, and a fresh start for the same number deliberately forgot the
tab name. Now each daemon saves its ring and its shell's cwd under the user's
home, and the manager treats a terminal with saved state as an open tab that
restores on its first request. Closing a tab or logging out still forgets it."""
import json
import os
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid

import pytest

from conftest import _FakeCompleted, _TERM_APP_DIR

SESSION = os.path.join(_TERM_APP_DIR, "vibetop-session")


# ---- the daemon's save / load ----------------------------------------------

def test_saved_state_round_trips_privately(csession, tmp_path):
    state = tmp_path / "terminals" / "3"
    csession.save_session_state(str(state), b"hello\r\n", "/srv/work", now=1_700_000_000)
    assert stat.S_IMODE(os.stat(state).st_mode) == 0o700
    for name in ("scrollback", "meta.json"):
        assert stat.S_IMODE(os.stat(state / name).st_mode) == 0o600, name
    assert csession.load_session_state(str(state), 1 << 20) == (b"hello\r\n", "/srv/work", 1_700_000_000)


def test_load_keeps_only_the_newest_bytes_that_fit_the_ring(csession, tmp_path):
    csession.save_session_state(str(tmp_path), b"old-" + b"x" * 100 + b"-new", None)
    output, cwd, _ = csession.load_session_state(str(tmp_path), 8)
    assert output == b"xxxx-new" and cwd is None


@pytest.mark.parametrize("meta", [None, b"not json", b"[1, 2]"])
def test_missing_or_corrupt_state_is_not_restored(csession, tmp_path, meta):
    if meta is not None:
        (tmp_path / "meta.json").write_bytes(meta)
    assert csession.load_session_state(str(tmp_path), 1024) is None
    assert csession.load_session_state(None, 1024) is None


def test_banner_resets_whatever_the_old_screen_was_doing(csession):
    banner = csession.restored_banner(1_700_000_000)
    reset = banner.split(b"\r\n", 1)[0]
    assert reset.startswith(b"\x18")                      # abort a cut-off escape sequence
    for mode in (b"\x1b[?1049l", b"\x1b[?1000l", b"\x1b[?1006l", b"\x1b[?25h", b"\x1b[0m"):
        assert mode in reset, mode
    assert b"restored after restart" in banner and b"have stopped" in banner


# ---- the real daemon across a simulated reboot ------------------------------

def _serve(instance, state_dir, cwd):
    env = dict(os.environ, VIBETOP_TERM_STATE=str(state_dir), HOME=str(cwd),
               CLAUDE_SESSION_BUFSIZE=str(256 * 1024))
    env.pop("BASH_ENV", None)
    proc = subprocess.Popen([sys.executable, SESSION, "serve", instance], cwd=str(cwd), env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sock = f"/tmp/vibetop-session-{instance}.sock"
    deadline = time.time() + 10
    while not os.path.exists(sock):
        assert proc.poll() is None and time.time() < deadline, "daemon never bound its socket"
        time.sleep(0.05)
    return proc, sock


def _talk(sock_path, text=b"", until=b"", wait=10.0):
    s = socket.socket(socket.AF_UNIX)
    s.connect(sock_path)
    s.settimeout(0.2)
    if text:
        time.sleep(0.3)
        s.sendall(text)
    got, deadline = b"", time.time() + wait
    while time.time() < deadline and (not until or until not in got):
        try:
            chunk = s.recv(65536)
            if not chunk:
                break
            got += chunk
        except socket.timeout:
            if not until:
                break
    s.close()
    return got


@pytest.mark.skipif(not os.path.exists("/bin/bash") or not os.path.isdir("/proc/self"),
                    reason="needs bash and /proc")
def test_a_restarted_daemon_brings_back_output_and_directory(tmp_path):
    instance = "restoretest-" + uuid.uuid4().hex[:8]
    state, work = tmp_path / "state", tmp_path / "project dir"
    work.mkdir()
    proc, sock = _serve(instance, state, tmp_path)
    try:
        _talk(sock, b"cd '%s' && echo BEFORE-$((6*7))\r" % str(work).encode(), until=b"BEFORE-42")
    finally:
        proc.send_signal(signal.SIGTERM)       # what a host shutdown sends
        proc.wait(timeout=10)
    meta = json.loads((state / "meta.json").read_text())
    assert meta["cwd"] == str(work)
    assert b"BEFORE-42" in (state / "scrollback").read_bytes()

    proc, sock = _serve(instance, state, tmp_path)
    try:
        replay = _talk(sock, b"echo AT-$(pwd)-$((40+2))END\r", until=b"-42END")
        assert b"BEFORE-42" in replay, "old output was not restored"
        assert b"restored after restart" in replay
        assert replay.index(b"BEFORE-42") < replay.index(b"restored after restart")
        assert b"AT-" + str(work).encode() + b"-42END" in replay, "shell did not reopen in its old directory"
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=10)


# ---- the manager -----------------------------------------------------------

@pytest.fixture()
def saved(home):
    def make(n, cwd="/tmp"):
        d = home / ".local/state/vibetop/terminals" / str(n)
        d.mkdir(parents=True, exist_ok=True)
        (d / "meta.json").write_text(json.dumps({"v": 1, "cwd": cwd, "saved": 1}))
        (d / "scrollback").write_bytes(b"x")
        return d
    return make


def test_restorable_terminals_reopen_as_tabs(client, mgr, saved, monkeypatch):
    saved(2); saved(7)
    d = saved(9); (d / "meta.json").unlink()                 # half-written: ignored
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [1])
    status, body = client.get("/api/terminals/status")
    assert status == 200 and body["running"] == [1, 2, 7]


def test_start_points_the_daemon_at_its_state_and_keeps_the_name(mgr, home, stubs, saved, monkeypatch):
    user = mgr.APP_USER
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [])
    saved(4)
    forgot = []
    monkeypatch.setattr(mgr, "_forget_tab_name", lambda u, n: forgot.append(n))
    mgr._cache.clear()
    ok, _ = mgr._start_user_terminal_locked(user, 4)
    assert ok
    sess = [c for c in stubs["run"] if isinstance(c, list) and "systemd-run" in c
            and any(a.startswith("--unit=vibetop-uterm-") for a in c)][0]
    assert "VIBETOP_TERM_STATE=" + str(home / ".local/state/vibetop/terminals/4") in sess
    assert forgot == [], "a restored terminal is the same terminal; it keeps its name"
    mgr._start_user_terminal_locked(user, 5)                 # nothing saved: fresh
    assert forgot == [5]


def test_closing_a_tab_forgets_its_state_as_the_user(client, mgr, home, stubs, saved):
    path = saved(3)
    status, _ = client.post("/api/terminals/3/stop", {})
    assert status == 200
    runs = [c for c in stubs["run"] if isinstance(c, list)]
    stop = runs.index(next(c for c in runs if c[:2] == ["systemctl", "stop"]))
    rm = runs.index(["runuser", "-u", mgr.APP_USER, "--", "rm", "-rf", "--", str(path)])
    assert stop < rm, "state must be deleted after the daemon stops, or it saves again"


def test_logout_forgets_every_saved_terminal(client, mgr, home, stubs, saved):
    saved(1); saved(2)
    client.post("/api/reset", {})
    assert ["runuser", "-u", mgr.APP_USER, "--", "rm", "-rf", "--",
            str(home / ".local/state/vibetop/terminals")] in stubs["run"]


def test_open_at_skips_a_number_waiting_to_be_restored(client, mgr, saved, monkeypatch):
    saved(1)
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [])
    monkeypatch.setattr(mgr, "_inject_terminal", lambda u, n, t: (True, None))
    status, body = client.post("/api/terminals/open-at", {"path": "/tmp"})
    assert status == 200 and body["instance"] == 2
