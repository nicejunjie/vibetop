/* Resume scrollback by session epoch + byte offset. Private OSC envelopes are
 * removed before ttyd/xterm sees them; control requests never enter the shell.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(window);
})(function (w) {
  'use strict';
  var PREFIX = '\x1b]777;vt-resume;', LIMIT = 64 * 1024 * 1024;
  var currentSocket = null;
  var cache = null, db = null, key = null, saveTimer = null, cacheLoaded = false, prune = true;
  function bytes(s) { return Uint8Array.from(s, function (c) { return c.charCodeAt(0); }); }
  function text(b) {
    var parts = [];
    for (var i = 0; i < b.length; i += 8192) parts.push(String.fromCharCode.apply(null, b.subarray(i, i + 8192)));
    return parts.join('');
  }
  function valid(c) {
    return c && typeof c.epoch === 'string' && Number.isSafeInteger(c.offset) && c.offset >= 0 &&
      Array.isArray(c.chunks) && c.size >= 0 && c.size <= LIMIT &&
      c.chunks.every(function (s) { return typeof s === 'string'; });
  }
  var loaded = Promise.resolve().then(function () {
    return w.fetch('/api/me', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; });
  }).then(function (me) {
    if (!me || !me.user || !w.indexedDB) return;
    key = me.user + ':' + w.location.pathname;
    return new Promise(function (resolve) {
      var request = w.indexedDB.open('vt-terminal-output-v1', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('output'); };
      request.onerror = function () { resolve(); };
      request.onsuccess = function () {
        db = request.result;
        var read = db.transaction('output').objectStore('output').get(key);
        read.onsuccess = function () { if (!cacheLoaded && valid(read.result)) cache = read.result; resolve(); };
        read.onerror = function () { resolve(); };
      };
    });
  }).catch(function () {});
  loaded = Promise.race([loaded, new Promise(function (resolve) { w.setTimeout(resolve, 2000); })])
    .then(function () { cacheLoaded = true; });
  function save() {
    saveTimer = null;
    if (!db || !key) return;
    try {
      var store = db.transaction('output', 'readwrite').objectStore('output');
      if (valid(cache)) {
        cache.savedAt = Date.now();
        store.put(cache, key);
      } else store.delete(key);
      if (prune) {
        prune = false;
        var entries = [], cursor = store.openCursor();
        cursor.onsuccess = function () {
          var row = cursor.result;
          if (row) {
            entries.push({ key: row.key, size: row.value.size || 0, at: row.value.savedAt || 0 });
            row.continue();
            return;
          }
          entries.sort(function (a, b) { return b.at - a.at; });
          var total = 0;
          entries.forEach(function (entry, i) {
            total += entry.size;
            if (i >= 8 || total > 128 * 1024 * 1024) store.delete(entry.key);
          });
        };
      }
    } catch (_) {} // Quota/private-mode failures leave full replay available.
  }
  function changed() { if (!saveTimer) saveTimer = w.setTimeout(save, 2000); }
  function remember(frame) {
    if (frame.reset) { prune = true; cache = { epoch: frame.epoch, offset: null, chunks: [], size: 0 }; }
    if (!cache || cache.epoch !== frame.epoch) return;
    var chunk = w.atob(frame.data);
    cache.size += chunk.length;
    if (cache.size > LIMIT) { cache = null; changed(); return; }
    if (chunk.length) cache.chunks.push(frame.data);
    var checkpoint = cache.offset === null && Number.isSafeInteger(frame.offset);
    cache.offset = frame.offset;
    if (checkpoint) {
      if (saveTimer) w.clearTimeout(saveTimer);
      save();                               // commit the first complete replay promptly
    } else changed();
  }
  function restored() {
    return cache ? cache.chunks.map(function (s) { return w.atob(s); }).join('').replace(
      /\x1b\[[0-9;?>=]*c|\x1b\[[0-9;?]*n|\x1b\[[0-9;?]*\$p|\x1b\][0-9;]*\?(?:\x07|\x1b\\)/g, '') : '';
  }
  var Native = w.WebSocket;
  if (!Native) return;
  function WS(url, protocols) {
    var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    currentSocket = ws;
    var pending = '', queue = Promise.resolve(), forwarded = false, first = true, negotiated = false;
    var rawSend = ws.send.bind(ws), inputs = [], inputBytes = 0, inputReady = false;
    ws.send = function (data) {
      var b = typeof data === 'string' ? null :
        data instanceof w.ArrayBuffer ? new Uint8Array(data) :
        ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      var input = typeof data === 'string' ? data[0] === '0' : b && b[0] === 48;
      if (input && !inputReady) {
        inputBytes += typeof data === 'string' ? data.length : b.length;
        if (inputBytes > 65536) { inputs = []; ws.close(); return; }
        inputs.push(data);
        return;
      }
      rawSend(data);
    };
    function allowInput() {
      inputReady = true;
      inputs.forEach(function (data) { rawSend(data); });
      inputs = [];
    }
    function output(s) {
      if (!s) return;
      var payload = bytes('0' + s);
      forwarded = true;
      try { ws.dispatchEvent(new w.MessageEvent('message', { data: payload.buffer })); }
      finally { forwarded = false; }
    }
    async function receive(data) {
      if (ws !== currentSocket) return;
      pending += data;
      while (pending) {
        var start = pending.indexOf(PREFIX);
        if (start < 0) {
          // Preserve a marker split across WebSocket packets.
          var keep = 0;
          for (var n = 1; n < PREFIX.length && n <= pending.length; n++) {
            if (pending.slice(-n) === PREFIX.slice(0, n)) keep = n;
          }
          var plain = pending.slice(0, pending.length - keep);
          if (plain && !negotiated) allowInput();
          output(plain);
          pending = keep ? pending.slice(-keep) : '';
          return;
        }
        if (start) { output(pending.slice(0, start)); pending = pending.slice(start); }
        var end = pending.indexOf('\x07', PREFIX.length);
        if (end < 0) return;
        var newer = pending.lastIndexOf(PREFIX, end);
        if (newer > 0) { pending = pending.slice(newer); continue; }
        var body = pending.slice(PREFIX.length, end);
        pending = pending.slice(end + 1);
        var frame;
        try { frame = JSON.parse(body); } catch (_) { continue; }
        if (frame.ready) {
          await loaded;
          if (ws !== currentSocket) return;
          negotiated = true;
          var request = valid(cache) ? { epoch: cache.epoch, offset: cache.offset } : {};
          rawSend('0' + PREFIX + JSON.stringify(request) + '\x07');
          continue;
        }
        if (!negotiated || typeof frame.data !== 'string') continue;
        if (first) {
          // ttyd resets xterm on connection. Reconstruct only after the server
          // confirms our cache belongs to this epoch and retained offset.
          output('\x1bc' + (frame.reset ? '' : restored()));
          first = false;
          allowInput();
        }
        else if (frame.reset) output('\x1bc');
        output(w.atob(frame.data));
        remember(frame);
      }
    }
    ws.addEventListener('message', function (event) {
      if (forwarded) return;
      var data = event.data;
      var b = data instanceof w.ArrayBuffer ? new Uint8Array(data) : null;
      var s = b && b[0] === 48 ? text(b.subarray(1)) :
        typeof data === 'string' && data[0] === '0' ? data.slice(1) : null;
      if (s === null) return;
      event.stopImmediatePropagation();
      queue = queue.then(function () { return receive(s); }).catch(function () {
        cache = null; changed(); ws.close();
      });
    });
    ws.addEventListener('close', function () { queue.then(save); });
    return ws;
  }
  WS.prototype = Native.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { WS[k] = Native[k]; });
  w.WebSocket = WS;
  w.addEventListener('pagehide', save);
});
