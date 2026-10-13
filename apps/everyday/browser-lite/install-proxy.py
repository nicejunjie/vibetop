#!/usr/bin/env python3
"""Build and activate Browser Lite; ordinary updates reuse verified dependencies."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'server'))
from browser_proxy_deploy import production_activation, read_regular
from browser_proxy_nginx import render, main_host_map, update_browser_site
from browser_proxy_publish import publish
from browser_proxy_release import validate_ancestors
from browser_proxy_runtime import directory

CONFIG_PATH = Path('/etc/vibetop/browser-proxy.json')
RELEASE_ROOT = Path('/opt/vibetop-browser-proxy')
DEPLOY_ROOT = Path('/var/lib/vibetop/browser-proxy-deploy')
GUARD_USER = 'vibetop-browser-egress'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, help='Initial HTTPS host configuration; explicit installation only')
    parser.add_argument('--uninstall', action='store_true', help='Remove rewrite routing; preserve website profiles and identity')
    parser.add_argument('--force', action='store_true', help='Allow explicit rollback of a pending restart after its watchdog has stopped')
    parser.add_argument('--recover', action='store_true', help='Roll back a pending activation after repairing any reported nginx error')
    parser.add_argument('--dry-run', '-n', action='store_true')
    args = parser.parse_args()
    if args.uninstall:
        if os.geteuid() != 0:
            parser.error('Uninstall requires root')
        if not CONFIG_PATH.exists():
            print(json.dumps({'status': 'not-installed', 'changed': False}))
            return
        validate_ancestors(DEPLOY_ROOT)
        lock_fd = os.open(DEPLOY_ROOT / 'install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(lock_fd, 'w') as uninstall_lock:
            fcntl.flock(uninstall_lock, fcntl.LOCK_EX)
            activation = production_activation()
            activation.recover()
            current = read_regular(activation.site).decode()
            # Retain the strict main-host map/guard after removing sibling vhosts.
            site = re.sub(r'(?m)^# BEGIN VIBETOP BROWSER LITE\n[\s\S]*?^# END VIBETOP BROWSER LITE\n?', '', current)
            disabled = {**json.loads(read_regular(CONFIG_PATH)), 'enabled': False}
            activation.activate((json.dumps(disabled, sort_keys=True) + '\n').encode(), site.encode())
            units = subprocess.check_output(['systemctl', 'list-units', '--all', '--plain', '--no-legend', 'vibetop-browser-proxy-*'], text=True)
            names = [line.split()[0] for line in units.splitlines() if line.split()]
            names = [name for name in names if re.fullmatch(r'vibetop-browser-proxy-[0-9]+-(?:rewrite|egress)\.(?:socket|service)', name)]
            for suffix in ('.socket', '.service'):
                targets = [name for name in names if name.endswith(suffix)]
                if targets:
                    subprocess.run(['systemctl', 'stop', *targets], check=True, timeout=45)
        print(json.dumps({'status': 'uninstalled', 'profilesPreserved': True}))
        return
    if args.recover:
        if os.geteuid() != 0:
            parser.error('Recovery requires root')
        if not (DEPLOY_ROOT / 'pending.json').exists():
            print(json.dumps({'status': 'nothing-to-recover', 'changed': False}))
            return
        validate_ancestors(DEPLOY_ROOT)
        lock_fd = os.open(DEPLOY_ROOT / 'install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(lock_fd, 'w') as recovery_lock:
            fcntl.flock(recovery_lock, fcntl.LOCK_EX)
            activation = production_activation()
            record = activation._record()
            if record and record['phase'] == 'pending-restart' and not args.force:
                parser.error('A restart is pending. Wait for its watchdog, or use --recover --force after it has stopped')
            activation.rollback()
        print(json.dumps({'status': 'recovered'}))
        return
    installed = CONFIG_PATH
    download = os.environ.get('INSTALL_DEPS', '0') == '1'
    if not installed.exists() and args.config is None:
        if download:
            parser.error('First installation requires --config with domain, uiOrigin and mainOrigins')
        print(json.dumps({'status': 'skipped', 'changed': False, 'message': 'Browser Lite rewrite runtime is not installed.'}))
        return
    if args.config and (installed.exists() or not download):
        parser.error('--config is only accepted for an explicit first installation with INSTALL_DEPS=1')
    config = json.loads(read_regular(args.config or installed, 8192))
    if config.get('enabled', True) is False and not download:
        print(json.dumps({'status': 'skipped', 'changed': False, 'message': 'Browser Lite is disabled.'}))
        return
    render(config['domain'], config['uiOrigin'], config['mainOrigins'], include_main_map=False)
    main_host_map(config['mainOrigins'], config.get('localHosts', []))
    account = pwd.getpwnam(os.environ.get('APP_USER', 'vibetop'))
    if account.pw_uid == 0:
        parser.error('APP_USER must be a nonroot service account')
    if args.dry_run:
        print(json.dumps({'status': 'planned', 'builder': account.pw_name, 'download': download}))
        return
    if os.geteuid() != 0:
        parser.error('Installation requires root')
    os.umask(0o022)
    node_version = subprocess.check_output(['/usr/bin/node', '--version'], text=True).strip()
    if not node_version.startswith('v22.'):
        parser.error('Browser Lite requires Node 22')
    # Ancestors are root-owned, separate from service-account-owned /opt/vibetop.
    base = RELEASE_ROOT
    for path in (base, base / 'releases', DEPLOY_ROOT):
        directory(path, 0, 0, 0o755)
        validate_ancestors(path)
    activation = production_activation()
    lock_fd = os.open(DEPLOY_ROOT / 'install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'w') as installation_lock:
        fcntl.flock(installation_lock, fcntl.LOCK_EX)
        activation.recover()
        if installed.exists():
            config = json.loads(read_regular(installed, 8192))
        if not activation.site.is_file():
            parser.error('Install the Vibetop main nginx site first')
        if not installed.exists() and args.config is None:
            parser.error('Recovered an interrupted first installation; repeat the explicit install')
        try:
            pwd.getpwnam(GUARD_USER)
        except KeyError:
            subprocess.run(['useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', GUARD_USER], check=True)
        with tempfile.TemporaryDirectory(prefix='vt-browser-install-', dir='/var/tmp') as temporary:
            stage = Path(temporary)
            stage.chmod(0o755)
            checkout = stage / 'source'
            app = checkout / 'apps/everyday/browser-lite'
            app.mkdir(parents=True, mode=0o755)
            (checkout / 'server').mkdir(mode=0o755)
            shutil.copyfile(ROOT / 'server/browser_proxy_release.py', checkout / 'server/browser_proxy_release.py')
            shutil.copyfile(Path(__file__), app / 'install-proxy.py')
            shutil.copyfile(Path(__file__).with_name('build-release.py'), app / 'build-release.py')
            (app / 'proxy').mkdir(mode=0o755)
            for item in Path(__file__).with_name('proxy').iterdir():
                if item.is_file() and (item.suffix in ('.cjs', '.js', '.css', '.html') or item.name in ('package.json', 'pnpm-lock.yaml')):
                    shutil.copyfile(item, app / 'proxy' / item.name)
            build = stage / 'build'
            build.mkdir(mode=0o755)
            os.chown(build, account.pw_uid, account.pw_gid)
            command = ['timeout', '--signal=TERM', '--kill-after=5s', '240s', 'runuser', '-u', account.pw_name, '--', '/usr/bin/python3', str(app / 'build-release.py'), str(build / 'bundle')]
            if download:
                pnpm = os.environ.get('PNPM_JS')
                if not pnpm:
                    parser.error('Explicit dependency download requires PNPM_JS pointing to pnpm 10.18.3')
                command += ['--download', '--pnpm-js', str(Path(pnpm).resolve(strict=True))]
            else:
                command += ['--reuse', config['releasePath']]
            subprocess.run(command, check=True, cwd=stage, timeout=250)
            release, manifest = publish(build / 'bundle', base / 'releases', account.pw_uid, node_version=node_version)
            candidate = {**config, 'enabled': True, 'releasePath': str(release), 'revision': manifest['revision']}
            data = (json.dumps(candidate, sort_keys=True) + '\n').encode()
            site = update_browser_site(read_regular(activation.site).decode(), candidate,
                                       [socket.gethostname(), socket.getfqdn()]).encode()
            result = activation.activate(data, site, defer_manager=os.environ.get('DEFER_MANAGER_RESTART') == '1')
            print(json.dumps({'status': 'pending' if result['pending'] else 'ready', 'revision': manifest['revision'], **result}))


if __name__ == '__main__':
    main()
