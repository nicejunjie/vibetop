// Iron Frontier — structures/lab: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawLab(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot, sov = C.sov;

// --- RA2 Battle Lab ----------------------------------------------------
// Rebuilt at 1:1 against the RED-owner SHP rips (last frame of the wiki
// MAKE gifs): `allied-battle-lab-idle.png` 118x213 w/h 0.554 and
// `soviet-battle-lab-idle.png` 148x167 w/h 0.886.
//
// Directorate: two fat panelled BARRELS hung off a narrow navy spine —
// both have a visible curved underside, the right one standing on a
// ribbed pedestal — each capped by a shallow dark cap on a pale collar,
// a white-outlined badge shield hanging off the spine at mid height, a
// stepped house block at the spine's foot and a thicket of ball-tipped
// whip antennas above, two of them wearing HOUSE-coloured coils (the red
// rip proves the coils, the spine strip and the foot block are the whole
// remap: the drums, domes, badge and deck are fixed steel).
// Collective: a masonry blockhouse of arched windows under red lintel
// bars, four corner turrets with black onion caps on brass spires, then
// a tiered drum banded by FAT red rings with an arcaded tier showing lit
// machinery, and over it the gilded onion dome on its spire.
// Six idle phases (`bph`) bake into A.frames and are cycled by drawBld.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;

