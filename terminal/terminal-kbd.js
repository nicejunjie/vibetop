/* Mobile keyboard/dictation for the terminal.
 *
 * Loaded into every /tN/ page (via the sub_filter <script src>). NO-OP on
 * non-touch devices — desktops keep xterm's native textarea (all keys, tap to
 * focus, selection). On touch we lay our OWN transparent FULL-HEIGHT <textarea>
 * over the terminal: tapping it focuses it, so iOS raises the keyboard and
 * dictation buffers into a real field natively (like Notes) instead of streaming
 * half-finished revisions to the PTY (the pile-up). We forward a debounced
 * value-diff to the PTY via coreService.triggerDataEvent.
 *
 * The textarea's caret is parked on the actual xterm cursor row (dynamic
 * padding-top, positionCaret) so iOS scrolls the shell to reveal wherever the
 * prompt really is — the top on a fresh terminal, the bottom on a full one,
 * like the native terminal where xterm's textarea sits at the cursor. xterm's
 * own textarea is blocked from taking focus on touch (the focusin guard in the
 * sub_filter), so only this input raises the keyboard. Vertical drags pass
 * through as scrollback.
 *
 * A debug overlay (postMessage {type:'xdbg'}) prints the raw input events.
 */
(function () {
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // Capture ttyd's WebSocket (this script runs at end of <head>, before ttyd opens
  // the socket on load) so claimSize can re-send the terminal size straight to the
  // PTY without resizing the visible terminal.
  var ttydWS = null;
  (function () {
    var Native = window.WebSocket; if (!Native) return;
    function WS(url, proto) {
      var ws = (proto === undefined) ? new Native(url) : new Native(url, proto);
      try { ttydWS = ws; } catch (_) {}
      return ws;
    }
    WS.prototype = Native.prototype;
    WS.CONNECTING = Native.CONNECTING; WS.OPEN = Native.OPEN;
    WS.CLOSING = Native.CLOSING; WS.CLOSED = Native.CLOSED;
    try { window.WebSocket = WS; } catch (_) {}
  })();

  // Re-claim the shared PTY's shape for THIS device (double-click on desktop,
  // double-tap on touch). Terminal N is ONE shared vibetop-session PTY, so its
  // rows×cols are owned by whichever device resized last — the other device then
  // sees mis-shaped (too-narrow / too-wide) output until it re-claims.
  function claimSize() {
    var t = window.term; if (!t) return;
    var c = t.cols, r = t.rows, c0 = Math.max(2, c - 1);
    // Send the resize STRAIGHT to ttyd's socket (RESIZE_TERMINAL="1" +
    // {columns,rows}) so the PTY is re-shaped without resizing the visible xterm
    // grid — resizing the grid makes the content jump ("shake").
    //
    // It must NUDGE: ttyd applies each frame via TIOCSWINSZ, yet the kernel raises
    // SIGWINCH (the signal that actually propagates the size down to the shared
    // vibetop-session PTY) ONLY when the size CHANGES. This client's ttyd PTY is
    // already c×r, so re-sending c×r is a silent no-op and re-claims nothing — so
    // send a DIFFERENT size and back, then two SIGWINCHes carry this device's
    // shape to the shared PTY.
    //
    // Nudge the COLUMN, not the row, keeping ROWS CONSTANT: the intermediate frame
    // still streams back to this device's xterm (one redraw at the nudged size),
    // and a 1-row change makes a bottom-anchored TUI (e.g. a prompt/input box)
    // bounce up a row then back — the residual "shake". A 1-column change keeps
    // every row in place, so the bottom line doesn't move; the blip is just one
    // column of width for a single frame, far less perceptible.
    try {
      if (ttydWS && ttydWS.readyState === 1) {
        var enc = new TextEncoder();
        ttydWS.send(enc.encode('1' + JSON.stringify({ columns: c0, rows: r })));
        ttydWS.send(enc.encode('1' + JSON.stringify({ columns: c, rows: r })));
        return;
      }
    } catch (_) {}
    // Fallback if the socket wasn't captured: nudge via xterm (visible, but works).
    try { t.resize(c0, r); t.resize(c, r); } catch (_) {}
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

  if (!isTouch) {
    // Desktop: double-click re-claims the shared PTY's shape for THIS device
    // (see claimSize) — needed because terminal N is one shared PTY owned by
    // whichever device resized last, so the desktop otherwise shows the phone's
    // shape (and vice-versa) until app re-activation.
    window.addEventListener('dblclick', claimSize);

    // The catch on Windows Chromium: ANY t.resize() (claimSize's, OR the
    // desktop's re-fit on activation/refresh, OR a window resize) blurs xterm's
    // hidden input textarea and it never regains focus, so the terminal goes
    // untypable — which is why double-click broke typing AND a plain refresh
    // broke typing on Windows while macOS/touch were fine (they restore focus).
    // Cure the root: re-focus xterm right after any resize, but only while this
    // page actually has focus so we never steal focus from another app. This is
    // what makes the reshape gesture safe to keep.
    var pollTries = 0;
    var poll = setInterval(function () {
      var t = window.term;
      // Give up after ~30s (500 × 60ms) if ttyd never sets window.term, rather
      // than polling forever on a page where xterm never initialised.
      if (!t) { if (++pollTries > 500) clearInterval(poll); return; }
      clearInterval(poll);
      try {
        t.onResize(function () {
          setTimeout(function () {
            try { if (document.hasFocus()) t.focus(); } catch (_) {}
          }, 0);
        });
      } catch (_) {}
    }, 60);
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
    // Transparent full-height overlay that captures typing/dictation/gestures.
    // The terminal's visibility above the keyboard is handled by shifting the
    // terminal CONTENT up (applyShift), not by parking this textarea's caret and
    // hoping iOS auto-scrolls — that was unreliable through the nested iframe and
    // kept hiding the prompt. So this layer is a plain full-height capture surface.
    ov.style.cssText = 'position:absolute;left:0;right:0;top:0;height:100%;box-sizing:border-box;' +
      'z-index:2147482000;background:transparent;color:transparent;caret-color:transparent;' +
      'border:0;outline:0;resize:none;margin:0;padding:0 6px;font-size:16px;overflow:hidden;' +
      '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';  // stop iOS's own long-press selection/loupe
    document.body.appendChild(ov);

    // Slide the terminal's content up by `px` so its bottom rows (the prompt)
    // sit ABOVE the desktop key bar + iOS keyboard chrome, then back to 0 when
    // the keyboard hides. The desktop computes `px` from the bar's REAL geometry
    // (keyboard inset + accessory clearance + bar height) and sends {type:
    // 'kbd-shift'} — fully deterministic, no dependence on iOS auto-scrolling a
    // focused input (which doesn't work reliably 3 iframes deep). A CSS transform
    // (not a resize/scroll) leaves xterm's grid + the shared PTY size untouched,
    // and getBoundingClientRect stays transform-aware so taps still map to cells.
    function applyShift(px) {
      var t = window.term; if (!t || !t.element) return;
      t.element.style.transition = 'transform .15s ease-out';
      t.element.style.transform = px > 0 ? ('translateY(-' + Math.round(px) + 'px)') : '';
    }

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

    // The arrow/Esc/Ctrl key bar lives at the DESKTOP level (a system-wide
    // accessory in desktop.html, so it sits below the whole vibetop UI and works
    // across apps) rather than overlapping the terminal here. The desktop routes
    // each tap down as {type:'kbd-key', key:<name>}; map it to the PTY bytes.
    // sendRaw works regardless of focus, so the bar never has to hold the caret.
    var KBD_KEY_BYTES = {
      Escape: '\x1b', Tab: '\x09', CtrlC: '\x03', Enter: '\r', Backspace: '\x7f',
      ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D'
    };
    window.addEventListener('message', function (e) {
      var d = e.data; if (!d) return;
      if (d.type === 'kbd-key' && KBD_KEY_BYTES[d.key]) {
        sendRaw(KBD_KEY_BYTES[d.key]); dbg(' <' + d.key + '> ');
      } else if (d.type === 'kbd-shift') {
        applyShift(+d.px || 0);
      }
    });

    // Tell the desktop to show/hide its system key bar. The desktop can't measure
    // the keyboard itself (its top-level visualViewport doesn't shrink for a
    // keyboard raised by THIS nested iframe), so report the inset — the keyboard
    // height = layout height minus the visible viewport — which OUR vv does know.
    function reportBar(show) {
      var vv = window.visualViewport;
      var inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      try { window.parent.postMessage({ type: 'kbd-bar', show: show, inset: inset }, '*'); } catch (_) {}
    }
    ov.addEventListener('focus', function () {
      reportBar(true);
      setTimeout(function () { if (document.activeElement === ov) reportBar(true); }, 300); // after the keyboard animates in
    });
    ov.addEventListener('blur', function () { reportBar(false); applyShift(0); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        if (document.activeElement === ov) reportBar(true);   // keyboard settled/changed height
      });
    }

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

  var ivTries = 0;
  var iv = setInterval(function () {
    if (window.term && document.body) { clearInterval(iv); init(); return; }
    // Stop after ~60s (600 × 100ms): if xterm never came up, the overlay can't
    // attach, so keep the interval from running for the life of a dead page.
    if (++ivTries > 600) clearInterval(iv);
  }, 100);
})();
