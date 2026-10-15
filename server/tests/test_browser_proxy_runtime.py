import json
import os
import threading
from types import SimpleNamespace

import pytest
from browser_proxy_auth import BrowserAuthority
from browser_proxy_runtime import Runtime, directory


def runtime(tmp_path):
    auth = BrowserAuthority(b"a" * 32, "realms.example.com", "https://browser-lite.example.com",
                            ["https://vibetop.example.com"], now=lambda: 1000)
    ticket = auth.begin(os.getuid() or 1000, "alice", "session", 2000,
                        "https://vibetop.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    claims = auth.verify(auth.mint("ui", lease), "ui")
    commands = []
    manager = Runtime(auth, run=tmp_path / "run", profiles=tmp_path / "profiles",
                      units=tmp_path / "units", execute=lambda args, **kw: (commands.append(args) or SimpleNamespace(returncode=0)))
    return manager, claims, commands


def test_ingress_cannot_start_any_runtime(tmp_path):
    manager, claims, commands = runtime(tmp_path)
    with pytest.raises(ValueError, match="not running"):
        manager.route(claims)
    assert commands == []
    manager.ready[claims["uid"]] = (claims["epoch"], manager.revision)
    for _ in range(1000):
        assert manager.route(claims).endswith("/ingress.sock")
    assert commands == []


def test_logout_wins_over_previously_authenticated_cold_start(tmp_path):
    manager, claims, commands = runtime(tmp_path)
    prepared = []
    manager.prepare = lambda claims: prepared.append(claims)
    manager.revoke(claims["uid"])
    with pytest.raises(ValueError, match="expired|revoked"):
        manager.ensure(claims)
    assert prepared == []
    assert all(command[1] == "stop" for command in commands)
    assert all(unit.endswith(".socket") for unit in commands[0][2:])
    assert all(unit.endswith(".service") for unit in commands[1][2:])


def test_start_and_logout_are_serialized_on_same_uid_lock(tmp_path):
    manager, claims, commands = runtime(tmp_path)
    entered, release = threading.Event(), threading.Event()
    def prepare(claims):
        entered.set()
        assert release.wait(3)
    manager.prepare = prepare
    thread = threading.Thread(target=manager.ensure, args=(claims,))
    thread.start()
    assert entered.wait(3)
    stopped = threading.Event()
    logout = threading.Thread(target=lambda: (manager.revoke(claims["uid"]), stopped.set()))
    logout.start()
    assert not stopped.wait(.05)
    release.set()
    thread.join(3)
    logout.join(3)
    assert stopped.is_set()
    assert claims["uid"] not in manager.ready
    assert [cmd[1] for cmd in commands] == ["start", "stop", "stop"]


def test_unit_sockets_are_owned_outside_user_control(tmp_path):
    manager, claims, _ = runtime(tmp_path)
    files = manager.unit_files(1000, 1000)
    rewrite = files[manager.names(1000)["rewrite"] + ".service"]
    ingress = files[manager.names(1000)["rewrite"] + ".socket"]
    assert "SocketUser=root\nSocketGroup=www-data\nSocketMode=0660" in ingress
    assert "LoadCredential=config.json:" in rewrite
    assert "PrivateNetwork=yes" in rewrite
    assert "PrivatePIDs=yes" in rewrite
    assert "ProtectHome=tmpfs" in rewrite
    assert "TemporaryFileSystem=/run:ro /var/lib:ro" in rewrite
    assert "User=1000\nGroup=1000" in rewrite
    assert "StartLimitIntervalSec=60\nStartLimitBurst=5" in rewrite


def test_existing_profile_symlink_is_never_followed_or_repaired(tmp_path):
    target = tmp_path / "user-home"
    target.mkdir(mode=0o755)
    link = tmp_path / "profile"
    link.symlink_to(target)
    with pytest.raises(PermissionError):
        directory(link, os.getuid(), os.getgid(), 0o700)
    assert target.stat().st_mode & 0o777 == 0o755


def test_release_units_execute_the_immutable_directory(tmp_path):
    manager, claims, _ = runtime(tmp_path)
    manager.revision = 'a' * 64
    manager.code = tmp_path / 'releases' / manager.revision
    files = manager.unit_files(claims['uid'], 1000)
    for kind, filename, flags in (('rewrite', 'runtime.cjs', '--max-http-header-size=65536 '), ('egress', 'egress.cjs', '')):
        source = files[manager.names(claims['uid'])[kind] + '.service']
        assert f'ExecStart=/usr/bin/node {flags}{manager.code}/{filename} %d/config.json\n' in source
        assert f'BindReadOnlyPaths={manager.code}\n' in source
        assert f'{manager.code}:/opt/' not in source


def test_heartbeat_rolls_adopted_release_once_without_revoking_login(tmp_path):
    manager, claims, commands = runtime(tmp_path)
    manager.revision = 'b' * 64
    manager.ready[claims['uid']] = (claims['epoch'], 'a' * 64)
    ensured = []
    def ensure(claims):
        ensured.append(claims)
        manager.ready[claims['uid']] = (claims['epoch'], manager.revision)
    manager.ensure = ensure
    manager._exchange = lambda uid, command, data: (200, {'expired': []})
    for _ in range(2):
        assert manager.call(claims, 'heartbeat', {'clients': []}) == (200, {'expired': []})
    assert ensured == [claims]
    assert manager.auth.verify(manager.auth.mint('ui', claims['lease']), 'ui')['epoch'] == claims['epoch']
    assert commands == []


@pytest.mark.parametrize('revision,code', [('invalid', '/opt/release'), ('a' * 64, 'relative'),
                                         ('a' * 64, '/opt/space name'), ('a' * 64, '/opt/release\nExecStart=bad')])
def test_invalid_release_unit_arguments_are_rejected(tmp_path, revision, code):
    manager, _, _ = runtime(tmp_path)
    with pytest.raises(ValueError, match='release identity'):
        Runtime(manager.auth, revision=revision, code=code)


@pytest.mark.parametrize('fail_reload', [False, True])
def test_runtime_commit_marker_is_written_only_after_units_reload(tmp_path, monkeypatch, fail_reload):
    import browser_proxy_runtime
    manager, claims, _ = runtime(tmp_path)
    events = []
    monkeypatch.setattr(browser_proxy_runtime.pwd, 'getpwuid', lambda uid: SimpleNamespace(pw_name='alice', pw_gid=1000))
    monkeypatch.setattr(browser_proxy_runtime, 'directory', lambda *args: None)
    monkeypatch.setattr(browser_proxy_runtime, 'root_write', lambda path, data: events.append(path.name))
    def systemctl(*args):
        events.append(args[0])
        if fail_reload:
            raise RuntimeError('injected daemon-reload failure')
    manager._systemctl = systemctl
    if fail_reload:
        with pytest.raises(RuntimeError, match='injected'):
            manager.prepare(claims)
        assert 'rewrite.json' not in events
    else:
        manager.prepare(claims)
        assert events[-2:] == ['daemon-reload', 'rewrite.json']
    assert events[0] == 'egress.json'


def test_open_recovers_a_runtime_that_tripped_the_start_limit(tmp_path):
    manager, claims, commands = runtime(tmp_path)
    manager.ready[claims["uid"]] = (claims["epoch"], manager.revision)
    manager._validate = lambda claims: None
    manager.ensure(claims)
    names = manager.names(claims["uid"])
    reset = [c for c in commands if c[:2] == ["systemctl", "reset-failed"]]
    start = [c for c in commands if c[:2] == ["systemctl", "start"]]
    assert reset and start and commands.index(reset[0]) < commands.index(start[0])
    assert names["rewrite"] + ".socket" in reset[0] and names["rewrite"] + ".service" in reset[0]
    assert start[0][2:] == [names["egress"] + ".socket", names["rewrite"] + ".socket", names["rewrite"] + ".service"]
