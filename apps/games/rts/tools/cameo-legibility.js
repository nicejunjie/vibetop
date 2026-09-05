#!/usr/bin/env node
// Can a PLAYER tell two BUILD-SIDEBAR CAMEOS apart? — the other half of the
// complaint "troops and units are not unique enough under that small size in
// the menu or on the map". `legibility.js` measures the MAP. Nothing measured
// the MENU until this file; its own header even says so ("that measurement is
// not in this file yet ... it belongs here").
//
//   node apps/games/rts/tools/cameo-legibility.js
//   node apps/games/rts/tools/cameo-legibility.js --sheet   # + contact sheets to LOOK at
//   node apps/games/rts/tools/cameo-legibility.js --json out.json
//
// ── What is measured, and why it is measured that way ─────────────────────
// The cameo is a canvas baked at 120x96 and CSS-sized to 60x48 (`.pit .em
// canvas { width:60px; height:48px }`). On a DPR-1 screen the player therefore
// sees a 60x48 picture — which is exactly RA2's own cameo resolution. So the
// picture is read back from the LIVE sidebar (not re-derived from the sprite
// atlas: `cameoFor` bakes a wash, a ground band and a bevel that the atlas
// knows nothing about), box-downsampled 2:1 to 60x48, and compared with the
// same perceptual distance `legibility.js` uses, so the two surfaces' numbers
// sit on one scale.
//
// ── The threshold is RA2's own cameo set ──────────────────────────────────
// `legibility.js` anchors on "the same unit in the two owners' colours",
// because on the map the player must tell friend from foe every second. That
// anchor does not exist in the sidebar: the sidebar only ever shows YOUR
// house, so the same-item-two-colours distance there is near zero by design
// and would be a meaningless floor.
//
// The defensible bar is the game we are copying. `docs/ra2-ref/cameos/` holds
// 74 real RA2 cameo plates pulled from the C&C wiki's File: namespace (72 of
// them natively 60x48, which is what confirms the format). Run the identical
// metric over that corpus and you get the distance RA2's own art keeps between
// two icons a player picks between. A pair of OUR cameos scoring below RA2's
// 5th percentile is, by the yardstick this project already committed to, less
// distinguishable than Westwood ever allowed.
//
// ── Two reading conditions, both real ─────────────────────────────────────
// A cameo the player cannot afford or has not unlocked is drawn through
// `filter: grayscale(.65) brightness(.6)` (the `.pit.dis` / `.pit.locked`
// rule). That strips most of the chroma term — and the early game is mostly
// greyed cameos, so it is not an edge case. Both conditions are reported.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RTS = path.join(ROOT, 'apps', 'games', 'rts');
const REFDIR = path.join(RTS, 'docs', 'ra2-ref', 'cameos');
const OUT = path.join(RTS, 'art', 'out');

const CW = 60, CH = 48;                  // the size the player actually sees (CSS px)
const FACTIONS = ['dir', 'col'];
const TABS = ['b', 'd', 'i', 'v'];
const TABNAME = { b: 'structures', d: 'defence', i: 'infantry', v: 'units' };

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

/* c8 ignore start */
// ── page side ─────────────────────────────────────────────────────────────
// Read the live sidebar. `buildPanel()` has already run for the pre-match
// menu state, where `G` is null and the list is `panelListFor(myFac, tab)` —
// i.e. exactly one faction's own four tabs, with no captured-producer rows to
// muddle the roster. Clicking a `.ptab div` rebuilds the list for that tab.
function grabCameos(cfg) {
  function shrink(cv, W, H) {
    const g = cv.getContext('2d');
    const id = g.getImageData(0, 0, cv.width, cv.height);
    const sx = cv.width / W, sy = cv.height / H;
    const out = new Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, gg = 0, b = 0, n = 0;
      const y0 = Math.floor(y * sy), y1 = Math.max(Math.floor((y + 1) * sy), y0 + 1);
      const x0 = Math.floor(x * sx), x1 = Math.max(Math.floor((x + 1) * sx), x0 + 1);
      for (let yy = y0; yy < y1 && yy < cv.height; yy++) for (let xx = x0; xx < x1 && xx < cv.width; xx++) {
        const i = (yy * cv.width + xx) * 4;
        const a = id.data[i + 3] / 255;
        // the cameo plate is opaque, but compose over the button's own
        // background (#05070b) so a transparent corner is not counted as white
        r += id.data[i] * a + 5 * (1 - a);
        gg += id.data[i + 1] * a + 7 * (1 - a);
        b += id.data[i + 2] * a + 11 * (1 - a);
        n++;
      }
      const o = (y * W + x) * 3;
      out[o] = r / n; out[o + 1] = gg / n; out[o + 2] = b / n;
    }
    return out;
  }
  const recs = [];
  for (const tab of cfg.TABS) {
    const t = document.querySelector('.ptab div[data-tab="' + tab + '"]');
    if (t) t.click();
    const pits = document.querySelectorAll('#plist .pit');
    for (const pit of pits) {
      const cv = pit.querySelector('.em canvas');
      if (!cv) continue;
      const nm = pit.querySelector('.nm');
      recs.push({
        tab,
        name: nm ? nm.textContent : '?',
        bw: cv.width, bh: cv.height,
        cssw: cv.style.width, cssh: cv.style.height,
        px: shrink(cv, cfg.CW, cfg.CH),          // what a DPR-1 screen shows
        px2: shrink(cv, cfg.CW * 2, cfg.CH * 2), // what a DPR-2 screen shows
      });
    }
  }
  return recs;
}

