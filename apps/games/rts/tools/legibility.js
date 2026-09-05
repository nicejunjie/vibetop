#!/usr/bin/env node
// Can a PLAYER tell two units apart on the map? — the measurement art-metrics.js
// does not make, and the reason its numbers went green while the screen stayed a
// blue mass.
//
//   node apps/games/rts/tools/legibility.js            # report
//   node apps/games/rts/tools/legibility.js --sheet    # + a contact sheet to LOOK at
//
// ── Why this exists ───────────────────────────────────────────────────────
// `art-metrics.js` grades ONE sprite, ALONE, on an empty canvas, by its ALPHA
// SILHOUETTE, at bake resolution. Three art passes closed those metrics
// (peerVsSelf 18 -> 3) and the reported complaint — "the tanks and troops are
// still hard to distinguish, they all look alike on the map" — did not move,
// because the player's problem is a different one in three ways:
//
//   1. COLOUR. The mask throws the picture away. Two units can sit at a
//      comfortable silhouette IoU and still be one blue box each.
//   2. SIZE. Measurements were taken at zoom 1. Infantry are 14-28 px wide
//      there and 8-15 px at ZMIN, where a "2-3 zone colour layout plus one
//      prop" is 2-4 pixels.
//   3. GROUND. A sprite judged on an empty canvas is not a sprite judged on
//      grass, next to five others.
//
// So this composites each unit the way drawUnit does, scales it to the size it
// is actually DRAWN at, lays it on the game's own ground colour, and compares
// the pictures. It reports the pairs a player would confuse, not the pairs a
// mask says are similar.
//
// ── What it found, and what it did NOT ────────────────────────────────────
// INFANTRY are the measurably weakest: mean 30.7 at ZMIN against the vehicles'
// 65.3, and two pairs below the threshold at BOTH zooms. That matches "the
// troops are hard to distinguish".
//
// VEHICLES pass at both zooms (min 58.1 at zoom 1, 27.7 at ZMIN, threshold 41.9
// / 23) — and a contact sheet on grass agrees: lined up, they separate. But the
// reporter was looking at a BATTLE, where units are at eight facings, overlap,
// and carry bars and effects. This tool compares one facing, isolated, side by
// side, which is the most flattering arrangement there is. **Do not read a pass
// here as "vehicles are fine on the map."** The honest next step for that
// complaint is to measure a composited FRAME, not a roster.
//
// The SIDEBAR CAMEOS were measured the same way with a throwaway probe (coarse
// 6x6 summaries of the ten structure plates): mean pairwise 29.8, min 13.1 —
// far under the 41.9 the units clear. Fixing the plates took min to 17.2. That
// measurement is not in this file yet because it needs the live sidebar rather
// than the sprite atlas; it belongs here.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const OUT = path.join(RTS, 'art', 'out');

const ZOOMS = (process.env.LEG_ZOOMS || "1,0.75").split(",").map(Number);   // the game default and ZMIN; override to sweep
const GRASS = [92, 110, 62];      // the temperate ground land units stand on
// ...and ships do not stand on grass. `terrCol` gives temperate water as
// #2c5d86; comparing a hull against grass measured a picture the game never
// draws, and it is the background that dominates a small thumbnail.
const WATER = [44, 93, 134];
// THE MEASUREMENT WINDOW. This used to be a bare `const CELL = 28`, and it was
// doing most of the judging: 28 px centre-CROPS every unit drawn larger than
// that — all 13 vehicles, all 10 ships, and 4 px off each end of every trooper
// (a GI is 16x36 at zoom 1, the Aircraft Carrier 84x74). The crop throws away
// the head, the weapon and the feet, which is where infantry identity lives,
// and keeps the torso, where it does not. Changing the window flips the
// infantry verdict from 0 confusable pairs to 11.
//
// So the tool now reports THREE numbers side by side and names each one:
//   CELL 28  the shipped window, kept so the historical baseline stays readable
//   CELL <fit>  nothing cropped. Padding dilutes every distance UNIFORMLY, so
//            the threshold moves with the window — only same-window comparisons
//            mean anything.
//   union    distance over pixels where EITHER unit has a body: free of both
//            the crop bias and the padding bias.
// Cite one in isolation and you will re-learn this the expensive way.
const CELL = Number(process.env.LEG_CELL || 28);   // the "shipped" window
// Big enough that nothing is cropped at zoom 1 (largest drawn unit 84x74).
const CELL_FIT = Number(process.env.LEG_CELL_FIT || 96);

