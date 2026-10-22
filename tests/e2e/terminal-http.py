#!/usr/bin/env python3
"""Real ttyd/xterm with blocked native WebSockets, lost POST response and replay.
Uses a disposable PTY and loopback HTTP fixture; never touches live terminals.
"""
import argparse
import http.server
import json
import os
import pathlib
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'server'))
import terminal_transport as transport
parser = argparse.ArgumentParser()
parser.add_argument('--engine', default='chromium', choices=['chromium', 'webkit'])
parser.add_argument('--browser-path')
args = parser.parse_args()
instance = f'http-test-{os.getpid()}'
helper = root / 'apps/everyday/terminal/vibetop-session'
probe = socket.socket(); probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]; probe.close()
logs = tempfile.TemporaryFile(mode='w+')
home = tempfile.TemporaryDirectory(prefix='vt-http-test-')
daemon = subprocess.Popen([str(helper), 'serve', instance], stdout=logs, stderr=logs,
                          start_new_session=True, cwd=home.name, env={**os.environ, 'HOME': home.name})
ttyd = None

class Handler(http.server.BaseHTTPRequestHandler):
    drop_response = True
    def log_message(self, *args): pass
    def _session_user(self): return 'test'
    def _ensure_user_terminal(self, user, number): return port
    def _read_body(self, maximum):
        n = int(self.headers.get('Content-Length', '0'))
        return self.rfile.read(n) if n <= maximum else None
    def _json(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers()
        try: self.wfile.write(body)
        except BrokenPipeError: pass
    def do_POST(self):
        if self.path == '/api/clientlog': return self._json(200, {'ok': True})
        return transport.handle(self, 50)
    def do_GET(self):
        if self.path.startswith('/terminal-'):
            body = (root / 'apps/everyday/terminal' / self.path[1:]).read_bytes()
            kind = 'application/javascript'
        else:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}' + self.path) as response:
                body = response.read(); kind = response.headers['Content-Type']
            if self.path == '/t1/':
                body = body.replace(b'</head>', b'<script src="/terminal-http.js"></script><script src="/terminal-connection.js"></script></head>')
                body = body.replace(b'this.terminal=new', b'(window.__vibetopTtyd=this),this.terminal=new')
        self.send_response(200); self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    for _ in range(100):
        if pathlib.Path(f'/tmp/vibetop-session-{instance}.sock').exists(): break
        time.sleep(.05)
    ttyd = subprocess.Popen(['/usr/bin/ttyd', '-W', '-i', '127.0.0.1', '-p', str(port), '-b', '/t1',
                             '-t', 'rendererType=canvas', '-t', 'disableLeaveAlert=true', str(helper), 'attach', instance],
                            stdout=logs, stderr=logs, start_new_session=True)
    time.sleep(.2)
    with sync_playwright() as p:
        browser = getattr(p, args.engine).launch(headless=True, executable_path=args.browser_path, args=['--no-sandbox', '--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets'] if args.engine == 'chromium' else [])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # A native WebSocket that never opens, as in the incident. Preserve actual
        # EventTarget semantics so ttyd/connection adapters see the same facade.
        page.add_init_script('''window.WebSocket = class extends EventTarget {
          constructor(){super();this.readyState=0;} close(){this.readyState=3;}
        };''')
        lost = []
        def transport_route(route):
            data = route.request.post_data_json
            if data.get('op') == 'send' and data.get('seq') == 2 and not lost:
                response = route.fetch()  # backend accepted input; lose only its HTTP response
                assert response.ok
                lost.append(True)
                route.abort('failed')
            else: route.continue_()
        page.route('**/api/terminal-transport', transport_route)
        url = f'http://127.0.0.1:{server.server_address[1]}/t1/'
        start = time.monotonic()
        page.goto(url)
        page.wait_for_function("window.__vibetopTtyd?.socket?.readyState === 1 && window.term && term.buffer.active.getLine(0)?.translateToString().trim().length > 0", timeout=20000)
        print(args.engine, 'blocked-WebSocket fallback attached in', round(time.monotonic() - start, 2), 'seconds', flush=True)
        def screen():
            return page.evaluate("Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString()).join('\\n')")
        # Use a file in the disposable HOME to detect duplicate shell execution.
        command = "printf x >> once; printf '\\nRESULT:%s\\n' \"$(cat once)\"\r"
        page.evaluate('(s) => __vibetopTtyd.socket.send("0" + s)', command)
        page.wait_for_function("Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('RESULT:x')", timeout=15000)
        assert pathlib.Path(home.name, 'once').read_text() == 'x'
        assert lost, 'test must drop an accepted input response'
        page.reload()
        page.wait_for_function("window.term && Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('RESULT:x')", timeout=10000)
        assert pathlib.Path(home.name, 'once').read_text() == 'x'
        assert not errors, errors
        print(args.engine, 'input exactly once, output replay, and reconnect passed', flush=True)
        browser.close()
finally:
    server.shutdown()
    for _, relay in list(transport.registry.relays.values()): relay.close()
    if ttyd:
        os.killpg(ttyd.pid, signal.SIGTERM); ttyd.wait(timeout=5)
    os.killpg(daemon.pid, signal.SIGTERM); daemon.wait(timeout=5)
    for path in pathlib.Path('/tmp').glob(f'vibetop-session-{instance}.*'):
        try: path.unlink()
        except OSError: pass
    home.cleanup()
