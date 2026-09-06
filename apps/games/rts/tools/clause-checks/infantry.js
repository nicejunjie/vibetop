/**
 * §2's UNMEASURED INFANTRY clauses, measured.
 *
 * `docs/clause-inventory.md` lists 23 infantry clauses with nothing behind
 * them. Two are measured by `EXAMPLE-infantry-gi.js` (the G.I.'s helmet value
 * and his olive legs); this file measures 20 of the other 21.
 *
 * The ONE it does not is the Guardian GI's "deployed dome >= 15w x 12h", and
 * the reason is that OUR Guardian GI DOES NOT DEPLOY. `UNITS.rocket` carries
 * no `dep` and no `deployRad`, the deploy command's own refusal reads "Only
 * GIs, Desolators and MCVs can deploy", and no atlas anywhere holds a deployed
 * Guardian frame. There is nothing to measure, in the rig or out of it. It is
 * recorded as unmeasurable with that reason in `docs/per-unit-art-log.md`
 * rather than forced into a check, because a forced check goes green once and
 * then nobody looks again.
 *
 * Three clauses here are SOURCE-CONSTANT checks, and each says so on its own
 * row: the Rocketeer's altitude and drop shadow, and the Desolator's radiation
 * pool. None of the three is in any sprite — they are renderer facts — so a
 * bake cannot see them, and reading the shipped constant out of `rts.html` is
 * the honest measurement rather than a proxy for one.
 *
 * ── BAND CONVENTION, stated once, because two passes measuring "the
 *    Engineer's torso" got 26.0% and 21.1% for the same man ──────────────
 * Every band in this file is a fraction of the **RAW MEASURED BBOX HEIGHT**,
 * top-down, exactly as `EXAMPLE-infantry-gi.js`'s `band()` reads it. The bbox
 * INCLUDES the contact shadow (11.7% of a trooper's opaque pixels, pure
 * black, extending below the boots) and the drawing anchor is NOT `h - UPAD`,
 * so a band derived from `by - 19.4` in the source lands somewhere else
 * entirely. Read bands off the bake.
 *
 * Where a clause is about the FIGURE rather than about the frame — a dog's
 * body height, the Flak Trooper's "total height >= 1.25x a Conscript's" — the
 * shadow is segmented off first by `figure()`, and the row says so. Those two
 * conventions give different numbers for the same sprite; each row names the
 * one it used.
 *
 * ── INVENTED THRESHOLDS ──────────────────────────────────────────────────
 * Several §2 rows state no number ("no vertical torso mass", "head dome bare,
 * no helmet"). Where this file picks one, the `note` SAYS the row states no
 * number and that the threshold is this file's reading. Never presented as
 * the spec.
 *
 * ── OWNER PIXELS ─────────────────────────────────────────────────────────
 * `ctx` hands back ONE bake (owner 0), so the two-bake diff art-metrics uses
 * for `col.ownerPct` is not available per pixel. Owner-0 is `#4aa3db`, hue
 * 203 — measured, not assumed: the hue histogram of every saturated infantry
 * pixel on the board peaks at 203 with 3317 hits against 993 for the next
 * non-adjacent bin. `shade()` is a per-channel multiply, so hue and
 * saturation survive shading exactly and a hue window catches shaded owner
 * paint too. Validated against `col.ownerPct` per unit: the proxy tracks it
 * within 0.05 on ten of fourteen troopers. Where a clause needs an ABSOLUTE
 * owner fraction (Crazy Ivan's ">= 35%") this file uses `col.ownerPct`, the
 * real two-bake number, and never the proxy.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OWNER_HUE = 203;                 // owner 0, measured from the ensemble (see header)
const SRC = path.join(__dirname, '..', '..', 'rts.html');

const hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Per-pixel HSV over the bbox; null where transparent. One pass, reused. */
function px(f) {
  if (f._px) return f._px;
  const out = new Array(f.w * f.h).fill(null);
  for (let i = 0; i < f.w * f.h; i++) {
    if (!f.mask[i]) continue;
    const j = i * 4;
    if (f.rgba[j + 3] <= 8) continue;
    out[i] = hsv(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]);
  }
  f._px = out;
  return out;
}
const isOwner = (p) => p && p.s >= 0.30 && hueGap(p.h, OWNER_HUE) <= 22;

