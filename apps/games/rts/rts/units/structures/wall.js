// ─── structures/wall ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeWallSeg() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { lcg } from '../../bake/states.js';
import { mkCanvas, shade } from '../../bake/terrain.js';
import { WALL_DIRS, gproj, gridSlab, octCol, padSlab } from '../../bake/walls.js';
import { TH, TW } from '../../world.js';

export function bakeWallSeg(col, fac, mask) {

var fw = TW / 2, fh = TH / 2, pad = 18, head = 40;
var s = mkCanvas(fw * 2 + pad * 2, fh * 2 + head + pad * 2), g = s.g;
var cx = s.w / 2, by = s.h - pad - fh;
var sov = fac === 'col';
var rnd = lcg(sov ? 8821 : 4409);
var i, d, oi, q;
var order = [0, 3, 1, 2];                      // N, W, E, S by screen depth

g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(cx + 2, by + 3, sov ? 17 : 20, sov ? 8 : 9, 0, 0, 6.29); g.fill();

if (!sov) {
  // ---- Directorate: sandbag plinth, silver post, glass dome ----------
  var SAND = '#918872', SAND_L = '#a89f88', SAND_D = '#5f5949';
  var STONE = '#c3c0b4', STONE_L = '#d8d5c9', STONE_D = '#84817a', EDG = '#3a372f';
  // plinth strips first, so the centre pad closes over the joints
  var TURF = '#5f5c48', TURF_L = '#767260', TURF_D = '#403e30';
  for (oi = 0; oi < 4; oi++) {
    d = WALL_DIRS[order[oi]];
    if (!(mask & d[0])) continue;
    gridSlab(g, cx, by, 0, 0, d[1] * 1.14, d[2] * 1.14, 0.32, 3, TURF, TURF_L, TURF_D, EDG);
    gridSlab(g, cx, by - 3, 0, 0, d[1] * 1.14, d[2] * 1.14, 0.24, 3.5, SAND, SAND_L, SAND_D, EDG);
  }
  padSlab(g, cx, by, 20.5, 10.2, 3, TURF, TURF_L, TURF_D, EDG);
  padSlab(g, cx, by - 3, 16, 8, 3.5, SAND, SAND_L, SAND_D, EDG);
  // the curtain between two posts: a narrow precast wall standing on the
  // plinth, its cap a ridge rather than a paddle (see allied-wall-scene)
  for (oi = 0; oi < 4; oi++) {
    d = WALL_DIRS[order[oi]];
    if (!(mask & d[0])) continue;
    gridSlab(g, cx, by - 3.0, 0, 0, d[1] * 1.14, d[2] * 1.14, 0.085, 11.5,
             shade(STONE, 1.02), STONE, shade(STONE_D, 0.86), EDG);
    // coping shadow line along the near face
    var e1 = gproj(d[1] * 0.30, d[2] * 0.30), e2 = gproj(d[1] * 1.10, d[2] * 1.10);
    g.strokeStyle = 'rgba(50,46,38,.40)'; g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(cx + e1[0], by - 3.0 + e1[1] - 9.0); g.lineTo(cx + e2[0], by - 3.0 + e2[1] - 9.0);
    g.stroke(); g.lineWidth = 1;
  }
  // sandbags: individual bags heaped over BOTH steps and spilling past
  // their rims, so the plinth is a pile and not a machined octagon
  for (i = 0; i < 34; i++) {
    var ta = i / 34 * 6.2832, rr = 0.90 + rnd() * 0.20;
    var bx = cx + Math.cos(ta) * 18.1 * rr, byy = by - 2.6 + Math.sin(ta) * 9.0 * rr;
    g.fillStyle = rnd() > 0.5 ? TURF_L : TURF_D;
    g.beginPath(); g.ellipse(bx, byy, 2.9, 1.7, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#332f2b'; g.lineWidth = 0.7; g.stroke();
  }
  for (i = 0; i < 26; i++) {
    var t2 = i / 26 * 6.2832, r2 = 0.90 + rnd() * 0.20;
    var b2 = cx + Math.cos(t2) * 15.2 * r2, y2 = by - 6.4 + Math.sin(t2) * 7.5 * r2;
    g.fillStyle = rnd() > 0.5 ? SAND_L : SAND;
    g.beginPath(); g.ellipse(b2, y2, 2.7, 1.6, 0, 0, 6.29); g.fill();
    g.strokeStyle = SAND_D; g.lineWidth = 0.7; g.stroke();
  }
  // mottle across the two caps so the flat tops are not dead colour
  for (i = 0; i < 26; i++) {
    var m3 = rnd() * 6.2832, d3 = Math.sqrt(rnd());
    var lo3 = i % 2 === 0;
    var x3 = cx + Math.cos(m3) * (lo3 ? 17.5 : 13.4) * d3;
    var y3 = (lo3 ? by - 3.2 : by - 6.9) + Math.sin(m3) * (lo3 ? 8.7 : 6.6) * d3;
    g.fillStyle = lo3 ? (rnd() > 0.5 ? TURF_D : TURF_L) : (rnd() > 0.5 ? SAND_D : SAND_L);
    g.beginPath(); g.ellipse(x3, y3, 1.6 + rnd() * 1.2, 0.9, 0, 0, 6.29); g.fill();
  }
  g.lineWidth = 1;
  // stone collar, then the post itself
  padSlab(g, cx, by - 6.5, 10.4, 5.2, 2.6, STONE, STONE_L, STONE_D, EDG);
  var pTop = octCol(g, cx, by - 9.1, 8.6, 15.5, shade(col, 0.60), EDG, shade(col, 0.86));
  // panel seams down the two lit faces
  g.strokeStyle = 'rgba(16,18,24,.55)'; g.lineWidth = 0.9;
  for (i = -1; i <= 1; i += 2) {
    g.beginPath(); g.moveTo(cx + i * 3.5, by - 10.6); g.lineTo(cx + i * 3.5, by - 23.4); g.stroke();
  }
  g.lineWidth = 1;
  // silver crown rim with its bolt dots, then the dome in the collar
  octCol(g, cx, pTop, 10.4, 3.4, STONE, EDG, STONE_L);
  g.fillStyle = '#b8ae86';
  for (i = 0; i < 4; i++) {
    var ba = 0.7854 + i * 1.5708;
    g.beginPath(); g.arc(cx + Math.cos(ba) * 7.8, pTop - 3.4 + Math.sin(ba) * 3.9, 0.9, 0, 6.29); g.fill();
  }
  var dy = pTop - 4.4;
  g.fillStyle = shade(col, 0.62);
  g.beginPath(); g.ellipse(cx, dy, 6.2, 3.1, 0, 0, 6.29); g.fill(); outline(g, EDG);
  g.fillStyle = shade(col, 1.05);
  g.beginPath(); g.ellipse(cx - 1.0, dy - 0.7, 3.6, 1.8, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.beginPath(); g.ellipse(cx - 1.9, dy - 1.1, 1.5, 0.75, 0, 0, 6.29); g.fill();
} else {
  // ---- Collective: a rampart of heaped rubble under an iron cap ------
  var RUB = '#918079', RUB_L = '#ab9a90', RUB_D = '#584b47';
  var IRON = '#2a2c34', STL = '#8b8f98', STL_L = '#b6bac2', EDGS = '#191a20';
  for (oi = 0; oi < 4; oi++) {
    d = WALL_DIRS[order[oi]];
    if (!(mask & d[0])) continue;
    gridSlab(g, cx, by, 0, 0, d[1] * 1.14, d[2] * 1.14, 0.28, 7.5, RUB, RUB_L, RUB_D, EDGS);
    // stones along the run, so the rampart reads as piled rock
    for (i = 0; i < 14; i++) {
      var t4 = 0.22 + i / 14 * 0.80, o4 = (rnd() - 0.5) * 0.44;
      var a4 = gproj(d[1] * 1.14 * t4 - d[2] * 0.56 * o4, d[2] * 1.14 * t4 + d[1] * 0.56 * o4);
      var w4 = 1.7 + rnd() * 1.8;
      g.fillStyle = rnd() > 0.45 ? shade(RUB_L, 1.10) : shade(RUB_D, 0.94);
      g.beginPath();
      g.ellipse(cx + a4[0], by - 7.5 + a4[1] + rnd() * 1.8, w4, w4 * 0.55, 0, 0, 6.29);
      g.fill();
    }
  }
  padSlab(g, cx, by, 16.2, 8.1, 5.5, RUB, RUB_L, RUB_D, EDGS);
  padSlab(g, cx, by - 5.5, 12.4, 6.2, 3.5, RUB_L, shade(RUB_L, 1.10), RUB, EDGS);
  // broken stone: blocks over the cap and down the two near faces
  for (i = 0; i < 46; i++) {
    var an = rnd() * 6.2832, rd = Math.sqrt(rnd());
    var hi = i % 2 === 0;
    var sxp = cx + Math.cos(an) * (hi ? 11.6 : 15.2) * rd;
    var syp = (hi ? by - 9 : by - 5.5) + Math.sin(an) * (hi ? 5.8 : 7.6) * rd;
    var w2 = 2.3 + rnd() * 2.6;
    g.fillStyle = rnd() > 0.45 ? shade(RUB_L, 1.12) : shade(RUB_D, 0.92);
    g.beginPath(); g.ellipse(sxp, syp, w2, w2 * 0.55, 0, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(40,28,26,.45)'; g.lineWidth = 0.7; g.stroke(); g.lineWidth = 1;
  }
  // ragged rim: broken stone tumbling off the two near faces
  for (i = 0; i < 22; i++) {
    var fa = -0.30 + rnd() * 3.74;
    var fx2 = cx + Math.cos(fa) * (13.0 + rnd() * 2.0), fy2 = by - 5.5 + Math.sin(fa) * 7.0 + rnd() * 5.5;
    g.fillStyle = rnd() > 0.5 ? RUB_D : RUB;
    g.beginPath(); g.ellipse(fx2, fy2, 1.5 + rnd() * 0.8, 1.1, 0, 0, 6.29); g.fill();
  }
  // two stakes leaning out of the heap, steel-tipped
  for (i = -1; i <= 1; i += 2) {
    var x0 = cx + i * 5.8, y0 = by - 11, x1 = cx + i * 9.4, y1 = by - 27.6;
    g.strokeStyle = IRON; g.lineWidth = 3.0; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = STL; g.lineWidth = 2.0;
    g.beginPath(); g.moveTo(cx + i * 8.1, by - 21.4); g.lineTo(cx + i * 9.2, by - 26.5); g.stroke();
    g.lineWidth = 1; g.lineCap = 'butt';
    g.fillStyle = col;
    g.beginPath(); g.ellipse(cx + i * 7.2, by - 16.4, 2.1, 1.5, 0, 0, 6.29); g.fill();
    outline(g, EDGS);
  }
  // the iron cap block, then a steel lid plate on top of it
  var cTop = padSlab(g, cx, by - 9, 7.8, 3.9, 9.5, shade(col, 0.72), shade(col, 0.96),
                     shade(col, 0.46), EDGS);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(cx - 8.2, by - 13.1); g.lineTo(cx, by - 9.3); g.lineTo(cx + 8.2, by - 13.1); g.stroke();
  g.lineWidth = 1;
  padSlab(g, cx, cTop, 10.4, 5.2, 2.8, STL, shade(STL, 1.20), shade(STL, 0.58), EDGS);
  g.fillStyle = 'rgba(255,255,255,.26)';
  g.beginPath(); g.ellipse(cx - 2.2, cTop - 3.3, 3.8, 1.7, 0, 0, 6.29); g.fill();
}
return { s: s, ax: cx, ay: by };
}
