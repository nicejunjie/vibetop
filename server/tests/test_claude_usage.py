"""Unit tests for the opt-in Claude plan-usage feature's manager helpers.

The security/correctness-critical part is the settings.json env surgery
(`_set_claude_usage_env`): it edits the user's real ~/.claude/settings.json, so
it MUST preserve every other setting and, on disable, only remove the key when
it's *ours* (never clobber a user's own ANTHROPIC_BASE_URL). The toggle ordering
(`_set_claude_usage`) is pinned too: on enable the proxy starts before Claude is
routed to it; on disable the running proxy is left alive (a `disable`, not
`disable --now`) so sessions pinned to it don't get ConnectionRefused.

No systemd/nginx/root needed — subprocess.run is stubbed for the ordering test;
the env/read helpers are pure file I/O pointed at a tmp dir.
"""
import json

import pytest


@pytest.fixture
def cu(mgr, tmp_path, monkeypatch):
    """Point the Claude-usage helpers at throwaway files."""
    settings = tmp_path / "settings.json"
    usage = tmp_path / "usage.json"
    monkeypatch.setattr(mgr, "CLAUDE_SETTINGS_FILE", str(settings))
    monkeypatch.setattr(mgr, "CLAUDE_USAGE_FILE", str(usage))
    return mgr, settings, usage


def _write(p, obj):
    p.write_text(json.dumps(obj))


# ---- _claude_usage_enabled -------------------------------------------------

def test_enabled_false_when_no_settings(cu):
    mgr, _, _ = cu
    assert mgr._claude_usage_enabled() is False


def test_enabled_only_when_env_is_our_url(cu):
    mgr, settings, _ = cu
    _write(settings, {"env": {"ANTHROPIC_BASE_URL": mgr.CLAUDE_PROXY_URL}})
    assert mgr._claude_usage_enabled() is True
    # someone else's base url is NOT us
    _write(settings, {"env": {"ANTHROPIC_BASE_URL": "http://elsewhere:1234"}})
    assert mgr._claude_usage_enabled() is False
    # malformed env shapes don't crash
    _write(settings, {"env": "nope"})
    assert mgr._claude_usage_enabled() is False


def test_enabled_survives_garbage_settings(cu):
    mgr, settings, _ = cu
    settings.write_text("{ not json")
    assert mgr._claude_usage_enabled() is False


# ---- _set_claude_usage_env (the env surgery) -------------------------------

def test_enable_adds_env_preserving_other_settings(cu):
    mgr, settings, _ = cu
    _write(settings, {"model": "opus", "permissions": {"allow": []},
                      "env": {"FOO": "bar"}})
    mgr._set_claude_usage_env(True)
    d = json.loads(settings.read_text())
    assert d["model"] == "opus"                          # untouched
    assert d["permissions"] == {"allow": []}             # untouched
    assert d["env"]["FOO"] == "bar"                       # other env kept
    assert d["env"]["ANTHROPIC_BASE_URL"] == mgr.CLAUDE_PROXY_URL
    assert mgr._claude_usage_enabled() is True


def test_enable_creates_settings_when_absent(cu):
    mgr, settings, _ = cu
    assert not settings.exists()
    mgr._set_claude_usage_env(True)
    d = json.loads(settings.read_text())
    assert d["env"]["ANTHROPIC_BASE_URL"] == mgr.CLAUDE_PROXY_URL


def test_disable_removes_only_our_key_keeps_other_env(cu):
    mgr, settings, _ = cu
    _write(settings, {"env": {"ANTHROPIC_BASE_URL": mgr.CLAUDE_PROXY_URL,
                              "FOO": "bar"}})
    mgr._set_claude_usage_env(False)
    d = json.loads(settings.read_text())
    assert "ANTHROPIC_BASE_URL" not in d["env"]
    assert d["env"]["FOO"] == "bar"


def test_disable_never_clobbers_users_own_base_url(cu):
    mgr, settings, _ = cu
    _write(settings, {"env": {"ANTHROPIC_BASE_URL": "http://my-own-proxy:9"}})
    mgr._set_claude_usage_env(False)
    d = json.loads(settings.read_text())
    assert d["env"]["ANTHROPIC_BASE_URL"] == "http://my-own-proxy:9"


def test_disable_drops_empty_env_block(cu):
    mgr, settings, _ = cu
    _write(settings, {"model": "opus",
                      "env": {"ANTHROPIC_BASE_URL": mgr.CLAUDE_PROXY_URL}})
    mgr._set_claude_usage_env(False)
    d = json.loads(settings.read_text())
    assert d["model"] == "opus"
    assert "env" not in d                                # emptied env removed


def test_enable_then_disable_is_clean_roundtrip(cu):
    mgr, settings, _ = cu
    _write(settings, {"model": "opus"})
    mgr._set_claude_usage_env(True)
    assert mgr._claude_usage_enabled() is True
    mgr._set_claude_usage_env(False)
    assert mgr._claude_usage_enabled() is False
    d = json.loads(settings.read_text())
    assert d == {"model": "opus"}                        # back to original


# ---- _read_claude_usage ----------------------------------------------------

def test_read_usage_missing_or_garbage_is_none(cu):
    mgr, _, usage = cu
    assert mgr._read_claude_usage() is None               # absent
    usage.write_text("{ not json")
    assert mgr._read_claude_usage() is None               # malformed
    usage.write_text("[1, 2, 3]")
    assert mgr._read_claude_usage() is None               # not a dict


def test_read_usage_returns_parsed_dict(cu):
    mgr, _, usage = cu
    usage.write_text(json.dumps({"session": {"pct": 0.5}, "updated": 123}))
    got = mgr._read_claude_usage()
    assert got["session"]["pct"] == 0.5 and got["updated"] == 123


# ---- _set_claude_usage (toggle ordering; subprocess stubbed) ---------------

def test_toggle_ordering_and_proxy_left_running(cu, monkeypatch):
    mgr, settings, _ = cu
    calls = []

    class _R:
        returncode, stdout, stderr = 0, "", ""

    def fake_run(cmd, **kw):
        calls.append(list(cmd))
        return _R()

    monkeypatch.setattr(mgr.subprocess, "run", fake_run)

    # ENABLE: proxy started (enable --now) BEFORE env is written.
    mgr._set_claude_usage(True)
    assert calls and calls[0][:3] == ["systemctl", "enable", "--now"]
    assert mgr._claude_usage_enabled() is True

    calls.clear()
    # DISABLE: env removed, unit disabled at boot, but the running proxy is NOT
    # stopped (no `--now` anywhere) — pinned sessions must survive.
    mgr._set_claude_usage(False)
    assert mgr._claude_usage_enabled() is False
    assert any(c[:2] == ["systemctl", "disable"] for c in calls)
    assert all("--now" not in c for c in calls), \
        "disable must not stop the proxy out from under pinned sessions"
