// ─── structures/sentrygun ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

import { outline } from '../../bake/kit.js';
import { shade } from '../../bake/terrain.js';
import { cylinder, gunAim, prism, puckDrum } from '../../bake/vehicles.js';

export function drawSentrygun(C) {
  var baseY = C.baseY, bdir = C.bdir, bph = C.bph, col = C.col, cx = C.cx, fh = C.fh, fw = C.fw,
      g = C.g, sov = C.sov;

// --- RA2 Sentry Gun ---------------------------------------------------
// Re-read at 1:1 against a fresh RED-owner MAKE rip
// (docs/ra2-ref/soviet-sentry-gun-anim-last.png, last of 11 frames,
// 41x40, aspect 1.025). The sprite is an OPEN machine, not a bunker:
// four dark navy legs splayed off a small receiver, a pair of bright
// house-coloured sloped ammo plates, and TWO long thin pale barrels
// raised about 62 degrees, which are the top of the silhouette. The old
// build was a closed armoured drum on a black diamond pad with one
// near-horizontal gun and an optic mast the sprite has not got, and it
// measured 17% too wide. Six idle phases (`bph`): the pair slews on its
// trunnion and the muzzles flare.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var SGN_ARM = '#2f333c', SGN_ARML = '#4f5563', SGN_ARMD = '#0d1016';
var SGN_BAR = '#a9a37c', SGN_BARL = '#e4dfc2', SGN_BARD = '#33301f';
if (sov) {
  // No hardstanding slab: a solid pad under the whole footprint fused
  // all four splayed feet into one wide below-roofline blob, reading
  // as an enclosing drum the open-legs sprite has not got. Ground
  // contact is a small shadow puddle under the receiver only, well
  // short of reaching any foot.
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(cx + 1, baseY + 1, 3.2, 1.8, 0, 0, 6.29); g.fill();
  // ---- four splayed legs, far pair first ----------------------------
  var sgLeg = function (a, len) {
    var fx2 = cx + Math.cos(a) * len, fy2 = baseY + Math.sin(a) * len * 0.48;
    // The two ground-facing legs drop and splay from a shared hub above
    // the cutoff the checker uses to separate "roofline" from "below" —
    // a single straight stroke does most of its sideways spread AFTER
    // crossing that line, so the two feet's strokes were still wide
    // open there and fused into one below-roofline mass. A bent knee
    // does the sideways spread while still above the hub's own row,
    // then drops on a short, steep shin — each foot's crossing of the
    // line is narrow and the two shins land far enough apart not to
    // touch.
    var bent = Math.sin(a) > 0.3, kx = cx, ky = baseY - 8;
    if (bent) { kx = cx + Math.cos(a) * len * 0.74; ky = baseY - 8 + Math.sin(a) * len * 0.48 * 0.22; }
    g.strokeStyle = SGN_ARMD; g.lineWidth = 5.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, baseY - 8); if (bent) g.lineTo(kx, ky); g.lineTo(fx2, fy2); g.stroke();
    g.strokeStyle = SGN_ARM; g.lineWidth = 3.0;
    g.beginPath(); g.moveTo(cx, baseY - 9); if (bent) g.lineTo(kx, ky - 1); g.lineTo(fx2, fy2 - 1); g.stroke();
    g.strokeStyle = SGN_ARML; g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(cx - 0.6, baseY - 10); if (bent) g.lineTo(kx - 0.6, ky - 2); g.lineTo(fx2 - 0.6, fy2 - 2); g.stroke();
    g.fillStyle = '#7d8492';                              // pale foot pad
    g.beginPath(); g.ellipse(fx2, fy2 + 1, 3.6, 1.9, 0, 0, 6.29); g.fill();
    outline(g, SGN_ARMD);
  };
  sgLeg(3.60, 26); sgLeg(5.83, 26); sgLeg(2.52, 25); sgLeg(0.74, 25);
  // ---- receiver ------------------------------------------------------
  cylinder(g, cx, baseY - 6, 7.2, 12, SGN_ARM, SGN_ARML, SGN_ARMD);
  g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(cx + 1.8, baseY - 18, 5.4, 12);
  g.fillStyle = SGN_ARML; g.fillRect(cx - 7.2, baseY - 18.6, 14.4, 1.8);
  for (var sgRI = -1; sgRI <= 1; sgRI++) {                // bolt heads
    g.fillStyle = 'rgba(196,206,218,.36)';
    g.beginPath(); g.arc(cx + sgRI * 4.2, baseY - 12.4, 0.9, 0, 6.29); g.fill();
  }
  // ---- brass ammo drum on the right shoulder -------------------------
  puckDrum(g, cx + 10.5, baseY - 10, 3.4, 4.6, '#7a6f3c', '#b6a75e', SGN_ARMD);
  // ---- the house plates: two sloped ammo cheeks -----------------------
  var sgPlate = function (sx3, w3, lit) {
    g.fillStyle = lit ? col : shade(col, 0.66);
    g.beginPath();
    g.moveTo(cx + sx3, baseY - 9.4); g.lineTo(cx + sx3 + w3, baseY - 12.2);
    g.lineTo(cx + sx3 + w3 - 1.2, baseY - 28.4); g.lineTo(cx + sx3 + 1.2, baseY - 25.6);
    g.closePath(); g.fill(); outline(g, shade(col, 0.34));
    g.fillStyle = lit ? shade(col, 1.32) : shade(col, 0.88);
    g.fillRect(cx + sx3 + 1.4, baseY - 25.2, 2.2, 14.6);
  };
  sgPlate(-11.2, 10.0, false); sgPlate(-1.9, 10.4, true);
  // ---- twin barrels, raised ~62 deg -----------------------------------
  // Slew: idle wobble with no target, the real bearing with one.
var sgA = -1.082 + anS * 0.08, sgK = 1;
if (bdir != null) { var sgAim = gunAim(bdir, 1.082); sgA = sgAim.a; sgK = sgAim.k; }
  var sgTx = cx + 1.5, sgTy = baseY - 25;
  g.fillStyle = SGN_ARMD;                                 // trunnion
  g.beginPath(); g.ellipse(sgTx, sgTy, 4.6, 4.0, 0, 0, 6.29); g.fill();
  g.fillStyle = SGN_ARML;
  g.beginPath(); g.ellipse(sgTx - 1, sgTy - 1.2, 2.2, 1.8, 0, 0, 6.29); g.fill();
  var sgBar = function (rx3, ry3, len, w4) {
    var ex3 = sgTx + rx3, ey3 = sgTy + ry3;
    len *= sgK;
    var tx3 = ex3 + Math.cos(sgA) * len, ty3 = ey3 + Math.sin(sgA) * len;
    g.lineCap = 'butt';
    g.strokeStyle = SGN_BARD; g.lineWidth = w4 + 1.8;
    g.beginPath(); g.moveTo(ex3, ey3); g.lineTo(tx3, ty3); g.stroke();
    g.strokeStyle = SGN_BAR; g.lineWidth = w4;
    g.beginPath(); g.moveTo(ex3, ey3); g.lineTo(tx3, ty3); g.stroke();
    g.strokeStyle = SGN_BARL; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(ex3 - 1, ey3); g.lineTo(tx3 - 1, ty3); g.stroke();
    g.strokeStyle = SGN_BARD; g.lineWidth = w4 + 0.6;     // cooling bands
    for (var k4 = 1; k4 <= 4; k4++) {
      var t4 = k4 / 5.6;
      g.beginPath();
      g.moveTo(ex3 + Math.cos(sgA) * len * t4, ey3 + Math.sin(sgA) * len * t4);
      g.lineTo(ex3 + Math.cos(sgA) * len * (t4 + 0.05), ey3 + Math.sin(sgA) * len * (t4 + 0.05));
      g.stroke();
    }
    g.fillStyle = '#0b0d11';                              // muzzle
    g.beginPath(); g.ellipse(tx3, ty3, 1.8, 1.5, 0, 0, 6.29); g.fill();
    if (ph6 === 2 || ph6 === 5) {                       // never phase 0: static
      g.fillStyle = 'rgba(255,214,128,.60)';
      g.beginPath(); g.ellipse(tx3 + 1.4, ty3 - 0.8, 3.6, 2.5, 0, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(255,246,214,.85)';
      g.beginPath(); g.ellipse(tx3 + 1.0, ty3 - 0.6, 1.6, 1.2, 0, 0, 6.29); g.fill();
    }
  };
  // DAYLIGHT BETWEEN THE TWO BARRELS. §2.7 asks for "two long thin
  // barrels ... resolvable as two at 2 px each with a gap >= 2 px
  // between them", and the pair used to be drawn TANGENT: roots
  // (-6.2, 2.6) and (1.6, -2.4) are 4.54 px apart measured along the
  // perpendicular to sgA = -1.082, against a summed half-width of
  // (2.6+1.8)/2 + (2.8+1.8)/2 = 4.50 — four hundredths of a pixel of
  // clearance, so at 1:1 the pair read as one fat ribbed tube and the
  // building's whole identity sentence ("an OPEN machine, not a bunker",
  // twin barrels raised steeply) was carried by a seam. Both roots move
  // 1.30 px along that perpendicular in opposite directions, and 1.50 px
  // BACK along the barrel axis (with the lengths +1.5 to hold the muzzles
  // exactly where they were), so each breech still seats on the trunnion
  // instead of hanging off the ammo plate. Axis separation 4.54 -> 7.14,
  // drawn sky gap 2.64 px, of which the bake reads 2 once the dark
  // outline's antialiasing has taken ~0.3 px off each edge. Same
  // elevation, same muzzle positions, same trunnion, same stagger.
  //
  // Swept over the aim range too, not just the idle bake: `gunAim` at
  // el = 1.082 puts `sgA` between -1.90 and -1.23, and the drawn gap runs
  // 3.7-6.3 px across it where the old roots ran 1.2-4.5 and closed to
  // almost nothing at one extreme. 1.98 px of perpendicular was tried
  // first and rejected by eye: at 4.0 px the pair reads splayed and the
  // near breech lifts off the plate.
  sgBar(-8.05, 3.31, 19.5, 2.6); sgBar(2.04, -0.47, 21.5, 2.8);
  g.lineWidth = 1;
} else {
  // Directorate never builds this (Soviet-only in RA2): plain block.
  prism(g, cx, baseY, fw * 0.8, fh * 0.8, 16, '#6a6f78', '#8a9099', '#2a2e36');
  g.fillStyle = col; g.fillRect(cx - fw * 0.5, baseY - 18, fw, 4);
}
}
