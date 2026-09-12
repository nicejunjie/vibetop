// Iron Frontier — vehicles/v3: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { isoBox, outline } from '../../bake/kit.js';
import { VACC } from '../../bake/ships.js';
import { shade } from '../../bake/terrain.js';

export function drawV3(C) {
  var PEDGE = C.PEDGE, STEEL = C.STEEL, a = C.a, bumper = C.bumper, by = C.by, chassis = C.chassis,
      cx = C.cx, dark = C.dark, deck = C.deck, exhaust = C.exhaust, fx = C.fx, fy = C.fy, g = C.g,
      hull = C.hull, i2 = C.i2, lamp = C.lamp, len = C.len, panel = C.panel, pdark = C.pdark,
      plit = C.plit, px = C.px, py = C.py, sg = C.sg, wheels = C.wheels, wid = C.wid;

// V3 LAUNCHER — a plain olive six-wheeled truck carrying a rocket so
// big it IS the unit: a white body on an angled rail over the bed,
// nose cone and tail fins in house colour, breaking well past both
// ends of the chassis. Everything about the truck is deliberately
// dull so nothing competes with that diagonal.
wheels(len * 0.70, 2.5, 3);
chassis(cx, by - 1.0, len * 0.86, wid * 0.62, 3.6, hull, dark, 2.4);
var drawCab3 = function () {
  isoBox(g, cx + fx * 8.2, by - 4.4 + fy * 8.2, len * 0.22, wid * 0.62, 4.4,
         a, shade(hull, 1.06), dark);
  isoBox(g, cx + fx * 8.2, by - 8.8 + fy * 8.2, len * 0.19, wid * 0.54, 1.1,
         a, panel, PEDGE);                                  // colour cab roof
  var vwx = cx + fx * 10.2, vwy = by - 5.0 + fy * 10.2;
  isoBox(g, vwx, vwy, 1.2, wid * 0.54, 3.4, a, '#242a32', '#0f1216');
  g.fillStyle = 'rgba(214,220,228,.32)';
  g.beginPath();
  g.ellipse(vwx + fx * 0.4, vwy - 2.3 + fy * 0.4, 2.6, 1.1, 0, 0, 6.29); g.fill();
  bumper(len * 0.41, wid * 0.22, by - 1.4);
  for (var l3 = -1; l3 <= 1; l3 += 2)
    lamp(cx + fx * len * 0.40 + px * wid * 0.24 * l3,
         by - 3.6 + fy * len * 0.40 + py * wid * 0.24 * l3);
};
var drawRig3 = function () {
  // Two short bed plates, not a band down the whole side. The V3's
  // remap belongs on the missile's two ENDS (nose cone and fins,
  // below); the truck is deliberately dull so nothing competes with
  // that diagonal, and a bar down the bed was competing.
  for (sg = -1; sg <= 1; sg += 2)
    for (i2 = -1; i2 <= 1; i2 += 2)
      isoBox(g, cx + px * wid * 0.36 * sg + fx * (i2 * 4.6 - 4.0),
             by - 2.4 + py * wid * 0.36 * sg + fy * (i2 * 4.6 - 4.0),
             len * 0.21, 1.5, 2.6, a, panel, PEDGE);
  isoBox(g, cx - fx * 3.6, by - 4.4 - fy * 3.6, len * 0.58, wid * 0.56, 1.5,
         a, deck, dark);                                    // flat bed
  // the RAIL: two dark girders climbing from the tail to the cab, with
  // a jack strut under the high end
  for (sg = -1; sg <= 1; sg += 2) {
    // The rail runs the length of the MISSILE, not of the bed. When
    // the missile grew (see the chord below) these girders stayed
    // where they were and the rocket floated five units past the end
    // of its own launcher at the tail — the sort of thing a number in
    // band will never catch and a player sees immediately.
    var r0x = cx - fx * 13.4 + px * 2.6 * sg, r0y = by - 4.2 - fy * 13.4 + py * 2.6 * sg;
    var r1x = cx + fx * 6.8 + px * 2.6 * sg, r1y = by - 13.2 + fy * 6.8 + py * 2.6 * sg;
    g.strokeStyle = '#2b2f36'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(r0x, r0y); g.lineTo(r1x, r1y); g.stroke();
    g.strokeStyle = '#7d848f'; g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(r0x, r0y - 0.9); g.lineTo(r1x, r1y - 0.9); g.stroke();
  }
  isoBox(g, cx + fx * 5.4, by - 10.4 + fy * 5.4, 1.8, wid * 0.44, 5.4,
         a, STEEL, '#3f444c');                              // jack strut
  exhaust(cx - fx * len * 0.40, by - 4.4 - fy * len * 0.40);
};
var drawRocket3 = function () {
  // One tapered white body along the rail. Drawn as a plain stroke it
  // read as a pipe, so it is built from three widths: a wide midbody,
  // a shoulder, and a house-colour cone.
  // THE ANGLE IS THE UNIT. RA2's V3 carries its missile on a rail
  // raised to about 40 degrees, and that diagonal is what you
  // recognise across a battlefield. Ours ran -5.2 to -17.0 over a
  // 24.6 chord — a 25 degree lean that read as a pipe lying on a
  // flatbed, which is exactly how it looked beside RA2's own plate.
  // THE LENGTH IS ALSO THE UNIT, and that half was missing. The spec
  // is "missile >= 1.10x the truck length, overhanging >= 5 px at the
  // nose" (unit-identity-reference.md 2.4) and the previous numbers
  // met NEITHER: a 23.6-unit chord on a 22-unit truck is 1.07x, and a
  // tip at u = 11.0 against a hull front at len/2 = 11.0 overhangs by
  // exactly ZERO. RA2's [V3] is 63x36 — the LONGEST land vehicle and
  // an aspect of 1.75; ours measured 1.222, the joint-worst on the
  // board. The chord goes 23.6 -> 30.2 (1.37x the truck, 7 px of nose
  // clear of the bumper) and the rise comes down a shade with it, so
  // the rail keeps its diagonal at about 36 degrees instead of 39.
  var tu = 18.5, tv = -11.5, hu = -15.5, hv = -3.6;   // 2026-09-10: the sheet's rocket lies along the WHOLE truck at ~20 deg, nose past the cab
  var tipx = cx + fx * tu, tipy = by + tv + fy * tu;
  var tlx = cx + fx * hu, tly = by + hv + fy * hu;
  var vx = tipx - tlx, vy = tipy - tly, vl = Math.hypot(vx, vy) || 1;
  var nx3 = -vy / vl, ny3 = vx / vl;
  function band(t0, t1, w0, w1, c0) {
    var ax = tlx + vx * t0, ay = tly + vy * t0;
    var bx = tlx + vx * t1, byq = tly + vy * t1;
    g.beginPath();
    g.moveTo(ax + nx3 * w0, ay + ny3 * w0); g.lineTo(bx + nx3 * w1, byq + ny3 * w1);
    g.lineTo(bx - nx3 * w1, byq - ny3 * w1); g.lineTo(ax - nx3 * w0, ay - ny3 * w0);
    g.closePath(); g.fillStyle = c0; g.fill();
  }
  for (sg = -1; sg <= 1; sg += 2) {                         // tail fins, in house colour
    g.beginPath();
    g.moveTo(tlx + nx3 * 2.3 * sg, tly + ny3 * 2.3 * sg);
    g.lineTo(tlx + vx * 0.15 + nx3 * 2.3 * sg, tly + vy * 0.15 + ny3 * 2.3 * sg);
    g.lineTo(tlx + vx * 0.02 + nx3 * 7.4 * sg, tly + vy * 0.02 + ny3 * 7.4 * sg);
    g.closePath();
    g.fillStyle = sg < 0 ? plit : pdark; g.fill(); outline(g, PEDGE);
  }
  // WHITE body, colour at the two ENDS only. A third colour ring
  // across the midbody (the previous pass) turned the rocket into a
  // candy stripe; on the sheet the V3's missile is white with a red
  // nose and red fins, nothing else.
  band(0.00, 0.09, 2.0, 2.5, pdark);                        // colour motor skirt
  band(0.08, 0.72, 2.5, 2.5, VACC.v3);                      // parallel white midbody
  band(0.70, 0.76, 2.5, 2.1, shade(VACC.v3, 0.94));         // shoulder
  g.beginPath();                                            // house-colour nose cone
  g.moveTo(tlx + vx * 0.76 + nx3 * 2.1, tly + vy * 0.81 + ny3 * 1.9);
  g.lineTo(tipx, tipy);
  g.lineTo(tlx + vx * 0.76 - nx3 * 2.1, tly + vy * 0.81 - ny3 * 1.9);
  g.closePath(); g.fillStyle = panel; g.fill(); outline(g, PEDGE);
  g.fillStyle = plit;
  g.beginPath();
  g.moveTo(tlx + vx * 0.78 + nx3 * 1.7, tly + vy * 0.78 + ny3 * 1.7);
  g.lineTo(tipx - vx * 0.02, tipy - vy * 0.02);
  g.lineTo(tlx + vx * 0.78 + nx3 * 0.2, tly + vy * 0.78 + ny3 * 0.2);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.78)'; g.lineWidth = 1.0;  // lit upper seam
  g.beginPath();
  g.moveTo(tlx + vx * 0.10 + nx3 * 1.3, tly + vy * 0.10 + ny3 * 1.3);
  g.lineTo(tlx + vx * 0.80 + nx3 * 1.3, tly + vy * 0.80 + ny3 * 1.3); g.stroke();
  g.strokeStyle = 'rgba(60,64,70,.55)'; g.lineWidth = 1.4;     // shadowed lower seam
  g.beginPath();
  g.moveTo(tlx + vx * 0.10 - nx3 * 1.6, tly + vy * 0.10 - ny3 * 1.6);
  g.lineTo(tlx + vx * 0.80 - nx3 * 1.6, tly + vy * 0.80 - ny3 * 1.6); g.stroke();
  g.strokeStyle = 'rgba(24,26,30,.55)'; g.lineWidth = 0.8;     // two thin body straps
  for (i2 = 0; i2 < 2; i2++) {
    var tq = 0.20 + i2 * 0.38;
    g.beginPath();
    g.moveTo(tlx + vx * tq + nx3 * 2.5, tly + vy * tq + ny3 * 2.5);
    g.lineTo(tlx + vx * tq - nx3 * 2.5, tly + vy * tq - ny3 * 2.5); g.stroke();
  }
};
if (fy > 0) { drawRig3(); drawCab3(); } else { drawCab3(); drawRig3(); }
drawRocket3();
}
