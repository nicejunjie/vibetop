"""Endpoint contracts for the public file-share feature (/api/share* + /s/<token>).

Exercises the real handlers over the in-process HTTP harness (conftest `client`),
with SHARE_ROOT fenced to a tmp HOME. Covers the security-critical bits: the
path/dotfile/traversal fence, the same-origin XSS serving guard (attachment for
.html, inline for images), expiry + revocation, Range, and folder->zip.
"""
import io
import json
import time
import urllib.error
import urllib.request
import zipfile

import pytest


def _raw(client, path, headers=None):
    """GET returning (status, headers-dict, body-bytes), with optional request
    headers (the shared `client` has no header-passing raw GET)."""
    req = urllib.request.Request(client.base + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def _mkfile(home, rel, content=b"hello world"):
    p = home / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content if isinstance(content, bytes) else content.encode())
    return p


def _create(client, path, ttl=None):
    body = {"path": path}
    if ttl is not None:
        body["ttl"] = ttl
    return client.post("/api/share", body)


# --- create / serve round-trip -------------------------------------------------

def test_create_and_serve_text_inline(client, home):
    _mkfile(home, "Documents/note.txt", b"the quick brown fox")
    st, resp = _create(client, "Documents/note.txt")
    assert st == 200
    tok = resp["token"]
    assert resp["kind"] == "file"
    assert resp["url"].endswith("/s/" + tok)
    assert len(tok) >= 16                       # high-entropy capability

    st, hdrs, body = _raw(client, "/s/" + tok)
    assert st == 200
    assert body == b"the quick brown fox"
    assert hdrs["content-type"] == "text/plain"
    assert hdrs["content-disposition"].startswith("inline")
    # same-origin XSS guards, always present
    assert hdrs["x-content-type-options"] == "nosniff"
    assert "sandbox" in hdrs["content-security-policy"]


def test_image_served_inline(client, home):
    _mkfile(home, "pic.png", b"\x89PNG\r\n\x1a\nfakebody")
    _, resp = _create(client, "pic.png")
    _, hdrs, _ = _raw(client, "/s/" + resp["token"])
    assert hdrs["content-type"] == "image/png"
    assert hdrs["content-disposition"].startswith("inline")


def test_html_forced_to_attachment_not_executable(client, home):
    """A shared .html must download as octet-stream, never render as text/html in
    the app's own origin (the same-origin XSS guard)."""
    _mkfile(home, "evil.html", b"<script>alert(document.cookie)</script>")
    _, resp = _create(client, "evil.html")
    _, hdrs, _ = _raw(client, "/s/" + resp["token"])
    assert hdrs["content-type"] == "application/octet-stream"
    assert hdrs["content-disposition"].startswith("attachment")


def test_dl_forces_download(client, home):
    _mkfile(home, "pic.png", b"img")
    _, resp = _create(client, "pic.png")
    _, hdrs, _ = _raw(client, "/s/" + resp["token"] + "?dl=1")
    assert hdrs["content-disposition"].startswith("attachment")
    assert hdrs["content-type"] == "application/octet-stream"


# --- security fences -----------------------------------------------------------

def test_traversal_rejected(client, home):
    st, resp = _create(client, "../../etc/passwd")
    assert st == 400
    assert "error" in resp


def test_dotfile_rejected(client, home):
    _mkfile(home, ".env", b"SECRET=1")
    st, resp = _create(client, ".env")
    assert st == 400
    _mkfile(home, ".ssh/id_rsa", b"KEY")
    st2, _ = _create(client, ".ssh/id_rsa")
    assert st2 == 400


def test_missing_file_rejected(client, home):
    st, _ = _create(client, "Documents/nope.txt")
    assert st == 400


def test_unknown_token_404(client, home):
    st, _, _ = _raw(client, "/s/definitelyNotARealToken123")
    assert st == 404


# --- list / revoke -------------------------------------------------------------

def test_list_and_revoke(client, home):
    _mkfile(home, "a.txt", b"a")
    _, resp = _create(client, "a.txt")
    tok = resp["token"]

    st, listing = client.get("/api/share/list")
    assert st == 200
    assert any(s["token"] == tok and s["name"] == "a.txt" for s in listing["shares"])

    st, rv = client.post("/api/share/revoke", {"token": tok})
    assert st == 200 and rv["removed"] is True

    st, _, _ = _raw(client, "/s/" + tok)
    assert st == 404
    _, listing2 = client.get("/api/share/list")
    assert all(s["token"] != tok for s in listing2["shares"])


