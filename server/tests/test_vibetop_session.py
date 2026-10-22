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


# -- the shifted-punctuation arrival probe ----------------------------------
# It sits on the path EVERY keystroke takes, so the invariant that matters is
# not "does it record" but "can it ever record anything else". A probe added to
# diagnose one report must not become a keylogger.

def test_keyprobe_records_only_the_punctuation_set(csession):
    assert csession.keyprobe_hits(b'?') == '?'
    assert csession.keyprobe_hits(b'why not?!') == '?!'
    assert csession.keyprobe_hits(b'{a}|b') == '{}|'


def test_keyprobe_never_records_what_the_user_typed(csession):
    secret = b'export AWS_SECRET_ACCESS_KEY=hunter2 && ssh user@host'
    hits = csession.keyprobe_hits(secret)
    # The punctuation of the line survives (underscores and ampersands are in the
    # set) but NOT one letter, digit or space of it — so the log can show that a
    # '?' arrived without ever showing what was being typed around it.
    assert hits == '___&&@'
    allowed = set(csession.KEYPROBE_CHARS)   # characters since 2026-09-14, not bytes
    assert set(hits) <= allowed
    assert not any(c.isalnum() or c.isspace() for c in hits)
    assert 'hunter2' not in hits and 'ssh' not in hits


def test_keyprobe_passes_through_control_bytes_and_utf8(csession):
    assert csession.keyprobe_hits(b'\x1b[A\x03\x7f\r\n') == ''
    assert csession.keyprobe_hits('你好'.encode()) == ''
    assert csession.keyprobe_hits(b'') == ''


def test_keyprobe_is_dormant_and_writes_nothing_until_armed(csession, tmp_path, monkeypatch):
    monkeypatch.setenv('HOME', str(tmp_path))
    csession._keyprobe_state.update({'checked': 0.0, 'on': False, 'path': None})
    csession.keyprobe_record(b'???', now=1000.0)
    assert not (tmp_path / '.vibetop-keyprobe.log').exists()

    (tmp_path / '.vibetop-keyprobe').write_text('')      # arm it
    csession._keyprobe_state['checked'] = 0.0            # force the re-check
    csession.keyprobe_record(b'a?b!', now=2000.0)
    line = (tmp_path / '.vibetop-keyprobe.log').read_text()
    assert 'punct=?!' in line and 'chunk=4B' in line
    assert 'a' not in line.split('punct=')[1]            # the payload never leaks


def test_keyprobe_writes_nothing_for_a_chunk_without_punctuation(csession, tmp_path, monkeypatch):
    monkeypatch.setenv('HOME', str(tmp_path))
    (tmp_path / '.vibetop-keyprobe').write_text('')
    csession._keyprobe_state.update({'checked': 0.0, 'on': False, 'path': None})
    csession.keyprobe_record(b'ls -la\r', now=3000.0)
    assert not (tmp_path / '.vibetop-keyprobe.log').exists()

def test_keyprobe_sees_the_fullwidth_punctuation_an_IME_actually_commits(csession):
    # The whole point of the 2026-09-14 widening. A Chinese input method does
    # not send ASCII '?' — it commits U+FF1F, three bytes, which the original
    # byte-wise filter could not match at all. The probe was blind to the one
    # key being reported.
    assert csession.keyprobe_hits('\uff1f'.encode()) == '\uff1f'
    assert csession.keyprobe_hits('\u4f60\u597d\uff1f'.encode()) == '\uff1f'
    assert csession.keyprobe_hits('\u4f60\u597d\uff0c\u4e16\u754c\uff01'.encode()) == '\uff0c\uff01'
    # two presses in one chunk must read as two, so "pressed twice, arrived
    # once" is distinguishable from "arrived twice" in the log
    assert csession.keyprobe_hits('\uff1f\uff1f'.encode()) == '\uff1f\uff1f'


def test_keyprobe_still_drops_every_ideograph_the_user_typed(csession):
    # The privacy invariant survives the widening: the filter is a membership
    # test against a fixed set, so CJK TEXT can never reach the log even though
    # CJK punctuation now can.
    sentence = '\u6211\u7684\u5bc6\u7801\u662fhunter2\u548c\u94f6\u884c\u5361\u53f7\u7801'
    assert csession.keyprobe_hits(sentence.encode()) == ''
    # a mixed line keeps only the marks
    mixed = '\u8f6c\u8d26\u7ed9\u5f20\u4e09\uff1a5000\u5143\uff0c\u5bc6\u7801abc\uff01'
    assert csession.keyprobe_hits(mixed.encode()) == '\uff1a\uff0c\uff01'


