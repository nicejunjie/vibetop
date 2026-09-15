#!/usr/bin/env node
'use strict';

// A visual contact sheet, not a likeness score. Every sprite uses the same
// magnification and keeps its ground anchor; no per-unit auto-fitting.
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts.js');
const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));
const roster = [
  ['rifle', 'dir', 'GI'], ['rocket', 'dir', 'Guardian GI'],
  ['rocketeer', 'dir', 'Rocketeer'], ['tanya', 'dir', 'Tanya'],
  ['cleg', 'dir', 'Chrono Legionnaire'], ['engineer', 'dir', 'Engineer'],
  ['spy', 'dir', 'Spy'], ['conscript', 'col', 'Conscript'],
  ['flak', 'col', 'Flak Trooper'], ['teslatrooper', 'col', 'Tesla Trooper'],
  ['desolator', 'col', 'Desolator'], ['ivan', 'col', 'Crazy Ivan'],
  ['yuri', 'col', 'Yuri'],
];

async function main() {
  const server = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${server.url}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest);
    const png = await page.evaluate(rows => {
      const H = window.__rtsTest;
      const columns = [
        ...[0, 4, 8, 12, 16, 20, 24, 28].map(face => ['stand', face, 0]),
        ['walk', 4, 2], ['walk', 28, 2], ['fire', 4, 2], ['fire', 28, 2],
      ];
      const mag = 3, labelW = 166, tileW = 98, rowH = 156, top = 84;
      const c = document.createElement('canvas');
      c.width = labelW + columns.length * tileW + 16;
      c.height = top + rows.length * rowH + 16;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#101922'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#edf4fc'; g.font = 'bold 22px sans-serif';
      g.fillText('Human infantry — current game sprites', 16, 30);
      g.font = '13px sans-serif'; g.fillStyle = '#b3c5d2';
      g.fillText('Fixed 3x. Eight stand bearings + walk/fire front and side. Visual review; not acceptance.', 16, 53);
      for (let ci = 0; ci < columns.length; ci++) {
        const [state, face] = columns[ci];
        g.fillText(`${state} ${face}`, labelW + ci * tileW + 8, top - 10);
      }
      rows.forEach(([key, fac, name], ri) => {
        const y = top + ri * rowH;
        const art = H.spr().unit[1][fac][key];
        if (!art || !art.fr) throw new Error(`Missing infantry atlas: ${fac}/${key}`);
        g.fillStyle = '#e1eaf2'; g.font = 'bold 13px sans-serif';
        g.fillText(name, 12, y + 32);
        g.fillStyle = '#91a6b5'; g.font = '12px sans-serif';
        g.fillText(key, 12, y + 52);
        columns.forEach(([state, face, phase], ci) => {
          const x = labelW + ci * tileW;
          g.fillStyle = ri % 2 ? '#526448' : '#485e3c';
          g.fillRect(x + 2, y, tileW - 4, rowH - 4);
          const sprite = art.fr(state, face, phase);
          if (!sprite) throw new Error(`Missing frame: ${key}/${state}/${face}`);
          // Use alpha only to trim empty canvas margins. Width and height
          // never determine scale; all figures retain the same 3x pixels.
          const p = sprite.c.getContext('2d').getImageData(0, 0, sprite.c.width, sprite.c.height);
          let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
          for (let py = 0; py < p.height; py++) for (let px = 0; px < p.width; px++) {
            if (p.data[(py * p.width + px) * 4 + 3] < 16) continue;
            x0 = Math.min(x0, px); y0 = Math.min(y0, py);
            x1 = Math.max(x1, px); y1 = Math.max(y1, py);
          }
          if (x1 < x0) throw new Error(`Empty frame: ${key}/${state}/${face}`);
          const w = x1 - x0 + 1, h = y1 - y0 + 1;
          g.drawImage(sprite.c, x0, y0, w, h,
            x + tileW / 2 + (x0 - p.width / 2) * mag,
            y + rowH - 16 - h * mag, w * mag, h * mag);
        });
      });
      return c.toDataURL('image/png').split(',')[1];
    }, roster);
    if (errors.length) throw new Error(errors.join('\n'));
    const output = path.join(RTS, 'art/out/infantry-review.png');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(png, 'base64'));
    console.log(output);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