def test_expired_share_404_and_pruned(client, home):
    """Write a registry entry already past its expiry -> serve 404 + pruned."""
    _mkfile(home, "old.txt", b"old")
    reg = {"expiredTokenAAAA": {"rel": "old.txt", "name": "old.txt", "kind": "file",
                                "created": time.time() - 1000,
                                "expires": time.time() - 100, "hits": 0}}
    (home / ".local" / "share" / "vibetop-shares.json").write_text(json.dumps(reg))
    st, _, _ = _raw(client, "/s/expiredTokenAAAA")
    assert st == 404
    _, listing = client.get("/api/share/list")
    assert listing["shares"] == []


# --- range ---------------------------------------------------------------------

def test_range_request(client, home):
    _mkfile(home, "seek.bin", b"0123456789")
    _, resp = _create(client, "seek.bin")
    st, hdrs, body = _raw(client, "/s/" + resp["token"],
                          headers={"Range": "bytes=2-5"})
    assert st == 206
    assert body == b"2345"
    assert hdrs["content-range"] == "bytes 2-5/10"
    assert hdrs["accept-ranges"] == "bytes"


# --- folder -> zip -------------------------------------------------------------

def test_folder_served_as_zip_excludes_dotfiles(client, home):
    _mkfile(home, "proj/a.txt", b"aaa")
    _mkfile(home, "proj/sub/b.txt", b"bbb")
    _mkfile(home, "proj/.secret", b"nope")          # dotfile -> excluded
    _mkfile(home, "proj/.hidden/c.txt", b"nope")    # dot-dir -> excluded
    st, resp = _create(client, "proj")
    assert st == 200 and resp["kind"] == "dir"

    st, hdrs, body = _raw(client, "/s/" + resp["token"])
    assert st == 200
    assert hdrs["content-type"] == "application/zip"
    assert hdrs["content-disposition"].startswith("attachment")
    assert "proj.zip" in hdrs["content-disposition"]

    names = set(zipfile.ZipFile(io.BytesIO(body)).namelist())
    assert "proj/a.txt" in names
    assert "proj/sub/b.txt" in names
    assert not any(".secret" in n or ".hidden" in n for n in names)


def test_folder_traversal_still_fenced(client, home):
    # A dir path escaping the fence is rejected at create time.
    st, _ = _create(client, "../..")
    assert st == 400


def test_share_serves_from_a_validated_descriptor_not_a_re_resolved_path(mgr):
    """TOCTOU. `_safe_share_target` fences the path correctly, but it returns a
    PATH — and the serve path then resolved that path twice MORE (getsize, open),
    as root, with every component under the OWNER's control. Between the check
    and the open the owner can swap a directory component for a symlink and root
    opens whatever it then points at. The `limit_req` on /s/ is no bound at all:
    a local user reaches 127.0.0.1:7680 directly, which is exactly the threat
    model here (a Terminal is SSH as that user).

    An fd cannot be swapped underneath us, so the fix opens ONCE and validates
    THAT descriptor: /proc/self/fd/N gives the true path of the file actually
    opened, after every symlink.
    """
    import inspect
    src = inspect.getsource(mgr.Handler._serve_share_file)
    assert "os.open(" in src and "O_NOFOLLOW" in src, \
        "the share must open once, not re-resolve the path"
    assert 'os.readlink("/proc/self/fd/' in src, \
        "the DESCRIPTOR's true path is what must be validated against the fence"
    assert "os.fstat(fd)" in src, "size must come from the same fd, not getsize()"
    assert "os.path.getsize(path)" not in src, \
        "a second path resolution reopens the window this closes"
    # Anchor the ORDER on the call forms, not on prose: the first literal
    # "/proc/self/fd/" in this function is in its explanatory comment, which sits
    # above os.open() — so indexing on the bare string measured the comment and
    # failed. Exactly the fragility that makes source-text assertions a last
    # resort rather than a default.
    i_open = src.index("os.open(")
    i_check = src.index('os.readlink("/proc/self/fd/')
    i_serve = src.index("os.fdopen(fd")
    assert i_open < i_check < i_serve, \
        "validate the descriptor AFTER opening and BEFORE streaming from it"


def test_the_video_range_server_was_not_collaterally_changed(mgr):
    """`_serve_file_range` is a near-copy of the share streaming loop, and a
    naive search-and-replace patched IT instead — the video tests caught it as a
    truncated body. It must keep its own plain path-based open."""
    import inspect
    src = inspect.getsource(mgr.Handler._serve_file_range)
    assert "os.fdopen(fd" not in src and "os.close(fd)" not in src, \
        "the video streamer has no fd of its own; it was patched by mistake once"
    assert 'with open(path, "rb") as f:' in src
