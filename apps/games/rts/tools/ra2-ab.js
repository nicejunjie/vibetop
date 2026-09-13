#!/usr/bin/env node
// Our bake, each alternative bake, and the RA2 frame — one command, one image.
//
//   node apps/games/rts/tools/ra2-ab.js kirov \
//        --ref docs/ra2-ref/sprites/library/kirov.png \
//        --alt qwen=/path/to/kirov-qwen.js --alt codex=/path/to/kirov-codex.js
//
// WHY THIS IS A TOOL AND NOT A SCRATCH SCRIPT. The A/B sheet used to be built
// by pasting whatever `cmp-<name>.png` files happened to be on disk, and a
// panel was only re-rendered when I remembered to re-render it. Every stale
// panel looked exactly like a fresh one, so the sheet reported the PREVIOUS
// round of a candidate at least twice, and the user found it both times. Worse,
// twice I reported a fix from the model's own prose — "the tail now has four
// flat fins" — without rendering anything at all.
//
// So this renders EVERY panel itself, in one process, from the files as they
// are on disk right now. A stale panel is not something you can forget to
// avoid; it is not reachable. Each candidate is swapped into the unit's real
// art file, baked, and swapped back out, and the original is restored even if a
// candidate throws.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts.js');

const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const OUT = path.join(RTS, 'art/out');
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

