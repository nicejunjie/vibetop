"""Terminals come back after a reboot: output, working directory, tab name, tab.

A reboot used to lose every terminal outright: the session daemon holds its
output in memory, and a fresh start for the same number deliberately forgot the
tab name. Now each daemon saves its ring and its shell's cwd under the user's
home, and the manager treats a terminal with saved state as an open tab that
restores on its first request. Closing a tab or logging out still forgets it."""
import json
import os
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid

import pytest

from conftest import _FakeCompleted, _TERM_APP_DIR

SESSION = os.path.join(_TERM_APP_DIR, "vibetop-session")


# ---- the daemon's save / load ----------------------------------------------

def test_saved_state_round_trips_privately(csession, tmp_path):
    state = tmp_path / "terminals" / "3"
    csession.save_session_state(str(state), b"hello\r\n", "/srv/work", now=1_700_000_000)
    assert stat.S_IMODE(os.stat(state).st_mode) == 0o700
    for name in ("scrollback", "meta.json"):
        assert stat.S_IMODE(os.stat(state / name).st_mode) == 0o600, name
    assert csession.load_session_state(str(state), 1 << 20) == (b"hello\r\n", "/srv/work", 1_700_000_000, None)


def test_load_keeps_only_the_newest_bytes_that_fit_the_ring(csession, tmp_path):
    csession.save_session_state(str(tmp_path), b"old-" + b"x" * 100 + b"-new", None)
    output, cwd, _, _ = csession.load_session_state(str(tmp_path), 8)
    assert output == b"xxxx-new" and cwd is None


@pytest.mark.parametrize("meta", [None, b"not json", b"[1, 2]"])
def test_missing_or_corrupt_state_is_not_restored(csession, tmp_path, meta):
    if meta is not None:
        (tmp_path / "meta.json").write_bytes(meta)
    assert csession.load_session_state(str(tmp_path), 1024) is None
    assert csession.load_session_state(None, 1024) is None


def test_banner_resets_whatever_the_old_screen_was_doing(csession):
    banner = csession.restored_banner(1_700_000_000)
    reset = banner.split(b"\r\n", 1)[0]
    assert reset.startswith(b"\x18")                      # abort a cut-off escape sequence
    for mode in (b"\x1b[?1049l", b"\x1b[?1000l", b"\x1b[?1006l", b"\x1b[?25h", b"\x1b[0m",
                 # left on by a Claude Code that was killed rather than exited:
                 # focus reports (bash beeps on every tab switch), the kitty
                 # keyboard stack, modifyOtherKeys, synchronized output, theme reports
                 b"\x1b[?1004l", b"\x1b[<99u", b"\x1b[>4m", b"\x1b[?2026l", b"\x1b[?2031l",
                 b"\x1b[?1016l", b"\x1b(B", b"\x0f", b"\x1b[?1l"):
        assert mode in reset, mode
    assert b"restored after restart" in banner
    assert b"was running" not in banner and b"stopped" not in banner, "an idle prompt had nothing running"


def test_banner_says_what_became_of_the_command(csession):
    sid = "045ff7df-984d-4f6e-852a-581ae670eea2"
    resumed = csession.restored_banner(1, ("command claude --resume %s" % sid, True, "resume"), "claude")
    assert b"resuming the Claude Code conversation 045ff7df --" in resumed
    assert sid.encode() not in resumed, "the full id is noise"
    assert b"reopening htop" in csession.restored_banner(1, ("htop", True, "rerun"), "htop")
    typed = csession.restored_banner(1, ("make deploy", False, "type"), "make deploy")
    assert b"make deploy was running" in typed and b"press Enter to run it again" in typed
    off = csession.restored_banner(1, None, "make deploy")
    assert b"make deploy was running and was not restarted" in off
    gone = csession.restored_banner(1, None, None, "/srv/old")
    assert b"/srv/old no longer exists" in gone and b"home folder" in gone


# ---- the real daemon across a simulated reboot ------------------------------