def test_keyprobe_survives_a_utf8_sequence_split_across_chunks(csession):
    # The relay writes whatever the socket handed it; a 3-byte character can
    # land in two chunks. Neither half may crash the probe or invent a hit.
    fw = '\uff1f'.encode()
    assert csession.keyprobe_hits(fw[:1]) == ''
    assert csession.keyprobe_hits(fw[1:]) == ''
    assert csession.keyprobe_hits(fw[:2]) == ''
    assert csession.keyprobe_hits(fw[2:]) == ''
    assert csession.keyprobe_hits(b'\xff\xfe') == ''


def test_keyprobe_logs_a_fullwidth_hit_with_its_byte_count(csession, tmp_path, monkeypatch):
    # The byte count is what separates "one keypress, one arrival" from
    # "one keypress, two arrivals" when reading the log after the fact.
    monkeypatch.setenv('HOME', str(tmp_path))
    (tmp_path / '.vibetop-keyprobe').write_text('')
    csession._keyprobe_state.update({'checked': 0.0, 'on': False, 'path': None})
    csession.keyprobe_record('\u4f60\u597d\uff1f'.encode(), now=4000.0)
    line = (tmp_path / '.vibetop-keyprobe.log').read_text()
    assert 'punct=\uff1f' in line
    assert 'chunk=9B' in line          # 3 characters x 3 bytes
    assert '\u4f60' not in line and '\u597d' not in line


def _session_source():
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    return open(os.path.join(repo, "apps", "everyday", "terminal",
                             "vibetop-session")).read()


def test_active_client_size_uses_latest_interaction_not_smallest(csession, tmp_path):
    import os
    import subprocess
    import sys
    other = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
    prefix = str(tmp_path / 'size')
    try:
        (tmp_path / f'size.{os.getpid()}.view').write_text('69 257 100')
        peer = tmp_path / f'size.{other.pid}.view'
        peer.write_text('37 53 0')
        assert csession.active_client_size(prefix) == (69, 257), 'passive phone must not shrink desktop'
        peer.write_text('37 53 200')
        assert csession.active_client_size(prefix) == (37, 53)
        (tmp_path / f'size.{os.getpid()}.view').write_text('69 257 300')
        assert csession.active_client_size(prefix) == (69, 257), 'desktop interaction must reclaim full size'
        peer.write_text('37 53 400')
        other.terminate(); other.wait(timeout=5)
        assert csession.active_client_size(prefix) == (69, 257)
        assert not peer.exists(), 'dead clients cannot retain ownership'
    finally:
        if other.poll() is None:
            other.kill(); other.wait(timeout=5)


