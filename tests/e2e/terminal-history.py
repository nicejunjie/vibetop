#!/usr/bin/env python3
"""Real ttyd/Codex regression: every line remains reachable after replay wrap.

Requires Playwright browsers, ttyd and an authenticated local Codex 0.160+.
No model request is submitted: all responses are synthetic saved history.
Run with --codex PATH; --daemon PATH exercises a legacy daemon plus scoped
recovery (without restarting the shell). Uses only disposable sessions.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import tempfile
import time
import uuid

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SESSION = ROOT / 'apps/everyday/terminal/vibetop-session'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--codex', required=True)
parser.add_argument('--daemon', type=Path, default=SESSION)
parser.add_argument('--engine', choices=['chromium', 'webkit'], default='chromium')
args = parser.parse_args()
home = Path(tempfile.mkdtemp(prefix='vibetop-history-test-'))
ident = 'history-test-' + str(os.getpid())
base = '/tmp/vibetop-session-' + ident
sid = str(uuid.uuid4())
serve = bridge = None


def proc(pid):
    return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()


def text(page):
    return page.evaluate(r"""() => {let t=window.term,b=t.buffer.active;
      return Array.from({length:t.rows},(_,i)=>b.getLine(b.viewportY+i)?.translateToString(true)).join('\n');}""")


def lines(page, answer=3):
    return {int(n) for n in re.findall(r'ANSWER ' + str(answer) + r' LINE (\d+)', text(page))}


try:
    auth = Path.home() / '.codex/auth.json'
    if auth.exists():
        (home / 'auth.json').symlink_to(auth)
    (home / 'config.toml').write_text('[projects."/tmp"]\ntrust_level="trusted"\n[tui]\nscreen_reader_detection_done=true\n')
    ts = '2026-10-05T16:00:00Z'
    records = []

    def add(kind, payload):
        records.append({'timestamp': ts, 'type': kind, 'payload': payload})

    add('session_meta', {'id': sid, 'timestamp': ts, 'cwd': '/tmp',
        'originator': 'codex_cli_rs', 'cli_version': '0.160.0', 'source': 'cli', 'model_provider': 'openai'})
    for i in range(1, 4):
        prompt = 'TEST PROMPT ' + str(i)
        answer = '\n'.join(f'ANSWER {i} LINE {n:03d}: synthetic scroll test text.' for n in range(1, 181))
        add('event_msg', {'type': 'user_message', 'message': prompt, 'images': []})
        add('response_item', {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': prompt}]})
        add('response_item', {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': answer}]})
        add('event_msg', {'type': 'agent_message', 'message': answer})
    rollout = home / 'sessions/2026/10/05' / ('rollout-2026-10-05T16-00-00-' + sid + '.jsonl')
    rollout.parent.mkdir(parents=True)
    rollout.write_text(''.join(json.dumps(r) + '\n' for r in records))
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    serve = subprocess.Popen([str(args.daemon), 'serve', ident], stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, start_new_session=True, env=dict(os.environ, CLAUDE_SESSION_BUFSIZE='4096'))
    bridge = subprocess.Popen(['ttyd', '-W', '-i', '127.0.0.1', '-p', str(port),
        '-t', 'rendererType=canvas', '-t', 'scrollback=50000', '-t', 'disableLeaveAlert=true',
        str(SESSION), 'attach', ident], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(60):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch(
            args=['--disable-features=LocalNetworkAccessChecks'] if args.engine == 'chromium' else [])
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
        url = f'http://127.0.0.1:{port}/'

        def inject(route):
            response = route.fetch()
            scripts = (ROOT / 'apps/everyday/terminal/lib/kbd-input.js').read_text() + '\n' + (ROOT / 'apps/everyday/terminal/terminal-kbd.js').read_text()
            route.fulfill(response=response, body=response.text().replace('</head>', '<script>' + scripts + '</script></head>'))

        ctx.route(url, inject)
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_function('!!window.term')
        page.wait_for_timeout(500)
        command = 'CODEX_HOME=' + shlex.quote(str(home)) + ' ' + shlex.quote(args.codex) + ' -C /tmp resume ' + sid
        page.keyboard.type(command)
        page.keyboard.press('Enter')
        page.wait_for_function("window.term.buffer.active.type === 'alternate'")
        page.wait_for_function("Array.from({length:term.rows},(_,i)=>term.buffer.active.getLine(i)?.translateToString(true)).some(s=>s && s.includes('ANSWER 3 LINE 180'))", timeout=30000)
        assert 180 in lines(page), text(page)
        # Produce enough incremental updates to evict the full initial frame.
        page.keyboard.press('PageUp')
        page.wait_for_timeout(300)
        assert lines(page) and max(lines(page)) < 180, text(page)
        shell = int(Path(f'/proc/{serve.pid}/task/{serve.pid}/children').read_text().split()[0])
        app = next(int(p) for p in Path(f'/proc/{shell}/task/{shell}/children').read_text().split()
                   if Path(f'/proc/{p}/comm').read_text().strip() == 'codex')
        app_start = proc(app)[19]
        if args.daemon != SESSION:
            hint = {'daemon_pid': serve.pid, 'daemon_start': proc(serve.pid)[19],
                    'app_pid': app, 'app_start': app_start,
                    'modes': {'1049': True, '1003': True, '1006': True, '2004': True}}
            hint_path = Path(base + '.replay-bootstrap')
            hint_path.write_text(json.dumps(hint))
            hint_path.chmod(0o600)
        old = page
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_function('!!window.term')
        page.wait_for_timeout(1600)
        old.close()
        assert page.evaluate("term.buffer.active.type === 'alternate' && term.modes.mouseTrackingMode === 'any'")
        assert len(lines(page)) > 20, 'reconnect must repaint complete text, not only changed digits'
        # Actual browser key events, including iframe-body focus rather than textarea.
        page.evaluate('document.activeElement.blur()')
        before = min(lines(page))
        page.keyboard.press('PageDown')
        page.wait_for_timeout(250)
        assert min(lines(page)) > before, text(page)
        assert page.evaluate('document.scrollingElement.scrollTop') == 0
        # Read every line of the latest response using real mouse-wheel events.
        seen = lines(page)
        page.mouse.move(300, 300)
        for _ in range(80):
            page.mouse.wheel(0, -120)
            page.wait_for_timeout(65)
            seen.update(lines(page))
            if 1 in seen:
                break
        assert seen == set(range(1, 181)), f'unreachable response lines: {sorted(set(range(1,181))-seen)}'
        # Older responses remain reachable through application history as well.
        for _ in range(5):
            page.keyboard.press('PageUp')
            page.wait_for_timeout(150)
        assert lines(page, 1) or lines(page, 2), text(page)
        assert proc(app)[19] == app_start, 'Codex must remain the same running process'
        print(f'PASS {args.engine}: reconnect, Page Up/Down, all 180 latest-response lines, previous responses; daemon={args.daemon}')
        browser.close()
finally:
    for child in (bridge, serve):
        if child is not None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    for path in Path('/tmp').glob('vibetop-session-' + ident + '.*'):
        path.unlink(missing_ok=True)
    shutil.rmtree(home)
