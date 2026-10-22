import copy
import json
import os
import pytest

from browser_proxy_auth import BrowserAuthority
from browser_proxy_store import IdentityStore


def store(path):
    path.mkdir(mode=0o700, exist_ok=True)
    return IdentityStore(path, owner=os.getuid())


def test_identity_and_consumed_permits_survive_process_restart(tmp_path):
    directory = tmp_path / "identity"
    db = store(directory)
    auth = BrowserAuthority(db.master, "realms.example.com", "https://browser-lite.example.com",
                            ["https://vibetop.example.com"], save=db.save, now=lambda: 1000)
    ticket = auth.begin(1000, "alice", "session", 2000, "https://vibetop.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    content = auth.mint("content", lease)
    master, state = db.master, copy.deepcopy(auth.state)
    db.close()
    reopened = store(directory)
    assert reopened.master == master
    assert reopened.state == state
    restored = BrowserAuthority(reopened.master, auth.domain, auth.ui_origin, auth.main_origins,
                                state=reopened.state, save=reopened.save, now=lambda: 1000)
    assert restored.verify(content, "content")["lease"] == lease
    with pytest.raises(ValueError):
        restored.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    reopened.close()


def test_only_one_manager_can_own_database(tmp_path):
    db = store(tmp_path / "identity")
    with pytest.raises(BlockingIOError):
        store(tmp_path / "identity")
    db.close()
    store(tmp_path / "identity").close()


@pytest.mark.parametrize("kind", ["symlink", "hardlink", "public", "fifo", "oversize", "corrupt"])
def test_invalid_metadata_is_not_read_or_silently_reset(tmp_path, kind):
    directory = tmp_path / "identity"
    db = store(directory)
    db.close()
    state = directory / "state.json"
    target = tmp_path / "other"
    target.write_text('{}')
    target.chmod(0o600)
    if kind == "symlink":
        state.symlink_to(target)
    elif kind == "hardlink":
        os.link(target, state)
    elif kind == "fifo":
        os.mkfifo(state, 0o600)
    else:
        state.write_text("bad" if kind == "corrupt" else "{}")
        state.chmod(0o644 if kind == "public" else 0o600)
        if kind == "oversize":
            with state.open("r+b") as stream:
                stream.truncate(IdentityStore.MAX_BYTES + 1)
    with pytest.raises((OSError, ValueError)):
        store(directory)
    assert target.read_text() == '{}'


def test_missing_key_over_existing_state_requires_repair(tmp_path):
    directory = tmp_path / "identity"
    db = store(directory)
    db.save({"version": 1})
    db.close()
    (directory / "master").unlink()
    with pytest.raises(ValueError, match="key is missing"):
        store(directory)


def test_failed_durable_revoke_disables_all_authorization(tmp_path, monkeypatch):
    db = store(tmp_path / "identity")
    auth = BrowserAuthority(db.master, "realms.example.com", "https://browser-lite.example.com",
                            ["https://vibetop.example.com"], save=db.save, now=lambda: 1000)
    ticket = auth.begin(1000, "alice", "session", 2000, "https://vibetop.example.com", expected_epoch=0)
    lease = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    token = auth.mint("content", lease)
    def fail(*args, **kwargs):
        raise OSError("disk full")
    monkeypatch.setattr(os, "fsync", fail)
    with pytest.raises(OSError):
        auth.revoke_session("session")
    with pytest.raises(RuntimeError):
        auth.verify(token, "content")
    with pytest.raises(RuntimeError):
        auth.begin(1000, "alice", "session2", 2000, "https://vibetop.example.com", expected_epoch=0)
    assert not list((tmp_path / "identity").glob(".state.json.*"))
    # The failed write did not replace the previously fsynced database.
    assert json.loads((tmp_path / "identity/state.json").read_bytes())["leases"]
    db.close()
