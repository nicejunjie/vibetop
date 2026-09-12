// Iron Frontier unit art — structures/curtain
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/curtain` and
// `// @@END structures/curtain` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// --- RA2 Iron Curtain Device (NACURE) -------------------------------
// Rebuilt against `soviet-iron-curtain-idle.png` (138x101, w/h 1.37): a
// round drum of RED radial panels, a heavy dark emitter sphere carried
// over it on two red struts, and cable spools round the rim. The red is
// the HOUSE remap in the rip, so it follows the owner; the sphere, the
// spools and the deck plate are fixed dark steel.
// Six idle phases crackle the coils and roll the charge round the drum.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var IC_ST = '#767c86', IC_STD = '#2a2e36', IC_DRK = '#22262d';

// ---- the drum ------------------------------------------------------
var icCy = baseY + fh * 0.16, icR = fw * 0.74;
g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(cx + 3, icCy + 4, icR, icR * 0.44, 0, 0, 6.29); g.fill();
cylinder(g, cx, icCy, icR, 17, shade(IC_ST, 0.82), '#5f656e', IC_STD);
// The hub paints BEFORE the spokes/rim band (not after): painted last it
// sat right on the point all 8 spokes converge on and the rim band
// crosses, cutting the "one ring" the sprite is meant to read as into a
// disconnected left arc and right arc (clause: exactly ONE ring).
// Painted first, the spokes and rim band lay house colour back over it
// and the hub still reads dark everywhere they don't cross.
g.fillStyle = IC_DRK;                                      // central hub
g.beginPath(); g.ellipse(cx, icCy - 18, icR * 0.24, icR * 0.10, 0, 0, 6.29); g.fill(); outline(g, '#0e1116');
// radial red panels across the drum head
g.save();
g.beginPath(); g.ellipse(cx, icCy - 17, icR, icR * 0.42, 0, 0, 6.29); g.clip();
for (var icP = 0; icP < 8; icP++) {
  var ia = icP * 0.7854 + 0.10;
  g.strokeStyle = ((icP + ph6) % 4 === 0) ? shade(col, 1.25) : col;
  g.lineWidth = 3.2;
  g.beginPath(); g.moveTo(cx, icCy - 17);
  g.lineTo(cx + Math.cos(ia) * icR, icCy - 17 + Math.sin(ia) * icR * 0.42); g.stroke();
}
g.strokeStyle = 'rgba(20,24,30,.40)'; g.lineWidth = 1;
g.beginPath(); g.ellipse(cx, icCy - 17, icR * 0.55, icR * 0.23, 0, 0, 6.29); g.stroke();
g.restore();
g.fillStyle = shade(col, 0.60);                            // rim band round the drum wall
g.fillRect(cx - icR, icCy - 15, icR * 2, 3.2);
g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(cx + icR * 0.36, icCy - 15, icR * 0.64, 3.2);

// cable spools round the rim
var icSpool = function (spx, spy) {
  cylinder(g, spx, spy, 6.6, 8.4, '#4a505a', '#606773', IC_STD);
  g.strokeStyle = 'rgba(16,18,22,.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(spx - 6.6, spy - 4.4); g.lineTo(spx + 6.6, spy - 4.4); g.stroke();
};
icSpool(cx - icR * 0.74, icCy + icR * 0.20);
icSpool(cx + icR * 0.74, icCy + icR * 0.20);
icSpool(cx, icCy + icR * 0.36);

// ---- struts and the emitter sphere ---------------------------------
var icOy = icCy - 58, icOr = fw * 0.29;
var icStrut = function (sx0, tone) {
  g.strokeStyle = shade(col, tone * 0.58); g.lineWidth = 9.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx + sx0, icCy - 12); g.lineTo(cx + sx0 * 0.34, icOy + icOr * 0.55); g.stroke();
  g.strokeStyle = shade(col, tone); g.lineWidth = 6.4;
  g.beginPath(); g.moveTo(cx + sx0, icCy - 12); g.lineTo(cx + sx0 * 0.34, icOy + icOr * 0.55); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(cx + sx0 - 1.4, icCy - 12); g.lineTo(cx + sx0 * 0.34 - 1.4, icOy + icOr * 0.55); g.stroke();
};
icStrut(-icR * 0.72, 1.0);
icStrut(icR * 0.72, 0.74);

g.fillStyle = IC_DRK;
g.beginPath(); g.arc(cx, icOy, icOr, 0, 6.29); g.fill(); outline(g, '#0c0e12');
g.save(); g.beginPath(); g.arc(cx, icOy, icOr, 0, 6.29); g.clip();
g.fillStyle = 'rgba(198,212,232,.28)';
g.beginPath(); g.ellipse(cx - icOr * 0.34, icOy - icOr * 0.36, icOr * 0.46, icOr * 0.32, -0.6, 0, 6.29); g.fill();
g.strokeStyle = 'rgba(120,132,150,.34)'; g.lineWidth = 1.2;
g.beginPath(); g.ellipse(cx, icOy, icOr, icOr * 0.34, 0, 0, 6.29); g.stroke();
g.beginPath(); g.ellipse(cx, icOy, icOr * 0.32, icOr, 0, 0, 6.29); g.stroke();
g.fillStyle = 'rgba(226,232,240,' + (0.10 + 0.30 * (0.5 + 0.5 * anS)).toFixed(3) + ')';
g.beginPath(); g.ellipse(cx, icOy + icOr * 0.18, icOr * 0.62, icOr * 0.26, 0, 0, 6.29); g.fill();
g.restore();
g.fillStyle = shade(col, 0.88);                            // collar where the struts meet it
g.beginPath(); g.ellipse(cx, icOy + icOr * 0.72, icOr * 0.56, icOr * 0.18, 0, 0, 6.29); g.fill();
g.fillStyle = IC_DRK;                                      // top emitter horn
g.beginPath();
g.moveTo(cx - 5, icOy - icOr * 0.92); g.lineTo(cx + 5, icOy - icOr * 0.92);
g.lineTo(cx + 3, icOy - icOr - 9); g.lineTo(cx - 3, icOy - icOr - 9);
g.closePath(); g.fill(); outline(g, '#0c0e12');
g.fillStyle = ph6 % 2 ? shade(col, 1.42) : shade(col, 0.78);
g.beginPath(); g.arc(cx, icOy - icOr - 10.5, 2.4, 0, 6.29); g.fill();

// idle: the coil crackle between the struts' heads and the sphere
for (var icB = 0; icB < 2; icB++) {
  if (((icB + ph6) % 3) === 2) continue;
  var bx0 = cx + (icB ? 1 : -1) * icR * 0.72, by0 = icCy - 12;
  var bx1 = cx + (icB ? 1 : -1) * icOr * 0.50, by1 = icOy + icOr * 0.30;
  for (var icQ = 0; icQ < 2; icQ++) {
    g.strokeStyle = icQ ? 'rgba(252,240,240,.85)' : 'rgba(250,214,214,.32)';
    g.lineWidth = icQ ? 1.1 : 3.2; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(bx0, by0);
    for (var icK = 1; icK < 6; icK++) {
      var iq = icK / 6;
      g.lineTo(bx0 + (bx1 - bx0) * iq + Math.sin(icK * 2.9 + icB * 1.7 + anP) * 6 * (1 - Math.abs(iq - 0.5) * 1.4),
               by0 + (by1 - by0) * iq);
    }
    g.lineTo(bx1, by1); g.stroke();
  }
}
