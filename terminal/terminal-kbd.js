/* Mobile keyboard/dictation for the terminal.
 *
 * Loaded into every /tN/ page (via the sub_filter <script src>). NO-OP on
 * non-touch devices — desktops keep xterm's native textarea (all keys, tap to
 * focus, selection). On touch we lay our OWN transparent <textarea> over the
 * bottom of the terminal: tapping the lower (prompt) area focuses it, so iOS
 * raises the keyboard and dictation buffers into a real field natively (like
 * Notes) instead of streaming half-finished revisions to the PTY (the pile-up).
 * We forward a debounced value-diff to the PTY via coreService.triggerDataEvent.
 *
 * position:absolute + caret pushed to the bottom (big padding-top) makes iOS
 * scroll the whole shell up so the prompt clears the keyboard — same as the
 * native terminal, where xterm's textarea sits at the cursor. xterm's own
 * textarea is blocked from taking focus on touch (the focusin guard in the
 * sub_filter), so only this input raises the keyboard. Vertical drags pass
 * through as scrollback.
 *
 * A debug overlay (postMessage {type:'xdbg'}) prints the raw input events.
 */
(function () {
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) return;   // desktop: native xterm, untouched

  // ---- debug overlay (dormant unless something posts {type:'xdbg'}) ----
  var dbgEl = null, dbgBuf = [];
  function dbg(s) {
    if (!dbgEl) return;
    dbgBuf.push(s); if (dbgBuf.length > 200) dbgBuf.shift();
    dbgEl.textContent = dbgBuf.join(''); dbgEl.scrollTop = dbgEl.scrollHeight;
  }
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'xdbg') return;
    if (dbgEl) { dbgEl.remove(); dbgEl = null; return; }
    dbgEl = document.createElement('div');
    dbgEl.style.cssText = 'position:fixed;top:0;left:0;right:0;max-height:34vh;overflow:auto;z-index:2147483647;background:rgba(0,0,0,.9);color:#6f6;font:11px ui-monospace,monospace;padding:6px;white-space:pre-wrap;word-break:break-all';
    document.body.appendChild(dbgEl); dbg('[kbd debug on] ');
  }, false);

  // Send raw bytes to the PTY (bypasses bracketed-paste so Enter executes).
  function sendRaw(d) {
    var t = window.term; if (!t) return;
    try {
      var cs = t._core && t._core.coreService;
      if (cs && cs.triggerDataEvent) cs.triggerDataEvent(d, true);
    } catch (_) {}
  }

  function init() {
    var ov = document.createElement('textarea');
    ov.setAttribute('autocapitalize', 'off');
    ov.setAttribute('autocomplete', 'off');
    ov.setAttribute('autocorrect', 'off');
    ov.setAttribute('spellcheck', 'false');
    ov.setAttribute('aria-hidden', 'true');
    // Transparent BOTTOM strip; the caret is pushed to the prompt line (big
    // padding-top) so iOS scrolls the shell up to clear the keyboard.
    ov.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:8em;box-sizing:border-box;' +
      'z-index:2147482000;background:transparent;color:transparent;caret-color:transparent;' +
      'border:0;outline:0;resize:none;margin:0;padding:6.6em 6px 0;font-size:16px;overflow:hidden;-webkit-user-select:text';
    document.body.appendChild(ov);

    var lastSent = '', composing = false, timer = null;
    function flush() {
      timer = null;
      var v = ov.value;
      dbg(' {in=' + JSON.stringify(v) + ' last=' + JSON.stringify(lastSent) + '}> ');
      // Ignore iOS dictation's transient clear-to-"" between revisions.
      if (v === '' && lastSent !== '') return;
      var i = 0, min = Math.min(v.length, lastSent.length);
      while (i < min && v.charAt(i) === lastSent.charAt(i)) i++;
      for (var d = lastSent.length - i; d > 0; d--) { sendRaw(String.fromCharCode(127)); dbg('<BS>'); }
      for (var j = i; j < v.length; j++) { sendRaw(v.charAt(j)); dbg(v.charAt(j)); }
      lastSent = v;
    }
    function sched(ms) { if (timer) clearTimeout(timer); timer = setTimeout(flush, ms); }
    function clr() { if (timer) { clearTimeout(timer); timer = null; } ov.value = ''; lastSent = ''; }

    ov.addEventListener('compositionstart', function () { dbg(' (cs)'); composing = true; });
    ov.addEventListener('compositionend', function () { dbg(' (ce)'); composing = false; sched(40); });
    ov.addEventListener('input', function (e) {
      dbg(' i[' + JSON.stringify(ov.value) + ' c=' + (e && e.isComposing) + ']');
      sched((composing || (e && e.isComposing)) ? 400 : 80);
    });
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); flush(); sendRaw(String.fromCharCode(13)); clr(); dbg(' <ENTER> '); }
      else if (e.key === 'Tab') { e.preventDefault(); sendRaw(String.fromCharCode(9)); dbg(' <TAB> '); }
      else if (e.key === 'Backspace' && ov.value === '') { e.preventDefault(); sendRaw(String.fromCharCode(127)); }
    });

    // Vertical drag → terminal scrollback (so the strip doesn't kill scrolling).
    var sy = 0, acc = 0, moved = false;
    ov.addEventListener('touchstart', function (e) { sy = e.touches[0].clientY; acc = 0; moved = false; }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      var y = e.touches[0].clientY, dy = y - sy; sy = y;
      if (Math.abs(dy) > 1) moved = true;
      acc += dy;
      var t = window.term;
      if (t && t.scrollLines) {
        while (acc > 18) { t.scrollLines(-1); acc -= 18; }
        while (acc < -18) { t.scrollLines(1); acc += 18; }
      }
      if (moved) e.preventDefault();   // don't let the textarea scroll itself
    }, { passive: false });

    dbg(' [overlay ready] ');
  }

  var iv = setInterval(function () {
    if (window.term && document.body) { clearInterval(iv); init(); }
  }, 100);
})();
