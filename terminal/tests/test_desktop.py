"""Unit tests for the cross-instance desktop state machine in terminal-manager.py.

The Start-menu "running" dots, the cross-device "close on all devices", and the
logout/reset propagation all hinge on a few pure functions over the registry dict
(`_desktop_union`, `_desktop_prune_targets`, `_desktop_cap`) plus the tolerant
loader (`_read_desktop_state`). A regression here silently shows wrong dots or
strands an app open on another device, so pin the liveness/TTL math.

    cd terminal && python -m pytest tests/ -q
"""
import json

import pytest


def _inst(open_apps, ts):
    return {"open": list(open_apps), "active": (open_apps[0] if open_apps else None), "ts": ts}


# -- _desktop_union: apps open across live instances (TTL-gated, deduped) ---

def test_union_merges_apps_across_live_instances(mgr):
    now = 1000.0
    state = {"instances": {
        "a": _inst(["terminal", "browser"], now - 5),
        "b": _inst(["browser", "notes"], now - 10),
    }}
    # Order-preserving first-seen union, no dupes.
    assert mgr._desktop_union(state, now) == ["terminal", "browser", "notes"]


def test_union_excludes_stale_instances(mgr):
    now = 1000.0
    ttl = mgr.DESKTOP_TTL
    state = {"instances": {
        "live": _inst(["terminal"], now - 5),
        "stale": _inst(["browser"], now - (ttl + 1)),   # idle past the TTL
    }}
    assert mgr._desktop_union(state, now) == ["terminal"]


def test_union_keeps_instance_exactly_at_ttl_boundary(mgr):
    now = 1000.0
    state = {"instances": {"edge": _inst(["files"], now - mgr.DESKTOP_TTL)}}
    # The check is `now - ts > TTL` → exactly TTL is still live.
    assert mgr._desktop_union(state, now) == ["files"]


def test_union_tolerates_bad_ts(mgr):
    now = 1000.0
    state = {"instances": {
        "ok": _inst(["terminal"], now),
        "bad": {"open": ["browser"], "ts": "not-a-number"},
    }}
    assert mgr._desktop_union(state, now) == ["terminal"]


def test_union_empty_registry(mgr):
    assert mgr._desktop_union({"instances": {}}, 1000.0) == []


# -- _desktop_prune_targets: cross-device close bookkeeping -----------------

def test_prune_keeps_target_while_holder_live_and_still_open(mgr):
    now = 1000.0
    state = {
        "instances": {"holder": _inst(["browser"], now - 5)},
        "close_targets": {"browser": ["holder"]},
    }
    out = mgr._desktop_prune_targets(state, now)
    assert out == {"browser": ["holder"]}            # not closed yet → still targeted


def test_prune_drops_target_once_app_no_longer_open(mgr):
    # The holder honored the close: it now reports an open-set WITHOUT browser.
    now = 1000.0
    state = {
        "instances": {"holder": _inst(["terminal"], now - 1)},
        "close_targets": {"browser": ["holder"]},
    }
    out = mgr._desktop_prune_targets(state, now)
    assert out == {}                                 # target satisfied → removed


def test_prune_drops_target_for_stale_holder(mgr):
    now = 1000.0
    state = {
        "instances": {"holder": _inst(["browser"], now - (mgr.DESKTOP_TTL + 1))},
        "close_targets": {"browser": ["holder"]},
    }
    assert mgr._desktop_prune_targets(state, now) == {}   # a stuck holder can't poison it


def test_prune_keeps_only_the_live_holders(mgr):
    now = 1000.0
    state = {
        "instances": {
            "live": _inst(["browser"], now - 2),
            "gone": _inst(["terminal"], now - 1),        # no longer has browser open
        },
        "close_targets": {"browser": ["live", "gone"]},
    }
    assert mgr._desktop_prune_targets(state, now) == {"browser": ["live"]}


# -- _desktop_cap: bound the registry to the most-recent instances ---------

def test_cap_trims_to_most_recent_instances(mgr):
    cap = mgr.DESKTOP_MAX_INSTANCES
    insts = {str(i): _inst(["terminal"], float(i)) for i in range(cap + 5)}
    data = {"instances": insts}
    mgr._desktop_cap(data)
    assert len(data["instances"]) == cap
    # The newest (highest ts) survive; the oldest are dropped.
    kept = set(data["instances"])
    assert "0" not in kept and "4" not in kept       # oldest 5 gone
    assert str(cap + 4) in kept                       # newest kept


def test_cap_noop_under_limit(mgr):
    data = {"instances": {"a": _inst(["x"], 1.0), "b": _inst(["y"], 2.0)}}
    mgr._desktop_cap(data)
    assert set(data["instances"]) == {"a", "b"}


# -- _read_desktop_state: tolerant loader ----------------------------------

def test_read_desktop_state_normalizes_missing_keys(mgr, tmp_path, monkeypatch):
    f = tmp_path / "desktop-state.json"
    f.write_text(json.dumps({"instances": {"a": _inst(["terminal"], 1.0)}}))
    monkeypatch.setattr(mgr, "_desktop_state_file", lambda: str(f))
    data = mgr._read_desktop_state()
    assert data["reset_epoch"] == 0                  # defaulted
    assert data["close_targets"] == {}               # defaulted
    assert "a" in data["instances"]


@pytest.mark.parametrize("bad", ["not json{", "[]", "42", '"string"'])
def test_read_desktop_state_survives_corrupt_file(mgr, tmp_path, monkeypatch, bad):
    f = tmp_path / "desktop-state.json"
    f.write_text(bad)
    monkeypatch.setattr(mgr, "_desktop_state_file", lambda: str(f))
    data = mgr._read_desktop_state()
    # Always returns a usable, fully-defaulted shape — never raises.
    assert data["instances"] == {}
    assert data["reset_epoch"] == 0
    assert data["close_targets"] == {}


def test_read_desktop_state_missing_file(mgr, tmp_path, monkeypatch):
    monkeypatch.setattr(mgr, "_desktop_state_file", lambda: str(tmp_path / "nope.json"))
    data = mgr._read_desktop_state()
    assert data == {"instances": {}, "reset_epoch": 0, "close_targets": {}}
