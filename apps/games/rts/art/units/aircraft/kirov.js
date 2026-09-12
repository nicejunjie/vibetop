// ─── aircraft/kirov ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeVehicle() in rts.src.html — see art/units/README.md.

// KIROV AIRSHIP. Measured off soviet-kirov.png: broadside 137x61
// (w/h 2.25), nose-on 61x86 (0.71). A golden-tan ribbed envelope,
// blunt nose, tapered tail; four house-colour tail fins and two
// house-colour engine pods; a grey gondola slung under the belly;
// a propeller on the tail cone (the two-frame `prop` set spins it).
// LAYER SPLIT: the gondola hangs on its cables and swings a beat
// behind the envelope, so it is baked on a sheet of its own -- part
// 'h' is the airframe WITHOUT it, 'g' / 'go' the gondola alone with
// the bomb bay shut / open ([ZEP] PrimaryFireFLH=-50,0,-140: the
// bomb leaves from under the pod). A layer is skipped by drawing it
// at alpha 0, which leaves the airframe code itself untouched.
var kGond = part !== 'h', kAir = part !== 'g' && part !== 'go';
g.globalAlpha = kAir ? 1 : 0;
var ENV = '#c9a95a', ENVL = '#eddc9a', ENVD = '#6e5320', ENVE = '#3a2c12';
var far = py < 0 ? 1 : -1;                              // which P side is behind the body
var tailAway = fy > 0;                                  // nose toward the viewer: the tail is behind
var tailCone = function () {
  var tp = pt(-1.0);
  g.fillStyle = '#4a4e56'; g.beginPath(); g.ellipse(tp[0], tp[1], 2.6, 2.2, 0, 0, 6.29); g.fill();
  outline(g, '#1e2126');
  g.strokeStyle = '#d8dce2'; g.lineWidth = 1.1; g.lineCap = 'round';
  var pa = anim === 'prop' ? Math.PI / 4 : 0;
  for (var pi2 = 0; pi2 < 2; pi2++) {
    var pang = pa + pi2 * Math.PI / 2;
    g.beginPath();
    g.moveTo(tp[0] + Math.cos(pang) * 4.5 * px, tp[1] + Math.cos(pang) * 4.5 * py - Math.sin(pang) * 4.5);
    g.lineTo(tp[0] - Math.cos(pang) * 4.5 * px, tp[1] - Math.cos(pang) * 4.5 * py + Math.sin(pang) * 4.5);
    g.stroke();
  }
};
var lowerFin = function () { finQuad(-0.70, -0.92, 0, 1, bodyR * 0.85, bodyR + 4.5, shade(col, 0.66), shade(col, 0.36)); };
if (tailAway) { tailCone(); lowerFin(); }
// far side fin (behind the envelope)
finQuad(-0.70, -0.92, px * far, py * far, bodyR * 0.85, bodyR + 5.1, shade(col, 0.72), shade(col, 0.36));
// engine pod, far side
var epF = pt(-0.5);
puck(epF[0] + px * far * bodyR * 0.85, epF[1] + py * far * bodyR * 0.85 + 2.5, 2.4, 4.2, shade(col, 0.7), shade(col, 0.95), shade(col, 0.36));
// envelope
bodyPath();
var q0 = pt(0);
gradA = g.createLinearGradient(q0[0] + nx2 * bodyR * secK, q0[1] + ny2 * bodyR * secK, q0[0] - nx2 * bodyR * secK, q0[1] - ny2 * bodyR * secK);
gradA.addColorStop(0, ENVL); gradA.addColorStop(0.42, ENV); gradA.addColorStop(1, ENVD);
g.fillStyle = gradA; g.fill();
g.strokeStyle = ENVE; g.lineWidth = 0.9; g.stroke();
// ribs: cross-section ellipses, clipped to the envelope
g.save(); bodyPath(); g.clip();
var rt, rp, rr2, ph2;
function hoop(ht, wdt, colr) {
  var hp = pt(ht), hr = rad(ht), k4;
  g.strokeStyle = colr; g.lineWidth = wdt; g.beginPath();
  for (k4 = 0; k4 <= 20; k4++) {
    var a5 = k4 / 20 * 6.2832;
    var hx2 = hp[0] + hr * Math.cos(a5) * px, hy2 = hp[1] + hr * (Math.cos(a5) * py - Math.sin(a5));
    if (k4 === 0) g.moveTo(hx2, hy2); else g.lineTo(hx2, hy2);
  }
  g.stroke();
}
for (rt = -0.78; rt <= 0.79; rt += 0.195) hoop(rt, 0.9, 'rgba(58,44,18,.55)');
// The reference's envelope is belted by three HEAVY dark structural
// hoops. Without them the balloon reads as a smooth party blimp.
hoop(-0.46, 2.4, 'rgba(72,70,62,.85)');
hoop(0.02, 2.4, 'rgba(72,70,62,.85)');
hoop(0.42, 2.1, 'rgba(72,70,62,.85)');
// house-colour band, back at the shoulder so the nose stays clear
// for the shark mouth
hoop(0.50, 2.2, col);
// SHARK MOUTH — the single thing that names a Kirov, and it was
// missing entirely. A dark maw along the belly of the nose with a
// row of white teeth on its upper edge, plus one eye above it.
var m0t = 0.66, m1t = 0.98, mst = 8, mi2;
function belly(tv, up) {
  var bp = pt(tv), be = rad(tv) * secK;
  return [bp[0] - nx2 * be * up, bp[1] - ny2 * be * up];
}
g.beginPath();
for (mi2 = 0; mi2 <= mst; mi2++) { var mp = belly(m0t + (m1t - m0t) * mi2 / mst, 1.0); if (mi2 === 0) g.moveTo(mp[0], mp[1]); else g.lineTo(mp[0], mp[1]); }
for (mi2 = mst; mi2 >= 0; mi2--) { var mq = belly(m0t + (m1t - m0t) * mi2 / mst, 0.46); g.lineTo(mq[0], mq[1]); }
g.closePath(); g.fillStyle = '#241b0c'; g.fill();
g.fillStyle = '#f2ecd8';                                  // teeth
for (mi2 = 0; mi2 < 6; mi2++) {
  var tt0 = m0t + (m1t - m0t) * (mi2 + 0.12) / 6, tt1 = m0t + (m1t - m0t) * (mi2 + 0.88) / 6;
  var pA = belly(tt0, 0.48), pB = belly(tt1, 0.48), pC = belly((tt0 + tt1) / 2, 0.70);
  g.beginPath(); g.moveTo(pA[0], pA[1]); g.lineTo(pB[0], pB[1]); g.lineTo(pC[0], pC[1]); g.closePath(); g.fill();
}
var eyeP = belly(0.74, -0.16);
g.fillStyle = '#f4efe0';
g.beginPath(); g.ellipse(eyeP[0], eyeP[1], 1.8, 1.35, 0, 0, 6.29); g.fill();
g.fillStyle = '#17130a';
g.beginPath(); g.ellipse(eyeP[0] + nx2 * 0.3, eyeP[1] + ny2 * 0.3, 0.9, 0.75, 0, 0, 6.29); g.fill();
// top seam and a lit ridge
g.strokeStyle = 'rgba(255,245,200,.55)'; g.lineWidth = 1.1; g.beginPath();
for (rt = -0.92; rt <= 0.92; rt += 0.08) { rp = pt(rt); if (rt < -0.9) g.moveTo(rp[0], rp[1] - rad(rt)); else g.lineTo(rp[0], rp[1] - rad(rt) * 0.96); }
g.stroke();
g.restore();
// Gondola SLUNG under the belly, with daylight between the two.
// unit-identity-reference.md §2.4 asks for the pod "visibly
// separated below the envelope by >= 4 px", and it used to be
// tucked against the hull: measured, ZERO columns of the broadside
// frame had the pod's top below the envelope's lowest ink, so the
// cables it supposedly hangs on had nothing to span. KGAP is the
// drop, in bake units; the cables now reach the belly.
g.globalAlpha = kGond ? 1 : 0;
var KGAP = 3.4;
var gp = pt(0.08), gpy = gp[1] + rad(0.08) * 0.82 + KGAP;
if (kGond && !kAir) {                               // its own sheet: the cables it hangs on
  g.strokeStyle = 'rgba(58,44,18,.85)'; g.lineWidth = 0.9;
  for (var kc = -1; kc <= 1; kc += 2) {
    g.beginPath(); g.moveTo(gp[0] + kc * 4.2, gpy - 6.5 - KGAP); g.lineTo(gp[0] + kc * 5.4, gpy + 0.4); g.stroke();
  }
}
isoBox(g, gp[0], gpy + 3.4, 12, 5.5, 5.5, a, '#5a5f68', '#23262c');
g.fillStyle = '#c9dce8'; g.fillRect(gp[0] - 4.2, gpy - 0.8, 8.4, 1.4);
g.strokeStyle = '#d6dbe2'; g.lineWidth = 0.9;            // catwalk rails, as the sprite
g.beginPath(); g.moveTo(gp[0] - 5.6, gpy + 1.2); g.lineTo(gp[0] + 5.6, gpy + 1.2); g.stroke();
g.beginPath(); g.moveTo(gp[0] - 5.2, gpy + 3.2); g.lineTo(gp[0] + 5.2, gpy + 3.2); g.stroke();
for (var gr2 = -2; gr2 <= 2; gr2++) {
  g.beginPath(); g.moveTo(gp[0] + gr2 * 2.4, gpy + 1.2); g.lineTo(gp[0] + gr2 * 2.4, gpy + 3.2); g.stroke();
}
if (part === 'go') {
  // Bay OPEN: two leaves hinged down either side, a lit bay between
  // them and the bomb already on its way out.
  g.fillStyle = '#241a06';
  g.beginPath(); g.ellipse(gp[0], gpy + 4.2, 4.4, 1.9, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,186,72,.92)';                  // the lit bay showing through
  g.beginPath(); g.ellipse(gp[0], gpy + 4.0, 3.2, 1.3, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,236,176,.95)';
  g.beginPath(); g.ellipse(gp[0], gpy + 3.9, 1.9, 0.8, 0, 0, 6.29); g.fill();
  for (var bd = -1; bd <= 1; bd += 2) {                  // the two leaves hanging down
    g.fillStyle = bd < 0 ? '#767d89' : '#565c66';
    g.beginPath();
    g.moveTo(gp[0] + bd * 1.4, gpy + 3.4); g.lineTo(gp[0] + bd * 4.6, gpy + 3.0);
    g.lineTo(gp[0] + bd * 6.2, gpy + 7.4); g.lineTo(gp[0] + bd * 2.4, gpy + 7.0);
    g.closePath(); g.fill();
    g.strokeStyle = '#14171c'; g.lineWidth = 0.8; g.stroke();
  }
  g.fillStyle = '#9aa1ac';                               // the bomb dropping clear
  g.beginPath(); g.ellipse(gp[0], gpy + 8.4, 1.9, 3.0, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#20242a'; g.lineWidth = 0.8; g.stroke();
  g.fillStyle = '#23262c';
  g.beginPath(); g.ellipse(gp[0], gpy + 10.6, 1.3, 1.2, 0, 0, 6.29); g.fill();
} else {
  g.fillStyle = '#2a2d33';                               // bomb bay doors, shut
  g.beginPath(); g.ellipse(gp[0], gpy + 4.0, 4.0, 1.5, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#15181d'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(gp[0] - 3.6, gpy + 4.0); g.lineTo(gp[0] + 3.6, gpy + 4.0); g.stroke();
}
g.globalAlpha = kAir ? 1 : 0;
// engine pod, near side
var epN = pt(-0.5);
puck(epN[0] - px * far * bodyR * 0.85, epN[1] - py * far * bodyR * 0.85 + 2.5, 2.2, 4.0, shade(col, 0.74), col, shade(col, 0.36));
// fins: near side, top; bottom and the tail cone if the tail is toward us
finQuad(-0.70, -0.92, -px * far, -py * far, bodyR * 0.85, bodyR + 5.1, col, shade(col, 0.36));
if (!tailAway) { lowerFin(); tailCone(); }
finQuad(-0.70, -0.92, 0, -1, bodyR * 0.85, bodyR + 8, shade(col, 1.1), shade(col, 0.36));
// In the sheet the tail is a busy RED CLUSTER — fins, struts and two
// more outrigger pods — not three flat paper vanes. These sit on top
// of the fins and give the crown its bulk.
var clP = pt(-0.62);
for (var ci = -1; ci <= 1; ci += 2)
  puck(clP[0] + px * ci * bodyR * 0.98, clP[1] + py * ci * bodyR * 0.98 - 1.2,
       1.9, 3.2, shade(col, 0.72), shade(col, 1.06), shade(col, 0.36));
var clQ = pt(-0.86);
puck(clQ[0], clQ[1] - bodyR * 0.95, 1.7, 2.8, shade(col, 0.78), shade(col, 1.12), shade(col, 0.36));
g.strokeStyle = shade(col, 0.5); g.lineWidth = 1.3;      // struts back to the envelope
for (ci = -1; ci <= 1; ci += 2) {
  g.beginPath();
  g.moveTo(clP[0] + px * ci * bodyR * 0.98, clP[1] + py * ci * bodyR * 0.98);
  g.lineTo(clP[0] + px * ci * bodyR * 0.3, clP[1] + py * ci * bodyR * 0.3);
  g.stroke();
}
g.globalAlpha = 1;
