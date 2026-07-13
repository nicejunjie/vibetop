"""Auth foundation (Phase 1) — PAM login + signed session cookie.

Covers the pure session-token helpers and the /api/login, /api/logout, and
/api/authcheck endpoints. PAM itself is stubbed via the `_authenticate` seam so
no real credentials are touched.
"""
import http.cookies
import time


def _cookie_pair(headers, name="vt_session"):
    """Return 'name=value' from a response's Set-Cookie, or None."""
    sc = headers.get("Set-Cookie")
    if not sc:
        return None
    jar = http.cookies.SimpleCookie(sc)
    m = jar.get(name)
    return f"{name}={m.value}" if m and m.value else None


# --- pure session-token helpers ---------------------------------------------

def test_session_roundtrip(mgr, home):
    tok = mgr._sign_session("alice")
    assert mgr._verify_session(tok) == "alice"


def test_session_tamper_rejected(mgr, home):
    tok = mgr._sign_session("alice")
    assert mgr._verify_session(tok[:-3] + "zzz") is None


def test_session_expired_rejected(mgr, home):
    assert mgr._verify_session(mgr._sign_session("bob", ttl=-10)) is None


def test_session_junk_rejected(mgr, home):
    assert mgr._verify_session("not.a.token") is None
    assert mgr._verify_session("") is None


def test_session_bad_username_claim_rejected(mgr, home):
    # A forged token whose signature is valid but whose username isn't a legal
    # login name must be rejected (defense against a traversal-y principal).
    forged = mgr._jwt_sign({"u": "../etc", "exp": int(time.time()) + 99},
                           mgr._session_secret())
    assert mgr._verify_session(forged) is None


# --- /api/login -------------------------------------------------------------

def test_login_success_sets_cookie(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: u == "alice" and p == "pw")
    status, headers, body = client.post_full("/api/login",
                                              {"username": "alice", "password": "pw"})
    assert status == 200
    assert body == {"ok": True, "user": "alice"}
    sc = headers.get("Set-Cookie", "")
    assert "vt_session=" in sc and "HttpOnly" in sc
    assert "SameSite=Lax" in sc and "Max-Age=604800" in sc
    # the cookie must actually verify back to the user
    pair = _cookie_pair(headers)
    tok = pair.split("=", 1)[1]
    assert mgr._verify_session(tok) == "alice"


def test_login_bad_password_401_no_cookie(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: False)
    status, headers, body = client.post_full("/api/login",
                                              {"username": "alice", "password": "nope"})
    assert status == 401
    assert "error" in body
    assert "Set-Cookie" not in headers


def test_login_missing_fields_400(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    assert client.post("/api/login", {"username": "alice"})[0] == 400
    assert client.post("/api/login", {})[0] == 400


def test_login_invalid_username_never_calls_pam(mgr, client, monkeypatch):
    called = []
    monkeypatch.setattr(mgr, "_authenticate",
                        lambda u, p: called.append(u) or True)
    # shell-ish / traversal usernames are rejected before PAM is consulted
    status, _headers, _body = client.post_full(
        "/api/login", {"username": "a; rm -rf", "password": "x"})
    assert status == 401
    assert called == []


def test_login_secure_flag_on_https(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    status, headers, _ = client.post_full(
        "/api/login", {"username": "alice", "password": "pw"},
        headers={"X-Forwarded-Proto": "https"})
    assert status == 200
    assert "Secure" in headers.get("Set-Cookie", "")


def test_login_no_secure_flag_on_http(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _status, headers, _ = client.post_full(
        "/api/login", {"username": "alice", "password": "pw"})
    assert "Secure" not in headers.get("Set-Cookie", "")


def test_login_lockout_after_repeated_failures(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "LOGIN_MAX_FAILS", 3)
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: False)
    for _ in range(3):
        assert client.post("/api/login", {"username": "alice", "password": "x"})[0] == 401
    # further attempts for this user are locked out (429), even with the right pw
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    assert client.post("/api/login", {"username": "alice", "password": "pw"})[0] == 429
    # a different username is unaffected
    assert client.post("/api/login", {"username": "bob", "password": "pw"})[0] == 200


# --- /api/authcheck (nginx auth_request target) -----------------------------

def test_authcheck_no_cookie_401(mgr, client):
    assert client.get("/api/authcheck")[0] == 401


def test_authcheck_valid_cookie_200_with_user_header(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _s, headers, _b = client.post_full("/api/login",
                                       {"username": "alice", "password": "pw"})
    cookie = _cookie_pair(headers)
    status, hdrs, _ = client.get_full("/api/authcheck", cookie=cookie)
    assert status == 200
    assert hdrs.get("X-Vibetop-User") == "alice"


def test_authcheck_tampered_cookie_401(mgr, client):
    bad = "vt_session=" + mgr._sign_session("alice")[:-3] + "zzz"
    assert client.get("/api/authcheck", cookie=bad)[0] == 401


# --- public-path allowlist (the nginx gate policy) --------------------------

def test_is_public_path(mgr):
    for p in ("/api/login", "/api/logout", "/api/authcheck",
              "/api/ping", "/api/health", "/api/metrics",
              "/api/office/callback?path=x", "/api/office/doc?path=y&t=z"):
        assert mgr._is_public_path(p), p
    for p in ("/api/notes", "/api/desktop", "/api/reset", "/api/upload",
              "/api/office/forcesave", "/api/office/config", "/api/system/status",
              "/api/office", "", "/api/loginx",
              # exact-match: a crafted suffix must NOT ride the allowlist (#7)
              "/api/office/callback-evil", "/api/office/doc/../x", "/api/logout-x"):
        assert not mgr._is_public_path(p), p


def test_authcheck_allows_public_path_without_cookie(mgr, client):
    # nginx forwards X-Original-URI; a public path is allowed even with no session.
    status, hdrs, _ = client.get_full(
        "/api/authcheck", headers={"X-Original-URI": "/api/office/callback?path=a"})
    assert status == 200
    # no user asserted for a public bypass
    assert "X-Vibetop-User" not in hdrs


def test_authcheck_gated_path_needs_cookie(mgr, client):
    status, _hdrs, _ = client.get_full(
        "/api/authcheck", headers={"X-Original-URI": "/api/notes"})
    assert status == 401


# --- /api/logout ------------------------------------------------------------

def test_logout_clears_cookie(mgr, client):
    status, headers, _ = client.post_full("/api/logout")
    assert status == 200
    sc = headers.get("Set-Cookie", "")
    assert "vt_session=" in sc and "Max-Age=0" in sc


# --- end-to-end -------------------------------------------------------------

def test_login_then_authcheck_roundtrip(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _s, headers, _b = client.post_full("/api/login",
                                       {"username": "junjie", "password": "pw"})
    cookie = _cookie_pair(headers)
    status, hdrs, _ = client.get_full("/api/authcheck", cookie=cookie)
    assert status == 200 and hdrs.get("X-Vibetop-User") == "junjie"
