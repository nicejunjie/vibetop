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
    """A clean wall-power history, restored afterwards.

    `_wall_plug` is part of it: the history belongs to ONE device, and a sample
    tagged with any other is discarded. These tests configure no plug, so the
    history they build is the "" one — same value _read_power_plug() returns.

    The resolved-plug memo is dropped too: it outlives a test that changed the
    address and would otherwise retarget (i.e. erase) the next test's history."""
    with mgr._cache_lock:
        mgr._cache.pop("power_plug", None)
    with mgr._wall_lock:
        keep = (dict(mgr._wall_hist), set(mgr._wall_recon), mgr._wall_anchor,
                mgr._wall_plug)
        mgr._wall_hist.clear(); mgr._wall_recon.clear(); mgr._wall_anchor = None
        mgr._wall_plug = ""
    yield mgr
    with mgr._wall_lock:
        mgr._wall_hist.clear(); mgr._wall_hist.update(keep[0])
        mgr._wall_recon.clear(); mgr._wall_recon.update(keep[1])
        mgr._wall_anchor = keep[2]
        mgr._wall_plug = keep[3]


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


def test_status_payload_always_states_whether_a_plug_is_configured(mgr, home, hist,
                                                                   monkeypatch):
    """A stale plug and no plug are different states with the same missing key;
    the page needs to tell a row reading '--' from a row that should not exist.

    Sent as False too, on purpose: absence has to go on meaning 'this manager
    predates the question', so a page that outlives a deploy keeps its old rule
    instead of reading a missing key as 'no plug'."""
    monkeypatch.delenv("VIBETOP_POWER_PLUG", raising=False)
    assert _status_payload(mgr, monkeypatch)["wall_plug"] is False
    mgr._write_power_plug("10.0.0.5")
    monkeypatch.setattr(mgr.system_status, "read_wall_power",
                        lambda p=None, **k: (_ for _ in ()).throw(OSError("down")))
    # Configured but NEVER answering: still True. The row exists because the
    # machine has a meter, not because the meter replied.
    assert _status_payload(mgr, monkeypatch)["wall_plug"] is True
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


class _Stop(Exception):
    pass


def test_the_taskbar_strip_does_not_set_the_plugs_rate(mgr, wall, hist, monkeypatch):
    """The memo is shared, so the most demanding caller decides how often the
    plug is actually read. The strip rides a 5s heartbeat and shows a rounded
    wattage; at the Monitor's 1s freshness every heartbeat was older than that
    and so fetched — 24 requests a minute with two desktops open, scaling with
    the number of devices."""
    import time as _t
    started = []
    # `hist` pins _wall_plug, so _wall_retarget is a no-op here. Without it a
    # leftover plug from another test makes retarget DROP the memo entry this
    # test seeds, and the first assertion fails for an unrelated reason.

    class _FakeThread:                       # record the refresh, never run it
        def __init__(self, target=None, args=(), **kw):
            started.append(args)

        def start(self):
            pass
    monkeypatch.setattr(mgr.threading, "Thread", _FakeThread)

    def age(seconds):
        with mgr._bg_lock:
            mgr._bg["wall_power"] = {
                "val": {"w": 12.0, "at": 1790000000, "fetched": _t.time()},
                "at": mgr.time.monotonic() - seconds, "inflight": False,
                "started": 0.0}
        started.clear()

    age(3.0)
    assert mgr._wall_power_w(mgr.WALL_POWER_STRIP_FRESH) == 12.0
    assert started == [], "a 3s-old reading is fine for a 5s strip — no fetch"

    age(3.0)
    assert mgr._wall_power_w() == 12.0
    assert len(started) == 1, "but the Monitor's own poll still refreshes at 1s"

    age(6.0)
    mgr._wall_power_w(mgr.WALL_POWER_STRIP_FRESH)
    assert len(started) == 1, "past its own freshness the strip does refresh"


