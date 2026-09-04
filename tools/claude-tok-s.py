#!/usr/bin/env python3
"""Claude Code status line: a rolling per-turn output tok/s.

Wired via `statusLine` in ~/.claude/settings.json. Claude Code invokes this
with a JSON object on stdin (we only need `transcript_path` and `model`) and
renders whatever we print to stdout in the footer.

What the number means (and its honest ceiling):
  Claude Code logs one `usage` blob per completed assistant message, each with
  `output_tokens` (the total for THAT message, not a running counter) and a
  `timestamp`. There is no per-token clock. So the best "live tok/s" we can
  show is a per-turn average:

      rate = this_turn.output_tokens / (this_turn.ts - prev_turn.ts)

  The gap includes model thinking + tool-execution time, so this reads low
  during long tool calls and spikes on a text-heavy turn. That is the real
  ceiling on what the logs support — not a bug in this script.

Defensive by design: every field is optional; a missing/renamed field degrades
to "n/a" instead of throwing, so a future schema change is a one-line fix here,
not a crash in the footer.
"""
import json
import os
import sys
from datetime import datetime

# How far back in the transcript to scan for the last two usage entries.
# 512 KiB is far more than any single turn; keeps this O(1) on big files.
TAIL_BYTES = 512 * 1024


def _stdin_json():
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


def _ts_seconds(value):
    """ISO-8601 (with optional trailing Z) -> epoch seconds, or None."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _last_two_usage(transcript):
    """Return the last two distinct (ts, output_tokens) assistant entries.

    The same message is logged several times with near-identical timestamps
    (stream re-renders), so we collapse to one entry per second, keeping the
    max output_tokens seen in that second.
    """
    if not transcript or not os.path.exists(transcript):
        return []
    try:
        with open(transcript, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - TAIL_BYTES))
            chunk = fh.read().decode("utf-8", "replace")
    except Exception:
        return []

    by_second = {}
    for line in chunk.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        msg = obj.get("message")
        if not isinstance(msg, dict):
            continue
        usage = msg.get("usage")
        if not isinstance(usage, dict):
            continue
        out = usage.get("output_tokens")
        if not isinstance(out, int) or out < 0:
            continue
        t = _ts_seconds(obj.get("timestamp"))
        if t is None:
            continue
        sec = int(t)
        if sec not in by_second or out > by_second[sec]:
            by_second[sec] = out

    items = sorted(by_second.items())
    return items[-2:]


def main():
    data = _stdin_json()
    transcript = data.get("transcript_path")
    model = data.get("model") or {}
    model_name = model.get("display_name") or model.get("id") or ""

    items = _last_two_usage(transcript)
    rate = None
    if len(items) >= 2:
        (t_prev, _), (t_now, out_now) = items
        dt = t_now - t_prev
        if dt > 0:
            rate = out_now / dt

    parts = []
    if rate is not None:
        parts.append(f"{rate:.0f} tok/s")
    else:
        parts.append("tok/s n/a")
    if model_name:
        parts.append(model_name)
    print(" · ".join(parts))


if __name__ == "__main__":
    main()
