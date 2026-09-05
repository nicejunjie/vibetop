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
           "status": kw.get("status", "pending"), "fired": None, "error": None,
           "every": kw.get("every"), "until": kw.get("until"),
           "runs": kw.get("runs", 0)}
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


def test_accepts_now_despite_the_pickers_minute_granularity(client, mgr, home, op_cookie,
                                                           monkeypatch):
    """The UI defaults the field to NOW, and datetime-local only resolves to the
    minute — so a "send it now" submit arrives already up to ~59s in the past.
    Inside SCHED_PAST_TOLERANCE that must be accepted.

    It used to be accepted and left for the next sweeper tick; since the Send-now
    button it is delivered by the request itself, so this asserts it was acted on
    rather than that it is still waiting."""
    sent = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (sent.append(text), (True, None))[1])
    at = time.time() - (mgr.SCHED_PAST_TOLERANCE - 15)
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "continue", "at": at},
                               cookie=op_cookie)
    assert status == 200
    assert sent == ["continue"]
    assert not mgr._due_schedules(mgr._read_schedules(), time.time())   # nothing left over


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


def test_cancelling_a_loop_that_has_RUN_keeps_it_as_history(client, mgr, home, op_cookie):
    """Those runs happened — messages were typed into a terminal. Erasing the only
    record of that on a Cancel click loses history the user may need."""
    now = time.time()
    ent = _mk(mgr, mgr.APP_USER, id="L", at=now + 300, every=300,
              until=now + 3600, runs=3)
    mgr._write_schedules({mgr.APP_USER: [ent]})
    status, body = client.post("/api/terminals/schedules/cancel", {"id": "L"},
                               cookie=op_cookie)
    assert status == 200 and body["kept"] is True
    kept = _read_reg(mgr)[mgr.APP_USER][0]
    assert kept["status"] == "stopped" and kept["runs"] == 3
    assert kept["fired"]                        # so SCHED_KEEP_DONE can age it out
    assert not mgr._due_schedules({mgr.APP_USER: [kept]}, now + 10 ** 6)


def test_cancelling_a_loop_that_never_RAN_deletes_it(client, mgr, home, op_cookie):
    now = time.time()
    mgr._write_schedules({mgr.APP_USER: [
        _mk(mgr, mgr.APP_USER, id="L", at=now + 300, every=300,
            until=now + 3600, runs=0)]})
    status, body = client.post("/api/terminals/schedules/cancel", {"id": "L"},
                               cookie=op_cookie)
    assert status == 200 and body["kept"] is False
    assert _read_reg(mgr) == {}


def test_cancelling_a_pending_one_shot_still_deletes_it(client, mgr, home, op_cookie):
    """A one-shot is always cancelled before it fires, so `runs` keeps this the
    plain delete it has always been."""
    mgr._write_schedules({mgr.APP_USER: [
        _mk(mgr, mgr.APP_USER, id="S", at=time.time() + 300)]})
    status, body = client.post("/api/terminals/schedules/cancel", {"id": "S"},
                               cookie=op_cookie)
    assert status == 200 and body["kept"] is False
    assert _read_reg(mgr) == {}


def test_the_x_on_a_history_row_really_removes_it(client, mgr, home, op_cookie):
    """Keeping a stopped loop would be a trap if the × could never clear it: that
    is the only way to tidy the list."""
    now = time.time()
    done = _mk(mgr, mgr.APP_USER, id="D", at=now - 60, every=300,
               until=now - 30, runs=9, status="stopped")
    done["fired"] = now - 60
    mgr._write_schedules({mgr.APP_USER: [done]})
    status, body = client.post("/api/terminals/schedules/cancel", {"id": "D"},
                               cookie=op_cookie)
    assert status == 200 and body["kept"] is False
    assert _read_reg(mgr) == {}


