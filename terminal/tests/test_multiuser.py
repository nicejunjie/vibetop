"""Phase 2 — per-user state separation.

With two authenticated users (alice, bob), every stateful endpoint must resolve
under the *requesting* user's home, and one user must never see or touch another's
state. Uses the in-process client with a `_user_home` that maps each user to their
own tmp home, and per-user session cookies.
"""
import json
import os

import pytest


@pytest.fixture()
def users(mgr, home, monkeypatch, tmp_path):
    """Map alice/bob (and APP_USER) to distinct tmp homes; yield a dict of
    {name: (home_path, cookie)}. Depends on `client`'s `home` fixture having
    already set the session-secret sandbox."""
    homes = {}
    for name in ("alice", "bob"):
        h = tmp_path / name
        (h / ".local" / "share").mkdir(parents=True, exist_ok=True)
        (h / "Documents").mkdir(exist_ok=True)
        (h / "Uploads").mkdir(exist_ok=True)
        homes[name] = h
    default_home = tmp_path / "home"
    monkeypatch.setattr(mgr, "_user_home",
                        lambda u: str(homes.get(u, default_home)))
    return {name: (h, "vt_session=" + mgr._sign_session(name))
            for name, h in homes.items()}


# --- notes ------------------------------------------------------------------

def test_notes_separated_by_user(client, mgr, users):
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    assert client.post("/api/notes", {"id": "1", "content": "alice secret"},
                       cookie=alice_ck)[0] == 200
    assert client.post("/api/notes", {"id": "1", "content": "bob secret"},
                       cookie=bob_ck)[0] == 200
    # each reads only their own note body
    assert client.get("/api/notes?id=1", cookie=alice_ck)[1]["content"] == "alice secret"
    assert client.get("/api/notes?id=1", cookie=bob_ck)[1]["content"] == "bob secret"
    # and the files live in separate homes
    assert (alice_home / ".local/share/desktop-notes/1.md").read_text() == "alice secret"
    assert (bob_home / ".local/share/desktop-notes/1.md").read_text() == "bob secret"
    # alice's note file is NOT in bob's home
    assert not (bob_home / ".local/share/desktop-notes/1.md").read_text() == "alice secret"


# --- desktop registry -------------------------------------------------------

def test_desktop_state_separated_by_user(client, mgr, users):
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    client.post("/api/desktop",
                {"instance": "i1", "open": ["notes"], "active": "notes"},
                cookie=alice_ck)
    client.post("/api/desktop",
                {"instance": "i2", "open": ["files"], "active": "files"},
                cookie=bob_ck)
    assert (alice_home / ".local/share/desktop-state.json").exists()
    assert (bob_home / ".local/share/desktop-state.json").exists()
    a = json.loads((alice_home / ".local/share/desktop-state.json").read_text())
    b = json.loads((bob_home / ".local/share/desktop-state.json").read_text())
    assert "i1" in a["instances"] and "i2" not in a["instances"]
    assert "i2" in b["instances"] and "i1" not in b["instances"]


# --- uploads ----------------------------------------------------------------

def test_uploads_land_in_requesting_users_home(client, mgr, users):
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    boundary = "----vibe"
    def multipart(fname, content):
        return ("--%s\r\nContent-Disposition: form-data; name=\"file\"; "
                "filename=\"%s\"\r\nContent-Type: application/octet-stream\r\n\r\n%s"
                "\r\n--%s--\r\n" % (boundary, fname, content, boundary)).encode()
    hdr = {"Content-Type": "multipart/form-data; boundary=" + boundary}
    assert client.post("/api/upload", raw=multipart("a.txt", "alice-file"),
                       headers=hdr, cookie=alice_ck)[0] == 200
    assert client.post("/api/upload", raw=multipart("b.txt", "bob-file"),
                       headers=hdr, cookie=bob_ck)[0] == 200
    assert (alice_home / "Uploads" / "a.txt").read_text() == "alice-file"
    assert (bob_home / "Uploads" / "b.txt").read_text() == "bob-file"
    assert not (bob_home / "Uploads" / "a.txt").exists()
    # each user's upload listing shows only their own file
    a_list = client.get("/api/upload/list", cookie=alice_ck)[1]["files"]
    assert [f["name"] for f in a_list] == ["a.txt"]


# --- shares (global registry, per-owner fence + visibility) -----------------

