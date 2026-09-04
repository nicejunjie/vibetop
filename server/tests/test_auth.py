from conftest import ANON
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


# --- _session_secret: the HMAC key backing every cookie ---------------------
# This is the root of the whole auth model. Its documented footgun: when the
# secret file can't be read/written it silently falls back to an EPHEMERAL
# in-memory key — correct behaviour, but it means a non-root mint signs with the
# wrong key (why smoke-test.sh validates against /api/authcheck). These pin the
# persist / read / cache / race / ephemeral paths.

def test_session_secret_generates_and_persists_0600(mgr, home, monkeypatch):
    import os
    monkeypatch.setattr(mgr, "_session_secret_cache", None)
    sec = mgr._session_secret()
    assert isinstance(sec, str) and len(sec) == 64          # token_hex(32)
    # Persisted to the configured path, contents match, owner-only perms.
    with open(mgr.SESSION_SECRET_FILE) as f:
        assert f.read().strip() == sec
    assert os.stat(mgr.SESSION_SECRET_FILE).st_mode & 0o077 == 0   # no group/other bits


def test_session_secret_reads_existing_file(mgr, home, monkeypatch):
    import os
    os.makedirs(os.path.dirname(mgr.SESSION_SECRET_FILE), exist_ok=True)
    with open(mgr.SESSION_SECRET_FILE, "w") as f:
        f.write("deadbeef-existing-secret\n")               # pre-existing key
    monkeypatch.setattr(mgr, "_session_secret_cache", None)
    assert mgr._session_secret() == "deadbeef-existing-secret"


def test_session_secret_is_cached_after_first_read(mgr, home, monkeypatch):
    import os
    monkeypatch.setattr(mgr, "_session_secret_cache", None)
    first = mgr._session_secret()
    # Change the file underneath; a cached read must NOT pick up the change
    # (else concurrent requests could sign with different keys).
    with open(mgr.SESSION_SECRET_FILE, "w") as f:
        f.write("a-different-secret")
    assert mgr._session_secret() == first


def test_session_secret_race_reads_winner(mgr, home, monkeypatch):
    # Simulate the O_EXCL race: our create loses because another process created
    # the file first (and wrote its own secret). We must adopt the winner's value,
    # not our just-generated one — otherwise two managers sign with rival keys.
    import os
    monkeypatch.setattr(mgr, "_session_secret_cache", None)
    real_open = mgr.os.open

    def racing_open(path, flags, mode=0o777):
        with open(path, "w") as f:
            f.write("winner-secret\n")                       # the racer's write
        raise FileExistsError(path)                          # our O_EXCL now fails
    monkeypatch.setattr(mgr.os, "open", racing_open)
    try:
        assert mgr._session_secret() == "winner-secret"
    finally:
        monkeypatch.setattr(mgr.os, "open", real_open)


def test_session_secret_race_reread_fails_uses_own_key(mgr, home, monkeypatch):
    # O_EXCL reports the file exists, but the re-read then fails too (gone/
    # unreadable). We must not crash — fall back to our just-generated key.
    monkeypatch.setattr(mgr, "_session_secret_cache", None)

    def exists_but_unreadable(path, flags, mode=0o777):
        raise FileExistsError(path)                          # exists, but we wrote nothing
    monkeypatch.setattr(mgr.os, "open", exists_but_unreadable)
    sec = mgr._session_secret()
    assert isinstance(sec, str) and len(sec) == 64           # own generated key, no crash


def test_session_secret_ephemeral_when_unpersistable(mgr, home, monkeypatch):
    # Unwritable, unreadable target → an in-memory key, no crash. A signed token
    # still round-trips within the process (the key is just lost on restart).
    monkeypatch.setattr(mgr, "SESSION_SECRET_FILE", "/proc/vibetop-nonexistent/session.secret")
    monkeypatch.setattr(mgr, "_session_secret_cache", None)
    sec = mgr._session_secret()
    assert isinstance(sec, str) and len(sec) == 64
    assert mgr._verify_session(mgr._sign_session("alice")) == "alice"   # usable in-process


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


