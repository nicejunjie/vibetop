"""Unit tests for the security-critical pure functions in terminal-manager.py.

These guard the scariest regressions: a path-traversal escape, a shell-injection
bypass, a JWT/HMAC that accepts a forgery, or a multipart parser that mis-frames
a body. They are pure (or filesystem-only) so they run without the HTTP server,
root, or any of the systemd/nginx/Docker stack.

    cd terminal && python -m pytest tests/ -q
"""
import base64
import io
import json

import pytest


# --------------------------------------------------------------------------
# _valid_browser_url — shell-injection guard for `chromium <url>` via `su -c`
# --------------------------------------------------------------------------

GOOD_URLS = [
    "http://example.com",
    "https://example.com/path?a=1&b=2",
    "https://192.168.1.10:8080/x",
    "https://en.wikipedia.org/wiki/Foo_Bar-baz",
    "http://host/p%20with%20encoded",
    "https://example.com/#fragment",
]

BAD_URLS = [
    "",                                   # empty
    "ftp://example.com",                  # wrong scheme
    "file:///etc/passwd",                 # wrong scheme
    "javascript:alert(1)",                # wrong scheme
    "example.com",                        # no scheme
    "  http://example.com",               # leading space => no http() prefix
    'http://x/"',                         # double quote
    "http://x/'",                         # single quote
    "http://x/;reboot",                   # semicolon
    "http://x/`id`",                      # backtick
    "http://x/$(id)",                     # $ and parens
    "http://x/(group)",                   # parens
    "http://x/\nrm -rf",                  # newline
]


@pytest.mark.parametrize("url", GOOD_URLS)
def test_valid_browser_url_accepts(mgr, url):
    assert mgr._valid_browser_url(url) is True


@pytest.mark.parametrize("url", BAD_URLS)
def test_valid_browser_url_rejects(mgr, url):
    assert mgr._valid_browser_url(url) is False


def test_valid_browser_url_rejects_every_metachar(mgr):
    # Each individually-blocked character must fail even in an otherwise-valid URL.
    for c in ('"', "'", ";", "`", "$", "(", ")", "\n", "\\"):
        assert mgr._valid_browser_url("https://example.com/" + c) is False


def test_valid_browser_url_realistic_injection(mgr):
    # The classic break-out attempt against the `su -c '... "<url>"'` string.
    assert mgr._valid_browser_url('https://x/"; rm -rf ~; echo "') is False


# --------------------------------------------------------------------------
# Apps launcher: _valid_x_window_id (wmctrl id) + _valid_launch_cmd
# --------------------------------------------------------------------------

@pytest.mark.parametrize("wid", ["0x0", "0x00a00003", "0xDEADBEEF", "0x1234abcd"])
def test_valid_x_window_id_accepts(mgr, wid):
    assert mgr._valid_x_window_id(wid) is True


@pytest.mark.parametrize("wid", [
    "", None,
    "00a00003",                 # missing 0x prefix
    "0x",                       # no digits
    "0xg00d",                   # non-hex char
    "0x00a00003; xdotool",      # trailing injection
    "0x00a00003 0x1",           # space-separated second token
    "0x" + "f" * 17,            # absurdly long
    "-1",                       # wmctrl desktop sentinel, not a window id
])
def test_valid_x_window_id_rejects(mgr, wid):
    assert mgr._valid_x_window_id(wid) is False


@pytest.mark.parametrize("cmd", ["gimp", "eog photo.jpg", "xterm -e htop",
                                 "nautilus ~/Documents", "x" * 1024])
def test_valid_launch_cmd_accepts(mgr, cmd):
    assert mgr._valid_launch_cmd(cmd) is True


@pytest.mark.parametrize("cmd", [
    "", None,
    "x" * 1025,                 # over the length cap
    "gimp\nrm -rf ~",           # newline would split the su -c string
    "gimp\r\nreboot",           # CR/LF
    "gimp\x00evil",             # embedded NUL
])
def test_valid_launch_cmd_rejects(mgr, cmd):
    assert mgr._valid_launch_cmd(cmd) is False


@pytest.mark.parametrize("nid", ["1", "abc", "n-1a2b", "note_3", "A" * 64])
def test_safe_note_id_accepts(mgr, nid):
    assert mgr._safe_note_id(nid) is True


@pytest.mark.parametrize("nid", [
    "", None, 1, "A" * 65,
    "../etc/passwd",            # path traversal
    "a/b",                      # slash
    "note.md",                  # dot (would let the .md suffix double up / escape)
    "x y",                      # space
    "café",                     # non-ascii
    "..",
])
def test_safe_note_id_rejects(mgr, nid):
    assert mgr._safe_note_id(nid) is False


