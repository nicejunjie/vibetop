// Iron Frontier — ships/sub: the art for one unit.

function drawSub(C) {
  var FR = C.FR, HD = C.HD, HL = C.HL, HOUSE = C.HOUSE, HULL = C.HULL, L = C.L, P = C.P,
      W = C.W, g = C.g, nearS = C.nearS;

// [SUB] — the Typhoon, surfaced. Two things were wrong and the user named both.
//
// 1. THE RED IS NOT A STRIPE. It was drawn as one hairline of owner colour run
//    the whole length of the casing, like a racing stripe on a car. Magnified,
//    `library/sub.png` shows a SEPARATE RED BODY SLUNG UNDER THE GREY CASING:
//    it begins about a quarter of the way aft, swells to its greatest depth
//    just abaft midships, and tapers back to nothing by about three quarters.
//    It is a FISH-BELLY — a lens with pointed ends, deepest in the middle —
//    and the bow and the stern of the boat are plain grey. A uniform band is
//    the one thing it is not.
//
// 2. THE STERN HAD NO PROPULSION. Ours ended in a flat truncated slab with a
//    red bracket stuck on it. The reference has a CRUCIFORM TAIL: an upper
//    red stern plane raking up and aft, a lower red one raking down and aft,
//    a dark hub where they cross, and the shaft running aft out of it. That
//    cross is the whole of the stern's read and there was nothing there.

  function shape(points, col) {
    g.fillStyle = col; g.beginPath();
    for (var i = 0; i < points.length; i++) {
      var q = P(points[i][0], points[i][1], points[i][2]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
    }
    g.closePath(); g.fill();
  }
  function line(a, b, col, w) {
    var p0 = P(a[0], a[1], a[2]), p1 = P(b[0], b[1], b[2]);
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
  }

  // ---- the far stern plane, behind the casing --------------------------- //
  shape([[-L * 0.78, -nearS * W * 0.30, FR * 1.10],
         [-L * 1.16, -nearS * W * 1.30, FR * 1.70],
         [-L * 1.18, -nearS * W * 0.90, FR * 0.95]], HD);

  // ---- the casing: a CYLINDER, banded so it reads as metal ------------- //
  // Filled flat it was a shadow. A pressure hull seen from above and to the
  // side is a cylinder: its crown catches the sky, its flanks fall away, and
  // the near edge curves into shadow. Four longitudinal bands across the beam
  // give that, and a fixed pale strake along the crown gives the highlight —
  // which on a dark hull a MULTIPLIER cannot, the same lesson the surface
  // fleet's sheer strake taught.
  (function () {
    var PLAN = [[ 1.00, 0.72], [ 0.90, 1.26], [ 0.78, 1.36], [-0.86, 1.36],
                [-0.98, 1.20], [-1.04, 0.66]];
    var BAND = [[-1.00, -0.34, 0.70], [-0.34, 0.30, 1.16],
                [0.30, 0.84, 0.84], [0.84, 1.00, 0.46]];
    for (var bi = 0; bi < BAND.length; bi++) {
      var v0 = BAND[bi][0], v1 = BAND[bi][1], f = BAND[bi][2];
      g.fillStyle = shade(HULL, f);
      g.beginPath();
      for (var pi = 0; pi < PLAN.length; pi++) {
        var q = P(L * PLAN[pi][0], W * PLAN[pi][1] * v1, FR * 1.30);
        if (pi) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
      }
      for (var pj = PLAN.length - 1; pj >= 0; pj--) {
        var q2 = P(L * PLAN[pj][0], W * PLAN[pj][1] * v0, FR * 1.30);
        g.lineTo(q2[0], q2[1]);
      }
      g.closePath(); g.fill();
    }
    // the far half, mirrored, so the boat is closed on both sides
    g.fillStyle = shade(HULL, 0.62);
    g.beginPath();
    for (var mi = 0; mi < PLAN.length; mi++) {
      var m0 = P(L * PLAN[mi][0], -W * PLAN[mi][1], FR * 1.30);
      if (mi) g.lineTo(m0[0], m0[1]); else g.moveTo(m0[0], m0[1]);
    }
    for (var mj = PLAN.length - 1; mj >= 0; mj--) {
      var m1 = P(L * PLAN[mj][0], -W * PLAN[mj][1] * 0.34, FR * 1.30);
      g.lineTo(m1[0], m1[1]);
    }
    g.closePath(); g.fill();
    // THE CROWN STRAKE — a fixed pale value, not a multiple of the hull.
    line([L * 0.92, -W * 0.10, FR * 1.32], [-L * 0.98, -W * 0.10, FR * 1.32], '#999999', 1.0);
    line([L * 0.92,  W * 0.24, FR * 1.32], [-L * 0.98,  W * 0.24, FR * 1.32], '#666666', 0.7);
    // plating seams across the casing, one value down
    for (var si2 = 0; si2 < 9; si2++) {
      var su2 = L * (0.84 - si2 * 0.22);
      line([su2, -W * 1.10, FR * 1.31], [su2, W * 1.24, FR * 1.31], shade(HULL, 0.56), 0.6);
    }
  })();

  // ---- THE RED BELLY: a lens under the casing, pointed at both ends ------ //
  // Eight points rather than a stroke, because the shape IS the point: it has
  // to be thin where it starts and ends and fat in the middle. A line of
  // constant width cannot do that, which is why the old one read as paint.
  (function () {
    var v = nearS * W * 1.16;
    shape([[ L * 0.76, v, FR * 0.92],                    // the forward point
           [ L * 0.46, v, FR * 0.26],
           [ L * 0.10, v, FR * 0.10],                    // it holds its depth...
           [-L * 0.34, v, FR * 0.10],                    // ...across the whole middle
           [-L * 0.62, v, FR * 0.24],
           [-L * 0.84, v, FR * 0.80],                    // the after point
           [-L * 0.62, v, FR * 1.06],
           [-L * 0.34, v, FR * 1.14],
           [ L * 0.10, v, FR * 1.14],
           [ L * 0.46, v, FR * 1.08]], HL);
    // AND IT NEEDS AN EDGE. Filled in HOUSE it bakes #990000 against a #333333
    // casing — two dark masses touching, which is why it still read as a
    // painted band rather than as a body slung under the boat. The lit house
    // colour for the mass and a hard dark line round it makes it an OBJECT.
    (function () {
      var O = [[ L * 0.76, FR * 0.92], [ L * 0.46, FR * 0.26], [ L * 0.10, FR * 0.10],
               [-L * 0.34, FR * 0.10], [-L * 0.62, FR * 0.24], [-L * 0.84, FR * 0.80],
               [-L * 0.62, FR * 1.06], [-L * 0.34, FR * 1.14], [ L * 0.10, FR * 1.14],
               [ L * 0.46, FR * 1.08]];
      g.strokeStyle = '#330000'; g.lineWidth = 0.8;
      g.beginPath();
      for (var oi = 0; oi < O.length; oi++) {
        var q = P(O[oi][0], v, O[oi][1]);
        if (oi) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
      }
      g.closePath(); g.stroke();
      // a darker core low in the mass, so it has volume rather than being flat
      g.fillStyle = HOUSE;
      g.beginPath();
      var c = [[ L * 0.48, FR * 0.72], [ L * 0.06, FR * 0.32], [-L * 0.40, FR * 0.34],
               [-L * 0.66, FR * 0.70], [-L * 0.40, FR * 0.92], [ L * 0.06, FR * 0.92]];
      for (var ci = 0; ci < c.length; ci++) {
        var q2 = P(c[ci][0], v, c[ci][1]);
        if (ci) g.lineTo(q2[0], q2[1]); else g.moveTo(q2[0], q2[1]);
      }
      g.closePath(); g.fill();
    })();
    // a lit crease along its top, where it meets the grey casing
    line([L * 0.54, v, FR * 1.04], [-L * 0.68, v, FR * 1.04], HL, 0.9);
    // and its shaded underside
    line([L * 0.34, v, FR * 0.30], [-L * 0.50, v, FR * 0.26], HD, 0.9);
  })();

  // ---- the forward casing's hatch row ----------------------------------- //
  // The rip's forward third is not bare: it carries a line of dark hatches,
  // and without them the casing bakes as one flat grey wedge.
  (function () {
    for (var hi = 0; hi < 7; hi++) {
      var hu = L * (0.76 - hi * 0.11);
      line([hu, nearS * W * 0.86, FR * 1.30], [hu, nearS * W * 0.30, FR * 1.30], '#000000', 0.8);
    }
  })();

  // ---- the bow: plain grey, with one small red fitting ------------------- //
  shape([[L * 0.86, nearS * W * 0.72, FR * 0.92],
         [L * 0.99, nearS * W * 0.18, FR * 0.98],
         [L * 0.94, nearS * W * 0.62, FR * 0.60]], HOUSE);

  // ---- THE CRUCIFORM TAIL, and the shaft running aft out of it ----------- //
  (function () {
    var hubU = -L * 1.02;
    // the upper plane, raking up and aft
    shape([[-L * 0.78, nearS * W * 0.30, FR * 1.12],
           [-L * 1.16, nearS * W * 1.30, FR * 1.78],
           [-L * 1.18, nearS * W * 0.88, FR * 1.02]], HOUSE);
    // the lower plane, raking down and aft
    shape([[-L * 0.80, nearS * W * 0.34, FR * 0.86],
           [-L * 1.18, nearS * W * 1.24, FR * 0.14],
           [-L * 1.16, nearS * W * 0.82, FR * 0.72]], HOUSE);
    // the vertical fin above the hub
    shape([[-L * 0.92, 0, FR * 1.10], [-L * 1.06, 0, FR * 2.70],
           [-L * 1.14, 0, FR * 1.08]], HD);
    // the dark hub the planes cross at, then the shaft and the screw behind it
    // THE GEAR WAS SWAMPING THE PLANES. A 1.0 x 3.0 grey screw and a 1.2 px
    // shaft rendered as a grey mallet at the stern and the red cruciform
    // disappeared behind it. The planes are the read; the screw is a detail.
    var hq = P(hubU, nearS * W * 0.55, FR * 0.92);
    g.fillStyle = '#333333';
    g.beginPath(); g.ellipse(hq[0], hq[1], 1.5, 1.2, 0, 0, 6.29); g.fill();
    line([hubU, nearS * W * 0.55, FR * 0.92],
         [-L * 1.16, nearS * W * 0.55, FR * 0.92], '#666666', 0.9);
    var sq = P(-L * 1.18, nearS * W * 0.55, FR * 0.92);
    g.fillStyle = '#666666';                              // the screw, seen edge-on
    g.beginPath(); g.ellipse(sq[0], sq[1], 0.7, 1.7, 0, 0, 6.29); g.fill();
  })();

  // ---- the sail: a narrow slab, not a pile of deckhouses ----------------- //
  // The sail baked as a BRIGHT STRIPED CHIMNEY at 30% of the length, because it
  // was narrow, pale-faced and too far forward. In the rip it is a DARK, wider,
  // lower slab just abaft midships with a mast cluster over it.
  var su = -L * 0.02, sl = L * 0.17, sw = W * 0.50;
  shape([[su + sl, -nearS * sw, FR * 1.28], [su - sl, -nearS * sw, FR * 1.28],
         [su - sl, -nearS * sw, FR * 4.30], [su + sl, -nearS * sw, FR * 4.05]], '#333333');
  shape([[su + sl, nearS * sw, FR * 1.28], [su - sl, nearS * sw, FR * 1.28],
         [su - sl, nearS * sw, FR * 4.30], [su + sl, nearS * sw, FR * 4.05]], '#333333');
  shape([[su + sl, -nearS * sw, FR * 4.05], [su + sl, nearS * sw, FR * 4.05],
         [su - sl, nearS * sw, FR * 4.30], [su - sl, -nearS * sw, FR * 4.30]], '#666666');
  // NO HOUSE BAND ON THE SAIL. It baked as a second red streak a few pixels
  // above the belly and the two together read as 'red decoration on a grey
  // boat' — which is exactly what the belly is not supposed to be. The rip
  // spends this boat's owner colour on the belly and the stern, nowhere else.
  // a mast cluster, not one wire
  line([su - L * 0.02, 0, FR * 4.25], [su - L * 0.02, 0, FR * 6.60], '#666666', 1.0);
  line([su + L * 0.04, 0, FR * 4.25], [su + L * 0.04, 0, FR * 5.90], '#333333', 0.9);
  line([su + L * 0.10, 0, FR * 4.20], [su + L * 0.10, 0, FR * 5.40], '#666666', 0.8);
}
