"""Endpoint contracts for the multi-document Notes API:
GET/POST /api/notes + /api/notes/tabs. Hermetic `client` fixture (conftest.py)."""
import os


def test_notes_index_seeds_default_tab(client):
    status, body = client.get("/api/notes")
    assert status == 200
    assert body["tabs"] == [{"id": "1", "name": "Notes"}]
    assert body["active"] == "1"


def test_note_content_roundtrip(client):
    status, body = client.post("/api/notes", {"id": "1", "content": "hello world"})
    assert status == 200 and body["ok"] is True
    status, body = client.get("/api/notes?id=1")
    assert status == 200 and body["content"] == "hello world"


def test_note_missing_returns_empty(client):
    status, body = client.get("/api/notes?id=doesnotexist")
    assert status == 200 and body["content"] == ""


def test_note_bad_id_rejected_on_save(client):
    status, body = client.post("/api/notes", {"id": "../etc/passwd", "content": "x"})
    assert status == 400 and "bad note id" in body["error"]


def test_note_bad_id_rejected_on_get(client):
    status, body = client.get("/api/notes?id=has%20space")
    assert status == 400


def test_note_content_must_be_string(client):
    status, body = client.post("/api/notes", {"id": "1", "content": 123})
    assert status == 400


def test_tabs_rename_and_reorder(client):
    client.post("/api/notes", {"id": "1", "content": "a"})
    status, body = client.post("/api/notes/tabs", {
        "tabs": [{"id": "2", "name": "Second"}, {"id": "1", "name": "First"}],
        "active": "2"})
    assert status == 200
    assert [t["id"] for t in body["tabs"]] == ["2", "1"]
    assert body["active"] == "2"
    _, idx = client.get("/api/notes")
    assert [t["name"] for t in idx["tabs"]] == ["Second", "First"]


def test_closing_a_tab_deletes_its_note_file(client, mgr):
    client.post("/api/notes", {"id": "1", "content": "keep"})
    client.post("/api/notes", {"id": "2", "content": "delete me"})
    assert os.path.exists(mgr._note_file("2"))
    # New tab set without id "2" -> its file is removed.
    client.post("/api/notes/tabs", {"tabs": [{"id": "1", "name": "Notes"}],
                                    "active": "1"})
    assert not os.path.exists(mgr._note_file("2"))
    assert os.path.exists(mgr._note_file("1"))


def test_tabs_reject_empty_list(client):
    status, _ = client.post("/api/notes/tabs", {"tabs": [], "active": "1"})
    assert status == 400


def test_tabs_drop_bad_ids_and_dupes(client):
    status, body = client.post("/api/notes/tabs", {
        "tabs": [{"id": "1"}, {"id": "../x"}, {"id": "1"}, {"id": "2"}],
        "active": "9"})
    assert status == 200
    ids = [t["id"] for t in body["tabs"]]
    assert ids == ["1", "2"]           # bad id + dupe dropped
    assert body["active"] == "1"       # invalid active -> first tab


def test_legacy_single_note_migrated_into_tab_one(client, mgr):
    # Seed the LEGACY single-note file; first index read migrates it into tab 1.
    os.makedirs(os.path.dirname(mgr._notes_legacy_file()), exist_ok=True)
    with open(mgr._notes_legacy_file(), "w") as f:
        f.write("legacy content")
    _, idx = client.get("/api/notes")
    assert idx["tabs"][0]["id"] == "1"
    _, note = client.get("/api/notes?id=1")
    assert note["content"] == "legacy content"
