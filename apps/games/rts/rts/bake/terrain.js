// Iron Frontier — bake/terrain.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.





// --------------------------------------------------------------------- //
//  Sprite baking — drawn once into offscreen canvases, then the main loop
//  only ever calls drawImage. Baked at DPR so they stay crisp.
// --------------------------------------------------------------------- //
var SPR = {};

function mkCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * DPR));
  c.height = Math.max(1, Math.ceil(h * DPR));
  var g = c.getContext('2d');
  g.scale(DPR, DPR);
  return { c: c, g: g, w: w, h: h };
}

// RA2's vehicle voxels are painted metal, not clean vector fills. The
// geometry already supplies the large planes; this deterministic finish
// adds the small value changes that make a plane feel machined at 1:1:
// a restrained grain inside the face, a light-catching upper edge and a
// darker lower edge. It runs on the scratch bake before the single outer
// silhouette is stamped, so it never creates the old LEGO outlines.
function metalFinish(canvas, seed) {
  var cg = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  var im = cg.getImageData(0, 0, W, H), d = im.data;
  // Read from an untouched copy. The finish is a material pass, so a mark
  // must not change the contrast test for the pixel next to it; otherwise a
  // long run of pixels slowly turns into a soft airbrushed stripe.
  var base = new Uint8ClampedArray(d);
  function opaque(x, y) {
    return x >= 0 && y >= 0 && x < W && y < H && base[(y * W + x) * 4 + 3] > 96;
  }
  function clamp(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }
  function lum(x, y) {
    var j = (y * W + x) * 4;
    return base[j] * 0.24 + base[j + 1] * 0.67 + base[j + 2] * 0.09;
  }
  for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
    var at = (y * W + x) * 4, al = d[at + 3];
    if (al < 96) continue;
    var shift = 0;
    // The projection's upper breaks catch a little light; the underside
    // loses it. Keep this narrow so the face remains a single plate.
    if (!opaque(x, y - 1)) shift += 15;
    if (!opaque(x, y + 1)) shift -= 12;
    // Sharpen an existing plane break. Voxel metal gets its depth from
    // adjacent value steps; the old pass left those steps so smooth that a
    // turret and its hull looked like one plastic gradient. Only a strong
    // local change is touched, which keeps the silhouette and owner panels
    // stable while giving fabricated plates a crisp weld boundary.
    var here = lum(x, y), best = 0, delta, nx, ny;
    for (var ni = 0; ni < 4; ni++) {
      nx = x + (ni === 0 ? 1 : ni === 1 ? -1 : 0);
      ny = y + (ni === 2 ? 1 : ni === 3 ? -1 : 0);
      if (!opaque(nx, ny)) continue;
      delta = here - lum(nx, ny);
      if (Math.abs(delta) > Math.abs(best)) best = delta;
    }
    if (Math.abs(best) > 24) shift += best > 0 ? 7 : -7;
    // Directional brushed grain: short vertical strokes and occasional
    // neutral weld pin highlights. Saturated owner paint is left clean so
    // the faction colour remains a readable marking rather than noise.
    var mx = base[at], mn = Math.min(mx, base[at + 1], base[at + 2]);
    var sat = mx ? (Math.max(mx, base[at + 1], base[at + 2]) - mn) / Math.max(mx, base[at + 1], base[at + 2]) : 0;
    var h = (x * 17 + y * 31 + seed * 13) % 37;
    if (sat < 0.48) {
      // Keep the neutral planes on a compact voxel-like value ramp. A
      // continuous vector gradient is what makes the same hull look like a
      // soft toy at map scale; an eight-step luminance ramp preserves the
      // lighting while restoring the hard pixel bands of the source art.
      var qv = Math.round(here / 8) * 8;
      shift += Math.max(-4, Math.min(4, qv - here));
      if ((x + seed * 3) % 19 === 0 && (y + seed) % 3 !== 0) shift -= 5;
      if (h === 0) shift -= 7;
      else if (h === 1 || h === 2) shift += 5;
      if ((x * 31 + y * 17 + seed * 7) % 113 === 0) shift += 10;
    }
    if (!shift) continue;
    d[at] = clamp(d[at] + shift);
    d[at + 1] = clamp(d[at + 1] + shift);
    d[at + 2] = clamp(d[at + 2] + shift);
  }
  cg.putImageData(im, 0, 0);
}

// Must accept its OWN output: sprites shade an already-shaded colour (a
// turret on a hull, a roof box on a roof). Parsing only '#rrggbb' made
// parseInt('gb(88,...') return NaN, canvas rejected the colour, and the
// part silently kept whatever fillStyle was set last — black turrets.
// VLIFT: a value multiplier the VEHICLE bake sets while it draws (see
// bakeVehicle.frame) and everything else leaves at 1. 2026-09-10: a pixel
// census of RA2's own eight-bearing rips gives 13-32% LIGHT pixels (v >
// 0.75) and 11-21% dark (v < 0.25) per vehicle; ours were 3-9% light and
// 27-47% dark. RA2 reads as pale bodies with black guns and dark tracks;
// ours read as dark bodies with dark guns, and the user could not tell the
// tanks apart. The hull colours are fine; the FACE SHADING was pulling every
// one of them down. Buildings (which the user called good) are untouched.
var VLIFT = 1;

// NO_RIM: set with VLIFT while a SMOOTH vehicle bakes. Every isoBox/prism/
// puck face normally carries its own 0.7 px outline and a lit top rim, so a
// unit assembled from twenty parts shows twenty outlined boxes -- the user:
// "your tanks look like lego, many rectangular blocks visibly put together,
// a lot of lines going across". RA2's voxels are ONE surface, outlined only
// at the silhouette. With NO_RIM the parts draw as plain shaded faces onto
// a scratch canvas and bakeVehicle.frame adds one dark outline round the
// whole silhouette afterwards.
var NO_RIM = false;

function shade(c, f) {
  var r, g, b;
  if (c.charAt(0) === '#') {
    var n = parseInt(c.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    var m = c.match(/[\d.]+/g);
    r = +m[0]; g = +m[1]; b = +m[2];
  }
  // The lift applies to LOW-SATURATION colours only (hull greys, khakis,
  // olives): a saturated owner panel or accent lifted 1.25x clips toward
  // white and stops being house-hued, which the APC's deck-cavity check
  // caught. (max-min)/max < 0.45 separates every hull colour from every
  // owner colour in the table.
  if (VLIFT !== 1) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 0 && (mx - mn) / mx < 0.45) f *= VLIFT;
  }
  return 'rgb(' + Math.min(255, Math.max(0, Math.round(r * f))) + ',' +
                  Math.min(255, Math.max(0, Math.round(g * f))) + ',' +
                  Math.min(255, Math.max(0, Math.round(b * f))) + ')';
}

// ---- THE INFANTRY VALUE LADDER ------------------------------------- //
// A gamma applied to a FINISHED infantry sprite, and the inverse applied to
// the house colour before it is drawn, so a trooper can be moved up or down
// the field's value range as ONE object while his owner block stays exactly
// where it was.
//
// Why it exists. `tools/legibility.js` at its uncropped window put ELEVEN
// infantry pairs under the friend-vs-foe floor: eight kinds inside 11
// luminance points of each other at 14-22 px wide. The measured lever there
// is plate VALUE -- pushing owner-colour AREA was tried and made map
// legibility worse -- and the per-kind palettes could not deliver it:
// measured, moving `TROOP.ivan.coat` by 29 L moved the man by 1.8 (his coat
// body is the shared JACKET, not his trousers) and moving `TROOP.spy.coat`
// by 60 L moved him by 16. The trousers are 6-27% of a trooper; a value
// ladder needs the whole figure, and the whole figure is a hundred hard-coded
// shades spread over fourteen branches.
//
// Gamma rather than a multiply, for two reasons that both matter at this
// size: it maps 0->0 and 255->255, so nothing clips into a flat white or a
// flat black however far a kind is moved, and it is invertible EXACTLY, so
// the house block is recoverable. Pre-dividing `col` by the same curve and
// then applying it is an identity on the owner's colour, which is the one
// thing on a trooper that must not move: telling your man from theirs is the
// floor every other distance is measured against.
// ONE gamma per CHANNEL, not one for the sprite, because the roster needs
// two axes and this buys the second one free. The distance the tool measures
// is a luminance term plus two chroma-opponent terms at 0.35 weight each, so
// a hue step of 40 in (r-b) is worth about as much as 30 points of value --
// and with fourteen men to keep apart in one value range, several of them
// have to share a rung and separate on tone instead. Equal channels are a
// pure value move; unequal ones tilt the whole figure warm or cool without
// touching where it sits on the ladder. Off-axis drab tones only: the field
// rule is that the OWNER's colour is the only saturated thing on a sprite,
// and the pre-divide above keeps that block exactly where it was.
var VLUT = {};

function gam3(gm) { return typeof gm === 'number' ? [gm, gm, gm] : gm; }

function valueLut(g1) {
  var k = g1.toFixed(4);
  if (VLUT[k]) return VLUT[k];
  var t = new Uint8Array(256);
  for (var i = 0; i < 256; i++) t[i] = Math.round(255 * Math.pow(i / 255, g1));
  return (VLUT[k] = t);
}

function rgbOf(c) {
  if (c.charAt(0) === '#') {
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var m = c.match(/[\d.]+/g);
  return [+m[0], +m[1], +m[2]];
}

// The colour that BECOMES `c` after valuePass(gm) has run over it.
function valuePre(c, gm) {
  var q = rgbOf(c), G = gam3(gm), o = [];
  for (var i = 0; i < 3; i++) o[i] = Math.round(255 * Math.pow(q[i] / 255, 1 / G[i]));
  return 'rgb(' + o[0] + ',' + o[1] + ',' + o[2] + ')';
}

function valuePass(s, gm) {
  var G = gam3(gm);
  var id = s.g.getImageData(0, 0, s.c.width, s.c.height), d = id.data;
  var tr = valueLut(G[0]), tg = valueLut(G[1]), tb = valueLut(G[2]);
  for (var i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = tr[d[i]]; d[i + 1] = tg[d[i + 1]]; d[i + 2] = tb[d[i + 2]];
  }
  s.g.putImageData(id, 0, 0);
}

// Blend two colours. RA2 keeps house colour as a TINT on grey machinery
// rather than painting the machine; `mixc(col, STEEL, 0.5)` is that tint.
function mixc(a, b, t) {
  function rgb(c) {
    if (c.charAt(0) === '#') {
      var n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
  }
  var x = rgb(a), y = rgb(b);
  return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
                  Math.round(x[1] + (y[1] - x[1]) * t) + ',' +
                  Math.round(x[2] + (y[2] - x[2]) * t) + ')';
}

function diamond(g, cx, cy, w, h) {
  g.beginPath();
  g.moveTo(cx, cy - h / 2); g.lineTo(cx + w / 2, cy);
  g.lineTo(cx, cy + h / 2); g.lineTo(cx - w / 2, cy);
  g.closePath();
}

// --- terrain -----------------------------------------------------------
// RA2's ground is not a grid of diamonds: it is one continuous painted
// surface with grass, dirt patches and worn tracks that run across many
// tiles. Drawing an independently-noised diamond per tile reproduces graph
// paper no matter how good the noise is, because every tile edge is a
// discontinuity. So the ground is baked ONCE as a seamless screen-space
// sheet and then CUT into tiles: tile (x,y) sits at screen (x-y)*TW/2,
// (x+y)*TH/2, so a sheet 8*TW/2 wide and 8*TH/2 tall repeats exactly when
// indexed by ((x-y)&7, (x+y)&7) — 64 tiles that reassemble into the sheet
// with no seam at all. The visible repeat is 8 tiles, and a hash-picked
// decal overlay on one tile in eight breaks even that.
var TPAD = 6;                                  // tiles overlap 3px so no antialiased hairline can open a grid

var TCW = TW + TPAD, TCH = TH + TPAD;

var SHW = TW * 4, SHH = TH * 4;                // seamless sheet: 256 x 128

// Same shape, but WITHOUT beginPath: for building one path out of many cells
// and filling once. `diamond` resets the path on every call, so a loop that
// called it N times and filled afterwards painted only the LAST cell — which
// is exactly how the buildable-area grid disappeared.
function diamondAdd(g, cx, cy, w, h) {
  g.moveTo(cx, cy - h / 2); g.lineTo(cx + w / 2, cy);
  g.lineTo(cx, cy + h / 2); g.lineTo(cx - w / 2, cy);
  g.closePath();
}

function diamondT(g, cx, cy) { diamond(g, cx, cy, TCW, TCH); }

// Run `fn(ox, oy)` for the 9 wrap offsets so anything drawn near a sheet
// edge reappears on the far side and the sheet tiles seamlessly.
function wrap9(fn) {
  for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) fn(dx * SHW, dy * SHH);
}

function sheetBlob(g, x, y, rx, ry, rot) {
  wrap9(function (ox, oy) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot || 0, 0, 6.29); g.fill(); });
}

// An irregular splotch: one core ellipse plus lobes, so the outline is not
// an obvious oval. Used for dirt patches and snow drifts.
function sheetSplotch(g, x, y, r, lobes) {
  sheetBlob(g, x, y, r, r * 0.5);
  for (var i = 0; i < lobes; i++) {
    var a = brnd() * 6.29, d = r * (0.5 + brnd() * 0.7);
    sheetBlob(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, r * (0.35 + brnd() * 0.4), r * (0.2 + brnd() * 0.2));
  }
}

