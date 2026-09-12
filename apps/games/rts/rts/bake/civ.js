// Iron Frontier — bake/civ.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.









// --------------------------------------------------------------------- //
//  Step-3 terrain art: ramps, bridges, gems, civilian blocks, urban kit
// --------------------------------------------------------------------- //
// A ramp's downhill edge is whichever neighbour is NOT high ground, tested
// N,E,S,W. Four bakes cover it: 0 downhill toward -y (screen up-right),
// 1 +x (down-right), 2 +y (down-left), 3 -x (up-left).
function hiT(t) { return t === T_CLIFF || t === T_RAMP; }

var RAMP_NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];    // dir -> the neighbour it falls toward

function rampDir(g, x, y) {
  if (g.hiAny && g.hf[idx(x, y)] > 0) {
    var best = -1, bh = 1e9;
    for (var d = 0; d < 4; d++) {
      var nx = x + RAMP_NB[d][0], ny = y + RAMP_NB[d][1];
      if (!inMap(nx, ny)) continue;
      var h = g.hf[idx(nx, ny)];
      if (h < bh - 1e-6) { bh = h; best = d; }
    }
    if (best >= 0) return best;
  }
  if (y > 0 && !hiT(g.terrain[idx(x, y - 1)])) return 0;
  if (x + 1 < MAP && !hiT(g.terrain[idx(x + 1, y)])) return 1;
  if (y + 1 < MAP && !hiT(g.terrain[idx(x, y + 1)])) return 2;
  return 3;
}

// RA2 draws a ramp as the theatre's own surface tilted between two stone
// retaining kerbs: dark at the top of the slope where it meets the cliff
// face, bright at the foot where it rejoins the ground.
var RAMP_SKIRT = 14, RAMP_SKIRT_ON = 14;

function bakeRamp(kind, dir, flat, walls) {
  // A step only has to be PAINTED where the projection exposes it. The
  // drop shows toward the camera when the slope falls to +gx or +gy (dir 1
  // or 2), and the same two cases are the ones where the cell behind is a
  // level higher and would otherwise leave a band of bare canvas. Fall the
  // other way and the neighbour, drawn later and higher, covers it all.
  var steep = !flat && (dir === 1 || dir === 2);
  var UP = steep ? RAMP_SKIRT : 0, SK = steep ? RAMP_SKIRT : 0;
  var HH = TCH + UP + SK, s = mkCanvas(TCW, HH), g = s.g, cx = TCW / 2, cy = UP + TCH / 2, i, k;
  bsr(2600 + dir * 331 + (kind === 'snow' ? 7 : kind === 'pave' ? 13 : 0));
  // A "ramp" that climbs nothing -- Chokepoint Pass cuts its two passes
  // straight THROUGH the ridge at field level -- is a rock cutting, not a
  // slope, so it gets no skirt and no gradient.
  RAMP_SKIRT_ON = SK;
  var P = kind === 'snow'
    ? { base: '#9fabb0', hi: '#e8f2f4', lo: '#5d686f', rock: '#6d777e', rockD: '#333b41', rockL: '#a8b4bc' }
    : kind === 'pave'
      ? { base: '#7d7f81', hi: '#a9abac', lo: '#494b4d', rock: '#8b8c88', rockD: '#43443f', rockL: '#c2c3bd' }
      : { base: '#7b7159', hi: '#a89a76', lo: '#463f2e', rock: '#6b5f4a', rockD: '#2f2820', rockL: '#a39273' };
  var V = [[cx, cy - TCH / 2], [cx + TCW / 2, cy], [cx, cy + TCH / 2], [cx - TCW / 2, cy]];
  function mid(d) { var a = V[d & 3], b = V[(d + 1) & 3]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  var LO = mid(dir), HI = mid(dir + 2);      // downhill edge, uphill edge
  // The slope surface, and the strip of it that runs UP past the uphill
  // edge. A ramp cell sits at its own height, one notch below the level it
  // climbs to, so without that strip the step between them is a hole --
  // the whole reason the plateau approach used to show a black band.
  function slopeClip() {
    g.beginPath();
    g.moveTo(V[0][0], V[0][1]); g.lineTo(V[1][0], V[1][1]);
    g.lineTo(V[2][0], V[2][1]); g.lineTo(V[3][0], V[3][1]); g.closePath();
    if (UP) {
      var ue = (dir + 2) & 3, a = V[ue], b = V[(ue + 1) & 3];
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(b[0], b[1] - UP); g.lineTo(a[0], a[1] - UP); g.closePath();
    }
    g.clip();
  }

  // 1. the rock skirt under the two DOWNHILL edges. sy() has already put the
  //    cell at its own height; the skirt is what fills the step down to the
  //    lower neighbour so the slope does not float.
  for (k = 0; RAMP_SKIRT_ON && k < 1; k++) {
    var de = dir, a0 = V[de], a1 = V[(de + 1) & 3];
    g.fillStyle = shade(P.rock, k ? 1.05 : 0.66);
    g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]);
    g.lineTo(a1[0], a1[1] + RAMP_SKIRT_ON); g.lineTo(a0[0], a0[1] + RAMP_SKIRT_ON); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.24)';
    g.beginPath(); g.moveTo(a0[0], a0[1] + RAMP_SKIRT_ON - 5); g.lineTo(a1[0], a1[1] + RAMP_SKIRT_ON - 5);
    g.lineTo(a1[0], a1[1] + RAMP_SKIRT_ON); g.lineTo(a0[0], a0[1] + RAMP_SKIRT_ON); g.closePath(); g.fill();
    for (i = 0; i < 5; i++) {                 // broken rock in the skirt
      var t = brnd(), sx0 = a0[0] + (a1[0] - a0[0]) * t, sy0 = a0[1] + (a1[1] - a0[1]) * t + brnd() * RAMP_SKIRT_ON;
      g.fillStyle = shade(P.rock, (k ? 1.05 : 0.66) * (0.72 + brnd() * 0.6));
      g.beginPath(); g.ellipse(sx0, sy0, 2 + brnd() * 4, 1.4 + brnd() * 2.6, 0, 0, 6.29); g.fill();
    }
  }

  // 2. the slope surface itself: dark where it meets the cliff top, bright
  //    where it rejoins the field, which is how a lit slope reads.
  g.save(); slopeClip();
  var grd = g.createLinearGradient(HI[0], HI[1] - UP, LO[0], LO[1]);
  grd.addColorStop(0, shade(P.base, 0.9)); grd.addColorStop(0.5, P.base); grd.addColorStop(1, shade(P.base, 1.1));
  g.fillStyle = grd; g.fillRect(0, 0, TCW, HH);
  // rock ledges stepping down the slope -- a rock ramp, not a boardwalk
  var ea = V[dir & 3], eb = V[(dir + 1) & 3], ex = (eb[0] - ea[0]) / 2, ey = (eb[1] - ea[1]) / 2;
  for (i = 1; i < 6; i++) {
    var t2 = i / 6 + (brnd() - 0.5) * 0.05;
    var mx = HI[0] + (LO[0] - HI[0]) * t2, my = HI[1] + (LO[1] - HI[1]) * t2;
    g.fillStyle = shade(P.rock, 0.8 + t2 * 0.7); g.globalAlpha = 0.5;
    g.beginPath(); g.moveTo(mx - ex, my - ey); g.lineTo(mx + ex, my + ey);
    g.lineTo(mx + ex, my + ey + 2.4); g.lineTo(mx - ex, my - ey + 2.4); g.closePath(); g.fill();
    g.globalAlpha = 0.34; g.fillStyle = P.rockL;
    g.beginPath(); g.moveTo(mx - ex, my - ey - 1); g.lineTo(mx + ex, my + ey - 1);
    g.lineTo(mx + ex, my + ey); g.lineTo(mx - ex, my - ey); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  for (i = 0; i < 30; i++) {                                   // gravel
    var gr = 0.7 + brnd() * 1.4, gx5 = cx + (brnd() - 0.5) * (TW - 8), gy5 = cy + (brnd() - 0.5) * (TH - 5);
    g.fillStyle = 'rgba(20,18,14,.30)'; g.beginPath(); g.ellipse(gx5 + 0.6, gy5 + 0.4, gr * 1.1, gr * 0.55, 0, 0, 6.29); g.fill();
    g.fillStyle = shade(P.rockL, 0.8 + brnd() * 0.5); g.beginPath(); g.ellipse(gx5, gy5 - 0.2, gr * 0.9, gr * 0.45, 0, 0, 6.29); g.fill();
  }
  if (kind === 'snow') {
    g.fillStyle = 'rgba(246,252,252,.5)';
    for (i = 0; i < 9; i++) { g.beginPath(); g.ellipse(cx + (brnd() - 0.5) * 44, cy + (brnd() - 0.5) * 20, 3 + brnd() * 6, 1.4 + brnd() * 2.4, 0, 0, 6.29); g.fill(); }
  }
  g.restore();

  // 3. the retaining walls -- ONLY on a side that meets the cliff. Drawn on
  //    every cell they cut a wide ramp into a row of separate slabs.
  for (k = 0; k < 2; k++) {
    if (!((walls === undefined ? 3 : walls) & (1 << k))) continue;
    var d2 = (dir + 1 + k * 2) & 3, b0 = V[d2], b1 = V[(d2 + 1) & 3];
    g.strokeStyle = 'rgba(18,16,12,.45)'; g.lineWidth = 5.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(b0[0], b0[1] + 1.6); g.lineTo(b1[0], b1[1] + 1.6); g.stroke();
    for (i = 0; i < 7; i++) {
      var t3 = (i + 0.5) / 7, bx = b0[0] + (b1[0] - b0[0]) * t3, byy = b0[1] + (b1[1] - b0[1]) * t3;
      var br = 2.4 + brnd() * 2.2;
      g.fillStyle = shade(P.rock, 0.85 + brnd() * 0.55);
      g.beginPath(); g.ellipse(bx, byy, br, br * 0.62, 0, 0, 6.29); g.fill();
      g.fillStyle = shade(P.rockL, 1.1); g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(bx - br * 0.2, byy - br * 0.3, br * 0.5, br * 0.22, 0, 0, 6.29); g.fill();
      g.globalAlpha = 1;
    }
  }
  // Uphill strip and downhill skirt are the same depth, so the diamond's
  // centre already sits at the canvas centre and no lift is needed.
  s.lift = cy - HH / 2;
  return s;
}

