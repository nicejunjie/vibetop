// Iron Frontier — structures/spysat: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawSpysat(C) {
  var CONC = C.CONC, STEEL = C.STEEL, baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx,
      fh = C.fh, fw = C.fw, g = C.g;

// [GASPYSAT] SpySat Uplink. A low Allied signals bunker with a big
// white parabolic dish on a yoke, tilted up at the sky, a feed horn on
// three struts and a cable trunk running down into the roof.
var ssLift = 20, ssHw = fw * 0.82, ssHh = fh * 0.82;
prism(g, cx, baseY, ssHw, ssHh, ssLift, CONC, shade(CONC, 1.06), '#3a3a34', 3);
// service door + louvres, house colour on the door only
facePatch(g, faceR, cx, baseY, ssHw, ssHh, ssLift, 0.30, 0.52, 0.05, 0.72, shade(col, 0.80), '#2c2c28');
for (var ssV = 0; ssV < 4; ssV++) {
  var sst = 0.12 + ssV * 0.13;
  facePatch(g, faceL, cx, baseY, ssHw, ssHh, ssLift, sst, sst + 0.07, 0.22, 0.62, 'rgba(30,34,38,.55)', null);
}
var ssRy = baseY - ssLift;
// dish mount: a short pedestal and a two-arm yoke
cylinder(g, cx + 2, ssRy - 2, 7, 12, STEEL, shade(STEEL, 1.2), '#33383a');
g.strokeStyle = shade(STEEL, 0.72); g.lineWidth = 3;
g.beginPath(); g.moveTo(cx - 4, ssRy - 12); g.lineTo(cx - 12, ssRy - 26); g.stroke();
g.beginPath(); g.moveTo(cx + 9, ssRy - 12); g.lineTo(cx + 15, ssRy - 24); g.stroke();
// the dish: an ellipse seen three-quarters on, rim + shaded interior
var dcx = cx + 2, dcy = ssRy - 34, drx = fw * 0.62, dry = fw * 0.40;
g.save();
g.translate(dcx, dcy); g.rotate(-0.30);
g.fillStyle = '#cdd2d6';
g.beginPath(); g.ellipse(0, 0, drx, dry, 0, 0, 6.29); g.fill();
g.fillStyle = '#e6eaee';
g.beginPath(); g.ellipse(-drx * 0.10, -dry * 0.12, drx * 0.86, dry * 0.82, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(120,132,142,.45)';
g.beginPath(); g.ellipse(drx * 0.18, dry * 0.16, drx * 0.72, dry * 0.66, 0, 0, 6.29); g.fill();
g.strokeStyle = '#8e979d'; g.lineWidth = 2;
g.beginPath(); g.ellipse(0, 0, drx, dry, 0, 0, 6.29); g.stroke();
g.strokeStyle = 'rgba(150,160,168,.55)'; g.lineWidth = 1;
for (var ssR = 0; ssR < 6; ssR++) {
  var sa = ssR * Math.PI / 6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(sa) * drx, Math.sin(sa) * dry); g.stroke();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-Math.cos(sa) * drx, -Math.sin(sa) * dry); g.stroke();
}
// feed horn on three struts
g.strokeStyle = '#7d868c'; g.lineWidth = 1.4;
[-1, 0, 1].forEach(function (k3) {
  g.beginPath(); g.moveTo(k3 * drx * 0.66, k3 * dry * 0.2 + dry * 0.35); g.lineTo(0, -dry * 0.95); g.stroke();
});
g.fillStyle = shade(col, 0.9);
g.beginPath(); g.ellipse(0, -dry * 1.0, 4.2, 3.0, 0, 0, 6.29); g.fill();
g.restore();
// cable trunk into the roof, and a beacon that keeps time with bph
g.strokeStyle = '#4a4f52'; g.lineWidth = 3;
g.beginPath(); g.moveTo(cx + 6, ssRy - 14); g.quadraticCurveTo(cx + 18, ssRy - 8, cx + 20, ssRy + 1); g.stroke();
// a pure single-frequency sin sampled at the 6 baked phases collides
// 0/3, 1/2 and 4/5 (see walk-cycle.js's header on the Attack Dog) —
// the +0.35 rad offset keeps the same blink but visits six distinct
// brightnesses instead of three doubled-up ones.
var ssPh = 0.5 + 0.5 * Math.sin((bph || 0) * 6.283 + 0.35);
g.fillStyle = 'rgba(255,110,110,' + (0.35 + 0.6 * ssPh).toFixed(2) + ')';
g.beginPath(); g.arc(cx - fw * 0.66, ssRy - 5, 2.6, 0, 6.29); g.fill();
}
