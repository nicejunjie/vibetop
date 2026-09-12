// ─── structures/purifier ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// --- RA2 Ore Purifier --------------------------------------------------
// Rebuilt at 1:1 against the RED-owner MAKE rip
// (docs/ra2-ref/allied-ore-purifier-anim-last.png, last frame, 127x105
// once the magenta shadow index is masked, w/h 1.21). Every band below
// is a measured row of that sprite, scaled 1.067 (our 128px plot over
// RA2's 120px one) about the mound's widest row.
// Reading it: a WEDDING-CAKE smelter squatting on a rough olive spoil
// mound - a broad fluted silver drum, a recessed ring of GLOWING MOLTEN
// ORE with dark slots turning inside it, an ore-crusted cone with a
// scalloped hem, a house collar, a slim gunmetal neck carrying a black
// star and a scallop-rimmed chute with a black bore. TWO conduit rings
// lie round the mound; two house-painted elbows rear up the cone's
// flanks, and a fat red-white-red clamp runs down the drum's right
// front into the spoil.
// COLOUR: `col` is the two elbows, the clamp's outer bars, the neck
// collar and the two marker lamps. The conduit itself is slate - the
// sprite's fixed navy would paint the opposing hue onto a red owner, so
// every cool tone here is held under HSV s=0.40.
// Six idle phases (`bph`): the molten band's slots turn like a
// centrifuge, its glow breathes, the chute throat flares with it and
// the pad lamps blink.
var anP = (bph || 0) * 6.283, ph6 = Math.round((bph || 0) * 6) % 6;
var PU_MND = '#75704a', PU_MNDD = '#2f2c19', PU_MNDL = '#928c5c';
var PU_SIL = '#90938a', PU_SILL = '#c8cbc2', PU_SILD = '#52554e';
var PU_CRU = '#7c7855', PU_CRUD = '#4c4a32';
var PU_GUN = '#1f232b', PU_GUNL = '#525a66';
var PU_DUC = '#232939', PU_DUCL = '#9aa3b0';
var PU_HOT = '#ffa424', PU_HOTL = '#ffe8ad', PU_HOTD = '#6f3005';
var PU_EDG = '#1a1815';
var puGlow = 0.82 + 0.18 * Math.sin(anP);              // the smelt breathing

// ---- the spoil mound the smelter squats on ---------------------------
// No parade concrete: the sprite stands on broken ore-bearing ground,
// so the shared hardstanding diamond is buried under it.
diamond(g, cx, baseY, fw * 2.04, fh * 2.10);
g.fillStyle = PU_MNDD; g.fill();
srand(613);
var puMP = [];
for (var puMI = 0; puMI < 15; puMI++) {                  // chunky broken rim, not a plate
  var puMA = puMI / 15 * 6.283, puMR = 0.86 + rnd() * 0.22;
  puMP.push([cx - 2 + Math.cos(puMA) * 67 * puMR, baseY + 3 + Math.sin(puMA) * 35 * puMR]);
}
var puMPath = function () {
  g.beginPath(); g.moveTo(puMP[0][0], puMP[0][1]);
  for (var puMJ = 1; puMJ < puMP.length; puMJ++) g.lineTo(puMP[puMJ][0], puMP[puMJ][1]);
  g.closePath();
};
puMPath(); g.fillStyle = PU_MND; g.fill(); puMPath(); outline(g, PU_MNDD);
g.save(); puMPath(); g.clip();
for (var puMS = 0; puMS < 36; puMS++) {                 // broken spoil, in bands
  var puSA = rnd() * 6.283, puSR = Math.sqrt(rnd());
  g.fillStyle = rnd() < 0.46 ? PU_MNDL : PU_MNDD;
  g.beginPath();
  g.ellipse(cx - 2 + Math.cos(puSA) * puSR * 62, baseY + 3 + Math.sin(puSA) * puSR * 31,
            3.4 + rnd() * 4.6, 1.5 + rnd() * 1.8, 0, 0, 6.29);
  g.fill();
}
g.fillStyle = 'rgba(28,26,14,.26)';                     // the smelter's own shadow
g.beginPath(); g.ellipse(cx + 8, baseY + 12, 44, 18, 0, 0, 6.29); g.fill();
g.restore();

