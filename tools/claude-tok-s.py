#!/usr/bin/env python3
"""Claude Code status line: output tok/s, context use, and local draft acceptance.

Wired via `statusLine` in ~/.claude/settings.json. Claude Code invokes this with
a JSON object on stdin and renders whatever we print to stdout in the footer.

Three fields, each from a different source and each independently optional:

  tok/s   A per-turn average from the transcript. Claude Code logs one `usage`
          blob per completed assistant message, each with `output_tokens` (the
          total for THAT message, not a running counter) and a `timestamp`.
          There is no per-token clock, so the best live rate the logs support is

              rate = this_turn.output_tokens / (this_turn.ts - prev_turn.ts)

          The gap includes model thinking + tool-execution time, so this reads
          low during long tool calls and spikes on a text-heavy turn. That is
          the real ceiling on what the logs support, not a bug in this script.

  ctx     Straight from stdin. Claude Code passes a `context_window` object:
          total_input_tokens, total_output_tokens, context_window_size,
          current_usage, used_percentage, remaining_percentage. used_percentage
          is (input + cache_creation + cache_read) / window, so it is the same
          number auto-compact triggers on. Older builds may omit the object; we
          fall back to summing the last usage blob in the transcript.

          Note this is NOT shown by Claude Code's own footer until you are
          within 20k tokens of the compaction threshold -- below that its
          indicator renders nothing at all, which is why it looks "missing"
          for most of a session on a 64K local model.

  mtp     Speculative-decoding acceptance, scraped from the llama.cpp server log
          that jcoder writes (<profile>-server.log). llama-server prints one
          "draft acceptance = ..." line per completed request; we aggregate the
          last few so a single short request cannot swing the number. Shown only
          when the log is fresh AND the model is not a cloud Claude model, so
          cloud sessions stay quiet instead of reporting a stale local figure.

Defensive by design: every field is optional, every source may be missing or
renamed, and nothing here may raise -- a traceback would land in the footer.
A degraded field is dropped, and in the worst case we still print the model.
"""
import json
import os
import re
import sys
import time
from datetime import datetime

# How far back in the transcript to scan for the last two usage entries.
# 512 KiB is far more than any single turn; keeps this O(1) on big files.
TAIL_BYTES = 512 * 1024
# The llama.cpp server logs jcoder writes, and how stale is too stale. A log
# older than this means no local server is running for this session.
LOG_DIR = os.path.expanduser(os.environ.get("JCODER_LOG_DIR", "~/localLLM"))
LOG_GLOB = "-server.log"
LOG_TAIL_BYTES = 64 * 1024
LOG_MAX_AGE_SECONDS = 600
# Aggregate this many recent requests: one short request reads 5/5 = 100%.
ACCEPTANCE_SAMPLES = 5
ACCEPTANCE_RE = re.compile(
    r"draft acceptance = [0-9.]+ \(\s*(\d+) accepted /\s*(\d+) generated\)")


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


def _tail(path, limit):
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - limit))
            return fh.read().decode("utf-8", "replace")
    except Exception:
        return ""


def _human(n):
    """12604 -> '12.6k', 1000000 -> '1.0M'. Keeps the footer narrow."""
    if not isinstance(n, (int, float)):
        return None
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    return f"{n / 1000:.1f}k" if n >= 1000 else str(int(n))


def _usage_entries(transcript):
    """Last two distinct (ts, output_tokens, total_tokens) assistant entries.

    The same message is logged several times with near-identical timestamps
    (stream re-renders), so we collapse to one entry per second, keeping the
    max output_tokens seen in that second.
    """
    if not transcript or not os.path.exists(transcript):
        return []
    by_second = {}
    for line in _tail(transcript, TAIL_BYTES).splitlines():
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
        total = sum(v for v in (usage.get("input_tokens"),
                                usage.get("cache_creation_input_tokens"),
                                usage.get("cache_read_input_tokens"))
                    if isinstance(v, int))
        sec = int(t)
        if sec not in by_second or out > by_second[sec][0]:
            by_second[sec] = (out, total)
    items = sorted(by_second.items())
    return [(sec, out, total) for sec, (out, total) in items[-2:]]


def rate_field(entries):
    if len(entries) < 2:
        return "tok/s n/a"
    (t_prev, _, _), (t_now, out_now, _) = entries
    dt = t_now - t_prev
    if dt <= 0:
        return "tok/s n/a"
    return f"{out_now / dt:.0f} tok/s"


def context_field(data, entries):
    """Prefer Claude Code's own context_window object; fall back to the log."""
    window = used = None
    cw = data.get("context_window")
    if isinstance(cw, dict):
        window = cw.get("context_window_size")
        used = cw.get("total_input_tokens")
    if not isinstance(used, int) and entries:
        used = entries[-1][2] or None
    if not isinstance(used, int) or used <= 0:
        return None
    if not isinstance(window, int) or window <= 0:
        return f"ctx {_human(used)}"
    return f"ctx {_human(used)}/{_human(window)} ({round(used / window * 100)}%)"


def _fresh_server_log():
    """Most recently written jcoder server log, if one is still being written."""
    try:
        names = [n for n in os.listdir(LOG_DIR) if n.endswith(LOG_GLOB)]
    except Exception:
        return None
    best = None
    for name in names:
        path = os.path.join(LOG_DIR, name)
        try:
            age = os.path.getmtime(path)
        except Exception:
            continue
        if best is None or age > best[0]:
            best = (age, path)
    if best is None:
        return None
    return best[1] if time.time() - best[0] <= LOG_MAX_AGE_SECONDS else None


def acceptance_field(model_id):
    """Speculative acceptance, or None when this is not a local-model session."""
    # A cloud Claude model never has a draft head; a stale local log must not
    # be attributed to it just because a server happens to be running.
    if model_id.startswith("claude"):
        return None
    path = _fresh_server_log()
    if not path:
        return None
    pairs = ACCEPTANCE_RE.findall(_tail(path, LOG_TAIL_BYTES))
    if not pairs:
        return None
    recent = pairs[-ACCEPTANCE_SAMPLES:]
    accepted = sum(int(a) for a, _ in recent)
    generated = sum(int(g) for _, g in recent)
    if generated <= 0:
        return None
    label = "mtp" if os.path.basename(path).startswith("qwen") else "draft"
    return f"{label} {round(accepted / generated * 100)}%"


def main():
    data = _stdin_json()
    model = data.get("model") or {}
    model_name = model.get("display_name") or model.get("id") or ""
    model_id = str(model.get("id") or "")

    entries = []
    try:
        entries = _usage_entries(data.get("transcript_path"))
    except Exception:
        pass

    parts = [rate_field(entries)]
    for builder in (lambda: context_field(data, entries),
                    lambda: acceptance_field(model_id)):
        try:
            value = builder()
        except Exception:
            value = None
        if value:
            parts.append(value)
    if model_name:
        parts.append(model_name)
    print(" · ".join(parts))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # The footer must never show a traceback.
        print("")
