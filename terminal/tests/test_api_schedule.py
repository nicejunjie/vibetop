"""Scheduled terminal messages: GET/POST /api/terminals/schedules,
POST /api/terminals/schedules/cancel, plus the sweeper that fires them.

The whole point of the feature is that it works with no browser attached, so the
tests cover the server side end to end: the registry contract, the due-time math,
and a REAL AF_UNIX injection asserting the exact bytes that reach the PTY socket.
"""
import json
import os
import socket
import threading
import time

import pytest


def _read_reg(mgr):
    with open(mgr.SCHEDULES_FILE) as f:
        return json.load(f)


def _mk(mgr, user, **kw):
    """A registry entry with sane defaults, for direct-state tests."""
    ent = {"id": kw.get("id", "x1"), "term": kw.get("term", 1),
           "text": kw.get("text", "continue"),
           "at": kw.get("at", time.time() + 60), "created": time.time(),
           "status": kw.get("status", "pending"), "fired": None, "error": None}
    return ent


# ---- create -----------------------------------------------------------------

def test_create_persists_entry_owned_by_the_session_user(client, mgr, home, op_cookie):
    at = time.time() + 3600
    status, body = client.post("/api/terminals/schedules",
                               {"term": 3, "text": "continue", "at": at},
                               cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    ent = body["schedule"]
    assert ent["term"] == 3 and ent["text"] == "continue" and ent["status"] == "pending"

    reg = _read_reg(mgr)
    assert list(reg) == [mgr.APP_USER]            # keyed by the AUTHENTICATED user
    assert reg[mgr.APP_USER][0]["id"] == body["id"]


def test_owner_cannot_be_spoofed_via_the_body(client, mgr, home, op_cookie):
    """The sweeper writes into whichever user's PTY the entry names, so the owner
    must come from the session — a `user` field in the body is ignored."""
    client.post("/api/terminals/schedules",
                {"term": 1, "text": "hi", "at": time.time() + 300,
                 "user": "root", "owner": "root"}, cookie=op_cookie)
    assert list(_read_reg(mgr)) == [mgr.APP_USER]


@pytest.mark.parametrize("body,frag", [
    ({"term": 0, "text": "x", "at": 0}, "term must be"),
    ({"term": 99999, "text": "x", "at": 0}, "term must be"),
    ({"term": "abc", "text": "x", "at": 0}, "term must be a number"),
    ({"term": 1, "text": "   ", "at": 0}, "single non-empty line"),
    ({"term": 1, "text": "a\nrm -rf /", "at": 0}, "single non-empty line"),
    ({"term": 1, "text": "a\rrm -rf /", "at": 0}, "single non-empty line"),
    ({"term": 1, "text": "x" * 2001, "at": 0}, "single non-empty line"),
    ({"term": 1, "text": "x", "at": "soon"}, "unix timestamp"),
])
def test_rejects_bad_input(client, home, op_cookie, body, frag):
    if body.get("at") == 0:
        body["at"] = time.time() + 300
    status, resp = client.post("/api/terminals/schedules", body, cookie=op_cookie)
    assert status == 400 and frag in resp["error"]


def test_rejects_a_time_that_has_passed(client, home, op_cookie):
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "x", "at": time.time() - 3600},
                               cookie=op_cookie)
    assert status == 400 and "already passed" in body["error"]


def test_accepts_now_despite_the_pickers_minute_granularity(client, mgr, home, op_cookie):
    """The UI defaults the field to NOW, and datetime-local only resolves to the
    minute — so a "send it now" submit arrives already up to ~59s in the past.
    Inside SCHED_PAST_TOLERANCE that must be accepted and fire on the next tick."""
    at = time.time() - (mgr.SCHED_PAST_TOLERANCE - 15)
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "continue", "at": at},
                               cookie=op_cookie)
    assert status == 200
    assert mgr._due_schedules(mgr._read_schedules(), time.time())   # due right away


def test_rejects_beyond_the_horizon(client, mgr, home, op_cookie):
    status, body = client.post(
        "/api/terminals/schedules",
        {"term": 1, "text": "x", "at": time.time() + mgr.SCHED_MAX_HORIZON + 60},
        cookie=op_cookie)
    assert status == 400 and "days out" in body["error"]


