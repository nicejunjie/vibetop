// Iron Frontier — structures/refinery: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.

import { outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';
import { faceL, facePatch, prism } from '../../bake/vehicles.js';

export function drawRefinery(C) {
  var AMB = C.AMB, AMBH = C.AMBH, HAZ = C.HAZ, PLAT_E = C.PLAT_E, baseY = C.baseY, bph = C.bph,
      col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g, plot = C.plot, rnd = C.rnd,
      sov = C.sov, srand = C.srand;

// Ore Refinery, polished at 1:1 against the real RA2 sprites
// (docs/ra2-ref/allied-ore-refinery-idle.png, soviet-ore-refinery-anim-last.png).
// Two different buildings, not a recolour:
//   Directorate = Allied Ore Refinery - a horizontal hooped drum (round
//     ringed face at one end, an open dark mouth with the hoist at the
//     other), two straight silver stacks, a ribbed olive skirt with a
//     pipe loop, the house-colour ported spine, white rails on charcoal.
//   Collective  = Soviet Ore Refinery - two iron cone-into-chimney
//     furnaces (the back one two-stage and taller), organ pipes round the
//     near skirt, the red block with its inclined conveyor bridge and
//     two fanned grilles, a round dished pit with a ladder and a pale
//     ramp slab with red lamps.
// Both are the RA2 sprite MIRRORED left-right: the sim parks harvesters
// on the +gy face (refDock's first ring candidate is [cx, cy + gh/2 + 1])
// and grid +gy projects DOWN-LEFT, while the RA2 art docks on the
// down-right face. The light stays upper-left (mirrored composition,
// not mirrored pixels). The dock tile centre is (cx - 64, baseY + 32).
// Six idle phases (`bph`, see bakeAll / drawBld): Allied hoist bobs,
// sparks fly and the spine ports glow in turn; Soviet furnace mouths
// pulse and the chimneys smoke.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var HC = shade(col, 1.00), HCL = shade(col, 1.22), HCM = shade(col, 0.86), HCD = shade(col, 0.70);
// Upright tube lit from the left: horizontal gradient body, elliptical top.
var tube = function (tx, ty, r, h, base, edge, topc) {
  // Hard vertical bands, the way RA2 shades a cylinder: a mid strip at
  // the left edge, a white highlight, the body, a dark quarter and a
  // near-black rim on the right.
  var TB = [[0, 0.10, 0.92], [0.10, 0.26, 1.42], [0.26, 0.56, 1.06], [0.56, 0.80, 0.62], [0.80, 1, 0.34]];
  for (var tbJ = 0; tbJ < TB.length; tbJ++) {
    g.fillStyle = shade(base, TB[tbJ][2]);
    g.fillRect(tx - r + r * 2 * TB[tbJ][0], ty - h, r * 2 * (TB[tbJ][1] - TB[tbJ][0]) + 0.3, h);
  }
  g.fillStyle = shade(base, 0.62);
  g.beginPath(); g.ellipse(tx, ty, r, r * 0.42, 0, 0, Math.PI); g.fill();
  g.beginPath(); g.moveTo(tx - r, ty); g.lineTo(tx - r, ty - h); g.lineTo(tx + r, ty - h); g.lineTo(tx + r, ty);
  g.ellipse(tx, ty, r, r * 0.42, 0, 0, Math.PI); g.closePath();
  outline(g, edge);
  g.fillStyle = topc || shade(base, 1.10);
  g.beginPath(); g.ellipse(tx, ty - h, r, r * 0.42, 0, 0, 6.29); g.fill(); outline(g, edge);
};
// Horizontal band round a tube (a collar or a ring), same left light.
var ring = function (tx, ty, r, h, base, edge) {
  var gr = g.createLinearGradient(tx - r, 0, tx + r, 0);
  gr.addColorStop(0, shade(base, 0.84)); gr.addColorStop(0.22, shade(base, 1.22));
  gr.addColorStop(0.55, shade(base, 1.00)); gr.addColorStop(1, shade(base, 0.52));
  g.fillStyle = gr; g.fillRect(tx - r, ty - h, r * 2, h);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(tx - r, ty - h, r * 2, 1);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(tx - r, ty - 1, r * 2, 1);
  if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.strokeRect(tx - r + 0.5, ty - h + 0.5, r * 2 - 1, h - 1); }
};
var poly = function (pts, fill, edge) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (var pI2 = 1; pI2 < pts.length; pI2++) g.lineTo(pts[pI2][0], pts[pI2][1]);
  g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (edge) outline(g, edge);
};
var line = function (x0, y0, x1, y1, w, c, cap) {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = cap || 'butt';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
};
if (sov) {
  // ---- Soviet Ore Refinery ---------------------------------------------
  // Read off soviet-ore-refinery-anim-last.png at 1:1, mirrored. Two
  // iron furnaces: the NEAR one (down-right) a wide truncated cone
  // ringed by eight pale organ pipes into a black chimney; the BACK one
  // (up-left) taller and two-stage - lower cone, pale collar, upper
  // cone, collar, chimney. Every chimney has a pale ring under a black
  // flared lip. Between them the house-coloured hopper block with the
  // inclined slatted conveyor bridge and two fanned slatted grilles.
  // The near furnace stands on a pale concrete octagon; the round
  // dished pit is on the +gy face with a ladder down into it from the
  // back cone's foot, and a pale ramp slab runs off the pit to the dock
  // tile with a house-coloured lamp on each edge. A small tank behind
  // the back cone, a pipe stub out of the near cone's far side.
  // COLOUR POLICY: `col` is the block, the bridge, both grilles and the
  // ramp lamps. Iron, pipes, pads and the pit are neutral.
  var S_IRON = '#3b3730', S_IRON_L = '#8a7a58', S_IRON_D = '#131315';
  var S_STK = '#17181c', S_STK_L = '#6a6c72', S_COLR = '#bcb9ad';
  var S_PIPE = '#b4b0a4', S_PIPE_D = '#4a4740';
  var S_PALE = '#b5b19e', S_PALE_D = '#6a6656', S_RAMP = '#d8d4c6', S_RAMP_E = '#6a6656';
  var S_PIT = '#8c8266', S_PIT_D = '#4a4436', S_LAD = '#caa54c', S_LAD_D = '#5a4418';
  var S_PAD = '#7d7862', S_PAD_D = '#3a3628';
  var nfx = cx + 36, nfy = baseY + 4;                                // near furnace foot
  var bfx = cx - 14, bfy = baseY - 2;                                // back furnace foot

  // ---- pad: khaki plate, a pale concrete octagon under the near cone -
  plot(g, cx, baseY - 2, fw * 1.94, fh * 1.94);
  g.fillStyle = S_PAD; g.fill(); outline(g, PLAT_E);
  g.save(); plot(g, cx, baseY - 2, fw * 1.94, fh * 1.94); g.clip();
  srand(97);
  for (var mI = 0; mI < 12; mI++) {
    g.fillStyle = rnd() < 0.5 ? shade(S_PAD, 0.78) : shade(S_PAD, 1.16);
    g.globalAlpha = 0.34;
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * fw * 1.6, baseY - 2 + (rnd() - 0.5) * fh * 1.5,
              5 + rnd() * 8, 2 + rnd() * 4, 0, 0, 6.29);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,.30)';                                 // cast shadows, down-right
  g.beginPath(); g.ellipse(nfx + 26, nfy + 8, 34, 11, 0, 0, 6.29); g.fill();
  g.beginPath(); g.ellipse(bfx + 22, bfy + 4, 30, 10, 0, 0, 6.29); g.fill();
  g.restore();
  var oct = function (ox, oy, rx, ry, fill, edge) {
    var P = [];
    for (var oI = 0; oI < 8; oI++) { var oa = oI * Math.PI / 4 + Math.PI / 8; P.push([ox + Math.cos(oa) * rx, oy + Math.sin(oa) * ry]); }
    poly(P, fill, edge);
  };
  oct(nfx, nfy + 5, 43, 20, S_PALE_D, null);                         // its 3px kerb
  oct(nfx - 2, nfy + 3, 43, 20, S_PALE, S_PALE_D);
  g.save(); oct(nfx - 2, nfy + 3, 43, 20); g.clip();
  srand(53);
  for (mI = 0; mI < 10; mI++) {
    g.fillStyle = rnd() < 0.5 ? shade(S_PALE, 0.86) : shade(S_PALE, 1.10);
    g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(nfx + (rnd() - 0.5) * 80, nfy + 3 + (rnd() - 0.5) * 34, 4 + rnd() * 8, 2 + rnd() * 3, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1; g.restore();
  // darker charcoal-khaki apron under the pit and the ramp
  var pitx = cx - 24, pity = baseY + 18, prx = 29, pry = 15.5;
  g.fillStyle = shade(S_PAD, 0.72);
  g.beginPath(); g.ellipse(pitx + 1, pity + 2, prx * 1.32, pry * 1.36, 0, 0, 6.29); g.fill();

  // ---- an iron truncated cone, lit olive-brown left, black right ----
  var cone = function (fx2, fy2, rb, rt, h) {
    var cg = g.createLinearGradient(fx2 - rb, 0, fx2 + rb, 0);
    cg.addColorStop(0, shade(S_IRON_L, 0.72)); cg.addColorStop(0.10, shade(S_IRON_L, 1.12));
    cg.addColorStop(0.27, S_IRON_L); cg.addColorStop(0.30, S_IRON); cg.addColorStop(0.48, S_IRON);
    cg.addColorStop(0.52, S_IRON_D); cg.addColorStop(1, shade(S_IRON_D, 0.6));
    g.beginPath();                                                  // bell profile: flares at the foot
    g.moveTo(fx2 - rb, fy2); g.quadraticCurveTo(fx2 - rt - (rb - rt) * 0.30, fy2 - h * 0.50, fx2 - rt, fy2 - h);
    g.lineTo(fx2 + rt, fy2 - h); g.quadraticCurveTo(fx2 + rt + (rb - rt) * 0.30, fy2 - h * 0.50, fx2 + rb, fy2);
    g.ellipse(fx2, fy2, rb, rb * 0.42, 0, 0, Math.PI); g.closePath();
    g.fillStyle = cg; g.fill(); outline(g, S_IRON_D);
    g.save(); g.clip();
    srand(fx2 | 0);                                                 // rust and soot mottle
    for (var rI = 0; rI < 16; rI++) {
      var rt2 = rnd(), rr = rb + (rt - rb) * rt2;
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,40,.28)' : 'rgba(10,10,12,.30)';
      g.beginPath(); g.ellipse(fx2 + (rnd() - 0.5) * 1.8 * rr, fy2 - h * rt2, 2 + rnd() * 5, 1.5 + rnd() * 3, 0, 0, 6.29); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineWidth = 1;              // plate seams
    for (var sI = 1; sI <= 2; sI++) {
      var sv = sI / 3, sr = rb + (rt - rb) * sv;
      g.beginPath(); g.ellipse(fx2, fy2 - h * sv, sr, sr * 0.42, 0, 0, Math.PI); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.10)';                          // sky light on the left shoulder
    g.beginPath(); g.moveTo(fx2 - rb * 0.9, fy2); g.lineTo(fx2 - rt * 0.9, fy2 - h); g.lineTo(fx2 - rt * 0.2, fy2 - h); g.lineTo(fx2 - rb * 0.45, fy2); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(0,0,0,.40)';                                // foot shadow ring
    g.beginPath(); g.ellipse(fx2, fy2 + 1, rb * 1.02, rb * 0.42, 0, 0, Math.PI); g.fill();
  };
  // A black chimney: pale collar at its foot, pale ring under a black flared lip, open bore.
  var chimney = function (sx3, sy3, r, h) {
    ring(sx3, sy3 + 1, r + 3.4, 3.4, S_COLR, null);
    tube(sx3, sy3, r, h, S_STK, S_IRON_D, shade(S_STK, 1.5));
    line(sx3 - r + 1.2, sy3 - 2, sx3 - r + 1.2, sy3 - h + 3, 1.4, 'rgba(210,214,220,.42)');
    ring(sx3, sy3 - h + 5, r + 0.6, 3.4, S_COLR, null);
    tube(sx3, sy3 - h + 1, r + 1.6, 4.5, shade(S_STK, 1.15), S_IRON_D, shade(S_STK, 1.6));
    g.fillStyle = '#08090c';
    g.beginPath(); g.ellipse(sx3, sy3 - h - 3.5, r * 0.82, r * 0.34, 0, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(200,204,210,.5)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(sx3, sy3 - h - 3.5, r + 1.6, (r + 1.6) * 0.42, 0, 0, 6.29); g.stroke();
    // furnace glow in the bore and dark smoke, both on the phase
    g.fillStyle = 'rgba(255,150,50,' + (0.10 + 0.18 * (0.5 + 0.5 * anC)).toFixed(2) + ')';
    g.beginPath(); g.ellipse(sx3, sy3 - h - 3.5, r * 0.6, r * 0.24, 0, 0, 6.29); g.fill();
    for (var pfI = 0; pfI < 3; pfI++) {
      var pft = ((bph || 0) + pfI / 3) % 1;                         // 0 fresh -> 1 dispersed
      g.fillStyle = 'rgba(70,68,72,' + (0.42 * (1 - pft)).toFixed(2) + ')';
      g.beginPath();
      g.ellipse(sx3 + 2 + pft * 9, sy3 - h - 6 - pft * 14, r * (0.5 + pft * 0.8), r * (0.28 + pft * 0.4), 0, 0, 6.29);
      g.fill();
    }
  };

  var pipes = function (px0, py0, rb, a0, a1, n, top) {              // organ pipes round a skirt
    for (var lg = 0; lg < n; lg++) {
      var la = a0 + (a1 - a0) * lg / (n - 1), ca2 = Math.cos(la), sa2 = Math.sin(la);
      var pxb = px0 + rb * 1.06 * ca2, pyb = py0 + 2 + rb * 0.44 * sa2;    // foot on the pad
      var pxt = px0 + rb * 0.92 * ca2, pyt = py0 - top + rb * 0.36 * sa2;  // elbow into the cone
      line(pxb, pyb, pxt, pyt, 5.6, S_PIPE_D, 'round');
      line(pxb, pyb, pxt, pyt, 3.6, S_PIPE, 'round');
      line(pxb - 1, pyb - 1, pxt - 1, pyt + 1, 1.1, 'rgba(255,255,255,.42)', 'round');
      line(pxt, pyt, pxt - ca2 * 5, pyt - 2.5, 3.6, S_PIPE, 'round');     // elbow into the iron
      g.fillStyle = S_PIPE_D;
      g.beginPath(); g.ellipse(pxb, pyb + 1.2, 3.6, 1.6, 0, 0, 6.29); g.fill();
    }
  };

  // ---- small tank behind the back cone, pipe stub off the near cone -
  tube(bfx - 32, bfy - 2, 5, 20, shade(S_IRON, 1.1), S_IRON_D);
  ring(bfx - 32, bfy - 10, 5.4, 2.2, S_COLR, null);

  // ---- back furnace: two-stage cone, tall chimney -------------------
  cone(bfx, bfy, 28, 15, 36);
  pipes(bfx, bfy, 28, 1.75, 2.75, 3, 16);
  ring(bfx, bfy - 35, 16, 3.4, S_COLR, null);
  cone(bfx, bfy - 37, 15, 9, 15);
  chimney(bfx, bfy - 51, 9, 38);

  // ---- house-coloured hopper block between the cones + bridge -------
  var hbx = cx - 16, hby = baseY + 4, hbw = 15, hbh = 7, hbl = 34;
  prism(g, hbx, hby, hbw, hbh, hbl, HC, HCM, HCD, [0.5]);
  facePatch(g, faceL, hbx, hby, hbw, hbh, hbl, 0.15, 0.85, 0.40, 0.80, HCD, null);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1;
  for (var slI = 1; slI < 5; slI++) {
    var sa = faceL(hbx, hby, hbw, hbh, hbl, 0.15 + slI * 0.14, 0.40), sb = faceL(hbx, hby, hbw, hbh, hbl, 0.15 + slI * 0.14, 0.80);
    g.beginPath(); g.moveTo(sa[0], sa[1]); g.lineTo(sb[0], sb[1]); g.stroke();
  }
  // conveyor bridge: an inclined house slab with pale slats, from the
  // near chimney's side down-left onto the block
  var cvA = [cx + 14, baseY - 54], cvB = [cx - 28, baseY - 34];
  var cvn = [6, -4.2];                                               // across the bridge
  poly([[cvA[0] + cvn[0], cvA[1] + cvn[1] + 10], [cvB[0] + cvn[0], cvB[1] + cvn[1] + 10],
        [cvB[0] + cvn[0], cvB[1] + cvn[1]], [cvA[0] + cvn[0], cvA[1] + cvn[1]]], HCD, null);   // near side
  poly([[cvA[0] - cvn[0], cvA[1] - cvn[1]], [cvB[0] - cvn[0], cvB[1] - cvn[1]],
        [cvB[0] + cvn[0], cvB[1] + cvn[1]], [cvA[0] + cvn[0], cvA[1] + cvn[1]]], HC, HCD);      // top
  for (var rgI = 0; rgI < 9; rgI++) {                                // pale slats across the top
    var rt3 = 0.08 + rgI * 0.105, rx3 = cvA[0] + (cvB[0] - cvA[0]) * rt3, ry3 = cvA[1] + (cvB[1] - cvA[1]) * rt3;
    line(rx3 - cvn[0] * 0.8, ry3 - cvn[1] * 0.8, rx3 + cvn[0] * 0.8, ry3 + cvn[1] * 0.8, 1.6, S_COLR);
  }
  line(cvA[0] - cvn[0], cvA[1] - cvn[1], cvB[0] - cvn[0], cvB[1] - cvn[1], 1.4, HCL);
  // two fanned slatted grilles on the block
  var grille = function (P) {
    poly([[P[0][0] + 2, P[0][1] + 3], [P[1][0] + 2, P[1][1] + 3], [P[2][0] + 2, P[2][1] + 3], [P[3][0] + 2, P[3][1] + 3]], 'rgba(0,0,0,.30)', null);
    poly(P, HC, HCD);
    g.strokeStyle = 'rgba(8,8,10,.82)'; g.lineWidth = 2;
    for (var gI = 1; gI < 4; gI++) {
      var t3 = gI / 4;
      g.beginPath();
      g.moveTo(P[0][0] + (P[3][0] - P[0][0]) * t3, P[0][1] + (P[3][1] - P[0][1]) * t3);
      g.lineTo(P[1][0] + (P[2][0] - P[1][0]) * t3, P[1][1] + (P[2][1] - P[1][1]) * t3);
      g.stroke();
    }
    line(P[0][0], P[0][1], P[1][0], P[1][1], 1.2, HCL);
    line(P[0][0], P[0][1], P[3][0], P[3][1], 1.2, HCL);
  };
  grille([[cx + 6, baseY - 63], [cx + 24, baseY - 58], [cx + 22, baseY - 39], [cx + 4, baseY - 44]]);
  line(cx + 14, baseY - 42, cx + 16, baseY - 36, 2.6, S_IRON_D);

  // ---- near furnace: wide cone, organ pipes, chimney ----------------
  cone(nfx, nfy, 33, 11, 37);
  pipes(nfx, nfy, 33, 0.25, 2.90, 6, 19);
  line(nfx + 28, nfy - 20, nfx + 36, nfy - 21.5, 4, S_PIPE_D, 'round');   // pipe stub, far side
  line(nfx + 28, nfy - 20, nfx + 36, nfy - 21.5, 2.2, S_PIPE, 'round');
  chimney(nfx, nfy - 36, 10, 32);
  grille([[cx + 40, baseY - 44], [cx + 56, baseY - 50], [cx + 58, baseY - 30], [cx + 42, baseY - 24]]);
  line(cx + 46, baseY - 27, cx + 44, baseY - 20, 2.6, S_IRON_D);

  // ---- the pit: round dished unload pit on the +gy (down-left) face -
  g.fillStyle = S_RAMP;                                              // pale outer ring
  g.beginPath(); g.ellipse(pitx, pity, prx * 1.12, pry * 1.12, 0, 0, 6.29); g.fill();
  outline(g, S_RAMP_E);
  g.fillStyle = S_PIT_D;                                             // dark groove
  g.beginPath(); g.ellipse(pitx, pity + 0.5, prx * 0.98, pry * 0.98, 0, 0, 6.29); g.fill();
  g.fillStyle = S_PIT;                                               // the dish
  g.beginPath(); g.ellipse(pitx, pity + 1.5, prx * 0.84, pry * 0.84, 0, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(pitx, pity + 2, prx * 0.62, pry * 0.62, 0, 0, 6.29); g.stroke();
  g.fillStyle = shade(S_PIT, 1.18);
  g.beginPath(); g.ellipse(pitx, pity + 2.5, prx * 0.40, pry * 0.40, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(0,0,0,.22)';                                   // inner shadow, upper-left
  g.beginPath(); g.ellipse(pitx - 2, pity, prx * 0.84, pry * 0.84, 0, Math.PI * 1.05, Math.PI * 1.85); g.lineTo(pitx, pity + 1.5); g.closePath(); g.fill();
  var pglo = 0.5 + 0.5 * anC;                                        // ore glow at the ladder foot
  g.fillStyle = 'rgba(255,170,60,' + (0.20 + 0.18 * pglo).toFixed(2) + ')';
  g.beginPath(); g.ellipse(pitx + 2, pity + 3, 11, 5, 0, 0, 6.29); g.fill();
  g.fillStyle = AMB;
  g.beginPath(); g.ellipse(pitx + 2, pity + 3, 5, 2.2, 0, 0, 6.29); g.fill();
  g.fillStyle = AMBH;
  g.beginPath(); g.ellipse(pitx + 1, pity + 2.6, 2.2, 1, 0, 0, 6.29); g.fill();
  srand(71 + ph6);
  for (var skI = 0; skI < 5; skI++) {
    var ska = rnd() * 6.29, skr = 3 + rnd() * 8;
    g.fillStyle = rnd() < 0.5 ? AMBH : '#ffd070';
    g.fillRect(pitx + 2 + Math.cos(ska) * skr, pity + 1 - Math.abs(Math.sin(ska)) * skr - rnd() * 3, 1.5, 1.5);
  }
  // ladder from the back cone's foot down into the pit
  var laA = [cx - 9, baseY - 18], laB = [pitx + 4, pity + 2];
  var ldx = laB[0] - laA[0], ldy = laB[1] - laA[1], lL = Math.hypot(ldx, ldy) || 1;
  var lnx = -ldy / lL * 3.8, lny = ldx / lL * 3.8;
  line(laA[0] + lnx, laA[1] + lny, laB[0] + lnx, laB[1] + lny, 2.8, S_LAD_D, 'round');
  line(laA[0] - lnx, laA[1] - lny, laB[0] - lnx, laB[1] - lny, 2.8, S_LAD_D, 'round');
  line(laA[0] + lnx, laA[1] + lny - 1, laB[0] + lnx, laB[1] + lny - 1, 1.4, S_LAD, 'round');
  line(laA[0] - lnx, laA[1] - lny - 1, laB[0] - lnx, laB[1] - lny - 1, 1.4, S_LAD, 'round');
  for (var rgJ = 0; rgJ < 8; rgJ++) {
    var rgt = (0.06 + rgJ / 8 + (bph || 0) / 8) % 1, rgx = laA[0] + ldx * rgt, rgy = laA[1] + ldy * rgt;
    line(rgx + lnx, rgy + lny - 0.6, rgx - lnx, rgy - lny - 0.6, 1.6, shade(S_LAD, 1.12));
  }

  // ---- pale ramp slab off the pit to the dock tile, house lamps -----
  var R = function (s2, w2) { return [cx - 42 - 36 * s2 + w2 * 13, baseY + 24 + 23 * s2 + w2 * 6.5]; };
  poly([R(0, 1), R(1, 1), R(1, -1), R(0, -1)], S_RAMP_E, null);      // edge/thickness
  poly([R(0, 0.9), R(1, 0.9), R(1, -1.1), R(0, -1.1)], S_RAMP, S_RAMP_E);
  g.save(); poly([R(0, 0.9), R(1, 0.9), R(1, -1.1), R(0, -1.1)]); g.clip();
  srand(23);
  for (mI = 0; mI < 8; mI++) {
    g.fillStyle = rnd() < 0.5 ? shade(S_RAMP, 0.88) : '#ffffff'; g.globalAlpha = 0.45;
    var rq = R(rnd(), rnd() * 2 - 1);
    g.beginPath(); g.ellipse(rq[0], rq[1], 3 + rnd() * 5, 1.5 + rnd() * 2, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1; g.restore();
  for (var lmI = 0; lmI < 2; lmI++) {
    var lp = lmI ? R(0.55, -1.35) : R(0.12, 1.25);
    line(lp[0], lp[1], lp[0], lp[1] - 7, 2, S_IRON_D);
    g.fillStyle = HC;
    g.beginPath(); g.ellipse(lp[0], lp[1] - 8, 3.2, 2.4, 0, 0, 6.29); g.fill(); outline(g, HCD);
    g.fillStyle = HCL; g.fillRect(lp[0] - 1.6, lp[1] - 9.5, 2, 1);
  }
} else {
  // ---- Allied Ore Refinery ---------------------------------------------
  // Read off allied-ore-refinery-idle.png at 1:1, mirrored. The drum is
  // a fat cylinder whose OPEN MOUTH faces the viewer-left: nested
  // C-shaped hoops (silver rim, ivory, lavender, ivory, house hoop)
  // wrap its right side and top and open to the left into a navy
  // cavity with a grey slatted floor, a tan hoist and the amber ore
  // slot; the house-coloured ported spine runs from the tall stack's
  // collar down-left across the hoops to a head block that forms the
  // mouth's left jamb. White rails leave the cavity down-left to the
  // dock tile, a chevron patch at each outer corner of the charcoal
  // deck, a house-coloured tank with a white band on either side, three
  // stepped grey blocks under the mouth's bottom-right. The tall stack
  // (cap, groove, neck, collar, ribbed bulge) stands over the hoops'
  // top; the short one on a ribbed silver bulge over the olive ribbed
  // skirt at the right corner, a pipe loop out of the skirt's side.
  // COLOUR POLICY: the only saturated hue is `col` - hoop, spine, head
  // block, collars, tanks. Lavender is a desaturated violet, not blue.
  var A_SIL = '#a4a8b1', A_SIL_D = '#3e434c';
  var A_IVO = '#dadbe5', A_LAV = '#a6a4c6', A_LAV_D = '#70709a';
  var A_NAV = '#1a1e2c', A_NAV_L = '#3a4258';
  var A_OLV = '#5e5e47', A_OLV_L = '#85866c', A_OLV_D = '#2c2d22';
  var A_PLT = '#4c4834', A_PLT_L = '#6c6743', A_PLT_D = '#2a281c';
  var A_CHR = '#24272e', A_GRY = '#767a82';
  var A_TAN = '#b09a6a', A_TAN_D = '#5c4d30';
  var tsx = cx - 3, ssx = cx + 47;                               // stack centres — far enough apart that the crown reads as two, not one

  // ---- plate: olive-brown, lit along the two upper edges -----------
  // Width keeps the full footprint reach (fw*1.94, as every other
  // plot() plate in this file uses); height is cut well back from that
  // -- the plate is a flat roof/apron, not a peaked one, so its ridge
  // must stay low enough that the tall stack's own crown never fuses
  // with a diagonal roofline poking up beside it (unit-identity-
  // reference.md 2.6: refinery wants exactly 2 stack crowns).
  var A_PLW = fw * 1.94, A_PLH = fh * 0.62;
  plot(g, cx, baseY - 2, A_PLW, A_PLH);
  g.fillStyle = A_PLT; g.fill(); outline(g, A_PLT_D);
  g.save(); plot(g, cx, baseY - 2, A_PLW, A_PLH); g.clip();
  line(cx - A_PLW * 0.5, baseY - 2, cx, baseY - 2 - A_PLH * 0.5, 3, A_PLT_L);
  line(cx, baseY - 2 - A_PLH * 0.5, cx + A_PLW * 0.5, baseY - 2, 3, shade(A_PLT_L, 0.86));
  srand(131);
  for (var mI = 0; mI < 14; mI++) {
    g.fillStyle = rnd() < 0.5 ? shade(A_PLT, 0.78) : shade(A_PLT, 1.16);
    g.globalAlpha = 0.30;
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * fw * 1.7, baseY - 2 + (rnd() - 0.5) * fh * 1.6,
              4 + rnd() * 9, 2 + rnd() * 3, 0, 0, 6.29);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,.30)';                                 // cast shadow, down-right
  g.beginPath(); g.ellipse(cx + 30, baseY + 16, 50, 14, 0, 0, 6.29); g.fill();
  g.restore();

  // ---- charcoal dock deck: from the mouth down-left to the dock tile --
  var dkx0 = cx - 36, dky0 = baseY + 9;
  var Q = function (s2, w2) { return [dkx0 - 40 * s2 + w2 * 14, dky0 + 22 * s2 + w2 * 7]; };
  poly([Q(-0.55, -1.5), Q(1.05, -1.5), Q(1.05, 1.5), Q(-0.55, 1.5)], A_CHR, A_PLT_D);
  poly([Q(-0.55, -1.5), Q(1.05, -1.5), Q(1.05, -1.3), Q(-0.55, -1.3)], shade(A_CHR, 1.7), null);
  poly([[cx - 14, baseY + 6], [cx + 24, baseY + 6], [cx + 24, baseY + 34], [cx - 14, baseY + 34]], A_CHR, null);

  // ---- ribbed olive skirt at the right corner, with its pipe loop ----
  var dmx = ssx, dmy = baseY + 16, dmr = 24, dmh = 26;
  var dgr = g.createLinearGradient(dmx - dmr, 0, dmx + dmr, 0);
  dgr.addColorStop(0, A_OLV_L); dgr.addColorStop(0.45, A_OLV); dgr.addColorStop(1, A_OLV_D);
  g.fillStyle = dgr;
  g.beginPath(); g.moveTo(dmx - dmr, dmy); g.lineTo(dmx - dmr, dmy - dmh);
  g.lineTo(dmx + dmr, dmy - dmh); g.lineTo(dmx + dmr, dmy); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(dmx, dmy, dmr, dmr * 0.42, 0, 0, Math.PI); g.fill();
  outline(g, A_OLV_D);
  for (var rbI = -3; rbI <= 3; rbI++) {                          // vertical ribs
    var rbx = dmx + rbI * 5.8, rbf = Math.sqrt(Math.max(0, 1 - (rbI * 5.8 / dmr) * (rbI * 5.8 / dmr)));
    line(rbx, dmy - dmh + 1, rbx, dmy + rbf * dmr * 0.42 - 1, 1.3, 'rgba(0,0,0,.45)');
    line(rbx - 1.4, dmy - dmh + 1, rbx - 1.4, dmy - 1, 0.8, 'rgba(255,255,255,.18)');
  }
  g.fillStyle = A_OLV_L;                                          // top ring
  g.beginPath(); g.ellipse(dmx, dmy - dmh, dmr, dmr * 0.42, 0, 0, 6.29); g.fill(); outline(g, A_OLV_D);
  g.fillStyle = shade(A_OLV, 0.90);
  g.beginPath(); g.ellipse(dmx, dmy - dmh, dmr * 0.74, dmr * 0.31, 0, 0, 6.29); g.fill(); outline(g, A_OLV_D);
  // pipe loop out of the skirt's right side and down into the plate
  line(dmx + 16, dmy - 15, dmx + 29, dmy - 12, 6, A_SIL_D, 'round');
  line(dmx + 29, dmy - 12, dmx + 29, dmy + 4, 6, A_SIL_D, 'round');
  line(dmx + 29, dmy + 4, dmx + 20, dmy + 8, 6, A_SIL_D, 'round');
  line(dmx + 16, dmy - 15, dmx + 29, dmy - 12, 3.2, A_GRY, 'round');
  line(dmx + 29, dmy - 12, dmx + 29, dmy + 4, 3.2, A_GRY, 'round');
  line(dmx + 29, dmy + 4, dmx + 20, dmy + 8, 3.2, A_GRY, 'round');
  line(dmx + 17, dmy - 16, dmx + 28, dmy - 13.5, 1, 'rgba(255,255,255,.35)', 'round');
  g.fillStyle = A_SIL_D; g.fillRect(dmx + 26, dmy - 7, 6, 2.4); g.fillRect(dmx + 26, dmy - 1, 6, 2.4);
  // ribbed silver bulge, house collar, neck, groove, cap, open bore —
  // sized to match the tall stack's own chain (13/13.4/9.2-12) rather
  // than a scaled-down copy: RA2's own two stacks measure within 2 px
  // of each other (22-24 of 169), so a visibly thinner second stack
  // was itself an inaccuracy, not just a spacing bug.
  tube(ssx, dmy - dmh + 2, 16, 11, shade(A_SIL, 0.84), A_SIL_D);
  for (var bbI = -2; bbI <= 2; bbI++) line(ssx + bbI * 5, dmy - dmh - 8, ssx + bbI * 5, dmy - dmh + 1, 1, 'rgba(0,0,0,.38)');
  ring(ssx, dmy - dmh - 9, 9.5, 4.5, HC, HCD);
  tube(ssx, dmy - dmh - 13.5, 9, 20, A_SIL, A_SIL_D);
  tube(ssx, dmy - dmh - 33, 13, 20, shade(A_SIL, 0.90), A_SIL_D, shade(A_SIL, 0.52));
  ring(ssx, dmy - dmh - 43, 13.4, 2.8, shade(A_SIL, 0.62), null);
  g.fillStyle = A_NAV;
  g.beginPath(); g.ellipse(ssx, dmy - dmh - 53, 9.2, 3.9, 0, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(230,234,242,.5)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(ssx, dmy - dmh - 53, 12, 5, 0, 0, 6.29); g.stroke();

  // ---- the drum: nested C hoops round a navy cavity ------------------
  // Rings from the outer rim inward; each is a little smaller and sits
  // a little up-right of the last, so the bands are fat on the right
  // and thin at the top, as the receding cylinder's rings are in RA2.
  var C0 = [cx + 2, baseY - 12, 35, 31], C1 = [cx - 6, baseY - 11, 9, 16];   // rim, cavity
  var rg = function (t) {                                            // t: 0 rim -> 1 cavity
    return [C0[0] + (C1[0] - C0[0]) * t, C0[1] + (C1[1] - C0[1]) * t,
            C0[2] + (C1[2] - C0[2]) * t, C0[3] + (C1[3] - C0[3]) * t];
  };
  var ell = function (E, fill, edge) {
    g.beginPath(); g.ellipse(E[0], E[1], E[2], E[3], 0, 0, 6.29);
    if (fill) { g.fillStyle = fill; g.fill(); } if (edge) outline(g, edge);
  };
  var bands = [[0.00, A_SIL], [0.06, A_IVO], [0.28, A_LAV], [0.52, A_IVO], [0.72, HC], [0.92, A_NAV]];
  var mouthL = cx - 41;                                              // the head block's jamb
  g.save();
  ell(C0); g.rect(mouthL, C0[1] - C0[3], C0[0] - mouthL, C0[3] * 2); g.clip();
  // the hoops continue left along the top of the opening as flat bands
  for (var bI = 0; bI < bands.length; bI++) {
    var E = rg(bands[bI][0]);
    g.fillStyle = bands[bI][1];
    g.fillRect(mouthL, E[1] - E[3], E[0] - mouthL, E[3] * 2);
    ell(E, bands[bI][1], null);
    if (bI > 0 && bI < 5) {                                          // hard seam between bands
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(E[0], E[1], E[2], E[3], 0, 0, 6.29); g.stroke();
      line(mouthL, E[1] - E[3] + 0.5, E[0], E[1] - E[3] + 0.5, 1, 'rgba(0,0,0,.35)');
    }
  }
  // cavity: the inner ellipse plus everything left of it to the jamb
  var Ec = rg(1);
  g.fillStyle = A_NAV; g.fillRect(mouthL, Ec[1] - Ec[3], Ec[0] - mouthL, Ec[3] * 2);
  ell(Ec, A_NAV, null);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(mouthL, Ec[1] - Ec[3], Ec[0] - mouthL, Ec[3] * 2);
  var cgr2 = g.createLinearGradient(mouthL, Ec[1] - Ec[3], Ec[0], Ec[1] + Ec[3]);   // far wall catches some light
  cgr2.addColorStop(0, 'rgba(120,130,170,.28)'); cgr2.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cgr2; g.fillRect(mouthL, Ec[1] - Ec[3], Ec[0] - mouthL, Ec[3] * 2);
  g.strokeStyle = 'rgba(120,130,160,.22)'; g.lineWidth = 1.2;         // ribs inside the shell
  for (var irI = 1; irI < 4; irI++) {
    var Ei = rg(0.92 + irI * 0.02);
    g.beginPath(); g.ellipse(Ei[0] - irI * 6, Ei[1], Ei[2] + irI * 3, Ei[3] + irI * 2.5, 0, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  }
  // grey slatted floor across the bottom of the cavity
  poly([[mouthL, baseY - 2], [cx - 6, baseY - 2], [cx + 4, baseY + 14], [mouthL, baseY + 14]], shade(A_GRY, 0.66), null);
  for (var gsI = 0; gsI < 5; gsI++) {
    var gsy = baseY + 1 + gsI * 3.2;
    line(mouthL, gsy, cx - 4 + gsI * 1.5, gsy, 1, 'rgba(0,0,0,.5)');
    line(mouthL, gsy - 1.3, cx - 4 + gsI * 1.5, gsy - 1.3, 0.8, 'rgba(255,255,255,.16)');
  }
  // light falls in from the upper-left onto the hoops; the far right darkens
  var hgr = g.createLinearGradient(cx - 40, baseY - 45, cx + 34, baseY + 20);
  hgr.addColorStop(0, 'rgba(255,255,255,.16)'); hgr.addColorStop(0.5, 'rgba(0,0,0,0)');
  hgr.addColorStop(1, 'rgba(0,0,0,.40)');
  g.fillStyle = hgr; g.fillRect(mouthL, C0[1] - C0[3] - 2, C0[0] + C0[2] - mouthL + 2, C0[3] * 2 + 4);
  g.restore();
  g.strokeStyle = A_SIL_D; g.lineWidth = 1.2;                       // rim edge
  g.beginPath(); g.ellipse(C0[0], C0[1], C0[2], C0[3], 0, -Math.PI * 0.5, Math.PI * 0.55); g.stroke();
  line(mouthL, C0[1] - C0[3] - 0.5, C0[0], C0[1] - C0[3] - 0.5, 1.2, A_SIL_D);
  line(mouthL, C0[1] - C0[3] + 1, C0[0], C0[1] - C0[3] + 1, 1, 'rgba(255,255,255,.6)');
  line(mouthL, Ec[1] - Ec[3] - 1.5, Ec[0] - 4, Ec[1] - Ec[3] - 1.5, 4, '#2a2f3c');          // lintel over the opening
  // hoist column in the cavity (bobs with the phase) + the ore slot glow
  var hzx = cx - 28, hzb = baseY + 9, hzo = 3 * anS;
  line(hzx, hzb - 1, hzx, hzb - 24 + hzo, 5.5, A_TAN_D);
  line(hzx - 1, hzb - 1, hzx - 1, hzb - 24 + hzo, 2.4, A_TAN);
  g.fillStyle = A_TAN_D; g.fillRect(hzx - 6, hzb - 27 + hzo, 12, 4);
  g.fillStyle = A_TAN; g.fillRect(hzx - 6, hzb - 27 + hzo, 12, 1.4);
  g.fillStyle = shade(A_SIL, 0.7); g.fillRect(hzx - 3.5, hzb - 31 + hzo, 7, 4);
  line(hzx - 9, hzb - 30 + hzo, hzx + 9, hzb - 30 + hzo, 1.4, A_SIL_D);
  var glo = 0.55 + 0.45 * anC;
  g.fillStyle = 'rgba(255,170,60,' + (0.22 + 0.16 * glo).toFixed(2) + ')';
  g.beginPath(); g.ellipse(hzx, hzb, 15, 6, 0, 0, 6.29); g.fill();
  g.fillStyle = AMB;
  g.beginPath(); g.ellipse(hzx, hzb, 7.5, 3.0, 0, 0, 6.29); g.fill();
  g.fillStyle = AMBH;
  g.beginPath(); g.ellipse(hzx - 1, hzb - 0.6, 3.4, 1.4, 0, 0, 6.29); g.fill();
  srand(41 + ph6);
  for (var skI = 0; skI < 5; skI++) {                              // sparks
    var ska = rnd() * 6.29, skr = 4 + rnd() * 9;
    g.fillStyle = rnd() < 0.5 ? AMBH : '#ffd070';
    g.fillRect(hzx + Math.cos(ska) * skr, hzb - 3 - Math.abs(Math.sin(ska)) * skr - rnd() * 4, 1.6, 1.6);
  }

  // ---- stepped grey blocks under the mouth's bottom-right -----------
  prism(g, cx - 2, baseY + 22, 9, 4.5, 12, A_GRY, shade(A_GRY, 1.35), A_PLT_D);
  prism(g, cx + 9, baseY + 27, 8, 4, 8, A_GRY, shade(A_GRY, 1.35), A_PLT_D);
  prism(g, cx + 18, baseY + 31, 6, 3, 5, A_GRY, shade(A_GRY, 1.35), A_PLT_D);

  // ---- tall stack over the hoops' top: bulge, collar, neck, cap -----
  tube(tsx, baseY - 29, 16, 11, shade(A_SIL, 0.84), A_SIL_D);
  for (var tbI = -3; tbI <= 3; tbI++) line(tsx + tbI * 5, baseY - 39, tsx + tbI * 5, baseY - 30, 1, 'rgba(0,0,0,.38)');
  ring(tsx, baseY - 40, 12, 5, HC, HCD);
  tube(tsx, baseY - 45, 10, 21, A_SIL, A_SIL_D);
  tube(tsx, baseY - 66, 13, 21, shade(A_SIL, 0.90), A_SIL_D, shade(A_SIL, 0.52));
  ring(tsx, baseY - 76, 13.4, 2.8, shade(A_SIL, 0.62), null);
  g.fillStyle = A_NAV;
  g.beginPath(); g.ellipse(tsx, baseY - 87, 9.2, 3.9, 0, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(230,234,242,.5)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(tsx, baseY - 87, 12, 5, 0, 0, 6.29); g.stroke();

  // ---- the ported spine: collar down-left to the head block ---------
  // Tucked under the stack's base collar (not its neck) so this band
  // stays on the vault's face, below the roofline the two stacks alone
  // are meant to crown — see rts.html's own note above that the stacks
  // are the whole read here.
  var spA = [tsx, baseY - 24], spB = [cx - 30, baseY - 10];
  line(spA[0], spA[1] + 1.5, spB[0], spB[1] + 1.5, 14, HCD, 'round');
  line(spA[0], spA[1], spB[0], spB[1], 12, HC, 'round');
  line(spA[0] - 1, spA[1] - 4.2, spB[0] - 1, spB[1] - 4.2, 2.2, HCL, 'round');
  for (var poI = 0; poI < 3; poI++) {                              // three round ports
    var pt4 = 0.18 + poI * 0.31;
    var pxp = spA[0] + (spB[0] - spA[0]) * pt4, pyp = spA[1] + (spB[1] - spA[1]) * pt4;
    g.fillStyle = HCD;
    g.beginPath(); g.ellipse(pxp, pyp, 5.6, 4.4, 0, 0, 6.29); g.fill();
    g.fillStyle = ((5 - ph6) % 3) === poI ? '#e8ecf6' : A_NAV_L;
    g.beginPath(); g.ellipse(pxp, pyp - 0.3, 3.2, 2.5, 0, 0, 6.29); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(pxp, pyp, 5.6, 4.4, 0, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
  }
  // head block: the mouth's left jamb, a house-coloured post with a lit top
  poly([[cx - 33, baseY - 32], [cx - 47, baseY - 32], [cx - 47, baseY + 2], [cx - 40, baseY + 5], [cx - 33, baseY - 2]], HC, HCD);
  g.fillStyle = HCL; g.fillRect(cx - 47, baseY - 32, 14, 1.8);
  line(cx - 46, baseY - 30, cx - 46, baseY, 1.2, HCL);
  line(cx - 34.5, baseY - 30, cx - 34.5, baseY - 3, 1.4, HCD);
  g.fillStyle = HCD; g.fillRect(cx - 45, baseY - 22, 10, 1.6); g.fillRect(cx - 45, baseY - 12, 10, 1.6);

  // ---- the dock: white rails, ties, chevrons, tanks ------------------
  poly([Q(0.0, -0.95), Q(1.0, -0.95), Q(1.0, 0.95), Q(0.0, 0.95)], '#585c64', null);
  for (var raI = 0; raI < 2; raI++) {
    var rw = raI ? 0.68 : -0.68, r0p = Q(0.0, rw), r1p = Q(1.0, rw);
    line(r0p[0], r0p[1] + 1.2, r1p[0], r1p[1] + 1.2, 4, '#0f1116');
    line(r0p[0], r0p[1] - 0.6, r1p[0], r1p[1] - 0.6, 3, '#eef0f4');
  }
  for (var tiI = 0; tiI < 8; tiI++) {
    var tis = 0.07 + tiI * 0.125, t0p = Q(tis, -0.85), t1p = Q(tis, 0.85);
    line(t0p[0], t0p[1], t1p[0], t1p[1], 1.8, '#1a1d24');
  }
  var chev = function (s0, s1, w0, w1, n) {
    for (var chI = 0; chI < n; chI++) {
      var ca = s0 + (s1 - s0) * chI / n, cb = s0 + (s1 - s0) * (chI + 1) / n;
      poly([Q(ca, w0), Q(ca, w1), Q(cb, w1), Q(cb, w0)], chI % 2 ? HAZ : '#1e2026', null);
    }
  };
  chev(0.72, 1.02, -1.5, -0.95, 6);                                // far corner, upper side
  chev(0.02, 0.32, 0.95, 1.5, 6);                                  // near corner, lower side
  // two house-coloured tanks lying along the rails, white band amidships
  var tank = function (ta, tb) {
    line(ta[0] + 1, ta[1] + 3, tb[0] + 1, tb[1] + 3, 12, 'rgba(0,0,0,.35)', 'round');
    line(ta[0], ta[1], tb[0], tb[1], 12, HCD, 'round');
    line(ta[0], ta[1] - 1, tb[0], tb[1] - 1, 9, HC, 'round');
    var tmx = (ta[0] + tb[0]) / 2, tmy = (ta[1] + tb[1]) / 2 - 1;
    line(tmx - 2.6, tmy - 6.5, tmx + 2.6, tmy + 5.5, 5, '#e9ebf0');
    line(ta[0] + 2, ta[1] - 4.5, tb[0] - 2, tb[1] - 4.5, 1.2, 'rgba(255,255,255,.45)', 'round');
    line(ta[0] + 3, ta[1] + 3.6, tb[0] - 3, tb[1] + 3.6, 1.2, 'rgba(0,0,0,.35)', 'round');
  };
  tank(Q(0.55, -1.95), Q(1.0, -1.95));
  tank(Q(0.32, 1.95), Q(0.78, 1.95));
  if (window.__dbgMark) {
    g.fillStyle = 'rgb(255,0,255)'; g.fillRect(cx - 1, baseY - 1, 3, 3);
    g.fillStyle = 'rgb(0,255,255)'; g.fillRect(tsx - 1, baseY - 1, 3, 3);
    g.fillStyle = 'rgb(255,255,0)'; g.fillRect(ssx - 1, baseY - 1, 3, 3);
    g.fillStyle = 'rgb(0,255,0)'; g.fillRect(mouthL - 1, baseY - 1, 3, 3);
    g.fillStyle = 'rgb(255,128,0)'; g.fillRect(cx - 1, Math.round(baseY - 2 - A_PLH * 0.5) - 1, 3, 3);
    g.fillStyle = 'rgb(255,0,0)'; g.fillRect(mouthL - 1, Math.round(C0[1] - C0[3]) - 1, 3, 3);
    g.fillStyle = 'rgb(0,0,255)'; g.fillRect(Math.round(spA[0])-1, Math.round(spA[1])-1, 3, 3);
    g.fillStyle = 'rgb(128,0,255)'; g.fillRect(Math.round(spB[0])-1, Math.round(spB[1])-1, 3, 3);
  }
}
}
