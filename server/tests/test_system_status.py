"""Tests for the extracted system_status module.

The collection readers hit real /proc and sysfs, so these are smoke-level: they
prove the module imports cleanly, the dependency-injected `cached`/running-list
wiring works, and the payload shape is what the Monitor app / status bar expect
(rather than asserting exact hardware values, which vary by host).
"""
import pytest
import io
import time
from types import SimpleNamespace


@pytest.fixture(autouse=True)
def reset_gpu_sample(status, monkeypatch):
    monkeypatch.setattr(status, '_gpu_sample', None)
    monkeypatch.setattr(status, '_gpu_sample_at', 0.0)


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


def test_top_procs_resolves_metadata_only_for_displayed_rows(status, monkeypatch):
    """Ranking needs every stat file, but cmdlines and NSS lookups need only 30."""
    real_open = open
    cmdlines = []

    def fake_open(path, *args, **kwargs):
        path = str(path)
        if path.startswith("/proc/") and path.endswith("/stat"):
            pid = int(path.split("/")[2])
            fields = ["0"] * 22
            fields[11] = str(41 - pid)  # stable, descending CPU rank
            fields[21] = "1"
            return io.StringIO(f"{pid} (worker) S " + " ".join(fields))
        if path.startswith("/proc/") and path.endswith("/cmdline"):
            cmdlines.append(path)
            return io.StringIO("python3\x00worker.py\x00")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", fake_open)
    monkeypatch.setattr(status.os, "listdir", lambda path: [str(i) for i in range(1, 41)])
    monkeypatch.setattr(status.os, "stat", lambda path: SimpleNamespace(st_uid=1000))
    lookups = []
    monkeypatch.setattr(status.pwd, "getpwuid",
                        lambda uid: lookups.append(uid) or SimpleNamespace(pw_name="user"))
    status._prev_proc_snap = {i: 0 for i in range(1, 41)}
    status._prev_proc_time = time.monotonic() - 1

    rows = status._collect_top_procs()
    assert [row["pid"] for row in rows] == list(range(1, 31))
    assert len(cmdlines) == 30
    assert lookups == [1000]
    assert all(row["name"] == "worker.py" and row["user"] == "user" for row in rows)


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


def _plug(apower=12.3, unixtime=1790000000, by_minute=None, minute_ts=1790000000,
          extra_switch=""):
    """A Shelly.GetStatus body, shaped as the real device answers."""
    import json as _j
    sw = {"id": 0, "apower": apower, "voltage": 122.0,
          "aenergy": {"total": 1.0,
                      "by_minute": by_minute if by_minute is not None else [1.0, 2.0, 3.0],
                      "minute_ts": minute_ts}}
    return _j.dumps({"switch:0": sw, "sys": {"unixtime": unixtime}})


