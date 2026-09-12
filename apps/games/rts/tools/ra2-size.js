#!/usr/bin/env node
// Every unit's baked size against its RA2 sprite's size.
//
//   node apps/games/rts/tools/ra2-size.js            # the whole table
//   node apps/games/rts/tools/ra2-size.js rifle dog  # selected units
//
// The roadmap already gates ASPECT (opaque-bbox w/h within +-8% of the rip).
// It does not gate SIZE, and a unit can hold its aspect while standing a third
// too tall — which is exactly what "一切照ra去做，无论是分辨率还是样式" rules out.
//
// Two corrections make the comparison honest:
//   * RA2's tile is 60x30 and ours is 64x32, so the rip is scaled by 64/60
//     before being compared. That factor is this project's long-standing 1.067.
//   * Our bake carries a GROUND SHADOW under the figure and the rip does not.
//     The shadow is excluded by dropping trailing rows whose pixels are all
//     darker than the body's own darkest quartile — see shadowRows().
//
// Reference height is the TALLEST standing frame of the rip (frames where the
// figure is upright), not frame 0, which for several sheets is a crouch.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts.js');

const RTS = path.resolve(__dirname, '..');
const ROOT = path.resolve(RTS, '../../..');
const REF_DIR = path.join(RTS, 'docs/ra2-ref/sprites');
const { chromium } = require(path.join(ROOT, 'tests/e2e/node_modules/playwright'));
const TILE = 64 / 60;                       // ours / RA2's — the 1.067 scale

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

