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

  // The AA mount is the ship's read: a broad base and overlapping canted slabs.
  box(-L * 0.34, 0, L * 0.72, W * 1.72, 4.0, '#666666');
  (function () {
    var face = [
      [ 0.10, -0.29, -0.03, -0.44, -1.18 * nearS, 4.0, 11.5, '#cccccc'],
      [-0.10, -0.51,  0.09, -0.35, -0.56 * nearS, 7.5, 14.5, '#ffffff'],
      [-0.29, -0.72, -0.14, -0.56,  0.08 * nearS, 8.0, 15.0, '#ffffff'],
      [ 0.10, -0.33, -0.03, -0.51,  1.18 * nearS, 4.0, 11.8, '#ffffff'],
      [-0.44, -0.88, -0.31, -0.72,  0.82 * nearS, 4.0, 10.5, '#cccccc']
    ];
    for (var i = 0; i < face.length; i++) {
      var f = face[i], v = W * f[4];
      var a = P(L * f[0], v, FR + f[5]), b = P(L * f[1], v, FR + f[5]);
      var c = P(L * f[3], v, FR + f[6]), d = P(L * f[2], v, FR + f[6]);
      g.fillStyle = f[7]; g.beginPath();
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
      g.strokeStyle = '#999999'; g.lineWidth = 0.8; g.stroke();
      a = P((f[0] + f[1]) * L / 2, v, FR + f[5] + 0.8);
      b = P((f[2] + f[3]) * L / 2, v, FR + f[6] - 0.8);
      g.strokeStyle = '#666666'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
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
