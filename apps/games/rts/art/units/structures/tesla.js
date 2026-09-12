// ─── structures/tesla ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// RA2 Tesla Coil, re-read at 1:1 against a fresh RED-owner rip
// (docs/ra2-ref/soviet-tesla-coil-idle.png, last frame of the wiki's
// `Tesla coil animation 2.gif`, 41x82, aspect 0.500). Massing was
// already right - the widest thing is the BASE, four house buttress
// pylons, and the head is a compact pale sphere. What was wrong at 1:1:
// the pylons were fat flat slabs stopping a quarter of the way up (the
// sprite's reach 45% and are narrow, with a dark cheek and a bright cut
// top), the helix was a dim thread on a black pipe (the sprite's is a
// FAT bright silver-white winding), the plant between the legs was mud
// grey (the sprite's is near-white) and the head floated on a long
// spindle instead of sitting on a short collar. Six idle phases
// (`bph`): the arcs crawl up the coil and the sphere's glow breathes.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var IRON = '#2b2d34', IRON_D = '#111318', IRON_L = '#4a4e59';
var COIL_D = '#0e0f12';                              // near-black coil core
var WIND = '#c6c8d8', WIND_M = '#8d90a6', WIND_D = '#54576b';   // silver winding
var SHELL = '#b0b0c4', SHELL_L = '#f2f2ff', SHELL_D = '#71718a';  // electrode
var CONCT = '#5a5850', MACH = '#b9bec6';
// Bare hardstanding: the space around the pylons is part of the read,
// so no bevelled parade platform on top of the skirt already drawn.
plot(g, cx, baseY, fw * 2, fh * 2);
g.fillStyle = 'rgba(30,34,26,.72)'; g.fill();
plot(g, cx, baseY, fw * 1.30, fh * 1.30);         // concrete raft
g.fillStyle = shade(CONCT, 0.52); g.fill(); outline(g, shade(CONCT, 0.34));
plot(g, cx, baseY - 2.5, fw * 1.16, fh * 1.16);
g.fillStyle = shade(CONCT, 0.78); g.fill(); outline(g, shade(CONCT, 0.40));

