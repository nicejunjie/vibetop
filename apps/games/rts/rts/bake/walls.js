// Iron Frontier — bake/walls.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.









// Weapon-effect sprites, baked once. render() only ever scales/alphas and
// drawImage()s these — no gradient is ever constructed per shot or per
// explosion, which is what keeps a screen full of firefights cheap.

// --------------------------------------------------------------------- //
//  Walls and gates ([GAWALL] / [NAWALL] / [GAGATE_A])
//
//  A wall is not one sprite, it is SIXTEEN: the segment draws a post plus
//  an arm toward every side that carries another wall, so a run reads as a
//  continuous barrier and a corner turns properly. Mask bits follow the
//  same convention as the shoreline masks elsewhere in the file —
//  1 = y-1 (up-right on screen), 2 = x+1 (down-right), 4 = y+1 (down-left),
//  8 = x-1 (up-left).
//
//  The two factions are genuinely different structures, not a recolour:
//  the Directorate pours pale precast concrete with a bevelled cap, the
//  Collective bolts rusted iron plate over a low dark-grey footing. The
//  owner's colour is a single stripe on the cap; there is no faction paint.
// --------------------------------------------------------------------- //
function gproj(gx, gy) { return [(gx - gy) * TW / 2, (gx + gy) * TH / 2]; }

// An extruded ground polygon: side faces sorted back-to-front, then the cap.
// `sideL`/`sideR` are the two lit values — a face whose screen run goes to
// the right catches the light, one going left is in shadow.
function extrude(g, pts, lift, top, sideL, sideR, edge) {
  var n = pts.length, i, faces = [];
  for (i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    faces.push({ a: a, b: b, my: (a[1] + b[1]) / 2 });
  }
  faces.sort(function (p, q) { return p.my - q.my; });
  for (i = 0; i < n; i++) {
    var f = faces[i];
    g.beginPath();
    g.moveTo(f.a[0], f.a[1]); g.lineTo(f.b[0], f.b[1]);
    g.lineTo(f.b[0], f.b[1] - lift); g.lineTo(f.a[0], f.a[1] - lift);
    g.closePath();
    g.fillStyle = (f.b[0] - f.a[0]) > 0 ? sideL : sideR;
    g.fill(); outline(g, edge);
  }
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1] - lift);
  for (i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1] - lift);
  g.closePath(); g.fillStyle = top; g.fill(); outline(g, edge);
}

// A slab running from grid offset A to grid offset B, `hw` half-wide.
function gridSlab(g, cx, by, ax, ay, bx, byy, hw, lift, top, sL, sR, edge) {
  var dx = bx - ax, dy = byy - ay, L = Math.sqrt(dx * dx + dy * dy) || 1;
  var px = -dy / L * hw, py = dx / L * hw;
  var q = [[ax + px, ay + py], [bx + px, byy + py], [bx - px, byy - py], [ax - px, ay - py]];
  var pts = [];
  for (var i = 0; i < 4; i++) { var s2 = gproj(q[i][0], q[i][1]); pts.push([cx + s2[0], by + s2[1]]); }
  extrude(g, pts, lift, top, sL, sR, edge);
}

var WALL_DIRS = [[1, 0, -0.5], [2, 0.5, 0], [4, 0, 0.5], [8, -0.5, 0]];   // bit, gx, gy

// An upright OCTAGONAL prism in iso: the plan is a regular octagon squashed
// 2:1, its eight side faces sorted back-to-front and lit by the direction
// their screen run travels (right = toward the light), then the cap.
function octCol(g, cx, cy, rx, h, body, edge, cap) {
  var i, P = [], f = [];
  for (i = 0; i < 8; i++) {
    var a = 0.3927 + i * 0.7854;
    P.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * rx * 0.5]);
  }
  for (i = 0; i < 8; i++) f.push([P[i], P[(i + 1) % 8]]);
  f.sort(function (p, q) { return (p[0][1] + p[1][1]) - (q[0][1] + q[1][1]); });
  for (i = 0; i < 8; i++) {
    var A = f[i][0], B = f[i][1];
    var run = Math.max(-1, Math.min(1, (B[0] - A[0]) / (rx * 1.42)));
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]);
    g.lineTo(B[0], B[1] - h); g.lineTo(A[0], A[1] - h); g.closePath();
    g.fillStyle = shade(body, 0.78 + 0.40 * run); g.fill(); outline(g, edge);
  }
  g.beginPath(); g.moveTo(P[0][0], P[0][1] - h);
  for (i = 1; i < 8; i++) g.lineTo(P[i][0], P[i][1] - h);
  g.closePath(); g.fillStyle = cap; g.fill(); outline(g, edge);
  return cy - h;
}

