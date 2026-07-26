r"""Tests for vibetop-session's ring-buffer replay sanitization.

`strip_terminal_queries` removes terminal query-REQUEST escape sequences from the
scrollback replayed to a freshly (re)connected client, so the client doesn't
re-answer a stale DA/CPR/color/mode probe — whose answer would be injected into
the shared PTY and echoed at the prompt as garbage (the "2RR0;276;0c10;rgb:…$y"
bug). The flip side matters just as much: real screen state (text, SGR colors,
cursor moves, OSC *set* sequences) must survive untouched.

    cd terminal && python -m pytest tests/ -q
"""
import pytest

ESC = b"\x1b"
BEL = b"\x07"
ST = b"\x1b\\"


# -- query REQUESTS that must be stripped from the replay -------------------

STRIP = [
    pytest.param(ESC + b"[c", id="DA1-request"),
    pytest.param(ESC + b"[0c", id="DA1-request-0"),
    pytest.param(ESC + b"[>c", id="DA2-request"),
    pytest.param(ESC + b"[>0c", id="DA2-request-0"),
    pytest.param(ESC + b"[=c", id="DA3-request"),
    pytest.param(ESC + b"[6n", id="CPR-cursor-position-request"),
    pytest.param(ESC + b"[5n", id="DSR-status-request"),
    pytest.param(ESC + b"[?6n", id="DECDSR-request"),
    pytest.param(ESC + b"[?6$p", id="DECRQM-private"),
    pytest.param(ESC + b"[2$p", id="DECRQM-ansi"),
    pytest.param(ESC + b"]10;?" + BEL, id="OSC10-fg-query-BEL"),
    pytest.param(ESC + b"]11;?" + ST, id="OSC11-bg-query-ST"),
    pytest.param(ESC + b"]12;?" + BEL, id="OSC12-cursor-color-query"),
    pytest.param(ESC + b"]4;1;?" + BEL, id="OSC4-palette-query"),
    # The exact bundle from the bug report (DA2 + OSC10/11 + DECRPM-ish), as the
    # original REQUESTS that produced it.
    pytest.param(ESC + b"[>c" + ESC + b"]10;?" + BEL + ESC + b"]11;?" + BEL, id="probe-bundle"),
]


@pytest.mark.parametrize("seq", STRIP)
def test_query_requests_are_stripped(csession, seq):
    assert csession.strip_terminal_queries(seq) == b""


def test_queries_stripped_but_surrounding_text_kept(csession):
    data = b"hello" + ESC + b"[6n" + b"world" + ESC + b"]11;?" + BEL + b"!"
    assert csession.strip_terminal_queries(data) == b"helloworld!"


# -- real screen state that must be PRESERVED ------------------------------

KEEP = [
    pytest.param(b"plain text\r\n", id="plain-text"),
    pytest.param(ESC + b"[0m", id="SGR-reset"),
    pytest.param(ESC + b"[31;1m", id="SGR-bold-red"),
    pytest.param(ESC + b"[2J", id="clear-screen"),
    pytest.param(ESC + b"[10;20H", id="cursor-move"),
    pytest.param(ESC + b"[K", id="erase-line"),
    # OSC *set* (not a query — no '?') is real state: window title and bg color.
    pytest.param(ESC + b"]0;my title" + BEL, id="OSC-title-set"),
    pytest.param(ESC + b"]11;rgb:2b2b/2b2b/2b2b" + BEL, id="OSC11-bg-COLOR-set"),
    # A title that happens to contain a '?' must not be mistaken for a color query.
    pytest.param(ESC + b"]0;why? ok" + BEL, id="OSC-title-with-question-mark"),
]


@pytest.mark.parametrize("seq", KEEP)
def test_screen_state_is_preserved(csession, seq):
    assert csession.strip_terminal_queries(seq) == seq


def test_realistic_prompt_line_survives(csession):
    # A colored prompt redraw with NO queries must pass through byte-for-byte.
    line = (ESC + b"[1;32m(base) [T7] junjie@z20" + ESC + b"[0m:" +
            ESC + b"[1;34m~/uaps_report" + ESC + b"[0m$ ")
    assert csession.strip_terminal_queries(line) == line


def test_empty_input(csession):
    assert csession.strip_terminal_queries(b"") == b""


# -- adaptive replay: screen-size floor + slow-client truncation ------------
#
# For a client too slow to receive the whole ring, adaptive mode jumps it to the
# current screen: a clear + the newest `screen_replay_bytes(rows,cols)` of the
# still-unsent tail. Both helpers are pure; the truncation must never reorder
# (only ever drop the OLD middle) or it would corrupt xterm.

CLEAR = b"\x1b[H\x1b[2J"


def test_screen_bytes_floor_applies_to_small_terminal(csession):
    # 24x80 default is ~7.5 KB of cells -> the 16 KB floor wins.
    assert csession.screen_replay_bytes(24, 80) == 16 * 1024
    # A tiny PTY still gets the floor, never a few bytes.
    assert csession.screen_replay_bytes(1, 1) == 16 * 1024


def test_screen_bytes_scales_with_big_screen(csession):
    # A large, potentially colored desktop screen exceeds the floor (200*50*4).
    assert csession.screen_replay_bytes(50, 200) == 50 * 200 * 4


def test_screen_bytes_custom_floor_and_bad_input(csession):
    assert csession.screen_replay_bytes(10, 10, floor=1024) == 1024      # 400 cells < floor
    # Garbage dimensions fall back to 24x80 (then the default 16 KB floor).
    assert csession.screen_replay_bytes(None, "x") == 16 * 1024


def test_truncate_keeps_newest_tail_with_clear(csession):
    pending = b"OLDEST" + b"." * 1000 + b"NEWEST"
    out = csession.truncate_replay(pending, 16)
    assert out.startswith(CLEAR)                      # jumps to a clean screen
    tail = out[len(CLEAR):]
    assert tail == pending[-16:]                      # exactly the newest 16 bytes
    assert tail.endswith(b"NEWEST")                   # newest kept
    assert b"OLDEST" not in out                       # old middle dropped


def test_truncate_short_pending_is_kept_whole(csession):
    # When the remaining tail already fits, nothing is dropped (still cleared).
    pending = b"tiny remainder"
    out = csession.truncate_replay(pending, 16 * 1024)
    assert out == CLEAR + pending


def test_truncate_never_reorders(csession):
    # The kept bytes must be a contiguous suffix of the input (in-order), so xterm
    # can't be corrupted by older bytes arriving after newer ones.
    pending = bytes(range(256)) * 8
    out = csession.truncate_replay(pending, 100)
    assert out == CLEAR + pending[-100:]
