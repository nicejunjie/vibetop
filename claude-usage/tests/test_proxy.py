"""Unit + smoke tests for vibetop-claude-proxy: the usage-header capture
(`_record`/`_num`) and the fail-open streaming relay. No network — the upstream
HTTPS connection is stubbed; captures write into a tmp file."""
import http.server
import json
import os
import socket
import threading


UNIFIED = [
    ("anthropic-ratelimit-unified-status", "allowed"),
    ("anthropic-ratelimit-unified-representative-claim", "5h"),
    ("anthropic-ratelimit-unified-5h-utilization", "0.42"),
    ("anthropic-ratelimit-unified-5h-status", "allowed"),
    ("anthropic-ratelimit-unified-5h-reset", "1750000000"),
    ("anthropic-ratelimit-unified-7d-utilization", "0.75"),
    ("anthropic-ratelimit-unified-7d-status", "allowed"),
    ("anthropic-ratelimit-unified-7d-reset", "1750500000"),
    ("content-type", "application/json"),
]


# ---- _num ------------------------------------------------------------------

def test_num_parses_floats(proxy):
    assert proxy._num("0.42") == 0.42
    assert proxy._num("1") == 1.0


def test_num_none_on_garbage(proxy):
    assert proxy._num(None) is None
    assert proxy._num("not-a-number") is None


# ---- _record ---------------------------------------------------------------

def test_record_writes_usage_json(proxy, out_file):
    proxy._record(UNIFIED)
    data = json.loads(out_file.read_text())
    assert data["status"] == "allowed"
    assert data["representative"] == "5h"
    assert data["session"]["pct"] == 0.42
    assert data["session"]["reset"] == 1750000000.0
    assert data["weekly"]["pct"] == 0.75
    assert isinstance(data["updated"], int)


def test_record_skips_non_api_response(proxy, out_file):
    # A response with none of the unified headers must not create/blank the file.
    proxy._record([("content-type", "text/html"), ("server", "nginx")])
    assert not out_file.exists()


def test_record_atomic_leaves_no_temp(proxy, out_file):
    proxy._record(UNIFIED)
    leftovers = [n for n in os.listdir(out_file.parent) if n.startswith(".cu-")]
    assert leftovers == []
    # Header casing shouldn't matter (headers are case-insensitive).
    up = [(k.upper(), v) for k, v in UNIFIED]
    proxy._record(up)
    assert json.loads(out_file.read_text())["session"]["pct"] == 0.42


# ---- fail-open streaming relay --------------------------------------------

class _FakeResp:
    def __init__(self, status, reason, headers, body):
        self.status, self.reason = status, reason
        self._headers, self._body, self._done = headers, body, False

    def getheaders(self):
        return self._headers

    def read1(self, n):
        if self._done:
            return b""
        self._done = True
        return self._body

    read = read1


class _FakeConn:
    """Records the forwarded request; returns a preset response (or raises)."""
    last = None

    def __init__(self, host, port, timeout=None):
        self.host = host

    def request(self, method, path, body=None, headers=None):
        _FakeConn.last = {"method": method, "path": path, "body": body,
                          "headers": headers}
        if _FakeConn.raise_on_request:
            raise OSError("upstream unreachable")

    def getresponse(self):
        return _FakeConn.response

    def close(self):
        pass


def _serve(proxy):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), proxy.Handler)
    srv.daemon_threads = True
    threading.Thread(target=lambda: srv.serve_forever(poll_interval=0.02),
                     daemon=True).start()
    return srv


def _raw_post(port, path, body):
    """Raw-socket POST to the proxy (avoids urllib, which touches the same
    http.client.HTTPSConnection we stub). Returns (status_int, body_bytes)."""
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    try:
        req = (("POST %s HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                "Content-Type: application/json\r\nContent-Length: %d\r\n"
                "Connection: close\r\n\r\n") % (path, len(body))).encode() + body
        s.sendall(req)
        s.settimeout(5)
        buf = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
    finally:
        s.close()
    head, _, payload = buf.partition(b"\r\n\r\n")
    status = int(head.split(b" ")[1])
    return status, payload


def test_relay_forwards_and_captures(proxy, out_file, monkeypatch):
    _FakeConn.response = _FakeResp(200, "OK", UNIFIED, b'{"ok":true}')
    _FakeConn.raise_on_request = False
    monkeypatch.setattr(proxy.http.client, "HTTPSConnection", _FakeConn)
    srv = _serve(proxy)
    try:
        status, payload = _raw_post(srv.server_address[1], "/v1/messages", b'{"q":1}')
        assert status == 200
        assert payload == b'{"ok":true}'              # body relayed verbatim
        # Upstream Host was rewritten and the body forwarded.
        assert _FakeConn.last["headers"]["Host"] == proxy.UPSTREAM_HOST
        assert _FakeConn.last["body"] == b'{"q":1}'
        # Usage headers on the response were captured to disk.
        assert json.loads(out_file.read_text())["session"]["pct"] == 0.42
    finally:
        srv.shutdown()


def test_relay_fails_open_with_502(proxy, out_file, monkeypatch):
    _FakeConn.response = None
    _FakeConn.raise_on_request = True                  # upstream down
    monkeypatch.setattr(proxy.http.client, "HTTPSConnection", _FakeConn)
    srv = _serve(proxy)
    try:
        status, _ = _raw_post(srv.server_address[1], "/v1/messages", b"{}")
        assert status == 502                           # fail-open, not a hang
    finally:
        srv.shutdown()
