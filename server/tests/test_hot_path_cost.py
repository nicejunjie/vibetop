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


def test_disk_usage_is_never_computed_on_the_request_thread(mgr):
    """`du -sx` per home measured 15.1s cold (worst case 35s) behind a 30s TTL,
    so opening Config half a minute after the last look cost FIFTEEN SECONDS.
    Too long to block even once, so unlike the stats endpoints this one reports
    `pending` and the panel renders a waiting state."""
    import inspect
    src = inspect.getsource(mgr.Handler._handle_config_disk_get)
    assert "_bg_cached" in src, "the du sweep must not run on the request thread"
    assert "block_first" not in src, \
        "a 15s first call would read as a hang — this one must report pending"
    assert "pending" in src


def test_stats_endpoints_keep_their_payload_shape(mgr):
    """The stats routes block on the first parse precisely so nothing downstream
    needs a pending branch; regressing to a bare refresh-ahead would hand the
    page a blank reading it would draw as real zeros."""
    import inspect
    src = inspect.getsource(mgr.Handler.do_GET)
    i = src.index("/api/claude/stats")
    assert "block_first=True" in src[i:i + 2000]


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
    import inspect
    assert "_file_cache" in inspect.getsource(cs._compute), \
        "codex_stats must key its per-file cache the same way"


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
    cb = inspect.getsource(mgr.Handler._handle_office_callback)
    assert '{"error": 1}' in cb, \
        "a failed save-back must tell OnlyOffice the save failed, so it retries"
    assert "saved is False" in cb, \
        "the callback must branch on the save-back result, not ignore it"


def test_the_memory_ceiling_sits_above_the_measured_peak():
    """A ceiling below what the process actually needs does not reduce its use —
    it makes it fight for it. Set to 1500M (between the 970MB idle RSS and the
    2.03GB MemoryPeak) the cgroup throttled 8979 times in three minutes and a
    Token Stats request went from 2s to SIXTY, nginx's read timeout. The idle
    reading is the wrong number to size this from."""
    here = os.path.dirname(os.path.abspath(__file__))
    unit = os.path.join(os.path.dirname(here), "systemd", "vibetop-manager.service")
    body = open(unit).read()
    assert "MALLOC_ARENA_MAX" in body, \
        "the arena count is the CAUSE of the ratchet; bound it, not just the total"
    m = re.search(r"^MemoryHigh=(\d+)([MG])\s*$", body, re.M)
    assert m, "MemoryHigh must be set, with an explicit unit"
    mb = int(m.group(1)) * (1024 if m.group(2) == "G" else 1)
    assert mb >= 2048, (
        f"MemoryHigh={m.group(0).strip()} is at or below the 2.03GB peak measured "
        "on the reference host — that throttles the service instead of bounding it")
    # Directives only: the unit's own prose explains why MemoryMax is absent.
    directives = [l for l in body.splitlines() if l and not l.lstrip().startswith("#")]
    assert not any(l.startswith("MemoryMax=") for l in directives), \
        "this service must degrade under pressure, never be OOM-killed"
