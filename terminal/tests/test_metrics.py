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
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mgr.Handler)
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        yield base
    finally:
        srv.shutdown()


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
    # A 404 to prove non-200s are tallied (and that 404 is NOT an error/5xx).
    with pytest.raises(urllib.error.HTTPError) as ei:
        urllib.request.urlopen(server + "/api/nope", timeout=5)
    assert ei.value.code == 404

    status, m = _get(server, "/api/metrics")
    assert status == 200
    assert m["requests_total"] >= 5                 # 3 pings + 404 + this metrics call
    assert m["responses"].get("200", 0) >= 3
    assert m["responses"].get("404", 0) >= 1
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
            urllib.request.urlopen(server + "/api/events", timeout=5)
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
