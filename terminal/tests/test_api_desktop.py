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


# --- split-view layout: per-instance, GET-only restore data ------------------

def test_split_persist_restore_round_trip(client):
    client.post("/api/desktop", {
        "instance": "desk", "open": ["terminal", "files"], "active": "terminal",
        "split": {"apps": ["terminal", "files"], "ratio": 0.4},
    })
    status, body = client.get("/api/desktop?instance=desk")
    assert status == 200
    assert body["split"] == {"apps": ["terminal", "files"], "ratio": 0.4}


def test_split_ratio_clamped(client):
    client.post("/api/desktop", {"instance": "d", "open": ["a", "b"], "active": "a",
                                 "split": {"apps": ["a", "b"], "ratio": 5}})
    _, hi = client.get("/api/desktop?instance=d")
    assert hi["split"]["ratio"] == 0.95
    client.post("/api/desktop", {"instance": "d", "open": ["a", "b"], "active": "a",
                                 "split": {"apps": ["a", "b"], "ratio": -1}})
    _, lo = client.get("/api/desktop?instance=d")
    assert lo["split"]["ratio"] == 0.05


def test_split_malformed_is_dropped_not_400(client):
    for bad in ("x", {"apps": ["only-one"]}, {"apps": ["a", "a"]},
                {"apps": ["a", 2]}, {"ratio": 0.5}):
        status, body = client.post("/api/desktop", {
            "instance": "d", "open": ["a", "b"], "active": "a", "split": bad})
        assert status == 200                       # cosmetic field never breaks the heartbeat
        _, g = client.get("/api/desktop?instance=d")
        assert g["split"] is None


def test_split_absent_from_post_reply(client):
    # split is GET-only restore data; keeping it out of the POST reply preserves
    # the heartbeat contract asserted by test_heartbeat_response_shape.
    _, body = client.post("/api/desktop", {
        "instance": "d", "open": ["a", "b"], "active": "a",
        "split": {"apps": ["a", "b"], "ratio": 0.5}})
    assert "split" not in body


def test_split_cleared_when_omitted_next_beat(client):
    # The POST rewrites the whole instance entry, so a heartbeat without `split`
    # (e.g. after unsplit) must clear it — the client always sends split=null then.
    client.post("/api/desktop", {"instance": "d", "open": ["a", "b"], "active": "a",
                                 "split": {"apps": ["a", "b"], "ratio": 0.5}})
    client.post("/api/desktop", {"instance": "d", "open": ["a", "b"], "active": "a"})
    _, g = client.get("/api/desktop?instance=d")
    assert g["split"] is None
