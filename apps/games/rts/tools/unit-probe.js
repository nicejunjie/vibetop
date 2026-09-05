#!/usr/bin/env node
// ONE UNIT, ONE BEARING, AS NUMBERS — the companion to unit-compare.js.
//
//   node apps/games/rts/tools/unit-probe.js <key> [<key>...] [octant]
//   MAG=12 node apps/games/rts/tools/unit-probe.js dolphin 3
//
// `unit-compare.js` lays a unit out to LOOK at; this prints the same sprite as
// something you can MEASURE, which is what a §2 pixel budget actually asks for
// ("carapace value >= 0.70 across >= 40% of the torso", "ushanka flaps break
// the head outline >= 2 px each side", "legs >= 20 hue-degrees off the GI's
// olive"). Judging those by eye is how a clause stays unmet for months.
//
// Per key it writes art/out/probe-<key>-o<oct>.png (nearest-neighbour, MAG x)
// and prints:
//   * the bbox, aspect, sheet cell and opaque count
//   * per row: width, how many of those pixels are OWNER remap, and the span
//   * an ASCII map — 'O' where the owner-0 and owner-1 bakes DIFFER (i.e. the
//     remap, found empirically, not from a palette), a lowercase letter for a
//     saturated fixed hue, a digit for the value band of a fixed grey
//   * the non-remap palette by share, with h/s/v
//
// The ASCII map is the useful half. It is what showed the Dolphin's eye baking
// as a DETACHED 2x3 blob four pixels clear of her in open water — invisible in
// a 4x contact sheet, unmissable as two '0's with a gap of spaces after them.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const OUT = path.join(RTS, 'art', 'out');
function playwright() {
  try { return require('playwright'); }
  catch (e) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}
const SERVE = {
  '/rts.html': [path.join(RTS, 'rts.html'), 'text/html'],
  '/gamescore.js': [path.join(ROOT, 'shared', 'gamescore.js'), 'text/javascript'],
  '/vibe-modal.js': [path.join(ROOT, 'shared', 'vibe-modal.js'), 'text/javascript'],
};
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const e = SERVE[req.url.split('?')[0]];
      if (!e) { rep.writeHead(404); rep.end(); return; }
      rep.writeHead(200, { 'content-type': e[1], 'cache-control': 'no-store' });
      rep.end(fs.readFileSync(e[0]));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