def _serve(instance, state_dir, cwd):
    env = dict(os.environ, VIBETOP_TERM_STATE=str(state_dir), HOME=str(cwd),
               CLAUDE_SESSION_BUFSIZE=str(256 * 1024))
    env.pop("BASH_ENV", None)
    proc = subprocess.Popen([sys.executable, SESSION, "serve", instance], cwd=str(cwd), env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sock = f"/tmp/vibetop-session-{instance}.sock"
    deadline = time.time() + 10
    while not os.path.exists(sock):
        assert proc.poll() is None and time.time() < deadline, "daemon never bound its socket"
        time.sleep(0.05)
    return proc, sock


def _talk(sock_path, text=b"", until=b"", wait=10.0):
    s = socket.socket(socket.AF_UNIX)
    s.connect(sock_path)
    s.settimeout(0.2)
    if text:
        time.sleep(0.3)
        s.sendall(text)
    got, deadline = b"", time.time() + wait
    while time.time() < deadline and (not until or until not in got):
        try:
            chunk = s.recv(65536)
            if not chunk:
                break
            got += chunk
        except socket.timeout:
            if not until:
                break
    s.close()
    return got


@pytest.mark.skipif(not os.path.exists("/bin/bash") or not os.path.isdir("/proc/self"),
                    reason="needs bash and /proc")
def test_a_restarted_daemon_brings_back_output_and_directory(tmp_path):
    instance = "restoretest-" + uuid.uuid4().hex[:8]
    state, work = tmp_path / "state", tmp_path / "project dir"
    work.mkdir()
    proc, sock = _serve(instance, state, tmp_path)
    try:
        _talk(sock, b"cd '%s' && echo BEFORE-$((6*7))\r" % str(work).encode(), until=b"BEFORE-42")
    finally:
        proc.send_signal(signal.SIGTERM)       # what a host shutdown sends
        proc.wait(timeout=10)
    meta = json.loads((state / "meta.json").read_text())
    assert meta["cwd"] == str(work)
    assert b"BEFORE-42" in (state / "scrollback").read_bytes()

    proc, sock = _serve(instance, state, tmp_path)
    try:
        replay = _talk(sock, b"echo AT-$(pwd)-$((40+2))END\r", until=b"-42END")
        assert b"BEFORE-42" in replay, "old output was not restored"
        assert b"restored after restart" in replay
        assert replay.index(b"BEFORE-42") < replay.index(b"restored after restart")
        assert b"AT-" + str(work).encode() + b"-42END" in replay, "shell did not reopen in its old directory"
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=10)


# ---- the manager -----------------------------------------------------------

@pytest.fixture()
def saved(home):
    def make(n, cwd="/tmp"):
        d = home / ".local/state/vibetop/terminals" / str(n)
        d.mkdir(parents=True, exist_ok=True)
        (d / "meta.json").write_text(json.dumps({"v": 1, "cwd": cwd, "saved": 1}))
        (d / "scrollback").write_bytes(b"x")
        return d
    return make


def test_restorable_terminals_reopen_as_tabs(client, mgr, saved, monkeypatch):
    saved(2); saved(7)
    d = saved(9); (d / "meta.json").unlink()                 # half-written: ignored
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [1])
    monkeypatch.setattr(mgr, "_autostart_restorable", lambda u, w: None)
    mgr._cache.clear()
    status, body = client.get("/api/terminals/status")
    assert status == 200 and body["running"] == [1, 2, 7]


def test_start_points_the_daemon_at_its_state_and_keeps_the_name(mgr, home, stubs, saved, monkeypatch):
    user = mgr.APP_USER
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [])
    saved(4)
    forgot = []
    monkeypatch.setattr(mgr, "_forget_tab_name", lambda u, n: forgot.append(n))
    mgr._cache.clear()
    ok, _ = mgr._start_user_terminal_locked(user, 4)
    assert ok
    sess = [c for c in stubs["run"] if isinstance(c, list) and "systemd-run" in c
            and any(a.startswith("--unit=vibetop-uterm-") for a in c)][0]
    assert "VIBETOP_TERM_STATE=" + str(home / ".local/state/vibetop/terminals/4") in sess
    assert forgot == [], "a restored terminal is the same terminal; it keeps its name"
    mgr._start_user_terminal_locked(user, 5)                 # nothing saved: fresh
    assert forgot == [5]


def test_closing_a_tab_forgets_its_state_as_the_user(client, mgr, home, stubs, saved):
    path = saved(3)
    status, _ = client.post("/api/terminals/3/stop", {})
    assert status == 200
    runs = [c for c in stubs["run"] if isinstance(c, list)]
    stop = runs.index(next(c for c in runs if c[:2] == ["systemctl", "stop"]))
    rm = runs.index(["runuser", "-u", mgr.APP_USER, "--", "rm", "-rf", "--", str(path)])
    assert stop < rm, "state must be deleted after the daemon stops, or it saves again"


def test_logout_forgets_every_saved_terminal(client, mgr, home, stubs, saved):
    saved(1); saved(2)
    client.post("/api/reset", {})
    assert ["runuser", "-u", mgr.APP_USER, "--", "rm", "-rf", "--",
            str(home / ".local/state/vibetop/terminals")] in stubs["run"]


def test_open_at_skips_a_number_waiting_to_be_restored(client, mgr, saved, monkeypatch):
    saved(1)
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [])
    monkeypatch.setattr(mgr, "_inject_terminal", lambda u, n, t: (True, None))
    status, body = client.post("/api/terminals/open-at", {"path": "/tmp"})
    assert status == 200 and body["instance"] == 2


