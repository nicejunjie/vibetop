#!/usr/bin/env python3
"""Exercise real immutable-release upgrade and rollback with disposable units."""
import http.client
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'server'))
from browser_proxy_auth import BrowserAuthority
from browser_proxy_release import validate, tree_digest
from browser_proxy_runtime import Runtime


def main():
    assert os.geteuid() == 0, 'Run as root with VT_BROWSER_RELEASE pointing to a verified test bundle'
    source = Path(os.environ['VT_BROWSER_RELEASE'])
    manifest = validate(source, node_version=subprocess.check_output(['/usr/bin/node', '--version'], text=True).strip())
    user = os.environ.get('SUDO_USER') or 'junjie'
    pw = pwd.getpwnam(user)
    assert pw.pw_uid != 0
    prefix = 'vibetop-browser-rollover-test-' + str(os.getpid())
    run, profiles = Path('/run') / prefix, Path('/var/lib') / prefix
    releases = Path(tempfile.mkdtemp(prefix=prefix, dir='/var/tmp'))
    releases.chmod(0o755)
    auth = BrowserAuthority(os.urandom(32), 'vt-proxy.example.com', 'https://ui.vt-proxy.example.com',
                            ['https://main.vt-proxy.example.com'])
    ticket = auth.begin(pw.pw_uid, user, 'test-main', time.time() + 3600,
                        'https://main.vt-proxy.example.com', expected_epoch=0)
    lease = auth.redeem(ticket, 'https://main.vt-proxy.example.com', 'iframe', 'navigate')
    claims = auth.verify(auth.mint('ui', lease), 'ui')
    def manager(code, revision):
        return Runtime(auth, run=run, profiles=profiles, code=code, revision=revision,
                       prefix=prefix, guard_user='nobody')
    current = manager(source, manifest['revision'])
    units = [name + suffix for name in current.names(pw.pw_uid).values() for suffix in ('.socket', '.service')]
    def pid():
        return int(subprocess.check_output(['systemctl', 'show', current.names(pw.pw_uid)['rewrite'] + '.service',
                                           '-p', 'MainPID', '--value'], text=True))
    def configuration():
        return json.loads((run / str(pw.pw_uid) / 'rewrite.json').read_bytes())
    content_host = None
    def resource(runtime):
        # No public website/network dependency; verifies the actual running code.
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(20)
            sock.connect(runtime.route(claims))
            headers = {'Host': content_host, 'X-VT-Browser-Role': 'relay',
                       'X-VT-Browser-Expires': str(claims['exp']), 'X-VT-Browser-Relay': auth.mint('relay', lease),
                       **{'X-VT-Browser-' + key: str(claims[key]) for key in ('uid', 'profile', 'epoch', 'lease')}}
            sock.sendall(('GET /hammerhead.js HTTP/1.1\r\nConnection: close\r\n' +
                          ''.join(f'{key}: {value}\r\n' for key, value in headers.items()) + '\r\n').encode())
            response = http.client.HTTPResponse(sock)
            response.begin()
            assert response.status == 200, response.status
            assert len(response.read()) > 10000
    def open_client(runtime, digit):
        nonlocal content_host
        client = digit * 8 + '-' + digit * 4 + '-4' + digit * 3 + '-8' + digit * 3 + '-' + digit * 12
        status, result = runtime.call(claims, 'open', {'clientId': client, 'operation': 1,
                                     'tabId': '99999999-9999-4999-8999-999999999999', 'url': 'https://example.com/'})
        assert status == 200 and result.get('entry'), result
        content_host = urlsplit(result['entry']).netloc
        return client
    try:
        updated = releases / 'updated'
        shutil.copytree(source, updated, symlinks=True)
        with (updated / 'wrapper.css').open('a') as stream:
            stream.write('\n/* Disposable release rollover fixture. */\n')
        updated_manifest = {**manifest, 'revision': tree_digest(updated, owner=0)}
        (updated / 'release.json').write_text(json.dumps(updated_manifest))
        validate(updated)
        client = open_client(current, '1')
        resource(current)
        original = configuration()
        for code, revision, digit in ((updated, updated_manifest['revision'], '2'), (source, manifest['revision'], '3')):
            previous_pid = pid()
            replacement = manager(code, revision)
            # A resource after manager restart adopts the old release read-only.
            resource(replacement)
            assert pid() == previous_pid
            assert replacement.ready[pw.pw_uid][1] != revision
            if digit == '2':
                real_execute = replacement.execute
                def fail_reload(args, **kwargs):
                    if args[1] == 'daemon-reload':
                        raise RuntimeError('injected rollover reload failure')
                    return real_execute(args, **kwargs)
                replacement.execute = fail_reload
                try:
                    replacement.call(claims, 'heartbeat', {'clients': [client]})
                except RuntimeError as error:
                    assert 'injected' in str(error)
                else:
                    raise AssertionError('Injected rollover failure was ignored')
                assert configuration()['revision'] != revision
                assert not (run / str(pw.pw_uid) / 'ingress.sock').exists()
                assert pw.pw_uid not in replacement.ready
                replacement.execute = real_execute
            status, result = replacement.call(claims, 'heartbeat', {'clients': [client]})
            assert status == 200 and client in result['expired'], result
            assert pid() not in (0, previous_pid)
            assert str(code / 'runtime.cjs').encode() in Path(f'/proc/{pid()}/cmdline').read_bytes().split(b'\0')
            actual = configuration()
            assert actual['revision'] == revision and actual['codePath'] == str(code)
            for key in ('ingressIdentity', 'engineSessionId', 'secret'):
                assert key in original and actual[key] == original[key], key
            resource(replacement)
            client = open_client(replacement, digit)
            current = replacement
        print('PASS: immutable release upgrade and rollback, read-only adoption, heartbeat rollover, interrupted update recovery, stable profile identity')
    except BaseException:
        subprocess.run(['journalctl', '--no-pager', '-n', '20', *[arg for unit in units for arg in ('-u', unit)]])
        raise
    finally:
        for suffix in ('.socket', '.service'):
            subprocess.run(['systemctl', 'stop', *[unit for unit in units if unit.endswith(suffix)]], capture_output=True)
        for unit in units:
            (Path('/run/systemd/system') / unit).unlink(missing_ok=True)
        subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
        for path in (run, profiles, releases):
            if path.exists():
                shutil.rmtree(path)


if __name__ == '__main__':
    main()
