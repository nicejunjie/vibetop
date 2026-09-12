// Iron Frontier unit art — structures/prism
// Spliced VERBATIM into apps/games/rts/rts.html between `// @@ART structures/prism` and
// `// @@END structures/prism` (one pair per @@PART below). Edit HERE, then
//     node apps/games/rts/tools/art-split.js inject
// — or edit rts.html and `extract`; rts-split.test.js fails while they differ.
// Every free identifier (the canvas `g`, the anchor, the helpers, `col`, `sov`…)
// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.

// @@PART main — inside bakeBuilding() in rts.html
// --- RA2 Prism Tower --------------------------------------------------
// Re-read at 1:1 against the SHP rip (allied-prism-tower-anim-last.png,
// 53x101 with the magenta shadow masked, aspect 0.525). The body is
// DARK NAVY, not silver: an olive-khaki ground disc; a dark navy frustum
// drum wearing ONE big bright house panel with a recessed slot and a
// house wedge at each shoulder; a slim navy column laced by four thin
// blue struts on amber bolts; a dark house band and a rounded slate
// CAPSULE; and on top a WIDE FLAT umbrella of navy blades with bright
// silver ribs and a white X at the hub. The old build was a pale silver
// lampshade with three claws on the ground and a narrow upright white
// fan. Six idle phases (`bph`): the crown turns a ninth of a turn, the
// capsule charge breathes, the slot lights and the strut bolts blink.
var anP = (bph || 0) * 6.283, anS = Math.sin(anP);
var ph6 = Math.round((bph || 0) * 6) % 6;
var PZ_NAV = '#2d3446', PZ_NAVL = '#434c68', PZ_NAVD = '#191d26';
var PZ_SIL = '#c2c7d2', PZ_SILL = '#f2f4fa', PZ_SILD = '#767c8a';
var PZ_STR = '#5d6a90', PZ_BLT = '#e08a1c';

// ---- olive-khaki ground disc -----------------------------------------
plot(g, cx, baseY, fw * 2, fh * 2);
g.fillStyle = 'rgba(30,34,26,.62)'; g.fill();
g.fillStyle = 'rgba(0,0,0,.34)';
g.beginPath(); g.ellipse(cx + 2, baseY + 5, 29, 12.6, 0, 0, 6.29); g.fill();
g.fillStyle = '#4f4c33';
g.beginPath(); g.ellipse(cx, baseY + 3, 29, 12.6, 0, 0, 6.29); g.fill();
outline(g, '#26241a');
g.fillStyle = '#6e6a48';
g.beginPath(); g.ellipse(cx, baseY + 1, 27, 11.4, 0, 0, 6.29); g.fill();
outline(g, '#3a3826');
g.fillStyle = 'rgba(214,214,180,.20)';
g.beginPath(); g.ellipse(cx, baseY - 0.6, 22, 9.0, 0, 0, 6.29); g.fill();

