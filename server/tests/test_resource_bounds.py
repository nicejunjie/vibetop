"""Bounds on work the shared, privileged manager will do for one request.

The manager is a ThreadingHTTPServer running as root for every user, with no
connection limit. Anything that lets one caller multiply CPU, memory, disk or
threads inside it degrades the API for everybody — so each of these is about the
BOUND, not about who is allowed to ask.
"""
import os
import threading
import time

import pytest


# ---- VT-03: folder shares -------------------------------------------------

def test_a_head_on_a_folder_share_builds_no_archive(mgr, monkeypatch, tmp_path):
    """`self.command == "HEAD"` was checked AFTER the walk, the compression and
    the getsize. One cheap packet cost a full archive of a tree up to 50k files /
    10 GiB, in the root process, for anyone holding the link."""
    built = []
    monkeypatch.setattr(mgr.zipfile, "ZipFile",
                        lambda *a, **k: built.append(a) or pytest.fail("archive built for HEAD"))

    class H:
        command = "HEAD"
        _serve_share_zip = mgr.Handler._serve_share_zip
        sent = []
        def send_response(self, c): self.sent.append(("status", c))
        def send_header(self, k, v): self.sent.append((k, v))
        def end_headers(self): self.sent.append(("end", None))
        def _share_safety_headers(self): pass
    h = H()
    h._serve_share_zip(str(tmp_path), "docs", owner=None, token="tok")
    assert ("status", 200) in h.sent
    assert not built
    assert any(k == "Content-Disposition" and "docs.zip" in v for k, v in h.sent)


def test_the_archive_gate_admits_one_build_per_token(mgr):
    """Legitimate use is one person clicking Download. A second concurrent build
    of the SAME archive is a double-click or an attack; either way the answer is
    not a second walk of the same tree."""
    with mgr._zip_slot("tokA"):
        with pytest.raises(mgr._ZipBusy):
            mgr._zip_slot("tokA").__enter__()
    # released again afterwards
    with mgr._zip_slot("tokA"):
        pass


def test_the_archive_gate_has_a_global_ceiling(mgr, monkeypatch):
    """Distinct tokens must not multiply without limit either — one leaked link
    per share is still N concurrent compressions."""
    monkeypatch.setattr(mgr, "SHARE_ZIP_MAX_CONCURRENT", 2)
    a = mgr._zip_slot("t1").__enter__()
    b = mgr._zip_slot("t2").__enter__()
    try:
        with pytest.raises(mgr._ZipBusy):
            mgr._zip_slot("t3").__enter__()
    finally:
        a.__exit__(None, None, None)
        b.__exit__(None, None, None)
    with mgr._zip_slot("t3"):          # a freed slot is reusable
        pass


def test_an_aborted_download_does_not_wedge_the_gate(mgr):
    """The slot is released in `finally`, so a client that disconnects mid-stream
    (or a tree that raises) cannot leave the gate closed for everyone."""
    try:
        with mgr._zip_slot("tok"):
            raise ConnectionError("client went away")
    except ConnectionError:
        pass
    with mgr._zip_slot("tok"):
        pass


def test_the_gate_is_thread_safe_under_contention(mgr, monkeypatch):
    """It is reached from many handler threads at once; the counter must not
    drift, or the ceiling erodes over time."""
    monkeypatch.setattr(mgr, "SHARE_ZIP_MAX_CONCURRENT", 3)
    monkeypatch.setattr(mgr, "SHARE_ZIP_PER_TOKEN", 3)
    admitted, busy = [], []
    def worker(i):
        try:
            with mgr._zip_slot("shared"):
                admitted.append(i)
                time.sleep(0.01)
        except mgr._ZipBusy:
            busy.append(i)
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(24)]
    for t in ts: t.start()
    for t in ts: t.join()
    assert len(admitted) + len(busy) == 24
    assert mgr._zip_active == 0, "the counter drifted"
    assert not mgr._zip_active_token


# ---- VT-08: office downloads ----------------------------------------------

def test_office_downloads_are_streamed_not_slurped(mgr):
    """Both office handlers read the entire file into memory in the shared root
    process, for a file whose only requirement is an office extension and with no
    size bound — a user with a terminal can create a 20 GiB .docx."""
    import inspect
    for fn in (mgr.Handler._handle_office_doc, mgr.Handler._handle_office_download):
        src = inspect.getsource(fn)
        assert "f.read()" not in src, f"{fn.__name__} still reads the whole file"
        assert "_stream_file" in src