// RA2's low road bridge: a pale concrete deck on the water with kerbs, a
// steel guard rail on the far side and a shadow beneath. `dir` 0 = the deck
// runs along grid y (screen down-left), 1 = along grid x (down-right). Baked
// taller than a tile so the rail can stand above the diamond; the overlay is
// centred on the tile, so the spare height sits half above, half below.
function bakeBridge(dir) {
  var HH = TCH + 20, s = mkCanvas(TCW, HH), g = s.g, cx = TCW / 2, cy = HH / 2, i;
  srand(3100 + dir * 97);
  var V = [[cx, cy - TCH / 2], [cx + TCW / 2, cy], [cx, cy + TCH / 2], [cx - TCW / 2, cy]];
  // rail edges are the two the traffic does NOT cross
  var rails = dir ? [0, 2] : [1, 3];
  g.save();
  g.globalAlpha = 0.32; g.fillStyle = '#0a1a22';                     // shadow on the water
  g.beginPath(); g.ellipse(cx + 3, cy + 5, TW / 2 - 2, TH / 2 - 1, 0, 0, 6.29); g.fill();
  g.globalAlpha = 1;
  diamond(g, cx, cy, TCW, TCH); g.clip();
  g.fillStyle = '#8d8b83'; g.fillRect(0, 0, TCW, HH);                // the deck
  g.fillStyle = '#9c9a92'; g.globalAlpha = 0.55;
  for (i = 0; i < 5; i++) { g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 26, cy + (rnd() - 0.5) * 12, 10 + rnd() * 10, 5 + rnd() * 4, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  // expansion joints across the travel axis
  g.strokeStyle = 'rgba(46,44,40,.55)'; g.lineWidth = 1.2;
  for (i = -2; i <= 2; i++) {
    var off = i * 9;
    g.beginPath();
    if (dir) { g.moveTo(cx - TW / 2, cy + off + TH / 4); g.lineTo(cx + TW / 2, cy + off - TH / 4); }
    else     { g.moveTo(cx - TW / 2, cy + off - TH / 4); g.lineTo(cx + TW / 2, cy + off + TH / 4); }
    g.stroke();
  }
  g.globalAlpha = 0.35; g.fillStyle = '#5f5d57';                     // tyre wear down the middle
  g.beginPath(); g.ellipse(cx, cy, TW / 2 - 6, TH / 2 - 5, 0, 0, 6.29); g.fill();
  g.globalAlpha = 1;
  g.restore();
  // kerbs + guard rails on the two non-travel edges
  for (var r = 0; r < 2; r++) {
    var d2 = rails[r], a2 = V[d2], b2 = V[(d2 + 1) & 3];
    g.strokeStyle = '#b6b3a8'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke();
    g.strokeStyle = 'rgba(40,38,34,.5)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(a2[0], a2[1] + 1.8); g.lineTo(b2[0], b2[1] + 1.8); g.stroke();
    var up = (a2[1] + b2[1]) / 2 < cy;                               // rail only on the far kerb
    if (!up) continue;
    g.strokeStyle = '#5a5f65'; g.lineWidth = 1.8;
    for (i = 0; i <= 5; i++) {
      var pt = i / 5, px2 = a2[0] + (b2[0] - a2[0]) * pt, py2 = a2[1] + (b2[1] - a2[1]) * pt;
      g.beginPath(); g.moveTo(px2, py2); g.lineTo(px2, py2 - 10); g.stroke();
    }
    g.strokeStyle = '#adb3b8'; g.lineWidth = 2.2;                    // top rail, lit
    g.beginPath(); g.moveTo(a2[0], a2[1] - 10); g.lineTo(b2[0], b2[1] - 10); g.stroke();
    g.strokeStyle = '#787e84'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(a2[0], a2[1] - 5); g.lineTo(b2[0], b2[1] - 5); g.stroke();
  }
  return s;
}

// What is left of a span that came down: broken deck plate half in the
// water, a snapped pier stub and reinforcing bar sticking out of it.
function bakeBridgeWreck() {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, i;
  srand(3311);
  g.save(); diamondT(g, cx, cy); g.clip();
  // slabs of deck, tilted, dark against the water
  for (i = 0; i < 4; i++) {
    var bx = cx + (rnd() - 0.5) * 34, by = cy + (rnd() - 0.5) * 15;
    var bw = 7 + rnd() * 9, bh = 3 + rnd() * 3, rot = (rnd() - 0.5) * 0.9;
    g.save(); g.translate(bx, by); g.rotate(rot);
    g.fillStyle = 'rgba(10,22,28,.45)';
    g.fillRect(-bw / 2 + 1.5, -bh / 2 + 1.5, bw, bh);
    g.fillStyle = '#6d6b63'; g.fillRect(-bw / 2, -bh / 2, bw, bh);
    g.fillStyle = '#8b8880'; g.fillRect(-bw / 2, -bh / 2, bw, 1.2);
    g.restore();
  }
  // reinforcing bar
  g.strokeStyle = '#4b4a44'; g.lineWidth = 1;
  for (i = 0; i < 5; i++) {
    var rx = cx + (rnd() - 0.5) * 26, ry = cy + (rnd() - 0.5) * 10;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + (rnd() - 0.5) * 8, ry - 3 - rnd() * 4); g.stroke();
  }
  // foam where the water still churns round the debris
  g.fillStyle = 'rgba(220,236,240,.22)';
  for (i = 0; i < 5; i++) {
    g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 13, 4 + rnd() * 5, 1.6 + rnd() * 1.6, 0, 0, 6.29); g.fill();
  }
  g.restore();
  return s;
}

