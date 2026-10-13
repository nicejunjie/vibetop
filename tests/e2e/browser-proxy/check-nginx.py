#!/usr/bin/env python3
"""Disposable nginx auth/streaming contract test; no production configuration."""
import base64
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from browser_proxy import Bridge
from browser_proxy_auth import BrowserAuthority
from browser_proxy_nginx import render


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    assert os.geteuid() == 0
    temporary = Path(tempfile.mkdtemp(prefix="vt-browser-nginx-"))
    temporary.chmod(0o755)
    auth = BrowserAuthority(os.urandom(32), "realms.example.com", "https://browser-lite.example.com", ["https://vibetop.example.com"])
    ticket = auth.begin(1000, "alice", "test-session", time.time() + 3600, "https://vibetop.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    profile = auth.realm_config(1000)["profile"]
    token = auth.mint("content", lease)
    cookie = "__Secure-vt_browser_" + profile + "=" + token
    host = "bl-u1000-" + "a" * 32 + ".realms.example.com"
    upstream_headers, auth_lengths = [], []
    class Upstream(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *args):
            pass
        def do_GET(self):
            upstream_headers.append(dict(self.headers))
            if self.path == "/stream":
                self.send_response(200)
                self.send_header("Content-Length", "10")
                self.end_headers()
                self.wfile.write(b"first")
                self.wfile.flush()
                time.sleep(1)
                self.wfile.write(b"final")
            elif self.path == "/ws":
                accept = base64.b64encode(hashlib.sha1((self.headers["Sec-WebSocket-Key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
                self.send_response(101)
                self.send_header("Upgrade", "websocket")
                self.send_header("Connection", "Upgrade")
                self.send_header("Sec-WebSocket-Accept", accept)
                self.end_headers()
                frame = self.rfile.read(8)
                assert frame == b"\x81\x82abcd\x09\x0b"
                self.wfile.write(b"\x81\x02hi")
                self.wfile.flush()
                self.close_connection = True
            else:
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"ok")
        def do_POST(self):
            upstream_headers.append(dict(self.headers))
            data = self.rfile.read(int(self.headers["Content-Length"]))
            result = json.dumps({"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(result)))
            self.end_headers()
            self.wfile.write(result)
    backend = UnixServer(str(temporary / "ingress.sock"), Upstream)
    import grp
    os.chown(temporary / "ingress.sock", 0, grp.getgrnam("www-data").gr_gid)
    os.chmod(temporary / "ingress.sock", 0o660)
    runtime = SimpleNamespace(route=lambda claims: str(temporary / "ingress.sock"), code=ROOT / "apps/everyday/browser-lite/proxy", ensure=lambda claims: None)
    bridge = Bridge(auth, runtime)
    class Manager(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            auth_lengths.append(self.headers.get("Content-Length"))
            bridge.handle(self)
        def do_POST(self):
            bridge.handle(self)
    manager = ThreadingHTTPServer(("127.0.0.1", 0), Manager)
    for server in (manager, backend):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        port = reserved.getsockname()[1]
    config = f"""user www-data;
worker_processes 1;
pid {temporary}/nginx.pid;
error_log {temporary}/error.log;
events {{worker_connections 256;}}
http {{
    access_log off;
    map $http_upgrade $connection_upgrade {{default upgrade; '' close;}}
    client_body_temp_path {temporary}/body;
    proxy_temp_path {temporary}/proxy;
""" + render("example.com", auth.ui_origin, auth.main_origins, listen=f"127.0.0.1:{port}", manager=f"127.0.0.1:{manager.server_port}", scheme="https") + f"""
server {{listen 127.0.0.1:{port} default_server; server_name _;
if ($vt_browser_main_host_allowed = 0) {{return 421;}}
return 200 'desktop';}}
}}
"""
    (temporary / "nginx.conf").write_text(config)
    nginx = None
    def request(path, method="GET", body=None, extra=None, hostname=host):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        connection.request(method, path, body=body, headers={"Host": hostname, "Cookie": cookie, **(extra or {})})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, payload
    try:
        subprocess.run(["nginx", "-t", "-c", str(temporary / "nginx.conf")], check=True, capture_output=True)
        nginx = subprocess.Popen(["nginx", "-c", str(temporary / "nginx.conf"), "-g", "daemon off;"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for attempt in range(100):
            try:
                assert request("/")[0] == 200
                break
            except ConnectionRefusedError:
                time.sleep(.02)
        assert request("/api/login", extra={"Cookie": ""})[0] == 401
        assert request("/", hostname="unrecognized.example.com")[0] == 421
        assert request("/", hostname="bl-u01000-" + "a" * 32 + ".realms.example.com")[0] == 421
        assert request("/", extra={"X-VT-Browser-Role": "entry", "X-VT-Browser-Uid": "0"})[0] == 200
        assert upstream_headers[-1]["X-VT-Browser-Role"] == "auth"
        assert upstream_headers[-1]["X-VT-Browser-Uid"] == "1000"
        assert not upstream_headers[-1].get("Cookie")
        payload = os.urandom(3 * 1024 * 1024)
        status, uploaded = request("/upload", "POST", payload)
        assert status == 200, status
        assert json.loads(uploaded) == {"size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
        assert all(value in (None, "0") for value in auth_lengths)
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        start = time.monotonic()
        connection.request("GET", "/stream", headers={"Host": host, "Cookie": cookie})
        response = connection.getresponse()
        assert response.read(5) == b"first" and time.monotonic() - start < .8
        assert response.read() == b"final"
        connection.close()
        with socket.create_connection(("127.0.0.1", port), timeout=10) as ws:
            ws.sendall((f"GET /ws HTTP/1.1\r\nHost: {host}\r\nCookie: {cookie}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").encode())
            response = b""
            while b"\r\n\r\n" not in response:
                response += ws.recv(4096)
            assert b"101 Switching Protocols" in response
            ws.sendall(b"\x81\x82abcd\x09\x0b")
            assert ws.recv(4) == b"\x81\x02hi"
        ui_cookie = UI_COOKIE + "=" + auth.mint("ui", lease)
        assert request("/wrapper.js", hostname="browser-lite.example.com", extra={"Cookie": ui_cookie})[0] == 200
        assert request("/?url=https%3A%2F%2Fwww.wikipedia.org%2F", hostname="browser-lite.example.com", extra={"Cookie": ui_cookie})[0] == 200
        assert request("/api/open", "POST", b"{}", hostname="browser-lite.example.com", extra={"Cookie": ui_cookie, "Origin": "https://evil.example.com", "Sec-Fetch-Site": "same-site", "Content-Type": "application/json"})[0] == 401
        entry = "https://" + host + "/__vt/entry?ticket=" + "x" * 43
        entry_path = entry.split(host, 1)[1] + "&permit=" + auth.entry_permit(entry, lease)
        entry_headers = {"Referer": auth.ui_origin + "/", "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate"}
        assert request(entry_path, extra=entry_headers)[0] == 200
        assert request(entry_path, extra=entry_headers)[0] == 401
        print("PASS: nginx auth isolation, headers, 3 MiB upload, immediate stream, WebSocket, entry replay, UI routing")
    except BaseException:
        if (temporary / "error.log").exists():
            # nginx may log signed URLs on failures: keep the full diagnostic
            # file locally and report only its location, never bearer values.
            shutil.copyfile(temporary / "error.log", "/tmp/vt-browser-nginx-error.log")
            print("nginx diagnostics: /tmp/vt-browser-nginx-error.log", file=sys.stderr)
        raise
    finally:
        if nginx:
            nginx.terminate()
            nginx.wait(timeout=10)
        manager.shutdown()
        backend.shutdown()
        manager.server_close()
        backend.server_close()
        shutil.rmtree(temporary)


if __name__ == "__main__":
    from browser_proxy import UI_COOKIE
    main()
