/* Bound terminal startup/reconnect failures independently of ttyd's overlay.
 * A token fetch or CONNECTING socket can stall before ttyd has an error UI.
 * Never time out an established, quiet shell; never send input to recover it.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(window);
})(function (w) {
  'use strict';
  var key = 'vt-terminal-retries:' + w.location.pathname;
  var socket = null, ready = false, stopped = false, exhausted = false, panel = null;
  var closeCode = null, closedAt = 0, resumeClosed = false, wasOffline = false;
  var since = Date.now(), phase = 'startup', retries = 0, timer;
  var hiddenAt = w.document.hidden ? Date.now() : null;
  var foreground = true;
  try { retries = Math.min(3, Math.max(0, +w.sessionStorage.getItem(key) || 0)); } catch (_) {}
  function log(event) {
    // No terminal output, typed input, token, query string, or socket URL.
    try {
      w.fetch('/api/clientlog', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ua: w.navigator.userAgent, guard: [{
          k: 'terminal-connection', event: event, path: w.location.pathname,
          phase: phase, elapsed: Date.now() - since, retries: retries,
          state: socket ? socket.readyState : null, close_code: closeCode,
          closed_wait_ms: phase === 'closed' ? Date.now() - closedAt : null
        }] }) }).catch(function () {});
    } catch (_) {}
  }
  function show(message, manual) {
    if (!w.document.body) return;
    if (!panel) {
      panel = w.document.createElement('div'); panel.id = 'vt-connection';
      panel.setAttribute('role', 'status');
      panel.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;padding:12px;background:#252535;color:#fff;font:14px/1.5 system-ui;border:1px solid #657085;border-radius:6px';
      w.document.body.appendChild(panel);
    }
    panel.textContent = message;
    if (manual) {
      var button = w.document.createElement('button');
      button.textContent = 'Retry connection'; button.style.marginLeft = '12px';
      button.onclick = function () {
        try { w.sessionStorage.removeItem(key); } catch (_) {}
        w.location.reload();
      };
      panel.appendChild(button);
    }
  }
  function isForeground() {
    if (w.document.hidden) return false;
    try {
      var frame = w.frameElement;
      if (frame && (!frame.classList.contains('active') || !frame.getBoundingClientRect().width)) return false;
    } catch (_) {}
    return true;
  }
  function tick() {
    if (!isForeground()) { foreground = false; return; }
    if (!foreground) { foreground = true; since = Date.now(); }
    if (stopped || exhausted) return;
    // WebKit can expose CLOSED before delivering its close event. Recover a
    // dead transport, never mistake an open, silent shell for a dead one.
    if (socket && socket.readyState === 3 && phase !== 'closed' && phase !== 'reconnecting') {
      if (ready) since = Date.now();
      ready = false; phase = 'closed'; closedAt = Date.now();
    }
    if (ready) return;
    if (w.navigator.onLine === false) {
      wasOffline = true; show('Waiting for network…'); return;
    }
    if (wasOffline) { wasOffline = false; since = Date.now(); }
    var elapsed = Date.now() - since;
    var cleanClosed = phase === 'closed' && (closeCode === 1000 || closeCode === 1005);
    var recoverClosed = phase === 'closed';
    // Normal recovery starts immediately. Repeated connection failures back
    // off without imposing the same delay on every healthy mobile reconnect.
    var retryDelay = retries === 0 ? 0 : retries === 1 ? 1000 : 4000;
    if (recoverClosed && retries < 3 && Date.now() - closedAt < retryDelay) return;
    // A slow handshake / first output can still succeed on airplane WiFi.
    // This generous deadline applies only while transport is not yet closed.
    if (!recoverClosed && elapsed < 3000) return;
    if (!recoverClosed && elapsed < 45000) { show('Connecting to terminal…'); return; }
    if (retries >= 3) {
      var exhaustedOwner = w.__vibetopTtyd;
      if (exhaustedOwner && exhaustedOwner.socket === socket && typeof exhaustedOwner.dispose === 'function') exhaustedOwner.dispose();
      show('Terminal connection failed. Retry to reconnect.', true);
      log('retry-limit'); exhausted = true; return;
    }
    show('Terminal connection stalled. Reconnecting…');
    var event = resumeClosed ? 'resume-closed' : cleanClosed ? 'clean-close' : recoverClosed ? 'closed-reconnect' : 'timeout';
    var owner = w.__vibetopTtyd;
    // The installer exposes ttyd's controller. Its normal connect path resets
    // the view and restores listeners; avoid downloading / parsing HTML again.
    // Dispose before the native close listener runs, so only one retry owns it.
    if (recoverClosed && owner && owner.socket === socket &&
        typeof owner.dispose === 'function' && typeof owner.refreshToken === 'function' &&
        typeof owner.connect === 'function') {
      log(event); owner.dispose();
      try { w.sessionStorage.setItem(key, String(retries + 1)); }
      catch (_) { stopped = true; show('Terminal connection failed.', true); return; }
      retries++; since = Date.now(); phase = 'reconnecting'; resumeClosed = false;
      log('inplace-reconnect');
      Promise.resolve().then(function () { return owner.refreshToken(); }).then(function () {
        if (!stopped && !exhausted && phase === 'reconnecting') owner.connect();
      }).catch(function () { log('socket-error'); });
      return;
    }
    log(event); stopped = true; w.clearInterval(timer);
    // With no persistent storage we cannot bound a cross-reload loop. Offer a
    // manual retry instead of automatically reloading forever.
    try { w.sessionStorage.setItem(key, String(retries + 1)); }
    catch (_) { show('Terminal connection failed.', true); return; }
    w.location.reload();
  }
  // An abnormal drop fires `error`, which turns ttyd's own reconnect off; its
  // close handler then adds a "Press Enter to Reconnect" terminal.onKey
  // listener that is not in its disposables. Once a new socket opens (the
  // in-place recovery above), that listener would turn the user's next Enter
  // into a needless second connect() and a screen reset. Record onKey
  // listeners added while a close event is being dispatched, and dispose them
  // when a socket opens. If recovery never succeeds they stay: Enter remains
  // the manual retry.
  var closing = false, closeKeys = [];
  function trackCloseKeys() {
    var owner = w.__vibetopTtyd, t = owner && owner.terminal || w.term;
    if (!t || t.__vtCloseKeys) return;
    var proto = Object.getPrototypeOf(t), d = proto && Object.getOwnPropertyDescriptor(proto, 'onKey');
    if (!d || typeof d.get !== 'function') return;
    try {
      Object.defineProperty(t, 'onKey', { configurable: true, get: function () {
        var event = d.get.call(t);
        return function (listener, thisArg) {
          var sub = event.call(this, listener, thisArg);
          if (closing && sub) closeKeys.push(sub);
          return sub;
        };
      } });
      t.__vtCloseKeys = true;
    } catch (_) {}
  }
  function disposeCloseKeys() {
    closeKeys.splice(0).forEach(function (sub) { try { sub.dispose(); } catch (_) {} });
  }
  // xterm reports a mouse position as floor(x / cell width). When its render
  // dimensions are not valid (seen on returning to a Safari tab), that is NaN
  // and the app receives "\x1b[<35;NaN;NaNM". Claude Code then shows
  // "aN;NaNM" as typed text. Drop such reports at the socket, and ask xterm
  // to measure again so the next ones are right.
  var BAD_MOUSE = /\x1b\[<?\d+;([^;Mm\x1b]*);([^;Mm\x1b]*)[Mm]/g;
  function remeasure() {
    var t = w.term, core = t && t._core;
    try { if (core && core._charSizeService) core._charSizeService.measure(); } catch (_) {}
    try { if (core && core._renderService) core._renderService.handleCharSizeChanged(); } catch (_) {}
    try { w.dispatchEvent(new w.Event('resize')); } catch (_) {}
  }
  function cleanInput(data) {
    // ttyd input frames are '0' + UTF-8 text, sent as a Uint8Array view.
    if (!(data instanceof w.Uint8Array) || data[0] !== 48 || !w.TextDecoder) return data;
    var text = new w.TextDecoder().decode(data.subarray(1));
    if (text.indexOf('\x1b[') < 0) return data;
    var dropped = false;
    var kept = text.replace(BAD_MOUSE, function (all, col, row) {
      if (/^\d+$/.test(col) && /^\d+$/.test(row)) return all;
      dropped = true; return '';
    });
    if (!dropped) return data;
    remeasure(); log('bad-mouse-report');
    if (!kept) return null;
    var bytes = new w.TextEncoder().encode(kept), out = new w.Uint8Array(bytes.length + 1);
    out[0] = 48; out.set(bytes, 1);
    return out;
  }
  var Native = w.WebSocket;
  function WS(url, protocols) {
    var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    var previous = socket;
    socket = ws; closeCode = null; resumeClosed = false; ready = false; phase = 'connecting';
    var send = ws.send;
    ws.send = function (data) {
      var clean = cleanInput(data);
      if (clean !== null) return send.call(ws, clean);
    };
    // ttyd's own reconnect and the in-place recovery below can both call
    // connect() while a token fetch is pending. Every socket that opens runs
    // ttyd's initListeners(), so two live sockets double each keystroke and
    // each echo. Only the newest socket may reach ttyd: these listeners run
    // before ttyd's (registered first), and the superseded socket is closed.
    ['open', 'message', 'error', 'close'].forEach(function (type) {
      ws.addEventListener(type, function (event) { if (ws !== socket) event.stopImmediatePropagation(); });
    });
    if (previous && previous.readyState < 2) {
      try { previous.close(); } catch (_) {}
      // Blocking the superseded socket's close event also skips ttyd's
      // dispose(). If that socket had opened, its onData handler would survive
      // and every key would be sent twice through the new socket. ttyd assigns
      // its socket only after this constructor returns, so owner.socket is
      // still the old one here.
      var owner = w.__vibetopTtyd;
      if (owner && owner.socket === previous && typeof owner.dispose === 'function') {
        try { owner.dispose(); } catch (_) {}
      }
    }
    // Do not reset the deadline on repeated failed socket attempts.
    ws.addEventListener('open', function () {
      if (ws !== socket) return;
      phase = 'awaiting-output'; disposeCloseKeys();
    });
    ws.addEventListener('message', function (event) {
      if (ws !== socket || ready || stopped) return;
      // ttyd: '0' is PTY output; title/preferences alone don't prove the PTY
      // attached. ttyd sets binaryType=arraybuffer before messages arrive.
      var data = event.data;
      var output = typeof data === 'string' ? data.length > 1 && data[0] === '0' :
        data instanceof w.ArrayBuffer && data.byteLength > 1 && new w.Uint8Array(data)[0] === 48;
      if (!output) return;
      ready = true; exhausted = false;
      if (panel) { panel.remove(); panel = null; }
      if (retries) log('recovered');
      retries = 0;
      try { w.sessionStorage.removeItem(key); } catch (_) {}
    });
    ws.addEventListener('close', function (event) {
      if (ws !== socket) return;
      // This listener runs before ttyd's; the flag covers the rest of this
      // dispatch (a microtask would clear it between listeners).
      trackCloseKeys(); closing = true;
      w.setTimeout(function () { closing = false; }, 0);
      if (stopped) return;
      if (ready) since = Date.now();
      ready = false; phase = 'closed'; closeCode = event.code; closedAt = Date.now();
      log('socket-close');
      tick();
    });
    ws.addEventListener('error', function () { if (ws === socket) phase = 'error'; });
    return ws;
  }
  if (Native) {
    WS.prototype = Native.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { WS[k] = Native[k]; });
    w.WebSocket = WS;
  }
  timer = w.setInterval(tick, 500);
  function resume() {
    if (w.document.hidden) {
      if (hiddenAt == null) hiddenAt = Date.now();
      return;
    }
    if (hiddenAt != null) { since += Date.now() - Math.max(hiddenAt, since); hiddenAt = null; }
    if (stopped || exhausted) return;
    // WebKit can report CLOSED before dispatching its queued close event.
    // Read the actual socket state rather than waiting for that event/code.
    if (socket && socket.readyState === 3 && phase !== 'reconnecting') {
      if (phase !== 'closed') closedAt = Date.now();
      ready = false; phase = 'closed'; resumeClosed = true;
    }
    tick();
  }
  w.__vibetopConnectionActivate = function () {
    resume();
    if (stopped || ready) return;
    show(exhausted ? 'Terminal connection failed. Retry to reconnect.' : 'Connecting to terminal…', exhausted);
  };
  w.document.addEventListener('visibilitychange', resume);
  w.addEventListener('focus', resume);
  w.addEventListener('online', resume);
  w.addEventListener('pagehide', function () { stopped = true; w.clearInterval(timer); });
  w.addEventListener('pageshow', function (e) {
    if (e.persisted) { stopped = false; since = Date.now(); hiddenAt = w.document.hidden ? Date.now() : null; foreground = isForeground(); timer = w.setInterval(tick, 500); resume(); }
  });
});