def test_the_heartbeat_route_asks_for_the_relaxed_freshness(client, mgr, users,
                                                            stubs, monkeypatch):
    """Through the real route. Asserting on _wall_power_w(STRIP_FRESH) directly
    cannot see the heartbeat stop passing it — which is the whole change."""
    seen = []
    monkeypatch.setattr(mgr.Handler, "_get_system_status",
                        lambda self, *a, **k: seen.append(a) or {"cpu": {}})
    st, _ = client.post("/api/desktop",
                        {"instance": "i1", "open": [], "active": None,
                         "sys_stats": True}, cookie=users["alice"][1])
    assert st == 200
    assert seen, "the heartbeat collects stats when the toggle is on"
    assert seen[0] == (mgr.WALL_POWER_STRIP_FRESH,), \
        f"the taskbar strip must not ask for the Monitor's rate; got {seen[0]}"


def test_both_heartbeat_paths_use_the_strip_freshness(mgr):
    """The taskbar stats are folded onto a heartbeat in TWO places — the POST
    and the SSE stream — and the SSE one cannot be driven from a test without
    opening a stream that never returns. They must not drift: either of them
    asking for the Monitor's rate puts the plug back on a 1s cadence for every
    open desktop, which is the bug this whole change removes."""
    import re as _re
    src = open(mgr.__file__).read()
    calls = _re.findall(r"self\._get_system_status\(([^)]*)\)", src)
    assert calls, "no call sites found — has the method been renamed?"
    bare = [c for c in calls if not c.strip()]
    strip = [c for c in calls if c.strip() == "WALL_POWER_STRIP_FRESH"]
    assert len(bare) == 1, \
        f"only the Monitor's own route may take the default (1s); found {len(bare)}"
    assert len(strip) == 2, \
        f"both heartbeat paths must ask for the relaxed value; found {len(strip)}"
    assert len(bare) + len(strip) == len(calls), f"unexpected argument in {calls}"


def test_the_strip_freshness_still_serves_a_live_row(mgr):
    """A host where ONLY the strip is watching must never withhold the reading
    for being stale — that would blank the WALL row on an idle desktop."""
    assert mgr.WALL_POWER_STRIP_FRESH < mgr.WALL_POWER_MAX_AGE
    assert mgr.WALL_POWER_STRIP_FRESH > mgr.WALL_POWER_FRESH


# --- the 7-day metrics recorder (manager side) -------------------------------

@pytest.fixture()
def rec(mgr, tmp_path, monkeypatch):
    """A real ring in tmp_path, with the manager's module-level handle reset
    around the test so nothing leaks into the next one."""
    keep = mgr._hist
    monkeypatch.setattr(mgr, "METRICS_FILE", str(tmp_path / "metrics.ring"))
    mgr._hist = None
    yield mgr._hist_open()
    h = mgr._hist
    if h:
        h.close()
    mgr._hist = keep


def test_a_status_poll_feeds_the_recorder(mgr, rec, wall, monkeypatch):
    """The request already paid for the collection; the recorder rides along."""
    import time
    wall({"w": 120.0, "at": 1790000000, "fetched": time.time()})
    _status_payload(mgr, monkeypatch)
    assert rec.pending() is True, "the open bucket holds the sample"


def test_the_recorder_keeps_no_process_data(mgr, rec, monkeypatch):
    """84% of the payload and the least useful thing to have a week later."""
    import metrics_history
    assert "processes" not in metrics_history.FIELDS
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda *a, **k: {"cpu_percent": 5.0,
                                         "processes": [{"pid": 1, "name": "secret"}]})
    monkeypatch.setattr(mgr, "_ctx_user", lambda *a, **k: mgr.APP_USER)

    class _H:
        def _get_running_terminals(self):
            return []
    mgr.Handler._get_system_status(_H())
    import time as _t
    mgr._hist.tick(_t.time() + 4)
    blob = open(rec.path, "rb").read()
    assert b"secret" not in blob


def test_a_failed_collection_is_not_recorded_as_data(mgr, rec, monkeypatch):
    """An {"error": ...} payload must not land in the ring as a row of absent
    sensors: that draws a gap indistinguishable from a real outage, which is a
    different event. Asserted against _hist_note directly — the handler returns
    before the recorder on today's code, so driving it through the handler
    would pass whether or not the guard exists."""
    mgr._hist_note({"error": "status unavailable: boom"})
    assert rec.pending() is False
    mgr._hist_note({"error": "boom", "cpu_percent": 12.0})
    assert rec.pending() is False, "a partial payload flagged as an error is still an error"
    mgr._hist_note({"cpu_percent": 12.0})
    assert rec.pending() is True, "and a good one is still recorded"