# ---- what happens to the command that was running ---------------------------

SID = "045ff7df-984d-4f6e-852a-581ae670eea2"


def _job(*argvs, sid=None):
    return {"argv": [list(a) for a in argvs], "claude_session": sid}


@pytest.mark.parametrize("argv, sid, expected", [
    # Claude Code reopens its OWN conversation (not --continue: two terminals in
    # one folder would both get the newest), keeping flags, dropping the prompt.
    # `command claude`: /proc shows an alias already expanded (claude =
    # claude --dangerously-skip-permissions), and typing bare `claude` would
    # expand it again, one more copy of the flag on every restart.
    (["claude", "--dangerously-skip-permissions"], SID,
     ("command claude --resume %s --dangerously-skip-permissions" % SID, True, "resume")),
    (["claude", "--model", "opus", "fix the build", "--continue"], SID,
     ("command claude --resume %s --model opus" % SID, True, "resume")),
    (["claude", "--resume", "old-id-12345", "--model=sonnet"], SID,
     ("command claude --resume %s --model=sonnet" % SID, True, "resume")),
    (["claude", "-r", "--model", "opus"], SID,
     ("command claude --resume %s --model opus" % SID, True, "resume")),
    # The user's own build stays their own build.
    (["/home/u/.local/bin/claude"], SID, ("/home/u/.local/bin/claude --resume %s" % SID, True, "resume")),
    # Options with several values, an optional value, and a value that looks
    # like a prompt all stay with their option.
    (["claude", "--add-dir", "a", "b", "--allowedTools", "Bash", "Edit", "--debug", "api",
      "--output-format", "stream-json", "the old prompt"], SID,
     ("command claude --resume %s --add-dir a b --allowedTools Bash Edit --debug api "
      "--output-format stream-json" % SID, True, "resume")),
    (["claude", "--model", "opus", "--", "-p looks like a flag but is the prompt"], SID,
     ("command claude --resume %s --model opus" % SID, True, "resume")),
    (["claude", "-p", "summarize"], SID, ("claude -p summarize", False, "type")),
    # Never sent a message: nothing to resume, so a fresh start with its options.
    (["claude", "--model", "haiku"], None, ("command claude --model haiku", True, "rerun")),
    (["claude"], "--dangerously-skip", ("command claude", True, "rerun")),   # forged id
    (["codex"], None, ("codex resume", True, "resume")),
    (["codex", "-m", "o3", "fix the tests"], None, ("codex resume", True, "resume")),
    (["codex", "--full-auto", "exec", "rm -rf x"], None, ("codex --full-auto exec 'rm -rf x'", False, "type")),
    (["codex", "login"], None, ("codex login", False, "type")),
    (["htop"], None, ("htop", True, "rerun")),
    (["/usr/bin/htop", "-d", "10"], None, ("/usr/bin/htop -d 10", True, "rerun")),
    (["vim", "notes/todo.md"], None, ("vim notes/todo.md", True, "rerun")),
    (["tail", "-f", "/var/log/app.log"], None, ("tail -f /var/log/app.log", True, "rerun")),
    (["tail", "-n", "50", "app.log"], None, ("tail -n 50 app.log", False, "type")),
    (["journalctl", "-fu", "nginx"], None, ("journalctl -fu nginx", False, "type")),
    (["journalctl", "-f", "-u", "nginx"], None, ("journalctl -f -u nginx", True, "rerun")),
    (["ssh", "-p", "2222", "-i", "key", "box"], None, ("ssh -p 2222 -i key box", True, "rerun")),
    (["ssh", "box", "rm", "-rf", "/srv/old"], None, ("ssh box rm -rf /srv/old", False, "type")),
    (["ssh", "-p2222", "-t", "box"], None, ("ssh -p2222 -t box", True, "rerun")),
    (["mosh", "box"], None, ("mosh box", True, "rerun")),
    (["python3", "train.py", "--epochs", "5"], None, ("python3 train.py --epochs 5", False, "type")),
    (["rm", "-rf", "build dir"], None, ("rm -rf 'build dir'", False, "type")),
])
def test_each_command_lands_in_its_tier(csession, argv, sid, expected):
    assert csession.restore_plan(_job(argv, sid=sid)) == expected


