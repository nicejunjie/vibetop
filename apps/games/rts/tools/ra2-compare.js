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
const { serve } = require('./lib/serve-rts.js');

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
  warminer:    { file: 'soviet-war-miner.png', fac: 'col', owner: 1, name: 'War Miner' },
  lancer:      { file: 'allied-grizzly-tank.png', fac: 'dir', name: 'Grizzly Tank' },
  // The Apocalypse rip is the Soviet red remap. Use the red seat for the
  // static bake so the comparison reads against the same in-play palette;
  // the live map below still uses the revealed owner-0 scene for context.
  mammoth:     { file: 'apocalypse.png', fac: 'col', owner: 1, name: 'Apocalypse' },
  ifv:         { file: 'allied-ifv.png', extra: 'allied-ifv-voxel.png', fac: 'dir', name: 'IFV' },
  mirage:      { file: 'allied-mirage-tank.png', fac: 'dir', name: 'Mirage Tank' },
  rhino:       { file: 'rhino.png', fac: 'col', owner: 1, name: 'Rhino Tank' },
  // The Flak Track rip is the Soviet red remap, so bake the static view on the
  // red seat to match it; the live map below still uses the owner-0 scene.
  flaktrack:   { file: 'soviet-flak-track.png', fac: 'col', owner: 1, name: 'Flak Track' },
  v3:          { file: 'soviet-v3.png', fac: 'col', name: 'V3 Launcher' },
  // The ONLY genuine sprite rip we hold for anything that is not infantry.
  // `terror-drone.png` is a 258x222 promotional render — fine for reading what
  // parts the thing has, useless as a size reference, and it was the size
  // reference. `drone-animation.gif` is the real SHP: 26x20, 16 colours, and
  // 100% of its pixels on RA2's 0x33 palette grid (the render manages 1.6%).
  drone:       { file: 'library/drone-animation.gif', extra: 'terror-drone.png', fac: 'col', name: 'Terror Drone' },
  teslatank:   { file: 'soviet-tesla-tank-sheet.png', fac: 'col', owner: 1, name: 'Tesla Tank' },
  prismtank:   { file: 'allied-prism-tank.png', fac: 'dir', name: 'Prism Tank' },
  mcv:         { file: 'allied-mcv.png', extra: 'allied-mcv-voxel.webp', fac: 'dir', name: 'MCV' },
  smcv:        { file: 'library/mcv-col.png', fac: 'col', owner: 1, unit: 'mcv', name: 'Soviet MCV' },
  apc:         { file: 'library/apc.jpg', extra: 'library/apc-voxel.jpg', fac: 'dir', name: 'Amphibious Transport' },

  // ---- infantry -------------------------------------------------------- //
  // The rips are the wiki's animation GIFs: one walk cycle at the SHP's own
  // facings, which is what our lazy facing/state atlas has to match.
  rifle:        { file: 'library/rifle.gif', fac: 'dir', owner: 1, name: 'GI' },
  rocket:       { file: 'library/rocket.gif', fac: 'dir', owner: 1, name: 'Guardian GI' },
  rocketeer:    { file: 'library/rocketeer.gif', fac: 'dir', owner: 1, name: 'Rocketeer' },
  tanya:        { file: 'library/tanya.gif', fac: 'dir', owner: 1, name: 'Tanya' },
  cleg:         { file: 'library/cleg.gif', fac: 'dir', owner: 1, name: 'Chrono Legionnaire' },
  engineer:     { file: 'library/engineer.gif', fac: 'dir', owner: 1, name: 'Engineer' },
  spy:          { file: 'library/spy.gif', fac: 'dir', name: 'Spy' },
  dog:          { file: 'library/dog-dir.gif', extra: 'library/dog-dir-field.png', fac: 'dir', name: 'Attack Dog' },
  conscript:    { file: 'library/conscript.gif', fac: 'col', owner: 1, name: 'Conscript' },
  flak:         { file: 'library/flak.gif', fac: 'col', owner: 1, name: 'Flak Trooper' },
  teslatrooper: { file: 'library/teslatrooper.gif', fac: 'col', owner: 1, name: 'Tesla Trooper' },
  desolator:    { file: 'library/desolator.gif', fac: 'col', owner: 1, name: 'Desolator' },
  ivan:         { file: 'library/ivan.gif', fac: 'col', owner: 1, name: 'Crazy Ivan' },
  yuri:         { file: 'library/yuri.png', fac: 'col', owner: 1, name: 'Yuri' },

  // ---- aircraft -------------------------------------------------------- //
  harrier:      { file: 'library/harrier.png', extra: 'library/harrier-voxel.jpg', fac: 'dir', name: 'Harrier' },
  hornet:       { file: 'library/hornet.jpg', extra: 'library/hornet-voxel.jpg', fac: 'dir', name: 'Hornet' },
  nighthawk:    { file: 'library/nighthawk.png', extra: 'library/nighthawk-voxel.jpg', fac: 'dir', name: 'Nighthawk' },
  kirov:        { file: 'library/kirov.png', extra: 'library/kirov-voxel.jpg', fac: 'col', owner: 1, name: 'Kirov Airship' },

  // ---- naval ----------------------------------------------------------- //
  destroyer:    { file: 'library/destroyer.png', extra: 'library/destroyer-voxel.jpg', fac: 'dir', name: 'Destroyer' },
  aegis:        { file: 'library/aegis.png', extra: 'library/aegis-voxel.jpg', fac: 'dir', name: 'Aegis Cruiser' },
  carrier:      { file: 'library/carrier.png', extra: 'library/carrier-voxel.jpg', fac: 'dir', name: 'Aircraft Carrier' },
  dolphin:      { file: 'library/dolphin.png', fac: 'dir', name: 'Dolphin' },
  lcraft:       { file: 'library/lcraft.jpg', extra: 'library/lcraft-voxel.jpg', fac: 'dir', name: 'Amphibious Transport' },
  dread:        { file: 'library/dread.png', extra: 'library/dread-voxel.jpg', fac: 'col', owner: 1, name: 'Dreadnought' },
  sub:          { file: 'library/sub.png', extra: 'library/sub-voxel.jpg', fac: 'col', owner: 1, name: 'Typhoon Sub' },
  squid:        { file: 'library/squid.png', fac: 'col', owner: 1, name: 'Giant Squid' },
  seascorp:     { file: 'library/seascorp.png', extra: 'library/seascorp-voxel.jpg', fac: 'col', owner: 1, name: 'Sea Scorpion' },
};

