// ─── structures/power ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { diamond, mixc, shade } from '../../bake/terrain.js';
import { cylinder } from '../../bake/vehicles.js';

export function drawStructurePower(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot, rnd = C.rnd, sov = C.sov, srand = C.srand;

// Rebuilt at 1:1 from the RA2 sprites (art pass 8). Two different
// buildings: the Allied plant is three slim capacitor towers standing on
// flared house-coloured CONES around an upturned copper dish; the Soviet
// one is a pale glass orb cradled between two rough masonry masses
// plastered with red warning slabs. Neither has a chimney. Six idle
// phases (`bph`) are baked into A.frames and cycled by drawBld.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP), anC = Math.cos(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
if (sov) {
  // --- Tesla Reactor -------------------------------------------------
  // Read off `soviet-tesla-reactor-anim-last.png` (bbox 113x94 with the
  // magenta shadow index masked, aspect 1.202): a near-black deck with a
  // pale stone kerb; a TALL NARROW rubble tower back-left and a WIDER,
  // LOWER terraced rubble stack right; the orb cradled between them; and
  // exactly four red surfaces - one narrow slab on each mass's top, one
  // big panel flat on the deck front-left, one glyph plate front-centre.
  // The lit face of the stone is pinkish TAN, the shaded face olive.
  var STN = '#8f7a6b', STN_H = '#b7a18d', STN_D = '#57453a';   // lit rubble
  var OLV = '#3a3b26', OLV_H = '#50512f', OLV_D = '#1b1c0c';   // shaded rubble
  var SEAM = '#2a2118';
  var PIPE = '#767b84', PIPE_D = '#1c1f26';
  var DECK = '#191b26', DECK_D = '#0a0b11', KERB = '#b3a48c';

  srand(311);

  // ---- deck: a low near-black slab with a pale stone kerb and a
  // diagonal strut lattice across its near riser.
  var dW = fw * 1.90, dH = fh * 1.90, dTop = baseY - 5, dRise = 8;
  g.fillStyle = 'rgba(0,0,0,.44)';
  plot(g, cx + 3, baseY + 6, dW * 1.02, dH * 1.02); g.fill();
  g.fillStyle = DECK_D;                                        // riser
  g.beginPath();
  g.moveTo(cx - dW / 2, dTop); g.lineTo(cx, dTop + dH / 2); g.lineTo(cx + dW / 2, dTop);
  g.lineTo(cx + dW / 2, dTop + dRise); g.lineTo(cx, dTop + dH / 2 + dRise);
  g.lineTo(cx - dW / 2, dTop + dRise); g.closePath();
  g.fill(); outline(g, '#05060a');
  g.strokeStyle = 'rgba(120,112,96,.55)'; g.lineWidth = 1;     // strut lattice
  for (var lt = 0; lt <= 9; lt++) {
    var ltt = lt / 9, lx = cx - dW / 2 + dW / 2 * ltt, ly = dTop + dH / 2 * ltt;
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 5, ly + dRise - 1); g.stroke();
    var rx2 = cx + dW / 2 * ltt, ry2 = dTop + dH / 2 - dH / 2 * ltt;
    g.beginPath(); g.moveTo(rx2, ry2); g.lineTo(rx2 - 5, ry2 + dRise - 1); g.stroke();
  }
  diamond(g, cx, dTop, dW, dH);                                // deck top
  g.fillStyle = DECK; g.fill(); outline(g, DECK_D);
  g.strokeStyle = shade(KERB, 0.86); g.lineWidth = 2.2;        // pale stone kerb
  g.beginPath();
  g.moveTo(cx - dW / 2 + 1, dTop); g.lineTo(cx, dTop + dH / 2 - 1);
  g.lineTo(cx + dW / 2 - 1, dTop); g.stroke();
  g.strokeStyle = 'rgba(179,164,140,.34)'; g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(cx - dW / 2 + 1, dTop); g.lineTo(cx, dTop - dH / 2 + 1);
  g.lineTo(cx + dW / 2 - 1, dTop); g.stroke();
  g.fillStyle = 'rgba(150,140,120,.10)';                       // grit on the deck
  for (var gr = 0; gr < 46; gr++) {
    var gt = rnd(), gu = rnd(), gx2 = cx + (gt - gu) * dW * 0.44;
    var gy2 = dTop + (gt + gu - 1) * dH * 0.44;
    g.fillRect(gx2, gy2, 2, 1);
  }

  // ---- a skewed quad on a wall: p along the wall, q bottom -> top.
  var wq = function (a, b, at, bt, p0, p1, q0, q1, fill, edge) {
    var P = function (p, q) {
      var x0 = a[0] + (b[0] - a[0]) * p, y0 = a[1] + (b[1] - a[1]) * p;
      var x1 = at[0] + (bt[0] - at[0]) * p, y1 = at[1] + (bt[1] - at[1]) * p;
      return [x0 + (x1 - x0) * q, y0 + (y1 - y0) * q];
    };
    var c0 = P(p0, q0), c1 = P(p1, q0), c2 = P(p1, q1), c3 = P(p0, q1);
    g.beginPath();
    g.moveTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]);
    g.lineTo(c2[0], c2[1]); g.lineTo(c3[0], c3[1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) outline(g, edge);
    return P;
  };

  // ---- one rubble wall: irregular horizontal courses, a seam line at
  // each course and a heavy mottle. The lit face is tan, the shaded face
  // olive with two dark vertical channels (that is what the sprite shows).
  var rubble = function (a, b, at, bt, lit, courses) {
    var base = lit ? STN : OLV, hiC = lit ? STN_H : OLV_H, loC = lit ? STN_D : OLV_D;
    var P = wq(a, b, at, bt, 0, 1, 0, 1, base, SEAM);
    g.save();
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.lineTo(bt[0], bt[1]); g.lineTo(at[0], at[1]); g.closePath(); g.clip();
    for (var cs = 0; cs < courses; cs++) {
      var v0 = cs / courses, v1 = (cs + 1) / courses - (cs % 3 === 1 ? 0.012 : 0);
      var tone = cs % 2 ? mixc(base, loC, 0.22) : mixc(base, hiC, 0.18);
      wq(a, b, at, bt, -0.05, 1.05, v0, v1 - 0.012, tone, null);
      wq(a, b, at, bt, -0.05, 1.05, v1 - 0.010, v1, 'rgba(42,33,24,.72)', null);
      // a couple of proud stones per course
      for (var st = 0; st < 7; st++) {
        var s0 = rnd() * 0.90, sw = 0.045 + rnd() * 0.085;
        g.fillStyle = rnd() > 0.5 ? mixc(tone, hiC, 0.62) : mixc(tone, loC, 0.58);
        var q0p = P(s0, v0 + 0.010), q1p = P(s0 + sw, v0 + 0.010);
        var q2p = P(s0 + sw, v1 - 0.016), q3p = P(s0, v1 - 0.016);
        g.beginPath();
        g.moveTo(q0p[0], q0p[1]); g.lineTo(q1p[0], q1p[1]);
        g.lineTo(q2p[0], q2p[1]); g.lineTo(q3p[0], q3p[1]); g.closePath(); g.fill();
      }
    }
    g.fillStyle = lit ? 'rgba(62,44,32,.30)' : 'rgba(10,12,8,.30)';   // grime wash
    for (var mo = 0; mo < 26; mo++) {
      var mp = P(rnd(), 0.04 + rnd() * 0.92);
      g.fillRect(mp[0] - 1.6, mp[1] - 1.1, 3.2 + rnd() * 2, 2.2);
    }
    if (!lit) {                                    // dark vertical channels
      wq(a, b, at, bt, 0.26, 0.325, 0.05, 0.95, 'rgba(8,10,20,.62)', null);
      wq(a, b, at, bt, 0.62, 0.685, 0.05, 0.95, 'rgba(8,10,20,.62)', null);
    } else {
      wq(a, b, at, bt, 0, 0.055, 0.02, 0.98, 'rgba(240,226,206,.30)', null);
    }
    wq(a, b, at, bt, -0.05, 1.05, 0, 0.06, 'rgba(6,8,16,.55)', null);   // foot shadow
    g.restore();
  };

  // ---- a rubble block. Returns its roof centre / half extents so the
  // caller can terrace another block on top or lay a slab.
  var block = function (px, py, hw, hh, hgt, courses) {
    var W = [px - hw, py], S = [px, py + hh], E = [px + hw, py];
    var ty = py - hgt;
    var Wt = [px - hw, ty], St = [px, ty + hh], Et = [px + hw, ty];
    g.fillStyle = 'rgba(0,0,0,.40)';
    diamond(g, px + 3, py + 2, hw * 2.1, hh * 2.1); g.fill();
    rubble(W, S, Wt, St, true, courses);
    rubble(S, E, St, Et, false, courses);
    diamond(g, px, ty, hw * 2, hh * 2);
    g.fillStyle = '#3f4030'; g.fill(); outline(g, SEAM);
    g.fillStyle = 'rgba(214,198,176,.26)';
    g.beginPath();
    g.moveTo(px - hw, ty); g.lineTo(px, ty - hh); g.lineTo(px, ty + hh); g.closePath(); g.fill();
    return { x: px, y: ty, hw: hw, hh: hh };
  };

  // ---- the narrow red warning slab that lies on a roof, seated on a
  // pale kerb and running along the roof's up-right axis.
  var slab = function (R, u0, u1, v0, v1, lift) {
    var RP = function (u, v) {
      return [R.x + R.hw * (u + v - 1), R.y - (lift || 0) + R.hh * (v - u)];
    };
    var quad = function (a0, a1, b0, b1, fill, edge) {
      var k0 = RP(a0, b0), k1 = RP(a1, b0), k2 = RP(a1, b1), k3 = RP(a0, b1);
      g.beginPath();
      g.moveTo(k0[0], k0[1]); g.lineTo(k1[0], k1[1]);
      g.lineTo(k2[0], k2[1]); g.lineTo(k3[0], k3[1]); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (edge) outline(g, edge);
    };
    quad(u0 - 0.05, u1 + 0.05, v0 - 0.07, v1 + 0.07, '#8b7a66', SEAM);   // stone kerb
    quad(u0 - 0.05, u1 + 0.05, v0 - 0.07, v0 - 0.02, '#9c8c78', null);
    quad(u0, u1, v0 + 0.03, v1 + 0.03, shade(col, 0.34), null);          // slab shadow
    quad(u0, u1, v0, v1, col, shade(col, 0.42));
    quad(u0, u1, v0, v0 + 0.10, shade(col, 1.30), null);                 // lit far lip
    quad(u0, u1, v1 - 0.10, v1, shade(col, 0.60), null);
    g.strokeStyle = 'rgba(26,10,8,.30)'; g.lineWidth = 1;
    for (var rb = 1; rb < 3; rb++) {
      var ra = RP(u0 + (u1 - u0) * rb / 3, v0), rb2 = RP(u0 + (u1 - u0) * rb / 3, v1);
      g.beginPath(); g.moveTo(ra[0], ra[1]); g.lineTo(rb2[0], rb2[1]); g.stroke();
    }
  };

  // ---- back-left tower: tall and narrow (~20x48 in the sprite).
  var lx = cx - fw * 0.37, ly = dTop - 2;
  var LT = block(lx, ly, 13.4, 7.6, 49, 13);
  g.fillStyle = '#6d727c';                                 // grey vent cap, left of the slab
  g.beginPath();
  g.moveTo(LT.x - LT.hw, LT.y - 1); g.lineTo(LT.x - LT.hw * 0.20, LT.y - LT.hh * 0.72);
  g.lineTo(LT.x - LT.hw * 0.20, LT.y - LT.hh * 0.72 - 5);
  g.lineTo(LT.x - LT.hw, LT.y - 6); g.closePath(); g.fill(); outline(g, '#2a2e34');
  g.fillStyle = '#9ba1ab';
  g.fillRect(LT.x - LT.hw + 1, LT.y - 7.5, 4, 2);
  slab(LT, 0.06, 1.02, 0.02, 0.72, 3);

  var rmp = function (qx, qy, qw, qh, fill, edge) {
    g.beginPath();
    g.moveTo(qx - qw / 2, qy); g.lineTo(qx, qy - qh / 2);
    g.lineTo(qx + qw / 2, qy); g.lineTo(qx, qy + qh / 2); g.closePath();
    g.fillStyle = fill; g.fill(); if (edge) outline(g, edge);
  };
  rmp(lx + 12, dTop + fh * 0.34, 30, 18, '#6f6252', SEAM);
  rmp(lx + 12, dTop + fh * 0.34 - 1.5, 26, 15, '#9d8e79', null);
  rmp(lx + 12, dTop + fh * 0.34 - 2.5, 20, 11, '#7f7263', null);

  // horizontal pipe stub projecting LEFT out of the tower's flank
  g.fillStyle = shade(PIPE, 0.62);
  g.fillRect(lx - 25, ly - 21, 16, 7.4); outline(g, '#0f1116');
  g.fillStyle = PIPE; g.fillRect(lx - 25, ly - 21, 16, 3.0);
  g.fillStyle = shade(PIPE, 1.24); g.fillRect(lx - 25, ly - 20.4, 16, 1.2);
  g.fillStyle = '#9aa0a9';
  g.beginPath(); g.ellipse(lx - 25, ly - 17.3, 2.6, 3.9, 0, 0, 6.29); g.fill();
  outline(g, '#0f1116');
  g.fillStyle = '#41464e';
  g.beginPath(); g.ellipse(lx - 25, ly - 17.3, 1.3, 2.2, 0, 0, 6.29); g.fill();

  // ---- girder frame between the masses (behind the orb).
  g.strokeStyle = '#2c3244'; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(lx + 9, ly - 42); g.lineTo(cx + fw * 0.34, dTop - 32); g.stroke();
  g.strokeStyle = '#464f66'; g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(lx + 9, ly - 44); g.lineTo(cx + fw * 0.34, dTop - 34); g.stroke();
  g.strokeStyle = '#232838'; g.lineWidth = 2.2;
  for (var gg = 0; gg < 4; gg++) {
    var gt2 = 0.14 + gg * 0.24;
    var gax = lx + 9 + (cx + fw * 0.34 - lx - 9) * gt2;
    var gay = ly - 42 + (dTop - 32 - ly + 42) * gt2;
    g.beginPath(); g.moveTo(gax, gay); g.lineTo(gax + 3, gay + 13); g.stroke();
  }

  // ---- the orb ------------------------------------------------------
  // Matte pale grey-white glass with a cloudy swirl and a violet glow
  // ring; the lower third goes to steel. Its crown sits BELOW both roofs.
  var oy = dTop - 15, ox = cx + fw * 0.03, orad = 15.5;
  var pulse = 0.86 + 0.14 * anS;
  g.fillStyle = 'rgba(132,134,222,' + (0.09 * pulse).toFixed(3) + ')';
  g.beginPath(); g.arc(ox, oy, orad * 1.26, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(154,156,238,' + (0.22 * pulse).toFixed(3) + ')';
  g.beginPath(); g.arc(ox, oy, orad * 1.09, 0, 6.29); g.fill();

  g.fillStyle = '#1b1e2c';                                 // steel cradle behind
  g.beginPath();
  g.moveTo(ox - orad * 1.05, oy + orad * 0.42);
  g.lineTo(ox + orad * 1.05, oy + orad * 0.42);
  g.lineTo(ox + orad * 0.78, dTop + 2);
  g.lineTo(ox - orad * 0.86, dTop + 2);
  g.closePath(); g.fill(); outline(g, '#080a10');
  g.strokeStyle = '#7f858f'; g.lineWidth = 1.7;
  for (var st3 = -1; st3 <= 1; st3++) {
    g.beginPath();
    g.moveTo(ox + st3 * orad * 0.46, oy + orad * 0.66);
    g.lineTo(ox + st3 * orad * 0.60, dTop + 1); g.stroke();
  }

  var og = g.createRadialGradient(ox - orad * 0.34, oy - orad * 0.42, orad * 0.06,
                                  ox, oy, orad * 1.02);
  og.addColorStop(0, '#fdfdff');
  og.addColorStop(0.18, '#dfe0ea');
  og.addColorStop(0.44, '#b0b2c3');
  og.addColorStop(0.70, '#7c8095');
  og.addColorStop(0.90, '#52566c');
  og.addColorStop(1, '#33364a');
  g.fillStyle = og;
  g.beginPath(); g.arc(ox, oy, orad, 0, 6.29); g.fill();
  g.save();
  g.beginPath(); g.arc(ox, oy, orad, 0, 6.29); g.clip();
  var sg3 = g.createLinearGradient(0, oy + orad * 0.10, 0, oy + orad);
  sg3.addColorStop(0, 'rgba(96,100,122,0)');
  sg3.addColorStop(0.45, 'rgba(84,88,110,.66)');
  sg3.addColorStop(1, 'rgba(38,41,56,.94)');
  g.fillStyle = sg3;
  g.fillRect(ox - orad, oy + orad * 0.10, orad * 2, orad);
  srand(41);                                               // mottled cloud swirl
  for (var cl = 0; cl < 14; cl++) {
    var ca = -2.6 + cl * 0.46 + anP * 0.16, crr = orad * (0.14 + cl * 0.045);
    var dk = cl % 3 === 1;
    g.fillStyle = dk ? 'rgba(126,130,152,' + (0.34 - cl * 0.014).toFixed(3) + ')'
                     : 'rgba(255,255,255,' + (0.46 - cl * 0.026).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(ox + Math.cos(ca) * crr * 0.92 - orad * 0.12,
              oy + Math.sin(ca) * crr * 0.72 - orad * 0.18,
              orad * (0.26 - cl * 0.010) * (0.6 + rnd() * 0.7),
              orad * (0.19 - cl * 0.007) * (0.6 + rnd() * 0.7), ca, 0, 6.29);
    g.fill();
  }
  g.strokeStyle = 'rgba(74,78,100,.34)'; g.lineWidth = 1.2; // cradle band
  g.beginPath(); g.ellipse(ox, oy + orad * 0.50, orad * 1.02, orad * 0.24, 0, 0, 6.29);
  g.stroke();
  g.restore();
  g.strokeStyle = '#4a4d66'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(ox, oy, orad - 0.4, 0, 6.29); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(ox, oy, orad * 0.90, 3.35, 5.30); g.stroke();

  // dark machine framework banked under the orb, between the masses
  g.fillStyle = '#171a26';
  g.beginPath();
  g.moveTo(cx - fw * 0.20, dTop - 6); g.lineTo(cx + fw * 0.26, dTop + 4);
  g.lineTo(cx + fw * 0.26, dTop + 12); g.lineTo(cx - fw * 0.20, dTop + 2);
  g.closePath(); g.fill(); outline(g, '#080a10');
  g.strokeStyle = '#3d4354'; g.lineWidth = 1.2;
  for (var fr = 0; fr < 5; fr++) {
    var fx2 = cx - fw * 0.18 + fr * fw * 0.10;
    g.beginPath(); g.moveTo(fx2, dTop - 5 + fr * 2.1); g.lineTo(fx2, dTop + 3 + fr * 2.1); g.stroke();
  }
  g.fillStyle = '#2a2f3e';
  g.fillRect(cx - fw * 0.06, dTop - 12, 9, 8); outline(g, '#0c0e15');
  g.fillStyle = '#4a5163';
  g.fillRect(cx - fw * 0.06, dTop - 12, 9, 1.6);

  // ---- right mass: a wider, LOWER terraced rubble stack.
  var rx3 = cx + fw * 0.38, ry3 = dTop + fh * 0.34;
  var R1 = block(rx3, ry3, 18.5, 10.6, 26, 9);
  var R2 = block(rx3 + 0.5, R1.y - 2.4, 14.6, 8.4, 8, 3);
  var R3 = block(rx3 + 1.0, R2.y - 2.4, 10.6, 6.2, 7, 3);
  slab(R3, 0.02, 1.04, 0.02, 0.72, 2);

  // pipe elbows off the right mass, diving into the deck
  g.lineCap = 'round';
  for (var pp = 0; pp < 2; pp++) {
    var pex = rx3 + 9 + pp * 9, pey = ry3 - 12 + pp * 6, reach = 15 - pp * 3;
    var prong = function (w, c, dy) {
      g.strokeStyle = c; g.lineWidth = w;
      g.beginPath();
      g.moveTo(pex - 5, pey + dy);
      g.quadraticCurveTo(pex + reach, pey - 5 + dy, pex + reach + 1, pey + 6 + dy);
      g.quadraticCurveTo(pex + reach + 1, pey + 15 + dy, pex + reach - 4, pey + 18 + dy);
      g.stroke();
    };
    prong(7.4, PIPE_D, 1.2);
    prong(4.6, shade(PIPE, 0.74), 0);
    prong(1.4, shade(PIPE, 1.22), -1.4);
  }
  g.lineCap = 'butt';
  for (var vb = 0; vb < 2; vb++) {                          // valve drums
    var vx = rx3 + 4 + vb * 10, vy = dTop + fh * 0.62 + vb * 4;
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(vx + 2, vy + 2, 5.6, 2.7, 0, 0, 6.29); g.fill();
    cylinder(g, vx, vy, 4.8, 10 - vb * 2, '#383c44', '#6a707a', '#15181d');
  }

  // ---- deck surfaces: one big red panel front-left with dark stipple,
  // one pale glyph plate front-centre carrying a red mark.
  var deckQuad = function (qx, qy, qw, qh, f0, f1, fill, edge) {
    var P = function (u, v) {
      return [qx + qw * (u + v - 1) * 0.5, qy + qh * (v - u) * 0.5];
    };
    var k0 = P(f0, f0), k1 = P(f1, f0), k2 = P(f1, f1), k3 = P(f0, f1);
    g.beginPath();
    g.moveTo(k0[0], k0[1]); g.lineTo(k1[0], k1[1]);
    g.lineTo(k2[0], k2[1]); g.lineTo(k3[0], k3[1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) outline(g, edge);
    return P;
  };
  // big red panel, front-left
  var pxA = cx - fw * 0.50, pyA = dTop + fh * 0.42;
  deckQuad(pxA, pyA, 58, 36, 0, 1, '#8b7a66', SEAM);
  deckQuad(pxA, pyA, 58, 36, 0.05, 0.95, '#9a8b76', null);
  var PA = deckQuad(pxA, pyA, 58, 36, 0.09, 0.91, shade(col, 0.88), shade(col, 0.36));
  deckQuad(pxA, pyA, 58, 36, 0.09, 0.21, shade(col, 1.14), null);
  g.fillStyle = 'rgba(20,10,8,.58)';
  srand(63);
  for (var sp = 0; sp < 12; sp++) {
    var mk = PA(0.18 + rnd() * 0.62, 0.18 + rnd() * 0.62);
    g.fillRect(mk[0] - 1, mk[1] - 0.7, 2.2, 1.5);
  }
  // pale glyph plate, front-centre-right
  var pxB = cx + fw * 0.06, pyB = dTop + fh * 0.92;
  deckQuad(pxB, pyB, 44, 28, 0, 1, '#8d7c68', SEAM);
  var PB = deckQuad(pxB, pyB, 44, 28, 0.07, 0.93, '#ab9d85', '#5c5142');
  g.fillStyle = col;                                        // blocky warning glyph
  var gpt = function (u, v, w2, h2) {
    var q = PB(u, v); g.fillRect(q[0] - w2 / 2, q[1] - h2 / 2, w2, h2);
  };
  gpt(0.32, 0.50, 3.4, 11); gpt(0.44, 0.34, 3.4, 3.6); gpt(0.44, 0.66, 3.4, 3.6);
  gpt(0.60, 0.50, 3.4, 11); gpt(0.72, 0.34, 3.4, 3.6); gpt(0.72, 0.50, 3.4, 3.6);
  gpt(0.72, 0.66, 3.4, 3.6);
  g.strokeStyle = 'rgba(90,76,58,.55)'; g.lineWidth = 1;
  var eA = PB(0.13, 0.13), eB = PB(0.87, 0.87);
  g.beginPath(); g.moveTo(eA[0], eA[1]); g.lineTo(eB[0], eB[1]); g.stroke();

  // ---- idle animation: Tesla arcs crawling between the mass tops and
  // the orb, and the orb's own glow pulse (above).
  var bolt = function (x0, y0, x1, y1, seed, w, cA2, cB2) {
    srand(seed);
    var pts = [[x0, y0]];
    for (var bi = 1; bi < 6; bi++) {
      var bt2 = bi / 6;
      pts.push([x0 + (x1 - x0) * bt2 + (rnd() - 0.5) * 12,
                y0 + (y1 - y0) * bt2 + (rnd() - 0.5) * 10]);
    }
    pts.push([x1, y1]);
    for (var pass = 0; pass < 3; pass++) {
      g.strokeStyle = pass === 0 ? cA2 : (pass === 1 ? 'rgba(168,182,255,.72)' : cB2);
      g.lineWidth = pass === 0 ? w * 3.4 : (pass === 1 ? w * 1.8 : w);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (var bp = 0; bp < pts.length; bp++)
        if (bp) g.lineTo(pts[bp][0], pts[bp][1]); else g.moveTo(pts[bp][0], pts[bp][1]);
      g.stroke();
    }
    g.lineCap = 'butt';
  };
  var arcA = 'rgba(120,136,255,.34)', arcB = 'rgba(226,236,255,.92)';
  if (ph6 % 3 !== 2)
    bolt(LT.x + LT.hw * 0.4, LT.y - 3, ox - orad * 0.62, oy - orad * 0.60,
         700 + ph6 * 13, 0.85, arcA, arcB);
  if (ph6 % 3 !== 0)
    bolt(R3.x - R3.hw * 0.2, R3.y - 3, ox + orad * 0.66, oy - orad * 0.48,
         760 + ph6 * 17, 0.85, arcA, arcB);
  if (ph6 === 1 || ph6 === 4)
    bolt(LT.x + LT.hw * 0.55, LT.y - 5, R3.x - R3.hw * 0.35, R3.y - 5,
         820 + ph6 * 11, 0.75, 'rgba(150,170,255,.18)', 'rgba(226,236,255,.58)');
  bolt(ox - orad * 0.30, oy - orad * 0.86, ox + orad * 0.42, oy - orad * 0.20,
       880 + ph6 * 23, 0.6, 'rgba(140,156,255,.20)', 'rgba(236,242,255,.72)');
  g.fillStyle = 'rgba(206,216,255,' + (0.06 + 0.05 * (1 + anS)).toFixed(3) + ')';
  g.beginPath(); g.ellipse(ox, oy, orad * 2.0, orad * 1.5, 0, 0, 6.29); g.fill();
} else {
  // --- Allied Power Plant --------------------------------------------
  // Read off `allied-power-plant-idle.png` (the wiki MAKE gif's last
  // frame, RED owner - which is what proves where the remap lives) and
  // `allied-power-plant.png` (blue owner, true colour). Bbox 84x89,
  // aspect 0.944. The ONLY remap surfaces are the flared CONE at the
  // foot of each tower and a hairline rim on the base octagon; the
  // columns are cool slate-indigo with a narrow specular and a thin
  // gold plasma slit, so a red-owner plant carries no blue and a
  // blue-owner plant carries no red.
  var STL_D = '#22252b', STL = '#585f6b', STL_L = '#949ca8';
  var GLS_D = '#31344e', GLS = '#5f6684', GLS_L = '#9aa2be';
  var PLATE = '#33363f', BRASS = '#a8823c', SILV = '#8e949e';

  // Octagonal base plate (a cut-cornered iso diamond).
  var octa = function (oX, oY, ow, oh, fill, edge, lw) {
    var cor = [[0, -oh], [ow, 0], [0, oh], [-ow, 0]];
    g.beginPath();
    for (var q8 = 0; q8 < 4; q8++) {
      var a8 = cor[q8], b8 = cor[(q8 + 1) % 4];
      for (var s8 = 0; s8 < 2; s8++) {
        var f8 = s8 ? 0.72 : 0.28;
        var vx = oX + a8[0] + (b8[0] - a8[0]) * f8;
        var vy = oY + a8[1] + (b8[1] - a8[1]) * f8;
        if (!q8 && !s8) g.moveTo(vx, vy); else g.lineTo(vx, vy);
      }
    }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (edge) { g.strokeStyle = edge; g.lineWidth = lw || 1; g.stroke(); }
  };
  srand(211);
  octa(cx + 3, baseY + 5, fw * 1.00, fh * 1.00, 'rgba(0,0,0,.42)', null);
  octa(cx, baseY, fw * 1.00, fh * 1.00, '#2c2f30', '#0d0f12');       // pad riser
  octa(cx, baseY - 4, fw * 0.99, fh * 0.99, '#5e6255', '#141613');   // pad top (grey-olive)
  octa(cx, baseY - 5, fw * 0.99, fh * 0.99, null, col, 2);           // HOUSE rim line
  octa(cx, baseY - 6, fw * 0.90, fh * 0.90, '#565a4d', '#22251f');
  g.save();
  octa(cx, baseY - 6, fw * 0.90, fh * 0.90, null, null);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,.05)';                             // worn grit
  for (var pg = 0; pg < 60; pg++) {
    var pt2 = rnd(), pu = rnd();
    g.fillRect(cx + (pt2 - pu) * fw * 0.86, baseY - 6 + (pt2 + pu - 1) * fh * 0.86, 2, 1);
  }
  g.restore();
  octa(cx, baseY - 7, fw * 0.74, fh * 0.74, '#3f4239', '#1b1d19');   // inner well

  // ---- one capacitor tower. Read off the RED rip: the base is NOT a
  // cone but a fat dark-navy DRUM standing on a silver rock plinth, and
  // the remap is a big curved HOUSE PANEL across the drum's front. The
  // column above it is blue-steel with a gold plasma streak.
  // ---- THE CROWN BUDGET, and why the drum is 1.50 r and not 1.82.
  // §2.6 asks for three separate crowns each 0.18-0.22 Sw over a
  // roofline at least 0.45 Sh down. `bodyRun` puts that roofline at the
  // first row carrying 55% of the widest row's INK, and the widest row
  // here is the ground pad, so the whole crown band has 0.55 Sw = 72 px
  // of ink to spend and three towers to spend it on. Two hard
  // consequences fall straight out of that and neither is negotiable:
  //   * only ONE tower's drum can be above the roofline. Two drums plus
  //     a column is already 72 px, so the row where the second drum
  //     appears IS the roofline — which is why the front pair, standing
  //     at the same height, put their drums below it and show cap and
  //     column only.
  //   * that one drum is therefore the widest thing in the crown, and it
  //     has to fit 0.22 Sw = 28.8 px. At r*1.82 it was 33 px and at
  //     r*1.60 it is 29; r*1.50 lands 28. THAT is the fusion fix: the
  //     back drum used to be 16.4 px of half-width against 23.7 px of
  //     centre-to-centre spacing, so it grew into both neighbouring
  //     columns and welded all three crowns into one blob.
  // The cap pays for the other side of the band: with the drums below
  // the roofline the front crowns are cap-width, and r*1.04 = 19 px is
  // under the 0.18 Sw = 23.6 px floor, so the cap goes to r*1.28 = 25.
  // Spacing 0.386/0.426 fw = 26 px each side of the back tower clears
  // 13.5 (drum) + 9 (column) + a real gap, and keeps both front plinths
  // inside the pad octagon's own 46 px half-width at their row.
  // Everything else in the middle — the basin, its halo, the lamp
  // haloes, the rod plates — is then sized to sit INSIDE the back drum's
  // silhouette rather than poke out of it and re-widen that blob: basin
  // 12 (was 15), halo 0.75x, rod plates at 9.5 (was 10). Measured on the
  // bake: 3 blobs at 0.191 / 0.214 / 0.191 Sw, roofline 0.488 Sh, sprite
  // still 131x127 so no size metric moves.
  // NOTE what this does NOT do — RA2's own [GAPOWR] fails this clause.
  // Chroma-keyed off `docs/ra2-ref/allied-power-plant.png` its crown is
  // TWO blobs (0.395 / 0.163 Sw) over a 0.419 Sh roofline, because its
  // basin welds its middle and right towers exactly the way our drum
  // used to weld all three. Our drum is 0.206 Sw against RA2's 0.233 and
  // our cap 0.191 against RA2's ~0.15: the clause's ink arithmetic, not
  // the rip, is what sets those two numbers.
  var PW_DK = 1.50;         // drum radius, x r
  var PW_PK = 1.26;         // plinth radius, x dr
  var PW_R  = 9;            // column radius
  var PW_GL = 0.75;         // basin halo, x its natural size
  var PW_DH = 25;           // drum height
  var PW_CK = 1.28;         // cap radius, x r
  var PW_BW = 12;           // basin half-width
  var PW_LG = 5.0;          // lamp halo radius
  var PW_RP = 9.5;          // rod plate offset from centre
  var PW_TP = 0.94;         // drum taper (top/bottom) - a drum, not a cone
  var tower = function (px, py, r, hCol, lamp) {
    var dr = r * PW_DK;                                              // drum radius
    octa(px + 2, py + 3, dr * (PW_PK + 0.04), dr * 0.54, 'rgba(0,0,0,.44)', null);
    octa(px, py, dr * PW_PK, dr * 0.52, '#4c515a', '#15171b');       // rock plinth riser
    octa(px, py - 4, dr * (PW_PK - 0.06), dr * 0.50, SILV, '#15171b');
    octa(px, py - 5, dr * (PW_PK - 0.06), dr * 0.50, 'rgba(255,255,255,.22)', null);
    g.fillStyle = 'rgba(24,26,32,.34)';                              // rubble specks
    for (var rk = 0; rk < 9; rk++)
      g.fillRect(px - dr + rk * dr * 0.23, py - 6 + (rk % 3) * 1.6, 2.6, 1.4);
    octa(px, py - 6, dr * (PW_PK - 0.20), dr * 0.44, '#3b4048', '#15171b');   // step

    var dTopY = py - 6 - PW_DH;                                      // drum
    g.fillStyle = '#20222f';
    g.beginPath();
    g.moveTo(px - dr, py - 6); g.lineTo(px - dr * PW_TP, dTopY);
    g.lineTo(px + dr * PW_TP, dTopY); g.lineTo(px + dr, py - 6);
    g.closePath(); g.fill();
    g.beginPath(); g.ellipse(px, py - 6, dr, dr * 0.32, 0, 0, Math.PI); g.fill();
    outline(g, '#0a0c14');
    g.fillStyle = 'rgba(96,106,138,.30)';                            // lit left limb
    g.fillRect(px - dr, dTopY, dr * 0.26, PW_DH);
    g.fillStyle = 'rgba(0,0,0,.34)';                                 // shaded right limb
    g.fillRect(px + dr * 0.60, dTopY, dr * 0.40, PW_DH);

    // the big curved HOUSE panel wrapped across the drum's front
    g.save();
    g.beginPath();
    g.moveTo(px - dr, py - 6); g.lineTo(px - dr * PW_TP, dTopY);
    g.lineTo(px + dr * PW_TP, dTopY); g.lineTo(px + dr, py - 6);
    g.closePath(); g.clip();
    var pw = dr * 0.80, pTop = dTopY + 3.2, pBot = py - 8.2;
    g.fillStyle = shade(col, 0.74);
    g.beginPath();
    g.moveTo(px - pw, pTop + 2.4);
    g.ellipse(px, pTop, pw, pw * 0.30, 0, Math.PI, 0, true);
    g.lineTo(px + pw, pBot);
    g.ellipse(px, pBot, pw, pw * 0.30, 0, 0, Math.PI);
    g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.96);                                  // lit left half
    g.fillRect(px - pw, pTop - 4, pw * 0.62, pBot - pTop + 8);
    g.fillStyle = 'rgba(255,255,255,.20)';
    g.fillRect(px - pw * 0.86, pTop - 4, pw * 0.22, pBot - pTop + 8);
    g.fillStyle = 'rgba(0,0,0,.28)';                                 // shaded right edge
    g.fillRect(px + pw * 0.52, pTop - 4, pw * 0.50, pBot - pTop + 8);
    g.strokeStyle = shade(col, 0.44); g.lineWidth = 1;               // two panel seams
    for (var ps = -1; ps <= 1; ps += 2) {
      g.beginPath();
      g.moveTo(px + pw * 0.40 * ps, pTop - 1); g.lineTo(px + pw * 0.40 * ps, pBot + 1);
      g.stroke();
    }
    g.fillStyle = shade(col, 1.30);                                  // lit top lip
    g.beginPath(); g.ellipse(px, pTop, pw, pw * 0.30, 0, Math.PI, 0, true);
    g.lineTo(px + pw, pTop + 1.8);
    g.ellipse(px, pTop + 1.8, pw, pw * 0.30, 0, 0, Math.PI);
    g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#282b3c';                                         // dark drum lip
    g.beginPath(); g.ellipse(px, dTopY, dr * PW_TP, dr * 0.26, 0, 0, 6.29); g.fill();
    outline(g, '#0a0c14');
    g.fillStyle = '#3c4054';
    g.beginPath(); g.ellipse(px, dTopY - 1, dr * PW_TP * 0.79, dr * 0.24, 0, 0, 6.29); g.fill();

    // shoulder from the drum lip up to the column
    g.fillStyle = '#2f3242';
    g.beginPath();
    g.moveTo(px - dr * PW_TP * 0.79, dTopY); g.lineTo(px + dr * PW_TP * 0.79, dTopY);
    g.lineTo(px + r * 1.02, dTopY - 5); g.lineTo(px - r * 1.02, dTopY - 5);
    g.closePath(); g.fill(); outline(g, '#0f1220');
    g.fillStyle = 'rgba(180,190,220,.24)';
    g.beginPath();
    g.moveTo(px - dr * PW_TP * 0.79, dTopY); g.lineTo(px - dr * 0.20, dTopY);
    g.lineTo(px - r * 0.20, dTopY - 5); g.lineTo(px - r * 1.02, dTopY - 5);
    g.closePath(); g.fill();

    var cy0 = dTopY - 5, ty0 = cy0 - hCol;                           // the column
    cylinder(g, px, cy0, r, hCol, GLS, GLS_L, '#1f2130');
    g.fillStyle = 'rgba(16,17,26,.55)';                              // dark left edge
    g.fillRect(px - r, ty0, r * 0.22, hCol);
    g.fillStyle = 'rgba(226,230,252,.42)';                           // narrow specular
    g.fillRect(px - r * 0.66, ty0 + 1, r * 0.20, hCol - 2);
    g.fillStyle = 'rgba(26,25,38,.62)';                              // plasma slot
    g.fillRect(px - r * 0.30, ty0 + 1, r * 0.42, hCol - 2);
    var plG = 0.72 + 0.28 * Math.sin(anP + px * 0.09);               // idle: breathes
    var fl = g.createLinearGradient(0, ty0, 0, cy0);
    fl.addColorStop(0, 'rgba(198,124,36,0)');
    fl.addColorStop(0.16, 'rgba(198,124,36,' + (0.62 + 0.28 * plG).toFixed(3) + ')');
    fl.addColorStop(0.84, 'rgba(198,124,36,' + (0.62 + 0.28 * plG).toFixed(3) + ')');
    fl.addColorStop(1, 'rgba(198,124,36,0)');
    g.fillStyle = fl;
    g.fillRect(px - r * 0.26, ty0 + 1, r * 0.34, hCol - 2);
    var f2 = g.createLinearGradient(0, ty0, 0, cy0);
    f2.addColorStop(0, 'rgba(255,206,110,0)');
    f2.addColorStop(0.22, 'rgba(255,206,110,' + (0.56 + 0.42 * plG).toFixed(3) + ')');
    f2.addColorStop(0.78, 'rgba(255,232,160,' + (0.56 + 0.42 * plG).toFixed(3) + ')');
    f2.addColorStop(1, 'rgba(255,206,110,0)');
    g.fillStyle = f2;
    g.fillRect(px - r * 0.19, ty0 + 1, r * 0.17, hCol - 2);
    g.fillStyle = 'rgba(42,43,62,.48)';                              // dark right limb
    g.fillRect(px + r * 0.58, ty0, r * 0.42, hCol);
    g.fillStyle = GLS_D;                                             // access panel
    g.fillRect(px - r * 0.40, cy0 - 7, r * 0.80, 5);
    outline(g, '#181a2c');
    g.fillStyle = 'rgba(226,228,250,.40)';
    g.fillRect(px - r * 0.40, cy0 - 7, r * 0.80, 1);

    var cr = r * PW_CK;                                              // cap radius
    g.fillStyle = STL;                                               // steel cap
    g.beginPath();
    g.moveTo(px - cr, ty0 + 2); g.lineTo(px + cr, ty0 + 2);
    g.lineTo(px + cr, ty0 - 6); g.lineTo(px - cr, ty0 - 6);
    g.closePath(); g.fill(); outline(g, STL_D);
    g.fillStyle = 'rgba(255,255,255,.26)';
    g.fillRect(px - cr * 0.96, ty0 - 5.5, cr * 0.42, 7.5);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(px + cr * 0.48, ty0 - 5.5, cr * 0.52, 7.5);
    g.fillStyle = '#4a5170';                                         // blue-steel band
    g.fillRect(px - cr, ty0 - 2.2, cr * 2, 2);
    g.fillStyle = STL_L;                                             // cap rim
    g.beginPath(); g.ellipse(px, ty0 - 6, cr, cr * 0.385, 0, 0, 6.29); g.fill();
    outline(g, STL_D);
    g.fillStyle = '#20242e';                                         // dark bore
    g.beginPath(); g.ellipse(px, ty0 - 6, cr * 0.60, cr * 0.23, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(168,176,190,.60)';
    g.beginPath(); g.ellipse(px - cr * 0.135, ty0 - 6.8, cr * 0.29, cr * 0.106, 0, 0, 6.29); g.fill();
    // idle: transformer lamp on the cap rim blinks in turn
    g.fillStyle = lamp ? '#ffe6a0' : '#5b4c2a';
    g.beginPath(); g.ellipse(px + cr * 0.75, ty0 - 6.6, 1.8, 1.2, 0, 0, 6.29); g.fill();
    if (lamp) {
      g.fillStyle = 'rgba(255,222,140,.30)';
      g.beginPath(); g.ellipse(px + cr * 0.75, ty0 - 6.6, PW_LG, PW_LG * 0.68, 0, 0, 6.29); g.fill();
    }
    return ty0 - 6;
  };

  var lcx = cx - fw * 0.386, lcy = baseY + fh * 0.24;
  var rcx = cx + fw * 0.426, rcy = baseY + fh * 0.22;
  var bcx = cx + fw * 0.02, bcy = baseY - fh * 0.44;

  // [GAPOWR] is THREE IDENTICAL capacitor towers staggered across the
  // pad — same plinth, same drum, same column, cut and pasted. The back
  // one reads taller only because the iso camera puts its FOOT ~22 px
  // further up-screen; look at the rip and the three caps sit on a
  // diagonal, not on three different lengths of column. Ours drew the
  // back column at 42 against the front pair's 25 and 23, and that
  // difference IS the sprite's height error: the back tower is what
  // sets the top row, so its extra 12-17 px went straight onto a total
  // that was already 1.40x RA2 against a 1.15 building house scale.
  // One shared length, and the stagger comes from placement alone.
  // (30 px = the gate's own arithmetic: the shared platform's shadow
  // fixes 36 px below the ground line and the tower's plinth+drum+
  // shoulder+cap another 61, so the sprite is 97 + COL_H and 30 lands
  // it at 127 px = 1.28x RA2, dev 0.115 inside the +-0.20 band.)
  var COL_H = 30;
  tower(bcx, bcy, PW_R, COL_H, ph6 === 0 || ph6 === 3);              // back

  // ---- central machinery: a dark ringed coil column carrying the dish.
  var stemB = baseY + 2;
  g.fillStyle = 'rgba(0,0,0,.32)';
  g.beginPath(); g.ellipse(cx, stemB + 2, 13, 5, 0, 0, 6.29); g.fill();
  cylinder(g, cx, stemB, 6.6, 42, '#24272d', '#3d434c', '#131519');
  for (var hc = 0; hc < 13; hc++) {                                  // dark rings, brass lit
    var hy = stemB - 2 - hc * 3.3;
    var hr = 7.8 - (hc > 7 ? (hc - 7) * 0.42 : 0);
    var wave = (hc + ph6) % 13;                                      // idle: glow climbs
    var hot = wave === 0 || wave === 1;
    g.fillStyle = '#23262c';
    g.beginPath(); g.ellipse(cx, hy, hr, 2.4, 0, 0, 6.29); g.fill();
    outline(g, '#121418');
    g.fillStyle = hot ? '#c98e3d' : '#5f4b28';                       // brass ring edge
    g.beginPath(); g.ellipse(cx, hy - 1.2, hr * 0.96, 2.1, 0, 0, 6.29); g.fill();
    g.fillStyle = hot ? 'rgba(255,224,150,.80)' : 'rgba(196,166,110,.20)';
    g.beginPath(); g.ellipse(cx - hr * 0.26, hy - 1.9, hr * 0.36, 1.0, 0, 0, 6.29); g.fill();
  }
  for (var vI = -1; vI <= 1; vI += 2) {                              // splayed copper rods
    g.strokeStyle = '#4a3524'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + vI * 4, baseY - 52); g.lineTo(cx + vI * 22, baseY + fh * 0.32); g.stroke();
    g.strokeStyle = 'rgba(216,168,108,.36)'; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(cx + vI * 4 - vI, baseY - 52); g.lineTo(cx + vI * 22 - vI, baseY + fh * 0.32);
    g.stroke();
    g.fillStyle = '#5c4530';
    g.fillRect(cx + vI * PW_RP - 3.2, baseY - 34, 6.4, 2.4);
  }

  // ---- the upturned copper dish: a DEEP tilted bowl - fat dark rim,
  // far inner wall in shadow, hot pool at the near side. Nothing else in
  // the game aims a dish at the sky, so it has to read as concave.
  var bowlY = baseY - 41, bw = PW_BW, tlt = 0.22, bry = bw * 0.55;
  cylinder(g, cx, bowlY + 11, 4.4, 7, '#4a4f58', '#6c727c', '#1d1f25');  // neck
  g.fillStyle = '#5a360f';                                           // bowl underside
  g.beginPath();
  g.moveTo(cx - bw * Math.cos(tlt), bowlY - bw * Math.sin(tlt));
  g.quadraticCurveTo(cx - 1, bowlY + 19, cx + bw * Math.cos(tlt), bowlY + bw * Math.sin(tlt));
  g.closePath(); g.fill(); outline(g, '#2c1908');
  g.fillStyle = '#8a541c';                                           // lit left flank
  g.beginPath();
  g.moveTo(cx - bw * Math.cos(tlt), bowlY - bw * Math.sin(tlt));
  g.quadraticCurveTo(cx - 9, bowlY + 12, cx - 2, bowlY + 15);
  g.quadraticCurveTo(cx - 7, bowlY + 7, cx - 5.5, bowlY + 1);
  g.closePath(); g.fill();
  g.fillStyle = '#33200c';                                           // fat rim ring
  g.beginPath(); g.ellipse(cx, bowlY, bw, bry, tlt, 0, 6.29); g.fill();
  outline(g, '#1d1105');
  var glow = 0.80 + 0.20 * anS;                                      // idle: pool breathes
  var bg = g.createLinearGradient(0, bowlY - bry, 0, bowlY + bry);
  bg.addColorStop(0, '#3a1d05');
  bg.addColorStop(0.18, '#8c4a0c');
  bg.addColorStop(0.42, mixc('#d4801a', '#f79c26', glow));
  bg.addColorStop(0.66, mixc('#ffae3c', '#ffd684', glow));
  bg.addColorStop(0.88, mixc('#d2811f', '#f0a63a', glow));
  bg.addColorStop(1, '#7d420d');
  g.fillStyle = bg;
  g.beginPath(); g.ellipse(cx, bowlY + 0.4, bw * 0.90, bry * 0.86, tlt, 0, 6.29); g.fill();
  g.save();                                                          // far-wall crescent
  g.beginPath(); g.ellipse(cx, bowlY + 0.4, bw * 0.90, bry * 0.86, tlt, 0, 6.29); g.clip();
  g.fillStyle = 'rgba(26,13,3,.52)';
  g.beginPath(); g.ellipse(cx, bowlY - bry * 1.12, bw * 1.10, bry * 0.92, tlt, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,236,180,' + (0.42 + 0.34 * glow).toFixed(3) + ')';
  g.beginPath(); g.ellipse(cx, bowlY + bry * 0.30, bw * 0.46, bry * 0.22, tlt, 0, 6.29); g.fill();
  g.restore();
  g.strokeStyle = '#f2c471'; g.lineWidth = 1.4;                      // rim light, upper-left
  g.beginPath(); g.ellipse(cx, bowlY, bw - 0.7, bry - 0.4, tlt, 3.30, 5.55); g.stroke();
  g.strokeStyle = 'rgba(120,74,22,.70)'; g.lineWidth = 1;            // near rim in shade
  g.beginPath(); g.ellipse(cx, bowlY, bw - 0.7, bry - 0.4, tlt, 0.10, 2.85); g.stroke();
  g.fillStyle = 'rgba(255,192,84,' + (0.07 + 0.06 * glow).toFixed(3) + ')';
  g.beginPath(); g.ellipse(cx, bowlY - 6 * PW_GL, bw * 1.44 * PW_GL, bw * 0.60 * PW_GL, 0, 0, 6.29); g.fill();

  tower(lcx, lcy, PW_R, COL_H, ph6 === 1 || ph6 === 4);              // front-left
  tower(rcx, rcy, PW_R, COL_H, ph6 === 2 || ph6 === 5);              // front-right

  // ---- base greebles: a valve run threaded between the three plinths.
  g.strokeStyle = '#464a53'; g.lineWidth = 3.2; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(lcx + 18, baseY + fh * 0.44);
  g.quadraticCurveTo(cx, baseY + fh * 0.64, rcx - 18, baseY + fh * 0.44);
  g.stroke();
  g.strokeStyle = '#6e737d'; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(lcx + 18, baseY + fh * 0.42);
  g.quadraticCurveTo(cx, baseY + fh * 0.62, rcx - 18, baseY + fh * 0.42);
  g.stroke();
  g.lineCap = 'butt';
  for (var vg = 0; vg < 3; vg++) {
    var vgx = lcx + 24 + vg * 14, vgy = baseY + fh * 0.52 + (vg === 1 ? 4 : 0);
    g.fillStyle = '#3d424b';
    g.fillRect(vgx - 3.2, vgy - 5, 6.4, 5.6);
    outline(g, '#15181d');
    g.fillStyle = '#717782';
    g.fillRect(vgx - 3.2, vgy - 5, 6.4, 1.4);
    g.fillStyle = BRASS;
    g.fillRect(vgx - 1, vgy - 7.6, 2, 2.8);
  }
}
}
