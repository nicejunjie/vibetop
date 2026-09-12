#!/usr/bin/env node
'use strict';

// Reproducible visual/caching probe for the cliff-seam pass.
//
//   node apps/games/rts/tools/cliff-seams.js before
//   node apps/games/rts/tools/cliff-seams.js after
//
// Both runs render the same Chokepoint Pass ridge at the same seed, camera,
// zoom and DPR. The snow capture changes only the theatre, so geometry and
// framing remain directly comparable with temperate and across builds.

const fs = require('fs');
const { serve } = require('./lib/serve-rts.js');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const OUT = path.join(RTS, 'art', 'out');
const label = (process.argv[2] || '').replace(/[^a-z0-9_-]/gi, '');

if (!label) {
  console.error('usage: node apps/games/rts/tools/cliff-seams.js <label>');
  process.exit(2);
}

function playwright() {
  try { return require('playwright'); }
  catch (_) { return require(path.join(ROOT, 'tests', 'e2e', 'node_modules', 'playwright')); }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const port = server.port;
  const browser = await playwright().chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(`http://127.0.0.1:${port}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });

    const measurements = {};
    for (const theatre of ['temperate', 'snow']) {
      const stats = await page.evaluate((kind) => {
        const T = window.__rtsTest;
        document.querySelectorAll('.show').forEach((el) => el.classList.remove('show'));
        document.body.classList.remove('atmenu');
        T.begin(4242, 'normal', 'choke', false, true);
        const game = T.get();
        game.theatre = kind;
        game.seen.fill(1);
        T.centerOn(32, 31);
        T.zoom(1);

        const sheet = T.spr().cliff[kind];
        const count = () => {
          let banks = 0, slots = 0, bytes = 0;
          const keys = [];
          for (let i = 0; i < sheet.length; i++) {
            const d = Object.getOwnPropertyDescriptor(sheet, i);
            if (!d || d.get) continue;
            if (d.value.stats) {
              banks++;
              const s = d.value.stats();
              slots += s.slots;
              bytes += s.bytes;
              s.keys.forEach((key) => keys.push(`${i}:${key}`));
            } else {
              // Keeps before-build measurements readable if this harness is
              // run against the old one-sprite-per-slot implementation.
              slots++;
              keys.push(String(i));
              bytes += d.value.c.width * d.value.c.height * 4;
            }
          }
          return { banks, slots, bytes, keys };
        };

        const pre = count();
        for (let i = 0; i < 3; i++) T.render();
        return {
          seed: 4242,
          map: 'choke',
          theatre: kind,
          camera: T.cam(),
          zoom: T.zoom(),
          cliffCells: Array.from(game.terrain).filter((v) => v === window.__rtsTables.TER.CLIFF).length,
          cacheBefore: pre,
          cacheAfter: count(),
        };
      }, theatre);

      const png = path.join(OUT, `cliff-seams-${label}-${theatre}.png`);
      await page.locator('#cv').screenshot({ path: png });
      measurements[theatre] = { ...stats, png: path.relative(ROOT, png) };
    }

    const report = { label, dpr: 1, viewport: { width: 1280, height: 720 }, pageErrors, measurements };
    const json = path.join(OUT, `cliff-seams-${label}.json`);
    fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (pageErrors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