def test_a_stopped_loop_frees_the_idle_reaper(mgr, home):
    """It is no longer pending, so it must stop holding the user's terminals open."""
    now = time.time()
    ent = _mk(mgr, mgr.APP_USER, id="L", at=now + 300, every=300,
              until=now + 3600, runs=2, status="stopped")
    mgr._write_schedules({mgr.APP_USER: [ent]})
    assert not mgr._user_has_pending_schedule(mgr.APP_USER)


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
    ent = mgr._read_schedules()["u"][0]
    assert ent["status"] == "missed"
    assert not called                       # nothing typed into the terminal
    # ...and it must still be READABLE tomorrow: _prune_schedules ages history
    # from `fired`, so a resolved entry without one is swept out of the panel
    # immediately and the user never learns the message did not go.
    assert ent["fired"] == now


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


# ---- loops (every + until) --------------------------------------------------
# A loop is ONE registry entry that the sweeper re-arms, not N queued messages:
# it counts once against the pending cap, keeps the idle reaper off the terminal
# for its whole life, and is cancelled with one ×.

def test_create_accepts_a_loop_and_stores_its_shape(client, mgr, home, op_cookie):
    now = time.time()
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "continue", "at": now + 300,
                                "every": 300, "until": now + 3600},
                               cookie=op_cookie)
    assert status == 200
    ent = _read_reg(mgr)[mgr.APP_USER][0]
    assert ent["every"] == 300 and ent["runs"] == 0
    assert abs(ent["until"] - (now + 3600)) < 1


def test_a_one_shot_still_records_no_loop(client, mgr, home, op_cookie):
    """The added fields must not change what a plain scheduled message is."""
    client.post("/api/terminals/schedules",
                {"term": 1, "text": "continue", "at": time.time() + 300},
                cookie=op_cookie)
    ent = _read_reg(mgr)[mgr.APP_USER][0]
    assert ent["every"] is None and ent["until"] is None


@pytest.mark.parametrize("extra,frag", [
    ({"every": "soon", "until": 1}, "every must be a number"),
    ({"every": 30, "until": 1}, "at most once every"),
    ({"every": 300}, "needs an end time"),
    ({"every": 300, "until": "later"}, "needs an end time"),
    ({"every": 300, "until": 0}, "before the first run"),
    ({"every": 300, "until": 4 * 10 ** 9}, "days out"),
    ({"every": 60, "until": 10 ** 9}, "at most"),          # runs cap
])
def test_rejects_bad_loop_input(client, home, op_cookie, extra, frag):
    body = {"term": 1, "text": "x", "at": time.time() + 300}
    body.update(extra)
    if body.get("until") in (10 ** 9, 4 * 10 ** 9):
        body["until"] = time.time() + (86400 if body["until"] == 10 ** 9 else 60 * 86400)
    status, resp = client.post("/api/terminals/schedules", body, cookie=op_cookie)
    assert status == 400 and frag in resp["error"]


def test_next_slot_walks_the_grid_not_the_wall_clock(mgr):
    # A pass that runs 7s late must still re-arm on the original minute.
    assert mgr._sched_next_slot(1000.0, 300, 1007.0) == 1300.0
    assert mgr._sched_next_slot(1000.0, 300, 1300.0) == 1600.0   # exactly on a slot
    assert mgr._sched_next_slot(1000.0, 300, 900.0) == 1000.0    # not due yet
    # A long outage collapses to ONE future slot, not a backlog of firings.
    assert mgr._sched_next_slot(1000.0, 300, 99000.0) == 99100.0


def test_a_corrupt_interval_cannot_make_a_tight_fire_loop(mgr):
    """`every` is re-armed to `at + every`, so 0 (or a hand-edited 1) would make
    the entry due again every single tick. Below the floor it is not a loop."""
    assert mgr._sched_every({"every": 0}) is None
    assert mgr._sched_every({"every": 1}) is None
    assert mgr._sched_every({"every": "x"}) is None
    assert mgr._sched_every({"every": mgr.SCHED_MIN_INTERVAL}) == mgr.SCHED_MIN_INTERVAL