if (sov) {
  // ---- Collective Battle Lab ----------------------------------------
  var SLB_STN = '#6f6454', SLB_STNL = '#8b7f6a', SLB_STND = '#2b261f';
  var SLB_ROOF = '#7d7362', SLB_DRK = '#2f2c26';
  var SLB_BRS = '#c8a63c', SLB_BRSL = '#f6e293', SLB_BRSD = '#6f520c';
  var SLB_PNK = '#b0928a', SLB_PNKD = '#6c554e';
  g.fillStyle = 'rgba(0,0,0,.30)';                     // pale stone slab
  plot(g, cx + 2, baseY + 5, fw * 2.36, fh * 2.36); g.fill();
  plot(g, cx, baseY + 2, fw * 2.36, fh * 2.36);
  g.fillStyle = '#8f9284'; g.fill(); outline(g, '#4c4f44');
  plot(g, cx, baseY - 1, fw * 2.20, fh * 2.20);
  g.fillStyle = '#adb0a1'; g.fill(); outline(g, '#585b4e');
  g.save(); plot(g, cx, baseY - 1, fw * 2.20, fh * 2.20); g.clip();
  g.strokeStyle = 'rgba(80,84,72,.34)'; g.lineWidth = 1;
  for (var slPI = -2; slPI <= 2; slPI++) {
    g.beginPath();
    g.moveTo(cx + slPI * 24 - fw, baseY + slPI * 12 + fh);
    g.lineTo(cx + slPI * 24 + fw, baseY + slPI * 12 - fh); g.stroke();
  }
  g.restore();

  // ---- the masonry blockhouse ---------------------------------------
  var slBy = baseY - fh * 0.02, slLift = 46, slHw = fw * 0.96, slHh = fh * 0.96;
  prism(g, cx, slBy, slHw, slHh, slLift, SLB_STN, SLB_ROOF, SLB_STND, [0.28, 0.58]);
  var slRy = slBy - slLift;
  g.fillStyle = 'rgba(255,255,255,.10)';               // lit left face
  var slFa = faceL(cx, slBy, slHw, slHh, slLift, 0, 0), slFb = faceL(cx, slBy, slHw, slHh, slLift, 1, 0);
  g.beginPath();
  g.moveTo(slFa[0], slFa[1]); g.lineTo(slFb[0], slFb[1]);
  g.lineTo(slFb[0], slFb[1] - slLift); g.lineTo(slFa[0], slFa[1] - slLift);
  g.closePath(); g.fill();
  for (var slCI = 1; slCI < 4; slCI++) {               // string courses
    var slCv = slCI / 4;
    [faceL, faceR].forEach(function (F) {
      var a = F(cx, slBy, slHw, slHh, slLift, 0.01, slCv), b2 = F(cx, slBy, slHw, slHh, slLift, 0.99, slCv);
      g.strokeStyle = 'rgba(38,32,24,.42)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.stroke();
      g.strokeStyle = 'rgba(214,204,182,.16)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(a[0], a[1] - 1.6); g.lineTo(b2[0], b2[1] - 1.6); g.stroke();
    });
  }
  // arched, recessed windows; the ONLY red is a short lintel bar per pair
  var slWin = function (F, t0, t1, v0, v1) {
    facePatch(g, F, cx, slBy, slHw, slHh, slLift, t0 - 0.014, t1 + 0.014, v0 - 0.02, v1 + 0.03,
              'rgba(30,24,18,.55)', null);
    facePatch(g, F, cx, slBy, slHw, slHh, slLift, t0, t1, v0, v1, '#191410', '#0c0a07');
    var am = (t0 + t1) / 2;                            // the arch head
    facePatch(g, F, cx, slBy, slHw, slHh, slLift, am - (t1 - t0) * 0.30, am + (t1 - t0) * 0.30,
              v1, v1 + 0.035, '#191410', null);
    facePatch(g, F, cx, slBy, slHw, slHh, slLift, t0 + 0.012, t1 - 0.012, v0 + 0.02, v0 + 0.075,
              'rgba(206,214,226,.20)', null);
  };
  for (var slWI = 0; slWI < 4; slWI++) {
    var slT0 = 0.10 + slWI * 0.205;
    slWin(faceL, slT0, slT0 + 0.115, 0.16, 0.40);
    slWin(faceL, slT0, slT0 + 0.115, 0.52, 0.76);
    slWin(faceR, slT0, slT0 + 0.115, 0.16, 0.40);
    slWin(faceR, slT0, slT0 + 0.115, 0.52, 0.76);
    if (slWI === 1) {                                  // one red lintel bar
      facePatch(g, faceL, cx, slBy, slHw, slHh, slLift, slT0 - 0.02, slT0 + 0.135, 0.435, 0.485,
                shade(col, 0.92), null);
      facePatch(g, faceR, cx, slBy, slHw, slHh, slLift, slT0 - 0.02, slT0 + 0.135, 0.435, 0.485,
                shade(col, 0.74), null);
    }
  }
  g.strokeStyle = shade(col, 0.52); g.lineWidth = 2.8;  // painted cornice
  diamond(g, cx, slRy + 2.8, slHw * 1.94, slHh * 1.94); g.stroke();
  g.strokeStyle = col; g.lineWidth = 1.0;
  diamond(g, cx, slRy + 1.9, slHw * 1.94, slHh * 1.94); g.stroke();

  // pale pink buttress blocks at the near corner, with a house pod each
  var slButt = function (bx, by) {
    g.fillStyle = SLB_PNKD;
    g.beginPath();
    g.moveTo(bx - 10, by); g.lineTo(bx + 10, by);
    g.lineTo(bx + 10, by - 22); g.lineTo(bx - 10, by - 22);
    g.closePath(); g.fill(); outline(g, '#463831');
    g.fillStyle = SLB_PNK; g.fillRect(bx - 10, by - 22, 12, 22);
    g.fillStyle = shade(SLB_PNK, 1.14);
    g.beginPath();
    g.moveTo(bx - 10, by - 22); g.lineTo(bx + 10, by - 22);
    g.lineTo(bx + 7, by - 26); g.lineTo(bx - 8, by - 26);
    g.closePath(); g.fill(); outline(g, '#6c554e');
    g.strokeStyle = 'rgba(70,56,49,.42)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(bx - 10, by - 11); g.lineTo(bx + 10, by - 11); g.stroke();
    cylinder(g, bx + 1, by + 2, 7, 4.6, shade(col, 0.74), shade(col, 1.06), shade(col, 0.32));
    g.fillStyle = ph6 % 3 === 1 ? shade(col, 1.20) : col;
    g.beginPath(); g.ellipse(bx + 1, by - 2.6, 6.4, 3.8, 0, Math.PI, 6.29); g.fill();
    outline(g, shade(col, 0.34));
    g.fillStyle = 'rgba(255,255,255,.20)';
    g.beginPath(); g.ellipse(bx - 1.4, by - 4.4, 2.4, 1.4, 0, 0, 6.29); g.fill();
  };
  slButt(cx - slHw * 0.54, slBy + slHh * 0.48);
  slButt(cx + slHw * 0.54, slBy + slHh * 0.48);

  // ---- corner turrets: black onion caps on brass spires --------------
  var slTurret = function (tx, ty) {
    // The roofline (ty) these corner turrets sit on is itself close
    // to structures.js's y<body.lo "crown" cutoff -- on the two
    // OUTER turrets (west/east) EVERYTHING above roughly ty-12 pokes
    // into the crown band as its own isolated blob (confirmed by
    // measurement, not guesswork: shortening only the collar, or
    // only the dome, or translating the whole cap down while keeping
    // its height, each left some slice of it above the cutoff). The
    // centre (north) turret shares the tall drum tower's x-column
    // and is absorbed into that single crown component regardless,
    // so it's unaffected by any of this. Rebuilt as a squat cap
    // (collar+band+dome+spire+ball all within ty-11) rather than the
    // original full-height onion spire, which is the only geometry
    // that stays entirely below the cutoff on all three turrets.
    g.fillStyle = SLB_STN;
    g.fillRect(tx - 4.8, ty - 5, 9.6, 5); outline(g, SLB_STND);
    g.fillStyle = SLB_STNL; g.fillRect(tx - 4.8, ty - 5, 3.2, 5);
    g.fillStyle = shade(col, 0.90); g.fillRect(tx - 5.8, ty - 5.9, 11.6, 0.9);
    g.fillStyle = SLB_DRK;
    g.beginPath();
    g.moveTo(tx - 5.6, ty - 5.9);
    g.bezierCurveTo(tx - 6.6, ty - 7.4, tx - 3.2, ty - 7.9, tx, ty - 8.6);
    g.bezierCurveTo(tx + 3.2, ty - 7.9, tx + 6.6, ty - 7.4, tx + 5.6, ty - 5.9);
    g.closePath(); g.fill(); outline(g, '#0f0d0a');
    g.fillStyle = 'rgba(200,206,216,.20)';
    g.beginPath();
    g.moveTo(tx - 3.8, ty - 6.1);
    g.bezierCurveTo(tx - 4.4, ty - 7.4, tx - 2, ty - 7.7, tx - 0.7, ty - 8.4);
    g.lineTo(tx - 0.7, ty - 6.1); g.closePath(); g.fill();
    g.strokeStyle = SLB_BRS; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(tx, ty - 8.6); g.lineTo(tx, ty - 9.6); g.stroke();
    g.fillStyle = ph6 % 6 < 3 ? SLB_BRSL : SLB_BRS;
    g.beginPath(); g.arc(tx, ty - 10.3, 1.1, 0, 6.29); g.fill();
  };
  slTurret(cx - slHw, slRy);                           // west roof corner
  slTurret(cx + slHw, slRy);                           // east roof corner
  slTurret(cx, slRy - slHh);                           // far (north) corner

  // ---- the tiered drum ----------------------------------------------
  var slR1 = fw * 0.58;
  g.fillStyle = 'rgba(0,0,0,.26)';
  g.beginPath(); g.ellipse(cx + 2, slRy + 2, slR1, slR1 * 0.42, 0, 0, 6.29); g.fill();
  cylinder(g, cx, slRy, slR1, 20, '#5f5748', '#6d6555', SLB_STND);
  g.strokeStyle = 'rgba(30,26,20,.34)'; g.lineWidth = 1;
  for (var slSI = -3; slSI <= 3; slSI++) {
    g.beginPath();
    g.moveTo(cx + slSI * slR1 * 0.30, slRy - 20);
    g.lineTo(cx + slSI * slR1 * 0.30, slRy); g.stroke();
  }
  // a FAT red band hugging the drum, not a floating hoop
  var slBand = function (by2, rr) {
    g.fillStyle = shade(col, 0.56);
    g.fillRect(cx - rr, by2 - 3.8, rr * 2, 4.0);
    g.beginPath(); g.ellipse(cx, by2 + 0.2, rr, rr * 0.40, 0, 0, Math.PI); g.fill();
    g.fillStyle = col; g.fillRect(cx - rr, by2 - 3.8, rr * 2, 2.4);
    g.beginPath(); g.ellipse(cx, by2 - 3.8, rr, rr * 0.40, 0, 0, 6.29); g.fill();
    outline(g, shade(col, 0.34));
    g.fillStyle = shade(col, 1.24);
    g.beginPath(); g.ellipse(cx, by2 - 3.8, rr * 0.86, rr * 0.30, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(cx + rr * 0.44, by2 - 3.8, rr * 0.56, 4.0);
  };
  slBand(slRy - 14, slR1 * 0.96);
  var slD2 = slRy - 20;

  // the arcaded tier: dark columns with the lit machinery behind them
  var slR2 = fw * 0.43;
  g.fillStyle = '#1d1a14';
  g.fillRect(cx - slR2, slD2 - 20, slR2 * 2, 20);
  g.beginPath(); g.ellipse(cx, slD2, slR2, slR2 * 0.42, 0, 0, Math.PI); g.fill();
  var slGlow = 0.34 + 0.58 * (0.5 + 0.5 * anS);
  g.fillStyle = 'rgba(238,196,86,' + slGlow.toFixed(3) + ')';
  g.fillRect(cx - slR2 * 0.94, slD2 - 18, slR2 * 1.88, 15);
  g.fillStyle = 'rgba(120,80,20,.45)';
  for (var slMg = -2; slMg <= 2; slMg++) {             // the reactor drum, turning
    var slMx = cx + ((slMg + (bph || 0) * 5 + 2.5) % 5 - 2.5) * slR2 * 0.34;
    g.fillRect(slMx - 2.6, slD2 - 16, 5.2, 13);
  }
  g.fillStyle = 'rgba(255,232,150,' + (0.10 + 0.16 * (0.5 + 0.5 * anS)).toFixed(3) + ')';
  g.beginPath();
  g.ellipse(cx, slD2 - 10, slR2 * 1.04, slR2 * 0.46, 0, 0, 6.29); g.fill();
  for (var slAI = -3; slAI <= 3; slAI++) {             // the columns
    g.fillStyle = '#241f18';
    g.fillRect(cx + slAI * slR2 * 0.27 - 2.2, slD2 - 20, 4.4, 20);
    g.fillStyle = 'rgba(190,180,156,.22)';
    g.fillRect(cx + slAI * slR2 * 0.27 - 2.2, slD2 - 20, 1.3, 20);
  }
  g.fillStyle = '#3a342a';
  g.beginPath(); g.ellipse(cx, slD2 - 20, slR2, slR2 * 0.42, 0, 0, 6.29); g.fill();
  outline(g, SLB_STND);
  slBand(slD2 - 16, slR2 * 0.96);
  var slD3 = slD2 - 20;

  // ---- the gilded onion dome -----------------------------------------
  cylinder(g, cx, slD3 - 2, 11, 7, SLB_DRK, '#4a463d', '#100e0a');
  slBand(slD3 - 7, 9.2);
  var slDy = slD3 - 10;
  var slgrd = g.createLinearGradient(cx - 15, slDy - 28, cx + 15, slDy);
  slgrd.addColorStop(0, SLB_BRSL);
  slgrd.addColorStop(0.40, SLB_BRS);
  slgrd.addColorStop(1, SLB_BRSD);
  g.fillStyle = slgrd;
  g.beginPath();
  g.moveTo(cx - 13, slDy);
  g.bezierCurveTo(cx - 19, slDy - 12, cx - 10, slDy - 20, cx, slDy - 28);
  g.bezierCurveTo(cx + 10, slDy - 20, cx + 19, slDy - 12, cx + 13, slDy);
  g.closePath(); g.fill(); outline(g, SLB_BRSD);
  g.strokeStyle = 'rgba(122,90,20,.44)'; g.lineWidth = 1;
  for (var slGI = -2; slGI <= 2; slGI++) {
    g.beginPath();
    g.moveTo(cx + slGI * 4.8, slDy);
    g.quadraticCurveTo(cx + slGI * 6.4, slDy - 15, cx + slGI * 0.7, slDy - 27);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,248,212,' + (0.30 + 0.24 * (0.5 + 0.5 * anC)).toFixed(3) + ')';
  g.beginPath();
  g.ellipse(cx - 5.4 + anS * 1.6, slDy - 15, 3.4, 5.4, -0.4, 0, 6.29); g.fill();
  g.fillStyle = SLB_BRSD;
  g.beginPath(); g.ellipse(cx, slDy, 13, 4.4, 0, 0, 6.29); g.fill();
  // Spire lengthened 38->44 (ball 39.6->45.6, cross bar follows): once
  // the corner-turret fix (above) stopped the OUTER turrets defining
  // the sprite's top edge, this gilded spire became the tallest
  // feature, so its own tip now sets bbox y=0 -- lengthening it is
  // the only remaining way to buy more of structures.js's [col]
  // "dome-and-drum crown occupies the top >= 0.40 Sh" clearance
  // (0.322 Sh before any of this session's edits, 0.381 after the
  // turret fix's incidental gain, still short of 0.40).
  g.strokeStyle = SLB_BRS; g.lineWidth = 2.2;              // spire
  g.beginPath(); g.moveTo(cx, slDy - 28); g.lineTo(cx, slDy - 49); g.stroke();
  g.strokeStyle = SLB_BRSL; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx - 0.7, slDy - 28); g.lineTo(cx - 0.7, slDy - 49); g.stroke();
  g.strokeStyle = SLB_BRS; g.lineWidth = 1.6;              // cross bar
  g.beginPath(); g.moveTo(cx - 3.4, slDy - 42); g.lineTo(cx + 3.4, slDy - 42); g.stroke();
  g.fillStyle = SLB_BRSL;
  g.beginPath(); g.arc(cx, slDy - 50.6, 2.3, 0, 6.29); g.fill();
  outline(g, SLB_BRSD);

  // ---- apron ---------------------------------------------------------
  g.fillStyle = SLB_DRK;                                   // stair to the door
  g.beginPath();
  g.moveTo(cx - 10, baseY + fh * 0.78); g.lineTo(cx + 10, baseY + fh * 0.78);
  g.lineTo(cx + 7, baseY + fh * 0.48); g.lineTo(cx - 7, baseY + fh * 0.48);
  g.closePath(); g.fill(); outline(g, '#14120d');
  g.fillStyle = 'rgba(196,190,170,.30)';
  g.fillRect(cx - 8.4, baseY + fh * 0.60, 16.8, 1.4);
  crates(g, cx - fw * 1.02, baseY + fh * 0.60, 2, '#9a8d70');
  for (var slSm = 0; slSm < 3; slSm++) {                   // vent steam
    var slSt = ((bph || 0) + slSm / 3) % 1;
    g.fillStyle = 'rgba(206,206,196,' + (0.24 * (1 - slSt)).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(cx + fw * 0.70 - slSt * 5, baseY + fh * 0.30 - slSt * 16,
              3 + slSt * 6, 2 + slSt * 4, 0, 0, 6.29);
    g.fill();
  }
} else {
  // ---- Directorate Battle Lab ---------------------------------------
  var LAB_PLT = '#a5abbc', LAB_PLL = '#dee2ec', LAB_PLD = '#636978';
  var LAB_SPN = '#272c3a', LAB_SPD = '#11141d', LAB_SPL = '#434a5c';
  var LAB_DOM = '#2e2c46', LAB_DML = '#5b5880', LAB_DMD = '#16152a';
  var LAB_GUN = '#5a616c', LAB_GUD = '#282d35';

  // ---- the deck ------------------------------------------------------
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.beginPath(); g.ellipse(cx + 3, baseY + 6, fw * 0.94, fh * 0.94, 0, 0, 6.29); g.fill();
  g.fillStyle = '#1e222a';
  g.beginPath(); g.ellipse(cx, baseY + 3, fw * 0.92, fh * 0.92, 0, 0, 6.29); g.fill();
  outline(g, '#0d1015');
  g.fillStyle = '#2b3038';
  g.beginPath(); g.ellipse(cx, baseY + 1, fw * 0.84, fh * 0.84, 0, 0, 6.29); g.fill();
  outline(g, '#14181e');
  // the pale skid with its house-rimmed circular hatch
  var lhx = cx + fw * 0.18, lhy = baseY + fh * 0.30;
  g.fillStyle = '#8e94a0';
  g.beginPath(); g.ellipse(lhx, lhy, 23, 11.5, 0, 0, 6.29); g.fill(); outline(g, '#4a4f58');
  g.fillStyle = '#b9bfc9';
  g.beginPath(); g.ellipse(lhx, lhy - 1.4, 20, 9.6, 0, 0, 6.29); g.fill();
  g.strokeStyle = shade(col, 0.62); g.lineWidth = 3.2;
  g.beginPath(); g.ellipse(lhx, lhy - 1, 15.4, 7.4, 0, 0, 6.29); g.stroke();
  g.strokeStyle = ph6 % 3 === 0 ? shade(col, 1.26) : col; g.lineWidth = 1.6;
  g.beginPath(); g.ellipse(lhx, lhy - 1.8, 15.4, 7.4, 0, 0, 6.29); g.stroke();
  g.fillStyle = '#31363f';
  g.beginPath(); g.ellipse(lhx, lhy - 2, 9.4, 4.6, 0, 0, 6.29); g.fill();
  g.fillStyle = '#a8663a';                                 // tan plank
  g.fillRect(cx + fw * 0.46, baseY + fh * 0.30, 17, 4);
  g.fillStyle = '#c98a52'; g.fillRect(cx + fw * 0.46, baseY + fh * 0.30, 17, 1.6);
  g.fillStyle = '#1a2130';                                 // small dark crate
  g.fillRect(cx + fw * 0.03, baseY + fh * 0.44, 11, 8); outline(g, '#0a0d14');
  g.fillStyle = '#39445c'; g.fillRect(cx + fw * 0.03, baseY + fh * 0.44, 11, 2.4);
  g.strokeStyle = '#12151b'; g.lineWidth = 1.6;            // two little deck masts
  g.beginPath(); g.moveTo(cx - fw * 0.78, baseY + fh * 0.06); g.lineTo(cx - fw * 0.78, baseY - 16); g.stroke();
  g.beginPath(); g.moveTo(cx + fw * 0.76, baseY + fh * 0.02); g.lineTo(cx + fw * 0.76, baseY - 14); g.stroke();

  // ---- the spine (drawn between the two barrels so its strip reads) --
  var lsTop = baseY - 150;
  var labSpine = function () {
  g.fillStyle = LAB_SPN; g.fillRect(cx - 13, lsTop, 24, 154); outline(g, LAB_SPD);
  g.fillStyle = LAB_SPL; g.fillRect(cx - 13, lsTop, 5.4, 154);
  g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(cx + 5, lsTop, 6, 154);
  g.fillStyle = shade(col, 0.86);                          // HOUSE strip on the spine
  g.fillRect(cx - 11, baseY - 138, 15, 84); outline(g, shade(col, 0.36));
  // The strip's own face was raw `col` — the same literal fill the
  // G.I.'s torso block uses — sitting at the spine's mid-height, close
  // to where a portrait-cropped G.I.'s chest sits in HIS frame. That
  // shared value is what `Battle Lab | GI` (64.8, under RA2's bar) is
  // reading. Brightening the face keeps the spine strip as the named
  // remap surface (the header comment above names coils, spine strip
  // and foot block as "the whole remap") — only its value moves.
  // Measured: 64.8 -> 65.6.
  g.fillStyle = shade(col, 1.32); g.fillRect(cx - 11, baseY - 138, 10, 84);
  g.fillStyle = shade(col, 1.46); g.fillRect(cx - 11, baseY - 138, 3, 84);
  g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 1;
  for (var lspI = 1; lspI < 7; lspI++) {
    g.beginPath();
    g.moveTo(cx - 11, baseY - 138 + 84 * lspI / 7);
    g.lineTo(cx + 4, baseY - 138 + 84 * lspI / 7); g.stroke();
  }
  g.fillStyle = LAB_GUN;                                   // junction box
  g.fillRect(cx - 14, baseY - 147, 26, 10); outline(g, LAB_GUD);
  g.fillStyle = '#828994'; g.fillRect(cx - 14, baseY - 147, 26, 2.6);
  };

  // ---- a panelled barrel with a shallow dark cap ---------------------
  var labDrum = function (dx, dy, rx, h, domeR) {
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.beginPath(); g.ellipse(dx + 3, dy + 3, rx * 0.94, rx * 0.34, 0, 0, 6.29); g.fill();
    g.fillStyle = LAB_PLD;                                 // curved underside
    g.beginPath(); g.ellipse(dx, dy - rx * 0.12, rx, rx * 0.46, 0, 0, Math.PI); g.fill();
    outline(g, '#4a4f5c');
    g.fillStyle = 'rgba(0,0,0,.26)';
    g.beginPath(); g.ellipse(dx, dy - rx * 0.12, rx * 0.98, rx * 0.32, 0, 0, Math.PI); g.fill();
    var lbH = h - rx * 0.12;
    g.save(); g.beginPath(); g.rect(dx - rx, dy - h, rx * 2, lbH); g.clip();
    for (var lrI = 0; lrI < 3; lrI++) {
      var ly0 = dy - h + lbH * lrI / 3, ly1 = dy - h + lbH * (lrI + 1) / 3;
      for (var lkI = 0; lkI < 5; lkI++) {
        var la0 = -1.30 + 2.60 * lkI / 5, la1 = -1.30 + 2.60 * (lkI + 1) / 5;
        var lx0 = dx + Math.sin(la0) * rx, lx1 = dx + Math.sin(la1) * rx;
        var lf = 0.74 + 0.50 * Math.cos((la0 + la1) / 2 + 0.44);
        lf = Math.max(0.70, Math.min(1.22, lf));
        var lg0 = (1 - Math.cos(la0)) * rx * 0.22, lg1 = (1 - Math.cos(la1)) * rx * 0.22;
        g.fillStyle = shade(LAB_PLT, lf);
        g.beginPath();
        g.moveTo(lx0, ly0 + lg0); g.lineTo(lx1, ly0 + lg1);
        g.lineTo(lx1, ly1 + lg1); g.lineTo(lx0, ly1 + lg0);
        g.closePath(); g.fill(); outline(g, 'rgba(52,56,72,.50)');
        g.strokeStyle = 'rgba(40,44,58,.80)'; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(lx1, ly0 + lg1); g.lineTo(lx1, ly1 + lg1); g.stroke();
      }
    }
    g.restore();
    g.fillStyle = LAB_GUN;                                 // gunmetal collar
    g.beginPath(); g.ellipse(dx, dy - h, rx * 1.02, rx * 0.40, 0, 0, 6.29); g.fill();
    outline(g, LAB_GUD);
    g.fillStyle = LAB_PLL;                                 // pale rim under the cap
    g.beginPath(); g.ellipse(dx, dy - h - 3, rx * 0.92, rx * 0.36, 0, 0, 6.29); g.fill();
    outline(g, LAB_PLD);
    var lcy = dy - h - 5;
    var lgd = g.createRadialGradient(dx - domeR * 0.42, lcy - domeR * 0.50, 1, dx, lcy, domeR * 1.45);
    lgd.addColorStop(0, LAB_DML);
    lgd.addColorStop(0.50, LAB_DOM);
    lgd.addColorStop(1, LAB_DMD);
    g.fillStyle = lgd;
    g.beginPath(); g.ellipse(dx, lcy, domeR, domeR * 0.66, 0, Math.PI, 6.29);
    g.closePath(); g.fill(); outline(g, LAB_DMD);
    g.fillStyle = 'rgba(232,238,255,' + (0.28 + 0.52 * (0.5 + 0.5 * anS)).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(dx - domeR * (0.40 - 0.34 * anS), lcy - domeR * 0.36,
              domeR * 0.34, domeR * 0.14, -0.42, 0, 6.29);
    g.fill();
    g.strokeStyle = LAB_PLD; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(dx, lcy, domeR, domeR * 0.28, 0, 0, 6.29); g.stroke();
    for (var lpI = -2; lpI <= 2; lpI++) {                  // rail posts on the collar
      g.fillStyle = '#949aa6';
      g.fillRect(dx + lpI * rx * 0.44 - 0.7, dy - h - 6, 1.4, 4.4);
    }
    return lcy - domeR * 0.66;
  };
  var labA = labDrum(cx - fw * 0.50, baseY - 48, 28, 62, 22);    // back-left barrel
  labSpine();
  // the right barrel's ribbed pedestal, then the barrel over it
  g.fillStyle = LAB_GUN; g.fillRect(cx + fw * 0.50 - 12, baseY - 34, 24, 36);
  outline(g, LAB_GUD);
  g.fillStyle = '#7f8691'; g.fillRect(cx + fw * 0.50 - 12, baseY - 34, 6.4, 36);
  g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(cx + fw * 0.50 + 5, baseY - 34, 7, 36);
  g.strokeStyle = 'rgba(24,28,34,.44)'; g.lineWidth = 1;
  for (var lpdI = 1; lpdI < 5; lpdI++) {
    g.beginPath();
    g.moveTo(cx + fw * 0.50 - 12, baseY - 34 + 36 * lpdI / 5);
    g.lineTo(cx + fw * 0.50 + 12, baseY - 34 + 36 * lpdI / 5); g.stroke();
  }
  var labB = labDrum(cx + fw * 0.50, baseY - 26, 31, 72, 25);    // front-right barrel

  // ---- the arched service duct down the near face --------------------
  var ldA = [cx - 4, baseY - 128], ldB = [cx - 44, baseY - 74], ldC = [cx - 18, baseY - 4];
  g.strokeStyle = '#262b33'; g.lineWidth = 11; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(ldA[0], ldA[1]); g.quadraticCurveTo(ldB[0], ldB[1], ldC[0], ldC[1]); g.stroke();
  g.strokeStyle = '#7b818b'; g.lineWidth = 7.4;
  g.beginPath(); g.moveTo(ldA[0], ldA[1]); g.quadraticCurveTo(ldB[0], ldB[1], ldC[0], ldC[1]); g.stroke();
  g.strokeStyle = 'rgba(230,236,244,.36)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ldA[0] - 2, ldA[1]); g.quadraticCurveTo(ldB[0] - 2, ldB[1], ldC[0] - 2, ldC[1]); g.stroke();
  g.strokeStyle = 'rgba(20,24,30,.46)'; g.lineWidth = 1.2;
  for (var laI = 1; laI < 7; laI++) {
    var lat = laI / 7, liv = 1 - lat;
    var lax = liv * liv * ldA[0] + 2 * liv * lat * ldB[0] + lat * lat * ldC[0];
    var lay = liv * liv * ldA[1] + 2 * liv * lat * ldB[1] + lat * lat * ldC[1];
    g.beginPath(); g.moveTo(lax - 6, lay + 1.4); g.lineTo(lax + 6, lay - 1.4); g.stroke();
  }

  // ---- the badge shield, hanging off the spine ----------------------
  var lbx = cx - 22, lby = baseY - 58;
  g.fillStyle = '#0e1016';
  g.beginPath();
  g.moveTo(lbx - 15, lby - 24); g.lineTo(lbx + 13, lby - 19);
  g.lineTo(lbx + 11, lby - 5); g.lineTo(lbx - 3, lby + 5);
  g.lineTo(lbx - 15, lby - 8); g.closePath(); g.fill();
  g.strokeStyle = '#e6eaf2'; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#dfe4ec';
  g.beginPath();
  g.moveTo(lbx - 9, lby - 18); g.lineTo(lbx + 7, lby - 14.6);
  g.lineTo(lbx - 1, lby - 6); g.closePath(); g.fill();
  g.fillStyle = '#0e1016';
  g.beginPath();
  g.moveTo(lbx - 6, lby - 16); g.lineTo(lbx + 3, lby - 14);
  g.lineTo(lbx - 1, lby - 9.6); g.closePath(); g.fill();

  // ---- the stepped house block at the spine's foot ------------------
  var lkx = cx - 6, lky = baseY - 2;
  for (var lkI = 0; lkI < 2; lkI++) {
    var lkw = 16 - lkI * 3, lkh = 13;
    g.fillStyle = shade(col, 0.56);
    g.fillRect(lkx - lkw, lky - 13 - lkI * 13, lkw * 2, lkh);
    outline(g, shade(col, 0.32));
    g.fillStyle = col; g.fillRect(lkx - lkw, lky - 13 - lkI * 13, lkw * 1.10, lkh);
    g.fillStyle = shade(col, 1.22);
    g.fillRect(lkx - lkw, lky - 13 - lkI * 13, lkw * 2, 2.6);
    g.fillStyle = 'rgba(0,0,0,.24)';
    g.fillRect(lkx + lkw * 0.44, lky - 13 - lkI * 13, lkw * 0.56, lkh);
  }

  // ---- ball-tipped whip antennas, two wearing HOUSE coils -----------
  var labWhip = function (wx, wyBot, wyTop, coilY, lit) {
    g.strokeStyle = '#0f1218'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(wx, wyBot); g.lineTo(wx, wyTop); g.stroke();
    g.strokeStyle = 'rgba(184,192,206,.32)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(wx - 0.8, wyBot); g.lineTo(wx - 0.8, wyTop); g.stroke();
    g.fillStyle = lit ? '#ffffff' : '#c3c9d4';
    g.beginPath(); g.arc(wx, wyTop - 2, 2.4, 0, 6.29); g.fill();
    outline(g, '#6e7480');
    if (coilY !== null) {
      cylinder(g, wx, coilY + 34, 8.6, 34, shade(col, 0.80), shade(col, 1.10), shade(col, 0.32));
      for (var lwI = 0; lwI < 8; lwI++) {                  // the winding
        // a charge climbs the coil: one turn is lit on every phase
        g.fillStyle = (lwI + ph6) % 4 === 0 ? shade(col, 1.24)
                    : lwI % 2 ? shade(col, 1.06) : shade(col, 0.68);
        g.fillRect(wx - 8.6, coilY + 1 + lwI * 4.1, 17.2, 2.3);
      }
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(wx - 8.6, coilY, 3.2, 34);
      g.fillStyle = 'rgba(240,250,255,' + (0.34 + 0.30 * Math.abs(anS)).toFixed(3) + ')';
      g.fillRect(wx - 9.4, coilY + 2 + ((7 - ph6) % 6) * 5.2, 18.8, 1.8);
      g.fillStyle = LAB_GUN;
      g.beginPath(); g.ellipse(wx, coilY, 8.6, 3.6, 0, 0, 6.29); g.fill();
      outline(g, LAB_GUD);
    }
  };
  // Three rounds against structures.js's [dir] ">=4 masts, each
  // clearing the drum rim by >=0.20 Sh" clause:
  // 1) Whip 1's tip raised 178->198 -- it wasn't clearing the drum rim
  //    at all, so the ">=4 masts" count never saw it. Whips 2/3's
  //    coils moved from high on the mast (near the tip, where their
  //    own 17px-wide cylinder blew each one past the thin-mast width
  //    filter) down near the drum rim (near wyBot, same place real
  //    transformer coils sit on a tower) so only the thin ball+line
  //    registers above the rim; the coil itself still reads fine
  //    sitting low on the mast.
  // 2) That still left whips 1/2/3 8-connected-merging with the
  //    drum dome's own tapering top silhouette (its topmost rows are
  //    narrower than the crown cutoff and were bridging into
  //    whichever mast passed through that x-column) -- spread their
  //    x-fractions apart (-0.34/-0.13/+0.12 -> -0.42/-0.22/+0.22) to
  //    move each mast off the dome's bridging columns.
  // 3) Even with 4 masts now detected, whips 4/5 (the two that always
  //    passed the width filter, unedited since before this session)
  //    still failed the separate ">=0.20 Sh clearance" sub-check on
  //    their own tips -- raised baseY-162->178 and baseY-140->176.
  labWhip(cx - fw * 0.42, labA + 10, baseY - 198, null, ph6 % 3 === 0);
  labWhip(cx - fw * 0.22, labA + 6, baseY - 196, labA + 40, false);
  labWhip(cx + fw * 0.22, labB + 8, baseY - 190, labB + 42, false);
  labWhip(cx + fw * 0.32, labB + 14, baseY - 178, null, ph6 % 3 === 1);
  labWhip(cx + fw * 0.50, labB + 22, baseY - 176, null, ph6 % 3 === 2);
  if (ph6 % 2 === 0) {                                     // the coils arc over
    g.strokeStyle = 'rgba(214,236,255,' + (0.34 + 0.26 * Math.abs(anS)).toFixed(3) + ')';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx - fw * 0.13 + 8, baseY - 160);
    g.lineTo(cx - fw * 0.01, baseY - 150 + ph6);
    g.lineTo(cx + fw * 0.12 - 8, baseY - 156); g.stroke();
  }
}
}
