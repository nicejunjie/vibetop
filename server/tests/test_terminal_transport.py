import base64
import hashlib
import socket
import struct
import threading
import time

import pytest
import terminal_transport as transport
from conftest import ANON


@pytest.fixture
def upstream():
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    listener.listen()
    peers, received, ready = [], [], threading.Event()

    def serve():
        conn, _ = listener.accept()
        peers.append(conn)
        reader = conn.makefile('rb')
        headers = {}
        reader.readline()
        while (line := reader.readline()) != b'\r\n':
            k, v = line.decode().split(':', 1)
            headers[k.lower()] = v.strip()
        accept = base64.b64encode(hashlib.sha1((headers['sec-websocket-key'] +
                    '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        conn.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
                      'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n').encode())
        ready.set()
        try:
            while data := reader.read(2):
                a, b = data
                assert b & 128  # client frames are masked
                n = b & 127
                if n == 126:
                    n = struct.unpack('!H', reader.read(2))[0]
                elif n == 127:
                    n = struct.unpack('!Q', reader.read(8))[0]
                mask = reader.read(4)
                payload = reader.read(n)
                received.append((a & 15, bytes(c ^ mask[i % 4] for i, c in enumerate(payload))))
        except OSError:
            pass
        finally:
            reader.close()
    threading.Thread(target=serve, daemon=True).start()
    yield listener.getsockname()[1], peers, received, ready
    for peer in peers:
        peer.close()
    listener.close()


def test_output_retry_ack_fragmentation_and_ping(upstream):
    port, peers, received, ready = upstream
    relay = transport.Relay(port, 1)
    try:
        assert ready.wait(1)
        peers[0].sendall(b'\x02\x03abc\x89\x01?\x80\x03def')
        one = relay.poll(0, wait=1)
        assert one['frames'] == [{'seq': 1, 'binary': True, 'data': 'YWJjZGVm'}]
        assert relay.poll(0, wait=0) == one  # response lost: full replay
        assert relay.poll(1, wait=0)['frames'] == []  # ACK releases memory
        assert relay.size == 0
        for _ in range(100):
            if received:
                break
            time.sleep(.01)
        assert received == [(10, b'?')]
    finally:
        relay.close()


def test_input_lost_response_never_duplicates(upstream):
    port, _, received, _ = upstream
    relay = transport.Relay(port, 1)
    try:
        relay.send(1, 2, b'0echo test\r')
        relay.send(1, 2, b'0echo test\r')
        with pytest.raises(transport.TransportError, match='gap'):
            relay.send(3, 2, b'0bad')
        relay.send(2, 1, b'1{"cols":80,"rows":24}')
        for _ in range(100):
            if len(received) >= 2:
                break
            time.sleep(.01)
        assert received == [(2, b'0echo test\r'), (1, b'1{"cols":80,"rows":24}')]
    finally:
        relay.close()


def test_route_requires_session_and_same_origin(client):
    body = {'op': 'open', 'id': 'a' * 32, 'terminal': 1}
    assert client.post('/api/terminal-transport', body, cookie=ANON)[0] == 401
    assert client.post('/api/terminal-transport', body, origin='https://evil.example')[0] == 403


def test_route_uses_authenticated_users_port_and_isolates_ids(client, mgr, monkeypatch):
    registry = transport.Registry()
    monkeypatch.setattr(transport, 'registry', registry)
    calls = []
    class FakeRelay:
        def __init__(self, port, number):
            calls.append((port, number))
            self.touched = time.monotonic()
        def poll(self, after):
            return {'frames': [], 'closed': False}
    monkeypatch.setattr(transport, 'Relay', FakeRelay)
    monkeypatch.setattr(mgr.Handler, '_ensure_user_terminal', lambda self, u, n: calls.append((u, n)) or 17001)
    body = {'op': 'open', 'id': 'a' * 32, 'terminal': 1, 'port': 22, 'url': 'http://evil'}
    assert client.post('/api/terminal-transport', body)[0] == 200
    assert calls == [(mgr.APP_USER, 1), (17001, 1)]
    assert client.post('/api/terminal-transport', body)[0] == 200  # same id, no second attach
    other = 'vt_session=' + mgr._sign_session('other')
    poll = {'op': 'poll', 'id': body['id'], 'after': 0}
    assert client.post('/api/terminal-transport', poll, cookie=other)[0] == 404
    assert client.post('/api/terminal-transport', poll)[0] == 200
    body['terminal'] = 0
    assert client.post('/api/terminal-transport', body)[0] == 400
    assert client.post('/api/terminal-transport', [1])[0] == 400


def test_stream_cursor_does_not_ack_undelivered_output(upstream):
    port, peers, _, ready = upstream
    relay = transport.Relay(port, 1)
    try:
        assert ready.wait(1)
        peers[0].sendall(b'\x82\x03one')
        first = relay.poll(0, wait=1, acknowledge=False)
        assert first['frames'][0]['seq'] == 1
        assert relay.poll(1, wait=0, acknowledge=False)['frames'] == []
        assert relay.acked == 0 and relay.size == 3
        # Stream was written, but response never reached client: replay survives.
        assert relay.poll(0, wait=0) == first
        relay.poll(1, wait=0)
        assert relay.size == 0
    finally:
        relay.close()


def test_route_send_frames_applies_resize_pair_once_in_order(client, mgr, monkeypatch):
    # The claim nudge (cols-1, cols) must reach ttyd back-to-back: split across two
    # HTTP round-trips the PTY really resizes twice and full-screen TUIs flash.
    registry = transport.Registry()
    monkeypatch.setattr(transport, 'registry', registry)
    sent = []
    class FakeRelay:
        def __init__(self, port, number):
            self.touched = time.monotonic()
            self.input_sequence = 0
        def send(self, seq, opcode, data):
            if seq <= self.input_sequence:
                return
            self.input_sequence = seq
            sent.append((seq, opcode, data))
    monkeypatch.setattr(transport, 'Relay', FakeRelay)
    monkeypatch.setattr(mgr.Handler, '_ensure_user_terminal', lambda self, u, n: 17001)
    ident = 'b' * 32
    assert client.post('/api/terminal-transport', {'op': 'open', 'id': ident, 'terminal': 1})[0] == 200
    enc = lambda s: base64.b64encode(s).decode()
    pair = {'op': 'send', 'id': ident, 'seq': 1, 'frames': [
        {'binary': True, 'data': enc(b'1{"columns":79,"rows":24}')},
        {'binary': True, 'data': enc(b'1{"columns":80,"rows":24}')}]}
    assert client.post('/api/terminal-transport', pair)[0] == 200
    assert client.post('/api/terminal-transport', pair)[0] == 200  # lost-response retry
    assert sent == [(1, 2, b'1{"columns":79,"rows":24}'), (2, 2, b'1{"columns":80,"rows":24}')]
    single = {'op': 'send', 'id': ident, 'seq': 3, 'binary': True, 'data': enc(b'0x')}
    assert client.post('/api/terminal-transport', single)[0] == 200
    assert sent[-1] == (3, 2, b'0x')
    for bad in ([], 'x', [{'binary': 1, 'data': ''}], [{}] * 17):
        assert client.post('/api/terminal-transport', dict(pair, seq=4, frames=bad))[0] == 400
