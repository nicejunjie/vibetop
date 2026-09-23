"""Token-consumption + estimated-cost statistics from Claude Code's local
session transcripts (~/.claude/projects/**/*.jsonl), for the Token Stats
utility (GET /api/claude/stats).

There is no billing/usage API for Claude subscription usage, so this
reconstructs it from the per-message `usage` the CLI records in its transcripts
(input/output/cache-creation/cache-read tokens, model, timestamp) and ESTIMATES
cost from a public per-MTok price table. Pure stdlib — a sibling module the
manager's stats worker imports. Unchanged files are cached after the first
parse, and the manager serves the last result while a refresh runs.

Dedup: the same API response can be written to more than one transcript (session
resume/fork), so entries are de-duplicated by (message.id, requestId) — the same
key ccusage uses — to avoid double-counting.
"""
import glob
import json
import os
import threading
import time
from datetime import datetime, timedelta

# ---- Pricing (USD per 1M tokens) -------------------------------------------
# Base input/output from the model catalog; cache-write 5m = 1.25x input, cache-
# write 1h = 2x input, cache-read = 0.1x input (standard Anthropic multipliers).
# These are ESTIMATES for a usage dashboard, not a bill.
PRICING = {
    "fable":  {"in": 10.0, "out": 50.0, "cw5": 12.5, "cw1h": 20.0, "cr": 1.0},
    "opus":   {"in": 5.0,  "out": 25.0, "cw5": 6.25, "cw1h": 10.0, "cr": 0.5},
    "sonnet": {"in": 3.0,  "out": 15.0, "cw5": 3.75, "cw1h": 6.0,  "cr": 0.3},
    "haiku":  {"in": 1.0,  "out": 5.0,  "cw5": 1.25, "cw1h": 2.0,  "cr": 0.1},
}


def _tier(model):
    m = (model or "").lower()
    if "haiku" in m:
        return "haiku"
    if "sonnet" in m:
        return "sonnet"
    if "fable" in m or "mythos" in m:
        return "fable"
    return "opus"   # opus family + anything unrecognized


def _cost(tier, tin, tout, cw5, cw1h, cr):
    p = PRICING.get(tier, PRICING["opus"])
    return (tin * p["in"] + tout * p["out"] + cw5 * p["cw5"]
            + cw1h * p["cw1h"] + cr * p["cr"]) / 1_000_000.0


_lock = threading.Lock()
# Per-user cache: home -> {"ts", "data"}. MUST be keyed by home — a single-user
# host had one home so a time-only cache was fine, but on a multi-user host that
# would serve whichever user computed last to whoever asked next within the TTL,
# leaking one user's token/cost stats to another (a real isolation breach).
_cache = {}
_TTL = 45   # seconds — token stats don't need sub-minute freshness


def get_stats(home):
    """Cached entry point, memoized PER `home` (each user sees only their own
    transcripts under ~/.claude). `home` is the requesting user's home dir."""
    now = time.time()
    with _lock:
        ent = _cache.get(home)
        if ent is not None and now - ent["ts"] < _TTL:
            return ent["data"]
    data = _compute(home)
    with _lock:
        _cache[home] = {"ts": time.time(), "data": data}
    return data


def _blank():
    return {"in": 0, "out": 0, "cw": 0, "cr": 0, "cost": 0.0, "req": 0}


def _add(agg, key, tin, tout, cwtot, cr, cost):
    d = agg.get(key)
    if d is None:
        d = agg[key] = _blank()
    d["in"] += tin
    d["out"] += tout
    d["cw"] += cwtot
    d["cr"] += cr
    d["cost"] += cost
    d["req"] += 1


def _fmt(e):
    return {"in": e["in"], "out": e["out"], "cw": e["cw"], "cr": e["cr"],
            "tokens": e["in"] + e["out"] + e["cw"] + e["cr"],
            "cost": round(e["cost"], 4), "req": e["req"]}


# ---- incremental parse ------------------------------------------------------
# The corpus is APPEND-ONLY JSONL, so a file whose (mtime, size) is unchanged
# yields byte-identical records. Re-reading all of it on every refresh cost 8.46s
# over 2.6GB here -- the module docstring's "~1.5s" was written when the corpus
# was 5.6x smaller -- i.e. ~19% of a core continuously while Token Stats was
# open, growing without bound with ordinary use since nothing prunes
# ~/.claude/projects.
#
# What is cached is each file's EXTRACTED RECORDS, not its aggregates. Dedup on
# (message id, requestId) is GLOBAL across the corpus and 259 keys really do
# appear in two files here (measured -- a resumed session re-records history), so
# summing per-file aggregates would double-count them. Replaying ~49k small
# records through the original global-dedup loop is ~50ms and byte-identical,
# while the 2.6GB of message text those records were extracted from is read only
# when a file actually changes.
_file_cache = {}        # home -> {path: {"sig": (mtime_ns, size), "recs": [...]}}
_FILE_CACHE_MAX = 4000  # bound the per-home map; far above any real corpus


