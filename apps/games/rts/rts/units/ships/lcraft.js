// Iron Frontier — ships/lcraft: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { shade } from '../../bake/terrain.js';

export function drawLcraft(C) {
  var DECK = C.DECK, FR = C.FR, HOUSE = C.HOUSE, HULL = C.HULL, L = C.L, P = C.P, W = C.W,
      box = C.box, g = C.g, poly = C.poly;

// [LCRF]: an open well deck between two side walls, and the bow RAMP
// — the one feature that says "this thing beaches".
//
// The ramp is DOWN, and it reaches past the stem. Folded up over the
// bow it was inside the hull outline, which made it a texture and not
// a spike (reference §1.4's rule 4), and left the measured horizontal
// protrusion on this hull as the BOW WAVE — a 3-px decorative stroke
// that died at ZMIN and was the game's only `spike.belowFloor`. Down,
// it is the longest thing forward of any hull afloat and it is the
// feature the spec actually names.
box(-L * 0.10, W * 0.80, L * 0.90, W * 0.24, 3.8, shade(HULL, 0.94));
box(-L * 0.10, -W * 0.80, L * 0.90, W * 0.24, 3.8, shade(HULL, 0.94));
g.save(); poly(FR, null, null); g.clip();
g.fillStyle = '#2b2f28';
poly(FR, '#2b2f28', null);                     // the open well, in shadow
g.strokeStyle = '#4d5347'; g.lineWidth = 0.8;
for (var ri = -2; ri <= 2; ri++) {
  var r0 = P(L * 0.5, ri * 3.0, FR), r1 = P(-L * 0.8, ri * 3.0, FR);
  g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
}
g.restore();
// Visible cargo in the well: two crates and a vehicle block, so she
// reads as CARRYING something rather than as an empty barge.
box(-L * 0.36, -W * 0.36, 7.0, W * 0.62, 4.2, '#6a6f5c');
box(-L * 0.36, W * 0.40, 5.4, W * 0.52, 3.4, '#7a7f68');
box(L * 0.04, 0, 9.0, W * 0.96, 6.0, '#565b4a');                  // a loaded vehicle
box(L * 0.04, 0, 5.4, W * 0.62, 7.6, '#666b58');
// Ramp: a pale wedge hinged at the stem and lying DOWN on the water,
// with two side rails so it reads as a ramp and not a shadow.
var m0 = P(L * 0.80, W * 0.60, FR + 1.2), m1 = P(L * 0.80, -W * 0.60, FR + 1.2);
var m2 = P(L * 1.22, -W * 0.50, 0.6), m3 = P(L * 1.22, W * 0.50, 0.6);
g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]);
g.lineTo(m2[0], m2[1]); g.lineTo(m3[0], m3[1]); g.closePath();
g.fillStyle = shade(HULL, 1.16); g.fill();
g.strokeStyle = '#22261f'; g.lineWidth = 1.0; g.stroke();
g.strokeStyle = shade(HULL, 1.42); g.lineWidth = 1.4;             // ramp rails
g.beginPath(); g.moveTo(m0[0], m0[1] - 1.6); g.lineTo(m3[0], m3[1] - 1.6); g.stroke();
g.beginPath(); g.moveTo(m1[0], m1[1] - 1.6); g.lineTo(m2[0], m2[1] - 1.6); g.stroke();
g.strokeStyle = HOUSE; g.lineWidth = 1.8;                          // hinge band at the stem
g.beginPath(); g.moveTo(m0[0], m0[1] - 0.6); g.lineTo(m1[0], m1[1] - 0.6); g.stroke();
box(-L * 0.78, 0, 6, W * 0.50, 5.2, shade(DECK, 1.1));            // little wheelhouse aft
}