// A meandering worn track / crack, drawn wrapped.
function sheetStreak(g, x, y, len, wid, wob) {
  var pts = [], px2 = x, py2 = y, ang = brnd() * 6.29;
  for (var i = 0; i < len; i++) {
    pts.push([px2, py2]);
    ang += (brnd() - 0.5) * wob;
    px2 += Math.cos(ang) * 11; py2 += Math.sin(ang) * 5.5;
  }
  g.lineWidth = wid; g.lineCap = 'round'; g.lineJoin = 'round';
  wrap9(function (ox, oy) {
    g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (var k = 1; k < pts.length; k++) g.lineTo(pts[k][0] + ox, pts[k][1] + oy);
    g.stroke();
  });
}

// The temperate sheet: mid grass with big tonal drift, bare-earth patches,
// worn tracks, clumps, grain and pebbles. The snow sheet swaps the palette
// for blue-white with grey drifts and a few exposed dark-earth scars.
function bakeGroundSheet(kind, seed) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(SHW, SHH), g = s.g;
  srand(seed);
  var P = {
    grass: { base: '#5f7038', dark: '#4a5a2a', light: '#78873f', dirt: '#7b6b46', dirt2: '#6a5b3b',
             worn: '#8d8452', peb: '#9a9578', pebD: '#3d4423', grain: 0.30 },
    snow:  { base: '#dbe8e8', dark: '#c2d3d9', light: '#f6fbfb', dirt: '#aab3ad', dirt2: '#95a09b',
             worn: '#f2f8f8', peb: '#ffffff', pebD: '#9aa5a9', grain: 0.26 },
    // urban: poured concrete slabs. Cool mid grey, low-contrast drift, and
    // the dirt tones are oil and soot rather than earth.
    pave:  { base: '#7b7d7e', dark: '#666a6c', light: '#93989a', dirt: '#575652', dirt2: '#4a4a48',
             worn: '#a6abac', peb: '#bcc0c1', pebD: '#4b4e50', grain: 0.24 },
    // The three ALT surfaces: RA2 gives every theatre a second ground the
    // first one blends into through the LAT sets -- Sand and Grass Rough on
    // temperate, scoured earth on snow, a dirt lot on urban.
    sand:  { base: '#93825a', dark: '#7e6e49', light: '#a8956a', dirt: '#6f5f3e', dirt2: '#615336',
             worn: '#b6a279', peb: '#c8b78f', pebD: '#5d4c31', grain: 0.32 },
    scour: { base: '#8d8478', dark: '#766d5e', light: '#a69c8c', dirt: '#6b6354', dirt2: '#5c5548',
             worn: '#b8ae9c', peb: '#cbc2ae', pebD: '#524b3f', grain: 0.32 },
    grit:  { base: '#6f6656', dark: '#5a523f', light: '#877c66', dirt: '#4d4738', dirt2: '#3f3a2e',
             worn: '#988c74', peb: '#b0a68c', pebD: '#3b362a', grain: 0.32 }
  }[kind];
  g.fillStyle = P.base; g.fillRect(0, 0, SHW, SHH);
  // The ALT grounds skip the field-scale drift and the patches. They are
  // laid in small pockets and their material is ALSO what the LAT edge
  // tiles are cut from, so any tonal drift across the sheet would show up
  // as a mismatch where a band meets the patch it belongs to.
  var flatKind = kind === 'sand' || kind === 'scour' || kind === 'grit';
  var i;
  if (flatKind) {
    g.globalAlpha = 0.07;
    for (i = 0; i < 12; i++) { g.fillStyle = i & 1 ? P.dark : P.light; sheetBlob(g, rnd() * SHW, rnd() * SHH, 16 + rnd() * 26, 8 + rnd() * 13); }
    g.globalAlpha = 1;
  } else if (kind === 'snow') {
    g.globalAlpha = 0.11;                        // wind drifts: long, shallow, low contrast
    for (i = 0; i < 26; i++) {
      g.fillStyle = rnd() < 0.5 ? P.dark : P.light;
      var dw = 30 + rnd() * 60;
      sheetBlob(g, rnd() * SHW, rnd() * SHH, dw, 4 + rnd() * 7, (rnd() - 0.5) * 0.5);
    }
    g.globalAlpha = 0.13; g.strokeStyle = P.dark; // drift shadow lines
    for (i = 0; i < 7; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 8 + rint(5), 2 + rnd() * 2.5, 0.5);
    g.globalAlpha = 0.14; g.strokeStyle = P.light;
    for (i = 0; i < 7; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 8 + rint(5), 2.5 + rnd() * 3, 0.5);
  } else {
    g.globalAlpha = kind === 'pave' ? 0.10 : 0.20;                // concrete drifts are subtle
    for (i = 0; i < 16; i++) {
      g.fillStyle = rnd() < 0.5 ? P.dark : P.light;
      sheetBlob(g, rnd() * SHW, rnd() * SHH, 24 + rnd() * 56, 12 + rnd() * 28);
    }
  }
  // 2. bare earth / drift patches, irregular, crossing several tiles
  for (i = 0; flatKind ? 0 : i < 7; i++) {
    g.globalAlpha = (kind === 'snow' ? 0.10 : kind === 'pave' ? 0.11 : 0.30) + rnd() * 0.14;
    g.fillStyle = rnd() < 0.55 ? P.dirt : P.dirt2;
    sheetSplotch(g, rnd() * SHW, rnd() * SHH, (kind === 'snow' ? 8 : 13) + rnd() * 15, 5);
  }
  if (kind === 'sand' || kind === 'grit') {       // wind ripples across the bare ground
    g.globalAlpha = 0.13; g.strokeStyle = P.worn;
    for (i = 0; i < 10; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 6 + rint(4), 2 + rnd() * 2, 0.35);
    g.globalAlpha = 0.16; g.strokeStyle = P.dirt2;
    for (i = 0; i < 8; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 6 + rint(4), 1.5 + rnd() * 2, 0.35);
  }
  if (kind === 'snow') {                          // a couple of exposed earth scars
    g.globalAlpha = 0.30;
    for (i = 0; i < 4; i++) { g.fillStyle = i & 1 ? '#6d6d5c' : '#7d7c68'; sheetSplotch(g, rnd() * SHW, rnd() * SHH, 6 + rnd() * 8, 4); }
  }
  // 3. worn tracks — pale meandering scuffs
  g.globalAlpha = kind === 'snow' ? 0.10 : 0.16; g.strokeStyle = P.worn;
  for (i = 0; i < 5; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 7 + rint(5), 4 + rnd() * 4, 1.0);
  // 4. mid clumps
  g.globalAlpha = kind === 'snow' ? 0.09 : 0.15;
  for (i = 0; i < 60; i++) {
    g.fillStyle = rnd() < 0.5 ? P.dark : P.light;
    sheetBlob(g, rnd() * SHW, rnd() * SHH, 5 + rnd() * 11, 3 + rnd() * 5);
  }
  // 5. fine grain
  g.globalAlpha = P.grain;
  for (i = 0; i < (kind === 'snow' ? 4200 : 2600); i++) {
    g.fillStyle = rnd() < 0.5 ? P.dark : P.light;
    var gx2 = rnd() * SHW, gy2 = rnd() * SHH, gs = 0.6 + rnd() * 1.1;
    g.beginPath(); g.ellipse(gx2, gy2, gs, gs * 0.6, 0, 0, 6.29); g.fill();
  }
  // 6. pebbles / crusted snow, with a lit top and a shadow
  g.globalAlpha = 0.85;
  for (i = 0; i < 110; i++) {
    var bx2 = rnd() * SHW, by2 = rnd() * SHH, br = 0.9 + rnd() * 1.5;
    g.fillStyle = P.pebD; sheetBlob(g, bx2 + 0.7, by2 + 0.5, br, br * 0.55);
    g.fillStyle = P.peb; sheetBlob(g, bx2, by2 - 0.2, br * 0.85, br * 0.45);
  }
  // 7. urban only: the slab grid. The joints run on the two isometric
  //    diagonals so they line up with the tile lattice, and each line spans
  //    the full sheet at slope +/-0.5 — 256 across is exactly 128 down, so
  //    the pattern wraps seamlessly.
  if (kind === 'pave') {
    g.lineWidth = 1;
    for (var jf = 0; jf < 2; jf++) {
      var sl = jf ? -0.5 : 0.5;
      for (var jc = 0; jc < SHH; jc += 16) {
        for (var jk = -1; jk <= 1; jk++) {
          g.globalAlpha = 0.46; g.strokeStyle = '#494c4e'; g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(0, jc + jk * SHH); g.lineTo(SHW, jc + jk * SHH + sl * SHW); g.stroke();
          g.globalAlpha = 0.26; g.strokeStyle = '#b1b6b8'; g.lineWidth = 1;   // the lit lip of the next slab
          g.beginPath(); g.moveTo(0, jc + jk * SHH + 1); g.lineTo(SHW, jc + jk * SHH + 1 + sl * SHW); g.stroke();
        }
      }
    }
    g.globalAlpha = 0.20; g.fillStyle = '#26262a';                   // oil stains
    for (i = 0; i < 7; i++) sheetSplotch(g, rnd() * SHW, rnd() * SHH, 3 + rnd() * 5, 4);
    g.globalAlpha = 0.5;                                             // rubble and broken kerb chips
    for (i = 0; i < 120; i++) {
      var rx2 = rnd() * SHW, ry2 = rnd() * SHH, rr = 0.9 + rnd() * 1.8;
      g.fillStyle = 'rgba(24,24,26,.5)'; sheetBlob(g, rx2 + 0.7, ry2 + 0.5, rr * 1.1, rr * 0.5);
      g.fillStyle = rnd() < 0.5 ? '#9ea3a5' : '#7f7a72'; sheetBlob(g, rx2, ry2 - 0.3, rr * 0.9, rr * 0.45);
    }
    g.globalAlpha = 0.22; g.strokeStyle = '#3f4244'; g.lineWidth = 0.9;   // hairline cracks
    for (i = 0; i < 14; i++) sheetStreak(g, rnd() * SHW, rnd() * SHH, 4 + rint(4), 3 + rnd() * 4, 0.7);
  }
  g.globalAlpha = 1;
  return s;
}

// RA2 does not end a map on raw black: the theatre carries on past the
// playable border as terrain you can see but never enter. Same sheet,
// darkened and cooled, so the apron reads as "out there" rather than as a
// second, brighter field.
function bakeApronSheet(kind, seed) {
  var src = bakeGroundSheet(kind, seed), s = mkCanvas(SHW, SHH), g = s.g;
  g.drawImage(src.c, 0, 0, SHW, SHH);
  g.globalCompositeOperation = 'saturation';                 // drain the colour out of it
  g.fillStyle = 'hsl(0,22%,50%)'; g.fillRect(0, 0, SHW, SHH);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(8,11,18,.40)'; g.fillRect(0, 0, SHW, SHH);
  return s;
}

// What the viewport is cleared to: the far end of the apron, so terrain
// fades OUT of the world instead of stopping at a black wall.
var APRON_BG = { temperate: '#141812', snow: '#161b1f', urban: '#141618' };

// Ice floes: snow.ini ships an Ice Flow set, and a frozen lake with nothing
// on it reads as flat blue paint.
function bakeFloe(v) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, i;
  bsr(7700 + v * 313);
  g.save(); diamondT(g, cx, cy); g.clip();
  var n = 2 + v, k;
  for (k = 0; k < n; k++) {
    var fx = cx + (brnd() - 0.5) * (TW - 20), fy = cy + (brnd() - 0.5) * (TH - 10);
    var rw = 5 + brnd() * 9, rh = rw * (0.42 + brnd() * 0.18), pts = [], sides = 5 + bint(3);
    for (i = 0; i < sides; i++) {
      var a = (i / sides) * 6.283 + brnd() * 0.5;
      pts.push([fx + Math.cos(a) * rw * (0.7 + brnd() * 0.5), fy + Math.sin(a) * rh * (0.7 + brnd() * 0.5)]);
    }
    function poly(dx, dy) { g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0] + dx, pts[q][1] + dy); g.closePath(); }
    g.fillStyle = 'rgba(18,44,58,.30)'; poly(1.2, 1.6); g.fill();      // the floe's own shadow in the water
    g.fillStyle = '#dceaee'; poly(0, 0); g.fill();
    g.fillStyle = '#f6fcfd'; poly(-1, -1.4); g.globalAlpha = 0.75; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(120,160,178,.55)'; g.lineWidth = 0.8;         // cracks
    for (i = 0; i < 2; i++) {
      g.beginPath(); g.moveTo(fx - rw * 0.6, fy + (brnd() - 0.5) * rh);
      g.lineTo(fx + rw * 0.6, fy + (brnd() - 0.5) * rh); g.stroke();
    }
  }
  g.restore();
  return s;
}

