#!/usr/bin/env node
// ONE UNIT, BOTH SURFACES, NEXT TO THE REAL THING.
//
//   node apps/games/rts/tools/unit-compare.js rifle [conscript ...]
//
// The aggregate tools (legibility.js, cameo-legibility.js) answer "is the SET
// separable". They cannot answer "does the Rocketeer read as a Rocketeer",
// which is the question that actually decides whether the art is good — and it
// has to be asked of BOTH surfaces at once, because a unit is met twice: as a
// menu item you click and as a thing on the ground you command.
//
// So this lays out, per unit and magnified:
//   row 1  our CAMEO at 60x48, the size the sidebar draws it
//   row 2  our MAP SPRITE at zoom 1, four bearings, on the game's own ground
//   row 3  RA2's own cameo plate for the same unit, when the corpus has one
//
// Output: apps/games/rts/art/out/cmp-<key>.png
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const OUT = path.join(RTS, 'art', 'out');
const REF = path.join(RTS, 'docs', 'ra2-ref', 'cameos');
const ZOOM = Number(process.env.CMP_ZOOM || 1);
const MAG = Number(process.env.CMP_MAG || 4);
// Half the naval roster is Collective, and seat 0 was hard-wired to the
// Directorate — so `dread`, `sub`, `seascorp`, `squid` and `apc` printed
// "(not in the panel)" where their cameo should be and the whole point of the
// rig (BOTH surfaces) quietly became one surface. Set per unit from its own
// `fac`, with CMP_FAC to force it.

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