// Decode the RA2 reference plates through the browser's own PNG decoder, so
// this tool needs no image dependency at all.
function decodeRefs(payload) {
  const done = [];
  const jobs = payload.files.map((f) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = payload.CW; c.height = payload.CH;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(im, 0, 0, payload.CW, payload.CH);
      const id = g.getImageData(0, 0, payload.CW, payload.CH).data;
      const px = new Array(payload.CW * payload.CH * 3);
      for (let i = 0; i < payload.CW * payload.CH; i++) {
        const a = id[i * 4 + 3] / 255;
        px[i * 3] = id[i * 4] * a + 5 * (1 - a);
        px[i * 3 + 1] = id[i * 4 + 1] * a + 7 * (1 - a);
        px[i * 3 + 2] = id[i * 4 + 2] * a + 11 * (1 - a);
      }
      done.push({ key: f.key, w: im.width, h: im.height, px });
      res();
    };
    im.onerror = () => res();
    im.src = 'data:image/png;base64,' + f.b64;
  }));
  return Promise.all(jobs).then(() => done);
}
/* c8 ignore stop */

// ── image maths — byte-for-byte the metric legibility.js uses ─────────────
// Luminance carries most of "can I tell these apart" at thumbnail size, so
// weight it, but keep real chroma terms or two differently coloured plates of
// the same shape score zero. Normalised per pixel, so a 60x48 number and a
// 28x28 number sit on the same scale.
function dist(a, b, n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const la = 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2];
    const lb = 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2];
    const dr = (a[o] - a[o + 2]) - (b[o] - b[o + 2]);
    const dg = (a[o + 1] - a[o + 2]) - (b[o + 1] - b[o + 2]);
    s += (la - lb) * (la - lb) + dr * dr * 0.35 + dg * dg * 0.35;
  }
  return Math.sqrt(s / n);
}

// The `.pit.dis` / `.pit.locked` rule, in numbers: grayscale(.65) then
// brightness(.6), in CSS filter order.
function greyed(px) {
  const out = new Array(px.length);
  for (let i = 0; i < px.length; i += 3) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    out[i]     = (px[i]     * 0.35 + l * 0.65) * 0.6;
    out[i + 1] = (px[i + 1] * 0.35 + l * 0.65) * 0.6;
    out[i + 2] = (px[i + 2] * 0.35 + l * 0.65) * 0.6;
  }
  return out;
}

const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

async function measure() {
  const pw = playwright();
  const srv = await serve();
  const port = srv.address().port;
  const browser = await pw.chromium.launch();
  const pageErrors = [];
  const byFac = {};
  let refs = [];
  for (const fac of FACTIONS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
    // `faction` is a module-level var seeded from localStorage at load; there
    // is no test hook for it, so this is how the Collective sidebar is reached.
    await ctx.addInitScript((f) => {
      try { localStorage.setItem('vibetop:rts:fac', f); } catch (e) {}
    }, fac);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(fac + ': ' + String(e)));
    await page.goto(`http://127.0.0.1:${port}/rts.html`);
    await page.waitForFunction(() => !!window.__rtsTest, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#plist .pit .em canvas').length > 0,
                               null, { timeout: 30000 });
    byFac[fac] = await page.evaluate(grabCameos, { TABS, CW, CH });
    if (!refs.length && fs.existsSync(REFDIR)) {
      const files = fs.readdirSync(REFDIR).filter((f) => f.endsWith('.png')).map((f) => ({
        key: f.replace(/\.png$/, ''),
        b64: fs.readFileSync(path.join(REFDIR, f)).toString('base64'),
      }));
      refs = await page.evaluate(decodeRefs, { files, CW, CH });
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  return { byFac, refs, pageErrors };
}

// ── the RA2 bar ───────────────────────────────────────────────────────────
// Every pair of real RA2 cameos, same metric, same 60x48. Near-identical
// pairs (< 6) are dropped: the wiki keeps localised re-uploads of some plates
// and two copies of one picture are not evidence about RA2's spacing.
function refBar(refs) {
  const n = CW * CH, ds = [], dup = [];
  for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) {
    const d = dist(refs[i].px, refs[j].px, n);
    if (d < 6) { dup.push([refs[i].key, refs[j].key, round(d, 1)]); continue; }
    ds.push({ a: refs[i].key, b: refs[j].key, d });
  }
  const sorted = ds.map((x) => x.d).sort((a, b) => a - b);
  ds.sort((a, b) => a.d - b.d);
  return {
    n: refs.length, pairs: ds.length, dup,
    min: round(sorted[0], 1), p5: round(pct(sorted, 5), 1), p25: round(pct(sorted, 25), 1),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length, 1),
    worst: ds.slice(0, 8).map((x) => ({ a: x.a, b: x.b, d: round(x.d, 1) })),
  };
}

