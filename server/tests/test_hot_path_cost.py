"""Work that is too slow to sit on a request thread must not sit on one.

Each of these was MEASURED on z20 before being fixed, and each is the same
mistake: a cost that is fine once, placed somewhere it is paid over and over.
A TTL does not fix that -- it only decides how often someone waits.
"""
import importlib.util
import os
import re
import threading
import time


def test_the_first_value_blocks_but_nothing_after_it_does(mgr):
    """The shape of the fix: pay once per process, never on the steady path."""
    runs = []

    def slow():
        runs.append(1)
        time.sleep(0.3)
        return {"n": len(runs)}

    key = "probe:%d" % time.monotonic_ns()
    t0 = time.monotonic()
    val, have = mgr._bg_cached(key, 0.05, slow, block_first=True)
    assert have and val == {"n": 1}
    assert time.monotonic() - t0 >= 0.3, "block_first must compute inline"

    time.sleep(0.1)                       # let it go stale
    t0 = time.monotonic()
    val, have = mgr._bg_cached(key, 0.05, slow)
    assert time.monotonic() - t0 < 0.05, "a stale value must be served instantly"
    assert have and val == {"n": 1}, "serve the LAST reading, not a blank one"


def test_a_slow_producer_runs_once_however_many_clients_ask(mgr):
    """Two devices polling Token Stats used to mean two concurrent reparses of
    the whole transcript corpus, because the compute ran outside the lock."""
    runs = []

    def slow():
        runs.append(1)
        time.sleep(0.3)
        return len(runs)

    key = "herd:%d" % time.monotonic_ns()
    mgr._bg_cached(key, 0.05, slow, block_first=True)
    time.sleep(0.1)
    threads = [threading.Thread(target=lambda: mgr._bg_cached(key, 0.05, slow))
               for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    time.sleep(0.5)
    assert len(runs) == 2, \
        f"{len(runs)} producers ran; 8 simultaneous callers must start ONE refresh"


def test_a_failing_producer_neither_spins_nor_looks_fresh(mgr):
    """Two ways to get this wrong: stamp the timestamp on failure and the stale
    value is laundered into looking current forever; don't, and every request
    kicks another doomed producer."""
    runs = []

    def boom():
        runs.append(1)
        raise RuntimeError("nope")

    key = "fail:%d" % time.monotonic_ns()
    val, have = mgr._bg_cached(key, 0.01, boom, block_first=True)
    assert not have and val is None
    time.sleep(0.05)
    for _ in range(5):
        mgr._bg_cached(key, 0.01, boom)
    time.sleep(0.2)
    assert len(runs) <= 2, f"{len(runs)} attempts — a failing producer must back off"


def test_disk_usage_is_never_computed_on_the_request_thread(mgr, monkeypatch):
    """`du -sx` per home measured 15.1s cold (worst case 35s) behind a 30s TTL, so
    opening Config half a minute after the last look cost FIFTEEN SECONDS. Too
    long to block even once, so unlike the stats endpoints this one reports
    `pending` and the panel renders a waiting state.

    Asserted by TIMING a slow producer, not by grepping the handler: a reviewer
    put the sweep back on the request thread and the old string-matching version
    of this test stayed green.
    """
    slow = {"ran": 0}

    def slow_sweep():
        slow["ran"] += 1
        time.sleep(1.0)
        return {"filesystems": [], "homes": [{"user": "a", "bytes": 1}],
                "truncated": False}

    key = "disk_probe:%d" % time.monotonic_ns()
    t0 = time.monotonic()
    val, have = mgr._bg_cached(key, 30.0, slow_sweep)
    assert time.monotonic() - t0 < 0.2, \
        "the first call must return at once with `pending`, not wait for the sweep"
    assert not have and val is None
    time.sleep(1.3)
    val, have = mgr._bg_cached(key, 30.0, slow_sweep)
    assert have and val["homes"], "the finished sweep must then be served"
    assert slow["ran"] == 1


def test_stats_endpoints_keep_their_payload_shape(mgr):
    """The stats routes block on the first parse precisely so their payload shape
    never changes and no client needs a pending branch — a blank reading would be
    drawn as real zeros.

    The old version of this test asserted `"block_first=True" in <source>`; a
    reviewer made _bg_cached IGNORE block_first entirely — the exact regression
    named above — and it passed. This drives the flag instead.
    """
    calls = []

    def producer():
        calls.append(1)
        time.sleep(0.25)
        return {"real": True}

    key = "shape:%d" % time.monotonic_ns()
    val, have = mgr._bg_cached(key, 45.0, producer, block_first=True)
    assert have is True and val == {"real": True}, \
        "block_first must produce a REAL value on the first call, never a blank"
    assert calls == [1]


def test_transcript_parsing_survives_an_undecodable_byte(tmp_path):
    """The OSError guard sat on open(), but a bad byte raises UnicodeDecodeError
    from the ITERATION -- so it escaped _compute, 500d the endpoint, and cached
    nothing, meaning every later request re-read the whole corpus and re-crashed.
    One bad byte from any tool was enough to kill Token Stats permanently."""
    here = os.path.dirname(os.path.abspath(__file__))
    server = os.path.dirname(here)
    proj = tmp_path / ".claude" / "projects" / "p"
    proj.mkdir(parents=True)
    good = ('{"type":"assistant","message":{"model":"claude-opus-5","usage":'
            '{"input_tokens":10,"output_tokens":20}},"sessionId":"s1"}')
    with open(proj / "a.jsonl", "wb") as f:
        f.write(good.encode() + b"\n")
        f.write(b'{"usage": "\xff\xfe bad bytes"}\n')   # undecodable
        f.write(good.encode() + b"\n")

    spec = importlib.util.spec_from_file_location(
        "cs_probe", os.path.join(server, "claude_stats.py"))
    cs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cs)
    out = cs.get_stats(str(tmp_path))          # must not raise
    # BOTH good records survive: errors="replace" mangles only the bad line, and
    # that line then fails the json parse the loop already tolerates.
    assert out["byModel"] == [dict(out["byModel"][0], **{"in": 20, "out": 40, "req": 2})], \
        f"readable records must still be counted, got {out['byModel']}"


