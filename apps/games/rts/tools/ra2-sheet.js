#!/usr/bin/env node
// Our art beside RA2's, for a whole class at a time, at a size you can judge.
//
//   node apps/games/rts/tools/ra2-sheet.js                 # every class
//   node apps/games/rts/tools/ra2-sheet.js infantry vehicle
//   node apps/games/rts/tools/ra2-sheet.js --owner 1       # the other house
//
// Writes apps/games/rts/art/out/cmp-<class>-<n>.png, four units per page so
// nothing is a smudge. This exists because every previous comparison was a
// throwaway script, and two of them shipped a picture that could not be read:
// one laid units out on hard-coded column offsets and overlapped them, another
// scaled a 4604-px canvas down into a mosaic. Layout here is computed from the
// measured sprites and the page is capped so it is never downscaled.
//
// IT ALSO LABELS THE REFERENCE. RA2's infantry are SHP sprites and the library
// holds real rips; its vehicles, ships and aircraft are VOXELS, so what sits
// beside those is a promotional render at 300x200 or more. Put one of those
// next to a 24-px tank without saying so and the sheet invites exactly the
// wrong conclusion — that our unit is tiny. A reference is a rip only if every
// channel of every pixel is a multiple of 0x33, which is RA2's palette, and
// the header says which one you are looking at.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts.js');

const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const REF_DIR = path.join(RTS, 'docs/ra2-ref/sprites');
const OUT = path.join(RTS, 'art/out');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));

function refs() {
  const src = fs.readFileSync(path.join(__dirname, 'ra2-compare.js'), 'utf8');
  const body = src.slice(src.indexOf('const REFS = {')).split('\n};')[0];
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*\{([^}]*)\}/gm)) {
    const f = /file:\s*'([^']+)'/.exec(m[2]);
    const fac = /fac:\s*'([^']+)'/.exec(m[2]);
    const name = /name:\s*'([^']+)'/.exec(m[2]);
    const owner = /owner:\s*(\d+)/.exec(m[2]);
    if (f) out[m[1]] = { file: f[1], fac: fac ? fac[1] : 'dir', name: name ? name[1] : m[1], owner: owner ? +owner[1] : 0 };
  }
  return out;
}

const PER_PAGE = 4;

