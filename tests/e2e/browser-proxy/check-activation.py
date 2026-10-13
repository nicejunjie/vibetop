#!/usr/bin/env python3
"""Actual private nginx reload/rollback test. No root or production changes."""
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'server'))
from browser_proxy_deploy import Activation


def main():
    nginx = shutil.which('nginx') or '/usr/sbin/nginx'
    with tempfile.TemporaryDirectory(prefix='vt-browser-activation-') as temporary:
        root = Path(temporary)
        (root / 'logs').mkdir()
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        site, config, journal = (root / name for name in ('site.conf', 'browser.json', 'pending.json'))
        full = root / 'nginx.conf'
        full.write_text(f'pid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{}}\nhttp {{access_log off; include {site};}}\n')
        def source(version):
            return f'server {{listen 127.0.0.1:{port}; location / {{return 200 "{version}";}}}}\n'.encode()
        site.write_bytes(source('old'))
        config.write_text(json.dumps({'revision': 'old'}))
        command = [nginx, '-p', str(root) + '/', '-c', str(full)]
        process = subprocess.Popen(command + ['-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        selected = ['old']
        failures = set()
        def validate():
            subprocess.run(command + ['-t'], capture_output=True, check=True)
        def reload():
            if 'reload' in failures:
                failures.remove('reload')
                raise RuntimeError('injected reload failure')
            subprocess.run(command + ['-s', 'reload'], capture_output=True, check=True)
        def restart():
            if 'restart' in failures:
                failures.remove('restart')
                raise RuntimeError('injected manager failure')
            selected[0] = json.loads(config.read_bytes())['revision']
        def health():
            desired = json.loads(config.read_bytes())['revision']
            assert selected[0] == desired, 'Manager still caches previous revision'
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
                try:
                    connection.request('GET', '/')
                    response = connection.getresponse()
                    if response.status == 200 and response.read().decode() == desired:
                        return
                except OSError:
                    pass
                finally:
                    connection.close()
                time.sleep(.05)
            raise AssertionError('Active nginx does not serve selected revision')
        activation = Activation(config=config, site=site, journal=journal, validate_nginx=validate,
                                reload_nginx=reload, restart_manager=restart, health=health)
        candidate = json.dumps({'revision': 'new'}).encode()
        try:
            health()
            # Real nginx parser rejection restores its on-disk configuration.
            try:
                activation.activate(candidate, b'invalid nginx directive;')
            except subprocess.CalledProcessError:
                pass
            else:
                raise AssertionError('Invalid nginx was accepted')
            health()
            for failure in ('reload', 'restart'):
                failures.add(failure)
                try:
                    activation.activate(candidate, source('new'))
                except RuntimeError:
                    pass
                else:
                    raise AssertionError('Injected failure was ignored')
                assert selected[0] == 'old' and not journal.exists()
                health()
            activation.activate(candidate, source('new'), defer_manager=True)
            assert selected[0] == 'old' and journal.exists()
            restart()
            activation.finish()
            health()
            assert not journal.exists()
            print('PASS: real nginx invalid-config/reload/restart rollback, deferred activation and selected-version health')
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    main()
