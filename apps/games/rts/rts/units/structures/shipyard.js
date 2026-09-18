// Iron Frontier — structures/shipyard: the art for one unit.
// Called by bakeBuilding() with one context object carrying the canvas, the anchor,
// the facing and the helpers it draws with — see rts/README.md.




function drawShipyard(C) {
  var baseY = C.baseY, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw, g = C.g,
      plot = C.plot, s = C.s, sov = C.sov;

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
  g.strokeStyle = 'rgba(241,241,241,.52)'; g.lineWidth = 1.4;
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
  g.strokeStyle = '#191919'; g.lineWidth = 0.8;
  g.strokeRect(q[0] - w2, q[1] - h2, w2 * 2, h2);
  g.fillStyle = lip; g.fillRect(q[0] - w2 - 1, q[1] - h2 - 2.6, w2 * 2 + 2, 2.6);
}
// Two floodlights on masts, blinking in turn. Kept from the first draft
// because RA2's rigs carry them and they read at 1:1.
function floods(pts) {
  for (var fl = 0; fl < pts.length; fl++) {
    var fq = pts[fl];
    g.strokeStyle = '#474747'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(fq[0], fq[1]); g.lineTo(fq[0], fq[1] - 24); g.stroke();
    var lit2 = (Math.floor(ph * 6) % 2) === fl % 2;
    g.fillStyle = lit2 ? '#ffe9ab' : '#6c6c6c';
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
  var CAIS = '#949494', CAIS_D = '#3d4348', COLLAR = '#cecece';
  var TOWER = '#59636a', TOWER_D = '#303942';
  var ARCH = '#646464', ARCH_D = '#2c2c2c';
  var JIBC = '#e6c94f', JIBD = '#8d7622';
  var CH = 51;                              // compact four-column load-bearing rig

  // The four caissons, back to front so the near pair overlaps.
  // Offset the rear support around the crane core so all four caps remain
  // legible in this fixed isometric view, while keeping roots inside the plot.
  var LEGS = [[-1.15, -.25], [.90, -.95], [-.95, .90], [.85, .65]];
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
      g.beginPath();g.ellipse(q0[0],ry3,18,4,0,0,Math.PI);g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.16)';                     // a shadowed quarter, so it reads round
    g.fillRect(q0[0] + 8, q0[1] - 3.4 - CH, 10, CH);
    g.strokeStyle = CAIS_D; g.strokeRect(q0[0] - 18, q0[1] - 3.4 - CH, 36, CH);
    var dy2 = q0[1] - 3.4 - CH;
    g.fillStyle = shade(col, 1.20);                      // painted ring around a silver cap
    g.beginPath(); g.ellipse(q0[0], dy2, 20, 9.6, 0, 0, 6.29); g.fill();
    g.strokeStyle = shade(col, 0.50); g.lineWidth = 0.9; g.stroke();
    var dg2 = g.createRadialGradient(q0[0] - 6, dy2 - 10, 1, q0[0], dy2 - 4, 19);
    dg2.addColorStop(0, '#f3f3ed'); dg2.addColorStop(0.52, '#c1c5c5');
    dg2.addColorStop(1, '#525d68');
    g.fillStyle = dg2;                                   // and the dome over it
    g.beginPath(); g.ellipse(q0[0], dy2 - 1, 12, 10, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(q0[0] - 5.4, dy2 - 9.4, 3.8, 2.8, -0.5, 0, 6.29); g.fill();
  }
  caisson(LEGS[0][0], LEGS[0][1]);            // the far leg, behind the core

  // Load-bearing diagonal arms join every caisson to the machinery deck.
  // Drawn before the drums, their ends disappear INTO the support columns.
  for (var arm = 0; arm < LEGS.length; arm++) {
    var ap = P(LEGS[arm][0], LEGS[arm][1], 31), ac = P(0, 0, 31);
    g.lineCap = 'butt'; g.strokeStyle = '#343f4a'; g.lineWidth = 19;
    g.beginPath(); g.moveTo(ac[0], ac[1]+5); g.lineTo(ap[0], ap[1]+5); g.stroke();
    g.strokeStyle = '#b7b4a0'; g.lineWidth = 15;
    g.beginPath(); g.moveTo(ac[0], ac[1]); g.lineTo(ap[0], ap[1]); g.stroke();
    g.strokeStyle = '#e0ddc8'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ac[0], ac[1]-5); g.lineTo(ap[0], ap[1]-5); g.stroke();
  }

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
  var TIER = [[25, 12.5, 19], [21, 10.5, 17], [18, 9, 14]];
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
    // Narrow steel bearing rings, not whole cream cylinders.
    g.strokeStyle='#a8aea7';g.lineWidth=2;
    g.beginPath();g.ellipse(dc[0],ty2-2,rx2,ry4,0,0,Math.PI);g.stroke();
    ty2 -= hh2;
  }
  // The dark steel arch. It springs from behind the tower, bends over
  // its head and carries the one house band on the whole shell.
  var A0 = P(0, 0, 77), AT = [dc[0] - 24, ty2 - 66];
  // Broad curved machinery housing, seated on the drum, not a bent pipe.
  g.fillStyle = '#3b4653'; g.strokeStyle = '#202831'; g.lineWidth = 1.3;
  g.beginPath();g.moveTo(A0[0]-21,A0[1]);g.lineTo(A0[0]+18,A0[1]);
  g.bezierCurveTo(A0[0]+26,AT[1]+40,AT[0]+17,AT[1]+8,AT[0]+9,AT[1]);
  g.lineTo(AT[0]-20,AT[1]+2);
  g.bezierCurveTo(AT[0]-15,AT[1]+38,A0[0]-25,A0[1]-32,A0[0]-21,A0[1]);
  g.closePath();g.fill();g.stroke();
  g.strokeStyle = '#a6adb0';g.lineWidth = 4;
  g.beginPath();g.moveTo(A0[0]-17,A0[1]-4);
  g.bezierCurveTo(A0[0]-17,A0[1]-35,AT[0]-13,AT[1]+35,AT[0]-17,AT[1]+6);g.stroke();
  g.strokeStyle = col;g.lineWidth = 7;
  g.beginPath();g.moveTo(A0[0]+11,A0[1]-4);
  g.bezierCurveTo(A0[0]+20,AT[1]+43,AT[0]+9,AT[1]+13,AT[0]+2,AT[1]+5);g.stroke();
  // Recessed machinery panels and a round luffing pivot on the housing.
  g.fillStyle='#202b38';g.fillRect(AT[0]-20,AT[1]+14,23,14);
  g.strokeStyle='#9ba3a8';g.lineWidth=1;
  for(var vent=0;vent<4;vent++){
    g.beginPath();g.moveTo(AT[0]-19,AT[1]+16+vent*3);g.lineTo(AT[0]+1,AT[1]+16+vent*3);g.stroke();
  }
  g.fillStyle='#a8a992';g.beginPath();g.ellipse(A0[0]+2,A0[1]-24,6,8,0,0,6.29);g.fill();
  g.fillStyle='#404d56';g.beginPath();g.ellipse(A0[0]+2,A0[1]-24,3,4,0,0,6.29);g.fill();
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
  var JX = AT[0] + 119 + SWING * 5, JY = AT[1] + 46 + SWING * 3;
  jib(AT[0] + 17, AT[1] + 38, JX, JY, 8.5, 3.2, JIBC, JIBD);
  g.strokeStyle = '#2d2d2d'; g.lineWidth = 1.6;          // the back-stay
  g.beginPath(); g.moveTo(AT[0] + 2, AT[1] + 5); g.lineTo(JX - 6, JY - 3); g.stroke();
  g.strokeStyle = '#23272b'; g.lineWidth = 1.0;          // the fall
  var grabDrop = FALL + 32;
  g.beginPath(); g.moveTo(JX, JY + 1); g.lineTo(JX, JY + 1 + grabDrop); g.stroke();
  g.fillStyle = JIBC;                                    // the grab
  g.fillRect(JX - 5, JY + grabDrop, 10, 5);
  g.strokeStyle = JIBD; g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(JX - 5, JY + grabDrop + 5); g.lineTo(JX - 9, JY + grabDrop + 13);g.lineTo(JX-3,JY+grabDrop+18);
  g.moveTo(JX + 5, JY + grabDrop + 5); g.lineTo(JX + 9, JY + grabDrop + 13);g.lineTo(JX+3,JY+grabDrop+18);
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
  var PONT = '#5e5e5e', PONT_D = '#26291f';
  var BRICK = '#8d7f5e', BRICK_D = '#4a422f', CAP = '#d8cf94', CAP_D = '#7c7443';
  var TOWR = '#2f3140', TOWR_D = '#13141c', MACH = '#3b4436';
  var JIBC2 = '#d9cf8a', JIBD2 = '#7d7440';
  var PH2 = 19;                                       // substantial floating foundation

  // Corner pilings, each breaking the water.
  for (var pl2 = 0; pl2 < 4; pl2++) {
    var pu2 = (pl2 & 1 ? 1 : -1) * 1.40, pv2 = (pl2 & 2 ? 1 : -1) * 1.40;
    var pq = P(pu2, pv2, 0);
    foam(pq, 11);
    g.fillStyle = '#2b2f26';
    g.beginPath(); g.ellipse(pq[0], pq[1] - 2, 9, 4.5, 0, 0, 6.29); g.fill();
  }
  // The barge itself, and the painted rim that is its whole read.
  var pq4 = slab(0, 0, 3.22, 3.22, PH2, PONT, PONT_D);
  g.strokeStyle = shade(col, 0.92); g.lineWidth = 4.0;  // substantial painted rim
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
  var PYL = [[-1.02, -1.02], [1.02, -1.02], [-1.02, 1.02], [1.02, 1.02]];
  PYL.sort(function (m, n) { return (m[0] + m[1]) - (n[0] + n[1]); });
  function pylon2(du, dv) {
    // Forward machinery housings lean back beneath an inclined vent deck.
    // Rear structures remain upright service towers.
    var front=du+dv>=0, shift=front?-.18:0;
    function q(u,v,z){return P(du+u,dv+v,PH2+z);}
    function face(pts,colour){
      g.fillStyle=colour;g.strokeStyle=BRICK_D;g.lineWidth=.8;
      g.beginPath();g.moveTo(pts[0][0],pts[0][1]);
      for(var i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);
      g.closePath();g.fill();g.stroke();
    }
    function roof(u,v){return q(u+shift,v,front?41-u*24:44);}
    var a=q(-.38,-.38,0),b=q(.38,-.38,0),c=q(.38,.38,0),d=q(-.38,.38,0);
    var A=roof(-.38,-.38),B=roof(.38,-.38),D=roof(-.38,.38),E=roof(.38,.38);
    face([a,b,B,A],shade(BRICK,.64));
    face([b,c,E,B],shade(BRICK,.72));
    face([c,d,D,E],shade(BRICK,1.08));
    // Horizontal courses follow the actual side planes.
    g.strokeStyle=BRICK_D;g.lineWidth=.6;
    for(var h=6;h<30;h+=6){
      var off=shift*h/41;
      var l=q(-.38+off,.38,h),m=q(.38+off,.38,h),r=q(.38+off,-.38,h);
      g.beginPath();g.moveTo(l[0],l[1]);g.lineTo(m[0],m[1]);g.lineTo(r[0],r[1]);g.stroke();
    }
    face([A,B,E,D],CAP);
    face([roof(-.29,-.26),roof(.29,-.26),roof(.29,.26),roof(-.29,.26)],shade(col,.36));
    g.strokeStyle=col;g.lineWidth=2.6;
    for(var j=0;j<5;j++){
      var u=-.23+j*.115,l=roof(u,-.23),r=roof(u,.23);
      g.beginPath();g.moveTo(l[0],l[1]-.7);g.lineTo(r[0],r[1]-.7);g.stroke();
    }
    if(front){
      // Recessed machine opening and a pale sill on the working face.
      face([q(.39,.27,8),q(.39,-.27,8),q(.28,-.27,22),q(.28,.27,22)],'#27323a');
      g.strokeStyle='#b0b3a1';g.lineWidth=2;
      var l=q(.39,.29,7),r=q(.39,-.29,7);
      g.beginPath();g.moveTo(l[0],l[1]);g.lineTo(r[0],r[1]);g.stroke();
    }
  }
  pylon2(PYL[0][0], PYL[0][1]); pylon2(PYL[1][0], PYL[1][1]);
  // The crane tower: a black mast with a house band and a counterweight,
  // set back-left, then the cream jib slewing out to starboard.
  var TQ = P(-0.80, -0.45, PH2), TH2 = 108;  // machinery behind the working deck
  slab(-0.80,-0.45,0.9,0.8,PH2+25,'#555c54',PONT_D);
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
  g.fillStyle = TOWR; g.fillRect(TQ[0] - 12, TQ[1] - TH2, 24, TH2 - 24);
  g.fillStyle = TOWR_D; g.fillRect(TQ[0] + 5, TQ[1] - TH2, 7, TH2 - 24);
  g.strokeStyle = '#929382'; g.lineWidth = 1.2; g.strokeRect(TQ[0] - 12, TQ[1] - TH2, 24, TH2 - 24);
  g.fillStyle = col; g.fillRect(TQ[0] - 6, TQ[1] - TH2 + 12, 7, TH2 - 40);
  g.fillStyle = shade(col, 0.55); g.fillRect(TQ[0] + 1, TQ[1] - TH2 + 12, 2.4, TH2 - 40);
  var TT = [TQ[0], TQ[1] - TH2];
  g.fillStyle = MACH;                                   // the machinery cab
  g.fillRect(TT[0] - 32, TT[1] - 9, 37, 22);
  g.strokeStyle = '#1b201a'; g.lineWidth = 1.3; g.strokeRect(TT[0] - 32, TT[1] - 9, 37, 22);
  g.fillStyle = shade(MACH, 1.35);
  g.fillRect(TT[0] - 29, TT[1] - 6, 13, 7);
  g.fillStyle='#b5b5a0';g.fillRect(TT[0]-29,TT[1]+4,21,3);
  g.fillStyle = CAP;                                    // the counterweight box
  g.fillRect(TT[0] - 43, TT[1] - 6, 14, 26);
  g.strokeStyle = CAP_D; g.lineWidth = 0.9; g.strokeRect(TT[0] - 43, TT[1] - 6, 14, 26);
  g.fillStyle = TOWR; g.fillRect(TT[0] - 7, TT[1] - 9, 14, 8);
  var JX2 = TT[0] + 117 + SWING * 5, JY2 = TT[1] + 21 + SWING * 3;
  jib(TT[0] + 5, TT[1] - 5, JX2, JY2, 8.0, 2.8, JIBC2, JIBD2);
  g.strokeStyle = '#171a20'; g.lineWidth = 1.5;         // stays over the jib
  g.beginPath();
  g.moveTo(TT[0] - 18, TT[1] - 24); g.lineTo((TT[0] + JX2) / 2, (TT[1] + JY2) / 2 - 8);
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
  g.strokeStyle = '#7d7d7d'; g.lineWidth = 3.0;
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
pixelate(s, 12, 96, true);   // preserve steel, warm masonry and local paint separately
return { s: s, ax: cx, ay: baseY };
}
