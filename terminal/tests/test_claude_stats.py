"""claude_stats.get_stats must memoize PER USER (home), not globally by time.

A time-only cache leaked one user's token/cost stats to another within the TTL
on a multi-user host (whoever computed last was served to whoever asked next) —
a real cross-user isolation breach. These pin the per-home keying.
"""
import claude_stats


def test_get_stats_cache_keyed_per_home(monkeypatch):
    monkeypatch.setattr(claude_stats, "_cache", {})
    calls = {}

    def fake_compute(home):
        calls[home] = calls.get(home, 0) + 1
        return {"home": home}

    monkeypatch.setattr(claude_stats, "_compute", fake_compute)

    # Each home gets its OWN result — user B never receives user A's cached data.
    assert claude_stats.get_stats("/home/alice") == {"home": "/home/alice"}
    assert claude_stats.get_stats("/home/bob") == {"home": "/home/bob"}
    # A repeat for the same home is served from that home's cache entry.
    assert claude_stats.get_stats("/home/alice") == {"home": "/home/alice"}
    # …computed exactly once per distinct home.
    assert calls == {"/home/alice": 1, "/home/bob": 1}


def test_get_stats_ttl_refreshes_per_home(monkeypatch):
    monkeypatch.setattr(claude_stats, "_cache", {})
    monkeypatch.setattr(claude_stats, "_TTL", 45)
    seq = {"/home/alice": iter([{"v": 1}, {"v": 2}])}
    monkeypatch.setattr(claude_stats, "_compute", lambda h: next(seq[h]))

    t = [1000.0]
    monkeypatch.setattr(claude_stats.time, "time", lambda: t[0])
    assert claude_stats.get_stats("/home/alice") == {"v": 1}   # computed + cached
    t[0] += 10
    assert claude_stats.get_stats("/home/alice") == {"v": 1}   # within TTL → cached
    t[0] += 40                                                 # now past the 45s TTL
    assert claude_stats.get_stats("/home/alice") == {"v": 2}   # recomputed


# ---------------------------------------------------------------------------
# _compute — the actual transcript parse/aggregate/price loop. The tests above
# stub _compute out entirely, so without these the core logic (dedup, pricing,
# the token buckets, the skip rules) had NO direct coverage: a silent regression
# there would just produce wrong numbers on the dashboard. These exercise it on
# synthetic ~/.claude/projects/**/*.jsonl transcripts written into a tmp home.
# ---------------------------------------------------------------------------
import json
import os
from datetime import datetime


def _write_transcript(home, relname, entries):
    """Write `entries` (list of dicts) as JSONL under home/.claude/projects/."""
    d = os.path.join(str(home), ".claude", "projects", "proj")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, relname), "w") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def _entry(mid="msg1", rid="req1", model="claude-opus-4", sid="s1",
           tin=0, tout=0, cr=0, cwtot=0, cw5=None, cw1h=None, ts="__now__"):
    """One usage line as Claude Code writes it. ts='__now__' stamps the current
    time so it lands in the today/d7/d30 windows deterministically."""
    if ts == "__now__":
        ts = datetime.now().astimezone().isoformat()
    usage = {"input_tokens": tin, "output_tokens": tout,
             "cache_read_input_tokens": cr, "cache_creation_input_tokens": cwtot}
    if cw5 is not None or cw1h is not None:
        usage["cache_creation"] = {"ephemeral_5m_input_tokens": cw5 or 0,
                                   "ephemeral_1h_input_tokens": cw1h or 0}
    msg = {"usage": usage}
    if mid is not None:
        msg["id"] = mid
    if model is not None:
        msg["model"] = model
    o = {"message": msg}
    if rid is not None:
        o["requestId"] = rid
    if sid is not None:
        o["sessionId"] = sid
    if ts is not None:
        o["timestamp"] = ts
    return o


