"""Idle reaper + idle-policy storage + user-list helpers (Config app back-end).

The reaper runs off the request path (a background thread), so these exercise the
module-level functions directly with per-user tmp homes (the `users` fixture) and
the stubbed subprocess boundary (`stubs`). IDLE_POLICY_FILE is redirected into the
tmp HOME by the `home` fixture, so nothing touches /var/lib/vibetop.
"""
import json
import types


def _write_state(home, instances):
    p = home / ".local/share/desktop-state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"instances": instances, "reset_epoch": 0}))
    return p


# --- idle policy storage -----------------------------------------------------

def test_idle_policy_defaults_when_absent(mgr, home):
    assert mgr._read_idle_policy() == {"enabled": False, "minutes": 30,
                                       "reapTerminals": False}


def test_idle_policy_roundtrip(mgr, home):
    mgr._write_idle_policy(True, 15, True)
    assert mgr._read_idle_policy() == {"enabled": True, "minutes": 15,
                                       "reapTerminals": True}


def test_idle_policy_clamps_and_tolerates_junk(mgr, home):
    mgr._write_idle_policy(True, 99999, False)
    assert mgr._read_idle_policy()["minutes"] == mgr.IDLE_MAX_MINUTES
    mgr._write_idle_policy(True, 0, False)
    assert mgr._read_idle_policy()["minutes"] == mgr.IDLE_MIN_MINUTES
    with open(mgr.IDLE_POLICY_FILE, "w") as f:
        f.write("{not json")
    assert mgr._read_idle_policy() == {"enabled": False, "minutes": 30,
                                       "reapTerminals": False}


# --- heartbeat read (target home, not ctx home) ------------------------------

def test_user_last_heartbeat_reads_target_home(mgr, home, users):
    _write_state(users["alice"][0], {"i1": {"ts": 123.5}, "i2": {"ts": 456.0}})
    assert mgr._user_last_heartbeat("alice") == 456.0
    assert mgr._user_last_heartbeat("bob") is None      # no state


# --- reaper pass -------------------------------------------------------------

def test_reaper_noop_when_disabled(mgr, home, users, stubs):
    mgr._user_slot("alice")
    _write_state(users["alice"][0], {"i1": {"ts": 0}})
    mgr._write_idle_policy(False, 5, False)
    assert mgr._reap_idle_users(now=10_000) == []
    assert not any(isinstance(c, list) and "stop" in c for c in stubs["run"])


def test_reaper_skips_live_user(mgr, home, users, stubs):
    mgr._user_slot("alice")
    now = 1_000_000
    _write_state(users["alice"][0], {"i1": {"ts": now}})
    mgr._write_idle_policy(True, 5, False)
    assert mgr._reap_idle_users(now=now + 60) == []      # 60s < 5min


def test_reaper_reaps_idle_user_nondestructive(mgr, home, users, stubs):
    mgr._user_slot("alice")
    p = _write_state(users["alice"][0], {"i1": {"ts": 1000}})
    note = users["alice"][0] / ".local/share/desktop-notes" / "1.md"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text("keep me")
    mgr._write_idle_policy(True, 5, False)
    reaped = mgr._reap_idle_users(now=1000 + 6 * 60)     # idle 6min > 5min
    assert reaped == ["alice"]
    assert p.exists()                                    # non-destructive: layout survives
    assert json.loads(p.read_text())["instances"]        # state untouched
    assert note.read_text() == "keep me"                 # notes/office untouched too
    stops = [" ".join(c) for c in stubs["run"]
             if isinstance(c, list) and "stop" in c]
    # RAM hogs stopped: FileBrowser + both xpra displays. Terminals NOT (flag off).
    assert any("vibetop-ufiles-alice" in s for s in stops)
    assert any("vibetop-ubrowser-alice" in s for s in stops)
    assert any("vibetop-ux11-alice" in s for s in stops)
    assert not any("uttyd-alice" in s or "uterm-alice" in s for s in stops)


def test_reap_user_terminal_flag(mgr, home, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [1])
    mgr._reap_user("alice", reap_terminals=False)
    r1 = [" ".join(c) for c in stubs["run"] if isinstance(c, list)]
    assert not any("uttyd-alice-1" in s or "uterm-alice-1" in s for s in r1)
    stubs["run"].clear()
    mgr._reap_user("alice", reap_terminals=True)
    r2 = [" ".join(c) for c in stubs["run"] if isinstance(c, list)]
    assert any("uttyd-alice-1" in s or "uterm-alice-1" in s for s in r2)


# --- user listing filter -----------------------------------------------------

def test_list_real_users_filters_system_accounts(mgr, home, monkeypatch):
    fake = [
        types.SimpleNamespace(pw_name="root", pw_uid=0, pw_gid=0,
                              pw_shell="/bin/bash", pw_gecos="root", pw_dir="/root"),
        types.SimpleNamespace(pw_name="daemon", pw_uid=1, pw_gid=1,
                              pw_shell="/usr/sbin/nologin", pw_gecos="", pw_dir="/"),
        types.SimpleNamespace(pw_name="svc", pw_uid=1500, pw_gid=1500,
                              pw_shell="/usr/sbin/nologin", pw_gecos="", pw_dir="/x"),
        types.SimpleNamespace(pw_name="alice", pw_uid=1001, pw_gid=1001,
                              pw_shell="/bin/bash", pw_gecos="Alice,,,", pw_dir="/home/alice"),
        types.SimpleNamespace(pw_name="nobody", pw_uid=65534, pw_gid=65534,
                              pw_shell="/usr/sbin/nologin", pw_gecos="", pw_dir="/"),
    ]
    monkeypatch.setattr(mgr.pwd, "getpwall", lambda: fake)
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: False)
    monkeypatch.setattr(mgr, "_online_users", lambda: set())
    out = mgr._list_real_users()
    assert [u["user"] for u in out] == ["alice"]         # only the real login user
    assert out[0]["name"] == "Alice"
