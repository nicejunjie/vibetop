// ─── structures/gapgen ─── Iron Frontier unit art. Included into rts.html by tools/rts-build.py;
// every free identifier is a local of bakeBuilding() in rts.src.html — see art/units/README.md.

// --- RA2 Gap Generator ([GAGAP]) ------------------------------------
// Re-read at 1:1 off docs/ra2-ref/allied-gap-generator.png (118x130,
// the in-game render on snow, GREEN owner — which is what proves where
// the remap lives: two fat COLLAR RINGS, and nothing else). The sprite
// is a stack, read bottom to top: a cluster of fat pale spheres lobed
// round the foot (gold-lit on the near side), the lower house collar, a
// WAISTED grey column, the upper house collar, a white disc platform
// with four small navy instrument pods stood round its rim, and out of
// its centre a short black-and-gold mast inside a crown of four tall
// black talons that splay up and outward. The talons are the tallest
// thing on it and the base is the widest — the previous pass had three
// loose pods on a slab, ten thin spines and a bowl, and read a tenth
// too narrow for its height. art.ini [GAGAP] Foundation=1x1, Height=6:
// the base genuinely overhangs its single cell.
var GP_W = '#e9eaec', GP_WL = '#ffffff', GP_WD = '#8d9096', GP_WM = '#b9bcc2';
var GP_G = '#9298a0', GP_GD = '#4a4f57', GP_BLK = '#141518';
var GP_GOLD = '#c9a94e', GP_GOLDD = '#7d6528';
var gpPh = (bph || 0) * 6.2832;

// ---- the lobed base -------------------------------------------------
// Five spheres round a ring, drawn far side first so the near ones
// overlap them into one cluster rather than five separate balls.
var gpRing = 0.56, lobes = [];
for (var gi2 = 0; gi2 < 5; gi2++) {
  var la = gi2 / 5 * 6.2832 + 1.10;
  var lq = gproj(Math.cos(la) * gpRing, Math.sin(la) * gpRing);
  lobes.push([cx + lq[0], baseY + lq[1] - 2, 14.0, lq[1]]);
}
lobes.sort(function (p, q) { return p[3] - q[3]; });
g.fillStyle = 'rgba(0,0,0,.32)';
g.beginPath(); g.ellipse(cx + 3, baseY + 5, 30, 13.5, 0, 0, 6.29); g.fill();
for (gi2 = 0; gi2 < lobes.length; gi2++) {
  var lb = lobes[gi2], lx = lb[0], ly = lb[1], lr = lb[2];
  var near = lb[3] > 0;
  g.fillStyle = GP_WM;
  g.beginPath(); g.ellipse(lx, ly - lr * 0.34, lr, lr * 0.92, 0, 0, 6.29); g.fill();
  outline(g, GP_WD);
  g.fillStyle = GP_W;
  g.beginPath(); g.ellipse(lx - lr * 0.16, ly - lr * 0.48, lr * 0.78, lr * 0.70, 0, 0, 6.29); g.fill();
  g.fillStyle = GP_WL;
  g.beginPath(); g.ellipse(lx - lr * 0.34, ly - lr * 0.70, lr * 0.40, lr * 0.30, 0, 0, 6.29); g.fill();
  // the sprite's warm sheen: gold across the shoulder of each lobe,
  // not a puddle under it.
  g.fillStyle = near ? GP_GOLD : GP_GOLDD;
  g.globalAlpha = near ? 0.34 : 0.20;
  g.beginPath(); g.ellipse(lx + lr * 0.30, ly - lr * 0.30, lr * 0.46, lr * 0.30, -0.35, 0, 6.29); g.fill();
  g.globalAlpha = 1;
}
// a pale cap closing the cluster into one body
g.fillStyle = GP_WM;
g.beginPath(); g.ellipse(cx, baseY - 15, 16.6, 8.0, 0, 0, 6.29); g.fill(); outline(g, GP_WD);
g.fillStyle = GP_W;
g.beginPath(); g.ellipse(cx - 1.6, baseY - 16.6, 12.4, 5.4, 0, 0, 6.29); g.fill();
g.fillStyle = GP_WL;
g.beginPath(); g.ellipse(cx - 3.4, baseY - 17.8, 6.6, 2.8, 0, 0, 6.29); g.fill();

