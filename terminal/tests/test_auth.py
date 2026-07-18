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


def test_logout_this_device_does_not_revoke_others(mgr, client, monkeypatch):
    # Clearing this cookie must NOT invalidate a token still held elsewhere.
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _s, h, _ = client.post_full("/api/login", {"username": "alice", "password": "pw"})
    cookie = _cookie_pair(h)
    client.post("/api/logout")                       # this device
    # the other device's token is still valid
    st, hdrs, _ = client.get_full("/api/authcheck", cookie=cookie,
                                  headers={"X-Original-URI": "/api/notes"})
    assert st == 200 and hdrs.get("X-Vibetop-User") == "alice"


def test_logout_all_revokes_every_session(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _s, h, _ = client.post_full("/api/login", {"username": "alice", "password": "pw"})
    cookie = _cookie_pair(h)
    # the token works
    assert client.get_full("/api/authcheck", cookie=cookie,
                           headers={"X-Original-URI": "/api/notes"})[0] == 200
    # log out everywhere
    assert client.post("/api/logout/all", cookie=cookie)[0] == 200
    # the SAME token is now rejected (epoch advanced) — every device is out
    assert client.get_full("/api/authcheck", cookie=cookie,
                           headers={"X-Original-URI": "/api/notes"})[0] == 401


def test_logout_all_requires_session(mgr, client):
    # An anonymous request must not be able to invalidate anyone (esp. the operator)
    assert client.post("/api/logout/all")[0] == 401


# --- end-to-end -------------------------------------------------------------

def test_login_then_authcheck_roundtrip(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    _s, headers, _b = client.post_full("/api/login",
                                       {"username": "junjie", "password": "pw"})
    cookie = _cookie_pair(headers)
    status, hdrs, _ = client.get_full("/api/authcheck", cookie=cookie)
    assert status == 200 and hdrs.get("X-Vibetop-User") == "junjie"


# --- sudo gate (_can_sudo / _require_sudo) + Config app authZ ---------------
import types


def _fake_pw(name="alice", uid=1001, gid=1001, shell="/bin/bash"):
    return types.SimpleNamespace(pw_name=name, pw_uid=uid, pw_gid=gid,
                                 pw_shell=shell, pw_gecos=name + ",,,",
                                 pw_dir="/home/" + name)


def _fake_gr(name, gid, members):
    return types.SimpleNamespace(gr_name=name, gr_gid=gid, gr_mem=list(members))


def test_can_sudo_supplementary_member(mgr, home, monkeypatch):
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: _fake_pw(u, gid=1001))
    monkeypatch.setattr(mgr.grp, "getgrnam",
                        lambda n: _fake_gr("sudo", 27, ["alice"]) if n == "sudo"
                        else (_ for _ in ()).throw(KeyError(n)))
    mgr._cache.clear()
    assert mgr._can_sudo("alice") is True
    assert mgr._can_sudo("bob") is False


def test_can_sudo_primary_gid(mgr, home, monkeypatch):
    # A user whose PRIMARY group IS sudo (gr_mem empty) still counts.
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: _fake_pw(u, gid=27))
    monkeypatch.setattr(mgr.grp, "getgrnam",
                        lambda n: _fake_gr("sudo", 27, []) if n == "sudo"
                        else (_ for _ in ()).throw(KeyError(n)))
    mgr._cache.clear()
    assert mgr._can_sudo("carol") is True


def test_me_reports_can_sudo(client, mgr, users, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: u == "alice")
    assert client.get("/api/me", cookie=users["alice"][1])[1]["can_sudo"] is True
    assert client.get("/api/me", cookie=users["bob"][1])[1]["can_sudo"] is False


def test_config_endpoints_require_sudo(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: u == "alice")
    bob = users["bob"][1]
    for ep in ("/api/config/idle", "/api/config/users", "/api/config/resources",
               "/api/config/disk", "/api/config/services"):
        assert client.get(ep, cookie=bob)[0] == 403, ep
    for ep, body in (("/api/config/idle", {"enabled": False, "hours": 2}),
                     ("/api/config/resources", {"memMax": ""}),
                     ("/api/config/services/restart", {"service": "nginx"}),
                     ("/api/config/users/remove", {"username": "x"})):
        assert client.post(ep, body, cookie=bob)[0] == 403, ep
    # cookieless (falls back to APP_USER) is also refused
    assert client.get("/api/config/idle")[0] == 403
    # the sudo user gets through the read endpoints
    alice = users["alice"][1]
    for ep in ("/api/config/idle", "/api/config/users", "/api/config/resources",
               "/api/config/disk", "/api/config/services"):
        assert client.get(ep, cookie=alice)[0] == 200, ep