(async () => {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--owner');
  const ownerOverride = oi >= 0 ? +argv[oi + 1] : null;
  const wantClasses = argv.filter((a) => !a.startsWith('--') && a !== String(ownerOverride));
  const table = refs();

  const srv = await serve({});
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(srv.url + '/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Group the roster the way the game does, read off the live bake.
  const groups = await page.evaluate(() => {
    const H = window.__rtsTest, out = {};
    for (const k of Object.keys(window.UNITS || {})) {
      const d = window.UNITS[k];
      // `cls` is a single letter in the roster ('i' infantry, 'v' vehicle,
      // 'a' aircraft, 'n' naval) and `air`/`nav` are separate flags — an IFV is
      // 'v' with neither, a Kirov 'v' with air. Group by what the unit IS.
      const g = d.nav ? 'naval' : d.air ? 'air' : d.cls === 'i' ? 'infantry' : 'vehicle';
      (out[g] = out[g] || []).push(k);
    }
    return out;
  });

  const classes = wantClasses.length ? wantClasses : Object.keys(groups);
  let wrote = 0;
  for (const cls of classes) {
    const keys = (groups[cls] || []).filter((k) => table[k]);
    if (!keys.length) { console.log(`${cls}: nothing registered`); continue; }
    for (let p = 0; p * PER_PAGE < keys.length; p++) {
      const slice = keys.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
      const payload = {};
      for (const k of slice) {
        const file = path.join(REF_DIR, table[k].file);
        payload[k] = {
          ...table[k],
          b64: fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null,
          mime: file.endsWith('.gif') ? 'image/gif' : file.endsWith('.jpg') ? 'image/jpeg'
            : file.endsWith('.webp') ? 'image/webp' : 'image/png',
        };
      }
      const png = await page.evaluate(async ({ payload, cls, ownerOverride }) => {
        const H = window.__rtsTest;
        // Crop a source to its own opaque content and report what it spends.
        function crop(src, w, h, dropBg) {
          const t = document.createElement('canvas');
          t.width = w; t.height = h;
          const g = t.getContext('2d');
          g.drawImage(src, 0, 0, w, h);
          const d = g.getImageData(0, 0, w, h).data;
          // BACKGROUND BY THE BORDER, not by the dominant colour. A dominant
          // colour finds a flat studio backdrop and misses GRASS: the Prism
          // Tank's sheet is eight tanks on a textured lawn whose single most
          // common colour covers under 6% of the image, so the test failed
          // open, nothing was dropped, and the sheet was shown whole at x1.
          // Every pixel on the outer ring of one of these sheets IS background,
          // so collect the colours that appear there (quantised to 5 bits) and
          // treat that set as the backdrop.
          const bgSet = new Set();
          if (dropBg) {
            const qk = (i) => ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
            const ring = 2;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
              const i = (y * w + x) * 4;
              if (d[i + 3] < 24) continue;
              bgSet.add(qk(i));
            }
            // A border that is already the unit (a tight rip) would swallow the
            // whole sprite; only trust it when it reads like a backdrop.
            let hit = 0, tot = 0;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] < 24) continue;
              tot++; if (bgSet.has(qk(i))) hit++;
            }
            if (!tot || hit / tot < 0.25 || hit / tot > 0.97) bgSet.clear();
          }
          const on = (i) => {
            if (d[i + 3] < 24) return false;
            if (!bgSet.size) return true;
            return !bgSet.has(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
          };
          let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, onGrid = 0;
          const cols = new Set();
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (!on(i)) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            n++;
            cols.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
            if (d[i] % 51 === 0 && d[i + 1] % 51 === 0 && d[i + 2] % 51 === 0) onGrid++;
          }
          if (x1 < 0) return null;
          // MANY VEHICLE REFERENCES ARE EIGHT-BEARING CONTACT SHEETS. Cropping
          // one to its bbox crops the SHEET — 250x194 of eight tanks on a pale
          // background — and the page then picks a magnification that fits the
          // sheet, so our 48-px tank renders beside it at x1 as a thumbnail.
          // Nothing about that picture can be judged. Segment the content into
          // connected blobs and show ONE: the median-sized one, which is a
          // single bearing, exactly as ra2-size.js measures.
          if (dropBg) {
            const W2 = w, H2 = h, lab = new Int32Array(W2 * H2).fill(-1);
            const boxes = [];
            const qx = new Int32Array(W2 * H2), qy = new Int32Array(W2 * H2);
            for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
              const p0 = y * W2 + x;
              if (lab[p0] !== -1 || !on(p0 * 4)) continue;
              const id = boxes.length;
              let head = 0, tail = 0;
              qx[tail] = x; qy[tail] = y; tail++; lab[p0] = id;
              let bx0 = x, bx1 = x, by0 = y, by1 = y, cnt = 0;
              while (head < tail) {
                const cx2 = qx[head], cy2 = qy[head]; head++; cnt++;
                if (cx2 < bx0) bx0 = cx2; if (cx2 > bx1) bx1 = cx2;
                if (cy2 < by0) by0 = cy2; if (cy2 > by1) by1 = cy2;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                  const nx = cx2 + dx, ny = cy2 + dy;
                  if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2) continue;
                  const q = ny * W2 + nx;
                  if (lab[q] !== -1 || !on(q * 4)) continue;
                  lab[q] = id; qx[tail] = nx; qy[tail] = ny; tail++;
                }
              }
              boxes.push({ x0: bx0, y0: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, n: cnt });
            }
            const big = boxes.filter((b) => b.n >= 40 && b.w >= 8 && b.h >= 6);
            if (big.length > 1) {
              big.sort((a, b) => a.n - b.n);
              const m = big[big.length >> 1];
              x0 = m.x0; y0 = m.y0; x1 = m.x0 + m.w - 1; y1 = m.y0 + m.h - 1;
            }
          }
          const o = document.createElement('canvas');
          o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
          o.getContext('2d').drawImage(src, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
          o.__n = n; o.__c = cols.size; o.__grid = n ? onGrid / n : 0;
          return o;
        }
        const items = [];
        for (const key of Object.keys(payload)) {
          const cfg = payload[key];
          const own = ownerOverride == null ? cfg.owner : ownerOverride;
          let a = H.spr().unit[own][cfg.fac][key];
          if (a && a.fr) a = a.fr('stand', 4, 0);
          a = Array.isArray(a) ? a[1] : a;
          let theirs = null;
          if (cfg.b64) {
            const im = new Image();
            await new Promise((ok) => { im.onload = ok; im.onerror = ok; im.src = `data:${cfg.mime};base64,${cfg.b64}`; });
            if (im.naturalWidth) theirs = crop(im, im.naturalWidth, im.naturalHeight, true);
          }
          items.push({ name: cfg.name, mine: (a && a.c) ? crop(a.c, a.w, a.h, false) : null, theirs });
        }
        // One magnification for the page, chosen so the tallest pair fits.
        const tall = Math.max(...items.map((i) => Math.max(i.mine ? i.mine.height : 0, i.theirs ? i.theirs.height : 0)));
        const wide = items.reduce((s, i) => s + (i.mine ? i.mine.width : 0) + (i.theirs ? i.theirs.width : 0), 0);
        const M = Math.max(1, Math.min(10, Math.floor(Math.min(520 / Math.max(1, tall), 1250 / Math.max(1, wide)))));
        const PAIR = 14, GAP = 34, PAD = 24, TOP = 142;
        const colW = items.map((i) => ((i.mine ? i.mine.width : 0) + (i.theirs ? i.theirs.width : 0)) * M + PAIR);
        const W = PAD * 2 + colW.reduce((a, b) => a + b, 0) + GAP * (items.length - 1);
        const c = document.createElement('canvas');
        c.width = Math.max(560, W); c.height = TOP + tall * M + 54;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.fillStyle = '#0f1620'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#eaf2fb'; g.font = 'bold 19px system-ui';
        g.fillText(`${cls}  —  left: ours   right: RA2 reference   (x${M})`, PAD, 32);
        g.fillStyle = '#8fa6bd'; g.font = '12px system-ui';
        g.fillText('px = opaque pixels, col = distinct colours. RA2 spends ~0.9 colours per 100px.', PAD, 52);
        g.fillText('RIP = a real sprite (every channel on RA2’s 0x33 grid).  RENDER = a promotional', PAD, 68);
        g.fillText('image, NOT to sprite scale — RA2 draws vehicles/ships/aircraft as voxels.', PAD, 84);
        let x = PAD;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          g.fillStyle = '#182433'; g.fillRect(x - 11, TOP - 20, colW[i] + 22, tall * M + 34);
          g.fillStyle = '#cfe0f2'; g.font = 'bold 15px system-ui';
          g.fillText(it.name, x, TOP - 26);
          g.fillStyle = '#7e93a8'; g.font = '11px system-ui';
          const mine = it.mine ? `${it.mine.width}x${it.mine.height} ${it.mine.__n}px ${it.mine.__c}col` : '-';
          const kind = it.theirs ? (it.theirs.__grid > 0.9 && Math.max(it.theirs.width, it.theirs.height) <= 260 ? 'RIP' : 'RENDER') : '';
          const th = it.theirs ? `${it.theirs.width}x${it.theirs.height} ${it.theirs.__c}col ${kind}` : '-';
          g.fillText(`${mine}   |   ${th}`, x, TOP - 10);
          let cx = x;
          for (const s of [it.mine, it.theirs]) {
            if (!s) { cx += PAIR; continue; }
            g.drawImage(s, cx, TOP + (tall - s.height) * M, s.width * M, s.height * M);
            cx += s.width * M + PAIR;
          }
          x += colW[i] + GAP;
        }
        return c.toDataURL('image/png').slice(22);
      }, { payload, cls, ownerOverride });
      fs.mkdirSync(OUT, { recursive: true });
      const dst = path.join(OUT, `cmp-${cls}-${p}.png`);
      fs.writeFileSync(dst, Buffer.from(png, 'base64'));
      console.log('  ' + path.relative(RTS, dst) + '  ' + slice.join(' '));
      wrote++;
    }
  }
  await browser.close(); srv.close();
  console.log(`\n${wrote} sheets. Now LOOK at them — a number cannot tell you a unit has no head.`);
})();