// Geometry, all offsets from baseY. The pylon tops reach 45% of the art
// height as the sprite's do, and the head sits at -78 so the tesla bolt
// (drawn from `eY` in the shot pass) leaves the electrode.
//
// EVERY VERTICAL OFFSET IN THIS BLOCK WAS x0.65 ON 2026-09-05, and the
// ball's radius was NOT, so the electrode stays round. The comment above
// claims a 1:1 re-read against a 41x82 rip, and the PROPORTIONS it
// describes were right; the SIZE was never checked, because until the
// structure-size gate landed nothing in the repo had ever measured a
// building. The coil baked 67x139 on a 64x32 cell — 4.34 footprint-
// heights, where RA2's own [NATSLA] (C&C-RA2-ngtsladm.gif, 45x81 on a
// 60x30 cell, and the same 41x82 this comment cites) is 2.70. At the
// building house scale of ~1.15x RA2 that asks for ~99 px and we were
// drawing 139, a third too tall and the single worst structure on the
// board; it now bakes 103.
//
// The WIDTH is deliberately untouched at 67 px. That figure is not the
// coil, it is the 1x1 ground diamond the hardstanding covers (fw*2 = 64
// plus its outline) — our structures paint the cells they own, RA2's
// sit inside theirs. That is a rendering convention of this file, not a
// per-building fault, so `wScale` is measured and reported and NOT
// gated; see the ra2Bld block. It is a TOWER and it is meant to be tall: the Prism Tower
// beside it measures 3.94 against RA2's 3.47 and is left alone. See
// RA2_BLD in tools/art-metrics.js.
// BUTTRESS SIZE IS THE HOUSE-FRACTION LEVER, and it was measured off the
// reference rather than guessed. §2.7 asks for ~40% house colour "carried
// by the buttresses"; a red-owner census of the committed 42x81
// `tesla-coil.gif` mask (s>=0.25, v>=0.20, hue within 20 deg) reads
// 668/1724 = 38.7%, its house pixels running rows 42..80 of 81
// (0.519-0.988 Sh) and peaking at 27 px of 42 = 0.643 Sw. Ours read
// 29.2% at pW 4.5 with the feet at -5/+6.5: the pylons were both
// narrower and shorter than the sprite's. pW 4.5 -> 5.6 takes the peak
// to 0.716 Sw and the far pair's feet from -5 to 0 (still 6.3 px inside
// the pad's own iso edge at that x) adds five rows of buttress where the
// pad is already opaque. 29.2% -> 35.3%.
//
// THE RESIDUAL 3 pp IS THE PAD, NOT THE PYLONS, and no amount of pylon
// is the right way to buy it. The reference's house runs to 0.988 Sh
// because RA2's sprite has NO ground plate — the pillars ARE the bottom
// of it. Ours stops at 0.864 Sh because `plot()` paints the cell this
// structure owns (the same convention that makes our wOverFoot 1.047
// against RA2's 0.700), so the bottom 14 rows are pad and can never be
// house. Two ways to close it were measured and both were rejected on
// sight: dropping ALL FOUR feet 4 px (36.4%) walks the front pair off
// the pad's iso edge so they hang in the air, and pW 6.0 (35.3% at a
// 0.776 Sw peak, 21% wider per row than the sprite's own) crowds the
// pillars into the central plant and closes the gaps the reference keeps
// open. 35.3% is inside the row's +-8 pp band with 3.3 pp to spare.
var pW = 5.6;                                       // pylon half-width
var pyl = [[-19.4, 0, 34], [11.4, 0, 34], [-9.0, 6.5, 30], [19.2, 6.5, 30]];
var mTop = baseY - 26;                               // machinery deck
var cB = baseY - 34, cT = baseY - 51;                // coil bottom / top
var eY = baseY - 70, eR = 13.0;                      // electrode centre / radius
// THE NECK BAND. [NATSLA]'s silhouette is head / NECK / shaft / plinth,
// and the neck is the whole point of the shape: 42x81, head rows 0-18
// (0.235 Sh, 20 px = 0.476 Sw at its widest), then rows 19-21 at 4-3-4 px
// -- 0.071 Sw and 0.037 Sh -- then the shaft resumes at 8 px and widens.
// Ours had the same head (0.478 Sw) and NO neck: the 7 px collar was
// buried under an electrode seated on it with zero gap, a 16 px helix
// wrapping past it, and -- the part that made narrowing the helix move
// the number by exactly zero -- the sphere's own 31 px halo, whose
// rgba(...,.18) counts as ink at the bake's alpha>8 cut and reached 15 px
// BELOW the collar's bottom. The pinch read 18 px = 0.269 Sw.
//   nkT..nkB is the band NOTHING may paint into except the collar.
// Everything below keeps off it explicitly: the electrode and its halo
// and contact shadow stop above nkT, the coil core, the helix, the
// discharge glow and the crawling bolts all stop below nkB.
var nkT = baseY - 58, nkB = baseY - 54;

// Central machinery the pylons brace: PALE plant between dark legs, the
// light patch that keeps the base from going to mud at 1:1.
cylinder(g, cx, baseY + 1, fw * 0.28, 28, shade(MACH, 0.62), shade(MACH, 0.92), dark);
g.fillStyle = 'rgba(0,0,0,.34)';                     // shaded right flank
g.fillRect(cx + fw * 0.06, mTop, fw * 0.22, 26);
g.fillStyle = 'rgba(248,250,255,.42)';               // two lit ribs, left
g.fillRect(cx - fw * 0.24, mTop + 2, 2.4, 24);
g.fillRect(cx - fw * 0.13, mTop + 6, 1.4, 20);
g.fillStyle = lo;                                    // house band on the raft
g.fillRect(cx - fw * 0.30, baseY - 5.4, fw * 0.60, 2.8);
g.fillStyle = hi;
g.fillRect(cx - fw * 0.30, baseY - 5.4, fw * 0.20, 2.8);

