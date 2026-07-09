"""Endpoint contracts: CSRF gate, /api/reset, /api/services/discover,
/api/events (SSE), /api/health. Boots the manager in-process (see the `client`
fixture in conftest.py) — no root/systemd; external processes are stubbed."""
import socket


# ---- CSRF gate -------------------------------------------------------------

def test_csrf_rejects_cross_origin_post(client):
    status, body = client.post("/api/desktop", {"instance": "x"},
                               origin="http://evil.example")
    assert status == 403
    assert "cross-origin" in body["error"]


def test_csrf_allows_same_origin_post(client):
    status, body = client.post("/api/desktop", {"instance": "x"})
    assert status == 200
    assert body["ok"] is True


def test_csrf_allows_no_origin_post(client):
    # curl / server-to-server (no Origin header) is not a browser CSRF vector.
    status, body = client.post("/api/desktop", {"instance": "x"}, origin=None)
    assert status == 200


def test_office_callback_is_csrf_exempt(client):
    # A cross-origin Origin must NOT 403 the OnlyOffice save callback (it's a
    # server-to-server POST authed by its own path HMAC + JWT). With no secret
    # configured it returns 200 {"error":1}, but crucially not a 403.
    status, body = client.post("/api/office/callback?path=x.docx&t=bad",
                               {"status": 2}, origin="http://evil.example")
    assert status == 200
    assert body == {"error": 1}


def test_get_is_not_csrf_gated(client):
    status, body = client.get("/api/ping")
    assert status == 200 and body == {"ok": True}


def test_unknown_route_404(client):
    status, _ = client.get("/api/nope")
    assert status == 404


# ---- /api/reset ------------------------------------------------------------

def test_reset_bumps_epoch_and_clears_registry(client, mgr):
    # Seed a desktop instance, then reset should clear instances + bump epoch.
    client.post("/api/desktop", {"instance": "a", "open": ["terminal"]})
    _, before = client.get("/api/desktop?instance=a")
    status, body = client.post("/api/reset", {})
    assert status == 200 and body["ok"] is True
    assert body["desktop_cleared"] is True
    _, after = client.get("/api/desktop?instance=a")
    assert after["reset_epoch"] == before["reset_epoch"] + 1
    assert after["open"] == []          # registry cleared


def test_reset_clears_office_sessions(client, mgr):
    mgr._office_sessions["some/doc.docx"] = "key123"
    status, body = client.post("/api/reset", {})
    assert status == 200
    assert body["office_sessions_cleared"] == 1
    assert mgr._office_sessions == {}


def test_reset_clears_tab_names(client, mgr):
    client.post("/api/terminals/names", {"n": 3, "name": "build"})
    _, names = client.get("/api/terminals/names")
    assert names["names"].get("3") == "build"
    client.post("/api/reset", {})
    _, names = client.get("/api/terminals/names")
    assert names["names"] == {}


# ---- /api/services/discover ------------------------------------------------

def test_services_discover_shape(client, mgr, monkeypatch):
    fake = {"lan_ip": "192.168.1.10",
            "services": [{"name": "Ollama", "port": 11434, "proc": "ollama",
                          "url": "http://192.168.1.10:11434/", "health": "up"}]}
    monkeypatch.setattr(mgr.service_discovery, "discover", lambda: fake)
    mgr._cache.clear()
    status, body = client.get("/api/services/discover")
    assert status == 200
    assert body == fake


# ---- /api/health -----------------------------------------------------------

def test_health_returns_object(client):
    status, body = client.get("/api/health")
    assert status == 200
    assert isinstance(body, dict)


# ---- /api/events (SSE) -----------------------------------------------------

def test_events_stream_opens_with_retry_and_hello(client):
    # Raw socket read of the SSE preamble: it must send a retry: directive and a
    # hello event carrying the shell version, then we bail (the stream is
    # long-lived). Uses the client's host:port directly.
    host, port = client.host.split(":")
    s = socket.create_connection((host, int(port)), timeout=5)
    try:
        s.sendall(b"GET /api/events HTTP/1.1\r\nHost: %s\r\n\r\n"
                  % client.host.encode())
        s.settimeout(5)
        buf = b""
        while b"hello" not in buf and len(buf) < 4096:
            chunk = s.recv(1024)
            if not chunk:
                break
            buf += chunk
        text = buf.decode(errors="replace")
        assert "200" in text.split("\r\n", 1)[0]
        assert "text/event-stream" in text
        assert "retry:" in text
        assert "hello" in text
    finally:
        s.close()
