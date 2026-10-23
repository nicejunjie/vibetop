import os
import io
import json
from email.message import Message
from pathlib import Path
from types import SimpleNamespace

import pytest
from browser_proxy import Bridge, UI_COOKIE
from browser_proxy_auth import BrowserAuthority


def setup():
    auth = BrowserAuthority(b"a" * 32, "realms.example.com", "https://browser-lite.example.com",
                            ["https://vibetop.example.com"], now=lambda: 1000)
    ticket = auth.begin(1000, "alice", "main", 2000, "https://vibetop.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    runtime = SimpleNamespace(route=lambda claims: "/run/browser/1000/ingress.sock", ensure=lambda claims: None)
    return Bridge(auth, runtime), lease


def headers(**values):
    result = Message()
    for key, value in values.items():
        result[key.replace("_", "-")] = value
    return result


def test_root_selects_uid_and_role_only_from_verified_credentials():
    bridge, lease = setup()
    host = "bl-u1000-" + "a" * 32 + ".realms.example.com"
    relay = bridge.auth.mint("relay", lease)
    source = headers(Host=host, X_Forwarded_Proto="https", X_Original_URI="/ENGINE*CTX~TAB~" + relay + "/https://example.org/path?cap=evil",
                     X_Original_Method="GET", X_VT_Browser_Uid="0", X_VT_Browser_Role="auth")
    result = bridge.ingress(source)
    assert result["X-VT-Browser-Uid"] == "1000"
    assert result["X-VT-Browser-Role"] == "relay"
    assert result["X-VT-Browser-Expires"] == "2000"
    source.replace_header("Host", host.replace("1000", "1001"))
    with pytest.raises(ValueError):
        bridge.ingress(source)


@pytest.mark.parametrize("path", ["/api/login", "/api/authcheck", "/", "/__vt/client.js?cap=bad", "/ENGINE*CTX~TAB~/https://example.com/?cap=valid"])
def test_content_auth_has_no_main_public_allowlist_or_query_fallback(path):
    bridge, _ = setup()
    with pytest.raises(ValueError):
        bridge.ingress(headers(Host="bl-u1000-" + "a" * 32 + ".realms.example.com", X_Forwarded_Proto="https", X_Original_URI=path))


def test_cookie_role_and_entry_replay_are_checked_at_root():
    bridge, lease = setup()
    host = "bl-u1000-" + "a" * 32 + ".realms.example.com"
    profile = bridge.auth.realm_config(1000)["profile"]
    source = headers(Host=host, X_Forwarded_Proto="https", X_Original_URI="/api/login", Cookie="__Secure-vt_browser_" + profile + "=" + bridge.auth.mint("ui", lease))
    with pytest.raises(ValueError):
        bridge.ingress(source)
    source.replace_header("Cookie", "__Secure-vt_browser_" + profile + "=" + bridge.auth.mint("content", lease))
    assert bridge.ingress(source)["X-VT-Browser-Role"] == "auth"
    entry = "https://" + host + "/__vt/entry?ticket=" + "x" * 43
    permit = bridge.auth.entry_permit(entry, lease)
    source.replace_header("X-Original-URI", entry.split(host, 1)[1] + "&permit=" + permit)
    for key, value in {"Referer": bridge.auth.ui_origin + "/", "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate", "X-Original-Method": "GET"}.items():
        source[key] = value
    assert bridge.ingress(source)["X-VT-Browser-Role"] == "entry"
    with pytest.raises(ValueError):
        bridge.ingress(source)


def test_only_current_engine_sync_cookies_can_reach_per_user_process():
    bridge, lease = setup()
    record = bridge.auth.realm_config(1000)
    sync = "__Host-c|" + record["engineSessionId"] + "|name|domain|path||||=data"
    cookie = "__Secure-vt_browser_" + record["profile"] + "=" + bridge.auth.mint("content", lease)
    others = "__Secure-vt_browser_other=secret; __Host-vt_bl_ui=secret; __Host-vt_session=secret; CF_Authorization=secret; __Host-c|OTHER|key=value"
    source = headers(Host="bl-u1000-" + "a" * 32 + ".realms.example.com", X_Forwarded_Proto="https", X_Original_URI="/task.js", Cookie=cookie + "; " + others + "; " + sync)
    assert bridge.ingress(source)["X-VT-Browser-Cookie"] == sync


@pytest.mark.parametrize("origin,site", [("https://evil.example.com", "same-site"), (None, "same-origin"), ("https://browser-lite.example.com", "same-site")])
def test_same_site_is_insufficient_for_ui_control(origin, site):
    bridge, _ = setup()
    with pytest.raises(ValueError):
        bridge.check_post_origin({"Origin": origin, "Sec-Fetch-Site": site})


@pytest.mark.parametrize("body", [b"null", b"[]", b'"ticket"'])
def test_malformed_renewal_always_gets_a_bounded_response(body):
    bridge, _ = setup()
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/__vt/bootstrap",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json", Content_Length=str(len(body))),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=lambda status: outgoing.append(status), send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [401]
    assert len(handler.wfile.getvalue()) < 1000


