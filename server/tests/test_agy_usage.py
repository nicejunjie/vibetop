"""Antigravity CLI limits come from the CLI's own `agy -p /usage` output."""
import os
import stat
import time

# What agy 1.5.18 printed on 2026-11-26 for an untouched account.
_REAL = ("Gemini Models\tWeekly Limit Remaining\t100%\t2026-12-04T03:50:48Z\n"
         "Claude and GPT models\tWeekly Limit Remaining\t100%\t1970-01-01T00:00:00Z\n"
         "Claude and GPT models\tFive Hour Limit Remaining\t100%\t1970-01-01T00:00:00Z\n")


def _fresh(mgr):
    with mgr._agy_lock:
        mgr._agy_cache.clear()


def test_parse_real_output(mgr):
    got = mgr._agy_usage_parse(_REAL)
    assert got["session"] == {"pct": 0.0, "reset": None, "group": "Claude and GPT models"}
    # Remaining is turned into used; between two untouched weekly buckets the one
    # with a window actually running is the one worth showing.
    assert got["weekly"]["pct"] == 0.0 and got["weekly"]["group"] == "Gemini Models"
    assert got["weekly"]["reset"] == 1796356248
    assert len(got["groups"]) == 3


def test_each_slot_reports_the_group_closest_to_its_limit(mgr):
    got = mgr._agy_usage_parse(
        "Gemini Models\tWeekly Limit Remaining\t80%\t2026-12-04T03:50:48Z\n"
        "Gemini Models\tFive Hour Limit Remaining\t97.5%\t2026-11-27T03:00:00Z\n"
        "Claude and GPT models\tWeekly Limit Remaining\t35%\t2026-12-02T00:00:00Z\n"
        "Claude and GPT models\tFive Hour Limit Remaining\t60%\t2026-11-27T05:00:00Z\n")
    assert got["weekly"]["group"] == "Claude and GPT models"
    assert abs(got["weekly"]["pct"] - .65) < 1e-9
    assert got["session"]["group"] == "Claude and GPT models"
    assert abs(got["session"]["pct"] - .40) < 1e-9


def test_parse_rejects_what_is_not_a_limit_record(mgr):
    assert mgr._agy_usage_parse("") is None
    assert mgr._agy_usage_parse(None) is None
    assert mgr._agy_usage_parse("error: /usage failed: not logged in\n") is None
    # A bucket this code does not know the window of is skipped, not guessed.
    assert mgr._agy_usage_parse("Gemini Models\tDaily Limit Remaining\t50%\t\n") is None
    got = mgr._agy_usage_parse("Gemini Models\tWeekly Limit Remaining\t50%\tnot-a-date\n")
    assert got["weekly"] == {"pct": .5, "reset": None, "group": "Gemini Models"}
    assert got["session"] is None


def test_payload_disabled_and_not_installed(mgr, tmp_path, monkeypatch):
    _fresh(mgr)
    assert mgr._agy_usage_payload("nobody", False) == {"enabled": False}
    monkeypatch.setattr(mgr, "_agy_bin", lambda home: None)
    mgr._agy_usage_refresh("u", str(tmp_path))
    monkeypatch.setattr(mgr, "_user_home", lambda user: str(tmp_path))
    got = mgr._agy_usage_payload("u", True)
    assert got["enabled"] is True and "session" not in got
    assert "not found" in got["note"]


def test_payload_serves_the_cached_reading_and_keeps_it_across_a_failure(mgr, tmp_path, monkeypatch):
    _fresh(mgr)
    home = str(tmp_path)
    monkeypatch.setattr(mgr, "_user_home", lambda user: home)
    monkeypatch.setattr(mgr, "_agy_usage_run", lambda user, h: (0, _REAL, ""))
    mgr._agy_usage_refresh("u", home)
    got = mgr._agy_usage_payload("u", True)
    assert got["weekly"]["group"] == "Gemini Models" and got["ageSec"] < 5
    assert got["stale"] is False and "note" not in got
    monkeypatch.setattr(mgr, "_agy_usage_run",
                        lambda user, h: (1, "", "Error: You are not logged into Antigravity."))
    mgr._agy_usage_refresh("u", home)
    got = mgr._agy_usage_payload("u", True)
    assert got["weekly"]["group"] == "Gemini Models", "the last good reading stays"
    assert got["note"].startswith("signed out")

    def boom(user, h):
        raise TimeoutError("agy hung")
    monkeypatch.setattr(mgr, "_agy_usage_run", boom)
    mgr._agy_usage_refresh("u", home)
    assert mgr._agy_usage_payload("u", True)["note"] == "Antigravity unreachable"


def test_the_heartbeat_never_waits_and_launches_once(mgr, tmp_path, monkeypatch):
    _fresh(mgr)
    home = str(tmp_path)
    monkeypatch.setattr(mgr, "_user_home", lambda user: home)
    calls = []

    def slow(user, h):
        calls.append(user)
        time.sleep(.3)
        return 0, _REAL, ""
    monkeypatch.setattr(mgr, "_agy_usage_run", slow)
    t0 = time.monotonic()
    first = mgr._agy_usage_payload("u", True)
    for _ in range(5):
        mgr._agy_usage_payload("u", True)
    assert time.monotonic() - t0 < .2, "the payload must not block on the CLI"
    assert "weekly" not in first
    time.sleep(.6)
    assert calls == ["u"], "one launch for six heartbeats inside the TTL"
    assert mgr._agy_usage_payload("u", True)["weekly"]["pct"] == 0.0


def test_run_invokes_the_users_binary_without_leaving_logs(mgr, tmp_path):
    bindir = tmp_path / ".local" / "bin"
    bindir.mkdir(parents=True)
    exe = bindir / "agy"
    exe.write_text('#!/bin/sh\nprintf "%s|%s|%s\\n" "$HOME" "$PWD" "$*"\n')
    exe.chmod(exe.stat().st_mode | stat.S_IXUSR)
    assert mgr._agy_bin(str(tmp_path)) == str(exe)
    rc, out, _ = mgr._agy_usage_run(os.environ.get("USER", "x"), str(tmp_path))
    assert rc == 0
    home, cwd, args = out.strip().split("|")
    assert home == str(tmp_path) and os.path.realpath(cwd) == os.path.realpath(str(tmp_path))
    assert args == "--log-file /dev/null -p /usage"
    assert mgr._agy_usage_run("x", str(tmp_path / "nowhere")) is None \
        or mgr._agy_bin(str(tmp_path / "nowhere")) is not None      # a system-wide agy is fine
