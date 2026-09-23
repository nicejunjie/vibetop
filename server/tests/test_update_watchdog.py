"""The restart watchdog must never overwrite a checkout another update moved."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("update_watchdog", HERE / "update-watchdog.py")
watchdog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watchdog)


def test_rollback_refuses_a_checkout_that_moved(monkeypatch):
    calls = []

    def fake_run(argv, **_kw):
        calls.append(argv)
        return SimpleNamespace(stdout="other-commit\n")

    monkeypatch.setattr(watchdog, "run", fake_run)
    with pytest.raises(RuntimeError, match="checkout moved"):
        watchdog.restore("/srv/vibetop", "vibetop", "old", "expected")
    assert len(calls) == 1
    assert "reset" not in calls[0]


def test_rollback_restores_source_then_redeploys_changed_web_files(monkeypatch):
    calls = []
    outputs = iter(["expected\n", "", "shell/desktop.html\n"])

    def fake_run(argv, **_kw):
        calls.append(argv)
        return SimpleNamespace(stdout=next(outputs, ""))

    monkeypatch.setattr(watchdog, "run", fake_run)
    watchdog.restore("/srv/vibetop", "vibetop", "old", "expected")
    assert calls[3][-3:] == ["reset", "--hard", "old"]
    assert calls[4][-1] == "/srv/vibetop/shell/install.sh"
