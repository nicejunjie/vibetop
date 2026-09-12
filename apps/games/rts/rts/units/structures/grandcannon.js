// ─── structures/grandcannon ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';
import { cylinder } from '../../bake/vehicles.js';
import { gproj } from '../../bake/walls.js';

export function drawGrandcannon(C) {
  var baseY = C.baseY, bdir = C.bdir, col = C.col, cx = C.cx, g = C.g;

// --- RA2 Grand Cannon ([GTGCAN]) ------------------------------------
// Re-read at 1:1 off docs/ra2-ref/allied-grand-cannon.png (181x133, the
// in-game render, RED owner). The previous pass had this the wrong way
// round: it drew a low drum on a big parade slab with a forty-pixel
// barbette gun, and nearly all of the sprite was that barrel. The real
// French emplacement is the OPPOSITE — a fat rounded ARMOURED DOME,
// taller than it is wide once the gun is on, standing on a splayed
// steel turntable whose three outrigger arms end in round pads with a
// bright boss, and the gun poking out of its shoulder is SHORT and
// thick with a fat multi-baffle muzzle brake. `bdir` is the bearing it
// is laid on (aimOf bakes the 32 RA2 voxel bearings).
var GC_ST = '#8d93a0', GC_STL = '#c2c8d2', GC_STD = '#3a4050';   // turntable steel
var GC_DM = '#3b4152', GC_DML = '#666d80', GC_DMD = '#1d2130';   // dome armour
var GC_SPC = '#9aa2b8';                                          // the big specular sweep
var GC_GUN = '#7d838f', GC_GUND = '#23262e';
// The idle bearing is the one the cameo and the placement ghost show,
// so it is the grid direction that projects to a flat horizontal gun
// (north-east): pointed any other way the tube foreshortens into the
// dome and the icon reads as a bare turret ring.
var gcA = bdir === undefined ? -0.7854 : bdir;

// ---- turntable: a low steel star with four splayed outrigger arms ---
// The pads land at screen left, right and front (the fourth is behind
// the dome and only its arm root shows), which is how the sprite reads.
var gcArm = [3.9270, 2.3562, 5.4978, 0.7854];         // back, left, right, FRONT (draw order)
for (var gk = 0; gk < 4; gk++) {
  var gaq = gproj(Math.cos(gcArm[gk]) * 0.80, Math.sin(gcArm[gk]) * 0.80);
  var apx = cx + gaq[0], apy = baseY + gaq[1];
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(apx + 2, apy + 3, 10, 4.8, 0, 0, 6.29); g.fill();
  // the arm itself, a tapering plate from the hub out to the pad
  g.strokeStyle = GC_ST; g.lineWidth = 8.0; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, baseY - 1); g.lineTo(apx, apy - 1); g.stroke();
  g.strokeStyle = GC_STD; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(cx, baseY + 2.6); g.lineTo(apx, apy + 2.6); g.stroke();
  // round pad with a bright boss standing proud of it
  g.fillStyle = GC_ST;
  g.beginPath(); g.ellipse(apx, apy - 1, 9.0, 4.4, 0, 0, 6.29); g.fill(); outline(g, GC_STD);
  g.fillStyle = 'rgba(255,255,255,.13)';
  g.beginPath(); g.ellipse(apx - 1.5, apy - 2.2, 6.0, 2.6, 0, 0, 6.29); g.fill();
  g.fillStyle = GC_STL;
  g.beginPath(); g.ellipse(apx, apy - 3.2, 3.8, 2.3, 0, 0, 6.29); g.fill(); outline(g, GC_STD);
  g.fillStyle = '#f0f3f8';
  g.beginPath(); g.ellipse(apx - 0.6, apy - 4.0, 2.2, 1.3, 0, 0, 6.29); g.fill();
}
// hub plinth the dome turns on, with a house rim round the race
cylinder(g, cx, baseY - 1, 21, 6, '#6e7484', GC_ST, GC_STD);
g.fillStyle = shade(col, 0.72);
g.beginPath(); g.ellipse(cx, baseY - 7, 21, 9.4, 0, 0, 6.29);
g.ellipse(cx, baseY - 7, 17.4, 7.8, 0, 0, 6.29); g.fill('evenodd');

