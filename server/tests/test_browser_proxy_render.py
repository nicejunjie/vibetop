"""Exercise the real shell rendering entry point, including nginx parsing."""
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('enabled', [False, True, 'disabled'])
def test_render_only_never_invokes_mutators_and_nginx_accepts_output(tmp_path, enabled):
    config = tmp_path / 'browser.json'
    if enabled:
        config.write_text(json.dumps({'domain': 'realms.example.com', 'uiOrigin': 'https://lite.example.com',
                                     'mainOrigins': ['https://main.example.com'], 'localHosts': ['test-host'], 'enabled': enabled != 'disabled'}))
    commands = tmp_path / 'bin'
    commands.mkdir()
    for name in ('sudo', 'install', 'mkdir', 'systemctl', 'nginx', 'openssl', 'setfacl'):
        script = commands / name
        script.write_text('#!/bin/sh\necho "unexpected mutation: ' + name + '" >&2\nexit 99\n')
        script.chmod(0o755)
    env = {**os.environ, 'PATH': str(commands) + ':' + os.environ['PATH'], 'ENABLE_TLS': '0',
           'APP_USER': pwd.getpwuid(os.getuid()).pw_name, 'BROWSER_PROXY_CONFIG': str(config),
           'LANDING_DIR': str(ROOT / 'shell')}
    result = subprocess.run(['bash', str(ROOT / 'server/install.sh'), '--render-only'],
                            env=env, text=True, capture_output=True, check=True)
    assert 'unexpected mutation' not in result.stderr
    site = result.stdout
    assert site.count('map $host $vt_browser_main_host_allowed') == 1
    assert 'if ($vt_browser_main_host_allowed = 0) { return 421; }' in site
    assert ('server_name lite.example.com;' in site) == (bool(enabled) and enabled != 'disabled')
    if enabled == 'disabled':
        assert 'default 0;' in site and 'host.docker.internal 1;' in site
    if enabled:
        from browser_proxy_nginx import update_browser_site
        assert update_browser_site(site, json.loads(config.read_text()), [socket.gethostname(), socket.getfqdn()]) == site
    assert 'vibetop install\n' not in site
    nginx = shutil.which('nginx') or '/usr/sbin/nginx'
    if not Path(nginx).exists():
        pytest.skip('nginx unavailable for real parse check')
    (tmp_path / 'logs').mkdir()
    (tmp_path / 'extras').mkdir()
    site = site.replace('/etc/nginx/snippets/vibetop-extras.d/*.conf', str(tmp_path / 'extras/*.conf'))
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    site = site.replace('listen 80', f'listen 127.0.0.1:{port}').replace('listen [::]:80', f'listen [::1]:{port}')
    prefix = 'pid ' + str(tmp_path / 'nginx.pid') + ';\nerror_log stderr;\nevents {}\nhttp { access_log off;\n'
    aux = '\n'.join((ROOT / 'server/nginx' / name).read_text() for name in ('vibetop-upgrade.conf', 'vibetop-limits.conf'))
    target = tmp_path / 'nginx.conf'
    target.write_text(prefix + aux + '\n' + site + '\n}\n')
    check = subprocess.run([nginx, '-t', '-p', str(tmp_path) + '/', '-c', str(target)], capture_output=True, text=True)
    assert check.returncode == 0, check.stderr


def test_browser_activation_preserves_every_unrelated_site_byte(monkeypatch):
    from browser_proxy_nginx import update_browser_site, without_browser_site
    current = 'map $remote_addr $something { default 1; }\nserver {\n    listen 18888;\n    server_name _;\n    root /custom/desktop;\n    ssl_certificate /custom/cert.pem;\n    location /office { proxy_pass http://127.0.0.1:9999; }\n}\n'
    config = {'domain': 'realms.example.com', 'uiOrigin': 'https://lite.example.com', 'mainOrigins': ['https://main.example.com']}
    monkeypatch.setenv('ONLYOFFICE_CALLBACK_HOST', 'http://office-callback.internal:18888')
    changed = update_browser_site(current, config)
    assert without_browser_site(changed) == current
    assert 'host.docker.internal 1;' in changed and 'office-callback.internal 1;' in changed
    assert update_browser_site(changed, config) == changed
    with pytest.raises(ValueError, match='Unrecognized'):
        update_browser_site('server { listen 80; }', config)


def test_renderer_rejects_trusted_host_in_realm_namespace():
    import pytest
    from browser_proxy_nginx import render
    with pytest.raises(ValueError, match="host configuration"):
        render("example.com", "https://bl-lite.example.com", ["https://main.example.com"])
    with pytest.raises(ValueError, match="host configuration"):
        render("example.com", "https://example.com", ["https://main.example.com"])
    # Single-label realms beside trusted hosts on one free wildcard certificate.
    rendered = render("example.com", "https://lite.example.com", ["https://main.example.com"])
    assert "server_name lite.example.com;" in rendered
    assert r"-[a-f0-9]{32}\.example\.com$" in rendered