// An extruded diamond centred on the cell, i.e. a plinth course.
function padSlab(g, cx, cy, hw, hh, lift, top, sL, sR, edge) {
  extrude(g, [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
          lift, top, sL, sR, edge);
  return cy - lift;
}

// ---- Walls -----------------------------------------------------------
// [GAWALL] and [NAWALL] are two DIFFERENT barriers, and both used to be the
// same flat cross of precast slabs here. Rebuilt from the SHP rips and the
// in-game shots (`allied-wall.png` 42x43 + `allied-wall-scene.jpg`,
// `soviet-wall.png` 35x38 + `soviet-wall-scene.jpg`):
//   Directorate — a stepped SANDBAG plinth carrying a stone collar, an
//     octagonal POST and, in a silver rim on top, a glass dome. Neighbours
//     are joined by a low pale curtain that runs along the plinth.
//   Collective — a heaped mound of RUBBLE with an iron cap block and a
//     steel lid, two stakes leaning out of it; a run reads as a rampart of
//     piled stone, not a fence.
// The post (Allied) and the cap block (Soviet) are the remap surface: the
// in-game shots show a grey house turning them grey while the sandbags and
// the rubble stay khaki and pink-grey.

// [GAGATE_A]/[NAGATE_A]: the faction's own wall with the run cut open — a
// pier at each end built like its wall post, and two LEAVES that travel
// apart along the run. The leaf is a standing panel with vertical bars, not
// a slab lying on the ground: a gate you can see through is the whole read.
// `openF` 0 = shut, 1 = fully open. `vert` = the run is the NW-SE grid axis.

// Lazily-baked wall/gate atlases: 16 masks x 2 owners x 2 factions is 64
// canvases most matches never need, so they are cut on first sight of that
// shape (the same trick as the infantry facing atlas).
var _wallSpr = {}, _gateSpr = {};

function wallSprite(p, fk, mask) {
  var k = p + fk + mask;
  return _wallSpr[k] || (_wallSpr[k] = bakeWallSeg(COL[p], fk, mask));
}

var GATE_FRAMES = 5;

function gateSprite(p, fk, vert, openF) {
  var fi = Math.max(0, Math.min(GATE_FRAMES - 1, Math.round(openF * (GATE_FRAMES - 1))));
  var k = p + fk + (vert ? 'v' : 'h') + fi;
  return _gateSpr[k] || (_gateSpr[k] = bakeGateSeg(COL[p], fk, vert, fi / (GATE_FRAMES - 1)));
}

// RA2 does not have "an explosion". rules.ini hands every structure a whole
// FAMILY at once (351 entries carry `Explosion=TWLT070,S_BANG48,S_BRNL58,
// S_CLSN58,S_TUMU60`), and art.ini keeps stock sizes for everything else --
// [EXPLOSML] / [EXPLOMED] / [EXPLOLRG] (art.ini:11611-11670), every one of
// them `Crater=yes` and `Scorch=yes`. Ours are four baked frame sequences:
// a fireball that blooms, rolls over and cools into a smoke ball. The hot
// core is baked as its OWN frame so it can go down additively over the
// smoke without the smoke brightening whatever it happens to overlap --
// the old single radial blob, scaled, was one orange smudge at every size.
var EXPL_N = 11;                               // frames per family (RA2's run 8-12)

function bakeExplosionFamily(ref, lobes, seed, sooty, hotEnd, riseK) {
  var body = [], core = [], k, i;
  for (k = 0; k < EXPL_N; k++) {
    var q = k / (EXPL_N - 1);
    var bs = mkCanvas(ref, ref), bg = bs.g, cx = ref / 2, cy = ref / 2;
    var rnd = lcg(seed);
    // The ball blooms fast, coasts, and lifts as it cools.
    var R = ref * 0.5 * (0.26 + 0.74 * Math.pow(q, 0.50));
    var lift = ref * riseK * q * q;
    var fade = q > 0.55 ? Math.max(0, 1 - (q - 0.55) / 0.45) : 1;
    var tall = 1 + 0.34 * Math.max(0, (q - hotEnd) / (1 - hotEnd));   // the smoke ball stretches as it climbs
    // Billows, drawn back to front so the near ones overlap the far ones
    // and the ball has a front and a back instead of reading as an
    // airbrushed cloud.
    var lob = [];
    for (i = 0; i < lobes; i++) {
      var a = rnd() * 6.2832, rr = Math.sqrt(rnd());
      lob.push({ x: cx + Math.cos(a) * rr * R * 0.56,
                 y: cy - lift + Math.sin(a) * rr * R * 0.46 * tall,
                 r: R * (0.26 + rnd() * 0.28), t: Math.min(1, (q / hotEnd) * (0.62 + rnd() * 0.42)) });
    }
    lob.sort(function (p1, p2) { return p1.y - p2.y; });
    for (i = 0; i < lob.length; i++) {
      var L = lob[i], t2 = L.t;
      bg.fillStyle = t2 < 0.30 ? mixc('#fff2c8', '#ff8c1c', t2 / 0.30)
                   : t2 < 0.62 ? mixc('#ff8c1c', '#6e3f1c', (t2 - 0.30) / 0.32)
                               : mixc(sooty ? '#3e362c' : '#5c5248', '#2a2d32', (t2 - 0.62) / 0.38);
      bg.globalAlpha = fade * (t2 < 0.62 ? 0.95 : 0.46 * (1 - (t2 - 0.62) / 0.38 * 0.45));
      bg.beginPath(); bg.ellipse(L.x, L.y, L.r, L.r * (0.92 + 0.14 * (tall - 1)), 0, 0, 6.29); bg.fill();
      // Lit crown on the billow's upper left, the same light the sprites use.
      bg.fillStyle = t2 < 0.45 ? 'rgba(255,238,182,.60)' : 'rgba(176,170,160,.26)';
      bg.globalAlpha = fade * (t2 < 0.62 ? 0.82 : 0.40);
      bg.beginPath(); bg.ellipse(L.x - L.r * 0.26, L.y - L.r * 0.32, L.r * 0.52, L.r * 0.38, -0.5, 0, 6.29); bg.fill();
    }
    // Sparks thrown off the rim while it is still burning.
    if (q < hotEnd) {
      bg.globalAlpha = fade * (1 - q / hotEnd);
      for (i = 0; i < (lobes >> 1); i++) {
        var sa = rnd() * 6.2832, sr = R * (0.64 + rnd() * 0.30);
        bg.fillStyle = (i & 1) ? '#ffe6a0' : '#ff8c2a';
        bg.fillRect(cx + Math.cos(sa) * sr - 0.8, cy - lift + Math.sin(sa) * sr * 0.85 - 0.8,
                    1.5 + rnd() * 1.2, 1.5);
      }
    }
    bg.globalAlpha = 1;
    body.push(bs);
    // The core: white-hot at the start, gone by the time the smoke wins.
    if (q < hotEnd) {
      var cs = mkCanvas(ref, ref), cg = cs.g;
      var cr = R * (0.30 + 0.34 * Math.max(0, 1 - q / hotEnd));
      var grd = cg.createRadialGradient(cx, cy - lift, 0, cx, cy - lift, Math.max(1, cr));
      var ca = (1 - q / hotEnd);
      grd.addColorStop(0, 'rgba(255,255,244,' + (0.95 * ca).toFixed(3) + ')');
      grd.addColorStop(0.35, 'rgba(255,214,120,' + (0.72 * ca).toFixed(3) + ')');
      grd.addColorStop(0.72, 'rgba(238,124,36,' + (0.34 * ca).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(160,50,10,0)');
      cg.fillStyle = grd;
      cg.beginPath(); cg.arc(cx, cy - lift, Math.max(1, cr), 0, 6.29); cg.fill();
      core.push(cs);
    } else core.push(null);
  }
  return { body: body, core: core, ref: ref };
}

// 0 small (a bullet impact, a man going down), 1 medium (a shell or a
// rocket), 2 large (a vehicle), 3 building (the centre blast of a levelled
// structure). `famOf` maps the fx's own size onto them, which is how
// `Explosion=` reads in RA2: the warhead and the victim pick the family.
function bakeExplosions() {
  return [bakeExplosionFamily(56, 7, 0x51a3, false, 0.40, 0.10),
          bakeExplosionFamily(88, 11, 0x7c19, false, 0.50, 0.15),
          bakeExplosionFamily(128, 15, 0x2f61, true, 0.60, 0.21),
          bakeExplosionFamily(168, 19, 0x9b07, true, 0.68, 0.27)];
}

function famOf(size) { return size <= 12 ? 0 : (size <= 22 ? 1 : (size <= 32 ? 2 : 3)); }

// Ground decals an explosion leaves behind. art.ini gives every EXPLO*,
// TWLT* and S_* anim `Crater=yes` / `Scorch=yes`, and ships twelve crater
// SHPs ([CRATER01]..[CRATER12], art.ini:8835-8868); rules.ini gates the
// real ground deformation on `Deform=10-15%` / `DeformThreshhold=120-300`,
// which is why a rifle round leaves nothing and a shell leaves a hole.
// Three variants each, so a firefight does not stamp the same blot.
function bakeScorchDecal(v) {
  var w = TW * 1.1, h = TH * 1.1, s = mkCanvas(w, h), g = s.g;
  var cx = w / 2, cy = h / 2, rnd = lcg(0x3311 + v * 977);
  for (var i = 0; i < 9; i++) {
    var a = rnd() * 6.2832, r = Math.sqrt(rnd());
    g.fillStyle = 'rgba(18,15,12,' + (0.10 + rnd() * 0.07).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * r * w * 0.24, cy + Math.sin(a) * r * h * 0.22,
              w * (0.15 + rnd() * 0.16), h * (0.13 + rnd() * 0.15), 0, 0, 6.29);
    g.fill();
  }
  // A few flecks of ash so the blot is not a clean airbrush oval.
  for (i = 0; i < 14; i++) {
    var fa = rnd() * 6.2832, fr = Math.sqrt(rnd()) * 0.42;
    g.fillStyle = 'rgba(12,10,8,.34)';
    g.fillRect(cx + Math.cos(fa) * fr * w - 1, cy + Math.sin(fa) * fr * h - 0.6, 1.6 + rnd() * 1.6, 1.2);
  }
  return { s: s, ax: cx, ay: cy };
}

function bakeCraterDecal(v) {
  var w = TW * 0.92, h = TH * 0.92, s = mkCanvas(w, h), g = s.g;
  var cx = w / 2, cy = h / 2, rnd = lcg(0x77c1 + v * 613), i;
  for (i = 0; i < 7; i++) {                                   // the burn round the hole
    var a = rnd() * 6.2832, r = Math.sqrt(rnd());
    g.fillStyle = 'rgba(18,15,12,.11)';
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * r * w * 0.26, cy + Math.sin(a) * r * h * 0.24,
              w * (0.18 + rnd() * 0.16), h * (0.16 + rnd() * 0.15), 0, 0, 6.29);
    g.fill();
  }
  // Churned earth, not a hole: a warm dug-out bowl with a lit far rim.
  // Painted dark it reads as a black void punched through the map.
  var rw = w * (0.24 + rnd() * 0.05), rh = h * (0.23 + rnd() * 0.05);
  g.fillStyle = 'rgba(150,130,96,.30)';                        // spoil ring
  g.beginPath(); g.ellipse(cx, cy + rh * 0.35, rw * 1.32, rh * 0.72, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(96,80,58,.88)';
  g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(134,115,84,.85)';                        // lit far rim
  g.beginPath(); g.ellipse(cx - 0.6, cy - rh * 0.24, rw * 0.86, rh * 0.78, 0, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(76,63,46,.62)';                          // shadowed floor
  g.beginPath(); g.ellipse(cx + 1, cy + rh * 0.18, rw * 0.60, rh * 0.52, 0, 0, 6.29); g.fill();
  for (i = 0; i < 9; i++) {                                    // thrown spoil
    var sa = rnd() * 6.2832, sr = 1.05 + rnd() * 0.55;
    g.fillStyle = 'rgba(112,96,70,.45)';
    g.fillRect(cx + Math.cos(sa) * sr * rw - 1, cy + Math.sin(sa) * sr * rh - 0.7, 1.8 + rnd() * 1.8, 1.3);
  }
  return { s: s, ax: cx, ay: cy };
}

// Fallout on the nuke's crater. [Radiation] RadLevelMax=500, the nuke lays
// 2000 units down and it decays over minutes; until the radiation ground
// layer lands this is what marks the ground as poisoned.
function bakeRadDecal(v) {
  var w = TW * 1.15, h = TH * 1.15, s = mkCanvas(w, h), g = s.g;
  var cx = w / 2, cy = h / 2, rnd = lcg(0x5ee1 + v * 331);
  for (var i = 0; i < 8; i++) {
    var a = rnd() * 6.2832, r = Math.sqrt(rnd());
    g.fillStyle = 'rgba(16,26,12,' + (0.10 + rnd() * 0.06).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * r * w * 0.26, cy + Math.sin(a) * r * h * 0.24,
              w * (0.16 + rnd() * 0.16), h * (0.14 + rnd() * 0.15), 0, 0, 6.29);
    g.fill();
  }
  var grd = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.46);
  grd.addColorStop(0, 'rgba(150,232,96,.30)');
  grd.addColorStop(0.55, 'rgba(96,190,64,.15)');
  grd.addColorStop(1, 'rgba(60,140,40,0)');
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(cx, cy, w * 0.46, h * 0.46, 0, 0, 6.29); g.fill();
  return { s: s, ax: cx, ay: cy };
}