def test_user_add_rejects_bad_and_protected(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    ck = users["alice"][1]
    for bad in ("root", "Bad Name", "", mgr.APP_USER):
        assert client.post("/api/config/users/add",
                           {"username": bad, "password": "pw123456"}, cookie=ck)[0] == 400
    assert not any(isinstance(c, list) and c and c[0] == "useradd" for c in stubs["run"])


def test_user_remove_refuses_self(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    st, body = client.post("/api/config/users/remove",
                           {"username": "alice"}, cookie=users["alice"][1])
    assert st == 400 and "yourself" in body["error"]
    assert not any(isinstance(c, list) and c and c[0] == "userdel" for c in stubs["run"])


def test_passwd_uses_stdin_not_argv(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: _fake_pw(u, uid=1005))
    st, _ = client.post("/api/config/users/passwd",
                        {"username": "testu", "password": "s3cret!"}, cookie=users["alice"][1])
    assert st == 200
    idx = next(i for i, c in enumerate(stubs["run"])
               if isinstance(c, list) and c and c[0] == "chpasswd")
    assert stubs["run_kw"][idx].get("input") == "testu:s3cret!"          # on STDIN
    assert all("s3cret!" not in " ".join(map(str, c))                    # never in argv
               for c in stubs["run"] if isinstance(c, list))


def test_user_add_sequence(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: (_ for _ in ()).throw(KeyError(u)))   # not-yet-existing
    st, body = client.post("/api/config/users/add",
                           {"username": "newbie", "password": "pw123456"}, cookie=users["alice"][1])
    assert st == 200 and body["user"] == "newbie"
    order = [c[0] for c in stubs["run"]
             if isinstance(c, list) and c and c[0] in ("useradd", "chpasswd", "loginctl")]
    assert order[:3] == ["useradd", "chpasswd", "loginctl"]


def test_passwd_and_remove_reject_protected(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    ck = users["alice"][1]
    for ep in ("/api/config/users/passwd", "/api/config/users/remove"):
        for bad in ("root", mgr.APP_USER):
            assert client.post(ep, {"username": bad, "password": "pw123456"},
                               cookie=ck)[0] == 400
    assert not any(isinstance(c, list) and c and c[0] in ("chpasswd", "userdel")
                   for c in stubs["run"])


def test_passwd_and_remove_reject_system_account(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    # A syntactically valid name that resolves to a system account (uid<1000,
    # nologin) must be refused by _is_real_login_user, not just the name denylist.
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: _fake_pw(u, uid=1, shell="/usr/sbin/nologin"))
    ck = users["alice"][1]
    assert client.post("/api/config/users/passwd",
                       {"username": "daemon", "password": "pw123456"}, cookie=ck)[0] == 400
    assert client.post("/api/config/users/remove",
                       {"username": "daemon"}, cookie=ck)[0] == 400
    assert not any(isinstance(c, list) and c and c[0] in ("chpasswd", "userdel")
                   for c in stubs["run"])


def test_password_rejects_control_chars(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: (_ for _ in ()).throw(KeyError(u)))
    ck = users["alice"][1]
    for bad in ("a\nb", "a\x00b"):        # CR/LF corrupt the chpasswd line; NUL is mishandled
        assert client.post("/api/config/users/add",
                           {"username": "newbie", "password": bad}, cookie=ck)[0] == 400
    assert not any(isinstance(c, list) and c and c[0] == "useradd" for c in stubs["run"])


def test_terminal_env_carries_browser_open_token(mgr, home):
    # New terminals export a long-lived per-user token + manager port so the
    # xdg-open/$BROWSER shim can open a browser in that user's vibetop Browser.
    envs = mgr._user_terminal_setenvs("alice")
    d = dict(e.split("=", 1) for e in envs)
    assert "VIBETOP_SESSION" in d and "VIBETOP_MGR_PORT" in d
    assert mgr._verify_session(d["VIBETOP_SESSION"]) == "alice"   # valid session for alice
