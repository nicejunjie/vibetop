"""Smoke tests for /api/ping and /api/metrics.

Boots the manager's ThreadingHTTPServer on an ephemeral loopback port and drives
it over real HTTP — exercising the handle_one_request / log_request counter hooks
and the metrics snapshot end to end. Stays hermetic (no root/systemd) by stubbing
out the one systemctl-backed call (`_get_running_terminals`).

    cd terminal && python -m pytest tests/ -q
"""
import http.server
import json
import threading
import urllib.error
import urllib.request

import pytest


@pytest.fixture()
def server(mgr, monkeypatch):
    # The only non-pure bit /api/metrics touches — keep it off systemctl.
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [3, 7])
    # _METRICS is a process-global counter shared with every other test that
    # drives a server (the endpoint suites intentionally produce some 500s).
    # Zero it in place so this test measures from a clean slate regardless of
    # run order — otherwise `errors_total == 0` is a false failure.
    with mgr._metrics_lock:
        for k, v in list(mgr._METRICS.items()):
            mgr._METRICS[k] = {} if isinstance(v, dict) else (0.0 if isinstance(v, float) else 0)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mgr.Handler)
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        yield base
    finally:
        srv.shutdown()


def _sess(mgr):
    """A valid session for APP_USER — every /api path is gated centrally now."""
    return "vt_session=" + mgr._sign_session(mgr.APP_USER)


def _get(base, path):
    with urllib.request.urlopen(base + path, timeout=5) as r:
        return r.status, json.load(r)


def test_ping_is_trivially_ok(server):
    status, body = _get(server, "/api/ping")
    assert status == 200
    assert body == {"ok": True}


def test_metrics_counts_requests_and_statuses(server):
    for _ in range(3):
        _get(server, "/api/ping")
    # A non-200 to prove they are tallied (and are NOT counted as 5xx errors).
    # An unknown /api path answers 401 rather than 404 now: the gate runs before
    # routing, so a cookieless caller cannot map the API surface.
    with pytest.raises(urllib.error.HTTPError) as ei:
        urllib.request.urlopen(server + "/api/nope", timeout=5)
    assert ei.value.code == 401

    status, m = _get(server, "/api/metrics")
    assert status == 200
    assert m["requests_total"] >= 5                 # 3 pings + 404 + this metrics call
    assert m["responses"].get("200", 0) >= 3
    assert m["responses"].get("401", 0) >= 1         # the unknown path, gated first
    assert m["errors_total"] == 0                   # a 404 is not a 5xx
    assert m["requests_in_flight"] >= 1             # this very request is in flight
    assert m["request_avg_seconds"] >= 0
    assert m["uptime_seconds"] >= 0
    assert m["terminals_running"] == 2              # from the stubbed [3, 7]
    assert m["sse_clients"] == 0


def test_events_rejects_past_sse_cap(server, mgr):
    # Saturate the gauge so the next /api/events is rejected with 503. Never open
    # a non-rejected stream here — it would block forever (SSE never returns).
    with mgr._metrics_lock:
        mgr._METRICS["sse_clients"] = mgr._SSE_MAX_CLIENTS
    try:
        with pytest.raises(urllib.error.HTTPError) as ei:
            urllib.request.urlopen(
                urllib.request.Request(server + "/api/events",
                                       headers={"Cookie": _sess(mgr)}), timeout=5)
        assert ei.value.code == 503
    finally:
        with mgr._metrics_lock:
            mgr._METRICS["sse_clients"] = 0


def test_metrics_shape_is_stable(server):
    _, m = _get(server, "/api/metrics")
    for key in (
        "uptime_seconds", "requests_total", "requests_in_flight",
        "request_avg_seconds", "responses", "errors_total", "sse_clients",
        "terminals_started_total", "terminals_stopped_total", "terminals_running",
    ):
        assert key in m, f"missing metric: {key}"
    assert isinstance(m["responses"], dict)


def test_system_warnings_thresholds(mgr, monkeypatch):
    # _system_warnings keys off statvfs; drive it through healthy/warn/critical.
    import os as _os

    class St:
        def __init__(self, frsize, blocks, bfree, bavail):
            self.f_frsize, self.f_blocks, self.f_bfree, self.f_bavail = frsize, blocks, bfree, bavail

    def at(st):
        monkeypatch.setattr(mgr.os, "statvfs", lambda p: st)
        return mgr._system_warnings()

    assert at(St(4096, 100_000_000, 30_000_000, 29_000_000)) == []          # ~71% healthy
    w = at(St(4096, 100_000_000, 10_000_000, 9_000_000))                    # ~91%
    assert len(w) == 1 and w[0]["id"] == "disk" and w[0]["level"] == "warn"
    c = at(St(4096, 1_000_000, 50_000, 40_000))                            # ~96%
    assert len(c) == 1 and c[0]["level"] == "critical"
    c2 = at(St(4096, 100_000_000, 1_000_000, 400_000))                     # <2GB free
    assert c2 and c2[0]["level"] == "critical"


