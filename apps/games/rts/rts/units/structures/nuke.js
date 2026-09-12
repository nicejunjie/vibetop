// ─── structures/nuke ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { diamond, shade } from '../../bake/terrain.js';
import { faceL, facePatch, faceR, prism, railing, steam } from '../../bake/vehicles.js';

export function drawNuke(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot;

// --- RA2 Nuclear Missile Silo (NAMISL) ------------------------------
// Rebuilt against `soviet-nuclear-silo-idle.png` (152x131, w/h 1.16): a
// near-black ribbed TOWER on a broad pale concrete apron with railings,
// red trim bands under its head, a big red service hoop on the front
// face, and the split hatch doors on the roof. Red is the HOUSE remap;
// the tower, apron and rails are fixed. Six idle phases blink the hatch
// lights and pulse the seam between the doors.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var NS_W = '#33302e', NS_WL = '#494340', NS_R = '#3c3936', NS_ED = '#141312';

// ---- apron + railings ----------------------------------------------
plot(g, cx, baseY + 3, fw * 2.02, fh * 2.02);
g.fillStyle = '#a7a89c'; g.fill(); outline(g, '#5a5b52');
plot(g, cx, baseY, fw * 1.88, fh * 1.88);
g.fillStyle = '#bcbdb0'; g.fill(); outline(g, '#63645a');
g.save(); plot(g, cx, baseY, fw * 1.88, fh * 1.88); g.clip();
g.strokeStyle = 'rgba(80,82,74,.32)'; g.lineWidth = 1;
for (var nsS = -3; nsS <= 3; nsS++) {
  g.beginPath(); g.moveTo(cx + nsS * 26 - fw, baseY + nsS * 13 + fh); g.lineTo(cx + nsS * 26 + fw, baseY + nsS * 13 - fh); g.stroke();
  g.beginPath(); g.moveTo(cx - nsS * 26 - fw, baseY - nsS * 13 + fh); g.lineTo(cx - nsS * 26 + fw, baseY - nsS * 13 - fh); g.stroke();
}
g.restore();
g.strokeStyle = shade(col, 0.72); g.lineWidth = 2.2;           // painted apron kerb
plot(g, cx, baseY, fw * 1.88, fh * 1.88); g.stroke();
railing(g, cx - fw * 0.94, baseY, cx, baseY + fh * 0.94, 9, 'rgba(96,98,90,.9)');
railing(g, cx, baseY + fh * 0.94, cx + fw * 0.94, baseY, 9, 'rgba(96,98,90,.9)');

// ---- the tower -----------------------------------------------------
var nsBy = baseY - fh * 0.06, nsHw = fw * 0.50, nsHh = fh * 0.50, nsLift = 84;
g.fillStyle = 'rgba(0,0,0,.34)';
diamond(g, cx + 5, nsBy + 6, nsHw * 2, nsHh * 2); g.fill();
var nsRy = prism(g, cx, nsBy, nsHw, nsHh, nsLift, NS_W, NS_R, NS_ED, [0.30, 0.62]);
// vertical ribbing on both walls
for (var nsC = 1; nsC < 7; nsC++) {
  var nt = nsC / 7;
  facePatch(g, faceL, cx, nsBy, nsHw, nsHh, nsLift, nt - 0.018, nt + 0.018, 0.02, 0.94, 'rgba(255,255,255,.06)', null);
  facePatch(g, faceR, cx, nsBy, nsHw, nsHh, nsLift, nt - 0.018, nt + 0.018, 0.02, 0.94, 'rgba(0,0,0,.16)', null);
}
// lit slit windows
for (var nsWv = 0; nsWv < 3; nsWv++) {
  var nv = 0.30 + nsWv * 0.21;
  facePatch(g, faceL, cx, nsBy, nsHw, nsHh, nsLift, 0.16, 0.84, nv, nv + 0.035, 'rgba(226,196,120,' + (0.22 + (nsWv === ph6 % 3 ? 0.34 : 0)).toFixed(2) + ')', null);
}
// red trim bands under the head, on both faces
[[faceL, 1.0], [faceR, 0.74]].forEach(function (F) {
  facePatch(g, F[0], cx, nsBy, nsHw, nsHh, nsLift, 0.02, 0.98, 0.840, 0.892, shade(col, F[1]), null);
  facePatch(g, F[0], cx, nsBy, nsHw, nsHh, nsLift, 0.02, 0.98, 0.920, 0.962, shade(col, F[1] * 0.72), null);
  facePatch(g, F[0], cx, nsBy, nsHw, nsHh, nsLift, 0.02, 0.98, 0.024, 0.054, shade(col, F[1] * 0.60), null);
});
// the big service hoop on the left face
var nsA = faceL(cx, nsBy, nsHw, nsHh, nsLift, 0.20, 0.10), nsB = faceL(cx, nsBy, nsHw, nsHh, nsLift, 0.82, 0.10);
var nsM = faceL(cx, nsBy, nsHw, nsHh, nsLift, 0.51, 0.62);
g.strokeStyle = shade(col, 0.60); g.lineWidth = 7.6; g.lineCap = 'round';
g.beginPath(); g.moveTo(nsA[0], nsA[1]); g.quadraticCurveTo(nsM[0], nsM[1], nsB[0], nsB[1]); g.stroke();
g.strokeStyle = col; g.lineWidth = 4.6;
g.beginPath(); g.moveTo(nsA[0], nsA[1]); g.quadraticCurveTo(nsM[0], nsM[1], nsB[0], nsB[1]); g.stroke();
g.strokeStyle = 'rgba(255,255,255,.20)'; g.lineWidth = 1.2;
g.beginPath(); g.moveTo(nsA[0], nsA[1] - 1.6); g.quadraticCurveTo(nsM[0], nsM[1] - 1.8, nsB[0], nsB[1] - 1.6); g.stroke();

// ---- roof: the split hatch doors + lights ---------------------------
diamond(g, cx, nsRy - 3, nsHw * 1.70, nsHh * 1.70);
g.fillStyle = '#2a2724'; g.fill(); outline(g, '#0f0e0d');
g.strokeStyle = shade(col, 0.86); g.lineWidth = 2.6;           // painted hatch frame
diamond(g, cx, nsRy - 3, nsHw * 1.70, nsHh * 1.70); g.stroke();
g.save(); diamond(g, cx, nsRy - 3, nsHw * 1.70, nsHh * 1.70); g.clip();
g.fillStyle = '#1b1917';
g.beginPath();
g.moveTo(cx - nsHw * 0.86, nsRy - 3); g.lineTo(cx, nsRy - 3 - nsHh * 0.86);
g.lineTo(cx + nsHw * 0.86, nsRy - 3); g.lineTo(cx, nsRy - 3 + nsHh * 0.86);
g.closePath(); g.fill();
g.strokeStyle = 'rgba(255,168,96,' + (0.30 + 0.50 * (0.5 + 0.5 * anS)).toFixed(3) + ')';
g.lineWidth = 2.2;
g.beginPath(); g.moveTo(cx - nsHw * 0.80, nsRy - 3 + nsHh * 0.06); g.lineTo(cx + nsHw * 0.80, nsRy - 3 - nsHh * 0.06); g.stroke();
g.restore();
// four hatch lamps that run round the rim
for (var nsL = 0; nsL < 4; nsL++) {
  var nlx = cx + [-1, 0, 1, 0][nsL] * nsHw * 0.92, nly = nsRy - 3 + [0, 1, 0, -1][nsL] * nsHh * 0.92;
  g.fillStyle = (nsL === ph6 % 4) ? shade(col, 1.35) : shade(col, 0.62);
  g.beginPath(); g.arc(nlx, nly, 2.8, 0, 6.29); g.fill();
  g.strokeStyle = '#15130f'; g.lineWidth = 0.8; g.stroke();
}
// vent mast
g.fillStyle = '#3b3835';
g.fillRect(cx + nsHw * 0.42, nsRy - 20, 5.4, 20); outline(g, NS_ED);
g.fillStyle = '#191715';
g.beginPath(); g.ellipse(cx + nsHw * 0.42 + 2.7, nsRy - 20, 3.4, 1.5, 0, 0, 6.29); g.fill();
steam(g, cx + nsHw * 0.42 + 2.7, nsRy - 24, 4, 3);
}
