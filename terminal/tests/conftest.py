"""Shared fixtures for the terminal-manager unit tests.

`terminal-manager.py` has a hyphen, so it can't be `import`ed by name. Load it
once from its file path and expose it as the `mgr` fixture. Importing it is
side-effect-free: the HTTP server only starts under `if __name__ == "__main__"`,
and module-level code just computes constants (no files written, no sockets).
"""
import importlib.util
import os
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_TERMINAL_DIR = os.path.dirname(_HERE)
_MANAGER = os.path.join(_TERMINAL_DIR, "terminal-manager.py")

# terminal-manager.py does `import system_status` (a sibling). At runtime the
# script's own dir is sys.path[0]; mirror that here so both the manager load and
# a direct `import system_status` resolve.
if _TERMINAL_DIR not in sys.path:
    sys.path.insert(0, _TERMINAL_DIR)


def _load():
    spec = importlib.util.spec_from_file_location("terminal_manager", _MANAGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def mgr():
    return _load()


@pytest.fixture(scope="session")
def status():
    import system_status
    return system_status


@pytest.fixture(scope="session")
def csession():
    """The `vibetop-session` daemon module. It has no `.py` extension, so an
    explicit SourceFileLoader is needed (spec_from_file_location can't infer one).
    Its `if __name__ == '__main__'` guard means import only defines functions/
    classes — no daemon/socket side effects."""
    import importlib.machinery
    path = os.path.join(_TERMINAL_DIR, "vibetop-session")
    loader = importlib.machinery.SourceFileLoader("claude_session", path)
    spec = importlib.util.spec_from_loader("claude_session", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Hermetic in-process HTTP harness (Tier 1 endpoint contract tests)
#
# Boots the manager's real ThreadingHTTPServer on an ephemeral loopback port and
# drives it over HTTP, but with every APP_USER-derived state path redirected into
# a throwaway tmp HOME and the external-process boundary (systemctl/su/git/wmctrl/
# libreoffice/system-status) stubbed. So the endpoint tests exercise the actual
# request parsing, CSRF gate, JSON contracts, and on-disk side effects — without
# root, systemd, nginx, or touching the real ~. Nothing here is deployed; these
# fixtures live only under tests/ (installers copy an explicit file allowlist to
# ~/vibetop-www and never touch tests/).
# ---------------------------------------------------------------------------
import http.server
import json as _json
import threading
import urllib.error
import urllib.request

# State-path module globals to redirect. Handlers read them at call time, so a
# per-test monkeypatch of the module attribute is enough (no reload needed).
# Global (non-per-user) module constants to redirect into the tmp HOME. The
# per-user state paths (notes, desktop, files-tabs, tab-names, uploads, shares)
# are NO LONGER module constants — they're helpers that resolve under the request
# user's home, so the `home` fixture monkeypatches `_user_home` instead (below).
# The office/claude constants are still module-level (not yet per-user), so they
# stay here.
_HOME_PATHS = {
    "UPDATE_HISTORY_FILE": ".local/share/vibetop-update-history.json",
    "SERVICES_FILE": "vibetop-www/services.json",
    "SW_FILE": "vibetop-www/sw.js",
    "CLAUDE_USAGE_FILE": ".local/share/vibetop-claude-usage.json",
    "CLAUDE_SETTINGS_FILE": ".claude/settings.json",
    "ONLYOFFICE_SECRET_FILE": ".config/vibetop/onlyoffice.secret",
    # Share registry is a single GLOBAL file (owner recorded per entry); redirect
    # it into the tmp HOME so share tests stay hermetic.
    "SHARES_FILE": ".local/share/vibetop-shares.json",
    "SESSION_SECRET_FILE": ".config/vibetop/session.secret",
}


class _FakeCompleted:
    def __init__(self, args, returncode=0, stdout="", stderr=""):
        self.args = args
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class _FakeProc:
    """Popen stand-in: a timed wait() raises TimeoutExpired (the "still-running
    GUI app" case x/launch expects), an untimed wait() returns 0 (browser/open's
    reaper thread)."""
    def __init__(self, args, subprocess_mod):
        self.args = args
        self._sp = subprocess_mod

    def wait(self, timeout=None):
        if timeout is not None:
            raise self._sp.TimeoutExpired(self.args, timeout)
        return 0


@pytest.fixture()
def home(mgr, monkeypatch, tmp_path):
    """Redirect all state paths into a tmp HOME and reset the manager's mutable
    module state (memo cache, office sessions). Yields the home dir Path."""
    h = tmp_path / "home"
    for name, rel in _HOME_PATHS.items():
        monkeypatch.setattr(mgr, name, str(h / rel) if rel else str(h))
    # Per-user state resolves under _user_home(request_user); point every user at
    # the tmp HOME so the per-user path helpers land there (single-user tests).
    # Multi-user tests override this with a {user: home} map.
    monkeypatch.setattr(mgr, "_user_home", lambda u: str(h))
    # Per-user registry (slots + token epochs) into the tmp HOME so logout-all /
    # port-slot tests are writable + hermetic.
    monkeypatch.setattr(mgr, "USERS_REGISTRY", str(h / "vibetop-users.json"))
    # Idle-reaper policy file into the tmp HOME so config/reaper tests are hermetic
    # (never touch the real /var/lib/vibetop/idle.json).
    monkeypatch.setattr(mgr, "IDLE_POLICY_FILE", str(h / "vibetop-idle.json"))
    (h / ".local" / "share").mkdir(parents=True, exist_ok=True)
    # Reset process-global mutable state so tests don't bleed into each other.
    if hasattr(mgr, "_cache"):
        mgr._cache.clear()
    if hasattr(mgr, "_office_sessions"):
        mgr._office_sessions.clear()
    # Session-secret is cached in a module global; clear it so each test's tmp
    # SESSION_SECRET_FILE is (re)generated fresh.
    if hasattr(mgr, "_session_secret_cache"):
        mgr._session_secret_cache = None
    if hasattr(mgr, "_login_fails"):        # don't bleed lockout state across tests
        mgr._login_fails.clear()
    return h


@pytest.fixture()
def users(mgr, home, monkeypatch, tmp_path):
    """Map alice/bob to distinct tmp homes (APP_USER falls back to a default
    home); yield {name: (home_path, cookie)}. Depends on `home` for the
    session-secret sandbox. Shared by test_multiuser.py and test_user_home.py."""
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


@pytest.fixture()
def stubs(mgr, monkeypatch):
    """Stub the external-process boundary with recording fakes. Individual tests
    override any entry (e.g. a scripted `_git`, a failing systemctl) as needed."""
    rec = {"run": [], "popen": [], "run_kw": []}

    def fake_run(args, **kw):
        rec["run"].append(list(args) if isinstance(args, (list, tuple)) else args)
        rec["run_kw"].append(kw)          # parallel to rec["run"] (e.g. capture input=)
        return _FakeCompleted(args, returncode=0)

    def fake_popen(args, **kw):
        rec["popen"].append(list(args) if isinstance(args, (list, tuple)) else args)
        return _FakeProc(args, mgr.subprocess)

    monkeypatch.setattr(mgr.subprocess, "run", fake_run)
    monkeypatch.setattr(mgr.subprocess, "Popen", fake_popen)
    # Neutralize sleeps (the per-user terminal socket-wait polls up to 5s; the
    # login throttle sleeps 0.5s) so the hermetic suite stays fast.
    monkeypatch.setattr(mgr.time, "sleep", lambda *a, **k: None)
    # _wait_tcp would busy-loop the full timeout against a port nothing is
    # listening on (the launches are stubbed) — short-circuit it.
    monkeypatch.setattr(mgr, "_wait_tcp", lambda *a, **k: True)
    # No real terminals / heavy /proc scans in the endpoint tests.
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [])
    monkeypatch.setattr(mgr.Handler, "_get_system_status",
                        lambda self: {"cpu": {"pct": 0}, "mem": {}})
    monkeypatch.setattr(mgr, "_system_warnings", lambda: [])
    return rec


class _Client:
    """Minimal HTTP client for the harness. GET/POST return (status, parsed-json).
    POSTs default to a same-origin Origin so the CSRF gate passes; pass
    origin=<other> to exercise the cross-origin rejection."""
    def __init__(self, base):
        self.base = base
        self.host = base.split("://", 1)[1]

    def _do(self, req):
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                raw = r.read()
                return r.status, (_json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, _json.loads(raw) if raw else None
            except ValueError:
                return e.code, raw

    def get(self, path, cookie=None):
        h = {"Cookie": cookie} if cookie else {}
        return self._do(urllib.request.Request(self.base + path, headers=h))

    def get_full(self, path, cookie=None, headers=None):
        """GET returning (status, headers-dict, parsed-json-or-None)."""
        h = dict(headers or {})
        if cookie:
            h["Cookie"] = cookie
        req = urllib.request.Request(self.base + path, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                raw = r.read()
                return r.status, dict(r.headers), (_json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, dict(e.headers), (_json.loads(raw) if raw else None)
            except ValueError:
                return e.code, dict(e.headers), raw

    def get_raw(self, path):
        """GET returning (status, headers, raw-bytes) for non-JSON endpoints
        (office doc/download/preview)."""
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(self.base + path), timeout=10) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def post(self, path, body=None, origin="__same__", raw=None,
             headers=None, cookie=None):
        data = raw if raw is not None else _json.dumps(body or {}).encode()
        h = {"Content-Type": "application/json"}
        if origin == "__same__":
            h["Origin"] = "http://" + self.host
        elif origin is not None:
            h["Origin"] = origin
        if cookie:
            h["Cookie"] = cookie
        if headers:
            h.update(headers)
        return self._do(urllib.request.Request(self.base + path, data=data,
                                               method="POST", headers=h))

    def post_full(self, path, body=None, origin="__same__", raw=None,
                  headers=None, cookie=None):
        """POST returning (status, headers-dict, parsed-json-or-None) — for
        asserting Set-Cookie and other response headers."""
        data = raw if raw is not None else _json.dumps(body or {}).encode()
        h = {"Content-Type": "application/json"}
        if origin == "__same__":
            h["Origin"] = "http://" + self.host
        elif origin is not None:
            h["Origin"] = origin
        if cookie:
            h["Cookie"] = cookie
        if headers:
            h.update(headers)
        req = urllib.request.Request(self.base + path, data=data, method="POST",
                                     headers=h)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                raw_b = r.read()
                return r.status, dict(r.headers), (_json.loads(raw_b) if raw_b else None)
        except urllib.error.HTTPError as e:
            raw_b = e.read()
            try:
                return e.code, dict(e.headers), (_json.loads(raw_b) if raw_b else None)
            except ValueError:
                return e.code, dict(e.headers), raw_b


@pytest.fixture()
def client(mgr, home, stubs):
    """Boot the manager in-thread over a real socket and yield a _Client.
    Depends on `home` (sandbox paths) + `stubs` (no external processes)."""
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mgr.Handler)
    srv.daemon_threads = True
    # Small poll interval so srv.shutdown() returns promptly (the default 0.5s
    # per-test teardown otherwise dominates the suite's wall-clock).
    t = threading.Thread(target=lambda: srv.serve_forever(poll_interval=0.02),
                         daemon=True)
    t.start()
    try:
        yield _Client(f"http://127.0.0.1:{srv.server_address[1]}")
    finally:
        srv.shutdown()