/** Find the art file a unit key is drawn by. */
function artFileFor(key) {
  for (const cls of ['infantry', 'vehicles', 'aircraft', 'ships', 'structures']) {
    const p = path.join(RTS, 'rts/units', cls, key + '.js');
    if (fs.existsSync(p)) return p;
  }
  // the roster key and the art file sometimes differ (prismtank -> spectre.js)
  const src = fs.readFileSync(path.join(RTS, 'rts/bake/vehicles.js'), 'utf8')
    + fs.readFileSync(path.join(RTS, 'rts/bake/ships.js'), 'utf8');
  const m = new RegExp("kind === '" + key + "'[\\s\\S]{0,400}?draw(\\w+)\\(").exec(src);
  if (m) {
    const n = m[2].toLowerCase();
    for (const cls of ['vehicles', 'aircraft', 'ships']) {
      const p = path.join(RTS, 'rts/units', cls, n + '.js');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

(async () => {
  const argv = process.argv.slice(2);
  const key = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--ref'
    && argv[argv.indexOf(a) - 1] !== '--alt' && argv[argv.indexOf(a) - 1] !== '--bearing');
  if (!key) { console.error('name a unit key'); process.exit(1); }
  const table = refs();
  const cfg = table[key] || { fac: 'dir', owner: 0 };
  // `indexOf` returns -1 when the flag is absent, and argv[-1 + 1] is argv[0],
  // which is the UNIT NAME — so the default bearing came out +'kirov' = NaN and
  // every panel reported "drew nothing" for a unit that bakes perfectly well.
  const bi = argv.indexOf('--bearing');
  const bearing = bi >= 0 ? +argv[bi + 1] : 13;
  const refArg = argv.indexOf('--ref') >= 0 ? argv[argv.indexOf('--ref') + 1]
    : (cfg.file ? path.join(RTS, 'docs/ra2-ref/sprites', cfg.file) : null);
  const alts = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--alt') continue;
    const [nm, fp] = argv[i + 1].split('=');
    alts.push({ name: nm, file: fp });
  }
  const art = artFileFor(key);
  if (alts.length && !art) { console.error(`no art file found for ${key}`); process.exit(1); }

  const srv = await serve({});
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });

  async function bake() {
    await page.goto(srv.url + '/rts.html');
    await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
    await page.waitForTimeout(2200);
    return page.evaluate(({ key, fac, owner, bearing }) => {
      const H = window.__rtsTest;
      // The REFS table's owner/fac is what the COMPARISON sheet wants, not
      // necessarily a slot the bake fills: the Kirov is registered dir/owner 0
      // and is only baked col/owner 1. Try the registered pair, then the rest,
      // rather than reporting "drew nothing" for a unit that bakes fine.
      var set = null;
      var tries = [[owner, fac], [1 - owner, fac], [owner, fac === 'dir' ? 'col' : 'dir'],
                   [1 - owner, fac === 'dir' ? 'col' : 'dir']];
      for (var ti = 0; ti < tries.length && !set; ti++) {
        var u = H.spr().unit[tries[ti][0]];
        if (u && u[tries[ti][1]]) set = u[tries[ti][1]][key] || null;
      }
      if (!set) return { err: 'no set for ' + key + ' owner ' + owner + ' fac ' + fac };
      let a = Array.isArray(set) ? set[bearing] : set;
      if (a && a.fr) a = a.fr('stand', bearing, 0);
      if (!a) return { err: 'bearing ' + bearing + ' of ' + (Array.isArray(set) ? set.length : 'non-array') + ' is empty' };
      if (!a.c) return { err: 'frame has no canvas; keys ' + Object.keys(a).join(',') };
      const t = document.createElement('canvas');
      t.width = a.w; t.height = a.h;
      const g = t.getContext('2d');
      g.drawImage(a.c, 0, 0, a.w, a.h);
      const d = g.getImageData(0, 0, a.w, a.h).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        if (d[(y * a.w + x) * 4 + 3] < 24) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) return null;
      const o = document.createElement('canvas');
      o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
      o.getContext('2d').drawImage(a.c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
      return { png: o.toDataURL('image/png').slice(22) };
    }, { key, fac: cfg.fac, owner: cfg.owner, bearing });
  }

  // CAPTURE THE ORIGINAL FIRST, AND GUARD EVERYTHING. This used to bake OURS
  // before reading the file it was about to overwrite, so a throw from that
  // first bake escaped the try/finally entirely — and if a previous run had
  // died with a candidate still swapped in, the first bake threw on THAT
  // candidate and the repo kept it. The tool left broken model output sitting
  // in the game's own art directory, which is the one thing it must never do.
  const original = art ? fs.readFileSync(art) : null;
  const panels = [];
  try {
    var r0 = await bake();
    if (r0 && r0.err) console.error('OURS: ' + r0.err);
    panels.push({ name: 'OURS', png: r0 && r0.png, note: r0 && r0.err });
    for (const alt of alts) {
      if (!fs.existsSync(alt.file)) { panels.push({ name: alt.name, png: null, note: 'file missing' }); continue; }
      fs.copyFileSync(alt.file, art);
      let png = null, note = null;
      try { var r = await bake(); png = r && r.png; note = (r && r.err) || (png ? null : 'drew nothing'); }
      catch (e) { note = 'threw: ' + String(e.message || e).slice(0, 60); }
      panels.push({ name: alt.name, png, note });
    }
  } catch (e) {
    panels.push({ name: 'OURS', png: null, note: 'bake threw: ' + String(e.message || e).slice(0, 70) });
  } finally {
    if (original) fs.writeFileSync(art, original);          // always put ours back
  }

  let refB64 = null;
  if (refArg && fs.existsSync(refArg)) refB64 = fs.readFileSync(refArg).toString('base64');

  const sheet = await page.evaluate(async ({ panels, refB64, key }) => {
    async function load(b64) {
      if (!b64) return null;
      const im = new Image();
      await new Promise((ok) => { im.onload = ok; im.onerror = ok; im.src = 'data:image/png;base64,' + b64; });
      return im.naturalWidth ? im : null;
    }
    const imgs = [];
    for (const p of panels) imgs.push({ ...p, img: await load(p.png) });
    const ref = await load(refB64);
    if (ref) imgs.push({ name: 'RA2 reference', img: ref });
    const M = 5, PAD = 20, TOP = 34, GAP = 40;
    const hs = imgs.map((i) => (i.img ? i.img.naturalHeight : 24));
    const ws = imgs.map((i) => (i.img ? i.img.naturalWidth : 80));
    const W = PAD * 2 + ws.reduce((a, b) => a + b * M, 0) + GAP * (imgs.length - 1);
    const H = TOP + Math.max(...hs) * M + 26;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0f1620'; g.fillRect(0, 0, W, H);
    g.font = '13px system-ui';
    let x = PAD;
    for (let i = 0; i < imgs.length; i++) {
      const it = imgs[i];
      g.fillStyle = it.img ? '#e1eefc' : '#e08a8a';
      g.fillText(it.img ? `${it.name}  ${it.img.naturalWidth}x${it.img.naturalHeight}`
        : `${it.name} — ${it.note || 'nothing'}`, x, 22);
      if (it.img) g.drawImage(it.img, x, TOP + (Math.max(...hs) - it.img.naturalHeight) * M,
        it.img.naturalWidth * M, it.img.naturalHeight * M);
      x += ws[i] * M + GAP;
    }
    return c.toDataURL('image/png').slice(22);
  }, { panels, refB64, key });

  await browser.close(); srv.close();
  fs.mkdirSync(OUT, { recursive: true });
  const dst = path.join(OUT, `ab-${key}.png`);
  fs.writeFileSync(dst, Buffer.from(sheet, 'base64'));
  console.log(path.relative(RTS, dst) + '  ' + panels.map((p) => p.name + (p.png ? '' : `(${p.note})`)).join(' | ')
    + (refB64 ? ' | RA2' : ''));
  console.log('every panel was baked in THIS run — none can be stale.');
})();
