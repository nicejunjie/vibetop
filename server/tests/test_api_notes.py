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
        "rev": 0, "tabs": [{"id": "2", "name": "Second"}, {"id": "1", "name": "First"}],
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
    client.post("/api/notes/tabs", {"rev": 0, "tabs": [{"id": "1"}, {"id": "2"}], "active": "1"})
    # New tab set without id "2" -> its file is removed.
    client.post("/api/notes/tabs", {"rev": 1, "tabs": [{"id": "1", "name": "Notes"}],
                                    "active": "1"})
    assert not os.path.exists(mgr._note_file("2"))
    assert os.path.exists(mgr._note_file("1"))


def test_tabs_reject_empty_list(client):
    status, _ = client.post("/api/notes/tabs", {"tabs": [], "active": "1"})
    assert status == 400


def test_tabs_drop_bad_ids_and_dupes(client):
    status, body = client.post("/api/notes/tabs", {
        "rev": 0, "tabs": [{"id": "1"}, {"id": "../x"}, {"id": "1"}, {"id": "2"}],
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


def test_stale_tab_list_cannot_delete_a_new_remote_note(client):
    _, initial = client.get('/api/notes')
    status, added = client.post('/api/notes/tabs', {
        'rev': initial['rev'], 'tabs': initial['tabs'] + [{'id': 'remote', 'name': 'Remote'}]})
    assert status == 200
    client.post('/api/notes', {'id': 'remote', 'content': 'important'})
    status, conflict = client.post('/api/notes/tabs', {
        'rev': initial['rev'], 'tabs': initial['tabs']})
    assert status == 409 and conflict['conflict']
    assert conflict['rev'] == added['rev']
    assert any(t['id'] == 'remote' for t in conflict['tabs'])
    assert client.get('/api/notes?id=remote')[1]['content'] == 'important'


def test_missing_revision_cannot_delete_notes(client):
    _, initial = client.get('/api/notes')
    status, _ = client.post('/api/notes/tabs', {'tabs': [{'id': 'other'}]})
    assert status == 409
    assert client.get('/api/notes')[1] == initial


def test_tab_change_preserves_unindexed_body_in_flight(client):
    client.post('/api/notes', {'id': 'inflight', 'content': 'not registered yet'})
    _, index = client.get('/api/notes')
    status, _ = client.post('/api/notes/tabs', {
        'rev': index['rev'], 'tabs': index['tabs']})
    assert status == 200
    assert client.get('/api/notes?id=inflight')[1]['content'] == 'not registered yet'


def test_same_revision_cannot_be_used_twice(client):
    _, index = client.get('/api/notes')
    body = {'rev': index['rev'], 'tabs': index['tabs']}
    assert client.post('/api/notes/tabs', body)[0] == 200
    assert client.post('/api/notes/tabs', body)[0] == 409


def test_oversized_tab_list_does_not_truncate_or_delete(client):
    _, index = client.get('/api/notes')
    status, _ = client.post('/api/notes/tabs', {
        'rev': index['rev'], 'tabs': [{'id': 'n' + str(i)} for i in range(65)]})
    assert status == 400
    assert client.get('/api/notes')[1] == index
