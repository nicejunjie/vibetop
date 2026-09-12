// ─── structures/patriot ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// --- RA2 Patriot Missile System ---------------------------------------
// Re-read at 1:1 against allied-patriot-anim-last.png (44x55 with the
// magenta shadow masked, aspect 0.800 - the sprite is TALLER than wide).
// The launcher IS the building: a fat bright house TORUS round the foot
// of a small bright WHITE dome, and standing on it a dark navy block of
// FOUR chunky tubes with big dark mouths, strapped with one broad house
// band. The old build was a wide low silver saucer with a small tilted
// box and four dots on its lid - 40% too wide. Six idle phases (`bph`):
// the launcher traverses and tilts and the radar lamp blinks. The front
// tube mouths sit at -46, so `launch: 34` (drawn at -10-34) leaves the
// missile at the tubes.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var PT_BOX = '#2c3342', PT_BOXL = '#4c5668', PT_BOXD = '#12161f';
var PT_SIL = '#dfe3ea', PT_SILL = '#fbfcff', PT_SILD = '#828894';
plot(g, cx, baseY, fw * 2, fh * 2);
g.fillStyle = 'rgba(30,34,26,.62)'; g.fill();
g.fillStyle = 'rgba(0,0,0,.34)';
g.beginPath(); g.ellipse(cx + 1, baseY + 4, 20, 7, 0, 0, 6.29); g.fill();
g.fillStyle = '#4b4a34';                                     // olive apron
g.beginPath(); g.ellipse(cx, baseY + 3, 25, 11, 0, 0, 6.29); g.fill();
outline(g, '#232316');
g.fillStyle = '#63614a';
g.beginPath(); g.ellipse(cx, baseY + 1.4, 23, 10, 0, 0, 6.29); g.fill();
outline(g, '#2c2b1e');

// ---- the fat house torus round the dome foot --------------------------
g.fillStyle = shade(col, 0.52);
g.beginPath(); g.ellipse(cx, baseY - 0.6, 20, 8.6, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.32));
g.fillStyle = col;
g.beginPath(); g.ellipse(cx, baseY - 2.4, 20, 8.6, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.34));
g.save();
g.beginPath(); g.ellipse(cx, baseY - 2.4, 20, 8.6, 0, 0, 6.29); g.clip();
g.fillStyle = shade(col, 1.32);                              // lit near-left arc
g.beginPath(); g.ellipse(cx - 3.4, baseY - 4.0, 19, 7.6, 0, 2.5, 5.0); g.fill();
g.fillStyle = shade(col, 0.66);                              // shaded far arc
g.beginPath(); g.ellipse(cx + 2.6, baseY - 5.0, 19, 7.6, 0, 3.4, 6.1, true); g.fill();
g.restore();

// ---- small bright white dome ------------------------------------------
g.fillStyle = PT_SIL;
g.beginPath(); g.ellipse(cx, baseY - 4.4, 15.2, 6.4, 0, 0, 6.29); g.fill();
g.beginPath(); g.ellipse(cx, baseY - 4.4, 15.2, 12.4, 0, Math.PI, 0); g.fill();
outline(g, PT_SILD);
g.fillStyle = PT_SILL;
g.beginPath(); g.ellipse(cx - 4.6, baseY - 11.6, 6.4, 2.8, -0.3, 0, 6.29); g.fill();
g.fillStyle = 'rgba(90,98,112,.30)';
g.beginPath(); g.ellipse(cx + 7.4, baseY - 7.4, 6.4, 4.6, 0.4, 0, 6.29); g.fill();
cylinder(g, cx, baseY - 14, 6.4, 5, '#39404e', '#5a6373', PT_BOXD);   // pedestal collar