@pytest.mark.parametrize("argv", [
    ["watch", "-n", "60", "rm", "-rf", "/tmp/x"],          # watch runs whatever it is given
    ["watch", "curl", "-X", "POST", "http://x"],
    ["vim", "+!rm -rf ~/x", "f"], ["vim", "-c", ":!touch x"], ["nvim", "--cmd", "!id"],
    ["vi", "-S", "evil.vim"], ["less", "+!id"], ["less", "-k", "keys"],
    ["man", "-P", "sh -c id", "ls"], ["nano", "--rcfile", "x"],
    ["ssh", "-o", "RemoteCommand=reboot", "box"], ["ssh", "-oRemoteCommand=reboot", "box"],
    ["ssh", "-o", "LocalCommand=x", "box"], ["ssh", "-o", "ProxyCommand=x", "box"],
    ["ssh", "-F", "other.conf", "box"], ["ssh", "-4oRemoteCommand=x", "box"],
    ["ssh", "-N", "-L", "8080:localhost:80", "box"], ["ssh", "-W", "x:22", "box"],
    ["mosh", "--ssh=ssh -o RemoteCommand=x", "box"], ["mosh", "box", "--", "rm", "x"],
    ["journalctl", "-f", "--vacuum-size=1M"], ["journalctl", "-f", "--rotate"],
    ["./htop"], ["/tmp/evil/top"], ["scripts/less", "f"],     # a script with a viewer's name
    ["atop", "-w", "/etc/x"], ["glances", "--export", "csv"],
])
def test_a_rerun_can_never_run_or_write_anything(csession, argv):
    plan = csession.restore_plan(_job(argv))
    assert plan is not None and plan[1:] == (False, "type"), plan


def test_pipelines_are_typed_never_run(csession):
    plan = csession.restore_plan(_job(["tail", "-f", "log"], ["grep", "ERROR"]))
    assert plan == ("tail -f log | grep ERROR", False, "type")


def test_modes_type_and_off(csession):
    job = _job(["claude"], sid=SID)
    assert csession.restore_plan(job, "type") == ("command claude --resume %s" % SID, False, "resume")
    assert csession.restore_plan(_job(["htop"]), "type") == ("htop", False, "rerun")
    assert csession.restore_plan(job, "off") is None


@pytest.mark.parametrize("job", [None, {}, {"argv": []}, {"argv": [[]]}, {"argv": [["echo", 1]]},
                                 {"argv": "htop"}, _job(["echo", "a\nrm -rf ~"]), _job(["echo", "\x1b[2J"]),
                                 _job(["echo", "\u009b2J"]), _job(["less", "\u0085x"])])
def test_malformed_or_control_characters_are_never_typed(csession, job):
    assert csession.restore_plan(job) is None


def test_claude_session_id_comes_from_its_pid_file(csession, tmp_path):
    sessions = tmp_path / ".claude" / "sessions"
    sessions.mkdir(parents=True)
    (sessions / "4242.json").write_text(json.dumps({"pid": 4242, "sessionId": SID}))
    (sessions / "4243.json").write_text(json.dumps({"pid": 4243, "sessionId": "x; rm -rf ~"}))
    (sessions / "4244.json").write_text(json.dumps({"pid": 4244, "sessionId": "--dangerously-skip"}))
    # No transcript yet: Claude Code writes one only once it has a message, and
    # `--resume` of a session without one fails with "No conversation found".
    assert csession.claude_session_id(4242, home=str(tmp_path)) is None
    project = tmp_path / ".claude" / "projects" / "-home-u-work"
    project.mkdir(parents=True)
    (project / (SID + ".jsonl")).write_text("{}\n")
    assert csession.claude_session_id(4242, home=str(tmp_path)) == SID
    assert csession.claude_session_id(4243, home=str(tmp_path)) is None
    assert csession.claude_session_id(4244, home=str(tmp_path)) is None
    assert csession.claude_session_id(9999, home=str(tmp_path)) is None


def test_an_enormous_command_line_does_not_sink_the_rest(csession, tmp_path):
    files = ["src/module_%04d/really_long_file_name.py" % i for i in range(2500)]
    csession.save_session_state(str(tmp_path), b"out", "/srv", job=_job(["vim"] + files))
    output, cwd, _, job = csession.load_session_state(str(tmp_path), 1024)
    assert (output, cwd, job) == (b"out", "/srv", None)
    # ...and a meta.json bigger than the old 64 KB read still loads.
    meta = {"v": 2, "cwd": "/srv", "saved": 1, "job": _job(["vim"] + files[:1500])}
    (tmp_path / "meta.json").write_text(json.dumps(meta))
    assert csession.load_session_state(str(tmp_path), 1024)[3] == meta["job"]


def test_meta_can_be_saved_without_rewriting_the_scrollback(csession, tmp_path):
    csession.save_session_state(str(tmp_path), b"old output", "/a", now=100)
    csession.save_session_state(str(tmp_path), None, "/b", now=200, saved=100)
    assert csession.load_session_state(str(tmp_path), 1024)[:3] == (b"old output", "/b", 100)