# ---- wall power: what the manager does with a sample once it has one ---------
# system_status owns the fetch (see test_system_status.py); these cover the part
# only the manager can get wrong — serving a number that is no longer true.

@pytest.fixture()
def wall(mgr, monkeypatch):
    """A configured plug whose sample the test dictates, with the background
    memo cleared so no earlier test's entry leaks in."""
    with mgr._bg_lock:
        mgr._bg.pop("wall_power", None)
    monkeypatch.setattr(mgr.system_status, "wall_power_endpoint",
                        lambda *a, **k: "http://plug.lan/rpc/Switch.GetStatus?id=0")

    def put(sample):
        with mgr._bg_lock:
            mgr._bg["wall_power"] = {"val": sample, "at": mgr.time.monotonic(),
                                     "inflight": False, "started": 0.0}
    yield put
    with mgr._bg_lock:
        mgr._bg.pop("wall_power", None)


@pytest.fixture()
def hist(mgr):
    """A clean wall-power history, restored afterwards."""
    with mgr._wall_lock:
        keep = (dict(mgr._wall_hist), set(mgr._wall_recon), mgr._wall_anchor)
        mgr._wall_hist.clear(); mgr._wall_recon.clear(); mgr._wall_anchor = None
    yield mgr
    with mgr._wall_lock:
        mgr._wall_hist.clear(); mgr._wall_hist.update(keep[0])
        mgr._wall_recon.clear(); mgr._wall_recon.update(keep[1])
        mgr._wall_anchor = keep[2]


def test_wall_power_absent_without_a_plug(mgr, monkeypatch):
    monkeypatch.setattr(mgr.system_status, "wall_power_endpoint",
                        lambda *a, **k: None)
    assert mgr._wall_power_w() is None


def test_wall_power_reports_a_fresh_sample(mgr, wall):
    import time
    wall({"w": 42.5, "at": 1790000000, "fetched": time.time()})
    assert mgr._wall_power_w() == 42.5


def test_wall_power_reports_a_fresh_zero(mgr, wall):
    """0W is a measurement. Dropping it here would make the Monitor show '--'
    for a plug that is answering perfectly well with nothing plugged in."""
    import time
    wall({"w": 0.0, "at": 1790000000, "fetched": time.time()})
    assert mgr._wall_power_w() == 0.0


def test_wall_power_withholds_a_stale_sample(mgr, wall):
    """The memo serves its last value however old it is — right for a disk
    sweep, wrong here. An unplugged or rebooted plug must make the reading
    disappear, not freeze the last wattage on screen looking live."""
    import time
    wall({"w": 42.5, "at": 1790000000,
          "fetched": time.time() - (mgr.WALL_POWER_MAX_AGE + 1)})
    assert mgr._wall_power_w() is None


def test_wall_power_survives_one_missed_refresh(mgr, wall):
    """The staleness cut must sit clear of the refresh interval, or a single
    slow poll would blink the row out."""
    import time
    assert mgr.WALL_POWER_MAX_AGE > mgr.WALL_POWER_FRESH * 2
    wall({"w": 42.5, "at": 1790000000,
          "fetched": time.time() - (mgr.WALL_POWER_FRESH + 1)})
    assert mgr._wall_power_w() == 42.5


def test_wall_power_never_polls_the_plug_on_a_request(mgr, wall, monkeypatch):
    """The Monitor polls every 2s from every open tab; the plug is a small
    embedded board. The request path must read the memo and nothing else."""
    import time
    monkeypatch.setattr(mgr.system_status, "read_wall_power",
                        lambda *a, **k: pytest.fail("fetched on the request path"))
    wall({"w": 42.5, "at": 1790000000, "fetched": time.time()})
    for _ in range(50):
        assert mgr._wall_power_w() == 42.5


# The injection into the status payload, driven through the real method with a
# stand-in `self` and a stubbed collector. Deliberately NOT through the `client`
# fixture: its `stubs` replaces _get_system_status wholesale, which is the very
# method under test.
def _status_payload(mgr, monkeypatch):
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda *a, **k: {"hostname": "test", "cpu_percent": 1.0})
    monkeypatch.setattr(mgr, "_ctx_user", lambda *a, **k: mgr.APP_USER)

    class _H:
        def _get_running_terminals(self):
            return []
    return mgr.Handler._get_system_status(_H())