def test_pending_cap_enforced(client, mgr, home, op_cookie):
    for i in range(mgr.SCHED_MAX_PER_USER):
        st, _ = client.post("/api/terminals/schedules",
                            {"term": 1, "text": "m%d" % i, "at": time.time() + 600},
                            cookie=op_cookie)
        assert st == 200
    st, body = client.post("/api/terminals/schedules",
                           {"term": 1, "text": "one too many", "at": time.time() + 600},
                           cookie=op_cookie)
    assert st == 400 and "cancel one first" in body["error"]


# ---- list / cancel ----------------------------------------------------------

def test_list_returns_newest_first_and_rides_the_status_poll(client, mgr, home, op_cookie):
    for delta in (600, 60, 6000):
        client.post("/api/terminals/schedules",
                    {"term": 1, "text": "t%d" % delta, "at": time.time() + delta},
                    cookie=op_cookie)
    status, body = client.get("/api/terminals/schedules", cookie=op_cookie)
    assert status == 200
    ats = [e["at"] for e in body["schedules"]]
    assert ats == sorted(ats, reverse=True)
    # Same payload is folded into the status poll terminals.html already runs.
    status, st_body = client.get("/api/terminals/status", cookie=op_cookie)
    assert [e["id"] for e in st_body["schedules"]] == [e["id"] for e in body["schedules"]]


def test_cancel_removes_only_the_named_entry(client, mgr, home, op_cookie):
    ids = []
    for i in range(2):
        _, b = client.post("/api/terminals/schedules",
                           {"term": 1, "text": "m%d" % i, "at": time.time() + 600},
                           cookie=op_cookie)
        ids.append(b["id"])
    status, body = client.post("/api/terminals/schedules/cancel", {"id": ids[0]},
                               cookie=op_cookie)
    assert status == 200 and body["ok"] is True
    left = [e["id"] for e in _read_reg(mgr)[mgr.APP_USER]]
    assert left == [ids[1]]


def test_cancel_cannot_reach_another_users_entry(client, mgr, users, op_cookie):
    _, b = client.post("/api/terminals/schedules",
                       {"term": 1, "text": "alice's", "at": time.time() + 600},
                       cookie=users["alice"][1])
    # Bob knows the id but it isn't in his list -> 404, and alice's survives.
    status, _ = client.post("/api/terminals/schedules/cancel", {"id": b["id"]},
                            cookie=users["bob"][1])
    assert status == 404
    assert [e["id"] for e in _read_reg(mgr)["alice"]] == [b["id"]]


def test_cancel_unknown_id_404s(client, home, op_cookie):
    status, _ = client.post("/api/terminals/schedules/cancel", {"id": "nope"},
                            cookie=op_cookie)
    assert status == 404


def test_users_only_see_their_own(client, mgr, users):
    client.post("/api/terminals/schedules",
                {"term": 1, "text": "alice's", "at": time.time() + 600},
                cookie=users["alice"][1])
    _, b = client.get("/api/terminals/schedules", cookie=users["bob"][1])
    assert b["schedules"] == []


# ---- registry hardening -----------------------------------------------------

def test_registry_is_written_0600(client, mgr, home, op_cookie):
    """It names a user + text the root sweeper will type into that user's PTY, so
    a tenant-writable copy would be code execution as someone else."""
    client.post("/api/terminals/schedules",
                {"term": 1, "text": "x", "at": time.time() + 600}, cookie=op_cookie)
    assert oct(os.stat(mgr.SCHEDULES_FILE).st_mode & 0o777) == "0o600"


def test_corrupt_registry_is_tolerated(mgr, home):
    with open(mgr.SCHEDULES_FILE, "w") as f:
        f.write("{not json")
    assert mgr._read_schedules() == {}
    with open(mgr.SCHEDULES_FILE, "w") as f:
        json.dump({"alice": "not-a-list", "bob": [{"no": "id"}, _mk(mgr, "bob")]}, f)
    reg = mgr._read_schedules()
    assert "alice" not in reg and len(reg["bob"]) == 1


# ---- due-time math (pure) ---------------------------------------------------

