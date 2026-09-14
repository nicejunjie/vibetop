// Iron Frontier — ships/aegis: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawAegis(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P, W = C.W,
      box = C.box, g = C.g, mast = C.mast, nearS = C.nearS;

// [AEGIS] REDRAWN FROM THE RIP. The old bake's defining feature — a big
// house-coloured GRIDDED PANEL standing over both flanks of the deckhouse —
// is not in the reference at all. `library/aegis.png` has no lattice, no grid
// and no wall of owner colour. It was invented to satisfy a §2.3 line about a
// "radar panel >= 8x8 px, vertical", and what it produced was a blue
// pegboard fence down the middle of the ship.
//
// What the reference ACTUALLY shows, forward to aft:
//   - a low grey hull, LONG and FLAT: 95x41 broadside, aspect 2.32. Ours was
//     81x48 = 1.69, half again too tall — a tugboat, which is the same error
//     this file's own history says was fixed once before and came back with
//     the launcher boxes;
//   - a TALL THIN BLACK MAST well forward with a small GOLD LAMP at its head,
//     the only warm pixel on the ship and the highest point;
//   - a BLUE SLANTED SAIL beside it — a flat angled plate, not a box;
//   - a short BLUE-AND-WHITE STRIPED FUNNEL;
//   - amidships and aft, a cluster of WHITE ANGULAR PLATES at DIFFERENT
//     TILTS — the array faces. They are what the eye catches, and the reason
//     they read is that none of them is axis-aligned. Ours were upright white
//     crates, which is the one thing they are not;
//   - a blue block right aft.

// ---- the hull's own low deckhouse ---------------------------------------- //
box(-L * 0.02, 0, L * 0.72, W * 1.62, 3.4, DECK);
box(-L * 0.06, 0, L * 0.52, W * 1.34, 5.4, shade(DECK, 1.46));

// ---- the forward mast, and the gold lamp at its head --------------------- //
// Thin. The reference's mast is one or two pixels wide and reaches the top of
// the frame; a thick one turns into the "barrel" §2.3 says this ship has none
// of, which is what the clause checker reads off her superstructure.
(function () {
  var m0 = P(L * 0.46, W * 0.30, FR + 3.4);
  g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m0[0], m0[1] - 10.8); g.stroke();
  g.strokeStyle = '#2b2b2b'; g.lineWidth = 0.9;                    // one yard
  g.beginPath();
  g.moveTo(m0[0] - 2.0, m0[1] - 7.8); g.lineTo(m0[0] + 2.0, m0[1] - 7.8); g.stroke();
  g.fillStyle = '#ffcc33';                                         // the lamp
  g.beginPath(); g.ellipse(m0[0], m0[1] - 11.5, 1.2, 1.5, 0, 0, 6.29); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(m0[0], m0[1] - 11.9, 0.6, 0.8, 0, 0, 6.29); g.fill();
})();

// ---- the blue slanted sail, abaft the mast ------------------------------- //
// A flat plate leaning aft, in the owner's colour — this is where the rip
// spends its blue forward, and it is a SHAPE, not a painted rectangle.
(function () {
  var sv = W * 0.28 * nearS;
  var s0 = P(L * 0.34, sv, FR + 3.4), s1 = P(L * 0.10, sv, FR + 3.4),
      s2 = P(L * 0.16, sv, FR + 9.8), s3 = P(L * 0.32, sv, FR + 9.4);
  g.fillStyle = HOUSE;
  g.beginPath();
  g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]);
  g.lineTo(s2[0], s2[1]); g.lineTo(s3[0], s3[1]); g.closePath(); g.fill();
  g.strokeStyle = HL; g.lineWidth = 0.9;                           // its lit leading edge
  g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s3[0], s3[1]); g.stroke();
  g.strokeStyle = HD; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(s1[0], s1[1]); g.lineTo(s2[0], s2[1]); g.stroke();
})();

// ---- the striped funnel -------------------------------------------------- //
box(-L * 0.06, 0, 5.0, W * 0.62, 7.4, '#cccccc');
(function () {
  var f0 = P(-L * 0.06, 0, FR + 5.6);
  g.strokeStyle = HOUSE; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(f0[0] - 3.4, f0[1]); g.lineTo(f0[0] + 3.4, f0[1]); g.stroke();
  var f1 = P(-L * 0.06, 0, FR + 7.4);
  g.strokeStyle = '#333333'; g.lineWidth = 1.2;                    // the soot cap
  g.beginPath(); g.moveTo(f1[0] - 2.8, f1[1]); g.lineTo(f1[0] + 2.8, f1[1]); g.stroke();
})();

