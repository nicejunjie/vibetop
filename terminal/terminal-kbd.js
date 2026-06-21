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

  // Re-claim the shared PTY's shape for THIS device (double-click on desktop,
  // double-tap on touch). Terminal N is ONE shared claude-session PTY, so its
  // rows×cols are owned by whichever device resized last — the other device then
  // sees mis-shaped (too-narrow / too-wide) output until it re-claims. ttyd only
  // emits a resize when its computed dims change, so we nudge xterm's size by a
  // row and restore it: that re-sends THIS browser's real dims to the PTY and the
  // TUI inside redraws at this device's shape.
  function claimSize() {
    var t = window.term; if (!t) return;
    var c = t.cols, r = t.rows;
    try { t.resize(c, Math.max(2, r - 1)); t.resize(c, r); } catch (_) {}
  }

  // Brief toast (used to confirm a touch double-tap registered).
  function flash(msg) {
    if (!document.body) return;
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:2147483647;' +
      'background:rgba(45,108,192,.95);color:#fff;font:600 13px system-ui,sans-serif;padding:6px 14px;' +
      'border-radius:14px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.4)';
    document.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, 900);
  }

  if (!isTouch) {                       // desktop: native xterm otherwise untouched
    window.addEventListener('dblclick', claimSize);
    return;
  }

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
    // Transparent FULL-HEIGHT overlay. Its caret is parked on the actual xterm
    // cursor row via a dynamic padding-top (positionCaret), so iOS scrolls the
    // shell to reveal wherever the prompt really is — the bottom on a full
    // terminal, the top on a fresh one — instead of always the bottom. That's
    // what keeps the line you're typing visible (and stops the "jump back to
    // default" that hid a new terminal's top-of-window prompt).
    ov.style.cssText = 'position:absolute;left:0;right:0;top:0;height:100%;box-sizing:border-box;' +
      'z-index:2147482000;background:transparent;color:transparent;caret-color:transparent;' +
      'border:0;outline:0;resize:none;margin:0;padding:0 6px;font-size:16px;overflow:hidden;' +
      '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';  // stop iOS's own long-press selection/loupe
    document.body.appendChild(ov);

    // Park the textarea caret on the xterm cursor row (pixel Y from the top of
    // the terminal) so iOS reveals the real prompt line, not a fixed bottom.
    function positionCaret() {
      var t = window.term;
      try {
        var rows = t.rows || 24;
        var h = t.element ? t.element.getBoundingClientRect().height : window.innerHeight;
        var rh = h / rows;
        var cy = (t.buffer && t.buffer.active) ? t.buffer.active.cursorY : rows - 1;
        var y = Math.max(0, Math.min(h - rh, cy * rh));
        ov.style.paddingTop = Math.round(y) + 'px';
      } catch (_) {}
    }
    // Re-anchor the caret to the cursor row ONLY when the cursor actually moves
    // (i.e. when you type) — NOT on every render. Render fires on scroll too, and
    // re-anchoring there made iOS yank the view back to the prompt the instant you
    // dragged, so you couldn't scroll while the keyboard was up. Typing moves the
    // cursor → re-anchor → your line stays visible; scrolling doesn't → the view
    // stays where you put it.
    try { if (window.term.onCursorMove) window.term.onCursorMove(positionCaret); } catch (_) {}
    ov.addEventListener('focus', positionCaret);
    window.addEventListener('resize', positionCaret);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', positionCaret);
    positionCaret();

    var lastSent = '', composing = false, timer = null;
    function flush() {
      timer = null;
      var v = ov.value;
      dbg(' {in=' + JSON.stringify(v) + ' last=' + JSON.stringify(lastSent) + '}> ');
      // Ignore iOS dictation's transient clear-to-"" between revisions.
      if (v === '' && lastSent !== '') return;
      // Compare by code POINT (Array.from), not UTF-16 unit, so an emoji/astral
      // char isn't split into two lone surrogates and one delete = one char.
      var va = Array.from(v), la = Array.from(lastSent);
      var i = 0, min = Math.min(va.length, la.length);
      while (i < min && va[i] === la[i]) i++;
      for (var d = la.length - i; d > 0; d--) { sendRaw(String.fromCharCode(127)); dbg('<BS>'); }
      for (var j = i; j < va.length; j++) { sendRaw(va[j]); dbg(va[j]); }
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

    // The overlay covers xterm and would eat every touch, so route by gesture:
    // quick tap → keyboard; vertical drag → scrollback; long-press → select the
    // WORD under the finger (drag to extend), then a floating Copy button.
    function cellAt(x, y) {
      var t = window.term, el = t && t.element;
      if (!el) return null;
      var r = el.getBoundingClientRect();
      var col = Math.max(0, Math.min(t.cols - 1, Math.floor((x - r.left) / (r.width / t.cols))));
      var vr = Math.max(0, Math.min(t.rows - 1, Math.floor((y - r.top) / (r.height / t.rows))));
      var base = (t.buffer && t.buffer.active && t.buffer.active.viewportY) || 0;
      return { col: col, row: base + vr };   // row = absolute buffer line
    }
    function applySel(a, b) {
      var t = window.term;
      if (!t || !t.select) return;
      var s = a, e = b;
      if (e.row < s.row || (e.row === s.row && e.col < s.col)) { s = b; e = a; }
      try { t.select(s.col, s.row, Math.max(1, (e.row - s.row) * t.cols + (e.col - s.col) + 1)); } catch (_) {}
    }
    function wordAt(cell) {   // word boundaries around a long-pressed cell
      try {
        var line = window.term.buffer.active.getLine(cell.row);
        if (!line) return { s: cell, e: cell };
        var str = line.translateToString(true), c = cell.col, ws = /\s/;
        if (c >= str.length || ws.test(str[c])) return { s: cell, e: cell };
        var a = c, b = c;
        while (a > 0 && !ws.test(str[a - 1])) a--;
        while (b < str.length - 1 && !ws.test(str[b + 1])) b++;
        return { s: { col: a, row: cell.row }, e: { col: b, row: cell.row } };
      } catch (_) { return { s: cell, e: cell }; }
    }

    // Floating Copy button shown after a touch selection (auto-copy via
    // execCommand doesn't work on touch, so give an explicit, tappable copy).
    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'position:fixed;z-index:2147483600;display:none;padding:7px 16px;' +
      'font:600 14px system-ui,sans-serif;background:#2d6cc0;color:#fff;border:0;border-radius:8px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.45);-webkit-user-select:none;user-select:none';
    document.body.appendChild(copyBtn);
    function hideCopy() { copyBtn.style.display = 'none'; }
    function showCopy(x, y) {
      copyBtn.style.left = Math.max(8, Math.min(window.innerWidth - 88, x - 36)) + 'px';
      copyBtn.style.top = Math.max(8, y - 50) + 'px';
      copyBtn.style.display = 'block';
    }
    function doCopy(s) {
      if (!s) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).catch(execCopy);
      } else { execCopy(s); }
    }
    function execCopy(s) {
      try {
        var ta = document.createElement('textarea'); ta.value = s || '';
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0'; ta.readOnly = true;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {}
    }
    copyBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var t = window.term;
      doCopy(t && t.hasSelection() ? t.getSelection() : '');
      hideCopy();
      try { t.clearSelection(); } catch (_) {}
    });

    var startX = 0, startY = 0, prevY = 0, acc = 0, moved = false, lpTimer = null, selecting = false, anchor = null;
    var lastTapTime = 0, lastTapX = 0, lastTapY = 0, tStart = 0;   // for double-tap (claimSize)
    ov.addEventListener('touchstart', function (e) {
      var c = e.touches[0];
      startX = c.clientX; startY = prevY = c.clientY; acc = 0; moved = false; selecting = false; anchor = null;
      tStart = Date.now();
      hideCopy();
      if (lpTimer) clearTimeout(lpTimer);
      lpTimer = setTimeout(function () {            // held still ~0.45s → select the word
        if (moved) return;
        selecting = true;
        var cell = cellAt(startX, startY);
        if (cell) {
          var w = wordAt(cell);
          anchor = w.s;
          try { window.term.clearSelection(); } catch (_) {}
          applySel(w.s, w.e);
        }
      }, 450);
    }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      var c = e.touches[0], y = c.clientY;
      if (!moved && (Math.abs(c.clientX - startX) > 8 || Math.abs(y - startY) > 8)) {
        moved = true; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      }
      if (selecting) {                              // extend selection to the finger
        var cur = cellAt(c.clientX, y);
        if (cur && anchor) applySel(anchor, cur);
        e.preventDefault(); return;
      }
      var dy = y - prevY; prevY = y; acc += dy;     // else scroll the scrollback
      var t = window.term;
      if (t && t.scrollLines) {
        while (acc > 18) { t.scrollLines(-1); acc -= 18; }
        while (acc < -18) { t.scrollLines(1); acc += 18; }
      }
      if (moved) e.preventDefault();
    }, { passive: false });
    ov.addEventListener('touchend', function (e) {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      var ct = e.changedTouches[0], now = Date.now(), dur = now - tStart;
      // A BRIEF touch is a tap even if the page drifted under the finger while the
      // keyboard animated in (that drift sets `moved`, which would otherwise hide
      // the tap). Two quick taps close in space = double-tap → re-claim this
      // device's terminal shape. Keyed on duration, not `moved`, so it survives the
      // keyboard-raise layout shift on the first tap.
      if (!selecting && dur < 250) {
        if (now - lastTapTime < 400 &&
            Math.abs(ct.clientX - lastTapX) < 60 && Math.abs(ct.clientY - lastTapY) < 60) {
          e.preventDefault();
          lastTapTime = 0;
          try { ov.blur(); } catch (_) {}           // reshaping; don't leave the keyboard up
          flash('↔ resized');
          claimSize();
          return;
        }
        lastTapTime = now; lastTapX = ct.clientX; lastTapY = ct.clientY;
      }
      if (selecting) {
        selecting = false;
        e.preventDefault();                         // don't raise the keyboard
        var t = window.term;
        if (t && t.hasSelection()) showCopy(ct.clientX, ct.clientY);
      } else if (!moved) {                          // single tap: drop selection, let the keyboard come up
        try { if (window.term && window.term.hasSelection()) window.term.clearSelection(); } catch (_) {}
      }
    }, { passive: false });

    dbg(' [overlay ready] ');
  }

  var iv = setInterval(function () {
    if (window.term && document.body) { clearInterval(iv); init(); }
  }, 100);
})();