@pytest.mark.parametrize('disconnect_signal', ['SIGTERM', 'SIGKILL', 'PTY_CLOSED'])
def test_disconnecting_small_client_restores_remaining_pty_size(tmp_path, disconnect_signal):
    """Run the real daemon and attach processes; text checks missed this bug."""
    import fcntl
    import os
    import pathlib
    import signal
    import struct
    import subprocess
    import sys
    import termios
    import time
    import uuid

    script = pathlib.Path(__file__).resolve().parents[2] / 'apps/everyday/terminal/vibetop-session'
    instance = 'test-size-' + uuid.uuid4().hex
    prefix = pathlib.Path('/tmp') / ('vibetop-session-' + instance)
    env = dict(os.environ, HOME=str(tmp_path), TERM='xterm-256color')
    daemon = subprocess.Popen([sys.executable, str(script), 'serve', instance],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    attachments, masters = [], []

    def eventually(fn):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if fn():
                return
            time.sleep(.025)
        assert fn()

    def attach(rows, cols):
        master, slave = os.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        proc = subprocess.Popen([sys.executable, str(script), 'attach', instance],
                                stdin=slave, stdout=slave, stderr=subprocess.DEVNULL, env=env)
        os.close(slave)
        attachments.append(proc)
        masters.append(master)
        return proc

    try:
        eventually(lambda: pathlib.Path(str(prefix) + '.sock').exists())
        child_file = pathlib.Path(f'/proc/{daemon.pid}/task/{daemon.pid}/children')
        eventually(lambda: bool(child_file.read_text().strip()))
        shell_pid = int(child_file.read_text().split()[0])

        def size_is(rows, cols):
            # Under load the forked child can be observed before it has made
            # the PTY its stdin; that is "not yet", for eventually() to retry.
            try:
                fd = os.open(f'/proc/{shell_pid}/fd/0', os.O_RDONLY | os.O_NOCTTY)
            except OSError:
                return False
            try:
                return struct.unpack('HHHH', fcntl.ioctl(fd, termios.TIOCGWINSZ, b'\0' * 8))[:2] == (rows, cols)
            except OSError:
                return False
            finally:
                os.close(fd)

        desktop = attach(60, 200)
        eventually(lambda: size_is(60, 200))
        phone = attach(37, 53)
        eventually(lambda: pathlib.Path(str(prefix) + f'.size.{phone.pid}.view').exists())
        assert size_is(60, 200), 'a passive connection cannot steal ownership'
        phone.send_signal(signal.SIGWINCH)
        eventually(lambda: size_is(37, 53))
        desktop.send_signal(signal.SIGWINCH)
        eventually(lambda: size_is(60, 200))
        phone.send_signal(signal.SIGWINCH)
        eventually(lambda: size_is(37, 53))
        if disconnect_signal == 'PTY_CLOSED':
            os.close(masters.pop())
        else:
            phone.send_signal(getattr(signal, disconnect_signal))
        phone.wait(timeout=5)
        eventually(lambda: size_is(60, 200))
        assert daemon.poll() is None
        assert pathlib.Path(f'/proc/{shell_pid}').exists(), 'resizing must preserve the running shell'
    finally:
        for proc in attachments:
            if proc.poll() is None:
                proc.kill()
            proc.wait(timeout=5)
        daemon.terminate()
        daemon.wait(timeout=5)
        for fd in masters:
            os.close(fd)
        for path in prefix.parent.glob(prefix.name + '.*'):
            path.unlink(missing_ok=True)


@pytest.mark.parametrize('chunk', [1, 2, 7, 64, 4096])
def test_replay_restores_modes_after_ring_wrap(csession, chunk):
    data = b'\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h' + b'frame\r\n' * 100
    ring = csession.RingBuffer(80)
    for i in range(0, len(data), chunk):
        ring.write(data[i:i + chunk])
    assert ring.read_all() == data[-80:]
    state = csession.ReplayModes()
    state.feed(ring.replay())
    assert all(state.modes[m] for m in (1049, 1003, 1006, 2004))


def test_replay_boundary_inside_escape_sequence(csession):
    for cut in range(1, len(b'\x1b[?1049h')):
        ring = csession.RingBuffer(16)
        prefix = b'\x1b[?1049h'
        data = prefix + b'x' * (16 - len(prefix) + cut)
        ring.write(data)
        state = csession.ReplayModes()
        state.feed(ring.replay())
        assert state.modes[1049]
        assert not state.pending


def test_replay_tracks_exit_reset_and_ignores_opaque_strings(csession):
    ring = csession.RingBuffer(16)
    ring.write(b'\x1b[?1049h\x1b[?1003h\x1b[?1049l\x1b[?1003l' + b'x' * 32)
    state = csession.ReplayModes()
    state.feed(ring.replay())
    assert state.modes[1049] is False
    assert state.modes[1003] is False
    ring.write(b'\x1bc\x1b]0;title \x1b[?1049h\x07' + b'x' * 32)
    state = csession.ReplayModes()
    state.feed(ring.replay())
    assert not state.modes
    ring.clear()
    assert ring.replay() == b''


def test_slow_replay_truncation_preserves_evicted_mode_setters(csession):
    pending = b'\x1b[?1049h\x1b[?1003h' + b'x' * 100
    state = csession.ReplayModes()
    state.feed(csession.truncate_replay(pending, 16))
    assert state.modes[1049] and state.modes[1003]


def test_replay_redraw_restores_size_and_respects_new_owner(csession):
    import os
    import pty
    import tempfile
    master, slave = pty.openpty()
    try:
        csession.set_pty_size(slave, 24, 79)
        lock = tempfile.TemporaryFile()
        csession.finish_replay_redraw((os.dup(slave), os.dup(lock.fileno()), (24, 80), (24, 79)))
        assert csession.get_pty_size(slave) == (24, 80)
        csession.set_pty_size(slave, 40, 120)
        csession.finish_replay_redraw((os.dup(slave), os.dup(lock.fileno()), (24, 80), (24, 79)))
        assert csession.get_pty_size(slave) == (40, 120)
        lock.close()
    finally:
        os.close(master)
        os.close(slave)


def test_replay_parser_bounds_unterminated_escape_data(csession):
    state = csession.ReplayModes()
    state.feed(b'\x1b[?' + b'9' * 100000)
    assert len(state.pending) < 257
    state.feed(b'h\x1b[?1049h')
    assert state.modes == {1049: True}
    state.feed(b'\x1b]0;' + b'x' * 100000)
    assert len(state.pending) <= 4096
    state.feed(b'\x07\x1b[?1049l')
    assert state.modes == {1049: False}


def resume_frames(csession, wire):
    import json
    import base64
    prefix = b'\x1b]777;vt-resume;'
    frames = [json.loads(frame) for frame in wire.split(prefix)[1:]
              for frame in [frame.rstrip(b'\x07')]]
    return frames, b''.join(base64.b64decode(f['data']) for f in frames)


def test_resume_sends_only_missing_output(csession):
    ring = csession.RingBuffer(100)
    ring.write(b'old history')
    offset = ring.offset
    ring.write(b'new output')
    frames, data = resume_frames(csession, ring.resume(ring.epoch, offset))
    assert data == b'new output'
    assert frames[-1]['offset'] == 21
    assert frames[0]['reset'] is False


def test_resume_no_missing_bytes_still_acknowledges_cursor(csession):
    ring = csession.RingBuffer(100)
    ring.write(b'hello')
    frames, data = resume_frames(csession, ring.resume(ring.epoch, ring.offset))
    assert data == b''
    assert frames[-1]['offset'] == 5
    assert not frames[0]['reset']


@pytest.mark.parametrize('offset', [-1, 999, None, True, '3'])
def test_resume_invalid_cursor_falls_back(csession, offset):
    ring = csession.RingBuffer(100)
    ring.write(b'hello')
    frames, data = resume_frames(csession, ring.resume(ring.epoch, offset))
    assert data == b'hello'
    assert frames[0]['reset']


def test_resume_expired_cursor_and_reset_epoch_fall_back(csession):
    ring = csession.RingBuffer(5)
    ring.write(b'old history')
    frames, data = resume_frames(csession, ring.resume(ring.epoch, 2))
    assert data == b'story'
    assert frames[0]['reset']
    old_epoch = ring.epoch
    ring.clear()
    ring.write(b'new')
    frames, data = resume_frames(csession, ring.resume(old_epoch, 2))
    assert data == b'new'
    assert frames[0]['reset']
    assert ring.epoch != old_epoch


def test_resume_wrapped_ring_can_continue_at_oldest_retained_byte(csession):
    ring = csession.RingBuffer(5)
    ring.write(b'0123456789')
    frames, data = resume_frames(csession, ring.resume(ring.epoch, 5))
    assert data == b'56789'
    assert not frames[0]['reset']


def test_resume_chunks_only_acknowledge_complete_replay(csession):
    ring = csession.RingBuffer(40000)
    ring.write(b'x' * 35000)
    frames, data = resume_frames(csession, ring.resume(None, None))
    assert data == b'x' * 35000
    assert len(frames) == 3
    assert [f['offset'] for f in frames] == [None, None, 35000]
    assert [f['reset'] for f in frames] == [True, False, False]


def test_resume_query_filter_keeps_raw_byte_cursor(csession):
    ring = csession.RingBuffer(100)
    ring.write(b'ok\x1b[6nnext')
    frames, data = resume_frames(csession, ring.resume(None, None))
    assert data == b'oknext'
    assert frames[-1]['offset'] == len(b'ok\x1b[6nnext')


def test_resume_framing_preserves_full_screen_redraw_detection(csession):
    ring = csession.RingBuffer(100)
    ring.write(b'\x1b[?1049hhello')
    wire = ring.resume(None, None)
    parser = csession.ResumeReplayParser()
    modes = csession.ReplayModes()
    for byte in wire:
        modes.feed(parser.feed(bytes([byte])))
    assert modes.modes[1049]


def test_resume_parser_recovers_after_adaptive_queue_truncation(csession):
    parser = csession.ResumeReplayParser()
    assert parser.feed(b'\x1b]777;vt-resume;{"data":"incomplete') == b''
    frame = csession.resume_frame('epoch', 10000, b'\x1b[?1049hlatest', True)
    assert parser.feed(frame) == b'\x1b[?1049hlatest'


# -- client mouse reports with NaN coordinates ("aN;NaNM") -----------------

@pytest.mark.parametrize("seq", [
    ESC + b"[<35;NaN;NaNM", ESC + b"[<0;NaN;NaNm", ESC + b"[<0;12;NaNM",
    ESC + b"[<32;-Infinity;5M", ESC + b"[67;NaN;NaNM", ESC + b"[<35;undefined;undefinedM",
])
def test_bad_mouse_reports_are_dropped(csession, seq):
    assert csession.strip_bad_mouse_reports(seq) == b""
    assert csession.strip_bad_mouse_reports(b"a" + seq + b"b") == b"ab"


@pytest.mark.parametrize("data", [
    ESC + b"[<35;12;40M", ESC + b"[<0;1;1m", ESC + b"[A", ESC, b"NaN;NaNM typed",
    "NaN 你好".encode(), ESC + b"[200~NaN M" + ESC + b"[201~", b"\x03\r",
])
def test_good_input_passes_untouched(csession, data):
    assert csession.strip_bad_mouse_reports(data) == data