def test_tier_maps_model_family():
    assert claude_stats._tier("claude-haiku-4-5") == "haiku"
    assert claude_stats._tier("claude-sonnet-5") == "sonnet"
    assert claude_stats._tier("claude-fable-5") == "fable"
    assert claude_stats._tier("mythos-preview") == "fable"
    assert claude_stats._tier("claude-opus-4-8") == "opus"
    assert claude_stats._tier("something-unknown") == "opus"   # default bucket
    assert claude_stats._tier("") == "opus"
    assert claude_stats._tier(None) == "opus"


def test_cost_uses_per_mtok_pricing():
    # opus: in 5, out 25, cw5 6.25, cw1h 10, cr 0.5 per 1M tokens.
    assert claude_stats._cost("opus", 1_000_000, 0, 0, 0, 0) == 5.0
    assert claude_stats._cost("opus", 0, 1_000_000, 0, 0, 0) == 25.0
    assert claude_stats._cost("opus", 0, 0, 1_000_000, 0, 0) == 6.25
    assert claude_stats._cost("opus", 0, 0, 0, 1_000_000, 0) == 10.0
    assert claude_stats._cost("opus", 0, 0, 0, 0, 1_000_000) == 0.5
    # an unknown tier falls back to opus pricing, never KeyErrors.
    assert claude_stats._cost("bogus", 1_000_000, 0, 0, 0, 0) == 5.0


def test_compute_basic_aggregation(tmp_path):
    _write_transcript(tmp_path, "a.jsonl", [
        _entry(tin=1_000_000, tout=0, model="claude-opus-4"),
    ])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 1_000_000
    assert r["windows"]["all"]["tokens"] == 1_000_000
    assert r["windows"]["all"]["req"] == 1
    assert r["windows"]["all"]["cost"] == 5.0            # opus input price
    assert r["sessions"] == 1
    assert r["activeDays"] == 1
    assert r["spanDays"] == 1
    # a now-stamped entry lands in today/d7/d30.
    assert r["windows"]["today"]["in"] == 1_000_000
    assert r["windows"]["d7"]["in"] == 1_000_000
    # byModel carries the full model string.
    assert len(r["byModel"]) == 1
    assert r["byModel"][0]["model"] == "claude-opus-4"
    assert r["byModel"][0]["cost"] == 5.0


def test_compute_dedupes_by_message_and_request_id(tmp_path):
    # The SAME (message.id, requestId) re-logged across a resume/fork must count
    # once — the whole reason get_stats can't just sum raw lines.
    e = _entry(mid="dup", rid="r", tin=500_000)
    _write_transcript(tmp_path, "a.jsonl", [e])
    _write_transcript(tmp_path, "b.jsonl", [e])   # duplicate in a second file
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 500_000     # not 1,000,000
    assert r["windows"]["all"]["req"] == 1


def test_compute_distinct_ids_and_requestids_both_count(tmp_path):
    _write_transcript(tmp_path, "a.jsonl", [
        _entry(mid="m", rid="r1", tin=1),
        _entry(mid="m", rid="r2", tin=1),   # same id, different requestId → distinct
        _entry(mid="n", rid="r1", tin=1),   # different id → distinct
    ])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["req"] == 3
    assert r["windows"]["all"]["in"] == 3


def test_compute_cache_creation_split_priced_separately(tmp_path):
    # 400k at the 5m rate + 600k at the 1h rate (opus 6.25 / 10 per MTok).
    _write_transcript(tmp_path, "a.jsonl", [
        _entry(cwtot=1_000_000, cw5=400_000, cw1h=600_000),
    ])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["cw"] == 1_000_000        # token count = cwtot
    assert r["windows"]["all"]["cost"] == round(0.4 * 6.25 + 0.6 * 10.0, 4)  # 8.5


def test_compute_cache_creation_without_breakdown_priced_at_5m(tmp_path):
    # No cache_creation breakdown → the whole cache-write is priced at the 5m rate
    # (the line-140 fallback). opus cw5 = 6.25/MTok.
    _write_transcript(tmp_path, "a.jsonl", [_entry(cwtot=1_000_000)])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["cw"] == 1_000_000
    assert r["windows"]["all"]["cost"] == 6.25


