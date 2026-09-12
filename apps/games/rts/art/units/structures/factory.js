// Iron Frontier unit art — structures/factory
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/factory` and
// `// @@END structures/factory` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// War Factory - both read at 1:1 off the RA2 build-up sprites
// (docs/ra2-ref/{allied,soviet}-war-factory-idle.png, last frame of the
// wiki gifs) and MIRRORED left-right: RA2 opens both doors on the
// down-right face, the sim spawns a finished vehicle at
// freeTileNear(cx, cy + gh/2 + 1) and +gy projects DOWN-LEFT, so the
// mouth, its rails and the clear lane live on the +gy face and the
// machinery flank moves to +gx. The light stays upper-left.
//
// Both halls are laid out in FOOTPRINT TILES rather than magic pixels:
// IP(a, b, z) is the local iso projection, a along +gx (down-right),
// b along +gy (down-left), z straight up. a,b span -1.5..1.5.
// Six idle phases (`bph`, see bakeAll / drawBld): Allied hoist, lamp
// and flag; Soviet welding flashes, hook, boiler fires and smoke.
var AX = fw / 3, AY = fh / 3;                     // one grid tile, in px
var IP = function (a, b2, z) {
  return [cx + (a - b2) * AX, baseY + (a + b2) * AY - (z || 0)];
};
var qpoly = function (pts, fill, edge) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (var qi = 1; qi < pts.length; qi++) g.lineTo(pts[qi][0], pts[qi][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (edge) outline(g, edge);
};
var qline = function (pts, colr, w) {
  g.strokeStyle = colr; g.lineWidth = w;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (var qj = 1; qj < pts.length; qj++) g.lineTo(pts[qj][0], pts[qj][1]);
  g.stroke();
};
// Footprint-aligned box: the two camera-facing walls plus the roof.
var qbox = function (a0, a1, b0, b1, z0, z1, cA, cB, cT, ed) {
  qpoly([IP(a1, b0, z0), IP(a1, b1, z0), IP(a1, b1, z1), IP(a1, b0, z1)], cA, ed);
  qpoly([IP(a0, b1, z0), IP(a1, b1, z0), IP(a1, b1, z1), IP(a0, b1, z1)], cB, ed);
  if (cT) qpoly([IP(a0, b0, z1), IP(a1, b0, z1), IP(a1, b1, z1), IP(a0, b1, z1)], cT, ed);
};
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var SIL = '#c3c6d0', SILH = '#f0f2f8', SILD = '#767a86';

if (!sov) {
  // ---- Directorate = RA2 Allied War Factory ------------------------
  // A navy deck. One long low barrel vault, six bays of glass that go
  // white at the crown and blue-lavender at the springing, silver
  // hoops between them, a navy plinth with the owner stripe along its
  // foot. The near end is a bright silver hoop round a lit bay with two
  // thin rails running straight out of it; the far end carries a
  // silver sphere on a tall drum, a black flag mast and two curved
  // owner-colour flukes. A low navy wing with a silver girder runs
  // down the far side; the near flank is a khaki apron of kit.
  var NAVY = '#252a3c', NAVY_D = '#161a26', NAVY_L = '#383e58', EDGE = '#0d0f18';
  var GLST = '#f1f1fa', GLS = '#c6c5ea', GLSB = '#9d9fdc';
  var KHK = '#77754f', KHKD = '#55533a';
  var ii, jj, kk;

  // -- deck ------------------------------------------------------------
  plot(g, cx, baseY - 1, fw * 1.92, fh * 1.92);
  g.fillStyle = NAVY_D; g.fill();
  qpoly([IP(0.50, -1.46, 0), IP(1.80, -1.56, 0), IP(1.62, 1.44, 0), IP(0.50, 1.46, 0)], KHK, KHKD);
  srand(71);
  for (ii = 0; ii < 6; ii++) {                   // oil and wear on the apron
    var sp0 = IP(0.62 + rnd() * 0.72, -1.3 + rnd() * 2.5, 0);
    g.fillStyle = rnd() < 0.5 ? KHKD : shade(KHK, 1.12); g.globalAlpha = 0.45;
    g.beginPath(); g.ellipse(sp0[0], sp0[1], 4 + rnd() * 5, 2 + rnd() * 2, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1;
  qline([IP(0.50, -1.46, 0), IP(0.50, 1.46, 0)], KHKD, 1.5);
  // exit lane: a khaki slab past the +gy face, as the sprite's ramp
  qpoly([IP(-0.92, 1.42, 0), IP(0.34, 1.42, 0), IP(0.34, 2.36, 0), IP(-0.92, 2.36, 0)], KHK, KHKD);
  qline([IP(-0.90, 1.44, 0.5), IP(-0.90, 2.34, 0.5)], col, 1.6);          // PLAYER: lane kerbs
  qline([IP(0.32, 1.44, 0.5), IP(0.32, 2.34, 0.5)], col, 1.6);

  // -- far wing: low navy block, silver girder on its far top edge -----
  qbox(-1.60, -0.86, -1.40, 0.98, 0, 15, NAVY_D, NAVY, NAVY_L, EDGE);
  qline([IP(-1.60, -1.40, 16), IP(-1.60, 0.98, 16)], SIL, 2.8);
  qline([IP(-1.60, -1.40, 17.4), IP(-1.60, 0.98, 17.4)], SILH, 1);
  qline([IP(-1.60, -1.40, 7), IP(-1.60, 0.98, 7)], NAVY_L, 1.2);
  for (ii = 0; ii < 3; ii++) {                   // vent boxes on the wing roof
    var vbw = -0.86 + ii * 0.58;
    qbox(-1.44, -1.10, vbw - 0.15, vbw + 0.15, 15, 21, NAVY, NAVY_L, shade(NAVY_L, 1.22), EDGE);
    qpoly([IP(-1.10, vbw - 0.12, 16), IP(-1.10, vbw + 0.12, 16), IP(-1.10, vbw + 0.12, 20), IP(-1.10, vbw - 0.12, 20)], col, null);
  }
  qpoly([IP(-1.56, 0.98, 4), IP(-0.90, 0.98, 4), IP(-0.90, 0.98, 8), IP(-1.56, 0.98, 8)], col, null);
  qpoly([IP(-1.60, -1.36, 4), IP(-1.60, 0.94, 4), IP(-1.60, 0.94, 8), IP(-1.60, -1.36, 8)], shade(col, 0.80), null);
  qline([IP(-1.60, 0.98, 12), IP(-0.86, 0.98, 12)], SILD, 1);   // seam on the near face

  // -- far end: leaning fluke, mast and flag, sphere on its drum ------
  qbox(-1.30, -0.62, -1.78, -1.42, 0, 14, NAVY_D, NAVY, NAVY_L, EDGE);   // plinth for the sphere
  qpoly([IP(-1.26, -1.42, 4), IP(-0.66, -1.42, 4), IP(-0.66, -1.42, 9), IP(-1.26, -1.42, 9)], col, null);
  qpoly([IP(-0.62, -1.74, 4), IP(-0.62, -1.46, 4), IP(-0.62, -1.46, 9), IP(-0.62, -1.74, 9)], shade(col, 0.80), null);
  var fl0 = IP(-1.32, -1.68, 14), fl1 = IP(-0.90, -1.68, 14);
  g.fillStyle = col;                             // PLAYER: the left fluke
  g.beginPath(); g.moveTo(fl0[0], fl0[1]); g.lineTo(fl1[0], fl1[1]);
  g.lineTo(fl1[0] - 5, fl1[1] - 40); g.lineTo(fl0[0] - 8, fl0[1] - 37);
  g.quadraticCurveTo(fl0[0] - 11, fl0[1] - 18, fl0[0], fl0[1]); g.fill();
  g.fillStyle = shade(col, 0.72);
  g.beginPath(); g.moveTo(fl1[0], fl1[1]); g.lineTo(fl1[0] - 5, fl1[1] - 40);
  g.lineTo(fl1[0] - 10, fl1[1] - 39); g.lineTo(fl1[0] - 6, fl1[1] - 1); g.fill();
  g.strokeStyle = SILH; g.lineWidth = 2.4;      // silver rim on its outer edge
  g.beginPath(); g.moveTo(fl0[0], fl0[1]); g.quadraticCurveTo(fl0[0] - 11, fl0[1] - 18, fl0[0] - 8, fl0[1] - 37);
  g.lineTo(fl1[0] - 5, fl1[1] - 40); g.stroke();
  var mst = IP(-1.00, -1.76, 0);                 // black flag mast
  qline([[mst[0], mst[1]], [mst[0], mst[1] - 64]], '#1a1d28', 2.2);
  qline([[mst[0] - 0.6, mst[1] - 30], [mst[0] - 0.6, mst[1] - 62]], '#4b5064', 0.8);
  g.fillStyle = '#1c2030';                       // the flag, rippling
  g.beginPath(); g.moveTo(mst[0] + 1, mst[1] - 64); g.lineTo(mst[0] + 22, mst[1] - 60 + anS * 2);
  g.lineTo(mst[0] + 17, mst[1] - 54); g.lineTo(mst[0] + 22, mst[1] - 48 - anS * 2);
  g.lineTo(mst[0] + 1, mst[1] - 46); g.closePath(); g.fill(); outline(g, '#0a0c14');
  g.fillStyle = col; g.fillRect(mst[0] + 1, mst[1] - 64, 3, 18);
  var drm = IP(-0.88, -1.58, 14);                // drum and sphere on the plinth
  cylinder(g, drm[0], drm[1], 8.5, 26, NAVY, NAVY_L, EDGE);
  g.fillStyle = col; g.fillRect(drm[0] - 8.5, drm[1] - 19, 17, 6);
  g.fillStyle = SILD; g.fillRect(drm[0] - 8.5, drm[1] - 26, 17, 2);
  var sph = [drm[0], drm[1] - 36];
  g.fillStyle = SIL; g.beginPath(); g.arc(sph[0], sph[1], 11, 0, 6.29); g.fill(); outline(g, EDGE);
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.arc(sph[0], sph[1], 11, -0.6, 1.9); g.lineTo(sph[0] + 3, sph[1] + 2); g.fill();
  g.fillStyle = SILH; g.beginPath(); g.ellipse(sph[0] - 3.8, sph[1] - 4.4, 4, 2.8, -0.6, 0, 6.29); g.fill();
  qline([[sph[0] - 11, sph[1] + 1], [sph[0] + 11, sph[1] + 1]], 'rgba(10,12,20,.45)', 1.2);

  // -- the vault ---------------------------------------------------------
  var ac = -0.22, ha = 0.62, zb = 12, rise = 30, vb0 = -1.45, vb1 = 1.50;
  var C = function (th, bq) {
    return IP(ac + ha * Math.cos(th), bq, zb + rise * Math.sin(th));
  };
  var arcPts = function (bq, hs, z0, zt, n, dir) {
    var out = [], q, tq;
    for (q = 0; q <= n; q++) {
      tq = Math.PI * (dir < 0 ? (n - q) : q) / n;
      out.push(IP(ac + ha * hs * Math.cos(tq), bq, z0 + zt * Math.sin(tq)));
    }
    return out;
  };
  // plinth under the near springing: navy, owner stripe, silver pipe
  qpoly([IP(ac + ha, vb0, 0), IP(ac + ha, vb1, 0), IP(ac + ha, vb1, zb + 1), IP(ac + ha, vb0, zb + 1)],
        NAVY_D, EDGE);
  qpoly([IP(ac + ha, vb0, 2), IP(ac + ha, vb1, 2), IP(ac + ha, vb1, 7), IP(ac + ha, vb0, 7)], col, null);
  qline([IP(ac + ha, vb0, 8.6), IP(ac + ha, vb1 - 0.02, 8.6)], SIL, 2);
  qline([IP(ac + ha, vb0, 9.4), IP(ac + ha, vb1 - 0.02, 9.4)], SILH, 0.8);
  // closed far end
  var fend = arcPts(vb0, 1.0, zb, rise, 16, 1);
  fend.push(IP(ac - ha, vb0, 0), IP(ac + ha, vb0, 0));
  qpoly(fend, NAVY, EDGE);
  // barrel skin: bright at the crown, navy gutter down the far side
  var NB = 24, th0, th1, thm;
  for (ii = 0; ii < NB; ii++) {
    th0 = Math.PI * (1 - ii / NB); th1 = Math.PI * (1 - (ii + 1) / NB); thm = (th0 + th1) / 2;
    qpoly([C(th0, vb0), C(th1, vb0), C(th1, vb1), C(th0, vb1)],
          thm > 2.62 ? NAVY : shade(SIL, 0.62 + 0.50 * Math.sin(thm)), null);
  }
  // glass: six bays, each ONE pane in four strips, white -> lavender -> blue
  var NBAY = 6, bayL = (vb1 - vb0) / NBAY, ribW = bayL * 0.17;
  var STR = [[2.50, 1.98, GLST], [1.98, 1.46, '#ececf8'], [1.46, 0.94, '#d4d4f0'], [0.94, 0.42, GLSB]];
  for (kk = 0; kk < NBAY; kk++) {
    var gb0 = vb0 + bayL * kk + ribW, gb1 = vb0 + bayL * (kk + 1) - ribW;
    for (jj = 0; jj < 4; jj++) {
      qpoly([C(STR[jj][0], gb0), C(STR[jj][1], gb0), C(STR[jj][1], gb1), C(STR[jj][0], gb1)], STR[jj][2], null);
      qline([C(STR[jj][1], gb0), C(STR[jj][1], gb1)], 'rgba(52,56,90,.45)', 1);
    }
    qpoly([C(2.50, gb0), C(2.30, gb0), C(2.30, gb0 + bayL * 0.28), C(2.50, gb0 + bayL * 0.28)], '#ffffff', null);
    qline([C(0.42, gb0), C(0.42, gb1)], 'rgba(20,24,40,.5)', 1);
    for (jj = 1; jj < 3; jj++) qline(arcPts(gb0 + (gb1 - gb0) * jj / 3, 1, zb, rise, 12, 1).slice(1, 10), 'rgba(52,56,90,.30)', 1);
  }
  // silver hoops framing every bay: lit top edge, dark underside
  var NA = 18, rb, ring;
  for (kk = 0; kk <= NBAY; kk++) {
    rb = vb0 + bayL * kk;
    ring = [];
    for (jj = 0; jj <= NA; jj++) ring.push(C(Math.PI * jj / NA, rb - ribW));
    for (jj = NA; jj >= 0; jj--) ring.push(C(Math.PI * jj / NA, rb + ribW));
    qpoly(ring, shade(SIL, 1.10), null);
    qline(arcPts(rb + ribW, 1, zb, rise, NA, 1), 'rgba(20,24,40,.40)', 1);
    qline(arcPts(rb - ribW, 1, zb, rise, NA, 1), SILH, 1.2);
  }
  // navy block beside the mouth with two owner patches
  qbox(-0.92, -0.65, 1.02, 1.48, 0, 16, NAVY_D, NAVY, NAVY_L, EDGE);
  qpoly([IP(-0.90, 1.48, 3), IP(-0.79, 1.48, 3), IP(-0.79, 1.48, 14), IP(-0.90, 1.48, 14)], col, null);
  qpoly([IP(-0.77, 1.48, 3), IP(-0.66, 1.48, 3), IP(-0.66, 1.48, 14), IP(-0.77, 1.48, 14)], col, null);

  // -- the mouth: silver hoop, navy bay, lit floor, hoist, rails --------
  var mth = arcPts(vb1 + 0.01, 0.92, 2, rise * 0.96, 22, 1);
  mth.push(IP(ac - ha * 0.92, vb1 + 0.01, 0), IP(ac + ha * 0.92, vb1 + 0.01, 0));
  qpoly(mth, NAVY_D, null);
  g.save();                                      // nothing lit escapes the bay
  g.beginPath(); g.moveTo(mth[0][0], mth[0][1]);
  for (ii = 1; ii < mth.length; ii++) g.lineTo(mth[ii][0], mth[ii][1]);
  g.closePath(); g.clip();
  var LIT = ['#a89a70', '#8e8462', '#6e6a52', '#4c4c48'];   // lit bay, floor up to the dark crown
  for (ii = 0; ii < 4; ii++)
    qpoly([IP(ac - ha, vb1 + 0.02, ii * 6), IP(ac + ha, vb1 + 0.02, ii * 6),
           IP(ac + ha, vb1 + 0.02, ii * 6 + 6), IP(ac - ha, vb1 + 0.02, ii * 6 + 6)], LIT[ii], null);
  for (ii = 0; ii < 4; ii++) {                   // amber glow, breathing
    g.globalAlpha = 0.16 + 0.05 * anC - ii * 0.03;
    qpoly(arcPts(vb1, 0.84 - ii * 0.06, 2, rise * 0.55 - ii * 4, 14, 1), AMB, null);
  }
  g.globalAlpha = 1;
  qpoly([IP(ac - ha * 0.92, vb1 + 0.01, 2.5), IP(ac + ha * 0.92, vb1 + 0.01, 2.5),
         IP(ac + ha * 0.70, vb1 - 0.90, 2.5), IP(ac - ha * 0.70, vb1 - 0.90, 2.5)], '#a89a70', null);
  qpoly([IP(ac - ha * 0.70, vb1 - 0.90, 2.5), IP(ac + ha * 0.70, vb1 - 0.90, 2.5),
         IP(ac + ha * 0.70, vb1 - 0.90, 12), IP(ac - ha * 0.70, vb1 - 0.90, 12)], '#5c5440', null);
  g.globalAlpha = 0.35;
  qpoly(arcPts(vb1 - 0.01, 0.78, 2, rise * 0.16, 10, 1), AMBH, null);
  g.globalAlpha = 1;
  var hz = zb + rise * 0.74, hkz = hz - 7 - anS * 5;           // hoist beam and hook
  qline([IP(ac - ha * 0.80, vb1 - 0.30, hz), IP(ac + ha * 0.80, vb1 - 0.30, hz)], '#3a3f52', 2.4);
  qline([IP(ac + 0.02, vb1 - 0.30, hz), IP(ac + 0.02, vb1 - 0.30, hkz)], '#8a8e9a', 1);
  var hk = IP(ac + 0.02, vb1 - 0.30, hkz);
  g.fillStyle = '#5c6172'; g.fillRect(hk[0] - 3, hk[1] - 1, 6, 4);
  g.restore();
  // -- [GAWEAP] UnderDoorAnim=GAWEAP_1 / DoorStages: the bay door -------
  // A steel roller shutter filling the arch, clipped to the mouth so it
  // can only ever be seen through it. Shut is the idle state (RA2's
  // factories stand closed); it RISES, so the visible band is the top
  // (1-DOP) of the arch and the leading rail carries the owner stripe.
  if (DOP < 0.999) {
    var dH = 2 + rise * 0.96, dLo = dH * DOP;
    g.save();
    g.beginPath(); g.moveTo(mth[0][0], mth[0][1]);
    for (ii = 1; ii < mth.length; ii++) g.lineTo(mth[ii][0], mth[ii][1]);
    g.closePath(); g.clip();
    for (ii = 0; ii * 3 < dH - dLo; ii++) {
      var sz0 = dLo + ii * 3, sz1 = Math.min(dH, sz0 + 3);
      qpoly([IP(ac - ha, vb1 + 0.005, sz0), IP(ac + ha, vb1 + 0.005, sz0),
             IP(ac + ha, vb1 + 0.005, sz1), IP(ac - ha, vb1 + 0.005, sz1)],
            ii & 1 ? '#8b91a0' : '#9ba1b0', null);
      qline([IP(ac - ha, vb1 + 0.006, sz1), IP(ac + ha, vb1 + 0.006, sz1)], 'rgba(22,26,38,.55)', 1);
    }
    qpoly([IP(ac - ha, vb1 + 0.007, dLo), IP(ac + ha, vb1 + 0.007, dLo),          // PLAYER: leading rail
           IP(ac + ha, vb1 + 0.007, dLo + 2.6), IP(ac - ha, vb1 + 0.007, dLo + 2.6)], col, null);
    qline([IP(ac - ha, vb1 + 0.008, dLo), IP(ac + ha, vb1 + 0.008, dLo)], '#12151f', 1.4);
    g.restore();
  }
  // -- [GAWEAP] RoofDeployingAnim=GAWEAP_3: the crown panel slides ------
  var rhB0 = vb1 - 0.92, rhB1 = vb1 - 0.16, rhA = ha * 0.46, rhZ = zb + rise - 1.5;
  qpoly([IP(ac - rhA, rhB0, rhZ), IP(ac + rhA, rhB0, rhZ),
         IP(ac + rhA, rhB1, rhZ), IP(ac - rhA, rhB1, rhZ)], '#171b26', null);
  var rhS = (rhB1 - rhB0) * DOP;
  qpoly([IP(ac - rhA, rhB0 - rhS, rhZ + 1), IP(ac + rhA, rhB0 - rhS, rhZ + 1),
         IP(ac + rhA, rhB1 - rhS, rhZ + 1), IP(ac - rhA, rhB1 - rhS, rhZ + 1)], shade(SIL, 0.86), EDGE);
  qline([IP(ac - rhA * 0.55, rhB0 - rhS, rhZ + 1.6), IP(ac - rhA * 0.55, rhB1 - rhS, rhZ + 1.6)], SILH, 1);
  qline([IP(ac + rhA * 0.55, rhB0 - rhS, rhZ + 1.6), IP(ac + rhA * 0.55, rhB1 - rhS, rhZ + 1.6)], SILH, 1);
  var hoop = arcPts(vb1 + 0.03, 1.12, zb - 1, rise + 5, 22, 1);   // the hoop itself
  var hin = arcPts(vb1 + 0.03, 0.94, zb - 1, rise * 0.98, 22, -1);
  qpoly(hoop.concat(hin), SIL, EDGE);
  qline(arcPts(vb1 + 0.03, 1.06, zb - 1, rise + 2.5, 22, 1), SILH, 1.6);
  qline(arcPts(vb1 + 0.03, 0.95, zb - 1, rise * 1.00, 22, 1), 'rgba(20,24,40,.55)', 1);
  qpoly([IP(ac - ha * 1.12, vb1 + 0.03, 0), IP(ac + ha * 1.12, vb1 + 0.03, 0),
         IP(ac + ha * 1.12, vb1 + 0.03, zb - 1), IP(ac - ha * 1.12, vb1 + 0.03, zb - 1)], NAVY_D, EDGE);
  qpoly([IP(ac - ha * 0.94, vb1 + 0.03, 0), IP(ac + ha * 0.94, vb1 + 0.03, 0),
         IP(ac + ha * 0.94, vb1 + 0.03, 2.4), IP(ac - ha * 0.94, vb1 + 0.03, 2.4)], '#6b6248', null);
  qpoly([IP(ac - ha * 1.12, vb1 + 0.04, 3), IP(ac + ha * 1.12, vb1 + 0.04, 3),      // PLAYER: sill band under the hoop
         IP(ac + ha * 1.12, vb1 + 0.04, 9), IP(ac - ha * 1.12, vb1 + 0.04, 9)], col, null);
  var lmp = C(Math.PI / 2, vb1 + 0.05);          // warning lamp on the crown, blinking
  g.fillStyle = ph6 < 3 ? AMBH : '#5a4a2a';
  g.beginPath(); g.ellipse(lmp[0], lmp[1] - 6, 2.6, 2.0, 0, 0, 6.29); g.fill(); outline(g, EDGE);
  if (ph6 < 3) { g.globalAlpha = 0.28; g.fillStyle = AMBH; g.beginPath(); g.ellipse(lmp[0], lmp[1] - 6, 6, 4, 0, 0, 6.29); g.fill(); g.globalAlpha = 1; }
  // rails straight out of the bay along +gy
  for (ii = -1; ii <= 1; ii += 2) {
    qline([IP(ac + ii * 0.27, vb1 - 0.20, 1), IP(ac + ii * 0.27, 2.40, 1)], 'rgba(10,12,20,.55)', 1.2);
    qline([IP(ac + ii * 0.27, vb1 - 0.20, 2.2), IP(ac + ii * 0.27, 2.40, 2.2)], SILH, 1.2);
  }
  for (jj = 0; jj < 6; jj++) {                   // sleepers
    var slb = vb1 + 0.12 + jj * 0.16;
    qline([IP(ac - 0.31, slb, 0.8), IP(ac + 0.31, slb, 0.8)], 'rgba(20,22,30,.45)', 1);
  }

  // -- right of the far end: machinery box, C fluke, framed panel ------
  qbox(0.42, 0.94, -1.76, -1.42, 0, 18, NAVY_D, NAVY, NAVY_L, EDGE);
  qpoly([IP(0.46, -1.72, 18.2), IP(0.90, -1.72, 18.2), IP(0.90, -1.46, 18.2), IP(0.46, -1.46, 18.2)], col, null);
  qline([IP(0.42, -1.76, 18), IP(0.94, -1.76, 18)], SIL, 1.6);
  qpoly([IP(0.94, -1.72, 12), IP(0.94, -1.46, 12), IP(0.94, -1.46, 16), IP(0.94, -1.72, 16)], col, null);
  qpoly([IP(0.50, -1.42, 5), IP(0.86, -1.42, 5), IP(0.86, -1.42, 8), IP(0.50, -1.42, 8)], col, null);
  qpoly([IP(1.12, -1.70, 22), IP(1.42, -1.70, 22), IP(1.42, -1.70, 36), IP(1.12, -1.70, 36)], col, SIL);
  qline([IP(1.12, -1.70, 36), IP(1.42, -1.70, 36)], SILH, 1.6);
  qline([IP(1.27, -1.70, 0), IP(1.27, -1.70, 22)], SILD, 2);
  var cf = IP(1.04, -1.56, -6), cfy = cf[1] - 24, cfo = [], cfi = [];
  for (ii = 0; ii <= 14; ii++) {                 // PLAYER: the tall C fluke
    var cang = -Math.PI / 2 + Math.PI * ii / 14;
    cfo.push([cf[0] + 12 * Math.cos(cang), cfy + 24 * Math.sin(cang)]);
    cfi.push([cf[0] + 4 * Math.cos(cang), cfy + 18 * Math.sin(cang)]);
  }
  cfi.reverse();
  qpoly(cfo.concat(cfi), col, EDGE);
  qpoly(cfo.slice(7).concat(cfi.slice(0, 8)), shade(col, 0.74), null);
  qline(cfo, SILH, 2.2);
  qline(cfi, 'rgba(255,255,255,.35)', 1);

  // -- near flank: handrail, lying tank, gear discs, amber tube, kit ----
  for (jj = 0; jj < 7; jj++) {
    var hp2 = -1.30 + jj * 0.44;
    qline([IP(1.66, hp2, 0), IP(1.66, hp2, 7)], SILD, 1.2);
  }
  qline([IP(1.66, -1.30, 7), IP(1.66, 1.34, 7)], col, 1.8);
  var tk0 = -0.92, tk1 = -0.24, tka = 1.04;      // silver tank on cradles
  qpoly([IP(tka - 0.18, tk0, 0), IP(tka + 0.18, tk0, 0), IP(tka + 0.18, tk0, 5), IP(tka - 0.18, tk0, 5)], NAVY_D, EDGE);
  qpoly([IP(tka - 0.18, tk1, 0), IP(tka + 0.18, tk1, 0), IP(tka + 0.18, tk1, 5), IP(tka - 0.18, tk1, 5)], NAVY_D, EDGE);
  qpoly([IP(tka, tk0, 4), IP(tka, tk1, 4), IP(tka, tk1, 16), IP(tka, tk0, 16)], shade(SIL, 0.82), EDGE);
  qpoly([IP(tka, tk0, 12), IP(tka, tk1, 12), IP(tka, tk1, 15), IP(tka, tk0, 15)], SILH, null);
  qpoly([IP(tka, tk0, 4), IP(tka, tk1, 4), IP(tka, tk1, 7), IP(tka, tk0, 7)], SILD, null);
  var te = IP(tka, tk1, 10);
  g.fillStyle = shade(SIL, 1.08); g.beginPath(); g.ellipse(te[0], te[1], 5.2, 6, 0, 0, 6.29); g.fill(); outline(g, EDGE);
  var tb = IP(tka, tk0, 10);
  g.fillStyle = shade(SIL, 0.90); g.beginPath(); g.ellipse(tb[0], tb[1], 5.2, 6, 0, 0, 6.29); g.fill(); outline(g, EDGE);
  qpoly([IP(tka, -0.62, 4), IP(tka, -0.54, 4), IP(tka, -0.54, 16), IP(tka, -0.62, 16)], HAZ, null);
  var gd = IP(1.02, 0.16, 0);                    // gear discs
  g.fillStyle = SIL; g.beginPath(); g.ellipse(gd[0], gd[1], 6.5, 3.2, 0, 0, 6.29); g.fill(); outline(g, EDGE);
  g.fillStyle = NAVY_D; g.beginPath(); g.ellipse(gd[0], gd[1], 2.2, 1.1, 0, 0, 6.29); g.fill();
  var gd2 = IP(1.20, 0.40, 0);
  g.fillStyle = shade(SIL, 0.9); g.beginPath(); g.ellipse(gd2[0], gd2[1], 5, 2.5, 0, 0, 6.29); g.fill(); outline(g, EDGE);
  g.fillStyle = NAVY_D; g.beginPath(); g.ellipse(gd2[0], gd2[1], 1.8, 0.9, 0, 0, 6.29); g.fill();
  qline([IP(ac + ha + 0.02, -0.34, zb + 4), IP(0.92, -0.16, 9)], shade(AMB, 0.80), 4);   // amber tube
  qline([IP(ac + ha + 0.02, -0.34, zb + 5), IP(0.92, -0.16, 10)], AMBH, 1.2);
  var cp = IP(1.16, 0.84, 0); crates(g, cp[0], cp[1], 3, '#6a6f7c');
  var dp = IP(1.36, 1.16, 0); drums(g, dp[0], dp[1], 3, '#2c2e34');
  var fl = IP(1.66, -1.54, 0); floodlight(g, fl[0], fl[1], -1, AMBH);

} else {
  // ---- Collective = RA2 Soviet War Factory -------------------------
  // Read off the sprite: a LOW dark-iron hall on a pale concrete pad,
  // one row of white panel blocks along the ridge with a silver pipe
  // behind it, six red slotted radiator fins leaning over the roof in
  // two rows, pale domed boilers against the near wall with bright red
  // machine boxes in front of them, a big navy drum tower with a gold
  // onion at the +gx/-gy corner beside a pink limestone block, two grey
  // cylinders and the black cauldron with its bent exhausts. The maw is
  // framed in pink limestone with its leaf swung out, hammer-and-sickle
  // on the leaf, over a pale ramp edged red and brass.
  var NVY = '#262b3c', NVY_D = '#151824', NVY_L = '#3a4058', EDGE2 = '#0b0d14';
  var PADC = '#c8c4b2', PADE = '#8a8674', RIDGE = '#ebe8dc';
  var PINK = '#c49a8c', PINK_D = '#8f6a60', PINK_L = '#e0bcae';
  var GOLD = '#c8973a', IRON = '#20222a', BOIL = '#aaaa9c', BRASS = '#b8933f';
  var si, sj;
  plot(g, cx, baseY, fw * 2, fh * 2);           // pale concrete pad
  g.fillStyle = shade(PADC, 0.70); g.fill(); outline(g, shade(PADC, 0.50));
  plot(g, cx, baseY - 2, fw * 1.94, fh * 1.94);
  g.fillStyle = PADC; g.fill(); outline(g, shade(PADC, 0.62));
  srand(73);
  for (si = 0; si < 8; si++) {                     // cracks and stains
    var st0 = IP(-1.2 + rnd() * 2.4, -1.2 + rnd() * 2.4, 0);
    g.fillStyle = rnd() < 0.5 ? shade(PADC, 0.84) : shade(PADC, 1.06); g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(st0[0], st0[1], 3 + rnd() * 5, 1.5 + rnd() * 2, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1;

  // pale ramp past the +gy face: owner kerb one side, brass rail the other
  var rb0 = 1.40, rb1 = 2.45;
  qpoly([IP(-0.52, rb0, 0), IP(0.42, rb0, 0), IP(0.50, rb1, 0), IP(-0.60, rb1, 0)], '#d4d0bf', PADE);
  for (si = 1; si < 5; si++)
    qline([IP(-0.52 - 0.08 * si / 5, rb0 + si / 5, 0), IP(0.42 + 0.08 * si / 5, rb0 + si / 5, 0)], 'rgba(60,60,52,.32)', 1);
  qpoly([IP(-0.52, rb0, 0), IP(-0.62, rb0, 0), IP(-0.70, rb1, 0), IP(-0.60, rb1, 0)], col, shade(col, 0.70));
  qline([IP(0.42, rb0, 1), IP(0.50, rb1, 1)], BRASS, 2.2);
  for (si = 0; si < 3; si++)                       // sleepers under the long rails
    qline([IP(-0.46, rb1 + 0.12 + si * 0.2, 0), IP(0.40, rb1 + 0.12 + si * 0.2, 0)], 'rgba(60,60,52,.40)', 1);
  qline([IP(-0.40, rb1 - 0.02, 0), IP(-0.40, 3.05, 0)], '#c9c3aa', 2.0);
  qline([IP(0.34, rb1 - 0.02, 0), IP(0.34, 3.05, 0)], shade(BRASS, 0.86), 2.0);

  // -- +gx/-gy corner, back to front: pink block, grey cylinders --------
  qbox(1.08, 1.46, -1.92, -1.54, 0, 22, shade(PINK, 0.78), PINK, PINK_L, PINK_D);
  qpoly([IP(1.08, -1.92, 22), IP(1.46, -1.92, 22), IP(1.46, -1.54, 29), IP(1.08, -1.54, 29)], shade(PINK, 0.92), PINK_D);
  qline([IP(1.46, -1.92, 10), IP(1.46, -1.54, 10)], 'rgba(60,30,24,.4)', 1);
  for (si = 0; si < 2; si++) {
    var cz = 6 + si * 12;
    qpoly([IP(1.12, -2.00, cz), IP(1.12, -1.58, cz), IP(1.12, -1.58, cz + 10), IP(1.12, -2.00, cz + 10)], shade(SIL, 0.80), EDGE2);
    qline([IP(1.12, -2.00, cz + 8), IP(1.12, -1.58, cz + 8)], SILH, 1.2);
    var ce = IP(1.12, -1.58, cz + 5);
    g.fillStyle = shade(SIL, 1.02); g.beginPath(); g.ellipse(ce[0], ce[1], 5, 5.5, 0, 0, 6.29); g.fill(); outline(g, EDGE2);
    g.fillStyle = SILD; g.beginPath(); g.ellipse(ce[0], ce[1], 2, 2.2, 0, 0, 6.29); g.fill();
  }

  // -- the hall ------------------------------------------------------
  var ha0 = -0.98, ha1 = 0.56, hb0 = -1.36, hb1 = 1.36, wallH = 34, ridgeA = -0.21, ridgeH = 50;
  var rz = function (a) {
    return a < ridgeA ? wallH + (ridgeH - wallH) * (a - ha0) / (ridgeA - ha0)
                      : wallH + (ridgeH - wallH) * (ha1 - a) / (ha1 - ridgeA);
  };
  qpoly([IP(ha1, hb0, 0), IP(ha1, hb1, 0), IP(ha1, hb1, wallH), IP(ha1, hb0, wallH)], shade(NVY, 0.80), EDGE2);
  qpoly([IP(ha0, hb1, 0), IP(ha1, hb1, 0), IP(ha1, hb1, wallH), IP(ha0, hb1, wallH)], NVY, EDGE2);
  var mz, mv;
  for (mz = 6; mz < wallH; mz += 7) {              // plate courses
    qline([IP(ha1, hb0, mz), IP(ha1, hb1, mz)], 'rgba(8,10,18,.45)', 1);
    qline([IP(ha0, hb1, mz), IP(ha1, hb1, mz)], 'rgba(8,10,18,.40)', 1);
    qline([IP(ha1, hb0, mz + 1), IP(ha1, hb1, mz + 1)], 'rgba(120,128,160,.16)', 1);
  }
  for (mv = hb0 + 0.30; mv < hb1; mv += 0.30) qline([IP(ha1, mv, 2), IP(ha1, mv, wallH - 2)], 'rgba(8,10,18,.35)', 1);
  for (mv = ha0 + 0.24; mv < ha1; mv += 0.24) qline([IP(mv, hb1, 2), IP(mv, hb1, wallH - 2)], 'rgba(8,10,18,.30)', 1);
  // gable: the end wall rises to the ridge
  qpoly([IP(ha0, hb1, wallH), IP(ha1, hb1, wallH), IP(ridgeA, hb1, ridgeH)], shade(NVY, 1.06), EDGE2);
  // roof slopes: far in shade, near lit; then the silver pipe behind the ridge
  qpoly([IP(ridgeA, hb0, ridgeH), IP(ridgeA, hb1, ridgeH), IP(ha0, hb1, wallH), IP(ha0, hb0, wallH)], shade(NVY, 0.84), EDGE2);
  qpoly([IP(ridgeA, hb0, ridgeH), IP(ridgeA, hb1, ridgeH), IP(ha1, hb1, wallH), IP(ha1, hb0, wallH)], NVY_L, EDGE2);
  for (mv = hb0 + 0.22; mv < hb1; mv += 0.22) {   // seams down both slopes
    qline([IP(ridgeA, mv, ridgeH), IP(ha1, mv, wallH)], 'rgba(8,10,18,.28)', 1);
    qline([IP(ridgeA, mv, ridgeH), IP(ha0, mv, wallH)], 'rgba(8,10,18,.28)', 1);
  }
  // Pipe peak z lowered 57/58.2 -> 48/49.2 (and its low end 40 -> 31,
  // same shape/length) so it clears crown-detection once the tower
  // above was shortened for the aspect fix (factory:col had no
  // committed real-sprite reference to hold either at their old height).
  qline([IP(-0.66, 0.62, 48), IP(-0.66, hb0 - 0.06, 48), IP(0.50, hb0 - 0.06, 48), IP(0.50, hb0 - 0.06, 31)], '#2a2d38', 6.0);
  qline([IP(-0.66, 0.62, 48), IP(-0.66, hb0 - 0.06, 48), IP(0.50, hb0 - 0.06, 48), IP(0.50, hb0 - 0.06, 31)], SIL, 4.0);
  qline([IP(-0.66, 0.62, 49.2), IP(-0.66, hb0 - 0.06, 49.2), IP(0.50, hb0 - 0.06, 49.2)], SILH, 1.2);
  var pe = IP(-0.66, 0.62, 48);
  g.fillStyle = shade(SIL, 0.9); g.beginPath(); g.ellipse(pe[0], pe[1], 2.6, 2.9, 0, 0, 6.29); g.fill(); outline(g, EDGE2);

  // PLAYER: radiator fins. Slotted red slabs leaning back over the
  // roof, three peeking over the ridge from the far slope, three
  // taller ones hanging over the near eave, dark stand-pipes beside them.
  var fin = function (fa, fb, hl, hgt, z0, lean) {
    var ft = 0.05, L = function (a, b3, h) { return IP(a + lean * h / hgt, b3, z0 + h); };
    qpoly([L(fa - ft, fb + hl, 0), L(fa + ft, fb + hl, 0), L(fa + ft, fb + hl, hgt), L(fa - ft, fb + hl, hgt)],
          shade(col, 0.70), '#1d1a18');                          // thin +gy end
    qpoly([L(fa + ft, fb - hl, 0), L(fa + ft, fb + hl, 0), L(fa + ft, fb + hl, hgt), L(fa + ft, fb - hl, hgt)],
          col, '#1d1a18');                                        // slotted +gx face
    for (var sl = 0; sl < 4; sl++) {
      var sz = hgt * (0.18 + sl * 0.20);
      qpoly([L(fa + ft, fb - hl * 0.78, sz - 1.6), L(fa + ft, fb + hl * 0.78, sz - 1.6),
             L(fa + ft, fb + hl * 0.78, sz + 1.6), L(fa + ft, fb - hl * 0.78, sz + 1.6)], '#141118', null);
    }
    qpoly([L(fa - ft, fb - hl, hgt), L(fa + ft, fb - hl, hgt), L(fa + ft, fb + hl, hgt), L(fa - ft, fb + hl, hgt)],
          shade(col, 1.22), '#1d1a18');                          // cap
  };
  var FAR = [0.62, -0.08, -0.78], NEAR = [0.88, 0.22, -0.44];
  // FAR fin height shortened 24 -> 17 (same 27px tower-shaft cut as
  // above): unshortened, these three far-slope fins poked back into
  // the shorter tower's own crown silhouette and widened it past the
  // factory:col aspect band; no committed real-sprite reference holds
  // them at 24, so the shorter, still-clearly-finned height stands.
  for (si = 0; si < 3; si++) fin(-0.62, FAR[si], 0.26, 17, rz(-0.62) - 3, -0.14);
  // ridge: white panel blocks with a dark near face, silver gutter under them
  var np = 7, pb0, pb1, pa0 = ridgeA - 0.14, pa1 = ridgeA + 0.14;
  for (si = 0; si < np; si++) {
    pb0 = hb0 + 0.06 + (hb1 - hb0 - 0.12) * (si + 0.08) / np;
    pb1 = hb0 + 0.06 + (hb1 - hb0 - 0.12) * (si + 0.92) / np;
    qpoly([IP(pa0, pb0, ridgeH - 6), IP(pa1, pb0, ridgeH - 6), IP(pa1, pb1, ridgeH - 6), IP(pa0, pb1, ridgeH - 6)],
          si % 2 ? RIDGE : shade(RIDGE, 0.94), 'rgba(56,54,46,.6)');
    qpoly([IP(pa1, pb0, ridgeH - 6), IP(pa1, pb1, ridgeH - 6), IP(pa1, pb1, ridgeH - 10), IP(pa1, pb0, ridgeH - 10)],
          shade(RIDGE, 0.66), 'rgba(56,54,46,.6)');
    qpoly([IP(pa0, pb1, ridgeH + 3), IP(pa1, pb1, ridgeH + 3), IP(pa1, pb1, ridgeH - 1), IP(pa0, pb1, ridgeH - 1)],
          shade(RIDGE, 0.80), 'rgba(56,54,46,.6)');
  }
  qline([IP(pa1 + 0.03, hb0, rz(pa1 + 0.03) - 1), IP(pa1 + 0.03, hb1, rz(pa1 + 0.03) - 1)], shade(SIL, 0.84), 1.6);
  qline([IP(ha1 - 0.02, hb0, wallH + 1), IP(ha1 - 0.02, hb1, wallH + 1)], shade(SIL, 0.84), 1.6);
  for (si = 0; si < 3; si++) {
    qline([IP(0.64, NEAR[si] + 0.32, 22), IP(0.64, NEAR[si] + 0.32, 46)], NVY_D, 2.6);
    qline([IP(0.64, NEAR[si] + 0.32, 46), IP(0.64, NEAR[si] + 0.32, 50)], SILD, 2.6);
    fin(0.50, NEAR[si], 0.26, 26, wallH - 10, -0.14);
  }

  // -- tower: navy drum, silver collar, gold onion and spire -----------
  var tw = IP(0.60, -1.20, 0);
  // Shaft shortened 72 -> 45 (aspect.factory[col] needed >= 1.25 Sw/Sh
  // and had no committed real-sprite reference to hold it at 72; the
  // collar/onion/spire above keep their own absolute proportions and
  // just sit 27 lower). All offsets below are stated as fractions of
  // the original 72 so the collar/window/band layout does not drift.
  var towerH = 41;
  cylinder(g, tw[0], tw[1], 13, towerH, NVY, NVY_L, EDGE2);
  g.fillStyle = shade(NVY, 0.72); g.fillRect(tw[0] - 13, tw[1] - towerH * 30 / 72, 26, 3);
  g.fillStyle = SIL; g.fillRect(tw[0] - 13, tw[1] - towerH * 66 / 72, 26, 3);
  g.fillStyle = shade(SIL, 0.7); g.fillRect(tw[0] - 13, tw[1] - towerH * 12 / 72, 26, 2);
  g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(tw[0] - 11, tw[1] - towerH, 4, towerH);
  for (si = 0; si < 3; si++) {                     // slit windows
    g.fillStyle = '#0a0b10'; g.fillRect(tw[0] - 7 + si * 6, tw[1] - towerH * 56 / 72, 2.4, 8);
  }
  cylinder(g, tw[0], tw[1] - towerH, 8.5, 8, shade(SIL, 0.80), SIL, EDGE2);
  g.fillStyle = shade(SIL, 0.60); g.fillRect(tw[0] - 8.5, tw[1] - towerH - 4, 17, 1.6);
  var oy = tw[1] - towerH - 9, ox = tw[0];
  g.fillStyle = GOLD;                              // the onion
  g.beginPath();
  g.moveTo(ox - 3.0, oy);
  g.quadraticCurveTo(ox - 10, oy - 3.2, ox - 8.8, oy - 10);
  g.quadraticCurveTo(ox - 7.0, oy - 18.6, ox, oy - 25);
  g.quadraticCurveTo(ox + 7.0, oy - 18.6, ox + 8.8, oy - 10);
  g.quadraticCurveTo(ox + 10, oy - 3.2, ox + 3.0, oy);
  g.closePath(); g.fill(); outline(g, '#6d4d16');
  g.fillStyle = shade(GOLD, 1.42);
  g.beginPath();
  g.moveTo(ox - 1.6, oy - 1.6);
  g.quadraticCurveTo(ox - 6.0, oy - 4.4, ox - 5.0, oy - 10.2);
  g.quadraticCurveTo(ox - 3.6, oy - 17.0, ox - 0.6, oy - 22.4);
  g.quadraticCurveTo(ox - 1.4, oy - 13.0, ox + 1.0, oy - 1.4);
  g.closePath(); g.fill();
  g.fillStyle = shade(GOLD, 0.60);
  g.beginPath();
  g.moveTo(ox + 3.0, oy); g.quadraticCurveTo(ox + 8.2, oy - 3.6, ox + 7.3, oy - 10.8);
  g.quadraticCurveTo(ox + 5.4, oy - 17.6, ox + 1.4, oy - 22.6);
  g.quadraticCurveTo(ox + 4.0, oy - 12.4, ox + 1.4, oy - 1.2);
  g.closePath(); g.fill();
  for (si = 0; si < 5; si++) qline([[ox - 8 + si * 4, oy - 9], [ox - 8 + si * 4 + 1, oy - 1]], 'rgba(90,60,18,.35)', 1);
  qline([[ox, oy - 25], [ox, oy - 34]], '#e0c165', 1.6);
  qline([[ox - 2.6, oy - 31], [ox + 2.6, oy - 31]], '#e0c165', 1.4);
  g.fillStyle = '#f0d27a'; g.beginPath(); g.arc(ox, oy - 34, 1.6, 0, 6.29); g.fill();

  // -- black cauldron with two bent exhausts, smoke on the phase -------
  var cq = IP(0.84, -1.80, 0);
  cylinder(g, cq[0], cq[1], 10, 13, shade(IRON, 1.06), shade(IRON, 1.30), '#0c0d10');
  g.fillStyle = shade(SIL, 0.80);
  g.beginPath(); g.ellipse(cq[0], cq[1] - 13, 10, 4.6, 0, 0, 6.29); g.fill(); outline(g, '#0c0d10');
  g.fillStyle = shade(IRON, 1.5);
  g.beginPath(); g.ellipse(cq[0], cq[1] - 13, 6.8, 3.0, 0, 0, 6.29); g.fill();
  var elbow = function (ex, ey, len, wdt, lift) {  // one bent grey stack -> nozzle point
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#2c2e34'; g.lineWidth = wdt + 2;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex, ey - lift);
    g.quadraticCurveTo(ex - 2, ey - lift - 9, ex - len, ey - lift - 11); g.stroke();
    g.strokeStyle = '#565a63'; g.lineWidth = wdt;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex, ey - lift);
    g.quadraticCurveTo(ex - 2, ey - lift - 9, ex - len, ey - lift - 11); g.stroke();
    g.strokeStyle = '#7d828c'; g.lineWidth = Math.max(1, wdt * 0.28);
    g.beginPath(); g.moveTo(ex - wdt * 0.28, ey - 2); g.lineTo(ex - wdt * 0.28, ey - lift);
    g.quadraticCurveTo(ex - 3, ey - lift - 7.4, ex - len * 0.9, ey - lift - 9.2); g.stroke();
    g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.fillStyle = '#41444c';                       // flared nozzle
    g.beginPath(); g.ellipse(ex - len, ey - lift - 11, wdt * 0.44, wdt * 0.62, 0.5, 0, 6.29);
    g.fill(); outline(g, '#1a1c21');
    return [ex - len, ey - lift - 11];
  };
  var nz1 = elbow(cq[0] + 2, cq[1] - 14, 11, 5.5, 8);
  var nz2 = elbow(cq[0] - 5, cq[1] - 16, 9, 3.8, 13);
  for (si = 0; si < 2; si++) {
    var nz = si ? nz2 : nz1;
    for (sj = 0; sj < 3; sj++) {                   // three puffs per stack, 0 fresh -> 1 gone
      var pt = ((bph || 0) + sj / 3 + si * 0.17) % 1;
      g.fillStyle = 'rgba(150,152,160,' + (0.46 * (1 - pt)).toFixed(2) + ')';
      g.beginPath();
      g.ellipse(nz[0] - 3 - pt * 8 - si * 2, nz[1] - 3 - pt * 24, 2.4 + pt * 4.5, 1.8 + pt * 3.2, 0, 0, 6.29);
      g.fill();
    }
  }

  // -- near flank: pale domed boilers against the wall, red boxes -----
  var BB = [0.72, 0.08, -0.56];
  for (si = 0; si < 3; si++) {
    var bp = IP(0.84, BB[si], 0);
    cylinder(g, bp[0], bp[1], 7, 15, shade(BOIL, 0.84), BOIL, '#3a3a34');
    g.fillStyle = shade(BOIL, 1.06);
    g.beginPath(); g.ellipse(bp[0], bp[1] - 15, 7, 5.4, 0, Math.PI, 0); g.fill(); outline(g, '#3a3a34');
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.ellipse(bp[0] - 2.6, bp[1] - 18, 2.2, 1.4, -0.5, 0, 6.29); g.fill();
    g.fillStyle = '#4a4a42'; g.fillRect(bp[0] - 7, bp[1] - 5, 14, 1.6);
    var fire = (ph6 + si) % 3 === 0;                // firebox, glowing in turn
    g.fillStyle = fire ? AMB : '#2a1a10'; g.fillRect(bp[0] - 2.4, bp[1] - 3.6, 4.8, 2.4);
    if (fire) { g.globalAlpha = 0.35; g.fillStyle = AMBH; g.fillRect(bp[0] - 3.4, bp[1] - 4.4, 6.8, 3.6); g.globalAlpha = 1; }
    cylinder(g, bp[0] + 3, bp[1] - 19, 1.6, 6, '#33353c', '#4d5058', '#14151a');
  }
  var RB = [1.00, 0.36, -0.28];
  for (si = 0; si < 3; si++) {                     // PLAYER: red machine boxes
    qbox(1.06, 1.50, RB[si] - 0.28, RB[si] + 0.28, 0, 11, shade(col, 0.72), col, shade(col, 1.18), '#2a1416');
    for (sj = 0; sj < 3; sj++)
      qpoly([IP(1.50, RB[si] - 0.22, 3 + sj * 3.2), IP(1.50, RB[si] + 0.22, 3 + sj * 3.2),
             IP(1.50, RB[si] + 0.22, 4.4 + sj * 3.2), IP(1.50, RB[si] - 0.22, 4.4 + sj * 3.2)], '#141118', null);
    qpoly([IP(1.14, RB[si] - 0.18, 11), IP(1.42, RB[si] - 0.18, 11), IP(1.42, RB[si] + 0.18, 11), IP(1.14, RB[si] + 0.18, 11)], '#1d1a18', null);
    qline([IP(1.06, RB[si] + 0.28, 11), IP(1.50, RB[si] + 0.28, 11)], 'rgba(255,255,255,.25)', 1);
  }

  // -- the maw: pink limestone portal, dark bay, hook, welding flash ---
  var dA0 = -0.42, dA1 = 0.18, dz = 26;
  qpoly([IP(dA0 - 0.11, hb1, 0), IP(dA1 + 0.11, hb1, 0), IP(dA1 + 0.11, hb1, wallH - 2), IP(dA0 - 0.11, hb1, wallH - 2)], PINK, PINK_D);
  qpoly([IP(dA0 - 0.11, hb1, dz + 4), IP(dA1 + 0.11, hb1, dz + 4), IP(dA1 + 0.11, hb1, dz + 6), IP(dA0 - 0.11, hb1, dz + 6)], PINK_L, PINK_D);
  qline([IP(dA0 - 0.11, hb1, 2), IP(dA0 - 0.11, hb1, wallH - 2)], PINK_L, 1);
  qline([IP(dA1 + 0.01, hb1, 2), IP(dA1 + 0.01, hb1, dz + 4)], PINK_L, 1);
  for (si = 0; si < 4; si++) qline([IP(dA0 - 0.11, hb1, 6 + si * 7), IP(dA1 + 0.11, hb1, 6 + si * 7)], 'rgba(90,60,50,.35)', 1);
  qpoly([IP(dA0, hb1, 0), IP(dA1, hb1, 0), IP(dA1, hb1, dz), IP(dA0, hb1, dz)], '#0a0b10', '#06070a');
  qpoly([IP(dA0 + 0.03, hb1, 0), IP(dA1 - 0.03, hb1, 0), IP(dA1 - 0.03, hb1, 2.4), IP(dA0 + 0.03, hb1, 2.4)], '#5a5347', null);
  var hkz2 = 11 - anS * 4, dm = (dA0 + dA1) / 2;  // crane hook riding in the bay
  qline([IP(dm, hb1, dz - 1), IP(dm, hb1, hkz2)], '#6f7482', 1);
  var hk2 = IP(dm, hb1, hkz2);
  g.fillStyle = '#8a8e9a'; g.fillRect(hk2[0] - 2.5, hk2[1] - 1, 5, 3.5);
  if (ph6 === 1 || ph6 === 4) {                    // welding flash
    var wf = IP(dm + (ph6 === 1 ? -0.12 : 0.10), hb1, 6);
    g.globalAlpha = 0.55; g.fillStyle = '#ffd77a';
    g.beginPath(); g.ellipse(wf[0], wf[1], 9, 7, 0, 0, 6.29); g.fill();
    g.globalAlpha = 1; g.fillStyle = '#fff6d0';
    g.beginPath(); g.ellipse(wf[0], wf[1], 2.4, 2.0, 0, 0, 6.29); g.fill();
  }
  // [NAWEAP] the leaf: pink frame round a navy panel, hinged on the -gx
  // jamb. Shut it lies flat across the maw (RA2's idle state); the door
  // sequence swings it out past the jamb, and DOP is where in that
  // swing it stands.
  var lHin = [dA0 - 0.12, hb1], lLen = (dA1 + 0.11) - (dA0 - 0.12);
  var lAng = 2.505 * DOP;
  var lp0 = lHin, lp1 = [lHin[0] + lLen * Math.cos(lAng), lHin[1] + lLen * Math.sin(lAng)];
  qpoly([IP(lp0[0] + 0.04, lp0[1] + 0.05, 0), IP(lp1[0] + 0.04, lp1[1] + 0.05, 0),
         IP(lp1[0] - 0.02, lp1[1] + 0.18, 0), IP(lp0[0] - 0.02, lp0[1] + 0.18, 0)], 'rgba(0,0,0,.30)', null);
  qpoly([IP(lp0[0], lp0[1], 0), IP(lp1[0], lp1[1], 0), IP(lp1[0], lp1[1], dz + 4), IP(lp0[0], lp0[1], dz + 4)], NVY, EDGE2);
  qpoly([IP(lp1[0], lp1[1], 0), IP(lp1[0] - 0.04, lp1[1] + 0.07, 0),
         IP(lp1[0] - 0.04, lp1[1] + 0.07, dz + 4), IP(lp1[0], lp1[1], dz + 4)], PINK_D, EDGE2);
  var lf, la, lb;
  var LF = function (t, z) { return IP(lp0[0] + (lp1[0] - lp0[0]) * t, lp0[1] + (lp1[1] - lp0[1]) * t, z); };
  qpoly([LF(0, 0), LF(0.10, 0), LF(0.10, dz + 4), LF(0, dz + 4)], PINK, PINK_D);
  qpoly([LF(0.90, 0), LF(1, 0), LF(1, dz + 4), LF(0.90, dz + 4)], PINK, PINK_D);
  qpoly([LF(0, dz), LF(1, dz), LF(1, dz + 4), LF(0, dz + 4)], PINK_L, PINK_D);
  qpoly([LF(0, 0), LF(1, 0), LF(1, 2.5), LF(0, 2.5)], PINK_D, null);
  // PLAYER: hammer and sickle on the leaf, laid into its plane
  var emP = function (eu, ez) { return LF(0.5 + eu, dz * 0.5 + ez); };
  g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 2.4;
  g.beginPath();                                   // sickle: a crescent open at the top
  for (lf = 0; lf <= 14; lf++) {
    la = 2.4 + 4.6 * lf / 14;
    lb = emP(0.02 + 0.19 * Math.cos(la), 1.5 + 6.8 * Math.sin(la));
    if (lf) g.lineTo(lb[0], lb[1]); else g.moveTo(lb[0], lb[1]);
  }
  g.stroke();
  la = emP(-0.16, -6.5); lb = emP(0.14, 6.0);      // hammer handle
  g.beginPath(); g.moveTo(la[0], la[1]); g.lineTo(lb[0], lb[1]); g.stroke();
  g.lineWidth = 4.2;
  la = emP(0.06, 7.5); lb = emP(0.21, 2.5);        // hammer head
  g.beginPath(); g.moveTo(la[0], la[1]); g.lineTo(lb[0], lb[1]); g.stroke();
  g.lineCap = 'butt';

  var cq2 = IP(1.30, 0.86, 0); crates(g, cq2[0], cq2[1], 2, '#6d6552');
  var dr2 = IP(1.40, 1.22, 0); drums(g, dr2[0], dr2[1], 2, '#6b4a3a');
}