// Aircraft drop shadow: one soft ellipse, scaled per type by the renderer.
function bakeAirShadow() {
  var w = 64, h = 32, s = mkCanvas(w, h), g = s.g;
  var grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(0,0,0,.9)');
  grd.addColorStop(0.7, 'rgba(0,0,0,.75)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w); g.translate(-w / 2, -h / 2);
  g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, 6.29); g.fill();
  g.restore();
  return s;
}

function bakeMuzzleFlash() {
  var d = 40, r = d / 2;
  var s = mkCanvas(d, d), g = s.g;
  g.translate(r, r);
  var grd = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.9);
  grd.addColorStop(0, 'rgba(255,255,235,.95)');
  grd.addColorStop(0.35, 'rgba(255,214,120,.75)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, r * 0.9, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(255,230,180,.85)'; g.lineWidth = 1.6; g.lineCap = 'round';
  for (var i = 0; i < 5; i++) {
    var ang = i * (Math.PI * 2 / 5) + 0.3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * r * 0.85, Math.sin(ang) * r * 0.85); g.stroke();
  }
  return s;
}

// First row of a baked canvas with any opaque pixel (0 if unreadable, e.g.
// the headless test stub).
function artTop(s) {
  try {
    var W = s.c.width, H = s.c.height, k = W / s.w;   // bitmap is DPR x the CSS size
    var d = s.g.getImageData(0, 0, W, H).data;
    if (!d || d.length < W * H * 4) return 0;
    for (var y = 0; y < H; y++)
      for (var x = 3; x < W * 4; x += 4)
        if (d[y * W * 4 + x] > 24) return y / k;
  } catch (e) {}
  return 0;
}