// Grey scree for T_ROCK: impassable broken ground, so boulders with real
// volume sit in it rather than a flat recoloured floor.
function bakeRockSheet(kind, seed, flat) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(SHW, SHH), g = s.g;
  srand(seed);
  var snowy = kind === 'snow';
  var RB = snowy ? '#8a9294' : '#5e5847', R1 = snowy ? '#6b7478' : '#494434', R2 = snowy ? '#aeb8ba' : '#78705c';
  var RG1 = snowy ? '#5a6468' : '#403b2d', RG2 = snowy ? '#ccd5d6' : '#8b8471', RBOULD = snowy ? '#8e979a' : '#7c745f';
  if (kind === 'urban') {   // demolished lot: broken concrete, not bare rock
    RB = '#6e6f6d'; R1 = '#535451'; R2 = '#8b8d8b'; RG1 = '#494a48'; RG2 = '#a6a8a6'; RBOULD = '#83837f';
  }
  g.fillStyle = RB; g.fillRect(0, 0, SHW, SHH);
  g.globalAlpha = flat ? 0.09 : 0.22;
  for (var i = 0; i < 14; i++) { g.fillStyle = rnd() < 0.5 ? R1 : R2; sheetBlob(g, rnd() * SHW, rnd() * SHH, flat ? 14 : 26 + rnd() * 40, flat ? 7 : 13 + rnd() * 20); }
  g.globalAlpha = 0.30;
  for (i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? RG1 : RG2; var q = 0.6 + rnd() * 1.2; g.beginPath(); g.ellipse(rnd() * SHW, rnd() * SHH, q, q * 0.6, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  if (snowy) {                                   // snow lying in the hollows
    g.globalAlpha = 0.30; g.fillStyle = '#eef6f7';
    for (i = 0; i < 42; i++) sheetSplotch(g, rnd() * SHW, rnd() * SHH, 3 + rnd() * 6, 3);
    g.globalAlpha = 1;
  }
  // weathered boulders: a shadow, a body, a lit crown, a moss foot
  for (i = 0; flat ? 0 : i < 34; i++) {
    var bx2 = rnd() * SHW, by2 = rnd() * SHH, r = 3.5 + rnd() * 6.5;
    g.fillStyle = 'rgba(30,26,18,.34)'; sheetBlob(g, bx2 + r * 0.4, by2 + r * 0.34, r * 1.12, r * 0.5);
    var body = shade(RBOULD, 0.66 + rnd() * 0.34);
    var pts = [], sides = 6 + rint(2);
    for (var k = 0; k < sides; k++) {
      var ang = (k / sides) * 6.283 + rnd() * 0.35, rr = r * (0.75 + rnd() * 0.4);
      pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr * 0.66 - r * 0.18]);
    }
    g.fillStyle = body;
    wrap9(function (ox, oy) {
      g.beginPath(); g.moveTo(bx2 + pts[0][0] + ox, by2 + pts[0][1] + oy);
      for (var m = 1; m < pts.length; m++) g.lineTo(bx2 + pts[m][0] + ox, by2 + pts[m][1] + oy);
      g.closePath(); g.fill();
    });
    g.fillStyle = shade(body, 1.16); sheetBlob(g, bx2 - r * 0.22, by2 - r * 0.42, r * 0.5, r * 0.24);
    g.fillStyle = snowy ? 'rgba(240,250,252,.55)' : 'rgba(74,92,44,.32)'; sheetBlob(g, bx2 - r * 0.1, by2 + r * 0.3, r * 0.8, r * 0.26);
  }
  return s;
}

// Cut a seamless sheet into the 64 tiles that reassemble it. Nine draws per
// tile so a tile straddling the sheet edge still gets the wrapped content.
function sheetTiles(sheet) {
  var out = [], u, v;
  for (u = 0; u < 8; u++) for (v = 0; v < 8; v++) {
    var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2;
    g.save(); diamondT(g, cx, cy); g.clip();
    var ox = cx - u * (TW / 2), oy = cy - v * (TH / 2);
    for (var kx = -1; kx <= 1; kx++) for (var ky = -1; ky <= 1; ky++)
      g.drawImage(sheet.c, ox + kx * SHW, oy + ky * SHH, SHW, SHH);
    g.restore();
    out[(u << 3) | v] = s;
  }
  return out;
}

// Ground decals, drawn over one tile in eight so the sheet's 8-tile period
// is broken by an uncorrelated pattern: tufts, a scuff, a pebble scatter.
function bakeDecal(kind, v) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2;
  srand(910 + v * 131 + (kind === 'snow' ? 7 : 0));
  g.save(); diamondT(g, cx, cy); g.clip();
  var snowy = kind === 'snow';
  if ((v & 3) === 0) {                                   // bare scuff
    g.globalAlpha = 0.34; g.fillStyle = snowy ? '#a8b1a8' : '#7b6b46';
    for (var i = 0; i < 4; i++) { var a = rnd() * 6.29, d = rnd() * 13; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, 4 + rnd() * 7, 2 + rnd() * 3, 0, 0, 6.29); g.fill(); }
  } else if ((v & 3) === 1) {                            // grass tufts / snow crust
    g.globalAlpha = 0.8;
    for (i = 0; i < 9; i++) {
      var tx = cx + (rnd() - 0.5) * (TW - 12), ty = cy + (rnd() - 0.5) * (TH - 8);
      g.strokeStyle = snowy ? 'rgba(255,255,255,.7)' : 'rgba(122,146,66,.65)'; g.lineWidth = 1;
      for (var k = 0; k < 3; k++) { g.beginPath(); g.moveTo(tx + k - 1, ty + 1); g.lineTo(tx + (k - 1) * 1.7, ty - 2.6 - rnd() * 1.6); g.stroke(); }
    }
  } else if ((v & 3) === 2) {                            // pebble scatter
    for (i = 0; i < 7; i++) {
      var px2 = cx + (rnd() - 0.5) * (TW - 14), py2 = cy + (rnd() - 0.5) * (TH - 8), pr = 0.9 + rnd() * 1.4;
      g.fillStyle = 'rgba(28,26,18,.32)'; g.beginPath(); g.ellipse(px2 + 0.7, py2 + 0.5, pr * 1.1, pr * 0.55, 0, 0, 6.29); g.fill();
      g.fillStyle = snowy ? '#eef5f5' : '#9a9578'; g.beginPath(); g.ellipse(px2, py2 - 0.2, pr * 0.9, pr * 0.45, 0, 0, 6.29); g.fill();
    }
  } else {                                               // dark damp blotch
    g.globalAlpha = 0.20; g.fillStyle = snowy ? '#9fb0b6' : '#3f4c22';
    g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 12, cy + (rnd() - 0.5) * 7, 10 + rnd() * 9, 5 + rnd() * 4, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1; g.restore();
  return s;
}

// Water is nearly uniform, so a 4-tile period is invisible; four phase
// sheets give the shimmer. Temperate is a deep blue-green with pale
// caustics; snow is lake ice — pale, flat, cracked.
var WSHW = TW * 2, WSHH = TH * 2;

function bakeWaterSheet(kind, phase) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(WSHW, WSHH), g = s.g;
  srand(kind === 'snow' ? 611 : 601);
  var ice = kind === 'snow';
  g.fillStyle = ice ? '#adc7d2' : '#1b4552'; g.fillRect(0, 0, WSHW, WSHH);
  function wb(x, y, rx, ry) { for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { g.beginPath(); g.ellipse(x + dx * WSHW, y + dy * WSHH, rx, ry, 0, 0, 6.29); g.fill(); } }
  g.globalAlpha = ice ? 0.13 : 0.15;
  for (var i = 0; i < 18; i++) { g.fillStyle = rnd() < 0.5 ? (ice ? '#a6bfc9' : '#17414e') : (ice ? '#d8e8ec' : '#276070'); wb(rnd() * WSHW, rnd() * WSHH, 12 + rnd() * 26, 6 + rnd() * 13); }
  g.globalAlpha = 1;
  // caustics / cracks: phase-shifted per frame so the surface lives
  srand((ice ? 700 : 640) + phase * 17);
  if (ice) {
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
    for (i = 0; i < 11; i++) {
      var cx2 = rnd() * WSHW, cy2 = rnd() * WSHH, ang = rnd() * 6.29;
      for (var dx2 = -1; dx2 <= 1; dx2++) for (var dy2 = -1; dy2 <= 1; dy2++) {
        g.beginPath(); var ax2 = cx2 + dx2 * WSHW, ay2 = cy2 + dy2 * WSHH; g.moveTo(ax2, ay2);
        var aa = ang;
        for (var k = 0; k < 4; k++) { aa += (rnd() - 0.5) * 1.2; ax2 += Math.cos(aa) * 9; ay2 += Math.sin(aa) * 4.5; g.lineTo(ax2, ay2); }
        g.stroke();
      }
      srand((ice ? 700 : 640) + phase * 17 + i);
    }
    g.globalAlpha = 0.18; g.fillStyle = '#ffffff';
    for (i = 0; i < 30; i++) wb(rnd() * WSHW, rnd() * WSHH, 2.5 + rnd() * 5, 1.2 + rnd() * 2);
    g.globalAlpha = 1;
  } else {
    for (i = 0; i < 34; i++) {
      var wx = rnd() * WSHW, wy = rnd() * WSHH, ww = 3 + rnd() * 6;
      g.strokeStyle = 'rgba(160,214,220,' + (0.07 + rnd() * 0.10) + ')'; g.lineWidth = 1;
      for (dx2 = -1; dx2 <= 1; dx2++) for (dy2 = -1; dy2 <= 1; dy2++) {
        g.beginPath(); g.moveTo(wx - ww + dx2 * WSHW, wy + dy2 * WSHH);
        g.quadraticCurveTo(wx + dx2 * WSHW, wy - 2.3 + dy2 * WSHH, wx + ww + dx2 * WSHW, wy + dy2 * WSHH); g.stroke();
      }
    }
    g.globalAlpha = 0.05; g.fillStyle = '#8fd6dd';
    for (i = 0; i < 14; i++) wb(rnd() * WSHW, rnd() * WSHH, 6 + rnd() * 11, 2.5 + rnd() * 4);
    g.globalAlpha = 1;
  }
  return s;
}

function waterTiles(sheet) {
  var out = [];
  for (var u = 0; u < 4; u++) for (var v = 0; v < 4; v++) {
    var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2;
    g.save(); diamondT(g, cx, cy); g.clip();
    var ox = cx - u * (TW / 2), oy = cy - v * (TH / 2);
    for (var kx = -1; kx <= 1; kx++) for (var ky = -1; ky <= 1; ky++) g.drawImage(sheet.c, ox + kx * WSHW, oy + ky * WSHH, WSHW, WSHH);
    g.restore();
    out[(u << 2) | v] = s;
  }
  return out;
}

// Edge geometry shared by the shore and shallow overlays. mask bits:
// 1 = -gy (up-right edge), 2 = +gx (down-right), 4 = +gy (down-left),
// 8 = -gx (up-left). Edge e runs from A to B clockwise; the inward normal
// points at the tile centre.
function tileEdge(e) {
  var cx = TCW / 2, cy = TCH / 2, R = cx + TW / 2, L = cx - TW / 2, T = cy - TH / 2, B = cy + TH / 2;
  return [[cx, T, R, cy], [R, cy, cx, B], [cx, B, L, cy], [L, cy, cx, T]][e];
}

// A ragged band hugging one edge: the boundary wobbles, so a run of shore
// tiles reads as a natural coastline instead of a ruled polygon.
function edgeBand(g, e, depth, wob, seed) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var E = tileEdge(e), x0 = E[0], y0 = E[1], x1 = E[2], y1 = E[3];
  var cx = TCW / 2, cy = TCH / 2;
  var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  var nl = Math.hypot(cx - mx, cy - my), nx = (cx - mx) / nl, ny = (cy - my) / nl;
  srand(seed);
  var N = 7, pts = [];
  for (var i = 0; i <= N; i++) {
    var t = i / N, d = depth + (rnd() - 0.5) * wob;
    pts.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
  }
  g.beginPath(); g.moveTo(x0, y0);
  for (i = 0; i <= N; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.lineTo(x1, y1); g.closePath();
}

// Shore: a sand/gravel bank on the land tile. Wet, darker sand nearest the
// water; dry paler sand and pebbles inland; the outline is ragged.
function bakeShore(kind, mask) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2;
  var snowy = kind === 'snow';
  g.save(); diamondT(g, cx, cy); g.clip();
  for (var e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    g.globalAlpha = 0.55; g.fillStyle = snowy ? '#dfeaea' : '#8f8a5e';   // dry bank, feathered
    edgeBand(g, e, 15, 11, 200 + mask * 13 + e); g.fill();
    g.globalAlpha = 1; g.fillStyle = snowy ? '#e8f0f0' : '#a99b6e';       // sand
    edgeBand(g, e, 9.5, 8, 300 + mask * 13 + e); g.fill();
    g.fillStyle = snowy ? '#d3e0e4' : '#8a7d55';                          // wet sand
    edgeBand(g, e, 5, 5, 500 + mask * 13 + e); g.fill();
    g.fillStyle = snowy ? 'rgba(150,178,190,.55)' : 'rgba(90,88,62,.5)';  // silt at the waterline
    edgeBand(g, e, 2.2, 2.6, 700 + mask * 13 + e); g.fill();
    // pebbles along the strand
    srand(900 + mask * 13 + e);
    var E = tileEdge(e), mx = (E[0] + E[2]) / 2, my = (E[1] + E[3]) / 2;
    var nl = Math.hypot(cx - mx, cy - my), nx = (cx - mx) / nl, ny = (cy - my) / nl;
    for (var i = 0; i < 7; i++) {
      var t = rnd(), d = 3 + rnd() * 8;
      var px2 = E[0] + (E[2] - E[0]) * t + nx * d, py2 = E[1] + (E[3] - E[1]) * t + ny * d, pr = 0.8 + rnd() * 1.3;
      g.fillStyle = 'rgba(40,34,22,.3)'; g.beginPath(); g.ellipse(px2 + 0.6, py2 + 0.4, pr * 1.1, pr * 0.55, 0, 0, 6.29); g.fill();
      g.fillStyle = snowy ? '#ffffff' : '#d8c99a'; g.beginPath(); g.ellipse(px2, py2 - 0.2, pr * 0.9, pr * 0.45, 0, 0, 6.29); g.fill();
    }
  }
  g.restore();
  return s;
}

