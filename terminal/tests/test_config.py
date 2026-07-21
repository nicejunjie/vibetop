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
    assert mgr._read_idle_policy() == {"enabled": False, "hours": 2,
                                       "reapTerminals": False}


def test_idle_policy_roundtrip(mgr, home):
    mgr._write_idle_policy(True, 12, True)
    assert mgr._read_idle_policy() == {"enabled": True, "hours": 12,
                                       "reapTerminals": True}


def test_idle_policy_clamps_and_tolerates_junk(mgr, home):
    mgr._write_idle_policy(True, 99999, False)
    assert mgr._read_idle_policy()["hours"] == mgr.IDLE_MAX_HOURS
    mgr._write_idle_policy(True, 0, False)
    assert mgr._read_idle_policy()["hours"] == mgr.IDLE_MIN_HOURS
    with open(mgr.IDLE_POLICY_FILE, "w") as f:
        f.write("{not json")
    assert mgr._read_idle_policy() == {"enabled": False, "hours": 2,
                                       "reapTerminals": False}


# --- feature-hints kill-switch -----------------------------------------------

def test_hints_default_on_and_roundtrip(mgr, home):
    assert mgr._read_hints_enabled() is True          # historical default: hints on
    mgr._write_hints_enabled(False)
    assert mgr._read_hints_enabled() is False
    mgr._write_hints_enabled(True)
    assert mgr._read_hints_enabled() is True


def test_hints_defaults_on_when_corrupt(mgr, home):
    with open(mgr.HINTS_POLICY_FILE, "w") as f:
        f.write("{not json")
    assert mgr._read_hints_enabled() is True


def test_hints_endpoint_gated_and_roundtrips(client, mgr, users, stubs, monkeypatch):
    ck = users["alice"][1]
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: False)   # non-sudo -> 403 on both verbs
    assert client.get("/api/config/hints", cookie=ck)[0] == 403
    assert client.post("/api/config/hints", {"enabled": False}, cookie=ck)[0] == 403
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    assert client.get("/api/config/hints", cookie=ck)[1]["enabled"] is True   # default
    st, body = client.post("/api/config/hints", {"enabled": False}, cookie=ck)
    assert st == 200 and body["enabled"] is False and mgr._read_hints_enabled() is False
    assert client.get("/api/config/hints", cookie=ck)[1]["enabled"] is False


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
    assert mgr._reap_idle_users(now=now + 600) == []     # 10min < 5h


def test_reaper_reaps_idle_user_nondestructive(mgr, home, users, stubs):
    mgr._user_slot("alice")
    p = _write_state(users["alice"][0], {"i1": {"ts": 1000}})
    note = users["alice"][0] / ".local/share/desktop-notes" / "1.md"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text("keep me")
    mgr._write_idle_policy(True, 5, False)
    reaped = mgr._reap_idle_users(now=1000 + 6 * 3600)   # idle 6h > 5h
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
    out = mgr._list_real_users()
    assert [u["user"] for u in out] == ["alice"]         # only the real login user
    assert out[0]["name"] == "Alice"
    assert out[0]["online"] is False                     # no heartbeat written
    assert out[0]["lastActive"] is None                  # never signed in


def test_list_real_users_reports_last_active(mgr, home, users, monkeypatch):
    # alice has a desktop-state heartbeat; her lastActive reflects the newest ts.
    _write_state(users["alice"][0], {"i1": {"ts": 111.0}, "i2": {"ts": 222.0}})
    monkeypatch.setattr(mgr.pwd, "getpwall", lambda: [
        types.SimpleNamespace(pw_name="alice", pw_uid=1001, pw_gid=1001,
                              pw_shell="/bin/bash", pw_gecos="Alice,,,", pw_dir="/home/alice")])
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: False)
    out = mgr._list_real_users()
    assert out[0]["lastActive"] == 222.0


# --- resource caps -----------------------------------------------------------

def test_resource_policy_defaults_to_env(mgr, home):
    # No file -> mem/cpu uncapped (TasksMax is applied separately, not stored here).
    assert mgr._read_resource_policy() == {"memMax": mgr.USER_MEM_MAX, "cpuCores": ""}


def test_resource_policy_roundtrip_and_props(mgr, home):
    mgr._write_resource_policy("4G", "4")
    assert mgr._read_resource_policy() == {"memMax": "4G", "cpuCores": "4"}
    props = mgr._resource_props()
    assert "MemoryMax=4G" in props
    assert "CPUQuota=400%" in props                    # 4 cores -> 400%
    assert f"TasksMax={mgr.USER_TASKS_MAX}" in props   # fixed fork-bomb default, always applied


def test_resource_policy_rejects_bad_values_falls_back(mgr, home):
    with open(mgr.RESOURCE_POLICY_FILE, "w") as f:
        f.write('{"memMax": "4G; rm -rf /", "cpuCores": "lots"}')
    pol = mgr._read_resource_policy()
    assert pol["memMax"] == mgr.USER_MEM_MAX           # invalid -> env default
    assert pol["cpuCores"] == ""                       # invalid -> uncapped


def test_resource_policy_migrates_legacy_cpuquota(mgr, home):
    with open(mgr.RESOURCE_POLICY_FILE, "w") as f:
        f.write('{"cpuQuota": "400%"}')                # legacy percentage schema
    assert mgr._read_resource_policy()["cpuCores"] == "4"


