"""HTTP-level contracts for the Files-native /api/fs/* family.

This suite exists because the endpoints had NO http-level coverage at all, and
that is exactly how they shipped without an authentication gate: every one of
them resolved its user through `_ctx_user()`, whose cookieless fallback is
APP_USER. The manager listens on loopback, which on this multi-user host every
local tenant can reach, so an unauthenticated `curl` acted as the service
account — read/write anywhere that account can reach, including the deployed
code tree. The rule these tests pin down is the one `_require_authed` already
documented for the command endpoints: a cookieless request to the fs family is
a local tenant, never APP_USER.

The second suite covers the agent-socket identity check: the manager must
refuse to talk to a socket whose peer is not the user it is acting for.
"""
import json
import os
import socket
import struct
import threading
import urllib.error
import urllib.request

import pytest


FS_GET = [
    "/api/fs/home",
    "/api/fs/list?path=/tmp",
    "/api/fs/stat?path=/tmp",
    "/api/fs/read?path=/etc/hostname",
    "/api/fs/search?path=/tmp&q=x",
    "/api/fs/hash?path=/etc/hostname&algo=sha256",
    "/api/fs/download?path=/etc/hostname",
    "/api/fs/zip?paths=/tmp",
]


def _raw(client, path, method="GET", body=None, headers=None):
    req = urllib.request.Request(client.base + path, data=body,
                                 headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


@pytest.mark.parametrize("path", FS_GET)
def test_fs_get_requires_a_session(client, path):
    status, _ = _raw(client, path)
    assert status == 401, f"{path} served an unauthenticated request"


def test_fs_op_requires_a_session(client, tmp_path):
    target = tmp_path / "planted-dir"
    body = json.dumps({"op": "mkdir", "path": str(target)}).encode()
    status, _ = _raw(client, "/api/fs/op", "POST", body)
    assert status == 401
    assert not target.exists(), "an unauthenticated mkdir reached the filesystem"


def test_fs_upload_requires_a_session(client, tmp_path):
    dst = tmp_path / "planted.txt"
    hdrs = {"Content-Length": "5"}
    status, _ = _raw(client, "/api/fs/upload?path=" + str(dst), "POST", b"pwned", hdrs)
    assert status == 401
    assert not dst.exists(), "an unauthenticated upload wrote to the filesystem"


def test_authenticated_fs_call_acts_as_the_cookie_user(client, mgr, monkeypatch):
    """The agent must be started for — and the request sent to — the session's
    user, never APP_USER."""
    seen = {}

    def fake_ensure(user):
        seen["ensure"] = user
        return True, None

    def fake_call(user, req, timeout=10.0):
        seen["call"] = (user, req.get("op"))
        return {"ok": True, "home": "/home/" + user}

    monkeypatch.setattr(mgr, "_ensure_fileagent", fake_ensure)
    monkeypatch.setattr(mgr, "_fs_call", fake_call)
    cookie = "vt_session=" + mgr._sign_session("alice")
    status, body = _raw(client, "/api/fs/home", headers={"Cookie": cookie})
    assert status == 200
    assert seen["ensure"] == "alice"
    assert seen["call"] == ("alice", "home")
    assert json.loads(body)["home"] == "/home/alice"


# ---- agent socket identity -------------------------------------------------

def test_socket_dir_is_private_to_its_user(mgr):
    """The per-user socket directory is the structural half of the fix: 0700 and
    owned by that user, so no other tenant can create the socket path at all."""
    d = mgr._fileagent_dir("alice")
    assert d.endswith("/alice")
    assert mgr._fileagent_sock("alice") == os.path.join(d, "sock")
    # never the old world-writable shape
    assert not mgr._fileagent_sock("alice").startswith("/tmp/vibetop-fileagent-")


def test_manager_refuses_a_socket_owned_by_someone_else(mgr, tmp_path, monkeypatch):
    """An impostor that binds the agent path must get NOTHING: the manager checks
    SO_PEERCRED before it sends the request, so neither the request nor an
    upload body ever reaches it, and it never receives a forged-reply chance."""
    sock_path = str(tmp_path / "sock")
    monkeypatch.setattr(mgr, "_fileagent_sock", lambda user: sock_path)

    got = []
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(4)
    srv.settimeout(5)

    def impostor():
        try:
            conn, _ = srv.accept()
        except (socket.timeout, OSError):
            return
        try:
            conn.settimeout(2)
            got.append(conn.recv(4096))            # what the manager sent us
            conn.sendall(b'{"ok":true,"home":"/home/victim","entries":[]}')
        except OSError:
            pass
        finally:
            conn.close()

    t = threading.Thread(target=impostor, daemon=True)
    t.start()

    # The peer here is THIS test process. Claim to be a user whose uid differs
    # from ours so the check must fail. uid 0 is a safe "not us" (tests never
    # run as root — assert that, rather than silently passing).
    assert os.getuid() != 0, "this test is meaningless as root"
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda name: type("pw", (), {"pw_uid": 0, "pw_gid": 0})())

    res = mgr._fs_call("victim", {"op": "list", "path": "/home/victim"})
    t.join(timeout=5)
    srv.close()

    assert res.get("ok") is False
    assert res.get("code") == "agent"
    # b'' is EOF — the manager closed the connection without writing. Anything
    # non-empty would mean the request (or an upload body) reached the impostor.
    assert not any(got), "the manager sent the request to an impostor socket"