def test_a_loop_re_arms_instead_of_finishing(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="L", at=now - 1, every=300,
                                    until=now + 3600)]})
    sent = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (sent.append(text), (True, None))[1])
    mgr._run_due_schedules(now)
    ent = mgr._read_schedules()["u"][0]
    assert sent == ["continue"]
    assert ent["status"] == "pending"                  # still armed
    assert ent["runs"] == 1 and ent["fired"]
    assert ent["at"] == pytest.approx((now - 1) + 300)


def test_a_loop_finishes_on_its_last_slot(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="L", at=now - 1, every=300,
                                    until=now + 60, runs=4)]})
    monkeypatch.setattr(mgr, "_inject_terminal", lambda *a: (True, None))
    mgr._run_due_schedules(now)
    ent = mgr._read_schedules()["u"][0]
    assert ent["status"] == "sent" and ent["runs"] == 5   # next slot is past `until`


def test_a_failed_run_does_not_end_the_loop(mgr, home, monkeypatch):
    """The terminal may simply be stopped right now and back before the next
    slot — a one-shot gives up, a loop keeps its appointment."""
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="L", at=now - 1, every=300,
                                    until=now + 3600)]})
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda *a: (False, "terminal 1 is not running"))
    mgr._run_due_schedules(now)
    ent = mgr._read_schedules()["u"][0]
    assert ent["status"] == "pending" and "not running" in ent["error"]
    assert ent["at"] == pytest.approx((now - 1) + 300)


def test_a_loop_skips_slots_it_slept_through_instead_of_machine_gunning(
        mgr, home, monkeypatch):
    """Wake a laptop after two days and a 5m loop owes ~576 messages. It must
    type NONE of them and simply re-arm on the next future slot."""
    now = time.time()
    start = now - 2 * 86400
    mgr._write_schedules({"u": [_mk(mgr, "u", id="L", at=start, every=300,
                                    until=now + 3600, runs=3)]})
    called = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda *a: called.append(a) or (True, None))
    mgr._run_due_schedules(now)
    ent = mgr._read_schedules()["u"][0]
    assert not called                       # nothing typed into the terminal
    assert ent["status"] == "pending" and ent["runs"] == 3
    assert ent["at"] > now and ent["at"] == pytest.approx(
        mgr._sched_next_slot(start, 300, now))


def test_a_loop_that_slept_past_its_end_is_missed_not_sent(mgr, home, monkeypatch):
    now = time.time()
    mgr._write_schedules({"u": [_mk(mgr, "u", id="L", at=now - 2 * 86400, every=300,
                                    until=now - 86400)]})
    monkeypatch.setattr(mgr, "_inject_terminal", lambda *a: (True, None))
    mgr._run_due_schedules(now)
    assert mgr._read_schedules()["u"][0]["status"] == "missed"


def test_a_pending_loop_counts_once_against_the_cap_and_the_reaper(
        client, mgr, home, op_cookie):
    now = time.time()
    client.post("/api/terminals/schedules",
                {"term": 1, "text": "continue", "at": now + 300,
                 "every": 300, "until": now + 30 * 3600}, cookie=op_cookie)
    reg = _read_reg(mgr)
    assert len(reg[mgr.APP_USER]) == 1
    assert mgr._user_has_pending_schedule(mgr.APP_USER)


# ---- injection (real socket) ------------------------------------------------

def _accepting_server(sock_path, per_conn, conns=2):
    """A daemon-alike accepting `conns` connections sequentially; `per_conn`
    handles each accepted socket. Returns (thread, srv). _inject_terminal now
    rides one connection PER WRITE (text, then Enter), so every socket test
    serves at least two."""
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(4)

    def run():
        for _ in range(conns):
            try:
                conn, _ = srv.accept()
            except OSError:
                return
            with conn:
                per_conn(conn)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t, srv


def test_inject_writes_text_and_carriage_return_to_the_session_socket(
        mgr, tmp_path, monkeypatch):
    """The end of the whole chain: exactly what a real Enter delivers — the text
    plus \\r (NOT \\n; the attach client clears ICRNL), across the two
    per-write connections."""
    sock_path = str(tmp_path / "sess.sock")
    got = bytearray()

    def per_conn(conn):
        while True:
            data = conn.recv(4096)
            if not data:
                break
            got.extend(data)
    t, srv = _accepting_server(sock_path, per_conn)

    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [7])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, err = mgr._inject_terminal("alice", 7, "continue")
    t.join(timeout=5)
    srv.close()
    assert ok and err is None
    assert bytes(got) == b"continue\r"


