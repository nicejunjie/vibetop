"""Recoverable Browser Lite config/site activation; never touches user state."""
import base64
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile


def atomic(path, data, mode):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read_regular(path, limit=8 * 1024 * 1024):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or metadata.st_size > limit:
            raise ValueError('Invalid Browser Lite deployment file')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Browser Lite deployment file is too large')
        return data
    finally:
        os.close(fd)


class Activation:
    """Caller holds root-owned deployment paths; callbacks raise on failure.

    The journal records only the two fixed configuration targets. It cannot
    redirect recovery to arbitrary files, and never includes identity/profiles.
    A deferred manager restart keeps the journal until its health check finishes.
    """
    def __init__(self, *, config, site, journal, validate_nginx, reload_nginx, restart_manager, health, manager_instance=lambda: None):
        self.config, self.site, self.journal = map(Path, (config, site, journal))
        self.validate_nginx, self.reload_nginx = validate_nginx, reload_nginx
        self.restart_manager, self.health = restart_manager, health
        self.manager_instance = manager_instance

    @contextlib.contextmanager
    def locked(self):
        fd = os.open(str(self.journal) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode) or os.fstat(fd).st_nlink != 1:
                raise ValueError('Invalid Browser Lite deployment lock')
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)

    @staticmethod
    def encoded(data):
        return None if data is None else base64.b64encode(data).decode('ascii')

    def _record(self):
        data = read_regular(self.journal, 24 * 1024 * 1024)
        if data is None:
            return None
        record = json.loads(data)
        if set(record) != {'version', 'phase', 'config', 'site', 'newConfigHash', 'nginxChanged', 'oldInstance'} or record['version'] != 3:
            raise ValueError('Invalid Browser Lite deployment journal')
        if record['phase'] not in ('staged', 'pending-restart'):
            raise ValueError('Invalid Browser Lite deployment phase')
        return record

    def _clear(self):
        self.journal.unlink()
        sync_directory(self.journal.parent)

    def _restore(self, record, refresh_manager=True):
        for path, key, mode in ((self.site, 'site', 0o644), (self.config, 'config', 0o600)):
            if record[key] is None:
                path.unlink(missing_ok=True)
                sync_directory(path.parent)
            else:
                atomic(path, base64.b64decode(record[key], validate=True), mode)
        self.validate_nginx()
        if record['nginxChanged']:
            self.reload_nginx()
        # Even failed activation may have let the manager load candidate config.
        if refresh_manager:
            self.restart_manager()
            self.health()
        self._clear()

    def rollback(self, *, refresh_manager=True):
        """Update source rollback refreshes the manager after restoring code."""
        with self.locked():
            record = self._record()
            if record:
                self._restore(record, refresh_manager)

    def _adopted(self, record):
        self.health()
        if record['oldInstance'] is not None and self.manager_instance() == record['oldInstance']:
            raise RuntimeError('Browser Lite manager has not restarted')

    def recover_pending(self):
        """Safe from the live manager: never restart it or undo staged files."""
        with self.locked():
            record = self._record()
            if record:
                if record['phase'] != 'pending-restart':
                    raise RuntimeError('Interrupted Browser Lite activation needs install.sh --recover')
                self._recover(record)

    def _recover(self, record):
        if record['phase'] == 'pending-restart':
            # Another installer must not roll back a watchdog that is still
            # restarting the parent manager. Prove adoption or leave it pending.
            try:
                current = read_regular(self.config)
                if (hashlib.sha256(current).hexdigest() if current is not None else None) != record['newConfigHash']:
                    raise ValueError('Candidate changed')
                self._adopted(record)
            except Exception as error:
                raise RuntimeError('Browser Lite activation is pending; wait for its restart watchdog') from error
            self._clear()
        else:
            self._restore(record)

    def recover(self):
        with self.locked():
            record = self._record()
            if record:
                self._recover(record)
            return bool(record)

    def finish(self):
        """Called by the out-of-band restart watchdog after manager activation."""
        with self.locked():
            record = self._record()
            if not record:
                return
            if record['phase'] != 'pending-restart':
                raise RuntimeError('Interrupted activation needs recovery before confirmation')
            try:
                current = read_regular(self.config)
                if (hashlib.sha256(current).hexdigest() if current is not None else None) != record['newConfigHash']:
                    raise ValueError('Browser Lite candidate configuration changed')
                self._adopted(record)
            except Exception:
                self._restore(record)
                raise
            self._clear()

    def activate(self, config, site, *, defer_manager=False):
        with self.locked():
            previous = self._record()
            if previous:
                self._recover(previous)
            old_config, old_site = read_regular(self.config), read_regular(self.site)
            if old_site is None:
                raise ValueError('Install the main nginx site before Browser Lite')
            if old_config == config and old_site == site:
                return {'changed': False, 'pending': False}
            record = {'version': 3, 'phase': 'staged', 'oldInstance': self.manager_instance(), 'config': self.encoded(old_config), 'site': self.encoded(old_site),
                      'newConfigHash': hashlib.sha256(config).hexdigest() if config is not None else None, 'nginxChanged': old_site != site}
            atomic(self.journal, json.dumps(record).encode(), 0o600)
            try:
                if record['nginxChanged']:
                    atomic(self.site, site, 0o644)
                self.validate_nginx()
                if config is None:
                    self.config.unlink(missing_ok=True)
                    sync_directory(self.config.parent)
                else:
                    atomic(self.config, config, 0o600)
                if record['nginxChanged']:
                    self.reload_nginx()
                if defer_manager:
                    record['phase'] = 'pending-restart'
                    atomic(self.journal, json.dumps(record).encode(), 0o600)
                    return {'changed': True, 'pending': True}
                self.restart_manager()
                self.health()
            except Exception:
                self._restore(record)
                raise
            self._clear()
            return {'changed': True, 'pending': False}


def production_activation(port=7680):
    """Fixed root-owned targets, shared by installer and update watchdog."""
    import subprocess
    import time
    import urllib.error
    import urllib.request
    config = Path('/etc/vibetop/browser-proxy.json')
    site = Path('/etc/nginx/sites-available/vibetop') if Path('/etc/nginx/sites-enabled').is_dir() else Path('/etc/nginx/conf.d/vibetop.conf')
    def run(*args):
        subprocess.run(args, check=True, capture_output=True, timeout=45)
    def health():
        raw = read_regular(config)
        expected = hashlib.sha256(raw).hexdigest() if raw and json.loads(raw).get('enabled', True) else None
        deadline = time.monotonic() + 75
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/__browser_proxy/status', timeout=2) as response:
                    if json.load(response).get('configHash') == expected:
                        return
            except urllib.error.HTTPError as error:
                if error.code == 404 and expected is None:
                    return
            except (OSError, ValueError):
                pass
            time.sleep(.25)
        raise RuntimeError('Browser Lite manager did not select the installed revision')
    return Activation(config=config, site=site, journal='/var/lib/vibetop/browser-proxy-deploy/pending.json',
        validate_nginx=lambda: run('/usr/sbin/nginx', '-t'),
        reload_nginx=lambda: run('systemctl', 'reload', 'nginx'),
        restart_manager=lambda: run('systemctl', 'restart', 'vibetop-manager.service'), health=health,
        manager_instance=lambda: subprocess.check_output(['systemctl', 'show', 'vibetop-manager.service',
            '-p', 'MainPID', '-p', 'ExecMainStartTimestampMonotonic'], text=True, timeout=10).strip())