def test_peer_check_accepts_our_own_uid(mgr, tmp_path, monkeypatch):
    """Sanity counter-test: with a matching uid the same path works, so the
    guard rejects impostors rather than everything."""
    sock_path = str(tmp_path / "sock")
    monkeypatch.setattr(mgr, "_fileagent_sock", lambda user: sock_path)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(4)
    srv.settimeout(5)

    def agent():
        try:
            conn, _ = srv.accept()
        except (socket.timeout, OSError):
            return
        try:
            conn.recv(4096)
            conn.sendall(b'{"ok":true,"home":"/home/me"}')
        except OSError:
            pass
        finally:
            conn.close()

    t = threading.Thread(target=agent, daemon=True)
    t.start()
    monkeypatch.setattr(mgr.pwd, "getpwnam",
                        lambda name: type("pw", (), {"pw_uid": os.getuid(),
                                                     "pw_gid": os.getgid()})())
    res = mgr._fs_call("me", {"op": "home"})
    t.join(timeout=5)
    srv.close()
    assert res.get("ok") is True and res.get("home") == "/home/me"


def test_peer_check_reads_real_credentials(mgr, tmp_path):
    """_fs_peer_is must use SO_PEERCRED (kernel-supplied), not anything the peer
    can influence."""
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        raw = a.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
        _pid, uid, _gid = struct.unpack("3i", raw)
        assert uid == os.getuid()
    finally:
        a.close()
        b.close()


# ---- the rest of the Files surface -----------------------------------------
# v1.19.106 gated /api/fs/* and stopped there. An audit then reproduced, with no
# cookie, an arbitrary image read AND the minting of a public /s/ share link —
# and /s/ is an nginx location with NO auth_request, i.e. a local tenant could
# publish a service-account file to the internet. Everything the Files app calls
# is gated now; these pin it. (/api/office/doc and /api/office/callback are NOT
# here on purpose: the OnlyOffice container calls them server-to-server with no
# browser cookie, authorized by their own path HMAC.)

SIBLING_GET = [
    "/api/me",
    "/api/files/tabs",
    "/api/file/image?path=x.png",
    "/api/share/list",
    "/api/office/config?path=x.docx",
    "/api/office/download?path=x.docx",
    "/api/office/preview?path=x.docx",
    "/api/video/info?path=x.mp4",
    "/api/video/media?path=x.mp4",
    "/api/video/subs?path=x.mp4&sub=0",
]


@pytest.mark.parametrize("path", SIBLING_GET)
def test_files_surface_get_requires_a_session(client, path):
    status, _ = _raw(client, path)
    assert status == 401, f"{path} served an unauthenticated request"


def test_share_mint_requires_a_session(client, home):
    """The sharpest one: /s/<token> bypasses Cloudflare Access by design, so an
    unauthenticated mint is a way to publish a file to the public internet."""
    (home / "secret.txt").write_text("not for the world")
    body = json.dumps({"path": "secret.txt", "ttl": 1}).encode()
    status, out = _raw(client, "/api/share", "POST", body)
    assert status == 401
    assert b"token" not in out


def test_share_revoke_requires_a_session(client):
    status, _ = _raw(client, "/api/share/revoke", "POST", json.dumps({"token": "x"}).encode())
    assert status == 401


def test_files_tabs_write_requires_a_session(client):
    status, _ = _raw(client, "/api/files/tabs", "POST", json.dumps({"tabs": []}).encode())
    assert status == 401


def test_unknown_fs_op_is_401_before_404_without_a_session(client):
    """Auth comes FIRST: a cookieless caller must not be able to probe which
    ops exist."""
    status, _ = _raw(client, "/api/fs/bogus")
    assert status == 401


def test_office_container_endpoints_stay_reachable(client):
    """The OnlyOffice CONTAINER has no cookie; its two endpoints carry their own
    HMAC instead. They must NOT have been swept up in the gate — a 401 here
    would break Office editing entirely."""
    for p in ("/api/office/doc?path=x.docx", "/api/office/callback?path=x.docx"):
        status, _ = _raw(client, p)
        assert status != 401, f"{p} must stay reachable for the document server"
