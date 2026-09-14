// Iron Frontier — ships/lcraft: the art for one unit.
// Called by bakeShip() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.



function drawLcraft(C) {
  var DECK = C.DECK, FR = C.FR, HL = C.HL, HOUSE = C.HOUSE, HULL = C.HULL, L = C.L, P = C.P,
      W = C.W, box = C.box, g = C.g, poly = C.poly;

// [LCRF]: an open well deck between two side walls, and the bow RAMP
// — the one feature that says "this thing beaches".
//
// The ramp is DOWN, and it reaches past the stem. Folded up over the
// bow it was inside the hull outline, which made it a texture and not
// a spike (reference §1.4's rule 4), and left the measured horizontal
// protrusion on this hull as the BOW WAVE — a 3-px decorative stroke
// that died at ZMIN and was the game's only `spike.belowFloor`. Down,
// it is the longest thing forward of any hull afloat and it is the
// feature the spec actually names.
// THE RUBBER SKIRT — drawn as a BAND round the perimeter, and drawn FIRST.
// The first attempt filled the polygon BETWEEN an outer outline at z 0 and an
// inner one at deck height, which is not a band at all: it is a filled disc
// spanning the whole plan, and drawn last it swallowed the deck, the cargo and
// the near fan. A skirt is a bag round the EDGE. One quad per plan edge, far
// edges first, exactly the way the freeboard of every other hull is built.
(function () {
  var SK = [[1.10, 0.10], [0.96, 0.72], [0.52, 1.06], [-0.62, 1.08],
            [-1.02, 0.70], [-1.08, 0.00], [-1.02, -0.70], [-0.62, -1.08],
            [0.52, -1.06], [0.96, -0.72], [1.10, -0.10]];
  var e = [];
  for (var i = 0; i < SK.length; i++) {
    var a = SK[i], b = SK[(i + 1) % SK.length];
    var qa = P(L * a[0], W * 1.16 * a[1], 0), qb = P(L * b[0], W * 1.16 * b[1], 0);
    e.push({ a: a, b: b, y: (qa[1] + qb[1]) / 2 });
  }
  e.sort(function (m, n) { return m.y - n.y; });
  for (var k = 0; k < e.length; k++) {
    var p0 = P(L * e[k].a[0], W * 1.16 * e[k].a[1], 0);
    var p1 = P(L * e[k].b[0], W * 1.16 * e[k].b[1], 0);
    g.beginPath();
    g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    g.lineTo(p1[0], p1[1] - FR * 1.30); g.lineTo(p0[0], p0[1] - FR * 1.30);
    g.closePath();
    g.fillStyle = '#1a1a1a'; g.fill();
    g.strokeStyle = '#333333'; g.lineWidth = 0.8;                 // its inflated crease
    g.beginPath();
    g.moveTo(p0[0], p0[1] - FR * 1.30); g.lineTo(p1[0], p1[1] - FR * 1.30); g.stroke();
  }
})();
box(-L * 0.10, W * 0.80, L * 0.90, W * 0.24, 3.8, shade(HULL, 0.94));
box(-L * 0.10, -W * 0.80, L * 0.90, W * 0.24, 3.8, shade(HULL, 0.94));
g.save(); poly(FR, null, null); g.clip();
g.fillStyle = '#2c2e31';
poly(FR, '#2c2e31', null);                     // the open well, in shadow
g.strokeStyle = '#54575c'; g.lineWidth = 0.8;
for (var ri = -2; ri <= 2; ri++) {
  var r0 = P(L * 0.5, ri * 3.0, FR), r1 = P(-L * 0.8, ri * 3.0, FR);
  g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
}
g.restore();
// Visible cargo in the well: two crates and a vehicle block, so she
// reads as CARRYING something rather than as an empty barge.
box(-L * 0.36, -W * 0.36, 7.0, W * 0.62, 4.2, '#75787d');
box(-L * 0.36, W * 0.40, 5.4, W * 0.52, 3.4, '#878a90');
box(L * 0.04, 0, 9.0, W * 0.96, 6.0, '#5f6267');                  // a loaded vehicle
box(L * 0.04, 0, 5.4, W * 0.62, 7.6, '#70737a');
// Ramp: a pale wedge hinged at the stem and lying DOWN on the water,
// with two side rails so it reads as a ramp and not a shadow.
var m0 = P(L * 0.80, W * 0.60, FR + 1.2), m1 = P(L * 0.80, -W * 0.60, FR + 1.2);
var m2 = P(L * 1.22, -W * 0.50, 0.6), m3 = P(L * 1.22, W * 0.50, 0.6);
g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]);
g.lineTo(m2[0], m2[1]); g.lineTo(m3[0], m3[1]); g.closePath();
g.fillStyle = shade(HULL, 1.16); g.fill();
g.strokeStyle = '#232528'; g.lineWidth = 1.0; g.stroke();
g.strokeStyle = shade(HULL, 1.42); g.lineWidth = 1.4;             // ramp rails
g.beginPath(); g.moveTo(m0[0], m0[1] - 1.6); g.lineTo(m3[0], m3[1] - 1.6); g.stroke();
g.beginPath(); g.moveTo(m1[0], m1[1] - 1.6); g.lineTo(m2[0], m2[1] - 1.6); g.stroke();
g.strokeStyle = HOUSE; g.lineWidth = 1.8;                          // hinge band at the stem
g.beginPath(); g.moveTo(m0[0], m0[1] - 0.6); g.lineTo(m1[0], m1[1] - 0.6); g.stroke();
box(-L * 0.78, 0, 6, W * 0.50, 5.2, shade(DECK, 1.1));            // little wheelhouse aft

