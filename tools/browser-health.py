#!/usr/bin/env python3
"""Require a Chromium window in the requested xpra unit, not just an HTTP server.

Run locally after an authenticated GET /browser/ has cold-started the unit.
This inspects /proc and the X display; root is needed for another user's session.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import time


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=3, **kwargs)


def probe(unit, proc=Path('/proc')):
    result = run(['systemctl', 'show', unit, '-p', 'ControlGroup', '--value'])
    group = result.stdout.strip()
    if result.returncode or not group or group == '/':
        return False, 'Browser unit has no cgroup'
    browsers = {}
    owned = set()
    parents = {}
    candidates = {}
    for path in proc.iterdir():
        if not path.name.isdigit():
            continue
        try:
            groups = [line.split(':', 2)[2] for line in (path / 'cgroup').read_text().splitlines()]
            pid = int(path.name)
            if any(g == group or g.startswith(group + '/') for g in groups):
                owned.add(pid)
            status = (path / 'status').read_text()
            parents[pid] = int(next(line.split()[1] for line in status.splitlines()
                                    if line.startswith('PPid:')))
            args = (path / 'cmdline').read_bytes().split(b'\0')
            if not args or Path(os.fsdecode(args[0])).name not in ('chrome', 'chromium', 'chromium-browser'):
                continue
            if any(a.startswith(b'--type=') for a in args):
                continue
            profile = next((os.fsdecode(a).split('=', 1)[1] for a in args
                            if a.startswith(b'--user-data-dir=')), '')
            env = dict(os.fsdecode(v).split('=', 1) for v in
                       (path / 'environ').read_bytes().split(b'\0') if b'=' in v)
            snap = args[0].startswith(b'/snap/')
            home = env.get('SNAP_REAL_HOME', env.get('HOME', '')) if snap else env.get('HOME', '')
            expected = (home + '/snap/chromium/common/xpra-profile' if snap
                        else home + '/.config/vibetop/chromium-profile')
            if not home or profile != expected or not re.fullmatch(r':\d+(?:\.\d+)?', env.get('DISPLAY', '')):
                continue
            candidates[pid] = env
        except (OSError, ValueError, StopIteration):
            continue  # a process can exit during the snapshot
    # snap-confine moves Chromium to a user scope. Its parent chain still leads
    # to browser-loop in the requested service, so cgroup membership alone lies.
    for pid, env in candidates.items():
        ancestor, seen = pid, set()
        while ancestor and ancestor not in seen:
            if ancestor in owned:
                browsers[pid] = env
                break
            seen.add(ancestor)
            ancestor = parents.get(ancestor, 0)
    if not browsers:
        return False, 'no main Chromium process with the Browser profile in this unit'
    for env in browsers.values():
        xenv = {**os.environ, **env}
        # A hostname change can leave the live X cookie under its original name.
        # Read only its entry name; never print the cookie or alter the user's file.
        if env.get('XAUTHORITY') and not env.get('XAUTHLOCALHOSTNAME'):
            auth = run(['xauth', '-f', env['XAUTHORITY'], 'list'])
            display = env['DISPLAY'].split('.')[0].lstrip(':')
            for line in auth.stdout.splitlines():
                name = line.split()[0] if line.split() else ''
                if name.endswith('/unix:' + display):
                    xenv['XAUTHLOCALHOSTNAME'] = name.rsplit('/unix:', 1)[0]
                    break
        windows = run(['wmctrl', '-lpG'], env=xenv)
        if windows.returncode:
            return False, 'cannot inspect Browser X display (X authorization or wmctrl failed)'
        for line in windows.stdout.splitlines():
            fields = line.split(None, 8)
            try:
                # id, desktop, PID, x, y, width, height, host, title. Do not
                # include WM_CLASS: snap adds the profile path, which has spaces.
                if (len(fields) >= 8 and int(fields[2]) in browsers
                        and int(fields[5]) > 0 and int(fields[6]) > 0):
                    visible = run(['xdotool', 'search', '--onlyvisible', '--pid', fields[2]], env=xenv)
                    if (visible.returncode == 0 and int(fields[0], 16) in
                            {int(w) for w in visible.stdout.split()}):
                        return True, f'Chromium window {fields[0]} on {env["DISPLAY"]} in {unit}'
            except ValueError:
                continue
    return False, 'Chromium started but has no visible managed Browser window'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unit', required=True)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    if not re.fullmatch(r'vibetop-(?:ubrowser-[a-zA-Z0-9_.-]+|browser-xpra)\.service', args.unit):
        parser.error('expected a vibetop Browser service unit')
    if not 0 <= args.timeout <= 60:
        parser.error('timeout must be between 0 and 60 seconds')
    deadline = time.monotonic() + args.timeout
    while True:
        try:
            ok, detail = probe(args.unit)
        except (OSError, subprocess.SubprocessError) as error:
            ok, detail = False, f'Browser health probe failed: {type(error).__name__}'
        if ok or time.monotonic() >= deadline:
            print(detail)
            return 0 if ok else 1
        time.sleep(min(1, max(0, deadline - time.monotonic())))


if __name__ == '__main__':
    raise SystemExit(main())
