"""A terminal is two units — the vibetop-session daemon and the ttyd in front of
it — and the daemon can die alone (2026-09-22: a 42G local-LLM run in terminal 4
was OOM-killed and systemd's default OOMPolicy=stop took the daemon's whole unit
with it). The orphan ttyd then spawned `vibetop-session attach`, which exited 1
on every reconnect: a tab flashing "reconnecting" every ~3s, forever, because
"is terminal N running?" only ever asked about ttyd."""
import pytest

from conftest import _FakeCompleted


@pytest.fixture()
def systemd(mgr, stubs, monkeypatch):
    """Scripted `systemctl is-active`: `state` maps unit -> active?; every other
    command is recorded and succeeds."""
    state = {}
    calls = []

    def fake_run(args, **kw):
        args = list(args)
        calls.append(args)
        if args[:2] == ["systemctl", "is-active"]:
            return _FakeCompleted(args, stdout="active\n" if state.get(args[2]) else "inactive\n")
        return _FakeCompleted(args, returncode=0)

    monkeypatch.setattr(mgr.subprocess, "run", fake_run)
    mgr._cache.clear()
    return state, calls


def _launched(calls, unit):
    return [c for c in calls if c and c[0] == "systemd-run" and f"--unit={unit}" in c]


def test_an_orphan_ttyd_is_stopped_and_the_pair_restarted(mgr, systemd):
    state, calls = systemd
    user = mgr.APP_USER
    sess, ttyd = mgr._term_units(user, 4)
    state[ttyd] = True                               # ttyd alive, daemon OOM-killed
    ok, _ = mgr._start_user_terminal(user, 4)
    assert ok
    assert ["systemctl", "stop", ttyd, sess] in calls
    assert _launched(calls, sess) and _launched(calls, ttyd)


def test_a_healthy_pair_is_left_alone(mgr, systemd):
    state, calls = systemd
    user = mgr.APP_USER
    sess, ttyd = mgr._term_units(user, 2)
    state[ttyd] = state[sess] = True
    ok, port = mgr._start_user_terminal(user, 2)
    assert ok and port == mgr._user_term_port(user, 2)
    assert not any(c[:2] == ["systemctl", "stop"] for c in calls)
    assert not any(c[0] == "systemd-run" for c in calls)


def test_authcheck_heals_a_listed_terminal_whose_daemon_died(mgr, systemd, monkeypatch):
    state, calls = systemd
    user = mgr.APP_USER
    sess, ttyd = mgr._term_units(user, 4)
    state[ttyd] = True
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [4])
    mgr.Handler._ensure_user_terminal(object.__new__(mgr.Handler), user, 4)
    assert _launched(calls, sess), "a listed-but-daemonless terminal was never restarted"


def test_the_heal_keeps_the_tab_name(mgr, systemd, monkeypatch):
    state, _ = systemd
    user = mgr.APP_USER
    state[mgr._term_units(user, 4)[1]] = True
    forgot = []
    monkeypatch.setattr(mgr, "_forget_tab_name", lambda u, n: forgot.append(n))
    mgr._start_user_terminal(user, 4)
    assert forgot == []                              # same slot, same label


def test_an_oom_kill_in_the_shell_does_not_stop_the_session_unit(mgr, systemd):
    _, calls = systemd
    user = mgr.APP_USER
    sess, _ = mgr._term_units(user, 1)
    mgr._start_user_terminal(user, 1)
    (cmd,) = _launched(calls, sess)
    assert "OOMPolicy=continue" in cmd
