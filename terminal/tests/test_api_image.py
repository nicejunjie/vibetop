"""Endpoint contracts for /api/file/image — the native Files listing/viewer bytes,
including the &thumb=N server-side thumbnail path (PIL downscale + strong mtime
ETag; any thumbnailing failure must degrade to the ORIGINAL bytes, never an error,
because the <img> is CSS-sized anyway)."""
import io
import urllib.error
import urllib.request

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image


def _raw(client, path, headers=None, method="GET", anon=False):
    """Authenticated by default: these endpoints reject a cookieless caller
    (it is a local tenant, not the service account). anon=True is the
    deliberate no-session case."""
    h = dict(headers or {})
    if not anon:
        h.setdefault("Cookie", "vt_session=" + client.mgr._sign_session(client.mgr.APP_USER))
    req = urllib.request.Request(client.base + path, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def _mkpng(home, rel, size=(64, 48), mode="RGB"):
    p = home / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.new(mode, size, (200, 30, 30) if mode == "RGB" else (200, 30, 30, 128)).save(str(p))
    return p


def test_full_bytes(client, home):
    p = _mkpng(home, "pics/red.png")
    status, hdrs, body = _raw(client, "/api/file/image?path=pics/red.png")
    assert status == 200
    assert hdrs["content-type"] == "image/png"
    assert body == p.read_bytes()


def test_thumb_downscales_and_tags(client, home):
    _mkpng(home, "pics/big.png", size=(64, 48))
    status, hdrs, body = _raw(client, "/api/file/image?path=pics/big.png&thumb=16")
    assert status == 200
    assert hdrs["content-type"] == "image/jpeg"        # opaque RGB -> JPEG
    with Image.open(io.BytesIO(body)) as im:
        assert max(im.size) <= 16
        assert im.size == (16, 12)                     # aspect preserved
    etag = hdrs["etag"]
    assert etag.startswith('"') and etag.endswith('"')
    # strong ETag round-trips as a 304
    status2, hdrs2, body2 = _raw(client, "/api/file/image?path=pics/big.png&thumb=16",
                                 headers={"If-None-Match": etag})
    assert status2 == 304
    assert body2 == b""


def test_thumb_alpha_stays_png(client, home):
    _mkpng(home, "pics/ghost.png", mode="RGBA")
    status, hdrs, body = _raw(client, "/api/file/image?path=pics/ghost.png&thumb=16")
    assert status == 200
    assert hdrs["content-type"] == "image/png"         # alpha preserved
    with Image.open(io.BytesIO(body)) as im:
        assert im.mode == "RGBA"


def test_thumb_of_corrupt_image_serves_original(client, home):
    p = home / "pics" / "broken.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"this is not a png")
    status, hdrs, body = _raw(client, "/api/file/image?path=pics/broken.png&thumb=16")
    assert status == 200                               # degrade, don't error
    assert body == b"this is not a png"


def test_thumb_param_garbage_ignored(client, home):
    p = _mkpng(home, "pics/red2.png")
    status, _, body = _raw(client, "/api/file/image?path=pics/red2.png&thumb=banana")
    assert status == 200
    assert body == p.read_bytes()


def test_non_image_rejected(client, home):
    (home / "notes.txt").write_text("hi")
    status, _, _ = _raw(client, "/api/file/image?path=notes.txt")
    assert status == 400


def test_missing_file_404(client, home):
    status, _, _ = _raw(client, "/api/file/image?path=pics/nope.png&thumb=16")
    assert status == 404
