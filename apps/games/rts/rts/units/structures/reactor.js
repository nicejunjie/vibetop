// Iron Frontier — structures/reactor: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawReactor(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot, rnd = C.rnd, sov = C.sov, srand = C.srand;

// --- RA2 Nuclear Reactor ----------------------------------------------
// Rebuilt at 1:1 against the in-game shot
// (docs/ra2-ref/soviet-nuclear-reactor.png, 173x136, building 169x124,
// w/h 1.36) cross-checked against the snow-theatre shot
// (soviet-nuclear-reactor-ingame.png), which is the one that shows the
// GREEN core light inside every rim and between the skirt vents. Every
// measurement below is a row of that sprite scaled 0.90 about the
// concrete slab. No clean SHP rip exists on the wiki - `File:RA2
// Nuclear Reactor.gif` is the same screenshot.
// Reading it: THREE waisted brick cooling towers - a tall one behind,
// two shorter ones flanking - standing on a pale poured slab, each with
// a hard hourglass WAIST, a ring of black skirt VENTS at its flared
// foot, thin riser pipes up its face and a flared rim with a lit far
// wall. Between them squats the reactor vessel: a stack of dark rings
// under three house-red bands, with fat black ducts writhing out of its
// crown and diving into each tower. A pale instrument caisson sits on
// the slab at the front.
// COLOUR: `col` is the vessel's three bands, one riser pipe per tower,
// the rim beacons and the caisson band - the brick and the ducts are
// fixed. The reference itself only reads 8% house colour; ours sits at
// the bottom of the 12-18% house band rather than painting the towers.
// Six idle phases (`bph`): steam rolls off the two near rims, the core
// glow pulses between the towers and the rim beacons blink.
var anP = (bph || 0) * 6.283, ph6 = Math.round((bph || 0) * 6) % 6;
var NU_BRK = '#b09489', NU_BRKL = '#cdb3a7', NU_BRKD = '#3e302b';
var NU_PAD = '#9c9d92', NU_PADL = '#b8b9ad', NU_PADD = '#4a4b43';
var NU_DUC = '#464c53', NU_DUCD = '#111417', NU_DUCL = '#8b939b';
var NU_VES = '#6c6046', NU_VESL = '#8d7f5f', NU_VESD = '#241d13';
var NU_GRN = '#7ec828';
var nuPulse = 0.68 + 0.32 * Math.sin(anP);              // the core breathing
if (sov) {
  // ---- ground: plinths do the work, not a parade slab ------------------
  // RA2 stands this on bare theatre ground with a small poured pad under
  // the vessel; a full concrete diamond made it read as a board-game
  // piece (and buried the whole sprite in pale grey).
  g.fillStyle = 'rgba(0,0,0,.24)';
  plot(g, cx + 3, baseY + 5, fw * 1.86, fh * 1.86); g.fill();
  plot(g, cx, baseY + 1, fw * 1.86, fh * 1.86);
  g.fillStyle = 'rgba(74,72,58,.62)'; g.fill();
  g.save(); plot(g, cx, baseY + 1, fw * 1.86, fh * 1.86); g.clip();
  srand(431);
  for (var nuPI = 0; nuPI < 14; nuPI++) {                // scuffed dirt
    g.fillStyle = rnd() < 0.5 ? 'rgba(126,122,98,.34)' : 'rgba(40,42,34,.30)';
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * fw * 1.7, baseY + (rnd() - 0.5) * fh * 1.6,
              5 + rnd() * 9, 2 + rnd() * 4, 0, 0, 6.29);
    g.fill();
  }
  g.restore();
  g.fillStyle = NU_PADD;                                 // poured pad, vessel + caisson
  plot(g, cx + 3, baseY + 14, fw * 0.98, fh * 0.98); g.fill();
  plot(g, cx + 3, baseY + 12, fw * 0.94, fh * 0.94);
  g.fillStyle = NU_PAD; g.fill(); outline(g, NU_PADD);
  g.fillStyle = 'rgba(226,228,216,.22)';
  plot(g, cx + 3, baseY + 11, fw * 0.74, fh * 0.74); g.fill();

  // ---- a cooling tower --------------------------------------------------
  // The waist is the whole read: RA2's towers pinch to about half their
  // foot radius before flaring back out at the rim. A straight frustum
  // (what coolTower gives) reads as a cement silo, which is what the
  // previous pass looked like.
  var nuBez = function (rb, rw, rt, h, u) {             // [radius, dy] up the wall
    var d = 1 - u;
    return [rw + (rb - rw) * d * d * d + (rt - rw) * u * u * u, -h * u];
  };
  var nuTower = function (tx, ty, rb, rw, rt, h, seed, steamN) {
    g.fillStyle = 'rgba(0,0,0,.30)';                    // plinth
    g.beginPath(); g.ellipse(tx + 3, ty + 3, rb * 0.98, rb * 0.40, 0, 0, 6.29); g.fill();
    g.fillStyle = NU_PADD;
    g.beginPath(); g.ellipse(tx, ty + 1.4, rb * 1.00, rb * 0.41, 0, 0, 6.29); g.fill();
    g.fillStyle = '#7e7f74';
    g.beginPath(); g.ellipse(tx, ty - 1, rb * 0.94, rb * 0.38, 0, 0, 6.29); g.fill();
    outline(g, NU_PADD);
    g.strokeStyle = shade(col, 0.72); g.lineWidth = 2.4;    // painted kerb, front only
    g.beginPath(); g.ellipse(tx, ty - 0.8, rb * 0.94, rb * 0.38, 0, 0.62, 2.52); g.stroke();
    var nuSil = function () {
      var nuSJ, nuSB;
      g.beginPath(); g.moveTo(tx - rb, ty);
      for (nuSJ = 1; nuSJ <= 16; nuSJ++) {
        nuSB = nuBez(rb, rw, rt, h, nuSJ / 16);
        g.lineTo(tx - nuSB[0], ty + nuSB[1]);
      }
      for (nuSJ = 16; nuSJ >= 0; nuSJ--) {
        nuSB = nuBez(rb, rw, rt, h, nuSJ / 16);
        g.lineTo(tx + nuSB[0], ty + nuSB[1]);
      }
      g.closePath();
    };
    nuSil(); g.fillStyle = NU_BRK; g.fill();
    g.save(); nuSil(); g.clip();
    g.fillStyle = 'rgba(255,244,236,.20)'; g.fillRect(tx - rb, ty - h, rb * 0.52, h);
    g.fillStyle = 'rgba(28,20,16,.26)'; g.fillRect(tx + rb * 0.30, ty - h, rb, h);
    srand(seed);
    for (var nuMI = 0; nuMI < 44; nuMI++) {             // weathered brick mottle
      var nuMT = rnd(), nuMB = nuBez(rb, rw, rt, h, nuMT);
      g.fillStyle = rnd() < 0.5 ? NU_BRKL : 'rgba(78,58,50,.34)';
      g.beginPath();
      g.ellipse(tx + (rnd() - 0.5) * nuMB[0] * 1.8, ty + nuMB[1], 2.4 + rnd() * 3.4, 1.4 + rnd() * 1.6, 0, 0, 6.29);
      g.fill();
    }
    g.strokeStyle = 'rgba(58,42,36,.52)'; g.lineWidth = 1;   // brick courses
    for (var nuCI = 1; nuCI < 11; nuCI++) {
      var nuCB = nuBez(rb, rw, rt, h, nuCI / 11);
      g.beginPath();
      g.ellipse(tx, ty + nuCB[1], nuCB[0], nuCB[0] * 0.26, 0, 3.16, 6.28); g.stroke();
    }
    var nuVT = 0.17, nuVB = nuBez(rb, rw, rt, h, nuVT);  // the black skirt vents
    for (var nuVI = -6; nuVI <= 6; nuVI++) {
      var nuFB = nuVI / 6.6, nuGl = 0.5 + 0.5 * Math.cos(nuFB * 1.5);
      g.fillStyle = '#0d0c0b';
      g.beginPath();
      g.moveTo(tx + nuFB * rb - 2.4 * nuGl, ty + 1);
      g.lineTo(tx + nuFB * rb + 2.4 * nuGl, ty + 1);
      g.lineTo(tx + nuFB * nuVB[0] + 1.5 * nuGl, ty + nuVB[1]);
      g.lineTo(tx + nuFB * nuVB[0] - 1.5 * nuGl, ty + nuVB[1]);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(126,200,40,' + (0.05 + 0.09 * nuPulse * nuGl).toFixed(3) + ')';
      g.beginPath();
      g.moveTo(tx + nuFB * rb - 1.4 * nuGl, ty + 1);
      g.lineTo(tx + nuFB * rb + 1.4 * nuGl, ty + 1);
      g.lineTo(tx + nuFB * nuVB[0], ty + nuVB[1] + 3);
      g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(196,182,172,.60)'; g.lineWidth = 1.2;   // pale vent ribs
    for (var nuRI = -6; nuRI <= 7; nuRI++) {
      var nuRF = (nuRI - 0.5) / 6.6;
      g.beginPath();
      g.moveTo(tx + nuRF * rb, ty + 1);
      g.lineTo(tx + nuRF * nuVB[0], ty + nuVB[1]); g.stroke();
    }
    var nuP1 = nuBez(rb, rw, rt, h, 0.94), nuP2 = nuBez(rb, rw, rt, h, 0.30);
    for (var nuQJ = 0; nuQJ < 15; nuQJ++) {                      // one dashed house cable
      var nuQT = 0.05 + nuQJ * 0.062, nuQA = nuBez(rb, rw, rt, h, nuQT);
      var nuQB = nuBez(rb, rw, rt, h, nuQT + 0.040);
      var nuQF = 0.42 + 0.18 * nuQT;
      g.strokeStyle = nuQJ % 4 === 3 ? shade(col, 0.72) : shade(col, 0.86); g.lineWidth = 2.9;
      g.beginPath();
      g.moveTo(tx - nuQA[0] * nuQF, ty + nuQA[1]);
      g.lineTo(tx - nuQB[0] * nuQF, ty + nuQB[1]); g.stroke();
    }
    g.strokeStyle = 'rgba(34,38,42,.82)'; g.lineWidth = 1.8;      // two grey twins
    for (var nuGI = 0; nuGI < 2; nuGI++) {
      var nuGF = nuGI ? 0.62 : 0.16;
      g.beginPath();
      g.moveTo(tx + nuP1[0] * nuGF, ty + nuP1[1]);
      g.quadraticCurveTo(tx + nuP2[0] * (nuGF + 0.16), ty + nuP2[1], tx + rb * (nuGF * 0.8), ty + 1);
      g.stroke();
    }
    g.restore();
    nuSil(); outline(g, NU_BRKD);

    // ---- the rim: flared lip, lit far wall, green core ----------------
    g.fillStyle = '#3a2f29';
    g.beginPath(); g.ellipse(tx, ty - h, rt * 1.04, rt * 0.38, 0, 0, 6.29); g.fill();
    outline(g, NU_BRKD);
    g.fillStyle = '#171210';
    g.beginPath(); g.ellipse(tx, ty - h + 0.6, rt * 0.80, rt * 0.28, 0, 0, 6.29); g.fill();
    g.fillStyle = shade(NU_BRK, 0.94);                  // far inner wall, lit
    g.beginPath(); g.ellipse(tx, ty - h + 1.2, rt * 0.76, rt * 0.26, 0, 3.30, 6.14); g.fill();
    g.fillStyle = 'rgba(126,200,40,' + (0.13 + 0.15 * nuPulse).toFixed(3) + ')';
    g.beginPath(); g.ellipse(tx, ty - h + 2.0, rt * 0.46, rt * 0.15, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(206,246,150,' + (0.09 + 0.14 * nuPulse).toFixed(3) + ')';
    g.beginPath(); g.ellipse(tx, ty - h + 2.0, rt * 0.24, rt * 0.08, 0, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(236,228,220,.50)'; g.lineWidth = 1.2;   // rim highlight
    g.beginPath(); g.ellipse(tx, ty - h - 0.6, rt * 1.04, rt * 0.38, 0, 3.34, 6.10); g.stroke();
    for (var nuBI = -1; nuBI <= 1; nuBI += 2) {          // rim beacons
      g.fillStyle = ((ph6 + (nuBI > 0 ? 3 : 0)) % 6) < 3 ? col : shade(col, 0.72);
      g.beginPath();
      g.ellipse(tx + nuBI * rt * 0.72, ty - h - 1.4, 2.2, 2.2, 0, 0, 6.29); g.fill();
    }
    for (var nuSI = 0; nuSI < steamN; nuSI++) {          // steam rolling off
      var nuST = ((bph || 0) + nuSI / steamN) % 1;
      g.fillStyle = 'rgba(226,234,228,' + (0.17 * (1 - nuST)).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(tx + (nuSI % 2 ? 3 : -4) * nuST * 2.2, ty - h - 3 - nuST * 15,
                rt * (0.40 + nuST * 0.50), rt * (0.20 + nuST * 0.26), 0, 0, 6.29);
      g.fill();
    }
  };

  // ---- a duct: a fat ribbed tentacle ------------------------------------
  var nuDuct = function (x0, y0, kx, ky, x1, y1, w) {
    g.lineCap = 'round';
    g.strokeStyle = NU_DUCD; g.lineWidth = w + 2.6;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(kx, ky, x1, y1); g.stroke();
    g.strokeStyle = NU_DUC; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(kx, ky, x1, y1); g.stroke();
    g.strokeStyle = 'rgba(30,34,38,.55)'; g.lineWidth = w * 0.30;   // rib shadows
    for (var nuDI = 1; nuDI < 9; nuDI++) {
      var nuDT = nuDI / 9, nuDU = 1 - nuDT;
      var nuDX = nuDU * nuDU * x0 + 2 * nuDU * nuDT * kx + nuDT * nuDT * x1;
      var nuDY = nuDU * nuDU * y0 + 2 * nuDU * nuDT * ky + nuDT * nuDT * y1;
      var nuTX = 2 * nuDU * (kx - x0) + 2 * nuDT * (x1 - kx);
      var nuTY = 2 * nuDU * (ky - y0) + 2 * nuDT * (y1 - ky);
      var nuTL = Math.sqrt(nuTX * nuTX + nuTY * nuTY) || 1;
      g.beginPath();
      g.moveTo(nuDX + nuTY / nuTL * w * 0.48, nuDY - nuTX / nuTL * w * 0.48);
      g.lineTo(nuDX - nuTY / nuTL * w * 0.48, nuDY + nuTX / nuTL * w * 0.48);
      g.stroke();
    }
    g.strokeStyle = NU_DUCL; g.lineWidth = w * 0.22;
    g.beginPath();
    g.moveTo(x0 - w * 0.26, y0 - w * 0.24);
    g.quadraticCurveTo(kx - w * 0.26, ky - w * 0.24, x1 - w * 0.26, y1 - w * 0.24);
    g.stroke();
  };

  // ---- back tower, then the vessel, then its ducts over the top --------
  nuTower(cx - 14, baseY - 3, 33, 18, 23, 77, 71, 1);
  var nuVX = cx + 1, nuVY = baseY + 6;

  // ---- the reactor vessel ----------------------------------------------
  g.fillStyle = 'rgba(0,0,0,.32)';
  g.beginPath(); g.ellipse(nuVX + 4, nuVY + 3, 26, 10, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(126,200,40,' + (0.05 + 0.07 * nuPulse).toFixed(3) + ')';
  g.beginPath(); g.ellipse(nuVX, nuVY - 34, 38, 20, 0, 0, 6.29); g.fill();
  cylinder(g, nuVX, nuVY, 27, 40, NU_VES, NU_VESL, NU_VESD);
  for (var nuKI = 0; nuKI < 6; nuKI++) {                 // the stacked lower rings
    var nuKY = nuVY - 1 - nuKI * 3.4;
    g.fillStyle = nuKI % 2 ? shade(NU_VES, 1.16) : shade(NU_VES, 0.82);
    g.fillRect(nuVX - 27, nuKY - 2.8, 54, 2.8);
    g.fillStyle = 'rgba(24,18,10,.46)'; g.fillRect(nuVX - 27, nuKY - 0.7, 54, 0.8);
  }
  g.fillStyle = '#4e4433';                               // crown cap
  g.beginPath(); g.ellipse(nuVX, nuVY - 40, 27, 8.4, 0, 0, 6.29); g.fill();
  outline(g, NU_VESD);
  g.fillStyle = '#201a12';
  g.beginPath(); g.ellipse(nuVX + 2, nuVY - 41, 12, 3.8, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(160,232,70,' + (0.20 + 0.30 * nuPulse).toFixed(3) + ')';
  g.beginPath(); g.ellipse(nuVX + 2, nuVY - 41.4, 7.6, 2.4, 0, 0, 6.29); g.fill();
  for (var nuHI = 0; nuHI < 4; nuHI++) {                 // four house bands
    var nuHY = nuVY - 14 - nuHI * 6.6;
    g.fillStyle = shade(col, 0.72); g.fillRect(nuVX - 27, nuHY - 6.4, 54, 6.4);
    g.fillStyle = shade(col, 0.90); g.fillRect(nuVX - 27, nuHY - 6.0, 54, 3.4);
    g.fillStyle = col; g.fillRect(nuVX - 27, nuHY - 5.6, 54, 1.4);
    g.fillStyle = 'rgba(214,206,186,.90)'; g.fillRect(nuVX - 27, nuHY - 0.9, 54, 1.1);
  }
  g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(nuVX + 14, nuVY - 40, 13, 40);
  g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(nuVX - 27, nuVY - 40, 5, 40);
  g.fillStyle = shade(col, 0.72); g.fillRect(nuVX - 27, nuVY - 3.4, 54, 3.4);
  g.fillStyle = shade(col, 0.94); g.fillRect(nuVX - 27, nuVY - 3.4, 54, 1.4);

  // ---- the ducts writhing out of the crown -----------------------------
  // They leave the crown at four heights and arc HIGH: in the sprite this
  // tangle is the reactor's silhouette, not a detail behind the drum.
  nuDuct(nuVX - 15, nuVY - 34, cx - 42, baseY - 58, cx - 46, baseY - 22, 8.0);
  nuDuct(nuVX + 14, nuVY - 36, cx + 36, baseY - 64, cx + 46, baseY - 30, 7.2);
  nuDuct(nuVX - 7, nuVY - 38, cx - 20, baseY - 74, cx - 16, baseY - 58, 6.6);
  nuDuct(nuVX + 5, nuVY - 38, cx + 8, baseY - 66, cx + 22, baseY - 48, 5.4);
  nuDuct(nuVX - 22, nuVY - 22, nuVX - 42, nuVY - 34, cx - 36, baseY - 8, 6.4);
  nuDuct(nuVX + 21, nuVY - 30, nuVX + 44, nuVY - 30, cx + 38, baseY - 14, 5.6);

  // ---- the two near towers ---------------------------------------------
  nuTower(cx + 60, baseY + 15, 31, 17, 22, 59, 37, 3);
  nuTower(cx - 61, baseY + 21, 30, 16, 21, 56, 53, 3);
  nuDuct(nuVX - 14, nuVY - 8, cx - 26, baseY + 8, cx - 34, baseY + 2, 4.6);
  nuDuct(nuVX + 14, nuVY - 12, cx + 26, baseY + 2, cx + 30, baseY + 6, 4.4);

  // ---- the instrument caisson on the slab, front-centre -----------------
  var nuCX = cx + 6, nuCY = baseY + 26;
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.beginPath(); g.ellipse(nuCX + 3, nuCY + 2, 18, 6, 0, 0, 6.29); g.fill();
  g.fillStyle = '#2b2f30';                               // two dark legs
  g.fillRect(nuCX - 12, nuCY - 9, 5, 9); g.fillRect(nuCX + 7, nuCY - 9, 5, 9);
  prism(g, nuCX, nuCY - 8, 16, 6.4, 10, '#9aa09a', '#c4cac2', '#2c302c');
  g.fillStyle = shade(col, 0.74); g.fillRect(nuCX - 15, nuCY - 19.8, 30, 4.4);
  g.fillStyle = col; g.fillRect(nuCX - 15, nuCY - 19.8, 30, 1.6);
  g.fillStyle = '#1e2122';                               // instrument ports
  for (var nuOI = -1; nuOI <= 1; nuOI++) {
    g.beginPath(); g.ellipse(nuCX + nuOI * 6, nuCY - 12, 2.2, 2.2, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(206,214,206,.70)';
    g.beginPath(); g.ellipse(nuCX + nuOI * 6 - 0.6, nuCY - 12.7, 0.9, 0.9, 0, 0, 6.29); g.fill();
    g.fillStyle = '#1e2122';
  }
  drums(g, cx - 60, baseY - 12, 2, '#4e5240');
} else {
  // Directorate never builds this (Soviet-only in RA2): plain block.
  prism(g, cx, baseY, fw * 0.8, fh * 0.8, 30, '#6a6f78', '#8a9099', '#2a2e36');
  g.fillStyle = col; g.fillRect(cx - fw * 0.5, baseY - 32, fw, 4);
}
}
