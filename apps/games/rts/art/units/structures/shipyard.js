// Iron Frontier unit art — structures/shipyard
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/shipyard` and
// `// @@END structures/shipyard` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
var ph = bph || 0;
// A PRIVATE generator for the scatter below. `srand`/`rnd` are the
// SIM's stream, and structure art is baked lazily now — a bake that
// reseeded the shared LCG in the middle of a match would move every
// subsequent die roll in the simulation.
var ySeed = 0x9e3779b1;
function yrnd() { ySeed = (Math.imul(ySeed, 1664525) + 1013904223) >>> 0; return ySeed / 4294967296; }
var SWING = Math.sin(ph * 6.283);                      // jib slew
var FALL  = 16 + Math.cos(ph * 6.283) * 12;            // hook drop
var open = (0.5 - Math.abs(ph - 0.5)) * 2;             // the launch gate

// Everything here is placed in CELLS, not in pixels. `du` runs along
// +gx (down-right on screen), `dv` along +gy (down-left); the plot is
// 4x4, so both run -2..+2. Placing a rig by eye in screen pixels is
// what put the first draft's quay off the side of its own footprint: a
// slab whose half-width and half-height are not in the tile's 2:1 ratio
// is not a patch of ground, it is a diamond floating over one.
function P(du, dv, z) {
  return [cx + (du - dv) * (TW / 2), baseY + (du + dv) * (TH / 2) - (z || 0)];
}
// An nu x nv patch of deck at (du,dv), extruded `h` high: the four walls
// back to front, then the top face. Same treatment as isoBox.
function slab(du, dv, nu, nv, h, body, edge) {
  var q = [P(du - nu / 2, dv - nv / 2), P(du + nu / 2, dv - nv / 2),
           P(du + nu / 2, dv + nv / 2), P(du - nu / 2, dv + nv / 2)];
  var ord = [0, 1, 2, 3].sort(function (m, n) {
    return (q[m][1] + q[(m + 1) % 4][1]) - (q[n][1] + q[(n + 1) % 4][1]);
  });
  for (var i = 0; i < 4; i++) {
    var k = ord[i], p0 = q[k], p1 = q[(k + 1) % 4];
    var lit = ((p0[1] + p1[1]) / 2 - baseY - (du + dv) * (TH / 2)) > 0 ? 0.92 : 0.60;
    g.beginPath();
    g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    g.lineTo(p1[0], p1[1] - h); g.lineTo(p0[0], p0[1] - h);
    g.closePath();
    var gr = g.createLinearGradient(0, Math.min(p0[1], p1[1]) - h, 0, Math.max(p0[1], p1[1]) + 0.5);
    gr.addColorStop(0, shade(body, lit * 1.22));
    gr.addColorStop(1, shade(body, lit * 0.80));
    g.fillStyle = gr; g.fill();
    if (edge) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
  }
  g.beginPath();
  for (var j = 0; j < 4; j++) {
    if (j) g.lineTo(q[j][0], q[j][1] - h); else g.moveTo(q[j][0], q[j][1] - h);
  }
  g.closePath();
  var ty0 = Math.min(q[0][1], q[1][1], q[2][1], q[3][1]) - h;
  var ty1 = Math.max(q[0][1], q[1][1], q[2][1], q[3][1]) - h;
  var tg = g.createLinearGradient(0, ty0, 0, ty1 + 0.5);
  tg.addColorStop(0, shade(body, 1.26)); tg.addColorStop(1, shade(body, 1.02));
  g.fillStyle = tg; g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = 0.7; g.stroke(); }
  return q;
}
// A lattice jib: two chords with a zig-zag web between them. RA2 draws
// both yards' jibs this way, and it is the one shape that still says
// CRANE from thirty pixels away.
function jib(x0, y0, x1, y1, w0, w1, cA, cB) {
  var dx = x1 - x0, dy = y1 - y0, ln = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / ln, ny = dx / ln;
  function pt(t, sg) {
    var w = w0 + (w1 - w0) * t;
    return [x0 + dx * t + nx * w * sg, y0 + dy * t + ny * w * sg];
  }
  g.strokeStyle = cB; g.lineWidth = 0.9;                 // the web, first
  for (var i = 0; i < 7; i++) {
    var a2 = pt(i / 7, 1), b2 = pt((i + 0.5) / 7, -1), c2 = pt((i + 1) / 7, 1);
    g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.lineTo(c2[0], c2[1]); g.stroke();
  }
  g.strokeStyle = cA; g.lineWidth = 2.0;                 // then the chords over it
  for (var sg2 = -1; sg2 <= 1; sg2 += 2) {
    var p0 = pt(0, sg2), p1 = pt(1, sg2);
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
  }
}
// Water broken by a leg: concentric rings and a bright meniscus. This
// is the detail that tells the eye the whole thing is FLOATING.
function foam(q, rx) {
  g.strokeStyle = 'rgba(206,232,246,.30)'; g.lineWidth = 1.0;
  for (var r2 = 0; r2 < 3; r2++) {
    var rr = rx * (1.15 + r2 * 0.40 + Math.sin(ph * 6.283 + r2) * 0.06);
    g.beginPath(); g.ellipse(q[0], q[1] + 1, rr, rr * 0.5, 0, 0, 6.29); g.stroke();
  }
  g.strokeStyle = 'rgba(232,244,252,.52)'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(q[0], q[1], rx * 1.02, rx * 0.51, 0, 0, 6.29); g.stroke();
}
// The launch bay both yards need: a lit trough with a gate that parts,
// set into the near face, because `dockSpot` puts the new hull there.
function launchBay(q, w2, h2, gate, lip) {
  g.fillStyle = '#0a0f14'; g.fillRect(q[0] - w2, q[1] - h2, w2 * 2, h2);
  if (ph > 0.30 && ph < 0.55) {                          // welding arc inside
    g.fillStyle = 'rgba(205,235,255,.9)';
    g.beginPath(); g.ellipse(q[0], q[1] - h2 * 0.5, 3.2, 2.2, 0, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(120,190,255,.30)';
    g.beginPath(); g.ellipse(q[0], q[1] - h2 * 0.5, 8, 5.2, 0, 0, 6.29); g.fill();
  }
  g.fillStyle = gate;
  g.fillRect(q[0] - w2, q[1] - h2, w2 - open * (w2 - 1), h2);
  g.fillRect(q[0] + open * (w2 - 1), q[1] - h2, w2 - open * (w2 - 1), h2);
  g.strokeStyle = '#161a1e'; g.lineWidth = 0.8;
  g.strokeRect(q[0] - w2, q[1] - h2, w2 * 2, h2);
  g.fillStyle = lip; g.fillRect(q[0] - w2 - 1, q[1] - h2 - 2.6, w2 * 2 + 2, 2.6);
}
// Two floodlights on masts, blinking in turn. Kept from the first draft
// because RA2's rigs carry them and they read at 1:1.
function floods(pts) {
  for (var fl = 0; fl < pts.length; fl++) {
    var fq = pts[fl];
    g.strokeStyle = '#43484d'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(fq[0], fq[1]); g.lineTo(fq[0], fq[1] - 24); g.stroke();
    var lit2 = (Math.floor(ph * 6) % 2) === fl % 2;
    g.fillStyle = lit2 ? '#ffe9ab' : '#686d71';
    g.beginPath(); g.ellipse(fq[0], fq[1] - 25, 2.8, 1.9, 0, 0, 6.29); g.fill();
    if (lit2) {
      g.fillStyle = 'rgba(255,232,170,.18)';
      g.beginPath(); g.ellipse(fq[0], fq[1] - 25, 9.5, 5.6, 0, 0, 6.29); g.fill();
    }
  }
}

// ---- the basin ---------------------------------------------------- //
// The rig's own shadow on the sea, with the swell running through it.
// Nothing opaque: the ground under the plot IS the map's animated water.
g.save();
plot(g, cx, baseY, fw * 2, fh * 2); g.clip();
g.fillStyle = 'rgba(6,22,34,.34)';
g.beginPath(); g.ellipse(cx, baseY, fw * 0.62, fh * 0.62, 0, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(190,225,245,.20)'; g.lineWidth = 1.0;
for (var wv = -2; wv <= 2; wv++) {
  var a0 = P(-1.5, wv * 0.62 + Math.sin(ph * 6.283 + wv) * 0.10);
  var a1 = P(1.5, wv * 0.62 + Math.sin(ph * 6.283 + wv) * 0.10);
  g.beginPath();
  g.moveTo(a0[0], a0[1]);
  g.quadraticCurveTo((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2 + 3.0, a1[0], a1[1]);
  g.stroke();
}
g.restore();

if (!sov) {
  // =============== [GAYARD] — the Allied rig ====================== //
  var CAIS = '#8e959b', CAIS_D = '#3d4348', COLLAR = '#c9cfd3';
  var TOWER = '#adad93', TOWER_D = '#63644f';
  var ARCH = '#5e656d', ARCH_D = '#282d33';
  var JIBC = '#e6c94f', JIBD = '#8d7622';
  var CH = 44, CU = 0.98;                    // caisson height / corner offset

  // The four caissons, back to front so the near pair overlaps.
  var LEGS = [[-CU, -CU], [CU, -CU], [-CU, CU], [CU, CU]];
  LEGS.sort(function (m, n) { return (m[0] + m[1]) - (n[0] + n[1]); });
  function caisson(du, dv) {
    var q0 = P(du, dv, 0);
    foam(q0, 21);
    g.fillStyle = shade(COLLAR, 0.80);                   // concrete collar
    g.beginPath(); g.ellipse(q0[0], q0[1], 21, 10.4, 0, 0, 6.29); g.fill();
    g.fillStyle = COLLAR;
    g.beginPath(); g.ellipse(q0[0], q0[1] - 3.4, 21, 10.4, 0, 0, 6.29); g.fill();
    g.strokeStyle = shade(COLLAR, 0.52); g.lineWidth = 0.8; g.stroke();
    var cg = g.createLinearGradient(q0[0] - 18, 0, q0[0] + 18, 0);
    cg.addColorStop(0, shade(CAIS, 0.58)); cg.addColorStop(0.36, shade(CAIS, 1.16));
    cg.addColorStop(1, shade(CAIS, 0.64));
    g.fillStyle = cg; g.fillRect(q0[0] - 18, q0[1] - 3.4 - CH, 36, CH);
    g.strokeStyle = CAIS_D; g.lineWidth = 0.8;
    for (var rbd = 1; rbd < 7; rbd++) {                  // the bands round the tube
      var ry3 = q0[1] - 3.4 - CH * rbd / 7;
      g.beginPath(); g.moveTo(q0[0] - 18, ry3); g.lineTo(q0[0] + 18, ry3); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.16)';                     // a shadowed quarter, so it reads round
    g.fillRect(q0[0] + 8, q0[1] - 3.4 - CH, 10, CH);
    g.strokeStyle = CAIS_D; g.strokeRect(q0[0] - 18, q0[1] - 3.4 - CH, 36, CH);
    var dy2 = q0[1] - 3.4 - CH;
    g.fillStyle = shade(col, 1.20);                      // the house ring
    g.beginPath(); g.ellipse(q0[0], dy2, 20, 9.6, 0, 0, 6.29); g.fill();
    g.strokeStyle = shade(col, 0.50); g.lineWidth = 0.9; g.stroke();
    var dg2 = g.createRadialGradient(q0[0] - 6, dy2 - 10, 1, q0[0], dy2 - 4, 19);
    dg2.addColorStop(0, shade(col, 1.80)); dg2.addColorStop(0.52, shade(col, 0.90));
    dg2.addColorStop(1, shade(col, 0.34));
    g.fillStyle = dg2;                                   // and the dome over it
    g.beginPath(); g.ellipse(q0[0], dy2, 17, 14, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(q0[0] - 5.4, dy2 - 9.4, 3.8, 2.8, -0.5, 0, 6.29); g.fill();
  }
  caisson(LEGS[0][0], LEGS[0][1]);            // the far leg, behind the core

  // The deck rosette between the legs: a round plate with radiating
  // ribs, which is what the sprite's pale spoked centre actually is.
  var dc = P(0, 0, 0), DKY = dc[1] - 36, DKR = 27;
  g.fillStyle = shade(TOWER, 0.56);
  g.beginPath(); g.ellipse(dc[0], DKY + 6, DKR, DKR / 2, 0, 0, 6.29); g.fill();
  g.fillStyle = TOWER;
  g.beginPath(); g.ellipse(dc[0], DKY, DKR, DKR / 2, 0, 0, 6.29); g.fill();
  g.strokeStyle = TOWER_D; g.lineWidth = 0.9; g.stroke();
  for (var sk2 = 0; sk2 < 8; sk2++) {
    var aa = sk2 * 0.7854 + 0.3927;
    g.beginPath(); g.moveTo(dc[0], DKY);
    g.lineTo(dc[0] + Math.cos(aa) * DKR, DKY + Math.sin(aa) * DKR / 2); g.stroke();
  }
  // The stepped tower: three cylinders, each narrower and paler than the
  // one below, the way the reference's pale core is built.
  var TIER = [[25, 12.5, 26], [18, 9, 24], [12, 6, 20]];
  var ty2 = DKY;
  for (var ti = 0; ti < TIER.length; ti++) {
    var rx2 = TIER[ti][0], ry4 = TIER[ti][1], hh2 = TIER[ti][2];
    var tgd = g.createLinearGradient(dc[0] - rx2, 0, dc[0] + rx2, 0);
    tgd.addColorStop(0, shade(TOWER, 0.62)); tgd.addColorStop(0.36, shade(TOWER, 1.14));
    tgd.addColorStop(1, shade(TOWER, 0.70));
    g.fillStyle = tgd; g.fillRect(dc[0] - rx2, ty2 - hh2, rx2 * 2, hh2);
    g.beginPath(); g.ellipse(dc[0], ty2, rx2, ry4, 0, 0, Math.PI); g.fill();
    g.fillStyle = shade(TOWER, 1.24);
    g.beginPath(); g.ellipse(dc[0], ty2 - hh2, rx2, ry4, 0, 0, 6.29); g.fill();
    g.strokeStyle = TOWER_D; g.lineWidth = 0.8; g.stroke();
    ty2 -= hh2;
  }
  // The dark steel arch. It springs from behind the tower, bends over
  // its head and carries the one house band on the whole shell.
  var A0 = P(-0.60, -0.60, 38), AT = [dc[0] + 9, ty2 - 62];
  var AC = [A0[0] - 12, ty2 - 76];                       // the arch's control point
  g.strokeStyle = ARCH; g.lineWidth = 13;
  g.beginPath(); g.moveTo(A0[0], A0[1]);
  g.quadraticCurveTo(AC[0], AC[1], AT[0], AT[1]); g.stroke();
  g.strokeStyle = ARCH_D; g.lineWidth = 2.2;             // its shaded underside
  g.beginPath(); g.moveTo(A0[0] + 5, A0[1]);
  g.quadraticCurveTo(AC[0] + 5, AC[1] + 5, AT[0] + 4, AT[1] + 3); g.stroke();
  g.strokeStyle = col; g.lineWidth = 2.8;                // the house band along its back
  g.beginPath(); g.moveTo(A0[0] - 4.5, A0[1] - 4);
  g.quadraticCurveTo(AC[0] - 4.5, AC[1] - 2, AT[0] - 4, AT[1] - 2); g.stroke();
  // The little domed head on the crown.
  g.fillStyle = shade(ARCH, 1.12);
  g.fillRect(AT[0] - 8, AT[1] - 7, 16, 8);
  g.strokeStyle = ARCH_D; g.lineWidth = 0.9; g.strokeRect(AT[0] - 8, AT[1] - 7, 16, 8);
  var hg = g.createRadialGradient(AT[0] - 2, AT[1] - 11, 1, AT[0], AT[1] - 8, 8);
  hg.addColorStop(0, shade(col, 1.7)); hg.addColorStop(1, shade(col, 0.42));
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(AT[0], AT[1] - 7, 7, 6, 0, Math.PI, 0); g.fill();
  // The lattice jib, slewing over the sea to starboard, with a grab on
  // the fall. `SWING` moves the tip; the fall hangs from wherever it is.
  var JX = AT[0] + 44 + SWING * 8, JY = AT[1] - 20 + SWING * 5;
  jib(AT[0] + 6, AT[1] - 2, JX, JY, 5.5, 2.4, JIBC, JIBD);
  g.strokeStyle = '#2a2d31'; g.lineWidth = 1.6;          // the back-stay
  g.beginPath(); g.moveTo(AT[0] + 2, AT[1] - 6); g.lineTo(JX - 6, JY - 3); g.stroke();
  g.strokeStyle = '#23272b'; g.lineWidth = 1.0;          // the fall
  g.beginPath(); g.moveTo(JX, JY + 1); g.lineTo(JX, JY + 1 + FALL); g.stroke();
  g.fillStyle = JIBC;                                    // the grab
  g.fillRect(JX - 5, JY + FALL, 10, 5);
  g.strokeStyle = JIBD; g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(JX - 5, JY + FALL + 5); g.lineTo(JX - 6, JY + FALL + 11);
  g.moveTo(JX + 5, JY + FALL + 5); g.lineTo(JX + 6, JY + FALL + 11);
  g.stroke();
  // Two more caissons in FRONT of the deck, so the rosette reads as
  // standing between them, then the launch bay between their feet.
  caisson(LEGS[1][0], LEGS[1][1]); caisson(LEGS[2][0], LEGS[2][1]);
  // The slipway: an apron running out from the deck to the near-left
  // face, with the gate at its lip. `dockSpot` launches from exactly
  // there ([GAYARD] art.ini DockingOffset0=384,-128,0), so the art has
  // to say which face a hull comes out of.
  slab(-0.30, 0.80, 0.85, 1.5, 7, shade(CAIS, 0.78), CAIS_D);
  g.fillStyle = 'rgba(8,14,20,.55)';                     // the flooded trough itself
  var tq0 = P(-0.30 - 0.26, 0.80 - 0.62, 7), tq1 = P(-0.30 + 0.26, 0.80 - 0.62, 7);
  var tq2 = P(-0.30 + 0.26, 0.80 + 0.62, 7), tq3 = P(-0.30 - 0.26, 0.80 + 0.62, 7);
  g.beginPath(); g.moveTo(tq0[0], tq0[1]); g.lineTo(tq1[0], tq1[1]);
  g.lineTo(tq2[0], tq2[1]); g.lineTo(tq3[0], tq3[1]); g.closePath(); g.fill();
  g.strokeStyle = shade(col, 1.05); g.lineWidth = 2.0;   // the house kerb along the slip
  g.beginPath(); g.moveTo(tq1[0], tq1[1]); g.lineTo(tq2[0], tq2[1]); g.stroke();
  launchBay(P(-0.28, 1.34, 7), 10, 13, shade(CAIS, 1.05), shade(col, 1.05));
  caisson(LEGS[3][0], LEGS[3][1]);            // the near leg, over everything
  floods([P(-1.18, 1.18, 2), P(1.18, -1.18, CH * 0.5)]);
} else {
  // =============== [NAYARD] — the Soviet pontoon =================== //
  var PONT = '#5c6058', PONT_D = '#26291f';
  var BRICK = '#8d7f5e', BRICK_D = '#4a422f', CAP = '#d8cf94', CAP_D = '#7c7443';
  var TOWR = '#2f3140', TOWR_D = '#13141c', MACH = '#3b4436';
  var JIBC2 = '#d9cf8a', JIBD2 = '#7d7440';
  var PH2 = 17;                                       // pontoon freeboard

  // Corner pilings, each breaking the water.
  for (var pl2 = 0; pl2 < 4; pl2++) {
    var pu2 = (pl2 & 1 ? 1 : -1) * 1.10, pv2 = (pl2 & 2 ? 1 : -1) * 1.10;
    var pq = P(pu2, pv2, 0);
    foam(pq, 11);
    g.fillStyle = '#2b2f26';
    g.beginPath(); g.ellipse(pq[0], pq[1] - 2, 9, 4.5, 0, 0, 6.29); g.fill();
  }
  // The barge itself, and the painted rim that is its whole read.
  var pq4 = slab(0, 0, 2.42, 2.42, PH2, PONT, PONT_D);
  g.strokeStyle = shade(col, 0.92); g.lineWidth = 2.0;  // the painted rim, top
  g.beginPath();
  for (var rq = 0; rq < 4; rq++) {
    var pA = pq4[rq], pB = pq4[(rq + 1) % 4];
    g.moveTo(pA[0], pA[1] - PH2 + 1.2); g.lineTo(pB[0], pB[1] - PH2 + 1.2);
  }
  g.stroke();
  g.strokeStyle = shade(col, 0.55); g.lineWidth = 2.0;  // boot-topping at the waterline
  g.beginPath();
  for (rq = 0; rq < 4; rq++) {
    pA = pq4[rq]; pB = pq4[(rq + 1) % 4];
    g.moveTo(pA[0], pA[1] - 1.4); g.lineTo(pB[0], pB[1] - 1.4);
  }
  g.stroke();
  // Deck plating: seams both ways, then oil.
  g.strokeStyle = 'rgba(0,0,0,.24)'; g.lineWidth = 0.9;
  for (var sm3 = -3; sm3 <= 3; sm3++) {
    var s0 = P(sm3 * 0.42, -1.5, PH2), s1 = P(sm3 * 0.42, 1.5, PH2);
    g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke();
    var s2 = P(-1.5, sm3 * 0.42, PH2), s3 = P(1.5, sm3 * 0.42, PH2);
    g.beginPath(); g.moveTo(s2[0], s2[1]); g.lineTo(s3[0], s3[1]); g.stroke();
  }
  g.globalAlpha = 0.22;
  for (var oil = 0; oil < 9; oil++) {
    var oq = P(-1.2 + yrnd() * 2.4, -1.2 + yrnd() * 2.4, PH2);
    g.fillStyle = yrnd() < 0.5 ? shade(PONT, 0.60) : shade(PONT, 1.14);
    g.beginPath(); g.ellipse(oq[0], oq[1], 3 + yrnd() * 5, 1.6 + yrnd() * 2.2, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1;
  // Four brick blockhouse pylons with cream caps and a house grille on
  // each — the reference's most distinctive feature by a long way.
  var PYL = [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]];
  PYL.sort(function (m, n) { return (m[0] + m[1]) - (n[0] + n[1]); });
  function pylon2(du, dv) {
    var bq2 = P(du, dv, PH2), BH = 50, BW = 14;
    var bg2 = g.createLinearGradient(bq2[0] - BW, 0, bq2[0] + BW, 0);
    bg2.addColorStop(0, shade(BRICK, 0.60)); bg2.addColorStop(0.34, shade(BRICK, 1.12));
    bg2.addColorStop(1, shade(BRICK, 0.62));
    g.fillStyle = bg2; g.fillRect(bq2[0] - BW, bq2[1] - BH, BW * 2, BH);
    g.strokeStyle = BRICK_D; g.lineWidth = 0.7;         // brick courses, staggered
    for (var cr = 1; cr < 8; cr++) {
      var cy4 = bq2[1] - BH * cr / 8;
      g.beginPath(); g.moveTo(bq2[0] - BW, cy4); g.lineTo(bq2[0] + BW, cy4); g.stroke();
      for (var bk = 0; bk < 4; bk++) {
        var bx2 = bq2[0] - BW + (bk + (cr % 2) * 0.5) * (BW / 2);
        g.beginPath(); g.moveTo(bx2, cy4); g.lineTo(bx2, cy4 + BH / 8); g.stroke();
      }
    }
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(bq2[0] + 7, bq2[1] - BH, BW - 7, BH);
    g.strokeStyle = BRICK_D; g.strokeRect(bq2[0] - BW, bq2[1] - BH, BW * 2, BH);
    // the cream slab cap, tilted, with the house grille on it
    var capY = bq2[1] - BH;
    g.fillStyle = CAP;                                  // the cream slab cap, tilted
    g.beginPath();
    g.moveTo(bq2[0] - BW - 3, capY + 2); g.lineTo(bq2[0] + 9, capY - 11);
    g.lineTo(bq2[0] + BW + 3, capY - 5); g.lineTo(bq2[0] - 9, capY + 8);
    g.closePath(); g.fill();
    g.strokeStyle = CAP_D; g.lineWidth = 1.0; g.stroke();
    g.fillStyle = shade(CAP, 0.72);                     // its thickness
    g.beginPath();
    g.moveTo(bq2[0] - BW - 3, capY + 2); g.lineTo(bq2[0] - 9, capY + 8);
    g.lineTo(bq2[0] + BW + 3, capY - 5); g.lineTo(bq2[0] + BW + 3, capY - 2);
    g.lineTo(bq2[0] - 9, capY + 11); g.lineTo(bq2[0] - BW - 3, capY + 5);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = shade(col, 0.34);                     // the grille bed, then its rungs
    g.beginPath();
    g.moveTo(bq2[0] - 11, capY + 1.4); g.lineTo(bq2[0] + 6, capY - 8);
    g.lineTo(bq2[0] + 11, capY - 5); g.lineTo(bq2[0] - 6, capY + 4.4);
    g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 2.2;
    for (var rg2 = 0; rg2 < 5; rg2++) {
      var tt2 = 0.10 + rg2 * 0.20;
      var gx4 = bq2[0] - 11 + 17 * tt2, gy4 = capY + 1.4 - 9.4 * tt2;
      g.beginPath(); g.moveTo(gx4, gy4); g.lineTo(gx4 + 5, gy4 + 3.0); g.stroke();
    }
  }
  pylon2(PYL[0][0], PYL[0][1]); pylon2(PYL[1][0], PYL[1][1]);
  // The crane tower: a black mast with a house band and a counterweight,
  // set back-left, then the cream jib slewing out to starboard.
  var TQ = P(-0.75, -0.10, PH2), TH2 = 124;  // off to port, so all four pylons read
  g.strokeStyle = TOWR; g.lineWidth = 3.0;              // a splayed lattice base
  for (var sp3 = -1; sp3 <= 1; sp3 += 2) {
    g.beginPath(); g.moveTo(TQ[0] + sp3 * 17, TQ[1]); g.lineTo(TQ[0] + sp3 * 9, TQ[1] - 26); g.stroke();
  }
  g.strokeStyle = TOWR_D; g.lineWidth = 1.2;
  for (var br2 = 0; br2 < 3; br2++) {
    var byy = TQ[1] - br2 * 9, bw2 = 17 - br2 * 2.8;
    g.beginPath(); g.moveTo(TQ[0] - bw2, byy); g.lineTo(TQ[0] + bw2, byy - 6); g.stroke();
    g.beginPath(); g.moveTo(TQ[0] + bw2, byy); g.lineTo(TQ[0] - bw2, byy - 6); g.stroke();
  }
  g.fillStyle = TOWR; g.fillRect(TQ[0] - 9, TQ[1] - TH2, 18, TH2 - 24);
  g.fillStyle = TOWR_D; g.fillRect(TQ[0] + 4, TQ[1] - TH2, 5, TH2 - 24);
  g.strokeStyle = TOWR_D; g.lineWidth = 0.8; g.strokeRect(TQ[0] - 9, TQ[1] - TH2, 18, TH2 - 24);
  g.fillStyle = col; g.fillRect(TQ[0] - 6, TQ[1] - TH2 + 12, 7, TH2 - 40);
  g.fillStyle = shade(col, 0.55); g.fillRect(TQ[0] + 1, TQ[1] - TH2 + 12, 2.4, TH2 - 40);
  var TT = [TQ[0], TQ[1] - TH2];
  g.fillStyle = MACH;                                   // the machinery cab
  g.fillRect(TT[0] - 22, TT[1] - 5, 18, 15);
  g.strokeStyle = '#1b201a'; g.lineWidth = 0.9; g.strokeRect(TT[0] - 22, TT[1] - 5, 18, 15);
  g.fillStyle = shade(MACH, 1.35);
  g.fillRect(TT[0] - 19, TT[1] - 2, 6, 5);
  g.fillStyle = CAP;                                    // the counterweight box
  g.fillRect(TT[0] - 28, TT[1] - 9, 11, 15);
  g.strokeStyle = CAP_D; g.lineWidth = 0.9; g.strokeRect(TT[0] - 28, TT[1] - 9, 11, 15);
  g.fillStyle = TOWR; g.fillRect(TT[0] - 7, TT[1] - 9, 14, 8);
  var JX2 = TT[0] + 48 + SWING * 9, JY2 = TT[1] - 12 + SWING * 6;
  jib(TT[0] + 5, TT[1] - 5, JX2, JY2, 5.0, 2.2, JIBC2, JIBD2);
  g.strokeStyle = '#171a20'; g.lineWidth = 1.5;         // stays over the jib
  g.beginPath();
  g.moveTo(TT[0] - 1, TT[1] - 11); g.lineTo((TT[0] + JX2) / 2, (TT[1] + JY2) / 2 - 8);
  g.lineTo(JX2 - 4, JY2 - 3); g.stroke();
  g.strokeStyle = '#23272b'; g.lineWidth = 1.0;         // the fall
  g.beginPath(); g.moveTo(JX2, JY2 + 1); g.lineTo(JX2, JY2 + 1 + FALL); g.stroke();
  var bg4 = g.createRadialGradient(JX2 - 2, JY2 + FALL + 3, 1, JX2, JY2 + FALL + 5, 7);
  bg4.addColorStop(0, shade(col, 1.7)); bg4.addColorStop(1, shade(col, 0.42));
  g.fillStyle = bg4;                                    // the wrecking ball
  g.beginPath(); g.arc(JX2, JY2 + FALL + 5, 5.2, 0, 6.29); g.fill();
  // A house-colour mast on the starboard corner, and the near pylons.
  var MQ = P(1.05, -1.05, PH2);
  g.strokeStyle = shade(col, 0.72); g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(MQ[0], MQ[1]); g.lineTo(MQ[0], MQ[1] - 34); g.stroke();
  pylon2(PYL[2][0], PYL[2][1]); pylon2(PYL[3][0], PYL[3][1]);
  // Pipework along the near rail, then the launch gate in the rim.
  g.strokeStyle = '#7b7f74'; g.lineWidth = 3.0;
  var g0 = P(-1.1, 1.05, PH2 + 3), g1 = P(1.05, 1.1, PH2 + 3);
  g.beginPath(); g.moveTo(g0[0], g0[1]); g.lineTo(g1[0], g1[1]); g.stroke();
  var wh = P(0.25, 0.90, PH2);                          // a winch house on the deck
  g.fillStyle = shade(PONT, 1.30); g.fillRect(wh[0] - 12, wh[1] - 15, 24, 15);
  g.strokeStyle = PONT_D; g.lineWidth = 0.9; g.strokeRect(wh[0] - 12, wh[1] - 15, 24, 15);
  g.fillStyle = shade(col, 0.85); g.fillRect(wh[0] - 12, wh[1] - 17, 24, 2.6);
  g.fillStyle = '#1d2126'; g.fillRect(wh[0] - 7, wh[1] - 11, 5, 7);
  for (var cr2 = 0; cr2 < 5; cr2++) {                   // crates on the deck
    var cq = P(0.35 + yrnd() * 0.8, -1.05 + yrnd() * 0.6, PH2);
    g.fillStyle = shade(BRICK, 0.86 + yrnd() * 0.3);
    g.fillRect(cq[0] - 5, cq[1] - 8, 10, 8);
    g.strokeStyle = BRICK_D; g.lineWidth = 0.7; g.strokeRect(cq[0] - 5, cq[1] - 8, 10, 8);
  }
  launchBay(P(0, 1.32, PH2 - 4), 13, 13, shade(PONT, 1.25), col);
  floods([P(-1.12, 1.12, PH2), P(1.12, -1.12, PH2)]);
}
return { s: s, ax: cx, ay: baseY };
