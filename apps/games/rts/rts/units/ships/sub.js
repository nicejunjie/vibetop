// Iron Frontier — ships/sub: the art for one unit.

function drawSub(C) {
  var FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, L = C.L, P = C.P,
      W = C.W, g = C.g, nearS = C.nearS;

  function shape(points, col) {
    g.fillStyle = col; g.beginPath();
    for (var i = 0; i < points.length; i++) {
      var q = P(points[i][0], points[i][1], points[i][2]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
    }
    g.closePath(); g.fill();
  }

  // The far stern plane disappears behind the casing; the near plane stays visible.
  shape([[-L * 0.70, -nearS * W * 0.72, FR * 1.12],
         [-L * 0.96, -nearS * W * 1.72, FR * 1.02],
         [-L * 1.00, -nearS * W * 0.62, FR * 1.02]], HD);

  // One uninterrupted whaleback, barely clear of the water.
  shape([[ L * 0.98,  W * 0.18, FR * 1.10], [ L * 0.88,  W * 0.94, FR * 1.20],
         [ L * 0.48,  W * 1.34, FR * 1.32], [-L * 0.62,  W * 1.38, FR * 1.30],
         [-L * 0.96,  W * 0.84, FR * 1.16], [-L * 1.00, -W * 0.84, FR * 1.16],
         [-L * 0.62, -W * 1.38, FR * 1.30], [ L * 0.48, -W * 1.34, FR * 1.32],
         [ L * 0.88, -W * 0.94, FR * 1.20], [ L * 0.98, -W * 0.18, FR * 1.10]], '#333333');
  // The long near-side band is the submarine's dominant owner-colour read.
  var s0 = P(-L * 0.88, nearS * W * 1.34, FR * 0.72);
  var s1 = P( L * 0.87, nearS * W * 1.05, FR * 0.84);
  g.lineCap = 'round'; g.strokeStyle = HOUSE; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke();

  // A small bow patch and red stern control surfaces terminate the stripe.
  shape([[L * 0.86, nearS * W * 0.72, FR * 0.88],
         [L * 0.99, nearS * W * 0.18, FR * 0.98],
         [L * 0.94, nearS * W * 0.62, FR * 0.46]], HL);
  shape([[-L * 0.70, nearS * W * 0.72, FR * 1.12],
         [-L * 0.96, nearS * W * 1.72, FR * 1.02],
         [-L * 1.00, nearS * W * 0.62, FR * 1.02]], HOUSE);
  shape([[-L * 0.94, -W * 0.22, FR * 1.08], [-L * 1.02, 0, FR * 2.80],
         [-L * 1.00, W * 0.24, FR * 1.08]], HD);
  shape([[-L * 0.90, nearS * W * 0.54, FR * 1.02],
         [-L * 1.04, nearS * W * 0.35, FR * 0.46],
         [-L * 1.02, nearS * W * 0.78, FR * 0.42]], HOUSE);

  // The sail is a narrow slab, not a second hull or a pile of deckhouses.
  var su = L * 0.08, sl = L * 0.08, sw = W * 0.44;
  shape([[su + sl, -nearS * sw, FR * 1.28], [su - sl, -nearS * sw, FR * 1.28],
         [su - sl, -nearS * sw, FR * 5.55], [su + sl, -nearS * sw, FR * 5.20]], '#333333');
  shape([[su + sl, nearS * sw, FR * 1.28], [su - sl, nearS * sw, FR * 1.28],
         [su - sl, nearS * sw, FR * 5.55], [su + sl, nearS * sw, FR * 5.20]], '#333333');
  shape([[su + sl, -nearS * sw, FR * 5.20], [su + sl, nearS * sw, FR * 5.20],
         [su - sl, nearS * sw, FR * 5.55], [su - sl, -nearS * sw, FR * 5.55]], '#666666');
  var b0 = P(su - sl, nearS * sw, FR * 3.90), b1 = P(su + sl, nearS * sw, FR * 3.70);
  g.strokeStyle = HOUSE; g.lineWidth = 1.3; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();

  var m0 = P(su - L * 0.01, 0, FR * 5.45), m1 = P(su - L * 0.01, 0, FR * 7.20);
  g.strokeStyle = '#666666'; g.lineWidth = 1.0;
  g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.stroke();
}