def test_the_handler_never_reaches_the_recorder_on_a_failed_collection(mgr, rec,
                                                                       monkeypatch):
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("boom")))
    monkeypatch.setattr(mgr, "_ctx_user", lambda *a, **k: mgr.APP_USER)

    class _H:
        def _get_running_terminals(self):
            return []
    assert "error" in mgr.Handler._get_system_status(_H())
    assert rec.pending() is False


def test_skipping_the_process_scan_really_skips_it(mgr, monkeypatch):
    """Against the REAL collector: the scan is 11.3ms of a 12.5ms collection
    (measured on z20), so the recorder must not merely discard the result."""
    calls = []
    real = mgr.system_status._collect_top_procs
    monkeypatch.setattr(mgr.system_status, "_collect_top_procs",
                        lambda *a: calls.append(1) or real())
    monkeypatch.setattr(mgr.system_status, "_proc_cache", [])
    st = mgr.system_status.get_system_status([], mgr._cached, want_procs=False)
    assert calls == [], "the scan must not run at all"
    assert "processes" not in st, \
        "and the key is OMITTED — an empty list is a claim that nothing is running"
    st2 = mgr.system_status.get_system_status([], mgr._cached)
    assert calls and isinstance(st2.get("processes"), list), "default still collects"


def test_the_idle_ticker_asks_for_the_cheap_collection(mgr, rec, monkeypatch):
    """Only when nobody else has filled the bucket, and then without procs."""
    seen = []
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda rt, c, want_procs=True: (seen.append(want_procs),
                                                        {"cpu_percent": 7.0})[1])
    monkeypatch.setattr(mgr, "_wall_power_w", lambda: None)
    n = {"sleeps": 0}

    def one_pass(_s):                       # let exactly one loop body run
        n["sleeps"] += 1
        if n["sleeps"] > 1:
            raise _Stop()
    monkeypatch.setattr(mgr.time, "sleep", one_pass)
    try:
        mgr._hist_loop()
    except _Stop:
        pass
    assert seen == [False], f"one idle collection, without the process scan; got {seen}"

    # And with a bucket already open — someone IS watching — it collects nothing,
    # because the request path already paid for that sample.
    seen.clear()
    mgr._hist_note({"cpu_percent": 5.0})
    assert rec.pending() is True
    n["sleeps"] = 0
    try:
        mgr._hist_loop()
    except _Stop:
        pass
    assert seen == [], "a watched host must cost the recorder nothing"


def _run_loop(mgr, monkeypatch, passes=1):
    """Run the recorder loop for `passes` iterations, then stop it."""
    n = {"s": 0}

    def sleeper(_s):
        n["s"] += 1
        if n["s"] > passes:
            raise _Stop()
    monkeypatch.setattr(mgr.time, "sleep", sleeper)
    try:
        mgr._hist_loop()
    except _Stop:
        pass


@pytest.fixture()
def collector(mgr, monkeypatch):
    """Counts collections and plug reads the loop performs."""
    seen = {"collect": 0, "plug": 0}
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda rt, c, want_procs=True: (seen.__setitem__(
                            "collect", seen["collect"] + 1), {"cpu_percent": 7.0})[1])
    monkeypatch.setattr(mgr, "_wall_power_w",
                        lambda *a, **k: seen.__setitem__("plug", seen["plug"] + 1) or 100.0)
    return seen


def test_an_unwatched_host_is_sampled_slowly_not_every_bucket(mgr, rec, collector,
                                                              monkeypatch):
    """The first version sampled every 2s bucket forever. On an idle host that
    burned 1.30% of a core and opened 11 connections to the smart plug every
    20 seconds — for a chart nobody had open."""
    mgr._hist_demand = 0.0                    # nobody has polled
    mgr._hist_self_at = 0.0
    clock = {"t": 10_000.0}
    monkeypatch.setattr(mgr.time, "monotonic", lambda: clock["t"])
    _run_loop(mgr, monkeypatch, passes=1)
    assert collector["collect"] == 1, "one sample when it first finds itself idle"
    for _ in range(5):                        # five more wakes, 2s apart
        clock["t"] += mgr.METRICS_STEP
        _run_loop(mgr, monkeypatch, passes=1)
    assert collector["collect"] == 1, \
        f"an unwatched host must not sample every bucket; got {collector['collect']}"
    assert collector["plug"] == 1, \
        "and must not keep polling the smart plug — that was most of the cost"
    clock["t"] += mgr.METRICS_IDLE_STEP       # past the idle cadence
    _run_loop(mgr, monkeypatch, passes=1)
    assert collector["collect"] == 2, "but it does keep a slow trace going"