def test_inject_survives_the_replay_the_daemon_queues_on_connect(mgr, tmp_path, monkeypatch):
    """Regression: vibetop-session pushes its whole replay ring at every new
    client. Abandoning the connection with that unread makes the daemon's OWN
    recv() fail (ECONNRESET) and it drops the client before writing our bytes
    to the PTY — the message is lost while the sweeper still reports "sent".
    The half-close + read-to-EOF keeps the stream clean; this server
    reproduces the shape on BOTH per-write connections."""
    sock_path = str(tmp_path / "busy.sock")
    got, errs = [], []

    def per_conn(conn):
        try:
            conn.sendall(b"replay" * 100000)     # ~600 KB, like a warm ring
            while True:
                data = conn.recv(4096)
                if not data:
                    break
                got.append(data)
        except OSError as e:                     # what the real daemon hits
            errs.append(str(e))
    t, srv = _accepting_server(sock_path, per_conn)

    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [1])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, _ = mgr._inject_terminal("alice", 1, "continue")
    t.join(timeout=10)
    srv.close()
    assert ok
    assert b"".join(got) == b"continue\r", "bytes lost to the replay race (%s)" % errs


def test_inject_sends_the_enter_as_its_own_later_keypress(mgr, tmp_path, monkeypatch):
    """Regression: text and \\r written in ONE chunk reach the foreground app as
    ONE stdin read, and a paste-detecting TUI (Claude Code — the feature's
    flagship target, "type `continue` at the usage reset") treats a rapid
    multi-char chunk as a PASTE: the \\r lands as a newline in its composer
    instead of a submit, so the message sits at the prompt and never executes.
    (bash happens to survive — readline is per-byte — which is why the original
    exact-bytes test stayed green while the feature was broken in the wild.)

    The Enter must therefore be its OWN write, a beat after the text, so the app
    sees a distinct Enter keypress. Timing spans the two per-write connections."""
    sock_path = str(tmp_path / "sess.sock")
    chunks = []                               # [(seconds-since-first, bytes)]
    t0 = []

    def per_conn(conn):
        while True:
            data = conn.recv(4096)
            if not data:
                break
            now = time.monotonic()
            if not t0:
                t0.append(now)
            chunks.append((now - t0[0], data))
    t, srv = _accepting_server(sock_path, per_conn)

    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [7])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, err = mgr._inject_terminal("alice", 7, "continue")
    t.join(timeout=10)
    srv.close()
    assert ok and err is None
    assert b"".join(c for _, c in chunks) == b"continue\r"
    assert b"\r" not in chunks[0][1], \
        "text and Enter arrived in one chunk — a paste-detecting TUI won't submit"
    gap, enter = next((g, c) for g, c in chunks if b"\r" in c)
    assert enter == b"\r", "the Enter must be a bare keypress, not glued to text"
    assert gap >= 0.1, f"Enter only {gap:.3f}s after the text — same paste burst"