@pytest.mark.parametrize("watts", [0.0, 137.4])
def test_status_payload_carries_a_measured_wall_reading(mgr, wall, monkeypatch,
                                                        watts):
    """Includes 0.0 on purpose: a truthiness test at the injection site
    (`if wall:`) would drop exactly that value, and the Monitor would show '--'
    for a plug that answered correctly."""
    import time
    wall({"w": watts, "at": 1790000000, "fetched": time.time()})
    assert _status_payload(mgr, monkeypatch).get("wall_power_w") == watts


def test_status_payload_omits_wall_power_when_stale(mgr, wall, monkeypatch):
    """Absence is the signal the page reads as 'unknown'. Sending a stale number
    would render it as a live one."""
    import time
    wall({"w": 137.4, "at": 1790000000,
          "fetched": time.time() - (mgr.WALL_POWER_MAX_AGE + 1)})
    assert "wall_power_w" not in _status_payload(mgr, monkeypatch)


def test_status_payload_has_no_wall_key_without_a_plug(mgr, monkeypatch):
    monkeypatch.setattr(mgr.system_status, "wall_power_endpoint",
                        lambda *a, **k: None)
    assert "wall_power_w" not in _status_payload(mgr, monkeypatch)


def test_bg_cached_retry_floor_defaults_to_the_slow_producer_value(mgr):
    """The default must not move: the producers this was written for (a du
    sweep, a usage fetch) rely on a failure costing 30s of quiet."""
    key = "t_retry_default"
    with mgr._bg_lock:
        mgr._bg.pop(key, None)

    def boom():
        raise RuntimeError("nope")

    mgr._bg_cached(key, 1.0, boom, block_first=True)
    with mgr._bg_lock:
        floor = mgr._bg[key]["retry_at"] - mgr.time.monotonic()
        mgr._bg.pop(key, None)
    assert 25.0 < floor <= 30.0, floor


def test_bg_cached_honours_a_short_retry_floor(mgr):
    """A cheap producer polled every second must not be silenced for half a
    minute by one dropped packet."""
    key = "t_retry_short"
    with mgr._bg_lock:
        mgr._bg.pop(key, None)

    def boom():
        raise RuntimeError("nope")

    mgr._bg_cached(key, 1.0, boom, block_first=True, retry_after=3.0)
    with mgr._bg_lock:
        floor = mgr._bg[key]["retry_at"] - mgr.time.monotonic()
        mgr._bg.pop(key, None)
    assert 0 < floor <= 3.0, floor


def test_wall_power_retry_floor_is_short_enough_to_recover_within_max_age(mgr):
    """The three constants have to agree, or a single failed sample ages the
    reading past MAX_AGE before the retry floor even lifts — and the row blanks
    for the whole difference. Sized so a blip costs at most one retry."""
    assert mgr.WALL_POWER_RETRY < mgr.WALL_POWER_MAX_AGE
    assert mgr.WALL_POWER_FRESH <= mgr.WALL_POWER_RETRY
    assert mgr.WALL_POWER_RETRY * 2 < mgr.WALL_POWER_MAX_AGE, \
        "two consecutive failures must still fall inside the staleness window"


def test_wall_power_is_not_asked_for_faster_than_the_device_updates(mgr):
    """The plug refreshes at 1Hz; asking more often returns the same number and
    spends the device's budget for nothing."""
    assert mgr.WALL_POWER_FRESH >= 1.0


# ---- the wall-power history: device time, and repairing a gap ---------------
# The reading crosses a network. Everything here is about the difference between
# when a sample ARRIVED and when the plug MEASURED it.

T0 = 1790000000 - (1790000000 % 60)          # minute-aligned, like minute_ts


def _s(at, w, by_minute=(), minute_ts=None, fetched=None):
    import time
    return {"w": w, "at": at, "fetched": fetched if fetched is not None else time.time(),
            "minute_ts": minute_ts, "by_minute": list(by_minute)}


def test_history_places_samples_on_the_device_clock(mgr, hist):
    """Not on ours. A sample that took 3s to arrive belongs where the plug says
    it happened; stamping on arrival bakes the round-trip into the x-axis."""
    import time
    mgr._wall_note(_s(T0 + 5, 111.0, fetched=time.time()))
    with mgr._wall_lock:
        assert mgr._wall_hist.get(T0 + 5) == 111.0
        assert not any(abs(t - time.time()) < 60 for t in mgr._wall_hist), \
            "a sample must not land at the host's 'now'"


