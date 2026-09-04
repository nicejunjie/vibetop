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


def test_a_premium_credits_record_cannot_disturb_the_codex_numbers(mgr, tmp_path):
    """The `limit_id: premium` record has BOTH windows null in every single case
    -- because the credits balance is "0", not because anything is exhausted --
    and it is written in the same instant as the codex record, so it looked like
    the limit talking. That is where "the API returns null at the limit" came
    from. `_is_codex_limit` filters it, and nothing about it may reach the
    numbers.

    Three tests here previously claimed to prove exhaustion handling using this
    record. They could not: it is filtered before it reaches any of that logic,
    and their 100% came from the ORDINARY event before it, which already carried
    used_percent 100. All three passed with the exhaustion code deleted."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    (sessions / "blocked.jsonl").write_text(
        json.dumps(_event("2026-09-03T18:54:51Z", 50, 74)) + "\n"
        + json.dumps(_blocked_event("2026-09-03T18:54:52Z")) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    # deliberately NOT 100 on either side: the only null record is not ours
    assert got["session"] == {"pct": .50, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .74, "reset": 2000600000, "minutes": 10080}


def test_a_real_hundred_percent_is_reported_as_a_hundred_percent(mgr, tmp_path):
    """Measured live at the limit on 2026-09-04: Codex writes the ceiling as an
    ordinary number. The 5-hour window went 97, 98, 99, 100.0 -- it never went
    null. This is the path that actually carries an exhausted window."""
    sessions = tmp_path / ".codex/sessions/2026/09/03"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_event("2026-09-03T18:54:51Z", 100, 92)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 1.0
    assert got["weekly"]["pct"] == .92, "the 5h limit does not exhaust the week"


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


def test_a_null_codex_window_keeps_the_last_reading_and_claims_nothing(mgr, tmp_path):
    """This asserted the opposite: that a later null on a near-limit window MEANT
    100%. The premise was that Codex stops reporting a number once a limit is
    hit. It does not -- 0 of 1420 real codex records carries a null, including
    the ones written at exactly 100% -- so the inference fired only on a shape
    the API does not produce, and would have been a guess if it ever did.

    A null window now means "this event carried no reading": keep the last real
    one and say nothing new."""
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
    assert got["session"] == {"pct": .98, "reset": 2000000000, "minutes": 300}
    assert got["weekly"] == {"pct": .77, "reset": 2000600000, "minutes": 10080}


def test_a_window_never_seen_stays_absent(mgr, tmp_path):
    """A window we have never had a reading for must report nothing at all --
    not 0, and certainly not 100."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_family_event("2026-09-04T09:00:00Z", "codex",
                                 {"used_percent": 95, "window_minutes": 300,
                                  "resets_at": 2000000000}, None)) + "\n"
        + json.dumps(_family_event("2026-09-04T09:00:01Z", "codex", None, None)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == .95
    assert got["weekly"] is None


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
    assert got["session"]["reset"] is None, (
        "and it reports NO next reset: the window is anchored to the first use "
        "after the old one expired, so until that request there is nothing to "
        "count down to. Projecting reset+span was measurably wrong by exactly "
        "the length of the idle gap (+18 min on 2026-09-04)")
    assert got["weekly"]["pct"] == .77, "the weekly window has NOT rolled: keep its value"
    assert got["weekly"]["reset"] == weekly_future


# ---- concurrent sessions disagree; the max within a generation is the truth --

def test_two_live_sessions_cannot_make_the_number_go_backwards(mgr, tmp_path):
    """Watched live on 2026-09-04: the strip read 96% -> 94% -> 99% -> 100% ->
    99% in three minutes. Two Codex sessions were writing rollouts at once and
    the payload took whichever record was newest BY TIMESTAMP, so a request that
    started earlier and landed later dragged the display back down.

    Within one generation of a window -- the same resets_at -- used_percent is
    monotonically non-decreasing, so the lower reading is stale by definition."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "a.jsonl").write_text(
        json.dumps(_event("2026-09-04T23:02:41Z", 96, 92)) + "\n")
    (sessions / "b.jsonl").write_text(          # newer, but a staler snapshot
        json.dumps(_event("2026-09-04T23:02:57Z", 94, 91)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == .96, "a later, lower reading won"
    assert got["weekly"]["pct"] == .92


def test_the_same_disagreement_inside_one_rollout_file(mgr, tmp_path):
    """Same rule when both records land in one file — the per-file scanner has
    to apply it too, not just the cross-file merge."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    (sessions / "r.jsonl").write_text(
        json.dumps(_event("2026-09-04T23:03:44Z", 100, 92)) + "\n"
        + json.dumps(_event("2026-09-04T23:03:45Z", 99, 92)) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 1.0, "the 99 that followed the 100 won"


def test_a_new_generation_wins_however_low_its_number(mgr, tmp_path):
    """The max rule holds only WITHIN a generation. A later resets_at is the
    window having rolled, and its 3% is the truth over the old window's 100% —
    otherwise the strip would pin at 100 forever."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    old = _event("2026-09-04T23:00:00Z", 100, 92)
    new = _event("2026-09-04T23:10:00Z", 3, 92)
    new["payload"]["rate_limits"]["primary"]["resets_at"] = 2000018000   # +5h
    (sessions / "r.jsonl").write_text(
        json.dumps(old) + "\n" + json.dumps(new) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"] == {"pct": .03, "reset": 2000018000, "minutes": 300}


def test_the_max_rule_does_not_defeat_the_rollover(mgr, tmp_path):
    """A generation whose resets_at has passed still reads 0 — the max is only
    the best reading FOR that window, and `rolled` retires the window itself."""
    import time as _t
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    now = int(_t.time())
    ev = _event("2026-09-04T17:35:06Z", 98, 40)
    ev["payload"]["rate_limits"]["primary"]["resets_at"] = now - 600
    ev["payload"]["rate_limits"]["secondary"]["resets_at"] = now + 3 * 86400
    (sessions / "r.jsonl").write_text(json.dumps(ev) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 0.0
    assert got["session"]["reset"] is None, "a window that has not started has no reset"
    assert got["weekly"]["pct"] == .40, "only the rolled window resets"


def test_a_few_seconds_of_reset_drift_is_the_same_window(mgr, tmp_path):
    """`resets_at` wobbles between calls — observed 1788583390 then 1788583393
    for the same window, seconds apart. Compared exactly, the later value reads
    as a NEW generation and wins outright, so a stale-but-later record drags the
    number down: the very oscillation the max rule exists to stop. A real roll
    moves the reset by most of a window."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    hi = _event("2026-09-04T23:43:13Z", 40, 92)
    lo = _event("2026-09-04T23:43:19Z", 12, 92)          # stale, 3s later reset
    lo["payload"]["rate_limits"]["primary"]["resets_at"] += 3
    (sessions / "r.jsonl").write_text(json.dumps(hi) + "\n" + json.dumps(lo) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == .40, "a 3-second drift was treated as a new window"
    assert got["session"]["reset"] == 2000000003, "keep the latest reset seen"


def test_a_real_roll_is_still_detected_across_the_idle_gap(mgr, tmp_path):
    """The tolerance must not swallow a genuine roll. The real one moves the
    reset by a whole window PLUS the idle gap — 5h18m in the measured case."""
    sessions = tmp_path / ".codex/sessions/2026/09/04"
    sessions.mkdir(parents=True)
    old = _event("2026-09-04T23:00:00Z", 100, 92)
    new = _event("2026-09-04T23:43:13Z", 0, 92)
    new["payload"]["rate_limits"]["primary"]["resets_at"] += 300 * 60 + 1078
    (sessions / "r.jsonl").write_text(json.dumps(old) + "\n" + json.dumps(new) + "\n")
    got = mgr._codex_usage_payload(str(tmp_path), True)
    assert got["session"]["pct"] == 0.0, "the new window's 0% must beat the old 100%"
    assert got["session"]["reset"] == 2000000000 + 300 * 60 + 1078
