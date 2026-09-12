// ─── structures/airforce ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// --- RA2 Airforce Command HQ ----------------------------------------
// Rebuilt at 1:1 against the RED-owner MAKE rip
// (docs/ra2-ref/allied-airforce-command-idle.png, last of 24 frames,
// 137x149, w/h 0.919 — only a red owner shows where the remap lives).
// Reading it: the BACK-LEFT half is ONE dark-navy block on a pale
// concrete apron — a wide silver-ribbed drum at its left shoulder, a
// face-up dished radar lying on the roof, a short drum with a house
// stripe at the front, two stout whip masts on the right shoulder, and
// rising out of the middle a control tower: a FAT HOUSE-COLOURED TORUS
// at its root, a lit lavender glass cab, and a silver scanner coil
// above it. The FRONT-RIGHT half is the helipad — pale concrete
// quartered by a broad aviation-yellow cross, each quadrant carrying a
// house-coloured double diamond over an olive field with dark blades
// and a tan centre. The four quadrant centres ARE the Harrier pad slots
// (PAD_SLOTS), so the markings are laid out from them, not eyeballed.
// COLOUR: cross yellow and concrete grey are fixed; `col` is the torus,
// the two drum bands, the front stripe and the four pad diamonds.
// Six idle phases (`bph`): the scanner coil turns, the roof dish sweeps,
// the cab windows light in turn and the pad corner lamps blink.
var anP = (bph || 0) * 6.283, ph6 = Math.round((bph || 0) * 6) % 6;
var AFC_DK = '#2c313e', AFC_DKD = '#0c0f16', AFC_DKL = '#4c5261';
var AFC_SIL = '#a9afb9', AFC_SILL = '#e7ebf1', AFC_SILD = '#646a75';
var AFC_CON = '#a4a392', AFC_COND = '#5b5a4e', AFC_CONL = '#c4c3b1';
var AFC_YEL = '#f6d63f', AFC_YELL = '#fef6b6', AFC_YELD = '#8d7211';
var AFC_OLV = '#9d9e66', AFC_OLVD = '#6b4526', AFC_TAN = '#d0ae7e';
var AFC_GLS_OFF = '#9095b4';

