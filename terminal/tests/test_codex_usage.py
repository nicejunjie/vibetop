"""Codex usage snapshots are read from the requesting user's rollout logs."""
import json
import os


def _event(ts, primary=25, secondary=40):
    return {"timestamp": ts, "type": "event_msg", "payload": {
        "type": "token_count", "rate_limits": {
            "primary": {"used_percent": primary, "window_minutes": 300,
                        "resets_at": 2000000000},
            "secondary": {"used_percent": secondary, "window_minutes": 10080,
                          "resets_at": 2000600000},
            "plan_type": "plus"}}}


def test_codex_usage_reads_newest_session(mgr, tmp_path):
    sessions = tmp_path / ".codex/sessions/2026/09/02"
    sessions.mkdir(parents=True)
    old = sessions / "old.jsonl"
    new = sessions / "new.jsonl"
    old.write_text(json.dumps(_event("2026-09-02T10:00:00Z", 10, 20)) + "\n")
    new.write_text("not json\n" + json.dumps(_event("2026-09-02T11:00:00Z", 30, 50)) + "\n")
    os.utime(new, (200, 200))
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["enabled"] is True
    assert got["session"]["pct"] == .30
    assert got["weekly"]["pct"] == .50
    assert got["session"]["minutes"] == 300
    assert got["plan"] == "plus"


def test_codex_usage_missing_and_disabled(mgr, tmp_path):
    assert mgr._codex_usage_payload(str(tmp_path), True) == {"enabled": True}
    assert mgr._codex_usage_payload(str(tmp_path), False) == {"enabled": False}
