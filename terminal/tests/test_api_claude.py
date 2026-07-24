"""Endpoint contracts for the Claude plan-usage strip:
GET/POST /api/claude/usage (settings.json surgery + toggle) and
GET /api/claude/stats. systemctl is stubbed; settings live in the tmp HOME."""
import json
import os


def test_usage_disabled_by_default(client, op_cookie):
    status, body = client.get("/api/claude/usage", cookie=op_cookie)
    assert status == 200 and body["enabled"] is False


def test_usage_requires_admin_session(client):
    # Operator-only surface: a cookieless direct-to-loopback call must not read or
    # toggle the operator's Claude proxy routing.
    assert client.get("/api/claude/usage")[0] == 403
    assert client.post("/api/claude/usage", {"enabled": True})[0] == 403


def test_enable_wires_base_url_into_settings(client, mgr, stubs, op_cookie):
    status, body = client.post("/api/claude/usage", {"enabled": True}, cookie=op_cookie)
    assert status == 200 and body["enabled"] is True
    with open(mgr.CLAUDE_SETTINGS_FILE) as f:
        settings = json.load(f)
    assert settings["env"]["ANTHROPIC_BASE_URL"] == mgr.CLAUDE_PROXY_URL
    # It started the proxy unit before routing to it.
    assert any("enable" in c and "--now" in c for c in stubs["run"])
    _, got = client.get("/api/claude/usage", cookie=op_cookie)
    assert got["enabled"] is True


def test_disable_removes_only_our_key(client, mgr, stubs, op_cookie):
    # Pre-seed the user's OWN env alongside ours; disable must keep theirs.
    os.makedirs(os.path.dirname(mgr.CLAUDE_SETTINGS_FILE), exist_ok=True)
    with open(mgr.CLAUDE_SETTINGS_FILE, "w") as f:
        json.dump({"env": {"ANTHROPIC_BASE_URL": mgr.CLAUDE_PROXY_URL,
                           "MY_VAR": "keep"}}, f)
    status, body = client.post("/api/claude/usage", {"enabled": False}, cookie=op_cookie)
    assert status == 200 and body["enabled"] is False
    with open(mgr.CLAUDE_SETTINGS_FILE) as f:
        settings = json.load(f)
    assert "ANTHROPIC_BASE_URL" not in settings["env"]
    assert settings["env"]["MY_VAR"] == "keep"
    # Disable NEVER stops the running proxy (pinned sessions) — no `disable --now`.
    disables = [c for c in stubs["run"] if "disable" in c]
    assert disables and not any("--now" in c for c in disables)


def test_stats_shape(client):
    # No transcripts in the tmp HOME -> zeroed but well-formed windows.
    status, body = client.get("/api/claude/stats")
    assert status == 200
    assert "windows" in body and "all" in body["windows"]
    for k in ("in", "out", "tokens", "cost", "req"):
        assert k in body["windows"]["all"]
