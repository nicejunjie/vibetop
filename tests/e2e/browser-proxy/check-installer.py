#!/usr/bin/env python3
"""Run real service-account build/root publication in private paths only.

Activation callbacks model manager selection here; actual nginx and isolated
manager/runtime integration are separately covered by check-activation/frontdoor.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'server'))
from browser_proxy_deploy import Activation
from browser_proxy_nginx import without_browser_site
from browser_proxy_release import validate


def main():
    assert os.geteuid() == 0, 'Use sudo; only disposable paths under /run are changed'
    source = Path(os.environ['VT_BROWSER_RELEASE'])
    manifest = validate(source)
    spec = importlib.util.spec_from_file_location('browser_installer', ROOT / 'apps/everyday/browser-lite/install-proxy.py')
    installer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installer)
    parent = Path(tempfile.mkdtemp(prefix='vt-browser-installer-', dir='/run'))
    parent.chmod(0o755)
    try:
        installer.CONFIG_PATH = parent / 'config.json'
        installer.RELEASE_ROOT = parent / 'runtime'
        installer.DEPLOY_ROOT = parent / 'deploy'
        installer.GUARD_USER = 'nobody'  # Already exists; test must not create users.
        site = parent / 'site.conf'
        original = 'server {\n    listen 18999;\n    server_name _;\n    root /custom/unchanged;\n}\n'
        site.write_text(original)
        config = {'domain': 'realms.example.com', 'uiOrigin': 'https://lite.example.com',
                  'mainOrigins': ['https://main.example.com'], 'releasePath': str(source),
                  'revision': manifest['revision']}
        installer.CONFIG_PATH.write_text(json.dumps(config))
        installer.CONFIG_PATH.chmod(0o600)
        events, selected = [], [None]
        def restart():
            events.append('restart')
            selected[0] = hashlib.sha256(installer.CONFIG_PATH.read_bytes()).hexdigest() if installer.CONFIG_PATH.exists() else None
        def health():
            assert selected[0] == (hashlib.sha256(installer.CONFIG_PATH.read_bytes()).hexdigest() if installer.CONFIG_PATH.exists() else None)
        activation = Activation(config=installer.CONFIG_PATH, site=site, journal=installer.DEPLOY_ROOT / 'pending.json',
            validate_nginx=lambda: events.append('validate'), reload_nginx=lambda: events.append('reload'),
            restart_manager=restart, health=health)
        installer.production_activation = lambda: activation
        os.environ.update(APP_USER='vibetop', INSTALL_DEPS='0')
        os.environ.pop('DEFER_MANAGER_RESTART', None)
        sys.argv = ['install-proxy.py']
        installer.main()
        installed = json.loads(installer.CONFIG_PATH.read_bytes())
        release = Path(installed['releasePath'])
        assert release.parent == installer.RELEASE_ROOT / 'releases'
        assert validate(release)['revision'] == installed['revision']
        assert without_browser_site(site.read_text()) == original
        assert events == ['validate', 'reload', 'restart']
        events.clear()
        installer.main()  # Same source/revision must neither reload nor restart.
        assert not events
        assert not activation.journal.exists()
        profile = parent / 'website-profile'
        profile.write_bytes(b'preserved website state')
        stopped = []
        installer.subprocess.check_output = lambda *args, **kwargs: 'vibetop-browser-proxy-1000-rewrite.socket loaded active\nvibetop-uterm-junjie-1.service loaded active\nvibetop-browser-proxy-1000-rewrite.service loaded active\n'
        installer.subprocess.run = lambda args, **kwargs: stopped.append(args)
        sys.argv = ['install-proxy.py', '--uninstall']
        installer.main()
        assert json.loads(installer.CONFIG_PATH.read_bytes())['enabled'] is False
        assert '# BEGIN VIBETOP BROWSER LITE' not in site.read_text()
        assert '$vt_browser_main_host_allowed' in site.read_text()
        assert profile.read_bytes() == b'preserved website state'
        assert all(name.endswith('.socket') for name in stopped[0][2:])
        assert all(name.endswith('.service') for name in stopped[1][2:])
        assert all('vibetop-uterm' not in ' '.join(command) for command in stopped)
        print('PASS: real offline APP_USER build, root publication, configuration activation, unrelated site preserved, repeated install no-op, uninstall preserves profiles and main host guard')
    finally:
        shutil.rmtree(parent)


if __name__ == '__main__':
    main()
