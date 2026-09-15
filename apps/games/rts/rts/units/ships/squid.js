// Iron Frontier — ships/squid: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawSquid(C) {
  var FR = C.FR, G = C.G, HULL = C.HULL, L = C.L, P = C.P, W = C.W, g = C.g, nearS = C.nearS;

// [SQD]: a mantle and eight arms. No deck, no fittings — the only
// straight line on it would kill the read.
//
// Every radius here is a multiple of `ss`, the hull's length against
// the 20-px draft this was first drawn at. The animal was authored at
// Dolphin scale while RA2's `[SQD]` is 117x30 — the second-longest
// sprite in the game, longer than a Destroyer — so it sat inside the
// Dolphin's size class and the two were each other's nearest match.
// It now carries its own class, and the arms carry the outline.
//
// BUT THE MANTLE WAS DRAWN IN SCREEN SPACE. Two `g.ellipse` calls at
// fixed radii, identical at all 32 bearings, so the one part of the
// animal that should foreshorten never did — and the eight arms
// RADIATED through a full circle, throwing tips 2.3 beams either side.
// Together they rendered a round starburst: 119x52, aspect 2.29
// against [SQD]'s 117x30 = 3.90. That roundness is the whole reason
// `aegis | squid` sat under the friend-vs-foe floor for weeks — a tall
// blob against a tall blob. The mantle is now a PLAN-SPACE teardrop
// that turns with her, and the arms fan FORWARD along the axis instead
// of around her, which is both what a squid looks like swimming and
// what makes her long: 122x30, aspect 4.07 against [SQD]'s 3.90.
var ss = G.L / 20;
var mq = P(0, 0, FR);
// The mantle outline: tail tip aft, widest a touch abaft amidships,
// narrowing to the arm crown forward. Sampled in (u, v) and projected,
// so every bearing gets the right foreshortening for free.
var MANT = [[-0.65, 0.00], [-0.62, 0.22], [-0.50, 0.50], [-0.22, 0.72],
            [0.12, 0.68], [0.34, 0.53], [0.46, 0.29], [0.50, 0.00]];
var mpoly = function (lift, fill) {
  g.beginPath();
  var i4, q4;
  for (i4 = 0; i4 < MANT.length; i4++) {
    q4 = P(L * MANT[i4][0], W * 0.88 * MANT[i4][1], FR + lift);
    if (i4) g.lineTo(q4[0], q4[1]); else g.moveTo(q4[0], q4[1]);
  }
  for (i4 = MANT.length - 1; i4 >= 0; i4--) {
    q4 = P(L * MANT[i4][0], -W * 0.88 * MANT[i4][1], FR + lift);
    g.lineTo(q4[0], q4[1]);
  }
  g.closePath(); g.fillStyle = fill; g.fill();
};
mpoly(5.6, shade(HULL, 0.80));
// The lit back, a shrunken copy of the same outline lifted clear of it.
g.save();
g.beginPath();
(function () {
  var i5, q5;
  for (i5 = 0; i5 < MANT.length; i5++) {
    q5 = P(L * MANT[i5][0] * 0.82 - L * 0.06, W * 0.62 * MANT[i5][1], FR + 8.2);
    if (i5) g.lineTo(q5[0], q5[1]); else g.moveTo(q5[0], q5[1]);
  }
  for (i5 = MANT.length - 1; i5 >= 0; i5--) {
    q5 = P(L * MANT[i5][0] * 0.82 - L * 0.06, -W * 0.62 * MANT[i5][1], FR + 8.2);
    g.lineTo(q5[0], q5[1]);
  }
})();
g.closePath(); g.fillStyle = shade(HULL, 1.22); g.fill();
g.restore();
// Eight arms, fanning FORWARD off the crown with daylight between
// them — thick enough that three survive ZMIN and splayed wide enough
// that the count is readable. A starburst is the one outline in the
// fleet that is mostly holes, and holes are what stop a mask matching
// a hull; but the holes have to be along her, not around her.
// SIX, not eight, and thinner. Eight arms 4.6 units wide leaving one
// point in a W*0.74 band merged into a webbed skirt with scalloped
// tips — a jellyfish, and §2.4 asks for ">= 4 tentacles resolvable at
// 3 px each". Six arms at 3.0 units, leaving the crown already spread
// and reaching 1.95 beams, keep daylight the whole way out.
// THINNER AND LONGER. The rip's arms are hair-fine pale streaks running well
// past the mantle's own length; ours were half as long and twice as thick, and
// six short fat prongs read as a splayed hand, not as tentacles.
// THEY WERE BAKING STRAIGHT. These were already quadratic curves, but the
// control point sat at (0.80, 1.30t) — almost exactly on the chord between the
// crown and the tip — so the curve had no bow in it and six arms of the same
// width and nearly the same reach rendered as six PARALLEL STRAIGHT LINES.
// This unit's whole spec is "zero straight edges ... the only unit whose
// outline is not a machine", and it was drawn entirely out of them.
//
// Three changes, all visible: the control point is pushed well off the chord
// so each arm actually bows; the reach varies much more from arm to arm, the
// way a real crown of arms does; and each arm TAPERS, drawn as two strokes
// with the outer half thinner, because an arm of constant gauge is a rod.
g.lineCap = 'round';
// Reach pulled in from 2.20: at that length the arms touched the sheet cell
// at SIX of the eight octants, so the animal was being cut off by the canvas.
var ARM = [[-1.05, 1.52, 0.62], [-0.58, 1.86, 0.80], [-0.20, 1.44, 0.92],
           [0.26, 1.80, 0.86], [0.64, 1.38, 0.72], [1.02, 1.66, 0.56]];
