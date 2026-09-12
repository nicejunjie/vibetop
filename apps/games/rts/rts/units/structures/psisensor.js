// ─── structures/psisensor ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { diamond, shade } from '../../bake/terrain.js';
import { cylinder } from '../../bake/vehicles.js';

export function drawPsisensor(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g;

// [NAPSIS] Psychic Sensor. Soviet: a squat armoured drum, a ring of
// dish antennae round its shoulder and a violet lens on a gantry that
// pulses. `ConcentricRadialIndicator=true` is the ring motif.
var psH = 26, psR = fw * 0.62;
cylinder(g, cx, baseY - 2, psR, psH, '#6e6f68', '#8b8c83', '#2d2e2a');
// hazard band + house-colour ring
g.fillStyle = shade(col, 0.85);
g.beginPath(); g.ellipse(cx, baseY - 2 - psH + 1, psR, psR * 0.5, 0, 0, 6.29); g.fill();
g.fillStyle = '#8b8c83';
g.beginPath(); g.ellipse(cx, baseY - 2 - psH - 2, psR * 0.92, psR * 0.46, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(20,20,18,.5)'; g.lineWidth = 1;
g.beginPath(); g.ellipse(cx, baseY - 2 - psH - 2, psR * 0.92, psR * 0.46, 0, 0, 6.29); g.stroke();
// six antennae on the shoulder
for (var psI = 0; psI < 6; psI++) {
  var pa = psI * 1.047 + 0.3;
  var pax = cx + Math.cos(pa) * psR * 0.86, pay = baseY - 2 - psH + Math.sin(pa) * psR * 0.43;
  g.strokeStyle = '#4c4d47'; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(pax, pay); g.lineTo(pax, pay - 11); g.stroke();
  g.fillStyle = '#b9bcb4';
  g.beginPath(); g.ellipse(pax, pay - 13, 4.2, 2.4, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#787a72'; g.lineWidth = 0.9;
  g.beginPath(); g.ellipse(pax, pay - 13, 4.2, 2.4, 0, 0, 6.29); g.stroke();
}
// the gantry and the lens
var psTop = baseY - 2 - psH - 4;
g.strokeStyle = '#575850'; g.lineWidth = 3.4;
g.beginPath(); g.moveTo(cx - 7, psTop); g.lineTo(cx, psTop - 22); g.stroke();
g.beginPath(); g.moveTo(cx + 7, psTop); g.lineTo(cx, psTop - 22); g.stroke();
// double-frequency sin(2t) sampled at 6 equally-spaced phases repeats
// exactly every 3 steps (0/3, 1/4, 2/5 land on the same angle mod 2pi,
// structurally, not by coincidence — any pure function of 2t must),
// so the lens only ever pulsed through 3 of its 6 baked brightnesses.
// A small full-cycle cos(t) term is pi-antiperiodic (opposite sign at
// a given phase and that phase+3), which is exactly what's needed to
// pull those doubled-up phases apart without changing the pulse rate.
var psPh = 0.5 + 0.5 * (0.85 * Math.sin((bph || 0) * 6.283 * 2) + 0.15 * Math.cos((bph || 0) * 6.283));
var lg = g.createRadialGradient(cx, psTop - 27, 1, cx, psTop - 27, 13);
lg.addColorStop(0, 'rgba(240,225,255,' + (0.85 + 0.15 * psPh).toFixed(2) + ')');
lg.addColorStop(0.45, 'rgba(176,120,240,' + (0.70 + 0.25 * psPh).toFixed(2) + ')');
lg.addColorStop(1, 'rgba(96,50,170,0)');
g.fillStyle = lg;
g.beginPath(); g.arc(cx, psTop - 27, 13, 0, 6.29); g.fill();
g.fillStyle = '#3a2a5e';
g.beginPath(); g.arc(cx, psTop - 27, 6.4, 0, 6.29); g.fill();
g.fillStyle = 'rgba(226,210,255,.9)';
g.beginPath(); g.arc(cx - 2, psTop - 29, 2.2, 0, 6.29); g.fill();
// concentric rings on the apron, the RadialIndicator motif
g.strokeStyle = 'rgba(178,132,244,.20)'; g.lineWidth = 1.4;
for (var psK = 1; psK <= 3; psK++) { diamond(g, cx, baseY + 4, fw * 0.7 * psK, fh * 0.7 * psK); g.stroke(); }
}
