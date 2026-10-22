/* OSC 52 clipboard writes from terminal apps (Claude Code's copy-on-select,
 * tmux, vim, ssh'd shells). ttyd's xterm.js has no OSC 52 handler, so the app
 * said "copied" while the clipboard never changed.
 *
 * Writes go straight to navigator.clipboard. Safari refuses that without a
 * fresh user gesture, and the sequence arrives a network round trip after the
 * mouse-up, so the text is also kept: on macOS, Cmd+C with no xterm selection
 * copies it from inside the keydown (a gesture). Clipboard READS (`52;c;?`)
 * are never answered — output must not be able to exfiltrate the clipboard.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(window);
})(function (w) {
  'use strict';
  var MAX = 1024 * 1024;               // base64 bytes; larger writes are dropped
  var isMac = /Mac/.test(w.navigator.platform);
  var pending = null;
  function decode(b64) {
    var bin = w.atob(b64);
    return new w.TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  function execCopy(text) {
    var d = w.document, active = d.activeElement, ta = d.createElement('textarea'), ok = false;
    ta.value = text; ta.readOnly = true;
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    d.body.appendChild(ta); ta.select();
    // __allowCopy: the sub_filter blocks execCommand('copy') to stop ttyd's
    // copy-on-select clobber; finally{} so the gate can never stay open.
    try { w.__allowCopy = true; ok = d.execCommand('copy'); } catch (_) {}
    finally { w.__allowCopy = false; d.body.removeChild(ta); }
    try { if (active && active.focus) active.focus({ preventScroll: true }); } catch (_) {}
    return ok;
  }
  function onOsc52(data) {
    var i = data.indexOf(';'), payload = i < 0 ? '' : data.slice(i + 1);
    if (!payload || payload === '?' || payload.length > MAX) return true;
    var text;
    try { text = decode(payload); } catch (_) { return true; }
    if (!text) return true;
    pending = text;
    var c = w.navigator.clipboard;
    if (c && c.writeText) {
      c.writeText(text).then(function () { if (pending === text) pending = null; }, function () {});
    }
    return true;
  }
  w.addEventListener('keydown', function (e) {
    if (!pending || !isMac || !e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.key !== 'c' && e.key !== 'C') return;
    var t = w.term;
    if (t && t.hasSelection && t.hasSelection()) return;   // xterm's own copy path
    if (!execCopy(pending)) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  var timer = w.setInterval(function () {
    var t = w.term;
    if (!t || !t.parser || !t.parser.registerOscHandler) return;
    w.clearInterval(timer);
    t.parser.registerOscHandler(52, onOsc52);
  }, 100);
});
