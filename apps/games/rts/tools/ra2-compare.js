#!/usr/bin/env node
// Compare each baked ground unit with the verified RA2 sprite rip.
//
//   node tools/ra2-compare.js                 # every unit with a local rip
//   node tools/ra2-compare.js rhino lancer     # selected units
//   CMP_MAG=3 node tools/ra2-compare.js       # smaller output files
//
// Each run writes art/out/ra2-compare-<key>.png. The top is the actual RA2
// render from docs/ra2-ref/sprites beside the current game bake at eight
// bearings; the bottom is a live in-game map render of that same unit. A
// separate art/out/ra2-compare-<key>-gameplay.png is written for quick review.
// This is deliberately a separate rig from the cameo comparison: a cameo can
// identify the unit while still lying about its in-play silhouette.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const OUT = path.join(RTS, 'art/out');
const REF_DIR = path.join(RTS, 'docs/ra2-ref/sprites');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));

// These are the exact-title files recorded in docs/ra2-ref/sprites/README.md.
// Keep this table explicit: a fuzzy filename lookup has already produced
// wrong-unit references in this project.
const REFS = {
  chronominer: { file: 'allied-chrono-miner.png', fac: 'dir', name: 'Chrono Miner' },
  warminer:    { file: 'soviet-war-miner.png', fac: 'col', name: 'War Miner' },
  lancer:      { file: 'allied-grizzly-tank.png', fac: 'dir', name: 'Grizzly Tank' },
  // The Apocalypse rip is the Soviet red remap. Use the red seat for the
  // static bake so the comparison reads against the same in-play palette;
  // the live map below still uses the revealed owner-0 scene for context.
  mammoth:     { file: 'apocalypse.png', fac: 'col', owner: 1, name: 'Apocalypse' },
  ifv:         { file: 'allied-ifv.png', extra: 'allied-ifv-voxel.png', fac: 'dir', name: 'IFV' },
  mirage:      { file: 'allied-mirage-tank.png', fac: 'dir', name: 'Mirage Tank' },
  rhino:       { file: 'rhino.png', fac: 'col', name: 'Rhino Tank' },
  flaktrack:   { file: 'soviet-flak-track.png', fac: 'col', name: 'Flak Track' },
  v3:          { file: 'soviet-v3.png', fac: 'col', name: 'V3 Launcher' },
  drone:       { file: 'terror-drone.png', fac: 'col', name: 'Terror Drone' },
  teslatank:   { file: 'soviet-tesla-tank-sheet.png', fac: 'col', name: 'Tesla Tank' },
  prismtank:   { file: 'allied-prism-tank.png', fac: 'dir', name: 'Prism Tank' },
  mcv:         { file: 'allied-mcv.png', fac: 'dir', name: 'MCV' },
};

function mimeOf(buf) {
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  return 'image/png';
}

