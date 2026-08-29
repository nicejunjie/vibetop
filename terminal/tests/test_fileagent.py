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
import pwd
import stat
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


# The agent under test runs as US, and the manager now verifies the socket's
# peer uid (SO_PEERCRED) before it will talk — so the harness has to claim the
# real account, exactly as production does, instead of a fictional "testuser".
ME = pwd.getpwuid(os.getuid()).pw_name


def call(mgr, sock, req):
    mgr_sock = mgr._fileagent_sock
    mgr._fileagent_sock = lambda user: sock
    try:
        return mgr._fs_call(ME, req)
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


# ---- phase 2: mutations -----------------------------------------------------

def test_mkdir_rename_and_eexist(mgr, agent, tmp_path):
    d = str(tmp_path / "newdir")
    assert call(mgr, agent, {"op": "mkdir", "path": d})["ok"]
    assert call(mgr, agent, {"op": "mkdir", "path": d})["code"] == "eexist"
    r = call(mgr, agent, {"op": "rename", "path": d, "to": "renamed"})
    assert r["ok"] and r["path"].endswith("/renamed")
    assert os.path.isdir(tmp_path / "renamed")
    assert call(mgr, agent, {"op": "rename", "path": str(tmp_path / "renamed"),
                             "to": "../escape"})["code"] == "einval"


def test_copy_move_with_collision_suffix(mgr, agent, tmp_path):
    src = tmp_path / "doc.txt"
    src.write_text("v1")
    dst = tmp_path / "out"
    dst.mkdir()
    r1 = call(mgr, agent, {"op": "copy", "src": [str(src)], "dst": str(dst)})
    assert r1["ok"] and (dst / "doc.txt").read_text() == "v1"
    r2 = call(mgr, agent, {"op": "copy", "src": [str(src)], "dst": str(dst)})
    assert r2["ok"] and r2["results"][0]["to"].endswith("doc (2).txt")
    mv = tmp_path / "mv.txt"
    mv.write_text("m")
    r3 = call(mgr, agent, {"op": "move", "src": [str(mv)], "dst": str(dst)})
    assert r3["ok"] and not mv.exists() and (dst / "mv.txt").exists()


def test_copy_directory_recursive(mgr, agent, tmp_path):
    d = tmp_path / "tree"
    (d / "sub").mkdir(parents=True)
    (d / "sub" / "f.txt").write_text("deep")
    dst = tmp_path / "into"
    dst.mkdir()
    r = call(mgr, agent, {"op": "copy", "src": [str(d)], "dst": str(dst)})
    assert r["ok"] and (dst / "tree" / "sub" / "f.txt").read_text() == "deep"


def test_delete_recursive_and_root_guard(mgr, agent, tmp_path):
    d = tmp_path / "gone"
    (d / "sub").mkdir(parents=True)
    (d / "sub" / "x").write_text("x")
    r = call(mgr, agent, {"op": "delete", "paths": [str(d)]})
    assert r["ok"] and not d.exists()
    guard = call(mgr, agent, {"op": "delete", "paths": ["/"]})
    assert guard["ok"] is False and guard["results"][0]["code"] == "einval"
    home = call(mgr, agent, {"op": "delete", "paths": [os.path.expanduser("~")]})
    assert home["ok"] is False and home["results"][0]["code"] == "einval"


def test_bulk_reports_per_item_and_partial_failure(mgr, agent, tmp_path):
    ok_f = tmp_path / "a.txt"
    ok_f.write_text("a")
    r = call(mgr, agent, {"op": "delete", "paths": [str(ok_f), str(tmp_path / "nope")]})
    assert r["ok"] is False
    assert r["results"][0]["ok"] is True and r["results"][1]["code"] == "enoent"


# ---- phase 2: streaming -----------------------------------------------------

def _stream(sock_path, header, body=b"", read_bytes=False):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(sock_path)
    s.sendall(json.dumps(header).encode() + b"\n" + body)
    if not read_bytes:
        try:
            s.shutdown(socket.SHUT_WR)
        except OSError:
            pass
    buf = bytearray()
    while True:
        c = s.recv(1 << 20)
        if not c:
            break
        buf.extend(c)
    s.close()
    return bytes(buf)


def test_upload_atomic_write(mgr, agent, tmp_path):
    dst = str(tmp_path / "up.bin")
    payload = os.urandom(300000)
    out = _stream(agent, {"op": "upload", "path": dst, "size": len(payload)}, payload)
    resp = json.loads(out.decode().strip())
    assert resp["ok"] and resp["size"] == len(payload)
    assert open(dst, "rb").read() == payload
    assert not [f for f in os.listdir(tmp_path) if f.startswith(".vtup-")], "temp file leaked"


def test_upload_short_body_never_lands(mgr, agent, tmp_path):
    dst = str(tmp_path / "short.bin")
    out = _stream(agent, {"op": "upload", "path": dst, "size": 1000}, b"only-a-bit")
    resp = json.loads(out.decode().strip())
    assert resp["ok"] is False and resp["code"] == "eio"
    assert not os.path.exists(dst)
    assert not [f for f in os.listdir(tmp_path) if f.startswith(".vtup-")]


def test_download_streams_exact_bytes(mgr, agent, tmp_path):
    f = tmp_path / "d.bin"
    payload = os.urandom(150000)
    f.write_bytes(payload)
    out = _stream(agent, {"op": "download", "path": str(f)}, read_bytes=True)
    nl = out.find(b"\n")
    head = json.loads(out[:nl].decode())
    assert head["ok"] and head["size"] == len(payload) and head["name"] == "d.bin"
    assert out[nl + 1:] == payload


