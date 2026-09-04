"""Fixtures for the vibetop-claude-proxy unit tests.

The proxy program has no `.py` extension, so load it by path with an explicit
SourceFileLoader (its `if __name__ == '__main__'` guard means import only
defines functions/classes — no server/socket side effects), exposed as `proxy`.

    cd claude-usage && python -m pytest tests/ -q
"""
import importlib.machinery
import importlib.util
import os

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROXY = os.path.join(os.path.dirname(_HERE), "vibetop-claude-proxy")


@pytest.fixture(scope="session")
def proxy():
    loader = importlib.machinery.SourceFileLoader("vibetop_claude_proxy", _PROXY)
    spec = importlib.util.spec_from_loader("vibetop_claude_proxy", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


@pytest.fixture()
def out_file(proxy, monkeypatch, tmp_path):
    """Redirect the usage-capture file into a tmp dir (OUT_FILE is a module
    global read at write time)."""
    p = tmp_path / "usage.json"
    monkeypatch.setattr(proxy, "OUT_FILE", str(p))
    return p