// The topmost row where the sprite is more than a hair WIDE. artTop finds
// the first opaque pixel, which on a civilian office block is the tip of a
// two-pixel radio mast forty pixels above the roof -- and a status bar hung
// off that tip floats in open sky, detached from the building it belongs
// to. RA2 hangs the bar just over the building's MASS, so measure the mass.
function artTopSolid(s, minRun) {
  try {
    var W = s.c.width, H = s.c.height, k = W / s.w, need = Math.max(1, minRun * k);
    var d = s.g.getImageData(0, 0, W, H).data;
    if (!d || d.length < W * H * 4) return artTop(s);
    for (var y = 0; y < H; y++) {
      var n = 0, row = y * W * 4;
      for (var x = 3; x < W * 4; x += 4) if (d[row + x] > 24) n++;
      if (n >= need) return y / k;
    }
  } catch (e) {}
  return artTop(s);
}

// Opaque bounding box of a baked canvas (whole canvas if unreadable).
// Ink bounds in CSS px (the sprite's own w/h space). The bitmap is DPR times
// larger than s.w x s.h (mkCanvas) and getImageData ignores the transform,
// so scan the WHOLE bitmap and divide by the ratio; scanning s.w x s.h read
// only the top-left quarter on a HiDPI screen and gave sprite-dependent
// wrong boxes (blank cameos, mis-set brackets).
function artBox(s) {
  var bb = { x0: 0, y0: 0, x1: s.w, y1: s.h };
  try {
    var W = s.c.width, H = s.c.height, k = W / s.w;
    var d = s.g.getImageData(0, 0, W, H).data;
    if (!d || d.length < W * H * 4) return bb;
    var x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var y = 0; y < H; y++)
      for (var x = 0; x < W; x++)
        if (d[(y * W + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    if (x1 >= 0) bb = { x0: x0 / k, y0: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k };
  } catch (e) {}
  return bb;
}

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
function set_gateSpr(v) { _gateSpr = v; }
function set_wallSpr(v) { _wallSpr = v; }
