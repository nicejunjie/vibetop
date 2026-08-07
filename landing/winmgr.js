/* winmgr.js — pure geometry math for the desktop's floating window mode.
 *
 * DOM-free (like terminal/lib/tab-sync.js) so it's unit-tested with
 * `node --test landing/winmgr.test.js`. desktop.html loads it via <script src>
 * and does the DOM/pointer glue; every clamp/resize/placement decision lives
 * here where it's testable. window.VibeWin in the browser, module.exports in node.
 *
 * A geometry is { left, top, width, height } in px, relative to the #frames box
 * { w, h }. Windows are kept fully inside the box and never smaller than the min.
 */
(function (root) {
  'use strict';
  var MINW = 320, MINH = 200;

  function clampGeom(g, box, minw, minh) {
    minw = minw || MINW; minh = minh || MINH;
    var w = Math.max(minw, Math.min(Math.round(g.width), box.w));
    var h = Math.max(minh, Math.min(Math.round(g.height), box.h));
    var left = Math.max(0, Math.min(Math.round(g.left), box.w - w));
    var top = Math.max(0, Math.min(Math.round(g.top), box.h - h));
    return { left: left, top: top, width: w, height: h };
  }

  // Resize `g` by dragging edge/corner `dir` (n/s/e/w/ne/nw/se/sw) by (dx,dy) px.
  // The dragged edge moves; the opposite edge stays put; min size pins the moving edge.
  function resizeGeom(g, dir, dx, dy, box, minw, minh) {
    minw = minw || MINW; minh = minh || MINH;
    var left = g.left, top = g.top, w = g.width, h = g.height;
    if (dir.indexOf('e') !== -1) w = g.width + dx;
    if (dir.indexOf('s') !== -1) h = g.height + dy;
    if (dir.indexOf('w') !== -1) { w = g.width - dx; left = g.left + dx; }
    if (dir.indexOf('n') !== -1) { h = g.height - dy; top = g.top + dy; }
    if (w < minw) { if (dir.indexOf('w') !== -1) left -= (minw - w); w = minw; }
    if (h < minh) { if (dir.indexOf('n') !== -1) top -= (minh - h); h = minh; }
    return clampGeom({ left: left, top: top, width: w, height: h }, box, minw, minh);
  }

  // Default cascade placement + size for the index-th window opened.
  function defaultGeom(box, index) {
    var w = Math.round(Math.min(920, box.w * 0.62));
    var h = Math.round(Math.min(680, box.h * 0.72));
    var off = ((index || 0) % 6) * 32;
    return clampGeom({
      left: Math.round(box.w * 0.10) + off,
      top: Math.round(box.h * 0.07) + off,
      width: w, height: h,
    }, box);
  }

  // Snap target when a window is dragged so the pointer is within `edge` px of a
  // screen edge: top → maximize, left/right → that half. Else null (free move).
  function snapTarget(px, py, box, edge) {
    edge = edge || 18;
    if (py <= edge) return { left: 0, top: 0, width: box.w, height: box.h };
    if (px <= edge) return { left: 0, top: 0, width: Math.round(box.w / 2), height: box.h };
    if (px >= box.w - edge) return { left: box.w - Math.round(box.w / 2), top: 0, width: Math.round(box.w / 2), height: box.h };
    return null;
  }

  var api = { clampGeom: clampGeom, resizeGeom: resizeGeom, defaultGeom: defaultGeom,
              snapTarget: snapTarget, MINW: MINW, MINH: MINH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeWin = api;
})(typeof self !== 'undefined' ? self : this);