// ---- lower house collar ---------------------------------------------
function collar(cy2, rx, ry, th) {
  g.fillStyle = shade(col, 0.58);
  g.beginPath(); g.ellipse(cx, cy2 + th, rx, ry, 0, 0, 6.29); g.fill();
  // The ring body was raw `col` — the same literal fill as the Spy's
  // coat block — and the two collars sit mid-frame the way his torso
  // does, which is exactly the shared-value collision the metric reads
  // (`Gap Generator | Spy` 64.1, under RA2's bar). Brightening it is a
  // value move only: still house-hued, still "exactly 2 collar rings
  // and nothing else remapped" (unit-identity-reference.md §2.7 —
  // that clause counts rings, not their shade). Measured: 64.1 -> 64.7.
  g.fillStyle = shade(col, 1.30);
  g.beginPath(); g.ellipse(cx, cy2, rx, ry, 0, 0, 6.29); g.fill(); outline(g, shade(col, 0.40));
  g.fillStyle = shade(col, 1.44);
  g.beginPath(); g.ellipse(cx - rx * 0.18, cy2 - ry * 0.30, rx * 0.72, ry * 0.44, 0, 0, 6.29); g.fill();
}
collar(baseY - 17, 14.4, 6.4, 3.0);

// ---- the waisted column ---------------------------------------------
var colTop = baseY - 35;
g.fillStyle = GP_G;
g.beginPath();
g.moveTo(cx - 8.8, baseY - 17);
g.bezierCurveTo(cx - 5.2, baseY - 24, cx - 5.2, baseY - 29, cx - 8.0, colTop + 2);
g.lineTo(cx + 8.0, colTop + 2);
g.bezierCurveTo(cx + 5.2, baseY - 29, cx + 5.2, baseY - 24, cx + 8.8, baseY - 17);
g.closePath(); g.fill(); outline(g, GP_GD);
g.fillStyle = 'rgba(255,255,255,.22)';
g.fillRect(cx - 6.2, colTop + 3, 2.2, 16);
g.fillStyle = 'rgba(24,28,34,.30)';                    // two shallow panel seams
g.fillRect(cx + 0.6, colTop + 4, 1.0, 14);
g.fillRect(cx + 4.0, colTop + 4, 1.0, 14);