def test_resources_endpoint_validates(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    ck = users["alice"][1]
    assert client.post("/api/config/resources", {"memMax": "4G; rm", "cpuCores": ""}, cookie=ck)[0] == 400
    assert client.post("/api/config/resources", {"memMax": "", "cpuCores": "banana"}, cookie=ck)[0] == 400
    assert client.post("/api/config/resources", {"memMax": "", "cpuCores": "0"}, cookie=ck)[0] == 400
    st, _ = client.post("/api/config/resources", {"memMax": "4G", "cpuCores": "8"}, cookie=ck)
    assert st == 200 and mgr._read_resource_policy() == {"memMax": "4G", "cpuCores": "8"}
    assert "hostCores" in client.get("/api/config/resources", cookie=ck)[1]   # UI hint


# --- disk usage --------------------------------------------------------------

def test_disk_usage_shape(mgr, home, monkeypatch):
    import os as _os
    monkeypatch.setattr(mgr.pwd, "getpwall", lambda: [])   # no homes -> skip du
    fake = _os.statvfs_result if False else None
    class _St:
        f_frsize = 4096; f_blocks = 1000; f_bfree = 400; f_bavail = 300; f_fsid = 1
    monkeypatch.setattr(mgr.os, "statvfs", lambda m: _St())
    d = mgr._disk_usage()
    assert d["homes"] == []
    fs = d["filesystems"][0]
    assert fs["total"] == 4096 * 1000
    # used = blocks-bfree = 600; denom = used + bavail = 900 -> 67%
    assert fs["pct"] == 67


# --- service health ----------------------------------------------------------

def test_service_health_parses_status(mgr, home, monkeypatch):
    def fake_run(args, **kw):
        class R: pass
        r = R(); r.returncode = 0; r.stderr = ""
        if args[:2] == ["systemctl", "is-active"]:
            r.stdout = "active\n"
        elif args[0] == "docker":
            r.stdout = "true\n"
        else:
            r.stdout = ""
        return r
    monkeypatch.setattr(mgr.subprocess, "run", fake_run)
    out = mgr._service_health()
    names = {s["name"]: s["status"] for s in out}
    assert names["vibetop-manager"] == "active"
    assert names["vibetop-onlyoffice"] == "active"       # docker "true" -> active


def test_restart_service_allowlist(mgr, home, stubs):
    ok, err = mgr._restart_service("not-a-service")
    assert ok is False
    stubs["run"].clear()
    ok, err = mgr._restart_service("nginx")
    assert ok is True
    # deferred via a transient timer, never an inline `systemctl restart`
    assert any(isinstance(c, list) and "systemd-run" in c and "restart" in c for c in stubs["run"])


def test_resource_cap_rejects_zero_and_trailing_newline(mgr, home):
    # 0 caps brick new sessions; a trailing newline emits a malformed --property.
    assert not mgr._valid_cap("0", mgr._CORES_RE)
    assert not mgr._valid_cap("0G", mgr._MEM_RE)
    assert not mgr._valid_cap("4\n", mgr._CORES_RE)
    assert not mgr._valid_cap("4G\n", mgr._MEM_RE)
    assert mgr._valid_cap("8", mgr._CORES_RE)
    assert mgr._valid_cap("infinity", mgr._MEM_RE)
    assert mgr._valid_cap("", mgr._MEM_RE)               # blank = uncapped
    # A hand-edited file with a trailing-newline value falls back to the default.
    with open(mgr.RESOURCE_POLICY_FILE, "w") as f:
        f.write('{"cpuCores": "4\\n"}')
    assert mgr._read_resource_policy()["cpuCores"] == ""


def test_idle_policy_migrates_legacy_minutes(mgr, home):
    with open(mgr.IDLE_POLICY_FILE, "w") as f:
        f.write('{"enabled": true, "minutes": 90}')     # legacy schema
    pol = mgr._read_idle_policy()
    assert pol["enabled"] is True
    assert pol["hours"] == 2                             # ceil(90/60) = 2


def test_restart_service_surfaces_failure(mgr, home, monkeypatch):
    class _R:
        returncode = 1; stderr = "Job failed"; stdout = ""
    monkeypatch.setattr(mgr.subprocess, "run", lambda *a, **k: _R())
    ok, err = mgr._restart_service("nginx")
    assert ok is False and "Job failed" in err


def test_restart_endpoint_rejects_unknown_service(client, mgr, users, stubs, monkeypatch):
    monkeypatch.setattr(mgr, "_can_sudo", lambda u: True)
    ck = users["alice"][1]
    for bad in ("sshd", "", "vibetop-manager; reboot"):
        assert client.post("/api/config/services/restart", {"service": bad}, cookie=ck)[0] == 400
    assert not any(isinstance(c, list) and "systemd-run" in c for c in stubs["run"])
    # an allowlisted service is accepted (deferred restart, stubbed)
    assert client.post("/api/config/services/restart", {"service": "nginx"}, cookie=ck)[0] == 200


def test_browser_focus_signal_counter(mgr, home):
    # browser-open bumps a per-user counter; the SSE stream watches it to push an
    # "open-browser" event (switch the desktop to the Browser app).
    u = "alice"
    base = mgr._browser_focus_count(u)
    mgr._signal_browser_focus(u)
    assert mgr._browser_focus_count(u) == base + 1
    assert mgr._browser_focus_count("bob") == 0     # per-user, isolated