// Shallow water / ice rim on the WATER side of the same boundary: RA2 pales
// the water where it meets land, which is what makes a lake read as having
// a bottom rather than being a hole cut in the map.
function bakeShallow(kind, mask) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2;
  var snowy = kind === 'snow';
  g.save(); diamondT(g, cx, cy); g.clip();
  for (var e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    g.fillStyle = snowy ? 'rgba(214,230,234,.35)' : 'rgba(74,132,134,.30)';   // shelf
    edgeBand(g, e, 15, 11, 1300 + mask * 13 + e); g.fill();
    g.fillStyle = snowy ? 'rgba(230,242,244,.45)' : 'rgba(104,164,158,.34)';  // shallows
    edgeBand(g, e, 8.5, 7, 1500 + mask * 13 + e); g.fill();
    g.fillStyle = snowy ? 'rgba(226,236,238,.6)' : 'rgba(126,124,92,.42)';    // silt, matching the bank
    edgeBand(g, e, 3.4, 3.4, 1700 + mask * 13 + e); g.fill();
  }
  g.restore();
  return s;
}

// RA2's LAT ("linked adjacent tile") sets: where two ground types meet,
// the boundary tile carries the NEIGHBOUR's material creeping over its own
// edge, so grass runs into sand and pavement into dirt instead of the two
// meeting on a hard tile diamond. 16 masks per theatre, keyed on which of
// the four neighbours is the other material. bakeScree below is the same
// idea for the rock fringe and stays as the special case it always was.
function bakeLat(altSheet, mask, seed) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, e, i;
  // The alt sheet is a seamless screen-space surface, so a fixed cut from
  // it is indistinguishable from the neighbour's own cut over a band this
  // thin -- and it costs 16 canvases per theatre instead of 1024.
  var ox = cx - ((mask * 3) & 7) * (TW / 2), oy = cy - ((mask * 5) & 7) * (TH / 2);
  function paint() {
    for (var kx = -1; kx <= 1; kx++) for (var ky = -1; ky <= 1; ky++)
      g.drawImage(altSheet.c, ox + kx * SHW, oy + ky * SHH, SHW, SHH);
  }
  for (e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    g.save(); diamondT(g, cx, cy); g.clip();
    edgeBand(g, e, 13, 13, 4300 + mask * 17 + e); g.clip();
    paint();
    g.restore();
    // Speckle beyond the band: a scatter of the alt material breaking up
    // over the base, which is what stops the transition reading as a ribbon.
    bsr(4700 + mask * 31 + e);
    var E = tileEdge(e), mx = (E[0] + E[2]) / 2, my = (E[1] + E[3]) / 2;
    var nl = Math.hypot(cx - mx, cy - my), nx = (cx - mx) / nl, ny = (cy - my) / nl;
    for (i = 0; i < 11; i++) {
      var t = brnd(), d = 10 + brnd() * 13, r = 1.4 + brnd() * 3.4 * (1 - (d - 10) / 15);
      if (r < 0.7) continue;
      g.save(); diamondT(g, cx, cy); g.clip();
      g.beginPath();
      g.ellipse(E[0] + (E[2] - E[0]) * t + nx * d, E[1] + (E[3] - E[1]) * t + ny * d, r * 1.5, r * 0.8, 0, 0, 6.29);
      g.clip(); paint(); g.restore();
    }
  }
  return s;
}

// The rock fringe is the SAME idea as the LAT sets above -- broken ground
// creeping over the edge of the grass beside it -- plus the loose stones
// that a scree slope sheds, which the ground materials do not have.
function bakeScree(kind, mask, rockSheet) {
  var s = rockSheet ? bakeLat(rockSheet, mask, 9) : mkCanvas(TCW, TCH);
  var g = s.g, cx = TCW / 2, cy = TCH / 2;
  var snowy = kind === 'snow';
  g.save(); diamondT(g, cx, cy); g.clip();
  for (var e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    bsr(2600 + mask * 17 + e);
    var E = tileEdge(e), nx = (cx - (E[0] + E[2]) / 2), ny = (cy - (E[1] + E[3]) / 2);
    var nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
    for (var i = 0; i < 13; i++) {
      var t = brnd(), d = 1 + brnd() * 15;
      var px2 = E[0] + (E[2] - E[0]) * t + nx * d, py2 = E[1] + (E[3] - E[1]) * t + ny * d;
      var r = 1 + brnd() * 2.6 * (1 - d / 18);
      if (r < 0.5) continue;
      g.fillStyle = 'rgba(24,22,14,.32)'; g.beginPath(); g.ellipse(px2 + 0.6, py2 + 0.5, r * 1.25, r * 0.55, 0, 0, 6.29); g.fill();
      g.fillStyle = shade(snowy ? '#a8b1b3' : kind === 'urban' ? '#8b8d8b' : '#7c745f', 0.8 + brnd() * 0.5);
      g.beginPath(); g.ellipse(px2, py2 - 0.2, r, r * 0.62, 0, 0, 6.29); g.fill();
    }
  }
  g.restore();
  return s;
}

var CLIFF_H = 32, CLIFF_SH = 10;

// An array whose slots bake on first read and then become plain values --
// the same self-replacing-getter trick `faceSheet` uses for unit facings,
// hoisted here because the cliff set wants it too.
function lazySheet(n, make) {
  var arr = new Array(n);
  for (var i = 0; i < n; i++) (function (k) {
    Object.defineProperty(arr, k, {
      configurable: true, enumerable: true,
      get: function () {
        var v = make(k);
        Object.defineProperty(arr, k, { configurable: true, enumerable: true, writable: true, value: v });
        return v;
      }
    });
  })(i);
  return arr;
}

// How many rock variants each cliff mask has. A cliff cell used to be ONE
// sprite per neighbour mask, so a sixteen-cell ridge was the same rock
// sixteen times over at a one-cell period -- which is most of why cliffs
// read as engineered regardless of what the face itself drew.
var CLIFF_VAR = 3;

// Four bounded vertex profiles are enough to carry a broken crest without
// turning the atlas into a per-map cache. A profile is selected from the
// absolute GRID VERTEX (in doubled coordinates, so half-cell corners stay
// integral), not from either cell that meets there. Thus both sides bake
// the exact same crest, jut vector and foot at their common endpoint.
var CLIFF_SEAM_VAR = 4;

