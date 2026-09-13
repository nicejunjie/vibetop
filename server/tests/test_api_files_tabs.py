"""Endpoint contracts for the shared Files-app tab set: GET/POST /api/files/tabs.

The stored shape is an ABSOLUTE folder path per tab. It used to be a FileBrowser
browse URL ("/files/files/<percent-encoded path>"); FileBrowser was retired in
phase 4b, so those entries are MIGRATED on read and write rather than dropped —
a user whose tabs were saved by the old wrapper must not lose them.

Writes are COMPARE-AND-SWAP on a monotonic `rev`: a caller says which revision it
edited, and a write against a stale (or absent) rev is refused with 409 plus the
current state. That is what stops one device stuck in a push loop from holding
every other device of the same user at "/" — see docs/design-decisions.md.
"""


# Readers must announce the rev protocol; a bare GET is a pre-v1.19.355 client.
URL = "/api/files/tabs?v=2"


def save(client, paths, active=0, rev=None):
    """POST a tab set at the CURRENT rev (what a well-behaved client does)."""
    if rev is None:
        _, cur = client.get(URL)
        rev = cur["rev"]
    return client.post("/api/files/tabs", {"paths": paths, "active": active, "rev": rev})


def test_default_when_unset(client, home):
    status, body = client.get(URL)
    assert status == 200
    # No stored set -> the user's own home, not the filesystem root.
    assert body == {"paths": [str(home)], "active": 0, "rev": 0}


def test_roundtrip(client):
    paths = ["/home/user", "/etc"]
    status, body = save(client, paths, 1)
    assert status == 200 and body["ok"] is True
    _, got = client.get(URL)
    assert got["paths"] == paths and got["active"] == 1
    assert got["rev"] == 1                      # the write advanced the revision


def test_paths_must_be_a_list(client):
    status, body = client.post("/api/files/tabs", {"paths": "nope"})
    assert status == 400 and "list" in body["error"]


def test_non_absolute_paths_are_filtered_out(client, home):
    # Each entry becomes the wrapper's iframe hash, so a URL or a relative path is
    # rejected; an all-bad set falls back to the default home tab.
    status, _body = save(client, ["http://evil", "etc/passwd", ""], 0)
    assert status == 200
    _, got = client.get(URL)
    assert got["paths"] == [str(home)]


def test_legacy_filebrowser_entries_are_migrated_not_lost(client):
    # Written by the retired wrapper: percent-encoded segments under /files/files.
    status, _body = save(client, ["/files/files/home/jing/My%20Docs/", "/files/files/"], 1)
    assert status == 200
    _, got = client.get(URL)
    assert got["paths"] == ["/home/jing/My Docs", "/"]
    assert got["active"] == 1


def test_legacy_entries_already_on_disk_are_migrated_on_read(mgr, client):
    # The file is written by CLIENTS, so a host upgrading mid-session has legacy
    # entries on disk that no POST will rewrite until the wrapper saves again.
    import json
    with open(mgr._files_tabs_file(), "w") as f:
        json.dump({"paths": ["/files/files/tmp/a%2Bb"], "active": 0}, f)
    _, got = client.get(URL)
    assert got["paths"] == ["/tmp/a+b"]


def test_out_of_range_active_clamped(client):
    client.post("/api/files/tabs", {"paths": ["/a"], "active": 99})
    _, got = client.get(URL)
    assert got["active"] == 0


def test_a_write_without_a_rev_is_refused(client):
    # An un-upgraded client posts blind. It must LOSE the write rather than
    # dictate state to every other device — the whole point of the CAS.
    status, body = client.post("/api/files/tabs", {"paths": ["/etc"], "active": 0})
    assert status == 409 and body["conflict"] is True
    assert body["rev"] == 0
    _, got = client.get(URL)
    assert got["paths"] != ["/etc"]


def test_a_stale_writer_cannot_stomp_a_fresh_one(client):
    # Two devices hold rev 0. One saves; the other's rev-0 write is refused and
    # it is handed the winner's state to adopt.
    _, first = client.get(URL)
    stale_rev = first["rev"]
    assert save(client, ["/tmp"], 0, rev=stale_rev)[0] == 200

    status, body = client.post("/api/files/tabs",
                               {"paths": ["/"], "active": 0, "rev": stale_rev})
    assert status == 409
    assert body["paths"] == ["/tmp"]            # told what actually won
    _, got = client.get(URL)
    assert got["paths"] == ["/tmp"]             # and "/" never landed


def test_the_refused_writer_can_retry_at_the_new_rev(client):
    _, cur = client.get(URL)
    save(client, ["/tmp"], 0, rev=cur["rev"])
    _, now = client.get(URL)
    status, _ = client.post("/api/files/tabs",
                            {"paths": ["/etc"], "active": 0, "rev": now["rev"]})
    assert status == 200                        # a genuine edit still goes through
    _, got = client.get(URL)
    assert got["paths"] == ["/etc"]


def test_a_bare_GET_tells_an_old_client_nothing(client):
    # Pre-v1.19.355 code polls without ?v=2. Answering it honestly made it
    # rebuild its iframes on every poll (a visible flash) once its blind writes
    # started losing. A body with no "paths" key trips its own guard, so it does
    # nothing until it reloads.
    status, body = client.get("/api/files/tabs")
    assert status == 200
    assert "paths" not in body
    assert body["stale_client"] is True