// Gems: RA2's blue-violet crystal clusters. Taller and sharper than an ore
// shard, with a cold rim light, on stained ground.
function bakeGem(level, variant) {
  var s = mkCanvas(OCW, OCH), g = s.g, cx = OCW / 2, cy = OCH / 2;
  srand(7700 + level * 131 + variant * 4703);
  g.save(); diamondT(g, cx, cy); g.clip();
  g.globalAlpha = 0.12 + level * 0.05; g.fillStyle = '#3b2f63';
  for (var q = 0; q < 8; q++) { g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * 34, cy + (rnd() - 0.5) * 17, 5 + rnd() * 8, 2.5 + rnd() * 4, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 1;
  feather(g, cx, cy);
  // Crystals outside the clip, as bakeOre: a gem seam interlocks with its
  // neighbours instead of every cell ending on its own diamond.
  g.restore();
  // Three habits, not one repeated cone: rules.ini ships GEM01..GEM09 and
  // an RA2 gem field is visibly a mix. 0 tall spires, 1 squat blocky
  // clusters, 2 a low blue-white fan. Twelve variants cycle the three
  // habits four times over, each on its own seed, so a field is a mix of
  // habits AND no two cells of the same habit are the same cluster.
  var HAB = [{ w: 0.72, h: 1.34, n: 1.0, pal: ['#6f4fd0', '#8a68ee', '#5238a6', '#a487ff'] },
             { w: 1.34, h: 0.62, n: 1.3, pal: ['#7a5cc8', '#9a7cf0', '#5b45a0', '#b09aff'] },
             { w: 1.00, h: 0.92, n: 1.1, pal: ['#6455d2', '#8b7cf0', '#4a3d9c', '#ab9dff'] }][variant % 3];
  var n = Math.round((6 + level * 5) * HAB.n), chunks = [], i;
  for (i = 0; i < n; i++) {
    var a2 = rnd() * 6.283, r = Math.sqrt(rnd());
    chunks.push({ x: cx + Math.cos(a2) * r * (TW / 2 + 6), y: cy + Math.sin(a2) * r * (TH / 2 + 3),
                  w: (2.4 + rnd() * 2.2 + level * 0.5) * HAB.w,
                  h: (4.5 + rnd() * 4.0 + level * 1.2) * HAB.h });
  }
  chunks.sort(function (p1, p2) { return p1.y - p2.y; });
  for (i = 0; i < chunks.length; i++) {
    var c = chunks[i], base = HAB.pal[i & 3];
    g.fillStyle = 'rgba(30,18,64,.36)';
    g.beginPath(); g.ellipse(c.x + c.w * 0.5, c.y + 1.2, c.w * 1.5, c.w * 0.5, 0, 0, 6.29); g.fill();
    g.fillStyle = shade(base, 0.58);                                  // shadow facet
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x + c.w, c.y - c.h * 0.25);
    g.lineTo(c.x + c.w * 0.6, c.y + 1); g.lineTo(c.x, c.y + 1); g.closePath(); g.fill();
    g.fillStyle = shade(base, 1.18);                                  // lit facet
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x, c.y + 1);
    g.lineTo(c.x - c.w * 0.7, c.y + 0.6); g.lineTo(c.x - c.w * 0.85, c.y - c.h * 0.4); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(226,214,255,.72)'; g.lineWidth = 0.8;       // crystal edge
    g.beginPath(); g.moveTo(c.x, c.y - c.h); g.lineTo(c.x, c.y + 1); g.stroke();
    g.fillStyle = 'rgba(240,236,255,.75)';
    g.beginPath(); g.ellipse(c.x - c.w * 0.3, c.y - c.h * 0.68, c.w * 0.24, c.h * 0.14, 0, 0, 6.29); g.fill();
  }
  return s;
}