def test_only_keystrokes_count_as_typing(csession):
    for reply in (b"\x1b[I", b"\x1b[O", b"\x1b[?1;2c", b"\x1b]11;rgb:0000/0000/0000\x07",
                  b"\x1b[<0;10;5M", b"\x1b[12;40R", b"\x1bP>|xterm.js\x1b\\"):
        assert not csession.is_keystrokes(reply), reply
    for keys in (b"l", b"echo hi", b"\r", b"\x03", b"\x1b[Ix"):
        assert csession.is_keystrokes(keys), keys


def _exact(cmdline):
    """Pids whose WHOLE command line is `cmdline` (never a substring: that also
    matches whatever shell launched the tests)."""
    out = subprocess.run(["pgrep", "-x", "-f", cmdline], capture_output=True, text=True).stdout
    return [int(p) for p in out.split()]


def _kill_exact(cmdline):
    for pid in _exact(cmdline):
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


CLAUDE_SLEEP = "sleep %d" % (7_000_000 + os.getpid())
CLAUDE_PROC = "claude %d" % (7_000_000 + os.getpid())      # what /proc shows for it
USER_SLEEP = "sleep %d" % (8_000_000 + os.getpid())


def _restart_with(tmp_path, command, *, mode="auto", fake_claude=False, check_not_running=False):
    """Run `command` in a daemon, stop it like a shutdown, start a new one, and
    return (saved job, the new daemon's output after the restore settles)."""
    instance = "restorecmd-" + uuid.uuid4().hex[:8]
    state = tmp_path / "state"
    bindir = tmp_path / "bin"
    bindir.mkdir(exist_ok=True)
    log = tmp_path / "claude-argv"
    # Real Claude Code shows up as `claude ...` in /proc; keep that name.
    (bindir / "claude").write_text("#!/bin/bash\necho \"$@\" >> '%s'\nexec -a claude %s\n"
                                   % (log, CLAUDE_SLEEP))
    (bindir / "claude").chmod(0o755)
    env_extra = {"PATH": "%s:%s" % (bindir, os.environ.get("PATH", "")),
                 "VIBETOP_TERM_RESTORE_CMDS": mode}
    old = dict(os.environ)
    os.environ.update(env_extra)
    try:
        proc, sock = _serve(instance, state, tmp_path)
        try:
            _talk(sock, command.encode() + b"\r", wait=1.0)
            if fake_claude:
                deadline = time.time() + 5
                while not log.exists() and time.time() < deadline:
                    time.sleep(0.05)
                pid = _exact(CLAUDE_PROC)[0]
                # The fake claude exec'd into sleep under the same pid: register it.
                sessions = tmp_path / ".claude" / "sessions"
                sessions.mkdir(parents=True, exist_ok=True)
                (sessions / ("%d.json" % pid)).write_text(json.dumps({"sessionId": SID}))
                if fake_claude != "never-prompted":
                    project = tmp_path / ".claude" / "projects" / "-tmp-x"
                    project.mkdir(parents=True, exist_ok=True)
                    (project / (SID + ".jsonl")).write_text("{}\n")
                log.unlink()
            time.sleep(0.5)
        finally:
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=10)
        job = json.loads((state / "meta.json").read_text())["job"]
        proc, sock = _serve(instance, state, tmp_path)
        try:
            out = _talk(sock, wait=4.0, until=b"\x00never")
            if check_not_running:
                assert _exact(USER_SLEEP) == [], "a typed command must not have run"
        finally:
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=10)
            _kill_exact(CLAUDE_PROC)
            _kill_exact(USER_SLEEP)
        return job, out, log
    finally:
        os.environ.clear()
        os.environ.update(old)


needs_proc = pytest.mark.skipif(not os.path.exists("/proc/self/task"), reason="needs /proc")


@needs_proc
def test_an_unknown_command_is_typed_but_not_run(tmp_path):
    job, out, _ = _restart_with(tmp_path, USER_SLEEP, check_not_running=True)
    assert job["argv"] == [USER_SLEEP.split()]
    assert b"press Enter to run it" in out
    assert out.rstrip().endswith(USER_SLEEP.encode()), "the command should sit at the prompt"


@needs_proc
def test_claude_is_resumed_into_its_own_conversation(tmp_path):
    job, out, log = _restart_with(tmp_path, "claude --dangerously-skip-permissions 'old prompt'",
                                  fake_claude=True)
    assert job["argv"] == [CLAUDE_PROC.split()] and job["claude_session"] == SID
    assert b"resuming the Claude Code conversation " + SID[:8].encode() in out
    deadline = time.time() + 3
    while not log.exists() and time.time() < deadline:
        time.sleep(0.05)
    # The fake's /proc entry is `claude <n>`, so no flags survive to restore here;
    # keeping flags is test_each_command_lands_in_its_tier's job.
    assert log.read_text().split() == ["--resume", SID]