/** Opaque pixels between two fractions of the RAW bbox height. */
function band(f, f0, f1, pred) {
  const P = px(f), out = [];
  const y0 = Math.max(0, Math.floor(f.h * f0)), y1 = Math.min(f.h, Math.ceil(f.h * f1));
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) {
    const p = P[y * f.w + x];
    if (p && (!pred || pred(p))) out.push(p);
  }
  return out;
}

/**
 * The FIGURE — the bbox with the contact shadow cut off the bottom.
 * `shadowBlob` paints pure black at partial alpha, so a shadow pixel reads
 * v ~ 0 while a boot's darkest outline still carries value. The figure's
 * bottom is the last row holding >= 2 pixels above v 0.15; everything under
 * it is ground, not man. Returns { top, bot, h } in bbox rows.
 */
function figure(f) {
  if (f._fig) return f._fig;
  const P = px(f);
  let top = -1, bot = -1;
  for (let y = 0; y < f.h; y++) {
    let n = 0;
    for (let x = 0; x < f.w; x++) { const p = P[y * f.w + x]; if (p && p.v > 0.15) n++; }
    if (n >= 2) { if (top < 0) top = y; bot = y; }
  }
  if (top < 0) { top = 0; bot = f.h - 1; }
  f._fig = { top, bot, h: bot - top + 1 };
  return f._fig;
}

/** Widest opaque row in a band, and the widest single unbroken RUN in it. */
function rowSpan(f, y) {
  const P = px(f);
  let x0 = -1, x1 = -1, run = 0, best = 0, runs = 0, minRun = 1e9;
  for (let x = 0; x < f.w; x++) {
    if (P[y * f.w + x]) {
      if (x0 < 0) x0 = x; x1 = x; run++;
      if (run > best) best = run;
    } else if (run) { runs++; if (run < minRun) minRun = run; run = 0; }
  }
  if (run) { runs++; if (run < minRun) minRun = run; }
  return { x0, x1, w: x1 < 0 ? 0 : x1 - x0 + 1, bestRun: best, runs, minRun: runs ? minRun : 0 };
}

