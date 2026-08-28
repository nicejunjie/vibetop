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
    // THREE windows: ceil(sqrt(3)) = 2 columns, which lays out two on top and one
    // spanning the full width underneath — reported as "really ugly", and it is:
    // the odd window out is twice the area of its neighbours. Three even columns
    // whenever they fit (landscape, >= 3*MINW); a portrait frame stacks instead,
    // where 3 columns would be slivers.
    if (n === 3) cols = (box.w >= 3 * MINW && box.w > box.h) ? 3 : (box.h > box.w ? 1 : cols);
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

  // ---- Snap layouts (the ▢ palette) ---------------------------------------
  // Each layout is a list of zones in FRACTIONS of the frame, so they survive any
  // resize or rotation. Order matters: zone 0 is the "main" one, and it is the
  // zone the window you opened the palette from takes when you click it.
  var LAYOUTS = [
    { key: 'halves',  name: 'Halves',  zones: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
    { key: 'thirds',  name: 'Thirds',  zones: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
    { key: 'main2',   name: '1 + 2',   zones: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
    { key: 'stacked', name: 'Stacked', zones: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
    { key: 'quads',   name: 'Quarters', zones: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5],
                                                [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  ];

  // Zones in PIXELS for this box, or null when the layout cannot fit at the
  // minimum window size (thirds on a narrow iPad would be three slivers the
  // caller then clamps into an overlapping pile — the same bug tileGrid guards).
  function layoutGeoms(key, box) {
    var L = null;
    for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].key === key) L = LAYOUTS[i];
    if (!L) return null;
    var out = [];
    for (var j = 0; j < L.zones.length; j++) {
      var z = L.zones[j];
      // Round the EDGES, then derive the size — never round width/height directly.
      // Rounding each size independently makes neighbours disagree about the
      // boundary: thirds of 1400 gave three 467px zones (1401 total), so zones 1
      // and 2 overlapped by a pixel. Shared edges must round to the same integer.
      var l = Math.round(z[0] * box.w), r = Math.round((z[0] + z[2]) * box.w);
      var t = Math.round(z[1] * box.h), b = Math.round((z[1] + z[3]) * box.h);
      var g = { left: l, top: t, width: r - l, height: b - t };
      if (g.width < MINW || g.height < MINH) return null;
      out.push(g);
    }
    return out;
  }

  // The layouts worth offering for THIS box: one zone per open window, exactly, and
  // only if it fits at the minimum window size.
  //
  // The count has to MATCH, not merely not-exceed. The first cut only excluded
  // layouts with too MANY zones, so three open windows were still offered Halves
  // and Stacked — and picking one silently minimized the third window. A layout
  // that cannot hold what you have open is not a layout you meant to choose.
  // Counts with no matching layout (1, or 5+) simply offer nothing; the even split
  // from toggling the mode off and on still covers those.
  function layoutsFor(box, winCount) {
    var out = [];
    for (var i = 0; i < LAYOUTS.length; i++) {
      var L = LAYOUTS[i];
      if (L.zones.length !== winCount) continue;
      if (!layoutGeoms(L.key, box)) continue;
      out.push({ key: L.key, name: L.name, zones: L.zones });
    }
    return out;
  }

  // ---- Zone assignment ------------------------------------------------------
  // Which window lands in which zone: `ids` are the visible windows in taskbar
  // order, and the focused one (when present) takes `mainZone` — zone 0, the
  // main zone, unless a per-zone click said otherwise — with the rest filling
  // the remaining zones in taskbar order. Windows past the zone count are left
  // out; the caller minimizes them (layoutsFor makes the counts match, this
  // merely stays robust). Pure, so the palette PREVIEW and the actual placement
  // share one truth and cannot drift apart.
  function zoneAssign(ids, focusedId, zoneCount, mainZone) {
    var n = Math.min(zoneCount, ids.length);
    var focused = ids.indexOf(focusedId) !== -1 ? focusedId : null;
    var main = focused === null ? 0 : Math.max(0, Math.min(n - 1, mainZone || 0));
    var rest = [], out = new Array(n), i, z, k = 0;
    for (i = 0; i < ids.length; i++) if (ids[i] !== focused) rest.push(ids[i]);
    if (focused !== null) out[main] = focused;
    for (z = 0; z < n; z++) if (out[z] === undefined) out[z] = rest[k++];
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
              LAYOUTS: LAYOUTS, layoutGeoms: layoutGeoms, layoutsFor: layoutsFor,
              zoneAssign: zoneAssign,
              MINW: MINW, MINH: MINH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeWin = api;
})(typeof self !== 'undefined' ? self : this);