def test_recording_a_sample_is_never_itself_demand(mgr, rec, collector,
                                                   monkeypatch):
    """Two callers land in _hist_note without anyone asking for 2s data: our own
    idle sample, and the desktop heartbeat collecting the taskbar's 5s stats
    strip. Marking demand there kept the recorder — and through it the smart
    plug — at the full 2s rate whenever any desktop was open, which is most of
    the time. Only the Monitor's own route counts."""
    mgr._hist_demand = 0.0
    mgr._hist_self_at = 0.0
    clock = {"t": 20_000.0}
    monkeypatch.setattr(mgr.time, "monotonic", lambda: clock["t"])
    _run_loop(mgr, monkeypatch, passes=1)
    assert mgr._hist_watched(clock["t"]) is False, \
        "the recorder watching itself is not a viewer"
    mgr._hist_note({"cpu_percent": 5.0})
    assert mgr._hist_watched(clock["t"]) is False, \
        "a heartbeat's taskbar-strip collection is not the Monitor being open"


def test_polling_the_monitors_route_is_what_marks_demand(client, mgr, users,
                                                         stubs, rec):
    """Through the real HTTP route — asserting on _hist_saw_monitor() directly
    cannot see the route stop calling it."""
    mgr._hist_demand = 0.0
    assert mgr._hist_watched() is False
    assert client.get("/api/system/status", cookie=users["alice"][1])[0] == 200
    assert mgr._hist_watched() is True, \
        "the Monitor's own poll is the signal that 2s resolution is wanted"