// Neutral civilian blocks for the urban theatre: RA2 paints these in muted
// brick, plaster and concrete and gives them NO owner colour — they are
// scenery that blocks, not property. 0 shop, 1 apartment, 2 warehouse,
// 3 filling station.
function bakeCiv(v) {
  // Drawn at a comfortable 78x106 and scaled up: an RA2 civilian block
  // stands a good deal taller than a tile, and at map zoom a tile-sized one
  // vanishes into the pavement.
  //
  // THE 100 WAS 106 SHORT BY SIX, and every civilian block on the board paid
  // for it. The ground shadow below is an ellipse centred at `by + 2` with a
  // 13 radius, so it reaches y = 103 in a drawing space that ended at 100:
  // ALL TEN blocks came back with opaque pixels flat against the bottom of
  // their own bake canvas — the cast shadow sliced off square, on the one
  // edge a player looks straight at. It had been that way since the shadow
  // was added and nothing had ever measured a structure's sprite against its
  // sheet; `clip.structuresTouchingSheetEdge` found it on its first run.
  // Growing the canvas moves NOTHING: `by` and `cx` are measured from the
  // top-left and `s.ay` is derived from `by`, so the extra room lands where
  // it is needed, under the art.
  var K = 1.45, s = mkCanvas(78 * K, 106 * K), g = s.g, cx = 39, by = 88, i, j;
  g.scale(K, K);
  bsr(5200 + v * 617);
  function block(bx, byy, hw, hh, ht, top, left, right) {
    g.fillStyle = left;
    g.beginPath(); g.moveTo(bx - hw, byy - hh); g.lineTo(bx, byy); g.lineTo(bx, byy - ht); g.lineTo(bx - hw, byy - hh - ht); g.closePath(); g.fill();
    g.fillStyle = right;
    g.beginPath(); g.moveTo(bx + hw, byy - hh); g.lineTo(bx, byy); g.lineTo(bx, byy - ht); g.lineTo(bx + hw, byy - hh - ht); g.closePath(); g.fill();
    g.fillStyle = top;
    g.beginPath(); g.moveTo(bx, byy - 2 * hh - ht); g.lineTo(bx + hw, byy - hh - ht); g.lineTo(bx, byy - ht); g.lineTo(bx - hw, byy - hh - ht); g.closePath(); g.fill();
  }
  // windows marched along a wall face, in the face's own skewed basis
  function windows(bx, byy, hw, hh, ht, rows, cols, side, lit, dark) {
    var sgn = side ? 1 : -1;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      // u walks along the face; the face falls by hh over its full width,
      // so the window slides down as it goes out from the near corner.
      var u = (i + 0.5) / cols, wy = byy - ht + 6 + j * ((ht - 9) / rows);
      var wx = bx + sgn * hw * u, wyy = wy + hh * u;
      g.fillStyle = brnd() < 0.34 ? lit : dark;
      g.beginPath();
      g.moveTo(wx, wyy); g.lineTo(wx + sgn * 4, wyy + 2); g.lineTo(wx + sgn * 4, wyy + 7); g.lineTo(wx, wyy + 5);
      g.closePath(); g.fill();
    }
  }
  // Ground shadow. It used to sit at (cx+7, by-2) with a 27x10 radius --
  // entirely underneath the block's own base, so every civilian building on
  // the board was the one thing standing on the pavement without a shadow.
  // Cast it down-right, past the footprint, the way every other structure
  // and unit in the game does.
  g.fillStyle = 'rgba(8,10,14,.34)';                                  // ground shadow
  g.beginPath(); g.ellipse(cx + 12, by + 2, 34, 13, 0, 0, 6.29); g.fill();
  if (v === 0) {                                                      // two-storey corner shop
    block(cx, by, 25, 12, 26, '#8d8378', '#6d6559', '#59524a');
    windows(cx, by, 25, 12, 26, 2, 3, 0, '#d8c890', '#3c4048');
    windows(cx, by, 25, 12, 26, 2, 3, 1, '#c9bb86', '#33363d');
    g.fillStyle = '#a5453c';                                          // awning over the shopfront
    g.beginPath(); g.moveTo(cx - 24, by - 15); g.lineTo(cx, by - 3); g.lineTo(cx, by - 8); g.lineTo(cx - 24, by - 20); g.closePath(); g.fill();
    g.fillStyle = '#c8564b';
    g.beginPath(); g.moveTo(cx, by - 3); g.lineTo(cx + 24, by - 15); g.lineTo(cx + 24, by - 20); g.lineTo(cx, by - 8); g.closePath(); g.fill();
    g.fillStyle = '#6a6157';                                          // parapet
    g.beginPath(); g.moveTo(cx, by - 24 - 26); g.lineTo(cx + 25, by - 12 - 26); g.lineTo(cx, by - 26); g.lineTo(cx - 25, by - 12 - 26); g.closePath(); g.fill();
  } else if (v === 1) {                                               // apartment block
    block(cx, by, 22, 11, 48, '#7b736a', '#5f584f', '#4c463f');
    windows(cx, by, 22, 11, 48, 4, 3, 0, '#e2cf93', '#343941');
    windows(cx, by, 22, 11, 48, 4, 3, 1, '#cfbc85', '#2c3037');
    g.fillStyle = '#8d857b';                                          // roof plant and a stair head
    g.fillRect(cx - 6, by - 11 - 48 - 6, 12, 7);
    g.fillStyle = '#6a6259'; g.fillRect(cx - 6, by - 11 - 48 - 6, 12, 2);
  } else if (v === 2) {                                               // warehouse
    block(cx, by, 27, 13, 20, '#8a8478', '#6b655a', '#57524a');
    g.fillStyle = '#4a4d52';                                          // roller door
    g.beginPath(); g.moveTo(cx - 15, by - 8); g.lineTo(cx - 3, by - 2); g.lineTo(cx - 3, by - 15); g.lineTo(cx - 15, by - 21); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
    for (i = 1; i < 5; i++) { g.beginPath(); g.moveTo(cx - 15, by - 8 - i * 2.6); g.lineTo(cx - 3, by - 2 - i * 2.6); g.stroke(); }
    g.fillStyle = '#9b9488';                                          // saw-tooth roof lights
    for (i = 0; i < 3; i++) {
      var rx3 = cx - 14 + i * 13;
      g.beginPath(); g.moveTo(rx3, by - 13 - 20 - i * 0.4); g.lineTo(rx3 + 9, by - 18 - 20); g.lineTo(rx3 + 9, by - 23 - 20); g.lineTo(rx3, by - 18 - 20); g.closePath(); g.fill();
    }
  } else if (v === 4) {                                               // office tower, glass curtain wall
    block(cx, by, 21, 10, 58, '#8a8d90', '#5b6166', '#474c50');
    g.fillStyle = '#2f3a44';                                          // the glazed faces
    for (var oq = 0; oq < 2; oq++) {
      var sg = oq ? 1 : -1;
      g.beginPath();
      g.moveTo(cx + sg * 18, by - 10 - 4); g.lineTo(cx, by - 4);
      g.lineTo(cx, by - 54); g.lineTo(cx + sg * 18, by - 10 - 54); g.closePath(); g.fill();
    }
    windows(cx, by, 21, 10, 58, 6, 4, 0, '#e8dfa8', '#3d4a56');
    windows(cx, by, 21, 10, 58, 6, 4, 1, '#cfc48d', '#333e48');
    g.fillStyle = '#9ba0a3';                                          // capping band + roof plant
    g.beginPath(); g.moveTo(cx, by - 20 - 58); g.lineTo(cx + 21, by - 10 - 58); g.lineTo(cx, by - 58); g.lineTo(cx - 21, by - 10 - 58); g.closePath(); g.fill();
    g.fillStyle = '#767b7e'; g.fillRect(cx - 7, by - 10 - 58 - 8, 14, 8);
    g.fillStyle = '#c0392b'; g.fillRect(cx - 1, by - 10 - 58 - 15, 2, 8);
  } else if (v === 5) {                                               // a terrace of three shops
    var roofs = ['#8e7f6e', '#7c8a7a', '#8a7570'];
    for (i = 0; i < 3; i++) {
      var tx = cx - 15 + i * 15, tyy = by - 3 + i * 4;
      block(tx, tyy, 9, 5, 20 + (i & 1) * 5, roofs[i], shade(roofs[i], 0.74), shade(roofs[i], 0.6));
      g.fillStyle = i === 1 ? '#c8564b' : '#4f7f8c';                   // shop awning
      g.beginPath(); g.moveTo(tx - 8, tyy - 8); g.lineTo(tx, tyy - 4); g.lineTo(tx, tyy - 8); g.lineTo(tx - 8, tyy - 12); g.closePath(); g.fill();
      g.fillStyle = (i & 1) ? '#d8c890' : '#39404a';                   // shopfront glass
      g.beginPath(); g.moveTo(tx + 1, tyy - 5); g.lineTo(tx + 8, tyy - 9); g.lineTo(tx + 8, tyy - 15); g.lineTo(tx + 1, tyy - 11); g.closePath(); g.fill();
    }
  } else if (v === 6) {                                               // a bombed-out shell
    g.fillStyle = '#4a453e';                                          // the exposed floor slab
    g.beginPath(); g.moveTo(cx, by); g.lineTo(cx + 24, by - 12); g.lineTo(cx, by - 24); g.lineTo(cx - 24, by - 12); g.closePath(); g.fill();
    for (i = 0; i < 2; i++) {
      var sg2 = i ? 1 : -1, wh2 = 30 + brnd() * 10;
      g.fillStyle = i ? '#7e7a72' : '#5f5c56';
      g.beginPath();
      g.moveTo(cx, by - (i ? 0 : 0)); g.lineTo(cx + sg2 * 24, by - 12);
      g.lineTo(cx + sg2 * 24, by - 12 - wh2 * 0.7);
      for (j = 3; j >= 0; j--) { var tt = j / 4; g.lineTo(cx + sg2 * 24 * tt, by - 12 * tt - wh2 * (0.58 + brnd() * 0.42)); }
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.34)';
      for (j = 0; j < 2; j++) {
        var uu = 0.3 + j * 0.32, hx = cx + sg2 * 24 * uu, hy = by - 12 * uu - 12 - wh2 * 0.36;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + sg2 * 6, hy + 3); g.lineTo(hx + sg2 * 6, hy + 11); g.lineTo(hx, hy + 8); g.closePath(); g.fill();
      }
    }
    for (i = 0; i < 14; i++) {                                        // rubble spill
      var rx4 = cx + (brnd() - 0.5) * 46, ry4 = by - 3 - brnd() * 9, rr4 = 1.4 + brnd() * 3;
      g.fillStyle = 'rgba(22,22,24,.4)'; g.beginPath(); g.ellipse(rx4 + 0.8, ry4 + 0.7, rr4 * 1.2, rr4 * 0.5, 0, 0, 6.29); g.fill();
      g.fillStyle = shade(brnd() < 0.5 ? '#8b8781' : '#6e6a63', 0.85 + brnd() * 0.4);
      g.beginPath(); g.ellipse(rx4, ry4, rr4, rr4 * 0.6, 0, 0, 6.29); g.fill();
    }
  } else if (v === 7) {                                               // grain depot: shed plus two silos
    block(cx - 4, by, 20, 10, 18, '#8a8478', '#6b655a', '#57524a');
    for (i = 0; i < 2; i++) {
      var sx7 = cx + 12 + i * 11, sy7 = by - 8 - i * 5;
      g.fillStyle = '#9aa0a2'; g.fillRect(sx7 - 6, sy7 - 34, 12, 34);
      g.fillStyle = '#7c8285'; g.fillRect(sx7 + 1, sy7 - 34, 5, 34);
      g.fillStyle = '#b6bbbd'; g.beginPath(); g.ellipse(sx7, sy7 - 34, 6, 2.6, 0, 0, 6.29); g.fill();
      g.fillStyle = '#5d6265'; g.beginPath(); g.ellipse(sx7, sy7 - 38, 6, 2.6, 0, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(60,64,66,.5)'; g.lineWidth = 0.8;
      for (j = 1; j < 5; j++) { g.beginPath(); g.moveTo(sx7 - 6, sy7 - j * 7); g.lineTo(sx7 + 6, sy7 - j * 7); g.stroke(); }
    }
    g.fillStyle = '#4a4d52';                                          // shed door
    g.beginPath(); g.moveTo(cx - 14, by - 9); g.lineTo(cx - 4, by - 4); g.lineTo(cx - 4, by - 15); g.lineTo(cx - 14, by - 20); g.closePath(); g.fill();
  } else if (v === 8 || v === 9) {                                    // farmhouse / barn
    var barn = v === 9;
    var hw = barn ? 24 : 19, hh = barn ? 12 : 9, ht = barn ? 20 : 17, rise = barn ? 20 : 16;
    var wall = barn ? '#9c4136' : '#ddd4bd', wl = barn ? '#7a3128' : '#b3aa93', wr = barn ? '#652820' : '#968d78';
    block(cx, by, hw, hh, ht, wall, wl, wr);
    // gable roof: a ridge along the tile's other diagonal, two slopes and
    // two triangular ends -- the shape that says "farm" at a glance
    var Wv = [cx - hw, by - hh - ht], Nv = [cx, by - 2 * hh - ht], Ev = [cx + hw, by - hh - ht], Sv = [cx, by - ht];
    var P1 = [(Wv[0] + Nv[0]) / 2, (Wv[1] + Nv[1]) / 2 - rise], P2 = [(Sv[0] + Ev[0]) / 2, (Sv[1] + Ev[1]) / 2 - rise];
    function quad4(a, b2, c2, d2, col) {
      g.fillStyle = col; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.lineTo(c2[0], c2[1]); g.lineTo(d2[0], d2[1]); g.closePath(); g.fill();
    }
    quad4(Wv, Sv, P2, P1, barn ? '#7d3128' : '#6b4034');              // near slope (clay tile)
    quad4(Nv, Ev, P2, P1, barn ? '#a4483a' : '#8d5643');              // far slope
    quad4(Wv, P1, Nv, Nv, barn ? '#8b3a2f' : '#cbc2ab');              // gable ends
    quad4(Sv, P2, Ev, Ev, barn ? '#5f2620' : '#a89f8a');
    g.strokeStyle = 'rgba(30,26,22,.45)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(P1[0], P1[1]); g.lineTo(P2[0], P2[1]); g.stroke();
    if (barn) {
      g.fillStyle = '#e6e0d2';                                        // white trim + big doors
      g.beginPath(); g.moveTo(cx - 11, by - 6); g.lineTo(cx, by - 1); g.lineTo(cx, by - 16); g.lineTo(cx - 11, by - 21); g.closePath(); g.fill();
      g.fillStyle = '#4a4038';
      g.beginPath(); g.moveTo(cx - 9.5, by - 7); g.lineTo(cx - 0.6, by - 2.6); g.lineTo(cx - 0.6, by - 15.4); g.lineTo(cx - 9.5, by - 19.6); g.closePath(); g.fill();
      g.strokeStyle = '#e6e0d2'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx - 9.5, by - 19.6); g.lineTo(cx - 0.6, by - 2.6); g.stroke();
    } else {
      g.fillStyle = '#8d8578'; g.fillRect(cx + 6, by - hh - ht - rise - 6, 5, 12);   // chimney
      g.fillStyle = '#6a6259'; g.fillRect(cx + 6, by - hh - ht - rise - 6, 5, 2.4);
      windows(cx, by, hw, hh, ht, 1, 2, 0, '#e2cf93', '#3a4048');
      windows(cx, by, hw, hh, ht, 1, 2, 1, '#cfbc85', '#2f343b');
      g.fillStyle = '#5a4a38';                                        // door
      g.beginPath(); g.moveTo(cx - 5, by - 5); g.lineTo(cx - 0.6, by - 2.8); g.lineTo(cx - 0.6, by - 13); g.lineTo(cx - 5, by - 15.2); g.closePath(); g.fill();
    }
  } else {                                                            // filling station
    block(cx + 6, by, 15, 8, 15, '#8f8b80', '#6d6a60', '#585449');
    g.fillStyle = '#7e8f9a';                                          // window band
    g.beginPath(); g.moveTo(cx - 8, by - 12); g.lineTo(cx + 6, by - 5); g.lineTo(cx + 6, by - 11); g.lineTo(cx - 8, by - 18); g.closePath(); g.fill();
    g.fillStyle = '#5a5f66';                                          // canopy posts
    g.fillRect(cx - 26, by - 20, 2.4, 20); g.fillRect(cx - 4, by - 9, 2.4, 9);
    block(cx - 15, by - 22, 20, 10, 4, '#c2c4c2', '#8f9190', '#7a7c7b');   // canopy
    g.fillStyle = '#c0392b'; g.fillRect(cx - 34, by - 26, 38, 2.6);
    g.fillStyle = '#3e434a';                                          // two pumps
    g.fillRect(cx - 20, by - 12, 4, 9); g.fillRect(cx - 12, by - 8, 4, 9);
    g.fillStyle = '#9aa0a6'; g.fillRect(cx - 20, by - 12, 4, 3); g.fillRect(cx - 12, by - 8, 4, 3);
  }
  s.ax = cx * K; s.ay = by * K;
  return s;
}

