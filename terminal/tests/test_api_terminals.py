"""Endpoint contracts for terminal lifecycle + tab names:
POST /api/terminals/{n}/start|stop, GET /api/terminals/status,
GET/POST /api/terminals/names. systemctl is stubbed (see `stubs` fixture)."""


def test_start_dispatches_systemctl(client, stubs):
    status, body = client.post("/api/terminals/5/start", {})
    assert status == 200
    assert body == {"ok": True, "action": "start", "instance": 5}
    # A systemctl start --no-block for the session + ttyd units was invoked.
    starts = [c for c in stubs["run"] if "start" in c and "--no-block" in c]
    assert starts and any("vibetop-ttyd@5.service" in c for c in starts)


def test_stop_dispatches_systemctl(client, stubs):
    status, body = client.post("/api/terminals/5/stop", {})
    assert status == 200 and body["action"] == "stop"


def test_instance_out_of_range_rejected(client):
    status, body = client.post("/api/terminals/0/start", {})
    assert status == 400
    status, body = client.post("/api/terminals/9999/start", {})
    assert status == 400


def test_start_surfaces_systemctl_failure(client, mgr, monkeypatch):
    def boom(args, **kw):
        raise mgr.subprocess.CalledProcessError(1, args, stderr="unit not found")
    monkeypatch.setattr(mgr.subprocess, "run", boom)
    status, body = client.post("/api/terminals/5/start", {})
    assert status == 500 and "unit not found" in body["error"]


def test_status_lists_running(client, mgr, monkeypatch):
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [1, 4])
    status, body = client.get("/api/terminals/status")
    assert status == 200 and body == {"running": [1, 4]}


def test_tab_name_upsert_and_clear(client):
    status, body = client.post("/api/terminals/names", {"n": 7, "name": "deploy"})
    assert status == 200 and body["names"]["7"] == "deploy"
    _, got = client.get("/api/terminals/names")
    assert got["names"]["7"] == "deploy"
    # Empty name clears it.
    _, body = client.post("/api/terminals/names", {"n": 7, "name": ""})
    assert "7" not in body["names"]


def test_tab_name_bad_number_rejected(client):
    status, _ = client.post("/api/terminals/names", {"n": "abc", "name": "x"})
    assert status == 400
