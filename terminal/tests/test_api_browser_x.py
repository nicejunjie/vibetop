"""Endpoint contracts for the Browser open + X11 Launcher endpoints:
POST /api/browser/open, /api/x/launch, /api/x/activate, /api/x/close,
GET /api/x/windows. su/chromium/wmctrl are stubbed."""
import types


def _wmctrl_result(returncode=0, stdout=""):
    return types.SimpleNamespace(returncode=returncode, stdout=stdout, stderr="")


# ---- /api/browser/open -----------------------------------------------------

def test_browser_open_valid_url(client, stubs):
    status, body = client.post("/api/browser/open", {"url": "https://example.com/x"})
    assert status == 200 and body["url"] == "https://example.com/x"
    assert stubs["popen"]                      # a chromium su -c was launched


def test_browser_open_rejects_non_http(client):
    status, _ = client.post("/api/browser/open", {"url": "file:///etc/passwd"})
    assert status == 400


def test_browser_open_rejects_shell_metachars(client):
    status, _ = client.post("/api/browser/open",
                            {"url": "http://x/$(rm -rf ~)"})
    assert status == 400


# ---- /api/browser/type (server-side xdotool text injection) -----------------

def _runs(stubs):
    return [" ".join(a) for a in stubs["run"] if isinstance(a, list)]


def test_browser_type_injects_unicode_via_stdin(client, stubs):
    txt = "你好 hi 🎉 café"
    status, body = client.post("/api/browser/type", {"text": txt})
    assert status == 200 and body["ok"]
    # an `xdotool type` command was run...
    assert any("xdotool type --clearmodifiers --file -" in c for c in _runs(stubs))
    # ...with the text on STDIN (input=), never interpolated into the command,
    # so CJK/emoji/metacharacters carry no injection risk.
    assert any(kw.get("input") == txt.encode("utf-8") for kw in stubs["run_kw"])
    assert all("你好" not in c for c in _runs(stubs))


def test_browser_type_rejects_empty(client):
    status, _ = client.post("/api/browser/type", {"text": ""})
    assert status == 400


def test_browser_type_rejects_too_long(client):
    status, _ = client.post("/api/browser/type", {"text": "x" * 10001})
    assert status == 400


# ---- /api/browser/key (allowlisted navigation keys) -------------------------

def test_browser_key_allowlisted(client, stubs):
    status, body = client.post("/api/browser/key", {"key": "Enter"})
    assert status == 200 and body["ok"]
    assert any("xdotool key --clearmodifiers Return" in c for c in _runs(stubs))


def test_browser_key_rejects_unknown(client, stubs):
    status, _ = client.post("/api/browser/key", {"key": "rm -rf ~"})
    assert status == 400
    assert not any("xdotool key" in c for c in _runs(stubs))


# ---- /api/browser/shape (device shaping: mobile vs desktop) ------------------

def test_browser_shape_rejects_bad(client, stubs):
    status, _ = client.post("/api/browser/shape", {"shape": "phone"})
    assert status == 400
    assert not any("pkill" in c for c in _runs(stubs))


def test_browser_shape_mobile_writes_and_respawns(client, stubs):
    status, body = client.post("/api/browser/shape", {"shape": "mobile"})
    assert status == 200 and body["shape"] == "mobile" and body["changed"] is True
    # this profile's chromium was SIGTERMed so browser-loop.sh respawns it mobile
    assert any("pkill" in c and "user-data-dir" in c for c in _runs(stubs))
    # idempotent: claiming the same shape again is a no-op (no respawn)
    stubs["run"].clear()
    status, body = client.post("/api/browser/shape", {"shape": "mobile"})
    assert status == 200 and body["changed"] is False
    assert not any("pkill" in c for c in _runs(stubs))


# ---- /api/x/launch ---------------------------------------------------------

def test_x_launch_valid_command(client, stubs):
    status, body = client.post("/api/x/launch", {"cmd": "xterm"})
    assert status == 200 and body["cmd"] == "xterm"
    assert stubs["popen"]


def test_x_launch_rejects_empty(client):
    status, _ = client.post("/api/x/launch", {"cmd": "   "})
    assert status == 400


def test_x_launch_rejects_newline_injection(client):
    status, _ = client.post("/api/x/launch", {"cmd": "eog x\nrm -rf ~"})
    assert status == 400


def test_x_launch_reports_command_not_found(client, mgr, monkeypatch):
    # A fast non-zero exit (127) -> "isn't installed" 400, not a spinning launcher.
    class Proc:
        def __init__(self, *a, **k):
            pass
        def wait(self, timeout=None):
            return 127
    monkeypatch.setattr(mgr.subprocess, "Popen", lambda *a, **k: Proc())
    status, body = client.post("/api/x/launch", {"cmd": "definitelynotinstalled"})
    assert status == 400 and "installed" in body["error"]


# ---- /api/x/windows + activate/close --------------------------------------

def test_x_windows_parses_wmctrl(client, mgr, monkeypatch):
    out = ("0x01400003  0 host  Firefox\n"
           "0x01400009 -1 host  DESKTOP\n"           # desktop sentinel -> skipped
           "0x0140000a  0 host  Text Editor\n")
    monkeypatch.setattr(mgr.Handler, "_run_wmctrl",
                        lambda self, args: _wmctrl_result(0, out))
    status, body = client.get("/api/x/windows")
    assert status == 200
    ids = [w["id"] for w in body["windows"]]
    assert ids == ["0x01400003", "0x0140000a"]       # sentinel filtered
    assert body["windows"][0]["title"] == "Firefox"


def test_x_activate_valid_id(client, mgr, monkeypatch):
    monkeypatch.setattr(mgr.Handler, "_run_wmctrl",
                        lambda self, args: _wmctrl_result(0))
    status, body = client.post("/api/x/activate", {"id": "0x01400003"})
    assert status == 200 and body["ok"] is True


def test_x_activate_rejects_bad_id(client):
    status, _ = client.post("/api/x/activate", {"id": "; rm -rf ~"})
    assert status == 400


def test_x_close_rejects_bad_id(client):
    status, _ = client.post("/api/x/close", {"id": "notahexid"})
    assert status == 400