// ---- helipad: the near-right half of the foundation ----------------
// hpw/hph are fixed by PAD_SLOTS: a slot sits at u,v = (+-0.363, -+0.363)
// in this frame, which is where each quadrant diamond is centred.
// The pad is GROUND: its vertical offsets are pre-divided by VS so the
// structure's vertical mass scale cannot flatten the iso of the deck
// (and so PAD_SLOTS, derived from the same AFC_PAD numbers, lands on it).
var hpx = cx + fw * AFC_PAD.ox, hpy = baseY + (fh * AFC_PAD.oy) / VS;
var hpw = fw * AFC_PAD.w, hph = (fh * AFC_PAD.h) / VS;
var hp = function (hu, hv) {
  return [hpx + (hu - hv) * hpw, hpy + (hu + hv) * hph];
};
var hquad = function (u0, u1, v0, v1, fill, edge) {
  var k0 = hp(u0, v0), k1 = hp(u1, v0), k2 = hp(u1, v1), k3 = hp(u0, v1);
  g.beginPath();
  g.moveTo(k0[0], k0[1]); g.lineTo(k1[0], k1[1]);
  g.lineTo(k2[0], k2[1]); g.lineTo(k3[0], k3[1]); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (edge) outline(g, edge);
};
var hdia = function (mu, mv, r, fill, edge) { hquad(mu - r, mu + r, mv - r, mv + r, fill, edge); };
var HPO = 0.685;                                     // pad rim, kept inside the canvas
g.fillStyle = 'rgba(0,0,0,.30)';                     // deck riser
hquad(-HPO, HPO, -HPO, HPO, null, null);
g.save(); g.beginPath();
var hs0 = hp(-HPO, -HPO), hs1 = hp(HPO, -HPO), hs2 = hp(HPO, HPO), hs3 = hp(-HPO, HPO);
g.moveTo(hs0[0], hs0[1] + 3.5); g.lineTo(hs1[0], hs1[1] + 3.5);
g.lineTo(hs2[0], hs2[1] + 3.5); g.lineTo(hs3[0], hs3[1] + 3.5);
g.closePath(); g.fillStyle = 'rgba(0,0,0,.30)'; g.fill(); g.restore();
hquad(-HPO, HPO, -HPO, HPO, AFC_COND, shade(AFC_COND, 0.62));     // kerb: plain concrete
hquad(-HPO + 0.035, HPO - 0.035, -HPO + 0.035, HPO - 0.035, AFC_CONL, null);
hquad(-HPO + 0.06, HPO - 0.06, -HPO + 0.06, HPO - 0.06, AFC_CON, null);   // deck
g.save(); hquad(-HPO + 0.06, HPO - 0.06, -HPO + 0.06, HPO - 0.06, null, null); g.clip();
srand(311);
for (var afB = 0; afB < 9; afB++) {                  // worn concrete blotches
  g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.13)' : 'rgba(214,212,190,.20)';
  var ab = hp(rnd() * 1.3 - 0.65, rnd() * 1.3 - 0.65);
  g.beginPath(); g.ellipse(ab[0], ab[1], 5 + rnd() * 6, 2.4 + rnd() * 2.4, 0, 0, 6.29); g.fill();
}
g.restore();
// the four quadrant markings, each centred on its Harrier pad slot
var _q = AFC_PAD.q;
var afSlot = [[-_q, -_q], [_q, -_q], [-_q, _q], [_q, _q]];
for (var afI = 0; afI < 4; afI++) {
  var mu = afSlot[afI][0], mv = afSlot[afI][1], mr = 0.252;
  hdia(mu, mv, mr, shade(col, 0.42), null);          // the diamond's shadowed outer line
  hdia(mu, mv, mr - 0.012, col, null);               // bright house line
  hdia(mu, mv, mr - 0.048, AFC_OLV, null);           // olive field inside it
  hdia(mu, mv, mr - 0.062, null, shade(col, 0.50));  // dark inner hairline
  var bl = mr * 0.50;                                // four dark blades off the rim
  hdia(mu - bl, mv, mr * 0.30, AFC_OLVD, null);
  hdia(mu + bl, mv, mr * 0.30, AFC_OLVD, null);
  hdia(mu, mv - bl, mr * 0.30, AFC_OLVD, null);
  hdia(mu, mv + bl, mr * 0.30, AFC_OLVD, null);
  hdia(mu, mv, mr * 0.30, AFC_TAN, null);            // scorched tan centre
  hdia(mu, mv, mr * 0.13, '#8d6b45', null);
  var lamp = afI === ph6 % 4;                        // corner lamp, blinking in turn
  var lp = hp(mu - mr * 1.06, mv - mr * 1.06);
  g.fillStyle = lamp ? '#fff3b0' : '#6b6a58';
  g.beginPath(); g.ellipse(lp[0], lp[1] - 1, 2.1, 1.5, 0, 0, 6.29); g.fill();
}
hquad(-HPO + 0.06, HPO - 0.06, -0.075, 0.075, AFC_YELD, null);    // the yellow cross
hquad(-0.075, 0.075, -HPO + 0.06, HPO - 0.06, AFC_YELD, null);
hquad(-HPO + 0.06, HPO - 0.06, -0.062, 0.052, AFC_YEL, null);
hquad(-0.062, 0.052, -HPO + 0.06, HPO - 0.06, AFC_YEL, null);
hquad(-HPO + 0.06, HPO - 0.06, -0.050, -0.012, AFC_YELL, null);   // its lit upper edge
hquad(-0.050, -0.012, -HPO + 0.06, HPO - 0.06, AFC_YELL, null);
g.fillStyle = '#1b1e24';                             // tie-down bollards round the rim
for (var afC = 0; afC < 8; afC++) {
  var bu = [-1, 0, 1, 1, 1, 0, -1, -1][afC] * (HPO - 0.02);
  var bv = [-1, -1, -1, 0, 1, 1, 1, 0][afC] * (HPO - 0.02);
  var bp = hp(bu, bv);
  g.fillRect(bp[0] - 1.1, bp[1] - 4.4, 2.2, 4.4);
  g.beginPath(); g.ellipse(bp[0], bp[1] - 4.6, 2.2, 1.4, 0, 0, 6.29); g.fill();
}

