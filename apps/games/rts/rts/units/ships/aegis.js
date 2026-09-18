// Iron Frontier — Allied Aegis cruiser.

function drawAegis(C) {
  var DECK = C.DECK, FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE,
      L = C.L, P = C.P, W = C.W, box = C.box, g = C.g, nearS = C.nearS;

  box(-L * 0.02, 0, L * 0.72, W * 1.62, 3.4, DECK);
  box(-L * 0.01, 0, L * 0.42, W * 0.98, 4.4, shade(DECK, 1.32));

  (function () {
    var b = P(-L * 0.78, W * 0.30, FR + 3.4), t = P(-L * 0.78, W * 0.30, FR + 14.2);
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
    var a = P(-L * 0.72, v, FR + 3.4), b = P(-L * 0.45, v, FR + 3.4);
    var c = P(-L * 0.52, v, FR + 9.8), d = P(-L * 0.70, v, FR + 9.4);
    g.fillStyle = HOUSE; g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    g.strokeStyle = HL; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); g.stroke();
    g.strokeStyle = HD; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
  })();

  // RA2's raised aft house is dark steel; the white masses are the guns in
  // front of it, not a white bridge ahead of the battery.
  var fu = -L * 0.58;
  box(fu, 0, L * 0.18, W * 0.82, 8.4, '#555555');
  (function () {
    function band(z, col, lw) {
      var a = P(fu, -W * 0.31, FR + z), b = P(fu, W * 0.31, FR + z);
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    band(5.6, HOUSE, 2.2); band(7.4, '#333333', 1.2);
  })();

  // Two large forward-facing AA tubes on one traversable centre pedestal.
  // The voxel reference shows thick white horizontal housings with dark
  // square mouths, not tall canted launch boxes with holes on their roofs.
  box(-L * 0.29, 0, L * 0.24, W * 1.10, 4.4, '#444444');
  box(-L * 0.29, 0, L * 0.16, W * 0.72, 6.2, '#666666');
  // Two seated trunnion blocks bridge the central foundation to the
  // launchers. Their roots overlap the pedestal, not empty water.
  box(-L * 0.28, 0, L * 0.25, W * 1.52, 4.6, '#59636b');
  box(-L * 0.28, -W * 0.56, L * 0.18, W * 0.48, 5.3, '#66737b');
  box(-L * 0.28, W * 0.56, L * 0.18, W * 0.48, 5.3, '#66737b');
  (function () {
    function quad(qs, col) {
      g.fillStyle = col; g.beginPath();
      g.moveTo(qs[0][0], qs[0][1]);
      for (var j = 1; j < qs.length; j++) g.lineTo(qs[j][0], qs[j][1]);
      g.closePath(); g.fill();
      g.strokeStyle = '#777777'; g.lineWidth = 0.65; g.stroke();
    }
    function tube(side) {
      var vv = side * W * 0.58, tipV = vv, hw = W * 0.23;
      var u0 = -L * 0.40, u1 = L * 0.08, z0 = FR + 4.5, z1 = FR + 7.5;
      function p(u, v, z) { return P(u, v, z); }
      var rise = 3.0;
      var a = p(u0, vv - hw, z0), b = p(u1, tipV - hw, z0 + rise),
          c = p(u1, tipV - hw, z1 + rise), d = p(u0, vv - hw, z1);
      var e = p(u0, vv + hw, z0), f = p(u1, tipV + hw, z0 + rise),
          h = p(u1, tipV + hw, z1 + rise), k = p(u0, vv + hw, z1);
      // Closed housings with real side/roof faces: white shells on grey
      // cradles, not disconnected screen-space strokes beyond the beam.
      quad([a,b,c,d], '#aeb9bf');
      quad([e,f,h,k], '#ced5d5');
      quad([a,e,k,d], '#909da5');
      // Bevelled shoulders separate the two canisters from slab-like walls.
      var d2=p(u0,vv-hw*.60,z1+.65),c2=p(u1,tipV-hw*.60,z1+rise+.65);
      var k2=p(u0,vv+hw*.60,z1+.65),h2=p(u1,tipV+hw*.60,z1+rise+.65);
      quad([d,c,c2,d2], '#c4cecf');
      quad([k,h,h2,k2], '#d6dcdc');
      quad([d2,c2,h2,k2], '#edf0e9');
      // Square muzzle collar with one recessed launch opening.
      quad([b, f, h, c], '#cccccc');
      var mu = u1 + L * 0.006;
      quad([p(mu, tipV - hw * 0.58, z0 + rise + 0.6),
            p(mu, tipV + hw * 0.58, z0 + rise + 0.6),
            p(mu, tipV + hw * 0.58, z1 + rise - 0.6),
            p(mu, tipV - hw * 0.58, z1 + rise - 0.6)], '#333333');
      g.strokeStyle = HOUSE; g.lineWidth = 1.0;
      var q0 = p(u0 - L * 0.01, vv - hw, z0 + 1.1), q1 = p(u0 - L * 0.01, vv + hw, z0 + 1.1);
      g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke();
    }
    tube(-nearS); tube(nearS);
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
