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


def test_wall_power_absent_without_a_plug(mgr, monkeypatch):
    monkeypatch.setattr(mgr.system_status, "wall_power_endpoint",
                        lambda *a, **k: None)
    assert mgr._wall_power_w() is None


def test_wall_power_reports_a_fresh_sample(mgr, wall):
    import time
    wall({"w": 42.5, "at": time.time()})
    assert mgr._wall_power_w() == 42.5


def test_wall_power_reports_a_fresh_zero(mgr, wall):
    """0W is a measurement. Dropping it here would make the Monitor show '--'
    for a plug that is answering perfectly well with nothing plugged in."""
    import time
    wall({"w": 0.0, "at": time.time()})
    assert mgr._wall_power_w() == 0.0


def test_wall_power_withholds_a_stale_sample(mgr, wall):
    """The memo serves its last value however old it is — right for a disk
    sweep, wrong here. An unplugged or rebooted plug must make the reading
    disappear, not freeze the last wattage on screen looking live."""
    import time
    wall({"w": 42.5, "at": time.time() - (mgr.WALL_POWER_MAX_AGE + 1)})
    assert mgr._wall_power_w() is None


def test_wall_power_survives_one_missed_refresh(mgr, wall):
    """The staleness cut must sit clear of the refresh interval, or a single
    slow poll would blink the row out."""
    import time
    assert mgr.WALL_POWER_MAX_AGE > mgr.WALL_POWER_FRESH * 2
    wall({"w": 42.5, "at": time.time() - (mgr.WALL_POWER_FRESH + 1)})
    assert mgr._wall_power_w() == 42.5


def test_wall_power_never_polls_the_plug_on_a_request(mgr, wall, monkeypatch):
    """The Monitor polls every 2s from every open tab; the plug is a small
    embedded board. The request path must read the memo and nothing else."""
    import time
    monkeypatch.setattr(mgr.system_status, "read_wall_power",
                        lambda *a, **k: pytest.fail("fetched on the request path"))
    wall({"w": 42.5, "at": time.time()})
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
    wall({"w": watts, "at": time.time()})
    assert _status_payload(mgr, monkeypatch).get("wall_power_w") == watts


def test_status_payload_omits_wall_power_when_stale(mgr, wall, monkeypatch):
    """Absence is the signal the page reads as 'unknown'. Sending a stale number
    would render it as a live one."""
    import time
    wall({"w": 137.4, "at": time.time() - (mgr.WALL_POWER_MAX_AGE + 1)})
    assert "wall_power_w" not in _status_payload(mgr, monkeypatch)


def test_status_payload_has_no_wall_key_without_a_plug(mgr, monkeypatch):
    monkeypatch.setattr(mgr.system_status, "wall_power_endpoint",
                        lambda *a, **k: None)
    assert "wall_power_w" not in _status_payload(mgr, monkeypatch)