// ===================================================================== //
//  Neutral-house art: the four civilian blocks (occupied and empty), the
//  three capturable tech buildings, the bridge repair hut and the crate.
//  None of these carry a house colour: RA2 paints civilian and tech
//  structures in their own municipal palette whoever happens to hold them,
//  and the only owner signal is the garrison's lit gun ports and the
//  selection brackets. (Built from the RA2 descriptions and the existing
//  structure vocabulary — no wiki rip exists for a usable CACITY/CAOILD
//  sheet; see docs/ra2-art-plan.md.)
// ===================================================================== //
// A plot-sized canvas laid out exactly as bakeBuilding does, so the
// neutral art drops straight into drawBld's pipeline.
function neutCanvas(gw, gh, head) {
  var fw = (gw + gh) * TW / 4, fh = (gw + gh) * TH / 4, pad = 18;
  var s = mkCanvas(fw * 2 + pad * 2, fh * 2 + head + pad * 2);
  return { s: s, g: s.g, cx: s.w / 2, baseY: s.h - pad - fh, fw: fw, fh: fh };
}

function neutPad(g, cx, baseY, fw, fh, tone) {
  g.fillStyle = 'rgba(0,0,0,.32)';
  diamond(g, cx + 3, baseY + 4, fw * 2, fh * 2); g.fill();
  diamond(g, cx, baseY, fw * 2, fh * 2);
  g.fillStyle = shade(tone, 0.62); g.fill();
  outline(g, shade(tone, 0.46));
}

