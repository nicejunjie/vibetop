"""Endpoint contracts for terminal lifecycle + tab names:
POST /api/terminals/{n}/start|stop, GET /api/terminals/status,
GET/POST /api/terminals/names. systemctl is stubbed (see `stubs` fixture)."""


def test_start_dispatches_systemd_run_per_user(client, stubs):
    status, body = client.post("/api/terminals/5/start", {})
    assert status == 200
    assert body == {"ok": True, "action": "start", "instance": 5}
    # The terminal is launched as the request user (APP_USER here) via a
    # per-user systemd-run transient unit, NOT the old global template.
    runs = [c for c in stubs["run"] if isinstance(c, list)]
    sess = [c for c in runs if "systemd-run" in c
            and any("--unit=vibetop-uterm-" in a and a.endswith("-5.service") for a in c)]
    ttyd = [c for c in runs if "systemd-run" in c
            and any("--unit=vibetop-uttyd-" in a and a.endswith("-5.service") for a in c)]
    assert sess and ttyd
    assert any(a.startswith("--uid=") for a in sess[0])   # runs AS the user


def test_stop_dispatches_systemctl(client, stubs):
    status, body = client.post("/api/terminals/5/stop", {})
    assert status == 200 and body["action"] == "stop"


def test_instance_out_of_range_rejected(client):
    status, body = client.post("/api/terminals/0/start", {})
    assert status == 400
    status, body = client.post("/api/terminals/9999/start", {})
    assert status == 400


def test_start_surfaces_launch_failure(client, mgr, monkeypatch):
    # systemd-run returns non-zero + stderr -> the error is surfaced as 500.
    class _R:
        def __init__(s, rc, err): s.returncode = rc; s.stderr = err; s.stdout = ""
    monkeypatch.setattr(mgr.subprocess, "run", lambda *a, **k: _R(1, "unit failed to start"))
    monkeypatch.setattr(mgr.time, "sleep", lambda *a, **k: None)
    status, body = client.post("/api/terminals/5/start", {})
    assert status == 500 and "unit failed to start" in body["error"]


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


def test_fresh_start_clears_stale_tab_name(client, stubs):
    # An abnormal close (browser crash / host reboot / manager restart) leaves the
    # name behind but never runs the client's name-clear POST. Starting a FRESH
    # session for that number must forget the stale name server-side, so a reused
    # terminal doesn't inherit it. (Stubbed list-units -> nothing running -> the
    # start is a fresh one.)
    client.post("/api/terminals/names", {"n": 5, "name": "build"})
    _, got = client.get("/api/terminals/names")
    assert got["names"].get("5") == "build"
    status, _ = client.post("/api/terminals/5/start", {})
    assert status == 200
    _, got = client.get("/api/terminals/names")
    assert "5" not in got["names"]                 # fresh start forgot the stale name


def test_start_of_running_terminal_keeps_name(client, mgr, stubs, monkeypatch):
    # A start against an ALREADY-live session (a reconnect / idempotent re-start)
    # is not fresh — the name is a valid label for that session and must survive.
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user=None: [6])
    client.post("/api/terminals/names", {"n": 6, "name": "logs"})
    status, _ = client.post("/api/terminals/6/start", {})
    assert status == 200
    _, got = client.get("/api/terminals/names")
    assert got["names"].get("6") == "logs"         # live session -> name preserved
