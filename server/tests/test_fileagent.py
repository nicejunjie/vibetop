"""apps/everyday/files/fileagent.py + the manager's /api/fs proxy plumbing (Files-native
phase 1, docs/files-native.md).

The agent is exercised FOR REAL: spawned as the current user (no systemd —
tests aren't root) on a tmp socket, driven through the manager's own
`_fs_call` so the wire protocol (send, half-close, read-to-EOF, one JSON
each way) is covered end to end. The authorization model itself (agent runs
AS the request user) is a launch-time property covered by the systemd-run
pattern shared with the terminal units; what tests can and do pin here is
that the ops never answer for a path the PROCESS cannot read."""

import json
import io
import os
import pwd
import shutil
import stat
import socket
import subprocess
import sys
import time
import zipfile

import pytest

import conftest as _c  # noqa: F401  (mgr fixture module path setup)

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AGENT = os.path.join(REPO, "apps", "everyday", "files", "fileagent.py")
# Fail on the REAL cause. When the tree was regrouped this path went stale and
# every test here errored with "agent never bound its socket" — the agent had
# simply never started, and the symptom pointed at the socket instead.
assert os.path.isfile(AGENT), f"fileagent not found at {AGENT}"


@pytest.fixture()
def agent(tmp_path):
    sock = str(tmp_path / "agent.sock")
    # The agent is a SEPARATE process, so an env var monkeypatched in the test
    # process would not reach it. Point its XDG_DATA_HOME at the tmp dir so the
    # trash tests never touch the developer's real ~/.local/share/Trash.
    env = dict(os.environ, XDG_DATA_HOME=str(tmp_path / "share"))
    proc = subprocess.Popen([sys.executable, AGENT, "--sock", sock], env=env,
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


def stream_call(mgr, sock, req):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    with s:
        s.connect(sock)
        s.sendall((json.dumps(req) + "\n").encode())
        head, rest = mgr._fs_read_header(s)
        body = bytearray(rest)
        if head.get("ok"):
            while len(body) < head["size"]:
                chunk = s.recv(65536)
                if not chunk:
                    break
                body.extend(chunk)
        return head, bytes(body)


def test_share_stream_opens_as_owner_and_fences_opened_file(mgr, agent, tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    public = root / "public.txt"
    public.write_bytes(b"0123456789")
    req = {"op": "share-download", "path": str(public), "root": str(root),
           "range": "bytes=2-5"}
    head, body = stream_call(mgr, agent, req)
    assert head["ok"] and head["partial"] and body == b"2345"

    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"secret")
    link = root / "link.txt"
    link.symlink_to(secret)
    head, body = stream_call(mgr, agent, {**req, "path": str(link), "range": ""})
    assert head["ok"] is False and body == b""

    if os.geteuid() != 0:
        public.chmod(0o000)
        try:
            head, body = stream_call(mgr, agent, req)
            assert head["ok"] is False and body == b""
        finally:
            public.chmod(0o600)


def test_share_archive_skips_hidden_and_escaped_files(mgr, agent, tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    folder = root / "docs"
    folder.mkdir()
    (folder / "good.txt").write_text("good")
    (folder / ".hidden").write_text("hidden")
    secret = tmp_path / "secret.txt"
    secret.write_text("secret")
    (folder / "escape.txt").symlink_to(secret)
    req = {"op": "share-zip", "path": str(folder), "root": str(root),
           "max_files": 10, "max_bytes": 1000}
    head, body = stream_call(mgr, agent, req)
    assert head["ok"] and head["size"] == len(body)
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        assert z.namelist() == ["docs/good.txt"]
        assert z.read("docs/good.txt") == b"good"
    head, _ = stream_call(mgr, agent, {**req, "max_files": 0})
    assert head["code"] == "etoobig"


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


def test_move_into_the_same_folder_is_a_noop(mgr, agent, tmp_path):
    """Cut + Paste in the same folder must do NOTHING. The collision suffixer
    saw the file already at the destination and produced "text (2).txt" while
    the original vanished — a rename the user never asked for."""
    f = tmp_path / "text.txt"
    f.write_text("keep me")
    r = call(mgr, agent, {"op": "move", "src": [str(f)], "dst": str(tmp_path)})
    assert r["ok"], r
    assert f.exists() and f.read_text() == "keep me"
    names = [n for n in os.listdir(str(tmp_path)) if not n.endswith(".sock")]
    assert names == ["text.txt"], f"the file was renamed or duplicated: {names}"


def test_bulk_over_the_cap_is_refused_not_silently_truncated(mgr, agent, tmp_path):
    """A too-large batch must FAIL LOUDLY. The old srcs[:500] slice answered
    ok:true to "delete 2000 files" with 1500 still on disk."""
    paths = [str(tmp_path / f"f{i}.txt") for i in range(3)]
    for p in paths:
        open(p, "w").write("x")
    # over BULK_MAX but comfortably under the agent's 256KB request cap, so the
    # "too many" answer is what we actually exercise
    huge = paths + [str(tmp_path / f"g{i}") for i in range(2100)]
    r = call(mgr, agent, {"op": "delete", "paths": huge})
    assert r["ok"] is False
    assert r["code"] == "etoomany"
    assert r["requested"] == len(huge)
    for p in paths:
        assert os.path.exists(p), "a refused batch must not delete anything"


# ---- trash ------------------------------------------------------------------

def test_trash_moves_to_the_freedesktop_bin_and_records_the_origin(mgr, agent, tmp_path):
    """Delete was the only unrecoverable action in the app. Trash must land in
    the REAL desktop bin — ~/.local/share/Trash/{files,info} — so GNOME Files
    and friends see the same items, and must record where each came from."""
    f = tmp_path / "doomed.txt"
    f.write_text("keep me somewhere")
    r = call(mgr, agent, {"op": "trash", "paths": [str(f)]})
    assert r["ok"], r
    assert not f.exists()
    files_dir = tmp_path / "share" / "Trash" / "files"
    info_dir = tmp_path / "share" / "Trash" / "info"
    assert (files_dir / "doomed.txt").read_text() == "keep me somewhere"
    info = (info_dir / "doomed.txt.trashinfo").read_text()
    assert "[Trash Info]" in info and str(f) in info and "DeletionDate=" in info


def test_untrash_puts_it_back_where_it_came_from(mgr, agent, tmp_path):
    sub = tmp_path / "deep" / "nest"
    sub.mkdir(parents=True)
    f = sub / "note.txt"
    f.write_text("hi")
    assert call(mgr, agent, {"op": "trash", "paths": [str(f)]})["ok"]
    assert not f.exists()
    listing = call(mgr, agent, {"op": "trashList"})
    assert listing["ok"] and len(listing["entries"]) == 1
    e = listing["entries"][0]
    assert e["trashName"] == "note.txt" and e["origin"] == str(f)
    r = call(mgr, agent, {"op": "untrash", "names": ["note.txt"]})
    assert r["ok"], r
    assert f.read_text() == "hi"


def test_untrash_recreates_a_deleted_parent(mgr, agent, tmp_path):
    sub = tmp_path / "gone"
    sub.mkdir()
    f = sub / "x.txt"
    f.write_text("x")
    call(mgr, agent, {"op": "trash", "paths": [str(f)]})
    shutil.rmtree(str(sub))
    assert call(mgr, agent, {"op": "untrash", "names": ["x.txt"]})["ok"]
    assert f.read_text() == "x"


def test_trash_name_collisions_keep_both(mgr, agent, tmp_path):
    for d in ("a", "b"):
        (tmp_path / d).mkdir()
        (tmp_path / d / "same.txt").write_text(d)
    call(mgr, agent, {"op": "trash", "paths": [str(tmp_path / "a" / "same.txt")]})
    call(mgr, agent, {"op": "trash", "paths": [str(tmp_path / "b" / "same.txt")]})
    files_dir = tmp_path / "share" / "Trash" / "files"
    assert sorted(os.listdir(files_dir)) == ["same.2.txt", "same.txt"]
    # and each still knows its own origin
    listing = call(mgr, agent, {"op": "trashList"})
    origins = sorted(e["origin"] for e in listing["entries"])
    assert origins == [str(tmp_path / "a" / "same.txt"), str(tmp_path / "b" / "same.txt")]


def test_trash_refuses_home_and_root_and_itself(mgr, agent, tmp_path):
    r = call(mgr, agent, {"op": "trash", "paths": ["/"]})
    assert r["ok"] is False
    r = call(mgr, agent, {"op": "trash", "paths": [os.path.expanduser("~")]})
    assert r["ok"] is False
    f = tmp_path / "t.txt"; f.write_text("t")
    call(mgr, agent, {"op": "trash", "paths": [str(f)]})
    again = call(mgr, agent, {"op": "trash",
                              "paths": [str(tmp_path / "share" / "Trash" / "files" / "t.txt")]})
    assert again["ok"] is False, "must not trash something already in the bin"


def test_trash_empty_clears_files_and_info(mgr, agent, tmp_path):
    for n in ("one.txt", "two.txt"):
        p = tmp_path / n
        p.write_text(n)
        call(mgr, agent, {"op": "trash", "paths": [str(p)]})
    r = call(mgr, agent, {"op": "trashEmpty"})
    assert r["ok"] and r["removed"] == 2
    assert os.listdir(tmp_path / "share" / "Trash" / "files") == []
    assert os.listdir(tmp_path / "share" / "Trash" / "info") == []


# ---- a search that gave up must not look like a search that found nothing ----

def _load_agent_module():
    """Import fileagent directly (not over the socket) so the timeout branch can
    be driven without waiting for a real search to run out of time."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("fileagent_probe", AGENT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_a_timed_out_search_keeps_what_it_found_and_says_it_timed_out(tmp_path, monkeypatch):
    """`TimeoutExpired.stdout` holds everything the search printed before the
    deadline, and it was thrown away -- so a timeout returned
    {"ok": true, "results": [], "truncated": true}, which the Files app draws as
    "No matches" because it returns on an empty list BEFORE it looks at
    `truncated`. Giving up was indistinguishable from finding nothing, and the
    user concluded their file did not exist.
    """
    fa = _load_agent_module()
    d = tmp_path / "big"
    d.mkdir()
    (d / "alpha.txt").write_text("x")
    (d / "beta.txt").write_text("y")

    def fake_run(cmd, **kw):
        raise subprocess.TimeoutExpired(
            cmd, kw.get("timeout", 6),
            output=f"{d}/alpha.txt\n{d}/beta.txt\n")

    # monkeypatch, not a bare assignment: `fa.subprocess` IS the global module
    # object, so setting .run on it leaks into every later test in the run.
    monkeypatch.setattr(fa.subprocess, "run", fake_run)
    r = fa.op_search({"path": str(d), "q": "a", "mode": "names"})
    assert r["ok"] and r["timedOut"] is True and r["truncated"] is True
    assert len(r["results"]) == 2, "the matches found before the deadline are real results"
    assert {os.path.basename(x["path"]) for x in r["results"]} == {"alpha.txt", "beta.txt"}


def test_a_genuine_no_match_is_not_reported_as_a_timeout(tmp_path):
    """The other half: `timedOut` is what lets the UI claim "No matches" at all,
    so it must be false whenever the search really did finish."""
    fa = _load_agent_module()
    d = tmp_path / "empty"
    d.mkdir()
    (d / "a.txt").write_text("x")
    r = fa.op_search({"path": str(d), "q": "zzz-nothing-like-this", "mode": "names"})
    assert r["ok"] and r["results"] == []
    assert r["timedOut"] is False, \
        '"No matches" is a claim about the disk — only a completed search may make it'


def test_the_search_deadline_is_below_the_transport_deadline(mgr):
    """SEARCH_TIMEOUT was EXACTLY _fs_call's transport timeout, so the agent's
    own answer lost the race by construction: the manager's socket read expired
    at the same instant the search did, and the caller saw a transport failure
    instead of the partial results the agent was about to send. Two deadlines
    that must differ, in two files, with nothing tying them together."""
    import inspect
    fa = _load_agent_module()
    transport = inspect.signature(mgr._fs_call).parameters["timeout"].default
    assert fa.SEARCH_TIMEOUT < transport, (
        f"agent SEARCH_TIMEOUT={fa.SEARCH_TIMEOUT} must leave room under the "
        f"manager's _fs_call timeout={transport} for the reply to be sent")


def test_hashing_a_huge_file_gives_up_instead_of_freezing_the_app(tmp_path, monkeypatch):
    """The agent's accept loop is SERIAL, so whatever it is hashing blocks that
    user's entire Files app. "Streams the file -- any size" meant a multi-GB file
    held it for minutes, long past the manager's 10s transport timeout: the
    caller had already given up while the agent kept going.

    A partial hash is worthless, so this reports the truth rather than a wrong
    digest -- the info dialog renders `error` when ok is false, so the user sees
    "too large" instead of a checksum that is silently for the first N bytes.
    """
    fa = _load_agent_module()
    f = tmp_path / "big.bin"
    f.write_bytes(b"x" * (4 << 20))
    monkeypatch.setattr(fa, "HASH_DEADLINE", 0.0)      # deadline already passed
    r = fa.op_hash({"path": str(f), "algo": "sha256"})
    assert r["ok"] is False and r["code"] == "etoobig"
    assert "hex" not in r, "a partial hash must never be presented as the checksum"
    assert r["bytes"] > 0 and "too large" in r["error"]


def test_a_normal_file_still_hashes(tmp_path):
    """The deadline must not break the ordinary case it was added to protect."""
    import hashlib
    fa = _load_agent_module()
    f = tmp_path / "small.txt"
    f.write_bytes(b"hello vibetop")
    r = fa.op_hash({"path": str(f), "algo": "sha256"})
    assert r["ok"] and r["hex"] == hashlib.sha256(b"hello vibetop").hexdigest()


def test_the_hash_deadline_is_below_the_transport_deadline(mgr):
    """Same trap as the search deadline: a bound at or above the transport
    timeout cannot deliver its own answer."""
    import inspect
    fa = _load_agent_module()
    transport = inspect.signature(mgr._fs_call).parameters["timeout"].default
    assert fa.HASH_DEADLINE < transport


def test_a_busy_agent_is_not_mistaken_for_a_dead_one(mgr, monkeypatch):
    """THE DANGEROUS ONE. `_ensure_fileagent` probes with a 1.5s timeout before
    every /api/fs/* request, and the agent's serial accept loop cannot answer
    while it is copying a large tree. The revive path then `systemctl stop`s the
    unit -- killing the copy partway through. Files polls the open folder every
    4s and any second tab or device asks too, so a long copy was reliably
    interrupted by the app's own background traffic.

    Reproduced against a stub: a healthy agent busy for 3s probes as
    {"ok": false, "code": "agent"} after exactly 1.5s, indistinguishable from a
    crash. systemd knows the difference, so ask it.
    """
    monkeypatch.setattr(mgr, "_fs_call",
                        lambda user, req, timeout=10.0: {"ok": False, "code": "agent"})
    stopped = []
    monkeypatch.setattr(mgr.subprocess, "run",
                        lambda a, **k: stopped.append(list(a)) or _Done())
    monkeypatch.setattr(mgr, "_unit_alive", lambda unit: True)      # alive, just busy

    ok, err = mgr._ensure_fileagent("alice")
    assert ok, f"a live-but-busy agent must be left alone, got {err}"
    assert not any("stop" in c for c in stopped), \
        f"the busy agent's unit was torn down anyway: {stopped}"


class _Done:
    returncode = 0
    stdout = ""
    stderr = ""
