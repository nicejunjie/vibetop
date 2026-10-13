/* Use ordinary HTTPS when a terminal WebSocket cannot establish a connection.
 * The existing ttyd client still owns terminal rendering, resizing and input.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(window);
})(function (w) {
  'use strict';
  var Native = w.WebSocket;
  if (!Native || !w.fetch || !w.EventTarget) return;
  var preference = 'vt-terminal-http-until';
  function preferHTTP() {
    try { return +w.sessionStorage.getItem(preference) > Date.now(); } catch (_) { return false; }
  }
  function rememberHTTP() {
    try { w.sessionStorage.setItem(preference, String(Date.now() + 10 * 60 * 1000)); } catch (_) {}
  }
  function base64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return w.btoa(s);
  }
  class HTTPWebSocket extends w.EventTarget {
    constructor(url, protocols) {
      super();
      this.url = String(url); this.protocol = ''; this.extensions = '';
      this.binaryType = 'blob'; this.bufferedAmount = 0;
      this._state = 0; this._http = false; this._seq = 0; this._after = 0;
      this._sending = false; this._queue = []; this._controllers = new Set();
      this._number = +new w.URL(url, w.location.href).pathname.match(/^\/t(\d+)\/ws$/)[1];
      var random = new Uint8Array(16); w.crypto.getRandomValues(random);
      this._id = Array.from(random, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      var self = this;
      this._pagehide = function () { self.close(); };
      w.addEventListener('pagehide', this._pagehide);
      if (preferHTTP()) { w.setTimeout(function () { self._fallback(); }, 0); return; }
      this._native = protocols === undefined ? new Native(url) : new Native(url, protocols);
      this._native.binaryType = 'arraybuffer';
      this._timer = w.setTimeout(function () { if (self._state === 0) self._fallback(); }, 8000);
      this._native.addEventListener('open', function () {
        if (self._http || self._state !== 0) return;
        w.clearTimeout(self._timer); self._state = 1;
        self.protocol = self._native.protocol; self.extensions = self._native.extensions;
        self._emit('open', new w.Event('open'));
      });
      this._native.addEventListener('message', function (event) {
        if (self._http || self._state !== 1) return;
        var data = event.data;
        if (self.binaryType !== 'arraybuffer' && data instanceof w.ArrayBuffer) data = new w.Blob([data]);
        self._emit('message', new w.MessageEvent('message', {data: data}));
      });
      this._native.addEventListener('error', function () {
        if (self._http || self._state === 3) return;
        if (self._state === 0) self._fallback();
        else self._emit('error', new w.Event('error'));
      });
      this._native.addEventListener('close', function (event) {
        if (self._http || self._state === 3) return;
        if (self._state === 0) self._fallback();
        else self._finish(event.code, event.reason, event.wasClean);
      });
    }
    get readyState() { return this._state; }
    _emit(type, event) { this.dispatchEvent(event); }
    async _request(data, retries, consume) {
      data.id = this._id;
      for (var attempt = 0; ; attempt++) {
        if (this._state === 3) throw new Error('closed');
        var controller = new w.AbortController(), self = this;
        this._controllers.add(controller);
        var timer = w.setTimeout(function () { controller.abort(); }, 15000);
        try {
          var response = await w.fetch('/api/terminal-transport', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: controller.signal
          });
          if (!response.ok) {
            var failure = new Error('terminal transport ' + response.status);
            failure.permanent = response.status >= 400 && response.status < 500;
            throw failure;
          }
          return consume ? await consume(response) : await response.json();
        } catch (error) {
          if (error.permanent || attempt >= retries || this._state === 3) throw error;
          await new Promise(function (resolve) { w.setTimeout(resolve, 500 * (attempt + 1)); });
        } finally {
          w.clearTimeout(timer); self._controllers.delete(controller);
        }
      }
    }
    async _fallback() {
      if (this._http || this._state !== 0) return;
      this._http = true; rememberHTTP(); w.clearTimeout(this._timer);
      if (this._native) this._native.close();
      try {
        var opened = await this._request({op: 'open', terminal: this._number}, 1);
        this._streaming = !!opened.streaming;
        if (this._state === 3) return;
        this._state = 1; this.protocol = 'tty';
        this._emit('open', new w.Event('open'));
        // Timing/transport only: never record terminal output or input.
        w.fetch('/api/clientlog', {method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ua: w.navigator.userAgent, guard: [{k: 'terminal-transport',
            event: 'https-fallback-open', path: '/t' + this._number + '/'}]})}).catch(function () {});
        this._poll();
      } catch (_) { this._fail(); }
    }
    async _poll() {
      try {
        while (this._state === 1) {
          if (this._streaming) {
            var self = this;
            try { await this._request({op: 'stream', after: this._after}, 0, async function (response) {
              var reader = response.body.getReader(), decoder = new w.TextDecoder(), pending = '';
              try {
                while (self._state === 1) {
                  var chunk = await reader.read();
                  if (chunk.done) break;
                  self._streamFailures = 0;
                  pending += decoder.decode(chunk.value, {stream: true});
                  var newline;
                  while ((newline = pending.indexOf('\n')) >= 0) {
                    self._deliver(JSON.parse(pending.slice(0, newline)));
                    pending = pending.slice(newline + 1);
                  }
                }
              } finally { await reader.cancel().catch(function () {}); }
            }); } catch (error) {
              if (error.permanent || this._state === 3 || (this._streamFailures = (this._streamFailures || 0) + 1) > 2) throw error;
              await new Promise(function (resolve) { w.setTimeout(resolve, 500); });
            }
            continue;
          }
          var response = await this._request({op: 'poll', after: this._after}, 2);
          if (this._state !== 1) return;
          this._deliver(response);
        }
      } catch (_) { this._fail(); }
    }
    _deliver(response) {
      if (this._state !== 1) return;
      for (var frame of response.frames) {
        if (frame.seq <= this._after) continue;
        var bytes = Uint8Array.from(w.atob(frame.data), function (c) { return c.charCodeAt(0); });
        var data = frame.binary ? (this.binaryType === 'arraybuffer' ? bytes.buffer : new w.Blob([bytes])) : new w.TextDecoder().decode(bytes);
        this._emit('message', new w.MessageEvent('message', {data: data}));
        this._after = frame.seq;
      }
      if (response.closed) { this._finish(1000, '', true); return; }
      if (this._streaming && (response.frames.length || response.ack) && !this._ackPending) {
        this._ackPending = true;
        var self = this;
        this._ackTimer = w.setTimeout(async function () {
          var after = self._after;
          try { await self._request({op: 'ack', after: after}, 2); }
          catch (_) { if (self._state !== 3) self._fail(); }
          finally {
            self._ackPending = false;
            if (self._after > after) self._deliver({frames: [], closed: false, ack: true});
          }
        }, 500);
      }
    }
    send(data) {
      if (this._state === 0) throw new w.DOMException('WebSocket is connecting', 'InvalidStateError');
      if (this._state !== 1) return;
      if (!this._http) { this._native.send(data); return; }
      var bytes = typeof data === 'string' ? new w.TextEncoder().encode(data) :
        data instanceof w.ArrayBuffer ? new Uint8Array(data) :
        ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (!bytes) throw new TypeError('unsupported terminal frame');
      if (bytes.length > 256 * 1024 || this.bufferedAmount + bytes.length > 1024 * 1024) { this._fail(); return; }
      this._queue.push({bytes: bytes.slice(), binary: typeof data !== 'string', size: bytes.length});
      this.bufferedAmount += bytes.length;
      this._flush();
    }
    async _flush() {
      if (this._sending) return;
      this._sending = true;
      try {
        while (this._queue.length && this._state === 1) {
          var first = this._queue.shift(), parts = [first.bytes], size = first.size;
          // Only ttyd input ('0') can be concatenated. Keep resize, auth and
          // flow-control frames in their original order and protocol boundaries.
          if (first.bytes[0] === 48) {
            while (this._queue.length) {
              var next = this._queue[0];
              if (next.binary !== first.binary || next.bytes[0] !== 48 || size + next.size > 256 * 1024) break;
              this._queue.shift(); parts.push(next.bytes.subarray(1)); size += next.size;
            }
          }
          var length = parts.reduce(function (n, p) { return n + p.length; }, 0);
          var joined = new Uint8Array(length), offset = 0;
          parts.forEach(function (p) { joined.set(p, offset); offset += p.length; });
          var item = {op: 'send', seq: ++this._seq, binary: first.binary, data: base64(joined)};
          await this._request(item, 2);
          if (this._state !== 1) return;
          this.bufferedAmount -= size;
        }
      } catch (_) { this._fail(); }
      finally { this._sending = false; }
    }
    _fail() {
      if (this._state === 3) return;
      this._emit('error', new w.Event('error'));
      this.close(1006);
    }
    _finish(code, reason, clean) {
      if (this._state === 3) return;
      this._state = 3; w.clearTimeout(this._timer); w.clearTimeout(this._ackTimer);
      w.removeEventListener('pagehide', this._pagehide);
      this._controllers.forEach(function (c) { c.abort(); });
      this._controllers.clear(); this._queue = []; this.bufferedAmount = 0;
      this._emit('close', new w.CloseEvent('close', {code: code, reason: reason || '', wasClean: !!clean}));
    }
    close(code, reason) {
      if (this._state === 3) return;
      if (this._http) {
        w.fetch('/api/terminal-transport', {method: 'POST', credentials: 'same-origin', keepalive: true,
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'close', id: this._id})}).catch(function () {});
      } else if (this._native) this._native.close();
      this._finish(code || 1000, reason, code !== 1006);
    }
  }
  // Event-handler properties must participate in dispatch order and respect
  // stopImmediatePropagation (the incremental replay adapter relies on this).
  ['open', 'message', 'error', 'close'].forEach(function (type) {
    Object.defineProperty(HTTPWebSocket.prototype, 'on' + type, {
      get: function () { return this['_on' + type] || null; },
      set: function (fn) {
        var old = this['_on' + type]; if (old) this.removeEventListener(type, old);
        this['_on' + type] = typeof fn === 'function' ? fn : null;
        if (this['_on' + type]) this.addEventListener(type, fn);
      }
    });
  });
  function WS(url, protocols) {
    var parsed = new w.URL(url, w.location.href);
    var tty = protocols === 'tty' || Array.isArray(protocols) && protocols.length === 1 && protocols[0] === 'tty';
    if (parsed.host !== w.location.host || !/^\/t\d+\/ws$/.test(parsed.pathname) || !tty)
      return protocols === undefined ? new Native(url) : new Native(url, protocols);
    return new HTTPWebSocket(url, protocols);
  }
  WS.prototype = HTTPWebSocket.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) {
    WS[k] = i; HTTPWebSocket.prototype[k] = i;
  });
  w.WebSocket = WS;
});
