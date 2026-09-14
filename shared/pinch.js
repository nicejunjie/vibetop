/* Two-finger pinch-zoom maths, shared by every surface that shows one picture
 * you can zoom into (Files' Quick Look panel, the Image viewer).
 *
 * Only the maths lives here. Pointer bookkeeping stays in the page, because
 * each page already owns its own drag/tap/swipe gestures and they have to agree
 * with each other; what they do NOT each need is a second, subtly different
 * version of the algebra below.
 *
 * Coordinates are relative to the CENTRE of the box the picture sits in — the
 * same convention both pages' existing `zoomAt()` already uses — so a pan of
 * (0,0) means "centred". No DOM, no events: that is what makes it testable.
 */
(function (root) {
  'use strict';

  // The two fingers, reduced to the only two things a pinch is about: how far
  // apart they are, and where the gesture's centre is.
  function pinchMetrics(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return {
      // Never zero: two fingers reported at the same point would otherwise
      // divide by it and send the zoom to Infinity on the next frame.
      dist: Math.max(1e-6, Math.sqrt(dx * dx + dy * dy)),
      cx: (ax + bx) / 2,
      cy: (ay + by) / 2
    };
  }

  // One frame of a pinch.
  //
  // `start` is the state captured when the SECOND finger landed:
  //   {dist, cx, cy, z, px, py} — separation and midpoint of the fingers, plus
  //   the picture's zoom and pan at that instant.
  // `now` is {dist, cx, cy} for this frame. Returns the new {z, px, py}.
  //
  // The invariant that makes a pinch feel attached to the picture rather than
  // applied to it: whatever image point sat under the STARTING midpoint must
  // still sit under the CURRENT midpoint. Scaling about a fixed centre and
  // panning by the midpoint separately is the obvious implementation and it
  // drifts — the picture slides out from under the fingers as they move.
  //
  // It also means a two-finger gesture that does not change separation is a
  // pure pan, which is what people expect: two fingers drag, and dragging while
  // pinching keeps working instead of fighting the zoom.
  function pinchStep(start, now, min, max) {
    var lo = min === undefined ? 1 : min, hi = max === undefined ? 6 : max;
    var z = start.z * (now.dist / start.dist);
    z = Math.max(lo, Math.min(hi, z));
    // The anchored point, in unscaled image space. Taken from `start`, not from
    // this frame, so the whole gesture pivots on one point instead of drifting
    // a little on every move event.
    var ux = (start.cx - start.px) / start.z;
    var uy = (start.cy - start.py) / start.z;
    return { z: z, px: now.cx - z * ux, py: now.cy - z * uy };
  }

  var api = { pinchMetrics: pinchMetrics, pinchStep: pinchStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibePinch = api;
})(typeof self !== 'undefined' ? self : this);