def test_rapid_status_polls_reuse_the_last_cpu_reading(tmp_path):
    """A 0.1s sleep under the process-global _collect_lock, on the default
    heartbeat path. It SELF-AMPLIFIED: the first caller stamped the snapshot to
    now, so everyone queued behind it failed the 0.5s freshness test and slept
    their own 0.1s -- K pollers cost K x 0.1s SERIALIZED, host-wide. Two devices'
    heartbeats plus Monitor's 2s poll collide by construction, and /api/desktop
    folds `system` in, so this sat between the shell parsing and the first app
    frame loading."""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        "ss_probe", os.path.join(os.path.dirname(here), "system_status.py"))
    ss = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ss)

    def cached(key, ttl, producer):
        return producer()

    ss.get_system_status([], cached)            # one-off first sample
    t0 = time.monotonic()
    for _ in range(5):
        out = ss.get_system_status([], cached)
    elapsed = time.monotonic() - t0
    assert elapsed < 0.15, \
        f"5 back-to-back polls took {elapsed:.3f}s — each is sleeping 0.1s again"
    assert out["cpu_percent"] is not None, \
        "reusing the last reading must still REPORT one, not drop the field"
    assert len(out["cpu_cores"]) > 0


# ---- the corpus is re-read only where it CHANGED ---------------------------