// ---- pale concrete apron under the block ---------------------------
var tcx = cx - fw * 0.42, tcy = baseY + fh * 0.06;
g.fillStyle = 'rgba(0,0,0,.32)';
g.beginPath(); g.ellipse(tcx + 3, tcy + 6, fw * 0.60, fh * 0.60, 0, 0, 6.29); g.fill();
g.fillStyle = AFC_COND;
g.beginPath(); g.ellipse(tcx, tcy + 3, fw * 0.60, fh * 0.60, 0, 0, 6.29); g.fill();
g.fillStyle = AFC_CON;
g.beginPath(); g.ellipse(tcx, tcy, fw * 0.585, fh * 0.585, 0, 0, 6.29); g.fill();
outline(g, AFC_COND);
g.fillStyle = AFC_CONL;
g.beginPath(); g.ellipse(tcx - fw * 0.10, tcy - 3.4, fw * 0.40, fh * 0.40, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(40,42,34,.28)'; g.lineWidth = 1;
g.beginPath(); g.ellipse(tcx, tcy - 2, fw * 0.44, fh * 0.44, 0, 0, 6.29); g.stroke();

// ---- the dark navy block -------------------------------------------
var afBy = tcy - 3, afLift = 40;
var afRy = prism(g, tcx + fw * 0.04, afBy, fw * 0.44, fh * 0.44, afLift,
                 AFC_DK, shade(AFC_DK, 1.22), AFC_DKD, [0.30, 0.70]);
var abx = tcx + fw * 0.04, abH = fw * 0.44, abV = fh * 0.44;
g.fillStyle = AFC_SILD;                              // silver sill along the near-left eave
g.beginPath();
g.moveTo(abx - abH, afRy); g.lineTo(abx, afRy + abV);
g.lineTo(abx, afRy + abV + 3.4); g.lineTo(abx - abH, afRy + 3.4);
g.closePath(); g.fill();
g.fillStyle = AFC_DKL;
g.beginPath();
g.moveTo(abx, afRy + abV); g.lineTo(abx + abH, afRy);
g.lineTo(abx + abH, afRy + 3.4); g.lineTo(abx, afRy + abV + 3.4);
g.closePath(); g.fill();
g.fillStyle = 'rgba(0,0,0,.30)';                     // dark hangar mouth, near-left face
g.beginPath();
g.moveTo(abx - fw * 0.34, afRy + fh * 0.34 + 6); g.lineTo(abx - fw * 0.12, afRy + fh * 0.45 + 6);
g.lineTo(abx - fw * 0.12, afRy + fh * 0.45 + 22); g.lineTo(abx - fw * 0.34, afRy + fh * 0.34 + 22);
g.closePath(); g.fill(); outline(g, AFC_DKD);
g.fillStyle = AFC_SILD;
for (var afSh = 0; afSh < 3; afSh++) {               // its shutter slats
  var shy = afRy + fh * 0.34 + 9 + afSh * 4.4;
  g.beginPath();
  g.moveTo(abx - fw * 0.33, shy); g.lineTo(abx - fw * 0.13, shy + fh * 0.10);
  g.lineTo(abx - fw * 0.13, shy + fh * 0.10 + 1.4); g.lineTo(abx - fw * 0.33, shy + 1.4);
  g.closePath(); g.fill();
}

// ---- wide silver drum at the left shoulder -------------------------
var ldx = tcx - fw * 0.37, ldy = tcy + fh * 0.36;
cylinder(g, ldx, ldy, 14.5, 27, AFC_SIL, AFC_SILL, AFC_DKD);
g.save(); g.beginPath(); g.rect(ldx - 14.5, ldy - 27, 29, 27); g.clip();
g.fillStyle = 'rgba(24,28,36,.42)';                  // rib grooves
for (var ldI = 0; ldI < 4; ldI++) g.fillRect(ldx - 14.5, ldy - 4 - ldI * 5.6, 29, 1.8);
g.fillStyle = shade(col, 0.66); g.fillRect(ldx - 14.5, ldy - 8.4, 29, 5.4);   // house band, low
g.fillStyle = col; g.fillRect(ldx - 14.5, ldy - 8.4, 29, 3.4);
g.fillStyle = shade(col, 1.28); g.fillRect(ldx - 14.5, ldy - 8.4, 6.4, 3.4);
g.restore();
g.fillStyle = AFC_DK;                                // navy collar dish on the lid
g.beginPath(); g.ellipse(ldx, ldy - 27, 14.5, 6.1, 0, 0, 6.29); g.fill();
outline(g, AFC_DKD);
g.fillStyle = shade(col, 0.86);
g.beginPath(); g.ellipse(ldx, ldy - 28.6, 14.5, 6.1, 0, 3.35, 6.08); g.fill();
g.fillStyle = '#161a22';
g.beginPath(); g.ellipse(ldx, ldy - 28, 9.2, 3.8, 0, 0, 6.29); g.fill();
g.strokeStyle = '#2a303c'; g.lineWidth = 1.4;        // instrument rods on the collar
for (var ldR = 0; ldR < 5; ldR++) {
  var lra = ldR / 5 * 6.283 + 0.5;
  var lrx = ldx + Math.cos(lra) * 10.4, lry = ldy - 28 + Math.sin(lra) * 4.2;
  g.beginPath(); g.moveTo(lrx, lry); g.lineTo(lrx + 0.6, lry - 7 - (ldR % 2) * 2); g.stroke();
  g.fillStyle = ldR % 2 ? '#c8d0aa' : '#9aa2ae';
  g.beginPath(); g.arc(lrx + 0.6, lry - 7 - (ldR % 2) * 2, 1.2, 0, 6.29); g.fill();
}

// ---- short front drum with the house stripe ------------------------
var fdx = tcx + fw * 0.20, fdy = tcy + fh * 0.48;
cylinder(g, fdx, fdy, 10.5, 23, AFC_DK, AFC_DKL, AFC_DKD);
g.fillStyle = shade(col, 0.62); g.fillRect(fdx - 3.6, fdy - 21, 7.2, 21);   // vertical stripe
g.fillStyle = col; g.fillRect(fdx - 3.6, fdy - 21, 4.6, 21);
g.fillStyle = shade(col, 1.24); g.fillRect(fdx - 3.6, fdy - 21, 1.6, 21);
g.fillStyle = AFC_SIL;
g.beginPath(); g.ellipse(fdx, fdy - 23, 10.5, 4.4, 0, 0, 6.29); g.fill(); outline(g, AFC_DKD);
g.fillStyle = AFC_SILD;
g.beginPath(); g.ellipse(fdx, fdy - 23, 6.4, 2.6, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(24,28,36,.40)'; g.fillRect(fdx - 10.5, fdy - 25.4, 21, 2.6);

// ---- right shoulder block and its two whip masts -------------------
var swx = tcx + fw * 0.56, swy = tcy + fh * 0.06;
var swRy = prism(g, swx, swy, fw * 0.15, fh * 0.15, 26, shade(AFC_DK, 0.86),
                 shade(AFC_DK, 1.10), AFC_DKD);
g.fillStyle = AFC_SILD; g.fillRect(swx - fw * 0.15, swRy - 1.6, fw * 0.30, 2.2);
var afWhip = function (wx, wy, wh2) {
  g.strokeStyle = '#12151b'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + wh2 * 0.03, wy - wh2); g.stroke();
  g.strokeStyle = '#5a626e'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(wx - 0.7, wy); g.lineTo(wx + wh2 * 0.03 - 0.7, wy - wh2); g.stroke();
  g.fillStyle = '#dfe3ea';
  g.beginPath(); g.ellipse(wx + wh2 * 0.03, wy - wh2 - 1.2, 1.4, 2, 0, 0, 6.29); g.fill();
};
afWhip(swx - 5, swRy, 42);
afWhip(swx + 6, swRy + 2, 30);

// ---- face-up dished radar lying on the roof ------------------------
var afFx = abx + fw * 0.28, afFy = afRy + 6;
g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(afFx + 1.5, afFy + 2.5, 18.5, 8.4, 0, 0, 6.29); g.fill();
g.fillStyle = AFC_SILD;
g.beginPath(); g.ellipse(afFx, afFy, 18.5, 8.4, 0, 0, 6.29); g.fill(); outline(g, AFC_DKD);
g.fillStyle = AFC_SIL;
g.beginPath(); g.ellipse(afFx, afFy - 2.4, 18.5, 8.4, 0, 3.25, 6.18); g.fill();
g.fillStyle = '#6f7681';
g.beginPath(); g.ellipse(afFx, afFy - 1.4, 14.4, 6.4, 0, 0, 6.29); g.fill();
g.fillStyle = '#9aa1ab';
g.beginPath(); g.ellipse(afFx, afFy - 2.4, 9.6, 4.2, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(30,34,42,.42)'; g.lineWidth = 1;
g.beginPath(); g.ellipse(afFx, afFy - 2, 12.2, 5.4, 0, 0, 6.29); g.stroke();
g.strokeStyle = 'rgba(230,238,250,.60)'; g.lineWidth = 1.6;   // the sweep, turning
g.beginPath(); g.moveTo(afFx, afFy - 2.2);
g.lineTo(afFx + Math.cos(anP) * 16.6, afFy - 2.2 + Math.sin(anP) * 7.4); g.stroke();
g.fillStyle = '#d6dbe3';
g.beginPath(); g.ellipse(afFx, afFy - 3.2, 3, 1.8, 0, 0, 6.29); g.fill();

// ---- roof kit: vents, a rail along the near eave, two crated boxes --
for (var afV = 0; afV < 4; afV++) {
  var vx = abx + abH * (0.04 + afV * 0.22), vy = afRy - abV * (0.50 - afV * 0.20);
  g.fillStyle = shade(AFC_DK, 0.80);
  g.fillRect(vx - 4, vy - 7, 8, 7); outline(g, AFC_DKD);
  g.fillStyle = AFC_SILD; g.fillRect(vx - 4, vy - 8.6, 8, 2);
}
g.fillStyle = AFC_DKL;                               // two kit boxes with house lids
g.fillRect(abx - abH * 0.62, afRy + abV * 0.16, 9, 6); outline(g, AFC_DKD);
g.fillStyle = shade(col, 0.90); g.fillRect(abx - abH * 0.62, afRy + abV * 0.16 - 1.8, 9, 2);
g.fillStyle = AFC_DKL;
g.fillRect(abx - abH * 0.40, afRy + abV * 0.44, 7, 5); outline(g, AFC_DKD);
g.fillStyle = shade(col, 0.90); g.fillRect(abx - abH * 0.40, afRy + abV * 0.44 - 1.6, 7, 1.8);
railing(g, abx - abH * 0.86, afRy + abV * 0.86, abx - abH * 0.14, afRy + abV * 0.14,
        5, 'rgba(176,184,196,.55)');

// ---- control tower: house torus, glass cab, scanner coil -----------
var ctx2 = abx - fw * 0.12, cty = afRy + 5, ctR = 13, ctH = 42;
g.fillStyle = 'rgba(0,0,0,.28)';                     // the torus, seated on the roof
g.beginPath(); g.ellipse(ctx2 + 1.5, cty + 3.5, 20.5, 9.2, 0, 0, 6.29); g.fill();
g.fillStyle = shade(col, 0.52);
g.beginPath(); g.ellipse(ctx2, cty + 1.6, 20.5, 9.2, 0, 0, 6.29); g.fill();
g.fillStyle = col;
g.beginPath(); g.ellipse(ctx2, cty - 1.8, 20.5, 9.2, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.34));
g.fillStyle = shade(col, 1.26);                      // lit crown of the ring
g.beginPath(); g.ellipse(ctx2 - 2, cty - 4, 17, 6.8, 0, 3.5, 6.05); g.fill();
g.fillStyle = AFC_DKD;                               // the hole the tower rises through
g.beginPath(); g.ellipse(ctx2, cty - 2.6, ctR, ctR * 0.44, 0, 0, 6.29); g.fill();
g.fillStyle = AFC_DK; g.fillRect(ctx2 - ctR, cty - ctH, ctR * 2, ctH - 2);
g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(ctx2 - ctR, cty - ctH, ctR * 0.44, ctH - 2);
g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(ctx2 + ctR * 0.44, cty - ctH, ctR * 0.56, ctH - 2);
g.fillStyle = AFC_SILD;                              // sill under the cab
g.fillRect(ctx2 - ctR - 1, cty - ctH + 15, ctR * 2 + 2, 3.2);
g.beginPath(); g.ellipse(ctx2, cty - ctH + 15, ctR + 1, (ctR + 1) * 0.40, 0, 0, 3.15); g.fill();
g.fillStyle = '#3c414c';                             // the glass cab
g.fillRect(ctx2 - ctR, cty - ctH + 3.6, ctR * 2, 11.6);
for (var cbI = 0; cbI < 5; cbI++) {                  // panes, lighting in turn
  g.fillStyle = (cbI + ph6) % 5 < 2 ? '#dcdeee' : AFC_GLS_OFF;
  g.fillRect(ctx2 - ctR + 1.4 + cbI * 4.9, cty - ctH + 5, 3.6, 9);
}
g.fillStyle = 'rgba(255,255,255,.20)'; g.fillRect(ctx2 - ctR + 1.4, cty - ctH + 5, 23, 2.4);
g.fillStyle = AFC_SIL;                               // cab roof lip
g.fillRect(ctx2 - ctR - 2, cty - ctH, ctR * 2 + 4, 4);
g.beginPath(); g.ellipse(ctx2, cty - ctH, ctR + 2, (ctR + 2) * 0.40, 0, 3.15, 6.29); g.fill();
outline(g, AFC_DKD);
g.fillStyle = shade(col, 0.94); g.fillRect(ctx2 - ctR - 2, cty - ctH + 3.2, ctR * 2 + 4, 1.8);
// the scanner coil: five curved slats climbing and turning with the phase
var scTop = cty - ctH - 4;
g.strokeStyle = '#20252f'; g.lineWidth = 2.2;        // the coil's spindle, behind it
g.beginPath(); g.moveTo(ctx2 - 1, cty - ctH); g.lineTo(ctx2 - 1, scTop - 22); g.stroke();
for (var scI = 0; scI < 6; scI++) {
  var sr = 14.8 - scI * 0.95, sy = scTop - scI * 4.9;
  var sa = anP + scI * 0.86;
  g.strokeStyle = AFC_SILD; g.lineWidth = 4.6;
  g.beginPath(); g.ellipse(ctx2 - 1, sy + 1.3, sr, sr * 0.44, 0, sa, sa + 2.9); g.stroke();
  g.strokeStyle = AFC_SIL; g.lineWidth = 3.4;
  g.beginPath(); g.ellipse(ctx2 - 1, sy, sr, sr * 0.44, 0, sa, sa + 2.9); g.stroke();
  g.strokeStyle = AFC_SILL; g.lineWidth = 1.3;
  g.beginPath(); g.ellipse(ctx2 - 1, sy - 1.3, sr, sr * 0.44, 0, sa + 0.16, sa + 2.7); g.stroke();
  g.strokeStyle = scI % 3 === 1 ? 'rgba(96,116,72,.50)' : 'rgba(44,50,58,.46)'; g.lineWidth = 1.1;
  g.beginPath(); g.ellipse(ctx2 - 1, sy + 2.2, sr, sr * 0.44, 0, sa + 0.3, sa + 2.6); g.stroke();
}
g.fillStyle = '#141820';
g.beginPath(); g.ellipse(ctx2 - 1, scTop - 23, 3.2, 2.8, 0, 0, 6.29); g.fill();
g.fillStyle = '#5b6270';
g.beginPath(); g.ellipse(ctx2 - 1, scTop - 24.6, 1.6, 1.4, 0, 0, 6.29); g.fill();