function serve() {
  const server = http.createServer((req, res) => {
    const name = req.url.split('?')[0];
    const file = name === '/rts.html' ? path.join(RTS, name) : path.join(ROOT, 'shared', name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html',
      'cache-control': 'no-store',
    });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function payload(file) {
  const buf = fs.readFileSync(path.join(REF_DIR, file));
  return { file, mime: mimeOf(buf), data: buf.toString('base64') };
}

async function main() {
  const requested = process.argv.slice(2).filter(k => !k.startsWith('-'));
  const keys = requested.length ? requested : Object.keys(REFS);
  const unknown = keys.filter(k => !REFS[k]);
  if (unknown.length) throw new Error(`no verified sprite rip registered for: ${unknown.join(', ')}`);
  fs.mkdirSync(OUT, { recursive: true });

  const refs = {};
  for (const key of keys) {
    const cfg = REFS[key];
    const mainFile = path.join(REF_DIR, cfg.file);
    if (!fs.existsSync(mainFile)) throw new Error(`missing reference: ${mainFile}`);
    refs[key] = { ...cfg, image: payload(cfg.file), extraImage: cfg.extra ? payload(cfg.extra) : null };
  }

  const server = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest);

    const results = await page.evaluate(async ({ keys: wanted, refs: input, mag }) => {
      const H = window.__rtsTest;
      const T = window.__rtsTables;

      function canvas(w, h) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        return [c, g];
      }
      function bounds(c) {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] < 16) continue;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        return x1 < 0 ? [0, 0, c.width, c.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
      }
      function compose(art, face) {
        let layers;
        if (Array.isArray(art)) {
          if (art.hull && art.turret) layers = [art.hull[face], art.turret[face]];
          else if (art.lay) { const L = art.lay(); layers = [L.hull[face], L.gond[face]]; }
          else layers = [art[face]];
        } else if (art && art.fr) layers = [art.fr('stand', face, 0)];
        else if (art && art.hull && art.turrets) layers = [art.hull[face], art.turrets(0)[face]];
        else layers = [art];
        const base = layers.find(Boolean);
        if (!base) return null;
        const [c, g] = canvas(base.w, base.h);
        for (const s of layers) if (s) g.drawImage(s.c, 0, 0, s.w, s.h);
        return c;
      }
      function dataUrl(ref) { return `data:${ref.mime};base64,${ref.data}`; }
      async function image(ref) {
        const im = new Image();
        await new Promise(resolve => { im.onload = resolve; im.onerror = resolve; im.src = dataUrl(ref); });
        return im;
      }
      function drawContain(g, im, x, y, w, h) {
        if (!im || !im.width) return { w: 0, h: 0 };
        const scale = Math.min(w / im.width, h / im.height);
        const dw = Math.max(1, Math.round(im.width * scale));
        const dh = Math.max(1, Math.round(im.height * scale));
        g.drawImage(im, x + Math.round((w - dw) / 2), y + Math.round((h - dh) / 2), dw, dh);
        return { w: dw, h: dh };
      }

      const out = {};
      for (const key of wanted) {
        const cfg = input[key];
        const d = T.UNITS[key];
        if (!d) { out[key] = { error: `unknown unit table key ${key}` }; continue; }
        const artOwner = cfg.owner == null ? 0 : cfg.owner;
        const art = H.spr().unit[artOwner][cfg.fac][key];
        if (!art) { out[key] = { error: `missing baked art for ${cfg.fac}/${key}` }; continue; }
        const faces = [0, 4, 8, 12, 16, 20, 24, 28];
        const shots = faces.map(face => compose(art, face)).filter(Boolean);
        const ref = await image(cfg.image);
        const extra = cfg.extraImage ? await image(cfg.extraImage) : null;

        const tileW = 185, tileH = 265, gap = 14, pad = 18;
        const leftW = 625, rightW = tileW * 4 + gap * 3;
        const W = pad * 3 + leftW + rightW;
        const H2 = 790;
        const [c, g] = canvas(W, H2);
        g.fillStyle = '#0a1017'; g.fillRect(0, 0, W, H2);
        g.fillStyle = '#edf4fc'; g.font = 'bold 20px system-ui, sans-serif';
        g.fillText(`${cfg.name} (${key}) — real RA2 render vs current bake`, pad, 29);
        g.font = '12px system-ui, sans-serif'; g.fillStyle = '#9fb3c9';
        g.fillText(`Reference: docs/ra2-ref/sprites/${cfg.file}`, pad, 50);
        g.fillText(`OURS: eight canonical bearings, owner ${artOwner} (${cfg.fac})`, pad + leftW + pad, 50);

        g.fillStyle = '#162534'; g.fillRect(pad, 67, leftW, H2 - 85);
        g.fillStyle = '#102131'; g.fillRect(pad + leftW + pad, 67, rightW, H2 - 85);
        g.fillStyle = '#b9c7d6'; g.font = '12px system-ui, sans-serif';
        g.fillText('RA2 reference sheet', pad + 12, 87);
        drawContain(g, ref, pad + 12, 97, leftW - 24, extra ? 510 : H2 - 125);
        if (extra) {
          g.fillStyle = '#b9c7d6'; g.fillText('Voxel reference supplied for the IFV', pad + 12, 625);
          drawContain(g, extra, pad + 12, 636, leftW - 24, 130);
        }

        const bg = d.nav ? '#234d70' : '#4b633b';
        const originX = pad + leftW + pad;
        for (let i = 0; i < shots.length; i++) {
          const col = i % 4, row = (i / 4) | 0;
          const x = originX + col * (tileW + gap), y = 98 + row * (tileH + gap);
          g.fillStyle = bg; g.fillRect(x, y, tileW, tileH);
          const shot = shots[i], bb = bounds(shot);
          const dw = bb[2] * mag, dh = bb[3] * mag;
          const scale = Math.min((tileW - 18) / dw, (tileH - 36) / dh);
          const rw = Math.max(1, Math.round(dw * scale)), rh = Math.max(1, Math.round(dh * scale));
          g.drawImage(shot, bb[0], bb[1], bb[2], bb[3],
            x + Math.round((tileW - rw) / 2), y + 9 + Math.round((tileH - 30 - rh) / 2), rw, rh);
          g.fillStyle = '#d7e4f1'; g.font = '11px system-ui, sans-serif';
          g.fillText(`facing ${faces[i]}`, x + 8, y + tileH - 9);
        }
        g.fillStyle = '#8097ad'; g.font = '11px system-ui, sans-serif';
        g.fillText('Reference images are source rips and may contain their original grass/snow/chroma background.', pad, H2 - 10);

        // Capture the same unit in the real map renderer. This is intentionally
        // a fresh match per key so a previous unit's buildings, camera, or
        // animation cannot contaminate the comparison.
        document.querySelectorAll('.show').forEach(e => e.classList.remove('show'));
        document.body.classList.remove('atmenu');
        const live = H.begin(9300 + wanted.indexOf(key), 'normal', null, false, true);
        // The live renderer is viewed from seat 0 and its shroud hides seat
        // 1's starting area. Put every reference unit on the visible seat and
        // change that seat's faction instead, so Collective and Directorate
        // units are both shown on revealed ground.
        const owner = 0;
        live.side[owner].fac = cfg.fac;
        live.side[1 - owner].fac = cfg.fac === 'col' ? 'dir' : 'col';
        const start = live.start[owner];
        const offsets = [[-6, 0], [-3, 2], [0, -2], [3, 1], [6, -1], [0, 5], [4, 5], [-4, 5]];
        for (let i = 0; i < offsets.length; i++) {
          const u = H.spawn(key, owner, start.x + offsets[i][0], start.y + offsets[i][1]);
          if (u) { u.face = faces[i]; u.tface = faces[i]; u.stopped = true; }
        }
        // A pair of opposing infantry gives the shot a battle context while
        // keeping the unit under review unobscured. They remain stationary;
        // this is an art comparison, not a combat simulation.
        for (let i = 0; i < 2; i++) {
          const e = H.spawn('rifle', 1 - owner, start.x + 12 + i * 2, start.y - 8 + i * 2);
          if (e) { e.face = 20; e.tface = 20; e.stopped = true; }
        }
        H.centerOn(start.x + 1, start.y + 1); H.zoom(1.35); H.render();
        const liveCanvas = document.querySelector('canvas');
        const gameplay = liveCanvas ? liveCanvas.toDataURL('image/png').split(',')[1] : null;
        const finalH = H2 + 430;
        const [combined, cg] = canvas(W, finalH);
        cg.drawImage(c, 0, 0);
        cg.fillStyle = '#edf4fc'; cg.font = 'bold 16px system-ui, sans-serif';
        cg.fillText('IN GAME — live map render, eight units at matching bearings', pad, H2 + 25);
        cg.fillStyle = '#162534'; cg.fillRect(pad, H2 + 38, W - pad * 2, 375);
        if (gameplay) {
          const gi = new Image();
          await new Promise(resolve => { gi.onload = resolve; gi.onerror = resolve; gi.src = 'data:image/png;base64,' + gameplay; });
          drawContain(cg, gi, pad + 12, H2 + 50, W - pad * 2 - 24, 350);
        } else {
          cg.fillStyle = '#e07a7a'; cg.font = '12px system-ui, sans-serif';
          cg.fillText('live canvas unavailable', pad + 20, H2 + 70);
        }
        out[key] = {
          png: combined.toDataURL('image/png').split(',')[1], gameplay,
          refWidth: ref.width, refHeight: ref.height, frames: shots.length,
        };
      }
      return out;
    }, { keys, refs, mag: Number(process.env.CMP_MAG || 3) });

    for (const key of keys) {
      const result = results[key];
      if (result.error) { console.error(`${key}: ${result.error}`); continue; }
      const file = path.join(OUT, `ra2-compare-${key}.png`);
      fs.writeFileSync(file, Buffer.from(result.png, 'base64'));
      if (result.gameplay) {
        fs.writeFileSync(path.join(OUT, `ra2-compare-${key}-gameplay.png`), Buffer.from(result.gameplay, 'base64'));
      }
      console.log(`${file}  reference ${result.refWidth}x${result.refHeight}, ${result.frames} baked bearings`);
    }
    if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