function mimeOf(buf) {
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buf.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) return 'image/jpeg';
  return 'image/png';
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
    await page.goto(`${server.url}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest);

    const results = await page.evaluate(async ({ keys: wanted, refs: input, mag, reviewState, reviewPhase }) => {
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
      function compose(art, face, requestedState = 'stand', requestedPhase = 0) {
        let layers;
        if (Array.isArray(art)) {
          if (art.hull && art.turret) layers = [art.hull[face], art.turret[face]];
          else if (art.lay) { const L = art.lay(); layers = [L.hull[face], L.gond[face]]; }
          else layers = [art[face]];
        } else if (art && art.fr) layers = [art.fr(requestedState, face, requestedPhase)];
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
      const minerReview = {};
      const mcvPair = {};
      for (const key of wanted) {
        const cfg = input[key];
        const unitKey = cfg.unit || key;
        const d = T.UNITS[unitKey];
        if (!d) { out[key] = { error: `unknown unit table key ${key}` }; continue; }
        const artOwner = cfg.owner == null ? 0 : cfg.owner;
        const art = H.spr().unit[artOwner][cfg.fac][unitKey];
        if (!art) { out[key] = { error: `missing baked art for ${cfg.fac}/${key}` }; continue; }
        const faces = [0, 4, 8, 12, 16, 20, 24, 28];
        const shots = faces.map(face => compose(art, face, reviewState, reviewPhase)).filter(Boolean);
        const ref = await image(cfg.image);
        const extra = cfg.extraImage ? await image(cfg.extraImage) : null;
        if (key === 'chronominer' || key === 'warminer')
          minerReview[key] = { cfg, shots, ref, faces, art,
            miningShots: art.mine ? [0, 4, 12, 28].map(face => compose(art.mine, face)) : [] };

        const tileW = 185, tileH = 265, gap = 14, pad = 18;
        const leftW = 625, rightW = tileW * 4 + gap * 3;
        const W = pad * 3 + leftW + rightW;
        let H2 = 790;
        let [c, g] = canvas(W, H2);
        g.fillStyle = '#0a1017'; g.fillRect(0, 0, W, H2);
        g.fillStyle = '#edf4fc'; g.font = 'bold 20px system-ui, sans-serif';
        g.fillText(`${cfg.name} (${key}) — real RA2 render vs current ${reviewState} bake`, pad, 29);
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
        const owner = key === 'smcv' ? 1 : 0;
        live.side[owner].fac = cfg.fac;
        live.side[1 - owner].fac = cfg.fac === 'col' ? 'dir' : 'col';
        const start = live.start[owner];
        const offsets = [[-5, 0], [-2.5, -2.5], [0, -5], [2.5, -7.5], [-2, 3], [0.5, 0.5], [3, -2], [5.5, -4.5]];
        const spawned = [];
        for (let i = 0; i < offsets.length; i++) {
          const u = H.spawn(unitKey, owner, start.x + offsets[i][0], start.y + offsets[i][1]);
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
        cg.fillText('IN GAME — live stand poses, eight units at matching bearings', pad, H2 + 25);
        cg.fillStyle = '#162534'; cg.fillRect(pad, H2 + 38, W - pad * 2, 375);
        if (gameplay) {
          const gi = new Image();
          await new Promise(resolve => { gi.onload = resolve; gi.onerror = resolve; gi.src = 'data:image/png;base64,' + gameplay; });
          drawContain(cg, detail || gi, pad + 12, H2 + 50, W - pad * 2 - 24, 350);
        } else {
          cg.fillStyle = '#e07a7a'; cg.font = '12px system-ui, sans-serif';
          cg.fillText('live canvas unavailable', pad + 20, H2 + 70);
        }
        if (key === 'mcv' || key === 'smcv') mcvPair[key] = {ref,shots,detail,art};
        out[key] = {
          png: combined.toDataURL('image/png').split(',')[1], gameplay,
          refWidth: ref.width, refHeight: ref.height, frames: shots.length,
        };
      }

      if (mcvPair.mcv && mcvPair.smcv) {
        const order = [mcvPair.mcv,mcvPair.smcv];
        const crops = [[176,130,83,60],[133,154,45,68],[58,129,75,59],[22,89,84,43],
          [58,41,76,51],[136,8,40,61],[179,40,71,55],[202,88,86,45]];
        const tileW=316,tileH=470,pad=18,colW=tileW*4+pad,W=colW*2+pad*3,boardH=1650;
        const [pair,pg]=canvas(W,boardH);
        pg.fillStyle='#11171e';pg.fillRect(0,0,W,boardH);
        pg.fillStyle='#edf4fc';pg.font='bold 22px sans-serif';
        pg.fillText('RA2 MCVs — Allied wheeled carrier / Soviet tracked carrier',pad,32);
        pg.font='13px sans-serif';pg.fillStyle='#b9c7d6';
        pg.fillText('Source crop directly above current bake; all 8 matching bearings at fixed 3x',pad,54);
        order.forEach(function(item,unit){
          const xBase=pad+unit*(colW+pad);
          pg.fillStyle=unit?'#33252b':'#1c2939';pg.fillRect(xBase,66,colW,1266);
          pg.fillStyle='#edf4fc';pg.font='bold 17px sans-serif';
          pg.fillText(unit?'SOVIET — RA2 tracked MCV':'ALLIED — RA2 wheeled MCV',xBase+8,89);
          for(let q=0;q<8;q++){
            const x=xBase+(q%4)*tileW,y=100+Math.floor(q/4)*tileH;
            pg.fillStyle='#26352b';pg.fillRect(x+2,y+18,tileW-4,442);
            pg.fillStyle='#b8c9d9';pg.font='11px sans-serif';
            pg.fillText('RA2 / bearing '+q*4,x+10,y+14);
            const b=crops[q];
            pg.drawImage(item.ref,...b,x+Math.round((tileW-b[2]*3)/2),y+28,
              b[2]*3,b[3]*3);
            const shot=item.shots[q],bb=bounds(shot);
            pg.fillStyle='#4b633b';pg.fillRect(x+6,y+238,tileW-12,198);
            pg.drawImage(shot,...bb,x+Math.round((tileW-bb[2]*3)/2),y+241,
              bb[2]*3,bb[3]*3);
            pg.fillStyle='#dce4ec';pg.fillText('CURRENT / fixed 3x',x+10,y+455);
          }
          pg.fillStyle='#edf4fc';pg.font='bold 14px sans-serif';
          pg.fillText('LIVE GAMEPLAY — 8 directions',xBase+8,1050);
          pg.fillStyle='#162534';pg.fillRect(xBase+8,1060,colW-16,254);
          if(item.detail)drawContain(pg,item.detail,xBase+12,1064,colW-24,246);
        });
        const live=H.begin(9824,'normal',null,true,true);
        live.seen.fill(1);live.side[0].fac='dir';live.side[1].fac='col';
        const origin=live.start[0],vehicles=[];
        const formation=[
          [0,-5,-4,0],[0,-2.5,-6,4],[0,-5,2,8],[0,-2.5,0,12],
          [1,2,-4,0],[1,4.5,-6,4],[1,2,2,8],[1,4.5,0,12]
        ];
        formation.forEach(function(row){
          const u=H.spawn('mcv',row[0],origin.x+row[1],origin.y+row[2]);
          if(u){u.face=row[3];u.tface=row[3];u.stopped=true;vehicles.push(u);}
        });
        H.centerOn(origin.x,origin.y-2.5);H.zoom(1.35);H.render();
        const liveCanvas=document.querySelector('canvas');
        pg.fillStyle='#edf4fc';pg.font='bold 17px sans-serif';
        pg.fillText('BOTH MCVs IN ONE LIVE SCENE — blue Allied / red Soviet, matching scale',pad,1356);
        pg.fillStyle='#162534';pg.fillRect(pad,1366,W-pad*2,260);
        if(liveCanvas&&vehicles.length){
          const positions=vehicles.map(u=>H.toScreen(u.x,u.y));
          const x=Math.max(0,Math.floor(Math.min(...positions.map(p=>p.x))-110));
          const y=Math.max(0,Math.floor(Math.min(...positions.map(p=>p.y))-130));
          const w=Math.min(liveCanvas.width-x,Math.ceil(Math.max(...positions.map(p=>p.x))-x+110));
          const h=Math.min(liveCanvas.height-y,Math.ceil(Math.max(...positions.map(p=>p.y))-y+70));
          const [crop,cg]=canvas(w,h);cg.drawImage(liveCanvas,x,y,w,h,0,0,w,h);
          drawContain(pg,crop,pad+10,1374,W-pad*2-20,245);
        }
        const [rotation,rg]=canvas(1280,1152);
        rg.fillStyle='#11171e';rg.fillRect(0,0,1280,1152);
        order.forEach(function(item,unit){
          if(!item.art||item.art.length!==32)throw new Error('MCV must have 32 bearings');
          for(let face=0;face<32;face++){
            const shot=compose(item.art,face),bb=bounds(shot);
            if(!shot||bb[0]<=0||bb[1]<=0||bb[0]+bb[2]>=shot.width||bb[1]+bb[3]>=shot.height)
              throw new Error(`MCV frame missing or clipped: ${unit}/${face}`);
            const x=face%8*160,y=(unit*4+Math.floor(face/8))*144;
            rg.fillStyle='#4b633b';rg.fillRect(x+2,y+20,156,120);
            rg.drawImage(shot,...bb,x+(160-bb[2]*2)/2,y+23+(114-bb[3]*2)/2,bb[2]*2,bb[3]*2);
            rg.fillStyle='#edf4fc';rg.font='11px sans-serif';
            rg.fillText(`${unit?'Soviet':'Allied'} / ${face}`,x+5,y+14);
          }
        });
        out.__mcvPair={png:pair.toDataURL('image/png').split(',')[1],rotation:rotation.toDataURL('image/png').split(',')[1]};
      }

      // When both harvesters are requested, build one shared review board.
      // It deliberately uses the same scale and the same live map so relative
      // mass, running gear and faction colour can be judged at a glance.
      if (minerReview.chronominer && minerReview.warminer) {
        const miners = [minerReview.chronominer, minerReview.warminer];
        const reviewBounds = miners.flatMap(item => [...item.shots, ...item.miningShots].map(bounds));
        const tw = Math.max(220, ...reviewBounds.map(bb => Math.ceil(bb[2] * mag) + 12));
        const th = Math.max(202, ...reviewBounds.map(bb => Math.ceil(bb[3] * mag) + 25));
        const sourceCrops = [
          [[180,123,67,50],[135,151,35,53],[63,122,61,51],[31,82,66,43],
            [63,39,63,43],[136,10,34,44],[177,38,69,45],[211,81,66,44]],
          [[197,129,62,51],[149,159,34,53],[76,128,62,53],[40,90,70,41],
            [76,41,62,49],[151,8,36,53],[194,41,67,49],[226,89,67,42]],
        ];
        const referenceBand = Math.ceil(53 * mag) + 28, pairedH = th + referenceBand;
        const pad = 18, colW = tw * 4 + 45, W = colW * 2 + pad * 3;
        const tilesHeight = pairedH * 2 + th + 112, liveY = 400 + tilesHeight + 36, H2 = liveY + 462;
        const [board, bg] = canvas(W, H2);
        bg.fillStyle = '#0b1118'; bg.fillRect(0, 0, W, H2);
        bg.fillStyle = '#edf4fc'; bg.font = 'bold 22px system-ui, sans-serif';
        bg.fillText('RA2 HARVESTERS — Allied Chrono Miner vs Soviet War Miner', pad, 31);
        bg.fillStyle = '#9fb3c9'; bg.font = '12px system-ui, sans-serif';
        bg.fillText('Same magnification, same eight bearings, same live battlefield', pad, 53);

        // Fixed magnification across iterations: auto-fitting hid length
        // changes by making every sprite smaller as soon as one grew.
        const sharedScale = mag;
        for (let m = 0; m < miners.length; m++) {
          const item = miners[m], x0 = pad + m * (colW + pad);
          bg.fillStyle = m ? '#2b1818' : '#15243a'; bg.fillRect(x0, 70, colW, 314);
          bg.fillStyle = '#edf4fc'; bg.font = 'bold 16px system-ui, sans-serif';
          bg.fillText(`${m ? 'SOVIET' : 'ALLIED'} — ${item.cfg.name} / RA2 reference`, x0 + 12, 94);
          drawContain(bg, item.ref, x0 + 12, 105, colW - 24, 265);
          bg.fillStyle = '#102131'; bg.fillRect(x0, 400, colW, tilesHeight);
          bg.fillStyle = '#d7e4f1'; bg.font = 'bold 15px system-ui, sans-serif';
          bg.fillText(`${item.cfg.name} — paired RA2 / current, fixed ${mag}x`, x0 + 12, 424);
          const gap = 9;
          for (let i = 0; i < item.shots.length; i++) {
            const tx = x0 + 9 + (i % 4) * (tw + gap), ty = 438 + ((i / 4) | 0) * (pairedH + 10);
            bg.fillStyle = '#28332b'; bg.fillRect(tx, ty, tw, referenceBand);
            const source = sourceCrops[m][i];
            bg.drawImage(item.ref, ...source, tx + Math.round((tw-source[2]*mag)/2),
              ty + 20 + Math.round((referenceBand-25-source[3]*mag)/2), source[2]*mag, source[3]*mag);
            bg.fillStyle = '#d7e4f1'; bg.font = '10px system-ui, sans-serif';
            bg.fillText(`RA2 / facing ${item.faces[i]}`, tx + 6, ty + 13);
            bg.fillStyle = '#4b633b'; bg.fillRect(tx, ty + referenceBand, tw, th);
            const shot = item.shots[i], bb = bounds(shot);
            const rw = Math.round(bb[2] * sharedScale), rh = Math.round(bb[3] * sharedScale);
            if (rw > tw - 12 || rh > th - 25)
              throw new Error(`Miner review tile too small at fixed ${sharedScale}x: ${item.cfg.name}`);
            bg.drawImage(shot, ...bb, tx + Math.round((tw - rw) / 2),
              ty + referenceBand + 5 + Math.round((th - 25 - rh) / 2), rw, rh);
            bg.fillStyle = '#d7e4f1'; bg.font = '10px system-ui, sans-serif';
            bg.fillText(`CURRENT / facing ${item.faces[i]}`, tx + 6, ty + pairedH - 7);
          }
          const mineY = 438 + 2 * (pairedH + 10) + 24;
          bg.fillStyle = '#d7e4f1'; bg.font = 'bold 14px system-ui, sans-serif';
          bg.fillText('HARVESTING — same scale, extended working gear', x0 + 12, mineY - 8);
          item.miningShots.forEach((shot, i) => {
            const tx = x0 + 9 + i * (tw + gap), bb = bounds(shot);
            const rw = bb[2] * sharedScale, rh = bb[3] * sharedScale;
            bg.fillStyle = '#4b633b'; bg.fillRect(tx, mineY, tw, th);
            bg.drawImage(shot, ...bb, tx + Math.round((tw - rw) / 2),
              mineY + 5 + Math.round((th - 25 - rh) / 2), rw, rh);
            bg.fillStyle = '#d7e4f1'; bg.font = '10px system-ui, sans-serif';
            bg.fillText(`mining / facing ${[0, 4, 12, 28][i]}`, tx + 6, mineY + th - 7);
          });
        }

        const live = H.begin(9876, 'normal', null, true, true);
        live.seen.fill(1); live.side[0].fac = 'dir'; live.side[1].fac = 'col';
        const start = live.start[0], liveUnits = [];
        const formations = [
          ['chronominer', 0, -5.5, -4.0, 0], ['chronominer', 0, -1.8, -6.8, 4],
          ['chronominer', 0, -5.5, 2.0, 8], ['chronominer', 0, -1.8, -0.8, 12],
          ['warminer', 1, 2.2, -4.0, 0], ['warminer', 1, 5.9, -6.8, 4],
          ['warminer', 1, 2.2, 2.0, 8], ['warminer', 1, 5.9, -0.8, 12],
        ];
        for (const [kind, owner, ox, oy, face] of formations) {
          const u = H.spawn(kind, owner, start.x + ox, start.y + oy);
          if (u) { u.face = face; u.tface = face; u.stopped = true; liveUnits.push(u); }
        }
        H.centerOn(start.x + 0.2, start.y - 2.4); H.zoom(1.45); H.render();
        const liveCanvas = document.querySelector('canvas');
        bg.fillStyle = '#edf4fc'; bg.font = 'bold 16px system-ui, sans-serif';
        bg.fillText('IN GAME — both miners together at matching scale', pad, liveY);
        bg.fillStyle = '#162534'; bg.fillRect(pad, liveY + 14, W - pad * 2, 430);
        if (liveCanvas && liveUnits.length) {
          const positions = liveUnits.map(u => H.toScreen(u.x, u.y));
          const x = Math.max(0, Math.floor(Math.min(...positions.map(p => p.x)) - 100));
          const y = Math.max(0, Math.floor(Math.min(...positions.map(p => p.y)) - 125));
          const w = Math.min(liveCanvas.width - x, Math.ceil(Math.max(...positions.map(p => p.x)) - x + 100));
          const h = Math.min(liveCanvas.height - y, Math.ceil(Math.max(...positions.map(p => p.y)) - y + 65));
          const [crop, cg] = canvas(w, h); cg.drawImage(liveCanvas, x, y, w, h, 0, 0, w, h);
          drawContain(bg, crop, pad + 12, liveY + 26, W - pad * 2 - 24, 405);
        }
        out.__miners = { png: board.toDataURL('image/png').split(',')[1] };
        // Review the intermediate bearings as well: eight views alone can
        // hide a bad draw-order transition. Keep every frame at fixed 2x.
        const [rotation, rg] = canvas(1280, 2304);
        rg.fillStyle = '#11171e'; rg.fillRect(0, 0, rotation.width, rotation.height);
        for (let unit = 0; unit < miners.length; unit++) {
          for (let pose = 0; pose < 2; pose++) {
            const atlas = pose ? miners[unit].art.mine : miners[unit].art;
            if (!atlas || atlas.length !== 32) throw new Error('miner must have 32 idle and mining bearings');
            for (let face = 0; face < 32; face++) {
              const shot = compose(atlas, face);
              if (!shot) throw new Error(`missing miner frame ${unit}/${pose}/${face}`);
              const bb = bounds(shot);
              if (bb[0] <= 0 || bb[1] <= 0 || bb[0]+bb[2] >= shot.width || bb[1]+bb[3] >= shot.height)
                throw new Error(`miner frame touches atlas boundary: ${unit}/${pose}/${face}`);
              const x = face % 8 * 160, y = (unit*8 + pose*4 + Math.floor(face/8))*144;
              rg.fillStyle = '#4b633b'; rg.fillRect(x+2, y+22, 156, 120);
              rg.drawImage(shot, ...bb, x+(160-bb[2]*2)/2, y+24+(116-bb[3]*2)/2, bb[2]*2, bb[3]*2);
              rg.fillStyle = '#edf4fc'; rg.font = '11px sans-serif';
              rg.fillText(`${unit ? 'Soviet' : 'Allied'} / ${pose ? 'mining' : 'idle'} / ${face}`, x+5, y+15);
            }
          }
        }
        out.__miners.rotation = rotation.toDataURL('image/png').split(',')[1];
      }
      return out;
    }, { keys, refs, mag: Number(process.env.CMP_MAG || 3),
      reviewState: process.env.CMP_STATE || 'stand', reviewPhase: Number(process.env.CMP_PHASE || 0) });

    for (const key of keys) {
      const result = results[key];
      if (result.error) { console.error(`${key}: ${result.error}`); continue; }
      const reviewState = process.env.CMP_STATE || 'stand';
      const reviewPhase = Number(process.env.CMP_PHASE || 0);
      const poseSuffix = reviewState === 'stand' ? '' : `-${reviewState}-p${reviewPhase}`;
      const file = path.join(OUT, `ra2-compare-${key}${poseSuffix}.png`);
      fs.writeFileSync(file, Buffer.from(result.png, 'base64'));
      if (result.gameplay) {
        fs.writeFileSync(path.join(OUT, `ra2-compare-${key}${poseSuffix}-gameplay.png`), Buffer.from(result.gameplay, 'base64'));
      }
      console.log(`${file}  reference ${result.refWidth}x${result.refHeight}, ${result.frames} baked bearings`);
    }
    if (results.__miners) {
      const file = path.join(OUT, 'ra2-compare-miners.png');
      fs.writeFileSync(file, Buffer.from(results.__miners.png, 'base64'));
      fs.writeFileSync(path.join(OUT, 'ra2-compare-miners-rotation.png'), Buffer.from(results.__miners.rotation, 'base64'));
      console.log(`${file}  shared Allied/Soviet harvester review`);
      console.log('Miner rotation review: 128 idle/mining frames; no atlas-boundary clipping.');
    }
    if (results.__mcvPair) {
      const file=path.join(OUT,'ra2-compare-mcvs.png');
      fs.writeFileSync(file,Buffer.from(results.__mcvPair.png,'base64'));
      console.log(`${file}  shared Allied/Soviet MCV review`);
      fs.writeFileSync(path.join(OUT,'ra2-compare-mcvs-rotation.png'),Buffer.from(results.__mcvPair.rotation,'base64'));
      console.log('MCV rotation review: 64 frames, no atlas-boundary clipping.');
    }
    if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
