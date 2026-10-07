/* Opt-in, time-limited timing profile. Never reads terminal text or typed input. */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    var tag = document.currentScript;
    var until = tag ? +new URL(tag.src).searchParams.get('until') : 0;
    factory(window, until);
  }
})(function (w, until) {
  'use strict';
  if (!(until > Date.now()) || until - Date.now() > 26 * 3600000) return;
  var start = Date.now(), id = start.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var queue = [], timer = null, seq = 0, active = null, interaction = start;
  var key = 'vt-terminal-profile:' + w.location.pathname, previous = {};
  try { previous = JSON.parse(w.sessionStorage.getItem(key)) || {}; } catch (_) {}
  function persist() { try { w.sessionStorage.setItem(key, JSON.stringify(previous)); } catch (_) {} }
  function stamp() { return w.performance && w.performance.now ? w.performance.now() : Date.now() - start; }
  function flush() {
    if (timer) { w.clearTimeout(timer); timer = null; }
    if (!queue.length || Date.now() >= until) { queue = []; return; }
    var batch = [];
    while (queue.length && batch.length < 8) {
      if (batch.length && JSON.stringify(batch.concat([queue[0]])).length > 4500) break;
      batch.push(queue.shift());
    }
    try {
      w.fetch('/api/clientlog', { method: 'POST', keepalive: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ua: w.navigator.userAgent, guard: batch}) }).catch(function () {});
    } catch (_) {}
    if (queue.length) timer = w.setTimeout(flush, 5000);
  }
  function emit(event, data) {
    if (Date.now() >= until) return;
    var row = {k: 'terminal-profile', event: event, id: id, seq: seq,
      path: w.location.pathname, at: Date.now(), ms: Math.round(stamp()),
      hidden: !!w.document.hidden, online: w.navigator.onLine !== false,
      interaction_age_ms: Date.now() - interaction};
    Object.keys(data || {}).forEach(function (k) { row[k] = data[k]; });
    queue.push(row);
    if (queue.length > 32) queue.shift();
    if (!timer) timer = w.setTimeout(flush, 5000);
  }
  function resources() {
    if (!w.performance || !w.performance.getEntriesByType) return {};
    var nav = w.performance.getEntriesByType('navigation')[0], result = {};
    function ms(n) { return Math.max(0, Math.round(n || 0)); }
    if (nav) result.navigation = {
      type: nav.type, dns_ms: ms(nav.domainLookupEnd - nav.domainLookupStart),
      connect_ms: ms(nav.connectEnd - nav.connectStart),
      ttfb_ms: ms(nav.responseStart - nav.requestStart),
      transfer_ms: ms(nav.responseEnd - nav.responseStart),
      encoded_bytes: nav.encodedBodySize, wire_bytes: nav.transferSize,
      dom_ms: ms(nav.domInteractive), response_end_ms: ms(nav.responseEnd)};
    result.resources = w.performance.getEntriesByType('resource').filter(function (r) {
      try { return /^(\/t\d+\/token|\/(terminal-connection|terminal-kbd|terminal-profile|kbd-input|coach)\.js)$/.test(new URL(r.name).pathname); }
      catch (_) { return false; }
    }).slice(0, 8).map(function (r) {
      return {path: new URL(r.name).pathname, start_ms: ms(r.startTime), duration_ms: ms(r.duration),
        ttfb_ms: ms(r.responseStart - r.requestStart), wire_bytes: r.transferSize, encoded_bytes: r.encodedBodySize};
    });
    return result;
  }
  var Native = w.WebSocket;
  function WS(url, protocols) {
    if (Date.now() >= until) return protocols === undefined ? new Native(url) : new Native(url, protocols);
    var created = stamp();
    var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    var state = {seq: ++seq, created: created, opened: null, output: null, bytes: 0, frames: 0, parsed: null};
    active = ws;
    emit('socket-created', {since_close_ms: previous.closed ? Date.now() - previous.closed : null,
      since_resume_ms: previous.resumed ? Date.now() - previous.resumed : null});
    ws.addEventListener('open', function () {
      state.opened = stamp(); emit('socket-open', {seq: state.seq, handshake_ms: Math.round(state.opened - created)});
    });
    ws.addEventListener('message', function (e) {
      if (Date.now() >= until) return;
      var data = e.data, binary = data instanceof w.ArrayBuffer;
      var output = binary ? data.byteLength > 1 && new w.Uint8Array(data)[0] === 48 :
        typeof data === 'string' && data.length > 1 && data[0] === '0';
      if (!output) return;
      state.frames++; state.bytes += binary ? data.byteLength - 1 : data.length - 1;
      if (state.output != null) return;
      state.output = stamp();
      emit('first-output', {seq: state.seq, socket_to_output_ms: Math.round(state.output - created),
        open_to_output_ms: state.opened == null ? null : Math.round(state.output - state.opened)});
      var t = w.term;
      if (t && t.onWriteParsed) {
        state.parsed = t.onWriteParsed(function () {
          if (state.parsed) { state.parsed.dispose(); state.parsed = null; }
          var parsed = stamp();
          w.requestAnimationFrame(function () { w.requestAnimationFrame(function () {
            emit('first-render', Object.assign({seq: state.seq, output_to_parse_ms: Math.round(parsed - state.output),
              output_to_paint_ms: Math.round(stamp() - state.output), boot_to_paint_ms: Math.round(stamp()),
              output_bytes: state.bytes, output_frames: state.frames}, resources()));
          }); });
        });
      }
      w.setTimeout(function () {
        emit('replay-window', {seq: state.seq, window_ms: 1500, output_bytes: state.bytes,
          output_frames: state.frames, viewport: t && t.buffer ? t.buffer.active.viewportY : null,
          bottom: t && t.buffer ? t.buffer.active.baseY : null});
      }, 1500);
    });
    ws.addEventListener('close', function (e) {
      if (state.parsed) { state.parsed.dispose(); state.parsed = null; }
      if (Date.now() >= until) return;
      previous.closed = Date.now(); persist();
      emit('socket-close', {seq: state.seq, code: e.code, lifetime_ms: Math.round(stamp() - created),
        output_bytes: state.bytes, output_frames: state.frames});
      flush();
    });
    ws.addEventListener('error', function () { emit('socket-error', {seq: state.seq}); });
    return ws;
  }
  if (Native) {
    WS.prototype = Native.prototype;
    ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function (k) { WS[k] = Native[k]; });
    w.WebSocket = WS;
  }
  function resume(event) {
    if (Date.now() >= until) return;
    if (!w.document.hidden) { previous.resumed = Date.now(); persist(); }
    emit(event, {state: active ? active.readyState : null});
  }
  w.document.addEventListener('visibilitychange', function () { resume('visibility'); flush(); });
  w.addEventListener('focus', function () { resume('focus'); });
  w.addEventListener('online', function () { resume('online'); });
  w.addEventListener('offline', function () { emit('offline'); });
  w.addEventListener('pagehide', function () { emit('pagehide'); flush(); });
  w.addEventListener('pageshow', function (e) { emit('pageshow', {persisted: !!e.persisted}); });
  ['pointerdown','keydown'].forEach(function (k) {
    w.addEventListener(k, function () { if (Date.now() < until) interaction = Date.now(); }, {capture: true, passive: true});
  });
  emit('boot', {since_close_ms: previous.closed ? Date.now() - previous.closed : null,
    since_resume_ms: previous.resumed ? Date.now() - previous.resumed : null});
});