def _parse_file(path):
    """Extract this file's usage records. Pure: same bytes -> same list."""
    recs = []
    for f in (path,):
        try:
            # errors="replace": the except below catches OSError, but an
            # undecodable byte raises UnicodeDecodeError (a ValueError) from
            # the ITERATION below, not from open() -- so it escaped _compute
            # entirely and 500d the endpoint. Nothing was cached on that path,
            # so every later request re-read the whole corpus and re-crashed.
            # One bad byte written by any tool was enough to kill Token Stats.
            fh = open(f, errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"usage"' not in line:
                    continue
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                msg = o.get("message") or {}
                u = msg.get("usage")
                if not u:
                    continue
                model = msg.get("model") or o.get("model") or ""
                if not model or str(model).startswith("<"):
                    continue
                # The dedup itself moved to the replay in _compute: it is GLOBAL
                # across the corpus (259 keys really do appear in two files here),
                # so it cannot be applied while parsing one file in isolation.
                # A record with no message id was never deduped and still is not.
                mid = msg.get("id")
                rid = o.get("requestId")
                key = (mid, rid) if mid else None
                tin = u.get("input_tokens", 0) or 0
                tout = u.get("output_tokens", 0) or 0
                cr = u.get("cache_read_input_tokens", 0) or 0
                cwtot = u.get("cache_creation_input_tokens", 0) or 0
                cc = u.get("cache_creation") or {}
                cw1h = cc.get("ephemeral_1h_input_tokens", 0) or 0
                cw5 = cc.get("ephemeral_5m_input_tokens", 0) or 0
                if not (cw1h or cw5):     # no breakdown -> treat all as 5m
                    cw5 = cwtot
                cost = _cost(_tier(model), tin, tout, cw5, cw1h, cr)
                sid = o.get("sessionId")
                ts = o.get("timestamp")
                dt = None
                if ts:
                    try:
                        dt = datetime.fromisoformat(
                            ts.replace("Z", "+00:00")).astimezone()
                    except (ValueError, TypeError):
                        dt = None
                recs.append((key, sid,
                             dt.strftime("%Y-%m-%d") if dt is not None else None,
                             int(dt.timestamp()) // 3600 if dt is not None else None,
                             model, tin, tout, cwtot, cr, cost))
    return recs


def _compute(home):
    pattern = os.path.join(home, ".claude", "projects", "**", "*.jsonl")
    files = glob.glob(pattern, recursive=True)
    cache = _file_cache.setdefault(home, {})
    seen = set()
    by_day = {}
    by_hour = {}
    by_model = {}
    sessions = set()

    live = set()
    for f in files:
        try:
            st = os.stat(f)
            sig = (st.st_mtime_ns, st.st_size)
        except OSError:
            continue
        live.add(f)
        ent = cache.get(f)
        if ent is None or ent["sig"] != sig:
            ent = cache[f] = {"sig": sig, "recs": _parse_file(f)}
        # Replay through the ORIGINAL global-dedup loop, in glob order, so the
        # result is identical to the single-pass version it replaces.
        for key, sid, day, hour, model, tin, tout, cwtot, cr, cost in ent["recs"]:
            if key is not None:
                if key in seen:
                    continue
                seen.add(key)
            if sid:
                sessions.add(sid)
            if day is not None:
                _add(by_day, day, tin, tout, cwtot, cr, cost)
                _add(by_hour, hour, tin, tout, cwtot, cr, cost)
            _add(by_model, model, tin, tout, cwtot, cr, cost)
    for gone in [k for k in cache if k not in live]:      # deleted transcripts
        cache.pop(gone, None)
    if len(cache) > _FILE_CACHE_MAX:
        cache.clear()

    today = datetime.now().astimezone().date()

    def sum_days(n):
        s = _blank()
        for i in range(n):
            d = by_day.get((today - timedelta(days=i)).strftime("%Y-%m-%d"))
            if d:
                for k in s:
                    s[k] += d[k]
        return s

    def day_at(offset):
        return by_day.get(
            (today - timedelta(days=offset)).strftime("%Y-%m-%d")) or _blank()

    total = _blank()
    for e in by_model.values():
        for k in total:
            total[k] += e[k]

    by_day_out = []
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        e = by_day.get(d) or _blank()
        by_day_out.append({"date": d, "tokens": e["in"] + e["out"] + e["cw"] + e["cr"],
                           "cost": round(e["cost"], 4), "in": e["in"], "out": e["out"],
                           "cw": e["cw"], "cr": e["cr"]})

    cur_h = int(time.time()) // 3600
    by_hour_out = []
    for i in range(47, -1, -1):
        h = cur_h - i
        e = by_hour.get(h) or _blank()
        by_hour_out.append({"h": h, "tokens": e["in"] + e["out"] + e["cw"] + e["cr"],
                            "cost": round(e["cost"], 4)})

    models = []
    for m, e in by_model.items():
        d = _fmt(e)
        d["model"] = m
        models.append(d)
    models.sort(key=lambda x: -x["cost"])

    denom = total["cr"] + total["cw"]
    cache_hit = (total["cr"] / denom) if denom else 0.0

    active_days = len(by_day)
    if by_day:
        first_day = min(by_day.keys())
        first = datetime.strptime(first_day, "%Y-%m-%d").date()
        span_days = (today - first).days + 1
    else:
        first_day = None
        span_days = 0

    return {
        "updated": int(time.time()),
        "estimate": True,
        "sessions": len(sessions),
        "activeDays": active_days,
        # The earliest day with retained data. Claude Code deletes transcripts
        # older than `cleanupPeriodDays` (default 30), so "all time" is really a
        # rolling window bounded by that — firstDay/spanDays let the UI say so.
        "firstDay": first_day,
        "spanDays": span_days,
        "cacheHitRate": round(cache_hit, 4),
        "windows": {
            "today": _fmt(day_at(0)),
            "yesterday": _fmt(day_at(1)),
            "d7": _fmt(sum_days(7)),
            "d30": _fmt(sum_days(30)),
            "all": _fmt(total),
        },
        "byDay": by_day_out,
        "byHour": by_hour_out,
        "byModel": models,
    }