@pytest.mark.parametrize("cmd,prog", [
    ("eog", "eog"),
    ("eog photo.jpg", "eog"),
    ("firefox", "firefox"),
    ("/snap/bin/firefox", "/snap/bin/firefox"),
    ("env GTK_THEME=Adwaita eog x.png", "eog"),     # skip leading VAR=val
    ("A=1 B=2 gimp", "gimp"),                        # skip multiple env assigns
    ("xterm -e htop", "xterm"),
    ("", ""),
    ("FOO=bar", ""),                                 # only an assignment, no prog
])
def test_launch_prog(mgr, cmd, prog):
    assert mgr._launch_prog(cmd) == prog


# --------------------------------------------------------------------------
# _resolve_under_home — path-traversal guard for office file access
# --------------------------------------------------------------------------

@pytest.fixture
def home(mgr, tmp_path, monkeypatch):
    """Point OFFICE_HOME at a temp dir with a known file, restore after."""
    monkeypatch.setattr(mgr, "OFFICE_HOME", str(tmp_path))
    (tmp_path / "Documents").mkdir()
    f = tmp_path / "Documents" / "report.docx"
    f.write_text("x")
    return tmp_path


def test_resolve_under_home_allows_real_file(mgr, home):
    got = mgr._resolve_under_home("Documents/report.docx")
    assert got == str((home / "Documents" / "report.docx").resolve())


def test_resolve_under_home_strips_leading_slash(mgr, home):
    # A leading "/" must be treated as relative-to-home, not absolute.
    assert mgr._resolve_under_home("/Documents/report.docx") is not None


def test_resolve_under_home_rejects_dotdot_escape(mgr, home):
    assert mgr._resolve_under_home("../../../etc/passwd") is None
    assert mgr._resolve_under_home("Documents/../../outside") is None


def test_resolve_under_home_rejects_absolute_outside(mgr, home):
    # lstrip("/") turns "/etc/passwd" into "etc/passwd" under home -> not a file.
    assert mgr._resolve_under_home("/etc/passwd") is None


def test_resolve_under_home_rejects_symlink_escape(mgr, home, tmp_path):
    secret = tmp_path.parent / "secret.txt"
    secret.write_text("top secret")
    link = home / "escape.docx"
    link.symlink_to(secret)
    # realpath resolves the symlink to outside home -> refused.
    assert mgr._resolve_under_home("escape.docx") is None


def test_resolve_under_home_rejects_directory(mgr, home):
    assert mgr._resolve_under_home("Documents") is None


def test_resolve_under_home_rejects_missing(mgr, home):
    assert mgr._resolve_under_home("Documents/nope.docx") is None


def test_resolve_under_home_rejects_empty(mgr, home):
    assert mgr._resolve_under_home("") is None
    assert mgr._resolve_under_home(None) is None


# --------------------------------------------------------------------------
# OFFICE_RE — only office document extensions match
# --------------------------------------------------------------------------

@pytest.mark.parametrize("name", [
    "a.docx", "a.doc", "a.docm", "b.xlsx", "b.xls", "c.pptx", "c.ppt",
    "d.odt", "d.ods", "d.odp", "e.rtf", "f.csv", "g.tsv", "UPPER.DOCX",
    "with space.xlsx", "dir/sub/deep.pptx",
])
def test_office_re_matches(mgr, name):
    assert mgr.OFFICE_RE.search(name)


@pytest.mark.parametrize("name", [
    "a.exe", "a.sh", "a.txt", "a.pdf", "a.docx.exe", "a.zip", "noext",
    "a.do", "a.docxx",
])
def test_office_re_rejects(mgr, name):
    assert not mgr.OFFICE_RE.search(name)


# --------------------------------------------------------------------------
# JWT (HS256) — _jwt_sign / _jwt_verify
# --------------------------------------------------------------------------

SECRET = "s3cr3t-shared-key"


def test_jwt_roundtrip(mgr):
    payload = {"document": {"key": "abc"}, "n": 7}
    token = mgr._jwt_sign(payload, SECRET)
    assert mgr._jwt_verify(token, SECRET) == payload


def test_jwt_rejects_wrong_secret(mgr):
    token = mgr._jwt_sign({"a": 1}, SECRET)
    assert mgr._jwt_verify(token, "other-secret") is None


def test_jwt_rejects_tampered_body(mgr):
    token = mgr._jwt_sign({"role": "viewer"}, SECRET)
    head, body, sig = token.split(".")
    forged_body = mgr._b64url(json.dumps({"role": "admin"}).encode())
    assert mgr._jwt_verify(f"{head}.{forged_body}.{sig}", SECRET) is None


