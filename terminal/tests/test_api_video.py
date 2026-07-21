"""Endpoint contracts for the in-Files video player (/api/video/{info,media,subs}).

Exercises the real handlers over the in-process HTTP harness (conftest `client`),
with HOME fenced to a tmp dir. ffprobe/ffmpeg are never invoked — the module-level
wrappers (`_video_probe_tracks`, `_video_prepared_path`, `_ffmpeg_extract_subs`) are
monkeypatched, and the info handler's `shutil.which` gate is stubbed truthy — so the
suite stays hermetic (CI has no ffmpeg). Covers: track parsing, the path-traversal
fence, the graceful "ffmpeg missing" response, HTTP Range (206/416) on the prepared
MP4, and WebVTT subtitle serving.
"""
import os
import urllib.error
import urllib.request


def _raw(client, path, headers=None, method="GET"):
    """GET/HEAD returning (status, headers-dict, body-bytes), with optional request
    headers — the shared `client.get_raw` can't send request headers (needed for Range)."""
    req = urllib.request.Request(client.base + path, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def _mkfile(home, rel, content=b"x"):
    p = home / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content if isinstance(content, bytes) else content.encode())
    return p


def _which_ok(monkeypatch, mgr):
    monkeypatch.setattr(mgr.shutil, "which", lambda name: "/usr/bin/" + name)


_FAKE_TRACKS = {
    "video": {"codec": "h264", "width": 1280, "height": 720},
    "audio": [
        {"ai": 0, "codec": "aac", "lang": "jpn", "title": "Japanese"},
        {"ai": 1, "codec": "aac", "lang": "zho", "title": "Chinese"},
    ],
    "subs": [
        {"si": 0, "codec": "subrip", "lang": "zho", "title": ""},
        {"si": 1, "codec": "subrip", "lang": "eng", "title": ""},
    ],
    "duration": 60.06,
}


# ---- /api/video/info -------------------------------------------------------

def test_info_returns_tracks(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    _which_ok(monkeypatch, mgr)
    monkeypatch.setattr(mgr, "_video_probe_tracks", lambda src: _FAKE_TRACKS)
    status, body = client.get("/api/video/info?path=movie.mkv")
    assert status == 200
    assert body["ok"] is True
    assert body["needsPrepare"] is True            # .mkv + 2 audio tracks
    assert [a["lang"] for a in body["audio"]] == ["jpn", "zho"]
    assert [s["lang"] for s in body["subs"]] == ["zho", "eng"]
    assert body["video"]["compatible"] is True


def test_info_ffmpeg_missing(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    monkeypatch.setattr(mgr.shutil, "which", lambda name: None)
    status, body = client.get("/api/video/info?path=movie.mkv")
    assert status == 200
    assert body["ok"] is False
    assert body["ffmpeg"] is False


def test_info_rejects_non_video(client, mgr, home, monkeypatch):
    _mkfile(home, "notes.txt")
    _which_ok(monkeypatch, mgr)
    status, body = client.get("/api/video/info?path=notes.txt")
    assert status == 400


def test_info_rejects_traversal(client, mgr, home, monkeypatch):
    _which_ok(monkeypatch, mgr)
    status, body = client.get("/api/video/info?path=../../etc/passwd.mp4")
    assert status == 400


# ---- /api/video/media (Range) ----------------------------------------------

def test_media_range_serves_partial(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    prepared = _mkfile(home, ".cache/prep.mp4", b"0123456789")
    monkeypatch.setattr(mgr, "_video_prepared_path", lambda src, aidx: str(prepared))
    status, hdrs, body = _raw(client, "/api/video/media?path=movie.mkv&audio=0",
                              headers={"Range": "bytes=2-5"})
    assert status == 206
    assert body == b"2345"
    assert hdrs["content-range"] == "bytes 2-5/10"
    assert hdrs["accept-ranges"] == "bytes"
    assert hdrs["content-type"] == "video/mp4"     # bytes are MP4 despite .mkv name


def test_media_full_get(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    prepared = _mkfile(home, ".cache/prep.mp4", b"0123456789")
    monkeypatch.setattr(mgr, "_video_prepared_path", lambda src, aidx: str(prepared))
    status, hdrs, body = _raw(client, "/api/video/media?path=movie.mkv")
    assert status == 200
    assert body == b"0123456789"
    assert hdrs["accept-ranges"] == "bytes"


def test_media_unsatisfiable_range(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    prepared = _mkfile(home, ".cache/prep.mp4", b"0123456789")
    monkeypatch.setattr(mgr, "_video_prepared_path", lambda src, aidx: str(prepared))
    status, hdrs, body = _raw(client, "/api/video/media?path=movie.mkv",
                              headers={"Range": "bytes=99-200"})
    assert status == 416
    assert hdrs["content-range"] == "bytes */10"


def test_media_head_no_body(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    prepared = _mkfile(home, ".cache/prep.mp4", b"0123456789")
    monkeypatch.setattr(mgr, "_video_prepared_path", lambda src, aidx: str(prepared))
    status, hdrs, body = _raw(client, "/api/video/media?path=movie.mkv", method="HEAD")
    assert status == 200
    assert hdrs["accept-ranges"] == "bytes"
    assert body == b""


def test_media_rejects_traversal(client, mgr, home):
    status, _, _ = _raw(client, "/api/video/media?path=../../etc/passwd.mp4")
    assert status == 404


# ---- /api/video/subs -------------------------------------------------------

def test_subs_serves_vtt(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    vtt = _mkfile(home, ".cache/sub0.vtt", b"WEBVTT\n\n00:00.000 --> 00:02.000\nHi\n")
    monkeypatch.setattr(mgr, "_ffmpeg_extract_subs", lambda src, sidx: str(vtt))
    status, hdrs, body = _raw(client, "/api/video/subs?path=movie.mkv&sub=0")
    assert status == 200
    assert hdrs["content-type"].startswith("text/vtt")
    assert body.startswith(b"WEBVTT")


def test_subs_missing_returns_404(client, mgr, home, monkeypatch):
    _mkfile(home, "movie.mkv")
    monkeypatch.setattr(mgr, "_ffmpeg_extract_subs", lambda src, sidx: None)
    status, _, _ = _raw(client, "/api/video/subs?path=movie.mkv&sub=9")
    assert status == 404
