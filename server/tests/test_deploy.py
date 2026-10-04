"""Exercise installer failures without root, packages, or live services."""
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]


def script(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('#!/bin/bash\n' + body + '\n')
    path.chmod(0o755)


@pytest.fixture
def deployment(tmp_path):
    repo = tmp_path / 'repo'
    bins = tmp_path / 'bin'
    bins.mkdir()
    repo.mkdir()
    shutil.copy(ROOT / 'deploy.sh', repo / 'deploy.sh')
    script(repo / 'tools/lib/layout.sh', '''
VT_OPT=/fake/opt
vt_require_root() { :; }
vt_existing_home_install() { echo /fake/vibetop-www; }
''')
    shutil.copy(ROOT / 'tools/lib/dependencies.sh', repo / 'tools/lib/dependencies.sh')
    script(repo / 'tools/lib/osdeps.sh', '''
VT_FAMILY=debian
vt_require_commands() {
    for tool in "$@"; do
        command -v "$tool" >/dev/null || { echo "Missing required command: $tool" >&2; return 1; }
    done
}
vt_pkg_refresh() { return "${REFRESH_RC:-0}"; }
vt_pkg_install() {
    echo "install:$*"
    [ "${PKG_RC:-0}" = 0 ] || return "$PKG_RC"
    if [ "${RESTORE_CURL:-0}" = 1 ]; then
        printf '#!/bin/bash\\nexit 0\\n' > "$PATH/curl"
        /bin/chmod +x "$PATH/curl"
    fi
}
vt_firewall_open_web() { :; }
''')
    for name in ['server', 'shell', 'apps/utilities/claude-usage',
                 'apps/everyday/browser', 'apps/everyday/files', 'apps/everyday/office', 'tunnel']:
        script(repo / name / 'install.sh', f'''
if [ "${{1:-}}" = --deps-only ]; then
    echo "deps:{name}"
    [ "${{FAIL_DEPS:-}}" != "{name}" ] || exit 1
else
    echo "installer-ran:{name}:${{INSTALL_DEPS:-unset}}"
fi
''')
    script(repo / 'tools/smoke-test.sh', 'echo smoke-ran; exit "${SMOKE_RC:-0}"')
    for name in ['env', 'dirname', 'seq', 'awk', 'sort', 'uniq', 'grep']:
        (bins / name).symlink_to(shutil.which(name))
    for name in ['git', 'rsync', 'sleep', 'ip', 'wget', 'python3', 'openssl', 'ps', 'flock', 'find', 'tar', 'gzip', 'useradd']:
        script(bins / name, 'exit 0')
    script(bins / 'sudo', '"$@"')
    script(bins / 'systemctl', 'exit "${RESTART_RC:-0}"')
    script(bins / 'curl', 'exit "${CURL_RC:-0}"')

    def run(flags=None, **env):
        return subprocess.run(
            ['/bin/bash', str(repo / 'deploy.sh'), *(flags if flags is not None else ['--no-browser', '--no-files', '--no-office'])],
            env={**os.environ, 'PATH': str(bins), **env},
            text=True, capture_output=True, timeout=10,
        )
    return run, bins


def test_missing_curl_stops_before_installers(deployment):
    run, bins = deployment
    (bins / 'curl').unlink()
    result = run()
    assert result.returncode != 0
    assert 'install:curl' in result.stdout
    assert 'Missing required command: curl' in result.stderr
    assert 'installer-ran' not in result.stdout


def test_failed_package_install_stops(deployment):
    run, bins = deployment
    (bins / 'curl').unlink()
    result = run(PKG_RC='1')
    assert result.returncode != 0
    assert 'installer-ran' not in result.stdout


@pytest.mark.parametrize('env', [{'CURL_RC': '7'}, {'RESTART_RC': '1'}, {'SMOKE_RC': '1'}, {'SMOKE_RC': '2'}])
def test_failed_verification_never_reports_success(deployment, env):
    run, _ = deployment
    result = run(**env)
    assert result.returncode != 0, result.stdout + result.stderr
    assert 'restart manager' in result.stdout
    assert 'Vibetop deployed.' not in result.stdout


def test_successful_deploy(deployment):
    run, _ = deployment
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'smoke-ran' in result.stdout
    assert 'Vibetop deployed.' in result.stdout


def test_smoke_missing_curl_exits_once(tmp_path):
    for name in ['readlink', 'dirname']:
        (tmp_path / name).symlink_to(shutil.which(name))
    result = subprocess.run(
        ['/bin/bash', str(ROOT / 'tools/smoke-test.sh')],
        env={**os.environ, 'PATH': str(tmp_path)}, text=True, capture_output=True, timeout=5,
    )
    assert result.returncode == 2
    assert "required command 'curl' is missing" in result.stderr
    assert 'FAIL' not in result.stdout


@pytest.mark.parametrize('component', ['server', 'apps/everyday/browser', 'apps/everyday/files', 'apps/everyday/office', 'tunnel'])
def test_component_dependency_failure_prevents_all_configuration(deployment, component):
    run, _ = deployment
    result = run(flags=['--with-tunnel'], FAIL_DEPS=component)
    assert result.returncode != 0
    assert f'deps:{component}' in result.stdout
    assert 'installer-ran' not in result.stdout
    assert 'existing home-based install' not in result.stdout


def test_all_dependencies_precede_configuration(deployment):
    run, _ = deployment
    result = run(flags=['--with-tunnel'])
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.index('deps:tunnel') < result.stdout.index('installer-ran:server:0')
    assert 'installer-ran:apps/everyday/office:0' in result.stdout


def test_disabled_components_skip_dependencies(deployment):
    run, _ = deployment
    result = run()
    assert result.returncode == 0
    assert 'deps:server' in result.stdout
    assert 'deps:apps/' not in result.stdout
    assert 'deps:tunnel' not in result.stdout


def test_missing_curl_is_installed_before_components(deployment):
    run, bins = deployment
    (bins / 'curl').unlink()
    result = run(RESTORE_CURL='1')
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.index('install:curl') < result.stdout.index('deps:server')


def test_metadata_failure_stops_before_install(deployment):
    run, bins = deployment
    (bins / 'curl').unlink()
    result = run(REFRESH_RC='1')
    assert result.returncode != 0
    assert 'install:' not in result.stdout
    assert 'deps:server' not in result.stdout


def test_dependency_dry_run_does_not_install_missing_tools(deployment):
    run, bins = deployment
    (bins / 'curl').unlink()
    result = run(flags=['--dry-run', '--no-browser', '--no-files', '--no-office'])
    assert result.returncode == 0, result.stdout + result.stderr
    assert '+ install missing prerequisites: curl' in result.stdout
    assert 'install:curl' not in result.stdout
    assert not (bins / 'curl').exists()
