"""Endpoint contracts for the streaming upload inbox:
POST /api/upload, GET /api/upload/list, POST /api/upload/clear."""
import os


def _multipart(files):
    """files = [(field, filename, bytes)] -> (content_type, body)."""
    boundary = "----vibetopTEST"
    out = []
    for field, filename, content in files:
        out.append(("--" + boundary + "\r\n").encode())
        out.append(('Content-Disposition: form-data; name="%s"; filename="%s"\r\n'
                    % (field, filename)).encode())
        out.append(b"Content-Type: application/octet-stream\r\n\r\n")
        out.append(content)
        out.append(b"\r\n")
    out.append(("--" + boundary + "--\r\n").encode())
    return "multipart/form-data; boundary=" + boundary, b"".join(out)


def _upload(client, files):
    ctype, body = _multipart(files)
    return client.post("/api/upload", raw=body, headers={"Content-Type": ctype})


def test_upload_writes_file(client, mgr):
    status, body = _upload(client, [("file", "photo.jpg", b"\xff\xd8imagedata")])
    assert status == 200 and body["ok"] is True
    assert body["saved"][0]["name"] == "photo.jpg"
    assert body["saved"][0]["size"] == len(b"\xff\xd8imagedata")
    dst = os.path.join(mgr._upload_dir(), "photo.jpg")
    assert os.path.isfile(dst)
    with open(dst, "rb") as f:
        assert f.read() == b"\xff\xd8imagedata"


def test_upload_multiple_files(client):
    status, body = _upload(client, [("f1", "a.txt", b"aaa"), ("f2", "b.txt", b"bbbb")])
    assert status == 200
    names = {s["name"] for s in body["saved"]}
    assert names == {"a.txt", "b.txt"}


def test_upload_sanitizes_traversal_name(client, mgr):
    status, body = _upload(client, [("file", "../../../etc/evil.txt", b"x")])
    assert status == 200
    # Directory components stripped -> lands as a plain name inside UPLOAD_DIR.
    saved = body["saved"][0]["name"]
    assert "/" not in saved and saved == "evil.txt"
    assert os.path.isfile(os.path.join(mgr._upload_dir(), saved))
    # Nothing escaped the inbox.
    assert not os.path.exists(os.path.join(mgr._upload_dir(), "..", "etc", "evil.txt"))


def test_upload_rejects_non_multipart(client):
    status, body = client.post("/api/upload", raw=b"{}",
                               headers={"Content-Type": "application/json"})
    assert status == 400


def test_upload_list_newest_first(client):
    _upload(client, [("file", "one.txt", b"1")])
    _upload(client, [("file", "two.txt", b"22")])
    status, body = client.get("/api/upload/list")
    assert status == 200
    assert {f["name"] for f in body["files"]} == {"one.txt", "two.txt"}
    assert body["files"] == sorted(body["files"], key=lambda f: f["mtime"], reverse=True)


def test_upload_clear_removes_files(client, mgr):
    _upload(client, [("file", "gone.txt", b"x")])
    status, body = client.post("/api/upload/clear", {})
    assert status == 200 and body["removed"] >= 1
    assert os.listdir(mgr._upload_dir()) == []