def test_jwt_rejects_tampered_signature(mgr):
    token = mgr._jwt_sign({"a": 1}, SECRET)
    head, body, _ = token.split(".")
    assert mgr._jwt_verify(f"{head}.{body}.AAAA", SECRET) is None


def test_jwt_rejects_malformed(mgr):
    for bad in ["", "abc", "a.b", "a.b.c.d", "...", "not-a-token"]:
        assert mgr._jwt_verify(bad, SECRET) is None


def test_jwt_alg_none_forgery_is_rejected(mgr):
    # An attacker swaps the header to alg=none and drops the signature.
    # _jwt_verify always recomputes HS256, so the empty/garbage sig must fail.
    head = mgr._b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    body = mgr._b64url(json.dumps({"role": "admin"}).encode())
    assert mgr._jwt_verify(f"{head}.{body}.", SECRET) is None


# --------------------------------------------------------------------------
# _onlyoffice_sig — HMAC authorizing the unauthenticated doc/callback endpoints
# --------------------------------------------------------------------------

def test_onlyoffice_sig_is_deterministic(mgr):
    a = mgr._onlyoffice_sig(SECRET, "Documents/x.docx")
    b = mgr._onlyoffice_sig(SECRET, "Documents/x.docx")
    assert a == b and len(a) == 32


def test_onlyoffice_sig_varies_by_path_and_secret(mgr):
    base = mgr._onlyoffice_sig(SECRET, "a.docx")
    assert base != mgr._onlyoffice_sig(SECRET, "b.docx")
    assert base != mgr._onlyoffice_sig("other", "a.docx")


# --------------------------------------------------------------------------
# _b64url — unpadded urlsafe base64
# --------------------------------------------------------------------------

def test_b64url_unpadded_and_urlsafe(mgr):
    out = mgr._b64url(b"\xfb\xff\xfe" * 3)
    assert "=" not in out
    assert "+" not in out and "/" not in out
    # Decodable once padding is restored.
    pad = "=" * (-len(out) % 4)
    assert base64.urlsafe_b64decode(out + pad) == b"\xfb\xff\xfe" * 3


# --------------------------------------------------------------------------
# _safe_upload_name — filename sanitization
# --------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("photo.jpg", "photo.jpg"),
    (r"C:\fakepath\photo.jpg", "photo.jpg"),
    ("../../etc/passwd", "passwd"),
    ("a/b/c/deep.png", "deep.png"),
    ("", "upload"),
    (None, "upload"),
    (".", "upload"),
    ("..", "upload"),
    ("with\x00null.txt", "withnull.txt"),
    ("tab\ttab.txt", "tabtab.txt"),
])
def test_safe_upload_name(mgr, raw, expected):
    assert mgr._safe_upload_name(raw) == expected


def test_safe_upload_name_truncates(mgr):
    assert len(mgr._safe_upload_name("a" * 500 + ".txt")) == 255


# --------------------------------------------------------------------------
# _unique_path — collision-avoiding destination
# --------------------------------------------------------------------------

def test_unique_path_passthrough_when_free(mgr, tmp_path):
    p = str(tmp_path / "new.txt")
    assert mgr._unique_path(p) == p


def test_unique_path_appends_suffix(mgr, tmp_path):
    (tmp_path / "f.txt").write_text("a")
    assert mgr._unique_path(str(tmp_path / "f.txt")) == str(tmp_path / "f-1.txt")
    (tmp_path / "f-1.txt").write_text("b")
    assert mgr._unique_path(str(tmp_path / "f.txt")) == str(tmp_path / "f-2.txt")


# --------------------------------------------------------------------------
# _atomic_write — temp-file + os.replace
# --------------------------------------------------------------------------

def test_atomic_write_creates_and_overwrites(mgr, tmp_path):
    p = str(tmp_path / "sub" / "dir" / "state.json")  # nested dir auto-created
    mgr._atomic_write(p, "first")
    with open(p) as f:
        assert f.read() == "first"
    mgr._atomic_write(p, "second")
    with open(p) as f:
        assert f.read() == "second"


def test_atomic_write_leaves_no_temp_files(mgr, tmp_path):
    p = str(tmp_path / "state.json")
    mgr._atomic_write(p, "data")
    leftovers = [n for n in __import__("os").listdir(tmp_path) if n.startswith(".tmp-")]
    assert leftovers == []


# --------------------------------------------------------------------------
# _LimitedReader — never read past Content-Length
# --------------------------------------------------------------------------

def test_limited_reader_caps_at_length(mgr):
    src = io.BytesIO(b"abcdefghij")  # 10 bytes available
    r = mgr._LimitedReader(src, 4)   # but only 4 allowed
    assert r.read(100) == b"abcd"
    assert r.read(100) == b""        # exhausted, no block past the limit