// ---- the armoured dome ----------------------------------------------
// A SQUAT rounded mass with a wide foot, not an egg on end: the
// silhouette leaves the turntable almost vertically, bellies out at a
// third of its height and closes over the top.
var domH = 44, domR = 22, domY = baseY - 6;
function domePath() {
  g.beginPath();
  g.moveTo(cx - domR, domY - 6);
  g.bezierCurveTo(cx - domR - 0.5, domY - domH * 0.62, cx - domR * 0.70, domY - domH,
                  cx - domR * 0.06, domY - domH);
  g.bezierCurveTo(cx + domR * 0.66, domY - domH, cx + domR + 0.5, domY - domH * 0.60,
                  cx + domR, domY - 6);
  g.bezierCurveTo(cx + domR, domY + 5, cx - domR, domY + 5, cx - domR, domY - 6);
  g.closePath();
}
domePath(); g.fillStyle = GC_DM; g.fill(); outline(g, GC_DMD);
g.save(); domePath(); g.clip();
// HOUSE band round the foot, drawn as a big ellipse whose TOP ARC is
// the band's edge — so it bows across the front the way the sprite's
// does instead of ringing the far side as well.
g.fillStyle = shade(col, 0.86);
g.beginPath(); g.ellipse(cx, domY + 4, domR * 1.02, 9.6, 0, 0, 6.29); g.fill();
g.fillStyle = shade(col, 1.18);
g.beginPath(); g.ellipse(cx - 2, domY + 3.6, domR * 0.76, 7.0, 0, 0, 6.29); g.fill();
g.fillStyle = shade(col, 0.58);
g.beginPath(); g.ellipse(cx, domY + 8, domR * 1.02, 8.2, 0, 0, 6.29); g.fill();
// near-right flank catches the light in one broad sweep
g.fillStyle = GC_SPC;
g.beginPath(); g.ellipse(cx + 5.4, domY - domH * 0.44, 6.6, domH * 0.40, -0.16, 0, 6.29); g.fill();
g.fillStyle = 'rgba(228,235,248,.48)';
g.beginPath(); g.ellipse(cx + 3.8, domY - domH * 0.54, 3.2, domH * 0.24, -0.16, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(20,24,36,.45)'; g.lineWidth = 1.1;
g.beginPath(); g.ellipse(cx + 5.4, domY - domH * 0.44, 6.6, domH * 0.40, -0.16, 0, 6.29); g.stroke();
// shaded far-right shoulder
g.fillStyle = 'rgba(14,17,26,.44)';
g.beginPath(); g.ellipse(cx + domR * 0.86, domY - domH * 0.34, 7.4, domH * 0.34, 0.22, 0, 6.29); g.fill();
// HOUSE armour: one broad cheek plate on the near-LEFT quarter...
g.fillStyle = col;
g.beginPath(); g.ellipse(cx - domR * 0.60, domY - domH * 0.52, 6.4, domH * 0.32, 0.16, 0, 6.29); g.fill();
g.fillStyle = shade(col, 1.28);
g.beginPath(); g.ellipse(cx - domR * 0.68, domY - domH * 0.60, 3.0, domH * 0.16, 0.16, 0, 6.29); g.fill();
// armour seams: the sprite's dome is welded plate, not a smooth shell
g.strokeStyle = 'rgba(12,15,24,.55)'; g.lineWidth = 1.1;
g.beginPath(); g.moveTo(cx - domR, domY - domH * 0.30); g.lineTo(cx + domR, domY - domH * 0.44); g.stroke();
g.beginPath(); g.moveTo(cx - domR * 0.20, domY - domH * 0.99); g.lineTo(cx - domR * 0.34, domY + 4); g.stroke();
g.lineWidth = 1;
// the dark visor slot the gun comes out of
g.fillStyle = GC_DMD;
g.beginPath(); g.ellipse(cx + 1.5, domY - domH * 0.66, 9.0, 5.0, -0.18, 0, 6.29); g.fill();
g.restore();
domePath(); outline(g, GC_DMD);
// two service pipes off the far shoulder
g.strokeStyle = '#a8aeb8'; g.lineWidth = 2.4; g.lineCap = 'round';
g.beginPath(); g.moveTo(cx - 7, domY - domH * 0.88); g.lineTo(cx - 10, domY - domH - 7); g.stroke();
g.beginPath(); g.moveTo(cx - 2, domY - domH * 0.94); g.lineTo(cx - 3.6, domY - domH - 4); g.stroke();
g.strokeStyle = '#5d636d'; g.lineWidth = 1;
g.beginPath(); g.moveTo(cx - 10, domY - domH - 7); g.lineTo(cx - 3.6, domY - domH - 4); g.stroke();

// ---- the gun --------------------------------------------------------
// SHORT and thick, out of the dome's shoulder, elevated a shallow 20-odd
// degrees, with a fat multi-baffle brake at the tip.
var bx = Math.cos(gcA), byy = Math.sin(gcA);
var bq = gproj(bx, byy);                       // one grid cell along the bearing, projected
var bl = Math.sqrt(bq[0] * bq[0] + bq[1] * bq[1]) || 1;
var ux2 = bq[0] / bl, uy2 = bq[1] / bl;
var pivX = cx, pivY = domY - domH * 0.66;
var LEN = 25, RISE = 15;
var tipX = pivX + ux2 * LEN, tipY = pivY + uy2 * LEN - RISE;
function gcAt(t) { return [pivX + ux2 * LEN * t, pivY + uy2 * LEN * t - RISE * t]; }
// mantlet: a chunky block sitting in the dome's slot
g.fillStyle = GC_DML;
g.beginPath(); g.ellipse(pivX + ux2 * 3, pivY + uy2 * 3 - 1.8, 9.2, 7.6, 0, 0, 6.29); g.fill();
outline(g, GC_DMD);
g.fillStyle = col;
g.beginPath(); g.ellipse(pivX + ux2 * 2, pivY + uy2 * 2 - 3.4, 6.0, 4.4, 0, 0, 6.29); g.fill();
// the tube: a dark casing, a house-plated box over it, a steel top strip
g.lineCap = 'butt';
var p0 = gcAt(0.10), p1 = gcAt(0.94);
g.strokeStyle = GC_GUND; g.lineWidth = 11.0;
g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
g.strokeStyle = col; g.lineWidth = 8.4;
g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
g.strokeStyle = shade(col, 0.66); g.lineWidth = 2.0;
g.beginPath(); g.moveTo(p0[0], p0[1] + 3.2); g.lineTo(p1[0], p1[1] + 3.2); g.stroke();
g.strokeStyle = GC_GUN; g.lineWidth = 3.4;
g.beginPath(); g.moveTo(p0[0], p0[1] - 2.8); g.lineTo(p1[0], p1[1] - 2.8); g.stroke();
g.strokeStyle = shade(col, 1.34); g.lineWidth = 1.2;
g.beginPath(); g.moveTo(p0[0] - 1.0, p0[1] - 4.2); g.lineTo(p1[0] - 1.0, p1[1] - 4.2); g.stroke();
// three baffle fins, then the brake
g.strokeStyle = '#565d68'; g.lineWidth = 10.4;
for (gk = 0; gk < 3; gk++) {
  var pf = gcAt(0.62 + gk * 0.16);
  g.beginPath(); g.moveTo(pf[0], pf[1]); g.lineTo(pf[0] + ux2 * 1.6, pf[1] + uy2 * 1.6 - 1.0); g.stroke();
}
g.fillStyle = '#6a7280';
g.beginPath(); g.ellipse(tipX, tipY, 6.2, 5.4, 0, 0, 6.29); g.fill(); outline(g, GC_GUND);
g.fillStyle = '#12151a';
g.beginPath(); g.ellipse(tipX + ux2 * 1.8, tipY + uy2 * 1.8 - 0.5, 2.6, 2.3, 0, 0, 6.29); g.fill();
g.lineWidth = 1;
}
