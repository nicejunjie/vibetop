#!/usr/bin/env python3
"""Actual systemd FD activation/isolation test. Own temporary units only; root."""
import http.client
import base64
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from browser_proxy_auth import BrowserAuthority
from browser_proxy_runtime import Runtime


def main():
    assert os.geteuid() == 0, "Run with sudo; creates only disposable test units"
    user = os.environ.get("SUDO_USER") or "junjie"
    pw = pwd.getpwnam(user)
    assert pw.pw_uid != 0
    prefix = "vibetop-browser-proxy-test-" + str(os.getpid())
    run, profiles = Path("/run") / prefix, Path("/var/lib") / prefix
    auth = BrowserAuthority(os.urandom(32), "vt-proxy.example.com", "https://ui.vt-proxy.example.com",
                            ["https://main.vt-proxy.example.com"])
    ticket = auth.begin(pw.pw_uid, user, "test-main", time.time() + 3600,
                        "https://main.vt-proxy.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://main.vt-proxy.example.com", "iframe", "navigate")
    claims = auth.verify(auth.mint("ui", lease), "ui")
    code = Path(os.environ.get("VT_BROWSER_RELEASE", ROOT / "apps/everyday/browser-lite/proxy"))
    if "VT_BROWSER_RELEASE" in os.environ:
        from browser_proxy_release import validate
        validate(code, node_version=subprocess.check_output(['/usr/bin/node', '--version'], text=True).strip())
    runtime = Runtime(auth, run=run, profiles=profiles, code=code,
                      prefix=prefix, guard_user="nobody")
    unit_files = runtime.unit_files
    runtime.unit_files = lambda uid, gid: {name: text.replace("[Service]\n", "[Service]\nEnvironment=VT_BROWSER_DIAGNOSTICS=1\n") for name, text in unit_files(uid, gid).items()}
    units = [name + suffix for name in runtime.names(pw.pw_uid).values() for suffix in (".socket", ".service")]
    def systemctl(*args):
        return subprocess.check_output(["systemctl", *args], text=True).strip()
    def fetch(path, role="auth", epoch=None):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(20)
            sock.connect(runtime.route(claims))
            headers = {"Host": host, "Referer": auth.ui_origin + "/", "Sec-Fetch-Dest": "iframe",
                       "User-Agent": "VibetopBrowserLiteIntegration/0.1 (https://github.com/nicejunjie/vibetop)",
                       "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "same-site", "X-VT-Browser-Role": role,
                       **{"X-VT-Browser-" + key: str(claims[key]) for key in ("uid", "profile", "epoch", "lease")},
                       "X-VT-Browser-Expires": str(claims["exp"]),
                       "X-VT-Browser-Relay": auth.mint("relay", lease)}
            if epoch is not None:
                headers["X-VT-Browser-Epoch"] = str(epoch)
            sock.sendall((f"GET {path} HTTP/1.1\r\nConnection: close\r\n" + "".join(f"{k}: {v}\r\n" for k, v in headers.items()) + "\r\n").encode())
            response = http.client.HTTPResponse(sock)
            response.begin()
            body = response.read(1024 * 1024)
            return response.status, dict(response.getheaders()), body
    try:
        status, page = runtime.call(claims, "open", {"clientId": "11111111-1111-4111-8111-111111111111",
                                  "operation": 1, "tabId": "22222222-2222-4222-8222-222222222222", "url": "https://www.wikipedia.org/"})
        assert status == 200, page
        entry = urlsplit(page["entry"])
        host = entry.netloc
        assert fetch(entry.path + "?" + entry.query, epoch=claims["epoch"] + 1)[0] == 401
        status, headers, _ = fetch(entry.path + "?" + entry.query, "entry")
        assert status == 303, status
        assert not any(key.lower() == "set-cookie" for key in headers)
        destination = urlsplit(headers["Location"])
        status, _, body = fetch(destination.path + ("?" + destination.query if destination.query else ""))
        assert status == 200 and b"Wikipedia" in body, (status, body[:300])
        assert fetch(entry.path + "?" + entry.query, "entry")[0] == 403
        pid = int(systemctl("show", runtime.names(pw.pw_uid)["rewrite"] + ".service", "-p", "MainPID", "--value"))
        assert pid
        status_text = Path(f"/proc/{pid}/status").read_text()
        assert f"Uid:\t{pw.pw_uid}\t" in status_text
        assert Path(f"/proc/{pid}/ns/pid").readlink() != Path("/proc/self/ns/pid").readlink()
        assert Path(f"/proc/{pid}/ns/net").readlink() != Path("/proc/self/ns/net").readlink()
        assert not Path(f"/proc/{pid}/root/home/{user}/.ssh").exists()
        assert not Path(f"/proc/{pid}/root/run/vibetop").exists()
        ingress = run / str(pw.pw_uid) / "ingress.sock"
        assert ingress.stat().st_uid == 0
        attempt = subprocess.run(["runuser", "-u", user, "--", "python3", "-c",
                                  "import os,sys; os.unlink(sys.argv[1])", str(ingress)], capture_output=True)
        assert attempt.returncode != 0 and ingress.exists()
        # Recreate root manager, adopt configuration without changing identities.
        adopted = Runtime(auth, run=run, profiles=profiles, code=runtime.code, prefix=prefix, guard_user="nobody")
        # First resource can arrive before any heartbeat. Read-only adoption
        # must work immediately without a UI open or an explicit ensure.
        assert adopted.route(claims) == runtime.route(claims)
        status, heartbeat = adopted.call(claims, "heartbeat", {"clients": ["11111111-1111-4111-8111-111111111111"]})
        assert status == 200 and heartbeat == {"expired": []}, heartbeat
        assert adopted.route(claims) == runtime.route(claims)
        assert int(systemctl("show", runtime.names(pw.pw_uid)["rewrite"] + ".service", "-p", "MainPID", "--value")) == pid
        # An existing authorized listener may recover a crashed service. No
        # manager ensure/control command participates in this resource request.
        rewrite_unit = runtime.names(pw.pw_uid)["rewrite"]
        systemctl("kill", "--kill-whom=main", "--signal=KILL", rewrite_unit + ".service")
        deadline = time.monotonic() + 5
        while int(systemctl("show", rewrite_unit + ".service", "-p", "MainPID", "--value")):
            assert time.monotonic() < deadline
            time.sleep(.05)
        assert ingress.exists()
        assert fetch('/hammerhead.js', 'relay')[0] == 200
        assert int(systemctl("show", rewrite_unit + ".service", "-p", "MainPID", "--value")) not in (0, pid)
        # A restart invalidates old control lanes without replaying them.
        systemctl("restart", runtime.names(pw.pw_uid)["rewrite"] + ".service")
        status, page = runtime.call(claims, "open", {"clientId": "33333333-3333-4333-8333-333333333333",
                                  "operation": 1, "tabId": "44444444-4444-4444-8444-444444444444", "url": "https://www.wikipedia.org/"})
        assert status == 200, page
        # Closing the listener is stronger than a daemon crash. A resource
        # authorization after a manager restart must not reopen it.
        systemctl("stop", rewrite_unit + ".socket")
        closed = Runtime(auth, run=run, profiles=profiles, code=runtime.code, prefix=prefix, guard_user="nobody")
        try:
            closed.route(claims)
        except ValueError:
            pass
        else:
            raise AssertionError("Closed listener was adopted")
        assert not ingress.exists()
        closed.ensure(claims)  # Authenticated UI is allowed to explicitly reopen.
        assert ingress.exists()
        runtime.revoke(pw.pw_uid)
        assert not ingress.exists()
        try:
            runtime.ensure(claims)
        except ValueError:
            pass
        else:
            raise AssertionError("Revoked request restarted runtime")
        print("PASS: root socket FD, identity, namespace isolation, restart/adoption, revoke")
    except BaseException:
        config = json.loads((run / str(pw.pw_uid) / "rewrite.json").read_bytes())
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
            probe.settimeout(10)
            probe.connect(str(run / str(pw.pw_uid) / "egress.sock"))
            credential = base64.b64encode(("browser:" + config["egressSecret"]).encode()).decode()
            probe.sendall(("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nProxy-Authorization: Basic " + credential + "\r\n\r\n").encode())
            print("guard CONNECT", probe.recv(4096).split(b"\r\n", 1)[0], flush=True)
        guard_pid = systemctl("show", runtime.names(pw.pw_uid)["egress"] + ".service", "-p", "MainPID", "--value")
        if guard_pid.isdigit() and int(guard_pid):
            subprocess.run(["nsenter", "-t", guard_pid, "-m", "-n", "--", "/usr/bin/node", "-e",
                            "const {EgressProxy}=require('/opt/vibetop/browser-proxy/egress.cjs'); new EgressProxy().destination('example.com',443).then(x=>console.log('guard destination',x)).catch(e=>console.log('guard destination',e.message));" ])
        subprocess.run(["journalctl", "--no-pager", "-n", "35", *[arg for unit in units for arg in ("-u", unit)]])
        raise
    finally:
        subprocess.run(["systemctl", "stop", *[u for u in units if u.endswith(".socket")]], capture_output=True)
        subprocess.run(["systemctl", "stop", *[u for u in units if u.endswith(".service")]], capture_output=True)
        for unit in units:
            (Path("/run/systemd/system") / unit).unlink(missing_ok=True)
        subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
        for path in (run, profiles):
            if path.exists():
                shutil.rmtree(path)


if __name__ == "__main__":
    main()