def test_limited_reader_partial_reads(mgr):
    r = mgr._LimitedReader(io.BytesIO(b"abcdef"), 5)
    assert r.read(2) == b"ab"
    assert r.read(2) == b"cd"
    assert r.read(2) == b"e"         # capped to the last allowed byte
    assert r.read(2) == b""


# --------------------------------------------------------------------------
# _iter_multipart_files — streaming multipart parser
# --------------------------------------------------------------------------

def _build_multipart(token, parts):
    """parts: list of (disposition_header, body_bytes). Returns wire bytes."""
    delim = b"--" + token.encode()
    out = b""
    for disposition, content in parts:
        out += delim + b"\r\n"
        out += disposition.encode() + b"\r\n\r\n"
        out += content + b"\r\n"
    out += delim + b"--\r\n"
    return out


def _parse(mgr, token, parts):
    body = _build_multipart(token, parts)
    src = mgr._LimitedReader(io.BytesIO(body), len(body))
    boundary = ("--" + token).encode()
    return [(fn, r.read() if hasattr(r, "read") else r)
            for fn, r in _drain(mgr._iter_multipart_files(src, boundary))]


def _drain(it):
    """Read each part's stream fully as the upload handler does."""
    for fn, reader in it:
        chunks = []
        while not reader.done:
            c = reader.read()
            if not c:
                break
            chunks.append(c)
        yield fn, b"".join(chunks)


def test_multipart_single_file(mgr):
    out = _parse(mgr, "BOUND", [
        ('Content-Disposition: form-data; name="file"; filename="a.txt"', b"hello world"),
    ])
    assert out == [("a.txt", b"hello world")]


def test_multipart_multiple_files(mgr):
    out = _parse(mgr, "X1Y2", [
        ('Content-Disposition: form-data; name="file"; filename="one.txt"', b"first"),
        ('Content-Disposition: form-data; name="file"; filename="two.bin"', b"\x00\x01\x02\r\nstill"),
    ])
    assert out == [("one.txt", b"first"), ("two.bin", b"\x00\x01\x02\r\nstill")]


def test_multipart_skips_non_file_field(mgr):
    out = _parse(mgr, "B", [
        ('Content-Disposition: form-data; name="csrf"', b"token-value"),
        ('Content-Disposition: form-data; name="file"; filename="real.txt"', b"payload"),
    ])
    assert out == [("real.txt", b"payload")]


def test_multipart_empty_form(mgr):
    body = b"--B--\r\n"
    src = mgr._LimitedReader(io.BytesIO(body), len(body))
    assert list(mgr._iter_multipart_files(src, b"--B")) == []


def test_multipart_preserves_raw_traversal_filename(mgr):
    # The parser yields the raw filename; _safe_upload_name does sanitization.
    out = _parse(mgr, "B", [
        (r'Content-Disposition: form-data; name="file"; filename="../../evil.txt"', b"x"),
    ])
    assert out[0][0] == "../../evil.txt"
    assert mgr._safe_upload_name(out[0][0]) == "evil.txt"


def test_multipart_content_containing_boundary_prefix(mgr):
    # Body bytes that resemble the boundary but aren't it must not split early.
    tricky = b"--BOUND but not really\r\nmore data"
    out = _parse(mgr, "BOUND", [
        ('Content-Disposition: form-data; name="file"; filename="t.txt"', tricky),
    ])
    assert out == [("t.txt", tricky)]


# --------------------------------------------------------------------------
# _desktop_union / _desktop_cap — cross-instance liveness math
# --------------------------------------------------------------------------

def test_desktop_union_respects_ttl_and_order(mgr):
    now = 1000.0
    data = {"instances": {
        "live":  {"open": ["terminal", "browser"], "ts": now - 10},
        "stale": {"open": ["files"], "ts": now - (mgr.DESKTOP_TTL + 5)},
        "live2": {"open": ["browser", "notes"], "ts": now - 1},
    }}
    union = mgr._desktop_union(data, now)
    assert "files" not in union                  # stale dropped
    assert union == ["terminal", "browser", "notes"]  # order-preserving, deduped


def test_desktop_cap_keeps_most_recent(mgr):
    n = mgr.DESKTOP_MAX_INSTANCES + 5
    data = {"instances": {f"i{k}": {"open": [], "ts": float(k)} for k in range(n)}}
    mgr._desktop_cap(data)
    kept = data["instances"]
    assert len(kept) == mgr.DESKTOP_MAX_INSTANCES
    # The newest (highest ts) survive; the oldest 5 are evicted.
    assert "i0" not in kept and f"i{n-1}" in kept
