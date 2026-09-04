/* Pure input-forwarding state machine for the mobile terminal overlay
 * (terminal-kbd.js). DOM-free + unit-tested so the fragile IME / value-diff
 * behaviour that kept regressing is pinned.
 *
 * The mobile terminal lays a transparent <textarea> over xterm so iOS raises the
 * keyboard and IME/dictation buffer natively. This module turns the textarea's
 * value changes + composition events into the exact byte stream sent to the PTY:
 *   - normal typing  -> each new char sent immediately (value-diff delta)
 *   - editing        -> code-point-aware backspaces for the removed tail
 *   - IME composition (pinyin/zhuyin/kana): NOTHING is sent until compositionend
 *     (candidate selected). Sending the intermediate buffer echoed the raw pinyin
 *     ("shou ji") into the shell before the user picked 手机, then corrupted the
 *     line on selection — a keyboard bug that recurred more than once. Only a long
 *     safety timer (default 6s) still flushes iOS DICTATION, which composes for
 *     many seconds without ending, far beyond any real candidate-selection pause.
 *
 * The state machine owns lastSent/composing/timer; the caller passes the current
 * textarea value into each method (it reads it off the DOM; tests pass literals)
 * and supplies a `send(bytes)` sink. The timer is injectable so tests drive a
 * deterministic clock. Keep this behaviour-identical to what terminal-kbd.js needs
 * — it is the single source of truth, loaded there via <script src>.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;   // node test
  else root.TerminalKbdInput = api;                                          // browser
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEL = String.fromCharCode(127);   // backspace byte
  var CR = String.fromCharCode(13);
  var TAB = String.fromCharCode(9);

  // send(bytes): sink for PTY bytes. opts.composeSafetyMs / opts.setTimeout /
  // opts.clearTimeout override the dictation-safety debounce + the clock.
  function create(send, opts) {
    opts = opts || {};
    var SAFETY = opts.composeSafetyMs != null ? opts.composeSafetyMs : 6000;
    var setT = opts.setTimeout || (typeof setTimeout !== "undefined" ? setTimeout : null);
    var clrT = opts.clearTimeout || (typeof clearTimeout !== "undefined" ? clearTimeout : null);

    var lastSent = "", composing = false, timer = null;

    function cancel() { if (timer != null && clrT) clrT(timer); timer = null; }

    // Emit the delta from lastSent -> v: code-POINT aware (Array.from) so an
    // emoji/astral char is one delete, not two lone surrogates.
    function diffSend(v) {
      var va = Array.from(v), la = Array.from(lastSent);
      var i = 0, min = Math.min(va.length, la.length);
      while (i < min && va[i] === la[i]) i++;
      for (var d = la.length - i; d > 0; d--) send(DEL);
      for (var j = i; j < va.length; j++) send(va[j]);
      lastSent = v;
    }

    function flush(v) {
      timer = null;
      // Ignore iOS dictation's transient clear-to-"" between revisions — but ONLY
      // while composing. Outside composition an empty value is a genuine line clear
      // and must emit the backspaces (else the mirror and the PTY desync).
      if (v === "" && lastSent !== "" && composing) return;
      diffSend(v);
    }

    function sched(v, ms) { cancel(); if (setT) timer = setT(function () { flush(v); }, ms); }

    return {
      // A textarea 'input' event. `isComposing` = event.isComposing (IME/dictation).
      input: function (value, isComposing) {
        if (composing || isComposing) sched(value, SAFETY);   // composing: hold until end (or dictation safety)
        else { cancel(); flush(value); }                      // normal: send the char now
      },
      compositionStart: function () { composing = true; cancel(); },
      compositionEnd: function (value) { composing = false; sched(value, 40); },
      // Enter: commit whatever's buffered, send CR, reset the mirror for a fresh line.
      enter: function (value) { cancel(); flush(value); send(CR); lastSent = ""; },
      tab: function () { send(TAB); },
      // Backspace pressed while the overlay is already empty -> send a raw DEL so
      // the PTY still gets it (there's nothing to diff away).
      backspaceEmpty: function () { send(DEL); },
      // Drop the value-diff mirror so the NEXT keystroke is a clean delta from the
      // shell's real cursor (called when the line changed out-of-band: cursor moved,
      // ^C/Esc/Tab, or the tab returned from the background).
      reset: function () { cancel(); lastSent = ""; composing = false; },
      // Test/inspection hooks (not used by the browser path).
      _state: function () { return { lastSent: lastSent, composing: composing, pending: timer != null }; }
    };
  }

  return { create: create };
});