// SHE IS A HOVERCRAFT AND SHE HAD NO FANS. `library/lcraft-voxel.jpg` shows
// two LARGE DUCTED FANS standing at the after corners — fat cylinders in a
// ring, taller than the wheelhouse and the widest things on her — over a dark
// RUBBER SKIRT that wraps the whole base. Those two drums are what a player
// picks this unit out by, and neither was drawn: what we had was a grey slab
// with crates on it and a white paper triangle at the bow, which is a barge.
(function () {
  for (var fs = -1; fs <= 1; fs += 2) {
    // FURTHER APART AND FURTHER AFT. At v = +-0.68W the two drums projected
    // almost on top of each other and only one was visible; the reference puts
    // them on the after CORNERS, well outboard.
    var fu = -L * 0.70, fv = W * 1.00 * fs, fz = FR + 1.0;
    var c0 = P(fu, fv, fz), c1 = P(fu, fv, fz + 9.4);
    // the duct: a fat drum, drawn as a stack so it reads round rather than
    // as a box. Equal-channel greys only — a duct that splits into teal is
    // the trap that has caught three units in this directory.
    g.strokeStyle = '#333333'; g.lineWidth = 9.4; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.stroke();
    g.strokeStyle = HOUSE; g.lineWidth = 7.0;
    g.beginPath(); g.moveTo(c0[0] - 0.6, c0[1]); g.lineTo(c1[0] - 0.6, c1[1]); g.stroke();
    g.strokeStyle = HL; g.lineWidth = 2.4;                        // the lit side of the drum
    g.beginPath(); g.moveTo(c0[0] - 2.6, c0[1]); g.lineTo(c1[0] - 2.6, c1[1]); g.stroke();
    // the ring at its mouth, and the blades inside it
    var mq = P(fu, fv, fz + 9.4);
    g.fillStyle = '#999999';
    g.beginPath(); g.ellipse(mq[0], mq[1], 5.0, 2.6, 0, 0, 6.29); g.fill();
    g.fillStyle = '#333333';
    g.beginPath(); g.ellipse(mq[0], mq[1], 3.7, 1.9, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#666666'; g.lineWidth = 0.8;
    for (var bl = 0; bl < 3; bl++) {
      var a = bl * 2.09;
      g.beginPath(); g.moveTo(mq[0], mq[1]);
      g.lineTo(mq[0] + Math.cos(a) * 3.0, mq[1] + Math.sin(a) * 1.5); g.stroke();
    }
  }
})();

}