// ---- THE ARRAY FACES: white plates, each at its own tilt ------------------ //
// None of them is upright and none is square to the hull. That is the whole
// reason the cluster reads as machinery instead of as crates, and it is what
// separates her from the Destroyer at map size — the pair the naval peer test
// still scores. Every corner is projected, so the tilt survives every bearing.
(function () {
  var FACE = [
    // u0    u1    v      z0    z1    lean   tone
    [-0.10, -0.34, 0.56,  3.0,  9.6,  1.8, '#eef1f4'],
    [-0.30, -0.52, 0.34,  3.0,  8.4, -2.2, '#d8dce2'],
    [-0.46, -0.68, 0.60,  3.0,  7.2,  1.4, '#c9ced6'],
    [-0.16, -0.36, -0.52, 3.0,  8.8, -1.6, '#d8dce2']
  ];
  for (var fi = 0; fi < FACE.length; fi++) {
    var F = FACE[fi], fv = W * F[2];
    var a0 = P(L * F[0], fv, FR + F[3]), a1 = P(L * F[1], fv, FR + F[3]);
    var a2 = P(L * F[1] + F[5], fv, FR + F[4]), a3 = P(L * F[0] + F[5], fv, FR + F[4]);
    g.fillStyle = F[6];
    g.beginPath();
    g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]);
    g.lineTo(a2[0], a2[1]); g.lineTo(a3[0], a3[1]); g.closePath(); g.fill();
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 0.7; g.stroke();
    g.strokeStyle = '#666666'; g.lineWidth = 0.6;                  // one panel line each
    var b0 = P((L * F[0] + L * F[1]) / 2, fv, FR + F[3] + 0.8);
    var b1 = P((L * F[0] + L * F[1]) / 2 + F[5], fv, FR + F[4] - 0.8);
    g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
  }
})();

// ---- the blue block right aft, and the VLS lids fore and aft -------------- //
// HL, NOT HOUSE, and the reason is the palette grid. `box` derives its side
// faces with a shade ladder, and shade(#1c3e8c, 0.5) is (14, 31, 70), which
// snaps to 0/51/51 = #003333 — pure TEAL. 48 px of the stern were coming out
// green-blue whoever owned the ship. Starting one rung up puts the same face
// on #003366 and it stays navy all the way down.
// EXPLICIT QUADS, NOT box(). isoBox grades every face down to f * 0.80 of the
// colour it is given, so its darkest face is about 0.44 — and shade(HOUSE,
// 0.44) is (15, 34, 77), which snaps to 0/51/51 = #003333, pure TEAL. 53 px of
// this ship's stern were coming out green-blue whoever owned her, and moving
// the fill a rung up the ladder only moved which rung produced it. Drawing the
// block from projected quads in HOUSE / HL / HD keeps every face on a value
// that is known to stay navy on the grid.
// NOTE: this is systemic — any box() given a saturated house colour can do it.
(function () {
  var bu = -L * 0.80, bl = L * 0.09, bw = W * 0.42, bz = FR, bh = FR + 5.0;
  var c = [[bl, bw], [bl, -bw], [-bl, -bw], [-bl, bw]];
  function q(i, z) { return P(bu + c[i][0], c[i][1], z); }
  var faces = [[0, 1, HL], [1, 2, HOUSE], [3, 0, HD]];
  for (var fi = 0; fi < faces.length; fi++) {
    var a = q(faces[fi][0], bz), b = q(faces[fi][1], bz);
    var a2 = q(faces[fi][0], bh), b2 = q(faces[fi][1], bh);
    g.fillStyle = faces[fi][2];
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(b2[0], b2[1]); g.lineTo(a2[0], a2[1]); g.closePath(); g.fill();
  }
  var t0 = q(0, bh), t1 = q(1, bh), t2 = q(2, bh), t3 = q(3, bh);
  g.fillStyle = HL;
  g.beginPath();
  g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]);
  g.lineTo(t2[0], t2[1]); g.lineTo(t3[0], t3[1]); g.closePath(); g.fill();
})();
box(L * 0.66, 0, 8, W * 1.20, 2.4, '#3d3d3d');
g.fillStyle = '#121212';
for (var vu = -1; vu <= 1; vu += 2)
  for (var vi = 0; vi < 4; vi++) {
    var vq = P(L * 0.66 + (vi - 1.5) * 2.0, vu * 1.9, FR + 2.4);
    g.beginPath(); g.ellipse(vq[0], vq[1], 1.1, 0.7, 0, 0, 6.29); g.fill();
  }
}