@pytest.mark.parametrize("plug,want", [
    ("192.168.1.42", "http://192.168.1.42/rpc/Shelly.GetStatus"),
    ("192.168.1.42:8080", "http://192.168.1.42:8080/rpc/Shelly.GetStatus"),
    ("http://plug.lan/", "http://plug.lan/rpc/Shelly.GetStatus"),
    ("  plug.lan  ", "http://plug.lan/rpc/Shelly.GetStatus"),
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
                           opener=_opener(_plug(apower=5), seen))
    url = seen[0][0]
    assert url.endswith("/rpc/Shelly.GetStatus")
    assert url.count("/rpc/") == 1


def test_wall_power_reads_watts_and_stamps_the_sample(status):
    import time as _t
    before = _t.time()
    got = status.read_wall_power(
        "plug.lan", opener=_opener(_plug(apower=123.456, unixtime=1790000042)))
    assert got["w"] == 123.5                      # rounded for display
    # The DEVICE's clock places the sample; ours only records when we heard it.
    assert got["at"] == 1790000042
    assert before <= got["fetched"] <= _t.time()


def test_wall_power_zero_watts_is_a_measurement_not_a_gap(status):
    """A plug reporting 0.0 has measured nothing drawing — a fact. Returning
    None here would make the Monitor draw '--' and a broken line, claiming the
    reading was unavailable when it was taken successfully."""
    got = status.read_wall_power("plug.lan", opener=_opener(_plug(apower=0.0)))
    assert got is not None and got["w"] == 0.0


@pytest.mark.parametrize("body", [
    '{"switch:0": {"apower": null}, "sys": {"unixtime": 1}}',   # present but empty
    '{"switch:0": {"voltage": 122.6}, "sys": {"unixtime": 1}}', # relay-only, no meter
    '{"switch:0": {"apower": "12.3"}, "sys": {"unixtime": 1}}', # a string is not a measurement
    '{"switch:0": {"apower": true}, "sys": {"unixtime": 1}}',   # bool is an int; not watts
    '{"switch:0": {"apower": 5}}',                              # no device clock at all
    '{"switch:0": {"apower": 5}, "sys": {"unixtime": "now"}}',  # clock not a number
    '{"sys": {"unixtime": 1}}',                                 # no switch component
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
        return _Recording(_plug(apower=7).encode())

    got = status.read_wall_power("plug.lan", opener=open_)
    assert got["w"] == 7.0
    assert asked and all(isinstance(n, int) and 0 < n <= 1 << 20 for n in asked), \
        f"the plug response must be read with a bound, got read({asked})"


# ---- the plug's own buffer ---------------------------------------------------
# Fetching an instant throws away what the device kept while we were not asking.
# These cover what is extracted from the buffer and, just as important, what is
# deliberately NOT.

def test_wall_power_keeps_only_completed_minute_buckets(status):
    """by_minute[0] is the minute IN PROGRESS — energy so far, not a mean. Read
    as a mean it is simply wrong, and wrong LOW, which would draw a dip at the
    right-hand edge of the chart every single minute."""
    got = status.read_wall_power("plug.lan", opener=_opener(
        _plug(by_minute=[100.0, 200.0, 300.0], minute_ts=1790000060)))
    # 0.06 converts mWh-in-a-minute to mean watts; the partial bucket is dropped.
    assert got["by_minute"] == [12.0, 18.0]
    assert got["minute_ts"] == 1790000060


def test_wall_power_minute_buckets_are_watts_not_milliwatt_hours(status):
    """357.281 mWh in one minute is 21.4W. Shipping the raw number would put a
    reading 16x too large on a chart that auto-scales to its own maximum."""
    got = status.read_wall_power("plug.lan",
                                 opener=_opener(_plug(by_minute=[0.0, 357.281])))
    assert got["by_minute"] == [21.4]


def test_wall_power_survives_a_plug_with_no_energy_buffer(status):
    """The buffer is a bonus. A device that reports power but no aenergy must
    still give a usable spot reading rather than failing the whole poll."""
    import json
    body = json.dumps({"switch:0": {"apower": 42.0}, "sys": {"unixtime": 17}})
    got = status.read_wall_power("plug.lan", opener=_opener(body))
    assert got["w"] == 42.0 and got["at"] == 17
    assert got["by_minute"] == [] and got["minute_ts"] is None


def test_wall_power_keeps_the_two_clocks_apart(status):
    """`at` places the sample on the timeline and comes from the plug; `fetched`
    answers "are we still hearing from it" and comes from us. Collapsing them is
    the bug this whole shape exists to prevent — on a slow link or after an
    outage the two differ by minutes, not milliseconds."""
    import time as _t
    got = status.read_wall_power("plug.lan",
                                 opener=_opener(_plug(unixtime=1600000000)))
    assert got["at"] == 1600000000
    assert abs(got["fetched"] - _t.time()) < 5
    assert got["at"] != int(got["fetched"])

# ---- Multi-GPU inventory: device identity, separate metrics, and fallbacks ---


@pytest.mark.parametrize('delta, expected', [
    ([0, 0, 0, 96, 4, 0, 0, 0, 0, 0], 0.0),
    ([10, 0, 0, 90, 0, 0, 0, 0, 10, 0], 10.0),
    ([0, 10, 0, 90, 0, 0, 0, 0, 0, 10], 10.0),
    ([5, 0, 5, 80, 10, 0, 0, 0, 0, 0], 10.0),
    ([0, 0, 100, 0, 0, 0, 0, 0, 0, 0], 100.0),
    ([0] * 10, 0.0),
    ([-10] * 10, 0.0),
])
def test_cpu_execution_excludes_iowait_and_counts_guest_once(status, delta, expected):
    baseline = [1000] * 10
    assert status._cpu_usage_percent(baseline, [a + d for a, d in zip(baseline, delta)]) == expected


def test_gpu_activity_is_sampled_before_sensor_queries_and_preserves_idle_zero(status, monkeypatch):
    events = []
    monkeypatch.setattr(status.shutil, 'which', lambda name: '/bin/amd-smi' if name == 'amd-smi' else None)

    def rows(binary, args):
        events.append(args)
        if args == ['metric', '--usage']:
            return [{'gpu': 0, 'usage': {'gfx_activity': {'value': 0}}}]
        if args[0] == 'static':
            return [{'gpu': 0, 'bus': {'bdf': '0000:03:00.0'}, 'asic': {'flags': 24}}]
        # Simulate the activity caused by reading sensors. It must never replace
        # the earlier idle sample, even if a CLI returns unsolicited usage.
        return [{'gpu': 0, 'usage': {'gfx_activity': 4}, 'temperature': {'edge': 35}}]

    def sysfs():
        events.append('sysfs')
        return [{'id': '0000:03:00.0', 'percent': 3, 'temp': 34}]

    monkeypatch.setattr(status, '_smi_rows', rows)
    monkeypatch.setattr(status, '_read_sysfs_gpus', sysfs)
    gpus = status._collect_gpus(lambda k, t, f: f())
    assert events == [['metric', '--usage'], ['static', '--asic', '--bus', '--vram'],
                      ['metric', '--temperature', '--mem-usage', '--power'], 'sysfs']
    assert gpus[0]['percent'] == 0
    assert gpus[0]['temp'] == 35


def test_amd_smi_keeps_two_cards_separate_and_identifies_integrated_gpu(status, monkeypatch):
    import json
    static = {'gpu_data': [
        {'gpu': 1, 'asic': {'market_name': 'Radeon B', 'flags': 24}, 'bus': {'bdf': '0000:07:00.0'}},
        {'gpu': 0, 'asic': {'market_name': 'Radeon A', 'flags': 24}, 'bus': {'bdf': '0000:03:00.0'}},
        {'gpu': 2, 'asic': {'market_name': 'Radeon integrated', 'flags': 17}, 'bus': {'bdf': '0000:76:00.0'}},
    ]}
    metrics = {'gpu_data': [
        {'gpu': 0, 'usage': {'gfx_activity': {'value': 82, 'unit': '%'}},
         'temperature': {'edge': {'value': 74}}, 'power': {'socket_power': {'value': 130}},
         'mem_usage': {'used_vram': {'value': 18432}, 'total_vram': {'value': 24576}}},
        {'gpu': 1, 'usage': {'gfx_activity': 0}, 'temperature': {'edge': 58},
         'mem_usage': {'used_vram': 9216, 'total_vram': 24576}},
        {'gpu': 2, 'usage': 'N/A', 'temperature': {'edge': {'value': 40}}},
    ]}
    calls = []
    monkeypatch.setattr(status.shutil, 'which', lambda cmd: '/bin/amd-smi' if cmd == 'amd-smi' else None)
    monkeypatch.setattr(status, '_read_sysfs_gpus', lambda: [])

    def run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=0, stdout=json.dumps(static if 'static' in args else metrics))

    monkeypatch.setattr(status.subprocess, 'run', run)
    gpus = status._read_gpus(lambda k, t, p: p())
    assert [g['id'] for g in gpus] == ['0000:03:00.0', '0000:07:00.0', '0000:76:00.0']
    assert [(g.get('percent'), g.get('temp')) for g in gpus] == [(82, 74), (0, 58), (None, 40)]
    assert [(g.get('vram_used_gb'), g.get('vram_total_gb')) for g in gpus[:2]] == [(18, 24), (9, 24)]
    assert [g['integrated'] for g in gpus] == [False, False, True]
    assert len(calls) == 3
    assert calls[0][1:] == ["metric", "--usage", "--json"]
    assert "--usage" not in calls[2]


@pytest.mark.parametrize('value', [None, 'N/A', 'nan', 'inf', {}, {'value': 'N/A'}])
def test_gpu_missing_metrics_are_not_reported_as_zero(status, value):
    assert status._gpu_number(value) is None


@pytest.mark.parametrize('fault', ['missing', 'failed', 'timeout', 'invalid-json'])
def test_smi_failure_keeps_sysfs_inventory_and_per_card_readings(status, monkeypatch, fault):
    import subprocess
    fallback = [{'id': '0000:07:00.0', 'percent': 19, 'temp': 51},
                {'id': '0000:03:00.0', 'percent': 0, 'temp': 33}]
    monkeypatch.setattr(status, '_read_sysfs_gpus', lambda: fallback)
    monkeypatch.setattr(status.shutil, 'which', lambda cmd: '/bin/amd-smi'
                        if cmd == 'amd-smi' and fault != 'missing' else None)

    def run(args, **kwargs):
        if fault == 'timeout':
            raise subprocess.TimeoutExpired(args, 2)
        return SimpleNamespace(returncode=1 if fault == 'failed' else 0, stdout='not json')

    monkeypatch.setattr(status.subprocess, 'run', run)
    assert status._read_gpus(lambda k, t, p: p()) == list(reversed(fallback))


def test_smi_metrics_merge_by_pci_and_fill_only_missing_values_from_sysfs(status, monkeypatch):
    monkeypatch.setattr(status, '_read_sysfs_gpus', lambda: [
        {'id': 'b', 'percent': 10, 'temp': 51, 'power_w': 90},
        {'id': 'a', 'percent': 20, 'temp': 42}])
    monkeypatch.setattr(status, '_read_amd_smi_gpus', lambda cached: [
        {'id': 'a', 'name': 'GPU A', 'percent': 0, 'integrated': False},
        {'id': 'b', 'name': 'GPU B', 'temp': 60, 'integrated': False}])
    monkeypatch.setattr(status, '_read_nvidia_gpus', lambda: [])
    gpus = status._read_gpus(lambda k, t, p: p())
    assert [(g['id'], g['percent'], g['temp']) for g in gpus] == [('a', 0, 42), ('b', 10, 60)]
    assert gpus[1]['power_w'] == 90


def test_sysfs_hwmon_is_bound_to_its_card_and_unreadable_sensors_leave_gaps(status, monkeypatch, tmp_path):
    from pathlib import Path
    import builtins
    sysfs = tmp_path / 'drm'
    for card, pci, load, temp, watts in (
        ('card9', '0000:03:00.0', '81', '74000', '130000000'),
        ('card1', '0000:07:00.0', '0', '58000', '60000000'),
    ):
        dev = tmp_path / pci
        hwmon = dev / 'hwmon/hwmon0'
        hwmon.mkdir(parents=True)
        (dev / 'driver').symlink_to('/sys/bus/pci/drivers/amdgpu')
        (dev / 'gpu_busy_percent').write_text(load)
        (dev / 'mem_info_vram_used').write_text(str(9 * 1024**3))
        (dev / 'mem_info_vram_total').write_text(str(24 * 1024**3))
        (hwmon / 'temp1_input').write_text(temp)
        (hwmon / 'power1_average').write_text(watts)
        (sysfs / card).mkdir(parents=True)
        (sysfs / card / 'device').symlink_to(dev)
    # Connector entries must never become another GPU.
    (sysfs / 'card9-DP-1').mkdir()
    real_open, real_listdir, real_realpath = builtins.open, status.os.listdir, status.os.path.realpath

    def mapped(path):
        return str(path).replace('/sys/class/drm', str(sysfs))

    monkeypatch.setattr(builtins, 'open', lambda path, *a, **kw: real_open(mapped(path), *a, **kw))
    monkeypatch.setattr(status.os, 'listdir', lambda path: real_listdir(mapped(path)))
    monkeypatch.setattr(status.os.path, 'realpath', lambda path, **kw: real_realpath(mapped(path), **kw))
    monkeypatch.setattr(status, '_read_amdgpu_pm_info', lambda *args: {})
    gpus = {g['id']: g for g in status._read_sysfs_gpus()}
    assert len(gpus) == 2
    assert (gpus['0000:03:00.0']['percent'], gpus['0000:03:00.0']['temp']) == (81, 74)
    assert (gpus['0000:07:00.0']['percent'], gpus['0000:07:00.0']['temp']) == (0, 58)
    (tmp_path / '0000:03:00.0/gpu_busy_percent').unlink()
    gpus = {g['id']: g for g in status._read_sysfs_gpus()}
    assert 'percent' not in gpus['0000:03:00.0']
    assert gpus['0000:03:00.0']['temp'] == 74


def test_debugfs_fallback_never_borrows_another_gpu_sensor(status, monkeypatch):
    import builtins
    seen = []

    def fake_open(path, *args, **kwargs):
        seen.append(path)
        if '0000:07:00.0' in path:
            return io.StringIO('GPU Load: 92 %\nGPU Temperature: 85 C\n')
        raise FileNotFoundError(path)

    monkeypatch.setattr(builtins, 'open', fake_open)
    assert status._read_amdgpu_pm_info(1, '0000:03:00.0') == {
        'load': None, 'temp': None, 'power_w': None}
    assert seen == ['/sys/kernel/debug/dri/0000:03:00.0/amdgpu_pm_info']


def test_nvidia_collects_all_cards_with_stable_ids_and_unknown_values(status, monkeypatch):
    monkeypatch.setattr(status.shutil, 'which', lambda cmd: '/bin/nvidia-smi')
    monkeypatch.setattr(status.subprocess, 'run', lambda *a, **kw: SimpleNamespace(
        returncode=0, stdout='00000000:07:00.0, RTX B, 82, 74, 18432, 24576, 220\n'
                            '00000000:03:00.0, RTX A, 0, N/A, 0, 24576, N/A\n'))
    gpus = status._read_nvidia_gpus()
    assert len(gpus) == 2
    assert gpus[0]['id'] == '0000:07:00.0'
    assert gpus[0]['vram_used_gb'] == 18
    assert gpus[1]['percent'] == 0
    assert 'temp' not in gpus[1] and 'power_w' not in gpus[1]


def test_inventory_keeps_legacy_monitor_fields_on_a_discrete_card(status, monkeypatch):
    gpus = [{'id': 'a', 'integrated': False, 'percent': 81, 'temp': 74, 'vram_total_gb': 24},
            {'id': 'b', 'integrated': False, 'percent': 12, 'temp': 50, 'vram_total_gb': 24},
            {'id': 'c', 'integrated': True, 'percent': 90, 'temp': 40, 'vram_total_gb': 32}]
    monkeypatch.setattr(status, '_read_gpus', lambda cached: gpus)
    result = status.get_system_status([], lambda k, t, p: p(), want_procs=False)
    assert result['gpus'] == gpus
    assert result['gpu_percent'] == 81 and result['gpu_temp'] == 74
    assert result['gpu_vram_total_gb'] == 24


def test_gpu_polls_share_one_sample_until_interval_expires(status, monkeypatch):
    now = [10.0]
    calls = []
    monkeypatch.setattr(status.time, 'monotonic', lambda: now[0])
    monkeypatch.setattr(status, '_collect_gpus', lambda cached: calls.append(now[0]) or [{'id': 'a'}])
    first = status._read_gpus(lambda k, t, p: p())
    for _ in range(5):
        assert status._read_gpus(lambda k, t, p: p()) is first
    assert calls == [10.0]
    now[0] = 12.1
    status._read_gpus(lambda k, t, p: p())
    assert calls == [10.0, 12.1]

@pytest.mark.parametrize('flags, expected', [(24, False), (17, True)])
def test_drm_gpu_classification_survives_missing_rocm(status, monkeypatch, flags, expected):
    import ctypes
    import struct
    monkeypatch.setattr(status, '_gpu_device_flags', {})
    monkeypatch.setattr(status.os, 'open', lambda path, mode: 42)
    closed = []
    monkeypatch.setattr(status.os, 'close', closed.append)
    calls = []
    def ioctl(fd, operation, request):
        address, size, query = struct.unpack_from('=QII', request)
        assert fd == 42 and operation == 0x40206445 and query == 0x16 and size == 144
        ctypes.memmove(address + 136, struct.pack('=Q', flags), 8)
        calls.append(fd)
    monkeypatch.setattr(status.fcntl, 'ioctl', ioctl)
    assert status._amdgpu_integrated('card0', 'test-pci') is expected
    assert status._amdgpu_integrated('card0', 'test-pci') is expected
    assert calls == [42] and closed == [42]


def test_unreadable_drm_is_unknown_not_discrete(status, monkeypatch):
    monkeypatch.setattr(status, '_gpu_device_flags', {})
    def fail(*args):
        raise PermissionError('not readable')
    monkeypatch.setattr(status.os, 'open', fail)
    assert status._amdgpu_integrated('card0', 'test-pci') is None
    assert 'test-pci' not in status._gpu_device_flags


def test_amd_smi_discovery_outside_service_path(status, monkeypatch):
    monkeypatch.setattr(status.shutil, 'which', lambda name: None)
    monkeypatch.setattr(status.os.path, 'isfile', lambda path: path == '/opt/soft/rocm/bin/amd-smi')
    monkeypatch.setattr(status.os, 'access', lambda path, mode: True)
    assert status._amd_smi_binary() == '/opt/soft/rocm/bin/amd-smi'


def test_gpu_power_sums_discrete_cards_without_double_counting_integrated(status, monkeypatch):
    cards = [{'id': 'a', 'integrated': False, 'power_w': 23},
             {'id': 'b', 'integrated': False, 'power_w': 300},
             {'id': 'c', 'integrated': True, 'power_w': 50}]
    monkeypatch.setattr(status, '_read_gpus', lambda cached: cards)
    result = status.get_system_status([], lambda k, t, p: p(), want_procs=False)
    assert result['gpu_power_w'] == 323
    del cards[1]['power_w']
    result = status.get_system_status([], lambda k, t, p: p(), want_procs=False)
    assert 'gpu_power_w' not in result
