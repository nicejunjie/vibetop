// Iron Frontier unit art — structures/flakcannon
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/flakcannon` and
// `// @@END structures/flakcannon` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// --- RA2 Flak Cannon ----------------------------------------------------
// Re-read at 1:1 against soviet-flak-cannon-anim-last.png (53x68 with
// the magenta shadow masked, aspect 0.779 - taller than wide). The
// sprite is a COMPACT cross of short legs, a dark gearbox, a bright
// house MOUNT block at the barrel's foot, a brass ammo feed, and one
// long pale barrel raised about 70 degrees that is the top of the
// silhouette. The old build spread its legs 36px each way and laid the
// barrel at 45 degrees - 44% too wide. Six idle phases (`bph`): the
// barrel slews and the loader arm works.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var FK_GUN = '#343a44', FK_GUNL = '#5f6672', FK_GUND = '#12151a';
var FK_BAR = '#b9bcc2', FK_BARL = '#eceef2', FK_BARD = '#2a2e35';
plot(g, cx, baseY, fw * 2, fh * 2);
g.fillStyle = 'rgba(30,34,26,.62)'; g.fill();
g.fillStyle = 'rgba(0,0,0,.30)';
g.beginPath(); g.ellipse(cx + 3, baseY + 4, 22, 9.5, 0, 0, 6.29); g.fill();
// ---- four short legs to the diamond points, far ones first ------------
var legs4 = [[0, -10], [-26, 0], [26, 0], [0, 10]];
for (var fli = 0; fli < 4; fli++) {
  var lx2 = cx + legs4[fli][0], ly2 = baseY + legs4[fli][1];
  g.strokeStyle = FK_GUND; g.lineWidth = 6.0; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, baseY - 1); g.lineTo(lx2, ly2); g.stroke();
  g.strokeStyle = FK_GUN; g.lineWidth = 3.6;
  g.beginPath(); g.moveTo(cx, baseY - 2); g.lineTo(lx2, ly2 - 1); g.stroke();
  g.strokeStyle = FK_GUNL; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(cx, baseY - 3.2); g.lineTo(lx2, ly2 - 2.2); g.stroke();
  g.fillStyle = '#6d7482';                                  // pale foot plate
  g.beginPath(); g.ellipse(lx2, ly2 + 0.5, 4.0, 2.1, 0, 0, 6.29); g.fill();
  outline(g, FK_GUND);
}
g.fillStyle = col;                                          // two house leg pads
g.beginPath(); g.ellipse(cx - 26, baseY - 0.4, 4.4, 2.3, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.40));
g.beginPath(); g.ellipse(cx, baseY + 9.6, 4.4, 2.3, 0, 0, 6.29); g.fill();
outline(g, shade(col, 0.40));
// ---- gearbox mount ------------------------------------------------------
cylinder(g, cx, baseY - 1, 9.0, 12, FK_GUN, FK_GUNL, FK_GUND);
g.strokeStyle = FK_GUNL; g.lineWidth = 1.2;              // was FK_BAR (barrel's own
// palette, too bright): the mount block drawn afterwards covers most of
// this collar ring, but its slanted edges left the ring's two tips
// peeking out as pure highlight-bright pixels detached from everything
// else — extra "barrels" by the dark/bright-blob count. Same tone
// family as the cylinder's own top color keeps the ring reading as a
// metal seam without crossing the clause's brightness floor.
g.beginPath(); g.ellipse(cx, baseY - 13, 9.0, 3.8, 0, 0, 6.29); g.stroke();
// ---- brass ammo feed and a loaded round ---------------------------------
puckDrum(g, cx - 10.5, baseY - 4, 3.6, 5.2, '#7a6f3c', '#b6a75e', FK_GUND);  // was baseY-8: its bright lid highlight poked 2px into the crown band, a spurious extra "barrel"
g.fillStyle = (ph6 === 1 || ph6 === 4) ? '#ffd76e' : '#c8a13a';
g.beginPath(); g.ellipse(cx - 6.4, baseY - 15.4, 1.8, 1.3, 0, 0, 6.29); g.fill();
// ---- the bright house MOUNT block at the barrel's foot ------------------
var fkPiv = { x: cx + 1, y: baseY - 26 };
g.fillStyle = shade(col, 0.62);
g.beginPath();
g.moveTo(cx - 8.6, baseY - 12); g.lineTo(cx + 9.4, baseY - 14.6);
g.lineTo(cx + 8.0, baseY - 28.6); g.lineTo(cx - 7.2, baseY - 26.0);
g.closePath(); g.fill(); outline(g, shade(col, 0.34));
g.fillStyle = col;
g.beginPath();
g.moveTo(cx - 7.6, baseY - 13); g.lineTo(cx + 2.4, baseY - 14.4);
g.lineTo(cx + 1.4, baseY - 27.6); g.lineTo(cx - 6.4, baseY - 26.2);
g.closePath(); g.fill();
g.fillStyle = shade(col, 1.30); g.fillRect(cx - 7.0, baseY - 25.8, 2.2, 12.4);
g.fillStyle = 'rgba(0,0,0,.26)';
g.beginPath();
g.moveTo(cx + 4.4, baseY - 14.6); g.lineTo(cx + 9.4, baseY - 14.6);
g.lineTo(cx + 8.0, baseY - 28.6); g.lineTo(cx + 3.4, baseY - 28.2);
g.closePath(); g.fill();
// trunnion
g.fillStyle = FK_GUND;
g.beginPath(); g.ellipse(fkPiv.x, fkPiv.y, 5.0, 4.4, 0, 0, 6.29); g.fill();
g.fillStyle = FK_BAR;                                     // was FK_GUNL (a shade
// too dim to ever read as "bright" itself): the dark trunnion disc sat
// squarely between the mount's bright face and the barrel's bright base,
// splitting the one raised assembly into two separate blobs. A real
// metal highlight here, big enough to touch both, reads as the oiled
// pivot joint it is and knits the barrel to its own mount.
g.beginPath(); g.ellipse(fkPiv.x - 1.2, fkPiv.y - 0.6, 3.8, 3.4, 0, 0, 6.29); g.fill();
// ---- the barrel: pale banded tube raised ~70 deg -------------------------
var fkA = -1.235 + anS * 0.075, fkL = 39;
if (bdir != null) { var fkAim = gunAim(bdir, 1.235); fkA = fkAim.a; fkL = 39 * fkAim.k; }
var fmx = fkPiv.x + Math.cos(fkA) * fkL, fmy = fkPiv.y + Math.sin(fkA) * fkL;
g.lineCap = 'butt';
g.strokeStyle = FK_BARD; g.lineWidth = 5.4;
g.beginPath(); g.moveTo(fkPiv.x, fkPiv.y); g.lineTo(fmx, fmy); g.stroke();
g.strokeStyle = FK_BAR; g.lineWidth = 3.4;
g.beginPath(); g.moveTo(fkPiv.x, fkPiv.y); g.lineTo(fmx, fmy); g.stroke();
g.strokeStyle = FK_BARL; g.lineWidth = 1.2;
g.beginPath(); g.moveTo(fkPiv.x - 1.2, fkPiv.y); g.lineTo(fmx - 1.2, fmy); g.stroke();
g.strokeStyle = FK_BARD; g.lineWidth = 3.9;                  // ladder of cooling bands
for (var fkI = 1; fkI <= 7; fkI++) {
  var ft = fkI / 8.8;
  g.beginPath();
  g.moveTo(fkPiv.x + Math.cos(fkA) * fkL * ft, fkPiv.y + Math.sin(fkA) * fkL * ft);
  g.lineTo(fkPiv.x + Math.cos(fkA) * fkL * (ft + 0.022), fkPiv.y + Math.sin(fkA) * fkL * (ft + 0.022));
  g.stroke();
}
g.strokeStyle = FK_GUND; g.lineWidth = 5.0;                  // muzzle brake
g.beginPath();
g.moveTo(fkPiv.x + Math.cos(fkA) * fkL * 0.90, fkPiv.y + Math.sin(fkA) * fkL * 0.90);
g.lineTo(fmx, fmy); g.stroke();
g.fillStyle = '#0c1014';
g.beginPath(); g.ellipse(fmx, fmy - 0.4, 2.6, 1.8, fkA + 1.57, 0, 6.29); g.fill();
g.strokeStyle = FK_GUNL; g.lineWidth = 0.8; g.stroke();   // was near-white: a rim
// this bright made its own island once the dark muzzle brake band cut it
// off from the rest of the bright barrel, an extra "barrel" by count.
g.lineWidth = 1;
