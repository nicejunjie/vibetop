#!/usr/bin/env python3
"""Full local TLS nginx → root auth → systemd rewriter → public HTTPS → UI.

Creates only disposable test units/config/profile. Browser runs as SUDO_USER
with its sandbox enabled. A private CONNECT resolver serves only test hosts.
"""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import pwd
import select
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from browser_proxy import Bridge
from browser_proxy_auth import BrowserAuthority, unique_cookie
from browser_proxy_runtime import Runtime
from browser_proxy_nginx import render


def main():
    assert os.geteuid() == 0
    user = os.environ.get("SUDO_USER") or "junjie"
    pw = pwd.getpwnam(user)
    assert pw.pw_uid
    prefix = "vt-browser-frontdoor-" + str(os.getpid())
    temporary = Path(tempfile.mkdtemp(prefix=prefix + "-"))
    temporary.chmod(0o755)
    run, profiles = Path("/run") / prefix, Path("/var/lib") / prefix
    auth = BrowserAuthority(os.urandom(32), "realms.vt-browser.example.com", "https://browser-lite.vt-browser.example.com", ["https://vibetop.vt-browser.example.com"])
    code = Path(os.environ.get("VT_BROWSER_RELEASE", ROOT / "apps/everyday/browser-lite/proxy"))
    revision = None
    if "VT_BROWSER_RELEASE" in os.environ:
        from browser_proxy_release import validate
        revision = validate(code, node_version=subprocess.check_output(['/usr/bin/node', '--version'], text=True).strip())["revision"]
    runtime = Runtime(auth, run=run, profiles=profiles, code=code, revision=revision, prefix=prefix, guard_user="nobody")
    bridge = Bridge(auth, runtime)
    original_redeem, original_ui_claims = auth.redeem, bridge.ui_claims
    def redeem(*args):
        try:
            result = original_redeem(*args)
            print('handoff redeemed', flush=True)
            return result
        except ValueError as error:
            print('handoff rejected', str(error), flush=True)
            raise
    def ui_claims(headers):
        try:
            return original_ui_claims(headers)
        except ValueError as error:
            print('UI auth rejected', str(error), 'cookie names', [part.partition('=')[0].strip() for part in headers.get('Cookie', '').split(';')], flush=True)
            raise
    auth.redeem, bridge.ui_claims = redeem, ui_claims
    handoffs = []
    main_expiry = int(time.time()) + 3600
    class Manager(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def main_reply(self, status, body, mime):
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            if self.path.startswith("/__browser_proxy/"):
                return bridge.handle(self)
            assets = {"/": "browser-proxy-launcher.html", "/browser-proxy-launcher.js": "browser-proxy-launcher.js"}
            if self.path in assets:
                content = (ROOT / "apps/everyday/browser-lite" / assets[self.path]).read_bytes()
                return self.main_reply(200, content, "application/javascript" if self.path.endswith(".js") else "text/html")
            self.main_reply(404, b"", "text/plain")
        def do_POST(self):
            if self.path.startswith("/__browser_proxy/"):
                if self.headers.get("X-Original-URI") == "/__vt/bootstrap":
                    print("bootstrap context", {key: self.headers.get(key) for key in ("Host", "Origin", "Sec-Fetch-Dest", "Sec-Fetch-Mode", "Content-Type")}, flush=True)
                return bridge.handle(self)
            token = unique_cookie(self.headers.get("Cookie"), "test_main")
            if token not in ("device-a", "device-b") or self.headers.get("Origin") != "https://vibetop.vt-browser.example.com":
                return self.main_reply(401, b"{}", "application/json")
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            if self.path == "/api/browser-lite/bootstrap":
                try:
                    data = bridge.bootstrap(pw.pw_uid, user, token, {"exp": main_expiry, "e": 0}, self.headers["Origin"])
                    handoffs.append(token)
                    return self.main_reply(200, json.dumps(data).encode(), "application/json")
                except ValueError:
                    return self.main_reply(401, b'{"error":"Sign in again."}', "application/json")
            if self.path == "/test/restart-manager":
                bridge.runtime = Runtime(auth, run=run, profiles=profiles, code=runtime.code, revision=revision, prefix=prefix, guard_user="nobody")
                return self.main_reply(200, b"{}", "application/json")
            if self.path == "/test/restart-rewriter":
                subprocess.run(["systemctl", "restart", runtime.names(pw.pw_uid)["rewrite"] + ".service"], check=True)
                return self.main_reply(200, b"{}", "application/json")
            if self.path == "/test/logout":
                bridge.runtime.revoke_device(token)
                return self.main_reply(200, b"{}", "application/json")
            self.main_reply(404, b"", "text/plain")
    manager = ThreadingHTTPServer(("127.0.0.1", 0), Manager)
    threading.Thread(target=manager.serve_forever, daemon=True).start()
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=vt-browser.example.com", "-keyout", str(temporary / "key.pem"), "-out", str(temporary / "cert.pem")], check=True, capture_output=True)
    rendered = render(auth.domain, auth.ui_origin, auth.main_origins, listen=f"127.0.0.1:{port}", manager=f"127.0.0.1:{manager.server_port}", scheme="https").replace(f"listen 127.0.0.1:{port};", f"listen 127.0.0.1:{port} ssl;")
    config = f"""user www-data;
worker_processes 1;
pid {temporary}/nginx.pid;
error_log {temporary}/error.log;
events {{worker_connections 1024;}}
http {{
access_log off;
ssl_certificate {temporary}/cert.pem;
ssl_certificate_key {temporary}/key.pem;
map $http_upgrade $connection_upgrade {{default upgrade; '' close;}}
client_body_temp_path {temporary}/body;
proxy_temp_path {temporary}/proxy;
""" + rendered + f"""
server {{listen 127.0.0.1:{port} ssl default_server; server_name vibetop.vt-browser.example.com;
if ($vt_browser_main_host_allowed = 0) {{return 421;}}
location / {{proxy_pass http://127.0.0.1:{manager.server_port}; proxy_set_header Host $http_host;}}}}
}}
"""
    (temporary / "nginx.conf").write_text(config)
    class Resolver(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_CONNECT(self):
            url = urlsplit("https://" + self.path)
            if url.port != 443 or not url.hostname.endswith(".vt-browser.example.com"):
                self.send_error(403)
                return
            with socket.create_connection(("127.0.0.1", port), timeout=10) as upstream:
                self.connection.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                self.connection.settimeout(None)
                upstream.settimeout(None)
                while True:
                    ready, _, _ = select.select([self.connection, upstream], [], [], 30)
                    if not ready:
                        return
                    for source in ready:
                        try:
                            data = source.recv(65536)
                            if not data:
                                return
                            (upstream if source is self.connection else self.connection).sendall(data)
                        except (ConnectionResetError, BrokenPipeError):
                            return
    resolver = ThreadingHTTPServer(("127.0.0.1", 0), Resolver)
    threading.Thread(target=resolver.serve_forever, daemon=True).start()
    units = [name + ext for name in runtime.names(pw.pw_uid).values() for ext in (".socket", ".service")]
    nginx = None
    try:
        subprocess.run(["nginx", "-t", "-c", str(temporary / "nginx.conf")], check=True, capture_output=True)
        nginx = subprocess.Popen(["nginx", "-c", str(temporary / "nginx.conf"), "-g", "daemon off;"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=.1).close()
                break
            except OSError:
                time.sleep(.02)
        subprocess.run(["runuser", "-u", user, "--", "/opt/vibetop/browser-lite/venv/bin/python", str(Path(__file__).with_name("frontdoor-browser.py")), str(resolver.server_port), sys.argv[1] if len(sys.argv) > 1 else "chromium"], check=True, timeout=240)
        assert handoffs.count("device-a") >= 2, handoffs
        print("PASS: full TLS frontdoor, in-place sign-in renewal, manager/daemon restart, independent device logout")
    except BaseException:
        if (temporary / "error.log").exists():
            shutil.copyfile(temporary / "error.log", "/tmp/vt-frontdoor-nginx-error.log")
        subprocess.run(["journalctl", "--no-pager", "-n", "20", *[arg for unit in units for arg in ("-u", unit)]])
        raise
    finally:
        resolver.shutdown()
        manager.shutdown()
        resolver.server_close()
        manager.server_close()
        if nginx:
            nginx.terminate()
            nginx.wait(timeout=10)
        subprocess.run(["systemctl", "stop", *[u for u in units if u.endswith(".socket")]], capture_output=True)
        subprocess.run(["systemctl", "stop", *[u for u in units if u.endswith(".service")]], capture_output=True)
        for unit in units:
            (Path("/run/systemd/system") / unit).unlink(missing_ok=True)
        subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
        for directory in (temporary, run, profiles):
            if directory.exists():
                shutil.rmtree(directory)


if __name__ == "__main__":
    main()
