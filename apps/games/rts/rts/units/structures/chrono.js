// ─── structures/chrono ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';
import { cylinder, faceL, facePatch, faceR, prism } from '../../bake/vehicles.js';

export function drawChrono(C) {
  var PLAT_E = C.PLAT_E, baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw,
      g = C.g;

// --- RA2 Chronosphere (GACSPH) --------------------------------------
// Rebuilt against `allied-chronosphere-idle.png` (178x109, w/h 1.63):
// a pale panelled DOME with a grid of blue windows filling the right of
// the plot, and on the left a low deck under two heavy arch rails with
// white capsule pods slung along them. The arches and the drum band are
// the HOUSE remap (the blue in the rip); the dome, the pods and the
// deck are fixed pale steel.
// Six idle phases (`bph`) bake into A.frames and are cycled by drawBld:
// the ring under the dome glows round, and the pod lamps run along.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var CH_SH = '#dfe3ea', CH_SHD = '#9fa6b6', CH_ED = '#3a4050';
var CH_WIN = '#3c4454', CH_WINL = '#aab6c8';   // glass reads as glass, never as the other player's blue

// ---- the deck on the left, with its arch rails --------------------
var chDx = cx - fw * 0.44, chDy = baseY + fh * 0.16;
var chRy = prism(g, chDx, chDy, fw * 0.44, fh * 0.44, 15, '#767c72', '#8f958a', PLAT_E, [0.34, 0.68]);
g.fillStyle = shade(col, 0.85);                          // painted deck stripe
facePatch(g, faceL, chDx, chDy, fw * 0.44, fh * 0.44, 15, 0.08, 0.92, 0.62, 0.80, shade(col, 0.86), null);
facePatch(g, faceR, chDx, chDy, fw * 0.44, fh * 0.44, 15, 0.08, 0.92, 0.62, 0.80, shade(col, 0.66), null);

// two arch rails: a thick house-coloured hoop over the deck
var chArch = function (ax0, ay0, ax1, ay1, rise, w2, tone) {
  g.strokeStyle = shade(col, tone * 0.62); g.lineWidth = w2 + 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(ax0, ay0);
  g.quadraticCurveTo((ax0 + ax1) / 2, (ay0 + ay1) / 2 - rise, ax1, ay1); g.stroke();
  g.strokeStyle = shade(col, tone); g.lineWidth = w2;
  g.beginPath(); g.moveTo(ax0, ay0);
  g.quadraticCurveTo((ax0 + ax1) / 2, (ay0 + ay1) / 2 - rise, ax1, ay1); g.stroke();
  g.strokeStyle = shade(col, tone * 1.35); g.lineWidth = w2 * 0.32;
  g.beginPath(); g.moveTo(ax0, ay0 - w2 * 0.3);
  g.quadraticCurveTo((ax0 + ax1) / 2, (ay0 + ay1) / 2 - rise - w2 * 0.4, ax1, ay1 - w2 * 0.3); g.stroke();
};
chArch(chDx - fw * 0.40, chRy + fh * 0.30, chDx + fw * 0.40, chRy - fh * 0.30, 54, 8, 0.98);
chArch(chDx - fw * 0.16, chRy + fh * 0.40, chDx + fw * 0.52, chRy - fh * 0.16, 46, 6.4, 0.78);

// white capsule pods hung under the near rail
var chPod = function (px2, py2, lit) {
  cylinder(g, px2, py2, 6.4, 15, '#e7eaf0', '#f6f8fc', CH_ED);
  g.fillStyle = shade(col, 0.9); g.fillRect(px2 - 6.4, py2 - 11, 12.8, 3);
  g.fillStyle = lit ? '#dbe6f2' : '#5d6472';
  g.beginPath(); g.ellipse(px2, py2 - 6.5, 2.6, 2.6, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(px2 - 6.4, py2 - 15, 2.4, 15);
};
chPod(chDx - fw * 0.30, chRy + fh * 0.16, ph6 === 0 || ph6 === 3);
chPod(chDx + fw * 0.02, chRy + fh * 0.02, ph6 === 1 || ph6 === 4);
chPod(chDx + fw * 0.34, chRy - fh * 0.12, ph6 === 2 || ph6 === 5);

// ---- the dome -----------------------------------------------------
var chCx = cx + fw * 0.36, chCy = baseY + fh * 0.12, chR = fw * 0.58;
g.fillStyle = 'rgba(0,0,0,.28)';
g.beginPath(); g.ellipse(chCx + 3, chCy + 4, chR * 0.98, chR * 0.42, 0, 0, 6.29); g.fill();
// the chrono ring under the dome, sweeping round as it charges
var chGl = 0.30 + 0.55 * (0.5 + 0.5 * anS);
g.strokeStyle = 'rgba(202,226,246,' + chGl.toFixed(3) + ')'; g.lineWidth = 3.4;
g.beginPath(); g.ellipse(chCx, chCy + 1, chR * 1.02, chR * 0.44, 0, 0, 6.29); g.stroke();
cylinder(g, chCx, chCy, chR * 0.90, 15, shade(CH_SH, 0.72), shade(CH_SH, 0.86), CH_ED);
g.fillStyle = col;                                        // house band round the drum
g.fillRect(chCx - chR * 0.90, chCy - 12, chR * 1.80, 5);
g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(chCx + chR * 0.34, chCy - 12, chR * 0.56, 5);

var chTop = chCy - 15;
g.fillStyle = CH_SH;
g.beginPath(); g.ellipse(chCx, chTop, chR, chR * 0.96, 0, Math.PI, 6.29); g.fill();
outline(g, CH_ED);
g.save();
g.beginPath(); g.ellipse(chCx, chTop, chR, chR * 0.96, 0, Math.PI, 6.29); g.clip();
g.fillStyle = 'rgba(255,255,255,.30)';                    // lit shoulder
g.beginPath(); g.ellipse(chCx - chR * 0.34, chTop - chR * 0.42, chR * 0.44, chR * 0.30, -0.5, 0, 6.29); g.fill();
g.fillStyle = 'rgba(30,36,52,.24)';                       // shaded right flank
g.beginPath(); g.ellipse(chCx + chR * 0.62, chTop - chR * 0.12, chR * 0.42, chR * 0.60, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(90,100,124,.42)'; g.lineWidth = 1.1;
for (var chI = -4; chI <= 4; chI++) {                     // meridian ribs
  g.beginPath(); g.moveTo(chCx + chI * chR * 0.235, chTop);
  g.quadraticCurveTo(chCx + chI * chR * 0.30, chTop - chR * 0.62, chCx, chTop - chR * 0.96);
  g.stroke();
}
// latitude bands, and the blue window panels sitting on them
var chBands = [0.30, 0.56, 0.80];
for (var chB = 0; chB < 3; chB++) {
  var chH = chR * chBands[chB], chRx = Math.sqrt(Math.max(1, chR * chR - chH * chH)), chYb = chTop - chH * 0.96;
  g.strokeStyle = 'rgba(90,100,124,.36)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(chCx, chYb, chRx, chRx * 0.34, 0, 0, 6.29); g.stroke();
  var chN = chB === 2 ? 3 : (chB === 1 ? 5 : 6);
  for (var chW = 0; chW < chN; chW++) {
    var chA = (chW - (chN - 1) / 2) * (chB === 2 ? 0.62 : 0.44);
    var wx = chCx + Math.sin(chA) * chRx, wy = chYb + Math.cos(chA) * chRx * 0.30 - 1;
    var litW = ((chW + chB * 2 + ph6) % 5) === 0;
    g.fillStyle = shade(CH_SHD, 0.72);
    g.fillRect(wx - 5.4, wy - 5.4, 10.8, 10.4);
    g.fillStyle = litW ? CH_WINL : CH_WIN;
    g.fillRect(wx - 4.2, wy - 4.4, 8.4, 8.4);
    g.fillStyle = 'rgba(255,255,255,.30)'; g.fillRect(wx - 4.2, wy - 4.4, 8.4, 2.2);
  }
}
g.restore();
g.fillStyle = shade(CH_SH, 0.92);                          // apex cap + beacon
g.beginPath(); g.ellipse(chCx, chTop - chR * 0.94, 8, 3.4, 0, 0, 6.29); g.fill(); outline(g, CH_ED);
g.fillStyle = ph6 % 2 ? '#e2e9f1' : '#93a0b2';
g.beginPath(); g.arc(chCx, chTop - chR * 0.99 - 3, 2.6, 0, 6.29); g.fill();
}
