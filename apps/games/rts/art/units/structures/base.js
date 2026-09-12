// ─── structures/base ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// Rebuilt against the CLEAN in-game SHP rips of both Construction
// Yards, then polished a second time at 1:1 against them (art pass 8):
// the Soviet yard is a dark machine block and a pale limestone PORTAL
// round a navy body, with a steel bell spire and two red booms over a
// hazard-dashed pad; the Allied yard is a thin-ribbed silver barrel
// hall on a dark deck, a banded mast crane at the left and an orange
// rail bay in front. Both yards are baked as SIX phases (`bph`) so the
// crane works in the scene the way the RA2 idle animation does.
//
// COLOUR POLICY: the ONLY saturated hue on either sprite is `col`.
// Allied - roof flukes, gable chevron, crane cap and base drums, flank
// slots, end panels. Soviet - both booms, the claw, both grilles, the
// hammer-and-sickle, the hydrant. Everything else is limestone,
// gunmetal, brass, amber, rust or khaki.
var HC = shade(col, 1.06), HCL = shade(col, 1.24);
var HCM = shade(col, 0.80), HCD = shade(col, 0.70);
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
if (sov) {
  // ---- Soviet Construction Yard -------------------------------------
  // Reference reading (anim2 rip), left to right: a dark gunmetal
  // machine block carrying the big plated boom, a limestone wedge
  // behind it; a steel bell spire with a brass cap and antennae at
  // centre-back; a pale pink-cream limestone portal (two pillars and a
  // lintel) framing a navy body with a slanted chute plate, the
  // hammer-and-sickle stencilled on the navy wall; a black machine
  // bank on the right carrying a rung lattice under a red grille, a
  // second tilted grille lower down, pipe elbows, a pale spoil mound
  // and a fat red hydrant at the front right. Concrete pad, the west
  // half painted gold, a hazard-dashed hatch square at the front.
  var SLIM = '#d9bfa0', SLIM_L = '#efdcc4', SLIM_D = '#8a6e56'; // pink-cream limestone
  var SSTL = '#2a2d33', SSTL_D = '#0d0f12';        // near-black machinery
  var SGUN = '#575e68', SGUN_L = '#949ba6';        // gunmetal
  var SNAV = '#3b4658', SNAV_D = '#252c38';        // navy body
  var SPLT = '#5b6678', SPLT_L = '#aab4c6';        // blue-grey chute plate
  var SGLD = '#a8823c', SGLD_L = '#e0c27a', SGLD_D = '#4d3a10'; // brass
  var SCON = '#b4b2a6', SCON_D = '#6b6a5e';        // concrete pad
  var SPNT = '#d4c06a', SPNT_D = '#9c8a2c';        // gold deck paint
  var SHAZ = '#e0b028';                            // hazard yellow

  // ---- pad: pale concrete, the western half painted gold ------------
  var padPt = function (pu, pv) {
    return [cx + (pu - pv) * fw * 0.5, baseY - 2 + (pu + pv) * fh * 0.5];
  };
  plot(g, cx, baseY - 2, fw * 1.96, fh * 1.96);
  g.fillStyle = SCON; g.fill(); outline(g, SCON_D);
  g.save(); plot(g, cx, baseY - 2, fw * 1.96, fh * 1.96); g.clip();
  g.fillStyle = SPNT;                               // gold paint: the WEST half
  g.fillRect(cx - fw - 4, baseY - fh - 6, fw + 14, fh * 2 + 12);
  g.fillStyle = shade(SPNT, 0.88);                  // its worn far edge
  g.fillRect(cx - fw - 4, baseY - fh - 6, fw + 14, 9);
  g.strokeStyle = 'rgba(90,80,26,.34)'; g.lineWidth = 1;
  for (var sqA = -0.6; sqA < 0.7; sqA += 0.4) {      // slab seams, both axes
    var qa = padPt(sqA, -1.1), qb = padPt(sqA, 1.1);
    g.beginPath(); g.moveTo(qa[0], qa[1]); g.lineTo(qb[0], qb[1]); g.stroke();
    qa = padPt(-1.1, sqA); qb = padPt(1.1, sqA);
    g.beginPath(); g.moveTo(qa[0], qa[1]); g.lineTo(qb[0], qb[1]); g.stroke();
  }
  // hazard-dashed bay markings round the drop hatch: yellow and black
  var dashRun = function (u0, v0, u1, v1, n) {
    for (var dI = 0; dI < n; dI++) {
      var t0 = (dI + 0.10) / n, t1 = (dI + 0.90) / n;
      var pA = padPt(u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0);
      var pB = padPt(u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1);
      g.strokeStyle = dI % 2 ? SHAZ : '#1b1a12'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(pA[0], pA[1]); g.lineTo(pB[0], pB[1]); g.stroke();
    }
  };
  var hu0 = 0.02, hv0 = 0.30, hu1 = 0.46, hv1 = 0.74;
  var hcP = padPt((hu0 + hu1) / 2, (hv0 + hv1) / 2);
  g.beginPath();                                    // stained hatch floor
  g.moveTo.apply(g, padPt(hu0, hv0));
  var hqA = padPt(hu1, hv0), hqB = padPt(hu1, hv1), hqC = padPt(hu0, hv1);
  g.lineTo(hqA[0], hqA[1]); g.lineTo(hqB[0], hqB[1]); g.lineTo(hqC[0], hqC[1]);
  g.closePath(); g.fillStyle = 'rgba(70,64,40,.40)'; g.fill();
  dashRun(hu0, hv0, hu1, hv0, 6); dashRun(hu1, hv0, hu1, hv1, 6);
  dashRun(hu1, hv1, hu0, hv1, 6); dashRun(hu0, hv1, hu0, hv0, 6);
  g.fillStyle = 'rgba(30,26,14,.34)';               // oil round the hatch
  g.beginPath(); g.ellipse(hcP[0], hcP[1], 12, 6, 0, 0, 6.29); g.fill();
  g.restore();
  outline(g, SCON_D);

  // ---- back left: limestone wedge ------------------------------------
  var lxS = cx - fw * 0.26, lyS = baseY - fh * 0.60;
  var lhwS = fw * 0.20, lhhS = fh * 0.20;
  var lr0 = prism(g, lxS, lyS, lhwS, lhhS, 26, SLIM, SLIM_L, SLIM_D);
  facePatch(g, faceL, lxS, lyS, lhwS, lhhS, 26, 0.16, 0.50, 0.46, 0.64, '#16130c', SLIM_D);
  facePatch(g, faceR, lxS, lyS, lhwS, lhhS, 26, 0.20, 0.60, 0.40, 0.60, '#16130c', SLIM_D);
  streak(g, faceL, lxS, lyS, lhwS, lhhS, 26, 0.70, 0.9, 12, 3);
  cylinder(g, lxS + lhwS * 0.5, lr0 + lhhS * 0.2, 4.5, 9, SGUN, SGUN_L, SSTL_D);

  // ---- centre back: steel bell spire on a dark drum block ------------
  var dxS = cx + fw * 0.02, dyS = baseY - fh * 0.54;
  var dhwS = fw * 0.15, dhhS = fh * 0.15;
  var dr0 = prism(g, dxS, dyS, dhwS, dhhS, 24, '#3a3f47', '#2b3038', SSTL_D);
  facePatch(g, faceL, dxS, dyS, dhwS, dhhS, 24, 0.16, 0.84, 0.16, 0.80, '#191c21', SSTL_D);
  facePatch(g, faceR, dxS, dyS, dhwS, dhhS, 24, 0.16, 0.84, 0.16, 0.80, '#14171b', SSTL_D);
  for (var bfA = 1; bfA < 4; bfA++) {               // machinery ribs on the block
    var bp1 = faceL(dxS, dyS, dhwS, dhhS, 24, 0.06, bfA * 0.24),
        bp2 = faceL(dxS, dyS, dhwS, dhhS, 24, 0.94, bfA * 0.24);
    g.strokeStyle = 'rgba(150,158,170,.34)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(bp1[0], bp1[1]); g.lineTo(bp2[0], bp2[1]); g.stroke();
  }
  var spx = dxS, spb = dr0 + 1;                      // bell base centre
  g.fillStyle = '#2b2a2c';                          // bell foot ring
  g.beginPath(); g.ellipse(spx, spb, 16, 6.2, 0, 0, 6.29); g.fill(); outline(g, SSTL_D);
  g.fillStyle = '#5c5750';                          // the bell: dark steel, flared foot
  g.beginPath();
  g.moveTo(spx - 15, spb);
  g.bezierCurveTo(spx - 13, spb - 9, spx - 7, spb - 12, spx - 7, spb - 22);
  g.lineTo(spx + 7, spb - 22);
  g.bezierCurveTo(spx + 7, spb - 12, spx + 13, spb - 9, spx + 15, spb);
  g.closePath(); g.fill(); outline(g, SSTL_D);
  for (var rbA = -2; rbA <= 2; rbA++) {             // vertical ribs, lit left
    g.strokeStyle = rbA < 0 ? 'rgba(190,196,206,.62)' : 'rgba(0,0,0,.34)';
    g.lineWidth = rbA ? 1.2 : 1.6;
    g.beginPath();
    g.moveTo(spx + rbA * 6.5, spb - 1);
    g.bezierCurveTo(spx + rbA * 5.6, spb - 9, spx + rbA * 3.2, spb - 12, spx + rbA * 3.0, spb - 22);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.22)';                  // shadow side
  g.beginPath();
  g.moveTo(spx + 5, spb - 22); g.lineTo(spx + 7, spb - 22);
  g.bezierCurveTo(spx + 7, spb - 12, spx + 13, spb - 9, spx + 15, spb);
  g.lineTo(spx + 9, spb); g.bezierCurveTo(spx + 8, spb - 9, spx + 5, spb - 12, spx + 5, spb - 22);
  g.closePath(); g.fill();
  g.fillStyle = '#14161a';                          // black collar
  g.fillRect(spx - 8.5, spb - 26, 17, 4.5); outline(g, SSTL_D);
  g.fillStyle = SGUN_L; g.fillRect(spx - 8.5, spb - 26, 5, 1.2);
  g.beginPath();                                    // brass cap, a small onion
  g.moveTo(spx - 6, spb - 26);
  g.bezierCurveTo(spx - 9, spb - 31, spx - 4, spb - 34, spx, spb - 37);
  g.bezierCurveTo(spx + 4, spb - 34, spx + 9, spb - 31, spx + 6, spb - 26);
  g.closePath(); g.fillStyle = SGLD; g.fill(); outline(g, SGLD_D);
  g.fillStyle = SGLD_L;
  g.beginPath();
  g.moveTo(spx - 5, spb - 26);
  g.bezierCurveTo(spx - 7, spb - 31, spx - 3, spb - 34, spx - 0.5, spb - 36);
  g.bezierCurveTo(spx - 2, spb - 33, spx - 2, spb - 29, spx - 1.5, spb - 26);
  g.closePath(); g.fill();
  g.strokeStyle = '#2b2a2c'; g.lineWidth = 1.4;     // two antenna spikes
  g.beginPath(); g.moveTo(spx, spb - 37); g.lineTo(spx, spb - 49); g.stroke();
  g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(spx + 2, spb - 35); g.lineTo(spx + 7, spb - 45); g.stroke();
  g.fillStyle = SGLD_L;
  g.beginPath(); g.arc(spx, spb - 49.5, 1.4, 0, 6.29); g.fill();

  // ---- right: black machine bank, tube bundle, the lattice boom -------
  var mxS = cx + fw * 0.44, myS = baseY - fh * 0.26;
  var mhwS = fw * 0.30, mhhS = fh * 0.30;
  var mr0 = prism(g, mxS, myS, mhwS, mhhS, 28, SSTL, '#33373e', SSTL_D);
  facePatch(g, faceL, mxS, myS, mhwS, mhhS, 28, 0.10, 0.52, 0.10, 0.60, '#111318', SSTL_D);
  for (var pbA = 0; pbA < 4; pbA++)                 // horizontal pipe bundle
    pipeRun(g, faceR, mxS, myS, mhwS, mhhS, 28, 0.10 + pbA * 0.02, 0.24, 0.86, 2.6, SGUN_L);
  g.strokeStyle = SGUN_L; g.lineWidth = 1.2;        // wall ladder
  for (var rgS = 1; rgS < 7; rgS++) {
    var rA = faceL(mxS, myS, mhwS, mhhS, 28, 0.72, rgS / 7),
        rB = faceL(mxS, myS, mhwS, mhhS, 28, 0.86, rgS / 7);
    g.beginPath(); g.moveTo(rA[0], rA[1]); g.lineTo(rB[0], rB[1]); g.stroke();
  }
  for (var tbS = 0; tbS < 4; tbS++)                 // black tube bundle standing on the roof
    cylinder(g, mxS - mhwS * 0.55 + tbS * 5.2, mr0 + mhhS * 0.30 - tbS * 2.2, 2.6, 14, '#15181d', '#3c4148', SSTL_D);
  cylinder(g, mxS + mhwS * 0.34, mr0 + mhhS * 0.12, 6, 13, '#383d45', SGUN_L, SSTL_D);
  cylinder(g, mxS + mhwS * 0.60, mr0 + mhhS * 0.34, 5, 10, '#383d45', SGUN_L, SSTL_D);

  // ---- left: dark gunmetal machine block, the big boom's base ---------
  var bxS = cx - fw * 0.57, byS = baseY + fh * 0.04;
  var bhwS = fw * 0.28, bhhS = fh * 0.28;
  var br0 = prism(g, bxS, byS, bhwS, bhhS, 36, '#33373e', '#464b54', SSTL_D);
  facePatch(g, faceL, bxS, byS, bhwS, bhhS, 36, 0.10, 0.90, 0.72, 0.90, '#5f6670', SSTL_D); // pale plate band
  facePatch(g, faceL, bxS, byS, bhwS, bhhS, 36, 0.14, 0.46, 0.22, 0.58, '#0f1114', SSTL_D); // black hatch slot
  facePatch(g, faceL, bxS, byS, bhwS, bhhS, 36, 0.54, 0.86, 0.22, 0.58, '#1b1e23', SSTL_D);
  facePatch(g, faceR, bxS, byS, bhwS, bhhS, 36, 0.14, 0.86, 0.72, 0.90, '#4a5059', SSTL_D);
  for (var gsA = 1; gsA < 4; gsA++) {               // grille slats on the right face
    var gsP = faceR(bxS, byS, bhwS, bhhS, 36, 0.20, 0.22 + gsA * 0.10),
        gsQ = faceR(bxS, byS, bhwS, bhhS, 36, 0.80, 0.22 + gsA * 0.10);
    g.strokeStyle = 'rgba(150,158,170,.40)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(gsP[0], gsP[1]); g.lineTo(gsQ[0], gsQ[1]); g.stroke();
  }
  streak(g, faceL, bxS, byS, bhwS, bhhS, 36, 0.50, 0.70, 14, 4);
  isoBox(g, bxS + bhwS * 0.34, br0 + bhhS * 0.40, 22, 14, 7, 0, '#2a2e35', SSTL_D);   // winch housing on the roof
  cylinder(g, bxS - bhwS * 0.50, br0 - bhhS * 0.10, 5, 10, SGUN, SGUN_L, SSTL_D);
  // lower step in front of the block, limestone, with a black kit box
  var b2x = bxS + bhwS * 0.10, b2y = byS + bhhS * 1.10;
  var b2r = prism(g, b2x, b2y, bhwS * 0.56, bhhS * 0.56, 12, SLIM, SLIM_L, SLIM_D);
  facePatch(g, faceL, b2x, b2y, bhwS * 0.56, bhhS * 0.56, 12, 0.24, 0.70, 0.24, 0.66, '#16130c', SLIM_D);
  isoBox(g, b2x + 3, b2r + 2, 16, 12, 5, 0, '#2a2519', SSTL_D);

  // ---- the big plated boom (A): base on the block, elbow high, forearm
  // dropping nearly vertically to a claw at the front left. Animated:
  // the forearm swings and the claw hoists.
  var sbSeg = function (a, b, w0, w1, chan) {
    var dxA = b[0] - a[0], dyA = b[1] - a[1], LA = Math.hypot(dxA, dyA) || 1;
    var nxA = -dyA / LA, nyA = dxA / LA;
    g.beginPath();
    g.moveTo(a[0] + nxA * w0, a[1] + nyA * w0);
    g.lineTo(b[0] + nxA * w1, b[1] + nyA * w1);
    g.lineTo(b[0] - nxA * w1, b[1] - nyA * w1);
    g.lineTo(a[0] - nxA * w0, a[1] - nyA * w0);
    g.closePath();
    g.fillStyle = HC; g.fill(); outline(g, HCD);
    if (chan) {                                     // black inner channel
      g.strokeStyle = '#0f1114'; g.lineWidth = Math.min(w0, w1) * 0.62;
      g.beginPath();
      g.moveTo(a[0] + dxA * 0.10, a[1] + dyA * 0.10);
      g.lineTo(a[0] + dxA * 0.92, a[1] + dyA * 0.92); g.stroke();
      for (var hzA = 0; hzA < 5; hzA++) {           // yellow hazard dashes on the top edge
        var ht0 = 0.12 + hzA * 0.17, ht1 = ht0 + 0.08;
        var hw2 = w0 + (w1 - w0) * ht0;
        g.strokeStyle = SHAZ; g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(a[0] + dxA * ht0 + nxA * hw2 * 0.78, a[1] + dyA * ht0 + nyA * hw2 * 0.78);
        g.lineTo(a[0] + dxA * ht1 + nxA * hw2 * 0.78, a[1] + dyA * ht1 + nyA * hw2 * 0.78);
        g.stroke();
      }
    }
    g.strokeStyle = HCL; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(a[0] + nxA * w0 * 0.92, a[1] + nyA * w0 * 0.92);
    g.lineTo(b[0] + nxA * w1 * 0.92, b[1] + nyA * w1 * 0.92); g.stroke();
    g.strokeStyle = HCM; g.lineWidth = 2.0;
    g.beginPath();
    g.moveTo(a[0] - nxA * w0 * 0.70, a[1] - nyA * w0 * 0.70);
    g.lineTo(b[0] - nxA * w1 * 0.70, b[1] - nyA * w1 * 0.70); g.stroke();
  };
  var sbPin = function (p, r) {
    g.fillStyle = '#22262c';
    g.beginPath(); g.arc(p[0], p[1], r, 0, 6.29); g.fill(); outline(g, SSTL_D);
    g.fillStyle = '#787f89';
    g.beginPath(); g.arc(p[0] - 0.7, p[1] - 0.7, r * 0.40, 0, 6.29); g.fill();
  };
  var sbClaw = function (wx, wy, sc) {              // two-tine grab, in `col`
    g.fillStyle = '#23272e';
    g.beginPath(); g.roundRect(wx - 9 * sc, wy - 1, 18 * sc, 6.5 * sc, 2.2); g.fill();
    outline(g, SSTL_D);
    g.fillStyle = '#6c747e'; g.fillRect(wx - 8 * sc, wy, 16 * sc, 1.6);
    g.strokeStyle = HCD; g.lineWidth = 5.4 * sc; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(wx - 6.5 * sc, wy + 6 * sc);
    g.quadraticCurveTo(wx - 14 * sc, wy + 13 * sc, wx - 5 * sc, wy + 20 * sc); g.stroke();
    g.beginPath();
    g.moveTo(wx + 6.5 * sc, wy + 6 * sc);
    g.quadraticCurveTo(wx + 13 * sc, wy + 13 * sc, wx + 4.5 * sc, wy + 20 * sc); g.stroke();
    g.strokeStyle = HC; g.lineWidth = 3.6 * sc;
    g.beginPath();
    g.moveTo(wx - 6.5 * sc, wy + 6 * sc);
    g.quadraticCurveTo(wx - 14 * sc, wy + 13 * sc, wx - 5 * sc, wy + 20 * sc); g.stroke();
    g.beginPath();
    g.moveTo(wx + 6.5 * sc, wy + 6 * sc);
    g.quadraticCurveTo(wx + 13 * sc, wy + 13 * sc, wx + 4.5 * sc, wy + 20 * sc); g.stroke();
    g.strokeStyle = HCL; g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(wx - 8 * sc, wy + 6 * sc);
    g.quadraticCurveTo(wx - 15.4 * sc, wy + 13 * sc, wx - 6.4 * sc, wy + 19.4 * sc); g.stroke();
    g.lineCap = 'butt';
  };
  var aP0 = [bxS + 2, br0 - 2];                      // boom foot on the block roof
  var aP1 = [cx - fw * 0.40, baseY - fh * 1.32];     // high elbow, up and RIGHT
  var aP3 = [cx - fw * 0.28 + anS * 5, baseY - fh * 0.20 - (anC + 1) * 5];  // wrist
  var aP2 = [aP1[0] + (aP3[0] - aP1[0]) * 0.46 + 5, aP1[1] + (aP3[1] - aP1[1]) * 0.46];
  g.fillStyle = 'rgba(0,0,0,.28)';                  // claw shadow on the pad
  g.beginPath(); g.ellipse(aP3[0] + 3, baseY + fh * 0.30, 11, 4.6, 0, 0, 6.29); g.fill();
  isoBox(g, aP0[0], aP0[1] + 4, 16, 12, 6, 0, HCM, HCD);           // `col` slew base plate
  sbSeg(aP0, aP1, 8.0, 6.6, true);
  sbSeg(aP1, aP2, 5.2, 4.6, false);
  sbSeg(aP2, aP3, 4.6, 3.8, false);
  var aTip = [aP1[0] + 12, aP1[1] - 9];              // stub past the elbow
  sbSeg(aP1, aTip, 5.0, 3.0, false);
  g.strokeStyle = '#8f96a2'; g.lineWidth = 1;        // hoist cable, elbow stub to wrist
  g.beginPath(); g.moveTo(aTip[0], aTip[1]); g.lineTo(aP3[0] + 2, aP3[1]); g.stroke();
  sbPin(aP1, 5.0); sbPin(aP2, 4.0); sbPin(aTip, 2.8);
  sbClaw(aP3[0], aP3[1], 1.0);

  // ---- centre right: the limestone portal round the navy body ---------
  var pxS = cx + fw * 0.16, pyS = baseY + fh * 0.16;
  var phwS = fw * 0.25, phhS = fh * 0.25, plft = 40;
  var pr0 = prism(g, pxS, pyS, phwS, phhS, plft, SNAV, SNAV_D, SSTL_D);
  for (var nvA = 1; nvA < 4; nvA++) {               // panel seams on the navy wall
    var nvP = faceR(pxS, pyS, phwS, phhS, plft, 0.05, nvA * 0.24),
        nvQ = faceR(pxS, pyS, phwS, phhS, plft, 0.95, nvA * 0.24);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(nvP[0], nvP[1]); g.lineTo(nvQ[0], nvQ[1]); g.stroke();
  }
  // slanted chute plate on the roof, blue-grey with a lit lip
  var chA = faceL(pxS, pyS, phwS, phhS, plft + 6, 0.10, 1), chB = faceR(pxS, pyS, phwS, phhS, plft + 16, 0.10, 1);
  var chC = faceR(pxS, pyS, phwS, phhS, plft + 16, 0.90, 1), chD = faceL(pxS, pyS, phwS, phhS, plft + 6, 0.90, 1);
  g.beginPath();
  g.moveTo(chA[0], chA[1]); g.lineTo(chB[0], chB[1]); g.lineTo(chC[0], chC[1]); g.lineTo(chD[0], chD[1]);
  g.closePath(); g.fillStyle = SPLT; g.fill(); outline(g, SSTL_D);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2;   // scoured streaks down the plate
  for (var scA = 1; scA < 5; scA++) {
    var scT = scA / 5;
    g.beginPath();
    g.moveTo(chA[0] + (chB[0] - chA[0]) * scT, chA[1] + (chB[1] - chA[1]) * scT);
    g.lineTo(chD[0] + (chC[0] - chD[0]) * scT, chD[1] + (chC[1] - chD[1]) * scT); g.stroke();
  }
  g.strokeStyle = SPLT_L; g.lineWidth = 2.2;        // lit near lip
  g.beginPath(); g.moveTo(chA[0], chA[1]); g.lineTo(chD[0], chD[1]); g.stroke();
  g.fillStyle = '#15181d';                          // the dark chute mouth
  g.beginPath();
  g.moveTo(chA[0] + (chB[0] - chA[0]) * 0.25, chA[1] + (chB[1] - chA[1]) * 0.25);
  g.lineTo(chA[0] + (chB[0] - chA[0]) * 0.75, chA[1] + (chB[1] - chA[1]) * 0.75);
  g.lineTo(chD[0] + (chC[0] - chD[0]) * 0.75, chD[1] + (chC[1] - chD[1]) * 0.75);
  g.lineTo(chD[0] + (chC[0] - chD[0]) * 0.25, chD[1] + (chC[1] - chD[1]) * 0.25);
  g.closePath(); g.fill();
  // two limestone pillars at the body's left and front corners, lintel across
  var plA = faceL(pxS, pyS, phwS, phhS, 0, 0.0, 0), plB = faceL(pxS, pyS, phwS, phhS, 0, 1.0, 0);
  var pillar = function (px2, py2, hgt) {
    isoBox(g, px2, py2, 7, 6, hgt, 0, SLIM, SLIM_D);
    g.strokeStyle = 'rgba(110,86,64,.34)'; g.lineWidth = 1;   // coursing
    for (var pcA = 1; pcA < hgt / 7; pcA++) {
      g.beginPath(); g.moveTo(px2 - 5, py2 - pcA * 7); g.lineTo(px2 + 5, py2 - pcA * 7 + 2); g.stroke();
    }
  };
  pillar(plA[0] + 3, plA[1] + 2, plft + 8);
  pillar(plB[0] - 1, plB[1] + 3, plft + 14);
  pillar(faceR(pxS, pyS, phwS, phhS, 0, 0.0, 0)[0] - 3, faceR(pxS, pyS, phwS, phhS, 0, 0.0, 0)[1] + 2, plft + 4);
  g.beginPath();                                    // lintel: left pillar top to front pillar top
  g.moveTo(plA[0] - 3, plA[1] - plft - 6); g.lineTo(plB[0] + 5, plB[1] - plft - 11);
  g.lineTo(plB[0] + 5, plB[1] - plft - 4); g.lineTo(plA[0] - 3, plA[1] - plft + 1);
  g.closePath(); g.fillStyle = SLIM; g.fill(); outline(g, SLIM_D);
  g.fillStyle = SLIM_L; g.fillRect(plA[0] - 3, plA[1] - plft - 6, 2, 7);
  g.beginPath();                                    // lintel: front pillar to right pillar
  var prR = faceR(pxS, pyS, phwS, phhS, 0, 0.0, 0);
  g.moveTo(plB[0] + 5, plB[1] - plft - 11); g.lineTo(prR[0] + 4, prR[1] - plft - 2);
  g.lineTo(prR[0] + 4, prR[1] - plft + 5); g.lineTo(plB[0] + 5, plB[1] - plft - 4);
  g.closePath(); g.fillStyle = shade(SLIM, 0.80); g.fill(); outline(g, SLIM_D);
  // the hammer-and-sickle stencilled on the navy wall between the pillars
  var emO = faceL(pxS, pyS, phwS, phhS, plft, 0.46, 0.40);
  var emP = function (ex, ey) {                     // emblem coords skewed into the wall plane
    return [emO[0] + ex * 0.9, emO[1] + ex * 0.9 * (phhS / phwS) + ey * 0.9];
  };
  var emL = function (x0, y0, x1, y1) {
    var a = emP(x0, y0), b2 = emP(x1, y1);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.stroke();
  };
  var emB = function (x0, y0, c1x, c1y, c2x, c2y, x1, y1) {
    var a = emP(x0, y0), c1 = emP(c1x, c1y), c2 = emP(c2x, c2y), b2 = emP(x1, y1);
    g.beginPath(); g.moveTo(a[0], a[1]);
    g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b2[0], b2[1]); g.stroke();
  };
  g.strokeStyle = HC; g.lineWidth = 2.6; g.lineCap = 'round';
  emB(-7, -6, 4, -9, 8, 3, -1, 7);                  // sickle blade
  emL(-7, -6, -5, 8);                               // sickle haft
  emL(6, -7, -1, 8);                                // hammer shaft
  g.lineWidth = 3.2;
  emL(1, -9, 9, -5);                                // hammer head
  g.strokeStyle = HCL; g.lineWidth = 1;
  emB(-7, -7.2, 4, -10.2, 8, 1.8, -1, 5.8);
  g.lineCap = 'butt';

  // ---- boom B: rung lattice off the machine bank, red grille on top --
  var bP0 = [mxS - mhwS * 0.20, mr0 - 4];
  var bP1 = [cx + fw * 0.32, baseY - fh * 1.22];
  g.strokeStyle = HC; g.lineWidth = 3.0; g.lineCap = 'round';
  var bnx = -(bP1[1] - bP0[1]), bny = bP1[0] - bP0[0];
  var bnL = Math.hypot(bnx, bny) || 1; bnx /= bnL; bny /= bnL;
  for (var ldA = -1; ldA <= 1; ldA += 2) {          // the two chords
    g.beginPath();
    g.moveTo(bP0[0] + bnx * 5.4 * ldA, bP0[1] + bny * 5.4 * ldA);
    g.lineTo(bP1[0] + bnx * 4.2 * ldA, bP1[1] + bny * 4.2 * ldA); g.stroke();
  }
  g.lineWidth = 2.2;
  for (var rnA = 1; rnA < 8; rnA++) {               // rungs
    var rt = rnA / 8;
    var rmx = bP0[0] + (bP1[0] - bP0[0]) * rt, rmy = bP0[1] + (bP1[1] - bP0[1]) * rt;
    var rw = 5.4 + (4.2 - 5.4) * rt;
    g.beginPath();
    g.moveTo(rmx - bnx * rw, rmy - bny * rw);
    g.lineTo(rmx + bnx * rw, rmy + bny * rw); g.stroke();
  }
  g.strokeStyle = HCL; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(bP0[0] - bnx * 6.4, bP0[1] - bny * 6.4);
  g.lineTo(bP1[0] - bnx * 5.2, bP1[1] - bny * 5.2); g.stroke();
  g.lineCap = 'butt';
  sbPin(bP0, 4.4);
  // red slatted grilles: one capping the lattice, one tilted lower right
  var grille = function (gx, gy, gw, gh, sk) {
    g.fillStyle = HC;
    g.beginPath();
    g.moveTo(gx - gw, gy - gh + sk); g.lineTo(gx + gw, gy - gh - sk);
    g.lineTo(gx + gw, gy + gh - sk); g.lineTo(gx - gw, gy + gh + sk);
    g.closePath(); g.fill(); outline(g, HCD);
    g.strokeStyle = '#15181c'; g.lineWidth = 2.0;   // dark slats
    for (var lsA = 1; lsA < 6; lsA++) {
      var lst = lsA / 6;
      g.beginPath();
      g.moveTo(gx - gw + 2, gy - gh + sk + gh * 2 * lst);
      g.lineTo(gx + gw - 2, gy - gh - sk + gh * 2 * lst); g.stroke();
    }
    g.strokeStyle = HCD; g.lineWidth = 1.6;         // frame
    g.beginPath();
    g.moveTo(gx - gw, gy - gh + sk); g.lineTo(gx + gw, gy - gh - sk);
    g.lineTo(gx + gw, gy + gh - sk); g.lineTo(gx - gw, gy + gh + sk);
    g.closePath(); g.stroke();
    g.strokeStyle = HCL; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(gx - gw, gy - gh + sk); g.lineTo(gx + gw, gy - gh - sk); g.stroke();
  };
  grille(bP1[0] + 3, bP1[1] + 2, 8, 11, 3);
  grille(cx + fw * 0.70, baseY - fh * 0.68, 8, 10, -4);
  // ---- roof cables: thin gunmetal stays tying spire/boomA/boomB into one roofline silhouette
  g.strokeStyle = SGUN; g.lineWidth = 4.5; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + fw * 0.086, baseY - fh * 0.947); g.lineTo(cx + fw * 0.32, baseY - fh * 0.947); g.stroke();
  g.beginPath();
  g.moveTo(cx + fw * 0.398, baseY - fh * 0.92); g.lineTo(cx + fw * 0.492, baseY - fh * 0.893); g.stroke();
  g.strokeStyle = HCM; g.lineWidth = 2.4;           // short red arm hooking off the lower grille
  g.beginPath();
  g.moveTo(cx + fw * 0.62, baseY - fh * 0.48); g.lineTo(cx + fw * 0.54, baseY - fh * 0.30);
  g.lineTo(cx + fw * 0.60, baseY - fh * 0.22); g.stroke();

  // ---- right front: pipe elbows, pale spoil mound, the hydrant --------
  g.fillStyle = '#a89c86';                          // pale spoil mound
  g.beginPath();
  g.moveTo(cx + fw * 0.60, baseY + fh * 0.30);
  g.bezierCurveTo(cx + fw * 0.64, baseY - fh * 0.12,
                  cx + fw * 0.84, baseY - fh * 0.16, cx + fw * 0.90, baseY + fh * 0.16);
  g.lineTo(cx + fw * 0.86, baseY + fh * 0.36);
  g.closePath(); g.fill(); outline(g, '#5b4c30');
  g.fillStyle = 'rgba(236,222,196,.40)';
  g.beginPath();
  g.moveTo(cx + fw * 0.66, baseY + fh * 0.22);
  g.bezierCurveTo(cx + fw * 0.70, baseY - fh * 0.06,
                  cx + fw * 0.80, baseY - fh * 0.08, cx + fw * 0.82, baseY + fh * 0.10);
  g.closePath(); g.fill();
  g.strokeStyle = '#3f444a'; g.lineWidth = 5.6;     // grey pipe elbow out of the bank
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx + fw * 0.40, baseY - fh * 0.02);
  g.bezierCurveTo(cx + fw * 0.60, baseY + fh * 0.10,
                  cx + fw * 0.52, baseY + fh * 0.42, cx + fw * 0.70, baseY + fh * 0.42);
  g.stroke();
  g.strokeStyle = '#9aa1a9'; g.lineWidth = 3.6;
  g.beginPath();
  g.moveTo(cx + fw * 0.40, baseY - fh * 0.02);
  g.bezierCurveTo(cx + fw * 0.60, baseY + fh * 0.10,
                  cx + fw * 0.52, baseY + fh * 0.42, cx + fw * 0.70, baseY + fh * 0.42);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.40)'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx + fw * 0.395, baseY - fh * 0.04);
  g.bezierCurveTo(cx + fw * 0.595, baseY + fh * 0.08,
                  cx + fw * 0.515, baseY + fh * 0.40, cx + fw * 0.695, baseY + fh * 0.40);
  g.stroke();
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  cylinder(g, cx + fw * 0.80, baseY + fh * 0.44, 4.0, 14, HC, HCM, HCD);    // fat hydrant
  g.fillStyle = HCL; g.fillRect(cx + fw * 0.80 - 3.4, baseY + fh * 0.44 - 13, 1.6, 12);
  g.fillStyle = '#23272e';
  g.fillRect(cx + fw * 0.80 - 5.8, baseY + fh * 0.44 - 10, 11.6, 2.4);
  g.fillStyle = HCM;                                // domed cap
  g.beginPath(); g.ellipse(cx + fw * 0.80, baseY + fh * 0.44 - 15, 3.6, 2.4, 0, 0, 6.29); g.fill();
  outline(g, HCD);

  // ---- front clutter: a chain off the block, drums by the hatch -------
  g.strokeStyle = '#4a4f57'; g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(bxS + bhwS * 0.9, byS + bhhS * 0.3);
  g.quadraticCurveTo(cx - fw * 0.20, baseY + fh * 0.62, cx - fw * 0.06, baseY + fh * 0.78); g.stroke();
  drums(g, cx + fw * 0.30, baseY + fh * 0.76, 2, '#5c5340');
  isoBox(g, cx - fw * 0.30, baseY + fh * 0.70, 14, 10, 5, 0, '#4a4436', '#241f16');

} else {
  // ---- Allied Construction Yard -------------------------------------
  // Reference reading: a DARK warm-grey deck, stepped at the right and
  // notched at the left front, with an orange double-rail bay in front
  // of the hall. A low silver barrel hall whose skin is dozens of THIN
  // bright ribs, its near flank falling to near-black, two dark hoops,
  // five `col` slots along the near upper flank; its near gable a thick
  // SILVER arch round a navy face with a white louvre shutter left of
  // centre and a badge above right. Behind the arch two broad curved
  // flukes lean apart round a dark chimney, two spoked fans sunk in the
  // crown. At the left, level with the pad centre, a banded mast crane
  // - `col` base drum, amber ring, glass waist, amber body, silver ring,
  // `col` cap, glass dome - throwing an amber box jib out to a claw on
  // a cable. Both the jib slew and the hoist are animated.
  var DKB = '#4b4c45', DKB_D = '#23241f';   // warm dark deck
  var HULL = '#3f444c', HULL_D = '#23262c'; // hall walls
  var SIL = '#c9cdd4', SIL_D = '#5d6068';   // silver skin
  var SILH = '#f0f2f6';                     // rib highlight
  var GUN = '#5b616a', GUN_D = '#2b2f35';   // machinery grey
  var AYEL = '#d8a23c', AYEL_L = '#f4cf80', AYEL_D = '#6a4a12'; // amber
  var AWHT = '#eef0f4', ARAIL = '#d08236';  // shutter white, orange rail

  // ---- deck: mottled dark platform ------------------------------------
  plot(g, cx, baseY - 3, fw * 1.96, fh * 1.96);
  g.fillStyle = DKB; g.fill(); outline(g, DKB_D);
  g.save(); plot(g, cx, baseY - 3, fw * 1.96, fh * 1.96); g.clip();
  srand(917);
  for (var mtA = 0; mtA < 22; mtA++) {              // worn plate mottling
    var mta = rnd() * 6.283, mtr = Math.sqrt(rnd());
    g.fillStyle = rnd() < 0.5 ? shade(DKB, 0.80) : shade(DKB, 1.18);
    g.globalAlpha = 0.34;
    g.beginPath();
    g.ellipse(cx + Math.cos(mta) * mtr * fw * 0.9,
              baseY - 3 + Math.sin(mta) * mtr * fh * 0.9,
              5 + rnd() * 9, 3 + rnd() * 4, 0, 0, 6.29);
    g.fill();
  }
  g.globalAlpha = 1;
  // orange double-rail bay in front of the hall: outer and inner
  // rectangles, a cross bar, a dark stain, ball bollards at the corners
  var rq = [[cx - 31, baseY + 6], [cx + 18, baseY + 12], [cx + 6, baseY + 28], [cx - 40, baseY + 22]];
  var rqIn = function (k, t) {                      // point k of the rectangle shrunk by t
    var mx = (rq[0][0] + rq[2][0]) / 2, my = (rq[0][1] + rq[2][1]) / 2;
    return [mx + (rq[k][0] - mx) * (1 - t), my + (rq[k][1] - my) * (1 - t)];
  };
  g.beginPath(); g.moveTo(rq[0][0], rq[0][1]);
  for (var rqA = 1; rqA < 4; rqA++) g.lineTo(rq[rqA][0], rq[rqA][1]);
  g.closePath(); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
  var rqLine = function (pts, wd) {
    g.strokeStyle = shade(ARAIL, 0.55); g.lineWidth = wd + 1.4;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 1);
    for (var rA = 1; rA < pts.length; rA++) g.lineTo(pts[rA][0], pts[rA][1] + 1);
    g.closePath(); g.stroke();
    g.strokeStyle = ARAIL; g.lineWidth = wd;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (rA = 1; rA < pts.length; rA++) g.lineTo(pts[rA][0], pts[rA][1]);
    g.closePath(); g.stroke();
  };
  rqLine(rq, 1.6);
  rqLine([rqIn(0, 0.22), rqIn(1, 0.22), rqIn(2, 0.22), rqIn(3, 0.22)], 1.2);
  g.strokeStyle = ARAIL; g.lineWidth = 1.2;         // cross bar
  g.beginPath();
  g.moveTo((rq[0][0] + rq[3][0]) / 2, (rq[0][1] + rq[3][1]) / 2);
  g.lineTo((rq[1][0] + rq[2][0]) / 2, (rq[1][1] + rq[2][1]) / 2); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.40)';                  // oil in the bay
  g.beginPath(); g.ellipse(cx - 12, baseY + 17, 11, 4.4, 0, 0, 6.29); g.fill();
  for (var bbA = 0; bbA < 4; bbA++) {               // ball bollards
    g.fillStyle = '#2a2d29';
    g.beginPath(); g.ellipse(rq[bbA][0], rq[bbA][1] + 1, 2.6, 1.4, 0, 0, 6.29); g.fill();
    g.fillStyle = '#c6cbc8';
    g.beginPath(); g.arc(rq[bbA][0], rq[bbA][1] - 1.4, 2.2, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(rq[bbA][0] - 0.7, rq[bbA][1] - 2.1, 0.8, 0, 6.29); g.fill();
  }
  g.restore();
  outline(g, DKB_D);
  // the sprite's deck is not a clean diamond: the right corner steps in
  // to a short vertical edge. Erase the tip (shadow included) and
  // re-edge it.
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(cx + fw - 16, baseY - 12); g.lineTo(cx + fw + 8, baseY - 12);
  g.lineTo(cx + fw + 8, baseY + 18); g.lineTo(cx + fw - 16, baseY + 18); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = 'rgba(0,0,0,.34)';                  // contact shadow of the stepped edge
  g.beginPath();
  g.moveTo(cx + fw - 16, baseY - 6); g.lineTo(cx + fw - 13, baseY - 2);
  g.lineTo(cx + fw - 13, baseY + 12); g.lineTo(cx + fw - 16, baseY + 8); g.closePath(); g.fill();
  g.strokeStyle = DKB_D; g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(cx + fw - 16, baseY - 8.5); g.lineTo(cx + fw - 16, baseY + 8.5); g.stroke();

  // ---- main hall: low dark block under the silver barrel -------------
  var abx = cx + fw * 0.24, aby = baseY - fh * 0.10;
  var ahw = fw * 0.64, ahh = fh * 0.64;
  var ar0 = prism(g, abx, aby, ahw, ahh, 22, HULL, HULL_D, DKB_D);
  streak(g, faceL, abx, aby, ahw, ahh, 22, 0.4, 0.9, 11, 5);
  for (var grA = 0; grA < 3; grA++) {               // louvred wall grilles
    var gt0 = 0.16 + grA * 0.26;
    facePatch(g, faceL, abx, aby, ahw, ahh, 22, gt0, gt0 + 0.15, 0.30, 0.66,
              '#1e2128', DKB_D);
    for (var grB = 1; grB < 4; grB++) {
      var ga = faceL(abx, aby, ahw, ahh, 22, gt0 + 0.01, 0.30 + grB * 0.09),
          gb = faceL(abx, aby, ahw, ahh, 22, gt0 + 0.14, 0.30 + grB * 0.09);
      g.strokeStyle = 'rgba(150,160,176,.42)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(ga[0], ga[1]); g.lineTo(gb[0], gb[1]); g.stroke();
    }
  }
  pipeRun(g, faceL, abx, aby, ahw, ahh, 22, 0.94, 0.04, 0.80, 3.2, '#7d848e');
  for (var hpB = 0; hpB < 2; hpB++) {               // two `col` panels beside the arch foot
    facePatch(g, faceR, abx, aby, ahw, ahh, 22, 0.70 + hpB * 0.13, 0.79 + hpB * 0.13, 0.22, 0.86, HC, HCD);
    facePatch(g, faceR, abx, aby, ahw, ahh, 22, 0.70 + hpB * 0.13, 0.79 + hpB * 0.13, 0.80, 0.86, HCL, null);
  }

  // grey cowl the flukes, chimney and fans stand on
  var cwx = abx - ahw * 0.44, cwy = ar0 + ahh * 0.12;
  isoBox(g, cwx, cwy, 42, 32, 10, 0, GUN, DKB_D);

  // ---- the barrel: many THIN bright ribs, gable to the FRONT-LEFT ----
  var vx = abx + ahw * 0.14, vy = ar0 + ahh * 0.10;
  var vhw = ahw * 0.86, vhh = ahh * 0.86, vri = 30;
  var vPt = function (sv, wv, zv) {                 // sv along axis, wv across
    return [vx - sv * vhw * 0.5 + wv * vhw * 0.5,
            vy + sv * vhh * 0.5 + wv * vhh * 0.5 - zv];
  };
  var vQuad = function (s0, s1, u0, u1, sgn, fill, edge) {   // patch on the skin
    var w0 = sgn * Math.cos(u0 * Math.PI / 2), w1 = sgn * Math.cos(u1 * Math.PI / 2);
    var z0 = vri * Math.sin(u0 * Math.PI / 2), z1 = vri * Math.sin(u1 * Math.PI / 2);
    var pa = vPt(s0, w0, z0), pb = vPt(s1, w0, z0), pc = vPt(s1, w1, z1), pd = vPt(s0, w1, z1);
    g.beginPath();
    g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]);
    g.lineTo(pc[0], pc[1]); g.lineTo(pd[0], pd[1]);
    g.closePath(); g.fillStyle = fill; g.fill(); if (edge) outline(g, edge);
  };
  for (var vbA = 0; vbA < 9; vbA++)                 // far slope, in shade
    vQuad(-1, 1, vbA / 9, (vbA + 1) / 9, -1, shade(SIL, 0.56 + 0.26 * (vbA / 9)));
  for (vbA = 8; vbA >= 0; vbA--)                    // near slope: near-black foot, lit to the crown
    vQuad(-1, 1, vbA / 9, (vbA + 1) / 9, 1, shade(SIL, 0.46 + 0.68 * (vbA / 9)));
  var NRIB = 19;
  for (var vrA = 0; vrA <= NRIB; vrA++) {           // fine ribs, hard highlights
    var vrt = -1 + 2 * vrA / NRIB;
    var qA = vPt(vrt, 1, 0), qB = vPt(vrt, 0, vri), qC = vPt(vrt, -1, 0);
    g.strokeStyle = 'rgba(40,46,58,.26)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(qA[0], qA[1]);
    g.quadraticCurveTo(qB[0], qB[1] - 1.6, qC[0], qC[1]); g.stroke();
    g.strokeStyle = SILH; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(qA[0] - 1.4, qA[1] - 0.4);
    g.quadraticCurveTo(qB[0] - 1.4, qB[1] - 2.0, qC[0] - 1.4, qC[1] - 0.4); g.stroke();
  }
  // two dark hoop bands round the tube
  for (var hpA = 0; hpA < 2; hpA++) {
    var hpS = hpA ? -0.52 : 0.60;
    vQuad(hpS - 0.05, hpS + 0.05, 0, 1, 1, 'rgba(30,34,44,.62)');
    vQuad(hpS - 0.05, hpS + 0.05, 0, 1, -1, 'rgba(30,34,44,.62)');
    vQuad(hpS - 0.05, hpS - 0.03, 0, 1, 1, 'rgba(240,244,250,.35)');
  }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.2;   // crown gloss
  var cgA = vPt(-1, 0.10, vri), cgB = vPt(1, 0.10, vri);
  g.beginPath(); g.moveTo(cgA[0], cgA[1]); g.lineTo(cgB[0], cgB[1]); g.stroke();
  // five `col` slots along the near upper flank, right of the arch
  for (var slB = 0; slB < 5; slB++) {
    var slS = 0.42 - slB * 0.26;
    vQuad(slS - 0.07, slS + 0.07, 0.36, 0.70, 1, HC, HCD);
    vQuad(slS - 0.07, slS - 0.04, 0.36, 0.70, 1, HCL);
  }
  // far end: a shorter second drum closing the hall to the right
  var fdA = vPt(-1, 1, 0), fdB = vPt(-1, -1, 0), fdC = vPt(-1, 0, vri);
  g.beginPath();
  g.moveTo(fdA[0], fdA[1]);
  g.quadraticCurveTo(fdA[0] + (fdC[0] - fdA[0]) * 0.35, fdC[1] + 2, fdC[0], fdC[1]);
  g.quadraticCurveTo(fdB[0] + (fdC[0] - fdB[0]) * 0.35, fdC[1] + 2, fdB[0], fdB[1]);
  g.closePath(); g.fillStyle = shade(SIL, 0.72); g.fill(); outline(g, SIL_D);
  // two `col` panels low on the far end
  for (var fpA = 0; fpA < 2; fpA++) {
    var fpP = vPt(-1, 0.55 + fpA * 0.30, 3);
    g.fillStyle = HC;
    g.beginPath();
    g.moveTo(fpP[0] - 2.5, fpP[1]); g.lineTo(fpP[0] + 2.5, fpP[1] + 1.4);
    g.lineTo(fpP[0] + 2.5, fpP[1] - 8); g.lineTo(fpP[0] - 2.5, fpP[1] - 9.4);
    g.closePath(); g.fill(); outline(g, HCD);
  }

  // ---- two broad curved flukes in `col` leaning apart, a chimney between
  var fluke = function (bx0, by0, dir, hgt, wid) {
    g.fillStyle = '#1c2028';
    g.beginPath(); g.ellipse(bx0 + 2, by0 + 1, 7, 3.2, 0, 0, 6.29); g.fill();
    g.save(); g.translate(bx0, by0); g.scale(dir, 1);   // one blade, mirrored for the right fluke
    var bx = 0, by = 0; dir = 1;
    var tipx = bx - wid * 0.9;
    g.beginPath();                                  // the blade
    g.moveTo(bx - 5, by);
    g.quadraticCurveTo(bx - 5 - wid * 0.9, by - hgt * 0.42, tipx - 6, by - hgt);
    g.lineTo(tipx + 7, by - hgt + 4);
    g.quadraticCurveTo(bx + 6 - wid * 0.55, by - hgt * 0.40, bx + 6, by);
    g.closePath();
    g.fillStyle = HC; g.fill(); outline(g, HCD);
    g.fillStyle = HCL;                              // lit inner face (light from upper left)
    g.beginPath();
    g.moveTo(bx - 4, by - 1);
    g.quadraticCurveTo(bx - 4 - wid * 0.9, by - hgt * 0.42, tipx - 5, by - hgt + 1);
    g.lineTo(tipx - 1, by - hgt + 2.4);
    g.quadraticCurveTo(bx - 1 - wid * 0.72, by - hgt * 0.42, bx - 0.5, by - 1);
    g.closePath(); g.fill();
    g.fillStyle = HCM;                              // shaded trailing face
    g.beginPath();
    g.moveTo(tipx + 7, by - hgt + 4);
    g.quadraticCurveTo(bx + 6 - wid * 0.55, by - hgt * 0.40, bx + 6, by);
    g.lineTo(bx + 3, by);
    g.quadraticCurveTo(bx + 3 - wid * 0.62, by - hgt * 0.42, tipx + 4, by - hgt + 3.4);
    g.closePath(); g.fill();
    g.restore();
  };
  cylinder(g, cwx + 4, cwy - 7, 5.4, 36, '#3d434c', '#6a717c', DKB_D);   // dark chimney between the flukes
  g.fillStyle = '#0e1116';
  g.beginPath(); g.ellipse(cwx + 4, cwy - 43, 3.9, 1.7, 0, 0, 6.29); g.fill();
  cylinder(g, cwx + 14, cwy - 14, 3.4, 12, '#3d434c', '#6a717c', DKB_D);   // stubby one behind
  g.fillStyle = '#0e1116';
  g.beginPath(); g.ellipse(cwx + 14, cwy - 26, 2.4, 1.1, 0, 0, 6.29); g.fill();
  fluke(cwx - 13, cwy - 2, -1, 48, 22);
  fluke(cwx + 21, cwy - 10, 1, 42, 24);

  // ---- two spoked fans sunk into the crown ---------------------------
  for (var tbA = 0; tbA < 2; tbA++) {
    var tfP = vPt(0.62 - tbA * 0.44, 0.20, vri * 0.94);
    var tfx = tfP[0], tfy = tfP[1];
    g.fillStyle = '#2b3038';                        // recessed housing
    g.beginPath(); g.ellipse(tfx, tfy + 1, 11.4, 6.1, 0, 0, 6.29); g.fill();
    g.fillStyle = '#868d9a';
    g.beginPath(); g.ellipse(tfx, tfy, 10.6, 5.7, 0, 0, 6.29); g.fill();
    outline(g, DKB_D);
    g.fillStyle = '#14181f';
    g.beginPath(); g.ellipse(tfx, tfy - 0.7, 8.4, 4.4, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#b6bdc9'; g.lineWidth = 1.5;   // seven blades
    for (var blA = 0; blA < 7; blA++) {
      var anA = blA * 6.283 / 7 + 0.32 + anP * 0.5;   // fans turn with the phase
      g.beginPath(); g.moveTo(tfx, tfy - 0.7);
      g.lineTo(tfx + Math.cos(anA) * 7.9, tfy - 0.7 + Math.sin(anA) * 4.1); g.stroke();
    }
    g.fillStyle = '#d4d9e2';
    g.beginPath(); g.ellipse(tfx, tfy - 1, 2.7, 1.6, 0, 0, 6.29); g.fill();
    outline(g, DKB_D);
  }

  // ---- the gable: thick silver arch, navy face, louvre left, badge right
  var e0 = vPt(1, 1, 0), e1 = vPt(1, -1, 0), eap = vPt(1, 0, vri);
  var archPath = function () {
    g.beginPath();
    g.moveTo(e0[0], e0[1]);
    g.quadraticCurveTo(e0[0] + (eap[0] - e0[0]) * 0.34, eap[1] + 2, eap[0], eap[1]);
    g.quadraticCurveTo(e1[0] + (eap[0] - e1[0]) * 0.34, eap[1] + 2, e1[0], e1[1]);
    g.closePath();
  };
  archPath(); g.fillStyle = '#1e2331'; g.fill(); outline(g, '#191d23');
  g.save(); archPath(); g.clip();
  archPath(); g.strokeStyle = shade(SIL, 0.78); g.lineWidth = 11; g.stroke();   // silver rim (half shows)
  archPath(); g.strokeStyle = SILH; g.lineWidth = 8; g.stroke();
  archPath(); g.strokeStyle = '#2a2f3a'; g.lineWidth = 3; g.stroke();          // dark seam inside the rim
  var eLn = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) || 1;
  var eux = (e1[0] - e0[0]) / eLn, euy = (e1[1] - e0[1]) / eLn;
  var emx = (e0[0] + e1[0]) / 2, emy = (e0[1] + e1[1]) / 2;
  var capPt = function (sA, up) { return [emx + eux * sA, emy + euy * sA - up]; };
  var d0 = capPt(-21, 0), d1 = capPt(3, 0), d2 = capPt(3, 24), d3 = capPt(-21, 24);
  g.beginPath();
  g.moveTo(d0[0], d0[1]); g.lineTo(d1[0], d1[1]);
  g.lineTo(d2[0], d2[1]); g.lineTo(d3[0], d3[1]);
  g.closePath(); g.fillStyle = AWHT; g.fill();
  for (var slA = 0; slA < 11; slA++) {              // fine dark slat shadows
    var la = capPt(-21, 0.8 + slA * 2.15), lb = capPt(3, 0.8 + slA * 2.15);
    g.strokeStyle = 'rgba(28,32,40,.85)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(la[0], la[1]); g.lineTo(lb[0], lb[1]); g.stroke();
  }
  g.strokeStyle = 'rgba(150,158,172,.55)'; g.lineWidth = 1;   // shutter frame
  g.beginPath();
  g.moveTo(d0[0], d0[1]); g.lineTo(d1[0], d1[1]);
  g.lineTo(d2[0], d2[1]); g.lineTo(d3[0], d3[1]);
  g.closePath(); g.stroke();
  g.restore();
  // badge shield + PLAYER chevron, upper right of the shutter
  var shL = capPt(4, 14), shR = capPt(17, 14), shT = capPt(10.5, 26);
  g.beginPath();
  g.moveTo(shL[0], shL[1] + 3); g.lineTo(shL[0] + (shT[0] - shL[0]) * 0.5, shL[1] + 3 + (shT[1] - shL[1]) * 0.5 - 6);
  g.lineTo(shT[0], shT[1]); g.lineTo(shR[0] + (shT[0] - shR[0]) * 0.5, shR[1] + 3 + (shT[1] - shR[1]) * 0.5 - 6);
  g.lineTo(shR[0], shR[1] + 3);
  g.closePath(); g.fillStyle = '#171b22'; g.fill(); outline(g, '#8d95a3');
  var cvL = capPt(6.5, 23), cvR = capPt(14.5, 23), cvT = capPt(10.5, 16.5);
  g.fillStyle = HCL;                                // chevron, pointing down
  g.beginPath();
  g.moveTo(cvL[0], cvL[1]); g.lineTo(cvR[0], cvR[1]); g.lineTo(cvT[0], cvT[1]);
  g.closePath(); g.fill(); outline(g, HCD);
  g.strokeStyle = '#e8ecf4'; g.lineWidth = 1;       // white wing ticks either side
  g.beginPath(); g.moveTo(cvL[0] - 1.5, cvL[1] - 1); g.lineTo(cvL[0] + 1.5, cvL[1] - 3.5); g.stroke();
  g.beginPath(); g.moveTo(cvR[0] + 1.5, cvR[1] - 1); g.lineTo(cvR[0] - 1.5, cvR[1] - 3.5); g.stroke();

  // ---- right end machinery: brackets, drums, a `col` panel -----------
  var rgx = cx + fw * 0.72, rgy = baseY + fh * 0.18;
  isoBox(g, rgx, rgy, 22, 18, 16, 0, '#31363e', '#171a1f');
  isoBox(g, rgx - 12, rgy + 8, 14, 12, 9, 0, '#454b54', '#191d22');
  g.fillStyle = HC;                                 // painted end panel
  g.beginPath();
  g.moveTo(rgx - 4, rgy - 16); g.lineTo(rgx + 5, rgy - 20);
  g.lineTo(rgx + 5, rgy - 8); g.lineTo(rgx - 4, rgy - 4);
  g.closePath(); g.fill(); outline(g, HCD);
  g.fillStyle = HCL;
  g.beginPath();
  g.moveTo(rgx - 4, rgy - 16); g.lineTo(rgx + 5, rgy - 20);
  g.lineTo(rgx + 5, rgy - 18.4); g.lineTo(rgx - 4, rgy - 14.4);
  g.closePath(); g.fill();
  isoBox(g, rgx + 12, rgy - 2, 12, 10, 13, 0, '#6a7280', '#232830');  // pale bracket
  g.strokeStyle = '#4a5058'; g.lineWidth = 2.2;     // two tie rods
  for (var brA = 0; brA < 2; brA++) {
    g.beginPath();
    g.moveTo(rgx + 4, rgy - 12 + brA * 6);
    g.lineTo(rgx + 12, rgy - 9 + brA * 6); g.stroke();
  }
  g.strokeStyle = '#3f444a'; g.lineWidth = 4.2; g.lineCap = 'round';   // pipe loop off the end
  g.beginPath();
  g.moveTo(rgx + 2, rgy + 4); g.quadraticCurveTo(rgx + 16, rgy + 14, rgx + 24, rgy + 4); g.stroke();
  g.strokeStyle = '#8b929c'; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(rgx + 2, rgy + 4); g.quadraticCurveTo(rgx + 16, rgy + 14, rgx + 24, rgy + 4); g.stroke();
  g.lineCap = 'butt';
  drums(g, cx + fw * 0.44, baseY + fh * 0.66, 4, '#3d4238');
  drums(g, cx + fw * 0.62, baseY + fh * 0.54, 2, '#3d4238');

  // ---- mast crane at the left, level with the pad centre -------------
  var tx3 = cx - fw * 0.54, ty3 = baseY - fh * 0.02 + 12;
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(tx3 + 3, ty3 + 4, 20, 9, 0, 0, 6.29); g.fill();
  for (var boA = 0; boA < 8; boA++) {               // arc of black deck drums round the front
    var boAn = 0.20 + boA * 2.74 / 7;
    var box2 = tx3 + Math.cos(boAn) * 18, boy2 = ty3 + Math.sin(boAn) * 9;
    g.fillStyle = '#26292a';
    g.beginPath(); g.roundRect(box2 - 2.8, boy2 - 7, 5.6, 8, 1.5); g.fill();
    outline(g, '#121414');
    g.fillStyle = '#8f9694';
    g.beginPath(); g.ellipse(box2, boy2 - 7, 3.0, 1.6, 0, 0, 6.29); g.fill();
  }
  g.fillStyle = shade(GUN, 0.66);                   // plinth
  g.beginPath(); g.ellipse(tx3, ty3 - 2, 16, 8, 0, 0, 6.29); g.fill(); outline(g, GUN_D);
  g.fillStyle = '#2b2f34';                          // cog-tooth slew ring
  for (var cgC = 0; cgC < 18; cgC++) {
    var cga = cgC * 6.283 / 18;
    g.beginPath();
    g.ellipse(tx3 + Math.cos(cga) * 16, ty3 - 3 + Math.sin(cga) * 8,
              2.0, 1.5, 0, 0, 6.29);
    g.fill();
  }
  g.fillStyle = GUN;
  g.beginPath(); g.ellipse(tx3, ty3 - 5, 14.5, 7.2, 0, 0, 6.29); g.fill(); outline(g, GUN_D);
  cylinder(g, tx3, ty3 - 5, 14, 10, HCM, HC, HCD);           // PLAYER base drum, wide
  g.fillStyle = HCL; g.fillRect(tx3 - 14, ty3 - 14.6, 28, 1.6);
  g.fillStyle = HCD; g.fillRect(tx3 - 14, ty3 - 9.5, 28, 1.2);
  cylinder(g, tx3, ty3 - 14, 9.5, 3, AYEL, AYEL_L, AYEL_D);   // amber ring
  cylinder(g, tx3, ty3 - 17, 8, 10, '#8e99ad', '#c3ccdd', '#3a4252');  // glass waist
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(tx3 - 4.4, ty3 - 18); g.lineTo(tx3 - 4.4, ty3 - 26); g.stroke();
  cylinder(g, tx3, ty3 - 27, 9.5, 10, AYEL, AYEL_L, AYEL_D);  // amber body
  g.fillStyle = AYEL_D; g.fillRect(tx3 - 9.5, ty3 - 33, 19, 2.2);      // its dark band
  g.fillStyle = 'rgba(255,255,255,.40)'; g.fillRect(tx3 - 8.5, ty3 - 36.5, 2.6, 8);
  cylinder(g, tx3, ty3 - 37, 10, 3, '#c9ced8', '#eef1f6', DKB_D);      // silver ring
  cylinder(g, tx3, ty3 - 40, 11.5, 10, HC, HCL, HCD);                  // PLAYER cap drum
  g.fillStyle = HCD; g.fillRect(tx3 - 11.5, ty3 - 44, 23, 1.2);
  g.fillStyle = '#c9ced8';                          // silver lip, glass dome
  g.beginPath(); g.ellipse(tx3, ty3 - 50, 8.4, 3.6, 0, 0, 6.29); g.fill(); outline(g, DKB_D);
  g.fillStyle = '#e4e9f2';
  g.beginPath(); g.ellipse(tx3, ty3 - 51, 5.6, 4.2, 0, 0, 6.29); g.fill(); outline(g, '#6a7280');
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(tx3 - 1.8, ty3 - 52.6, 2.0, 1.4, 0, 0, 6.29); g.fill();

  // amber box jib from the amber body out to a claw on a cable. The jib
  // slews round the mast and the hoist rises and falls with the phase.
  var jTh = 0.16 + 0.34 * anS;
  var jA = [tx3 + 9, ty3 - 31];
  var jC = [tx3 + 9 + 36 * Math.cos(jTh), ty3 - 27 + 17 * Math.sin(jTh)];
  var jB = [(jA[0] + jC[0]) / 2, (jA[1] + jC[1]) / 2];
  isoBox(g, tx3 + 11, ty3 - 26, 9, 7, 7, 0, AYEL, AYEL_D);   // root cab
  lattice(g, jA[0], jA[1], jB[0], jB[1], 11, AYEL);
  lattice(g, jB[0], jB[1], jC[0], jC[1], 9, AYEL);
  g.strokeStyle = AYEL_D; g.lineWidth = 2.6;        // bottom chord
  g.beginPath(); g.moveTo(jA[0], jA[1] + 5.2); g.lineTo(jC[0], jC[1] + 4.2); g.stroke();
  g.strokeStyle = AYEL_L; g.lineWidth = 2.2;        // top chord
  g.beginPath(); g.moveTo(jA[0], jA[1] - 5.2); g.lineTo(jC[0], jC[1] - 4.2); g.stroke();
  g.strokeStyle = AYEL_D; g.lineWidth = 1.4;        // tie-back to the mast head
  g.beginPath(); g.moveTo(tx3 + 3, ty3 - 46); g.lineTo(jC[0], jC[1] - 4); g.stroke();
  var ropeL = 12 + 4 * anC;
  g.strokeStyle = '#8f96a2'; g.lineWidth = 1;       // hoist cable
  g.beginPath(); g.moveTo(jC[0], jC[1] + 4); g.lineTo(jC[0] + 1, jC[1] + ropeL); g.stroke();
  var clx = jC[0] + 1, cly = jC[1] + ropeL;         // open two-prong grab
  g.fillStyle = 'rgba(0,0,0,.26)';
  g.beginPath(); g.ellipse(clx + 4, baseY + fh * 0.30, 9, 4.2, 0, 0, 6.29); g.fill();
  g.fillStyle = AYEL;
  g.beginPath(); g.roundRect(clx - 6, cly - 4, 12, 5.4, 1.6); g.fill();
  outline(g, AYEL_D);
  g.strokeStyle = AYEL_D; g.lineWidth = 5.2; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(clx - 4.6, cly + 1.4);
  g.quadraticCurveTo(clx - 10, cly + 8, clx - 5.5, cly + 15); g.stroke();
  g.beginPath();
  g.moveTo(clx + 4.6, cly + 1.4);
  g.quadraticCurveTo(clx + 10, cly + 8, clx + 5.5, cly + 15); g.stroke();
  g.strokeStyle = AYEL; g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(clx - 4.6, cly + 1.4);
  g.quadraticCurveTo(clx - 10, cly + 8, clx - 5.5, cly + 15); g.stroke();
  g.beginPath();
  g.moveTo(clx + 4.6, cly + 1.4);
  g.quadraticCurveTo(clx + 10, cly + 8, clx + 5.5, cly + 15); g.stroke();
  g.strokeStyle = AYEL_L; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(clx - 6, cly + 1.4);
  g.quadraticCurveTo(clx - 11.4, cly + 8, clx - 6.9, cly + 14.4); g.stroke();
  g.lineCap = 'butt';
}