@needs_proc
def test_claude_never_sent_a_message_starts_fresh(tmp_path):
    job, out, log = _restart_with(tmp_path, "claude", fake_claude="never-prompted")
    assert job["claude_session"] is None
    assert b"reopening command claude" in out and b"No conversation" not in out
    deadline = time.time() + 3
    while not log.exists() and time.time() < deadline:
        time.sleep(0.05)
    assert log.read_text().split() == [], "a session with no transcript cannot be resumed"


@needs_proc
def test_off_leaves_the_prompt_empty(tmp_path):
    job, out, _ = _restart_with(tmp_path, USER_SLEEP, mode="off")
    assert job["argv"] == [USER_SLEEP.split()]
    assert b"restored after restart" in out and b"press Enter" not in out
    assert not out.rstrip().endswith(USER_SLEEP.encode())


@needs_proc
def test_a_shutdown_that_kills_the_program_first_still_records_it(tmp_path):
    """systemd stops a unit by sending SIGTERM to EVERY process in it at once,
    so the program is usually dead before the daemon's final save reads /proc.
    That save must not overwrite the job with 'shell was idle' (found live on
    prod: a `sleep` restored as an empty prompt)."""
    instance = "restorerace-" + uuid.uuid4().hex[:8]
    state = tmp_path / "state"
    proc, sock = _serve(instance, state, tmp_path)
    try:
        _talk(sock, USER_SLEEP.encode() + b"\r", wait=1.0)
        time.sleep(3)                                   # past one JOB_POLL
        _kill_exact(USER_SLEEP)                         # the program goes first...
    finally:
        proc.send_signal(signal.SIGTERM)                # ...then the daemon, together
        proc.wait(timeout=10)
    meta = json.loads((state / "meta.json").read_text())
    assert meta["job"] == {"argv": [USER_SLEEP.split()], "claude_session": None}


@needs_proc
def test_the_command_waits_for_a_slow_login_profile(tmp_path):
    """A login profile that pauses (the vibetop banner probes the GPU with an
    8s timeout) and then runs something reading the terminal must not get the
    restored command: it waits until the shell itself is at its prompt."""
    followed = tmp_path / "followed.log"
    followed.write_text("")
    tail_cmd = "tail -f %s" % followed
    (tmp_path / ".bash_profile").write_text(
        "echo profile-start\nsleep 1.2\n"
        # Reads one line from the terminal if one arrives within 3s, then exits.
        "python3 -c 'import select,sys; select.select([sys.stdin],[],[],3)[0] and sys.stdin.readline()'\n"
        "echo profile-done\n")
    state = tmp_path / "state"
    state.mkdir()
    (state / "scrollback").write_bytes(b"")
    (state / "meta.json").write_text(json.dumps(
        {"v": 1, "cwd": None, "saved": 1, "job": {"argv": [tail_cmd.split()], "claude_session": None}}))
    instance = "restoreready-" + uuid.uuid4().hex[:8]
    proc, sock = _serve(instance, state, tmp_path)
    try:
        deadline = time.time() + 12
        while not _exact(tail_cmd) and time.time() < deadline:
            time.sleep(0.2)
        assert _exact(tail_cmd), "the re-run command was swallowed by the login profile"
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=10)
        _kill_exact(tail_cmd)


def _seed(state, job, cwd=None, scrollback=b""):
    state.mkdir(parents=True, exist_ok=True)
    (state / "scrollback").write_bytes(scrollback)
    (state / "meta.json").write_text(json.dumps({"v": 2, "cwd": cwd, "saved": 1, "job": job}))


def _stop(proc):
    proc.send_signal(signal.SIGTERM)
    proc.wait(timeout=10)


@needs_proc
def test_keystrokes_typed_before_the_prompt_are_never_submitted(tmp_path):
    """The user starts typing while the login profile still runs. Typing the
    restored command too would join it onto their text, and a re-run would
    press Enter on both (found by an independent test: `echo typed-by-user-`
    ran as `echo typed-by-user-htop`)."""
    followed = tmp_path / "f.log"
    followed.write_text("")
    tail_cmd = "tail -f %s" % followed
    marker = tmp_path / "ran"
    (tmp_path / ".bash_profile").write_text("sleep 1.5\n")
    state = tmp_path / "state"
    _seed(state, _job(tail_cmd.split()))
    instance = "restoretype-" + uuid.uuid4().hex[:8]
    proc, sock = _serve(instance, state, tmp_path)
    try:
        out = _talk(sock, b"touch %s; echo typed-by-user-" % str(marker).encode(), wait=4.0,
                    until=b"\x00never")
        assert b"you started typing, so the restored command was not entered" in out
        assert _exact(tail_cmd) == [] and not marker.exists(), "nothing may be submitted for the user"
    finally:
        _stop(proc)
        _kill_exact(tail_cmd)


