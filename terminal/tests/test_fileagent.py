"""files/fileagent.py + the manager's /api/fs proxy plumbing (Files-native
phase 1, docs/files-native.md).

The agent is exercised FOR REAL: spawned as the current user (no systemd —
tests aren't root) on a tmp socket, driven through the manager's own
`_fs_call` so the wire protocol (send, half-close, read-to-EOF, one JSON
each way) is covered end to end. The authorization model itself (agent runs
AS the request user) is a launch-time property covered by the systemd-run
pattern shared with the terminal units; what tests can and do pin here is
that the ops never answer for a path the PROCESS cannot read."""

import json
import os
import socket
import subprocess
import sys
import time

import pytest

import conftest as _c  # noqa: F401  (mgr fixture module path setup)

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AGENT = os.path.join(REPO, "files", "fileagent.py")


@pytest.fixture()
def agent(tmp_path):
    sock = str(tmp_path / "agent.sock")
    proc = subprocess.Popen([sys.executable, AGENT, "--sock", sock],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and not os.path.exists(sock):
        time.sleep(0.02)
    assert os.path.exists(sock), "agent never bound its socket"
    yield sock
    proc.terminate()
    proc.wait(timeout=5)


def call(mgr, sock, req):
    mgr_sock = mgr._fileagent_sock
    mgr._fileagent_sock = lambda user: sock
    try:
        return mgr._fs_call("testuser", req)
    finally:
        mgr._fileagent_sock = mgr_sock


def test_home_answers_the_process_home(mgr, agent):
    r = call(mgr, agent, {"op": "home"})
    assert r["ok"] and r["home"] == os.path.expanduser("~")


def test_list_returns_sorted_entries_dirs_first(mgr, agent, tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    (d / "b.txt").write_text("x")
    (d / "a.txt").write_text("y")
    (d / "zdir").mkdir()
    r = call(mgr, agent, {"op": "list", "path": str(d)})
    assert r["ok"] and not r["truncated"]
    names = [e["name"] for e in r["entries"]]
    assert names == ["zdir", "a.txt", "b.txt"]          # dirs first, then names
    byname = {e["name"]: e for e in r["entries"]}
    assert byname["zdir"]["isDir"] is True
    assert byname["a.txt"]["isDir"] is False
    assert byname["a.txt"]["size"] == 1
    assert isinstance(byname["a.txt"]["mtime"], int)


def test_list_missing_dir_is_a_clean_error(mgr, agent, tmp_path):
    r = call(mgr, agent, {"op": "list", "path": str(tmp_path / "nope")})
    assert r["ok"] is False and r["code"] == "enoent"


def test_relative_paths_are_refused(mgr, agent):
    r = call(mgr, agent, {"op": "list", "path": "etc"})
    assert r["ok"] is False and r["code"] == "einval"


def test_unreadable_dir_answers_eperm_not_content(mgr, agent, tmp_path):
    if os.geteuid() == 0:
        pytest.skip("root bypasses permissions; the fence needs a non-root run")
    d = tmp_path / "locked"
    d.mkdir()
    (d / "secret").write_text("s")
    d.chmod(0o000)
    try:
        r = call(mgr, agent, {"op": "list", "path": str(d)})
        assert r["ok"] is False and r["code"] == "eperm"
    finally:
        d.chmod(0o700)


def test_read_returns_text_and_caps(mgr, agent, tmp_path):
    f = tmp_path / "note.txt"
    f.write_text("hello vibetop")
    r = call(mgr, agent, {"op": "read", "path": str(f)})
    assert r["ok"] and r["text"] == "hello vibetop"
    assert r["size"] == 13 and not r["truncated"] and not r["binary"]
    big = tmp_path / "big.txt"
    big.write_bytes(b"a" * 5000)
    r2 = call(mgr, agent, {"op": "read", "path": str(big), "max": 100})
    assert r2["ok"] and r2["truncated"] and len(r2["text"]) == 100 and r2["size"] == 5000


def test_read_flags_binary_without_shipping_garbage(mgr, agent, tmp_path):
    f = tmp_path / "blob.bin"
    f.write_bytes(b"\x00\x01\x02real bytes")
    r = call(mgr, agent, {"op": "read", "path": str(f)})
    assert r["ok"] and r["binary"] is True and r["text"] == ""


def test_stat_single_entry(mgr, agent, tmp_path):
    f = tmp_path / "x.md"
    f.write_text("m")
    r = call(mgr, agent, {"op": "stat", "path": str(f)})
    assert r["ok"] and r["stat"]["name"] == "x.md" and r["stat"]["size"] == 1


def test_unknown_op_is_a_clean_error(mgr, agent):
    r = call(mgr, agent, {"op": "chmod", "path": "/etc"})
    assert r["ok"] is False and r["code"] == "einval"


def test_fs_call_transport_failure_is_soft(mgr, tmp_path):
    mgr_sock = mgr._fileagent_sock
    mgr._fileagent_sock = lambda user: str(tmp_path / "gone.sock")
    try:
        r = mgr._fs_call("testuser", {"op": "home"})
    finally:
        mgr._fileagent_sock = mgr_sock
    assert r["ok"] is False and r["code"] == "agent"
