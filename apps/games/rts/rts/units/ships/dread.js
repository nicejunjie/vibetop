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
// TWO MISSILES, LYING SIDE BY SIDE AFT, and each one a fifth of the ship.
// Measured off `library/dread.png` (135x49): the white bodies are 31x4 and
// 27x4 px at x 51-73% of the hull, i.e. 22% of her LENGTH each, parallel, both
// abaft midships, with a small red nose cap (8x3 at x 53-58%). Ours were 7.6
// units — 13% — sat on two launchers a third of the ship apart, one forward
// and one aft, and they read as two little grey boxes with a red chip on each.
// The missiles are what this ship IS; at map size they should be the first
// thing seen and they were the last.
for (var si = -1; si <= 1; si += 2) {
  var sv = W * 0.62 * si;                        // side by side, not fore and aft
  var mA = P(-L * 0.62, sv, FR + 4.6);           // tail of the missile
  var mB = P(L * 0.18, sv, FR + 4.6);            // nose
  var mN = P(L * 0.34, sv, FR + 4.6);            // the cap's tip
  // the cradle it lies in
  g.strokeStyle = '#4a4d53'; g.lineWidth = 4.6; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(mA[0], mA[1] + 1.6); g.lineTo(mB[0], mB[1] + 1.6); g.stroke();
  // body
  g.strokeStyle = '#e6e9ec'; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(mA[0], mA[1]); g.lineTo(mB[0], mB[1]); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;  // the lit top of the cylinder
  g.beginPath(); g.moveTo(mA[0], mA[1] - 1.0); g.lineTo(mB[0], mB[1] - 1.0); g.stroke();
  g.strokeStyle = '#8f939a'; g.lineWidth = 0.8;  // the shaded underside
  g.beginPath(); g.moveTo(mA[0], mA[1] + 1.5); g.lineTo(mB[0], mB[1] + 1.5); g.stroke();
  // the nose cap, in the owner's colour
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(mB[0], mB[1] - 1.8); g.lineTo(mN[0], mN[1] - 0.2);
  g.lineTo(mB[0], mB[1] + 1.8); g.closePath(); g.fill();
  // three banding rings along the body
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 0.7;
  for (var mr = 1; mr <= 3; mr++) {
    var f2 = mr / 4;
    var rx = mA[0] + (mB[0] - mA[0]) * f2, ry = mA[1] + (mB[1] - mA[1]) * f2;
    g.beginPath(); g.moveTo(rx, ry - 1.8); g.lineTo(rx, ry + 1.8); g.stroke();
  }
  // the tail fins
  g.fillStyle = '#5a5e66';
  g.beginPath();
  g.moveTo(mA[0], mA[1] - 1.6); g.lineTo(mA[0] - 3.2, mA[1] - 3.4);
  g.lineTo(mA[0] - 3.2, mA[1] + 1.0); g.lineTo(mA[0], mA[1] + 1.6);
  g.closePath(); g.fill();
}
// THE SUPERSTRUCTURE AND THE MASTS, which is where RA2 gets her height and
// ours had none. Reading the reference's top edge every 5% of her length, the
// silhouette rises from 21 px at the bow to TWO peaks — 37 px at 15% and
// 38-40 px at 35-45% — then falls to 20 px aft. Ours topped out at 33 px
// against her 49 and read as a raft with missiles on it, because everything
// above the deck had been deleted along with the old launcher boxes.
(function () {
  box(L * 0.22, 0, 17, W * 1.30, 11.0, '#5a5e66');
  box(L * 0.22, 0, 11, W * 0.92, 16.0, '#6b6f78');
  box(L * 0.22, 0, 6, W * 0.60, 19.5, '#7c818a');
  var bw = P(L * 0.22, 0, FR + 17.4);                    // the bridge windows
  g.fillStyle = '#9fd2e4'; g.fillRect(bw[0] - 4.0, bw[1] - 1.4, 8.0, 1.4);
  box(L * 0.04, 0, 7, W * 0.78, 13.0, '#42464d');        // the funnel abaft the bridge
  // EXPLICIT DARK NEUTRAL. mast() falls back to DKSTEEL, a blue-grey that the
  // palette grid splits into teal — the two masts baked as cyan crosses.
  mast(L * 0.22, 0, 18.0, '#2b2b2b');                    // the taller mast, on the house
  mast(L * 0.56, 0, 12.5, '#2b2b2b');                    // and one a third forward
})();
// A RED HULL BLOCK FORWARD. The rip's largest single red mass is 40x10 px low
// on the bow — 30% of her length — and it is the owner's colour carried as a
// BLOCK, which is how RA2 spends house colour on a ship. Ours carried it as a
// band round two launcher bases and nothing else.
(function () {
  var fA = P(L * 0.38, 0, FR + 0.4), fB = P(L * 0.92, 0, FR + 0.4);
  g.strokeStyle = HOUSE; g.lineWidth = 5.2; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(fA[0], fA[1]); g.lineTo(fB[0], fB[1]); g.stroke();
  g.strokeStyle = HD; g.lineWidth = 1.0;
  g.beginPath(); g.moveTo(fA[0], fA[1] + 2.4); g.lineTo(fB[0], fB[1] + 2.4); g.stroke();
})();
box(-L * 0.68, 0, 8, W * 1.10, 6.4, '#3b3d42');                   // aft house
mast(-L * 0.64, 0, 5.0, '#2c2e33');
g.strokeStyle = '#8e2c2c'; g.lineWidth = 1.0;                      // hazard hatching fore
var zq = P(L * 0.66, 0, FR + 0.4);
g.beginPath(); g.moveTo(zq[0] - 4, zq[1] - 1.2); g.lineTo(zq[0] + 4, zq[1] + 1.2); g.stroke();
}