async function main() {
  const keys = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (!keys.length) { console.error('usage: unit-compare.js <unitKey> [...]'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });

  const srv = await serve();
  const browser = await playwright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/rts.html`);
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });

  // A base with every prerequisite, so the panel can show anything. Rebuilt
  // per faction, because the build panel only lists the seat's own roster.
  const buildBase = async (fac) => await page.evaluate((f) => {
    const H = window.__rtsTest, g = H.begin(4242, 'normal');
    g.side[0].fac = f; g.side[1].fac = f === 'col' ? 'dir' : 'col';
    H.give(0, 9999999);
    const s = g.start[0];
    ['base', 'power', 'power', 'power', 'power', 'barracks', 'factory', 'radar',
     'lab', 'airforce', 'shipyard', 'depot', 'refinery'].forEach((k, i) => {
      try { H.build(k, 0, s.x - 12 + (i % 5) * 4, s.y - 10 + ((i / 5) | 0) * 5); } catch (e) {}
    });
    const ov = document.getElementById('ov'); if (ov) ov.classList.remove('show');
    H.step(40);
  }, fac);

  let baseFac = null;
  for (const key of keys) {
    const want = process.env.CMP_FAC || await page.evaluate((k) => {
      const T = window.__rtsTables;
      const d = (T.UNITS[k] || T.BLDS[k] || {});
      return d.fac === 'col' ? 'col' : 'dir';
    }, key);
    if (want !== baseFac) { await buildBase(want); baseFac = want; }
    const refFile = path.join(REF, key + '.png');
    const refB64 = fs.existsSync(refFile) ? fs.readFileSync(refFile).toString('base64') : null;
    const ok = await page.evaluate(async (cfg) => {
      const H = window.__rtsTest, T = window.__rtsTables, U = T.UNITS, B = T.BLDS;
      const d = U[cfg.key] || B[cfg.key];
      if (!d) return 'no such key';
      const isBld = !U[cfg.key];

      // ---- our cameo: take it off the live panel, which is what ships ----
      let cameo = null;
      for (const tab of ['b', 'd', 'i', 'v']) {
        const t = document.querySelector('.ptab div[data-tab="' + tab + '"]');
        if (t) t.click();
        for (const pit of document.querySelectorAll('#plist .pit')) {
          const nm = pit.querySelector('.nm');
          if (nm && nm.textContent.trim() === d.name) {
            cameo = { plate: pit.querySelector('.em canvas:not(.cap)'),
                      cap: pit.querySelector('.em canvas.cap') };
            break;
          }
        }
        if (cameo) break;
      }

      // ---- our map sprite, composed exactly as drawUnit composes it ----
      const S = H.spr();
      const shots = [];
      if (!isBld) {
        const art = S.unit[0][d.fac === 'col' ? 'col' : 'dir'][cfg.key] || S.unit[0].dir[cfg.key];
        const faces = Array.isArray(art) ? [0, 2, 4, 6] : [0];
        for (const f of faces) {
          const fr = Array.isArray(art) ? art[f] : art;
          if (fr && fr.c) shots.push(fr);
        }
      } else {
        const A = S.bld[0][d.fac === 'col' ? 'col' : 'dir'][cfg.key] || S.bld[0].dir[cfg.key];
        if (A && A.s) shots.push(A.s);
      }

      const M = cfg.mag, CW = 60, CH = 48, PAD = 10;
      const spriteW = shots.reduce((a, f) => a + Math.round(f.w * cfg.zoom) * M + PAD, PAD);
      const W = Math.max(CW * M * 2 + PAD * 3, spriteW, 520);
      const H2 = PAD + CH * M + PAD + 22
               + (shots.length ? Math.max(...shots.map((f) => Math.round(f.h * cfg.zoom) * M)) + PAD + 22 : 0)
               + (cfg.ref ? CH * M + PAD + 22 : 0) + PAD;
      const c = document.createElement('canvas');
      c.width = W; c.height = H2;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#0c1016'; g.fillRect(0, 0, W, H2);
      g.fillStyle = '#8fa2bb'; g.font = '12px system-ui, sans-serif';

      let y = PAD;
      g.fillText('OURS — cameo, ' + CW + 'x' + CH + ' at ' + M + 'x', PAD, y + 11); y += 18;
      if (cameo && cameo.plate) {
        g.drawImage(cameo.plate, PAD, y, CW * M, CH * M);
        if (cameo.cap) g.drawImage(cameo.cap, PAD, y, CW * M, CH * M);
      } else { g.fillStyle = '#e07a7a'; g.fillText('(not in the panel)', PAD, y + 14); g.fillStyle = '#8fa2bb'; }
      y += CH * M + PAD;

      if (shots.length) {
        g.fillText('OURS — in play, zoom ' + cfg.zoom + ' on the game ground, ' + M + 'x', PAD, y + 11); y += 18;
        let x = PAD;
        const rowH = Math.max(...shots.map((f) => Math.round(f.h * cfg.zoom) * M));
        g.fillStyle = d.nav ? '#2c5d86' : '#5c6e3e';
        g.fillRect(0, y, W, rowH);
        for (const f of shots) {
          const dw = Math.round(f.w * cfg.zoom) * M, dh = Math.round(f.h * cfg.zoom) * M;
          g.drawImage(f.c, 0, 0, f.c.width, f.c.height, x, y + rowH - dh, dw, dh);
          x += dw + PAD;
        }
        g.fillStyle = '#8fa2bb';
        y += rowH + PAD;
      }

      if (cfg.ref) {
        g.fillText('RA2 — the real plate, ' + M + 'x', PAD, y + 11); y += 18;
        const im = new Image();
        await new Promise((res) => { im.onload = res; im.onerror = res; im.src = 'data:image/png;base64,' + cfg.ref; });
        if (im.width) g.drawImage(im, PAD, y, CW * M, CH * M);
      }
      window.__cmp = c.toDataURL('image/png');
      return 'ok';
    }, { key, ref: refB64, mag: MAG, zoom: ZOOM });

    if (ok !== 'ok') { console.error(key + ': ' + ok); continue; }
    const data = await page.evaluate(() => window.__cmp);
    const file = path.join(OUT, 'cmp-' + key + '.png');
    fs.writeFileSync(file, Buffer.from(String(data).split(',')[1], 'base64'));
    console.log('wrote ' + file + (refB64 ? '' : '   (no RA2 reference for this key)'));
  }

  if (errs.length) { console.error('PAGE ERRORS:\n  ' + errs.join('\n  ')); process.exitCode = 1; }
  await browser.close(); srv.close();
}
main();
