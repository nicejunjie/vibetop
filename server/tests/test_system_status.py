"""Tests for the extracted system_status module.

The collection readers hit real /proc and sysfs, so these are smoke-level: they
prove the module imports cleanly, the dependency-injected `cached`/running-list
wiring works, and the payload shape is what the Monitor app / status bar expect
(rather than asserting exact hardware values, which vary by host).
"""
import pytest


def test_get_system_status_shape(status):
    calls = []

    def fake_cached(key, ttl, producer):
        calls.append((key, ttl))
        return producer()

    result = status.get_system_status([1, 3, 7], fake_cached)

    # Core keys are always present regardless of hardware.
    for key in ("hostname", "ips", "cpu_percent", "cpu_cores", "load_avg",
                "memory_used_gb", "memory_total_gb", "uptime",
                "terminals_running", "network", "processes"):
        assert key in result, f"missing {key}"

    # Injected running-terminal list flows through to the count.
    assert result["terminals_running"] == 3
    # The injected memoizer was used for the IP lookup.
    assert ("ips", 10.0) in calls
    # Types the front-end relies on. cpu_percent is a float normally, but None
    # if /proc/stat couldn't be read this poll (the collector degrades that one
    # field instead of failing the whole status); the UI null-handles it (ri()).
    assert result["cpu_percent"] is None or isinstance(result["cpu_percent"], float)
    assert isinstance(result["cpu_cores"], list)
    assert isinstance(result["processes"], list)
    assert isinstance(result["memory_total_gb"], float)


def test_read_loadavg_triple(status):
    la = status._read_loadavg()
    assert isinstance(la, list) and len(la) == 3


def test_read_amdgpu_pm_info_none_card(status):
    # No card index -> all-None dict, never raises.
    assert status._read_amdgpu_pm_info(None) == {
        "load": None, "temp": None, "power_w": None}


def test_root_disk_is_cached(status):
    # Second call must return the same value without recomputing (cache flag set).
    first = status._root_disk()
    assert status._root_disk() == first


def test_list_ips_returns_dict(status):
    ips = status._list_ips()
    assert isinstance(ips, dict)


def test_top_procs_memoized_so_delta_window_is_consistent(status, monkeypatch):
    # The per-process CPU% is a delta over the gap since the previous collection.
    # If every poller (Monitor 2s + each client's heartbeat 5s) recollected, that
    # gap would shrink to a sub-second window and the ranking would reflect which
    # process happened to tick in it (a steady drizzle beating a busy python), not
    # sustained load. So _collect_top_procs must run at most once per _PROC_TTL and
    # interleaved calls must SHARE that one sample.
    calls = []

    def fake_collect():
        calls.append(1)
        status._prev_proc_time = status.time.monotonic()   # real fn stamps its run time
        return [{"pid": 1, "name": "x", "cpu": 1.0, "mem_mb": 1.0, "user": "u"}]

    monkeypatch.setattr(status, "_collect_top_procs", fake_collect)
    status._proc_cache = []
    status._prev_proc_time = 0.0
    cb = lambda k, t, p: p()

    for _ in range(3):                       # three back-to-back pollers
        status.get_system_status([], cb)
    assert len(calls) == 1, "interleaved pollers must share one sample, not recollect"

    # Once the window has elapsed, the next poll recomputes (fresh delta window).
    status._prev_proc_time -= status._PROC_TTL + 1
    status.get_system_status([], cb)
    assert len(calls) == 2


def test_display_name_never_a_flag_or_inline_code(status):
    # An interpreter invoked with -c/-e/-m has no script file to name from, so the
    # name must fall back to the interpreter — NOT the flag ("-c") and NOT the
    # inline code. This is the "Monitor shows a row named '-c'" regression: the old
    # rule grabbed cmdline[1] blindly, yielding "-c" for `python3 -c "…"`.
    dn = status._display_name
    # -c / -e / -m inline: interpreter basename, never "-c"/"-e"/the code/module.
    assert dn(["python3", "-c", "while True: pass"], "python3") == "python3"
    assert dn(["/usr/bin/python3.11", "-c", "x=1"], "python3") == "python3.11"
    assert dn(["node", "-e", "for(;;){}"], "node") == "node"
    assert dn(["bash", "-c", "sleep 1"], "bash") == "bash"
    assert dn(["python3", "-m", "http.server"], "python3") == "python3"
    for cmd in (["python3", "-c", "code"], ["node", "-e", "code"],
                ["sh", "-c", "cmd"]):
        assert not dn(cmd, "x").startswith("-")
    # A real script arg IS used (basename), skipping leading plain flags.
    assert dn(["python3", "/opt/app/train.py", "--epochs", "5"], "python3") == "train.py"
    assert dn(["python3", "-u", "worker.py"], "python3") == "worker.py"
    assert dn(["node", "/srv/app/server.js"], "node") == "server.js"
    # Non-interpreters use argv[0]; a login-shell "-bash" / empty argv falls back
    # to comm (never a "-"-prefixed name).
    assert dn(["/usr/lib/firefox/firefox"], "firefox") == "firefox"
    assert dn(["-bash"], "bash") == "bash"
    assert dn([], "kworker/0:1") == "kworker/0:1"


