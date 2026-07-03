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
    // Transparent overlay. Its caret is parked on the actual xterm cursor row via
    // a dynamic padding-top (positionCaret), so iOS auto-scrolls the shell to
    // reveal the real prompt line above the keyboard. The desktop's system key
    // bar sits in that same strip just above the keyboard, so we park the caret
    // an extra KBD_BAR_RESERVE px BELOW the prompt — iOS then scrolls the prompt
    // that much higher, clearing the bar so it never covers the line you type on
    // (the textarea is taller than the terminal to make room for the offset).
    var KBD_BAR_RESERVE = 64;   // desktop bar height (~50) + margin; keep in sync with desktop BAR_H
    ov.style.cssText = 'position:absolute;left:0;right:0;top:0;height:calc(100% + ' + KBD_BAR_RESERVE + 'px);box-sizing:border-box;' +
      'z-index:2147482000;background:transparent;color:transparent;caret-color:transparent;' +
      'border:0;outline:0;resize:none;margin:0;padding:0 6px;font-size:16px;overflow:hidden;' +
      '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';  // stop iOS's own long-press selection/loupe
    document.body.appendChild(ov);

    // This overlay is THE terminal input on touch. xterm's hidden helper textarea
    // keeps grabbing focus (on WS-connect, renders, etc.); the focusin guard in
    // terminal/install.sh bounces that stolen focus BACK here — but ONLY while
    // "armed" (after the user has genuinely tapped to type), so the keyboard
    // doesn't pop up on page load. Before this, the guard blurred the helper to
    // <body>, leaving NO focused input, so keystrokes were silently dropped (the
    // terminal-only typing-fails / first-char-lost bug). Disarm on app-switch.
    try { window.__termOverlay = ov; } catch (_) {}
    ov.addEventListener('focus', function () { try { window.__termArmed = true; } catch (_) {} });
    window.addEventListener('blur', function () { try { window.__termArmed = false; } catch (_) {} });

    // Park the textarea caret KBD_BAR_RESERVE px below the xterm cursor row, so
    // iOS reveals the prompt line that much above the keyboard — clear of the bar.
    function positionCaret() {
      var t = window.term;
      try {
        var rows = t.rows || 24;
        var h = t.element ? t.element.getBoundingClientRect().height : window.innerHeight;
        var rh = h / rows;
        var cy = (t.buffer && t.buffer.active) ? t.buffer.active.cursorY : rows - 1;
        var y = Math.max(0, Math.min(h - rh, cy * rh)) + KBD_BAR_RESERVE;
        var p = Math.round(y) + 'px';
        // Only write when it actually changes. cursorY changes on a newline/wrap,
        // NOT on every character, so same-row typing no longer mutates paddingTop
        // — which stops iOS reveal-scrolling on every keystroke (the typing-lag
        // cause once the overlay became taller-than-viewport / scrollable).
        if (ov.style.paddingTop !== p) ov.style.paddingTop = p;
      } catch (_) {}
    }
    // Re-anchor the caret to the cursor row ONLY when the cursor actually moves
    // (i.e. when you type) — NOT on every render. Render fires on scroll too, and
    // re-anchoring there made iOS yank the view back to the prompt the instant you
    // dragged, so you couldn't scroll while the keyboard was up. Typing moves the
    // cursor → re-anchor → your line stays visible; scrolling doesn't → the view
    // stays where you put it.
    try { if (window.term.onCursorMove) window.term.onCursorMove(positionCaret); } catch (_) {}
    window.addEventListener('resize', positionCaret);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', positionCaret);
    positionCaret();

    var lastSent = '', composing = false, timer = null;
    function flush() {
      timer = null;
      var v = ov.value;
      if (dbgEl) dbg(' {in=' + JSON.stringify(v) + ' last=' + JSON.stringify(lastSent) + '}> ');
      // Ignore iOS dictation's transient clear-to-"" between revisions — but ONLY
      // while composing. Outside composition an empty value is a genuine line
      // clear and must emit the backspaces (else ov and the PTY desync).
      if (v === '' && lastSent !== '' && composing) return;
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

    // On a GENUINE (re)focus — the start of a new typing session — reset the
    // value-diff baseline so the first char is sent as-is. Stale lastSent/ov.value
    // from a prior session made the first letter's diff wrong (spurious backspaces
    // or a swallowed char): the occasional dropped-first-letter. SKIP this on the
    // focusin guard's bounce re-focus (window.__termBouncing), which fires every
    // time xterm steals focus mid-typing — resetting then would wipe in-flight
    // input. Always re-anchor the caret either way.
    ov.addEventListener('focus', function () {
      positionCaret();
      if (window.__termBouncing) return;
      ov.value = ''; lastSent = ''; composing = false;
      if (timer) { clearTimeout(timer); timer = null; }
    });

    ov.addEventListener('compositionstart', function () { dbg(' (cs)'); composing = true; });
    ov.addEventListener('compositionend', function () { dbg(' (ce)'); composing = false; sched(40); });
    ov.addEventListener('input', function (e) {
      if (dbgEl) dbg(' i[' + JSON.stringify(ov.value) + ' c=' + (e && e.isComposing) + ']');
      // Normal typing: flush IMMEDIATELY so the keystroke round-trips to the PTY
      // with no artificial delay — as snappy as a native field, minus only the
      // unavoidable PTY-echo round-trip (the shell, not the browser, renders the
      // char). Only dictation/IME (composing) keeps a debounce so its streamed
      // revisions are batched instead of sent as half-words.
      if (composing || (e && e.isComposing)) { sched(400); }
      else { if (timer) { clearTimeout(timer); timer = null; } flush(); }
    });
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); flush(); sendRaw(String.fromCharCode(13)); clr(); dbg(' <ENTER> '); }
      else if (e.key === 'Tab') { e.preventDefault(); sendRaw(String.fromCharCode(9)); dbg(' <TAB> '); }
      else if (e.key === 'Backspace' && ov.value === '') { e.preventDefault(); sendRaw(String.fromCharCode(127)); }
    });

    // System key bar: rendered AND shown/hidden/positioned by the desktop, which
    // watches its OWN top-level visualViewport for the keyboard. The nested-iframe
    // visualViewport here does NOT shrink when the keyboard appears on iOS
    // (confirmed on-device: vvH stays at the iframe height, inset always 0), so
    // the terminal can't detect or position the keyboard — the top frame can. We
    // just receive the taps and turn them into PTY bytes (arrows = normal-mode
    // cursor sequences).
    var KBD_KEY_BYTES = {
      Escape: '\x1b', Tab: '\x09', CtrlC: '\x03', Enter: '\r', Backspace: '\x7f',
      ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
      CtrlB: '\x02', CtrlF: '\x06'   // emacs/readline backward-char / forward-char (cursor move, NOT the arrow-menu)
    };
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (d && d.type === 'kbd-key' && KBD_KEY_BYTES[d.key]) { sendRaw(KBD_KEY_BYTES[d.key]); dbg(' <' + d.key + '> '); }
    });

    // The overlay covers xterm and would eat every touch, so route by gesture:
    // quick tap → keyboard; vertical drag → scrollback; long-press → select the
    // WORD under the finger (drag to extend), then a floating Copy button.
    function cellAt(x, y) {
      var t = window.term, el = t && t.element;
      if (!el) return null;
      // Measure the .xterm-screen (the actual rows), NOT .element — the latter
      // includes ~5px top + ~8px bottom padding, which skews both the origin and
      // the per-row height (drifts up to a row toward the bottom).
      var scr = el.querySelector('.xterm-screen') || el;
      var r = scr.getBoundingClientRect();
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
    // Reassemble the LOGICAL line a cell sits on — a long URL wraps across several
    // visual rows (isWrapped), so we walk back to the wrap start and forward
    // through the continuations, using full-width (untrimmed) rows so column
    // offsets stay aligned. Returns { str, offset } (offset = the cell's index
    // into str), or null.
    function logicalLineAt(cell) {
      try {
        var buf = window.term.buffer.active, start = cell.row;
        while (start > 0) { var ln = buf.getLine(start); if (ln && ln.isWrapped) start--; else break; }
        var str = '', offset = -1, r = start;
        while (true) {
          var line = buf.getLine(r);
          if (!line) break;
          if (r === cell.row) offset = str.length + cell.col;
          str += line.translateToString(false);   // full width → predictable offsets
          var nx = buf.getLine(r + 1);
          if (nx && nx.isWrapped) r++; else break;
        }
        return offset < 0 ? null : { str: str, offset: offset };
      } catch (_) { return null; }
    }
    // The http(s) URL the tapped cell falls inside, or null. Mirrors the desktop
    // web-links behaviour so a tap opens the same link a Cmd/Ctrl+click would.
    function urlAt(cell) {
      var L = logicalLineAt(cell);
      if (!L) return null;
      var re = /https?:\/\/[^\s"'<>`(){}\[\]]+/g, m;
      while ((m = re.exec(L.str))) {
        if (L.offset >= m.index && L.offset < m.index + m[0].length) {
          return m[0].replace(/[.,;:!?'")\]]+$/, '');   // trim trailing punctuation
        }
      }
      return null;
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
        document.body.appendChild(ta); ta.select();
        window.__allowCopy = true; document.execCommand('copy'); window.__allowCopy = false;  // pass the sub_filter copy gate
        document.body.removeChild(ta);
      } catch (_) {}
    }
    copyBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var t = window.term;
      doCopy(t && t.hasSelection() ? t.getSelection() : '');
      hideCopy(); hideHandles();
      try { t.clearSelection(); } catch (_) {}
    });

    // --- iOS-style draggable selection handles -----------------------------
    // Each end gets an iOS-style handle: a thin 2px stem the height of the edge
    // cell (marks the boundary, hides no content) capped by a small knob that
    // sits ABOVE the start / BELOW the end, off the text line. Dragging a knob
    // moves that endpoint. selStart/selEnd are absolute buffer cells so the
    // handles track scrollback (onScroll -> positionHandles) and hide off-screen.
    var selStart = null, selEnd = null, hStart = null, hEnd = null, handlesOn = false, KNOB = 34;
    function scrGeom() {
      var t = window.term, el = t && t.element; if (!el) return null;
      var scr = el.querySelector('.xterm-screen') || el, r = scr.getBoundingClientRect();
      return { r: r, rowH: r.height / t.rows, colW: r.width / t.cols,
               vpY: (t.buffer && t.buffer.active && t.buffer.active.viewportY) || 0, rows: t.rows };
    }
    function edgePx(cell, atEnd) {   // buffer cell -> {x, yTop, rowH} of its left/right edge (null if off-view)
      var g = scrGeom(); if (!g) return null;
      var vr = cell.row - g.vpY;
      if (vr < 0 || vr >= g.rows) return null;
      return { x: g.r.left + (cell.col + (atEnd ? 1 : 0)) * g.colW, yTop: g.r.top + vr * g.rowH, rowH: g.rowH };
    }
    function cellCenterY(cell) { var e = edgePx(cell, false); return e ? e.yTop + e.rowH / 2 : null; }
    function before(a, b) { return a.row < b.row || (a.row === b.row && a.col < b.col); }
    function placeHandle(h, cell, isEnd) {
      var e = cell && edgePx(cell, isEnd);
      if (!e) { h.style.display = 'none'; return; }
      h.style.display = 'block';
      h.style.left = e.x + 'px'; h.style.top = e.yTop + 'px';
      h._stem.style.height = e.rowH + 'px';
      h._grab.style.top = (isEnd ? e.rowH : -KNOB) + 'px';
    }
    function positionHandles() {
      if (!handlesOn || !hStart) return;
      if (!hStart._dragging) placeHandle(hStart, selStart, false);
      if (!hEnd._dragging) placeHandle(hEnd, selEnd, true);
    }
    function hideHandles() { handlesOn = false; if (hStart) hStart.style.display = 'none'; if (hEnd) hEnd.style.display = 'none'; }
    function makeHandle(isEnd) {
      var h = document.createElement('div');   // anchor at the cell edge; stem + knob overflow it
      h.style.cssText = 'position:fixed;z-index:2147483646;width:0;height:0;display:none;pointer-events:none';
      var stem = document.createElement('div');
      stem.style.cssText = 'position:absolute;left:-1px;top:0;width:2px;background:#2d6cc0;pointer-events:none';
      var grab = document.createElement('div');   // transparent hit target holding the visible knob
      grab.style.cssText = 'position:absolute;left:' + (-KNOB / 2) + 'px;width:' + KNOB + 'px;height:' + KNOB + 'px;' +
        'pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none';
      var dot = document.createElement('div');   // small knob capping the stem (above start / below end)
      dot.style.cssText = 'position:absolute;left:' + ((KNOB - 13) / 2) + 'px;' + (isEnd ? 'top:1px;' : 'bottom:1px;') +
        'width:13px;height:13px;border-radius:50%;background:#2d6cc0;box-shadow:0 0 0 1.5px #fff,0 1px 3px rgba(0,0,0,.4)';
      grab.appendChild(dot); h.appendChild(stem); h.appendChild(grab);
      document.body.appendChild(h);
      h._stem = stem; h._grab = grab;
      var offY = 0;
      grab.addEventListener('touchstart', function (e) {
        e.preventDefault(); e.stopPropagation(); h._dragging = true; hideCopy();
        var refY = cellCenterY(isEnd ? selEnd : selStart);   // pin the finger's offset from the cell center → no jump on grab
        offY = (refY != null) ? (e.touches[0].clientY - refY) : 0;
      }, { passive: false });
      grab.addEventListener('touchmove', function (e) {
        if (!h._dragging) return; e.preventDefault(); e.stopPropagation();
        var c = e.touches[0], cell = cellAt(c.clientX, c.clientY - offY);   // track the same point on the cell we grabbed
        if (!cell) return;
        if (isEnd) { if (before(cell, selStart)) cell = selStart; selEnd = cell; }   // clamp: never cross
        else       { if (before(selEnd, cell)) cell = selEnd; selStart = cell; }
        try { applySel(selStart, selEnd); } catch (_) {}
        placeHandle(h, cell, isEnd);
      }, { passive: false });
      grab.addEventListener('touchend', function (e) {
        if (!h._dragging) return; e.preventDefault(); e.stopPropagation(); h._dragging = false;
        var ct = e.changedTouches[0];
        if (window.term && window.term.hasSelection()) showCopy(ct.clientX, ct.clientY - 44);
        positionHandles();
      }, { passive: false });
      return h;
    }
    function showHandles(s, en) {
      if (!hStart) { hStart = makeHandle(false); hEnd = makeHandle(true); }
      selStart = s; selEnd = en;
      if (before(selEnd, selStart)) { var t = selStart; selStart = selEnd; selEnd = t; }   // order start<=end
      handlesOn = true; hStart._dragging = false; hEnd._dragging = false;
      positionHandles();
    }
    try { window.term.onScroll(positionHandles); } catch (_) {}   // follow scrollback

    var startX = 0, startY = 0, prevY = 0, acc = 0, moved = false, lpTimer = null, selecting = false, anchor = null, startCell = null;
    var lastTapTime = 0, lastTapX = 0, lastTapY = 0, tStart = 0;   // for double-tap (claimSize)
    ov.addEventListener('touchstart', function (e) {
      var c = e.touches[0];
      startX = c.clientX; startY = prevY = c.clientY; acc = 0; moved = false; selecting = false; anchor = null;
      // Capture the cell NOW, while the finger position and the layout agree. If
      // this becomes a long-press the keyboard animates up and scrolls the
      // terminal, so re-measuring later (at the 450ms timer) would map the stale
      // finger-y onto the shifted rows and select ~2 rows too low.
      startCell = cellAt(startX, startY);
      tStart = Date.now();
      hideCopy();
      if (lpTimer) clearTimeout(lpTimer);
      lpTimer = setTimeout(function () {            // held still ~0.45s → select the word
        if (moved) return;
        selecting = true;
        try { ov.blur(); } catch (_) {}            // selecting, not typing — dismiss the keyboard (iOS focuses the overlay on touch)
        hideHandles();                              // drop any prior selection's handles
        var cell = startCell;                       // captured at touchstart, before any keyboard-driven scroll
        if (cell) {
          var w = wordAt(cell);
          anchor = w.s; selStart = w.s; selEnd = w.e;
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
        if (cur && anchor) { applySel(anchor, cur); selStart = anchor; selEnd = cur; }
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
        try { ov.blur(); } catch (_) {}             // and dismiss it if iOS raised it during the long-press
        var t = window.term;
        if (t && t.hasSelection()) { showCopy(ct.clientX, ct.clientY); showHandles(selStart, selEnd); }
      } else if (!moved) {                          // single tap
        // If the tap landed on a URL, open it in the Browser instead of raising
        // the keyboard — the touch equivalent of the desktop's Cmd/Ctrl+click.
        // window.open is overridden by the /tN/ sub_filter to POST
        // /api/browser/open + switch to the Browser app (same path as desktop).
        var cell = startCell;   // captured at touchstart (consistent with the finger position)
        var url = cell && urlAt(cell);
        if (url) {
          e.preventDefault();
          try { ov.blur(); } catch (_) {}           // don't pop the keyboard
          try { window.open(url); } catch (_) {}
          flash('↗ opening link');
          return;
        }
        try { if (window.term && window.term.hasSelection()) window.term.clearSelection(); } catch (_) {}
        hideHandles();  // tapping elsewhere dismisses the selection + its handles, then the keyboard comes up
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