def test_a_wrong_guess_never_locks_the_real_user_out(mgr, client, monkeypatch):
    """This test used to ASSERT the weakness: that after N wrong guesses the
    correct password was refused with 429. That made every account a denial-of-
    login target for anyone who knew its name — a LAN peer or any authorized
    tunnel user. Guessing must slow an account down, never close it."""
    monkeypatch.setattr(mgr, "LOGIN_MAX_FAILS", 3)
    monkeypatch.setattr(mgr, "LOGIN_MAX_DELAY", 0.0)      # keep the test quick
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: False)
    for _ in range(6):
        assert client.post("/api/login", {"username": "alice", "password": "x"})[0] == 401
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    assert client.post("/api/login", {"username": "alice", "password": "pw"})[0] == 200


def test_repeated_failures_do_slow_the_account_down(mgr, monkeypatch):
    """The brake is still real — the delay grows with recent failures and
    saturates, so an online guessing run is throttled without ever refusing."""
    monkeypatch.setattr(mgr, "LOGIN_MAX_FAILS", 3)
    now = 1_000_000.0
    first = mgr._login_delay("alice", now)
    for _ in range(8):
        mgr._login_record_fail("alice", "1.2.3.4", now)
    later = mgr._login_delay("alice", now)
    assert later > first
    assert later <= mgr.LOGIN_MAX_DELAY


def test_the_refusal_is_per_source_not_per_account(mgr, client, monkeypatch):
    """A source that has failed enough times IS refused — that is the counter an
    attacker cannot pin on somebody else."""
    monkeypatch.setattr(mgr, "LOGIN_SRC_MAX_FAILS", 3)
    monkeypatch.setattr(mgr, "LOGIN_MAX_DELAY", 0.0)
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: False)
    for _ in range(3):
        assert client.post("/api/login", {"username": "alice", "password": "x"})[0] == 401
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    # same source, ANY username, now refused
    assert client.post("/api/login", {"username": "bob", "password": "pw"})[0] == 429


def test_a_successful_login_clears_both_counters(mgr, client, monkeypatch):
    monkeypatch.setattr(mgr, "LOGIN_SRC_MAX_FAILS", 5)
    monkeypatch.setattr(mgr, "LOGIN_MAX_DELAY", 0.0)
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: False)
    for _ in range(3):
        client.post("/api/login", {"username": "alice", "password": "x"})
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    assert client.post("/api/login", {"username": "alice", "password": "pw"})[0] == 200
    assert "alice" not in mgr._login_fails
    assert not mgr._login_src_fails


def test_a_username_spray_cannot_grow_the_tracking_maps(mgr, monkeypatch):
    """The old map inserted an entry for every SUBMITTED string, before the name
    was validated, and its 10 000 "bound" only evicted *expired* entries — during
    a sustained spray nothing is expired, so it grew without limit and every
    request past the threshold rescanned all of it. Both books are hard-capped
    LRU now."""
    monkeypatch.setattr(mgr, "LOGIN_TRACK_MAX", 64)
    now = 2_000_000.0
    for i in range(5000):
        mgr._login_record_fail("user%d" % i, "1.2.3.4", now)
    assert len(mgr._login_fails) <= 64
    assert len(mgr._login_src_fails) == 1          # one source, however many names


def test_a_malformed_username_never_reaches_the_account_book(mgr, client, monkeypatch):
    """An arbitrary-length arbitrary-content string is not a login name; it must
    be rejected on shape, before anything is stored under it."""
    monkeypatch.setattr(mgr, "_authenticate", lambda u, p: True)
    junk = "A" * 4000 + "\x00;DROP"
    assert client.post("/api/login", {"username": junk, "password": "pw"})[0] == 401
    assert junk not in mgr._login_fails
    assert not mgr._login_fails, "no account entry may be created for a junk name"


# --- /api/authcheck (nginx auth_request target) -----------------------------

def test_authcheck_no_cookie_401(mgr, client):
    assert client.get("/api/authcheck", cookie=ANON)[0] == 401


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
        "/api/authcheck", headers={"X-Original-URI": "/api/notes"}, cookie=ANON)
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
    assert client.post("/api/logout/all", cookie=ANON)[0] == 401


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


