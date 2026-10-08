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
  function tick() {
    if (stopped || exhausted || w.document.hidden) return;
    // WebKit can expose CLOSED before delivering its close event. Recover a
    // dead transport, never mistake an open, silent shell for a dead one.
    if (socket && socket.readyState === 3 && phase !== 'closed') {
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
    if (!recoverClosed && elapsed < 30000) { show('Connecting to terminal…'); return; }
    if (retries >= 3) {
      show('Terminal connection failed. Retry to reconnect.', true);
      log('retry-limit'); exhausted = true; return;
    }
    show('Terminal connection stalled. Reconnecting…');
    log(resumeClosed ? 'resume-closed' : cleanClosed ? 'clean-close' : recoverClosed ? 'closed-reconnect' : 'timeout'); stopped = true; w.clearInterval(timer);
    // With no persistent storage we cannot bound a cross-reload loop. Offer a
    // manual retry instead of automatically reloading forever.
    try { w.sessionStorage.setItem(key, String(retries + 1)); }
    catch (_) { show('Terminal connection failed.', true); return; }
    w.location.reload();
  }
  var Native = w.WebSocket;
  function WS(url, protocols) {
    var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    socket = ws; closeCode = null; resumeClosed = false; ready = false; phase = 'connecting';
    // Do not reset the deadline on repeated failed socket attempts.
    ws.addEventListener('open', function () { if (ws === socket) phase = 'awaiting-output'; });
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
      if (ws !== socket || stopped) return;
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
    if (socket && socket.readyState === 3) {
      if (phase !== 'closed') closedAt = Date.now();
      ready = false; phase = 'closed'; resumeClosed = true;
    }
    tick();
  }
  w.document.addEventListener('visibilitychange', resume);
  w.addEventListener('focus', resume);
  w.addEventListener('online', resume);
  w.addEventListener('pagehide', function () { stopped = true; w.clearInterval(timer); });
  w.addEventListener('pageshow', function (e) {
    if (e.persisted) { stopped = false; since = Date.now(); hiddenAt = w.document.hidden ? Date.now() : null; timer = w.setInterval(tick, 500); resume(); }
  });
});