function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}
const SERVE = {
  '/rts.html':      [path.join(RTS, 'rts.html'), 'text/html'],
  '/gamescore.js':  [path.join(ROOT, 'shared', 'gamescore.js'), 'text/javascript'],
  '/vibe-modal.js': [path.join(ROOT, 'shared', 'vibe-modal.js'), 'text/javascript'],
};
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const e = SERVE[req.url.split('?')[0]];
      if (!e) { rep.writeHead(404); rep.end(); return; }
      rep.writeHead(200, { 'content-type': e[1] });
      rep.end(fs.readFileSync(e[0]));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

/* c8 ignore start */
// Page side: compose every unit EXACTLY as drawUnit composes it (the same rule
// art-metrics.js uses — compose it any other way and the numbers are fiction)
// and hand back raw RGBA plus the bbox.
function grab(cfg) {
  const T = window.__rtsTest, U = window.__rtsTables.UNITS, S = T.spr();
  const out = [];
  const CELL = cfg.CELL, ZOOMS = cfg.ZOOMS;
  // Composite on grass, box-downscale to the size it is DRAWN at, centre in one
  // CELL box so SIZE is part of the comparison. Done page-side: 40 units x 8
  // facings x 2 zooms of raw RGBA is megabytes over the wire, thumbnails are not.
  function thumbOf(id, W, H, zoom, GRASS) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (id.data[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const tw = Math.max(1, Math.round(bw * zoom)), th = Math.max(1, Math.round(bh * zoom));
    const cell = new Uint8Array(CELL * CELL * 3);
    const mask = new Uint8Array(CELL * CELL);          // 1 where this unit has a body
    for (let i = 0; i < CELL * CELL; i++) { cell[i*3] = GRASS[0]; cell[i*3+1] = GRASS[1]; cell[i*3+2] = GRASS[2]; }
    const ox = Math.floor((CELL - tw) / 2), oy = Math.floor((CELL - th) / 2);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const cy = oy + ty, cx = ox + tx;
      if (cy < 0 || cx < 0 || cy >= CELL || cx >= CELL) continue;
      const sx0 = x0 + Math.floor(tx * bw / tw), sx1 = x0 + Math.max(Math.floor((tx+1) * bw / tw), Math.floor(tx * bw / tw) + 1);
      const sy0 = y0 + Math.floor(ty * bh / th), sy1 = y0 + Math.max(Math.floor((ty+1) * bh / th), Math.floor(ty * bh / th) + 1);
      let r = 0, g2 = 0, b = 0, n = 0, av = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
        const i = (y * W + x) * 4, a = id.data[i + 3] / 255;
        r += id.data[i] * a + GRASS[0] * (1 - a);
        g2 += id.data[i+1] * a + GRASS[1] * (1 - a);
        b += id.data[i+2] * a + GRASS[2] * (1 - a);
        av += a; n++;
      }
      const o = (cy * CELL + cx) * 3;
      cell[o] = r / n; cell[o+1] = g2 / n; cell[o+2] = b / n;
      if (av / n > 0.03) mask[cy * CELL + cx] = 1;
    }
    // base64, not Array.from: a plain array of 96*96*3 numbers per facing per
    // zoom per unit is what ran node out of heap at the wider window.
    var b64 = function (u8) {
      var str = '', CH = 0x8000;
      for (var i = 0; i < u8.length; i += CH) str += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(str);
    };
    return { cell: b64(cell), mask: b64(mask), w: bw, h: bh };
  }
  function compose(d, art, face) {
    const uk = (d.bomb && d.air) ? 1.3 : 1;
    const layers = [];
    if (Array.isArray(art)) {
      if (art.hull && art.turret) { layers.push(art.hull[face]); layers.push(art.turret[face]); }
      else if (art.lay) { const L = art.lay(); layers.push(L.hull[face]); layers.push(L.gond[face]); }
      else layers.push(art[face]);
    } else if (art.fr) { layers.push(art.fr('stand', face, 0)); }
    else layers.push(art);
    const base = layers[0];
    const W = Math.round(base.w * uk), H = Math.round(base.h * uk);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (const s of layers) if (s) g.drawImage(s.c, 0, 0, s.w * uk, s.h * uk);
    return { g, W, H };
  }
  for (const key of Object.keys(U)) {
    const d = U[key];
    if (d.spawned) continue;
    const fk = d.fac || 'dir';
    const art = S.unit[0][fk][key];
    const artB = S.unit[1][fk][key];                 // the SAME unit, other owner
    if (!art || !artB) continue;
    // ALL EIGHT FACINGS. Comparing every unit at one facing is the flattering
    // arrangement: in a battle you never see two units at the same bearing, you
    // see arbitrary ones, so A at facing 5 sitting next to B at facing 1 is the
    // glance that actually happens.
    const th = {}, thB = {}, size = {};
    let ok = true;
    for (const z of ZOOMS) { th[z] = []; thB[z] = []; }
    for (let face = 0; face < 8 && ok; face++) {
      let c, cB;
      try { c = compose(d, art, face); cB = compose(d, artB, face); } catch (e) { ok = false; break; }
      const id = c.g.getImageData(0, 0, c.W, c.H);
      const idB = cB.g.getImageData(0, 0, cB.W, cB.H);
      for (const z of ZOOMS) {
        const bg = d.nav ? cfg.WATER : cfg.GRASS;   // a hull is read on water
        const t = thumbOf(id, c.W, c.H, z, bg), tB = thumbOf(idB, cB.W, cB.H, z, bg);
        if (!t || !tB) { ok = false; break; }
        th[z].push(t); thB[z].push(tB);
        if (z === 1) size[face] = { w: t.w, h: t.h };
      }
    }
    if (!ok) continue;
    out.push({ key, name: d.name, cls: d.cls, air: !!d.air, nav: !!d.nav, th, thB, size });
  }
  return out;
}
/* c8 ignore stop */

