// Iron Frontier — structures/gate: the art for one unit.
// Called by bakeGateSeg() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { outline } from '../../bake/kit.js';
import { lcg } from '../../bake/states.js';
import { mkCanvas, shade } from '../../bake/terrain.js';
import { gproj, gridSlab, octCol, padSlab } from '../../bake/walls.js';
import { TH, TW } from '../../world.js';

export function bakeGateSeg(col, fac, vert, openF) {

var fw = TW / 2, fh = TH / 2, pad = 18, head = 44;
var s = mkCanvas(fw * 2 + pad * 2, fh * 2 + head + pad * 2), g = s.g;
var cx = s.w / 2, by = s.h - pad - fh;
var sov = fac === 'col';
var rnd = lcg(sov ? 6613 : 3307), i;
var SAND = '#918872', SAND_L = '#a89f88', SAND_D = '#5f5949';
var RUB = '#918079', RUB_L = '#ab9a90', RUB_D = '#584b47';
var STONE = sov ? '#8b8f98' : '#c3c0b4', STONE_L = sov ? '#b6bac2' : '#d8d5c9';
var STONE_D = sov ? '#5c6068' : '#84817a', EDG = sov ? '#191a20' : '#3a372f';
var BASE = sov ? RUB : SAND, BASE_L = sov ? RUB_L : SAND_L, BASE_D = sov ? RUB_D : SAND_D;

g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(cx + 2, by + 3, 20, 9, 0, 0, 6.29); g.fill();

// the plinth the whole gate stands on, running the length of the gap
var ux = vert ? 0 : 0.5, uy = vert ? 0.5 : 0;
var lift0 = sov ? 6.5 : 3.2;
gridSlab(g, cx, by, -ux * 1.14, -uy * 1.14, ux * 1.14, uy * 1.14, 0.24, lift0,
         BASE, BASE_L, BASE_D, EDG);
for (i = 0; i < 24; i++) {
  var t0 = (i / 24 - 0.5) * 2.2, o0 = (rnd() - 0.5) * 0.56;
  var q0 = gproj(ux * 1.14 * t0 - uy * 0.56 * o0, uy * 1.14 * t0 + ux * 0.56 * o0);
  var w0 = 1.9 + rnd() * 1.9;
  g.fillStyle = rnd() > 0.5 ? BASE_L : BASE_D;
  g.beginPath(); g.ellipse(cx + q0[0], by - lift0 + q0[1], w0, w0 * 0.55, 0, 0, 6.29); g.fill();
}
var pierY = by - lift0;

// A leaf: a standing panel of bars, `a`..`b` along the run from centre.
function leaf(sgn) {
  var a = 0.05 + openF * 0.52, b2 = 0.56 + openF * 0.20, H = sov ? 13 : 14;
  gridSlab(g, cx, pierY, ux * sgn * a, uy * sgn * a, ux * sgn * b2, uy * sgn * b2, 0.055, H,
           STONE_L, STONE, STONE_D, EDG);
  // vertical bars down the near face of the panel
  g.strokeStyle = sov ? 'rgba(20,22,28,.62)' : 'rgba(58,55,47,.55)'; g.lineWidth = 1.1;
  for (i = 0; i <= 4; i++) {
    var t1 = a + (b2 - a) * (i / 4);
    var q1 = gproj(ux * sgn * t1, uy * sgn * t1);
    g.beginPath();
    g.moveTo(cx + q1[0], pierY + q1[1]); g.lineTo(cx + q1[0], pierY + q1[1] - H);
    g.stroke();
  }
  g.lineWidth = 1;
  // hazard band along the leaf's cap, in the owner's colour
  var qa = gproj(ux * sgn * a, uy * sgn * a), qb = gproj(ux * sgn * b2, uy * sgn * b2);
  g.strokeStyle = col; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(cx + qa[0], pierY + qa[1] - H + 1.6); g.lineTo(cx + qb[0], pierY + qb[1] - H + 1.6);
  g.stroke(); g.lineWidth = 1;
}
// A pier: the faction's own wall post, one at each end of the run.
function pier(sgn) {
  var q2 = gproj(ux * sgn * 0.82, uy * sgn * 0.82);
  var px2 = cx + q2[0], py2 = pierY + q2[1], tp;
  if (sov) {
    tp = padSlab(g, px2, py2, 7.2, 3.6, 11, shade(col, 0.72), shade(col, 0.96),
                 shade(col, 0.46), EDG);
    padSlab(g, px2, tp, 9.2, 4.6, 2.6, STONE, shade(STONE, 1.20), shade(STONE, 0.58), EDG);
    tp -= 2.6;
  } else {
    tp = octCol(g, px2, py2, 7.4, 14, shade(col, 0.60), EDG, shade(col, 0.86));
    octCol(g, px2, tp, 8.8, 3.0, STONE, EDG, STONE_L);
    tp -= 3.0;
  }
  // the lamp RA2 puts on a gate pier: red shut, green once it is open
  g.fillStyle = openF > 0.5 ? '#7fe08a' : '#e06a5a';
  g.beginPath(); g.arc(px2, tp - 2.4, 1.7, 0, 6.29); g.fill(); outline(g, EDG);
}
// far half first, so the near pier closes over the near leaf's joint
pier(-1); leaf(-1); leaf(1); pier(1);
return { s: s, ax: cx, ay: by };
}