function pairsOf(list, field, n) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
    out.push({ a: list[i].name, b: list[j].name, ta: list[i].tab, tb: list[j].tab,
               d: dist(list[i][field], list[j][field], n) });
  out.sort((a, b) => a.d - b.d);
  return out;
}

function statsOf(ps, bar) {
  const ds = ps.map((p) => p.d).sort((a, b) => a - b);
  return { pairs: ds.length, mean: round(ds.reduce((a, b) => a + b, 0) / ds.length, 1),
           min: round(ds[0], 1), p5: round(pct(ds, 5), 1),
           under: ds.filter((d) => d < bar).length };
}

function compute({ byFac, refs }) {
  const bar = refs.length ? refBar(refs) : null;
  const BAR = bar ? bar.p5 : 0;
  const res = { bar, fac: {}, sizes: null, greyBar: null };
  for (const fac of FACTIONS) {
    const recs = byFac[fac];
    if (!recs || !recs.length) continue;
    if (!res.sizes) res.sizes = { bitmap: recs[0].bw + 'x' + recs[0].bh, css: recs[0].cssw + ' x ' + recs[0].cssh };
    const grey = recs.map((r) => ({ ...r, px: greyed(r.px) }));
    const n = CW * CH, n2 = CW * CH * 4;
    const whole = pairsOf(recs, 'px', n);
    const wholeG = pairsOf(grey, 'px', n);
    const wholeHi = pairsOf(recs, 'px2', n2);
    const perTab = {};
    for (const t of TABS) {
      const sub = recs.filter((r) => r.tab === t);
      if (sub.length < 2) continue;
      const ps = pairsOf(sub, 'px', n);
      perTab[t] = { n: sub.length, ...statsOf(ps, BAR), worst: ps.slice(0, 5).map((p) => ({ a: p.a, b: p.b, d: round(p.d, 1) })) };
    }
    res.fac[fac] = {
      n: recs.length,
      whole: { ...statsOf(whole, BAR), worst: whole.slice(0, 12).map((p) => ({ a: p.a, b: p.b, ta: p.ta, tb: p.tb, d: round(p.d, 1) })) },
      grey:  { ...statsOf(wholeG, BAR), worst: wholeG.slice(0, 6).map((p) => ({ a: p.a, b: p.b, ta: p.ta, tb: p.tb, d: round(p.d, 1) })) },
      dpr2:  statsOf(wholeHi, BAR),
      perTab,
    };
  }
  return res;
}

