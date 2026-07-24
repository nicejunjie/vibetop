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

  // Loading bar — a thin animated bar across the top of the terminal while it
  // (re)connects and replays its ring buffer, so a slow replay (a busy session, a
  // phone waking several tabs at once) never just looks like a blank/frozen/dead
  // screen. Runs on EVERY device (this is above the touch-only branch). It's shown
  // per ttyd WebSocket (each (re)connect replays), after a short delay so an instant
  // connect doesn't flash it, and hidden the moment the replay burst goes idle — or
  // after a cap, so a terminal producing continuous output can't pin it up.
  var _bar = null, _barCss = false;
  function _barEl() {
    if (!_barCss) {
      _barCss = true;
      var st = document.createElement('style');
      st.textContent =
        '#vt-load{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483600;' +
        'background:rgba(255,255,255,.06);overflow:hidden;pointer-events:none;opacity:0;transition:opacity .18s}' +
        '#vt-load.on{opacity:1}' +
        '#vt-load::before{content:"";position:absolute;top:0;bottom:0;left:0;width:35%;border-radius:3px;' +
        'background:#0a84ff;animation:vt-ld 1.1s ease-in-out infinite}' +
        '@keyframes vt-ld{0%{left:-35%}55%{left:70%}100%{left:105%}}';
      (document.head || document.documentElement).appendChild(st);
    }
    if (!_bar) { _bar = document.createElement('div'); _bar.id = 'vt-load'; (document.body || document.documentElement).appendChild(_bar); }
    return _bar;
  }
  function _barShow() { try { _barEl().classList.add('on'); } catch (_) {} }
  function _barHide() { try { if (_bar) _bar.classList.remove('on'); } catch (_) {} }
  function loadingBar(ws) {
    var idle = null, cap = null, done = false;
    var show = setTimeout(_barShow, 160);   // don't flash on an instant connect
    function fin() {
      if (done) return; done = true;
      clearTimeout(show); if (idle) clearTimeout(idle); if (cap) clearTimeout(cap);
      _barHide();
      try { ws.removeEventListener('message', onmsg); } catch (_) {}
    }
    function onmsg() { if (idle) clearTimeout(idle); idle = setTimeout(fin, 300); }  // replay burst ended
    try {
      ws.addEventListener('message', onmsg);
      ws.addEventListener('close', fin);
      ws.addEventListener('error', fin);
    } catch (_) {}
    cap = setTimeout(fin, 8000);   // backstop: never pin the bar on continuous output
  }

  // Auto-refit self-heal (desktop). Re-run ttyd's FitAddon by dispatching a
  // 'resize' — the SAME heal the desktop already does on app-activation — but fire
  // it automatically on the events that let the terminal drift to a wrong width
  // WHILE you're looking at it: after a (re)connect's ring-buffer replay (which can
  // render at a stale width — the "the screen wrapped itself, I did nothing" bug),
  // a layout/scrollbar change, and the tab returning to the foreground. So you no
  // longer have to switch apps and back to un-wrap it. Guarded to non-zero size;
  // ttyd only resizes the PTY when the computed cols/rows ACTUALLY change, so a
  // steady terminal sees no churn (no "shake") and a same-size refit is a no-op.
  // Mobile keeps its own keyboard/caret-aware resize path (two-finger claim), so
  // this is desktop-only. (function declarations → hoisted, usable below.)
  function reFit() {
    try {
      var t = window.term;
      if (t && t.element && t.element.clientWidth > 0) window.dispatchEvent(new Event('resize'));
    } catch (_) {}
  }
  var _refitT = null;
  function reFitSoon() { if (_refitT) clearTimeout(_refitT); _refitT = setTimeout(reFit, 180); }

  // Capture ttyd's WebSocket (this script runs at end of <head>, before ttyd opens
  // the socket on load) so claimSize can re-send the terminal size straight to the
  // PTY without resizing the visible terminal.
  var ttydWS = null;
  (function () {
    var Native = window.WebSocket; if (!Native) return;
    function WS(url, proto) {
      var ws = (proto === undefined) ? new Native(url) : new Native(url, proto);
      try {
        ttydWS = ws; loadingBar(ws);
        // Re-fit after a (re)connect's replay settles so the buffer isn't left
        // rendered at a stale width. Desktop only.
        if (!isTouch) ws.addEventListener('open', function () { setTimeout(reFit, 500); });
      } catch (_) {}
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
      // Auto-refit self-heal (see reFit above): re-fit when the terminal's own box
      // resizes (a scrollbar appearing, any layout shift) or the tab comes back to
      // the foreground — so a width drift un-wraps itself without switching apps.
      try {
        if (window.ResizeObserver && t.element) {
          var ro = new ResizeObserver(function () { reFitSoon(); });
          ro.observe(t.element);
          if (t.element.parentElement) ro.observe(t.element.parentElement);
        }
      } catch (_) {}
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reFitSoon(); });
      window.addEventListener('pageshow', function () { reFitSoon(); });
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
        // If the user has scrolled UP into scrollback, do NOTHING. positionCaret's
        // only job is revealing the PROMPT while you type at the bottom; up in
        // history it fights you: a TUI (Claude Code, htop, …) repaints in place, so
        // the cursor moves on every frame → this fires → it re-parks the caret at
        // the bottom and iOS re-reveals it, yanking your view back down. That is the
        // mobile-only "can't scroll a live response" bug — desktop has no overlay/
        // caret/reveal, so its scroll just holds (which is why desktop was fine).
        var ba = t.buffer && t.buffer.active;
        if (ba && (ba.baseY - ba.viewportY) > 1) return;
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
        // Undo a STALE document scroll — but ONLY when it's safe, never when it's
        // iOS's live keyboard reveal. iOS scrolls the document to keep the focused
        // caret above the keyboard, but only on user caret events, never when WE move
        // the caret. Two cases leave a wrong scroll that we must correct:
        //   (1) the cursor jumps to the TOP (`clear`/Ctrl-L/TUI redraw) while the doc
        //       is still scrolled down from a deep caret → the terminal is pushed off
        //       the top of the screen (the blank-after-clear bug), and
        //   (2) the keyboard is DOWN, so no reveal is wanted and the scroll belongs at 0.
        // CRUCIAL REGRESSION FIX: when the keyboard is UP and the caret is mid/deep
        // screen, do NOT touch the scroll — that IS iOS's live reveal. The earlier
        // `y <= visH - rh` test fired for almost any caret (the nested iframe's
        // visualViewport doesn't shrink, so visH is the full height), so it fought
        // the reveal for a normal TUI input a few rows from the bottom — shoving the
        // active line behind the keyboard and making it jump on every keystroke.
        var se = document.scrollingElement || document.documentElement;
        var kbDown = (document.activeElement !== ov);
        if (se && se.scrollTop !== 0 && (cy <= 2 || kbDown)) se.scrollTop = 0;
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

    var lastInputTs = 0;
    // Input-forwarding state machine (value-diff + IME/dictation gating) — DOM-free
    // and UNIT-TESTED in terminal/lib/kbd-input.test.js, loaded here via the
    // <script src="/kbd-input.js"> the sub_filter injects before this file. It is the
    // single source of truth for "which bytes reach the PTY", so the IME rule (raw
    // pinyin is NEVER echoed mid-composition) can't silently regress again. sendRaw
    // emits to the PTY; dbg mirrors each byte into the debug overlay when enabled.
    var fwd = (window.TerminalKbdInput && window.TerminalKbdInput.create)
      ? window.TerminalKbdInput.create(function (b) {
          sendRaw(b);
          if (dbgEl) dbg(b === String.fromCharCode(127) ? '<BS>' : b);
        })
      : { input: function () {}, compositionStart: function () {}, compositionEnd: function () {},
          enter: function () {}, tab: function () {}, backspaceEmpty: function () {}, reset: function () {} };
    // resetBaseline: reset the value-diff mirror AND clear the overlay so the next
    // keystroke is a clean delta from the shell's real cursor. Call whenever the line
    // changed out-of-band (cursor moved by trackpad/arrows, ^C/Esc/Tab, or the tab
    // returned from the background). Without it the next diff emits spurious
    // backspaces or dumps a bundle (the "slide breaks typing / wrong place" reports).
    function resetBaseline() { fwd.reset(); ov.value = ''; }

    // On a GENUINE (re)focus — the start of a new typing session — reset the
    // value-diff baseline so the first char is sent as-is. Stale lastSent/ov.value
    // from a prior session made the first letter's diff wrong (spurious backspaces
    // or a swallowed char): the occasional dropped-first-letter. SKIP this on the
    // focusin guard's bounce re-focus (window.__termBouncing), which fires every
    // time xterm steals focus mid-typing — resetting then would wipe in-flight
    // input. Always re-anchor the caret either way.
    ov.addEventListener('focus', function () {
      positionCaret();
      // Preserve the in-flight baseline ONLY for a rapid bounce DURING active typing
      // (xterm keeps stealing focus mid-keystroke and the focusin guard bounces it
      // back here — resetting then would wipe the char in flight). A bounce that
      // arrives after an idle gap — a WS reconnect, or the tab returning from the
      // background on a device switch — is NOT mid-typing, so the mirror is stale and
      // MUST be reset or the next diff corrupts the line. Time since the last real
      // keystroke distinguishes the two (active typing bounces within milliseconds).
      if (window.__termBouncing && (Date.now() - lastInputTs) < 1500) return;
      resetBaseline();
    });

    // IME/dictation + value-diff forwarding — all in kbd-input.js (the fwd machine),
    // where the rules are pinned by unit tests. The handlers here only translate DOM
    // events into fwd calls + drive the debug overlay. The cardinal rule lives in
    // fwd: during composition (pinyin/zhuyin/kana) NOTHING is forwarded until
    // compositionend, so the raw pinyin never echoes into the shell before selection.
    ov.addEventListener('compositionstart', function () { dbg(' (cs)'); fwd.compositionStart(); });
    ov.addEventListener('compositionend', function () { dbg(' (ce)'); fwd.compositionEnd(ov.value); });
    ov.addEventListener('input', function (e) {
      lastInputTs = Date.now();
      if (dbgEl) dbg(' i[' + JSON.stringify(ov.value) + ' c=' + (e && e.isComposing) + ']');
      fwd.input(ov.value, !!(e && e.isComposing));
    });
    ov.addEventListener('keydown', function (e) {
      lastInputTs = Date.now();
      if (e.key === 'Enter') { e.preventDefault(); fwd.enter(ov.value); ov.value = ''; dbg(' <ENTER> '); }
      else if (e.key === 'Tab') { e.preventDefault(); fwd.tab(); dbg(' <TAB> '); }
      else if (e.key === 'Backspace' && ov.value === '') { e.preventDefault(); fwd.backspaceEmpty(); }
    });
    // Returning from the background (the common "device switch" path on iOS) may have
    // reconnected the WS and redrawn the shell line — the mirror is stale, so reset it.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') resetBaseline();
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
      if (d && d.type === 'kbd-key' && KBD_KEY_BYTES[d.key]) {
        sendRaw(KBD_KEY_BYTES[d.key]); dbg(' <' + d.key + '> ');
        // The system key bar / arrow-key trackpad just moved the shell cursor or
        // reshaped the line (Ctrl+F/B, arrows, ^C, Esc, Tab) — the overlay's mirror
        // no longer matches, so reset it. Without this a slide followed by typing
        // diffs against a stale baseline and corrupts the line (the reported
        // "touch slide interferes with the keyboard").
        resetBaseline();
      }
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
        // try/finally so a throwing execCommand can't leave __allowCopy stuck true
        // (which would re-enable ttyd's copy-on-select clipboard clobber for the
        // rest of the page's life — the gate exists precisely to suppress that).
        try { window.__allowCopy = true; document.execCommand('copy'); }
        finally { window.__allowCopy = false; }
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
    var didScroll = false;   // did this gesture actually scroll the scrollback (vs a tap)
    // Resize gesture is the TWO-FINGER tap: it raises NO keyboard, so it's safe with
    // the keyboard hidden. Single-finger double-tap is deliberately NOT a resize —
    // it belongs to iOS's native text selection / Paste bubble on the editable
    // overlay, and fighting it (the old keyboard-up double-tap) also popped that menu.
    var twoFinger = false, twoFingerStart = 0;
    ov.addEventListener('touchstart', function (e) {
      if (e.touches.length >= 2) {                 // two fingers → resize gesture (no keyboard)
        twoFinger = true; twoFingerStart = Date.now();
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        selecting = false;
        return;
      }
      twoFinger = false;
      var c = e.touches[0];
      startX = c.clientX; startY = prevY = c.clientY; acc = 0; moved = false; selecting = false; anchor = null;
      // Capture the cell NOW, while the finger position and the layout agree. If
      // this becomes a long-press the keyboard animates up and scrolls the
      // terminal, so re-measuring later (at the 450ms timer) would map the stale
      // finger-y onto the shifted rows and select ~2 rows too low.
      startCell = cellAt(startX, startY);
      didScroll = false;
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
      if (twoFinger) { e.preventDefault(); return; }   // two-finger resize gesture: ignore scroll/select
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
        while (acc > 18) { t.scrollLines(-1); acc -= 18; didScroll = true; }
        while (acc < -18) { t.scrollLines(1); acc += 18; didScroll = true; }
      }
      if (moved) e.preventDefault();
    }, { passive: false });
    ov.addEventListener('touchend', function (e) {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      var ct = e.changedTouches[0], now = Date.now();

      // TWO-FINGER TAP → re-claim the terminal shape. Two fingers never focus the
      // textarea, so the keyboard never rises — this is the reliable way to resize
      // when the keyboard is HIDDEN (a single-finger double-tap there raises the
      // keyboard, and the 2nd tap lands on the just-risen keyboard and types a stray
      // key). preventDefault every touchend of the gesture so no stray focus; fire
      // once ALL fingers have lifted.
      if (twoFinger) {
        e.preventDefault();
        if (e.touches.length === 0) {              // last finger up → gesture complete
          var d2 = now - twoFingerStart; twoFinger = false;
          if (d2 < 600) { flash('↔ resized'); claimSize(); }   // hint stays until the user taps it (or the max-showings cap)
        }
        return;
      }

      // Long-press selection just ended → finalize it; it is never a tap.
      if (selecting) {
        selecting = false;
        e.preventDefault();                         // don't raise the keyboard
        try { ov.blur(); } catch (_) {}             // and dismiss it if iOS raised it during the long-press
        var ts = window.term;
        if (ts && ts.hasSelection()) { showCopy(ct.clientX, ct.clientY); showHandles(selStart, selEnd); }
        return;
      }

      // A gesture that actually SCROLLED the scrollback is not a tap — skip the tap
      // handling below. We gate on a real scroll (didScroll), not finger drift, so a
      // brief tap that merely drifted (e.g. the keyboard animating in) still counts.
      if (didScroll) return;

      // A tap ON a URL opens it in the Browser (no keyboard).
      var url = startCell && urlAt(startCell);
      if (url) {
        e.preventDefault();
        try { ov.blur(); } catch (_) {}
        try { window.open(url); } catch (_) {}
        flash('↗ opening link');
        return;
      }

      // SINGLE tap: dismiss any active (long-press) selection and let iOS raise the
      // keyboard natively (no preventDefault) so tapping to type stays instant. A
      // single-finger double-tap is intentionally left to iOS (native Paste bubble /
      // word select) — it is NOT a resize; use the two-finger tap above for that.
      try { if (window.term && window.term.hasSelection()) window.term.clearSelection(); } catch (_) {}
      hideHandles();
    }, { passive: false });

    // Coach tips for the terminal's undiscoverable gestures, via the SHARED vibeCoach
    // helper (coach.js, injected before this script by terminal/install.sh's sub_filter).
    // Three touch tips ROTATE (one per open) so each gets airtime — one banner at a
    // time. Each shows every open until its × is tapped (persists 'done'), with a
    // max-showings cap. The two-finger tip keeps its original key ('…:2fingerhint:v2')
    // so anyone who already dismissed it stays dismissed. (The show-until-×/cap/
    // versioned-key logic used to be inline here; it now lives once in coach.js.)
    function coachTerminal() {
      if (!window.vibeCoach) return;
      var host = window.term && window.term.element;   // skip while the terminal isn't laid out (Terminal app hidden)
      if (!host || host.getBoundingClientRect().height < 40) return;
      window.vibeCoach([
        { key: 'vibetop:2fingerhint:v2', text: 'Tip: two-finger tap to resize the terminal to this screen' },
        { key: 'vibetop:tip:term-link:v1', text: 'Tip: tap a link in the terminal to open it in the Browser' },
        { key: 'vibetop:tip:term-copy:v1', text: 'Tip: long-press to select text, then tap Copy' }
      ], { surface: 'terminal', rotate: true });
    }
    setTimeout(coachTerminal, 1800);   // after the terminal has settled (it loads only when the app is opened = visible)
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(coachTerminal, 600); });

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