def test_compute_skips_noise_lines(tmp_path):
    d = os.path.join(str(tmp_path), ".claude", "projects", "proj")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "a.jsonl"), "w") as f:
        f.write('{"type":"summary","note":"no usage here"}\n')   # no "usage" substr
        f.write('{"message":{"usage":{"input_tokens":1}, "model":"claude-opus-4"\n')  # bad JSON
        f.write(json.dumps(_entry(mid="ok", tin=7)) + "\n")       # the one real entry
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 7
    assert r["windows"]["all"]["req"] == 1


def test_compute_skips_synthetic_and_missing_model(tmp_path):
    _write_transcript(tmp_path, "a.jsonl", [
        _entry(mid="syn", model="<synthetic>", tin=100),   # synthetic sentinel
        _entry(mid="nomodel", model=None, tin=100),        # no model at all
        _entry(mid="real", model="claude-sonnet-5", tin=5),
    ])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 5
    assert [m["model"] for m in r["byModel"]] == ["claude-sonnet-5"]


def test_compute_untimestamped_entry_counts_in_totals_not_days(tmp_path):
    _write_transcript(tmp_path, "a.jsonl", [_entry(mid="nots", ts=None, tin=42)])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 42          # in total/byModel
    assert r["windows"]["today"]["in"] == 0         # but not bucketed to a day
    assert all(day["in"] == 0 for day in r["byDay"])


def test_compute_cache_hit_rate(tmp_path):
    # cacheHitRate = cr / (cr + cw).
    _write_transcript(tmp_path, "a.jsonl", [_entry(cr=750_000, cwtot=250_000)])
    r = claude_stats._compute(str(tmp_path))
    assert r["cacheHitRate"] == 0.75


def test_compute_empty_home_is_all_zero(tmp_path):
    r = claude_stats._compute(str(tmp_path))     # no .claude dir at all
    assert r["sessions"] == 0
    assert r["activeDays"] == 0
    assert r["firstDay"] is None
    assert r["spanDays"] == 0
    assert r["cacheHitRate"] == 0.0
    assert r["windows"]["all"] == {"in": 0, "out": 0, "cw": 0, "cr": 0,
                                   "tokens": 0, "cost": 0.0, "req": 0}
    assert len(r["byDay"]) == 30 and len(r["byHour"]) == 48   # shape preserved
    assert r["estimate"] is True


def test_compute_unreadable_transcript_is_skipped(tmp_path):
    # A path that glob matches but open() can't read (here: a directory named
    # like a transcript → IsADirectoryError, portable across uids) must be
    # skipped, not crash the whole parse.
    projects = os.path.join(str(tmp_path), ".claude", "projects", "proj")
    os.makedirs(os.path.join(projects, "bogus.jsonl"), exist_ok=True)  # a DIR
    _write_transcript(tmp_path, "good.jsonl", [_entry(tin=9)])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 9     # the readable one still counted


def test_compute_null_usage_line_is_skipped(tmp_path):
    d = os.path.join(str(tmp_path), ".claude", "projects", "proj")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "a.jsonl"), "w") as f:
        f.write('{"message":{"usage":null,"model":"claude-opus-4"}}\n')  # has "usage" substr, but null
        f.write(json.dumps(_entry(mid="real", tin=3)) + "\n")
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["req"] == 1 and r["windows"]["all"]["in"] == 3


def test_compute_bad_timestamp_still_counts_in_totals(tmp_path):
    _write_transcript(tmp_path, "a.jsonl", [_entry(mid="badts", ts="not-a-date", tin=11)])
    r = claude_stats._compute(str(tmp_path))
    assert r["windows"]["all"]["in"] == 11     # totals unaffected
    assert r["windows"]["today"]["in"] == 0    # unparseable ts → not day-bucketed