function report(m) {
  const L = [];
  L.push('cameo legibility — the BUILD SIDEBAR, at the size it is DRAWN');
  if (m.sizes) L.push(`  plate: ${m.sizes.bitmap} bitmap shown at ${m.sizes.css} (measured at ${CW}x${CH}, i.e. DPR 1)`);
  if (m.bar) {
    L.push('');
    L.push(`  THE BAR = real RA2 cameos, same metric, same size. ${m.bar.n} plates from`);
    L.push(`  docs/ra2-ref/cameos/, ${m.bar.pairs} pairs: min ${m.bar.min}, 5th pct ${m.bar.p5}, 25th pct ${m.bar.p25}, mean ${m.bar.mean}.`);
    L.push(`  A pair of ours under ${m.bar.p5} is closer than 95% of everything Westwood shipped.`);
    L.push('    RA2\'s own closest pairs: ' + m.bar.worst.slice(0, 4).map((p) => `${p.a}|${p.b} ${p.d}`).join(', '));
    if (m.bar.dup.length) L.push(`    (${m.bar.dup.length} near-identical reference pair(s) dropped as wiki re-uploads)`);
  }
  const BAR = m.bar ? m.bar.p5 : 0;
  for (const fac of FACTIONS) {
    const f = m.fac[fac];
    if (!f) continue;
    L.push('');
    L.push(`  ${fac === 'dir' ? 'DIRECTORATE' : 'COLLECTIVE'} sidebar — ${f.n} cameos`);
    L.push(`    whole sidebar : ${f.whole.pairs} pairs, mean ${f.whole.mean}, min ${f.whole.min}, 5th pct ${f.whole.p5}, UNDER RA2's bar: ${f.whole.under}`);
    L.push(`    greyed (.dis) : mean ${f.grey.mean}, min ${f.grey.min}, UNDER: ${f.grey.under}   <- what an unaffordable row looks like`);
    L.push(`    at DPR 2      : mean ${f.dpr2.mean}, min ${f.dpr2.min}, UNDER: ${f.dpr2.under}`);
    L.push('    per tab (the list a player actually scans):');
    L.push('      tab           n  pairs   mean    min   UNDER');
    for (const t of TABS) {
      const v = f.perTab[t];
      if (!v) continue;
      L.push(`      ${TABNAME[t].padEnd(11)} ${String(v.n).padStart(2)}  ${String(v.pairs).padStart(5)}  ${String(v.mean).padStart(5)}  ${String(v.min).padStart(5)}   ${String(v.under).padStart(5)}`);
    }
    L.push('    worst pairs anywhere in this sidebar:');
    for (const p of f.whole.worst.slice(0, 8))
      L.push(`      ${String(p.d).padStart(5)}  ${p.a} | ${p.b}${p.d < BAR ? '   << under RA2\'s 5th percentile' : ''}`);
    L.push('    worst pairs when greyed out:');
    for (const p of f.grey.worst.slice(0, 4))
      L.push(`      ${String(p.d).padStart(5)}  ${p.a} | ${p.b}`);
  }
  return L.join('\n');
}

// A contact sheet, because a number is not a picture.
async function sheet(byFac, refs) {
  const pw = playwright();
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  fs.mkdirSync(OUT, { recursive: true });
  for (const fac of FACTIONS) {
    const recs = byFac[fac];
    if (!recs) continue;
    const png = await page.evaluate((d) => {
      const COLS = 8, W = d.CW, H = d.CH, PAD = 4;
      const rows = Math.ceil(d.recs.length / COLS);
      const c = document.createElement('canvas');
      c.width = COLS * (W + PAD) + PAD; c.height = rows * (H + PAD + 10) + PAD;
      const g = c.getContext('2d');
      g.fillStyle = '#11151c'; g.fillRect(0, 0, c.width, c.height);
      d.recs.forEach((r, i) => {
        const cx = PAD + (i % COLS) * (W + PAD), cy = PAD + Math.floor(i / COLS) * (H + PAD + 10);
        const id = g.createImageData(W, H);
        for (let p = 0; p < W * H; p++) {
          id.data[p * 4] = r.px[p * 3]; id.data[p * 4 + 1] = r.px[p * 3 + 1];
          id.data[p * 4 + 2] = r.px[p * 3 + 2]; id.data[p * 4 + 3] = 255;
        }
        g.putImageData(id, cx, cy);
        g.fillStyle = '#8f9bae'; g.font = '8px system-ui, sans-serif';
        g.fillText(r.name.slice(0, 13), cx, cy + H + 8);
      });
      return c.toDataURL('image/png');
    }, { recs: recs.map((r) => ({ name: r.name, px: r.px })), CW, CH });
    fs.writeFileSync(path.join(OUT, `cameos-${fac}.png`), Buffer.from(png.split(',')[1], 'base64'));
    console.log('wrote ' + path.join(OUT, `cameos-${fac}.png`));
  }
  await browser.close();
}

async function main() {
  const { byFac, refs, pageErrors } = await measure();
  if (pageErrors.length) { console.error('PAGE ERRORS:\n  ' + pageErrors.join('\n  ')); process.exitCode = 1; }
  const m = compute({ byFac, refs });
  console.log(report(m));
  if (process.argv.includes('--sheet')) await sheet(byFac, refs);
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
    fs.mkdirSync(path.dirname(process.argv[jsonAt + 1]), { recursive: true });
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(m, null, 2) + '\n');
    console.log('wrote ' + process.argv[jsonAt + 1]);
  }
}
if (require.main === module) main();
module.exports = { measure, compute, report, dist, greyed, CW, CH };