function inPage(arg) {
  const keys = arg[0], oct = arg[1], mag = arg[2];
  const S = window.__rtsTest.spr(), U = window.__rtsTables.UNITS;
  function compose(art, face) {
    const layers = [];
    if (Array.isArray(art)) {
      if (art.hull && art.turret) { layers.push(art.hull[face]); layers.push(art.turret[face]); }
      else if (art.lay) { const L = art.lay(); layers.push(L.hull[face]); layers.push(L.gond[face]); }
      else layers.push(art[face]);
    } else if (art.fr) layers.push(art.fr('stand', face, 0));
    else layers.push(art);
    const base = layers[0];
    const c = document.createElement('canvas'); c.width = base.w; c.height = base.h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (const s of layers) if (s) g.drawImage(s.c, 0, 0, s.w, s.h);
    return { c, g, W: base.w, H: base.h };
  }
  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn;
    let h = 0;
    if (dv) {
      if (mx === r) h = ((g - b) / dv + 6) % 6;
      else if (mx === g) h = (b - r) / dv + 2;
      else h = (r - g) / dv + 4;
      h *= 60;
    }
    return { h, s: mx ? dv / mx : 0, v: mx / 255 };
  }
  const out = {};
  for (const key of keys) {
    const d = U[key], fk = d.fac || 'dir';
    const cm = compose(S.unit[0][fk][key], oct * 4);
    const cb = compose(S.unit[1][fk][key], oct * 4);
    const id = cm.g.getImageData(0, 0, cm.W, cm.H).data;
    const ib = cb.g.getImageData(0, 0, cm.W, cm.H).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < cm.H; y++) for (let x = 0; x < cm.W; x++)
      if (id[(y * cm.W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // per-row: width, owner-remap count, silver count
    const rows = [];
    let opaque = 0, remap = 0;
    for (let y = 0; y < bh; y++) {
      let w = 0, rp = 0, xa = 1e9, xb = -1;
      for (let x = 0; x < bw; x++) {
        const i = ((y + y0) * cm.W + (x + x0)) * 4;
        if (id[i + 3] <= 8) continue;
        w++; opaque++;
        if (x < xa) xa = x; if (x > xb) xb = x;
        const dd = Math.abs(id[i] - ib[i]) + Math.abs(id[i + 1] - ib[i + 1]) + Math.abs(id[i + 2] - ib[i + 2]);
        if (dd > 24) { rp++; remap++; }
      }
      rows.push({ y, w, rp, xa: xb < 0 ? null : xa, xb: xb < 0 ? null : xb });
    }
    // colour census of NON-remap pixels, quantised
    const bag = {};
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = ((y + y0) * cm.W + (x + x0)) * 4;
      if (id[i + 3] <= 8) continue;
      const dd = Math.abs(id[i] - ib[i]) + Math.abs(id[i + 1] - ib[i + 1]) + Math.abs(id[i + 2] - ib[i + 2]);
      if (dd > 24) continue;
      const k = ((id[i] >> 3) << 10) | ((id[i + 1] >> 3) << 5) | (id[i + 2] >> 3);
      if (!bag[k]) bag[k] = { n: 0, r: id[i], g: id[i + 1], b: id[i + 2] };
      bag[k].n++;
    }
    const pal = Object.values(bag).sort((a, b) => b.n - a.n).slice(0, 14).map((q) => {
      const h = rgb2hsv(q.r, q.g, q.b);
      return { hex: '#' + [q.r, q.g, q.b].map((v) => v.toString(16).padStart(2, '0')).join(''),
               n: q.n, pct: +(q.n / opaque * 100).toFixed(1),
               h: Math.round(h.h), s: +h.s.toFixed(2), v: +h.v.toFixed(2) };
    });
    // ASCII map: O = owner remap; digits = value band of a fixed colour;
    // lowercase letter = a saturated fixed hue (r/o/y/g/c/b/m).
    const map = [];
    for (let y = 0; y < bh; y++) {
      let line = '';
      for (let x = 0; x < bw; x++) {
        const i = ((y + y0) * cm.W + (x + x0)) * 4;
        if (id[i + 3] <= 8) { line += ' '; continue; }
        const dd = Math.abs(id[i] - ib[i]) + Math.abs(id[i + 1] - ib[i + 1]) + Math.abs(id[i + 2] - ib[i + 2]);
        if (dd > 24) { line += 'O'; continue; }
        const q = rgb2hsv(id[i], id[i + 1], id[i + 2]);
        if (q.s > 0.30 && q.v > 0.16) {
          line += 'rroyyggccbbmm r'[Math.min(14, Math.floor(q.h / 26))] || 'x';
        } else line += String(Math.min(9, Math.floor(q.v * 10)));
      }
      map.push(line);
    }
    // magnified PNG
    const mc = document.createElement('canvas');
    mc.width = bw * mag; mc.height = bh * mag;
    const mg = mc.getContext('2d'); mg.imageSmoothingEnabled = false;
    mg.fillStyle = '#2c6a99'; mg.fillRect(0, 0, mc.width, mc.height);
    mg.drawImage(cm.c, x0, y0, bw, bh, 0, 0, bw * mag, bh * mag);
    out[key] = { bw, bh, aspect: +(bw / bh).toFixed(3), cell: [cm.W, cm.H],
                 opaque, ownerPct: +(remap / opaque).toFixed(4), rows, pal, map,
                 png: mc.toDataURL('image/png').split(',')[1] };
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const keys = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a));
  const oct = Number(args.find((a) => /^\d+$/.test(a)) || 3);
  const mag = Number(process.env.MAG || 8);
  const srv = await serve();
  const port = srv.address().port;
  const { chromium } = playwright();
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${port}/rts.html`, { waitUntil: 'load' });
  await pg.waitForFunction('!!window.__rtsTest');
  const res = await pg.evaluate(inPage, [keys, oct, mag]);
  await br.close(); srv.close();
  fs.mkdirSync(OUT, { recursive: true });
  for (const k of Object.keys(res)) {
    const r = res[k];
    fs.writeFileSync(path.join(OUT, `probe-${k}-o${oct}.png`), Buffer.from(r.png, 'base64'));
    delete r.png;
    console.log(`\n=== ${k} oct${oct} ===`);
    console.log(`bbox ${r.bw}x${r.bh} aspect ${r.aspect} cell ${r.cell} opaque ${r.opaque} ownerPct ${r.ownerPct}`);
    console.log('rows (y: width / remap / xa-xb):');
    console.log(r.rows.map((q) => `${q.y}: ${q.w}/${q.rp} [${q.xa}-${q.xb}]`).join('  '));
    console.log('map (O=owner, digit=value*10 of a fixed grey, letter=fixed hue):');
    r.map.forEach((l, i) => console.log(String(i).padStart(3) + ' |' + l + '|'));
    console.log('palette (non-remap):');
    for (const p of r.pal) console.log(`  ${p.hex} ${String(p.pct).padStart(5)}%  h${String(p.h).padStart(3)} s${p.s} v${p.v}`);
  }
  if (errs.length) console.log('PAGE ERRORS', errs);
}
main();