// An occupied block: the windows RA2 lights up when men are inside, plus
// the muzzle ports they shoot through. Drawn over the empty sprite so the
// two frames register perfectly.
function bakeCivLit(src, ax, ay) {
  var d = copyArt(src), g = d.g, i;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,196,96,.13)';                     // warm spill through the glass
  g.fillRect(0, 0, src.w, src.h);
  g.globalCompositeOperation = 'source-over';
  // Gun ports: four sandbagged loopholes, matching GARRISON_PORTS so the
  // muzzle flashes come out of the holes that are drawn.
  var P = [[-13, 30], [13, 30], [-9, 16], [9, 16]];
  for (i = 0; i < P.length; i++) {
    var px = ax + P[i][0], py = ay - P[i][1];
    g.fillStyle = 'rgba(18,16,14,.82)';
    g.beginPath(); g.roundRect(px - 4, py - 3.4, 8, 6.4, 1.4); g.fill();
    g.fillStyle = 'rgba(255,214,140,.60)';
    g.beginPath(); g.roundRect(px - 2.6, py - 2.0, 5.2, 3.6, 1); g.fill();
    g.fillStyle = '#7d7566';                                // sandbag lip
    g.beginPath(); g.ellipse(px, py + 3.6, 5.4, 1.9, 0, 0, 6.29); g.fill();
    g.fillStyle = '#948b79';
    g.beginPath(); g.ellipse(px - 1.8, py + 3.1, 2.2, 1.3, 0, 0, 6.29); g.fill();
  }
  return d;
}

// [CAOILD] Tech Oil Derrick: a steel lattice tower over a concrete pad, a
// nodding pump beside it and two crude tanks, with hazard-striped skirting.
function bakeOilDerrick() {
  var N = neutCanvas(2, 2, 118), g = N.g, cx = N.cx, by = N.baseY, fw = N.fw, i;
  neutPad(g, cx, by, fw, N.fh, '#9c968a');
  // the derrick: four legs converging, cross-braced
  var tH = 76, tw0 = fw * 0.46, tw1 = fw * 0.12, lx = cx - 6;
  function leg(sgn, back) {
    g.strokeStyle = back ? '#5d6166' : '#7b8087'; g.lineWidth = back ? 2.2 : 3;
    g.beginPath(); g.moveTo(lx + sgn * tw0, by - (back ? 6 : 0)); g.lineTo(lx + sgn * tw1, by - tH); g.stroke();
  }
  leg(-1, true); leg(1, true); leg(-1, false); leg(1, false);
  g.strokeStyle = 'rgba(120,128,136,.85)'; g.lineWidth = 1.5;
  for (i = 1; i < 7; i++) {
    var q = i / 7, y0 = by - tH * q, w0 = tw0 + (tw1 - tw0) * q;
    g.beginPath(); g.moveTo(lx - w0, y0); g.lineTo(lx + w0, y0); g.stroke();
    var q2 = (i + 1) / 7, y1 = by - tH * q2, w1 = tw0 + (tw1 - tw0) * q2;
    g.beginPath(); g.moveTo(lx - w0, y0); g.lineTo(lx + w1, y1); g.stroke();
    g.beginPath(); g.moveTo(lx + w0, y0); g.lineTo(lx - w1, y1); g.stroke();
  }
  g.fillStyle = '#4a4f54';                                  // crown block
  g.fillRect(lx - tw1 - 3, by - tH - 6, tw1 * 2 + 6, 6);
  g.fillStyle = '#c8563f';                                  // aircraft warning paint
  g.fillRect(lx - tw1 - 3, by - tH - 6, tw1 * 2 + 6, 2);
  // nodding donkey
  var px2 = cx + fw * 0.62, py2 = by + 5;
  g.fillStyle = '#5a5f64'; g.fillRect(px2 - 12, py2 - 8, 24, 8);
  g.strokeStyle = '#6f757b'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(px2, py2 - 8); g.lineTo(px2, py2 - 24); g.stroke();
  g.strokeStyle = '#8a9096'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(px2 - 16, py2 - 20); g.lineTo(px2 + 14, py2 - 28); g.stroke();
  g.fillStyle = '#3f4348';
  g.beginPath(); g.ellipse(px2 - 17, py2 - 19, 5, 6, 0, 0, 6.29); g.fill();
  // two crude tanks
  for (i = 0; i < 2; i++) {
    var tx = cx - fw * 0.72 + i * 22, ty = by + 8 + i * 4;
    cylinder(g, tx, ty, 9, 18, '#7d6f58', '#98886c', '#332c22');
    g.strokeStyle = 'rgba(24,20,14,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx - 9, ty - 9); g.lineTo(tx + 9, ty - 9); g.stroke();
  }
  // hazard skirting on the pad edge
  g.save(); diamond(g, cx, by, fw * 2, N.fh * 2); g.clip();
  for (i = 0; i < 14; i++) {
    g.fillStyle = i & 1 ? '#d8b23a' : '#2b2b28';
    g.fillRect(cx - fw + i * (fw * 2 / 14), by + N.fh - 5, fw * 2 / 14, 4);
  }
  g.restore();
  return { s: N.s, ax: cx, ay: by };
}

// [CATHOSP] Tech Hospital: a pale two-storey ward block with a flat roof,
// a red cross on the roof and over the ambulance canopy.
function bakeHospital() {
  var N = neutCanvas(2, 2, 96), g = N.g, cx = N.cx, by = N.baseY, fw = N.fw, fh = N.fh, i;
  neutPad(g, cx, by, fw, fh, '#a8a79c');
  var lift = 40, hw = fw * 0.84, hh = fh * 0.84;
  prism(g, cx, by, hw, hh, lift, '#d3d2c8', '#e6e5db', '#5d5c54', 2);
  // two window bands on both faces
  for (i = 0; i < 2; i++) {
    var v0 = 0.26 + i * 0.30;
    facePatch(g, faceL, cx, by, hw, hh, lift, 0.10, 0.90, v0, v0 + 0.15, '#5f7180', '#42505b');
    facePatch(g, faceR, cx, by, hw, hh, lift, 0.10, 0.90, v0, v0 + 0.15, '#4e606e', '#374450');
  }
  // ambulance canopy + doors
  facePatch(g, faceR, cx, by, hw, hh, lift, 0.34, 0.62, 0.02, 0.22, '#8e9aa2', '#3d454b');
  var ca = faceR(cx, by, hw, hh, lift, 0.30, 0.26), cb2 = faceR(cx, by, hw, hh, lift, 0.66, 0.26);
  g.strokeStyle = '#c9ccc6'; g.lineWidth = 4; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(ca[0], ca[1]); g.lineTo(cb2[0], cb2[1]); g.stroke();
  // the red cross, on the roof and over the door
  var ry = by - lift;
  g.fillStyle = '#c8362f';
  g.save(); g.translate(cx - fw * 0.22, ry - 2); g.scale(1, 0.5); g.rotate(Math.PI / 4);
  g.fillRect(-11, -3.4, 22, 6.8); g.fillRect(-3.4, -11, 6.8, 22);
  g.restore();
  var dm = faceR(cx, by, hw, hh, lift, 0.48, 0.34);
  g.fillStyle = '#c8362f';
  g.fillRect(dm[0] - 5, dm[1] - 1.8, 10, 3.6); g.fillRect(dm[0] - 1.8, dm[1] - 5, 3.6, 10);
  // roof plant + a helipad ring
  g.fillStyle = '#b6b5ac'; g.fillRect(cx + fw * 0.26, ry - 12, 16, 10);
  g.fillStyle = '#8f8e86'; g.fillRect(cx + fw * 0.26, ry - 12, 16, 3);
  g.strokeStyle = 'rgba(240,240,235,.5)'; g.lineWidth = 1.6;
  diamond(g, cx + fw * 0.20, ry + 6, 22, 11); g.stroke();
  return { s: N.s, ax: cx, ay: by };
}

