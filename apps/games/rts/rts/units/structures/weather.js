// Iron Frontier — structures/weather: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.





function drawWeather(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g;

// --- RA2 Weather Control Device (GAWEAT) ----------------------------
// Rebuilt against `allied-weather-control-idle.png` (146x135, w/h 1.08):
// a pale octagonal deck, a big dark steel ORB on a ribbed column with a
// white cross mast on top, and four smaller orbs on stubby legs at the
// deck's corners. Six idle phases arc lightning between the small orbs
// and the big one and swing the mast's beacon.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var WD_ORB = '#3f4348', WD_ORBL = '#9fa4ab', WD_ORBD = '#1d1f22', WD_ED = '#24262a';
var WD_DK = '#b9bec6';

// ---- octagonal deck -----------------------------------------------
g.fillStyle = WD_DK;
g.beginPath();
for (var wdO = 0; wdO < 8; wdO++) {
  var wa = wdO * 0.7854 + 0.3927;
  var wx2 = cx + Math.cos(wa) * fw * 0.94, wy2 = baseY + Math.sin(wa) * fh * 0.94;
  if (wdO) g.lineTo(wx2, wy2); else g.moveTo(wx2, wy2);
}
g.closePath(); g.fill(); outline(g, '#5c6068');
g.strokeStyle = shade(col, 0.86); g.lineWidth = 3;          // painted deck rim, the rip's house ring
g.stroke();
g.save(); g.clip();
g.strokeStyle = 'rgba(70,76,86,.28)'; g.lineWidth = 1;
for (var wdG = -3; wdG <= 3; wdG++) {
  g.beginPath(); g.moveTo(cx + wdG * 22 - fw, baseY + wdG * 11 + fh); g.lineTo(cx + wdG * 22 + fw, baseY + wdG * 11 - fh); g.stroke();
  g.beginPath(); g.moveTo(cx - wdG * 22 - fw, baseY - wdG * 11 + fh); g.lineTo(cx - wdG * 22 + fw, baseY - wdG * 11 - fh); g.stroke();
}
// the house-coloured landing chevron the rip carries on the near deck
g.fillStyle = shade(col, 0.92);
g.beginPath();
g.moveTo(cx - 26, baseY + fh * 0.44); g.lineTo(cx, baseY + fh * 0.20);
g.lineTo(cx + 26, baseY + fh * 0.44); g.lineTo(cx + 26, baseY + fh * 0.60);
g.lineTo(cx, baseY + fh * 0.36); g.lineTo(cx - 26, baseY + fh * 0.60);
g.closePath(); g.fill();
g.fillStyle = 'rgba(255,255,255,.55)';
g.fillRect(cx - 30, baseY + fh * 0.66, 60, 2.6);
g.restore();

// ---- four corner orbs ---------------------------------------------
var wdSmall = [];
var wdOrb = function (ox2, oy2, r2) {
  cylinder(g, ox2, oy2, r2 * 0.56, r2 * 0.9, '#767d88', '#8b929d', WD_ED);   // stubby leg
  g.fillStyle = shade(col, 0.9);
  g.fillRect(ox2 - r2 * 0.60, oy2 - r2 * 0.9 - 2, r2 * 1.2, 2.6);            // house collar
  var oc = oy2 - r2 * 0.9 - r2 * 0.86;
  g.fillStyle = WD_ORB;
  g.beginPath(); g.arc(ox2, oc, r2, 0, 6.29); g.fill(); outline(g, WD_ED);
  g.fillStyle = 'rgba(220,230,244,.30)';
  g.beginPath(); g.ellipse(ox2 - r2 * 0.32, oc - r2 * 0.34, r2 * 0.44, r2 * 0.32, -0.6, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(0,0,0,.26)';
  g.beginPath(); g.ellipse(ox2 + r2 * 0.40, oc + r2 * 0.28, r2 * 0.44, r2 * 0.40, 0, 0, 6.29); g.fill();
  g.strokeStyle = WD_ORBD; g.lineWidth = 1.2;                                 // banding
  g.beginPath(); g.ellipse(ox2, oc, r2, r2 * 0.34, 0, 0, 6.29); g.stroke();
  g.fillStyle = '#cfd8e4';                                                    // emitter stud
  g.beginPath(); g.arc(ox2, oc - r2 * 0.92, 1.9, 0, 6.29); g.fill();
  wdSmall.push([ox2, oc - r2 * 0.92]);
};
wdOrb(cx - fw * 0.52, baseY + fh * 0.10, 11);
wdOrb(cx + fw * 0.52, baseY + fh * 0.10, 11);
wdOrb(cx - fw * 0.16, baseY + fh * 0.52, 11.5);
wdOrb(cx + fw * 0.16, baseY + fh * 0.52, 11.5);

// ---- the column and the great orb ---------------------------------
var wdCy = baseY + fh * 0.04;
cylinder(g, cx, wdCy, fw * 0.19, 40, '#6f7681', '#868d99', WD_ED);
g.strokeStyle = 'rgba(24,28,36,.42)'; g.lineWidth = 1;
for (var wdR = 1; wdR <= 3; wdR++) {
  g.beginPath(); g.moveTo(cx - fw * 0.19, wdCy - wdR * 11); g.lineTo(cx + fw * 0.19, wdCy - wdR * 11); g.stroke();
}
g.fillStyle = col;                                          // house band on the column
g.fillRect(cx - fw * 0.20, wdCy - 24, fw * 0.40, 5);
g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(cx + fw * 0.07, wdCy - 24, fw * 0.13, 5);

var wdR2 = fw * 0.42, wdOy = wdCy - 40 - wdR2 * 0.80;
g.fillStyle = WD_ORB;
g.beginPath(); g.arc(cx, wdOy, wdR2, 0, 6.29); g.fill(); outline(g, WD_ED);
g.save(); g.beginPath(); g.arc(cx, wdOy, wdR2, 0, 6.29); g.clip();
g.fillStyle = 'rgba(216,228,244,.34)';
g.beginPath(); g.ellipse(cx - wdR2 * 0.34, wdOy - wdR2 * 0.36, wdR2 * 0.46, wdR2 * 0.32, -0.6, 0, 6.29); g.fill();
g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(cx + wdR2 * 0.44, wdOy + wdR2 * 0.30, wdR2 * 0.50, wdR2 * 0.46, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(18,22,28,.50)'; g.lineWidth = 1.4;    // meridian + equator seams
g.beginPath(); g.ellipse(cx, wdOy, wdR2, wdR2 * 0.32, 0, 0, 6.29); g.stroke();
g.beginPath(); g.ellipse(cx, wdOy, wdR2 * 0.30, wdR2, 0, 0, 6.29); g.stroke();
g.fillStyle = 'rgba(216,228,242,' + (0.16 + 0.34 * (0.5 + 0.5 * anS)).toFixed(3) + ')';
g.beginPath(); g.ellipse(cx, wdOy + wdR2 * 0.10, wdR2 * 0.70, wdR2 * 0.24, 0, 0, 6.29); g.fill();
g.fillStyle = shade(col, 0.92);                             // house band across the equator
g.fillRect(cx - wdR2, wdOy - 3, wdR2 * 2, 6);
g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(cx + wdR2 * 0.34, wdOy - 3, wdR2 * 0.66, 6);
g.restore();
g.fillStyle = shade(col, 0.94);                              // house ring where it meets the mast
g.beginPath(); g.ellipse(cx, wdOy - wdR2 * 0.82, wdR2 * 0.40, wdR2 * 0.15, 0, 0, 6.29); g.fill();

// white cross mast
g.strokeStyle = '#e9edf3'; g.lineWidth = 3.4; g.lineCap = 'round';
g.beginPath(); g.moveTo(cx, wdOy - wdR2 * 0.86); g.lineTo(cx, wdOy - wdR2 - 16); g.stroke();
g.lineWidth = 2.6;
g.beginPath(); g.moveTo(cx - 12, wdOy - wdR2 - 9); g.lineTo(cx + 12, wdOy - wdR2 - 9); g.stroke();
g.fillStyle = ph6 % 3 === 0 ? '#dff0ff' : '#93a3b8';
g.beginPath(); g.arc(cx, wdOy - wdR2 - 17.5, 2.6, 0, 6.29); g.fill();

// ---- idle: lightning crawling from the small orbs to the great one --
for (var wdL = 0; wdL < wdSmall.length; wdL++) {
  if ((wdL + ph6) % 4 > 1) continue;
  var sxp = wdSmall[wdL][0], syp = wdSmall[wdL][1];
  var exp2 = cx + (sxp < cx ? -1 : 1) * wdR2 * 0.44, eyp = wdOy + wdR2 * 0.44;
  for (var wdP = 0; wdP < 2; wdP++) {
    g.strokeStyle = wdP ? 'rgba(240,246,254,.92)' : 'rgba(208,222,250,.45)';
    g.lineWidth = wdP ? 1.2 : 3.6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(sxp, syp);
    for (var wdK = 1; wdK < 6; wdK++) {
      var wq = wdK / 6;
      g.lineTo(sxp + (exp2 - sxp) * wq + Math.sin(wdK * 3.1 + wdL * 2.2 + anP) * 5 * (1 - Math.abs(wq - 0.5) * 1.4),
               syp + (eyp - syp) * wq + Math.cos(wdK * 2.6 + wdL) * 3);
    }
    g.lineTo(exp2, eyp); g.stroke();
  }
}
}
