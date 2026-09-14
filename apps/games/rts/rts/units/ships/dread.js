// Iron Frontier — ships/dread: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawDread(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W,
      box = C.box, g = C.g, mast = C.mast;

// [DRED] REDRAWN FROM THE RIP, because the old one had the ship back to front
// and its missiles were not missiles.
//
// What `library/dread.png` actually shows, bow to stern:
//   - a long low DARK hull, pointed forward, the deck flat and empty forward;
//   - TWO MISSILES lying on that forward deck, side by side, nose OVER THE
//     BOW: red nose cone, white body, a red band, a dark finned tail. They are
//     the largest and brightest thing on the ship by a wide margin;
//   - a TAN/KHAKI superstructure amidships and aft — low, long, blocky, with
//     dark slit windows — NOT a cluster of grey towers;
//   - THREE tall thin LAVENDER antennas standing off it, and a red mast aft;
//   - the house colour as a BIG SLAB LOW ON THE HULL SIDE, running from
//     amidships to the stern, broken by dark vertical separators.
//
// The old bake got every one of those wrong. The missiles ran from -0.62L to
// +0.34L at v = +-0.62W while the superstructure was drawn afterwards at v = 0
// with a width of 1.30W — spanning +-0.65W, straight over them — so the two
// things the ship is known by were painted out by the thing behind them, and
// what survived read as two white planks. The house colour was a red BRICK
// standing on the foredeck instead of a slab down the side aft, and the
// superstructure was a stack of near-black towers where the reference is a
// low khaki mass. Bow and stern were effectively swapped.

// ---- the house colour: a slab low on the hull side, amidships to stern ---- //
// RA2 spends this ship's owner colour as one big mass down the flank, not as a
// stripe and not as a box on the deck. It is drawn before anything stands on
// the deck so the deck fittings sit in front of it.
// It has to be on the FLANK, not the centreline. Drawn at v = 0 the slab
// projects down the middle of the hull and comes out in patches behind the
// deck edge — which is what it did, and it read as three red bricks rather
// than one sponson. Both sides are drawn, far side first, so whichever flank
// faces the camera carries it at every bearing.
(function () {
  for (var si = -1; si <= 1; si += 2) {
    var sv = W * 0.97 * si;
    var hA = P(L * 0.16, sv, FR * 0.72), hB = P(-L * 0.94, sv, FR * 0.72);
    var hC = P(-L * 0.94, sv, FR * 0.02), hD = P(L * 0.16, sv, FR * 0.02);
    g.fillStyle = HOUSE;
    g.beginPath(); g.moveTo(hA[0], hA[1]); g.lineTo(hB[0], hB[1]);
    g.lineTo(hC[0], hC[1]); g.lineTo(hD[0], hD[1]); g.closePath(); g.fill();
    g.strokeStyle = HD; g.lineWidth = 0.7;                     // its shaded lower edge
    g.beginPath();
    g.moveTo(hD[0], hD[1]); g.lineTo(hC[0], hC[1]); g.stroke();
    g.strokeStyle = HL; g.lineWidth = 0.7;                     // and its lit top edge
    g.beginPath();
    g.moveTo(hA[0], hA[1]); g.lineTo(hB[0], hB[1]); g.stroke();
    g.strokeStyle = HD; g.lineWidth = 0.25;                    // hairline armour seams
    for (var sp = 0; sp < 3; sp++) {
      var q0 = P(L * 0.16 - L * 1.10 * (0.26 + sp * 0.24), sv, FR * 0.69);
      var q1 = P(L * 0.16 - L * 1.10 * (0.26 + sp * 0.24), sv, FR * 0.05);
      g.beginPath();
      g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke();
    }
  }
})();