// [CAAIRP] Tech Airport: an apron with runway markings, a low terminal and
// a glazed control tower — the building the paratroopers come off.
function bakeAirport() {
  var N = neutCanvas(3, 2, 116), g = N.g, cx = N.cx, by = N.baseY, fw = N.fw, fh = N.fh, i;
  neutPad(g, cx, by, fw, fh, '#8f9490');
  // apron markings
  g.save(); diamond(g, cx, by, fw * 2, fh * 2); g.clip();
  g.strokeStyle = 'rgba(240,236,210,.55)'; g.lineWidth = 2.4;
  for (i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx - fw * 0.9, by + i * 7 + fh * 0.45);
    g.lineTo(cx + fw * 0.9, by + i * 7 - fh * 0.45);
    g.stroke();
  }
  g.restore();
  // terminal block on the far half
  var lift = 26, hw = fw * 0.52, hh = fh * 0.52;
  prism(g, cx - fw * 0.34, by - fh * 0.28, hw, hh, lift, '#b7bab4', '#cbcec7', '#4d5049', 2);
  facePatch(g, faceL, cx - fw * 0.34, by - fh * 0.28, hw, hh, lift, 0.08, 0.92, 0.28, 0.62, '#5d7280', '#3c4a54');
  // control tower
  var tx = cx + fw * 0.42, ty = by - fh * 0.20;
  cylinder(g, tx, ty, 9, 46, '#b2b5af', '#c9ccc5', '#43463f');
  g.fillStyle = '#3f5460';                                 // glazed cab
  g.beginPath(); g.moveTo(tx - 14, ty - 46); g.lineTo(tx + 14, ty - 46); g.lineTo(tx + 11, ty - 58); g.lineTo(tx - 11, ty - 58); g.closePath(); g.fill();
  g.fillStyle = 'rgba(160,204,224,.55)';
  g.beginPath(); g.moveTo(tx - 12, ty - 48); g.lineTo(tx + 12, ty - 48); g.lineTo(tx + 9.6, ty - 56); g.lineTo(tx - 9.6, ty - 56); g.closePath(); g.fill();
  g.fillStyle = '#9a9d97';
  g.beginPath(); g.ellipse(tx, ty - 59, 15, 5, 0, 0, 6.29); g.fill();
  g.strokeStyle = '#6d706a'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(tx, ty - 62); g.lineTo(tx, ty - 74); g.stroke();
  g.fillStyle = '#d8493e';
  g.beginPath(); g.arc(tx, ty - 75, 2.4, 0, 6.29); g.fill();
  // windsock
  var wx = cx - fw * 0.80, wy = by + 10;
  g.strokeStyle = '#7d817b'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx, wy - 20); g.stroke();
  g.fillStyle = '#e08a30';
  g.beginPath(); g.moveTo(wx, wy - 20); g.lineTo(wx + 13, wy - 17); g.lineTo(wx + 13, wy - 13); g.lineTo(wx, wy - 14); g.closePath(); g.fill();
  g.fillStyle = '#f2f0e6';
  g.beginPath(); g.moveTo(wx + 5, wy - 19); g.lineTo(wx + 8, wy - 18.4); g.lineTo(wx + 8, wy - 13.6); g.lineTo(wx + 5, wy - 14.2); g.closePath(); g.fill();
  return { s: N.s, ax: cx, ay: by };
}

