#!/usr/bin/env node
// How much DETAIL a sprite carries, ours against the RA2 rip.
//
//   node apps/games/rts/tools/ra2-detail.js            # every registered unit
//   node apps/games/rts/tools/ra2-detail.js rifle dog
//
// ra2-size.js answers "is it the right size". This answers the next question —
// "at that size, does it carry as much information as RA2's does". A sprite can
// match the reference's bbox exactly and still read as a smooth blob, because
// vector shapes with soft gradients resolve to far fewer distinct values than
// hand-placed pixel art does.
//
// Three numbers per sprite, all computed inside the opaque body only:
//   colours  distinct RGB values (quantised to 5 bits/channel, as the eye
//            separates them at this size) per 100 opaque pixels
//   edges    share of opaque pixels whose 4-neighbourhood contains a luma step
//            over 0.12 — hard internal boundaries, i.e. drawn detail
//   steps    distinct luma bands (0.05 wide) the body spans — shading depth
//
// RA2's sprites are the target, not a style: if ours reads 40% of the
// reference's edge density it is a smooth model of the unit, not a drawing of
// it, whatever its silhouette measures.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts.js');

const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const REF_DIR = path.join(RTS, 'docs/ra2-ref/sprites');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));

function refs() {
  const src = fs.readFileSync(path.join(__dirname, 'ra2-compare.js'), 'utf8');
  const body = src.slice(src.indexOf('const REFS = {')).split('\n};')[0];
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*\{([^}]*)\}/gm)) {
    const f = /file:\s*'([^']+)'/.exec(m[2]);
    const fac = /fac:\s*'([^']+)'/.exec(m[2]);
    const owner = /owner:\s*(\d+)/.exec(m[2]);
    if (f) out[m[1]] = { file: f[1], fac: fac ? fac[1] : 'dir', owner: owner ? +owner[1] : 0 };
  }
  return out;
}

// Shared by both sides: measure a decoded RGBA buffer's body detail.
const MEASURE = `(function (d, W, H, dropBg) {
  const on = new Uint8Array(W * H);
  let bg = null;
  if (dropBg) {
    const hist = new Map();
    for (let i = 0, p = 0; p < W * H; p++, i += 4) {
      if (d[i + 3] < 24) continue;
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
    let bk = -1, bn = 0;
    for (const [k, n] of hist) if (n > bn) { bn = n; bk = k; }
    if (bn / (W * H) > 0.06) bg = [((bk >> 10) & 31) << 3, ((bk >> 5) & 31) << 3, (bk & 31) << 3];
  }
  const lum = new Float32Array(W * H);
  let n = 0;
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    if (d[i + 3] < 24) continue;
    if (d[i] < 26 && d[i + 1] < 26 && d[i + 2] < 40) continue;
    if (bg) { const a = d[i] - bg[0], b = d[i + 1] - bg[1], c = d[i + 2] - bg[2];
              if (a * a + b * b + c * c < 46 * 46) continue; }
    on[p] = 1; n++;
    lum[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
  }
  if (!n) return null;
  const cols = new Set(), bands = new Set();
  let edge = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!on[p]) continue;
    const i = p * 4;
    cols.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    bands.add(Math.round(lum[p] / 0.05));
    let hard = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (on[q] && Math.abs(lum[q] - lum[p]) > 0.12) { hard = true; break; }
    }
    if (hard) edge++;
  }
  return { px: n, colours: cols.size, edges: edge / n, steps: bands.size };
})`;

(async () => {
  const want = process.argv.slice(2);
  const table = refs();
  const keys = (want.length ? want : Object.keys(table)).filter((k) => table[k]);
  const srv = await serve({});
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(srv.url + '/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const ours = await page.evaluate(({ input, src }) => {
    const measure = eval(src);
    const H = window.__rtsTest, out = {};
    for (const key of Object.keys(input)) {
      const cfg = input[key];
      let art = H.spr().unit[cfg.owner][cfg.fac][key];
      if (!art) { out[key] = null; continue; }
      if (art.fr) art = art.fr('stand', 4, 0);
      const a = Array.isArray(art) ? art[1] : art;
      const c = document.createElement('canvas');
      c.width = a.w; c.height = a.h;
      const g = c.getContext('2d'); g.drawImage(a.c, 0, 0, a.w, a.h);
      out[key] = measure(g.getImageData(0, 0, a.w, a.h).data, a.w, a.h, false);
    }
    return out;
  }, { input: Object.fromEntries(keys.map((k) => [k, table[k]])), src: MEASURE });

  const theirs = {};
  for (const key of keys) {
    const file = path.join(REF_DIR, table[key].file);
    if (!fs.existsSync(file)) { theirs[key] = null; continue; }
    const mime = file.endsWith('.gif') ? 'image/gif' : file.endsWith('.jpg') ? 'image/jpeg'
      : file.endsWith('.webp') ? 'image/webp' : 'image/png';
    theirs[key] = await page.evaluate(async ({ b64, mime, src }) => {
      const measure = eval(src);
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:${mime};base64,${b64}`; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return measure(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, true);
    }, { b64: fs.readFileSync(file).toString('base64'), mime, src: MEASURE });
  }

  await browser.close(); srv.close();

  console.log('unit           ---------- OURS ----------   --------- RA2 ----------   ratio');
  console.log('               px  colours/100px edges steps   px  colours/100px edges steps  col  edge');
  const rows = [];
  for (const key of keys) {
    const o = ours[key], t = theirs[key];
    if (!o || !t) { console.log(`${key.padEnd(14)} ${!o ? 'no bake' : 'no reference'}`); continue; }
    const od = o.colours / o.px * 100, td = t.colours / t.px * 100;
    const cr = od / td, er = o.edges / (t.edges || 1e-6);
    rows.push({ key, cr, er });
    console.log(`${key.padEnd(14)}${String(o.px).padStart(5)}${od.toFixed(1).padStart(10)}` +
      `${(o.edges * 100).toFixed(0).padStart(7)}%${String(o.steps).padStart(6)}` +
      `${String(t.px).padStart(6)}${td.toFixed(1).padStart(10)}${(t.edges * 100).toFixed(0).padStart(7)}%${String(t.steps).padStart(6)}` +
      `${cr.toFixed(2).padStart(6)}${er.toFixed(2).padStart(6)}`);
  }
  const thin = rows.filter((r) => r.er < 0.8);
  console.log(`\n${rows.length} compared. ${thin.length} carry under 80% of the reference's edge density:`);
  console.log('  ' + thin.sort((a, b) => a.er - b.er).map((r) => `${r.key} ${r.er.toFixed(2)}`).join('  '));
})();
