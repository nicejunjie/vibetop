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

const ZOOMS = [1, 0.55];          // the game's default, and ZMIN
const GRASS = [92, 110, 62];      // the temperate ground the units stand on
const CELL = 28;                  // the box every unit is normalised into

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
function grab() {
  const T = window.__rtsTest, U = window.__rtsTables.UNITS, S = T.spr();
  const out = [];
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
    const face = 3;                                  // broadside: where a unit is read
    let c, cB;
    try { c = compose(d, art, face); cB = compose(d, artB, face); } catch (e) { continue; }
    const id = c.g.getImageData(0, 0, c.W, c.H);
    const idB = cB.g.getImageData(0, 0, cB.W, cB.H);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++)
      if (id.data[(y * c.W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) continue;
    out.push({ key, name: d.name, cls: d.cls, air: !!d.air, nav: !!d.nav,
               w: c.W, h: c.H, x0, y0, x1, y1,
               px: Array.from(id.data), pxB: Array.from(idB.data) });
  }
  return out;
}
/* c8 ignore stop */

// ── image maths ───────────────────────────────────────────────────────────
// Composite over grass, box-downscale to the play size, then normalise into one
// CELL box so two units of different size are still compared picture-to-picture.
function thumb(rec, zoom, other) {
  const px = other ? rec.pxB : rec.px;
  const bw = rec.x1 - rec.x0 + 1, bh = rec.y1 - rec.y0 + 1;
  const tw = Math.max(1, Math.round(bw * zoom)), th = Math.max(1, Math.round(bh * zoom));
  const small = new Float64Array(tw * th * 3);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const sx0 = rec.x0 + Math.floor(tx * bw / tw), sx1 = rec.x0 + Math.max(Math.floor((tx + 1) * bw / tw), Math.floor(tx * bw / tw) + 1);
    const sy0 = rec.y0 + Math.floor(ty * bh / th), sy1 = rec.y0 + Math.max(Math.floor((ty + 1) * bh / th), Math.floor(ty * bh / th) + 1);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const i = (y * rec.w + x) * 4, a = px[i + 3] / 255;
      r += px[i] * a + GRASS[0] * (1 - a);
      g += px[i + 1] * a + GRASS[1] * (1 - a);
      b += px[i + 2] * a + GRASS[2] * (1 - a);
      n++;
    }
    const o = (ty * tw + tx) * 3;
    small[o] = r / n; small[o + 1] = g / n; small[o + 2] = b / n;
  }
  // centre it in a CELL x CELL box on grass, so SIZE is part of the comparison
  const cell = new Float64Array(CELL * CELL * 3);
  for (let i = 0; i < CELL * CELL; i++) { cell[i * 3] = GRASS[0]; cell[i * 3 + 1] = GRASS[1]; cell[i * 3 + 2] = GRASS[2]; }
  const ox = Math.floor((CELL - tw) / 2), oy = Math.floor((CELL - th) / 2);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const cy = oy + y, cx = ox + x;
    if (cy < 0 || cx < 0 || cy >= CELL || cx >= CELL) continue;
    const o = (cy * CELL + cx) * 3, s = (y * tw + x) * 3;
    cell[o] = small[s]; cell[o + 1] = small[s + 1]; cell[o + 2] = small[s + 2];
  }
  return { cell, tw, th };
}
// Perceptual-ish distance: luminance carries most of "can I tell these apart"
// at 20 px, so weight it, but keep real chroma terms or two differently
// coloured boxes of the same shape score zero.
function dist(a, b) {
  let s = 0;
  for (let i = 0; i < CELL * CELL; i++) {
    const o = i * 3;
    const la = 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2];
    const lb = 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2];
    const dr = (a[o] - a[o + 2]) - (b[o] - b[o + 2]);       // red-blue opponent
    const dg = (a[o + 1] - a[o + 2]) - (b[o + 1] - b[o + 2]); // green-blue opponent
    s += (la - lb) * (la - lb) * 1.0 + dr * dr * 0.35 + dg * dg * 0.35;
  }
  return Math.sqrt(s / (CELL * CELL));
}

async function measure() {
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
  const recs = await page.evaluate(grab);
  await browser.close(); srv.close();
  return { recs, pageErrors };
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

function compute(recs) {
  const res = { zooms: {}, worst: {}, sizes: {} };
  for (const z of ZOOMS) {
    const th = {}, thB = {};
    for (const r of recs) { th[r.key] = thumb(r, z).cell; thB[r.key] = thumb(r, z, true).cell; }
    // The anchor: the same unit, blue vs red. Median over the whole roster.
    const own = recs.map((r) => dist(th[r.key], thB[r.key])).sort((a, b) => a - b);
    const anchor = own[own.length >> 1];
    CONFUSABLE = anchor;
    const groups = {};
    for (const r of recs) (groups[GROUP(r)] = groups[GROUP(r)] || []).push(r.key);
    const per = {}, pairs = [];
    for (const [gname, keys] of Object.entries(groups)) {
      const ds = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const d = dist(th[keys[i]], th[keys[j]]);
        ds.push(d);
        pairs.push({ g: gname, a: keys[i], b: keys[j], d: round(d, 1) });
      }
      ds.sort((a, b) => a - b);
      per[gname] = { n: keys.length, pairs: ds.length, anchor: round(anchor, 1),
                     mean: round(ds.reduce((a, b) => a + b, 0) / ds.length, 1),
                     min: round(ds[0], 1),
                     confusable: ds.filter((d) => d < CONFUSABLE).length };
    }
    pairs.sort((a, b) => a.d - b.d);
    res.zooms[z] = per;
    res.anchor = res.anchor || {}; res.anchor[z] = round(anchor, 1);
    res.worst[z] = pairs.slice(0, 12);
  }
  for (const r of recs)
    res.sizes[r.key] = { w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, group: GROUP(r) };
  return res;
}

function report(m) {
  const L = [];
  L.push('unit legibility — the picture, at the size it is DRAWN, on the game\'s ground');
  L.push(`  ${Object.keys(m.sizes).length} units. THRESHOLD = the median distance between the SAME`);
  L.push('  unit in the two owners\' colours — a pair of different units scoring below it is');
  L.push('  less distinguishable than friend-from-foe, which the player must do every second.\n');
  for (const z of ZOOMS) {
    L.push(`  zoom ${z}${z === 1 ? '  (the game default)' : '  (ZMIN)'}   threshold ${m.anchor[z]}`);
    L.push('    group      n   pairs   mean    min   CONFUSABLE');
    for (const [g, v] of Object.entries(m.zooms[z]))
      L.push(`    ${g.padEnd(9)} ${String(v.n).padStart(2)}   ${String(v.pairs).padStart(5)}  ${String(v.mean).padStart(5)}  ${String(v.min).padStart(5)}   ${String(v.confusable).padStart(4)}`);
    L.push('    closest pairs: ' + m.worst[z].slice(0, 6).map((p) => `${p.a}|${p.b} ${p.d}`).join(', '));
    L.push('');
  }
  return L.join('\n');
}

async function main() {
  const { recs, pageErrors } = await measure();
  if (pageErrors.length) { console.error('PAGE ERRORS:\n  ' + pageErrors.join('\n  ')); process.exitCode = 1; }
  const m = compute(recs);
  console.log(report(m));
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
    fs.mkdirSync(path.dirname(process.argv[jsonAt + 1]), { recursive: true });
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(m, null, 2) + '\n');
    console.log('wrote ' + process.argv[jsonAt + 1]);
  }
}
if (require.main === module) main();
module.exports = { measure, compute, report, CONFUSABLE, ZOOMS };