def test_history_repairs_a_gap_from_the_plugs_buffer(mgr, hist):
    """The point of fetching a buffer rather than an instant: the plug kept
    measuring for the 90s we could not reach it, and says so afterwards."""
    for i in range(30):
        mgr._wall_note(_s(T0 + i, 100.0))
    gap_end = T0 + 30 + 90
    mts = gap_end - (gap_end % 60)
    mgr._wall_note(_s(gap_end, 150.0, by_minute=(300.0, 200.0), minute_ts=mts))
    with mgr._wall_lock:
        assert mgr._wall_hist.get(mts - 60) == 300.0, "the newest completed minute"
        # The older bucket's minute STARTS inside the measured run, so its first
        # seconds keep their real 100.0 and only the unobserved tail is filled —
        # assert on a second that genuinely fell in the gap.
        assert mgr._wall_hist.get(mts - 120) == 100.0, "measured second untouched"
        assert mgr._wall_hist.get(mts - 120 + 45) == 200.0, "unobserved tail filled"
        assert len(mgr._wall_recon) == 90, "the whole gap was repaired"


def test_a_repair_never_overwrites_a_measured_second(mgr, hist):
    """A bucket is a whole minute's mean, quantised to ~7.15W. Letting one land
    on a second we actually measured trades a reading for a reconstruction."""
    for i in range(30):
        mgr._wall_note(_s(T0 + i, 100.0))
    # A bucket covering the SAME minute those 30 samples fall in.
    mgr._wall_note(_s(T0 + 130, 150.0, by_minute=(0.0, 999.0), minute_ts=T0 + 120))
    with mgr._wall_lock:
        measured = [mgr._wall_hist[T0 + i] for i in range(30)]
        assert measured == [100.0] * 30, "measured seconds are untouched"
        assert not ({T0 + i for i in range(30)} & mgr._wall_recon)
        # ...but the holes in that same minute DID get filled.
        assert mgr._wall_hist.get(T0 + 45) == 999.0


def test_history_is_bounded(mgr, hist):
    """One dict entry per second, forever, is a leak on a 24/7 process.

    Inserted at 1Hz across more than twice the span, so the unpruned count would
    be over 1000 — a sparser feed stays under the bound whether or not anything
    prunes, and proves nothing."""
    span = mgr.WALL_HISTORY_SPAN
    for i in range(span * 2 + 200):
        mgr._wall_note(_s(T0 + i, 50.0))
    with mgr._wall_lock:
        assert len(mgr._wall_hist) <= span + 2, len(mgr._wall_hist)
        assert min(mgr._wall_hist) >= T0 + span, "the oldest seconds were dropped"
        assert len(mgr._wall_recon) <= len(mgr._wall_hist)


def test_series_is_the_charts_window_and_marks_holes_as_holes(mgr, hist):
    for i in range(0, 60):
        mgr._wall_note(_s(T0 + i, 80.0))
    ser = mgr._wall_series()
    assert ser["step"] == mgr.WALL_SERIES_STEP
    assert len(ser["w"]) == mgr.WALL_SERIES_SLOTS
    assert ser["t0"] % ser["step"] == 0, "slots align to a stable grid"
    assert any(v == 80.0 for v in ser["w"]), "the measured run is in there"
    assert ser["w"][0] is None, "nothing known 2 minutes before the first sample"


def test_series_keeps_scrolling_while_the_plug_is_unreachable(mgr, hist):
    """An outage must grow a gap of the right WIDTH, not freeze the chart with
    the last reading pinned at the right-hand edge."""
    import time
    mgr._wall_note(_s(T0 + 10, 90.0, fetched=time.time() - 40))
    ser = mgr._wall_series()
    # 40s of host time have passed since that sample; 'now' on the device
    # timeline has advanced with it, so the reading sits ~20 slots back.
    assert ser["w"][-1] is None, "the newest slots are unknown, not the old value"
    assert 90.0 in ser["w"], "and the sample is still on the chart, further left"


def test_series_uses_our_clock_only_for_elapsed_time(mgr, hist):
    """A plug whose clock is years off must still produce a self-consistent
    window — absolute position comes from the device, duration from us."""
    import time
    skewed = 1000000000                       # a decade adrift
    mgr._wall_note(_s(skewed, 70.0, fetched=time.time()))
    ser = mgr._wall_series()
    assert abs(ser["t0"] - skewed) < mgr.WALL_SERIES_STEP * mgr.WALL_SERIES_SLOTS + 5
    assert 70.0 in ser["w"]


def test_status_payload_carries_the_series_even_when_the_reading_is_stale(
        mgr, wall, hist, monkeypatch):
    """The gap is the information. Withholding the series during an outage
    hides exactly what the history exists to show."""
    import time
    mgr._wall_note(_s(T0 + 10, 90.0, fetched=time.time() - 40))
    wall(_s(90.0, 90.0, fetched=time.time() - (mgr.WALL_POWER_MAX_AGE + 1)))
    body = _status_payload(mgr, monkeypatch)
    assert "wall_power_w" not in body, "the stale scalar is withheld"
    assert body["wall_series"]["w"], "but the series still describes the window"