// ---- dark navy frustum drum ------------------------------------------
var dB = baseY - 1, dT = baseY - 22;
g.fillStyle = PZ_NAV;
g.beginPath();
g.moveTo(cx - 23, dB); g.lineTo(cx - 16, dT); g.lineTo(cx + 16, dT); g.lineTo(cx + 23, dB);
g.closePath(); g.fill(); outline(g, PZ_NAVD);
g.fillStyle = PZ_NAVL;                                  // lit left cheek
g.beginPath();
g.moveTo(cx - 23, dB); g.lineTo(cx - 16, dT); g.lineTo(cx - 9, dT); g.lineTo(cx - 13.5, dB);
g.closePath(); g.fill();
g.fillStyle = 'rgba(0,0,0,.32)';                        // shaded right cheek
g.beginPath();
g.moveTo(cx + 12, dB); g.lineTo(cx + 8.5, dT); g.lineTo(cx + 16, dT); g.lineTo(cx + 23, dB);
g.closePath(); g.fill();
g.fillStyle = PZ_SILD;                                  // silver skirt band at the foot
g.beginPath();
g.moveTo(cx - 23, dB); g.lineTo(cx + 23, dB);
g.lineTo(cx + 21.6, dB - 3.2); g.lineTo(cx - 21.6, dB - 3.2);
g.closePath(); g.fill(); outline(g, PZ_NAVD);
// a house wedge braced against each shoulder, standing ON the disc
var pzWedge = function (sgn, lit) {
  g.fillStyle = lit ? col : shade(col, 0.72);
  g.beginPath();
  g.moveTo(cx + sgn * 21.4, dB + 1); g.lineTo(cx + sgn * 17.0, dT + 2);
  g.lineTo(cx + sgn * 11.4, dT + 2); g.lineTo(cx + sgn * 14.6, dB + 1);
  g.closePath(); g.fill(); outline(g, shade(col, 0.34));
  g.fillStyle = shade(col, lit ? 1.30 : 0.92);
  g.beginPath();
  g.moveTo(cx + sgn * 20.6, dB); g.lineTo(cx + sgn * 16.4, dT + 4);
  g.lineTo(cx + sgn * 14.6, dT + 4); g.lineTo(cx + sgn * 18.6, dB);
  g.closePath(); g.fill();
};
pzWedge(-1, true); pzWedge(1, false);
// the big house panel with its recessed slot, dead front. Value, not
// hue: raw `col` here was the exact literal fill the Spy's coat body
// uses (unit-identity-reference.md §1.5's "house-colour TORSO BLOCK"),
// and on the cameo metric — position-aligned, luminance-dominant — two
// dead-front house blocks at the SAME value read as the same picture
// (`Prism Tower | Spy` 63.6, under RA2's bar). Brightening the panel
// keeps the same house fraction (~15%, Rule S1's measured clause is an
// AREA, not a shade) and adds no new remap surface; it only moves the
// panel's value off the Spy's (measured: 63.6 -> 63.8).
g.fillStyle = shade(col, 1.34);
g.fillRect(cx - 9.6, dT + 2, 19.2, 19); outline(g, shade(col, 0.34));
g.fillStyle = shade(col, 1.46); g.fillRect(cx - 9.6, dT + 2, 19.2, 2.4);
g.fillStyle = shade(col, 0.55); g.fillRect(cx - 9.6, dB - 4.0, 19.2, 3.0);
g.fillStyle = '#161c28';                                // recessed slot
g.fillRect(cx - 4.2, dT + 8, 8.4, 9.6); outline(g, shade(col, 0.40));
g.fillStyle = 'rgba(150,200,245,' + (0.10 + (ph6 % 3 === 0 ? 0.22 : 0)) + ')';
g.fillRect(cx - 3.2, dT + 9, 6.4, 7.6);
// drum lip
g.fillStyle = PZ_SILD;
g.beginPath(); g.ellipse(cx, dT, 16, 6.2, 0, 0, 6.29); g.fill();
outline(g, PZ_NAVD);
g.fillStyle = PZ_NAVL;
g.beginPath(); g.ellipse(cx, dT - 1, 12.4, 4.6, 0, 0, 6.29); g.fill();

// ---- slim navy column, four thin struts on amber bolts ----------------
var colT = baseY - 62;
cylinder(g, cx, dT + 1, 4.8, dT + 1 - colT, PZ_NAV, PZ_NAVL, PZ_NAVD);
g.fillStyle = 'rgba(228,234,250,.22)'; g.fillRect(cx - 4.8, colT, 1.8, dT + 1 - colT);
for (var pzS = 0; pzS < 4; pzS++) {
  var sxo = (pzS < 2 ? -1 : 1) * (pzS % 2 ? 8.2 : 13.4);
  // 2.2 -> 1.9 on the DARK BACKING only (the lit PZ_STR stroke below
  // keeps its full 1.1). `rowProfile` counts INK per row, not span, so
  // the four struts' backing haloes were 4 x 2.2 = 8.8 px of ink laid
  // across a column that is only 10 px wide, and it is that ink -- not
  // the fan's spread -- that set the waist read. Ablating the struts
  // alone flattens rows 55-76 to a constant 10 px, which is the tower's
  // real waist. RA2's own [GAPRIS] laces its column with THIN 1-px
  // lines (docs/ra2-ref/sprites/prism-tower.png, 57x104, keyed exact
  // and threshold-insensitive), and its narrowest scanned row is 0.211
  // Sw against our 0.261 -- ours was the fatter of the two. Thinning
  // moves toward the rip. 1.9 is the SMALLEST move that closes it --
  // 2.0 still reads 18 px and fails, 1.9/1.8/1.6/1.4 all read 16 --
  // and it is taken over 1.8 because prism's house-fraction clause
  // sits at 20.80% against its own 21% ceiling (it was already 20.76%
  // before this change; thinning a DARK stroke raises the house share
  // of a shrinking opaque total). 0.2pp of margin on that row is
  // pre-existing and worth knowing about before anything else here
  // trades ink for silhouette.
  g.strokeStyle = 'rgba(20,22,28,.65)'; g.lineWidth = 1.9;
  g.beginPath(); g.moveTo(cx + sxo, dT - 1); g.lineTo(cx + sxo * 0.26, colT + 5); g.stroke();
  g.strokeStyle = PZ_STR; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(cx + sxo, dT - 2); g.lineTo(cx + sxo * 0.26, colT + 4); g.stroke();
  g.fillStyle = (ph6 % 4 === pzS) ? '#ffe8ac' : PZ_BLT;
  g.beginPath(); g.arc(cx + sxo * 0.26, colT + 4, 1.8, 0, 6.29); g.fill();
}