def _make_file(home, rel, content="hello"):
    p = os.path.join(str(home), rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        f.write(content)
    return p


def test_share_owned_and_isolated(client, mgr, users):
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    _make_file(alice_home, "Documents/report.txt", "alice-doc")
    st, body = client.post("/api/share", {"path": "Documents/report.txt"},
                           cookie=alice_ck)
    assert st == 200
    token = body["token"]
    # alice sees her share; bob does not
    a_list = client.get("/api/share/list", cookie=alice_ck)[1]["shares"]
    b_list = client.get("/api/share/list", cookie=bob_ck)[1]["shares"]
    assert any(s["token"] == token for s in a_list)
    assert all(s["token"] != token for s in b_list)
    # the PUBLIC /s/<token> (no cookie) serves alice's file from alice's home
    st, _hdrs, data = client.get_raw("/s/" + token)
    assert st == 200 and data == b"alice-doc"
    # bob cannot revoke alice's share
    assert client.post("/api/share/revoke", {"token": token},
                       cookie=bob_ck)[1]["removed"] is False
    assert client.get_raw("/s/" + token)[0] == 200          # still live
    # alice can revoke her own
    assert client.post("/api/share/revoke", {"token": token},
                       cookie=alice_ck)[1]["removed"] is True
    assert client.get_raw("/s/" + token)[0] == 404


def test_share_cannot_target_another_users_home(client, mgr, users):
    # bob shares "Documents/report.txt": fenced to BOB's home, where it doesn't
    # exist (it's alice's) -> refused. Proves the fence is per-owner.
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    _make_file(alice_home, "Documents/report.txt", "alice-doc")
    st, body = client.post("/api/share", {"path": "Documents/report.txt"},
                           cookie=bob_ck)
    assert st == 400          # not shareable from bob's home


# --- per-user terminal port allocation + naming (Phase 3) -------------------

def test_user_slot_stable_and_distinct(mgr, monkeypatch, tmp_path):
    monkeypatch.setattr(mgr, "USERS_REGISTRY", str(tmp_path / "users.json"))
    a1 = mgr._user_slot("alice")
    a2 = mgr._user_slot("alice")        # stable
    b1 = mgr._user_slot("bob")
    assert a1 == a2
    assert a1 != b1                     # distinct users get distinct slots


def test_user_term_port_disjoint_ranges(mgr, monkeypatch, tmp_path):
    monkeypatch.setattr(mgr, "USERS_REGISTRY", str(tmp_path / "users.json"))
    monkeypatch.setattr(mgr, "USER_TERM_BASE", 17000)
    monkeypatch.setattr(mgr, "PER_USER_TERMS", 100)
    aports = {mgr._user_term_port("alice", n) for n in range(1, 51)}
    bports = {mgr._user_term_port("bob", n) for n in range(1, 51)}
    assert aports.isdisjoint(bports)    # no two users can collide on a port
    # and a user's port is deterministic in their own block
    assert mgr._user_term_port("alice", 1) + 4 == mgr._user_term_port("alice", 5)


def test_term_instance_and_unit_naming(mgr):
    assert mgr._term_instance("alice", 3) == "alice-3"
    s, t = mgr._term_units("alice", 3)
    assert s == "vibetop-uterm-alice-3.service"
    assert t == "vibetop-uttyd-alice-3.service"
    # a hostile username can't inject unit-name/systemd metacharacters
    s2, _ = mgr._term_units("a b/c;d", 1)
    assert s2 == "vibetop-uterm-a_b_c_d-1.service"


# --- admin-gated single-user subsystems (review fixes #3/#4/#5/#6) ----------

def test_non_admin_denied_admin_only_subsystems(client, mgr, users):
    # Subsystems that still act as APP_USER (Update, Claude, host-service scan) are
    # refused for a non-admin. (Browser/X11 are now PER-USER — see below.)
    (_, ck) = users["alice"]
    assert mgr.APP_USER != "alice"
    assert client.post("/api/update", {}, cookie=ck)[0] == 403
    assert client.post("/api/claude/usage", {"enabled": True}, cookie=ck)[0] == 403
    assert client.get("/api/claude/usage", cookie=ck)[0] == 403
    assert client.get("/api/services/discover", cookie=ck)[0] == 403


def test_browser_x11_are_per_user_not_admin_gated(client, mgr, users, monkeypatch):
    # Browser/X11 now run as the request user -> a non-admin is NOT 403'd.
    import types
    (_, ck) = users["alice"]
    monkeypatch.setattr(mgr, "_start_user_xpra", lambda u, k: (True, 24500))
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda u: types.SimpleNamespace(pw_uid=4321, pw_gid=4321,
                                                        pw_dir="/home/" + u))
    monkeypatch.setattr(
        mgr.subprocess, "Popen",
        lambda *a, **k: type("P", (), {"wait": lambda s, timeout=None: 0})())
    assert client.post("/api/browser/open", {"url": "http://x"}, cookie=ck)[0] == 200
    assert client.get("/api/x/windows", cookie=ck)[0] == 200   # 200 (empty), not 403


