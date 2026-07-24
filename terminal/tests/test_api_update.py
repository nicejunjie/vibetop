"""Endpoint contracts for the self-update flow: GET /api/update (version + host
history), POST /api/update across all git branches (up-to-date, clean fast-
forward, rsync-redundant reset, genuine-dirty blocked, force-stash), and
POST /api/update/history/clear. git is replaced with a scriptable fake; deploy
subprocesses are stubbed."""
import json


class GitFake:
    """Stand-in for the module-level _git(args, timeout). Scriptable via
    attributes; records every call for assertions."""
    def __init__(self):
        self.head = "aaaaaaa"
        self.remote = "bbbbbbb"
        self.fetch_ok = True
        self.dirty = ""                 # `git status --porcelain` output
        self.matches_upstream = True    # `git diff --quiet origin/main` result
        self.changed = ["landing/desktop.html"]
        self.calls = []

    def __call__(self, args, timeout=60):
        a = list(args)
        self.calls.append(a)
        cmd = a[0]
        if cmd == "rev-parse":
            return True, (self.remote if "origin" in a[1] else self.head)
        if cmd == "fetch":
            return self.fetch_ok, ("" if self.fetch_ok else "network unreachable")
        if cmd == "status":
            return True, self.dirty
        if cmd == "diff" and "--quiet" in a:
            return self.matches_upstream, ""
        if cmd == "diff" and "--name-only" in a:
            return True, "\n".join(self.changed)
        if cmd in ("reset", "stash", "merge"):
            self.head = self.remote       # these advance HEAD to origin/main
            return True, ""
        if cmd == "log":
            fmt = next((x for x in a if x.startswith("--format")), "")
            if "%h\t" in fmt:             # version log -1
                return True, "abc1234\t2026-01-01\tSome subject"
            return True, "abc1234\x1fSome commit"
        return True, ""


def _step(steps, needle):
    return next((s for s in steps if needle in s["name"]), None)


def test_get_update_version_and_history(client, mgr, monkeypatch):
    monkeypatch.setattr(mgr, "_git", GitFake())
    status, body = client.get("/api/update")
    assert status == 200
    assert "version" in body                    # from the real repo VERSION file
    assert isinstance(body["history"], list)     # seeded per-host log


def test_update_already_up_to_date(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.remote = g.head                            # nothing to pull
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert body["changed"] == []
    assert "up to date" in body["message"].lower()


def test_update_clean_fast_forward(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.changed = ["landing/desktop.html"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert body["changed"] == ["landing/desktop.html"]
    assert body["restart"] is False              # no terminal/*.py changed
    assert _step(body["log"], "git pull")["ok"] is True


def test_update_restart_when_manager_module_changes(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.changed = ["terminal/system_status.py"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert body["restart"] is True               # a sibling .py under terminal/
    # A transient systemd-run restart is scheduled out-of-band — the response
    # flushes first (so the restart survives the manager's own death), then a
    # separate server thread records the popen. Poll rather than racing the
    # assert (real time.sleep: the stubs fixture only patches the manager's).
    import time
    for _ in range(300):
        if any("systemd-run" in c for c in stubs["popen"]):
            break
        time.sleep(0.01)
    assert any("systemd-run" in c for c in stubs["popen"])


def test_update_rsync_redundant_tree_is_reset(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.dirty = " M landing/x.html"                # dirty, but...
    g.matches_upstream = True                    # ...content already == origin/main
    g.changed = ["landing/desktop.html"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert _step(body["log"], "reset working tree") is not None


def test_update_genuine_dirty_is_blocked(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.dirty = " M terminal/terminal-manager.py"
    g.matches_upstream = False                   # real local edits, not upstream
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)   # force omitted
    assert status == 200 and body["ok"] is False
    assert body["blocked"] == "dirty"
    assert "terminal-manager.py" in body["dirty"]


def test_update_force_stashes_then_updates(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.dirty = " M terminal/terminal-manager.py"
    g.matches_upstream = False
    g.changed = ["landing/desktop.html"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {"force": True}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert _step(body["log"], "stash local changes") is not None
    assert any(c[0] == "stash" for c in g.calls)


def test_update_fetch_failure_reports_cleanly(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.fetch_ok = False
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is False
    assert "fetch" in body["message"].lower()


def test_update_check_reports_behind(client, mgr, monkeypatch, op_cookie):
    g = GitFake()                                # head != remote, log -> 1 commit
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update/check", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert body["behind"] == 1
    assert body["commits"][0]["subject"] == "Some commit"


def test_history_clear(client, mgr, monkeypatch, op_cookie):
    monkeypatch.setattr(mgr, "_git", GitFake())
    # Seed a history entry, then clear it.
    mgr._append_update_history({"time": 1, "event": "updated"})
    status, body = client.post("/api/update/history/clear", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    with open(mgr.UPDATE_HISTORY_FILE) as f:
        assert json.load(f) == []