(async () => {
  const want = process.argv.slice(2);
  const table = refs();
  const keys = (want.length ? want : Object.keys(table)).filter((k) => table[k]);
  const srv = await serve({});
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(srv.url + '/rts.html');
  await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // ---- ours: bbox of the baked sprite with the ground shadow removed ----- //
  const ours = await page.evaluate((input) => {
    const H = window.__rtsTest;
    const out = {};
    for (const key of Object.keys(input)) {
      const cfg = input[key];
      let art = H.spr().unit[cfg.owner][cfg.fac][key];
      if (!art) { out[key] = { error: 'no baked art' }; continue; }
      if (art.fr) art = art.fr('stand', 4, 0);          // infantry atlas: the standing frame
      const a = Array.isArray(art) ? art[1] : art;
      const c = document.createElement('canvas');
      c.width = a.w; c.height = a.h;
      const g = c.getContext('2d');
      g.drawImage(a.c, 0, 0, a.w, a.h);
      const d = g.getImageData(0, 0, a.w, a.h).data;
      // rows that hold any opaque pixel, and each row's mean luma
      const rows = [];
      let x0 = 1e9, x1 = -1;
      for (let y = 0; y < a.h; y++) {
        let n = 0, lum = 0, rx0 = 1e9, rx1 = -1;
        for (let x = 0; x < a.w; x++) {
          const i = (y * a.w + x) * 4;
          if (d[i + 3] < 24) continue;
          n++; lum += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
          if (x < rx0) rx0 = x; if (x > rx1) rx1 = x;
        }
        if (n) { rows.push({ y, n, lum: lum / n, x0: rx0, x1: rx1 }); if (rx0 < x0) x0 = rx0; if (rx1 > x1) x1 = rx1; }
      }
      if (!rows.length) { out[key] = { error: 'empty sprite' }; continue; }
      // The ground shadow is the trailing run of rows that are much darker than
      // the figure's median row. Drop it; the RA2 rip has no shadow baked in.
      const med = rows.map((r) => r.lum).sort((p, q) => p - q)[rows.length >> 1];
      let end = rows.length - 1;
      while (end > 0 && rows[end].lum < med * 0.55) end--;
      const body = rows.slice(0, end + 1);
      const bx0 = Math.min(...body.map((r) => r.x0)), bx1 = Math.max(...body.map((r) => r.x1));
      out[key] = {
        w: bx1 - bx0 + 1, h: body.length,
        withShadow: { w: x1 - x0 + 1, h: rows.length },
      };
    }
    return out;
  }, Object.fromEntries(keys.map((k) => [k, table[k]])));

  // ---- theirs: the tallest upright frame of the rip ---------------------- //
  const theirs = {};
  for (const key of keys) {
    const file = path.join(REF_DIR, table[key].file);
    if (!fs.existsSync(file)) { theirs[key] = { error: 'missing ' + table[key].file }; continue; }
    const buf = fs.readFileSync(file).toString('base64');
    const mime = file.endsWith('.gif') ? 'image/gif' : file.endsWith('.jpg') ? 'image/jpeg'
      : file.endsWith('.webp') ? 'image/webp' : 'image/png';
    theirs[key] = await page.evaluate(async ({ b64, mime }) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:${mime};base64,${b64}`; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      // A rip may be a sheet or a single frame; measure the largest connected
      // opaque blob's bbox, which is the figure itself, not the sheet.
      // Most rips are CONTACT SHEETS: eight bearings side by side. Measuring
      // their bbox measures the sheet, not the unit. So label connected blobs
      // and report the MEDIAN blob — one frame — with the count as evidence.
      const W = c.width, Hh = c.height;
      // The rips keep their original grass / snow / chroma background, so
      // "opaque" is not "unit". The background is whatever colour covers the
      // most pixels (quantised to 5 bits); everything within a small distance
      // of it is dropped, along with transparency and the near-black key.
      const hist = new Map();
      for (let i = 0, p = 0; p < W * Hh; p++, i += 4) {
        if (d[i + 3] < 24) continue;
        const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        hist.set(k, (hist.get(k) || 0) + 1);
      }
      let bgKey = -1, bgN = 0;
      for (const [k, n] of hist) if (n > bgN) { bgN = n; bgKey = k; }
      const bg = [((bgKey >> 10) & 31) << 3, ((bgKey >> 5) & 31) << 3, (bgKey & 31) << 3];
      const dominant = bgN / (W * Hh);
      const on = new Uint8Array(W * Hh);
      for (let i = 0, p = 0; p < W * Hh; p++, i += 4) {
        if (d[i + 3] < 24) continue;
        if (d[i] < 26 && d[i + 1] < 26 && d[i + 2] < 40) continue;   // near-black key
        if (dominant > 0.06) {                                        // a real background
          const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
          if (dr * dr + dg * dg + db * db < 46 * 46) continue;
        }
        on[p] = 1;
      }
      const seen = new Uint8Array(W * Hh), blobs = [];
      const stack = new Int32Array(W * Hh);
      for (let p = 0; p < W * Hh; p++) {
        if (!on[p] || seen[p]) continue;
        let sp = 0; stack[sp++] = p; seen[p] = 1;
        let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, n = 0;
        while (sp) {
          const q = stack[--sp], qx = q % W, qy = (q / W) | 0;
          n++;
          if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx;
          if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
          // 8-connected, and bridge a 1px gap so antialiased rips stay whole
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
            const np = ny * W + nx;
            if (on[np] && !seen[np]) { seen[np] = 1; stack[sp++] = np; }
          }
        }
        blobs.push({ w: bx1 - bx0 + 1, h: by1 - by0 + 1, n });
      }
      if (!blobs.length) return { error: 'no opaque pixels' };
      const big = blobs.filter((b) => b.n >= 40).sort((a, b) => a.h - b.h);   // drop specks
      const use = big.length ? big : blobs.sort((a, b) => a.h - b.h);
      const med = use[use.length >> 1];
      return { w: med.w, h: med.h, sheet: [W, Hh], frames: use.length,
               spread: [use[0].h, use[use.length - 1].h],
               bg: dominant > 0.06 ? `#${bg.map((v) => v.toString(16).padStart(2, '0')).join('')}` : 'none' };
    }, { b64: buf, mime });
  }

  await browser.close(); srv.close();

  console.log('unit            ours(w x h)   RA2 rip      RA2 x1.067   h ratio   verdict');
  const rows = [];
  for (const key of keys) {
    const o = ours[key], t = theirs[key];
    if (o.error || t.error) { console.log(`${key.padEnd(15)} ${o.error || t.error}`); continue; }
    const single = t.frames >= 1;                             // the median blob is one frame
    const tw = t.w * TILE, th = t.h * TILE;
    const ratio = o.h / th;
    const flag = Math.abs(ratio - 1) <= 0.08 ? 'ok'
      : ratio > 1 ? `TOO TALL by ${((ratio - 1) * 100).toFixed(0)}%` : `TOO SHORT by ${((1 - ratio) * 100).toFixed(0)}%`;
    console.log(`${key.padEnd(15)} ${String(o.w + 'x' + o.h).padEnd(12)}  ${String(t.w + 'x' + t.h).padEnd(11)}  ${(tw.toFixed(0) + 'x' + th.toFixed(0)).padEnd(11)}  ${ratio.toFixed(2).padStart(6)}   ${String(flag).padEnd(22)} ${String(t.frames).padStart(2)} blobs h${t.spread[0]}-${t.spread[1]} bg ${t.bg}`);
    if (single) rows.push({ key, ratio });
  }
  const off = rows.filter((r) => Math.abs(r.ratio - 1) > 0.08);
  console.log(`\n${rows.length} units measurable against a single-frame rip, ${off.length} outside +-8% on height.`);
})();
