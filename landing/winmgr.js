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

  // Snap target when a window is dragged within `edge` px of a LEFT/RIGHT screen
  // edge → that half. Else null. (No top→maximize: full-screen is the ▢ button;
  // snapping is only for the hard-to-hit precise HALF.)
  function snapTarget(px, py, box, edge) {
    edge = edge || 18;
    var half = Math.round(box.w / 2);
    if (px <= edge) return { left: 0, top: 0, width: half, height: box.h };
    if (px >= box.w - edge) return { left: box.w - half, top: 0, width: half, height: box.h };
    return null;
  }

  // "Tidy": tile n windows into an even grid filling the box (row-major). 2 →
  // side-by-side halves, 3 → two halves over one full-width, 4 → 2×2, etc. The
  // last row stretches its items to fill the width; last col/row absorb rounding
  // so there are no gaps. Returns n geoms.
  function tileGrid(n, box) {
    if (n <= 0) return [];
    var cols = Math.ceil(Math.sqrt(n));
    // On a PORTRAIT frame, two windows side by side are two slivers: a 656px-wide
    // iPad in portrait puts them exactly on the 320px minimum width, so they can't
    // even be resized narrower. Stack them instead — full width, half height each.
    // Landscape is unchanged (that's where side-by-side halves are the point).
    if (n === 2 && box.h > box.w) cols = 1;
    // Never ask for more columns/rows than the box can actually hold at the
    // minimum window size. A sqrt(n) grid on a narrow frame produced tiles
    // NARROWER than MINW; the caller then clamps each one up to MINW, and the
    // tiles OVERLAP — on a 656px-wide iPad, 5 windows landed at x=8/226/336 all
    // 320 wide, so a window's ×/▢/– hit-tested to its neighbour and the first tap
    // did nothing. "Tidy" promising an even split must not hand back overlaps.
    cols = Math.max(1, Math.min(cols, Math.floor(box.w / MINW) || 1));
    var rows = Math.ceil(n / cols), out = [];
    for (var i = 0; i < n; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      var rowItems = (r === rows - 1) ? (n - cols * (rows - 1)) : cols;
      var cw = Math.floor(box.w / rowItems), ch = Math.floor(box.h / rows);
      out.push({
        left: c * cw, top: r * ch,
        width: (c === rowItems - 1) ? (box.w - c * cw) : cw,
        height: (r === rows - 1) ? (box.h - r * ch) : ch,
      });
    }
    return out;
  }

  // How many windows this box can tile at the minimum window size. Above it,
  // tiling is impossible without overlap (the minimum is a hard floor — the
  // caller clamps every tile up to it, so a grid that asks for more columns than
  // fit hands back overlapping windows whose controls hit-test to a neighbour).
  // The caller is expected to tile only this many and minimize the rest.
  function tileCapacity(box) {
    return Math.max(1, Math.floor(box.w / MINW) || 1) * Math.max(1, Math.floor(box.h / MINH) || 1);
  }

  var api = { clampGeom: clampGeom, resizeGeom: resizeGeom, defaultGeom: defaultGeom,
              snapTarget: snapTarget, tileGrid: tileGrid, tileCapacity: tileCapacity,
              MINW: MINW, MINH: MINH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeWin = api;
})(typeof self !== 'undefined' ? self : this);