def test_due_schedules_selects_only_ripe_pending(mgr):
    now = 1000.0
    reg = {"u": [
        _mk(mgr, "u", id="past", at=now - 1),
        _mk(mgr, "u", id="future", at=now + 1),
        _mk(mgr, "u", id="already", at=now - 100, status="sent"),
    ]}
    assert [e["id"] for _, e in mgr._due_schedules(reg, now)] == ["past"]


def test_run_marks_sent_and_failed(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="a", term=1, at=now - 1),
                                _mk(mgr, "u", id="b", term=2, at=now - 1)]})
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (True, None) if n == 1
                        else (False, "terminal 2 is not running"))
    mgr._run_due_schedules(now)
    by_id = {e["id"]: e for e in mgr._read_schedules()["u"]}
    assert by_id["a"]["status"] == "sent" and by_id["a"]["error"] is None
    assert by_id["b"]["status"] == "failed"
    assert "not running" in by_id["b"]["error"]
    assert by_id["a"]["fired"]


def test_run_fires_late_within_the_grace_window(mgr, home, monkeypatch):
    """A manager restart / brief host outage must not silently drop a schedule."""
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="late",
                                    at=now - mgr.SCHED_LATE_GRACE + 60)]})
    monkeypatch.setattr(mgr, "_inject_terminal", lambda *a: (True, None))
    mgr._run_due_schedules(now)
    assert mgr._read_schedules()["u"][0]["status"] == "sent"


def test_run_marks_missed_past_the_grace_window(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="stale",
                                    at=now - mgr.SCHED_LATE_GRACE - 60)]})
    called = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda *a: called.append(a) or (True, None))
    mgr._run_due_schedules(now)
    assert mgr._read_schedules()["u"][0]["status"] == "missed"
    assert not called                       # nothing typed into the terminal


def test_one_bad_entry_does_not_abort_the_pass(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="boom", term=1, at=now - 1),
                                _mk(mgr, "u", id="ok", term=2, at=now - 1)]})

    def flaky(user, n, text):
        if n == 1:
            raise RuntimeError("session daemon exploded")
        return True, None
    monkeypatch.setattr(mgr, "_inject_terminal", flaky)
    mgr._run_due_schedules(now)
    by_id = {e["id"]: e for e in mgr._read_schedules()["u"]}
    assert by_id["boom"]["status"] == "failed" and by_id["ok"]["status"] == "sent"


def test_prune_keeps_pending_and_drops_old_history(mgr):
    now = time.time()
    reg = {"u": [
        _mk(mgr, "u", id="keep-pending", at=now + 600),
        _mk(mgr, "u", id="fresh-done", at=now - 60, status="sent"),
        _mk(mgr, "u", id="old-done", at=now - mgr.SCHED_KEEP_DONE - 60, status="sent"),
    ]}
    reg["u"][2]["fired"] = now - mgr.SCHED_KEEP_DONE - 60
    ids = {e["id"] for e in mgr._prune_schedules(reg, now)["u"]}
    assert ids == {"keep-pending", "fresh-done"}


def test_history_expires_on_an_idle_sweeper_pass(mgr, home):
    """The prune used to run ONLY on a pass that fired something (and on create),
    so once your last message had fired, its history sat there forever — the 24h
    window never elapsed for anyone. An idle tick must age it out."""
    now = time.time()
    old = _mk(mgr, "u", id="old-done", at=now - mgr.SCHED_KEEP_DONE - 60,
              status="sent")
    old["fired"] = now - mgr.SCHED_KEEP_DONE - 60
    fresh = _mk(mgr, "u", id="fresh-done", at=now - 60, status="sent")
    mgr._write_schedules({"u": [old, fresh]})

    assert mgr._run_due_schedules(now) == []          # nothing due: an idle pass
    assert {e["id"] for e in mgr._read_schedules()["u"]} == {"fresh-done"}


def test_idle_pass_does_not_rewrite_when_nothing_expired(mgr, home, monkeypatch):
    """It runs every SCHED_TICK, so it must stay a read until there is real work —
    no rewriting the registry (or churning its mtime) 5760 times a day."""
    mgr._write_schedules({"u": [_mk(mgr, "u", id="fresh-done", at=time.time() - 60,
                                    status="sent")]})
    writes = []
    real_write = mgr._write_schedules
    monkeypatch.setattr(mgr, "_write_schedules",
                        lambda reg: (writes.append(1), real_write(reg))[1])
    assert mgr._prune_expired_schedules() is False
    assert writes == []