def test_zip_streams_a_valid_archive(mgr, agent, tmp_path):
    import io
    import zipfile as zf
    d = tmp_path / "z"
    (d / "sub").mkdir(parents=True)
    (d / "sub" / "one.txt").write_text("uno")
    (d / "two.txt").write_text("dos")
    out = _stream(agent, {"op": "zip", "paths": [str(d)]}, read_bytes=True)
    nl = out.find(b"\n")
    head = json.loads(out[:nl].decode())
    assert head["ok"] and head["name"] == "z.zip"
    z = zf.ZipFile(io.BytesIO(out[nl + 1:]))
    names = sorted(z.namelist())
    assert names == ["z/sub/one.txt", "z/two.txt"]
    assert z.read("z/sub/one.txt") == b"uno"


# ---- phase 3: search + conditional save -------------------------------------

def test_search_names(mgr, agent, tmp_path):
    d = tmp_path / "sr"
    (d / "deep").mkdir(parents=True)
    (d / "deep" / "report-final.txt").write_text("x")
    (d / "other.log").write_text("y")
    r = call(mgr, agent, {"op": "search", "path": str(d), "q": "REPORT"})
    assert r["ok"] and len(r["results"]) == 1
    assert r["results"][0]["path"].endswith("deep/report-final.txt")
    assert r["results"][0]["isDir"] is False


def test_search_content_with_line_numbers(mgr, agent, tmp_path):
    d = tmp_path / "sc"
    d.mkdir()
    (d / "a.txt").write_text("one\nneedle here\nthree")
    (d / "b.txt").write_text("no match")
    r = call(mgr, agent, {"op": "search", "path": str(d), "q": "needle", "mode": "content"})
    assert r["ok"] and len(r["results"]) == 1
    hit = r["results"][0]
    assert hit["path"].endswith("a.txt") and hit["line"] == 2 and "needle" in hit["text"]


def test_search_requires_query(mgr, agent, tmp_path):
    r = call(mgr, agent, {"op": "search", "path": str(tmp_path), "q": "  "})
    assert r["ok"] is False and r["code"] == "einval"


def test_upload_ifmtime_conflict_refused(mgr, agent, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("v1")
    stale = int(os.stat(f).st_mtime) - 100
    out = _stream(agent, {"op": "upload", "path": str(f), "size": 2,
                          "ifMtime": stale}, b"v2")
    resp = json.loads(out.decode().strip())
    assert resp["ok"] is False and resp["code"] == "econflict"
    assert f.read_text() == "v1"                       # untouched
    ok_out = _stream(agent, {"op": "upload", "path": str(f), "size": 2,
                             "ifMtime": int(os.stat(f).st_mtime)}, b"v2")
    assert json.loads(ok_out.decode().strip())["ok"]
    assert f.read_text() == "v2"


# ---- parity: hash + mkdirs upload -------------------------------------------

def test_hash_matches_hashlib(mgr, agent, tmp_path):
    import hashlib
    f = tmp_path / "h.bin"
    f.write_bytes(b"vibetop hash me" * 1000)
    for algo in ("md5", "sha256"):
        r = call(mgr, agent, {"op": "hash", "path": str(f), "algo": algo})
        assert r["ok"] and r["hex"] == hashlib.new(algo, f.read_bytes()).hexdigest()
    bad = call(mgr, agent, {"op": "hash", "path": str(f), "algo": "crc32"})
    assert bad["ok"] is False and bad["code"] == "einval"


def test_upload_mkdirs_creates_the_chain(mgr, agent, tmp_path):
    dst = str(tmp_path / "a" / "b" / "c.txt")
    out = _stream(agent, {"op": "upload", "path": dst, "size": 5, "mkdirs": True}, b"hello")
    assert json.loads(out.decode().strip())["ok"]
    assert open(dst).read() == "hello"
    # without the flag, a missing chain still fails cleanly
    dst2 = str(tmp_path / "x" / "y.txt")
    out2 = _stream(agent, {"op": "upload", "path": dst2, "size": 2}, b"no")
    assert json.loads(out2.decode().strip())["ok"] is False


def _current_umask():
    m = os.umask(0o022)
    os.umask(m)
    return m


def test_upload_preserves_the_existing_file_mode(mgr, agent, tmp_path):
    """Saving an existing file must not change its permissions. The write goes
    through mkstemp (0600) + os.replace, which carries the TEMP file's bits onto
    the destination — so editing a 0755 script in the Files editor silently
    un-executed it and dropped group/other access."""
    f = tmp_path / "script.sh"
    f.write_text("#!/bin/sh\necho old\n")
    os.chmod(str(f), 0o755)
    body = b"#!/bin/sh\necho new\n"
    out = _stream(agent, {"op": "upload", "path": str(f), "size": len(body)}, body)
    assert json.loads(out.decode().strip())["ok"]
    assert f.read_text() == "#!/bin/sh\necho new\n"
    assert stat.S_IMODE(os.stat(str(f)).st_mode) == 0o755, "the exec bit was lost on save"


def test_upload_of_a_new_file_is_not_world_readable_by_accident(mgr, agent, tmp_path):
    """A brand-new upload has no previous mode to keep; it must land at the
    umask default rather than mkstemp's private 0600 (which would make every
    uploaded file unreadable to the user's own group/services)."""
    dst = str(tmp_path / "fresh.txt")
    out = _stream(agent, {"op": "upload", "path": dst, "size": 2}, b"hi")
    assert json.loads(out.decode().strip())["ok"]
    mode = stat.S_IMODE(os.stat(dst).st_mode)
    assert mode & 0o400, "owner cannot read the file it just uploaded"
    assert mode == (0o666 & ~_current_umask()), f"unexpected mode {oct(mode)}"