def test_system_status_process_list_scoped(mgr, monkeypatch):
    # The top-processes list is filtered to the requesting user (admin sees all).
    monkeypatch.setattr(mgr.system_status, "get_system_status",
                        lambda rt, c: {"cpu": {"pct": 5}, "processes": [
                            {"pid": 1, "user": "alice", "name": "a"},
                            {"pid": 2, "user": "bob", "name": "b"}]})

    class H:
        _get_running_terminals = lambda self: []
        _get_system_status = mgr.Handler._get_system_status
    h = H()
    try:
        mgr._req_ctx.user = mgr.APP_USER            # operator -> all
        assert len(h._get_system_status()["processes"]) == 2
        mgr._req_ctx.user = "alice"                 # non-admin -> own only
        assert [p["user"] for p in h._get_system_status()["processes"]] == ["alice"]
        mgr._req_ctx.user = "bob"
        assert [p["user"] for p in h._get_system_status()["processes"]] == ["bob"]
    finally:
        mgr._req_ctx.user = None


def test_fileview_authcheck_admin_only(client, mgr, users):
    # /fileview/ (raw file alias, APP_USER's tree) via authcheck: non-admin -> 403,
    # unauthenticated -> 401. (The nginx location gates on this.)
    (_, ck) = users["alice"]
    s_noauth, _, _ = client.get_full(
        "/api/authcheck", headers={"X-Original-URI": "/fileview/etc/passwd"})
    s_alice, _, _ = client.get_full(
        "/api/authcheck", cookie=ck,
        headers={"X-Original-URI": "/fileview/etc/passwd"})
    assert s_noauth == 401       # anonymous
    assert s_alice == 403        # authenticated non-admin


def test_non_admin_reset_is_per_user(client, mgr, users, monkeypatch):
    # A non-admin logout/reset now resets THEIR OWN terminals/desktop/browser/x11
    # (per-user) — it succeeds and never touches another user or the operator.
    (_, ck) = users["alice"]
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [])
    status, body = client.post("/api/reset", {}, cookie=ck)
    assert status == 200 and body.get("ok") is True


# --- per-user Files (Phase 3b) ----------------------------------------------

def test_files_port_and_unit_per_user(mgr, monkeypatch, tmp_path):
    monkeypatch.setattr(mgr, "USERS_REGISTRY", str(tmp_path / "u.json"))
    monkeypatch.setattr(mgr, "FB_APP_BASE", 18000)
    assert mgr._user_app_port("alice", mgr.FB_APP_BASE) != \
        mgr._user_app_port("bob", mgr.FB_APP_BASE)
    assert mgr._fb_unit("alice") == "vibetop-ufiles-alice.service"
    assert mgr._fb_unit("a b;c") == "vibetop-ufiles-a_b_c.service"


def test_authcheck_files_returns_per_user_app_port(client, mgr, users, monkeypatch):
    # /files/ authcheck cold-starts the user's FileBrowser and returns its port.
    monkeypatch.setattr(mgr, "_start_user_filebrowser",
                        lambda u: (True, 18000 + (1 if u == "bob" else 0)))
    (_, a_ck) = users["alice"]
    (_, b_ck) = users["bob"]
    _s, ah, _ = client.get_full("/api/authcheck", cookie=a_ck,
                                headers={"X-Original-URI": "/files/"})
    _s, bh, _ = client.get_full("/api/authcheck", cookie=b_ck,
                                headers={"X-Original-URI": "/files/"})
    assert ah.get("X-App-Port") == "18000"
    assert bh.get("X-App-Port") == "18001"      # different port per user


# --- office (doc endpoint binds the owner into the HMAC) ---------------------

def test_office_doc_bound_to_owner(client, mgr, users):
    (alice_home, alice_ck) = users["alice"]
    (bob_home, bob_ck) = users["bob"]
    # secret is global; write it where the manager reads it.
    os.makedirs(os.path.dirname(mgr.ONLYOFFICE_SECRET_FILE), exist_ok=True)
    with open(mgr.ONLYOFFICE_SECRET_FILE, "w") as f:
        f.write("secret-xyz")
    _make_file(alice_home, "Documents/a.docx", "PKalice")
    secret = "secret-xyz"
    rel = "Documents/a.docx"
    good = mgr._onlyoffice_sig(secret, "alice", rel)
    # alice's token serves alice's file
    st, _h, data = client.get_raw("/api/office/doc?path=%s&u=alice&t=%s" % (rel, good))
    assert st == 200 and data == b"PKalice"
    # the same token replayed with u=bob is refused (HMAC binds the user)
    assert client.get_raw("/api/office/doc?path=%s&u=bob&t=%s" % (rel, good))[0] == 403
