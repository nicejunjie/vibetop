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


def _turn(ts, out, duration_ms=1000):
    """A completed turn: a token_count event (this turn's output_tokens, per-turn
    not a running counter) immediately followed by its task_complete (duration_ms
    = the turn's wall clock) — the back-to-back pair the tok/s parser reads."""
    return (json.dumps({"timestamp": ts, "type": "event_msg", "payload": {
        "type": "token_count", "info": {
            "last_token_usage": {"output_tokens": out},
            "total_token_usage": {"output_tokens": out * 2},
            "model_context_window": 192000}}}) + "\n"
        + json.dumps({"timestamp": ts, "type": "event_msg", "payload": {
            "type": "task_complete", "turn_id": "t", "started_at": 1,
            "completed_at": 2, "duration_ms": duration_ms}}) + "\n")


def test_codex_tok_s_computes_per_turn_rate(mgr, tmp_path):
    """One completed turn → rate = this_turn.output / this_turn.duration."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "rollout.jsonl"
    rollout.write_text(_turn("2026-09-03T10:00:00Z", 200, duration_ms=10000))
    got = mgr._codex_tok_s_payload(str(tmp_path))
    assert got["rate"] == 20.0          # 200 tok / 10 s
    assert got["outNow"] == 200
    assert got["dt"] == 10.0
    assert got["file"] == "rollout.jsonl"


def test_codex_tok_s_needs_completed_turn(mgr, tmp_path):
    """A token_count with no following task_complete (turn still in flight) →
    rate is None, the page shows n/a."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "rollout.jsonl"
    rollout.write_text(json.dumps({"timestamp": "2026-09-03T10:00:00Z",
        "type": "event_msg", "payload": {"type": "token_count", "info": {
            "last_token_usage": {"output_tokens": 100}}}}) + "\n")
    got = mgr._codex_tok_s_payload(str(tmp_path))
    assert got["rate"] is None
    assert got["outNow"] is None


def test_codex_tok_s_missing_output_field_degrades(mgr, tmp_path):
    """A token_count without a usable output_tokens → its task_complete is
    skipped (no numerator to pair), not a crash."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    rollout = sessions / "rollout.jsonl"
    bad = {"timestamp": "2026-09-03T10:00:00Z", "type": "event_msg",
           "payload": {"type": "token_count", "info": {"last_token_usage": {}}}}
    rollout.write_text(
        json.dumps(bad) + "\n"
        + json.dumps({"timestamp": "2026-09-03T10:00:00Z", "type": "event_msg",
                      "payload": {"type": "task_complete", "turn_id": "t",
                                  "duration_ms": 5000}}) + "\n")
    got = mgr._codex_tok_s_payload(str(tmp_path))
    assert got["rate"] is None          # no usable output_tokens to pair


def test_codex_tok_s_prefers_rollout_with_latest_turn(mgr, tmp_path):
    """The file whose latest completed turn is most recent wins — even if its
    mtime is the oldest (a touched-but-quiet file must not shadow the live one)."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    old = sessions / "old.jsonl"
    new = sessions / "new.jsonl"
    old.write_text(_turn("2026-09-03T09:00:00Z", 500, duration_ms=1000))
    new.write_text(_turn("2026-09-03T10:00:00Z", 200, duration_ms=10000))
    os.utime(new, (200, 200))          # oldest mtime, but the newest turn
    got = mgr._codex_tok_s_payload(str(tmp_path))
    assert got["file"] == "new.jsonl"
    assert got["rate"] == 20.0