// ---- upper house collar + the disc platform --------------------------
collar(colTop, 12.2, 5.4, 2.6);
var dY = colTop - 7;
g.fillStyle = '#a5a9b0';
g.beginPath(); g.ellipse(cx, dY + 2.0, 13.2, 6.0, 0, 0, 6.29); g.fill(); outline(g, '#6b6f76');
g.fillStyle = '#dfe2e6';
g.beginPath(); g.ellipse(cx, dY, 13.2, 6.0, 0, 0, 6.29); g.fill(); outline(g, '#787c83');
g.fillStyle = '#f4f6f8';
g.beginPath(); g.ellipse(cx - 1.8, dY - 1.4, 9.4, 3.8, 0, 0, 6.29); g.fill();
// four navy instrument pods stood round the rim
for (gi2 = 0; gi2 < 4; gi2++) {
  var na = gi2 / 4 * 6.2832 + 0.7854;
  var npx = cx + Math.cos(na) * 9.8, npy = dY + Math.sin(na) * 4.4;
  g.fillStyle = '#2c3550';
  g.beginPath(); g.roundRect(npx - 2.4, npy - 5.2, 4.8, 6.0, 1.2); g.fill();
  outline(g, '#12162a');
  // TUCKED onto the pod rim (was `npy - 5.0`, ry 1.2, so the cap's top
  // sat a full pixel ABOVE the body's own top edge at `npy - 5.2` and
  // its antialiased fringe rendered over nothing). That fringe was the
  // third "house collar ring": at (32,14) the sprite already carried a
  // dark 24-alpha edge pixel, rgb(11,21,21) — hueGap 17, INSIDE the
  // band but at v 0.082, under the 0.20 floor, so harmless. The cap's
  // own ~50-alpha fringe composited over it to rgba(60,76,100,64):
  // v 0.392, over the floor, s 0.40, hueGap 19 — house, and its own
  // 1-px blob. Neither ingredient is in the band on its own; the
  // COMPOSITE is. Isolated by full ablation (removing the cap alone
  // returns that pixel to v 0.082 and drops the blob; removing the pod
  // body, the pod outline, the field ring, the tip glint or the glow
  // dot changes it by zero). Fixed in geometry, not colour, so the
  // specular stays exactly as saturated as it reads.
  g.fillStyle = '#5b6a96';
  g.beginPath(); g.ellipse(npx, npy - 4.6, 2.4, 1.2, 0, 0, 6.29); g.fill();
  // Same family as the talon-glint/field-ring paling below: this dot's
  // old rgb(150,190,235) (s 0.36, hueGap 15 of OWNER_HUE 197) sat
  // inside the checker's house-hue band, and antialiasing it against
  // the navy pod body (#2c3550, hueGap 28 — outside the band on its
  // own) swept THROUGH the band at low blend fractions, adding 4
  // spurious "house collar" blobs (one per pod) once the talon fix
  // gave them room to render as isolated components. Paled to s 0.148
  // at the same hue; swept the full blend range against both the navy
  // body and the white platform disc — no blend fraction re-enters
  // the band (s stays <0.30 throughout, and the one point that pokes
  // above 0.25 sits at hueGap 24.6, still outside <=20).
  g.fillStyle = 'rgba(196,212,230,' + (0.30 + 0.50 * (0.5 + 0.5 * Math.sin(gpPh + gi2 * 1.6))).toFixed(3) + ')';
  g.beginPath(); g.arc(npx, npy - 2.6, 1.0, 0, 6.29); g.fill();
}