def test_stream_file_reads_in_bounded_chunks(mgr, tmp_path):
    """Assert the observable, not the constant: whatever the file's size, no
    single read may return the whole of a large file."""
    big = tmp_path / "big.bin"
    big.write_bytes(b"x" * (3 * 1024 * 1024))
    reads = []
    real_open = open

    class Spy:
        def __init__(self, f): self.f = f
        def read(self, n=-1):
            reads.append(n)
            return self.f.read(n)
        def __enter__(self): return self
        def __exit__(self, *a): return self.f.close()

    class H:
        command = "GET"
        _stream_file = mgr.Handler._stream_file
        class _W:
            def write(self, b): pass
        wfile = _W()
        def send_response(self, c): pass
        def send_header(self, k, v): pass
        def end_headers(self): pass
        def send_error(self, c): pytest.fail("unexpected error %s" % c)

    import builtins
    builtins.open = lambda *a, **k: Spy(real_open(*a, **k))
    try:
        H()._stream_file(str(big))
    finally:
        builtins.open = real_open
    assert reads, "nothing was read"
    assert max(reads) <= 65536, f"a single read asked for {max(reads)} bytes"


# ---- VT-10: file-agent read limit -----------------------------------------

@pytest.fixture
def agent():
    import importlib.util
    import pathlib
    p = pathlib.Path(__file__).parents[2] / "apps/everyday/files/fileagent.py"
    spec = importlib.util.spec_from_file_location("fileagent", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.mark.parametrize("bad", [-1, -2, -1000, True, False, "3", None, [], {}])
def test_no_max_value_can_read_past_the_cap(agent, tmp_path, bad):
    """`min(int(max), MAX_READ)` clamped only the upper bound, so max=-2 became
    f.read(-1) — the WHOLE file into the per-user agent — before the later slice
    threw it away. Every rejected shape must land inside the documented cap."""
    f = tmp_path / "big.txt"
    f.write_text("A" * 4096)
    r = agent.op_read({"path": str(f), "max": bad})
    assert r["ok"]
    assert len(r["text"]) <= agent.MAX_READ


def test_a_negative_max_does_not_return_the_whole_file(agent, tmp_path, monkeypatch):
    """Shrink the cap so 'clamped' and 'whole file' are distinguishable."""
    monkeypatch.setattr(agent, "MAX_READ", 16)
    f = tmp_path / "big.txt"
    f.write_text("A" * 4096)
    r = agent.op_read({"path": str(f), "max": -2})
    assert len(r["text"]) <= 16 and r["truncated"]


def test_max_zero_means_zero_not_the_default(agent, tmp_path):
    """`or MAX_READ` silently turned a request for nothing into a request for a
    megabyte."""
    f = tmp_path / "a.txt"
    f.write_text("hello")
    r = agent.op_read({"path": str(f), "max": 0})
    assert r["ok"] and r["text"] == "" and r["truncated"]


def test_a_normal_read_is_unchanged(agent, tmp_path):
    f = tmp_path / "a.txt"
    f.write_text("hello world")
    r = agent.op_read({"path": str(f)})
    assert r["ok"] and r["text"] == "hello world" and not r["truncated"]
    r = agent.op_read({"path": str(f), "max": 5})
    assert r["text"] == "hello" and r["truncated"]


# ---- VT-11: the socket-dir repair -----------------------------------------

def test_the_dir_repair_does_not_follow_a_symlink(mgr, tmp_path, monkeypatch):
    """os.path.isdir follows a symlink-to-a-directory, shutil.rmtree refuses to
    remove a symlink and ignore_errors swallowed the refusal — so the chmod/chown
    that followed re-permissioned the link's TARGET. A repair routine that
    repairs the wrong directory is worse than none."""
    victim = tmp_path / "victim"
    victim.mkdir(mode=0o755)
    run = tmp_path / "run"
    run.mkdir()
    me = os.getuid()
    monkeypatch.setattr(mgr, "FILEAGENT_RUN_DIR", str(run))

    class PW:
        pw_uid, pw_gid = me, os.getgid()
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: PW())

    d = run / "alice"
    d.symlink_to(victim)
    before = victim.stat().st_mode

    err = mgr._prepare_fileagent_dir("alice")
    assert err is None, err
    assert not (run / "alice").is_symlink(), "the symlink survived the repair"
    assert victim.stat().st_mode == before, "the repair re-permissioned the link target"


def test_a_plain_file_in_the_way_is_replaced(mgr, tmp_path, monkeypatch):
    run = tmp_path / "run"
    run.mkdir()
    monkeypatch.setattr(mgr, "FILEAGENT_RUN_DIR", str(run))

    class PW:
        pw_uid, pw_gid = os.getuid(), os.getgid()
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: PW())

    (run / "alice").write_text("not a directory")
    assert mgr._prepare_fileagent_dir("alice") is None
    assert (run / "alice").is_dir()
    assert (run / "alice").stat().st_mode & 0o777 == 0o700


def test_a_good_dir_is_left_alone(mgr, tmp_path, monkeypatch):
    run = tmp_path / "run"
    run.mkdir()
    monkeypatch.setattr(mgr, "FILEAGENT_RUN_DIR", str(run))

    class PW:
        pw_uid, pw_gid = os.getuid(), os.getgid()
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: PW())

    d = run / "alice"
    d.mkdir(mode=0o700)
    (d / "sock").write_text("")
    assert mgr._prepare_fileagent_dir("alice") is None
    assert (d / "sock").exists(), "an existing good dir was needlessly recreated"