def test_inject_survives_the_daemons_backpressure_kill(mgr, tmp_path, monkeypatch):
    """Regression for the 5/5 overnight failures ("could not reach terminal 3:
    [Errno 32] Broken pipe"): the real daemon DROPS a connected client whose
    output queue outgrows MAX_OUTQ (broadcast's backpressure guard). A busy
    terminal near ring capacity kills any client that lingers — which the old
    drain-in-place injector did for ~1s, so its Enter write always hit a dead
    socket. This server reproduces the kill: it hangs up on every connection
    ~0.15s after accepting (long before the old design's Enter at +0.3s).
    Per-write short-lived connections deliver both writes before any kill."""
    sock_path = str(tmp_path / "kill.sock")
    got = []

    def per_conn(conn):
        end = time.monotonic() + 0.15
        conn.settimeout(0.05)
        while time.monotonic() < end:
            try:
                data = conn.recv(4096)
            except socket.timeout:
                continue
            except OSError:
                return
            if not data:
                return                       # client already done — clean EOF
            got.append(data)
        # 0.15s up: the backpressure guard fires — drop the client, hard.

    t, srv = _accepting_server(sock_path, per_conn)
    monkeypatch.setattr(mgr, "_list_running_terminals", lambda user: [3])
    monkeypatch.setattr(mgr, "_term_socket", lambda user, n: sock_path)
    ok, err = mgr._inject_terminal("alice", 3, "continue")
    t.join(timeout=10)
    srv.close()
    assert ok, f"injection failed under the backpressure kill: {err}"
    assert b"".join(got) == b"continue\r"


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


# --- "Send now": a message already due fires on arrival, not on the next tick ---

def test_a_due_message_is_delivered_by_the_request_itself(client, mgr, home, op_cookie,
                                                          monkeypatch):
    """The panel's "Send now" button posts at=now. The sweeper ticks every 15s, so
    without firing in-request a button labelled "now" sits there looking broken for
    up to fifteen seconds. Assert delivery happened during the POST — no tick run."""
    sent = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (sent.append((user, n, text)), (True, None))[1])
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "continue", "at": time.time()},
                               cookie=op_cookie)
    assert status == 200
    assert sent, "the message was queued but not delivered by the request"
    assert sent[0][1] == 1 and sent[0][2] == "continue"
    ent = [e for lst in mgr._read_schedules().values() for e in lst][0]
    assert ent["status"] == "sent" and ent["fired"]
    # And the REPLY says so too — returning the pre-fire snapshot would report
    # "pending" for a message that has already gone out.
    assert body["schedule"]["status"] == "sent"
    assert body["schedule"]["fired"]


def test_a_future_message_is_left_for_the_sweeper(client, mgr, home, op_cookie, monkeypatch):
    """The other half of the same rule — scheduling must not fire early. Without
    this, the in-request run could quietly deliver anything it found ripe."""
    sent = []
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (sent.append(text), (True, None))[1])
    status, _ = client.post("/api/terminals/schedules",
                            {"term": 1, "text": "later", "at": time.time() + 3600},
                            cookie=op_cookie)
    assert status == 200
    assert not sent, "a future message must not be delivered by its own request"
    ent = [e for lst in mgr._read_schedules().values() for e in lst][0]
    assert ent["status"] == "pending" and not ent["fired"]


def test_a_failed_immediate_send_is_reported_not_swallowed(client, mgr, home, op_cookie,
                                                           monkeypatch):
    """Send now into a terminal that is not running must record the failure on the
    entry — the client re-reads the list straight after, so this is what the user
    sees instead of a false "Sent."."""
    monkeypatch.setattr(mgr, "_inject_terminal",
                        lambda user, n, text: (False, "terminal 3 is not running"))
    status, body = client.post("/api/terminals/schedules",
                               {"term": 3, "text": "continue", "at": time.time()},
                               cookie=op_cookie)
    assert status == 200
    ent = [e for lst in mgr._read_schedules().values() for e in lst][0]
    assert ent["status"] == "failed"
    assert "not running" in ent["error"]
    # The reply must carry the failure too, not a stale "pending".
    assert body["schedule"]["status"] == "failed"
    assert "not running" in body["schedule"]["error"]


def test_an_injector_that_raises_does_not_fail_the_queue(client, mgr, home, op_cookie,
                                                         monkeypatch):
    """The message is already saved by the time we try to deliver it. A blow-up in
    delivery must not turn a stored schedule into a 500 the user reads as "lost"."""
    def boom(user, n, text):
        raise RuntimeError("pty exploded")
    monkeypatch.setattr(mgr, "_inject_terminal", boom)
    status, body = client.post("/api/terminals/schedules",
                               {"term": 1, "text": "continue", "at": time.time()},
                               cookie=op_cookie)
    assert status == 200 and body.get("ok")
