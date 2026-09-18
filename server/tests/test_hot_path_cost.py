"""Work that is too slow to sit on a request thread must not sit on one.

Each of these was MEASURED on z20 before being fixed, and each is the same
mistake: a cost that is fine once, placed somewhere it is paid over and over.
A TTL does not fix that -- it only decides how often someone waits.
"""
import importlib.util
import os
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
