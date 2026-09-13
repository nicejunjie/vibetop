// Iron Frontier — aircraft/kirov: the art for one unit.
// Called by bakeVehicle() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawKirov(C) {
  var a = C.a, anim = C.anim, bodyPath = C.bodyPath, bodyR = C.bodyR, col = C.col,
      finQuad = C.finQuad, fy = C.fy, g = C.g, gradA = C.gradA, nx2 = C.nx2, ny2 = C.ny2,
      part = C.part, pt = C.pt, puck = C.puck, px = C.px, py = C.py, rad = C.rad, secK = C.secK;

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
// ENVD WAS BAKING OLIVE. #6e5320 is a brown on the palette but not on the
// GRID: (110,83,32) snaps channel-wise to (102,102,51) = #666633, which is the
// army's olive, so the airship's whole shaded underside came out green and the
// gold body above it read as camouflage. #66400f lands on #663300 — RA2's own
// dark brown, and the colour its envelope actually shades to.
var ENV = '#c9a95a', ENVL = '#eddc9a', ENVD = '#66400f', ENVE = '#3a2c12';
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
// FOUR FINS IN TWO PAIRS, which is what the frame measures and what ours did
// not have: every fin sat in one cruciform at t -0.70..-0.92 and read as a
// single crumpled red mass on one end. On RA2's 155x61 frame the red resolves
// into a tail pair at x 12-23% (t -0.76..-0.54) and a SECOND pair a third of
// the way along at x 35-44% (t -0.30..-0.12), each blade 10-16 px.
var lowerFin = function () { finQuad(-0.54, -0.76, 0, 1, bodyR * 0.85, bodyR + 4.5, shade(col, 0.66), shade(col, 0.36)); };
var midFins = function () {
  finQuad(-0.12, -0.30, 0, 1, bodyR * 0.80, bodyR + 3.0, shade(col, 0.60), shade(col, 0.34));
  finQuad(-0.12, -0.30, 0, -1, bodyR * 0.80, bodyR + 3.4, shade(col, 0.94), shade(col, 0.34));
};
if (tailAway) { tailCone(); lowerFin(); }
// far side fin (behind the envelope)
finQuad(-0.54, -0.76, px * far, py * far, bodyR * 0.85, bodyR + 5.1, shade(col, 0.72), shade(col, 0.36));
finQuad(-0.12, -0.30, px * far, py * far, bodyR * 0.80, bodyR + 3.2, shade(col, 0.66), shade(col, 0.34));
// engine pod, far side
var epF = pt(-0.5);
puck(epF[0] + px * far * bodyR * 0.85, epF[1] + py * far * bodyR * 0.85 + 2.5, 2.4, 4.2, shade(col, 0.7), shade(col, 0.95), shade(col, 0.36));
// envelope
bodyPath();
var q0 = pt(0);
// FLAT BANDS, NOT A SWEEP. A smooth three-stop gradient across the envelope
// is exactly the input the palette snap cannot keep tidy: the sweep crosses
// each grid line at a different place on every cross-section, so the bands
// broke up into a patchwork of olive and tan blotches that read as camouflage
// or as scales. The reference's envelope is three flat zones — a cream top
// highlight, the gold body, a shaded underside — so they are drawn as three
// zones with hard stops and the quantiser has nothing left to smear.
gradA = g.createLinearGradient(q0[0] + nx2 * bodyR * secK, q0[1] + ny2 * bodyR * secK, q0[0] - nx2 * bodyR * secK, q0[1] - ny2 * bodyR * secK);
gradA.addColorStop(0, ENVL); gradA.addColorStop(0.30, ENVL);
gradA.addColorStop(0.3001, ENV); gradA.addColorStop(0.70, ENV);
gradA.addColorStop(0.7001, ENVD); gradA.addColorStop(1, ENVD);
g.fillStyle = gradA; g.fill();
g.strokeStyle = ENVE; g.lineWidth = 0.9; g.stroke();
// ribs: cross-section ellipses, clipped to the envelope
g.save(); bodyPath(); g.clip();
var rt, rp, rr2, ph2;
// ONLY THE NEAR HALF OF THE RING IS VISIBLE. This stroked the FULL ellipse,
// 0 to 2pi, so every band round the hull was drawn as a closed loop — and the
// half of it that runs round the BACK of the envelope came out on top of the
// gold instead of being hidden behind it. A ring on an opaque body of
// revolution shows one arc, not two; seeing both is the classic tell that a
// solid is being drawn as a wireframe.
//
// Which arc is behind follows from the geometry already here: a point at angle
// `a` sits `hr*cos(a)` along the ground-perpendicular P, and `far` is the sign
// of P that points AWAY from the camera. So the far arc is where cos(a) has
// the same sign as `far`, and only the other one is drawn. `open` keeps the
// old full-circle behaviour available for anything that is genuinely a ring
// standing clear of the hull.
function hoop(ht, wdt, colr, open) {
  var hp = pt(ht), hr = rad(ht), k4, started = false;
  g.strokeStyle = colr; g.lineWidth = wdt; g.beginPath();
  for (k4 = 0; k4 <= 40; k4++) {
    var a5 = k4 / 40 * 6.2832, ca = Math.cos(a5);
    if (!open && ca * far > 0) { started = false; continue; }
    var hx2 = hp[0] + hr * ca * px, hy2 = hp[1] + hr * (ca * py - Math.sin(a5));
    if (!started) { g.moveTo(hx2, hy2); started = true; } else g.lineTo(hx2, hy2);
  }
  g.stroke();
}
// NINE THIN RINGS WERE THE SCALES. They were drawn at alpha .55 — which is
// 140, over `pixelate`'s alpha cut of 96 — so the quantiser did not fade them,
// it SNAPPED EVERY ONE TO FULLY OPAQUE. Nine hard dark bands across a mottled
// gold envelope stopped reading as fabric over a frame and started reading as
// the flank of a fish. The rip has no such thing: a census of its mid-body is
// 7% near-white top highlight, 6% pale gold, and the only darks are the three
// or four heavy structural straps below. Two faint ones survive, wide apart.
// (none — see the straps below; anything fainter than those became a band)
// The reference's envelope is belted by three HEAVY dark structural
// hoops. Without them the balloon reads as a smooth party blimp.
// THIN AND DARK, and only three. Bisected by disabling the hoop function and
// re-rendering: with no hoops the envelope is clean flat gold with one cream
// ridge, so the hoops WERE the stripes. Two things made them stripes rather
// than straps. They were 2.1-2.4 px wide, which at this scale is a band and
// not a belt; and a circumferential ellipse seen nose-on piles many stroke
// samples onto the same pixels, so even a 28%-alpha hoop compounded past the
// point where it read. The rip's straps are one dark pixel wide against gold.
// THE STRAPS ARE GREY STRUCTURAL MEMBERS, measured, not dark hoops. Segmenting
// the reference by colour family puts 21.2% of it in mid-grey, and two of those
// blobs are uprights on the envelope: 15x27 px at x 73-82% and 12x16 at
// x 56-63% — each spanning 27-43% of the hull's height, with feet. Ours were
// 1-px dark rings following the ellipse, which read as barrel bands.
(function () {
  // CLIPPED TO THE ENVELOPE. Drawn free they stood proud of the hull like three
  // masts; the reference's members lie ON the fabric and stop at its edge.
  g.save(); bodyPath(); g.clip();
  var BANDS = [[0.46, 0.74, '#8a8a8a'], [0.10, 0.72, '#7a7a7a'], [-0.30, 0.66, '#6e6e6e']];
  for (var bI = 0; bI < BANDS.length; bI++) {
    var bt = BANDS[bI][0], bh = BANDS[bI][1], bc = BANDS[bI][2];
    var bp = pt(bt), be = rad(bt) * secK;
    g.fillStyle = bc;
    g.beginPath();
    g.moveTo(bp[0] - nx2 * be * bh - 1.1, bp[1] - ny2 * be * bh);
    g.lineTo(bp[0] - nx2 * be * bh + 1.1, bp[1] - ny2 * be * bh);
    g.lineTo(bp[0] + nx2 * be * bh + 1.1, bp[1] + ny2 * be * bh);
    g.lineTo(bp[0] + nx2 * be * bh - 1.1, bp[1] + ny2 * be * bh);
    g.closePath(); g.fill();
    g.fillStyle = '#4a4a4a';                       // the foot at each end
    g.fillRect(bp[0] - nx2 * be * bh - 1.8, bp[1] - ny2 * be * bh - 0.9, 3.6, 1.8);
    g.fillRect(bp[0] + nx2 * be * bh - 1.8, bp[1] + ny2 * be * bh - 0.9, 3.6, 1.8);
  }
  // LONGITUDINAL FABRIC, which the reference has and a flat fill cannot fake:
  // its envelope is streaked along its length in alternating light and mid
  // gold, the gores of a doped-fabric hull. Ours was one flat tan area with a
  // single hard cream wedge, and that wedge read as a separate object lying on
  // the balloon rather than as the lit top of it.
  var GORE = ['rgba(255,204,153,.55)', 'rgba(153,102,51,.34)'];
  for (var gI = -3; gI <= 3; gI++) {
    if (!gI) continue;
    g.strokeStyle = GORE[Math.abs(gI) % 2];
    g.lineWidth = 1.0;
    g.beginPath();
    for (var gT = -0.95; gT <= 0.95; gT += 0.06) {
      var gp2 = pt(gT), ge = rad(gT) * secK * (gI / 3.6);
      var gx = gp2[0] - nx2 * ge, gy = gp2[1] - ny2 * ge;
      if (gT < -0.94) g.moveTo(gx, gy); else g.lineTo(gx, gy);
    }
    g.stroke();
  }
  g.restore();
})();
// NO HOUSE RING ROUND THE ENVELOPE. A 2.2 px band of the player's colour
// wrapped the hull at the shoulder and, once the fabric stopped being a
// patchwork, it was the loudest thing on the airship — a red hoop round a gold
// balloon. The rip puts the house colour on the TAIL FINS and the ENGINE PODS,
// both of which this file already paints with `col`, and leaves the envelope
// gold from nose to tail. A thin seam is enough to say the frame is there.
hoop(0.50, 0.9, shade(col, 0.62));
// SHARK MOUTH — the single thing that names a Kirov, and it was
// missing entirely. A dark maw along the belly of the nose with a
// row of white teeth on its upper edge, plus one eye above it.
// THE SHARK MOUTH IS BIG, and shrinking it was my own overcorrection. Zoomed on
// the reference's nose it is unmistakable: a black maw running most of the blunt
// nose dome with ORANGE-GOLD teeth along its upper edge, and a dark eye patch
// above and behind it. That is painted nose art on a bomber, which is what this
// airship is, and it is the loudest thing on the front half. What was wrong
// before was never that it existed — it was that our teeth were near-WHITE, the
// brightest value on the airship, and the eye a cartoon white sclera with a
// black pupil. Both are dark-on-dark in the rip.
var m0t = 0.60, m1t = 1.00, mst = 10, mi2;
function belly(tv, up) {
  var bp = pt(tv), be = rad(tv) * secK;
  return [bp[0] - nx2 * be * up, bp[1] - ny2 * be * up];
}
g.beginPath();
for (mi2 = 0; mi2 <= mst; mi2++) { var mp = belly(m0t + (m1t - m0t) * mi2 / mst, 1.0); if (mi2 === 0) g.moveTo(mp[0], mp[1]); else g.lineTo(mp[0], mp[1]); }
for (mi2 = mst; mi2 >= 0; mi2--) { var mq = belly(m0t + (m1t - m0t) * mi2 / mst, 0.46); g.lineTo(mq[0], mq[1]); }
g.closePath(); g.fillStyle = '#1a1208'; g.fill();
// GOLD TEETH, not white, and that is the rip's own answer. A census of the
// reference's nose is 10% near-black (#080c08, #101410 — the maw) over
// #f8e088 / #b8a468 / #988450: the teeth are the ENVELOPE's gold, lit, which
// is why the marking reads as painted-on nose art at 40 px instead of as a
// face. Ours were #f2ecd8, the brightest thing on the airship.
g.fillStyle = '#e0b25a';                                  // teeth
for (mi2 = 0; mi2 < 7; mi2++) {
  var tt0 = m0t + (m1t - m0t) * (mi2 + 0.10) / 7, tt1 = m0t + (m1t - m0t) * (mi2 + 0.90) / 7;
  var pA = belly(tt0, 0.40), pB = belly(tt1, 0.40), pC = belly((tt0 + tt1) / 2, 0.74);
  g.beginPath(); g.moveTo(pA[0], pA[1]); g.lineTo(pB[0], pB[1]); g.lineTo(pC[0], pC[1]); g.closePath(); g.fill();
}
// THE EYE PATCH, dark. The reference does carry one — a black blotch above and
// behind the mouth with a small amber glint in it — and the earlier reading
// that there was "no eye at all" came from a census that only asked whether any
// NEAR-WHITE cluster was present. There is not: what is wrong with a cartoon
// eye is the white sclera, not the eye.
var eyP = belly(0.80, -0.30);
g.fillStyle = '#1a1208';
g.beginPath(); g.ellipse(eyP[0], eyP[1], 2.6, 1.9, 0, 0, 6.29); g.fill();
g.fillStyle = '#cc6600';
g.beginPath(); g.ellipse(eyP[0] + nx2 * 0.4, eyP[1] + ny2 * 0.4, 1.0, 0.8, 0, 0, 6.29); g.fill();
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
// a WINDOW ROW, not a white bar: the reference's gondola is grey with a few
// tiny lights, and a near-white 8.4 x 1.4 band under the hull was pulling the
// eye off the airship entirely.
g.fillStyle = '#999999'; g.fillRect(gp[0] - 4.2, gpy - 0.8, 8.4, 1.2);
g.fillStyle = '#cccccc';
for (var gw = -2; gw <= 2; gw++) g.fillRect(gp[0] + gw * 1.9 - 0.5, gpy - 0.6, 1.0, 0.8);
g.strokeStyle = '#6e6e6e'; g.lineWidth = 0.9;            // catwalk rails, as the sprite
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
finQuad(-0.54, -0.76, -px * far, -py * far, bodyR * 0.85, bodyR + 5.1, col, shade(col, 0.36));
finQuad(-0.12, -0.30, -px * far, -py * far, bodyR * 0.80, bodyR + 3.2, col, shade(col, 0.34));
if (!tailAway) { lowerFin(); tailCone(); }
finQuad(-0.54, -0.76, 0, -1, bodyR * 0.85, bodyR + 8, shade(col, 1.1), shade(col, 0.36));
midFins();
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
}
