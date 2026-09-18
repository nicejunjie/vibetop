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
  b(-1.00, 1.30, 1.5, -0.91, 0.24, 1.8, -0.78, 0, 1.8); fill('#526d80');

  var far = -nearS;
  g.beginPath(); m(0.28, far * 0.34, 1.7);
  b(0.04, far * 0.56, 1.4, -0.36, far * 1.28, 0.9, -0.52, far * 1.40, 0.7);
  b(-0.44, far * 1.03, 0.9, -0.22, far * 0.40, 1.6, 0.12, far * 0.20, 2.0);
  b(0.18, far * 0.22, 1.9, 0.24, far * 0.28, 1.8, 0.28, far * 0.34, 1.7); fill('#405a70');

  // One continuous bottlenose silhouette: pointed beak, melon, belly and peduncle.
  g.beginPath(); m(1.38, 0, 2.1);
  b(1.24, -0.08, 2.7, 1.02, -0.14, 3.1, 0.82, -0.28, 4.4);
  b(0.61, -0.57, 5.5, 0.13, -0.72, 5.5, -0.19, -0.62, 5.0);
  b(-0.50, -0.52, 4.4, -0.75, -0.24, 3.2, -0.94, 0, 2.0);
  b(-0.72, 0.26, 0.8, -0.30, 0.64, -0.3, 0.16, 0.60, -0.1);
  b(0.53, 0.55, 0.3, 0.88, 0.28, 0.9, 1.06, 0.12, 1.4);
  b(1.19, 0.06, 1.6, 1.31, 0.03, 1.9, 1.38, 0, 2.1); fill('#a5b8c4');
  g.strokeStyle='#304957';g.lineWidth=.65;g.stroke();

  // Dark back and pale underside stay contained inside the animal.
  g.beginPath(); m(0.80, -0.18, 4.1);
  b(0.53, -0.48, 5.1, 0.16, -0.56, 5.1, -0.18, -0.50, 4.6);
  b(-0.38, -0.42, 4.2, -0.54, -0.25, 3.5, -0.65, -0.10, 2.9);
  b(-0.34, -0.18, 3.6, 0.31, -0.22, 4.2, 0.80, -0.18, 4.1); fill('#5b7b91');
  g.beginPath(); m(0.88, 0.10, 1.4);
  b(0.58, 0.42, 0.4, 0.14, 0.43, 0.1, -0.20, 0.40, 0.2);
  b(-0.43, 0.34, 0.6, -0.60, 0.16, 1.3, -0.72, 0.04, 1.8);
  b(-0.40, 0.18, 1.3, 0.35, 0.16, 1.1, 0.88, 0.10, 1.4); fill('#e0e4da');

  // Curved dorsal and the near pectoral fin complete the dolphin silhouette.
  g.beginPath(); m(0.04, -0.20, 5.1);
  b(-0.04, -0.17, 6.0, -0.13, -0.12, 7.0, -0.23, -0.09, 7.2);
  b(-0.24, -0.11, 6.4, -0.28, -0.16, 5.5, -0.35, -0.22, 4.8);
  b(-0.20, -0.28, 5.0, -0.06, -0.26, 5.2, 0.04, -0.20, 5.1); fill('#3e5d73');

  var near = nearS;
  g.beginPath(); m(0.27, near * 0.35, 1.7);
  b(0.03, near * 0.60, 1.3, -0.37, near * 1.34, 0.4, -0.55, near * 1.48, 0.2);
  b(-0.46, near * 1.08, 0.5, -0.22, near * 0.43, 1.4, 0.10, near * 0.24, 1.8);
  b(0.17, near * 0.25, 1.8, 0.23, near * 0.30, 1.8, 0.27, near * 0.35, 1.7); fill('#55758a');

  // THE THING ON ITS BACK IS A WEAPON, and it was drawn as a rounded blue
  // SADDLE — three soft bezier lobes that read as a marking painted on the
  // animal. In the rip it is a hard-edged BOX bolted to a dark harness strap,
  // standing clear of the back, with an emitter facing forward: a machine on
  // an animal, and the contrast between the two is the whole point. A dolphin
  // with a blue patch is a dolphin; a dolphin carrying a pod is a weapon.
  //
  // The box is legal here. This unit's clause is "no orthogonal edges
  // anywhere" — not the Squid's "zero straight edges" — and every corner goes
  // through P(), so its edges lie on the iso axes and none of them is
  // horizontal or vertical on screen.
  (function () {
    var PU = 0.06, PV = -0.06, PL2 = 0.16, PW2 = 0.29, Z0 = 4.2, Z1 = 6.1;
    function c(du, dv, z) { return P(L * (PU + du), W * (PV + dv), FR + z); }
    var g0 = c(PL2, PW2, Z0), g1 = c(PL2, -PW2, Z0),
        g2 = c(-PL2, -PW2, Z0), g3 = c(-PL2, PW2, Z0);
    var t0 = c(PL2, PW2, Z1), t1 = c(PL2, -PW2, Z1),
        t2 = c(-PL2, -PW2, Z1), t3 = c(-PL2, PW2, Z1);
    function face(a, b, a2, b2, col) {
      g.fillStyle = col; g.beginPath();
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(b2[0], b2[1]); g.lineTo(a2[0], a2[1]); g.closePath(); g.fill();
    }
    // the dark harness strap, under the pod and round the body
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 2.0;
    var s0 = c(0, PW2 * 1.5, Z0 - 1.4), s1 = c(0, -PW2 * 1.5, Z0 - 1.4);
    g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke();
    face(g0, g1, t0, t1, HOUSE);                       // the pod's forward face
    face(g3, g0, t3, t0, HD);                          // its near flank
    face(t0, t1, t3, t2, HL);                          // its lit top
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.7;      // a hard edge all round
    g.beginPath();
    g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]);
    g.lineTo(t2[0], t2[1]); g.lineTo(t3[0], t3[1]); g.closePath(); g.stroke();
    // THE EMITTER, pointing forward past the pod — the part that says "weapon"
    var e0 = c(PL2, 0, (Z0 + Z1) / 2), e1 = c(PL2 + 0.26, 0, (Z0 + Z1) / 2 - 0.3);
    g.strokeStyle = '#333333'; g.lineWidth = 2.2; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
    g.strokeStyle = '#999999'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(e0[0], e0[1] - 0.7); g.lineTo(e1[0], e1[1] - 0.7); g.stroke();
    g.fillStyle = HL;                                  // its glowing mouth
    g.beginPath(); g.ellipse(e1[0], e1[1], 1.0, 1.3, 0, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(e1[0], e1[1], 0.5, 0.7, 0, 0, 6.29); g.fill();
  })();

  q = P(L * 0.03, -nearS * W * 0.25, FR + 5.8);
  g.fillStyle = '#333333'; g.beginPath(); g.ellipse(q[0], q[1], 1.2, 0.8, 0, 0, 6.29); g.fill();
  q = P(L * 0.78, nearS * W * 0.25, FR + 3.0);
  g.fillStyle = '#333333'; g.beginPath(); g.ellipse(q[0], q[1], 0.65, 0.55, 0, 0, 6.29); g.fill();
  var e = P(L * 1.28, nearS * W * 0.06, FR + 1.9), r = P(L * 0.80, nearS * W * 0.26, FR + 1.4),
      t = P(L * 0.57, nearS * W * 0.38, FR + 1.3);
  g.strokeStyle = '#666666'; g.lineWidth = 0.65; g.lineCap = 'round'; g.beginPath();
  g.moveTo(e[0], e[1]); g.bezierCurveTo(r[0], r[1], r[0], r[1], t[0], t[1]); g.stroke();
}
