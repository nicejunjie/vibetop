"""Per-user apps must land the user in their own HOME, not the filesystem root.

Two regressions this pins (both surfaced live as "the app opens in /"):
  * a `systemd-run --uid` transient unit defaults WorkingDirectory=/, so a login
    shell started that way lands in / — fixed by _workdir_props pinning ~.
  * the per-user FileBrowser was rooted at the user's home, which displayed home
    AS "/" (indistinguishable from the terminal bug); it's now rooted at / (whole
    filesystem, as the user) and the app OPENS at ~ via /api/me.

These assert on the constructed launch argv / endpoint output (no systemd needed).
"""
import pwd

import pytest


def _pw(name, home, uid=4001, gid=4001):
    return pwd.struct_passwd((name, "x", uid, gid, "", str(home), "/bin/bash"))


# -- _workdir_props: pin the shell's CWD to the user's home -----------------

def test_workdir_props_pins_home(mgr, tmp_path):
    assert mgr._workdir_props(_pw("u", tmp_path)) == \
        ["--property", f"WorkingDirectory={tmp_path}"]


def test_workdir_props_absent_when_home_missing(mgr, tmp_path):
    # A homeless account still gets a session (systemd's default /), not a crash.
    assert mgr._workdir_props(_pw("u", tmp_path / "nope")) == []


# -- terminal: the session daemon's unit carries WorkingDirectory=home ------

def test_user_terminal_lands_in_home(mgr, monkeypatch, tmp_path, stubs):
    home = tmp_path / "alice"
    home.mkdir()
    monkeypatch.setattr(mgr, "_user_home", lambda u: str(home))
    monkeypatch.setattr(mgr, "USERS_REGISTRY", str(tmp_path / "u.json"))
    monkeypatch.setattr(mgr, "_provision_user", lambda u: None)
    monkeypatch.setattr(mgr.pwd, "getpwnam", lambda u: _pw(u, home))

    ok, port = mgr._start_user_terminal("alice", 3)
    assert ok, port
    sess = [a for a in stubs["run"] if isinstance(a, list) and "systemd-run" in a
            and any("vibetop-session" in str(x) for x in a)]
    assert sess, "no session systemd-run recorded"
    assert f"WorkingDirectory={home}" in sess[0]


# -- Files: FileBrowser rooted at / (whole FS as the user), scope / ---------

def test_filebrowser_provisioned_at_root(mgr, monkeypatch, tmp_path, stubs):
    home = tmp_path / "bob"
    (home / ".config").mkdir(parents=True)
    monkeypatch.setattr(mgr, "_chown_app", lambda *a, **k: None)

    mgr._provision_user_filebrowser("bob", str(home), 18001)

    cfg = [a for a in stubs["run"] if isinstance(a, list)
           and "config" in a and "set" in a]
    assert cfg, "no filebrowser `config set` recorded"
    argv = cfg[0]
    assert "--root" in argv and argv[argv.index("--root") + 1] == "/"
    scope = [a for a in stubs["run"] if isinstance(a, list)
             and "users" in a and "update" in a]
    assert scope and "--scope" in scope[0] and \
        scope[0][scope[0].index("--scope") + 1] == "/"


# -- /api/me: the anchor front-ends use to open at the real home ------------

def test_api_me_returns_request_user_and_home(client, mgr, users):
    a_home, a_ck = users["alice"]
    st, _h, body = client.get_full("/api/me", cookie=a_ck)
    assert st == 200
    assert body["user"] == "alice"
    assert body["home"] == str(a_home)

    b_home, b_ck = users["bob"]
    st, _h, body = client.get_full("/api/me", cookie=b_ck)
    assert st == 200 and body["user"] == "bob" and body["home"] == str(b_home)