// Transformer housing, then the dark ball joint the coil grows out of.
cylinder(g, cx, mTop + 4, 10.4, 11, IRON, IRON_L, IRON_D);
g.fillStyle = shade(WIND_D, 0.92);                   // capping flange
g.beginPath(); g.ellipse(cx, mTop - 7, 12.0, 4.8, 0, 0, 6.29); g.fill();
outline(g, IRON_D);
g.fillStyle = shade(WIND_D, 0.56);
g.beginPath(); g.ellipse(cx, mTop - 5.4, 12.0, 4.8, 0, 0, Math.PI); g.fill();
g.fillStyle = '#33353d';                             // ball joint
g.beginPath(); g.ellipse(cx, cB - 1, 8.0, 7.4, 0, 0, 6.29); g.fill();
outline(g, IRON_D);
g.save();
g.beginPath(); g.ellipse(cx, cB - 1, 8.0, 7.4, 0, 0, 6.29); g.clip();
g.fillStyle = '#14161b';
g.beginPath(); g.ellipse(cx + 3.2, cB + 2.4, 7.2, 6.6, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(214,218,232,.34)';
g.beginPath(); g.ellipse(cx - 2.6, cB - 4.2, 3.6, 2.4, 0, 0, 6.29); g.fill();
g.restore();

// The coil: a real helix swept round a vertical axis, drawn in two
// passes so the turns behind the core are dim and the ones in front are
// bright silver-white - which is what the sprite reads as at 1:1.
cylinder(g, cx, cB, 4.4, cB - cT, COIL_D, '#26272e', '#050507');
var hRb = 11.0, hRt = 5.2, turns = 4, steps = 120, hSpan = cB - cT - 3;
var hPt = function (i) {
  var f = i / steps, r = hRb + (hRt - hRb) * f;   // f: 0 at the bottom, 1 at the top
  var t = f * turns * 6.2832;
  return [cx + Math.sin(t) * r,
          cB - 2 - f * hSpan + Math.cos(t) * r * 0.30,
          Math.cos(t)];
};
g.lineCap = 'round'; g.lineJoin = 'round';
for (var hPass = 0; hPass < 2; hPass++) {
  g.strokeStyle = hPass ? WIND_M : WIND_D;
  g.lineWidth = hPass ? 2.8 : 2.0;
  for (var hI = 0; hI < steps; hI++) {
    var a0 = hPt(hI), a1 = hPt(hI + 1);
    if ((a0[2] > 0) !== !!hPass) continue;            // back pass, then front
    g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
  }
}
g.strokeStyle = WIND; g.lineWidth = 0.9;
for (var hJ = 0; hJ < steps; hJ++) {                  // lit edge on front turns
  var b0 = hPt(hJ), b1 = hPt(hJ + 1);
  if (b0[2] < 0.55) continue;
  g.beginPath(); g.moveTo(b0[0] - 0.7, b0[1] - 0.9); g.lineTo(b1[0] - 0.7, b1[1] - 0.9); g.stroke();
}
g.lineWidth = 1;

// Short dark collar, then the electrode seated straight on it - no
// spindle. Pale silver going lavender-white at the crown, deliberately
// NOT saturated, so it is the same on a blue base and a red one.
cylinder(g, cx, nkB + 1, 2.0, 10, shade(IRON, 1.62), shade(IRON_L, 1.10), IRON_D);
g.fillStyle = shade(WIND_D, 0.88);                   // insulator plate the neck stands on,
g.beginPath(); g.ellipse(cx, nkB + 2, 5.0, 1.9, 0, 0, 6.29); g.fill();   // kept BELOW nkB
g.fillStyle = SHELL;
g.beginPath(); g.ellipse(cx, eY, eR, eR * 0.93, 0, 0, 6.29); g.fill();
outline(g, '#4b4b60');
g.save();
g.beginPath(); g.ellipse(cx, eY, eR, eR * 0.93, 0, 0, 6.29); g.clip();
g.fillStyle = SHELL_D;                               // shaded lower-right
g.beginPath(); g.ellipse(cx + eR * 0.30, eY + eR * 0.42, eR * 0.92, eR * 0.86, 0, 0, 6.29); g.fill();
g.fillStyle = SHELL_L;                               // lit crown
g.beginPath(); g.ellipse(cx - eR * 0.26, eY - eR * 0.44, eR * 0.56, eR * 0.40, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(184,184,238,.24)';               // faint lavender cast
g.beginPath(); g.ellipse(cx - eR * 0.10, eY - eR * 0.12, eR * 0.85, eR * 0.62, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(52,54,74,.62)';                  // equatorial groove
g.fillRect(cx - eR, eY + eR * 0.26, eR * 2, 2.4);
g.fillStyle = 'rgba(246,246,255,.55)';               // machined lip above it
g.fillRect(cx - eR, eY + eR * 0.26 - 1.4, eR * 2, 1.4);
g.fillStyle = 'rgba(38,40,56,.34)';                  // second, upper seam
g.fillRect(cx - eR, eY - eR * 0.46, eR * 2, 1.2);
g.fillStyle = 'rgba(255,255,255,.40)';               // specular, deliberately dull
g.beginPath(); g.ellipse(cx - eR * 0.40, eY - eR * 0.60, eR * 0.22, eR * 0.11, 0, 0, 6.29); g.fill();
g.restore();
g.fillStyle = 'rgba(20,22,30,.40)';                  // seated on the collar
g.beginPath(); g.ellipse(cx, eY + eR * 0.74, eR * 0.36, 1.7, 0, 0, 6.29); g.fill();

// Four buttress pylons at the corners of the iso base, drawn back to
// front. These are the house colour and the biggest mass on the sprite:
// friend or foe has to be legible from the silhouette's base.
var pylon = function (dx, dyB, pH, far) {
  var bx = cx + dx, by = baseY + dyB, ty = by - pH;
  var body = far ? shade(col, 0.80) : col, lit = far ? col : hi;
  g.fillStyle = 'rgba(0,0,0,.30)';                   // contact shadow
  g.beginPath(); g.ellipse(bx + 1.5, by + 1.5, pW * 1.20, pW * 0.55, 0, 0, 6.29); g.fill();
  g.fillStyle = body;                                // body
  g.beginPath(); g.rect(bx - pW, ty, pW * 2, pH); g.fill();
  outline(g, '#1c1e24');
  g.fillStyle = lit;                                 // lit left cheek
  g.fillRect(bx - pW + 0.7, ty + 1.4, pW * 0.42, pH - 2.4);
  // The shaded cheek, the foot and the cut top are DESATURATED toward
  // slate on purpose. The RA2 sprite paints its whole buttress house
  // red, which would put this one structure past the 18% owner-hue
  // ceiling on its own; keeping the lit faces saturated and the turned
  // faces grey keeps the read and the budget.
  g.fillStyle = mixc(col, '#2a2926', 0.78);          // shaded right cheek
  g.fillRect(bx + pW * 0.02, ty + 1.4, pW * 0.98, pH - 2.4);
  g.fillStyle = mixc(col, '#25272d', 0.80);          // dark foot
  g.fillRect(bx - pW, by - 3.4, pW * 2, 3.4);
  g.fillStyle = mixc(col, '#c9ccd4', 0.68);          // FLAT top - a cut slab
  g.fillRect(bx - pW, ty, pW * 2, 2.2);
  g.fillStyle = 'rgba(255,255,255,.26)';
  g.fillRect(bx - pW, ty, pW * 2, 0.9);
  g.fillStyle = 'rgba(0,0,0,.32)';
  g.fillRect(bx - pW, ty + 2.2, pW * 2, 1.0);
};
for (var yI = 0; yI < 4; yI++) pylon(pyl[yI][0], pyl[yI][1], pyl[yI][2], yI < 2);

// Idle discharge. On the sprite the arcs crawl AROUND the coil and lick
// the sphere; they never sit still, so the glyph walks up the winding
// with the phase. Blue-white desaturated toward white, so a red-owner
// coil never carries the opposing hue.
var arcY = function (t) { return cB - 6 - t * (cB - cT - 12); };
g.fillStyle = 'rgba(196,206,240,.10)';
g.beginPath(); g.ellipse(cx, arcY(0.5), 11, 11, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(226,232,255,' + (0.10 + 0.08 * (0.5 + 0.5 * anS)) + ')';
g.beginPath(); g.ellipse(cx, eY - 0.8, eR * 1.20, eR * 0.96, 0, 0, 6.29); g.fill();
var bolts = [
  [[1, 2], [7, 0], [4, -3], [11, -6]],
  [[-1, 1], [-8, -2], [-5, -6], [-12, -9]],
  [[1, 4], [6, 7], [3, 9], [9, 12]]
];
for (var pass = 0; pass < 2; pass++) {
  g.strokeStyle = pass ? 'rgba(255,255,255,.92)' : 'rgba(198,206,240,.50)';
  g.lineWidth = pass ? 1.0 : 2.4;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (var bI2 = 0; bI2 < bolts.length; bI2++) {
    var bp = bolts[bI2], bRoot = arcY(((bph || 0) + bI2 / 3) % 1);
    var bMax = 0;
    for (var bM = 0; bM < bp.length; bM++) if (bp[bM][1] > bMax) bMax = bp[bM][1];
    if (bRoot - 1 - bMax < nkB + 1.4) bRoot = nkB + 2.4 + bMax;   // arcs crawl the COIL, never the neck
    g.beginPath();
    g.moveTo(cx, bRoot);
    for (var kI = 0; kI < bp.length; kI++) g.lineTo(cx + bp[kI][0], bRoot - 1 - bp[kI][1]);
    g.stroke();
  }
  // one arc licking the electrode, phase-shifted the other way
  g.beginPath();
  g.moveTo(cx + eR * 0.2, eY + eR * 0.72);
  g.lineTo(cx + eR * (0.8 + 0.3 * anS), eY + eR * 0.2);
  g.lineTo(cx + eR * (0.5 + 0.2 * anS), eY - eR * 0.4);
  g.lineTo(cx + eR * (1.1 + 0.2 * anS), eY - eR * 0.9);
  g.stroke();
}
g.lineWidth = 1;
