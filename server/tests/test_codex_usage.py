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


# --- the real rollout carries more than one limit FAMILY ------------------- #
# Measured over 1225 real token_count events in ~/.codex/sessions:
#   limit_id=codex                 1220   primary 300 min + secondary 10080 min
#   limit_id=premium                  3   BOTH null — a credits limit
#   limit_id=base_model_inference     2   primary 10080 min, secondary null
# Zero codex records had a null window. So a null seen in a rollout is far more
# likely to be a different family than an exhausted codex window, and reading
# whichever record is newest is what made that dangerous.

def _family_event(stamp, limit_id, primary, secondary, extra=None):
    limits = {"limit_id": limit_id, "limit_name": None,
              "primary": primary, "secondary": secondary}
    if extra:
        limits.update(extra)
    return {"timestamp": stamp,
            "payload": {"type": "token_count", "rate_limits": limits}}


def test_codex_usage_ignores_the_premium_credits_record(mgr, tmp_path):
    """A `premium` record has BOTH windows null because it is a credits limit —
    `has_credits: false, balance: "0"` — and says nothing about the 5h/weekly
    pair. In the real trace it lands TWO SECONDS after the last codex reading,
    so on timestamp alone it wins exactly when the numbers matter most."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T17:35:06Z", "codex",
                                 {"used_percent": 98, "window_minutes": 300,
                                  "resets_at": 2000000000},
                                 {"used_percent": 77, "window_minutes": 10080,
                                  "resets_at": 2000600000})) + "\n"
        + json.dumps(_family_event("2026-09-04T17:35:08Z", "premium", None, None,
                                   {"credits": {"has_credits": False,
                                                "unlimited": False, "balance": "0"}})) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": .98, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .77, "reset": 2000600000, "minutes": 10080}


def test_codex_usage_ignores_the_gpt_reserve_record(mgr, tmp_path):
    """`base_model_inference` puts a WEEKLY window (10080) in the PRIMARY slot.
    Read as a codex record it would be drawn as the 5-hour figure."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T17:00:00Z", "codex",
                                 {"used_percent": 12, "window_minutes": 300,
                                  "resets_at": 2000000000},
                                 {"used_percent": 40, "window_minutes": 10080,
                                  "resets_at": 2000600000})) + "\n"
        + json.dumps(_family_event("2026-09-04T17:00:01Z", "base_model_inference",
                                   {"used_percent": 0, "window_minutes": 10080,
                                    "resets_at": 2001000000}, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["minutes"] == 300, "the 5-hour slot must stay the 5-hour window"
    assert got["session"]["pct"] == .12
    assert got["weekly"]["pct"] == .40


def test_codex_usage_does_not_cry_exhausted_on_a_low_reading(mgr, tmp_path):
    """Both windows null with nothing near the limit is not evidence of
    exhaustion — it is an event that carried no numbers. Declaring whichever
    side happened to be higher (30% beating 12%) to be out of quota is a false
    alarm in the one direction that matters."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T10:00:00Z", "codex",
                                 {"used_percent": 12, "window_minutes": 300,
                                  "resets_at": 2000000000},
                                 {"used_percent": 30, "window_minutes": 10080,
                                  "resets_at": 2000600000})) + "\n"
        + json.dumps(_family_event("2026-09-04T10:00:05Z", "codex", None, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == .12, "a 12% window is not exhausted"
    assert got["weekly"]["pct"] == .30, "a 30% window is not exhausted"


def test_codex_usage_both_null_after_a_near_limit_reading(mgr, tmp_path):
    """...but when one window WAS nearly there, a later null does mean it. The
    session at 98% against a weekly at 77% is the case the strip exists for."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T17:35:06Z", "codex",
                                 {"used_percent": 98, "window_minutes": 300,
                                  "resets_at": 2000000000},
                                 {"used_percent": 77, "window_minutes": 10080,
                                  "resets_at": 2000600000})) + "\n"
        + json.dumps(_family_event("2026-09-04T17:35:07Z", "codex", None, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": 1.0, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .77, "reset": 2000600000, "minutes": 10080}


def test_codex_usage_never_invents_a_hundred_percent(mgr, tmp_path):
    """A window we have never had a reading for is not one we watched fill up.
    Reporting 100% on no evidence tells the user they are blocked when they are
    not, which is the worst way for this strip to be wrong."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T09:00:00Z", "codex",
                                 {"used_percent": 95, "window_minutes": 300,
                                  "resets_at": 2000000000}, None)) + "\n"
        + json.dumps(_family_event("2026-09-04T09:00:01Z", "codex", None, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 1.0, "the session WAS near the limit"
    assert got["weekly"] is None, "we have never seen a weekly reading — say nothing"


def test_codex_usage_a_rolled_window_reads_zero_not_the_stale_number(mgr, tmp_path):
    """Usage never falls DURING a window, so a stale number is a valid lower
    bound — until `resets_at` passes. Then the window has emptied and the old
    number is just wrong. Real trace: 98% at 17:35 with resets_at ~18:24:39,
    Codex silent for fifty minutes, next record 0%. Between the reset and that
    record the strip showed 98% of a window that no longer existed."""
    import time as _t
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    now = int(_t.time())
    past = now - 600                      # the 5-hour window rolled ten minutes ago
    weekly_future = now + 3 * 86400
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T17:35:06Z", "codex",
                                 {"used_percent": 98, "window_minutes": 300,
                                  "resets_at": past},
                                 {"used_percent": 77, "window_minutes": 10080,
                                  "resets_at": weekly_future})) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 0.0, "the 5-hour window rolled — it is empty, not 98%"
    assert got["session"]["reset"] > now, "and the reset rolls forward to the next real one"
    assert got["session"]["reset"] == past + 300 * 60
    assert got["weekly"]["pct"] == .77, "the weekly window has NOT rolled: keep its value"
    assert got["weekly"]["reset"] == weekly_future