def test_the_heartbeat_feeds_the_ring_without_raising_the_cadence(mgr, rec,
                                                                  collector,
                                                                  monkeypatch):
    """It is still free data — just not a reason to sample faster."""
    mgr._hist_demand = 0.0
    clock = {"t": 25_000.0}
    wall = {"t": 1790000500.0}
    monkeypatch.setattr(mgr.time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(mgr.time, "time", lambda: wall["t"])
    mgr._hist_note({"cpu_percent": 42.0})
    bucket = int(wall["t"]) // mgr.METRICS_STEP * mgr.METRICS_STEP
    assert rec.pending(bucket) is True, "the heartbeat's sample IS recorded"
    assert mgr._hist_watched(clock["t"]) is False


def test_a_watcher_restores_the_fine_cadence(mgr, rec, collector, monkeypatch):
    clock = {"t": 30_000.0}
    wall = {"t": 1790000000.0}
    monkeypatch.setattr(mgr.time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(mgr.time, "time", lambda: wall["t"])
    mgr._hist_demand = 0.0
    mgr._hist_self_at = clock["t"]
    assert mgr._hist_watched(clock["t"]) is False
    # Through the REAL path a status request takes — setting the global by hand
    # would not notice if _hist_note stopped recording demand at all.
    mgr._hist_saw_monitor()
    assert mgr._hist_watched(clock["t"]) is True, \
        "a poll of /api/system/status is what makes a host watched"
    # Move to the NEXT bucket, which that request did not reach, while still
    # inside the grace: a poll that skipped a beat is topped up at once.
    clock["t"] += mgr.METRICS_STEP
    wall["t"] += mgr.METRICS_STEP
    _run_loop(mgr, monkeypatch, passes=1)
    assert collector["collect"] == 1, \
        "a watched bucket nobody filled is still filled at once, not in 30s"
    # And once the watcher stops, the grace expires rather than latching.
    clock["t"] += mgr.METRICS_WATCH_GRACE + 1
    assert mgr._hist_watched(clock["t"]) is False


def test_the_grace_outlasts_the_desktop_heartbeat(mgr):
    """The heartbeat folds status in every 5s. A grace shorter than that would
    flap between cadences while someone is looking at the desktop."""
    assert mgr.METRICS_WATCH_GRACE > 5.0
    assert mgr.METRICS_IDLE_STEP > mgr.METRICS_STEP


def test_a_still_open_previous_bucket_does_not_suppress_this_one(mgr, rec,
                                                                  monkeypatch):
    """The loop checks, then flushes — so when it wakes, the PREVIOUS bucket is
    usually still open. Asking "is anything open" instead of "is THIS bucket
    covered" reads that as "someone already sampled" and skips, leaving a hole
    every time a watcher stops polling."""
    step = mgr.METRICS_STEP
    now = 1790000000.0
    prev = int(now) // step * step - step
    with mgr._hist_lock:
        rec._fine.setdefault(prev, {}).setdefault("cpu_percent", []).append(5.0)
    assert rec.pending() is True, "something IS open — just not this bucket"
    assert rec.pending(int(now) // step * step) is False

    seen = []
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda rt, c, want_procs=True: (seen.append(want_procs),
                                                        {"cpu_percent": 7.0})[1])
    monkeypatch.setattr(mgr, "_wall_power_w", lambda: None)
    monkeypatch.setattr(mgr.time, "time", lambda: now)
    n = {"s": 0}

    def one_pass(_s):
        n["s"] += 1
        if n["s"] > 1:
            raise _Stop()
    monkeypatch.setattr(mgr.time, "sleep", one_pass)
    try:
        mgr._hist_loop()
    except _Stop:
        pass
    assert seen == [False], "this bucket had nothing, so the ticker must sample it"


def test_the_ticker_wakes_on_the_clock_and_cannot_drift(mgr):
    """A free-running sleep(step) walks forward through the bucket and, once it
    crosses a boundary, double-fills one and skips the next. Measured on z20
    that plateaued at 40 of 60 slots. Each wake is re-derived from the clock,
    so error cannot accumulate."""
    step = mgr.METRICS_STEP
    t = 1790000000.0
    wakes = []
    for _ in range(500):
        w = mgr._hist_next_wake(t)
        wakes.append(w)
        t = w + 0.31                       # a pass that costs real time
    # Exactly one wake per bucket, none skipped, none doubled.
    buckets = [int(w) // step * step for w in wakes]
    assert len(set(buckets)) == len(buckets), "a bucket was visited twice"
    assert buckets == sorted(buckets)
    gaps = {buckets[i + 1] - buckets[i] for i in range(len(buckets) - 1)}
    assert gaps == {step}, f"every consecutive bucket must be visited; gaps={gaps}"


def test_the_ticker_wakes_inside_the_bucket_it_samples(mgr):
    """Late enough that a watcher's poll has usually already landed (so the
    piggyback saving survives), but still INSIDE the bucket — a sample taken
    after the boundary belongs to the next one."""
    step = mgr.METRICS_STEP
    for offset in (0.0, 0.1, 0.5, 0.9, 1.3, 1.7, 1.99):
        now = 1790000000.0 + offset
        w = mgr._hist_next_wake(now)
        assert w > now
        frac = (w % step) / step
        assert 0.5 <= frac < 1.0, f"wake at {frac:.2f} of the bucket is too early"


def test_the_history_endpoint_is_gated_and_bounded(client, mgr, users, stubs, rec):
    ck = users["alice"][1]
    from conftest import ANON
    assert client.get("/api/system/history?span=1h", cookie=ANON)[0] in (401, 403), \
        "history is host-wide data; it needs a session like the status poll"
    st, body = client.get("/api/system/history?span=1h", cookie=ck)
    assert st == 200 and body["span"] == 3600 and body["step"] >= 2
    assert client.get("/api/system/history?span=99y", cookie=ck)[0] == 400
    # slots is clamped, not trusted: 600 points is already more than any chart
    # can draw, and the read walks every slot in the window.
    body = client.get("/api/system/history?span=7d&slots=100000", cookie=ck)[1]
    assert len(body["series"]["cpu_percent"]) <= 600


def test_the_endpoint_answers_the_monitors_own_window_exactly(client, mgr, users,
                                                              stubs, rec):
    ck = users["alice"][1]
    body = client.get("/api/system/history?span=2m&slots=60", cookie=ck)[1]
    assert body["step"] == 2 and len(body["series"]["cpu_percent"]) == 60, \
        "pre-filling the live chart must be exact, not an approximation"
