/* Recover a selected terminal whose HTTP page never initialized its own guard. */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else window.TerminalFrameHealth = factory;
})(function (w, container, selected) {
  'use strict';
  var states = new WeakMap(), panel = null;
  function state(frame) {
    if (!states.has(frame)) states.set(frame, { elapsed: 0, last: Date.now(), retries: 0 });
    return states.get(frame);
  }
  function hide() { if (panel) { panel.remove(); panel = null; } }
  function show(frame, exhausted) {
    if (!panel) {
      panel = w.document.createElement('div');
      panel.setAttribute('role', 'status');
      panel.style.cssText = 'position:absolute;top:12px;left:12px;right:12px;z-index:2;padding:12px;background:#252535;color:#fff;font:14px/1.5 system-ui;border:1px solid #657085;border-radius:6px';
      container.appendChild(panel);
    }
    panel.textContent = exhausted ? 'Terminal page could not load.' : 'Loading terminal…';
    if (exhausted) {
      var retry = w.document.createElement('button');
      retry.textContent = 'Retry connection'; retry.style.marginLeft = '12px';
      retry.onclick = function () { states.delete(frame); reload(frame); };
      panel.appendChild(retry);
    }
  }
  function reload(frame) {
    state(frame).elapsed = 0; state(frame).last = Date.now();
    frame.src = '/t' + frame.dataset.n + '/';
    show(frame, false);
  }
  function check(activation) {
    var frame = selected();
    if (!frame) { hide(); return; }
    var s = state(frame), now = Date.now();
    var visible = !w.document.hidden && frame.getBoundingClientRect().width > 0;
    if (visible) s.elapsed += Math.max(0, now - s.last);
    s.last = now;
    if (!visible) return;
    var guard, term, failed = false;
    try {
      guard = frame.contentWindow.__vibetopConnectionActivate;
      term = frame.contentWindow.term;
      var doc = frame.contentDocument;
      failed = doc && /^(?:50[234]|404)\b/.test(doc.title);
    } catch (_) {}
    if (guard || term) {
      hide();
      if (activation && guard) guard();
      return;
    }
    if (s.elapsed >= (failed ? 5000 : 45000) && s.retries < 3) {
      s.retries++;
      reload(frame);
    } else show(frame, s.retries >= 3 && s.elapsed >= 45000);
  }
  w.setInterval(function () { check(false); }, 500);
  return { activate: function () {
    var frame = selected();
    if (frame) state(frame).last = Date.now(); // time spent hidden is not a failed attempt
    hide(); check(true);
  }, check: function () { check(false); } };
});
