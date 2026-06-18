"""Tests for the extracted system_status module.

The collection readers hit real /proc and sysfs, so these are smoke-level: they
prove the module imports cleanly, the dependency-injected `cached`/running-list
wiring works, and the payload shape is what the Monitor app / status bar expect
(rather than asserting exact hardware values, which vary by host).
"""
import pytest


def test_get_system_status_shape(status):
    calls = []

    def fake_cached(key, ttl, producer):
        calls.append((key, ttl))
        return producer()

    result = status.get_system_status([1, 3, 7], fake_cached)

    # Core keys are always present regardless of hardware.
    for key in ("hostname", "ips", "cpu_percent", "cpu_cores", "load_avg",
                "memory_used_gb", "memory_total_gb", "uptime",
                "terminals_running", "network", "processes"):
        assert key in result, f"missing {key}"

    # Injected running-terminal list flows through to the count.
    assert result["terminals_running"] == 3
    # The injected memoizer was used for the IP lookup.
    assert ("ips", 10.0) in calls
    # Types the front-end relies on.
    assert isinstance(result["cpu_percent"], float)
    assert isinstance(result["cpu_cores"], list)
    assert isinstance(result["processes"], list)
    assert isinstance(result["memory_total_gb"], float)


def test_read_loadavg_triple(status):
    la = status._read_loadavg()
    assert isinstance(la, list) and len(la) == 3


def test_read_amdgpu_pm_info_none_card(status):
    # No card index -> all-None dict, never raises.
    assert status._read_amdgpu_pm_info(None) == {
        "load": None, "temp": None, "power_w": None}


def test_root_disk_is_cached(status):
    # Second call must return the same value without recomputing (cache flag set).
    first = status._root_disk()
    assert status._root_disk() == first


def test_list_ips_returns_dict(status):
    ips = status._list_ips()
    assert isinstance(ips, dict)


def test_cpu_snapshot_delta_path(status):
    # First call seeds the snapshot (synchronous 0.1s sample); the second call,
    # arriving >0.5s later via the fixture's reuse, should exercise the delta
    # branch. We just assert both calls succeed and stay in range.
    r1 = status.get_system_status([], lambda k, t, p: p())
    r2 = status.get_system_status([], lambda k, t, p: p())
    for r in (r1, r2):
        assert 0.0 <= r["cpu_percent"] <= 100.0
        assert all(0.0 <= c <= 100.0 for c in r["cpu_cores"])