def _stats_mod(name):
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        name + "_probe", os.path.join(os.path.dirname(here), name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _claude_corpus(root, n_files=6, per_file=40):
    proj = os.path.join(root, ".claude", "projects", "p")
    os.makedirs(proj)
    for i in range(n_files):
        with open(os.path.join(proj, "s%d.jsonl" % i), "w") as f:
            for j in range(per_file):
                f.write(
                    '{"type":"assistant","message":{"id":"m%d-%d","model":'
                    '"claude-opus-5","usage":{"input_tokens":10,"output_tokens":5}},'
                    '"requestId":"r%d-%d","sessionId":"s%d",'
                    '"timestamp":"2026-09-18T10:00:00Z"}\n' % (i, j, i, j, i))
    return proj


def test_an_unchanged_transcript_is_never_re_read(tmp_path):
    """8.46s over 2.6GB on every 45s refresh -- ~19% of a core, continuously,
    while Token Stats was open, and growing forever because nothing prunes the
    corpus. Transcripts are append-only, so a file whose (mtime, size) is
    unchanged cannot have different contents."""
    cs = _stats_mod("claude_stats")
    _claude_corpus(str(tmp_path))
    cs.get_stats(str(tmp_path))

    reads = []
    real_open = cs.open if hasattr(cs, "open") else open
    import builtins
    orig = builtins.open

    def counting_open(path, *a, **k):
        if str(path).endswith(".jsonl"):
            reads.append(str(path))
        return orig(path, *a, **k)

    builtins.open = counting_open
    try:
        cs._cache.clear()                  # force _compute, keep the file cache
        cs.get_stats(str(tmp_path))
    finally:
        builtins.open = orig
    assert reads == [], f"unchanged transcripts were re-read: {reads[:3]}"


def test_an_appended_transcript_is_picked_up(tmp_path):
    """The counterweight: caching on (mtime, size) must not make the numbers
    stale. A cache that never re-reads is worse than the cost it removed."""
    cs = _stats_mod("claude_stats")
    proj = _claude_corpus(str(tmp_path))
    before = cs.get_stats(str(tmp_path))
    with open(os.path.join(proj, "s0.jsonl"), "a") as f:
        f.write('{"type":"assistant","message":{"id":"probe","model":'
                '"claude-opus-5","usage":{"input_tokens":111,"output_tokens":0}},'
                '"requestId":"rq","sessionId":"s0",'
                '"timestamp":"2026-09-18T11:00:00Z"}\n')
    cs._cache.clear()
    after = cs.get_stats(str(tmp_path))
    gain = (sum(m["in"] for m in after["byModel"])
            - sum(m["in"] for m in before["byModel"]))
    assert gain == 111, f"appended record not counted (delta {gain})"


def test_a_dedup_key_in_two_files_is_still_counted_once(tmp_path):
    """Why claude_stats caches extracted RECORDS rather than per-file aggregates.

    Dedup on (message id, requestId) is GLOBAL across the corpus, and on the
    reference host 259 keys really do appear in two files -- a resumed session
    re-records history. Summing cached per-file aggregates would double-count
    every one of them, so the records are replayed through the original
    global-dedup loop instead. codex_stats has no cross-file dedup, which is why
    it may cache aggregates.
    """
    cs = _stats_mod("claude_stats")
    proj = os.path.join(str(tmp_path), ".claude", "projects", "p")
    os.makedirs(proj)
    dup = ('{"type":"assistant","message":{"id":"shared","model":"claude-opus-5",'
           '"usage":{"input_tokens":100,"output_tokens":0}},"requestId":"rq",'
           '"sessionId":"%s","timestamp":"2026-09-18T10:00:00Z"}\n')
    for name, sid in (("a.jsonl", "sa"), ("b.jsonl", "sb")):
        with open(os.path.join(proj, name), "w") as f:
            f.write(dup % sid)
    out = cs.get_stats(str(tmp_path))
    assert sum(m["in"] for m in out["byModel"]) == 100, \
        "the same (message id, requestId) in two files must count ONCE"


def test_codex_stats_is_incremental_too(tmp_path):
    cs = _stats_mod("codex_stats")
    d = os.path.join(str(tmp_path), ".codex", "sessions")
    os.makedirs(d)
    with open(os.path.join(d, "s.jsonl"), "w") as f:
        f.write('{"type":"event_msg","timestamp":"2026-09-18T10:00:00Z",'
                '"payload":{"type":"token_count","info":{"last_token_usage":'
                '{"input_tokens":50,"output_tokens":7}}}}\n')
    first = cs.get_stats(str(tmp_path))
    assert sum(m["in"] for m in first["byModel"]) == 50
    parses = []
    real = cs._parse_file
    cs._parse_file = lambda p: parses.append(p) or real(p)
    try:
        cs._cache.clear(); cs.get_stats(str(tmp_path))   # unchanged file
        first = len(parses)
        cs._cache.clear(); cs.get_stats(str(tmp_path))
        assert len(parses) == first, "an unchanged Codex session was re-parsed"
    finally:
        cs._parse_file = real


# ---- reporting the outcome, not the intent ---------------------------------

def test_a_failed_usage_proxy_is_not_reported_as_enabled(mgr, monkeypatch):
    """The toggle discarded systemctl's returncode and wrote the env regardless,
    and `_claude_usage_enabled()` re-reads the key it just wrote — so it echoed
    the WRITE, not the service. It reported ON while every new Claude session was
    pinned to a loopback URL that refuses connections, and the usage strip
    rendered empty, which is indistinguishable from "no session yet"."""
    class _Fail:
        returncode, stdout, stderr = 1, "", "Failed to start"
    monkeypatch.setattr(mgr.subprocess, "run", lambda *a, **k: _Fail())
    wrote = []
    monkeypatch.setattr(mgr, "_set_claude_usage_env", lambda on: wrote.append(on))

    assert mgr._set_claude_usage(True) is False
    assert wrote == [], \
        "pinning sessions to a proxy that did not start is worse than leaving it off"


def test_cannot_tell_is_not_treated_as_dead(mgr, monkeypatch):
    """The counterweight, and the mistake this whole audit is about: an
    unreadable or unexpected unit status must not block a toggle whose enable
    command reported success. Only a KNOWN-dead state counts."""
    class _Odd:
        returncode, stdout, stderr = 0, "something-unexpected", ""
    monkeypatch.setattr(mgr.subprocess, "run", lambda *a, **k: _Odd())
    assert mgr._unit_definitely_dead("whatever.service") is False

    class _Dead:
        returncode, stdout, stderr = 3, "inactive", ""
    monkeypatch.setattr(mgr.subprocess, "run", lambda *a, **k: _Dead())
    assert mgr._unit_definitely_dead("whatever.service") is True


def test_reset_reports_the_terminals_it_actually_stopped(mgr, monkeypatch):
    """`terminals_stopped` was the list that WAS running before the attempt, and
    `ok` was hardcoded True — so a terminal that refused to die was reported as
    stopped and the desktop drew a clean slate over processes still holding the
    user's files. Every step is best-effort by design; the RESULT must still say
    what happened."""
    import inspect
    src = inspect.getsource(mgr.Handler._handle_reset)
    assert "terminals_remaining" in src, \
        "reset must verify what actually stopped, not echo what was running"
    assert '"--no-block"' not in src, \
        "a handler that reports what it stopped must wait long enough to know"
    assert '{"ok": True, **result}' not in src, \
        "`ok` must reflect the verified outcome, not be hardcoded"


def test_office_save_back_failure_is_reported_to_the_editor(mgr):
    """`{"error": 0}` is OnlyOffice's "saved — you may discard your copy". It was
    returned even when the download-and-replace had thrown: the editor said "All
    changes saved", the user closed the tab, the file was unchanged, and the
    session key was dropped so the forcesave safety net went with it."""
    import inspect
    save = inspect.getsource(mgr.Handler._office_save_back)
    assert "return False" in save and "return True" in save, \
        "_office_save_back must report whether it wrote the file"
    # NOT `'{"error": 1}' in cb` — that string was ALREADY present pre-fix for
    # rejected callbacks, so it proved nothing. What is new is that the callback
    # branches on the save-back RESULT; assert that the result is consumed at all.
    cb = inspect.getsource(mgr.Handler._handle_office_callback)
    import re as _re
    assert _re.search(r"saved\s*=\s*self\._office_save_back\(", cb), \
        "the callback must capture the save-back result, not call it for effect"
    assert _re.search(r"if\s+(not\s+saved|saved\s+is\s+False)", cb), \
        "and it must branch on that result before reporting success to the editor"


def test_the_memory_unit_bounds_the_cause_and_cannot_kill_the_service():
    """What a HERMETIC test can honestly assert about the memory settings.

    An earlier version claimed to "assert the ceiling against the peak so the
    next person sizes it from the right number" — it compared MemoryHigh to a
    hardcoded 2048 literal, i.e. constant against constant, and was green while
    the live service sat at a peak ABOVE its ceiling. A test with no access to a
    running host cannot check that; `doctor.sh` does it on a live host instead.

    Sizing history worth keeping, because I got it wrong twice: 1500M (chosen
    from the 970MB IDLE rss) throttled the anon working set and turned a 2s
    request into 60s. 3G (chosen from a 2.03GB peak measured on OLDER code) was
    then exceeded too — but harmlessly, because what pushes the cgroup over is
    ~1.9GB of RECLAIMABLE dentry/inode slab from walking homes and 629
    transcripts, not the process: anon stayed at 1.0GB and latency at 1.5ms.
    MemoryHigh counts that slab, so the ceiling must clear anon PLUS the cache a
    full filesystem walk produces.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    unit = os.path.join(os.path.dirname(here), "systemd", "vibetop-manager.service")
    body = open(unit).read()
    directives = [l for l in body.splitlines() if l and not l.lstrip().startswith("#")]

    assert any(l.startswith("Environment=MALLOC_ARENA_MAX=") for l in directives), \
        "the arena count is the CAUSE of the RSS ratchet; bound it, not just the total"
    assert any(l.startswith("MemoryHigh=") for l in directives), \
        "some ceiling must exist to catch genuine runaway"
    assert not any(l.startswith("MemoryMax=") for l in directives), \
        "this service must degrade under pressure, never be OOM-killed"


# ---- one user's slow work must not block another's -------------------------

def test_two_different_videos_do_not_serialize(mgr):
    """The lock exists to stop two requests building the SAME file twice, but as
    ONE process-wide lock it also serialized different users on different files —
    held across an ffmpeg run bounded at 1800s, behind an nginx proxy_read_timeout
    of 3600s, so the second user got an indefinitely hanging <video> request
    rather than a 504. Subtitle extraction shared it too."""
    order = []

    def work(key, hold):
        with mgr._video_key_lock(key):
            order.append(("enter", key))
            time.sleep(hold)
            order.append(("leave", key))

    a = threading.Thread(target=work, args=("slow.mp4", 0.4))
    b = threading.Thread(target=work, args=("other.mp4", 0.0))
    a.start(); time.sleep(0.05); b.start()
    b.join(timeout=0.3)
    assert not b.is_alive(), "a different key must not wait on an in-progress one"
    a.join()
    assert ("leave", "other.mp4") in order[:3], \
        f"the second key finished only after the first: {order}"


def test_the_same_video_is_still_built_once(mgr):
    """The counterweight — per-key must not become no locking at all."""
    concurrent, peak = [0], [0]
    lk = threading.Lock()

    def work():
        with mgr._video_key_lock("same.mp4"):
            with lk:
                concurrent[0] += 1
                peak[0] = max(peak[0], concurrent[0])
            time.sleep(0.1)
            with lk:
                concurrent[0] -= 1

    ts = [threading.Thread(target=work) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert peak[0] == 1, f"{peak[0]} threads built the same key at once"
    assert not mgr._video_locks, f"the lock table must drain, got {mgr._video_locks}"


def test_a_young_xpra_unit_is_not_torn_down(mgr, monkeypatch):
    """`systemctl is-active` reports "active" the moment systemd ACCEPTS a
    transient unit, but a real cold xpra binds in ~9s here — so the 3s probe
    always times out on a young unit and the self-heal then killed a start that
    was going to succeed. Measured: the one destructive occurrence in 86 days of
    log came seconds after a MANUAL `systemctl restart`. The self-heal's real
    target (a unit left on a stale port by a port-scheme change) is always OLD, so
    age separates the two cases exactly."""
    monkeypatch.setattr(mgr, "_unit_age", lambda u: 2.0)          # just started
    monkeypatch.setattr(mgr, "_wait_tcp", lambda *a, **k: False)  # not bound yet
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: mgr.pwd.struct_passwd(
                            (u, "x", 4242, 4242, "", "/tmp", "/bin/bash")))
    ran = []

    class _Active:
        returncode, stdout, stderr = 0, "active", ""

    monkeypatch.setattr(mgr.subprocess, "run",
                        lambda a, **k: ran.append(list(a)) or _Active())
    ok, port = mgr._start_user_xpra("alice", "browser")
    assert ok, "a starting display must not be reported as a failure"
    assert not any("stop" in c for c in ran), \
        f"a {2.0}s-old unit was torn down mid-start: {ran}"


def test_an_old_unit_on_a_stale_port_is_still_healed(mgr, monkeypatch):
    """The counterweight: the self-heal this branch was written for must survive."""
    monkeypatch.setattr(mgr, "_unit_age", lambda u: 9999.0)       # long-running
    monkeypatch.setattr(mgr, "_wait_tcp", lambda *a, **k: False)  # wrong port
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: mgr.pwd.struct_passwd(
                            (u, "x", 4242, 4242, "", "/tmp", "/bin/bash")))
    ran = []

    class _Active:
        returncode, stdout, stderr = 0, "active", ""

    monkeypatch.setattr(mgr.subprocess, "run",
                        lambda a, **k: ran.append(list(a)) or _Active())
    mgr._start_user_xpra("alice", "browser")
    assert any("stop" in c for c in ran), \
        "an OLD unit not listening on its port must still be recreated"