// ---- dark house band, then the rounded slate capsule -------------------
g.fillStyle = shade(col, 0.68);
g.fillRect(cx - 8.0, colT, 16, 4.6); outline(g, shade(col, 0.32));
g.fillStyle = shade(col, 0.98); g.fillRect(cx - 8.0, colT, 16, 1.8);
var capY = baseY - 72;
g.fillStyle = '#333c4d';
g.beginPath(); g.ellipse(cx, capY, 12.6, 9.2, 0, 0, 6.29); g.fill();
outline(g, PZ_NAVD);
g.save();
g.beginPath(); g.ellipse(cx, capY, 12.6, 9.2, 0, 0, 6.29); g.clip();
g.fillStyle = '#161c27';
g.beginPath(); g.ellipse(cx + 4.6, capY + 5.4, 11.4, 8.4, 0, 0, 6.29); g.fill();
g.fillStyle = '#79828f';
g.beginPath(); g.ellipse(cx - 2.4, capY - 5.2, 8.4, 3.4, 0, 0, 6.29); g.fill();
g.fillStyle = 'rgba(150,220,255,' + (0.10 + 0.18 * (0.5 + 0.5 * anS)) + ')';
g.beginPath(); g.ellipse(cx, capY, 9.0, 6.4, 0, 0, 6.29); g.fill();
g.restore();
cylinder(g, cx, capY - 6, 3.4, 6, PZ_NAV, PZ_NAVL, PZ_NAVD);

// ---- the crown: a WIDE FLAT umbrella of blades -------------------------
// The prism beam is drawn from 86px above the footprint centre, so the
// hub sits there and the lance leaves the blades, not the column.
var pzHub = baseY - 86;
g.fillStyle = '#171d29';
g.beginPath(); g.ellipse(cx, pzHub + 3, 10, 5, 0, 0, 6.29); g.fill();
outline(g, PZ_NAVD);
var pzR = 33, pzN = 9, pzRot = (bph || 0) * 6.2832 / pzN;
var pzBlade = function (a) {
  var ca = Math.cos(a), sa3 = Math.sin(a);
  var tx4 = cx + ca * pzR, ty4 = pzHub + sa3 * pzR * 0.44 - 2.6;
  var nx3 = -sa3 * 6.6, ny3 = ca * 6.6 * 0.44;
  g.beginPath();
  g.moveTo(cx + nx3 * 0.55, pzHub + ny3 * 0.55);
  g.lineTo(cx - nx3 * 0.55, pzHub - ny3 * 0.55);
  g.lineTo(tx4 - nx3, ty4 - ny3);
  g.lineTo(tx4 + nx3, ty4 + ny3);
  g.closePath();
  g.fillStyle = sa3 < 0 ? PZ_NAVD : PZ_NAV; g.fill(); outline(g, '#0f131b');
  g.strokeStyle = sa3 < 0 ? PZ_SILD : PZ_SIL; g.lineWidth = 1.4;   // silver rib
  g.beginPath(); g.moveTo(cx, pzHub - 0.6); g.lineTo(tx4, ty4 - 0.6); g.stroke();
  g.lineWidth = 1;
};
var pzAng = [];
for (var pzI = 0; pzI < pzN; pzI++) pzAng.push(pzI / pzN * 6.2832 + pzRot);
pzAng.sort(function (a2, b2) { return Math.sin(a2) - Math.sin(b2); });
for (var pzJ = 0; pzJ < pzAng.length; pzJ++) pzBlade(pzAng[pzJ]);
g.strokeStyle = '#eef2fa'; g.lineWidth = 2.2; g.lineCap = 'round';
g.beginPath();                                          // the white X at the hub
g.moveTo(cx - 13, pzHub - 8.4); g.lineTo(cx + 13, pzHub - 1.4);
g.moveTo(cx + 13, pzHub - 8.4); g.lineTo(cx - 13, pzHub - 1.4);
g.stroke(); g.lineWidth = 1;
g.fillStyle = '#9aa2b0';
g.beginPath(); g.ellipse(cx, pzHub - 4.6, 5.8, 3.0, 0, 0, 6.29); g.fill();
outline(g, PZ_NAVD);
g.fillStyle = 'rgba(226,244,255,' + (0.06 + 0.07 * (0.5 + 0.5 * anS)) + ')';
g.beginPath(); g.ellipse(cx, pzHub - 9, 16, 11, 0, 0, 6.29); g.fill();
