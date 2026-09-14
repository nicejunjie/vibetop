// Iron Frontier — ships/seascorp: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

function drawSeascorp(C) {
  var DECK = C.DECK, FR = C.FR, GLASS = C.GLASS, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE,
      L = C.L, P = C.P, W = C.W, box = C.box, g = C.g, nearS = C.nearS;

// [HYD] REDRAWN FROM THE RIP. She is a FLAK BOAT and her whole read is ONE
// THICK WHITE GUN BARREL WITH RED BANDS, elevated about 45 degrees off a white
// housing amidships. `library/seascorp.png` shows, forward to aft: a pale grey
// hull with a broad flat deck; a RED deckhouse block at the bow; a tall RED
// GANTRY standing just abaft it; the white-and-red gun rising over the middle,
// the brightest and largest thing aboard; khaki machinery packed round its
// base; and a red box aft.
//
// Ours had FOUR thin dark tubes fanned up off a tub. At this hull's size they
// baked as a crosshatch — the user read the whole assembly as an
// unidentifiable teal mesh screen, and they were right: four 2.6 px dark lines
// crossing a mast IS a lattice, not a gun. One tube at four times the weight,
// in white against a grey deck, is what the reference has and what reads.

// ---- hull deck ----------------------------------------------------------- //
box(L * 0.10, 0, L * 0.62, W * 1.50, 3.0, DECK);

// ---- the red deckhouse at the bow ---------------------------------------- //
// Explicit quads, not box(): isoBox grades its darkest face to about 0.44 of
// the colour it is handed, and shade(HOUSE, 0.44) on a saturated house colour
// falls off the palette grid into teal. See the Aegis's stern for the full
// argument — it is systemic to box() plus owner colour.
function houseBlock(u, hl, hw, z0, z1) {
  var c = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]];
  function q(i, z) { return P(u + c[i][0], c[i][1], z); }
  var faces = [[0, 1, HL], [1, 2, HOUSE], [3, 0, HD]];
  for (var fi = 0; fi < faces.length; fi++) {
    var a = q(faces[fi][0], z0), b = q(faces[fi][1], z0);
    var a2 = q(faces[fi][0], z1), b2 = q(faces[fi][1], z1);
    g.fillStyle = faces[fi][2];
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(b2[0], b2[1]); g.lineTo(a2[0], a2[1]); g.closePath(); g.fill();
  }
  var t = [q(0, z1), q(1, z1), q(2, z1), q(3, z1)];
  g.fillStyle = HL;
  g.beginPath();
  g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]);
  g.lineTo(t[2][0], t[2][1]); g.lineTo(t[3][0], t[3][1]); g.closePath(); g.fill();
}
houseBlock(L * 0.68, L * 0.11, W * 0.44, FR + 3.0, FR + 5.0);
houseBlock(-L * 0.72, L * 0.09, W * 0.38, FR + 3.0, FR + 4.6);    // and the red box aft

// ---- the tall red gantry abaft the bow block ----------------------------- //
(function () {
  var gu = L * 0.34;
  for (var sg = -1; sg <= 1; sg += 2) {
    var p0 = P(gu, W * 0.56 * sg, FR + 3.0), p1 = P(gu, W * 0.56 * sg, FR + 8.6);
    g.strokeStyle = HOUSE; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
  }
  var x0 = P(gu, W * 0.56, FR + 8.2), x1 = P(gu, -W * 0.56, FR + 8.2);
  g.strokeStyle = HL; g.lineWidth = 1.0;
  g.beginPath(); g.moveTo(x0[0], x0[1]); g.lineTo(x1[0], x1[1]); g.stroke();
})();

// ---- khaki machinery packed round the mount ------------------------------ //
box(-L * 0.10, W * 0.62, L * 0.22, W * 0.52, 4.6, '#999966');
box(-L * 0.30, -W * 0.58, L * 0.18, W * 0.48, 4.0, '#666633');
box(-L * 0.06, -W * 0.66, L * 0.14, W * 0.40, 3.6, '#999966');
box(-L * 0.44, W * 0.30, L * 0.12, W * 0.44, 3.2, '#999966');
box(L * 0.16, -W * 0.50, L * 0.10, W * 0.36, 3.0, '#666633');
box(-L * 0.24, W * 0.10, L * 0.10, W * 0.30, 2.6, '#999966');

// ---- THE GUN: one thick white barrel with red bands, elevated ------------- //
(function () {
  var MU = -L * 0.16, MZ = FR + 3.0;
  // the white housing it turns on
  var hq = P(MU, 0, MZ);
  g.fillStyle = '#cccccc';
  g.beginPath(); g.ellipse(hq[0], hq[1], 4.2, 2.3, 0, 0, 6.29); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(hq[0], hq[1] - 1.2, 3.4, 1.8, 0, 0, 6.29); g.fill();
  g.fillStyle = '#999999';
  g.beginPath(); g.ellipse(hq[0], hq[1] + 0.5, 4.2, 2.1, 0, 0, 6.29); g.fill();
  // the barrel, up and forward at about 45 degrees, projected so it leans
  // with the hull instead of standing at a fixed screen angle
  var b0 = P(MU, 0, MZ + 2.4), b1 = P(L * 0.52, 0, MZ + 9.0);
  g.strokeStyle = '#cccccc'; g.lineWidth = 4.2; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.8;                    // its lit upper side
  g.beginPath(); g.moveTo(b0[0] - 1.3, b0[1]); g.lineTo(b1[0] - 1.3, b1[1]); g.stroke();
  g.strokeStyle = '#666666'; g.lineWidth = 1.2;                    // and the shaded under
  g.beginPath(); g.moveTo(b0[0] + 1.6, b0[1]); g.lineTo(b1[0] + 1.6, b1[1]); g.stroke();
  // TWO RED BANDS, which is what names her against every other grey gun afloat
  for (var bd = 0; bd < 2; bd++) {
    var t0 = 0.30 + bd * 0.40, t1 = t0 + 0.14;
    g.strokeStyle = HOUSE; g.lineWidth = 4.2;
    g.beginPath();
    g.moveTo(b0[0] + (b1[0] - b0[0]) * t0, b0[1] + (b1[1] - b0[1]) * t0);
    g.lineTo(b0[0] + (b1[0] - b0[0]) * t1, b0[1] + (b1[1] - b0[1]) * t1);
    g.stroke();
  }
  g.fillStyle = '#333333';                                         // the muzzle
  g.beginPath(); g.ellipse(b1[0], b1[1], 1.6, 1.3, 0, 0, 6.29); g.fill();
})();

// ---- the pilot house, with PROJECTED glass ------------------------------- //
box(L * 0.34, -W * 0.30, L * 0.22, W * 0.70, 6.0, shade(DECK, 1.30));
(function () {
  var a = P(L * 0.42, -W * 0.30 + W * 0.34, FR + 5.0);
  var b = P(L * 0.26, -W * 0.30 + W * 0.34, FR + 5.0);
  // A DARK SLIT, not a cyan bar. GLASS at 1.8 px baked as a bright cyan block
  // floating over the deck — the only saturated cool note on the boat and the
  // first thing the eye found. The rip's pilot house has a dark window.
  g.strokeStyle = '#333333'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
})();
}
