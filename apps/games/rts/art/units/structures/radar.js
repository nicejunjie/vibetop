// Iron Frontier unit art — structures/radar
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/radar` and
// `// @@END structures/radar` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// --- RA2 Soviet Radar Tower -------------------------------------------
// Rebuilt at 1:1 against the RED-owner MAKE rip
// (docs/ra2-ref/soviet-radar-tower-idle.png, last of 29 frames, 90x125,
// w/h 0.720). Reading it: the DISH is the building — a pale silver face
// 0.69 of the sprite's width, dark navy across its top-left sector, with
// heavy navy ribs (one strong VERTICAL bar running through the hub and
// out past the bottom rim, plus upper-left, upper-right and lower-right
// arms), a concentric arc low in the bowl and a domed hub carrying a
// small house-coloured crescent. It sits almost ON the base: a darker
// back-shell disc peeks out below-right, navy legs drop through it to a
// fat red-and-white LIFE-RING collar half-buried in an irregular
// MOTTLED CAMO MOUND, and three chunky house-coloured WEDGE BLOCKS with
// silver grate strips splay off the mound's front and flanks beside a
// pale concrete ramp.
// COLOUR: `col` is the ring's alternating segments, the three wedges and
// the hub crescent. The mound is camouflage, the dish is bare metal —
// neither carries any house paint.
// Six idle phases (`bph`): the dish face turns (ribs, arc and specular
// sweep together) and the mast beacon blinks.
var anP = (bph || 0) * 6.283, ph6 = Math.round((bph || 0) * 6) % 6;
var RDR_CAM = '#5e5c3e', RDR_CAMD = '#23241a', RDR_CAML = '#8e8a60';
var RDR_IRN = '#2a303c', RDR_IRND = '#0d1016', RDR_IRNL = '#4e5563';
var RDR_DSH = '#c9ccd2', RDR_DSHL = '#f0f2f6', RDR_DSHD = '#7d838d';
if (sov) {
  // ---- ground: only a thin hardstanding, the sprite has no raft ------
  g.fillStyle = 'rgba(0,0,0,.22)';                     // just a scuffed dirt patch
  plot(g, cx + 1, baseY + 4, fw * 0.74, fh * 0.74); g.fill();
  plot(g, cx, baseY + 2, fw * 0.70, fh * 0.70);
  g.fillStyle = 'rgba(96,94,72,.55)'; g.fill();

  // ---- pale concrete ramp off the front-left ------------------------
  g.fillStyle = '#b6a099';
  g.beginPath();
  g.moveTo(cx - fw * 0.56, baseY + fh * 0.86); g.lineTo(cx - fw * 0.18, baseY + fh * 0.46);
  g.lineTo(cx - fw * 0.02, baseY + fh * 0.72); g.lineTo(cx - fw * 0.40, baseY + fh * 1.12);
  g.closePath(); g.fill(); outline(g, '#4f423c');
  g.strokeStyle = 'rgba(74,60,54,.46)'; g.lineWidth = 1.2;    // tread courses
  for (var rpI = 1; rpI < 7; rpI++) {
    var rpt = rpI / 7;
    g.beginPath();
    g.moveTo(cx - fw * 0.56 + fw * 0.38 * rpt, baseY + fh * 0.86 - fh * 0.40 * rpt);
    g.lineTo(cx - fw * 0.40 + fw * 0.38 * rpt, baseY + fh * 1.12 - fh * 0.40 * rpt);
    g.stroke();
  }
  g.fillStyle = 'rgba(246,234,226,.40)';
  g.beginPath();
  g.moveTo(cx - fw * 0.56, baseY + fh * 0.86); g.lineTo(cx - fw * 0.18, baseY + fh * 0.46);
  g.lineTo(cx - fw * 0.14, baseY + fh * 0.52); g.lineTo(cx - fw * 0.52, baseY + fh * 0.92);
  g.closePath(); g.fill();

  // ---- the mottled camo mound ---------------------------------------
  var rdBy = baseY + fh * 0.34, rdLift = 32, rdHW = fw * 0.48, rdHH = fh * 0.48;
  prism(g, cx, rdBy, rdHW, rdHH, rdLift, RDR_CAM, shade(RDR_CAM, 1.02), RDR_CAMD);
  var rdRy = rdBy - rdLift;
  g.save();                                            // clip to the whole solid
  g.beginPath();
  g.moveTo(cx - rdHW, rdRy); g.lineTo(cx, rdRy - rdHH); g.lineTo(cx + rdHW, rdRy);
  g.lineTo(cx + rdHW, rdBy); g.lineTo(cx, rdBy + rdHH); g.lineTo(cx - rdHW, rdBy);
  g.closePath(); g.clip();
  srand(4127);
  for (var rdMI = 0; rdMI < 90; rdMI++) {              // camouflage: dense, dirty, irregular
    var mk = rnd();
    g.fillStyle = mk < 0.36 ? 'rgba(12,14,8,.72)' : mk < 0.60 ? 'rgba(118,110,66,.60)'
                : mk < 0.82 ? 'rgba(46,58,32,.62)' : 'rgba(168,154,112,.42)';
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * rdHW * 2.1,
              rdRy - rdHH * 0.9 + rnd() * (rdLift + rdHH * 2.1),
              2.4 + rnd() * 6, 1.6 + rnd() * 3.4, 0, 0, 6.29);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,.30)';                     // the near-right wall stays in shade
  g.fillRect(cx, rdRy - 6, rdHW + 2, rdLift + rdHH + 8);
  g.fillStyle = 'rgba(255,246,214,.08)';
  g.fillRect(cx - rdHW - 2, rdRy - 6, rdHW, rdLift + rdHH + 8);
  g.restore();
  srand(577);                                          // lumps that break the box outline
  for (var rdEI = 0; rdEI < 22; rdEI++) {
    var et = rnd(), ed = rnd() < 0.5 ? -1 : 1;
    var ex = cx + ed * rdHW * (0.30 + rnd() * 0.74);
    var ey = rdRy - rdHH * 0.5 + et * (rdLift + rdHH * 1.4);
    g.fillStyle = rnd() < 0.55 ? 'rgba(20,24,14,.60)' : 'rgba(120,112,70,.52)';
    g.beginPath(); g.ellipse(ex, ey, 3 + rnd() * 4.4, 2 + rnd() * 2.6, 0, 0, 6.29); g.fill();
  }
  g.fillStyle = '#101218';                             // service hatch, front-left
  g.beginPath();
  g.moveTo(cx - fw * 0.32, rdBy + fh * 0.10); g.lineTo(cx - fw * 0.16, rdBy + fh * 0.18);
  g.lineTo(cx - fw * 0.16, rdBy + fh * 0.18 - 13); g.lineTo(cx - fw * 0.32, rdBy + fh * 0.10 - 13);
  g.closePath(); g.fill(); outline(g, '#000');
  g.fillStyle = '#5c6270';
  g.fillRect(cx - fw * 0.31, rdBy + fh * 0.10 - 12, fw * 0.13, 1.6);

  // ---- three house-coloured wedge blocks off the mound ---------------
  // The sprite's loudest remap: solid slabs with a lit top facet, a
  // shaded downhill face and a silver grate strip along the low edge.
  var rdWedge = function (fx, fy, dx, dy, wd) {
    g.fillStyle = 'rgba(0,0,0,.34)';
    g.beginPath();
    g.moveTo(fx, fy + 5); g.lineTo(fx + dx, fy + dy + 8);
    g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46 + 8);
    g.lineTo(fx + wd * 0.34, fy + wd * 0.46 + 5);
    g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.44);                    // downhill face
    g.beginPath();
    g.moveTo(fx + dx, fy + dy); g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46);
    g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46 + 8); g.lineTo(fx + dx, fy + dy + 8);
    g.closePath(); g.fill(); outline(g, shade(col, 0.26));
    g.fillStyle = col;                                 // the lit top plate
    g.beginPath();
    g.moveTo(fx, fy); g.lineTo(fx + dx, fy + dy);
    g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46); g.lineTo(fx + wd * 0.34, fy + wd * 0.46);
    g.closePath(); g.fill(); outline(g, shade(col, 0.30));
    g.fillStyle = shade(col, 1.28);                    // lit uphill lip
    g.beginPath();
    g.moveTo(fx, fy); g.lineTo(fx + dx, fy + dy);
    g.lineTo(fx + dx * 0.97, fy + dy + 3); g.lineTo(fx - dx * 0.03, fy + 3);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.20)';                   // the far half falls away
    g.beginPath();
    g.moveTo(fx + dx * 0.62, fy + dy * 0.62); g.lineTo(fx + dx, fy + dy);
    g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46);
    g.lineTo(fx + dx * 0.62 + wd * 0.34, fy + dy * 0.62 + wd * 0.46);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(22,14,10,.34)'; g.lineWidth = 1;      // one plate seam
    for (var wI = 1; wI < 2; wI++) {
      var wt = wI / 2;
      g.beginPath();
      g.moveTo(fx + dx * wt, fy + dy * wt);
      g.lineTo(fx + dx * wt + wd * 0.34, fy + dy * wt + wd * 0.46); g.stroke();
    }
    g.fillStyle = '#565c64';                           // grate strip, downhill edge
    g.beginPath();
    g.moveTo(fx + wd * 0.34, fy + wd * 0.46); g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46);
    g.lineTo(fx + dx + wd * 0.34, fy + dy + wd * 0.46 + 3.2);
    g.lineTo(fx + wd * 0.34, fy + wd * 0.46 + 3.2);
    g.closePath(); g.fill(); outline(g, '#1e2227');
    g.strokeStyle = 'rgba(16,20,24,.80)'; g.lineWidth = 1.3;
    for (var wG = 1; wG < 6; wG++) {
      var wgt = wG / 6;
      g.beginPath();
      g.moveTo(fx + wd * 0.34 + dx * wgt, fy + wd * 0.46 + dy * wgt);
      g.lineTo(fx + wd * 0.34 + dx * wgt, fy + wd * 0.46 + dy * wgt + 3.2); g.stroke();
    }
  };
  rdWedge(cx - fw * 0.28, baseY + fh * 0.26, -fw * 0.46, fh * 0.26, 32);   // left
  rdWedge(cx + fw * 0.26, baseY + fh * 0.30, fw * 0.48, fh * 0.30, 34);    // right
  rdWedge(cx - fw * 0.13, baseY + fh * 0.56, fw * 0.22, fh * 0.34, 32);    // front

  // ---- the fat red-and-white life-ring collar, sunk into the roof -----
  var rdCy = rdRy + 11, rdCr = fw * 0.34;
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.beginPath(); g.ellipse(cx + 1, rdCy + 6, rdCr + 2, (rdCr + 2) * 0.46, 0, 0, 6.29); g.fill();
  for (var rdBI = 0; rdBI < 8; rdBI++) {               // segments, dark-edged
    var a0 = rdBI / 8 * 6.283, a1 = (rdBI + 1) / 8 * 6.283;
    g.strokeStyle = rdBI % 2 ? '#2a2a26' : shade(col, 0.40);
    g.lineWidth = 15.2;
    g.beginPath(); g.ellipse(cx, rdCy + 1.6, rdCr, rdCr * 0.46, 0, a0, a1); g.stroke();
    g.strokeStyle = rdBI % 2 ? '#d8dace' : col;
    g.lineWidth = 12.6;
    g.beginPath(); g.ellipse(cx, rdCy, rdCr, rdCr * 0.46, 0, a0, a1); g.stroke();
    g.strokeStyle = rdBI % 2 ? '#f2f3ea' : shade(col, 1.22);
    g.lineWidth = 3.2;
    g.beginPath(); g.ellipse(cx, rdCy - 3.6, rdCr, rdCr * 0.46, 0, a0 + 0.06, a1 - 0.06); g.stroke();
  }
  g.strokeStyle = 'rgba(20,22,20,.46)'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(cx, rdCy + 6.4, rdCr, rdCr * 0.46, 0, 0, 3.15); g.stroke();
  g.fillStyle = 'rgba(46,50,32,.42)';                  // grime where it meets the mound
  g.beginPath(); g.ellipse(cx, rdCy + 7.5, rdCr * 0.96, rdCr * 0.30, 0, 0, 3.15); g.fill();

  // ---- iron machinery on the mound roof, round the mast root ---------
  g.fillStyle = RDR_IRN;
  g.beginPath();
  g.moveTo(cx - 17, rdCy - 5); g.lineTo(cx - 8, rdCy - 10);
  g.lineTo(cx + 8, rdCy - 10); g.lineTo(cx + 17, rdCy - 5);
  g.lineTo(cx + 17, rdCy - 1); g.lineTo(cx - 17, rdCy - 1);
  g.closePath(); g.fill(); outline(g, RDR_IRND);
  g.fillStyle = RDR_IRNL; g.fillRect(cx - 15, rdCy - 9, 5.4, 5);
  g.fillStyle = '#8d9152'; g.fillRect(cx + 9, rdCy - 9, 4.4, 4.4);

  // ---- the trunnion lattice, the back-shell and the dish -------------
  // DISH PROPORTION, RE-MEASURED off the committed alpha rip rather than
  // off the eye. `docs/ra2-ref/soviet-radar-tower-idle.png` carries a
  // baked magenta ground shadow; drop those pixels and its opaque bbox
  // is exactly the 90x125 this block's header cites. Its own rowProfile
  // then reads a dish of rows 0..57 peaking at 61 px, a 29 px trunnion
  // pinch at row 58, and a mound from row 80 — i.e. dish 0.678 Sw,
  // mass aspect 1.052, dish bottom at 0.456 Sh.
  //
  // Ours measured 0.710 Sw, aspect 0.921 and a bottom at 0.518 Sh: the
  // dish read TALLER than wide and hung a third of the way down the
  // sprite, and the cause was not the face at all — it was the
  // back-shell, which was offset `rdDy + 30` with a 25 px vertical
  // radius and so hung 11 px BELOW the face's own bottom rim. On the
  // rip the back-shell is tucked, peeking below-RIGHT and ending level
  // with the face. Tucking it to `rdDy + 22` r24x22 and taking rdR/rdRv
  // 45/44 -> 43/39 gives 0.695 Sw, aspect 1.071 and a bottom at
  // 0.447 Sh — inside all three of §2.6's numbers and within 3% of the
  // rip on each.
  //
  // MEASURE IT OFF THE PINCH, NOT OFF `art-metrics`. The `radar:col`
  // clauses cannot see any of this: their dish predicate admits the
  // whole connected sprite, so they report Sw 1.000 and aspect 0.757
  // both before and after (docs/design-decisions.md). The numbers above
  // come from the sprite's own narrowest row between 30% and 75% of Sh.
  var rdR = 43, rdRv = 39, rdDx = cx + 2, rdDy = baseY - 96;
  g.fillStyle = RDR_IRN;                               // tapering trunnion
  g.beginPath();
  g.moveTo(cx - 15, rdCy - 8); g.lineTo(cx + 15, rdCy - 8);
  g.lineTo(rdDx + 8, rdDy + 34); g.lineTo(rdDx - 8, rdDy + 34);
  g.closePath(); g.fill(); outline(g, RDR_IRND);
  g.fillStyle = 'rgba(255,255,255,.11)';
  g.beginPath();
  g.moveTo(cx - 15, rdCy - 8); g.lineTo(cx - 9, rdCy - 8);
  g.lineTo(rdDx - 3, rdDy + 34); g.lineTo(rdDx - 8, rdDy + 34);
  g.closePath(); g.fill();
  g.strokeStyle = RDR_IRND; g.lineWidth = 1.2;         // two stringers and one brace
  for (var rdXI = 0; rdXI < 2; rdXI++) {
    var xk = rdXI ? 5 : -5;
    g.beginPath();
    g.moveTo(cx + xk * 1.9, rdCy - 8); g.lineTo(rdDx + xk, rdDy + 34); g.stroke();
  }
  g.beginPath();
  g.moveTo(cx - 12, rdCy - 9); g.lineTo(rdDx + 7, rdDy + 33); g.stroke();
  g.beginPath();
  g.moveTo(cx + 12, rdCy - 9); g.lineTo(rdDx - 7, rdDy + 33); g.stroke();
  g.fillStyle = '#3f444c';                             // back-shell, offset down-right
  g.beginPath(); g.ellipse(rdDx + 22, rdDy + 22, 24, 22, 0, 0, 6.29); g.fill();
  outline(g, RDR_IRND);
  g.fillStyle = 'rgba(0,0,0,.36)';
  g.beginPath(); g.ellipse(rdDx + 28, rdDy + 26, 16, 14, 0, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(20,24,30,.55)'; g.lineWidth = 1.4;
  for (var rdBkI = 0; rdBkI < 4; rdBkI++) {
    var rba = rdBkI / 4 * 3.14 + 0.4;
    g.beginPath();
    g.moveTo(rdDx + 22 - Math.cos(rba) * 23, rdDy + 22 - Math.sin(rba) * 21);
    g.lineTo(rdDx + 22 + Math.cos(rba) * 23, rdDy + 22 + Math.sin(rba) * 21);
    g.stroke();
  }
  // the face: pale panelled silver, dark navy over the upper-left sector
  var rgrd = g.createRadialGradient(rdDx - rdR * 0.24, rdDy + rdRv * 0.30, 3,
                                    rdDx, rdDy, rdR * 1.24);
  rgrd.addColorStop(0, RDR_DSHL);
  rgrd.addColorStop(0.62, RDR_DSH);
  rgrd.addColorStop(1, RDR_DSHD);
  g.fillStyle = rgrd;
  g.beginPath(); g.ellipse(rdDx, rdDy, rdR, rdRv, 0, 0, 6.29); g.fill();
  g.save();
  g.beginPath(); g.ellipse(rdDx, rdDy, rdR - 1.2, rdRv - 1.2, 0, 0, 6.29); g.clip();
  var rdA = function (k) { return [-1.571, -2.72, -0.42, 0.66, 2.34][k] + Math.sin(anP) * 0.20; };
  g.fillStyle = '#242833';                             // dark band across the top
  g.beginPath();
  g.moveTo(rdDx - rdR, rdDy - rdRv); g.lineTo(rdDx + rdR, rdDy - rdRv);
  g.lineTo(rdDx + rdR, rdDy - rdRv * 0.22);
  g.quadraticCurveTo(rdDx + rdR * 0.12, rdDy + rdRv * 0.04,
                     rdDx - rdR, rdDy - rdRv * 0.46);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(38,42,54,.50)';                  // its soft lower fringe
  g.beginPath();
  g.moveTo(rdDx - rdR, rdDy - rdRv * 0.46); g.lineTo(rdDx + rdR, rdDy - rdRv * 0.22);
  g.lineTo(rdDx + rdR, rdDy + rdRv * 0.02); g.lineTo(rdDx - rdR, rdDy - rdRv * 0.22);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(88,96,108,.30)';                 // one dimmer panel, lower right
  g.beginPath(); g.moveTo(rdDx, rdDy);
  g.ellipse(rdDx, rdDy, rdR, rdRv, 0, rdA(3), rdA(4)); g.closePath(); g.fill();
  srand(913);
  for (var rdPI = 0; rdPI < 130; rdPI++) {             // panel grain, so it is not glass
    var pk = rnd();
    g.fillStyle = pk < 0.46 ? 'rgba(108,114,124,.20)' : pk < 0.86 ? 'rgba(246,248,252,.18)'
               : 'rgba(40,46,56,.16)';
    g.beginPath();
    g.ellipse(rdDx + (rnd() - 0.5) * rdR * 1.95, rdDy + (rnd() - 0.5) * rdRv * 1.95,
              1.1 + rnd() * 2.4, 0.9 + rnd() * 1.7, 0, 0, 6.29);
    g.fill();
  }
  g.strokeStyle = 'rgba(58,66,78,.52)'; g.lineWidth = 2.6;    // concentric arcs
  g.beginPath(); g.ellipse(rdDx, rdDy + rdRv * 0.16, rdR * 0.60, rdRv * 0.52, 0,
                           0.34 + anP * 0.09, 2.86 + anP * 0.09); g.stroke();
  g.strokeStyle = 'rgba(96,104,118,.32)'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(rdDx, rdDy + rdRv * 0.10, rdR * 0.86, rdRv * 0.80, 0,
                           0.58 + anP * 0.09, 2.62 + anP * 0.09); g.stroke();
  g.strokeStyle = '#232733'; g.lineWidth = 3.4;        // the navy ribs, turning
  for (var rdSI = 0; rdSI < 5; rdSI++) {
    var rsa = rdA(rdSI);
    g.beginPath(); g.moveTo(rdDx, rdDy);
    g.lineTo(rdDx + Math.cos(rsa) * rdR * 1.05, rdDy + Math.sin(rsa) * rdRv * 1.05); g.stroke();
  }
  g.strokeStyle = 'rgba(158,164,174,.42)'; g.lineWidth = 1.1;
  for (rdSI = 0; rdSI < 5; rdSI++) {
    var rsb = rdA(rdSI);
    g.beginPath();
    g.moveTo(rdDx - 1.6 + Math.cos(rsb) * 8, rdDy + Math.sin(rsb) * 8);
    g.lineTo(rdDx - 1.6 + Math.cos(rsb) * rdR, rdDy + Math.sin(rsb) * rdRv); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.17)';               // specular, sweeping with the face
  g.beginPath();
  g.ellipse(rdDx + Math.cos(anP + 2.4) * rdR * 0.32, rdDy + Math.sin(anP + 2.4) * rdRv * 0.32,
            rdR * 0.30, rdRv * 0.20, -0.5, 0, 6.29);
  g.fill();
  g.restore();
  g.strokeStyle = '#8f959e'; g.lineWidth = 1.8;        // the rim
  g.beginPath(); g.ellipse(rdDx, rdDy, rdR, rdRv, 0, 0, 6.29); g.stroke();
  g.strokeStyle = '#222731'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(rdDx, rdDy, rdR, rdRv, 0, 3.30, 6.12); g.stroke();
  g.strokeStyle = 'rgba(238,240,244,.72)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(rdDx, rdDy, rdR - 2.6, rdRv - 2.6, 0, 0.50, 2.70); g.stroke();
  // the feed mast: one thin bar through the hub and out past the rim
  g.strokeStyle = '#181c24'; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(rdDx - 1, rdDy - rdRv * 0.24);
  g.lineTo(rdDx - 1, rdDy + rdRv * 1.06); g.stroke();
  g.strokeStyle = '#484f5c'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(rdDx - 2.2, rdDy - rdRv * 0.22);
  g.lineTo(rdDx - 2.2, rdDy + rdRv * 1.03); g.stroke();
  // the domed hub, with the house crescent on its left flank
  g.fillStyle = '#3c424c';
  g.beginPath(); g.ellipse(rdDx + 1, rdDy - rdRv * 0.30, 10.4, 9.8, 0, 0, 6.29); g.fill();
  g.fillStyle = '#828992';
  g.beginPath(); g.ellipse(rdDx, rdDy - rdRv * 0.32, 9.2, 8.6, 0, 0, 6.29); g.fill();
  outline(g, '#161b24');
  g.fillStyle = '#a9b0b8';
  g.beginPath(); g.ellipse(rdDx - 2, rdDy - rdRv * 0.32 - 2.4, 5.4, 4.6, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,255,255,.34)';
  g.beginPath(); g.ellipse(rdDx - 3.4, rdDy - rdRv * 0.32 - 3.6, 2.4, 1.8, 0, 0, 6.29); g.fill();
  g.strokeStyle = shade(col, 0.58); g.lineWidth = 3.4;   // the crescent
  g.beginPath(); g.ellipse(rdDx, rdDy - rdRv * 0.32, 9.7, 9.1, 0, 2.22, 4.02); g.stroke();
  g.strokeStyle = col; g.lineWidth = 2.1;
  g.beginPath(); g.ellipse(rdDx, rdDy - rdRv * 0.32, 9.5, 8.9, 0, 2.30, 3.95); g.stroke();
  // the aviation beacon on the roof machinery, blinking
  g.fillStyle = ph6 % 3 === 0 ? '#ffe9a2' : '#443f34';
  g.beginPath(); g.ellipse(cx + 13, rdCy - 16, 2.4, 2, 0, 0, 6.29); g.fill();
  if (ph6 % 3 === 0) {
    g.fillStyle = 'rgba(255,236,170,.20)';
    g.beginPath(); g.ellipse(cx + 13, rdCy - 16, 6, 5, 0, 0, 6.29); g.fill();
  }
} else {
  // Directorate never builds this (Soviet-only in RA2): plain block.
  prism(g, cx, baseY, fw * 0.8, fh * 0.8, 30, '#6a6f78', '#8a9099', '#2a2e36');
  g.fillStyle = col; g.fillRect(cx - fw * 0.5, baseY - 32, fw, 4);
}
