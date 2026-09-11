#!/usr/bin/env node
// Four passenger turrets beside the user's voxel reference, plus all bearings.
// node tools/ifv-compare.js [output-prefix]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));

(async () => {
  const server = http.createServer((req, res) => {
    const name = req.url.split('?')[0];
    const file = name === '/rts.html' ? path.join(RTS, name)
      : path.join(ROOT, 'shared', name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 },
      deviceScaleFactor: Number(process.env.IFV_DPR || 1) });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest);
    const ref = fs.readFileSync(path.join(RTS, 'docs/ra2-ref/sprites/allied-ifv-voxel.png'));
    const result = await page.evaluate(async reference => {
      const art = window.__rtsTest.spr().unit[0].dir.ifv;
      function canvas(w, h) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        return [c, g];
      }
      function compose(type, face) {
        const h = art.hull[face], t = art.turrets(type)[face];
        const [c, g] = canvas(h.w, h.h);
        g.drawImage(h.c, 0, 0, h.w, h.h); g.drawImage(t.c, 0, 0, t.w, t.h);
        return c;
      }
      function bounds(c) {
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, x1 = 0, y0 = c.height, y1 = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] < 16) continue;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
      }
      const refImage = new Image(); refImage.src = reference; await refImage.decode();
      const [comparison, cg] = canvas(1000, 1160);
      cg.fillStyle = '#2c6f9d'; cg.fillRect(0, 0, 1000, 1160);
      cg.font = '16px sans-serif'; cg.fillStyle = 'white';
      ['Reference · side', 'Game · side', 'Reference · front', 'Game · front'].forEach((t, i) => cg.fillText(t, i * 250 + 12, 26));
      const crops = [[45, 80, 190, 166, 390, 50, 240, 230],
        [45, 410, 190, 140, 390, 370, 240, 185],
        [45, 665, 190, 200, 380, 630, 240, 260],
        [45, 1035, 195, 138, 375, 1015, 240, 185]];
      const names = ['Missile · empty / Guardian GI', 'Machine gun · GI / Conscript / Flak',
        'Repair arm · Engineer', 'High-tech · Tesla / Yuri / Chrono'];
      const [sheet, sg] = canvas(1600, 840);
      sg.fillStyle = '#2c6f9d'; sg.fillRect(0, 0, sheet.width, sheet.height);
      sg.font = '14px sans-serif'; sg.fillStyle = 'white';
      for (let type = 0; type < 4; type++) {
        const row = 50 + type * 275;
        cg.fillStyle = 'white'; cg.fillText(names[type], 12, row + 12);
        const crop = crops[type];
        for (let view = 0; view < 2; view++) {
          const [x, y, w, h] = crop.slice(view * 4, view * 4 + 4);
          cg.drawImage(refImage, x, y, w, h, view * 500 + (250 - w) / 2, row + 255 - h, w, h);
          const c = compose(type, view ? 7 : 28), bb = bounds(c);
          // Same BODY width in both views; turret height does not change the scale.
          const body = art.hull[view ? 7 : 28], hb = bounds(body.c);
          const scale = (view ? 225 : 182) / (hb[2] / devicePixelRatio);
          cg.drawImage(c, ...bb, view * 500 + 375 - bb[2] * scale / 2,
            row + 255 - bb[3] * scale, bb[2] * scale, bb[3] * scale);
        }
        for (let i = 0; i < 8; i++) {
          const c = compose(type, i * 4), bb = bounds(c), scale = 2.5;
          sg.drawImage(c, ...bb, i * 200 + 100 - bb[2] * scale / 2,
            type * 210 + 188 - bb[3] * scale, bb[2] * scale, bb[3] * scale);
          sg.fillText(`${type} / facing ${i * 4}`, i * 200 + 12, type * 210 + 205);
        }
      }
      // Every variant must bake without clipping or collapsing onto another model.
      const checks = [];
      for (let owner = 0; owner < 2; owner++) {
        const a = window.__rtsTest.spr().unit[owner].dir.ifv;
        for (let f = 0; f < 32; f++) {
          const hashes = [];
          for (let type = 0; type < 4; type++) {
            const t = a.turrets(type)[f], bb = bounds(t.c);
            if (bb[0] < 2 || bb[1] < 2 || bb[0] + bb[2] > t.c.width - 2 || bb[1] + bb[3] > t.c.height - 2)
              checks.push(`clipped: owner ${owner}, facing ${f}, turret ${type}`);
            hashes.push(t.c.toDataURL());
          }
          if (new Set(hashes).size !== 4) checks.push(`identical variants: owner ${owner}, facing ${f}`);
        }
      }
      return { comparison: comparison.toDataURL().split(',')[1], sheet: sheet.toDataURL().split(',')[1], checks };
    }, `data:image/png;base64,${ref.toString('base64')}`);
    const prefix = process.argv[2] || path.join(RTS, 'art/out/ifv');
    fs.mkdirSync(path.dirname(prefix), { recursive: true });
    for (const key of ['comparison', 'sheet']) {
      const file = `${prefix}-${key}.png`;
      fs.writeFileSync(file, Buffer.from(result[key], 'base64')); console.log(file);
    }
    const boarding = await page.evaluate(() => {
      const H = window.__rtsTest;
      document.querySelectorAll('.show').forEach(e => e.classList.remove('show'));
      document.body.classList.remove('atmenu');
      const state = H.begin(8103, 'normal', null, false, true);
      state.side[0].fac = 'dir';
      const start = state.start[0];
      const failures = [], units = [];
      const riders = [null, 'rifle', 'engineer', 'teslatrooper'];
      for (let i = 0; i < riders.length; i++) {
        const x = start.x + 6 + i * 2.7, y = start.y + 6 - i * 2.7;
        const u = H.spawn('ifv', 0, x, y);
        if (riders[i] && !H.board(u, H.spawn(riders[i], 0, x, y))) failures.push(`boarding failed: ${riders[i]}`);
        if (H.api3.ifvTurret(u) !== i) failures.push(`wrong turret after boarding: ${riders[i]}`);
        if (i && (H.unload(u) !== 1 || H.api3.ifvTurret(u) !== 0)) failures.push(`missile turret not restored: ${riders[i]}`);
        if (i && !H.board(u, H.spawn(riders[i], 0, x, y))) failures.push(`second boarding failed: ${riders[i]}`);
        u.face = 7; u.tface = 7; u.stopped = true; units.push(u);
      }
      H.centerOn(start.x + 10, start.y + 2); H.zoom(1.6); H.render();
      return failures;
    });
    assert.deepEqual(boarding, [], 'passenger changes and unloading');
    await page.locator('canvas').first().screenshot({ path: `${prefix}-gameplay.png` });
    assert.deepEqual(errors, [], 'browser errors');
    assert.deepEqual(result.checks, [], 'IFV facing checks');
    console.log('All four turret models are distinct and unclipped at 32 facings for both owners; boarding and unloading select the correct models.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