def test_ui_html_pins_all_assets_to_its_release(tmp_path):
    bridge, lease = setup()
    bridge.runtime.code = tmp_path
    bridge.runtime.revision = 'a' * 64
    (tmp_path / 'wrapper.html').write_text('<head><link href="/wrapper.css"></head><script src="/controller.js"></script><script src="/ui-session.js"></script><script src="/wrapper.js"></script>')
    outgoing = []
    handler = SimpleNamespace(path='/__browser_proxy/ui', command='GET',
        headers=headers(Host='browser-lite.example.com', X_Forwarded_Proto='https', X_Original_URI='/',
                        Cookie=UI_COOKIE + '=' + bridge.auth.mint('ui', lease)),
        wfile=io.BytesIO(), send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    content = handler.wfile.getvalue().decode()
    for name in ('wrapper.css', 'wrapper.js', 'controller.js', 'ui-session.js'):
        assert f'/__vt/assets/{bridge.runtime.revision}/{name}' in content
    assert 'vt-main-origins' in content
    assert 'name="vt-profile" content="' in content


def test_old_ui_keeps_old_assets_after_manager_release_change(tmp_path, monkeypatch):
    import os
    import browser_proxy_release
    bridge, _ = setup()
    old = tmp_path / 'staging'
    old.mkdir(mode=0o755)
    names = ('runtime.cjs', 'egress.cjs', 'wrapper.html', 'wrapper.css', 'wrapper.js',
             'ui-session.js', 'trusted-controller.js', 'package.json', 'pnpm-lock.yaml')
    for name in names:
        (old / name).write_text('old-' + name)
        (old / name).chmod(0o644)
    revision = browser_proxy_release.tree_digest(old)
    (old / 'release.json').write_text(json.dumps({'protocol': 1, 'nodeVersion': 'v22.0.0', 'revision': revision}))
    (old / 'release.json').chmod(0o644)
    old.rename(tmp_path / revision)
    bridge.runtime.code = tmp_path / ('b' * 64)
    bridge.runtime.code.mkdir()
    (bridge.runtime.code / 'wrapper.js').write_text('new-wrapper.js')
    bridge.runtime.revision = 'b' * 64
    validate = browser_proxy_release.validate
    monkeypatch.setattr(browser_proxy_release, 'validate', lambda path: validate(path, owner=os.getuid()))
    assert bridge.asset('wrapper.js') == b'new-wrapper.js'
    assert bridge.asset('wrapper.js', revision) == b'old-wrapper.js'
    assert bridge.asset('trusted-controller.js', revision) == b'old-trusted-controller.js'
    with pytest.raises(FileNotFoundError):
        bridge.asset('wrapper.js', '../staging')
    with pytest.raises(FileNotFoundError):
        bridge.asset('wrapper.js', 'c' * 64)


def test_failed_installation_check_is_cached_and_retried(monkeypatch):
    import browser_proxy
    clock = [100.0]
    loads = []
    def failure(epoch):
        loads.append(epoch)
        raise ValueError('Node major mismatch')
    monkeypatch.setattr(browser_proxy, '_failure_until', 0.0)
    monkeypatch.setattr(browser_proxy.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(browser_proxy, '_load_configured', failure)
    for _ in range(100):
        with pytest.raises(RuntimeError, match='unavailable'):
            browser_proxy.configured(None)
    assert loads == [None]
    clock[0] += 61
    with pytest.raises(RuntimeError):
        browser_proxy.configured(None)
    assert loads == [None, None]


@pytest.mark.parametrize('case', ['wrong-path', 'wrong-revision', 'node-mismatch'])
def test_configured_rejects_bad_release_before_opening_identity_store(tmp_path, monkeypatch, case):
    import os
    import browser_proxy
    import browser_proxy_release
    import browser_proxy_store
    revision = 'a' * 64
    config = {'releasePath': '/opt/vibetop-browser-proxy/releases/' + revision, 'revision': revision}
    if case == 'wrong-path':
        config['releasePath'] = '/home/operator/untrusted'
    if case == 'wrong-revision':
        config['revision'] = 'not-a-revision'
    path = tmp_path / 'config.json'
    path.write_text(json.dumps(config))
    path.chmod(0o600)
    monkeypatch.setenv('VIBETOP_BROWSER_PROXY_CONFIG', str(path))
    monkeypatch.setattr(browser_proxy, '_bridge', None)
    actual_fstat = os.fstat
    def root_metadata(fd):
        metadata = actual_fstat(fd)
        return SimpleNamespace(st_mode=metadata.st_mode, st_uid=0, st_size=metadata.st_size)
    monkeypatch.setattr(os, 'fstat', root_metadata)
    monkeypatch.setattr(Path, 'resolve', lambda self, **kwargs: self)
    monkeypatch.setattr(browser_proxy_release, 'validate_ancestors', lambda path: None)
    def validate(path, *, node_version):
        assert node_version == 'v24.0.0'
        raise ValueError('Node version changed')
    monkeypatch.setattr(browser_proxy_release, 'validate', validate)
    monkeypatch.setattr(browser_proxy.subprocess, 'check_output', lambda *args, **kwargs: 'v24.0.0\n')
    def no_store(*args):
        raise AssertionError('Invalid release must not open identity store')
    monkeypatch.setattr(browser_proxy_store, 'IdentityStore', no_store)
    with pytest.raises(ValueError, match='Node version|release path'):
        browser_proxy._load_configured(None)


@pytest.mark.parametrize("sync", [False, True])
def test_open_carries_browser_logins_only_from_the_manager(monkeypatch, sync):
    bridge, lease = setup()
    calls, looked_up = [], []
    bridge.runtime.call = lambda claims, command, body: calls.append(body) or (200, {"ok": True})
    monkeypatch.setattr(type(bridge), "browser_logins", staticmethod(lambda uid, url: looked_up.append(url) or [{"name": "s", "value": "v"}]))
    body = json.dumps({"url": "https://chatgpt.com/", "cookies": [{"name": "forged"}], **({"loginSync": True} if sync else {})}).encode()
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/open",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert "loginSync" not in calls[0]
    if sync:
        assert looked_up == ["https://chatgpt.com/"] and calls[0]["cookies"] == [{"name": "s", "value": "v"}]
    else:
        assert looked_up == [] and "cookies" not in calls[0]


def test_browser_logins_never_reads_google():
    import browser_proxy
    assert browser_proxy.Bridge.browser_logins(1000, "https://accounts.google.com/x") == []
    assert browser_proxy.Bridge.browser_logins(1000, "javascript:alert(1)") == []


def test_link_to_another_site_brings_its_browser_logins(monkeypatch):
    bridge, lease = setup()
    calls = []
    def call(claims, command, body):
        calls.append((command, body))
        return 200, ({"entry": "https://x/entry", "url": "https://chatgpt.com/c/1"} if command == "approve" else {"ok": True})
    bridge.runtime.call = call
    monkeypatch.setattr(type(bridge), "browser_logins", staticmethod(lambda uid, url: [{"name": "s", "value": url}]))
    body = json.dumps({"challenge": "c", "tabId": "t", "epoch": 1}).encode()
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/approve",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert [c for c, _ in calls] == ["approve", "logins"]
    assert calls[1][1] == {"url": "https://chatgpt.com/c/1", "cookies": [{"name": "s", "value": "https://chatgpt.com/c/1"}]}


def test_browser_lite_credentials_are_high_priority_cookies():
    # Realm sync cookies share the registrable domain's cap; Chromium evicts
    # lower-priority cookies first, so the credentials must outrank them.
    bridge, lease = setup()
    cookies = [value for name, value in bridge.cookies(lease)]
    assert len(cookies) == 2
    for value in cookies:
        assert "Priority=High" in value and "HttpOnly" in value and "Secure" in value


def test_saved_tabs_pass_through_to_the_user_runtime_with_a_larger_body():
    # A tab list with back/forward history exceeds the 6 KB command limit.
    bridge, lease = setup()
    calls = []
    bridge.runtime.call = lambda claims, command, body: calls.append((command, body)) or (200, {"saved": True})
    tabs = {"tabs": [{"url": "https://example.com/%d" % i, "title": "x" * 150,
                      "history": [{"url": "https://example.com/h%d" % j, "documentId": "d"} for j in range(20)]} for i in range(10)], "active": 0}
    body = json.dumps({"save": tabs}).encode()
    assert len(body) > 6144
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/tabs",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert calls[0][0] == "tabs" and calls[0][1]["save"]["tabs"][0]["url"] == "https://example.com/0"
    assert "cookies" not in calls[0][1]


def test_welcome_shortcuts_pass_through_to_the_user_runtime():
    # The welcome-screen quick-launch list is saved per user via its own command.
    bridge, lease = setup()
    calls = []
    bridge.runtime.call = lambda claims, command, body: calls.append((command, body)) or (200, {"saved": True})
    body = json.dumps({"save": {"shortcuts": [{"name": "Example", "url": "https://example.com/"}]}}).encode()
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/shortcuts",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert calls[0][0] == "shortcuts" and calls[0][1]["save"]["shortcuts"][0]["url"] == "https://example.com/"
    assert "cookies" not in calls[0][1]


def test_adblock_pref_passes_through_to_the_user_runtime():
    # The ad-blocker toggle is saved per user via its own command, like shortcuts.
    bridge, lease = setup()
    calls = []
    bridge.runtime.call = lambda claims, command, body: calls.append((command, body)) or (200, {"saved": True, "prefs": {"adblock": False}})
    body = json.dumps({"save": {"prefs": {"adblock": False}}}).encode()
    outgoing = []
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/prefs",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=io.BytesIO(),
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert calls[0][0] == "prefs" and calls[0][1]["save"]["prefs"]["adblock"] is False
    assert "cookies" not in calls[0][1]


def test_browser_logins_skips_users_without_a_browser_profile_and_caches_answers(monkeypatch, tmp_path):
    import pwd
    import subprocess
    Bridge._logins_cache.clear()
    me = pwd.getpwuid(os.getuid())
    monkeypatch.setattr("browser_login_sync.profile_dir", lambda home: str(tmp_path / "profile"))
    runs = []

    def fake_run(*args, **kwargs):
        runs.append(args)
        return subprocess.CompletedProcess(args, 0, stdout=b'[{"name": "s", "value": "v"}]', stderr=b"")
    monkeypatch.setattr(subprocess, "run", fake_run)
    # No Browser profile: no subprocess at all (every cross-site hop would pay for it).
    assert Bridge.browser_logins(me.pw_uid, "https://site.example/a") == []
    assert runs == []
    (tmp_path / "profile" / "Default").mkdir(parents=True)
    (tmp_path / "profile" / "Default" / "Cookies").write_bytes(b"")
    assert Bridge.browser_logins(me.pw_uid, "https://site.example/a") == [{"name": "s", "value": "v"}]
    assert Bridge.browser_logins(me.pw_uid, "https://site.example/b") == [{"name": "s", "value": "v"}]
    assert len(runs) == 1, "the same site within a few seconds is answered from memory"
    assert Bridge.browser_logins(me.pw_uid, "https://elsewhere.example/") == [{"name": "s", "value": "v"}]
    assert len(runs) == 2


def test_logins_digest_fingerprints_the_browser_cookies_without_exposing_them(monkeypatch):
    calls = []

    def fake(uid, url, fresh=False):
        calls.append(fresh)
        return [] if "nothing" in url else [{"name": "s", "value": "secret-value"}, {"name": "a", "value": "1"}]
    monkeypatch.setattr(Bridge, "browser_logins", staticmethod(fake))
    assert Bridge.logins_digest(1000, "https://nothing.example/") == ""
    digest = Bridge.logins_digest(1000, "https://site.example/")
    assert len(digest) == 32 and "secret" not in digest
    assert Bridge.logins_digest(1000, "https://site.example/") == digest
    assert calls and all(calls), "the toolbar's poll must bypass the 30 s cache"


def test_logins_check_is_a_ui_command_that_never_reaches_the_runtime(monkeypatch):
    bridge, lease = setup()
    bridge.runtime.call = lambda *args: (_ for _ in ()).throw(AssertionError("runtime must not be called"))
    monkeypatch.setattr(type(bridge), "browser_logins", staticmethod(lambda uid, url, fresh=False: [{"name": "s", "value": "v"}]))
    body = json.dumps({"url": "https://site.example/"}).encode()
    outgoing, written = [], io.BytesIO()
    handler = SimpleNamespace(path="/__browser_proxy/ui", command="POST",
        headers=headers(Host="browser-lite.example.com", X_Forwarded_Proto="https", X_Original_URI="/api/logins-check",
                        Origin=bridge.auth.ui_origin, Sec_Fetch_Site="same-origin", Content_Type="application/json",
                        Content_Length=str(len(body)), Cookie=UI_COOKIE + "=" + bridge.auth.mint("ui", lease)),
        connection=SimpleNamespace(settimeout=lambda value: None), rfile=io.BytesIO(body), wfile=written,
        send_response=outgoing.append, send_header=lambda *args: None, end_headers=lambda: None)
    bridge.handle(handler)
    assert outgoing == [200]
    assert len(json.loads(written.getvalue())["digest"]) == 32
