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


def _blocked_event(ts):
    """The terminal out-of-limit event: primary/secondary are null."""
    return {"timestamp": ts, "type": "event_msg", "payload": {
        "type": "token_count", "rate_limits": {
            "limit_id": "premium", "primary": None, "secondary": None,
            "plan_type": "plus"}}}


def test_codex_usage_keeps_reset_when_blocked_event_has_null_primary(mgr, tmp_path):
    """A null-primary out-of-limit event must not wipe the last valid snapshot."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "blocked.jsonl"
    rollout.write_text(
        json.dumps(_event("2026-09-03T18:54:51Z", 100, 74)) + "\n"
        + json.dumps(_blocked_event("2026-09-03T18:54:52Z")) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": 1.0, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .74, "reset": 2000600000, "minutes": 10080}


def _one_null_event(ts, primary, secondary):
    """An out-of-limit event where exactly one window is null."""
    return {"timestamp": ts, "type": "event_msg", "payload": {
        "type": "token_count", "rate_limits": {
            "limit_id": "premium", "primary": primary, "secondary": secondary,
            "plan_type": "plus"}}}


def test_codex_usage_weekly_exhausted(mgr, tmp_path):
    """A null-secondary event marks the weekly window 100%; session keeps its value."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "blocked.jsonl"
    rollout.write_text(
        json.dumps(_event("2026-09-03T18:54:51Z", 50, 100)) + "\n"
        + json.dumps(_one_null_event("2026-09-03T18:54:52Z",
                                    {"used_percent": 50, "window_minutes": 300,
                                     "resets_at": 2000000000}, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": .50, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": 1.0, "reset": 2000600000, "minutes": 10080}


def test_codex_usage_primary_exhausted(mgr, tmp_path):
    """A null-primary event marks the session window 100%; weekly keeps its value."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "blocked.jsonl"
    rollout.write_text(
        json.dumps(_event("2026-09-03T18:54:51Z", 100, 50)) + "\n"
        + json.dumps(_one_null_event("2026-09-03T18:54:52Z", None,
                                    {"used_percent": 50, "window_minutes": 10080,
                                     "resets_at": 2000600000})) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": 1.0, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .50, "reset": 2000600000, "minutes": 10080}


def test_codex_usage_missing_and_disabled(mgr, tmp_path):
    assert mgr._codex_usage_payload(str(tmp_path), True) == {"enabled": True}
    assert mgr._codex_usage_payload(str(tmp_path), False) == {"enabled": False}


def test_codex_usage_keeps_limit_snapshot_after_large_error_output(mgr, tmp_path):
    """A blocked session must keep showing 100% and its reset countdown."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "blocked.jsonl"
    rollout.write_text(json.dumps(_event("2026-09-03T10:00:00Z", 100, 74)) + "\n")

    first = mgr._codex_usage_payload(str(tmp_path), True)
    assert first["session"] == {"pct": 1.0, "reset": 2000000000, "minutes": 300}

    # This used to push the snapshot beyond the parser's 512 KiB tail window.
    with rollout.open("a") as stream:
        stream.write(json.dumps({"type": "response_item", "payload": {
            "type": "error", "message": "limit reached", "detail": "x" * 600000}}) + "\n")

    blocked = mgr._codex_usage_payload(str(tmp_path), True)
    assert blocked["session"]["pct"] == 1.0
    assert blocked["session"]["reset"] == 2000000000
