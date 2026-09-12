"""Endpoint contracts for the shared Files-app tab set: GET/POST /api/files/tabs.

The stored shape is an ABSOLUTE folder path per tab. It used to be a FileBrowser
browse URL ("/files/files/<percent-encoded path>"); FileBrowser was retired in
phase 4b, so those entries are MIGRATED on read and write rather than dropped —
a user whose tabs were saved by the old wrapper must not lose them.
"""


def test_default_when_unset(client, home):
    status, body = client.get("/api/files/tabs")
    assert status == 200
    # No stored set -> the user's own home, not the filesystem root.
    assert body == {"paths": [str(home)], "active": 0}


def test_roundtrip(client):
    paths = ["/home/user", "/etc"]
    status, body = client.post("/api/files/tabs", {"paths": paths, "active": 1})
    assert status == 200 and body["ok"] is True
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == paths and got["active"] == 1


def test_paths_must_be_a_list(client):
    status, body = client.post("/api/files/tabs", {"paths": "nope"})
    assert status == 400 and "list" in body["error"]


def test_non_absolute_paths_are_filtered_out(client, home):
    # Each entry becomes the wrapper's iframe hash, so a URL or a relative path is
    # rejected; an all-bad set falls back to the default home tab.
    status, _body = client.post("/api/files/tabs",
                                {"paths": ["http://evil", "etc/passwd", ""], "active": 0})
    assert status == 200
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == [str(home)]


def test_legacy_filebrowser_entries_are_migrated_not_lost(client):
    # Written by the retired wrapper: percent-encoded segments under /files/files.
    status, _body = client.post(
        "/api/files/tabs",
        {"paths": ["/files/files/home/jing/My%20Docs/", "/files/files/"], "active": 1})
    assert status == 200
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == ["/home/jing/My Docs", "/"]
    assert got["active"] == 1


def test_legacy_entries_already_on_disk_are_migrated_on_read(mgr, client):
    # The file is written by CLIENTS, so a host upgrading mid-session has legacy
    # entries on disk that no POST will rewrite until the wrapper saves again.
    import json
    with open(mgr._files_tabs_file(), "w") as f:
        json.dump({"paths": ["/files/files/tmp/a%2Bb"], "active": 0}, f)
    _, got = client.get("/api/files/tabs")
    assert got["paths"] == ["/tmp/a+b"]


def test_out_of_range_active_clamped(client):
    client.post("/api/files/tabs", {"paths": ["/a"], "active": 99})
    _, got = client.get("/api/files/tabs")
    assert got["active"] == 0