// ---- the launcher: four chunky tubes in a 2x2 stack -------------------
// Traverse and tilt come off the phase: the whole block leans a little
// and slides a pixel or two, which is what the sprite's idle does.
var trv = anS * 1.8, tlt = Math.cos(anP) * 1.2, ptLean = 0;
if (bdir != null) {
  var ptAim = gunAim(bdir, 0);
  trv = ptAim.sx * 3.0; tlt = ptAim.sy * 2.4; ptLean = ptAim.sx * 10.0;
}
var ptTube = function (dx, yb, hgt, lit) {
  var x0 = cx + dx + trv, y1 = yb - hgt + tlt * (dx < 0 ? -1 : 1) * 0.4;
  var xt = x0 + ptLean;
  g.fillStyle = lit ? PT_BOX : shade(PT_BOX, 0.72);
  g.beginPath();
  g.moveTo(x0 - 6.4, yb); g.lineTo(x0 + 6.4, yb - 2.2);
  g.lineTo(xt + 6.4, y1 - 2.2); g.lineTo(xt - 6.4, y1);
  g.closePath(); g.fill(); outline(g, PT_BOXD);
  g.fillStyle = lit ? PT_BOXL : shade(PT_BOX, 0.94);       // lit left strip
  g.beginPath();
  g.moveTo(x0 - 6.0, yb - 1); g.lineTo(x0 - 3.6, yb - 1);
  g.lineTo(xt - 3.6, y1 + 1); g.lineTo(xt - 6.0, y1 + 1);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.28)';                          // shaded right strip
  g.beginPath();
  g.moveTo(x0 + 2.8, yb - 1.4); g.lineTo(x0 + 6.2, yb - 1.4);
  g.lineTo(xt + 6.2, y1 - 1.4); g.lineTo(xt + 2.8, y1 - 1.4);
  g.closePath(); g.fill();
  g.fillStyle = '#060708';                                  // the mouth (near-black: the >=25%-contrast dark disc the clause counts)
  g.beginPath(); g.ellipse(xt, y1 - 1.1, 5.0, 2.2, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#98a0b2'; g.lineWidth = 1.1; g.stroke();
  g.fillStyle = 'rgba(228,234,244,.55)';
  g.beginPath(); g.ellipse(xt - 1.6, y1 - 1.9, 2.2, 0.9, 0, 0, 6.29); g.fill();
};
ptTube(-8.5, baseY - 20, 31, false);                        // back-left
ptTube(4.5, baseY - 23, 31, false);                         // back-right
ptTube(-4.5, baseY - 13, 29, true);                         // front-left
ptTube(9.0, baseY - 16, 29, true);                          // front-right

// ---- one broad house strap across the front of the block --------------
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 11.2 + trv + ptLean * 0.35, baseY - 26.0); g.lineTo(cx + 15.4 + trv + ptLean * 0.35, baseY - 31.0);
g.lineTo(cx + 15.4 + trv + ptLean * 0.35, baseY - 36.4); g.lineTo(cx - 11.2 + trv + ptLean * 0.35, baseY - 31.4);
g.closePath(); g.fill(); outline(g, shade(col, 0.36));
g.fillStyle = shade(col, 1.30);
g.beginPath();
g.moveTo(cx - 11.2 + trv + ptLean * 0.35, baseY - 31.4); g.lineTo(cx + 15.4 + trv + ptLean * 0.35, baseY - 36.4);
g.lineTo(cx + 15.4 + trv + ptLean * 0.35, baseY - 38.0); g.lineTo(cx - 11.2 + trv + ptLean * 0.35, baseY - 33.0);
g.closePath(); g.fill();

// ---- radar cap and its blinking lamp on the dome's left shoulder ------
g.fillStyle = '#9aa1ae';
g.beginPath(); g.ellipse(cx - 13.6, baseY - 12.4, 3.6, 2.0, 0, 0, 6.29); g.fill();
outline(g, PT_BOXD);
g.fillStyle = (ph6 === 0 || ph6 === 3) ? '#ffe9a8' : '#6d7484';
g.beginPath(); g.ellipse(cx - 13.6, baseY - 14.4, 1.5, 1.2, 0, 0, 6.29); g.fill();
