// Iron Frontier unit art — ships/squid
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART ships/squid` and
// `// @@END ships/squid` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeShip() in rts.html
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
var MANT = [[-1.00, 0.00], [-0.90, 0.30], [-0.62, 0.74], [-0.22, 1.00],
            [0.12, 0.96], [0.34, 0.74], [0.46, 0.40], [0.50, 0.00]];
var mpoly = function (lift, fill) {
  g.beginPath();
  var i4, q4;
  for (i4 = 0; i4 < MANT.length; i4++) {
    q4 = P(L * MANT[i4][0], W * 1.06 * MANT[i4][1], FR + lift);
    if (i4) g.lineTo(q4[0], q4[1]); else g.moveTo(q4[0], q4[1]);
  }
  for (i4 = MANT.length - 1; i4 >= 0; i4--) {
    q4 = P(L * MANT[i4][0], -W * 1.06 * MANT[i4][1], FR + lift);
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
    q5 = P(L * MANT[i5][0] * 0.82 - L * 0.06, W * 0.72 * MANT[i5][1], FR + 8.2);
    if (i5) g.lineTo(q5[0], q5[1]); else g.moveTo(q5[0], q5[1]);
  }
  for (i5 = MANT.length - 1; i5 >= 0; i5--) {
    q5 = P(L * MANT[i5][0] * 0.82 - L * 0.06, -W * 0.72 * MANT[i5][1], FR + 8.2);
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
g.strokeStyle = shade(HULL, 0.72); g.lineWidth = 1.2 + 0.62 * ss; g.lineCap = 'round';
for (var ti = 0; ti < 6; ti++) {
  var t = (ti / 5) * 2 - 1;                      // -1..1 across the fan
  var reach = 1.28 - 0.26 * t * t;               // the outer arms fall short
  var oq = P(L * 0.42, W * 0.62 * t, FR + 6.4);
  var aq = P(L * reach, W * 1.95 * t, FR + 5.2);
  var cq = P(L * 0.80, W * 1.30 * t, FR + 5.2);
  g.beginPath();
  g.moveTo(oq[0], oq[1]);
  g.quadraticCurveTo(cq[0], cq[1] - 1.4, aq[0], aq[1] - 0.4);
  g.stroke();
}
g.lineCap = 'butt';
var eyq = P(L * 0.24, W * 0.52 * (nearS > 0 ? 1 : -1), FR + 8.6);
var eyx = eyq[0], eyy = eyq[1];
g.fillStyle = '#f2e27a';                                           // the eye
g.beginPath(); g.ellipse(eyx, eyy, 1.5 * ss * 0.7, 1.2 * ss * 0.7, 0, 0, 6.29); g.fill();
g.fillStyle = '#141018';
g.beginPath(); g.ellipse(eyx, eyy, 0.7 * ss * 0.7, 0.9 * ss * 0.7, 0, 0, 6.29); g.fill();
