// Iron Frontier unit art — structures/cloningvats
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/cloningvats` and
// `// @@END structures/cloningvats` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// [NACLON] Cloning Vats. A Soviet hall with four glass cylinders of
// green fluid along its face, pipe runs into a control shed, and a
// house-colour band under the eaves.
var cvLift = 22, cvHw = fw * 0.86, cvHh = fh * 0.86;
prism(g, cx, baseY, cvHw, cvHh, cvLift, '#67685f', '#7d7e74', '#2b2c28', 4);
facePatch(g, faceL, cx, baseY, cvHw, cvHh, cvLift, 0.03, 0.97, 0.80, 0.90, shade(col, 0.82), null);
facePatch(g, faceR, cx, baseY, cvHw, cvHh, cvLift, 0.03, 0.97, 0.80, 0.90, shade(col, 0.60), null);
var cvRy = baseY - cvLift;
// control shed on the roof
prism(g, cx + fw * 0.28, cvRy + fh * 0.16, fw * 0.26, fh * 0.26, 13, '#5d5e56', '#74756c', '#262723', 0);
g.fillStyle = 'rgba(150,210,170,.55)';
g.fillRect(cx + fw * 0.14, cvRy + fh * 0.10 - 9, 11, 4);
// four vats along the near face, back to front
var cvPh = 0.5 + 0.5 * Math.sin((bph || 0) * 6.283);
for (var cvI = 0; cvI < 4; cvI++) {
  var vx = cx - fw * 0.62 + cvI * fw * 0.34, vy = baseY + 3 + (cvI - 1.5) * 3;
  g.fillStyle = 'rgba(10,14,12,.32)';
  g.beginPath(); g.ellipse(vx + 2, vy + 2, 8, 3.4, 0, 0, 6.29); g.fill();
  cylinder(g, vx, vy, 6.4, 24, '#3d5a48', '#54785f', '#1d2a22');
  // the fluid, lit from within
  g.fillStyle = 'rgba(96,214,138,' + (0.42 + 0.24 * (cvI === ((bph || 0) * 4 | 0) ? cvPh : 0.3)).toFixed(2) + ')';
  g.fillRect(vx - 5.4, vy - 21, 10.8, 18);
  g.fillStyle = 'rgba(210,255,225,.30)';
  g.fillRect(vx - 5.0, vy - 21, 2.4, 18);
  // a silhouette suspended in it
  g.fillStyle = 'rgba(16,40,26,.55)';
  g.beginPath(); g.ellipse(vx, vy - 14, 1.9, 3.6, 0, 0, 6.29); g.fill();
  g.fillRect(vx - 0.7, vy - 10, 1.4, 5);
  // cap and pipe up into the wall
  g.fillStyle = '#8a8c84';
  g.beginPath(); g.ellipse(vx, vy - 24, 6.6, 2.9, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#6a6c64'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(vx, vy - 26); g.lineTo(vx + 4, vy - 34); g.stroke();
}
