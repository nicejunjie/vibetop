import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def test_absent_optional_runtime_skips_before_any_account_or_service_work(tmp_path, monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location('test_lite_installer', ROOT / 'apps/everyday/browser-lite/install-proxy.py')
    installer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installer)
    monkeypatch.setattr(installer, 'CONFIG_PATH', tmp_path / 'absent.json')
    monkeypatch.setenv('INSTALL_DEPS', '0')
    monkeypatch.setattr(sys, 'argv', ['install-proxy.py'])
    def unexpected(*args, **kwargs):
        raise AssertionError('Skipped installation must not inspect accounts or change services')
    monkeypatch.setattr(installer.pwd, 'getpwnam', unexpected)
    monkeypatch.setattr(installer, 'production_activation', unexpected)
    installer.main()
    assert json.loads(capsys.readouterr().out)['status'] == 'skipped'
    assert not list(tmp_path.iterdir())
