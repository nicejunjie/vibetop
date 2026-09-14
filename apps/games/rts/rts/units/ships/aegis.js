// Iron Frontier — Allied Aegis cruiser.

function drawAegis(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE,
      L = C.L, P = C.P, W = C.W, box = C.box, g = C.g, nearS = C.nearS;

  box(-L * 0.02, 0, L * 0.72, W * 1.62, 3.4, DECK);
  box(-L * 0.06, 0, L * 0.52, W * 1.34, 5.4, shade(DECK, 1.46));

  (function () {
    var b = P(L * 0.46, W * 0.30, FR + 3.4), t = P(L * 0.46, W * 0.30, FR + 14.2);
    g.strokeStyle = '#333333'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(t[0], t[1]); g.stroke();
    g.beginPath(); g.moveTo(t[0] - 2, t[1] + 3); g.lineTo(t[0] + 2, t[1] + 3); g.stroke();
    g.fillStyle = '#ffcc33';
    g.beginPath(); g.ellipse(t[0], t[1] - 0.7, 1.2, 1.5, 0, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(t[0], t[1] - 1.1, 0.6, 0.8, 0, 0, 6.29); g.fill();
  })();

  (function () {
    var v = W * 0.28 * nearS;
    var a = P(L * 0.34, v, FR + 3.4), b = P(L * 0.10, v, FR + 3.4);
    var c = P(L * 0.16, v, FR + 9.8), d = P(L * 0.32, v, FR + 9.4);
    g.fillStyle = HOUSE; g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    g.strokeStyle = HL; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); g.stroke();
    g.strokeStyle = HD; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
  })();

  var fu = L * 0.19;
  box(fu, 0, L * 0.12, W * 0.62, 7.4, '#cccccc');
  (function () {
    function band(z, col, lw) {
      var a = P(fu, -W * 0.31, FR + z), b = P(fu, W * 0.31, FR + z);
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    band(5.6, HOUSE, 2.2); band(7.4, '#333333', 1.2);
  })();

  // THE AA MOUNT — A LAUNCHER WITH VOLUME, NOT SHEETS.
  // It was five flat white quads, each drawn at a single v as one filled
  // polygon: no top face, no end face, no thickness. That is exactly how you
  // draw a SAIL, and that is what it looked like — white canvas luffing over
  // the after deck. A launcher is a BOX: it has a lit top, a shaded near side
  // and a darker end, and the three of them meeting at a corner is the whole
  // of what tells the eye it is a solid object.
  //
  // Two canted launcher blocks side by side on a broad base, each with its
  // cells opening upward, which is the shape the reference carries and the
  // reason this ship reads as anti-air at a glance.
  box(-L * 0.34, 0, L * 0.72, W * 1.72, 3.6, '#666666');            // the base
  (function () {
    // one canted box: u/v centre, half-length, half-width, base z, top z, and
    // how far the top is shifted aft of the bottom (the cant).
    function launcher(cu, cv, hl, hw, z0, z1, cant, tone) {
      function c(du, dv, z, aft) {
        return P(L * (cu + du + (aft ? cant : 0)), W * (cv + dv), FR + z);
      }
      var b0 = c(hl, hw, z0, 0), b1 = c(hl, -hw, z0, 0),
          b2 = c(-hl, -hw, z0, 0), b3 = c(-hl, hw, z0, 0);
      var t0 = c(hl, hw, z1, 1), t1 = c(hl, -hw, z1, 1),
          t2 = c(-hl, -hw, z1, 1), t3 = c(-hl, hw, z1, 1);
      function quad(a, b, cc, d, col) {
        g.fillStyle = col; g.beginPath();
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
        g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
        g.strokeStyle = '#666666'; g.lineWidth = 0.7; g.stroke();
      }
      quad(b3, b0, t0, t3, tone[1]);                 // the near flank
      quad(b0, b1, t1, t0, tone[2]);                 // the forward end
      quad(t0, t1, t2, t3, tone[0]);                 // the lit top
      // the cell mouths in the top face, which is what says "launcher"
      for (var ci = -1; ci <= 1; ci++) {
        var m = c(hl * 0.45 * ci, 0, z1, 1);
        g.fillStyle = '#333333';
        g.beginPath(); g.ellipse(m[0], m[1], 1.5, 1.0, 0, 0, 6.29); g.fill();
        g.fillStyle = HOUSE;
        g.beginPath(); g.ellipse(m[0], m[1] - 0.3, 0.9, 0.6, 0, 0, 6.29); g.fill();
      }
    }
    var PALE = ['#ffffff', '#cccccc', '#999999'];
    var DIM  = ['#cccccc', '#999999', '#666666'];
    launcher(-L * 0.001 - 0.18, -0.62 * nearS, 0.17, 0.34, 3.6, 10.8, 0.10, DIM);
    launcher(-0.34, 0.52 * nearS, 0.19, 0.38, 3.6, 12.4, 0.11, PALE);
  })();

  // Explicit house-colour faces avoid isoBox's teal palette rung.
  (function () {
    var u = -L * 0.80, du = L * 0.09, v = W * 0.42, z0 = FR, z1 = FR + 5.0;
    var p = [[du, v], [du, -v], [-du, -v], [-du, v]];
    function q(i, z) { return P(u + p[i][0], p[i][1], z); }
    var side = [[0, 1, HL], [1, 2, HOUSE], [3, 0, HD]];
    for (var i = 0; i < side.length; i++) {
      var f = side[i], a = q(f[0], z0), b = q(f[1], z0);
      var c = q(f[1], z1), d = q(f[0], z1);
      g.fillStyle = f[2]; g.beginPath();
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    }
    var a = q(0, z1), b = q(1, z1), c = q(2, z1), d = q(3, z1);
    g.fillStyle = HL; g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
  })();

  box(L * 0.66, 0, L * 0.19, W * 1.20, 2.4, '#333333');
  g.fillStyle = '#000000';
  for (var s = -1; s <= 1; s += 2) for (var i = 0; i < 4; i++) {
    var q = P(L * (0.66 + (i - 1.5) * 0.047), W * 0.29 * s, FR + 2.4);
    g.beginPath(); g.ellipse(q[0], q[1], 1.1, 0.7, 0, 0, 6.29); g.fill();
  }
}