// ---- the conduit belt round the spoil, back half first ------------
// One fat belt, as in the sprite - two clean concentric hoops read as
// a ring-toss game, which is exactly what the first pass looked like.
var puBelt = function (a0, a1, w) {
  g.lineCap = 'butt';
  g.strokeStyle = PU_EDG; g.lineWidth = w + 3;
  g.beginPath(); g.ellipse(cx - 2, baseY + 3, 61, 27, 0, a0, a1); g.stroke();
  g.strokeStyle = PU_DUC; g.lineWidth = w;
  g.beginPath(); g.ellipse(cx - 2, baseY + 3, 61, 27, 0, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(16,19,26,.55)'; g.lineWidth = w * 0.34;
  g.beginPath(); g.ellipse(cx - 2, baseY + 3 + w * 0.30, 61, 27, 0, a0, a1); g.stroke();
};
var puSpec = function (a0, a1) {                         // the belt's white run
  g.strokeStyle = PU_DUCL; g.lineWidth = 2.4;
  g.beginPath(); g.ellipse(cx - 2, baseY + 1.4, 61, 27, 0, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(238,242,248,.72)'; g.lineWidth = 1.1;
  g.beginPath(); g.ellipse(cx - 2, baseY + 0.8, 61, 27, 0, a0, a1); g.stroke();
};
puBelt(3.24, 6.18, 13);

// ---- the fluted main drum ---------------------------------------------
var puFB = baseY + 10, puFT = baseY - 20;               // foot / top
var puDrumPath = function () {
  g.beginPath();
  g.moveTo(cx - 38, puFB); g.lineTo(cx - 30, puFT);
  g.lineTo(cx + 30, puFT); g.lineTo(cx + 38, puFB);
  g.closePath();
};
g.fillStyle = PU_SIL;
g.beginPath(); g.ellipse(cx, puFB, 38, 12, 0, 0, 3.15); g.fill();
puDrumPath(); g.fill();
g.save();
g.beginPath();
g.moveTo(cx - 38, puFB + 12); g.lineTo(cx - 30, puFT);
g.lineTo(cx + 30, puFT); g.lineTo(cx + 38, puFB + 12);
g.closePath(); g.clip();
for (var puVI = -10; puVI <= 10; puVI++) {              // cog-tooth flutes
  g.fillStyle = puVI % 2 ? 'rgba(22,26,22,.38)' : 'rgba(255,255,255,.13)';
  g.fillRect(cx + puVI * 3.3 - 0.85, puFT - 1, 1.7, puFB - puFT + 14);
}
g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(cx - 38, puFT, 11, 40);
g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(cx + 17, puFT, 22, 40);
g.strokeStyle = 'rgba(28,30,24,.62)'; g.lineWidth = 1.7;  // ring courses
for (var puCI = 1; puCI <= 3; puCI++) {
  g.beginPath(); g.ellipse(cx, puFT + 30 * puCI / 4, 33.0, 10.0, 0, 0.12, 3.02); g.stroke();
}
g.restore();
puDrumPath(); outline(g, PU_SILD);

// ---- the molten ore ring on the drum's shoulder ---------------------
// In the sprite this is a THIN torus of glowing ore round the drum's
// rim with the cone rising from inside it, not a tall lit band.
g.fillStyle = 'rgba(255,150,40,' + (0.08 + 0.05 * puGlow).toFixed(3) + ')';
g.beginPath(); g.ellipse(cx, baseY - 22, 44, 19, 0, 0, 6.29); g.fill();
var puGPath = function () { g.beginPath(); g.ellipse(cx, baseY - 21, 30, 9.4, 0, 0, 6.29); };
puGPath(); g.fillStyle = PU_HOTD; g.fill();
g.save(); puGPath(); g.clip();
g.fillStyle = PU_HOT; g.fillRect(cx - 30, baseY - 31, 60, 20);
g.fillStyle = PU_HOTL;
g.globalAlpha = puGlow; g.fillRect(cx - 30, baseY - 26, 60, 2.2); g.globalAlpha = 1;
g.fillStyle = 'rgba(255,232,173,.30)'; g.fillRect(cx - 30, baseY - 31, 20, 20);
g.fillStyle = 'rgba(92,38,6,.34)'; g.fillRect(cx + 15, baseY - 31, 15, 20);
g.fillStyle = 'rgba(48,18,2,.88)';                       // the turning slots
for (var puSI = 0; puSI < 9; puSI++) {
  var puSX = cx - 32 + (((puSI + (bph || 0)) * 7.1) % 64);
  g.fillRect(puSX - 1.2, baseY - 32, 2.4, 22);
}
g.restore();
puGPath(); outline(g, '#2a1204');
g.fillStyle = PU_SILD;                                   // the dark inner throat
g.beginPath(); g.ellipse(cx, baseY - 24.5, 22, 6.6, 0, 0, 6.29); g.fill();
outline(g, '#2c2f28');

// ---- the ore-crusted cone ---------------------------------------------
var puKB = baseY - 25, puKT = baseY - 45;
var puConePath = function () {
  g.beginPath();
  g.moveTo(cx - 21, puKB); g.lineTo(cx - 15, puKT);
  g.lineTo(cx + 15, puKT); g.lineTo(cx + 21, puKB);
  g.closePath();
};
puConePath(); g.fillStyle = shade(PU_SIL, 0.88); g.fill();
g.save(); puConePath(); g.clip();
g.fillStyle = 'rgba(255,255,255,.20)'; g.fillRect(cx - 21, puKT, 8, 22);
g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(cx + 11, puKT, 11, 22);
srand(211);
for (var puKI = 0; puKI < 40; puKI++) {                  // ore crust, low on the cone
  var puKX = cx - 20 + rnd() * 40, puKY = puKB - rnd() * rnd() * 17;
  g.fillStyle = puKI % 3 ? PU_CRU : PU_CRUD;
  g.beginPath(); g.ellipse(puKX, puKY, 1.5 + rnd() * 2.2, 0.9 + rnd() * 1.3, 0, 0, 6.29); g.fill();
}
g.restore();
puConePath(); outline(g, '#43463f');
g.fillStyle = PU_SILD;                                   // scalloped hem tabs
for (var puTI = -4; puTI <= 4; puTI++) {
  g.beginPath(); g.ellipse(cx + puTI * 4.7, puKB - 0.4, 2.0, 1.6, 0, 0, 6.29); g.fill();
}
g.fillStyle = PU_SILL;                                   // pale shoulder lip
g.beginPath(); g.ellipse(cx, puKT, 15, 4.7, 0, 0, 6.29); g.fill();
outline(g, PU_SILD);
g.fillStyle = 'rgba(0,0,0,.16)';
g.beginPath(); g.ellipse(cx + 1.6, puKT + 0.6, 12, 3.4, 0, 0, 6.29); g.fill();

// ---- house collar, gunmetal neck, chute --------------------------------
g.fillStyle = shade(col, 0.74); g.fillRect(cx - 12, baseY - 50, 24, 6.2);
g.fillStyle = col; g.fillRect(cx - 12, baseY - 49.4, 24, 4.2);
g.fillStyle = shade(col, 1.22); g.fillRect(cx - 12, baseY - 49.4, 24, 1.4);
g.fillStyle = 'rgba(240,242,236,.62)'; g.fillRect(cx - 12, baseY - 50.8, 24, 1.2);
g.fillStyle = PU_EDG; g.fillRect(cx - 12, baseY - 44, 24, 1);
cylinder(g, cx, baseY - 45, 7.5, 19, PU_GUN, PU_GUNL, '#0b0d11');
g.fillStyle = 'rgba(150,160,172,.22)'; g.fillRect(cx - 7.5, baseY - 64, 2.6, 19);
g.fillStyle = '#0a0c10';                                 // the black star on the neck
for (var puRI = 0; puRI < 8; puRI++) {
  var puRA = puRI * 0.7854, puRR = puRI % 2 ? 1.8 : 4.4;
  var puRX = cx + Math.cos(puRA) * puRR, puRY = baseY - 53 + Math.sin(puRA) * puRR * 0.76;
  if (puRI === 0) { g.beginPath(); g.moveTo(puRX, puRY); } else g.lineTo(puRX, puRY);
}
g.closePath(); g.fill();
cylinder(g, cx, baseY - 64, 10, 9, PU_SIL, PU_SILL, PU_SILD);
g.fillStyle = PU_SILL;                                   // scalloped rim teeth
for (var puEI = -3; puEI <= 3; puEI++) {
  g.beginPath(); g.ellipse(cx + puEI * 3.0, baseY - 74.2, 1.7, 2.2, 0, 0, 6.29); g.fill();
}
g.fillStyle = PU_SILD;
g.beginPath(); g.ellipse(cx, baseY - 73, 10, 3.9, 0, 0, 6.29); g.fill();
outline(g, PU_SILD);
g.fillStyle = '#12151b';                                 // the black bore
g.beginPath(); g.ellipse(cx, baseY - 73.4, 6.3, 2.4, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(255,150,40,' + (0.14 + 0.20 * puGlow).toFixed(3) + ')';
g.beginPath(); g.ellipse(cx, baseY - 72.8, 4.2, 1.5, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(255,176,70,' + (0.03 + 0.05 * puGlow).toFixed(3) + ')';
g.beginPath(); g.ellipse(cx, baseY - 77, 9, 5, 0, 0, 6.29); g.fill();

// ---- the house elbows rearing up the cone's flanks --------------------
var puElbow = function (sgn, x0, y0, x1, y1, x2, y2) {
  g.lineCap = 'round';
  g.strokeStyle = PU_EDG; g.lineWidth = 12.6;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke();
  g.strokeStyle = shade(col, 0.86); g.lineWidth = 8.4;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke();
  g.strokeStyle = shade(col, 0.74); g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(x0, y0 + 3.2); g.quadraticCurveTo(x1, y1 + 3.2, x2, y2 + 3.2); g.stroke();
  g.strokeStyle = col; g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(x0, y0 - 3.0); g.quadraticCurveTo(x1, y1 - 3.0, x2, y2 - 3.0); g.stroke();
  g.strokeStyle = 'rgba(238,240,234,.48)'; g.lineWidth = 1.3;    // white weld streak
  g.beginPath();
  g.moveTo(x0 + sgn * 1.4, y0 - 4.4);
  g.quadraticCurveTo(x1 + sgn * 1.4, y1 - 4.4, x2 - sgn * 0.6, y2 - 4.6); g.stroke();
  g.fillStyle = col;                                       // the bolted flange
  g.beginPath(); g.ellipse(x2, y2, 3.6, 4.6, 0, 0, 6.29); g.fill();
  g.fillStyle = PU_EDG;
  for (var puBI = -1; puBI <= 1; puBI++) {
    g.beginPath(); g.ellipse(x2, y2 + puBI * 2.6, 1.0, 1.0, 0, 0, 6.29); g.fill();
  }
};
puElbow(-1, cx - 49, baseY + 6, cx - 47, baseY - 20, cx - 27, baseY - 25);
puElbow(1, cx + 49, baseY + 2, cx + 47, baseY - 25, cx + 25, baseY - 31);

// ---- the belt's front half, its specular runs, and the spoil lip ------
puBelt(0.02, 3.20, 13);
puSpec(0.10, 0.92); puSpec(2.24, 3.10);
// the conduit's lowest run is half-buried: the spoil laps over it
g.save(); puMPath(); g.clip();
g.fillStyle = PU_MND;
g.beginPath(); g.ellipse(cx - 2, baseY + 44, 56, 14, 0, 3.15, 6.29); g.fill();
g.fillStyle = PU_MNDD;
g.beginPath(); g.ellipse(cx - 2, baseY + 45, 56, 14, 0, 3.15, 6.29); g.fill();
g.restore();

// ---- the red-white-red clamp down the drum's right front --------------
var puClamp = function (off, w, fill) {
  g.lineCap = 'butt';
  g.strokeStyle = fill; g.lineWidth = w;
  g.beginPath();
  g.moveTo(cx + 5 + off, baseY - 18);
  g.quadraticCurveTo(cx + 15 + off, baseY + 2, cx + 21 + off, baseY + 28);
  g.stroke();
};
puClamp(0, 24, PU_EDG);
puClamp(-7.6, 7.2, shade(col, 0.86)); puClamp(7.6, 7.2, shade(col, 0.86));
puClamp(-9.8, 2.2, col); puClamp(5.8, 2.2, col);
puClamp(-5.8, 1.8, shade(col, 0.74)); puClamp(9.8, 1.8, shade(col, 0.74));
puClamp(0, 6.6, '#bcbfb7'); puClamp(-1.4, 2.0, '#e6e8e2');

// ---- ore spilled at the foot, and two marker lamps --------------------
srand(97);
for (var puOI = 0; puOI < 9; puOI++) {
  var puOA = 2.30 + rnd() * 1.7, puOR = 0.66 + rnd() * 0.28;
  var puOX = cx - 2 + Math.cos(puOA) * 58 * puOR;
  var puOY = baseY + 2 + Math.abs(Math.sin(puOA)) * 31 * puOR;
  g.fillStyle = puOI % 2 ? '#c8922e' : '#8f6a1d';
  g.beginPath(); g.ellipse(puOX, puOY, 2.4 + rnd() * 1.8, 1.5 + rnd(), 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,214,120,.34)';
  g.beginPath(); g.ellipse(puOX - 0.6, puOY - 0.8, 1.2, 0.7, 0, 0, 6.29); g.fill();
}
for (var puLI = -1; puLI <= 1; puLI += 2) {
  var puLX = cx - 2 + puLI * 40, puLY = baseY + 26;
  g.fillStyle = PU_EDG; g.fillRect(puLX - 1.4, puLY - 6, 2.8, 6);
  g.fillStyle = (ph6 % 2) ? shade(col, 1.22) : shade(col, 0.76);
  g.beginPath(); g.ellipse(puLX, puLY - 7, 2.4, 2.4, 0, 0, 6.29); g.fill();
}