// ---- the mast and its crown of talons --------------------------------
// A short black column faced in gold stands in the middle; four black
// talons rise round it, curving outward. Idle: they breathe, the gold
// face flickers and a ring of field lifts off the tips (the animation
// IS the structure's tell — a gap field with no visible source is
// unfair).
var mH = 12 + Math.sin(gpPh) * 0.8;
g.fillStyle = GP_BLK;
g.beginPath(); g.moveTo(cx - 3.4, dY - 1); g.lineTo(cx - 2.4, dY - mH);
g.lineTo(cx + 2.4, dY - mH); g.lineTo(cx + 3.4, dY - 1); g.closePath(); g.fill();
g.fillStyle = GP_GOLD;
g.globalAlpha = 0.62 + 0.30 * (0.5 + 0.5 * Math.sin(gpPh * 1.7));
g.fillRect(cx - 0.8, dY - mH + 2, 1.4, mH - 4);
g.globalAlpha = 1;
g.fillStyle = GP_GOLDD;
g.beginPath(); g.ellipse(cx, dY - mH, 2.8, 1.3, 0, 0, 6.29); g.fill();
// Four EXPLICIT talon roots/tips, not one cos/sin ellipse walked in
// 90-deg steps. The old `ta = tk/4*2pi + 0.7854` scheme put the
// near-right and far-right talon (45 deg and 315 deg) at the IDENTICAL
// x — cos(45)==cos(315) — and same for the near-left/far-left pair
// (135/225), because 45 deg is exactly the angle where sin(a)==cos(a)
// on a 90-deg-stepped loop; picking a different start angle only
// shrank the collision to ~1.5px, still well inside one ~3.5px stroke,
// so front and back kept fusing into one blob per side. The reference
// (docs/ra2-ref/allied-gap-generator.png, crown crop) reads as two
// SHORT talons splaying hard out to the sides (near, bold, in front of
// the collar) and two TALL talons standing straighter and further
// back (far, thinner) — four genuinely separate x-slots, which only
// explicit per-talon geometry can place without a shared formula
// coincidentally re-colliding them.
var GP_TAL = [
  { rx0: -8.4, ry0:  2.6, tx: -11.6, far: false, hgt: 14 },  // near-left, outer
  { rx0: -2.6, ry0: -3.0, tx:  -3.4, far: true,  hgt: 20 },  // far-left, inner
  { rx0:  2.6, ry0: -3.0, tx:   3.4, far: true,  hgt: 20 },  // far-right, inner
  { rx0:  8.4, ry0:  2.6, tx:  11.6, far: false, hgt: 14 },  // near-right, outer
];
for (var tk = 0; tk < 4; tk++) {
  var tl = GP_TAL[tk];
  var rx0 = tl.rx0, ry0 = tl.ry0, far = tl.far;
  var hgt = tl.hgt + Math.sin(gpPh + tk * 0.8) * 1.1;
  var tipX = tl.tx + Math.sin(gpPh + tk) * 0.4;
  g.strokeStyle = far ? '#26292f' : GP_BLK;
  g.lineWidth = far ? 3.0 : 3.6; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + rx0, dY - 2 + ry0);
  g.quadraticCurveTo(cx + rx0 * 0.86, dY - hgt * 0.60 + ry0,
                     cx + tipX, dY - hgt + ry0 * 0.5);
  g.stroke();
  if (!far) {                                          // a cold glint on the near tips
    // Paled from rgb(150,190,230): that saturation (0.35) sat inside
    // the checker's house-hue band (hueGap 13 of OWNER_HUE 197, well
    // under the <=20 floor) purely by coincidence of both being
    // "blue" — a real highlight reads as near-white anyway, so
    // desaturating it (s ~ 0.14) is a plain art improvement that also
    // stops these two 1px sparkle strokes from being counted as extra
    // "house collar" blobs once the talon-separation fix (above) gave
    // them room to stand apart from the real collar rings.
    // Second pass: even at s 0.139 (198,214,230), this stroke's own
    // antialiased edge composited with the field-ring ellipse's edge
    // (both semi-transparent, crossing near the tip) could still nudge
    // a handful of sub-pixel blends just over the 0.25 floor. Paled
    // once more (diff 16 vs 32) so every blend against black, navy,
    // white, the far-talon fill, and the field ring itself stays
    // clear of the house band with margin (checked by sweeping the
    // full 0-100% blend range, not just the two pure endpoints).
    g.strokeStyle = 'rgba(208,216,224,.45)'; g.lineWidth = 1.0;
    g.beginPath();
    g.moveTo(cx + rx0 * 0.84, dY - hgt * 0.52 + ry0);
    g.lineTo(cx + tipX, dY - hgt + ry0 * 0.5);
    g.stroke();
  }
}
g.lineWidth = 1;
var gRing = (bph || 0);
// Same paling as the tip glint above (rgb(140,180,225), s 0.38, was
// 12 deg inside the house-hue band): a field ring needs to read as
// near-white energy, not owner colour. Paled a second notch (diff 20
// vs 38) alongside the glint, for the same sub-pixel-blend margin.
g.strokeStyle = 'rgba(204,214,224,' + (0.34 * (1 - gRing)).toFixed(3) + ')';
g.lineWidth = 1.6;
g.beginPath(); g.ellipse(cx, dY - 18 - gRing * 12, 9 + gRing * 18, (9 + gRing * 18) * 0.42, 0, 0, 6.29); g.stroke();
g.lineWidth = 1;