function cliffVertexId(x2, y2) {
  var h = Math.imul(x2 ^ 0x51ed270b, 0x85ebca6b) ^ Math.imul(y2 ^ 0x68bc21eb, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
  return (h >>> 0) % CLIFF_SEAM_VAR;
}

function cliffEdgeId(ax, ay, bx, by) {
  // Canonical endpoint order: the two cells on an edge must get the same
  // interior profile even if they name its ends in opposite directions.
  if (ax > bx || (ax === bx && ay > by)) { var tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
  var h = Math.imul(ax ^ 0x7f4a7c15, 0x9e3779b1) ^ Math.imul(ay ^ 0x94d049bb, 0x85ebca77) ^
          Math.imul(bx ^ 0x2545f491, 0xc2b2ae3d) ^ Math.imul(by ^ 0x369dea0f, 0x27d4eb2f);
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 15;
  return (h >>> 0) % CLIFF_SEAM_VAR;
}

function cliffSeams(x, y, mask) {
  // Tile-centre (x,y) has visible diamond vertices at these half-cell grid
  // coordinates: east (+.5,-.5), front (+.5,+.5), west (-.5,+.5).
  // Ignore vertices a mask does not draw so they cannot multiply cache keys.
  var ex = x * 2 + 1, ey = y * 2 - 1, sx2 = x * 2 + 1, sy2 = y * 2 + 1;
  var wx = x * 2 - 1, wy = y * 2 + 1;
  var e = mask & 1 ? cliffVertexId(ex, ey) : 0;
  var s = mask & 3 ? cliffVertexId(sx2, sy2) : 0;
  var w = mask & 2 ? cliffVertexId(wx, wy) : 0;
  var er = mask & 1 ? cliffEdgeId(ex, ey, sx2, sy2) : 0;
  var wr = mask & 2 ? cliffEdgeId(wx, wy, sx2, sy2) : 0;
  return { east: e, south: s, west: w, right: er, left: wr,
           key: e | (s << 2) | (w << 4) | (er << 6) | (wr << 8) };
}

function cliffBank(mask, kind, variant) {
  var cache = Object.create(null), count = 0;
  return {
    get: function (key, seam) {
      var hit = cache[key];
      if (hit) return hit;
      count++;
      return (cache[key] = bakeCliff(mask, kind, variant, seam));
    },
    stats: function () {
      var bytes = 0, keys = [];
      for (var k in cache) {
        var v = cache[k]; keys.push(+k); bytes += v.c.width * v.c.height * 4;
      }
      return { slots: count, bytes: bytes, keys: keys.sort(function (a, b) { return a - b; }) };
    }
  };
}

function bakeCliff(mask, kind, variant, seam) {
  var H = CLIFF_H + TCH + CLIFF_SH;
  var s = mkCanvas(TCW, H), g = s.g, i, k;
  var cx = TCW / 2, by = CLIFF_H + TCH / 2, ty = TCH / 2;   // base centre, crown centre
  // The snow rock is ROCK. It was a cold blue-grey (#828d95 over #3f4952)
  // with a bright cold highlight, which under the regular strata banding
  // below read as chromed panelling -- a glass parapet, not a cliff. RA2's
  // snow theatre uses the same warm-neutral stone the temperate one does
  // and puts the WHITE in the snow lying on it, so that is what the palette
  // says now: neutral stone for the face, white only where snow settles.
  var P = kind === 'snow'
    ? { top: '#dbe8e8', top2: '#c3d2d7', crown: '#eef5f6',
        rock: '#847f76', rockD: '#3a352e', rockL: '#b0a89b', wet: '#5c574f' }
    : kind === 'urban'
      ? { top: '#7b7d7e', top2: '#666a6c', crown: '#93989a',
          rock: '#8b8c88', rockD: '#43443f', rockL: '#c2c3bd', wet: '#6a6b66' }
      : { top: '#5f7038', top2: '#4a5a2a', crown: '#78873f',
          rock: '#6b5f4a', rockD: '#2f2820', rockL: '#a39273', wet: '#4a4034' };
  bsr(2200 + mask * 37 + (variant | 0) * 1013 + (kind === 'snow' ? 5 : kind === 'urban' ? 11 : 0));
  var R = cx + TW / 2, L = cx - TW / 2;
  var conc = kind === 'urban';

  // cast shadow on the ground below the exposed faces
  g.fillStyle = 'rgba(12,14,10,.32)';
  g.beginPath();
  g.moveTo(cx - (mask & 2 ? TW / 2 : 0), by + (mask & 2 ? 0 : TH / 2));
  g.lineTo(cx, by + TH / 2 + 5); g.lineTo(cx + (mask & 1 ? TW / 2 : 0), by + (mask & 1 ? 3 : TH / 2));
  g.lineTo(cx, by + TH / 2); g.closePath(); g.fill();

  // Point on the face: t runs 0 (outer vertex) to 1 (front vertex), d is
  // depth down the wall in pixels.
  function fp(dir, t, d) { var xE = cx + dir * TW / 2; return [xE + (cx - xE) * t, ty + (TH / 2) * t + d]; }

  // A cliff is not a wall: it is a row of rock COLUMNS of unequal width that
  // jut out by different amounts, crest at different heights and shade each
  // other. That is the whole difference between the RA2 cliff set and a
  // retaining wall, so the columns are built first and everything else --
  // strata, crest, crown rim, talus -- hangs off them.
  seam = seam || { east: 0, south: 0, west: 0 };
  // Values are deliberately geometry only. Colour, strata, snow load and
  // talus keep using the cell variant; adding any of them here would merely
  // texture the seam instead of joining it.
  var VERT = [
    { crest: -1.6, ox: -1.4, oy:  0.3, foot: CLIFF_H + 3.0 },
    { crest:  1.2, ox:  0.8, oy: -0.9, foot: CLIFF_H + 7.0 },
    { crest:  5.7, ox:  1.5, oy:  1.1, foot: CLIFF_H + 4.5 },
    { crest:  3.3, ox: -0.5, oy:  1.6, foot: CLIFF_H + 9.0 }
  ];
  function vertex(id) {
    var v = VERT[id % CLIFF_SEAM_VAR];
    return conc
      ? { crest: -0.5 + (v.crest + 1.6) * 0.15, ox: v.ox * 0.18, oy: v.oy * 0.18, foot: CLIFF_H + 1 }
      : v;
  }

  var COLS = {};
  function columns(dir) {
    if (COLS[dir]) return COLS[dir];
    var edge = dir > 0 ? [vertex(seam.east), vertex(seam.south)]
                       : [vertex(seam.west), vertex(seam.south)];
    var detail = dir > 0 ? seam.right : seam.left;
    // Symmetric cut sets mean an edge traversed from its other endpoint
    // still constructs the same column boundaries in reverse.
    var CUTS = [
      [0, 0.16, 0.38, 0.62, 0.84, 1],
      [0, 0.22, 0.40, 0.60, 0.78, 1],
      [0, 0.13, 0.32, 0.50, 0.68, 0.87, 1],
      [0, 0.19, 0.36, 0.64, 0.81, 1]
    ];
    var SHAPE = [
      { crest: -2.1, crest2:  1.0, jut: -0.7, jut2:  0.5, foot: -2.0 },
      { crest:  2.8, crest2: -1.4, jut:  1.5, jut2: -0.4, foot:  2.4 },
      { crest: -0.4, crest2:  2.2, jut:  0.2, jut2:  1.0, foot: -0.8 },
      { crest:  1.5, crest2:  0.7, jut: -1.1, jut2: -0.8, foot:  1.2 }
    ];
    var cuts = CUTS[detail || 0], shape = SHAPE[detail || 0];
    function shapeAt(t) {
      t = Math.max(0, Math.min(1, t));
      var arc = Math.sin(Math.PI * t), wave = Math.cos(Math.PI * 2 * t);
      var baseC = edge[0].crest + (edge[1].crest - edge[0].crest) * t;
      var baseX = edge[0].ox + (edge[1].ox - edge[0].ox) * t;
      var baseY = edge[0].oy + (edge[1].oy - edge[0].oy) * t;
      var baseF = edge[0].foot + (edge[1].foot - edge[0].foot) * t;
      var jut = (conc ? 0.18 : 1) * arc * (shape.jut + shape.jut2 * wave);
      return { crest: baseC + (conc ? 0.15 : 1) * arc * (shape.crest + shape.crest2 * wave),
               ox: baseX + dir * jut * 2, oy: baseY + jut,
               foot: baseF + (conc ? 0.1 : 1) * arc * shape.foot };
    }
    var knots = [], out = [], NSEG = 5;
    // One shared knot per column boundary. Previously each column invented
    // one constant jut and two crest values in isolation; now neighbouring
    // columns share their boundary, and the first/last knots are the
    // renderer-supplied grid vertices. Local variation fades to zero only
    // at those endpoints, where exact agreement matters.
    for (var n = 0; n < cuts.length; n++) {
      var t = cuts[n], arc = Math.sin(Math.PI * t), kn = shapeAt(t);
      kn = { t: t, crest: kn.crest, ox: kn.ox, oy: kn.oy, foot: kn.foot, side: [] };
      // The vertical outline is shared too. Its small wander is suppressed
      // at a tile endpoint so the entire boundary, not only its crest pixel,
      // lands on the same points in both sprites.
      for (var q = 0; q <= NSEG; q++) {
        var tq = Math.max(0, Math.min(1, t + Math.sin((detail + 1) * 19.17 + t * (1 - t) * 37.1 + q * 11.7) * 0.025 * arc));
        var dq = kn.crest + (kn.foot - kn.crest) * (q / NSEG);
        var qp = fp(dir, tq, dq);
        kn.side.push([qp[0] + kn.ox, qp[1] + kn.oy]);
      }
      knots.push(kn);
    }
    for (var c = 0; c < cuts.length - 1; c++) {
      var a = knots[c], b = knots[c + 1];
      out.push({ t0: a.t, t1: b.t,
                 crest: a.crest, crest1: b.crest,
                 ox0: a.ox, ox1: b.ox, oy0: a.oy, oy1: b.oy,
                 foot0: a.foot, foot1: b.foot, L: a.side, R: b.side,
                 geom: shapeAt,
                 tone: 0.66 + brnd() * 0.66,
                 foot: (a.foot + b.foot) / 2 });
    }
    COLS[dir] = out;
    return out;
  }

  function face(dir) {
    var lit = dir > 0 ? 1.14 : 0.68;               // the right face takes the light
    var cols = columns(dir);
    // A point on this column. Offset endpoints are the shared vertex
    // vectors; interpolation carries their crest/jut construction through
    // the cell instead of erasing it at every tile boundary.
    function pt(cl, t, d) {
      var q = fp(dir, t, d), v = cl.geom(t);
      return [q[0] + v.ox, q[1] + v.oy];
    }
    function crestAt(cl, t) { return cl.geom(t).crest; }
    function footAt(cl, t) { return cl.geom(t).foot; }
    // 1. the recess: everything the columns do not cover reads as deep shade
    g.fillStyle = shade(P.rockD, dir > 0 ? 1.25 : 0.95);
    var rv0 = cols[0].geom(0), rv1 = cols[0].geom(1);
    var r0 = fp(dir, 0, rv0.crest - 2), r1 = fp(dir, 1, rv1.crest - 2);
    var r2 = fp(dir, 1, rv1.foot + 4), r3 = fp(dir, 0, rv0.foot + 4);
    r0[0] += rv0.ox; r0[1] += rv0.oy; r1[0] += rv1.ox; r1[1] += rv1.oy;
    r2[0] += rv1.ox; r2[1] += rv1.oy; r3[0] += rv0.ox; r3[1] += rv0.oy;
    g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.lineTo(r2[0], r2[1]); g.lineTo(r3[0], r3[1]); g.closePath(); g.fill();

    for (var c = 0; c < cols.length; c++) {
      var cl = cols[c];
      // The column is NOT a parallelogram: its two sides wander in and out
      // over the drop and its crest is broken. A ruled quad with a dark seam
      // beside it is what made this read as a palisade rather than as rock.
      var NSEG = 5, q, L = cl.L, Rr = cl.R, crestPts = [];
      // A column's crest RUNS from `crest` at its leading edge to `crest1`
      // at its trailing one, jittered on top. `crest1` was computed and
      // never read, so every column's top was level at `crest` and the
      // whole cliff carried one ruled line along it.
      for (q = 0; q <= 3; q++) {
        var ct = q / 3;
        var ctt = cl.t0 + (cl.t1 - cl.t0) * ct;
        crestPts.push(pt(cl, ctt, crestAt(cl, ctt)));
      }
      var a0 = crestPts[0], a1 = crestPts[crestPts.length - 1];
      var b1 = Rr[NSEG], b0 = L[NSEG];
      function colPath() {
        g.beginPath(); g.moveTo(L[0][0], L[0][1]);
        for (q = 0; q < crestPts.length; q++) g.lineTo(crestPts[q][0], crestPts[q][1]);
        for (q = 0; q <= NSEG; q++) g.lineTo(Rr[q][0], Rr[q][1]);
        for (q = NSEG; q >= 0; q--) g.lineTo(L[q][0], L[q][1]);
        g.closePath();
      }
      g.save();
      colPath();
      g.fillStyle = shade(P.rock, lit * cl.tone); g.fill();
      g.clip();
      // strata (rock) or form-board courses (concrete)
      var yo = 0;
      var nb = conc ? 6 : 4 + bint(3);
      for (k = 0; k < nb; k++) {
        var thk = conc ? (CLIFF_H / 6) : (CLIFF_H / nb) * (0.6 + brnd() * 0.85);
        var pa = pt(cl, cl.t0, cl.crest + yo);
        var pb = pt(cl, cl.t1, cl.crest1 + yo + (conc ? 0 : (brnd() - 0.5) * 2.4));
        var pc = pt(cl, cl.t1, cl.crest1 + yo + thk + (conc ? 0 : (brnd() - 0.5) * 2.4));
        var pd = pt(cl, cl.t0, cl.crest + yo + thk);
        // Bedding planes, not masonry courses: the alternation carries a
        // per-band jitter and the seam under it varies in weight, so a
        // face does not stack up as evenly-lit blocks of one height.
        var band = conc ? (k & 1 ? 0.97 : 1.03) : (k & 1 ? 0.82 : 1.13) * (0.93 + brnd() * 0.15);
        g.fillStyle = shade(P.rock, lit * cl.tone * band);
        g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.lineTo(pc[0], pc[1]); g.lineTo(pd[0], pd[1]); g.closePath(); g.fill();
        g.strokeStyle = shade(P.rockD, 1); g.globalAlpha = conc ? 0.30 : (0.20 + brnd() * 0.34); g.lineWidth = conc ? 0.8 : 0.8 + brnd() * 0.7;
        g.beginPath(); g.moveTo(pd[0], pd[1]); g.lineTo(pc[0], pc[1]); g.stroke(); g.globalAlpha = 1;
        yo += thk;
      }
      // mottling inside the column
      g.globalAlpha = conc ? 0.10 : 0.20;
      for (k = 0; k < 6; k++) {
        g.fillStyle = brnd() < 0.5 ? P.rockD : P.rockL;
        var mp = pt(cl, cl.t0 + brnd() * (cl.t1 - cl.t0), 2 + brnd() * (CLIFF_H - 4));
        g.beginPath(); g.ellipse(mp[0], mp[1], 2 + brnd() * 4.5, 1.2 + brnd() * 2.4, 0, 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
      // a wet seepage streak, or a concrete stain, on some columns
      if (brnd() < 0.45) {
        g.globalAlpha = 0.22; g.strokeStyle = P.wet; g.lineWidth = 1.6 + brnd() * 2;
        var wt = cl.t0 + brnd() * (cl.t1 - cl.t0);
        var w0 = pt(cl, wt, crestAt(cl, wt) + 2), w1 = pt(cl, wt, crestAt(cl, wt) + 8 + brnd() * (CLIFF_H - 12));
        g.beginPath(); g.moveTo(w0[0], w0[1]); g.lineTo(w1[0], w1[1]); g.stroke(); g.globalAlpha = 1;
      }
      // foot shadow inside the column
      g.globalAlpha = 0.42; g.fillStyle = '#000';
      var f0 = pt(cl, cl.t0, cl.foot0 - 7), f1 = pt(cl, cl.t1, cl.foot1 - 7);
      g.beginPath(); g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(b1[0], b1[1]); g.lineTo(b0[0], b0[1]); g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.restore();
      // seams: a crevice on the trailing side only, and only sometimes --
      // a line down every join is a fence, not a cliff
      if (brnd() < 0.55) {
        g.strokeStyle = shade(P.rockD, 0.9); g.globalAlpha = 0.3; g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(Rr[0][0], Rr[0][1]);
        for (q = 1; q <= NSEG; q++) g.lineTo(Rr[q][0], Rr[q][1]);
        g.stroke();
      }
      // lit crest cap, following the broken crest
      g.strokeStyle = shade(P.rockL, lit * 1.15); g.globalAlpha = 0.7; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(crestPts[0][0], crestPts[0][1] + 0.6);
      for (q = 1; q < crestPts.length; q++) g.lineTo(crestPts[q][0], crestPts[q][1] + 0.6);
      g.stroke();
      g.globalAlpha = 1;
      if (kind === 'snow') {
        // Snow LIES on the rock; it is not a coping stone laid along it.
        // The straight-edged quad this replaces ran from the column's
        // leading crest point to its trailing one at one depth, so a run
        // of cliff carried an unbroken ruled white line -- the single
        // biggest reason the snow set read as a glass parapet. The load
        // now follows the broken crest, is cut to a different depth at
        // every point, and about one column in four is scoured bare.
        var load = brnd();
        if (load > 0.22) {
          var deep = 1.1 + load * 4.4;
          g.fillStyle = 'rgba(246,252,252,.92)';
          g.beginPath();
          for (q = 0; q < crestPts.length; q++)
            g[q ? 'lineTo' : 'moveTo'](crestPts[q][0], crestPts[q][1] - 0.9 - brnd() * 1.8);
          for (q = crestPts.length - 1; q >= 0; q--)
            g.lineTo(crestPts[q][0], crestPts[q][1] + deep * (0.35 + brnd() * 1.25));
          g.closePath(); g.fill();
        }
        // ...and it catches on the LEDGES the bedding planes cut into the
        // face, which is what tells a snowed cliff from a grey one.
        g.fillStyle = 'rgba(238,247,250,.55)';
        for (k = 0; k < 3; k++) {
          var lp = pt(cl, cl.t0 + brnd() * (cl.t1 - cl.t0), 5 + brnd() * (CLIFF_H - 9));
          g.beginPath(); g.ellipse(lp[0], lp[1], 1.8 + brnd() * 4.4, 0.5 + brnd() * 1.3, 0, 0, 6.29); g.fill();
        }
      }
      if (conc) {                                   // tie-rod holes down the form work
        g.fillStyle = 'rgba(40,42,40,.45)';
        for (k = 1; k < 5; k++) {
          var hp = pt(cl, (cl.t0 + cl.t1) / 2, k * (CLIFF_H / 5));
          g.beginPath(); g.ellipse(hp[0], hp[1], 1.1, 0.8, 0, 0, 6.29); g.fill();
        }
      }
      // talus at this column's foot -- scattered up the wall as well as at
      // its base, so the bottom edge is a rubble slope and not a plinth
      // Seven, not four, spread over a deeper band and with the odd real
      // boulder among the chips: a cliff ends in a scree slope that spills
      // out onto the ground below it, and four small lumps hugging the
      // wall left the base reading as a plinth line instead.
      for (k = 0; k < 7; k++) {
        var rt = cl.t0 - 0.05 + brnd() * (cl.t1 - cl.t0 + 0.10);
        var rp = pt(cl, rt, footAt(cl, rt) - 7 + brnd() * 14);
        var rr = (k % 3 === 0 ? 2.2 + brnd() * 3.0 : 0.9 + brnd() * 2.2);
        g.fillStyle = 'rgba(16,14,9,.34)'; g.beginPath(); g.ellipse(rp[0] + 0.7, rp[1] + 0.8, rr * 1.3, rr * 0.5, 0, 0, 6.29); g.fill();
        g.fillStyle = shade(P.rock, lit * (0.95 + brnd() * 0.55)); g.beginPath(); g.ellipse(rp[0], rp[1], rr, rr * 0.62, 0, 0, 6.29); g.fill();
        if (kind === 'snow') { g.fillStyle = 'rgba(240,250,252,.5)'; g.beginPath(); g.ellipse(rp[0] - rr * 0.2, rp[1] - rr * 0.35, rr * 0.7, rr * 0.28, 0, 0, 6.29); g.fill(); }
      }
    }
  }
  function faceShade(dir) {                    // light falls off down the drop
    var cs = columns(dir), v0 = cs[0].geom(0), v1 = cs[0].geom(1);
    var p0 = fp(dir, 0, v0.crest), p1 = fp(dir, 1, v1.crest);
    var p2 = fp(dir, 1, v1.foot + 6), p3 = fp(dir, 0, v0.foot + 6);
    p0[0] += v0.ox; p0[1] += v0.oy; p1[0] += v1.ox; p1[1] += v1.oy;
    p2[0] += v1.ox; p2[1] += v1.oy; p3[0] += v0.ox; p3[1] += v0.oy;
    var gd = g.createLinearGradient(0, ty, 0, ty + CLIFF_H + TH / 2);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(0.55, 'rgba(0,0,0,.10)'); gd.addColorStop(1, 'rgba(0,0,0,.30)');
    g.fillStyle = gd;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.closePath(); g.fill();
  }
  if (mask & 1) { face(1); faceShade(1); }
  if (mask & 2) { face(-1); faceShade(-1); }
  // outside corner: the two faces meet at the front vertex
  if ((mask & 3) === 3) {
    var sv = vertex(seam.south);
    g.strokeStyle = shade(P.rockD, 0.9); g.globalAlpha = 0.4; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx + sv.ox, ty + TH / 2 + sv.crest + sv.oy);
    g.lineTo(cx + sv.ox, ty + TH / 2 + sv.foot + sv.oy); g.stroke(); g.globalAlpha = 1;
  }

  // crown: the theatre's own surface, mottled, with a broken rocky rim on
  // every exposed edge -- the crown is the top of the UPPER level, which is
  // where anything standing on the plateau draws.
  diamond(g, cx, ty, TCW, TCH); g.fillStyle = P.top; g.fill();
  g.save(); diamond(g, cx, ty, TCW, TCH); g.clip();
  g.globalAlpha = 0.24;
  for (i = 0; i < 12; i++) { g.fillStyle = brnd() < 0.5 ? P.top2 : P.crown; g.beginPath(); g.ellipse(cx - 26 + brnd() * 52, ty - 12 + brnd() * 24, 4 + brnd() * 10, 2 + brnd() * 4.5, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 0.16;                               // rock showing through the thin soil
  for (i = 0; i < 7; i++) { g.fillStyle = P.rock; g.beginPath(); g.ellipse(cx - 24 + brnd() * 48, ty - 10 + brnd() * 20, 3 + brnd() * 6, 1.4 + brnd() * 2.6, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  if (kind === 'grass') {                        // tufts and a small bush on the crown
    g.strokeStyle = 'rgba(96,124,52,.8)'; g.lineWidth = 1;
    for (i = 0; i < 11; i++) {
      var gx3 = cx + (brnd() - 0.5) * (TW - 14), gy3 = ty + (brnd() - 0.5) * (TH - 9);
      for (var k3 = 0; k3 < 3; k3++) { g.beginPath(); g.moveTo(gx3 + k3 - 1, gy3 + 1); g.lineTo(gx3 + (k3 - 1) * 1.6, gy3 - 3 - brnd() * 2); g.stroke(); }
    }
    if ((mask & 3) && brnd() < 0.4) {
      var bx3 = cx + (brnd() - 0.5) * 30, by3 = ty + (brnd() - 0.5) * 14;
      g.fillStyle = 'rgba(20,30,12,.3)'; g.beginPath(); g.ellipse(bx3 + 2, by3 + 2, 6, 2.6, 0, 0, 6.29); g.fill();
      g.fillStyle = '#31491f'; g.beginPath(); g.ellipse(bx3, by3, 5.5, 3.6, 0, 0, 6.29); g.fill();
      g.fillStyle = '#4a6a2c'; g.beginPath(); g.ellipse(bx3 - 1.6, by3 - 1.4, 3.4, 2.2, 0, 0, 6.29); g.fill();
    }
  } else if (kind === 'snow') {
    g.fillStyle = 'rgba(255,255,255,.30)';
    for (i = 0; i < 14; i++) { g.beginPath(); g.ellipse(cx + (brnd() - 0.5) * 46, ty + (brnd() - 0.5) * 22, 2 + brnd() * 4, 1 + brnd() * 2, 0, 0, 6.29); g.fill(); }
  } else {                                        // urban: a slab joint across the deck
    g.globalAlpha = 0.34; g.strokeStyle = '#494c4e'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(cx - TW / 2, ty + TH / 4); g.lineTo(cx + TW / 2, ty - TH / 4); g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
  // The rim: rock lumps along every exposed crown edge. They used to be
  // drawn INSIDE the crown's own clip, which meant they could only bite
  // inward -- the crown itself stayed a mathematically exact diamond and a
  // ridge kept one ruled line along its top no matter how broken the face
  // below it was. Unclipped, and pushed OUT over the drop, they are what
  // finally makes the top edge ragged: two per column at different sizes,
  // the bigger ones overhanging furthest, each with its own shadow on the
  // face beneath so it reads as rock standing proud rather than as paint.
  var rims = [[mask & 1, 1], [mask & 2, -1]];
  for (var li = 0; li < 2; li++) {
    if (!rims[li][0]) continue;
    var d2 = rims[li][1], cs = columns(d2);
    for (i = 0; i < cs.length; i++) {
      var cl2 = cs[i];
      for (var lj = 0; lj < 3; lj++) {
        // Not every column carries one: a continuous bead of rock along the
        // crown edge is just another ruled line in a different colour.
        if (brnd() < 0.32) continue;
        var tm = cl2.t0 + (cl2.t1 - cl2.t0) * (0.12 + brnd() * 0.76);
        var lr = 1.5 + (cl2.t1 - cl2.t0) * 11 * (lj ? 0.6 : 1) + brnd() * 1.5;
        var out = brnd() * 2.0 * (lj ? 0.45 : 1);
        var cv = cl2.geom(tm), cp = fp(d2, tm, cv.crest);
        var lx = cp[0] + cv.ox + d2 * out;
        var ly = cp[1] + cv.oy + out * 0.5;
        g.fillStyle = 'rgba(18,16,12,.26)';        // the shadow it throws down the face
        g.beginPath(); g.ellipse(lx, ly + lr * 0.6, lr * 0.9, lr * 0.38, 0, 0, 6.29); g.fill();
        g.fillStyle = shade(P.rock, 0.78 + brnd() * 0.42);
        g.beginPath();
        g.moveTo(lx - lr, ly + 1.4); g.lineTo(lx - lr * (0.4 + brnd() * 0.4), ly - lr * (0.45 + brnd() * 0.55) - 0.6);
        g.lineTo(lx + lr * (0.1 + brnd() * 0.45), ly - lr * (0.2 + brnd() * 0.4));
        g.lineTo(lx + lr, ly + 1.2); g.closePath(); g.fill();
        g.strokeStyle = shade(P.rockL, 1.0); g.globalAlpha = 0.30; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(lx - lr * 0.55, ly - lr * 0.5); g.lineTo(lx + lr * 0.2, ly - lr * 0.3); g.stroke();
        g.globalAlpha = 1;
        if (kind === 'snow' && brnd() < 0.7) {     // snow caps the lump too
          g.fillStyle = 'rgba(244,251,252,.8)';
          g.beginPath(); g.ellipse(lx - lr * 0.15, ly - lr * 0.42, lr * 0.6, lr * 0.24, 0, 0, 6.29); g.fill();
        }
      }
    }
  }
  // sharp dark rim on the back edges: the plateau ends there, the ground
  // behind is a level lower.
  g.lineWidth = 1.3; g.strokeStyle = 'rgba(30,26,18,.6)';
  if (mask & 4) { g.beginPath(); g.moveTo(cx, ty - TH / 2); g.lineTo(R, ty); g.stroke(); }
  if (mask & 8) { g.beginPath(); g.moveTo(L, ty); g.lineTo(cx, ty - TH / 2); g.stroke(); }
  // The cell itself is one height LEVEL up (sy() has already moved the draw
  // point), so the sprite only has to sit its crown on that point: the
  // canvas is anchored by its centre, and the crown is TCH/2 from its top.
  s.lift = -(CLIFF_H + CLIFF_SH) / 2;
  return s;
}

// Roads are connector sets, not decorative variants: RA2 ships DirtRoads
// Straight / Bendy / Junctions / Ends and the Paved Roads equivalents, and
// picks the piece from which NEIGHBOURS are road. So this is keyed on the
// 4-bit neighbour mask -- bit 1 = -gy, 2 = +gx, 4 = +gy, 8 = -gx -- and the
// carriageway is the union of one arm per connected side, which makes
// straights, bends, T-junctions, crossroads and dead ends fall out for free
// and tile exactly with the neighbour's arm.
function roadV() {
  var cx = TCW / 2, cy = TCH / 2;
  return [[cx, cy - TCH / 2], [cx + TCW / 2, cy], [cx, cy + TCH / 2], [cx - TCW / 2, cy]];
}

// Lay the union of arms into the current path. `w` is the half-width as a
// fraction of a tile edge; `wob` jitters the shoulders so a dirt road does
// not read as machined.
function roadPath(g, mask, w, wob, seed) {
  var V = roadV(), cx = TCW / 2, cy = TCH / 2, e;
  bsr(seed);
  g.beginPath();
  // Surrounded on all four sides, the cell is not a junction at all -- it is
  // the INTERIOR of a paved area, and RA2 lays those as solid surface. Left
  // as four arms it grew a kerb fillet on every diamond corner, which turned
  // River Crossing's three-lane crossing into a waffle.
  if (mask === 15) {
    g.moveTo(V[0][0], V[0][1]); g.lineTo(V[1][0], V[1][1]);
    g.lineTo(V[2][0], V[2][1]); g.lineTo(V[3][0], V[3][1]); g.closePath();
    return;
  }
  for (e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    var p0 = V[e], p1 = V[(e + 1) & 3];
    var j0 = wob ? (brnd() - 0.5) * wob : 0, j1 = wob ? (brnd() - 0.5) * wob : 0;
    var A = [p0[0] + (p1[0] - p0[0]) * (0.5 - w) + j0, p0[1] + (p1[1] - p0[1]) * (0.5 - w) + j0 * 0.5];
    var B = [p0[0] + (p1[0] - p0[0]) * (0.5 + w) + j1, p0[1] + (p1[1] - p0[1]) * (0.5 + w) + j1 * 0.5];
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = cx - mx, dy = cy - my;
    g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]);
    g.lineTo(B[0] + dx, B[1] + dy); g.lineTo(A[0] + dx, A[1] + dy);
    g.closePath();
  }
  // the junction plate, which also IS the tile when nothing connects
  var hw = TCW * w * 1.16, hh = TCH * w * 1.16;
  g.moveTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.lineTo(cx - hw, cy); g.closePath();
}

// The centre of the arm running to edge `e`, `t` of the way out from the
// tile centre -- used for ruts and centre lines.
function armPt(e, t) {
  var V = roadV(), cx = TCW / 2, cy = TCH / 2;
  var mx = (V[e][0] + V[(e + 1) & 3][0]) / 2, my = (V[e][1] + V[(e + 1) & 3][1]) / 2;
  return [cx + (mx - cx) * t, cy + (my - cy) * t];
}

function bakeRoad(kind, mask, vv) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, i, e;
  var snowy = kind === 'snow';
  bsr(1900 + mask * 211 + (vv || 0) * 4099 + (snowy ? 3 : 0));
  g.save(); diamondT(g, cx, cy); g.clip();
  var W = 0.28;
  // 1. the beaten shoulder: dust and gravel pushed off the track
  g.globalAlpha = 0.40; g.fillStyle = snowy ? '#93a0a6' : '#514832';
  roadPath(g, mask, W + 0.075, 2.6, 1700 + mask * 13); g.fill();
  g.globalAlpha = 1;
  // 2. the carriageway
  g.fillStyle = snowy ? '#aab4b8' : '#6a5f42';
  roadPath(g, mask, W, 2.0, 1800 + mask * 13); g.fill();
  g.save(); roadPath(g, mask, W, 2.0, 1800 + mask * 13); g.clip();
  g.fillStyle = snowy ? '#c6cfd2' : '#87794f'; g.globalAlpha = 0.5;   // worn pale centre
  for (i = 0; i < 5; i++) { g.beginPath(); g.ellipse(cx + (brnd() - 0.5) * 22, cy + (brnd() - 0.5) * 10, 10 + brnd() * 12, 5 + brnd() * 5, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  // 3. wheel ruts down each arm -- two parallel scuffs, which is what makes
  //    a bend read as a bend rather than a painted corner
  g.lineCap = 'round';
  for (e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    var P0 = armPt(e, 0.02), P1 = armPt(e, 1.02);
    var nx = -(P1[1] - P0[1]), ny = (P1[0] - P0[0]), nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    for (var r = -1; r <= 1; r += 2) {
      var o = r * TW * 0.085;
      g.strokeStyle = snowy ? 'rgba(122,138,148,.5)' : 'rgba(58,50,32,.45)'; g.lineWidth = 4.2;
      g.beginPath(); g.moveTo(P0[0] + nx * o, P0[1] + ny * o); g.lineTo(P1[0] + nx * o, P1[1] + ny * o); g.stroke();
      g.strokeStyle = snowy ? 'rgba(232,240,244,.34)' : 'rgba(160,146,104,.34)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(P0[0] + nx * (o + 2.4), P0[1] + ny * (o + 2.4)); g.lineTo(P1[0] + nx * (o + 2.4), P1[1] + ny * (o + 2.4)); g.stroke();
    }
  }
  g.globalAlpha = 0.24; g.fillStyle = snowy ? '#a3adb1' : '#5f5439';   // dusty edges
  for (i = 0; i < 9; i++) { var a2 = brnd() * 6.29, d = 0.7 + brnd() * 0.34; g.beginPath(); g.ellipse(cx + Math.cos(a2) * TW / 2 * d, cy + Math.sin(a2) * TH / 2 * d, 5 + brnd() * 7, 2.5 + brnd() * 3, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  for (i = 0; i < 10; i++) {                                           // grit
    var gx4 = cx + (brnd() - 0.5) * (TW - 10), gy4 = cy + (brnd() - 0.5) * (TH - 6), gr = 0.8 + brnd() * 1.2;
    g.fillStyle = 'rgba(30,26,18,.3)'; g.beginPath(); g.ellipse(gx4 + 0.6, gy4 + 0.4, gr * 1.1, gr * 0.55, 0, 0, 6.29); g.fill();
    g.fillStyle = snowy ? '#eef3f4' : '#b6a97e'; g.beginPath(); g.ellipse(gx4, gy4 - 0.2, gr * 0.9, gr * 0.45, 0, 0, 6.29); g.fill();
  }
  g.restore();
  // 4. bite the shoulders out so the track meets whatever ground it crosses
  //    on a ragged line rather than on a ruled polygon. Done as an erase, so
  //    it works over grass, sand or rock without knowing which is under it.
  g.globalCompositeOperation = 'destination-out';
  for (e = 0; e < 4; e++) {
    if (!(mask & (1 << e))) continue;
    var Q0 = armPt(e, 0.0), Q1 = armPt(e, 1.06);
    var qx = -(Q1[1] - Q0[1]), qy = (Q1[0] - Q0[0]), ql = Math.hypot(qx, qy) || 1;
    qx /= ql; qy /= ql;
    for (i = 0; i < 11; i++) {
      var f2 = brnd(), sgn2 = i & 1 ? 1 : -1;
      var off = sgn2 * (TW * (W + 0.055) + brnd() * 4 - 1);
      var bx2 = Q0[0] + (Q1[0] - Q0[0]) * f2 + qx * off, by2 = Q0[1] + (Q1[1] - Q0[1]) * f2 + qy * off;
      g.beginPath(); g.ellipse(bx2, by2, 2 + brnd() * 4.5, 1.4 + brnd() * 2.6, 0, 0, 6.29); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
  return s;
}

// Tree: drawn in the entity pass (it occludes what stands behind it). RA2
// trees are big — a canopy over a tile wide and taller than a tile — dark,
// clumpy at the silhouette, with a long shadow to the lower right.
function bakeTree(v, snow) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(64, 88), g = s.g, cx = 32, by = 78;
  srand(80 + v * 97 + (snow ? 11 : 0));
  g.fillStyle = 'rgba(8,12,6,.34)';
  g.beginPath(); g.ellipse(cx + 9, by - 1, 19, 7, 0, 0, 6.29); g.fill();
  if (snow) {
    var tiers = 5, th2 = 12 + v * 1.2, base = by - 6;
    g.fillStyle = '#4a3527'; g.fillRect(cx - 2.5, by - 16, 5, 16);
    g.fillStyle = '#33251b'; g.fillRect(cx + 0.6, by - 16, 1.9, 16);
    for (var t = 0; t < tiers; t++) {
      var yy = base - t * th2 * 0.78, ww = (21 - t * 3.4) * (1 + v * 0.04);
      g.fillStyle = shade('#22381f', 1 - t * 0.02);
      g.beginPath(); g.moveTo(cx - ww, yy); g.lineTo(cx, yy - th2 * 1.5); g.lineTo(cx + ww, yy); g.closePath(); g.fill();
      g.fillStyle = '#2f4a2b';
      g.beginPath(); g.moveTo(cx - ww * 0.55, yy - 1); g.lineTo(cx - ww * 0.1, yy - th2 * 1.35); g.lineTo(cx + ww * 0.2, yy - 1); g.closePath(); g.fill();
      g.fillStyle = '#eef6f8';                              // snow load on each tier
      g.beginPath(); g.moveTo(cx - ww * 0.72, yy - 1.5); g.lineTo(cx - ww * 0.2, yy - th2 * 0.95);
      g.lineTo(cx + ww * 0.05, yy - th2 * 0.6); g.lineTo(cx + ww * 0.42, yy - 2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(196,216,224,.85)';
      g.beginPath(); g.moveTo(cx + ww * 0.42, yy - 2); g.lineTo(cx + ww * 0.05, yy - th2 * 0.6); g.lineTo(cx + ww * 0.75, yy - 1.5); g.closePath(); g.fill();
    }
  } else {
    g.fillStyle = '#3d2c1e'; g.fillRect(cx - 3.5, by - 30, 7, 30);     // trunk
    g.fillStyle = '#553d2a'; g.fillRect(cx - 3.5, by - 30, 2.6, 30);
    g.strokeStyle = '#3d2c1e'; g.lineWidth = 2.6; g.lineCap = 'round';  // two limbs into the crown
    g.beginPath(); g.moveTo(cx, by - 22); g.lineTo(cx - 8, by - 34); g.stroke();
    g.beginPath(); g.moveTo(cx, by - 24); g.lineTo(cx + 8, by - 35); g.stroke();
    var cyy = by - 46 - v * 2, rw = 20 + v * 2.4, rh = 16 + v * 1.8;
    // clumpy silhouette: a ring of lobes, then lit lobes on the upper left
    var lobes = [];
    for (var i = 0; i < 13; i++) {
      var a = (i / 13) * 6.283 + rnd() * 0.32, dd = 0.62 + rnd() * 0.42;
      lobes.push([cx + Math.cos(a) * rw * dd, cyy + Math.sin(a) * rh * dd, 6 + rnd() * 5]);
    }
    g.fillStyle = '#1d3115';
    for (i = 0; i < lobes.length; i++) { g.beginPath(); g.ellipse(lobes[i][0], lobes[i][1], lobes[i][2], lobes[i][2] * 0.88, 0, 0, 6.29); g.fill(); }
    g.beginPath(); g.ellipse(cx, cyy, rw * 0.85, rh * 0.85, 0, 0, 6.29); g.fill();
    g.fillStyle = '#2c4a1f';
    for (i = 0; i < 9; i++) { var a3 = rnd() * 6.283, d3 = rnd() * 0.7; g.beginPath(); g.ellipse(cx + Math.cos(a3) * rw * d3, cyy + Math.sin(a3) * rh * d3 - 2, 5 + rnd() * 5, 4.4 + rnd() * 4, 0, 0, 6.29); g.fill(); }
    g.fillStyle = '#43682a';
    for (i = 0; i < 7; i++) { g.beginPath(); g.ellipse(cx - 4 + (rnd() - 0.5) * rw * 0.8, cyy - 5 - rnd() * rh * 0.5, 4 + rnd() * 4, 3.4 + rnd() * 3, 0, 0, 6.29); g.fill(); }
    g.fillStyle = '#5d8c39';
    for (i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx - 6 + (rnd() - 0.5) * rw * 0.5, cyy - 8 - rnd() * rh * 0.35, 3 + rnd() * 2.6, 2.4 + rnd() * 2, 0, 0, 6.29); g.fill(); }
  }
  s.ax = cx; s.ay = by;
  return s;
}

// RA2 ships far more than trees as terrain objects -- art.ini's [TREE*] and
// [TC*] sets, plus rocks, dead trunks and the theatre's own debris. These
// ride the SAME T_TREE cell as a tree does, so they cost nothing but art.
function bakeDeadTree(v, snow) {
  var s = mkCanvas(64, 88), g = s.g, cx = 32, by = 78, i;
  bsr(4100 + v * 71 + (snow ? 9 : 0));
  g.fillStyle = 'rgba(8,12,6,.30)';
  g.beginPath(); g.ellipse(cx + 8, by - 1, 15, 5.5, 0, 0, 6.29); g.fill();
  var bark = snow ? '#5b544c' : '#4b3d2c', barkL = snow ? '#7d766c' : '#6b5942';
  var hgt = 34 + v * 4;
  g.strokeStyle = bark; g.lineCap = 'round'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(cx, by); g.lineTo(cx - 1.5, by - hgt); g.stroke();
  g.strokeStyle = barkL; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(cx - 2, by - 3); g.lineTo(cx - 3.2, by - hgt + 3); g.stroke();
  // broken limbs, snapped short
  var limbs = [[-1, 0.62, -15, -9], [1, 0.72, 13, -12], [-1, 0.86, -9, -7], [1, 0.44, 10, -6]];
  for (i = 0; i < limbs.length; i++) {
    var L = limbs[i], y0 = by - hgt * L[1];
    g.strokeStyle = bark; g.lineWidth = 3.2 - i * 0.4;
    g.beginPath(); g.moveTo(cx, y0);
    g.quadraticCurveTo(cx + L[2] * 0.6, y0 + L[3] * 0.3, cx + L[2], y0 + L[3]); g.stroke();
    g.strokeStyle = bark; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(cx + L[2], y0 + L[3]);
    g.lineTo(cx + L[2] * 1.3, y0 + L[3] - 5 - brnd() * 4); g.stroke();
  }
  if (snow) {                                        // snow caught on the upper side of each limb
    g.strokeStyle = 'rgba(244,252,253,.9)'; g.lineWidth = 2;
    for (i = 0; i < limbs.length; i++) {
      var L2 = limbs[i], yy = by - hgt * L2[1] - 1.6;
      g.beginPath(); g.moveTo(cx, yy); g.quadraticCurveTo(cx + L2[2] * 0.6, yy + L2[3] * 0.3, cx + L2[2], yy + L2[3]); g.stroke();
    }
    g.beginPath(); g.moveTo(cx - 3, by - hgt); g.lineTo(cx + 1, by - hgt); g.stroke();
  }
  s.ax = cx; s.ay = by;
  return s;
}

// A boulder / rock outcrop: real volume, a cast shadow and a lit crown, so
// it does not read as a flat decal lying on the grass.
function bakeBoulder(kind, v) {
  var s = mkCanvas(64, 88), g = s.g, cx = 32, by = 78, i, k;
  bsr(4300 + v * 137 + (kind === 'snow' ? 5 : kind === 'urban' ? 11 : 0));
  var C = kind === 'snow' ? { b: '#8d979b', d: '#4d565c', l: '#c3ced2' }
        : kind === 'urban' ? { b: '#84837e', d: '#46453f', l: '#bcbbb4' }
        : { b: '#7a6f57', d: '#3a3226', l: '#b0a184' };
  var lumps = 1 + (v & 1) + (v === 2 ? 1 : 0);
  g.fillStyle = 'rgba(10,12,8,.34)';
  g.beginPath(); g.ellipse(cx + 6, by - 2, 19 - v * 2, 7, 0, 0, 6.29); g.fill();
  for (k = 0; k < lumps; k++) {
    var ox = (k - (lumps - 1) / 2) * 15 + (brnd() - 0.5) * 4, oy = -brnd() * 4;
    var rw = 13 - k * 2.5 - v, rh = (10 - k * 2 - v * 0.6);
    var pts = [], sides = 7 + bint(3);
    for (i = 0; i < sides; i++) {
      var a = (i / sides) * 6.283 + brnd() * 0.34;
      pts.push([cx + ox + Math.cos(a) * rw * (0.76 + brnd() * 0.4),
                by - 8 + oy + Math.sin(a) * rh * (0.7 + brnd() * 0.5)]);
    }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = shade(C.b, 0.86 + brnd() * 0.3); g.fill();
    g.strokeStyle = C.d; g.globalAlpha = 0.5; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
    g.fillStyle = shade(C.l, 1); g.globalAlpha = 0.6;      // lit crown
    g.beginPath(); g.ellipse(cx + ox - rw * 0.24, by - 12 + oy - rh * 0.3, rw * 0.48, rh * 0.3, 0, 0, 6.29); g.fill();
    g.globalAlpha = 0.34; g.fillStyle = C.d;               // shaded underside
    g.beginPath(); g.ellipse(cx + ox + rw * 0.2, by - 5 + oy + rh * 0.3, rw * 0.55, rh * 0.26, 0, 0, 6.29); g.fill();
    g.globalAlpha = 1;
    if (kind === 'snow') { g.fillStyle = 'rgba(244,252,253,.75)'; g.beginPath(); g.ellipse(cx + ox - rw * 0.2, by - 13 + oy - rh * 0.25, rw * 0.62, rh * 0.3, 0, 0, 6.29); g.fill(); }
    else if (kind !== 'urban') { g.fillStyle = 'rgba(74,92,44,.34)'; g.beginPath(); g.ellipse(cx + ox - rw * 0.1, by - 4 + oy + rh * 0.4, rw * 0.7, rh * 0.24, 0, 0, 6.29); g.fill(); }
  }
  s.ax = cx; s.ay = by;
  return s;
}

// urban.ini ships a Ruins set: a bombed-out shell of a building, kept to a
// single tile so it can stand in for a tree in the city.
function bakeRuin(v) {
  var s = mkCanvas(64, 88), g = s.g, cx = 32, by = 78, i;
  bsr(4500 + v * 197);
  g.fillStyle = 'rgba(8,10,14,.34)';
  g.beginPath(); g.ellipse(cx + 5, by - 2, 22, 8, 0, 0, 6.29); g.fill();
  // rubble mound
  for (i = 0; i < 16; i++) {
    var rx = cx + (brnd() - 0.5) * 36, ry = by - 4 - brnd() * 7, rr = 1.6 + brnd() * 3.4;
    g.fillStyle = 'rgba(24,24,26,.4)'; g.beginPath(); g.ellipse(rx + 0.8, ry + 0.8, rr * 1.2, rr * 0.5, 0, 0, 6.29); g.fill();
    g.fillStyle = shade(brnd() < 0.5 ? '#8b8781' : '#6e6a63', 0.85 + brnd() * 0.4);
    g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.6, 0, 0, 6.29); g.fill();
  }
  // one or two standing wall stubs with a broken top and empty windows
  var walls = v === 2 ? 1 : 2;
  for (var w = 0; w < walls; w++) {
    var sgn = w ? 1 : -1, wx = cx + sgn * 9, wh = 26 + brnd() * 12, ww = 15 + brnd() * 5;
    g.fillStyle = w ? '#7e7a72' : '#5f5c56';
    g.beginPath();
    g.moveTo(wx, by - 6); g.lineTo(wx + sgn * ww, by - 6 - ww * 0.5);
    g.lineTo(wx + sgn * ww, by - 6 - ww * 0.5 - wh * 0.72);
    // broken crest
    for (i = 3; i >= 0; i--) {
      var t = i / 4;
      g.lineTo(wx + sgn * ww * t, by - 6 - ww * 0.5 * t - wh * (0.6 + brnd() * 0.45));
    }
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.28)';                 // window holes
    for (i = 0; i < 2; i++) {
      var u = 0.28 + i * 0.34, hx = wx + sgn * ww * u, hy = by - 12 - ww * 0.5 * u - wh * 0.42;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + sgn * 5, hy + 2.5); g.lineTo(hx + sgn * 5, hy + 9); g.lineTo(hx, hy + 6.5); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(70,66,60,.7)'; g.lineWidth = 1;  // exposed rebar
    for (i = 0; i < 3; i++) {
      var bx = wx + sgn * ww * (0.2 + brnd() * 0.7), byy = by - 6 - wh * (0.7 + brnd() * 0.3);
      g.beginPath(); g.moveTo(bx, byy); g.lineTo(bx + (brnd() - 0.5) * 4, byy - 4 - brnd() * 4); g.stroke();
    }
  }
  s.ax = cx; s.ay = by;
  return s;
}

// Ore reads as a crystalline seam: angular gold shards with a lit facet, a
// shadow facet and a cast shadow, on stained earth. Three densities so a
// depleting patch visibly thins; four variants each so a field is not a
// printed grid.
// Erase a tile sprite's outer rim so what is painted on it (ore soil, gem
// soil) fades out instead of stopping dead on the diamond.
function feather(g, cx, cy) {
  var fg = g.createRadialGradient(cx, cy, TW * 0.20, cx, cy, TW * 0.52);
  fg.addColorStop(0, 'rgba(0,0,0,0)');
  fg.addColorStop(0.72, 'rgba(0,0,0,.55)');
  fg.addColorStop(1, 'rgba(0,0,0,1)');
  var prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'destination-out';
  g.save(); g.translate(cx, cy); g.scale(1, TH / TW); g.translate(-cx, -cy);
  g.fillStyle = fg;
  g.beginPath(); g.arc(cx, cy, TW * 0.52, 0, 6.29); g.fill();
  g.restore();
  g.globalCompositeOperation = prev;
}

// RA2's ore and gems glint: the overlay animates, and a field twinkles
// because each cell is on its own phase. Three baked flashes, cycled off
// `tick` plus the cell hash so no two neighbours fire together.
function bakeSparkle(k, col, hot) {
  var d = 14, s = mkCanvas(d, d), g = s.g, c = d / 2;
  var r = [1.1, 1.9, 1.4][k], a = [0.34, 0.62, 0.42][k];
  var grd = g.createRadialGradient(c, c, 0, c, c, r * 2.1);
  grd.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(2) + ')');
  grd.addColorStop(0.4, col.replace('ALPHA', (0.55 * a).toFixed(2)));
  grd.addColorStop(1, col.replace('ALPHA', '0'));
  g.fillStyle = grd;
  g.beginPath(); g.arc(c, c, r * 2.1, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(255,255,255,' + (0.62 * a).toFixed(2) + ')';
  g.lineWidth = 0.7; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(c - r * 1.7, c); g.lineTo(c + r * 1.7, c);
  g.moveTo(c, c - r * 1.2); g.lineTo(c, c + r * 1.2);
  g.stroke();
  if (hot) { g.fillStyle = 'rgba(255,252,236,' + (0.9 * a).toFixed(2) + ')'; g.beginPath(); g.arc(c, c, r * 0.42, 0, 6.29); g.fill(); }
  return s;
}

// RA2 does not stop the shroud on a tile boundary: it draws the border with
// a dedicated edge-shape set (half / corner / inner-corner), so the black
// ends in a soft ragged line. Ours is one tile per 4-neighbour mask of
// EXPLORED neighbours: solid black, with the rim eaten away toward each
// open side and a few bites taken out of it so the line is not a clean
// airbrush. Bit 1 = (x, y-1) which lies up-RIGHT on screen, 2 = (x+1, y)
// down-right, 4 = (x, y+1) down-left, 8 = (x-1, y) up-left.
var SHROUD_DIRS = [[0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [-0.25, -0.25]];

function bakeShroudEdge(mask) {
  var s = mkCanvas(TCW + 2, TCH + 2), g = s.g, cx = s.w / 2, cy = s.h / 2;
  g.fillStyle = '#05070b';
  diamond(g, cx, cy, TCW, TCH); g.fill();
  var rnd = lcg(0x9e37 + mask * 2749), k;
  g.globalCompositeOperation = 'destination-out';
  for (k = 0; k < 4; k++) {
    if (!(mask & (1 << k))) continue;
    var mx = SHROUD_DIRS[k][0] * TCW, my = SHROUD_DIRS[k][1] * TCH;
    var gr = g.createLinearGradient(cx + mx * 1.35, cy + my * 1.35, cx - mx * 0.55, cy - my * 0.55);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.34, 'rgba(0,0,0,.82)');
    gr.addColorStop(0.66, 'rgba(0,0,0,.42)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s.w, s.h);
    // Ragged bites along that edge, so the border is not a smooth airbrush.
    for (var b = 0; b < 5; b++) {
      var q = rnd(), bxp = cx + mx * (0.55 + rnd() * 0.85) + (my) * (q * 2 - 1) * 1.5;
      var byp = cy + my * (0.55 + rnd() * 0.85) - (mx) * (q * 2 - 1) * 0.75;
      g.fillStyle = 'rgba(0,0,0,' + (0.35 + rnd() * 0.45).toFixed(2) + ')';
      g.beginPath(); g.ellipse(bxp, byp, 3 + rnd() * 5, 2 + rnd() * 3, 0, 0, 6.29); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  return s;
}

// How many distinct ore/gem cell sprites are baked per density level, and
// how far past its own diamond a cell's cluster may reach. Both exist for
// the same reason: an RA2 ore field is 19 overlay types (`TIB01`..`TIB19`,
// rules.ini:1498) and gems 9 (`GEM01`..`GEM09`, 1423), so no two cells in
// sight of each other repeat AND no cell's crystals stop on its own tile
// boundary. Four variants on a diagonal hash, each clipped flat to its
// diamond, is what made a field read as a honeycomb lattice.
var ORE_VAR = 12, OPADX = 26, OPADY = 14;

var OCW = TCW + OPADX, OCH = TCH + OPADY;

function bakeOre(level, variant) {
  var srand = bsr, rnd = brnd, rint = bint;   // the ART generator: a baker must never move the simulation's stream (two-player desync, 2026-09-11)
  var s = mkCanvas(OCW, OCH), g = s.g;
  var cx = OCW / 2, cy = OCH / 2;
  srand(1234 + level * 97 + variant * 7919);
  g.save();
  diamondT(g, cx, cy); g.clip();
  g.globalAlpha = 0.11 + level * 0.05; g.fillStyle = '#7a5618';
  for (var q = 0; q < 8; q++) { g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 34, cy + (rnd() - 0.5) * 17, 5 + rnd() * 8, 2.5 + rnd() * 4, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 0.13;
  for (q = 0; q < 5; q++) { g.fillStyle = q & 1 ? '#96702a' : '#523c14'; g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 15, 4 + rnd() * 7, 2 + rnd() * 3, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  // Feather the soil away from the tile edge. Clipped flat, the wash ended
  // on the diamond boundary and every ore cell in a field showed its own
  // tan backing square -- a checkerboard, not a seam of ore.
  feather(g, cx, cy);
  // The SOIL is clipped to the cell (feathered, above). The CRYSTALS are
  // not: the cluster is scattered over an ellipse that reaches past the
  // diamond on every side, so neighbouring cells interlock and no straight
  // slice runs along a tile edge. `g.restore()` drops the clip first --
  // clipped, the outermost chunks were cut flat on the diamond and those
  // cuts lined up across a whole field into a visible lattice.
  g.restore();
  var n = 8 + level * 6, chunks = [];
  for (var i = 0; i < n; i++) {
    var a2 = rnd() * 6.283, r = Math.sqrt(rnd());
    chunks.push({ x: cx + Math.cos(a2) * r * (TW / 2 + 6), y: cy + Math.sin(a2) * r * (TH / 2 + 3),
                  w: 3.0 + rnd() * 3.0 + level * 0.6, h: 1.8 + rnd() * 1.7 + level * 0.45 });
  }
  chunks.sort(function (p1, p2) { return p1.y - p2.y; });
  for (i = 0; i < chunks.length; i++) {
    var c = chunks[i], base = ['#c98a24', '#e0ae2c', '#a86a1c', '#f0c748'][i & 3];
    g.fillStyle = 'rgba(58,38,10,.34)';                                   // cast shadow
    g.beginPath(); g.ellipse(c.x + c.w * 0.4, c.y + c.h * 0.42, c.w * 1.15, c.h * 0.38, 0, 0, 6.29); g.fill();
    g.fillStyle = shade(base, 0.6);                                       // shadowed right facet
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x + c.w, c.y - c.h * 0.1);
    g.lineTo(c.x + c.w * 0.45, c.y + c.h * 0.4); g.lineTo(c.x, c.y + c.h * 0.1); g.closePath(); g.fill();
    g.fillStyle = shade(base, 1.14);                                      // lit left facet
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x, c.y + c.h * 0.1);
    g.lineTo(c.x - c.w * 0.5, c.y + c.h * 0.36); g.lineTo(c.x - c.w * 0.9, c.y - c.h * 0.2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,244,196,.55)'; g.lineWidth = 0.8;           // crystal edge
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x, c.y + c.h * 0.1); g.stroke();
    if ((i & 2) === 0) { g.fillStyle = 'rgba(255,248,214,.6)'; g.beginPath(); g.ellipse(c.x - c.w * 0.36, c.y - c.h * 0.5, c.w * 0.22, c.h * 0.22, 0, 0, 6.29); g.fill(); }
  }
  return s;
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function setNO_RIM(v) { NO_RIM = v; }
function setVLIFT(v) { VLIFT = v; }