for (var ti = 0; ti < ARM.length; ti++) {
  var t = ARM[ti][0], reach = ARM[ti][1], gauge = ARM[ti][2];
  var oq = P(L * 0.42, W * 0.62 * t, FR + 6.4);
  var mqA = P(L * (0.42 + reach) * 0.5, W * (0.62 * t + 1.12 * t) * 0.5, FR + 5.8);
  var aq = P(L * reach, W * 0.82 * t, FR + 5.0);
  // the inner half, full gauge
  g.strokeStyle = '#555555'; g.lineWidth = (1.0 + 0.34 * ss) * gauge;
  g.beginPath(); g.moveTo(oq[0], oq[1]);
  g.quadraticCurveTo(mqA[0], mqA[1] - 7.5 * (1.15 - Math.abs(t)) - 2.0, aq[0], aq[1]);
  g.stroke();
  // the outer half again, thinner, so the arm tapers to a tip
  g.strokeStyle = '#777777'; g.lineWidth = (1.0 + 0.34 * ss) * gauge * 0.45;
  g.beginPath(); g.moveTo(mqA[0], mqA[1] - 3.8 * (1.15 - Math.abs(t)) - 1.0);
  g.quadraticCurveTo(mqA[0], mqA[1] - 2.0, aq[0], aq[1]);
  g.stroke();
}
g.lineCap = 'butt';
// THE TAIL FIN, which the animal had none of. The rip's mantle ends in a
// clear pale DIAMOND fin standing out from the body — it is the widest thing
// on the tail and the reason the far end does not read as a point.
(function () {
  // CURVED, not a diamond. Drawn as a four-point polygon it put a 15 px
  // straight run into the silhouette and broke this unit's one hard clause,
  // "zero straight edges" — the animal is the only outline in the game that is
  // not a machine. Two bezier lobes instead, so every edge of the fin bows.
  var f0 = P(-L * 0.65, 0, FR + 6.8), f2 = P(-L * 0.28, 0, FR + 6.8);
  for (var fs2 = 1; fs2 >= -1; fs2 -= 2) {
    var cA = P(-L * 0.70, W * 1.22 * fs2, FR + 8.4);
    var cB = P(-L * 0.40, W * 1.08 * fs2, FR + 8.0);
    g.beginPath(); g.moveTo(f0[0], f0[1]);
    g.bezierCurveTo(cA[0], cA[1], cB[0], cB[1], f2[0], f2[1]);
    var cC = P(-L * 0.39, W * 0.28 * fs2, FR + 7.1);
    var cD = P(-L * 0.57, W * 0.26 * fs2, FR + 7.1);
    g.bezierCurveTo(cC[0], cC[1], cD[0], cD[1], f0[0], f0[1]);
    g.closePath(); g.fillStyle = shade(HULL, fs2 > 0 ? 1.14 : 0.92); g.fill();
    g.strokeStyle = shade(HULL, 0.70); g.lineWidth = 0.7; g.stroke();
  }
})();
// A DARK MAROON COLLAR, not a cartoon eye. There was a 3-px bright yellow
// disc with a black pupil painted on the mantle, and at the size this is
// drawn it was the single loudest thing on the animal — the reason it read
// as a googly-eyed octopus rather than as something rising under a
// destroyer. The rip has no eye highlight at all: what sits at the mantle
// base is a band of near-black maroon where the head meets the crown, and
// that is the only non-grey mass on the creature.
var colq = function (u, vv, lift) { return P(L * u, W * vv, FR + lift); };
g.beginPath();
(function () {
  var cb = [[0.18, 0.58], [0.34, 0.46], [0.38, 0.18], [0.38, -0.18], [0.34, -0.46], [0.18, -0.58],
            [0.12, -0.34], [0.10, 0.00], [0.12, 0.34]];
  for (var ci2 = 0; ci2 < cb.length; ci2++) {
    var qc = colq(cb[ci2][0], cb[ci2][1], 7.4);
    if (ci2) g.lineTo(qc[0], qc[1]); else g.moveTo(qc[0], qc[1]);
  }
})();
g.closePath(); g.fillStyle = '#3b1418'; g.fill();
g.fillStyle = '#5e1c22';
g.beginPath();
(function () {
  var cb2 = [[0.21, 0.42], [0.32, 0.34], [0.35, 0.06], [0.21, 0.10]];
  for (var ci3 = 0; ci3 < cb2.length; ci3++) {
    var qd = colq(cb2[ci3][0], cb2[ci3][1] * (nearS > 0 ? 1 : -1), 8.2);
    if (ci3) g.lineTo(qd[0], qd[1]); else g.moveTo(qd[0], qd[1]);
  }
})();
g.closePath(); g.fill();
}
