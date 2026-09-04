/* keybar.js — pure math for the mobile system key bar + keyboard lift.
 *
 * DOM-free (like winmgr.js) so it's unit-tested with
 * `node --test landing/keybar.test.js` against the viewport states RECORDED on
 * the reporting iPhone via the /api/client-debug field beacons. desktop.html
 * loads it via <script src> and does the measurement/DOM glue.
 * window.VibeKeybar in the browser, module.exports in node.
 *
 * THE ONE FACT THIS ENCODES (measured, not guessed — see
 * docs/design-decisions.md, the key-bar saga): with the soft keyboard up, iOS
 * dwells in TWO legitimate coordinate regimes and flips between them for the
 * whole session:
 *
 *   big-window     ih 894, vvTop 0,   vvH ~480  — the layout viewport keeps its
 *                  full height, the app frame runs under the keyboard.
 *   shell-scrolled ih 655, vvTop 239, vvH ~508  — iOS reveal-scrolled the page;
 *                  ih + vvTop == the no-keyboard height, and every in-flow rect
 *                  shifts up by vvTop. The frame sits fully above the keyboard.
 *
 * In BOTH regimes the correct bar position is the same expression,
 * `vvTop + vvH - barH`: position:fixed elements shift with the shell scroll,
 * so that lands flush above the keyboard either way. And in both regimes the
 * correct lift falls out of the same subtraction against the frame's LIVE rect
 * (which shifts with the shell scroll too, keeping the coordinates consistent):
 * ~376 in big-window, <= 0 (i.e. none) when shell-scrolled.
 *
 * What must never come back: any state learned in one regime and applied in the
 * other (a "keyboard top" anchor/prior/clamp — vvBottom is per-REGIME, 480 vs
 * ~750, not a device constant), and any figure RELAYED to another frame to act
 * on later (it is stale the moment iOS flips regimes). Compute everything from
 * one instantaneous reading and apply it in the same turn.
 */
(function (root) {
  'use strict';

  // Keyboard-vs-URL-bar discriminator: the visible height must drop this far
  // below the no-keyboard baseline to count as "keyboard up" (keyboard ~300px+,
  // URL-bar collapse ~60px).
  var KB_GAP = 150;
  // Breathing room between the last content row and the bar's top edge.
  var PAD = 4;

  // One instantaneous reading -> what to draw. All inputs in top-frame CSS px:
  //   vvTop, vvH     visualViewport offsetTop/height (vvH falls back to innerH)
  //   innerH         window.innerHeight
  //   baseH          the no-keyboard baseline height for this orientation
  //                  (running max, persisted — a real device constant)
  //   barH           the key bar's height
  //   frameBottom    the terminal app iframe's live rect.bottom (nullable)
  //   contentBottom  client-Y of the bottom of the active terminal's last
  //                  non-blank row (nullable; null -> assume the frame is full,
  //                  which over-lifts — the safe direction)
  // Returns { kbUp, barTop, lift }:
  //   barTop  where the bar's top edge goes (position:fixed)
  //   lift    px to translateY(-lift) the terminal content so its last content
  //           row ends at the bar's top. 0 whenever nothing is covered.
  function compute(s) {
    var vvH = (s.vvH != null) ? s.vvH : s.innerH;
    var vvTop = s.vvTop || 0;
    var kbUp = vvH < s.baseH - KB_GAP;
    var barTop = Math.round(vvTop + vvH - s.barH);
    var lift = 0;
    if (kbUp && s.frameBottom != null) {
      var target = s.frameBottom;
      if (s.contentBottom != null) target = Math.min(target, s.contentBottom + PAD);
      lift = Math.max(0, Math.round(target - barTop));
    }
    return { kbUp: kbUp, barTop: barTop, lift: lift };
  }

  var api = { compute: compute, KB_GAP: KB_GAP, PAD: PAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeKeybar = api;
})(typeof self !== 'undefined' ? self : this);