def test_cpu_snapshot_delta_path(status):
    # First call seeds the snapshot (synchronous 0.1s sample); the second call,
    # arriving >0.5s later via the fixture's reuse, should exercise the delta
    # branch. We just assert both calls succeed and stay in range.
    r1 = status.get_system_status([], lambda k, t, p: p())
    r2 = status.get_system_status([], lambda k, t, p: p())
    for r in (r1, r2):
        assert 0.0 <= r["cpu_percent"] <= 100.0
        assert all(0.0 <= c <= 100.0 for c in r["cpu_cores"])


# ---- wall power (smart plug) -------------------------------------------------
# The only reading in this module that comes off the network, so the tests care
# about things no sysfs reader can get wrong: what URL we actually hit, that a
# real 0W stays a number, and that a failure is raised rather than smoothed over.

class _Resp:
    def __init__(self, body):
        self._body = body

    def read(self, n=None):
        return self._body[:n] if n else self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _opener(body, seen=None):
    def open_(url, timeout=None):
        if seen is not None:
            seen.append((url, timeout))
        return _Resp(body if isinstance(body, bytes) else body.encode())
    return open_


@pytest.mark.parametrize("plug,want", [
    ("192.168.1.42", "http://192.168.1.42/rpc/Switch.GetStatus?id=0"),
    ("192.168.1.42:8080", "http://192.168.1.42:8080/rpc/Switch.GetStatus?id=0"),
    ("http://plug.lan/", "http://plug.lan/rpc/Switch.GetStatus?id=0"),
    ("  plug.lan  ", "http://plug.lan/rpc/Switch.GetStatus?id=0"),
])
def test_wall_power_endpoint_builds_the_rpc_url(status, plug, want):
    assert status.wall_power_endpoint(plug) == want


def test_wall_power_endpoint_absent_when_unconfigured(status, monkeypatch):
    monkeypatch.delenv("VIBETOP_POWER_PLUG", raising=False)
    assert status.wall_power_endpoint() is None
    assert status.wall_power_endpoint("") is None
    assert status.wall_power_endpoint("   ") is None
    # ...and reading is then a no-op rather than an error.
    assert status.read_wall_power("") is None


def test_wall_power_never_fetches_the_device_web_ui(status):
    """The plug's root serves a ~280KB app. Polling THAT every 30s is the
    failure this asserts against: the path must always be the small RPC one, and
    must come from us rather than from whatever the setting happens to contain."""
    seen = []
    status.read_wall_power("plug.lan/anything/else",
                           opener=_opener('{"apower": 5}', seen))
    url = seen[0][0]
    assert url.endswith("/rpc/Switch.GetStatus?id=0")
    assert url.count("/rpc/") == 1


def test_wall_power_reads_watts_and_stamps_the_sample(status):
    import time as _t
    before = _t.time()
    got = status.read_wall_power(
        "plug.lan", opener=_opener('{"apower": 123.456, "voltage": 122.6}'))
    assert got["w"] == 123.5                      # rounded for display
    assert before <= got["at"] <= _t.time()       # stamped with the SAMPLE time


def test_wall_power_zero_watts_is_a_measurement_not_a_gap(status):
    """A plug reporting 0.0 has measured nothing drawing — a fact. Returning
    None here would make the Monitor draw '--' and a broken line, claiming the
    reading was unavailable when it was taken successfully."""
    got = status.read_wall_power("plug.lan", opener=_opener('{"apower": 0.0}'))
    assert got is not None and got["w"] == 0.0


@pytest.mark.parametrize("body", [
    '{"apower": null}',        # field present but empty
    '{"voltage": 122.6}',      # relay-only response, no meter
    '{"apower": "12.3"}',      # a string is not a measurement
    '{"apower": true}',        # bool is an int in Python; it is not watts
    'not json at all',
])
def test_wall_power_raises_on_an_unusable_answer(status, body):
    """Raising is what lets the caller's memo keep the last good value at its
    real age and apply a retry floor. Returning None would be read as 'no plug
    configured' and returning 0 would invent a measurement."""
    with pytest.raises(Exception):
        status.read_wall_power("plug.lan", opener=_opener(body))


def test_wall_power_bounds_the_read(status):
    """A misconfigured host pointing at something huge must not be pulled into
    memory every 30s for the life of the process.

    Asserted as "the read asked for a limit" rather than by feeding it a big
    body: JSON ignores trailing bytes, so a size-based check passes whether or
    not the cap exists and proves nothing."""
    asked = []

    class _Recording(_Resp):
        def read(self, n=None):
            asked.append(n)
            return super().read(n)

    def open_(url, timeout=None):
        return _Recording(b'{"apower": 7}')

    got = status.read_wall_power("plug.lan", opener=open_)
    assert got["w"] == 7.0
    assert asked and all(isinstance(n, int) and 0 < n <= 1 << 20 for n in asked), \
        f"the plug response must be read with a bound, got read({asked})"
