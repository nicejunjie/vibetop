// Iron Frontier — ships/dolphin: the art for one unit.
// Called by bakeShip() with one context object carrying the projection helpers.

function drawDolphin(C) {
  var FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P,
      W = C.W, g = C.g, nearS = C.nearS;
  var q;
  function m(u, v, z) { q = P(L * u, W * v, FR + z); g.moveTo(q[0], q[1]); }
  function b(u1, v1, z1, u2, v2, z2, u3, v3, z3) {
    var a = P(L * u1, W * v1, FR + z1), c = P(L * u2, W * v2, FR + z2),
        d = P(L * u3, W * v3, FR + z3);
    g.bezierCurveTo(a[0], a[1], c[0], c[1], d[0], d[1]);
  }
  function fill(col) { g.closePath(); g.fillStyle = col; g.fill(); }

  // Horizontal crescent fluke, followed by the far swept pectoral fin.
  g.beginPath(); m(-0.78, 0, 1.8);
  b(-0.91, -0.24, 1.8, -1.00, -1.30, 1.5, -1.14, -1.48, 1.2);
  b(-1.18, -0.90, 1.2, -1.12, -0.28, 1.5, -1.20, 0, 1.4);
  b(-1.12, 0.28, 1.5, -1.18, 0.90, 1.2, -1.14, 1.48, 1.2);
  b(-1.00, 1.30, 1.5, -0.91, 0.24, 1.8, -0.78, 0, 1.8); fill('#666666');

  var far = -nearS;
  g.beginPath(); m(0.28, far * 0.34, 1.7);
  b(0.04, far * 0.56, 1.4, -0.36, far * 1.28, 0.9, -0.52, far * 1.40, 0.7);
  b(-0.44, far * 1.03, 0.9, -0.22, far * 0.40, 1.6, 0.12, far * 0.20, 2.0);
  b(0.18, far * 0.22, 1.9, 0.24, far * 0.28, 1.8, 0.28, far * 0.34, 1.7); fill('#666666');

  // One continuous bottlenose silhouette: pointed beak, melon, belly and peduncle.
  g.beginPath(); m(1.18, 0, 2.1);
  b(1.08, -0.10, 2.9, 0.92, -0.18, 3.2, 0.82, -0.28, 4.4);
  b(0.61, -0.57, 5.5, 0.13, -0.72, 5.5, -0.19, -0.62, 5.0);
  b(-0.50, -0.52, 4.4, -0.75, -0.24, 3.2, -0.94, 0, 2.0);
  b(-0.72, 0.26, 0.8, -0.30, 0.64, -0.3, 0.16, 0.60, -0.1);
  b(0.53, 0.55, 0.3, 0.76, 0.28, 0.9, 0.87, 0.13, 1.4);
  b(0.96, 0.08, 1.6, 1.09, 0.04, 1.9, 1.18, 0, 2.1); fill('#999999');

  // Dark back and pale underside stay contained inside the animal.
  g.beginPath(); m(0.80, -0.18, 4.1);
  b(0.53, -0.48, 5.1, 0.16, -0.56, 5.1, -0.18, -0.50, 4.6);
  b(-0.38, -0.42, 4.2, -0.54, -0.25, 3.5, -0.65, -0.10, 2.9);
  b(-0.34, -0.18, 3.6, 0.31, -0.22, 4.2, 0.80, -0.18, 4.1); fill('#666666');
  g.beginPath(); m(0.88, 0.10, 1.4);
  b(0.58, 0.42, 0.4, 0.14, 0.43, 0.1, -0.20, 0.40, 0.2);
  b(-0.43, 0.34, 0.6, -0.60, 0.16, 1.3, -0.72, 0.04, 1.8);
  b(-0.40, 0.18, 1.3, 0.35, 0.16, 1.1, 0.88, 0.10, 1.4); fill('#cccccc');

  // Curved dorsal and the near pectoral fin complete the dolphin silhouette.
  g.beginPath(); m(0.04, -0.20, 5.1);
  b(-0.04, -0.17, 6.0, -0.13, -0.12, 7.0, -0.23, -0.09, 7.2);
  b(-0.24, -0.11, 6.4, -0.28, -0.16, 5.5, -0.35, -0.22, 4.8);
  b(-0.20, -0.28, 5.0, -0.06, -0.26, 5.2, 0.04, -0.20, 5.1); fill('#666666');

  var near = nearS;
  g.beginPath(); m(0.27, near * 0.35, 1.7);
  b(0.03, near * 0.60, 1.3, -0.37, near * 1.34, 0.4, -0.55, near * 1.48, 0.2);
  b(-0.46, near * 1.08, 0.5, -0.22, near * 0.43, 1.4, 0.10, near * 0.24, 1.8);
  b(0.17, near * 0.25, 1.8, 0.23, near * 0.30, 1.8, 0.27, near * 0.35, 1.7); fill('#999999');

  // Rounded blue saddle and strap are the only saturated surfaces.
  g.beginPath(); m(0.34, -0.42, 4.8);
  b(0.26, -0.54, 5.3, -0.12, -0.55, 5.4, -0.22, -0.40, 4.9);
  b(-0.18, -0.13, 4.5, -0.12, 0.34, 3.1, -0.02, 0.48, 2.7);
  b(0.10, 0.51, 2.9, 0.40, 0.08, 4.0, 0.34, -0.42, 4.8); fill(HOUSE);
  g.beginPath(); m(0.31, -0.34, 5.1);
  b(0.19, -0.45, 5.5, -0.05, -0.43, 5.5, -0.13, -0.34, 5.2);
  b(-0.02, -0.25, 5.2, 0.20, -0.23, 5.1, 0.31, -0.34, 5.1); fill(HL);
  g.beginPath(); m(-0.02, 0.43, 2.3);
  b(-0.08, 0.39, 2.4, -0.17, 0.25, 2.8, -0.19, 0.05, 3.3);
  b(-0.11, 0.15, 2.9, 0.02, 0.31, 2.5, 0.08, 0.40, 2.4);
  b(0.05, 0.43, 2.3, 0.01, 0.44, 2.3, -0.02, 0.43, 2.3); fill(HD);

  q = P(L * 0.03, -nearS * W * 0.25, FR + 5.8);
  g.fillStyle = '#333333'; g.beginPath(); g.ellipse(q[0], q[1], 1.2, 0.8, 0, 0, 6.29); g.fill();
  q = P(L * 0.78, nearS * W * 0.25, FR + 3.0);
  g.fillStyle = '#333333'; g.beginPath(); g.ellipse(q[0], q[1], 0.65, 0.55, 0, 0, 6.29); g.fill();
  var e = P(L * 1.10, nearS * W * 0.08, FR + 1.9), r = P(L * 0.72, nearS * W * 0.30, FR + 1.4),
      t = P(L * 0.57, nearS * W * 0.38, FR + 1.3);
  g.strokeStyle = '#666666'; g.lineWidth = 0.65; g.lineCap = 'round'; g.beginPath();
  g.moveTo(e[0], e[1]); g.bezierCurveTo(r[0], r[1], r[0], r[1], t[0], t[1]); g.stroke();
}
