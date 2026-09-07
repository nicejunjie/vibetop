#!/usr/bin/env node
// Dump the structure bakes (mask + rgba, the SAME encoding art-metrics.js's
// structure bbox() produces) out of any build of rts.html.
//   ART_HTML=/path/to/build.html node dump-blds.js out.json [key ...]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');   // repo root
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const SERVE = {
  '/rts.html':      [process.env.ART_HTML || path.join(RTS, 'rts.html'), 'text/html'],
  '/gamescore.js':  [path.join(ROOT, 'shared', 'gamescore.js'), 'text/javascript'],
  '/vibe-modal.js': [path.join(ROOT, 'shared', 'vibe-modal.js'), 'text/javascript'],
};
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const hit = SERVE[req.url.split('?')[0]];
      if (!hit || !fs.existsSync(hit[0])) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-store' });
      rep.end(fs.readFileSync(hit[0]));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}
// verbatim transcription of art-metrics.js's structure branch of pageExtract
function pageBlds() {
  const S = window.__rtsTest.spr();
  const blds = [], errors = [];
  const B = window.__rtsTables.BLDS, spec = window.__rtsTables.bspecFor;
  const PAD = 4;
  const bbox = (spr) => {
    const W = Math.ceil(spr.w), H = Math.ceil(spr.h);
    const c = document.createElement('canvas');
    c.width = W + PAD * 2; c.height = H + PAD * 2;
    const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false;
    g2.drawImage(spr.c, PAD, PAD, spr.w, spr.h);
    const id = g2.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
      if (id[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
      m[y * bw + x] = id[((y + y0) * c.width + (x + x0)) * 4 + 3] > 8 ? 1 : 0;
    let bin = '';
    for (let i = 0; i < m.length; i += 0x8000) bin += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
    const rgba = new Uint8Array(bw * bh * 4);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const si = ((y + y0) * c.width + (x + x0)) * 4, di = (y * bw + x) * 4;
      rgba[di] = id[si]; rgba[di + 1] = id[si + 1];
      rgba[di + 2] = id[si + 2]; rgba[di + 3] = id[si + 3];
    }
    let rbin = '';
    for (let i = 0; i < rgba.length; i += 0x8000) rbin += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
    return { w: bw, h: bh, mask: btoa(bin), rgba: btoa(rbin) };
  };
  for (const key of Object.keys(B)) for (const fk of ['dir', 'col']) {
    const A = (S.bld[0][fk] || {})[key];
    if (!A || !A.s) continue;
    let sp = B[key];
    try { sp = spec(key, fk) || sp; } catch (e) { /* keep */ }
    let bb = null;
    try { bb = bbox(A.s); } catch (e) { errors.push('bld ' + key + '/' + fk + ': ' + e); continue; }
    if (!bb) { errors.push('EMPTY ' + key + '/' + fk); continue; }
    blds.push({ key, fac: fk, name: sp.name || B[key].name, cat: B[key].cat,
                gw: sp.gw, gh: sp.gh, w: bb.w, h: bb.h, edges: '',
                mask: bb.mask, rgba: bb.rgba });
  }
  return { blds, errors };
}
(async () => {
  const out = process.argv[2];
  const only = process.argv.slice(3);
  const pw = playwright(); const srv = await serve(); const port = srv.address().port;
  const b = await pw.chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e));
    await p.goto(`http://127.0.0.1:${port}/rts.html`);
    await p.waitForFunction(() => !!window.__rts && !!window.__rtsTables && !!window.__rtsTest, null, { timeout: 30000 });
    const raw = await p.evaluate(pageBlds);
    if (errs.length) console.error('PAGE ERRORS:', errs);
    if (raw.errors.length) console.error('BAKE ERRORS:', raw.errors);
    const keep = only.length ? raw.blds.filter((x) => only.includes(x.key)) : raw.blds;
    fs.writeFileSync(out, JSON.stringify(keep));
    console.error(`wrote ${out}: ${keep.length} records (${keep.map((x) => x.key + ':' + x.fac + ' ' + x.w + 'x' + x.h).join(', ')})`);
  } finally { await b.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