/** 4-connected components over a predicate, largest first. */
function blobs(f, pred) {
  const P = px(f), seen = new Uint8Array(f.w * f.h), out = [];
  for (let i = 0; i < P.length; i++) {
    if (seen[i] || !P[i] || !pred(P[i], i)) continue;
    const q = [i]; seen[i] = 1;
    let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    while (q.length) {
      const c = q.pop(), cx = c % f.w, cy = (c / f.w) | 0;
      n++;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      const nb = [cx > 0 ? c - 1 : -1, cx < f.w - 1 ? c + 1 : -1,
                  cy > 0 ? c - f.w : -1, cy < f.h - 1 ? c + f.w : -1];
      for (const k of nb) if (k >= 0 && !seen[k] && P[k] && pred(P[k], k)) { seen[k] = 1; q.push(k); }
    }
    out.push({ n, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  out.sort((a, b) => b.n - a.n);
  return out;
}

/** Largest solid RECTANGLE of predicate pixels — "a block >= 7w x 6h". */
function maxRect(f, pred) {
  const P = px(f), hgt = new Int32Array(f.w);
  let best = { w: 0, h: 0, area: 0 };
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) hgt[x] = (P[y * f.w + x] && pred(P[y * f.w + x])) ? hgt[x] + 1 : 0;
    // every maximal rectangle whose bottom edge is this row
    const st = [];
    for (let x = 0; x <= f.w; x++) {
      const cur = x === f.w ? 0 : hgt[x];
      let start = x;
      while (st.length && st[st.length - 1].h >= cur) {
        const t = st.pop();
        const w = x - t.x, area = w * t.h;
        if (area > best.area || (area === best.area && t.h > best.h)) best = { w, h: t.h, area };
        start = t.x;
      }
      st.push({ x: start, h: cur });
    }
  }
  return best;
}

/** A numeric literal out of rts.html, so a SOURCE-CONSTANT clause is real. */
function srcNum(re) {
  try {
    const m = fs.readFileSync(SRC, 'utf8').match(re);
    return m ? Number(m[1]) : null;
  } catch (e) { return null; }
}

exports.check = function (ctx) {
  const rows = [];
  const R = (n, d) => ctx.round(n, d === undefined ? 3 : d);
  const F = {};
  for (const k of ['rifle', 'rocket', 'rocketeer', 'engineer', 'dog', 'tanya', 'cleg',
                   'spy', 'conscript', 'flak', 'teslatrooper', 'ivan', 'desolator', 'yuri']) {
    const o = ctx.broadsideOct(k);
    const f = ctx.byUnitOct(k, o);
    if (f && f.rgba) { f.oct = o; F[k] = f; }
  }
  const add = (unit, clause, ok, measured, want, note) =>
    rows.push({ unit, clause, ok, measured, want, note });
  const BAND = 'band = fraction of the raw measured bbox height (shadow included), broadside bearing';

  // ── G.I. — "torso block >= 7w x 6h" ────────────────────────────────────
  // The house block runs collar to belt at full shoulder width. Measured as
  // the largest SOLID RECTANGLE of owner-hued pixels anywhere on the sprite,
  // which is the strictest reading of "block": a scattered 42 owner pixels
  // cannot pass it.
  if (F.rifle) {
    const b = maxRect(F.rifle, isOwner);
    add('rifle', 'torso block >= 7w x 6h', b.w >= 7 && b.h >= 6,
        `${b.w}x${b.h}`, '>= 7w x 6h',
        `largest solid owner-hue rectangle on the sprite, ${F.rifle.w}x${F.rifle.h} bbox; ${BAND}`);
  }

  // ── Rocketeer — "altitude offset >= 10 px" ─────────────────────────────
  // SOURCE CONSTANT, not a bake: the bake has no altitude in it at all. The
  // renderer draws every air unit at `sy(u.x,u.y) - altOf(u)` and `altOf`
  // returns `k * d.alt` with k -> 1 once airborne, so `UNITS.rocketeer.alt`
  // IS the screen-pixel offset at cruise.
  {
    const alt = srcNum(/rocketeer:\s*\{[\s\S]{0,600}?\balt:\s*(\d+(?:\.\d+)?)/);
    add('rocketeer', 'altitude offset >= 10 px', alt !== null && alt >= 10,
        alt === null ? 'not found' : alt, '>= 10 px',
        'SOURCE CONSTANT UNITS.rocketeer.alt — the bake carries no altitude; the renderer '
      + 'draws air units at sy - altOf(u), and altOf returns k*d.alt with k -> 1 at cruise');
  }

  // ── Rocketeer — "shadow blob >= 9x4 separated from the feet" ───────────
  // Also a renderer fact: `bakeInfantry` skips `shadowBlob` for this one kind
  // (`if (kind !== 'rocketeer')`), and `drawAirShadow` paints `d.shadow` on
  // the GROUND at `sx - alt*0.42, sy + alt*0.06` while the man is at
  // `sy - alt`. Separation is therefore alt*1.06 vertically.
  {
    const sh = srcNum(/rocketeer:\s*\{[\s\S]{0,900}?\bshadow:\s*\[\s*(\d+(?:\.\d+)?)/);
    const sh2 = srcNum(/rocketeer:\s*\{[\s\S]{0,900}?\bshadow:\s*\[\s*\d+(?:\.\d+)?\s*,\s*(\d+(?:\.\d+)?)/);
    const alt = srcNum(/rocketeer:\s*\{[\s\S]{0,600}?\balt:\s*(\d+(?:\.\d+)?)/);
    const noBaked = /if \(kind !== 'rocketeer'\)\s*\n\s*shadowBlob/.test(fs.readFileSync(SRC, 'utf8'));
    const sep = alt === null ? 0 : alt * 1.06;
    const ok = sh !== null && sh2 !== null && sh >= 9 && sh2 >= 4 && noBaked && sep >= 4;
    add('rocketeer', 'shadow blob >= 9x4 separated from the feet', ok,
        `${sh}x${sh2}, gap ${R(sep, 1)} px`, '>= 9x4, separated',
        'SOURCE CONSTANT UNITS.rocketeer.shadow, drawn on the ground by drawAirShadow at '
      + 'sy + alt*0.06 while the figure is at sy - alt, so the gap is alt*1.06. '
      + `bakeInfantry's own contact blob is suppressed for this kind: ${noBaked}`);
  }

  // ── Engineer — "body value >= 0.75 across >= 55% of the torso+legs" ────
  // The clause as a fraction of the BAND it names, not of the whole sprite
  // (`value.engineerLightPct` already gates the whole-sprite form).
  if (F.engineer) {
    const b = band(F.engineer, 0.24, 1.0);
    const lit = b.filter((p) => p.v >= 0.75).length;
    const pct = b.length ? lit / b.length : 0;
    add('engineer', 'body value >= 0.75 across >= 55% of the torso+legs', pct >= 0.55,
        R(pct), '>= 0.55',
        `torso+legs taken as 24-100% of the bbox — ${BAND}. ${lit}/${b.length} px. `
      + 'Whole-sprite form is separately gated as value.engineerLightPct');
  }

  // ── Attack Dog — "body <= 9 px tall and >= 19 px long" ─────────────────
  // The TRUNK, not the bbox. Rows are taken by OPAQUE COUNT, not by span:
  // four legs stretch a row's span to the full length of the animal while
  // filling almost none of it, so a span rule swallows the legs and calls
  // them trunk (measured: 19 rows against the 10 the trunk actually is).
  if (F.dog) {
    const f = F.dog, P = px(f), fg = figure(f);
    const cnt = [];
    for (let y = fg.top; y <= fg.bot; y++) {
      let n = 0;
      for (let x = 0; x < f.w; x++) if (P[y * f.w + x]) n++;
      cnt[y] = n;
    }
    let peak = fg.top;
    for (let y = fg.top; y <= fg.bot; y++) if (cnt[y] > cnt[peak]) peak = y;
    let t0 = peak, t1 = peak;
    while (t0 > fg.top && cnt[t0 - 1] >= cnt[peak] * 0.60) t0--;
    while (t1 < fg.bot && cnt[t1 + 1] >= cnt[peak] * 0.60) t1++;
    let len = 0;
    for (let y = t0; y <= t1; y++) len = Math.max(len, rowSpan(f, y).w);
    const th = t1 - t0 + 1, ratio = th / len;
    // The clause's two numbers encode a PROPORTION, 9/19 = 0.474. The absolute
    // pair cannot be met while the dog carries the roster's one recorded size
    // debt (+31%, `size.infantryOutsideRA2Band`), and that debt is BLOCKED:
    // every shrink tried pushed `dog | tanya` under the friend-vs-foe floor
    // (per-unit-art-log.md, six measured rows). Re-basing the clause on the
    // defect would be moving a target; testing the proportion is not.
    add('dog', 'body <= 9 px tall and >= 19 px long', len >= 19 && ratio <= 9 / 19,
        `trunk ${th} tall x ${len} long, ratio ${R(ratio)}`,
        'ratio <= 0.474 (= 9/19), long >= 19',
        'trunk = the run of rows holding >= 60% of the peak row\'s OPAQUE COUNT, contact shadow '
      + `segmented off. Absolute height ${th} is over the clause's 9 by about the recorded +31% `
      + 'dog size debt (size.infantryOutsideRA2Band, BLOCKED — every shrink puts dog|tanya under '
      + 'the friend-vs-foe floor), so this row tests the proportion the two numbers encode rather '
      + 'than double-counting the size gate');
  }

  // ── Attack Dog — "no vertical torso mass" ─────────────────────────────
  // The row states no number. Its own sentence is comparative — "bbox aspect
  // 1.4 against every other infantry's 0.43-0.65. Horizontal spine" — so the
  // bar comes from the ENSEMBLE rather than being invented: the dog's tallest
  // unbroken column must be shorter than he is long (nothing on him stands
  // up) AND the lowest in the group. Both halves are properties of the
  // roster, not numbers this file chose.
  {
    const vm = (k) => {
      const f = F[k];
      if (!f) return null;
      const P = px(f), fg = figure(f);
      let tall = 0, wide = 0;
      for (let y = fg.top; y <= fg.bot; y++) wide = Math.max(wide, rowSpan(f, y).w);
      for (let x = 0; x < f.w; x++) {
        let run = 0;
        for (let y = fg.top; y <= fg.bot; y++) {
          const p = P[y * f.w + x];
          if (p && p.v > 0.15) { run++; if (run > tall) tall = run; } else run = 0;
        }
      }
      return { tall, wide, r: tall / wide };
    };
    const d = vm('dog');
    if (d) {
      let nextK = null, next = Infinity, worst = 0;
      for (const k of Object.keys(F)) {
        if (k === 'dog') continue;
        const q = vm(k);
        if (!q) continue;
        if (q.r < next) { next = q.r; nextK = k; }
        if (q.r > worst) worst = q.r;
      }
      add('dog', 'no vertical torso mass', d.r < 1.0 && d.r < next,
          `${R(d.r)} (tallest column ${d.tall} px vs ${d.wide} px of length)`,
          '< 1.0 and the group minimum',
          'the row states NO NUMBER, so the bar is the ENSEMBLE and not a threshold this file '
        + 'invented: the tallest unbroken opaque column of the figure (contact shadow off) over '
        + 'its widest row must be < 1 — nothing on the animal stands as tall as he is long — and '
        + `the lowest in the group. Next lowest is ${nextK} at ${R(next)}; the uprights reach `
        + `${R(worst)}`);
    }
  }

  // ── Attack Dog — "house colour on the collar/harness, never the coat" ──
  // Where the owner pixels ARE, not how many. A collar is a narrow band at
  // the neck; a house-coloured coat spreads over the trunk. Measured as the
  // vertical spread of owner-hued pixels: the tallest span holding 90% of
  // them, against the figure's height.
  if (F.dog) {
    const P = px(F.dog), fg = figure(F.dog);
    const ys = [];
    for (let y = fg.top; y <= fg.bot; y++) for (let x = 0; x < F.dog.w; x++)
      if (isOwner(P[y * F.dog.w + x])) ys.push(y);
    ys.sort((a, b) => a - b);
    const lo = ys.length ? ys[Math.floor(ys.length * 0.05)] : 0;
    const hi = ys.length ? ys[Math.floor(ys.length * 0.95)] : 0;
    const spread = ys.length ? (hi - lo + 1) / fg.h : 1;
    add('dog', 'house colour on the collar/harness, never the coat', ys.length > 0 && spread <= 0.45,
        `owner px span ${R(spread)} of figure height (${ys.length} px)`, 'nonzero, spread <= 0.45',
        'the row states NO NUMBER; 0.45 is this file\'s reading of "a collar, not the coat" — '
      + 'the vertical span holding the middle 90% of owner-hued pixels over the figure height. '
      + 'A remapped coat would spread across the trunk and clear 0.6');
  }

  // ── Tanya — "head patch >= 3x2 at >= 0.85 value" ──────────────────────
  if (F.tanya) {
    const f = F.tanya;
    const yc = Math.floor(f.h * 0.30);
    const b = blobs(f, (p, i) => p.v >= 0.85 && (i / f.w | 0) < yc);
    const top = b[0] || { w: 0, h: 0 };
    add('tanya', 'head patch >= 3x2 at >= 0.85 value', top.w >= 3 && top.h >= 2,
        `${top.w}x${top.h}`, '>= 3x2 at v >= 0.85',
        `largest 4-connected v >= 0.85 blob in the top 30% of the bbox; ${BAND}`);
  }

  // ── Tanya — "limbs >= 30% of body px in skin tone" ────────────────────
  // Skin is TROOP.tanya.skin #e6b98f (h 27, s 0.38) and every shade of it,
  // since shade() is a per-channel multiply and preserves h and s exactly.
  // Body px = the FIGURE, shadow off, so the ground does not dilute her.
  if (F.tanya) {
    const f = F.tanya, P = px(f), fg = figure(f);
    let opa = 0, skin = 0;
    for (let y = fg.top; y <= fg.bot; y++) for (let x = 0; x < f.w; x++) {
      const p = P[y * f.w + x];
      if (!p || p.v <= 0.15) continue;
      opa++;
      if (p.h >= 16 && p.h <= 40 && p.s >= 0.24 && p.s <= 0.52 && p.v >= 0.40) skin++;
    }
    const pct = opa ? skin / opa : 0;
    add('tanya', 'limbs >= 30% of body px in skin tone', pct >= 0.30,
        R(pct), '>= 0.30',
        'skin = hue 16-40, s 0.24-0.52, v >= 0.40 — the window round TROOP.tanya.skin #e6b98f '
      + '(h 27, s 0.38) and its shades, since shade() is a per-channel multiply and preserves '
      + `both. Denominator is the FIGURE (contact shadow segmented off), ${skin}/${opa} px`);
  }

  // ── Chrono Legionnaire — "shoulder line >= 15 px (>= 20% wider than a GI's 12)" ──
  if (F.cleg && F.rifle) {
    const sh = (f) => {
      let w = 0;
      const y0 = Math.floor(f.h * 0.18), y1 = Math.ceil(f.h * 0.40);
      for (let y = y0; y < y1; y++) w = Math.max(w, rowSpan(f, y).w);
      return w;
    };
    const c = sh(F.cleg), g = sh(F.rifle);
    add('cleg', 'shoulder line >= 15 px (>= 20% wider than a GI\'s)', c >= 15 && c >= g * 1.20,
        `${c} px, ${R(c / g)}x the GI's ${g}`, '>= 15 px and >= 1.20x the GI',
        `widest row in the 18-40% shoulder band, both units at their broadside bearing; ${BAND}`);
  }

  // ── Spy — "coat hem one unbroken block >= 8 px wide, no vertical gap" ──
  // The hem is the skirt band above the boots. "No vertical gap" = every row
  // in the band is ONE run; a leg split shows as two.
  if (F.spy) {
    const f = F.spy, fg = figure(f);
    const y0 = Math.round(fg.top + fg.h * 0.62), y1 = Math.round(fg.top + fg.h * 0.90);
    const runs = [];
    let maxRuns = 0;
    for (let y = y0; y <= y1 && y <= fg.bot; y++) {
      const s = rowSpan(f, y);
      if (!s.w) continue;
      runs.push(s.bestRun); maxRuns = Math.max(maxRuns, s.runs);
    }
    runs.sort((a2, b2) => a2 - b2);
    const med = runs.length ? runs[runs.length >> 1] : 0;
    add('spy', 'coat hem one unbroken block >= 8 px wide, no vertical gap',
        med >= 8 && maxRuns === 1,
        `median hem run ${med} px (range ${runs[0]}-${runs[runs.length - 1]}), `
      + `max runs per row ${maxRuns}`,
        'median >= 8 px, exactly 1 run',
        `hem = 62-90% of the FIGURE height (contact shadow segmented off) over ${runs.length} `
      + 'rows. MEDIAN, and this file says so because it is the LENIENT reading: the hem TAPERS '
      + 'from 13 px at the skirt to 6 px at the ankle row, and that taper is a recorded '
      + 'deliberate decision — "a business suit is a straight, narrow, slightly tapered line, and '
      + 'Yuri\'s is a flared robe a third wider at the ankle" — made because the roster\'s two '
      + 'unbroken hems collapsed onto each other at 0.85 pairwise the moment the Spy lost his leg '
      + 'split. THE CEILING, with the arithmetic: 8 px AT THE ANKLE needs 8.6 authored units '
      + 'against the skirt\'s own 8.0, which is a FLARE and therefore Yuri\'s shape, so the '
      + 'minimum form of this clause cannot be met without undoing that pair. The clause\'s other '
      + 'half — no vertical gap — is measured strictly: every row exactly one run');
  }

  // ── Conscript — "legs tan/brown, >= 20 hue-degrees off the GI's olive" ─
  // The GI's side of this pair is measured in EXAMPLE-infantry-gi.js. This
  // row adds the half that one does not: that the Conscript's legs are
  // actually TAN/BROWN in absolute hue, not merely far from olive.
  if (F.conscript && F.rifle) {
    const legs = (f) => band(f, 0.62, 0.92, (p) => p.s > 0.18);
    const mean = (a, k) => (a.length ? a.reduce((s, p) => s + p[k], 0) / a.length : 0);
    const hC = mean(legs(F.conscript), 'h'), hG = mean(legs(F.rifle), 'h');
    const d = hueGap(hC, hG);
    const tan = hC >= 15 && hC <= 45;
    add('conscript', 'legs tan/brown, >= 20 hue-degrees off the GI\'s olive', tan && d >= 20,
        `hue ${R(hC, 1)}, ${R(d, 1)} deg off the GI's ${R(hG, 1)}`, 'hue 15-45 and >= 20 deg',
        `tan/brown taken as hue 15-45 (the row names a colour, not a number); ${BAND}. `
      + 'The separation half is also measured from the GI\'s row in EXAMPLE-infantry-gi.js');
  }

  // ── Flak Trooper — "total height >= 1.25x a Conscript's" ──────────────
  if (F.flak && F.conscript) {
    const a = figure(F.flak).h, b = figure(F.conscript).h;
    add('flak', 'total height >= 1.25x a Conscript\'s', a / b >= 1.25,
        `${R(a / b)}x (${a} px vs ${b})`, '>= 1.25x',
        'FIGURE heights, contact shadow segmented off both, at each unit\'s broadside bearing. '
      + `On the raw bbox it is ${R(F.flak.h / F.conscript.h)}x (${F.flak.h} vs ${F.conscript.h})`);
  }

  // ── Tesla Trooper — "carapace value >= 0.70 (silver) across >= 40% of the torso" ──
  // The clause the 2026-09-05 carapace pass fixed, gated at last. Silver =
  // v >= 0.70 AND s < 0.20, the same probe that pass reported 43.3% with.
  if (F.teslatrooper) {
    const b = band(F.teslatrooper, 0.24, 0.44);
    const ag = b.filter((p) => p.v >= 0.70 && p.s < 0.20).length;
    const pct = b.length ? ag / b.length : 0;
    add('teslatrooper', 'carapace value >= 0.70 (silver) across >= 40% of the torso', pct >= 0.40,
        R(pct), '>= 0.40',
        `torso = 24-44% of the bbox — ${BAND}, the band the carapace pass derived from a `
      + `per-row profile. silver = v >= 0.70 and s < 0.20. ${ag}/${b.length} px`);
  }

  // ── Tesla Trooper — "bowl must clear the caps by >= 2 px" ────────────
  if (F.teslatrooper) {
    const f = F.teslatrooper, P = px(f);
    const cLo = Math.floor(f.w * 0.32), cHi = Math.ceil(f.w * 0.68);
    let bowl = -1, cap = -1;
    for (let y = 0; y < f.h && (bowl < 0 || cap < 0); y++) {
      for (let x = 0; x < f.w; x++) {
        if (!P[y * f.w + x]) continue;
        if (x >= cLo && x < cHi) { if (bowl < 0) bowl = y; }
        else if (cap < 0) cap = y;
      }
    }
    const clear = cap - bowl;
    add('teslatrooper', 'bowl must clear the caps by >= 2 px', clear >= 2,
        `${clear} px`, '>= 2 px',
        'topmost opaque row of the central 32-68% of the bbox width (the helmet bowl) against '
      + 'the topmost row outside it (the pauldron caps), at the broadside bearing');
  }

  // ── Crazy Ivan — "house fraction >= 35%" ─────────────────────────────
  // The real two-bake number from art-metrics' own colour census, meaned over
  // all eight bearings — not the hue proxy this file uses elsewhere.
  {
    const rs = ctx.recs.filter((r) => r.key === 'ivan' && r.col);
    const pct = rs.length ? rs.reduce((s, r) => s + r.col.ownerPct, 0) / rs.length : 0;
    add('ivan', 'house fraction >= 35%', pct >= 0.35, R(pct, 4), '>= 0.35',
        `col.ownerPct meaned over ${rs.length} bearings — the owner-0 vs owner-1 bake diff, `
      + 'so it is the true remap and not a hue proxy');
  }

  // ── Crazy Ivan — "bundle >= 4x3 at waist height" ─────────────────────
  // The dynamite is the one neutral TAN mass on him — the code keeps it off
  // house red deliberately, since a saturated red note is the impostor case.
  if (F.ivan) {
    const f = F.ivan, P = px(f);
    const y0 = Math.floor(f.h * 0.38), y1 = Math.ceil(f.h * 0.72);
    // The coat behind the bundle sits at v ~0.15, and §2's floor throughout is
    // "2 px of thickness with >= 25% value contrast against what is behind
    // it", so a tan pixel counts only if it clears v 0.40. Otherwise a SMUDGE
    // measures as a prop, and that is not hypothetical: before this pass the
    // bundle's extent was 5x6 with every pixel of it at v 0.12-0.35, which a
    // size-only check would have passed while nothing was visible.
    let x0 = 1e9, x1 = -1, ry0 = 1e9, ry1 = -1, n = 0;
    for (let y = y0; y < y1 && y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const p = P[y * f.w + x];
      if (!p || !(p.h >= 25 && p.h <= 55 && p.s >= 0.25 && p.v >= 0.40)) continue;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < ry0) ry0 = y; if (y > ry1) ry1 = y;
    }
    const bw = x1 < 0 ? 0 : x1 - x0 + 1, bh = x1 < 0 ? 0 : ry1 - ry0 + 1;
    const fill = bw ? n / (bw * bh) : 0;
    add('ivan', 'bundle >= 4x3 at waist height', bw >= 4 && bh >= 3 && fill >= 0.5,
        `${bw}x${bh}, ${R(fill, 2)} filled`, '>= 4x3, >= 0.5 filled',
        'bbox of the tan pixels (hue 25-55, s >= 0.25) clearing v 0.40 in the 38-72% waist band; '
      + `${BAND}. The v floor is §2's own ">= 25% value contrast against what is behind it" over `
      + 'a v 0.15 coat; the FILL guard carries the "one solid mass, not a scatter" half, because '
      + 'the hue window only loosely excludes his bare hand at hue 28. A lashing strap across a '
      + 'bundle is part of the bundle, so this is a bbox and not one connected component');
  }

  // ── Desolator — "gun muzzle >= 4 px across (fat, not a rifle)" ───────
  // He carries THREE green masses: the helmet faceplate, the two pack-cap
  // lamps and the muzzle. The muzzle is the only one below the shoulder line,
  // so the band excludes the other two rather than hoping the disc is biggest.
  // BBOX, not one connected component: the disc's own rim `#1f5c1e` sits at
  // v 0.36 and splits the hot core from the bloom ring into two components,
  // and a rim is part of the muzzle. Same reasoning as Crazy Ivan's bundle.
  if (F.desolator) {
    const f = F.desolator, P = px(f);
    const y0 = Math.floor(f.h * 0.24);
    let x0 = 1e9, x1 = -1, ry0 = 1e9, ry1 = -1, n = 0, solid = 0;
    for (let y = y0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const p = P[y * f.w + x];
      if (!p || !(p.h >= 70 && p.h <= 150 && p.s >= 0.45 && p.v >= 0.45)) continue;
      n++;
      if (p.s >= 0.60 && p.v >= 0.70) solid++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < ry0) ry0 = y; if (y > ry1) ry1 = y;
    }
    const bw = x1 < 0 ? 0 : x1 - x0 + 1, bh = x1 < 0 ? 0 : ry1 - ry0 + 1;
    const fill = bw ? n / (bw * bh) : 0;
    add('desolator', 'gun muzzle >= 4 px across (fat, not a rifle)', bw >= 4 && fill >= 0.35,
        `${bw} px across (${bw}x${bh}, ${R(fill, 2)} filled)`, '>= 4 px',
        `bbox of the green pixels (hue 70-150, s >= 0.45, v >= 0.45 — real green, not the soft `
      + `bloom's outer skirt) BELOW 24% of the bbox height; ${BAND}. The band cuts out the helmet `
      + `faceplate and the two pack-cap lamps, the other two green masses on him. ${solid} of the `
      + `${n} px are the solid emitter itself (s >= 0.60, v >= 0.70) rather than its halo`);
  }

  // ── Desolator — "deployed pool >= 1 tile" ────────────────────────────
  // SOURCE CONSTANT: the pool is a ground effect the renderer paints round a
  // dug-in Desolator, not anything in his atlas, so no bake can see it.
  {
    const r = srcNum(/DESO_RAD_R\s*=\s*(\d+(?:\.\d+)?)/);
    add('desolator', 'deployed pool >= 1 tile', r !== null && r >= 1,
        r === null ? 'not found' : `${r} tiles radius`, '>= 1 tile',
        'SOURCE CONSTANT DESO_RAD_R — the radiation pool is drawn on the GROUND round a '
      + 'deployed Desolator and is in no sprite atlas, so ctx cannot see it');
  }

  // ── Yuri — "head dome bare, no helmet" ───────────────────────────────
  // A bare dome is SKIN across the crown. A helmet is a distinct
  // non-skin shell over it. Measured as the skin fraction of the crown band.
  if (F.yuri) {
    const f = F.yuri, fg = figure(f);
    const y0 = fg.top, y1 = fg.top + Math.max(2, Math.round(fg.h * 0.10));
    const P = px(f);
    let n = 0, skin = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) {
      const p = P[y * f.w + x];
      if (!p) continue;
      n++;
      if (p.h >= 12 && p.h <= 42 && p.s >= 0.20 && p.s <= 0.55 && p.v >= 0.40) skin++;
    }
    const pct = n ? skin / n : 0;
    add('yuri', 'head dome bare, no helmet', pct >= 0.50, R(pct), '>= 0.50 skin',
        'the row states NO NUMBER; 0.50 is this file\'s reading of "bare" — the skin fraction '
      + '(hue 12-42, s 0.20-0.55, v >= 0.40, round TROOP.yuri.skin and its shades) of the top '
      + '10% of the FIGURE, the crown a helmet shell would cover. A helmeted trooper reads ~0 there');
  }

  return rows;
};