// ── image maths ───────────────────────────────────────────────────────────
// Perceptual-ish distance: luminance carries most of "can I tell these apart"
// at 20 px, so weight it, but keep real chroma terms or two differently
// coloured boxes of the same shape score zero.
//
// THREE WINDOWS, from ONE capture. Everything is captured at CELL_FIT (nothing
// cropped) and the narrower views are derived, so the browser is driven once.
const un64 = (b) => new Uint8Array(Buffer.from(b, 'base64'));

// Centre-crop a CELL_FIT cell down to `n`, reproducing what a bare
// `const CELL = n` build would have produced.
function cropCell(cell, n) {
  const o = Math.floor((CELL_FIT - n) / 2), out = new Uint8Array(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const si = ((y + o) * CELL_FIT + (x + o)) * 3, di = (y * n + x) * 3;
    out[di] = cell[si]; out[di+1] = cell[si+1]; out[di+2] = cell[si+2];
  }
  return out;
}
function cropMask(mask, n) {
  const o = Math.floor((CELL_FIT - n) / 2), out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    out[y * n + x] = mask[(y + o) * CELL_FIT + (x + o)];
  return out;
}

// The pixel term, shared by every window so the three numbers differ only in
// WHICH pixels they average over.
function px2(a, b, o) {
  const la = 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2];
  const lb = 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2];
  const dr = (a[o] - a[o + 2]) - (b[o] - b[o + 2]);         // red-blue opponent
  const dg = (a[o + 1] - a[o + 2]) - (b[o + 1] - b[o + 2]); // green-blue opponent
  return (la - lb) * (la - lb) * 1.0 + dr * dr * 0.35 + dg * dg * 0.35;
}
// A fixed box: every pixel counts, background included. Padding therefore
// dilutes uniformly — the threshold moves with the window.
function distBox(a, b, n) {
  let s = 0;
  for (let i = 0; i < n * n; i++) s += px2(a, b, i * 3);
  return Math.sqrt(s / (n * n));
}
// Union footprint: only pixels where EITHER unit has a body. Free of the crop
// bias AND the padding bias, because the shared background is never counted.
function distUnion(a, b, ma, mb, n) {
  let s = 0, k = 0;
  for (let i = 0; i < n * n; i++) {
    if (!ma[i] && !mb[i]) continue;
    s += px2(a, b, i * 3); k++;
  }
  return k ? Math.sqrt(s / k) : 0;
}
// Backwards-compatible name: the shipped 28 px window.
function dist(a, b) { return distBox(a, b, CELL); }

