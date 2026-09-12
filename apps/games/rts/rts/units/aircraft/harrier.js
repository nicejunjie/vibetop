// Iron Frontier — aircraft/harrier: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawHarrier(C) {
  var AL = C.AL, anim = C.anim, bodyPath = C.bodyPath, bodyR = C.bodyR, col = C.col, g = C.g,
      gradB = C.gradB, i2 = C.i2, nx2 = C.nx2, ny2 = C.ny2, pt = C.pt, px = C.px, py = C.py,
      rad = C.rad, secK = C.secK, ux2 = C.ux2, uy2 = C.uy2;

// HARRIER. From allied-harriers.png: a dark blue-grey jet with a
// white belly and nose, swept wings, a tall house-colour fin and
// house wingtips, a bubble canopy. Two Maverick missiles ride under
// the wings until fired (`empty` set).
// In `docs/ra2-ref/cameos/harrier.png` the jet is nearly a BLACK
// silhouette against sky -- far darker than the Nighthawk plate. The
// airframe was '#343b47', a hair off the chopper's own charcoal, and
// the two read as one grey aircraft at map size. The jet takes the
// dark end of the pair; the pale belly and nose stay, because that
// top-to-bottom value break is the Harrier's own read.
var JET = '#222732', JETL = '#4d5462', JETD = '#0e1116', BELLY = '#d5dae2', NOSE = '#eef1f5';
var farH = py < 0 ? 1 : -1;
var wingTop = shade(JET, 1.08), wingEdge = JETD;
// A swept wing: root from t0 to t1, tip from tt0 to tt1 at `span`
// out along the ground perpendicular; s0 picks an inner start so the
// same shape can be overdrawn as a house-colour tip.
function wing(side, t0, t1, tt0, tt1, span, fill, s0, edge) {
  s0 = s0 || 0;
  var r0 = pt(t0 + (tt0 - t0) * s0), r1 = pt(t1 + (tt1 - t1) * s0), w0 = pt(tt0), w1 = pt(tt1);
  g.beginPath();
  g.moveTo(r0[0] + px * side * span * s0, r0[1] + py * side * span * s0);
  g.lineTo(r1[0] + px * side * span * s0, r1[1] + py * side * span * s0);
  g.lineTo(w1[0] + px * side * span, w1[1] + py * side * span);
  g.lineTo(w0[0] + px * side * span, w0[1] + py * side * span);
  g.closePath(); g.fillStyle = fill; g.fill();
  if (edge !== false) { g.strokeStyle = wingEdge; g.lineWidth = 0.7; g.stroke(); }
}
function missile(side) {
  var m0 = pt(-0.08), m1 = pt(-0.44);
  var ox2 = px * side * 4.4, oy2 = py * side * 4.4 + 1.3;
  g.strokeStyle = '#e8ecf2'; g.lineWidth = 1.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(m0[0] + ox2, m0[1] + oy2); g.lineTo(m1[0] + ox2, m1[1] + oy2); g.stroke();
  g.strokeStyle = col; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(m0[0] + ox2, m0[1] + oy2); g.lineTo(m0[0] + ox2 + (m1[0] - m0[0]) * 0.26, m0[1] + oy2 + (m1[1] - m0[1]) * 0.26); g.stroke();
}
// far wing + tailplane + missile first
// A BROAD swept delta: in `allied-harriers.png` the wing is over
// half the silhouette. The 10.5-span sliver the previous pass drew
// left a fuselage with two fins.
wing(farH, 0.34, -0.50, -0.58, -0.26, 13.4, wingTop);
wing(farH, 0.34, -0.50, -0.58, -0.26, 13.4, col, 0.74, false);  // house wingtip
wing(farH, -0.74, -0.96, -1.02, -0.86, 4.8, wingTop);
if (anim !== 'empty') missile(farH);
// fuselage
bodyPath();
var f0 = pt(0);
gradB = g.createLinearGradient(f0[0] + nx2 * bodyR * secK * 1.2, f0[1] + ny2 * bodyR * secK * 1.2, f0[0] - nx2 * bodyR * secK * 1.2, f0[1] - ny2 * bodyR * secK * 1.2);
gradB.addColorStop(0, JETL); gradB.addColorStop(0.5, JET); gradB.addColorStop(1, BELLY);
g.fillStyle = gradB; g.fill(); g.strokeStyle = JETD; g.lineWidth = 0.8; g.stroke();
// nose cone: white, from t=0.7 out
g.save(); bodyPath(); g.clip();
var n0 = pt(0.74), n1 = pt(1.1);
g.fillStyle = NOSE;
g.beginPath();
g.moveTo(n0[0] + nx2 * 5, n0[1] + ny2 * 5); g.lineTo(n1[0] + nx2 * 5, n1[1] + ny2 * 5);
g.lineTo(n1[0] - nx2 * 5, n1[1] - ny2 * 5); g.lineTo(n0[0] - nx2 * 5, n0[1] - ny2 * 5);
g.closePath(); g.fill();
g.fillStyle = 'rgba(0,0,0,.28)';                          // radome seam
g.fillRect(n0[0] - 5, n0[1] - 5, 0.9, 10);
g.restore();
// canopy: a dark bubble with a pale glint, t 0.3..0.62
var cpa = pt(0.46), cpr = rad(0.46);
g.fillStyle = '#1c2230';
g.beginPath(); g.ellipse(cpa[0], cpa[1] - cpr * 0.55, Math.max(2.4, 4.6 * AL / 1.264), 1.9, Math.atan2(uy2, ux2), 0, 6.29); g.fill();
g.fillStyle = 'rgba(235,240,245,.6)';                     // neutral glint: no blue on a red player's jet
g.beginPath(); g.ellipse(cpa[0] - 0.6, cpa[1] - cpr * 0.55 - 0.8, 1.6, 0.7, Math.atan2(uy2, ux2), 0, 6.29); g.fill();
// intakes either side of the canopy
for (i2 = -1; i2 <= 1; i2 += 2) {
  var ip = pt(0.2);
  g.fillStyle = JETD;
  g.beginPath(); g.ellipse(ip[0] + px * i2 * bodyR * 1.15, ip[1] + py * i2 * bodyR * 1.15 + 0.6, 1.6, 1.1, 0, 0, 6.29); g.fill();
}
// near wing, tailplane, missile; then the fin on top
// A BROAD swept delta: in `allied-harriers.png` the wing is over
// half the silhouette. The 10.5-span sliver the previous pass drew
// left a fuselage with two fins.
wing(-farH, 0.34, -0.50, -0.58, -0.26, 13.4, wingTop);
wing(-farH, 0.34, -0.50, -0.58, -0.26, 13.4, col, 0.74, false);  // house wingtip
wing(-farH, -0.74, -0.96, -1.02, -0.86, 4.8, wingTop);
if (anim !== 'empty') missile(-farH);
// swept fin: leading edge rakes back from t=-0.55 at the spine to t=-0.98 at the tip
var fA = pt(-0.52), fB = pt(-0.98), fC = pt(-0.84);
g.beginPath();
g.moveTo(fA[0], fA[1] - bodyR * 0.7); g.lineTo(fB[0], fB[1] - bodyR * 0.7);
g.lineTo(fB[0], fB[1] - bodyR - 5.2); g.lineTo(fC[0], fC[1] - bodyR - 5.2);
g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = shade(col, 0.36); g.lineWidth = 0.7; g.stroke();
g.fillStyle = shade(col, 1.3); g.fillRect(fB[0] - 0.4, fB[1] - bodyR - 4.4, 1.0, 3.2);
// exhaust nozzles at the tail, under the fin
var ex2 = pt(-0.98);
g.fillStyle = '#15181d';
g.beginPath(); g.ellipse(ex2[0], ex2[1] + 0.6, 2.2 * Math.max(0.5, 1 - AL / 1.4), 1.6, 0, 0, 6.29); g.fill();
}
