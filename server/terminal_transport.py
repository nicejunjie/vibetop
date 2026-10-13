"""Bounded, authenticated HTTP fallback for ttyd's binary WebSocket protocol.

Only the manager chooses a loopback ttyd port from the authenticated user's
allocation. No URL, command, filesystem path, or port comes from the browser.
"""
import base64
import collections
import hashlib
import os
import socket
import struct
import threading
import time

MAX_FRAME = 256 * 1024
MAX_BUFFER = 2 * 1024 * 1024
IDLE_SECONDS = 90


class TransportError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


class Relay:
    def __init__(self, port, number):
        self.cv = threading.Condition()
        self.write_lock = threading.Lock()
        self.frames = collections.deque()
        self.size = self.sequence = self.acked = self.input_sequence = 0
        self.closed = False
        self.touched = time.monotonic()
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=5)
        self.reader = self.sock.makefile('rb')
        try:
            key = base64.b64encode(os.urandom(16)).decode()
            self.sock.sendall((f'GET /t{number}/ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n'
                               'Upgrade: websocket\r\nConnection: Upgrade\r\n'
                               f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n'
                               'Sec-WebSocket-Protocol: tty\r\n\r\n').encode())
            status = self.reader.readline(4096)
            headers, count = {}, len(status)
            while True:
                line = self.reader.readline(4096)
                count += len(line)
                if count > 16384 or not line:
                    raise OSError('invalid ttyd upgrade response')
                if line == b'\r\n':
                    break
                k, v = line.decode('ascii').split(':', 1)
                headers[k.lower()] = v.strip()
            expected = base64.b64encode(hashlib.sha1(
                (key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            if status.split()[1:2] != [b'101'] or headers.get('sec-websocket-accept') != expected:
                raise OSError('ttyd upgrade rejected')
            self.sock.settimeout(None)
        except Exception:
            self.reader.close()
            self.sock.close()
            raise
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _read(self, n):
        data = self.reader.read(n)
        if len(data) != n:
            raise EOFError
        return data

    def _send(self, opcode, data):
        # Caller owns write_lock. All client frames must be masked.
        mask = os.urandom(4)
        n = len(data)
        header = bytes([128 | opcode, 128 | n]) if n < 126 else bytes([128 | opcode, 254]) + struct.pack('!H', n) if n < 65536 else bytes([128 | opcode, 255]) + struct.pack('!Q', n)
        self.sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read_loop(self):
        fragmented, opcode = bytearray(), None
        try:
            while not self.closed:
                a, b = self._read(2)
                n = b & 127
                if n == 126:
                    n = struct.unpack('!H', self._read(2))[0]
                elif n == 127:
                    n = struct.unpack('!Q', self._read(8))[0]
                if a & 112 or b & 128 or n > MAX_FRAME:
                    raise ValueError('invalid upstream frame')
                kind, final = a & 15, bool(a & 128)
                data = self._read(n)
                if kind >= 8:
                    if not final or n > 125:
                        raise ValueError('invalid control frame')
                    if kind == 8:
                        break
                    if kind == 9:
                        with self.write_lock:
                            self._send(10, data)
                    elif kind != 10:
                        raise ValueError('invalid control opcode')
                    continue
                if kind in (1, 2) and opcode is None:
                    opcode = kind
                elif kind != 0 or opcode is None:
                    raise ValueError('invalid fragment')
                fragmented.extend(data)
                if len(fragmented) > MAX_FRAME:
                    raise ValueError('upstream message too large')
                if not final:
                    continue
                payload = bytes(fragmented)
                with self.cv:
                    # Backpressure on ttyd instead of growing memory on slow links.
                    while self.size + len(payload) > MAX_BUFFER and not self.closed:
                        self.cv.wait(1)
                    if self.closed:
                        break
                    self.sequence += 1
                    self.frames.append((self.sequence, opcode, payload))
                    self.size += len(payload)
                    self.cv.notify_all()
                fragmented.clear()
                opcode = None
        except (OSError, EOFError, ValueError):
            pass
        finally:
            self.close()
            self.reader.close()

    def poll(self, after, wait=8, *, acknowledge=True):
        with self.cv:
            if type(after) is not int or not self.acked <= after <= self.sequence:
                raise TransportError(409, 'invalid output acknowledgement')
            self.touched = time.monotonic()
            if acknowledge:
                self.acked = after
                while self.frames and self.frames[0][0] <= after:
                    self.size -= len(self.frames.popleft()[2])
            self.cv.notify_all()
            if self.sequence <= after and not self.closed:
                self.cv.wait_for(lambda: self.sequence > after or self.closed, timeout=wait)
            batch, size = [], 0
            for seq, opcode, data in self.frames:
                if seq <= after:
                    continue
                batch.append({'seq': seq, 'binary': opcode == 2,
                              'data': base64.b64encode(data).decode()})
                size += len(data)
                if size >= MAX_FRAME or len(batch) >= 128:
                    break
            # A lost response can be retried with the same cursor. Retain until ACK.
            return {'frames': batch, 'closed': self.closed and (batch[-1]['seq'] if batch else after) == self.sequence}

    def send(self, sequence, opcode, data):
        with self.write_lock:
            self.touched = time.monotonic()
            if type(sequence) is not int or sequence < 1:
                raise TransportError(400, 'invalid input sequence')
            if sequence <= self.input_sequence:
                return  # Lost HTTP response: never type the same input twice.
            if sequence != self.input_sequence + 1:
                raise TransportError(409, 'input sequence gap')
            if self.closed:
                raise TransportError(410, 'terminal connection closed')
            try:
                self._send(opcode, data)
                self.input_sequence = sequence
            except OSError:
                # Ambiguous partial write: close this relay; never resend to ttyd.
                self.close()
                raise TransportError(410, 'terminal connection closed')

    def close(self):
        with self.cv:
            self.closed = True
            self.cv.notify_all()
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.sock.close()


def stream_output(handler, relay, after):
    """Stream retained frames; only explicit client ACKs release their memory."""
    import json
    first = relay.poll(after, wait=0)
    handler.send_response(200)
    handler.send_header('Content-Type', 'application/x-ndjson')
    handler.send_header('Cache-Control', 'no-store, no-transform')
    handler.send_header('X-Accel-Buffering', 'no')
    handler.send_header('Connection', 'close')
    handler.end_headers()
    handler.close_connection = True
    deadline = time.monotonic() + 10
    result = first
    try:
        while True:
            handler.wfile.write((json.dumps(result, separators=(',', ':')) + '\n').encode())
            handler.wfile.flush()
            if result['frames']:
                after = result['frames'][-1]['seq']
            remaining = deadline - time.monotonic()
            if result['closed'] or remaining <= 0:
                return
            result = relay.poll(after, wait=min(8, remaining), acknowledge=False)
    except (OSError, TransportError):
        # Client retries from its last received cursor; retain unacknowledged data.
        return


class Registry:
    def __init__(self):
        self.lock = threading.Lock()
        self.relays = {}
        self.reaper_started = False

    def open(self, user, ident, port, number):
        key = (user, ident)
        with self.lock:
            if key in self.relays:
                old_number, relay = self.relays[key]
                if old_number != number:
                    raise TransportError(409, 'connection id already in use')
                relay.touched = time.monotonic()
                return relay
            if len(self.relays) >= 128 or sum(k[0] == user for k in self.relays) >= 16:
                raise TransportError(429, 'too many terminal fallback connections')
            relay = Relay(port, number)
            self.relays[key] = (number, relay)
            if not self.reaper_started:
                self.reaper_started = True
                threading.Thread(target=self._reap, daemon=True).start()
            return relay

    def get(self, user, ident):
        with self.lock:
            item = self.relays.get((user, ident))
            if not item:
                raise TransportError(404, 'terminal connection expired')
            return item[1]

    def _reap(self):
        while True:
            time.sleep(15)
            with self.lock:
                expired = [k for k, (_, r) in self.relays.items()
                           if time.monotonic() - r.touched > IDLE_SECONDS]
                for key in expired:
                    self.relays.pop(key)[1].close()


registry = Registry()


def handle(handler, max_instance):
    """All operations are POST, behind the manager's auth and CSRF gates."""
    user = handler._session_user()
    if not user:
        return handler._json(401, {'error': 'not signed in'})
    import json
    import re
    try:
        body = handler._read_body(400000)
        if body is None:
            raise TransportError(400, 'invalid body')
        data = json.loads(body)
        if not isinstance(data, dict):
            raise TransportError(400, 'invalid request')
        ident = data.get('id')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-zA-Z0-9-]{20,80}', ident):
            raise TransportError(400, 'invalid connection id')
        op = data.get('op')
        if op == 'open':
            number = data.get('terminal')
            if type(number) is not int or not 1 <= number <= max_instance:
                raise TransportError(400, 'invalid terminal')
            port = handler._ensure_user_terminal(user, number)
            registry.open(user, ident, port, number)
            result = {'ok': True, 'streaming': True}
        else:
            relay = registry.get(user, ident)
            if op == 'stream':
                return stream_output(handler, relay, data.get('after'))
            elif op == 'ack':
                after = data.get('after')
                with relay.cv:
                    if type(after) is not int or not 0 <= after <= relay.sequence:
                        raise TransportError(409, 'invalid output acknowledgement')
                    relay.poll(max(after, relay.acked), wait=0)
                result = {'ok': True}
            elif op == 'poll':
                result = relay.poll(data.get('after'))
            elif op == 'send':
                if type(data.get('binary')) is not bool or not isinstance(data.get('data'), str):
                    raise TransportError(400, 'invalid frame')
                payload = base64.b64decode(data['data'], validate=True)
                if len(payload) > MAX_FRAME:
                    raise TransportError(400, 'frame too large')
                relay.send(data.get('seq'), 2 if data['binary'] else 1, payload)
                result = {'ok': True}
            elif op == 'close':
                relay.close()
                result = {'ok': True}
            else:
                raise TransportError(400, 'invalid operation')
        return handler._json(200, result)
    except TransportError as error:
        return handler._json(error.status, {'error': str(error)})
    except (ValueError, TypeError):
        return handler._json(400, {'error': 'invalid request'})
    except OSError:
        return handler._json(502, {'error': 'terminal backend unavailable'})
