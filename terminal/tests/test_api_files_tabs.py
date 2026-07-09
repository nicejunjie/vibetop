"""Endpoint contracts for the shared Files-app tab set: GET/POST /api/files/tabs."""


def test_default_when_unset(client):
    status, body = client.get("/api/files/tabs")
    assert status == 200
    assert body == {"paths": ["/files/files/"], "active": 0}


def test_roundtrip(client):
    paths = ["/files/files/home/user", "/files/files/etc"]
    status, body = client.post("/api/files/tabs", {"paths": paths, "active": 1})
    assert status == 200 and body["ok"] is True
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == paths and got["active"] == 1


def test_paths_must_be_a_list(client):
    status, body = client.post("/api/files/tabs", {"paths": "nope"})
    assert status == 400 and "list" in body["error"]


def test_non_filebrowser_urls_are_filtered_out(client):
    # Anything not starting with /files/files becomes an iframe src, so it's
    # rejected; an all-bad set falls back to the default root tab.
    status, body = client.post("/api/files/tabs",
                               {"paths": ["http://evil", "/etc/passwd"], "active": 0})
    assert status == 200
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == ["/files/files/"]


def test_out_of_range_active_clamped(client):
    client.post("/api/files/tabs", {"paths": ["/files/files/a"], "active": 99})
    _, got = client.get("/api/files/tabs")
    assert got["active"] == 0