@needs_proc
def test_a_second_restart_before_the_command_ran_keeps_it(tmp_path):
    """Stopped again while the command still waits for a slow login profile,
    or after it was typed but not run: the saved job must survive, not become
    "the shell was idle"."""
    (tmp_path / ".bash_profile").write_text("sleep 3\n")
    state = tmp_path / "state"
    job = _job(USER_SLEEP.split())
    _seed(state, job)
    instance = "restoretwice-" + uuid.uuid4().hex[:8]
    proc, sock = _serve(instance, state, tmp_path)
    time.sleep(1.0)
    _stop(proc)                                     # still inside the profile
    assert json.loads((state / "meta.json").read_text())["job"] == job
    (tmp_path / ".bash_profile").write_text("")
    proc, sock = _serve(instance, state, tmp_path)
    try:
        out = _talk(sock, wait=3.0, until=b"\x00never")
        assert out.rstrip().endswith(USER_SLEEP.encode()), "typed, not run"
    finally:
        _stop(proc)                                 # typed but never run
    assert json.loads((state / "meta.json").read_text())["job"] == job
    assert _exact(USER_SLEEP) == []


@needs_proc
def test_a_background_job_in_the_profile_does_not_hold_the_command(tmp_path):
    """`something &` in a login profile is still the shell's child; it used to
    make the restored command wait the full RESTORE_MAX_WAIT (15s)."""
    bg = "sleep %d" % (6_000_000 + os.getpid())
    followed = tmp_path / "f.log"
    followed.write_text("")
    tail_cmd = "tail -f %s" % followed
    (tmp_path / ".bash_profile").write_text("%s &\ndisown\n" % bg)
    state = tmp_path / "state"
    _seed(state, _job(tail_cmd.split()))
    instance = "restorebg-" + uuid.uuid4().hex[:8]
    started = time.time()
    proc, sock = _serve(instance, state, tmp_path)
    try:
        while not _exact(tail_cmd) and time.time() - started < 12:
            time.sleep(0.1)
        assert _exact(tail_cmd) and time.time() - started < 6, "waited for the background job"
    finally:
        _stop(proc)
        _kill_exact(tail_cmd)
        _kill_exact(bg)


@needs_proc
def test_saved_output_keeps_a_fullscreen_program_s_screen_mode(tmp_path):
    """Once a long-running fullscreen program's \\e[?1049h has scrolled out of
    the ring, the saved output must still begin with it (the live replay always
    did); otherwise its old frames are drawn over the normal screen."""
    instance = "restorealt-" + uuid.uuid4().hex[:8]
    state = tmp_path / "state"
    proc, sock = _serve(instance, state, tmp_path)
    try:
        _talk(sock, b"printf '\\033[?1049h'; for i in $(seq 1 40000); do echo frame-$i; done; echo ALT-$((1+1))-DONE\r",
              until=b"ALT-2-DONE", wait=15.0)
    finally:
        _stop(proc)
    saved = (state / "scrollback").read_bytes()
    assert len(saved) <= 256 * 1024 + 4096 and b"frame-1\r\n" not in saved
    head = saved[:saved.index(b"frame-")]
    assert b"\x1b[?1049h" in head, head


@needs_proc
def test_the_restoring_marker_lasts_until_the_command_is_in(tmp_path):
    (tmp_path / ".bash_profile").write_text("sleep 1.5\n")
    state = tmp_path / "state"
    _seed(state, _job(USER_SLEEP.split()))
    instance = "restoremark-" + uuid.uuid4().hex[:8]
    marker = "/tmp/vibetop-session-%s.restoring" % instance
    proc, sock = _serve(instance, state, tmp_path)
    try:
        assert os.path.exists(marker), "set while the command waits for the prompt"
        deadline = time.time() + 8
        while os.path.exists(marker) and time.time() < deadline:
            time.sleep(0.1)
        assert not os.path.exists(marker)
    finally:
        _stop(proc)
    assert not os.path.exists(marker)


# ---- the manager: bringing terminals back without a click -------------------

def test_odd_directory_names_and_symlinks_are_not_tabs(mgr, home, saved):
    root = home / ".local/state/vibetop/terminals"
    saved(3)
    for name in ("03", "٣", "0"):
        (root / name).mkdir(parents=True)
        (root / name / "meta.json").write_text("{}")
    (root / "8").mkdir()
    (root / "8" / "meta.json").symlink_to("/etc/hostname")
    assert mgr._restorable_terminals(mgr.APP_USER) == [3]


