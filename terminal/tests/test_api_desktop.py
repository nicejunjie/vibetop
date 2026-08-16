"""Endpoint contracts for the cross-instance desktop registry (HTTP level;
complements the pure state-machine math in test_desktop.py):
GET/POST /api/desktop, /api/desktop/close, /api/desktop/ui."""


def test_heartbeat_response_shape(client):
    status, body = client.post("/api/desktop",
                               {"instance": "a", "open": ["terminal"], "active": "terminal"})
    assert status == 200 and body["ok"] is True
    for k in ("running", "reset_epoch", "close_targets", "sys_stats",
              "claude_usage", "terminals_running", "warnings"):
        assert k in body
    assert body["running"] == ["terminal"]
    assert body["system"] == {"cpu": {"pct": 0}, "mem": {}}   # folded in (stats on)


def test_instance_required(client):
    status, _ = client.post("/api/desktop", {"open": ["x"]})
    assert status == 400


def test_open_must_be_a_list(client):
    status, _ = client.post("/api/desktop", {"instance": "a", "open": "terminal"})
    assert status == 400


def test_get_restores_own_windows(client):
    client.post("/api/desktop", {"instance": "phone", "open": ["notes"], "active": "notes"})
    status, body = client.get("/api/desktop?instance=phone")
    assert status == 200
    assert body["open"] == ["notes"]
    assert body["active"] == "notes"


def test_union_merges_across_instances(client):
    client.post("/api/desktop", {"instance": "a", "open": ["terminal"]})
    _, body = client.post("/api/desktop", {"instance": "b", "open": ["files"]})
    assert set(body["running"]) == {"terminal", "files"}


def test_ui_toggle_hides_system_field(client):
    status, body = client.post("/api/desktop/ui", {"sysStats": False})
    assert status == 200 and body["sys_stats"] is False
    _, hb = client.post("/api/desktop", {"instance": "a", "open": []})
    assert hb["sys_stats"] is False
    assert "system" not in hb            # server omits it so it isn't collected


def test_close_records_targets_for_live_holders(client):
    client.post("/api/desktop", {"instance": "a", "open": ["browser"]})
    status, body = client.post("/api/desktop/close", {"app": "browser"})
    assert status == 200
    assert body["close_targets"].get("browser") == ["a"]


def test_close_requires_app(client):
    status, _ = client.post("/api/desktop/close", {})
    assert status == 400


def test_viewport_self_report_is_logged_and_never_stored(client, caplog):
    """A phone whose shell had to self-correct reports it on the heartbeat.

    This is the only channel we have for a layout bug on a device we cannot
    reach, so it must (a) reach the log with the raw numbers, (b) never be
    persisted or echoed back, and (c) be bounded — a client must not be able to
    turn the 5s heartbeat into a log-spam or storage channel.
    """
    import logging
    with caplog.at_level(logging.WARNING, logger="vibetop"):
        status, body = client.post("/api/desktop", {
            "instance": "phone", "open": ["terminal"], "active": "terminal",
            "viewport": {"n": 1, "drift": 320, "applied": 476, "visible": 476,
                         "clientH": 796, "innerH": 796, "vvH": 476, "vvTop": 0,
                         "w": 390, "standalone": True,
                         # hostile extras: must be dropped, not logged
                         "evil": "x" * 200, "nested": {"a": 1}, "huge": 10 ** 9},
        })
    assert status == 200
    assert "viewport" not in body                      # never echoed back
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "viewport self-correction" in logged
    assert '"drift": 320' in logged and '"applied": 476' in logged
    assert "evil" not in logged and "nested" not in logged and "10000" not in logged

    # ...and it is not persisted into the desktop state.
    import json as _json
    status, state = client.get("/api/desktop?instance=phone")
    assert status == 200
    assert "viewport" not in _json.dumps(state)