/* c8 ignore start */
// THE SHEET. The header has promised `--sheet` since this file was written and
// never had it, which is how three art passes closed the numbers while the
// screen stayed a blue mass. A number is a proxy; the sheet is the thing. Each
// group is laid out on its own ground at the size it is DRAWN, once at 1:1 and
// once magnified, so a pair the table calls close can be looked at.
function sheet(cfg) {
  const T = window.__rtsTest, U = window.__rtsTables.UNITS, S = T.spr();
  const SC = cfg.SC, GRASS = cfg.GRASS, WATER = cfg.WATER;
  const groups = { infantry: [], vehicle: [], air: [], naval: [] };
  for (const key of Object.keys(U)) {
    const d = U[key];
    if (d.spawned) continue;
    const art = S.unit[0][d.fac || 'dir'][key];
    if (!art) continue;
    const g = d.nav ? 'naval' : d.cls === 'i' ? 'infantry' : d.air ? 'air' : 'vehicle';
    const uk = (d.bomb && d.air) ? 1.3 : 1;
    let a;
    if (art.fr) a = art.fr('stand', 3, 0);
    else if (Array.isArray(art)) a = art[3];
    else if (art.hull) a = art.hull[3];
    else if (art.lay) a = art.lay().hull[3];
    else a = art;
    const turret = (!art.fr && art.turret) ? art.turret[3] : null;
    groups[g].push({ key, a, turret, uk, name: d.name });
  }
  const rows = [];
  for (const g of ['infantry', 'vehicle', 'air', 'naval']) if (groups[g].length) rows.push([g, groups[g]]);
  // A cell per GROUP, not one for the sheet: sized off the Kirov, a trooper is
  // four percent of his own box and the row is unreadable.
  let cwT = 0, chT = 0, wide = 0;
  for (const row of rows) {
    let W = 0, H = 0;
    for (const r of row[1]) { W = Math.max(W, r.a.w * r.uk); H = Math.max(H, r.a.h * r.uk); }
    row[2] = Math.ceil(W) + 4; row[3] = Math.ceil(H) + 4;
    cwT = Math.max(cwT, row[2] * row[1].length + row[1].length * 6);
    chT += row[3] * SC + row[3] + 30;
    wide = Math.max(wide, row[1].length);
  }
  const c = document.createElement('canvas');
  c.width = 16; c.height = 12;
  for (const row of rows) c.width = Math.max(c.width, row[1].length * (row[2] * SC + 6) + 16);
  c.height = 12; for (const row of rows) c.height += row[3] * SC + row[3] + 30;
  const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false;
  g2.fillStyle = '#20240f'; g2.fillRect(0, 0, c.width, c.height);
  let y = 6;
  for (const [gname, rs, cw, ch] of rows) {
    const bg = gname === 'naval' ? WATER : GRASS;
    g2.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    g2.fillRect(0, y, c.width, ch * SC + ch + 8);
    let x = 8;
    for (const r of rs) {                                  // magnified
      g2.drawImage(r.a.c, x, y + 2, r.a.w * r.uk * SC, r.a.h * r.uk * SC);
      if (r.turret) g2.drawImage(r.turret.c, x, y + 2, r.turret.w * r.uk * SC, r.turret.h * r.uk * SC);
      x += cw * SC + 6;
    }
    x = 8;
    for (const r of rs) {                                  // and at 1:1, the size a player sees
      const ox = x + cw * SC / 2 - r.a.w * r.uk / 2, oy = y + ch * SC + 4;
      g2.drawImage(r.a.c, ox, oy, r.a.w * r.uk, r.a.h * r.uk);
      if (r.turret) g2.drawImage(r.turret.c, ox, oy, r.turret.w * r.uk, r.turret.h * r.uk);
      x += cw * SC + 6;
    }
    y += ch * SC + ch + 8;
    g2.fillStyle = '#cdd6bb'; g2.font = 'bold 13px monospace';
    x = 8;
    for (const r of rs) { g2.fillText(r.key.slice(0, 12), x + 2, y + 15); x += cw * SC + 6; }
    y += 22;
  }
  return c.toDataURL('image/png').slice(22);
}
/* c8 ignore stop */

