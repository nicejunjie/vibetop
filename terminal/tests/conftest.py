"""Shared fixtures for the terminal-manager unit tests.

`terminal-manager.py` has a hyphen, so it can't be `import`ed by name. Load it
once from its file path and expose it as the `mgr` fixture. Importing it is
side-effect-free: the HTTP server only starts under `if __name__ == "__main__"`,
and module-level code just computes constants (no files written, no sockets).
"""
import importlib.util
import os
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
_TERMINAL_DIR = os.path.dirname(_HERE)
_MANAGER = os.path.join(_TERMINAL_DIR, "terminal-manager.py")

# terminal-manager.py does `import system_status` (a sibling). At runtime the
# script's own dir is sys.path[0]; mirror that here so both the manager load and
# a direct `import system_status` resolve.
if _TERMINAL_DIR not in sys.path:
    sys.path.insert(0, _TERMINAL_DIR)


def _load():
    spec = importlib.util.spec_from_file_location("terminal_manager", _MANAGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def mgr():
    return _load()


@pytest.fixture(scope="session")
def status():
    import system_status
    return system_status


@pytest.fixture(scope="session")
def csession():
    """The `vibetop-session` daemon module. It has no `.py` extension, so an
    explicit SourceFileLoader is needed (spec_from_file_location can't infer one).
    Its `if __name__ == '__main__'` guard means import only defines functions/
    classes — no daemon/socket side effects."""
    import importlib.machinery
    path = os.path.join(_TERMINAL_DIR, "vibetop-session")
    loader = importlib.machinery.SourceFileLoader("claude_session", path)
    spec = importlib.util.spec_from_loader("claude_session", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module
