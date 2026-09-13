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
  box(su, 0, 16, W * 1.50, 9.5, '#565961');
  var sq = P(su, 0, FR + 9.0);
  // THE CANISTERS ARE WHITE. `library/dread.png` is unambiguous about it:
  // on each launcher sit two chalk-WHITE missile tubes with a RED nose cap,
  // and they are the brightest thing on a ship that is otherwise grey — the
  // one surface the eye lands on at map size. We had painted the whole launch
  // head HOUSE, which put the loud surface and the owner's colour on the same
  // pixels: on the navy seat the Dreadnought's crown went dark blue against a
  // dark grey hull and stopped reading as a missile at all, and on the red
  // seat the ship had no white in it anywhere.
  //
  // So the body is white and the NOSE CAP is the house colour, which is both
  // what the rip does and what keeps §2.4's "the house colour IS the identity
  // feature" true — the colour now sits ON the thing that identifies him
  // instead of replacing it. The base band below is unchanged, and the two
  // together hold his owner share.
  function head(x0, x1, fill) {
    var t0 = (x0 + 5.6) / 11.2, t1 = (x1 + 5.6) / 11.2;
    g.beginPath();
    g.moveTo(sq[0] + x0, sq[1] + 0.6 - 1.2 * t0); g.lineTo(sq[0] + x1, sq[1] + 0.6 - 1.2 * t1);
    g.lineTo(sq[0] + x1, sq[1] - 6.4 + 1.2 * (1 - t1)); g.lineTo(sq[0] + x0, sq[1] - 6.4 + 1.2 * (1 - t0));
    g.closePath(); g.fillStyle = fill; g.fill();
    g.strokeStyle = '#3b3d42'; g.lineWidth = 0.7; g.stroke();
  }
  head(-5.6, 2.0, '#dde0e4');                    // the tubes
  head(2.0, 5.6, HOUSE);                         // the nose cap
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 0.7;  // the seam between the two tubes
  g.beginPath(); g.moveTo(sq[0] - 1.8, sq[1] - 0.1); g.lineTo(sq[0] - 1.8, sq[1] - 5.8); g.stroke();
  g.strokeStyle = HD; g.lineWidth = 0.8;
  g.strokeStyle = HOUSE; g.lineWidth = 2.6;                        // a band round the base
  var bq2 = P(su, 0, FR + 3.0);
  g.beginPath(); g.moveTo(bq2[0] - 5.6, bq2[1] - 0.6); g.lineTo(bq2[0] + 5.6, bq2[1] - 1.8); g.stroke();
  g.strokeStyle = '#12161b'; g.lineWidth = 1.0;
  for (var hi2 = -1; hi2 <= 1; hi2++) {
    g.beginPath(); g.moveTo(sq[0] + hi2 * 3.2, sq[1] - 5.4); g.lineTo(sq[0] + hi2 * 3.2 + 1.6, sq[1] - 8.4); g.stroke();
  }
}
box(-L * 0.68, 0, 8, W * 1.10, 6.4, '#3b3d42');                   // aft house
mast(-L * 0.64, 0, 5.0, '#2c2e33');
g.strokeStyle = '#8e2c2c'; g.lineWidth = 1.0;                      // hazard hatching fore
var zq = P(L * 0.66, 0, FR + 0.4);
g.beginPath(); g.moveTo(zq[0] - 4, zq[1] - 1.2); g.lineTo(zq[0] + 4, zq[1] + 1.2); g.stroke();
}