def test_me_reports_whether_the_request_came_through_cloudflare_access(client, users):
    """The shell's Logout button ends the Access session too — but only when there
    IS one. On the LAN nothing sits in front of nginx, so /cdn-cgi/access/logout is
    a static dead end and the button must keep going to the login form instead."""
    ck = users["alice"][1]
    # LAN: no Access headers.
    assert client.get("/api/me", cookie=ck)[1]["via_access"] is False
    # Through the tunnel: Access injects its JWT on every request it forwards.
    for h in ({"Cf-Access-Jwt-Assertion": "eyJhbGciOiJSUzI1NiJ9.x.y"},
              {"Cf-Access-Authenticated-User-Email": "someone@example.com"}):
        _st, _hd, body = client.get_full("/api/me", cookie=ck, headers=h)
        assert body["via_access"] is True, h


def test_cf_access_header_is_presentation_only_and_grants_nothing(client, mgr, users,
                                                                  monkeypatch):
    """The header is trivially spoofable from the LAN, so it must not be a way in.
    Forging it buys you a different logout landing page and nothing else."""
    spoof = {"Cf-Access-Jwt-Assertion": "forged",
             "Cf-Access-Authenticated-User-Email": "root@example.com"}
    # The identity still comes from the session, never from the header: cookieless
    # here is the trusted-loopback path, which resolves to APP_USER — NOT to the
    # address the forged header claims. (Remote cookieless requests never reach the
    # manager at all; nginx's auth_request rejects them first.)
    _st, _hd, body = client.get_full("/api/me", headers=spoof)
    assert body["user"] == mgr.APP_USER
    # And it cannot promote a non-sudo user.
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: False)
    _st, _hd, body = client.get_full("/api/me", cookie=users["bob"][1], headers=spoof)
    assert body["user"] == "bob" and body["can_sudo"] is False


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


def test_user_remove_revokes_live_session(client, mgr, users, stubs, monkeypatch):
    # Removing a user must invalidate their still-open web session. Regression:
    # the epoch bump was erased by dropping the whole registry entry (epoch read
    # back as 0), so the removed user's cookie stayed valid until expiry.
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: _fake_pw(u, uid=1006))
    monkeypatch.setattr(mgr, "_is_real_login_user", lambda pw: True)
    bob_token = users["bob"][1].split("=", 1)[1]         # minted before removal
    assert mgr._verify_session(bob_token) == "bob"       # valid now
    st, _ = client.post("/api/config/users/remove",
                        {"username": "bob"}, cookie=users["alice"][1])
    assert st == 200
    assert mgr._verify_session(bob_token) is None         # revoked after removal
    # And a re-created "bob" (fresh account, epoch would reset to 0) still can't be
    # accessed with the old cookie — the tombstone kept the bumped epoch.
    assert mgr._verify_session(bob_token) is None


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


def _stub_pwd(mgr, monkeypatch, uid=4321, gid=4321):
    import types
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: types.SimpleNamespace(pw_uid=uid, pw_gid=gid, pw_name=u))


def test_terminal_env_uses_private_dbus_bus_when_available(mgr, monkeypatch):
    # GUI apps from the terminal must sit on the private activation-free bus so
    # GNOME/GTK apps don't hang ~40s on the portal/a11y timeout. When the private
    # bus is up, the terminal env points D-Bus at it (not the real /run/user/N/bus).
    _stub_pwd(mgr, monkeypatch, uid=4321)
    monkeypatch.setattr(mgr, "_ensure_user_x11_dbus",
                        lambda u, i, g: f"/run/user/{i}/vibetop-x11-bus")
    d = dict(e.split("=", 1) for e in mgr._user_terminal_setenvs("alice"))
    assert d.get("DBUS_SESSION_BUS_ADDRESS") == "unix:path=/run/user/4321/vibetop-x11-bus", \
        "terminal must point D-Bus at the private activation-free bus"


def test_terminal_env_falls_back_to_real_bus_if_private_unavailable(mgr, monkeypatch):
    # If the private bus can't start, fall back to the real user bus (no worse than
    # before) rather than pointing at a dead socket.
    _stub_pwd(mgr, monkeypatch, uid=4321)
    monkeypatch.setattr(mgr, "_ensure_user_x11_dbus", lambda u, i, g: None)
    d = dict(e.split("=", 1) for e in mgr._user_terminal_setenvs("alice"))
    assert d.get("DBUS_SESSION_BUS_ADDRESS") == "unix:path=/run/user/4321/bus", \
        "must fall back to the real user bus when the private bus is unavailable"