# ---- injection (real socket) ------------------------------------------------

def test_inject_writes_text_and_carriage_return_to_the_session_socket(
        mgr, tmp_path, monkeypatch):
    """The end of the whole chain: exactly what a real Enter delivers — the text
    plus \\r (NOT \\n; the attach client clears ICRNL)."""
    sock_path = str(tmp_path / "sess.sock")
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(1)
    got = []

    def accept_once():
        conn, _ = srv.accept()
        with conn:
            got.append(conn.recv(4096))
    t = threading.Thread(target=accept_once, daemon=True)
    t.start()

    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [7])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, err = mgr._inject_terminal("alice", 7, "continue")
    t.join(timeout=5)
    srv.close()
    assert ok and err is None
    assert got == [b"continue\r"]


def test_inject_survives_the_replay_the_daemon_queues_on_connect(mgr, tmp_path, monkeypatch):
    """Regression: vibetop-session pushes its whole replay ring at every new
    client. Closing with that unread makes the daemon's OWN recv() fail
    (ECONNRESET) and it drops the client before writing our bytes to the PTY —
    the message is lost while the sweeper still reports "sent". _inject_terminal
    drains first; this server reproduces the shape."""
    sock_path = str(tmp_path / "busy.sock")
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(1)
    got, err = [], []

    def daemon_like():
        conn, _ = srv.accept()
        with conn:
            try:
                conn.sendall(b"replay" * 100000)     # ~600 KB, like a warm ring
                got.append(conn.recv(4096))
            except OSError as e:                     # what the real daemon hits
                err.append(str(e))
    t = threading.Thread(target=daemon_like, daemon=True)
    t.start()

    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [1])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, _ = mgr._inject_terminal("alice", 1, "continue")
    t.join(timeout=10)
    srv.close()
    assert ok
    assert got == [b"continue\r"], "bytes lost to the replay race (%s)" % err


def test_inject_refuses_when_the_terminal_is_not_running(mgr, monkeypatch):
    """Deliberately does NOT cold-start: a fresh bash has none of the session the
    message was written for, so it would land as `command not found`."""
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [])
    ok, err = mgr._inject_terminal("alice", 3, "continue")
    assert ok is False and "terminal 3 is not running" in err


def test_inject_reports_a_dead_socket_rather_than_raising(mgr, tmp_path, monkeypatch):
    dead = str(tmp_path / "gone.sock")
    open(dead, "w").close()                       # exists, but nothing listening
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [1])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: dead)
    ok, err = mgr._inject_terminal("alice", 1, "hi")
    assert ok is False and "could not reach terminal 1" in err


def test_term_socket_path_is_per_user(mgr):
    """Instance ids embed the user, so two users' terminal 1 can't collide."""
    assert mgr._term_socket("alice", 1) != mgr._term_socket("bob", 1)
    assert mgr._term_socket("alice", 1).endswith("vibetop-session-alice-1.sock")


# ---- idle-reaper interaction -------------------------------------------------

def test_reaper_spares_terminals_of_a_user_with_a_pending_schedule(mgr, home, monkeypatch):
    """Reaping the target terminal would make the schedule fail at exactly the
    unattended moment it exists for. The heavier services are still reclaimed."""
    mgr._write_schedules({"alice": [_mk(mgr, "alice", at=time.time() + 3600)]})
    monkeypatch.setattr(mgr, "_read_idle_policy",
                        lambda: {"enabled": True, "hours": 1, "reapTerminals": True})
    monkeypatch.setattr(mgr, "_read_users_registry", lambda: {"alice": {"slot": 0}})
    monkeypatch.setattr(mgr, "_user_last_heartbeat", lambda u: time.time() - 99999)
    seen = {}
    monkeypatch.setattr(mgr, "_reap_user",
                        lambda user, reap_terminals=False: seen.update(
                            {"user": user, "terms": reap_terminals}))
    assert mgr._reap_idle_users() == ["alice"]
    assert seen == {"user": "alice", "terms": False}

    mgr._write_schedules({})                      # no pending -> normal behavior
    assert mgr._reap_idle_users() == ["alice"]
    assert seen["terms"] is True