// ---- the superstructure: LOW, LONG, KHAKI, amidships to aft -------------- //
// Tan is the reference's own colour for it and it is what separates this ship
// from every grey hull in the game at a glance. Equal channels are not
// required here because it is a chromatic colour, but it stays on the grid.
// LOW AND LONG, NOT TWO CARTONS. The first pass stood two tall khaki boxes on
// the deck and they read as cardboard crates: the reference's superstructure
// is a long low mass running most of the after half, stepped, with the tallest
// point well under the antennas. Five shallow boxes, each stepping in, carry
// that without any of them being a crate.
var TAN = '#999966', TAN_D = '#666633', TAN_L = '#cccc99';
box(-L * 0.30, 0, L * 0.62, W * 1.24, 4.6, TAN_D);          // the long base
box(-L * 0.16, 0, L * 0.26, W * 1.06, 6.6, TAN_D);
box(-L * 0.18, 0, L * 0.15, W * 0.78, 8.8, TAN);
box(-L * 0.56, 0, L * 0.20, W * 0.96, 6.2, TAN_D);
box(-L * 0.58, 0, L * 0.11, W * 0.66, 8.4, TAN);
box(-L * 0.38, 0, L * 0.09, W * 0.52, 8.4, '#666666');      // the dark turret between them
// The slit windows, PROJECTED. Drawing these as a screen-space fillRect put a
// teal block out over the missile tails at this bearing — the same mistake the
// carrier's landing X made, in the same file's neighbour.
(function () {
  var ws = [[-L * 0.18, 9.0, L * 0.12], [-L * 0.58, 8.6, L * 0.08]];
  for (var wi = 0; wi < ws.length; wi++) {
    var a = P(ws[wi][0] + ws[wi][2], W * 0.56, FR + ws[wi][1]);
    var b = P(ws[wi][0] - ws[wi][2], W * 0.56, FR + ws[wi][1]);
    g.strokeStyle = '#333333'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
})();

// ---- three tall thin LAVENDER antennas, and the red mast aft ------------- //
// The reference's tallest things are hair-thin and pale violet, which is the
// one non-grey, non-red note on the whole ship and reads instantly.
(function () {
  var LAV = '#9999cc';
  var at = [[-L * 0.10, W * 0.30, 13.5], [-L * 0.26, -W * 0.34, 12.0], [-L * 0.52, W * 0.24, 10.5]];
  for (var i = 0; i < at.length; i++) {
    var a0 = P(at[i][0], at[i][1], FR + 7.0);
    g.strokeStyle = LAV; g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a0[0], a0[1] - at[i][2]); g.stroke();
    g.strokeStyle = shade(LAV, 0.72); g.lineWidth = 0.8;       // a short yard near the head
    g.beginPath();
    g.moveTo(a0[0] - 1.2, a0[1] - at[i][2] * 0.80);
    g.lineTo(a0[0] + 1.2, a0[1] - at[i][2] * 0.80); g.stroke();
  }
  var rm = P(-L * 0.78, 0, FR + 8.0);                          // the red mast aft
  g.strokeStyle = HOUSE; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(rm[0], rm[1]); g.lineTo(rm[0], rm[1] - 9.0); g.stroke();
})();

// ---- THE TWO MISSILES, on the forward deck, nose over the bow ------------ //
// Drawn LAST, because they are forward of everything else and they overhang
// the stem; nothing may be painted over them. Each is a real cylinder — a
// body, a lit top, a shaded underside — with a CONE at the front, a coloured
// band, and fins at the tail. The old bake drew a flat bar and a chip of red
// and it read as a plank.
(function () {
  for (var si = -1; si <= 1; si += 2) {
    var sv = W * 0.96 * si, lift = FR + 3.0;
    var stagger = si < 0 ? -L * 0.10 : L * 0.05;
    var tA = P(L * 0.14 + stagger, sv, lift);                  // tail
    var nB = P(L * 0.84 + stagger, sv, lift);                  // where the cone starts
    var nT = P(L * 1.06 + stagger, sv, lift);                  // the cone's point
    // the launch rail it lies in
    g.strokeStyle = '#333333'; g.lineWidth = 7.4; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(tA[0], tA[1] + 2.8); g.lineTo(nB[0], nB[1] + 2.8); g.stroke();
    // the white body, with its lit top and shaded belly
    g.strokeStyle = '#cccccc'; g.lineWidth = 6.6;
    g.beginPath(); g.moveTo(tA[0], tA[1]); g.lineTo(nB[0], nB[1]); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(tA[0], tA[1] - 2.0); g.lineTo(nB[0], nB[1] - 2.0); g.stroke();
    g.strokeStyle = '#666666'; g.lineWidth = 2.0;
    g.beginPath(); g.moveTo(tA[0], tA[1] + 2.3); g.lineTo(nB[0], nB[1] + 2.3); g.stroke();
    // the band, a third back from the nose
    var bx = nB[0] + (tA[0] - nB[0]) * 0.30, by = nB[1] + (tA[1] - nB[1]) * 0.30;
    g.strokeStyle = HOUSE; g.lineWidth = 6.6;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (tA[0] - nB[0]) * 0.10,
                                              by + (tA[1] - nB[1]) * 0.10); g.stroke();
    // the nose CONE — a triangle, not a cap
    g.fillStyle = HOUSE;
    g.beginPath();
    g.moveTo(nB[0], nB[1] - 3.6); g.lineTo(nT[0], nT[1]);
    g.lineTo(nB[0], nB[1] + 3.6); g.closePath(); g.fill();
    g.fillStyle = HL;                                          // its lit upper face
    g.beginPath();
    g.moveTo(nB[0], nB[1] - 3.6); g.lineTo(nT[0], nT[1]);
    g.lineTo(nB[0], nB[1] - 0.7); g.closePath(); g.fill();
    // the finned tail
    // #4a4d53 is not a neutral grey: its channels snap to 51/102/102 = #336666,
    // and the tail fins baked as a TEAL block over the deck. Equal channels only.
    g.fillStyle = '#666666';
    g.beginPath();
    g.moveTo(tA[0], tA[1] - 3.1); g.lineTo(tA[0] - 5.0, tA[1] - 5.0);
    g.lineTo(tA[0] - 5.0, tA[1] + 2.5); g.lineTo(tA[0], tA[1] + 3.1);
    g.closePath(); g.fill();
    g.strokeStyle = '#333333'; g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(tA[0] - 5.0, tA[1] - 5.0); g.lineTo(tA[0] - 5.0, tA[1] + 2.5); g.stroke();
  }
})();
}
