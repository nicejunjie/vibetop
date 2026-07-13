"""Endpoint contracts for the Office (OnlyOffice/LibreOffice) endpoints:
config (JWT), doc + callback (HMAC t= auth), forcesave, new-from-template,
download original, preview path guard. Files live in the tmp HOME; the
OnlyOffice secret is written into the sandbox."""
import json
import os
import shutil


def _setup(mgr, home, ext="docx"):
    """Write the OnlyOffice secret + a real office file into the sandbox.
    Returns (rel_path, secret)."""
    os.makedirs(os.path.dirname(mgr.ONLYOFFICE_SECRET_FILE), exist_ok=True)
    with open(mgr.ONLYOFFICE_SECRET_FILE, "w") as f:
        f.write("test-secret-123")
    docs = os.path.join(str(home), "Documents")
    os.makedirs(docs, exist_ok=True)
    tmpl = os.path.join(mgr.REPO_DIR, "office", "templates", f"new.{ext}")
    dst = os.path.join(docs, f"file.{ext}")
    shutil.copyfile(tmpl, dst)
    return f"Documents/file.{ext}", "test-secret-123"


def test_config_returns_signed_editor_config(client, mgr, home):
    rel, secret = _setup(mgr, home)
    status, cfg = client.get("/api/office/config?path=" + rel)
    assert status == 200
    assert cfg["document"]["fileType"] == "docx"
    assert cfg["documentType"] == "word"
    assert cfg["document"]["key"]
    assert mgr._jwt_verify(cfg["token"], secret) is not None


def test_config_rejects_non_office_path(client, mgr, home):
    _setup(mgr, home)
    status, _ = client.get("/api/office/config?path=Documents/notes.txt")
    assert status == 400


def test_config_spreadsheet_doctype(client, mgr, home):
    rel, _ = _setup(mgr, home, ext="xlsx")
    _, cfg = client.get("/api/office/config?path=" + rel)
    assert cfg["documentType"] == "cell"


def test_doc_serves_bytes_with_valid_hmac(client, mgr, home):
    rel, secret = _setup(mgr, home)
    u = mgr.APP_USER
    sig = mgr._onlyoffice_sig(secret, u, rel)
    status, headers, body = client.get_raw(
        "/api/office/doc?path=%s&u=%s&t=%s" % (rel, u, sig))
    assert status == 200
    assert headers.get("Content-Type") == "application/octet-stream"
    assert body[:2] == b"PK"                 # docx is a zip


def test_doc_rejects_bad_hmac(client, mgr, home):
    rel, _ = _setup(mgr, home)
    status, _, _ = client.get_raw(
        "/api/office/doc?path=%s&u=%s&t=forged" % (rel, mgr.APP_USER))
    assert status == 403


def test_doc_rejects_hmac_for_other_user(client, mgr, home):
    # A token minted for user APP_USER must not authorize a different u=.
    rel, secret = _setup(mgr, home)
    sig = mgr._onlyoffice_sig(secret, mgr.APP_USER, rel)
    status, _, _ = client.get_raw(
        "/api/office/doc?path=%s&u=%s&t=%s" % (rel, "someoneelse", sig))
    assert status == 403


def test_download_serves_attachment(client, mgr, home):
    rel, _ = _setup(mgr, home)
    status, headers, body = client.get_raw("/api/office/download?path=" + rel)
    assert status == 200
    assert "attachment" in headers.get("Content-Disposition", "")
    assert body[:2] == b"PK"


def test_download_rejects_escape(client, mgr, home):
    _setup(mgr, home)
    status, _, _ = client.get_raw("/api/office/download?path=../../etc/passwd")
    assert status == 404


def test_callback_rejects_missing_jwt(client, mgr, home):
    rel, secret = _setup(mgr, home)
    u = mgr.APP_USER
    sig = mgr._onlyoffice_sig(secret, u, rel)
    # Valid path HMAC but no JWT in body/header -> refused (error 1).
    status, body = client.post(
        "/api/office/callback?path=%s&u=%s&t=%s" % (rel, u, sig),
        {"status": 2, "url": "http://x/y"})
    assert status == 200 and body == {"error": 1}


def test_callback_bad_hmac(client, mgr, home):
    rel, _ = _setup(mgr, home)
    status, body = client.post(
        "/api/office/callback?path=%s&u=%s&t=nope" % (rel, mgr.APP_USER),
        {"status": 2})
    assert status == 200 and body == {"error": 1}


def test_callback_valid_jwt_closes_session(client, mgr, home):
    rel, secret = _setup(mgr, home)
    u = mgr.APP_USER
    sig = mgr._onlyoffice_sig(secret, u, rel)
    mgr._office_sessions[(u, rel)] = "somekey"
    # status 4 = closed with no changes -> {"error":0}, session dropped, no write.
    token = mgr._jwt_sign({"status": 4}, secret)
    status, body = client.post(
        "/api/office/callback?path=%s&u=%s&t=%s" % (rel, u, sig),
        {"status": 4, "token": token})
    assert status == 200 and body == {"error": 0}
    assert (u, rel) not in mgr._office_sessions


def test_new_document_from_template(client, mgr, home):
    status, body = client.post("/api/office/new", {"type": "word"})
    assert status == 200 and body["ok"] is True
    assert body["path"].startswith("Documents/")
    assert body["path"].endswith(".docx")
    assert os.path.isfile(os.path.join(str(home), body["path"]))


def test_new_document_unknown_type(client, mgr, home):
    status, _ = client.post("/api/office/new", {"type": "bogus"})
    assert status == 400


def test_preview_serves_pdf(client, mgr, home, monkeypatch):
    rel, _ = _setup(mgr, home)
    # Stub the LibreOffice conversion with a canned PDF on disk.
    pdf = os.path.join(str(home), "rendition.pdf")
    with open(pdf, "wb") as f:
        f.write(b"%PDF-1.4 fake")
    monkeypatch.setattr(mgr, "_office_convert_to_pdf", lambda src: pdf)
    status, headers, body = client.get_raw("/api/office/preview?path=" + rel)
    assert status == 200
    assert headers.get("Content-Type") == "application/pdf"
    assert body == b"%PDF-1.4 fake"


def test_preview_rejects_non_office(client, mgr, home):
    status, _ = client.get("/api/office/preview?path=Documents/readme.txt")
    assert status == 400
