#!/usr/bin/env python3
"""Capture timing-only terminal diagnostics for a bounded interval, then report."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import selectors
import statistics
import subprocess
import time

FIELDS = {'k', 'event', 'id', 'seq', 'path', 'at', 'ms', 'hidden', 'online',
          'interaction_age_ms', 'since_close_ms', 'since_resume_ms', 'handshake_ms',
          'socket_to_output_ms', 'open_to_output_ms', 'output_to_parse_ms',
          'output_to_paint_ms', 'boot_to_paint_ms', 'output_bytes', 'output_frames',
          'window_ms', 'viewport', 'bottom', 'code', 'lifetime_ms', 'state',
          'persisted', 'phase', 'elapsed', 'retries', 'close_code', 'reason', 'from_base', 'from_viewport',
          'base', 'distance', 'mode', 'scroll_top', 'navigation_age_ms', 'following',
          'anchored', 'navigating', 'marker_row', 'anchor_distance', 'target', 'cursor_row', 'rows', 'cols'}
NAV_FIELDS = {'type', 'dns_ms', 'connect_ms', 'ttfb_ms', 'transfer_ms',
              'encoded_bytes', 'wire_bytes', 'dom_ms', 'response_end_ms'}
RESOURCE_FIELDS = {'path', 'start_ms', 'duration_ms', 'ttfb_ms', 'wire_bytes', 'encoded_bytes'}
SAFE_RESOURCE = re.compile(r'^(?:/t\d+/token|/(?:terminal-connection|terminal-kbd|terminal-profile|kbd-input|coach)\.js)$')

def decode(line, user):
    """Whitelist metrics, not terminal content, arbitrary payloads, or full UAs."""
    m = re.search(r"clientlog user=(\S+) ua=(.*?) guard=(.*?) sw=", line)
    if not m or m[1] != user:
        return []
    try:
        events = json.loads(m[3])
    except (ValueError, TypeError):
        return []
    ua = m[2]
    device = 'iphone' if 'iPhone' in ua else 'ipad' if 'iPad' in ua else 'desktop'
    engine = 'chromium' if 'Chrome/' in ua else 'webkit' if 'Safari/' in ua or 'AppleWebKit/' in ua else 'other'
    out = []
    for e in events if isinstance(events, list) else []:
        if not isinstance(e, dict) or e.get('k') not in ('terminal-profile', 'terminal-connection'):
            continue
        if not re.fullmatch(r'/t\d+/', str(e.get('path', ''))):
            continue
        row = {k: v for k, v in e.items() if k in FIELDS and (v is None or isinstance(v, (str, int, float, bool)))}
        # Only known text enums/opaque IDs; arbitrary extra string fields are dropped.
        if not re.fullmatch(r'[a-z0-9-]{1,60}', str(row.get('event', ''))):
            continue
        row['device'], row['engine'], row['received_utc'] = device, engine, line[:19]
        nav = e.get('navigation')
        if isinstance(nav, dict):
            row['navigation'] = {k: v for k, v in nav.items() if k in NAV_FIELDS and isinstance(v, (str, int, float))}
        resources = e.get('resources', [])
        if isinstance(resources, list):
            row['resources'] = [{k: v for k, v in r.items() if k in RESOURCE_FIELDS and isinstance(v, (str, int, float))}
                                for r in resources[:8] if isinstance(r, dict) and SAFE_RESOURCE.fullmatch(str(r.get('path', '')))]
        controls = e.get('controls', {})
        allowed_controls = {'erase_screen', 'erase_scrollback', 'cursor_home', 'delete_lines', 'insert_lines',
                            'scroll_up', 'scroll_down', 'alternate_enter', 'alternate_exit'}
        if isinstance(controls, dict):
            row['controls'] = {k: v for k, v in controls.items() if k in allowed_controls and isinstance(v, int)}
        observations = e.get('observations', [])
        if isinstance(observations, list):
            row['observations'] = [{k: v for k, v in r.items() if k in FIELDS and (v is None or isinstance(v, (str, int, float, bool)))}
                                   for r in observations[-6:] if isinstance(r, dict)]
        out.append(row)
    return out

def percentile(values, q):
    values = sorted(values)
    return values[min(len(values)-1, round((len(values)-1)*q))] if values else None

def report(rows, start, end, complete):
    rows = [dict(r) for r in rows]
    for row in rows:
        nav = row.get('navigation', {})
        for src, dest in [('ttfb_ms', 'page_ttfb_ms'), ('transfer_ms', 'page_transfer_ms'), ('response_end_ms', 'page_ready_ms')]:
            if isinstance(nav.get(src), (int, float)):
                row[dest] = nav[src]
        if row.get('event') == 'closed-fallback' and 0 <= row.get('elapsed', -1) <= 60000:
            row['retry_wait_ms'] = row['elapsed']
    metrics = ['page_ttfb_ms', 'page_transfer_ms', 'page_ready_ms', 'retry_wait_ms', 'handshake_ms', 'socket_to_output_ms', 'open_to_output_ms',
               'output_to_parse_ms', 'output_to_paint_ms', 'boot_to_paint_ms',
               'since_resume_ms', 'since_close_ms']
    groups = {}
    for device in ('iphone', 'ipad', 'desktop'):
        subset = [r for r in rows if r.get('device') == device]
        if not subset:
            continue
        stats = {}
        for metric in metrics:
            vals = [r[metric] for r in subset if isinstance(r.get(metric), (int, float)) and r[metric] >= 0]
            if vals:
                stats[metric] = {'n': len(vals), 'median': round(statistics.median(vals), 1), 'p95': percentile(vals, .95), 'max': max(vals)}
        groups[device] = {'events': len(subset), 'metrics': stats}
    result = {'started_utc': start, 'ends_utc': end, 'complete': complete,
              'events': len(rows), 'devices': groups}
    lines = ['# Terminal connection timing monitor', '',
             f"Status: {'complete' if complete else 'collecting'}. Window: {start} → {end}.", '',
             'Only timing, connection state, byte counts and viewport geometry are collected.',
             'No terminal output, typed input, authentication tokens or full user agents are saved.', '']
    for device, group in groups.items():
        lines += [f'## {device} ({group["events"]} events)', '',
                  '| Stage | Samples | Median ms | P95 ms | Max ms |', '|---|---:|---:|---:|---:|']
        for metric, stat in group['metrics'].items():
            lines.append(f'| {metric} | {stat["n"]} | {stat["median"]} | {stat["p95"]} | {stat["max"]} |')
        lines.append('')
        phases = [(k, v) for k, v in group['metrics'].items() if k in ('page_ttfb_ms', 'page_transfer_ms', 'retry_wait_ms', 'handshake_ms', 'open_to_output_ms', 'output_to_paint_ms')]
        if phases:
            stage, stat = max(phases, key=lambda item: item[1]['p95'])
            lines += [f'Largest measured connection stage at P95: {stage} ({stat["p95"]} ms).', '']
    failures = [r for r in rows if r.get('event') in ('timeout', 'closed-fallback', 'resume-closed', 'socket-error', 'retry-limit')]
    repaints = [r for r in rows if r.get('event') == 'screen-repaint']
    lines += [f'Application screen/history reset samples: {len(repaints)}.', '', '## Recent application screen resets', '']
    lines += ['- ' + json.dumps(r, sort_keys=True) for r in repaints[-20:]]
    lines.append('')
    shifts = [r for r in rows if r.get('event') == 'viewport-shift']
    lines += [f'Viewport shift events: {len(shifts)}.', '', '## Recent viewport shifts', '']
    lines += ['- ' + json.dumps(r, sort_keys=True) for r in shifts[-20:]]
    lines += ['', f'Recovery/error events: {len(failures)}.', '', 
              '## Slowest observed connection/render events', '']
    slow = sorted([r for r in rows if r.get('event') in ('first-render', 'first-output', 'socket-created')],
                  key=lambda r: max(r.get('boot_to_paint_ms', 0) or 0, r.get('socket_to_output_ms', 0) or 0,
                                    min(r.get('since_resume_ms', 0) or 0, 60000)), reverse=True)[:20]
    for row in slow:
        safe = {k: v for k, v in row.items() if k not in ('resources', 'k')}
        lines.append('- ' + json.dumps(safe, sort_keys=True))
    lines += ['', 'A reconnect gap since close can include time spent in the background; use foreground/resume events to distinguish it from active waiting.',
              'Paint timing is a two-animation-frame estimate after xterm parsing, not proof that a physical iPhone displayed the frame.',
              'HTTP entries report browser-observed sizes/times; unavailable timings are omitted. Clientlog rate limiting may omit events.',
              'The monitor observes existing recovery behavior and sends no terminal input.', '']
    return result, '\n'.join(lines)

def write_report(output, rows, start, end, complete):
    summary, markdown = report(rows, start, end, complete)
    for name, text in [('summary.json', json.dumps(summary, indent=2)), ('report.md', markdown)]:
        temporary = output / (name + '.tmp')
        temporary.write_text(text)
        temporary.chmod(0o600)
        temporary.replace(output / name)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--log', default='/var/log/vibetop/manager.log')
    p.add_argument('--output', required=True)
    p.add_argument('--user', required=True)
    p.add_argument('--seconds', type=int, default=86400)
    p.add_argument('--until', type=float, help='absolute epoch deadline when resuming a monitor')
    args = p.parse_args()
    if not 1 <= args.seconds <= 93600:
        p.error('duration must be between 1 second and 26 hours')
    output = Path(args.output)
    output.mkdir(parents=True, mode=0o700, exist_ok=True)
    output.chmod(0o700)
    started = dt.datetime.now(dt.timezone.utc)
    end_time = dt.datetime.fromtimestamp(args.until, dt.timezone.utc) if args.until else started + dt.timedelta(seconds=args.seconds)
    start, end = started.isoformat(), end_time.isoformat()
    if (output / 'summary.json').exists():
        start = json.loads((output / 'summary.json').read_text()).get('started_utc', start)
    rows = []
    if (output / 'events.jsonl').exists():
        for line in (output / 'events.jsonl').read_text().splitlines():
            try: rows.append(json.loads(line))
            except ValueError: continue
    deadline = time.monotonic() + max(0, min(93600, (end_time - started).total_seconds()))
    last_report = 0
    follower = subprocess.Popen(['tail', '-n', '0', '-F', args.log], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    selector = selectors.DefaultSelector()
    selector.register(follower.stdout, selectors.EVENT_READ)
    pending = b''
    try:
        with (output / 'events.jsonl').open('a') as events:
            os.chmod(output / 'events.jsonl', 0o600)
            while time.monotonic() < deadline:
                for key, _ in selector.select(min(1, max(0, deadline-time.monotonic()))):
                    data = os.read(key.fd, 65536)
                    if not data:
                        raise RuntimeError('log follower stopped')
                    pending += data
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        for row in decode(line.decode('utf-8', 'replace'), args.user):
                            rows.append(row)
                            events.write(json.dumps(row) + '\n')
                    events.flush()
                if time.monotonic() - last_report >= 60:
                    write_report(output, rows, start, end, False)
                    last_report = time.monotonic()
            write_report(output, rows, start, end, True)
    finally:
        follower.terminate()
        follower.wait(timeout=5)
        selector.close()

if __name__ == '__main__':
    main()
