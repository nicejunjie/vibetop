"""Local Codex token and API-equivalent cost statistics."""
import glob
import json
import os
import threading
import time
from datetime import datetime, timedelta

# USD per million tokens: input, cached input, output. Subscription usage is not
# billed this way; this is the equivalent public API value for comparison.
PRICING = {
    "gpt-5.6-sol": (4.0, .4, 20.0), "gpt-5.6": (4.0, .4, 20.0),
    "gpt-5.6-terra": (2.0, .2, 12.0), "gpt-5.6-luna": (.2, .02, 1.2),
    "gpt-5-codex": (1.25, .125, 10.0),
}
_cache, _lock, _TTL = {}, threading.Lock(), 45


def _price(model):
    m = (model or "").lower()
    if m in PRICING:
        return PRICING[m]
    if "luna" in m or "mini" in m:
        return PRICING["gpt-5.6-luna"]
    if "terra" in m:
        return PRICING["gpt-5.6-terra"]
    return PRICING["gpt-5.6-sol"]


def _cost(model, tin, cached, tout):
    pi, pc, po = _price(model)
    return ((max(0, tin - cached) * pi) + cached * pc + tout * po) / 1_000_000


def _blank():
    return {"in": 0, "out": 0, "cw": 0, "cr": 0, "cost": 0.0, "req": 0}


def _add(bucket, key, tin, tout, cached, cost):
    row = bucket.setdefault(key, _blank())
    row["in"] += tin; row["out"] += tout; row["cr"] += cached
    row["cost"] += cost; row["req"] += 1


def _fmt(row):
    return {"in": row["in"], "out": row["out"], "cw": 0, "cr": row["cr"],
            "tokens": row["in"] + row["out"], "cost": round(row["cost"], 4),
            "req": row["req"]}


def get_stats(home):
    now = time.time()
    with _lock:
        hit = _cache.get(home)
        if hit and now - hit["ts"] < _TTL:
            return hit["data"]
    data = _compute(home)
    with _lock:
        _cache[home] = {"ts": time.time(), "data": data}
    return data


def _compute(home):
    by_day, by_hour, by_model, sessions = {}, {}, {}, set()
    files = glob.glob(os.path.join(home, ".codex", "sessions", "**", "*.jsonl"),
                      recursive=True)
    for path in files:
        model, sid = "gpt-5.6-sol", os.path.basename(path)
        sessions.add(sid)
        try:
            fh = open(path)
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"turn_context"' not in line and '"token_count"' not in line:
                    continue
                try:
                    event = json.loads(line); payload = event.get("payload") or {}
                except ValueError:
                    continue
                if event.get("type") == "turn_context":
                    model = payload.get("model") or model
                    continue
                if event.get("type") != "event_msg" or payload.get("type") != "token_count":
                    continue
                usage = (payload.get("info") or {}).get("last_token_usage")
                if not isinstance(usage, dict):
                    continue
                tin = int(usage.get("input_tokens") or 0)
                cached = min(tin, int(usage.get("cached_input_tokens") or 0))
                tout = int(usage.get("output_tokens") or 0)
                if not (tin or tout):
                    continue
                cost = _cost(model, tin, cached, tout)
                try:
                    dt = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00")).astimezone()
                except (KeyError, ValueError, TypeError):
                    continue
                _add(by_day, dt.strftime("%Y-%m-%d"), tin, tout, cached, cost)
                _add(by_hour, int(dt.timestamp()) // 3600, tin, tout, cached, cost)
                _add(by_model, model, tin, tout, cached, cost)

    today = datetime.now().astimezone().date()
    def sum_days(n):
        out = _blank()
        for i in range(n):
            row = by_day.get((today - timedelta(days=i)).strftime("%Y-%m-%d"))
            if row:
                for key in out: out[key] += row[key]
        return out
    def day(offset):
        return by_day.get((today - timedelta(days=offset)).strftime("%Y-%m-%d"), _blank())
    total = _blank()
    for row in by_model.values():
        for key in total: total[key] += row[key]
    days = []
    for i in range(29, -1, -1):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d"); row = _fmt(by_day.get(date, _blank()))
        row["date"] = date; days.append(row)
    hour = int(time.time()) // 3600
    hours = []
    for i in range(47, -1, -1):
        h = hour - i; row = _fmt(by_hour.get(h, _blank()))
        hours.append({"h": h, "tokens": row["tokens"], "cost": row["cost"]})
    models = []
    for name, raw in by_model.items():
        row = _fmt(raw); row["model"] = name; models.append(row)
    models.sort(key=lambda x: -x["cost"])
    first = min(by_day) if by_day else None
    return {"updated": int(time.time()), "estimate": True, "provider": "codex",
            "sessions": len(sessions), "activeDays": len(by_day), "firstDay": first,
            "spanDays": ((today - datetime.strptime(first, "%Y-%m-%d").date()).days + 1) if first else 0,
            "cacheHitRate": round(total["cr"] / total["in"], 4) if total["in"] else 0,
            "windows": {"today": _fmt(day(0)), "yesterday": _fmt(day(1)),
                        "d7": _fmt(sum_days(7)), "d30": _fmt(sum_days(30)), "all": _fmt(total)},
            "byDay": days, "byHour": hours, "byModel": models}
