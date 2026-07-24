"""Endpoint contracts for the Browser open + X11 Launcher endpoints:
POST /api/browser/open, /api/x/launch, /api/x/activate, /api/x/close,
GET /api/x/windows. su/chromium/wmctrl are stubbed."""
import types


def _wmctrl_result(returncode=0, stdout=""):
    return types.SimpleNamespace(returncode=returncode, stdout=stdout, stderr="")


# ---- /api/browser/open -----------------------------------------------------

def test_browser_open_valid_url(client, stubs, op_cookie):
    status, body = client.post("/api/browser/open", {"url": "https://example.com/x"},
                               cookie=op_cookie)
    assert status == 200 and body["url"] == "https://example.com/x"
    assert stubs["popen"]                      # a chromium su -c was launched


def test_browser_open_requires_session(client, stubs):
    # Cookieless (a local tenant hitting the loopback port directly) must NOT act
    # as APP_USER — command execution requires a valid login session.
    status, _ = client.post("/api/browser/open", {"url": "https://example.com/x"})
    assert status == 401
    assert not stubs["popen"]                  # nothing launched


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


def test_browser_type_injects_unicode_via_stdin(client, stubs, op_cookie):
    txt = "你好 hi 🎉 café"
    status, body = client.post("/api/browser/type", {"text": txt}, cookie=op_cookie)
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

def test_browser_key_allowlisted(client, stubs, op_cookie):
    status, body = client.post("/api/browser/key", {"key": "Enter"}, cookie=op_cookie)
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


def test_browser_shape_toggle_and_idempotent(client, stubs, op_cookie):
    # First claim changes shape (writes the file browser-loop.sh reads).
    status, body = client.post("/api/browser/shape", {"shape": "mobile"}, cookie=op_cookie)
    assert status == 200 and body["shape"] == "mobile" and body["changed"] is True
    # Re-claiming the same shape is a no-op — proves the file was persisted + re-read.
    status, body = client.post("/api/browser/shape", {"shape": "mobile"}, cookie=op_cookie)
    assert status == 200 and body["changed"] is False
    # Toggling back to desktop changes again.
    status, body = client.post("/api/browser/shape", {"shape": "desktop"}, cookie=op_cookie)
    assert status == 200 and body["shape"] == "desktop" and body["changed"] is True


# ---- /api/x/launch ---------------------------------------------------------

def _last_popen(stubs):
    p = stubs["popen"][-1]
    return " ".join(p) if isinstance(p, list) else str(p)


def test_x_launch_valid_command(client, stubs, op_cookie):
    status, body = client.post("/api/x/launch", {"cmd": "xterm"}, cookie=op_cookie)
    assert status == 200 and body["cmd"] == "xterm"
    assert stubs["popen"]


# ---- D-Bus choice: GNOME apps must get the private, activation-free bus ------
# Regression guard for the "evince opens really slowly / X11 launcher reacts long
# after the terminal command" bug: on the user's real session bus, a GNOME/GTK app
# hangs ~25s on the xdg-desktop-portal/at-spi activation timeout. It MUST use the
# private bus instead. Snap apps keep the real bus (confinement). See
# _ensure_user_x11_dbus / docs/design-decisions.md.

def test_is_snap_launch_detection(mgr):
    assert mgr._is_snap_launch("/snap/bin/firefox") is True     # snap path prefix
    assert mgr._is_snap_launch("/usr/bin/vibetop-no-such-xyz") is False
    assert mgr._is_snap_launch("") is False


def test_x_launch_gnome_app_uses_private_activation_free_bus(client, stubs, op_cookie, mgr, monkeypatch):
    monkeypatch.setattr(mgr, "_is_snap_launch", lambda prog: False)   # GNOME/GTK path
    monkeypatch.setattr(mgr, "_ensure_user_x11_dbus",
                        lambda u, uid, gid: "/run/user/%d/vibetop-x11-bus" % uid)
    status, _ = client.post("/api/x/launch", {"cmd": "evince /tmp/x.pdf"}, cookie=op_cookie)
    assert status == 200
    cmd = _last_popen(stubs)
    assert "vibetop-x11-bus" in cmd, "GNOME app must use the private activation-free bus"


def test_x_launch_snap_app_keeps_the_real_session_bus(client, stubs, op_cookie, mgr, monkeypatch):
    monkeypatch.setattr(mgr, "_is_snap_launch", lambda prog: True)    # snap path
    status, _ = client.post("/api/x/launch", {"cmd": "firefox"}, cookie=op_cookie)
    assert status == 200
    cmd = _last_popen(stubs)
    assert "vibetop-x11-bus" not in cmd and "/bus" in cmd, "snap app must keep the real session bus"


def test_x_launch_requires_session(client, stubs):
    # Cookieless direct-to-loopback call must not run a command as APP_USER.
    status, _ = client.post("/api/x/launch", {"cmd": "xterm"})
    assert status == 401
    assert not stubs["popen"]


def test_x_launch_rejects_empty(client):
    status, _ = client.post("/api/x/launch", {"cmd": "   "})
    assert status == 400


def test_x_launch_rejects_newline_injection(client):
    status, _ = client.post("/api/x/launch", {"cmd": "eog x\nrm -rf ~"})
    assert status == 400


def test_x_launch_reports_command_not_found(client, mgr, monkeypatch, op_cookie):
    # A fast non-zero exit (127) -> "isn't installed" 400, not a spinning launcher.
    class Proc:
        def __init__(self, *a, **k):
            pass
        def wait(self, timeout=None):
            return 127
    monkeypatch.setattr(mgr.subprocess, "Popen", lambda *a, **k: Proc())
    status, body = client.post("/api/x/launch", {"cmd": "definitelynotinstalled"},
                               cookie=op_cookie)
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


def test_x_activate_valid_id(client, mgr, monkeypatch, op_cookie):
    monkeypatch.setattr(mgr.Handler, "_run_wmctrl",
                        lambda self, args: _wmctrl_result(0))
    status, body = client.post("/api/x/activate", {"id": "0x01400003"}, cookie=op_cookie)
    assert status == 200 and body["ok"] is True


def test_x_activate_rejects_bad_id(client):
    status, _ = client.post("/api/x/activate", {"id": "; rm -rf ~"})
    assert status == 400


def test_x_close_rejects_bad_id(client):
    status, _ = client.post("/api/x/close", {"id": "notahexid"})
    assert status == 400