def test_status_starts_every_waiting_terminal_once(client, mgr, saved, monkeypatch):
    saved(2); saved(5)
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [1])
    started = []
    monkeypatch.setattr(mgr, "_start_user_terminal", lambda u, n: started.append(n) or (True, 0))
    monkeypatch.setattr(mgr, "_term_autostart_tried", {})
    mgr._cache.clear()
    for _ in range(3):
        status, body = client.get("/api/terminals/status")
        assert status == 200 and body["running"] == [1, 2, 5]
    deadline = time.time() + 5
    while len(started) < 2 and time.time() < deadline:
        time.sleep(0.02)
    time.sleep(0.1)
    assert started == [2, 5], "each background tab restored, and only once"


def test_status_names_terminals_a_restart_would_not_bring_back(client, mgr, home, saved, monkeypatch):
    saved(2)                                                  # pre-v1.38.161 meta: no "job"
    d = saved(3)
    (d / "meta.json").write_text(json.dumps({"v": 2, "cwd": "/", "saved": 1, "job": None}))
    monkeypatch.setattr(mgr.Handler, "_get_running_terminals", lambda self: [1, 2, 3, 4])
    monkeypatch.setattr(mgr, "_term_started_at", {(mgr.APP_USER, 4): time.monotonic()})
    mgr._cache.clear()
    status, body = client.get("/api/terminals/status")
    # 1: nothing saved at all; 2: saves no command; 3: fine; 4: just opened.
    assert status == 200 and body["unprotected"] == [1, 2]


def test_open_at_never_types_into_a_terminal_coming_back(client, mgr, saved, monkeypatch):
    saved(3)
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [1])
    typed = []
    monkeypatch.setattr(mgr, "_inject_terminal", lambda u, n, t: typed.append(n) or (True, None))
    monkeypatch.setattr(mgr, "_start_user_terminal", lambda u, n: (True, 0))
    mgr._cache.clear()
    status, body = client.post("/api/terminals/open-at", {"path": "/tmp", "term": 3})
    assert status == 200 and body["instance"] == 2 and typed == [2]


def test_a_scheduled_message_brings_its_terminal_back_first(mgr, saved, monkeypatch, tmp_path):
    """After a reboot the scheduler used to fail with "terminal N is not
    running". It starts the terminal and waits until the restored command (a
    resumed Claude Code) is in before typing."""
    saved(4)
    user = mgr.APP_USER
    running = []
    order = []

    def start(u, n):
        order.append("start")
        running.append(n)
        return True, 0
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: list(running))
    monkeypatch.setattr(mgr, "_start_user_terminal", start)
    monkeypatch.setattr(mgr, "_wait_terminal_restored",
                        lambda u, n, timeout=45.0: order.append("waited") or True)
    sock_path = str(tmp_path / "t.sock")
    monkeypatch.setattr(mgr, "_term_socket", lambda u, n: sock_path)
    srv = socket.socket(socket.AF_UNIX)
    srv.bind(sock_path)
    srv.listen(4)
    got = []

    def serve():
        for _ in range(2):
            c, _ = srv.accept()
            c.settimeout(2)
            data = b""
            while True:
                chunk = c.recv(4096)
                if not chunk:
                    break
                data += chunk
            got.append(data)
            c.close()
    import threading
    t = threading.Thread(target=serve, daemon=True)
    t.start()
    ok, err = mgr._inject_terminal(user, 4, "continue")
    t.join(5)
    srv.close()
    assert ok, err
    assert order == ["start", "waited"] and got == [b"continue", b"\r"]


def test_waiting_for_a_restore_honours_only_the_user_s_own_marker(mgr, monkeypatch, tmp_path):
    user = mgr.APP_USER
    sock_path = tmp_path / "t.sock"
    sock_path.write_text("")
    marker = tmp_path / "t.restoring"
    monkeypatch.setattr(mgr, "_term_socket", lambda u, n: str(sock_path))
    monkeypatch.setattr(mgr, "_term_restoring_marker", lambda u, n: str(marker))
    assert mgr._wait_terminal_restored(user, 1, timeout=0.5)
    marker.write_text("")
    if os.stat(marker).st_uid == __import__("pwd").getpwnam(user).pw_uid:
        assert not mgr._wait_terminal_restored(user, 1, timeout=0.5), "still restoring"


def test_the_manager_brings_back_terminals_a_reboot_stopped(mgr, saved, monkeypatch):
    saved(1); saved(6)
    user = mgr.APP_USER
    monkeypatch.setattr(mgr, "_read_users_registry", lambda: {user: {}})
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda u=None: [1])
    asked = []
    monkeypatch.setattr(mgr, "_autostart_restorable", lambda u, w: asked.append((u, w)))
    mgr._restore_terminals_at_start(delay=0)
    assert asked == [(user, [6])]
