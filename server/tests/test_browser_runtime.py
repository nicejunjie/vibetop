"""Execute the shipped installer/launcher logic against an isolated fake host.

Only executable paths and external commands are replaced. Dependency decisions,
launch arguments, profile rules, and restart behavior come from the real scripts.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/everyday/browser'
CANDIDATES = ('/snap/bin/chromium', '/usr/bin/chromium',
              '/usr/bin/chromium-browser', '/usr/bin/chrome')


def executable(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('#!/bin/bash\n' + body + '\n')
    path.chmod(0o755)


@pytest.fixture
def host(tmp_path):
    bins = tmp_path / 'usr/bin'
    bins.mkdir(parents=True)
    for cmd in ('chmod', 'mkdir', 'cat', 'grep', 'head'):
        (bins / cmd).symlink_to(shutil.which(cmd))
    home = tmp_path / 'home/user with spaces'
    home.mkdir(parents=True)
    env = {k: v for k, v in os.environ.items() if k not in ('BROWSER_BIN', 'BROWSER_CMD')}
    env.update(PATH=str(bins), HOME=str(home), LOG=str(tmp_path / 'launches'))
    return tmp_path, bins, home, env


def relocate(source, root):
    return (source.replace('/snap/bin/', str(root) + '/snap/bin/')
            .replace('/snap/*)', str(root) + '/snap/*)')
            .replace('/usr/bin/', str(root) + '/usr/bin/'))


def installer(host, available=(), snap=True, deps=True, dry=False, failure='', source=None):
    root, bins, home, env = host
    for path in available:
        executable(root / path.lstrip('/'), 'exit 0')
    executable(bins / 'sudo', '"$@"')
    if snap:
        executable(bins / 'snap', '''
echo snap-install >> "$LOG"
[ "${FAILURE:-}" != snap ] || exit 42
mkdir -p "$HOST_ROOT/snap/bin"
printf '#!/bin/bash\\nexit 0\\n' > "$HOST_ROOT/snap/bin/chromium"
chmod +x "$HOST_ROOT/snap/bin/chromium"
''')
    source = source if source is not None else (APP / 'install.sh').read_text()
    start = source.index('if [ -z "${BROWSER_CMD:-}" ]')
    end = source.index('\ncat <<EOF', start)
    block = relocate(source[start:end], root)
    prelude = '''set -euo pipefail
run() { if (( DRY_RUN )); then echo "DRY:$*"; else "$@"; fi; }
vt_enable_epel() { echo epel >> "$LOG"; }
vt_pkg_refresh() { echo refresh >> "$LOG"; [ "${FAILURE:-}" != refresh ]; }
vt_pkg_install() {
 echo package-install >> "$LOG"
 [ "${FAILURE:-}" != package ] || return 42
 printf '#!/bin/bash\\nexit 0\\n' > "$HOST_ROOT/usr/bin/chromium"
 chmod +x "$HOST_ROOT/usr/bin/chromium"
}
'''
    result = subprocess.run(['/bin/bash', '-c', prelude + block + '\nprintf "SELECTED:%s\\n" "$BROWSER_CMD"'],
                            env={**env, 'HOST_ROOT': str(root), 'APP_HOME': str(home),
                                 'INSTALL_DEPS': str(int(deps)), 'DRY_RUN': str(int(dry)),
                                 'FAILURE': failure}, capture_output=True, text=True, timeout=5)
    log = Path(env['LOG']).read_text().splitlines() if Path(env['LOG']).exists() else []
    return result, log


@pytest.mark.parametrize('other', [(), ('/snap/bin/firefox',), ('/usr/bin/firefox-esr',),
                                  ('/usr/bin/epiphany',)])
@pytest.mark.parametrize('snap', [False, True])
def test_missing_chromium_installs_despite_other_browsers(host, other, snap):
    result, log = installer(host, available=other, snap=snap)
    assert result.returncode == 0, result.stderr
    assert log == (['snap-install'] if snap else ['epel', 'refresh', 'package-install'])
    assert 'SELECTED:' in result.stdout and 'chromium ' in result.stdout


@pytest.mark.parametrize('binary', CANDIDATES)
@pytest.mark.parametrize('snap', [False, True])
def test_existing_chromium_skips_install_and_selects_matching_profile(host, binary, snap):
    result, log = installer(host, available=(binary,), snap=snap)
    assert result.returncode == 0, result.stderr
    assert log == []
    assert str(host[0] / binary.lstrip('/')) in result.stdout
    profile = ('snap/chromium/common/xpra-profile' if binary.startswith('/snap/')
               else '.config/vibetop/chromium-profile')
    assert '--user-data-dir=' + str(host[2] / profile) in result.stdout


@pytest.mark.parametrize('other', [(), ('/snap/bin/firefox',), ('/usr/bin/firefox-esr',),
                                  ('/usr/bin/epiphany',)])
def test_disabled_dependency_install_fails_without_chromium(host, other):
    result, log = installer(host, available=other, deps=False)
    assert result.returncode != 0
    assert 'Chromium is required' in result.stderr
    assert 'SELECTED:' not in result.stdout
    assert log == []


@pytest.mark.parametrize('failure,snap', [('snap', True), ('refresh', False), ('package', False)])
def test_failed_dependency_install_is_fatal(host, failure, snap):
    result, _ = installer(host, failure=failure, snap=snap)
    assert result.returncode != 0
    assert 'SELECTED:' not in result.stdout


def test_dry_run_does_not_install_or_create_browser(host):
    result, log = installer(host, dry=True)
    assert result.returncode == 0, result.stderr
    assert log == []
    assert not (host[0] / 'snap/bin/chromium').exists()


def browser_loop(host, binaries=(), mobile=False, custom_profile=False, change_shape=False, override=None):
    root, _, home, env = host
    for binary in binaries:
        executable(root / binary.lstrip('/'), f'''
if [ "${{1:-}}" = --version ]; then echo 'Chromium 154.0.8037.57'; exit 0; fi
printf '%s\\n' "$0" >> "$SELECTED_LOG"
exec {sys.executable} -c 'import json,os,sys; f=open(os.environ["LOG"],"a"); f.write(json.dumps(sys.argv[1:])+"\\n"); f.close(); sys.exit(7)' "$@"
''')
    expected = (home / 'snap/chromium/common/xpra-profile' if binaries and binaries[0].startswith('/snap/')
                else home / '.config/vibetop/chromium-profile')
    profile = root / 'custom profile' if custom_profile else expected
    profile.mkdir(parents=True)
    if mobile:
        (profile / 'vibetop-shape').write_text('mobile')
    source = root / 'loop.sh'
    source.write_text(relocate((APP / 'browser-loop.sh').read_text(), root))
    # The fake browser exits 7. The REAL loop must retry and reread shape.
    sleep = '''
count=0
sleep() {
 count=$((count+1))
 if [ "$count" = 2 ]; then exit 0; fi
 if [ "$CHANGE_SHAPE" = 1 ]; then echo desktop > "$SHAPE_FILE"; fi
}
source "$LOOP_FILE"'''
    if custom_profile:
        sleep += ' "$TEST_PROFILE"'
    result = subprocess.run(['/bin/bash', '-c', sleep],
                            env={**env, **({'BROWSER_BIN': str(root / override.lstrip('/'))} if override else {}),
                                 'SELECTED_LOG': str(root / 'selected'),
                                 'LOOP_FILE': str(source), 'TEST_PROFILE': str(profile),
                                 'CHANGE_SHAPE': str(int(change_shape)),
                                 'SHAPE_FILE': str(profile / 'vibetop-shape')},
                            capture_output=True, text=True, timeout=5)
    log = Path(env['LOG'])
    launches = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
    return result, launches, profile


@pytest.mark.parametrize('binary', CANDIDATES)
@pytest.mark.parametrize('mobile', [False, True])
def test_launcher_uses_profile_and_restarts_crashed_chromium(host, binary, mobile):
    result, launches, profile = browser_loop(host, (binary,), mobile=mobile)
    assert result.returncode == 0, result.stderr
    assert len(launches) == 2
    for args in launches:
        assert '--user-data-dir=' + str(profile) in args
        assert '--restore-last-session' in args
        assert '--start-maximized' in args
        assert '--enable-unsafe-swiftshader' in args
        assert ('--touch-events=enabled' in args) == mobile
        if mobile:
            assert any('Chrome/154.' in a and 'Mobile Safari' in a for a in args)


def test_launcher_missing_binary_fails_loudly(host):
    result, launches, _ = browser_loop(host)
    assert result.returncode == 127
    assert 'no chromium found' in result.stderr
    assert launches == []


def test_launcher_honors_custom_profile_and_rereads_shape_on_restart(host):
    result, launches, profile = browser_loop(host, ('/usr/bin/chromium',), mobile=True,
                                             custom_profile=True, change_shape=True)
    assert result.returncode == 0, result.stderr
    assert len(launches) == 2
    assert all('--user-data-dir=' + str(profile) in args for args in launches)
    assert '--touch-events=enabled' in launches[0]
    assert '--touch-events=enabled' not in launches[1]


@pytest.fixture
def health():
    spec = importlib.util.spec_from_file_location('browser_health', ROOT / 'tools/browser-health.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def health_host(tmp_path, health, monkeypatch):
    proc = tmp_path / 'proc'
    proc.mkdir()
    state = {'group': '/system.slice/vibetop-ubrowser-alice.service', 'windows': '',
             'window_rc': 0, 'visible': '291\n', 'auth': '', 'commands': []}

    def process(pid=100, group=None, binary='/usr/bin/chromium', display=':200', parent=1,
                profile='/home/alice/.config/vibetop/chromium-profile', extra=()):
        path = proc / str(pid)
        path.mkdir()
        (path / 'cgroup').write_text('0::' + (group or state['group']) + '\n')
        (path / 'status').write_text(f'PPid:\t{parent}\n')
        (path / 'cmdline').write_bytes(b'\0'.join(os.fsencode(a) for a in
                                                (binary, '--user-data-dir=' + profile, *extra)))
        (path / 'environ').write_bytes(b'HOME=/home/alice\0DISPLAY=' + display.encode()
                                      + b'\0XAUTHORITY=/home/alice/.Xauthority\0')

    def run(args, **kwargs):
        state['commands'].append((args, kwargs))
        if args[0] == 'systemctl':
            return subprocess.CompletedProcess(args, 0, state['group'] + '\n', '')
        if args[0] == 'xauth':
            return subprocess.CompletedProcess(args, 0, state['auth'], '')
        if args[0] == 'xdotool':
            assert args == ['xdotool', 'search', '--onlyvisible', '--pid', '100']
            return subprocess.CompletedProcess(args, 0, state['visible'], '')
        assert args == ['wmctrl', '-lpG']
        return subprocess.CompletedProcess(args, state['window_rc'], state['windows'], '')

    monkeypatch.setattr(health, 'run', run)
    return proc, state, process


def test_health_rejects_empty_desktop_even_when_xpra_unit_is_alive(health, health_host):
    proc, _, _ = health_host
    ok, detail = health.probe('vibetop-ubrowser-alice.service', proc)
    assert not ok and 'no main Chromium' in detail


@pytest.mark.parametrize('fault', ['other-user', 'renderer-only', 'wrong-profile', 'no-display',
                                  'no-window', 'other-window', 'zero-size', 'hidden-window', 'x-auth', 'no-unit'])
def test_health_cannot_pass_on_unrelated_or_unusable_chromium(health, health_host, fault):
    proc, state, process = health_host
    kwargs = {}
    if fault == 'other-user':
        kwargs['group'] = '/system.slice/vibetop-ubrowser-bob.service'
    if fault == 'renderer-only':
        kwargs['extra'] = ('--type=renderer',)
    if fault == 'wrong-profile':
        kwargs['profile'] = '/home/alice/.config/chromium'
    if fault == 'no-display':
        kwargs['display'] = ''
    process(**kwargs)
    state['windows'] = '0x123 0 100 0 0 1200 800 chromium.Chromium host New Tab\n'
    if fault == 'no-window':
        state['windows'] = ''
    if fault == 'other-window':
        state['windows'] = state['windows'].replace(' 100 ', ' 999 ')
    if fault == 'zero-size':
        state['windows'] = state['windows'].replace('1200 800', '0 0')
    if fault == 'hidden-window':
        state['visible'] = ''
    if fault == 'x-auth':
        state['window_rc'] = 1
    if fault == 'no-unit':
        state['group'] = ''
    assert not health.probe('vibetop-ubrowser-alice.service', proc)[0]


@pytest.mark.parametrize('snap', [False, True])
def test_health_accepts_own_managed_window_and_preserves_x_environment(health, health_host, snap):
    proc, state, process = health_host
    process(binary='/snap/chromium/3548/usr/lib/chromium-browser/chrome' if snap else '/usr/bin/chromium',
            profile='/home/alice/snap/chromium/common/xpra-profile' if snap else
                    '/home/alice/.config/vibetop/chromium-profile')
    state['windows'] = '0x123 0 100 0 0 1200 800 chromium.Chromium host New Tab\n'
    state['auth'] = 'old-host/unix:200 MIT-MAGIC-COOKIE-1 cookie-never-log\n'
    ok, detail = health.probe('vibetop-ubrowser-alice.service', proc)
    assert ok and '0x123' in detail and 'cookie' not in detail
    env = state['commands'][-1][1]['env']
    assert env['DISPLAY'] == ':200'
    assert env['XAUTHORITY'] == '/home/alice/.Xauthority'
    assert env['XAUTHLOCALHOSTNAME'] == 'old-host'


def test_health_handles_snap_scope_and_snap_rewritten_home(health, health_host):
    proc, state, process = health_host
    process(pid=50, binary='/bin/bash')  # browser-loop in the service
    process(parent=50, group='/user.slice/snap.chromium.scope',
            binary='/snap/chromium/3548/usr/lib/chromium-browser/chrome',
            profile='/home/alice/snap/chromium/common/xpra-profile')
    (proc / '100/environ').write_bytes(b'HOME=/home/alice/snap/chromium/3548\0'
                                      b'SNAP_REAL_HOME=/home/alice\0DISPLAY=:200\0')
    state['windows'] = '0x123 0 100 0 0 1200 800 host New Tab - Chromium\n'
    assert health.probe('vibetop-ubrowser-alice.service', proc)[0]


def test_health_rejects_unrelated_snap_scope_and_parent_cycle(health, health_host):
    proc, state, process = health_host
    process(parent=100, group='/user.slice/snap.chromium.scope')
    state['windows'] = '0x123 0 100 0 0 1200 800 host New Tab - Chromium\n'
    assert not health.probe('vibetop-ubrowser-alice.service', proc)[0]


def test_health_ignores_processes_that_exit_during_probe(health, health_host):
    proc, state, process = health_host
    process()
    (proc / '100/environ').unlink()
    assert not health.probe('vibetop-ubrowser-alice.service', proc)[0]


@pytest.fixture
def smoke_host(tmp_path):
    bins = tmp_path / 'bin'
    bins.mkdir()
    for cmd in ('readlink', 'dirname', 'tr', 'awk', 'wc', 'grep'):
        (bins / cmd).symlink_to(shutil.which(cmd))
    executable(bins / 'curl', '''
url="${!#}"
case "$url" in
 */api/authcheck)
   if [[ " $* " == *" -D "* ]]; then
      printf 'HTTP/1.1 200 OK\\r\\nX-Vibetop-User: alice\\r\\n\\r\\n'
   else printf 200; fi ;;
 */api/ping) echo '{"ok":true}' ;;
 */api/events) echo 'retry: 1000' ;;
 */api/system/status) echo '{"cpu":1}' ;;
 */api/terminals/status) echo '{"running":true}' ;;
 */) if [[ " $* " == *"Cookie:"* ]]; then printf 200; else printf 302; fi ;;
 *) printf 200 ;;
esac
''')
    executable(bins / 'systemctl', 'echo active')
    executable(bins / 'python3', '''
printf '%s\\n' "$*" >> "$HEALTH_LOG"
echo 'fake Browser window probe'
exit "$HEALTH_RC"
''')
    source = (ROOT / 'tools/smoke-test.sh').read_text()
    # Make browser deployment detection deterministic on any CI host.
    snippets = tmp_path / 'snippets'
    snippets.mkdir()
    (snippets / 'browser.conf').touch()
    source = source.replace('/etc/nginx/snippets/vibetop-extras.d', str(snippets))
    smoke = tmp_path / 'repo/tools/smoke-test.sh'
    smoke.parent.mkdir(parents=True)
    smoke.write_text(source)

    def invoke(rc=0, flags=()):
        log = tmp_path / 'health-log'
        result = subprocess.run(['/bin/bash', str(smoke), '--no-office', '--cookie',
                                 'vt_session=fake-test-cookie', '--user', 'bob', *flags],
                                env={**os.environ, 'PATH': str(bins), 'HEALTH_RC': str(rc),
                                     'HEALTH_LOG': str(log)},
                                capture_output=True, text=True, timeout=5)
        return result, log.read_text() if log.exists() else ''
    return invoke


@pytest.mark.parametrize('rc', [1, 2, 127])
def test_http_200_does_not_hide_failed_browser_health(smoke_host, rc):
    result, log = smoke_host(rc)
    assert result.returncode == 1, result.stdout + result.stderr
    assert 'browser xpra (/browser/ -> 200)' in result.stdout
    assert 'FAIL' in result.stdout and 'fake Browser window probe' in result.stdout
    assert '--unit vibetop-ubrowser-alice.service' in log
    assert 'ubrowser-bob' not in log  # cookie identity wins over --user


def test_smoke_passes_only_with_browser_window_health(smoke_host):
    result, log = smoke_host()
    assert result.returncode == 0, result.stdout + result.stderr
    assert '--unit vibetop-ubrowser-alice.service' in log


@pytest.mark.parametrize('flags', [('--no-browser',), ('--base', 'https://remote.example')])
def test_smoke_explicitly_skips_unavailable_local_window_checks(smoke_host, flags):
    result, log = smoke_host(flags=flags)
    assert result.returncode == 0, result.stdout + result.stderr
    assert log == ''
    assert 'SKIP' in result.stdout


def test_installer_and_launcher_prefer_snap_when_multiple_browsers_exist(host):
    result, log = installer(host, available=CANDIDATES)
    assert result.returncode == 0 and log == []
    selected = result.stdout.split('SELECTED:', 1)[1]
    assert selected.startswith(str(host[0] / 'snap/bin/chromium') + ' ')
    result, launches, _ = browser_loop(host, CANDIDATES)
    assert result.returncode == 0 and len(launches) == 2
    assert set((host[0] / 'selected').read_text().splitlines()) == {
        str(host[0] / 'snap/bin/chromium')}


def test_launcher_honors_explicit_binary_override(host):
    result, launches, _ = browser_loop(host, ('/usr/bin/chromium', '/usr/bin/chrome'),
                                       override='/usr/bin/chrome')
    assert result.returncode == 0 and len(launches) == 2
    assert set((host[0] / 'selected').read_text().splitlines()) == {str(host[0] / 'usr/bin/chrome')}


def test_nonexecutable_browser_is_not_a_satisfied_dependency(host):
    path = host[0] / 'snap/bin/chromium'
    path.parent.mkdir(parents=True)
    path.write_text('not executable')
    result, log = installer(host)
    assert result.returncode == 0 and log == ['snap-install']


@pytest.mark.parametrize('available', [(), *[(c,) for c in CANDIDATES], CANDIDATES])
def test_manager_uses_same_candidate_priority_and_profile_as_launcher(mgr, monkeypatch, available):
    monkeypatch.setattr(mgr, '_user_home', lambda user: '/home/alice with spaces')
    real_access = os.access
    monkeypatch.setattr(mgr.os, 'access', lambda path, mode: path in available
                        if path in CANDIDATES else real_access(path, mode))
    binary, profile = mgr._chromium_for_user('alice')
    if not available:
        assert (binary, profile) == (None, None)
    else:
        assert binary == available[0]
        suffix = ('snap/chromium/common/xpra-profile' if binary.startswith('/snap/')
                  else '.config/vibetop/chromium-profile')
        assert profile == '/home/alice with spaces/' + suffix


def test_manager_skips_nonexecutable_candidate_even_if_it_exists(mgr, monkeypatch):
    monkeypatch.setattr(mgr, '_user_home', lambda user: '/home/alice')
    real_exists, real_access = os.path.exists, os.access
    monkeypatch.setattr(mgr.os.path, 'exists', lambda path: True if path in CANDIDATES else real_exists(path))
    monkeypatch.setattr(mgr.os, 'access', lambda path, mode: path == '/usr/bin/chromium'
                        if path in CANDIDATES else real_access(path, mode))
    assert mgr._chromium_for_user('alice') == (
        '/usr/bin/chromium', '/home/alice/.config/vibetop/chromium-profile')


@pytest.mark.parametrize('missing', [None, 'xpra', 'Xorg', 'matchbox-window-manager', 'wmctrl',
                                     'xhost', 'xdotool', 'dbus-daemon', 'soffice', 'chromium'])
def test_browser_prerequisite_gate_rejects_every_missing_runtime_tool(host, missing):
    _, bins, _, env = host
    for name in ('xpra', 'Xorg', 'matchbox-window-manager', 'wmctrl', 'xhost',
                 'xdotool', 'dbus-daemon', 'soffice', 'chromium'):
        if name != missing:
            executable(bins / name, 'exit 0')
    dependencies = (ROOT / 'tools/lib/osdeps.sh').read_text()
    start = dependencies.index('vt_require_commands() {')
    require = dependencies[start:dependencies.index('\n}\n', start) + 3]
    source = (APP / 'install.sh').read_text()
    start = source.index('if (( ! DRY_RUN )); then')
    gate = source[start:source.index('\nfi', start) + 3]
    result = subprocess.run(['/bin/bash', '-c', 'set -euo pipefail\n' + require + gate + '\necho READY'],
                            env={**env, 'DRY_RUN': '0', 'BROWSER_CMD': 'chromium --start-maximized'},
                            capture_output=True, text=True, timeout=5)
    if missing:
        assert result.returncode != 0
        assert 'Missing required command: ' + missing in result.stderr
        assert 'READY' not in result.stdout
    else:
        assert result.returncode == 0 and 'READY' in result.stdout