async function measure(opts) {
  opts = opts || {};
  const pw = playwright();
  const srv = await serve();
  const port = srv.address().port;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/rts.html`);
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
  await page.evaluate(() => window.__rtsTest.begin(4242, 'normal'));
  // Capture ONCE at the wide window; the narrow views are derived node-side.
  const recs = await page.evaluate(grab, { CELL: CELL_FIT, GRASS, WATER, ZOOMS });
  let sheetPng = null;
  if (opts.sheet) sheetPng = await page.evaluate(sheet, { SC: 4, GRASS, WATER });
  await browser.close(); srv.close();
  return { recs, pageErrors, sheetPng };
}

const GROUP = (r) => (r.nav ? 'naval' : r.cls === 'i' ? 'infantry' : r.air ? 'air' : 'vehicle');
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

// The threshold is MEASURED, not chosen. Telling your own unit from the enemy's
// is the most basic thing this art has to do — a player does it every second,
// and it is carried entirely by the owner remap on an otherwise identical
// sprite. So the distance between the SAME unit in the two owners' colours is a
// floor for "a player can tell these apart". Any pair of DIFFERENT units that
// scores below it is, by the game's own standard, less distinguishable than a
// colour swap of one unit — which is a statement about the art rather than
// about a number somebody picked. An earlier version of this file hard-coded 26
// and that was the `mass.groundCombatSpan` x6.8 mistake all over again.
let CONFUSABLE = 0;

// The three windows this tool reports. Same capture, same pixel maths — they
// differ ONLY in which pixels are averaged. See the CELL comment at the top.
const VIEWS = [
  { key: 'cell28', n: CELL,     kind: 'box',
    label: `CELL ${CELL} (the shipped window — CROPS anything drawn bigger)` },
  { key: 'fit',    n: CELL_FIT, kind: 'box',
    label: `CELL ${CELL_FIT} (nothing cropped; padding dilutes, so the threshold moves with it)` },
  { key: 'union',  n: CELL_FIT, kind: 'union',
    label: 'union footprint (only pixels where either unit has a body)' },
];

// Decode the base64 capture into the arrays one view needs. Done per view so a
// wide run never holds three copies of every thumbnail at once.
function prepare(recs, view) {
  return recs.map((r) => {
    const th = {}, thB = {};
    for (const z of ZOOMS) {
      const conv = (t) => {
        const cell = un64(t.cell), mask = un64(t.mask);
        return view.n === CELL_FIT
          ? { c: cell, m: mask }
          : { c: cropCell(cell, view.n), m: cropMask(mask, view.n) };
      };
      th[z] = r.th[z].map(conv); thB[z] = r.thB[z].map(conv);
    }
    return { ...r, th, thB };
  });
}

function compute(recs0, view) {
  view = view || VIEWS[0];
  const recs = prepare(recs0, view);
  const pairDist = (a, b) => view.kind === 'union'
    ? distUnion(a.c, b.c, a.m, b.m, view.n)
    : distBox(a.c, b.c, view.n);
  const res = { view: view.key, label: view.label, zooms: {}, worst: {}, sizes: {}, anchor: {}, selfSpread: {} };
  for (const z of ZOOMS) {
    // The glance that actually happens: the CLOSEST presentation of two units,
    // over every combination of their facings. A pair is only safe if it is
    // safe at its worst bearing, because the player does not get to pick.
    const near = (A, B) => {
      let m = Infinity;
      for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
        const d = pairDist(A[i], B[j]);
        if (d < m) m = d;
      }
      return m;
    };
    // Anchor: the same unit, blue vs red, at its worst bearing pair. Telling
    // your unit from theirs is the floor everything else must clear. It is
    // computed PER VIEW, because a window that dilutes distances dilutes the
    // floor with them — which is exactly why cross-window comparison is void.
    const own = recs.map((r) => near(r.th[z], r.thB[z])).sort((a, b) => a - b);
    const anchor = own[own.length >> 1];
    res.anchor[z] = round(anchor, 1);

    const groups = {};
    for (const r of recs) (groups[GROUP(r)] = groups[GROUP(r)] || []).push(r);
    const per = {}, pairs = [];
    for (const [gname, rs] of Object.entries(groups)) {
      const ds = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const d = near(rs[i].th[z], rs[j].th[z]);
        ds.push(d);
        pairs.push({ g: gname, a: rs[i].key, b: rs[j].key, d: round(d, 1) });
      }
      ds.sort((a, b) => a - b);
      per[gname] = { n: rs.length, pairs: ds.length, anchor: round(anchor, 1),
                     mean: round(ds.reduce((a, b) => a + b, 0) / ds.length, 1),
                     min: round(ds[0], 1),
                     confusable: ds.filter((d) => d < anchor).length };
    }
    pairs.sort((a, b) => a.d - b.d);
    res.zooms[z] = per;
    res.worst[z] = pairs.slice(0, 14);
  }
  for (const r of recs) res.sizes[r.key] = { ...r.size[3], group: GROUP(r) };
  return res;
}

function reportOne(m) {
  const L = [];
  L.push(`  ── ${m.label}`);
  for (const z of ZOOMS) {
    L.push(`    zoom ${z}${z === 1 ? '  (the game default)' : '  (ZMIN)'}   threshold ${m.anchor[z]}`);
    L.push('      group      n   pairs   mean    min   CONFUSABLE');
    for (const [g, v] of Object.entries(m.zooms[z]))
      L.push(`      ${g.padEnd(9)} ${String(v.n).padStart(2)}   ${String(v.pairs).padStart(5)}  ${String(v.mean).padStart(5)}  ${String(v.min).padStart(5)}   ${String(v.confusable).padStart(4)}`);
    L.push('      worst pairs (over every facing combination):');
    for (const p of m.worst[z].slice(0, 8))
      L.push(`        ${String(p.d).padStart(5)}  ${p.a} | ${p.b}${p.d < m.anchor[z] ? '   << under the friend-vs-foe floor' : ''}`);
    L.push('');
  }
  return L.join('\n');
}

function report(ms) {
  const L = [];
  L.push('unit legibility — the picture, at the size it is DRAWN, on the game\'s ground');
  L.push(`  ${Object.keys(ms[0].sizes).length} units. THRESHOLD = the median distance between the SAME`);
  L.push('  unit in the two owners\' colours — a pair of different units scoring below it is');
  L.push('  less distinguishable than friend-from-foe, which the player must do every second.');
  L.push('');
  L.push('  THREE WINDOWS. They disagree, and that is the point: the shipped 28 px box');
  L.push('  centre-crops every unit drawn bigger than it, throwing away the head, the');
  L.push('  weapon and the feet. Each window carries its OWN threshold, so a number from');
  L.push('  one says nothing about a number from another. Never cite one alone.');
  L.push('');
  for (const m of ms) L.push(reportOne(m));
  return L.join('\n');
}

async function main() {
  const wantSheet = process.argv.includes('--sheet');
  const { recs, pageErrors, sheetPng } = await measure({ sheet: wantSheet });
  if (pageErrors.length) { console.error('PAGE ERRORS:\n  ' + pageErrors.join('\n  ')); process.exitCode = 1; }
  const ms = VIEWS.map((v) => compute(recs, v));
  console.log(report(ms));
  if (sheetPng) {
    fs.mkdirSync(OUT, { recursive: true });
    const f = path.join(OUT, 'legibility-sheet.png');
    fs.writeFileSync(f, Buffer.from(sheetPng, 'base64'));
    console.log('  contact sheet: ' + f + '  — LOOK AT IT');
  }
  const m = ms[0];                       // --json keeps the shipped window's shape
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
    fs.mkdirSync(path.dirname(process.argv[jsonAt + 1]), { recursive: true });
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(m, null, 2) + '\n');
    console.log('wrote ' + process.argv[jsonAt + 1]);
  }
}
if (require.main === module) main();
module.exports = { measure, compute, report, CONFUSABLE, ZOOMS };
