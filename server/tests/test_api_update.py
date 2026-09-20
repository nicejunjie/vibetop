"""Endpoint contracts for the self-update flow: GET /api/update (version + host
history), POST /api/update across all git branches (up-to-date, clean fast-
forward, rsync-redundant reset, genuine-dirty blocked, force-stash), and
POST /api/update/history/clear. git is replaced with a scriptable fake; deploy
subprocesses are stubbed."""
import os
import re
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
        self.changed = ["shell/desktop.html"]
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
    g.changed = ["shell/desktop.html"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert body["changed"] == ["shell/desktop.html"]
    assert body["restart"] is False              # no terminal/*.py changed
    assert _step(body["log"], "git pull")["ok"] is True


def test_update_restart_when_manager_module_changes(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.changed = ["server/system_status.py"]
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
    g.dirty = " M apps/everyday/notes/notes.html"                # dirty, but...
    g.matches_upstream = True                    # ...content already == origin/main
    g.changed = ["shell/desktop.html"]
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    assert _step(body["log"], "reset working tree") is not None


def test_update_genuine_dirty_is_blocked(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.dirty = " M server/terminal-manager.py"
    g.matches_upstream = False                   # real local edits, not upstream
    monkeypatch.setattr(mgr, "_git", g)
    status, body = client.post("/api/update", {}, cookie=op_cookie)   # force omitted
    assert status == 200 and body["ok"] is False
    assert body["blocked"] == "dirty"
    assert "terminal-manager.py" in body["dirty"]


def test_update_force_stashes_then_updates(client, mgr, stubs, monkeypatch, op_cookie):
    g = GitFake()
    g.dirty = " M server/terminal-manager.py"
    g.matches_upstream = False
    g.changed = ["shell/desktop.html"]
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


def test_sw_build_date_lookup_survives_a_move():
    src = open(os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "terminal-manager.py")).read()
    assert '":(glob)**/sw.js"' in src, (
        "the sw.js build-date git lookup must use a glob pathspec — a literal path "
        "returns an empty date silently once sw.js moves")


# The redeploy triggers and the installer's own walk must not drift apart. When
# landing/ was split into shell/ + shared/ + apps/, `touched("landing/")` matched
# nothing any more: an Update would pull the code and never install it, serving a
# stale page with nothing reporting the miss. Derive both sides and compare.
def test_web_redeploy_trigger_covers_every_dir_the_installer_walks():
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    installer = open(os.path.join(repo, "shell", "install.sh")).read()
    # shell/install.sh walks: find "$DIR" "$REPO/shared" "$REPO/apps" ...
    walked = set()
    m = re.search(r'\$\(find ([^\n]*(?:\\\n[^\n]*)*)', installer)
    assert m, "could not find the installer's walk"
    for tok in re.findall(r'"\$(?:DIR|REPO/)([A-Za-z_]*)"', m.group(1)):
        walked.add((tok or "shell") + "/")

    manager = open(os.path.join(repo, "server", "terminal-manager.py")).read()
    dirs = re.search(r'WEB_SOURCE_DIRS = \(([^)]*)\)', manager)
    assert dirs, "WEB_SOURCE_DIRS missing from the manager"
    triggered = set(re.findall(r'"([^"]+)"', dirs.group(1)))

    missing = walked - triggered
    assert not missing, (
        "shell/install.sh deploys from %r but the Update redeploy trigger only "
        "fires on %r — a change under %r would be pulled and never installed"
        % (sorted(walked), sorted(triggered), sorted(missing)))


def test_update_refuses_to_restart_onto_code_that_does_not_compile(mgr, tmp_path, monkeypatch):
    """Nothing verified the pulled sources. If server/terminal-manager.py landed
    with a syntax error the out-of-band restart failed, Restart=on-failure
    retried, and StartLimitBurst gave up after ~10 attempts — at which point
    nginx's auth_request points at a dead manager, so EVERY protected surface
    500s (terminals included) and the operator cannot use the product to fix the
    product.

    Uses compile(), NOT ast.parse: `'continue' not properly in loop` is a
    COMPILE-time error that parses cleanly, and that exact class slipped past an
    ast.parse check in this project earlier the same day.
    """
    d = tmp_path / "server"
    d.mkdir()
    (d / "fine.py").write_text("x = 1\n")
    monkeypatch.setattr(mgr, "REPO_DIR", str(tmp_path))
    assert mgr._uncompilable_sources() == []

    (d / "broken.py").write_text("def f():\n    continue\n")      # parses, won't compile
    assert mgr._uncompilable_sources() == ["broken.py"], \
        "a compile-only error must be caught; ast.parse would accept this file"

    import ast
    ast.parse((d / "broken.py").read_text())      # proves the weaker gate passes it


def test_the_compile_gate_is_wired_into_the_restart_decision(mgr):
    """The check is worthless unless it actually suppresses the restart and
    surfaces as a failed deploy."""
    import inspect
    src = inspect.getsource(mgr.Handler._handle_update_locked)
    assert "_uncompilable_sources()" in src
    i_check = src.index("_uncompilable_sources()")
    i_ok = src.index("deploy_ok = not failed")
    assert i_check < i_ok, "the compile result must feed deploy_ok, not follow it"
    assert "restart = False" in src[i_check:i_ok], \
        "code that does not compile must not become the running manager"


def test_the_reload_push_is_held_back_during_an_update(mgr, monkeypatch):
    """The update runs shell/install.sh FIRST, which writes the new sw.js — and
    /api/events notices within ~2-7s and reloads every connected tab onto the new
    shell while nginx still has the old config, the manager is still the old
    process, and the remaining installers may not have run or may be about to
    FAIL. The admin who pressed the button gets ok:false; everyone else already
    reloaded onto a new shell talking to an old API, and nothing un-deploys a
    web root.
    """
    import inspect
    src = inspect.getsource(mgr.Handler._events_stream)
    assert "_update_quiet_until" in src, \
        "the reload push must be held back while an update is in flight"
    i_hold = src.index("_update_quiet_until")
    i_push = src.index("event: reload")
    assert i_hold < i_push, "the check must precede the push, not follow it"


def test_the_quiet_window_is_a_deadline_not_a_flag(mgr):
    """A boolean would be the more obvious design and a worse one: if the update
    dies mid-way — or the process is killed between setting and clearing it —
    every client would stop reloading for the life of the process, which is worse
    than the problem being solved. A deadline expires on its own, so the failure
    mode is 'reloads resume a little late'."""
    import time as _t
    assert isinstance(mgr._update_quiet_until, float)
    assert mgr._update_quiet_until <= _t.monotonic(), \
        "at rest the window must be closed"
    assert mgr.UPDATE_QUIET_MAX > 0

    src = __import__("inspect").getsource(mgr.Handler._handle_update)
    assert "finally:" in src and "_update_quiet_until = 0.0" in src, \
        "it must also be released explicitly, not left to the deadline"
    i_try, i_finally = src.index("try:"), src.index("finally:")
    i_lock = src.index("with _update_run_lock")
    assert i_try < i_lock < i_finally, \
        "the release must cover the locked body, so an exception inside it still frees clients"
