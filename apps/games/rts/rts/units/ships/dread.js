// Iron Frontier — ships/dread: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawDread(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W, box = C.box,
      g = C.g, mast = C.mast;

// [DRED]: the missile ship, and §2.4's read is "the V3's silhouette
// logic at capital-ship scale". Two huge box launchers STANDING PROUD
// of a low hull, angled up and aft.
//
// They are the crown, and they are what separates him from the
// Carrier, who is nearly the same length in RA2 and beat him at 0.77
// while the boxes were only 9 units tall on a hull as wide as her
// deck. Countable means real daylight: box with real gap, not two
// boxes touching.
//
// "Standing proud" was then read as HEIGHT and nothing else: 25-unit
// boxes on a beam-20 hull rendered 109x67, aspect 1.63 against RA2's
// 133x45 = 2.96 — 65% too tall against the Destroyer, and it read as a
// container ship, not a battleship. RA2's own [DRED] is only 10%
// taller than [DEST] for 32% more length. The boxes come down to 11.5
// and grow ALONG the hull to 15, which is the shape a V3 launch box
// actually has and keeps them countable at half the elevation.
box(-L * 0.10, 0, L * 0.50, W * 1.55, 3.8, DECK);
for (var si = 0; si < 2; si++) {
  var su = L * (0.30 - si * 0.60);
  box(su, 0, 16, W * 1.50, 9.5, '#4d5346');
  var sq = P(su, 0, FR + 9.0);
  // The launch head is the house block — §2.4's "the house colour IS
  // the identity feature", the Apocalypse's canisters at capital
  // scale. It grew with the box: at a 2.8-unit cap on a 25-unit tower
  // he read 9% owner colour, under reference §1.4's 11.5% floor.
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(sq[0] - 5.6, sq[1] + 0.6); g.lineTo(sq[0] + 5.6, sq[1] - 0.6);
  g.lineTo(sq[0] + 5.6, sq[1] - 6.4); g.lineTo(sq[0] - 5.6, sq[1] - 5.2);
  g.closePath(); g.fill();
  g.strokeStyle = HD; g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = HOUSE; g.lineWidth = 2.6;                        // a band round the base
  var bq2 = P(su, 0, FR + 3.0);
  g.beginPath(); g.moveTo(bq2[0] - 5.6, bq2[1] - 0.6); g.lineTo(bq2[0] + 5.6, bq2[1] - 1.8); g.stroke();
  g.strokeStyle = '#12161b'; g.lineWidth = 1.0;
  for (var hi2 = -1; hi2 <= 1; hi2++) {
    g.beginPath(); g.moveTo(sq[0] + hi2 * 3.2, sq[1] - 5.4); g.lineTo(sq[0] + hi2 * 3.2 + 1.6, sq[1] - 8.4); g.stroke();
  }
}
box(-L * 0.68, 0, 8, W * 1.10, 6.4, '#3a3f36');                   // aft house
mast(-L * 0.64, 0, 5.0, '#2c3129');
g.strokeStyle = '#8e2c2c'; g.lineWidth = 1.0;                      // hazard hatching fore
var zq = P(L * 0.66, 0, FR + 0.4);
g.beginPath(); g.moveTo(zq[0] - 4, zq[1] - 1.2); g.lineTo(zq[0] + 4, zq[1] + 1.2); g.stroke();
}