// [CABHUT] Bridge repair hut: a bank hut with a corrugated roof, a girder
// stack and a work light, standing at the head of the crossing.
function bakeHut() {
  var N = neutCanvas(1, 1, 60), g = N.g, cx = N.cx, by = N.baseY, fw = N.fw, i;
  neutPad(g, cx, by, fw, N.fh, '#8e8a80');
  prism(g, cx, by, fw * 0.72, N.fh * 0.72, 15, '#8a7f6d', '#a2977f', '#3a352c', 0);
  // corrugated roof
  var ry = by - 15;
  diamond(g, cx, ry - 3, fw * 1.5, N.fh * 1.5);
  g.fillStyle = '#6f7a72'; g.fill(); outline(g, '#2c332e');
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
  for (i = -3; i <= 3; i++) {
    g.beginPath(); g.moveTo(cx - fw * 0.7, ry - 3 + i * 3 + N.fh * 0.34); g.lineTo(cx + fw * 0.7, ry - 3 + i * 3 - N.fh * 0.34); g.stroke();
  }
  // door + girder stack
  facePatch(g, faceR, cx, by, fw * 0.72, N.fh * 0.72, 15, 0.36, 0.62, 0.04, 0.74, '#4a4238', '#241f1a');
  for (i = 0; i < 3; i++) {
    g.fillStyle = i & 1 ? '#7a6a4e' : '#8d7c5c';
    g.fillRect(cx - fw * 0.86, by + 4 - i * 3, 18, 3);
    g.fillStyle = 'rgba(20,16,10,.35)';
    g.fillRect(cx - fw * 0.86, by + 6 - i * 3, 18, 1);
  }
  // work light on a pole
  g.strokeStyle = '#63665f'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(cx + fw * 0.7, by + 2); g.lineTo(cx + fw * 0.7, by - 22); g.stroke();
  g.fillStyle = '#ffd06a';
  g.beginPath(); g.arc(cx + fw * 0.7, by - 24, 3, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(255,208,106,.22)';
  g.beginPath(); g.arc(cx + fw * 0.7, by - 24, 8, 0, 6.29); g.fill();
  return { s: N.s, ax: cx, ay: by };
}

// [CrateRules] WoodCrateImg=CRATE: RA2's crate is a small wooden box with
// an iron strap, sitting on the ground with a soft shadow.
function bakeCrate() {
  var s = mkCanvas(34, 32), g = s.g, cx = 17, by = 24;
  g.fillStyle = 'rgba(8,10,12,.34)';
  g.beginPath(); g.ellipse(cx + 1, by + 2, 11, 4.4, 0, 0, 6.29); g.fill();
  var hw = 9, hh = 4.5, lift = 10;
  // three faces of a small iso box
  g.fillStyle = '#6f5433';
  g.beginPath(); g.moveTo(cx - hw, by - hh); g.lineTo(cx, by); g.lineTo(cx, by - lift); g.lineTo(cx - hw, by - hh - lift); g.closePath(); g.fill();
  g.fillStyle = '#8a6a41';
  g.beginPath(); g.moveTo(cx + hw, by - hh); g.lineTo(cx, by); g.lineTo(cx, by - lift); g.lineTo(cx + hw, by - hh - lift); g.closePath(); g.fill();
  g.fillStyle = '#a8834f';
  g.beginPath(); g.moveTo(cx, by - 2 * hh - lift); g.lineTo(cx + hw, by - hh - lift); g.lineTo(cx, by - lift); g.lineTo(cx - hw, by - hh - lift); g.closePath(); g.fill();
  // plank seams and the iron strap
  g.strokeStyle = 'rgba(48,34,18,.55)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(cx - hw, by - hh - lift * 0.5); g.lineTo(cx, by - lift * 0.5); g.stroke();
  g.beginPath(); g.moveTo(cx + hw, by - hh - lift * 0.5); g.lineTo(cx, by - lift * 0.5); g.stroke();
  g.strokeStyle = '#4d5257'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(cx - hw, by - hh - lift * 0.66); g.lineTo(cx, by - lift * 0.66); g.lineTo(cx + hw, by - hh - lift * 0.66); g.stroke();
  g.strokeStyle = 'rgba(20,14,8,.5)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx, by - 2 * hh - lift); g.lineTo(cx + hw, by - hh - lift); g.lineTo(cx, by - lift); g.lineTo(cx - hw, by - hh - lift); g.closePath(); g.stroke();
  // a pale stencil on the lid so it reads as cargo, not a rock
  g.fillStyle = 'rgba(232,222,196,.55)';
  g.fillRect(cx - 2.5, by - hh - lift - 2.5, 5, 1.4);
  s.ax = cx; s.ay = by;
  return s;
}

// Urban road: asphalt with a kerb-and-sidewalk rim and a broken centre line.
// Paved Roads, the urban connector set: an asphalt carriageway inside a
// raised concrete kerb, both built from the same neighbour-mask union, so a
// crossroads has proper radiused corners and a dead end has a kerb across it.
function bakeUrbanRoad(mask, vv) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, i, e;
  bsr(6100 + mask * 179 + (vv || 0) * 3571);
  var W = 0.37;
  g.save(); diamondT(g, cx, cy); g.clip();
  // kerb + sidewalk lip around the whole junction
  g.fillStyle = '#b8bab8'; roadPath(g, mask, W + 0.085, 0, 0); g.fill();
  g.strokeStyle = 'rgba(70,72,74,.45)'; g.lineWidth = 1.1;
  roadPath(g, mask, W + 0.085, 0, 0); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.12)'; roadPath(g, mask, W + 0.055, 0, 0); g.fill();
  // carriageway
  g.fillStyle = '#43464a'; roadPath(g, mask, W, 0, 0); g.fill();
  g.save(); roadPath(g, mask, W, 0, 0); g.clip();
  g.globalAlpha = 0.4; g.fillStyle = '#565a5e';                       // patched asphalt
  for (i = 0; i < 6; i++) { g.beginPath(); g.ellipse(cx + (brnd() - 0.5) * 24, cy + (brnd() - 0.5) * 11, 5 + brnd() * 8, 2.5 + brnd() * 3.5, 0, 0, 6.29); g.fill(); }
  g.globalAlpha = 0.16; g.fillStyle = '#1d1f21';                      // oil down the middle
  g.beginPath(); g.ellipse(cx + (brnd() - 0.5) * 10, cy + (brnd() - 0.5) * 5, 8 + brnd() * 7, 3 + brnd() * 3, 0, 0, 6.29); g.fill();
  g.globalAlpha = 1;
  // Centre line: RA2 paints it down a straight and stops it at a junction,
  // which is exactly the rule a driver would expect.
  var n = 0; for (e = 0; e < 4; e++) if (mask & (1 << e)) n++;
  if (mask === 5 || mask === 10 || n === 1) {
    g.strokeStyle = 'rgba(228,214,140,.75)'; g.lineWidth = 1.5;
    for (e = 0; e < 4; e++) {
      if (!(mask & (1 << e))) continue;
      var A = armPt(e, 0.18), B = armPt(e, 0.86);
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    }
  } else if (n === 3) {                                                // one stop bar, on the stem
    g.strokeStyle = 'rgba(226,226,220,.42)'; g.lineWidth = 2.2;
    for (e = 0; e < 4; e++) {
      if (mask & (1 << e)) continue;                                   // the side with no road
      var st = (e + 2) & 3, M = armPt(st, 0.74), V = roadV();
      var ex = V[(st + 1) & 3][0] - V[st][0], ey = V[(st + 1) & 3][1] - V[st][1], el = Math.hypot(ex, ey);
      g.beginPath(); g.moveTo(M[0] - ex / el * 7, M[1] - ey / el * 7); g.lineTo(M[0] + ex / el * 7, M[1] + ey / el * 7); g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 0.7;                                                // grit on the sidewalk
  for (i = 0; i < 8; i++) {
    var gx6 = cx + (brnd() - 0.5) * (TW - 6), gy6 = cy + (brnd() - 0.5) * (TH - 3);
    g.fillStyle = brnd() < 0.5 ? '#9ea1a0' : '#6e7170';
    g.beginPath(); g.ellipse(gx6, gy6, 0.9 + brnd(), 0.5 + brnd() * 0.5, 0, 0, 6.29); g.fill();
  }
  g.globalAlpha = 1; g.restore();
  return s;
}

// Urban decals: no grass tufts on concrete — soot, a manhole, a spill, chips.
function bakeUrbanDecal(v) {
  var s = mkCanvas(TCW, TCH), g = s.g, cx = TCW / 2, cy = TCH / 2, i;
  srand(6400 + v * 233);
  g.save(); diamondT(g, cx, cy); g.clip();
  if ((v & 3) === 0) {                                                // oil stain
    g.globalAlpha = 0.30; g.fillStyle = '#1b1c1f';
    for (i = 0; i < 4; i++) { var a = rnd() * 6.29, d = rnd() * 11; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, 4 + rnd() * 6, 2 + rnd() * 3, 0, 0, 6.29); g.fill(); }
  } else if ((v & 3) === 1) {                                         // a manhole cover
    g.fillStyle = '#4c4e4f'; g.beginPath(); g.ellipse(cx, cy, 6.5, 3.3, 0, 0, 6.29); g.fill();
    g.strokeStyle = '#6d7071'; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, 5.2, 2.6, 0, 0, 6.29); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(cx - 1, cy - 1, 3.2, 1.4, 0, 0, 6.29); g.fill();
  } else if ((v & 3) === 2) {                                         // rubble chips
    for (i = 0; i < 9; i++) {
      var rx4 = cx + (rnd() - 0.5) * 30, ry4 = cy + (rnd() - 0.5) * 14, rr2 = 1 + rnd() * 1.8;
      g.fillStyle = 'rgba(20,20,22,.42)'; g.beginPath(); g.ellipse(rx4 + 0.6, ry4 + 0.4, rr2 * 1.1, rr2 * 0.5, 0, 0, 6.29); g.fill();
      g.fillStyle = rnd() < 0.5 ? '#a8abad' : '#82786c'; g.beginPath(); g.ellipse(rx4, ry4 - 0.2, rr2 * 0.9, rr2 * 0.45, 0, 0, 6.29); g.fill();
    }
  } else {                                                            // a cracked slab
    g.globalAlpha = 0.35; g.strokeStyle = '#3d4042'; g.lineWidth = 1;
    for (i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(cx - 14 + rnd() * 6, cy - 5 + rnd() * 10);
      g.lineTo(cx + rnd() * 6 - 3, cy + (rnd() - 0.5) * 6); g.lineTo(cx + 12 + rnd() * 4, cy - 4 + rnd() * 8); g.stroke();
    }
  }
  g.globalAlpha = 1; g.restore();
  return s;
}

// Street trees: the temperate tree standing in a paved tree pit.
function bakeStreetTree(t) {
  var s = mkCanvas(t.w, t.h), g = s.g;
  g.fillStyle = '#9fa3a3'; g.beginPath(); g.ellipse(t.ax, t.ay - 2, 13, 5.4, 0, 0, 6.29); g.fill();
  g.fillStyle = '#83878a'; g.beginPath(); g.ellipse(t.ax, t.ay - 2.6, 11.4, 4.6, 0, 0, 6.29); g.fill();
  g.fillStyle = '#4a4335'; g.beginPath(); g.ellipse(t.ax, t.ay - 2.4, 8.6, 3.4, 0, 0, 6.29); g.fill();
  g.drawImage(t.c, 0, 0, t.w, t.h);
  s.ax = t.ax; s.ay = t.ay;
  return s;
}

// Urban cliffs and shorelines keep their sculpted art and only take a cool
// grey cast, so the theatre reads as one place without re-baking the set.
function tintTile(t, col, a) {
  var s = mkCanvas(t.w, t.h), g = s.g;
  g.drawImage(t.c, 0, 0, t.w, t.h);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, t.w, t.h);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  s.lift = t.lift; s.ax = t.ax; s.ay = t.ay;
  return s;
}

function tintSet(arr, col, a) {
  var out = [];
  for (var i = 0; i < arr.length; i++) out[i] = arr[i] ? tintTile(arr[i], col, a) : arr[i];
  return out;
}
