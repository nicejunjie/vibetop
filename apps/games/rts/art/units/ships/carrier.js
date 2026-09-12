// Iron Frontier unit art — ships/carrier
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART ships/carrier` and
// `// @@END ships/carrier` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeShip() in rts.html
// [CARRIER]: 143x52 in RA2 — the largest sprite in the game — and the
// whole identity is A FLAT FLIGHT DECK THE FULL LENGTH OF THE HULL,
// with a centreline, a house-colour landing stripe and three Hornets
// ranged aft.
//
// The deck is its own plane OVERHANGING the hull each side, which is
// both what a carrier looks like from above and what keeps her outline
// broad at every bearing — the Dreadnought is nearly the same length
// in RA2 (133 against 143) and the two can only separate on MASSING:
// she is flat where he is tall. The island stays small and LOW for the
// same reason; a tall island is a Destroyer's read, and the old
// 15-unit island mast was giving her one.
//
// But "broad at every bearing" was taken to mean a deck 1.78x the
// hull's beam on a beam-22 hull — a flight deck 39 wide on a 65 hull,
// 1.66:1 in PLAN, where a real carrier's is over 4:1. It rendered as a
// grey octagon with no ship under it (120x50, aspect 2.40 against
// RA2's 143x52 = 2.75), and the deck edge markings sat at 73% of the
// deck, floating in the middle of it. Deck 1.78 -> 1.42 of a beam-21
// hull puts the two house-hued edge stripes ON the edge, where they
// belong, and gives back the length-to-width a carrier reads by:
// 121x42, aspect 2.88, against RA2's 2.75.
var fd = [], fi;
for (fi = 0; fi < plan.length; fi++) fd.push([plan[fi][0] * 1.02, plan[fi][1] * 1.42]);
var fpoly = function (z, fill, line) {
  g.beginPath();
  for (var i3 = 0; i3 < fd.length; i3++) {
    var q3 = P(fd[i3][0], fd[i3][1], z);
    if (i3) g.lineTo(q3[0], q3[1]); else g.moveTo(q3[0], q3[1]);
  }
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (line) { g.strokeStyle = line; g.lineWidth = 0.9; g.stroke(); }
};
fpoly(FR + 0.6, shade(HULL, 0.42));                               // the overhang's shadow
fpoly(FR + 2.6, shade(DECK, 1.06), shade(HULL, 1.30));            // the flight deck
g.save(); fpoly(FR + 2.6, null, null); g.clip();
g.strokeStyle = '#d9dde2'; g.lineWidth = 1.4;
for (var ci = 0; ci < 9; ci++) {                                  // dashed centreline
  var cu0 = L * (0.80 - ci * 0.185), cu1 = cu0 - L * 0.10;
  var c0 = P(cu0, 0, FR + 2.6), c1 = P(cu1, 0, FR + 2.6);
  g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.stroke();
}
// The angled landing strip, a house-hued deck edge each side and the
// round-down band aft. A carrier is nearly all flight deck, so if the
// deck carries no owner colour she carries almost none at all: growing
// her to RA2's 143-px class dropped her remap from 18% to 9%, under
// reference §1.4's 11.5% vehicle floor, and the markings are where RA2
// itself puts colour on a deck.
g.strokeStyle = HOUSE; g.lineWidth = 2.8;
var a0 = P(L * 0.58, -W * 0.62, FR + 2.6), a1 = P(-L * 0.90, -W * 0.16, FR + 2.6);
g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
g.strokeStyle = HD; g.lineWidth = 1.3;
for (var de = -1; de <= 1; de += 2) {
  var e0 = P(L * 0.92, de * W * 1.30, FR + 2.6), e1 = P(-L * 0.96, de * W * 1.30, FR + 2.6);
  g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
}
g.strokeStyle = HOUSE; g.lineWidth = 2.4;                          // round-down band aft
var r0 = P(-L * 0.90, W * 1.30, FR + 2.6), r1 = P(-L * 0.90, -W * 1.30, FR + 2.6);
g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
g.restore();
box(-L * 0.06, W * 0.86, L * 0.26, W * 0.28, 6.8, '#4b515a');     // island
box(-L * 0.06, W * 0.86, L * 0.15, W * 0.20, 8.6, '#5a616b');
mast(-L * 0.14, W * 0.86, 6.0);
var iq = P(-L * 0.02, W * 0.86, FR + 7.6);
g.fillStyle = GLASS; g.fillRect(iq[0] - 3.0, iq[1] - 1.6, 6.0, 1.8);
g.strokeStyle = HOUSE; g.lineWidth = 1.4;
g.beginPath(); g.moveTo(iq[0] - 3.2, iq[1] + 0.8); g.lineTo(iq[0] + 3.2, iq[1] + 0.8); g.stroke();
// Three parked Hornets — the air group, visible on the deck.
for (var hi = 0; hi < 3; hi++) {
  var pq2 = P(-L * (0.26 + hi * 0.26), -W * 0.66, FR + 3.0);
  g.fillStyle = '#c8cdd4';
  g.beginPath(); g.ellipse(pq2[0], pq2[1], 3.4, 1.6, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#8f959d'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(pq2[0] - 3.2, pq2[1] + 0.6); g.lineTo(pq2[0] + 3.2, pq2[1] - 0.6); g.stroke();
  g.fillStyle = HOUSE;
  g.beginPath(); g.ellipse(pq2[0] + 1.7, pq2[1] - 0.4, 0.9, 0.7, 0, 0, 6.29); g.fill();
}
