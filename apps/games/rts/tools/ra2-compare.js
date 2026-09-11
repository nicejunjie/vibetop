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
  rhino:       { file: 'rhino.png', fac: 'col', owner: 1, name: 'Rhino Tank' },
  flaktrack:   { file: 'soviet-flak-track.png', fac: 'col', name: 'Flak Track' },
  v3:          { file: 'soviet-v3.png', fac: 'col', name: 'V3 Launcher' },
  drone:       { file: 'terror-drone.png', fac: 'col', name: 'Terror Drone' },
  teslatank:   { file: 'soviet-tesla-tank-sheet.png', fac: 'col', name: 'Tesla Tank' },
  prismtank:   { file: 'allied-prism-tank.png', fac: 'dir', name: 'Prism Tank' },
  mcv:         { file: 'allied-mcv.png', extra: 'allied-mcv-voxel.webp', fac: 'dir', name: 'MCV' },
};

function mimeOf(buf) {
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buf.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) return 'image/jpeg';
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
      function mcvReview(ref, voxel, shots, faces) {
        // Pair actual in-game pixels with the same bearing of our canvas
        // sprite. Every direction uses 3x: never stretch each unit to its tile.
        const crops = [[176,130,83,60], [133,154,45,68], [58,129,75,59], [22,89,84,43],
          [58,41,76,51], [136,8,40,61], [179,40,71,55], [202,88,86,45]];
        const labels = ['Front right', 'Front', 'Front left', 'Left side', 'Rear left', 'Rear', 'Rear right', 'Right side'];
        const [c, g] = canvas(1461, 1300);
        g.fillStyle = '#11171e'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#edf4fc'; g.font = 'bold 23px system-ui, sans-serif';
        g.fillText('MCV — original RA2 geometry and material comparison', 22, 34);
        g.fillStyle = '#a7b7c9'; g.font = '13px system-ui, sans-serif';
        g.fillText('Source: Allied MCV Voxel Render.jpg + CNCRA2 Allied MCV.png (C&C Wiki). All paired views below use 3x nearest-neighbour.', 22, 58);
        drawContain(g, voxel, 22, 77, 470, 245);
        g.fillStyle = '#d6e1ec'; g.font = 'bold 17px system-ui, sans-serif';
        g.fillText('Shape and construction', 535, 100);
        g.font = '15px system-ui, sans-serif';
        ['Short raked cab; front axle separated from a rear tandem.',
          'Deep wheel-arch rails, suspended tank, exposed pale hubs.',
          'Blue folded channels inside a bevelled steel saddle.',
          'Rear transverse bridge and exposed paired actuators.'].forEach((s, i) => g.fillText(s, 535, 130 + i * 25));
        g.font = 'bold 17px system-ui, sans-serif'; g.fillText('Metal surfaces', 535, 247);
        g.font = '15px system-ui, sans-serif';
        g.fillText('Plane shading, steel bevel highlights, recessed seams and cast shadow.', 535, 277);
        g.fillText('Paint, bare steel, dark glazing and rubber use separate tones.', 535, 302);
        for (let i = 0; i < 8; i++) {
          const x = 18 + (i % 2) * 718, y = 340 + Math.floor(i / 2) * 239;
          g.fillStyle = '#202a34'; g.fillRect(x, y, 704, 229);
          g.fillStyle = '#ecf0f4'; g.font = 'bold 14px system-ui, sans-serif';
          g.fillText(`${labels[i]} / bearing ${faces[i]}`, x + 12, y + 20);
          const b = crops[i], shot = shots[i], bb = bounds(shot);
          g.drawImage(ref, ...b, x + Math.round((342 - b[2] * 3) / 2), y + 24 + Math.round((198 - b[3] * 3) / 2), b[2] * 3, b[3] * 3);
          g.fillStyle = '#5a645c'; g.fillRect(x + 354, y + 29, 337, 174);
          g.drawImage(shot, ...bb, x + 354 + Math.round((337 - bb[2] * 3) / 2), y + 27 + Math.round((174 - bb[3] * 3) / 2), bb[2] * 3, bb[3] * 3);
          g.fillStyle = '#c0cedd'; g.font = '11px system-ui, sans-serif';
          g.fillText('RA2 in-game sprite', x + 12, y + 219);
          g.fillText('Our game sprite — identical magnification', x + 366, y + 219);
        }
        return c;
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
        let H2 = 790;
        let [c, g] = canvas(W, H2);
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
        const shotScale = Math.min(mag, ...shots.map(shot => {
          const bb = bounds(shot);
          return Math.min((tileW - 18) / bb[2], (tileH - 36) / bb[3]);
        }));
        for (let i = 0; i < shots.length; i++) {
          const col = i % 4, row = (i / 4) | 0;
          const x = originX + col * (tileW + gap), y = 98 + row * (tileH + gap);
          g.fillStyle = bg; g.fillRect(x, y, tileW, tileH);
          const shot = shots[i], bb = bounds(shot);
          const rw = Math.max(1, Math.round(bb[2] * shotScale)), rh = Math.max(1, Math.round(bb[3] * shotScale));
          g.drawImage(shot, bb[0], bb[1], bb[2], bb[3],
            x + Math.round((tileW - rw) / 2), y + 9 + Math.round((tileH - 30 - rh) / 2), rw, rh);
          g.fillStyle = '#d7e4f1'; g.font = '11px system-ui, sans-serif';
          g.fillText(`facing ${faces[i]}`, x + 8, y + tileH - 9);
        }
        g.fillStyle = '#8097ad'; g.font = '11px system-ui, sans-serif';
        g.fillText('Reference images are source rips and may contain their original grass/snow/chroma background.', pad, H2 - 10);
        if (key === 'mcv') { c = mcvReview(ref, extra, shots, faces); H2 = c.height; }

        // Capture the same unit in the real map renderer. This is intentionally
        // a fresh match per key so a previous unit's buildings, camera, or
        // animation cannot contaminate the comparison.
        document.querySelectorAll('.show').forEach(e => e.classList.remove('show'));
        document.body.classList.remove('atmenu');
        const live = H.begin(9300 + wanted.indexOf(key), 'normal', null, true, true);
        // begin() does not run a simulation tick, where debug normally
        // reveals terrain. Reveal explicitly before the first map render.
        live.seen.fill(1);
        // The live renderer is viewed from seat 0 and its shroud hides seat
        // 1's starting area. Put every reference unit on the visible seat and
        // change that seat's faction instead, so Collective and Directorate
        // units are both shown on revealed ground.
        const owner = 0;
        live.side[owner].fac = cfg.fac;
        live.side[1 - owner].fac = cfg.fac === 'col' ? 'dir' : 'col';
        const start = live.start[owner];
        const offsets = [[-5, 0], [-2.5, -2.5], [0, -5], [2.5, -7.5], [-2, 3], [0.5, 0.5], [3, -2], [5.5, -4.5]];
        const spawned = [];
        for (let i = 0; i < offsets.length; i++) {
          const u = H.spawn(key, owner, start.x + offsets[i][0], start.y + offsets[i][1]);
          if (u) { u.face = faces[i]; u.tface = faces[i]; u.stopped = true; spawned.push(u); }
        }
        // A pair of opposing infantry gives the shot a battle context while
        // keeping the unit under review unobscured. They remain stationary;
        // this is an art comparison, not a combat simulation.
        for (let i = 0; i < 2; i++) {
          const e = H.spawn('rifle', 1 - owner, start.x + 12 + i * 2, start.y - 8 + i * 2);
          if (e) { e.face = 20; e.tface = 20; e.stopped = true; }
        }
        H.centerOn(start.x + 0.25, start.y - 2.25); H.zoom(1.35); H.render();
        const liveCanvas = document.querySelector('canvas');
        const gameplay = liveCanvas ? liveCanvas.toDataURL('image/png').split(',')[1] : null;
        // Crop the real canvas around the eight vehicles so the review
        // preserves game-scale detail instead of shrinking a whole viewport.
        let detail = null;
        if (liveCanvas && spawned.length) {
          const positions = spawned.map(u => H.toScreen(u.x, u.y));
          const x = Math.max(0, Math.floor(Math.min(...positions.map(p => p.x)) - 88));
          const y = Math.max(0, Math.floor(Math.min(...positions.map(p => p.y)) - 112));
          const w = Math.min(liveCanvas.width - x, Math.ceil(Math.max(...positions.map(p => p.x)) - x + 88));
          const h = Math.min(liveCanvas.height - y, Math.ceil(Math.max(...positions.map(p => p.y)) - y + 52));
          const [crop, ctx] = canvas(w, h);
          ctx.drawImage(liveCanvas, x, y, w, h, 0, 0, w, h);
          detail = crop;
        }
        const finalH = H2 + 430;
        const [combined, cg] = canvas(W, finalH);
        cg.fillStyle = '#11171e'; cg.fillRect(0, 0, W, finalH);
        cg.drawImage(c, 0, 0);
        cg.fillStyle = '#edf4fc'; cg.font = 'bold 16px system-ui, sans-serif';
        cg.fillText('IN GAME — live map render, eight units at matching bearings', pad, H2 + 25);
        cg.fillStyle = '#162534'; cg.fillRect(pad, H2 + 38, W - pad * 2, 375);
        if (gameplay) {
          const gi = new Image();
          await new Promise(resolve => { gi.onload = resolve; gi.onerror = resolve; gi.src = 'data:image/png;base64,' + gameplay; });
          drawContain(cg, detail || gi, pad + 12, H2 + 50, W - pad * 2 - 24, 350);
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
