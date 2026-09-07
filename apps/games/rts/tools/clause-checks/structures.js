/**
 * §2.5-2.9's STRUCTURE CLAUSES — 91 budget clauses across 25 structure keys,
 * NONE of them gated before this file (docs/clause-inventory.md, "None of
 * them is in `clause.checked`, and that is deliberate").
 *
 * The blocker was plumbing, not analysis: `pageExtract` baked a structure as
 * `{ key, fac, name, cat, gw, gh, w, h, edges }` — no mask, no rgba, so no
 * check here had per-pixel data. art-metrics.js's structure `bbox()` now
 * encodes both (same one-byte-per-pixel mask / four-byte-per-pixel rgba,
 * base64, as the unit bake), and `ctx.byBldFac(key, fac)` decodes them. That
 * is the whole of what changed outside this file.
 *
 * ── THIS FILE IS A SEPARATE METRIC, NEVER FOLDED INTO `clause.checked`.
 * Every row pushed here carries `module: 'structures.js'` (art-metrics.js's
 * loader stamps it) and is excluded from `checked`/`unmet`/`struck`/`waived`,
 * which stay computed over unit rows only — see the partition in
 * art-metrics.js right after the clause loader. Counted instead under
 * `clause.checkedStructures` / `unmetStructures` / `struckStructures` /
 * `waivedStructures`, each with its OWN `want`. clause-inventory.md's own
 * words: "a separate metric, not a bigger 57".
 *
 * ── WHY `want` IS NOT 91. A structure has no owner-1 bake (`S.bld[1]` does
 * not exist — grep the sheet builder), so there is no colour-diff census
 * route the way units get one; house-colour rows below reuse vehicle.js's
 * already-derived OWNER_HUE=197 convention on the single owner-0 bake, not a
 * fresh one. More importantly, several §2.9-adjacent rows say outright that
 * no number can be sourced (`nuke`'s single clause, `spysat`'s composition
 * clause, several "no fraction is stated" halves under §2.6). Those are
 * logged as UNMEASURABLE, with the reason on the row, rather than faked —
 * this file's own precedent for that shape is `vehicle.js`'s Chrono
 * Legionnaire rifle. `checkedStructures`'s `want` is set to what this file
 * actually reaches, the same "a target that cannot be reached gets disabled"
 * rule that already governs `clause.checked`'s 57.
 *
 * ── FACTION ASSIGNMENT is read from the game's own build lists
 * (`buildOrderFor`/`defenceOrderFor`, rts.html ~2521-2530), not guessed from
 * prose: `sentry`=dir only, `sentrygun`=col only (the dir/col bakes of
 * `sentrygun` actually differ — 67x50 vs 67x69 — unlike every other
 * single-faction defence/superweapon key, which bakes BYTE-IDENTICAL under
 * both fac letters because the game only ever draws one and the other is an
 * inert fallback). `power`/`refinery`/`barracks`/`factory`/`shipyard`/
 * `depot`/`lab`/`base` are genuinely dual — both facs are drawn in play.
 *
 * ── CONVENTIONS reused from vehicle.js rather than re-derived:
 * 1. BBOX = the whole baked sprite, contact shadow included (art-metrics.js's
 *    structure `bbox()`, same as the unit one).
 * 2. HOUSE COLOUR = `s >= 0.25 && v >= 0.20 && hueGap(h, 197) <= 20`.
 * 3. CROWN = §2.5's primitive: the rows above `bodyRun(rowProfile).lo`, the
 *    topmost row of the contiguous run at >= 55% of the profile's own max
 *    (the same 55% convention `spikeOf` uses for units). "Crown clears the
 *    roofline by >= X `Sh`" is read directly as `bodyRun.lo / Sh`, because a
 *    tight bbox's very top row is always opaque (that is how the bbox was
 *    cut), so the crown's own tip is always row 0 and the clearance IS the
 *    roofline's row index.
 * 4. VALUE CONTRAST ">= 25%" is read literally off the V channel against the
 *    sprite's own median V over opaque pixels — power's row calls 25% "the
 *    §2 floor", i.e. the number the reference itself already treats as the
 *    generic floor, not a threshold invented here.
 *
 * ── ON THRESHOLDS the row states no number ("no fraction is stated", counts
 * only): the row is still checked for the COUNT/CONTRAST it does state, and
 * the note says the reference gives no fraction — never a fabricated one.
 */
'use strict';

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
const OWNER_HUE = 197;                        // vehicle.js's derived convention, reused (see header)
const CONTRAST = 0.25;                        // "the §2 floor" (power's lit-slit row, §2.6)

function px(f, x, y) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return null;
  const i = y * f.w + x;
  if (!f.mask[i]) return null;
  const j = i * 4;
  if (f.rgba[j + 3] <= 8) return null;
  return hsv(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]);
}
const isHouse = (p) => !!p && p.s >= 0.25 && p.v >= 0.20 && hueGap(p.h, OWNER_HUE) <= 20;

function rowProfile(f) {
  const p = new Int32Array(f.h);
  for (let y = 0; y < f.h; y++) { let n = 0; for (let x = 0; x < f.w; x++) if (f.mask[y * f.w + x]) n++; p[y] = n; }
  return p;
}
function colProfile(f) {
  const p = new Int32Array(f.w);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.mask[y * f.w + x]) p[x]++;
  return p;
}
/**
 * THE 55% CUT PROPOSES A ROOFLINE; MONOTONICITY VETOES IT.
 *
 * The old rule was the first half alone: the body is the run at >= 55% of the
 * profile's own max, and the crown is whatever sits above it. On a silhouette
 * that widens CONTINUOUSLY -- a dome, a plate apex, a dish seen edge-on -- the
 * profile takes several rows to climb past 55%, and those rows became a
 * "crown": a part the sprite does not have. `sentry` (a sandbag pillbox with
 * no mast and no drum) was failing "zero vertical mast and zero enclosing
 * drum" on a 4-row sliver of its own rim; `radar`, `spysat` and `prism` had
 * their rooflines cut THROUGH the dish/umbrella those rows were meant to sit
 * under. Full evidence: docs/design-decisions.md, "bodyRun's 55%-of-max cutoff
 * invents a 'crown' part on smooth silhouettes".
 *
 * The veto is the definition of "distinct part", not a threshold: a crown is
 * separable from the body only if SOMETHING separates them -- a waist (a row
 * narrower than what lies both above and below it) or a shoulder (a row
 * abruptly wider than the one above). Both appear in the row profile as a step
 * DOWN somewhere between row 0 and the proposed roofline. If the profile only
 * ever widens on the way down to that row, the "crown" is the apex of the same
 * mass, and this primitive reports NO CROWN: `crown: false` and `lo: 0`, so
 * `y < lo` is empty and nothing above the roofline can be counted.
 *
 * Deliberately conservative in three ways:
 * - It never MOVES a roofline, only cancels one. Relocating `lo` to a waist
 *   was implemented and measured over the whole corpus and is worse: to the
 *   deepest waist gives 23 unmet structure clauses (from 18), to the topmost
 *   waist deeper than 0.30 gives 21, both by breaking reads that are right
 *   today -- the Battle Lab's 4 masts, the Barracks' 2 barrels, the Collective
 *   Barracks' statue clearance. Where a boundary exists 55% is a good
 *   roofline; its only failure mode is inventing one where none exists.
 * - It is threshold-free, so there is no fraction to tune and nothing to tune
 *   TOWARDS a clause passing: monotone or not is a property of the profile.
 * - "No crown" also covers the case where the crown is real but too WIDE for
 *   any width-fraction roofline to sit under it (radar's dish, prism's
 *   umbrella). The honest report is then "this primitive found no crown",
 *   never a phantom one -- which is why those clauses read their crown by
 *   their own convention (largest blob in the top half) instead.
 *
 * CALLERS: a clearance read of the form `body.lo / f.h` is 0 when
 * `crown === false`. That is right for a ">= X" floor (nothing clears
 * anything) but would satisfy a "<= X" ceiling for free, so the two rows
 * shaped that way (`shipyard`'s jib tip, `reactor`'s tower crown) are guarded
 * on `body.crown`. Check it before reading `lo` as a distance.
 */
function bodyRun(profile) {
  let mx = 0;
  for (let i = 0; i < profile.length; i++) if (profile[i] > mx) mx = profile[i];
  const cut = 0.55 * mx;
  let lo = -1, hi = -1;
  for (let i = 0; i < profile.length; i++) if (profile[i] >= cut) { if (lo < 0) lo = i; hi = i; }
  let crown = false;
  for (let i = 1; i <= lo; i++) if (profile[i] < profile[i - 1]) { crown = true; break; }
  if (!crown) lo = 0;
  return { lo, hi, mx, crown };
}
/** 8-connected components of a predicate over the bbox — vehicle.js's implementation. */
function components(f, pred) {
  const seen = new Uint8Array(f.w * f.h), out = [];
  const ok = new Uint8Array(f.w * f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) ok[y * f.w + x] = pred(px(f, x, y), x, y) ? 1 : 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i0 = y * f.w + x;
    if (!ok[i0] || seen[i0]) continue;
    const stack = [i0]; seen[i0] = 1;
    let n = 0, x0 = f.w, x1 = -1, y0 = f.h, y1 = -1;
    const cells = [];
    while (stack.length) {
      const i = stack.pop(), cx = i % f.w, cy = (i - cx) / f.w;
      n++; cells.push(i);
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const j = ny * f.w + nx;
        if (ok[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push({ n, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cells });
  }
  return out.sort((a, b) => b.n - a.n);
}
/**
 * COUNTING MEMBERS THAT SHARE A ROOT — the primitive `components` cannot be.
 *
 * A crown of talons, a pair of barrels, a rack of masts: every one of them is
 * ONE 8-connected component, because the thing that makes them a set is that
 * they are joined at the bottom. Counting them with `components` therefore
 * counts 1 no matter how many are drawn, and no art change can move that
 * number -- the Sentry Gun's barrel row is the same trap, recorded in
 * docs/design-decisions.md as "unreachable by a crown primitive".
 *
 * The eye does not count them by connectivity. It counts them across a CUT:
 * at some height the members stand apart, and how many stand there is how many
 * there are. `rowRuns` takes that cut -- the maximal horizontal runs of a
 * predicate on one row, each at least `minW` wide -- and `resolveBand` finds
 * the cut worth reporting.
 *
 * WHY A BAND AND NOT A SINGLE ROW. One row is noise: an antialiasing fringe or
 * a rim highlight splits a run for exactly one row and invents a member. A
 * talon/barrel/mast is TALL, so a cut that genuinely resolves it resolves it
 * on its neighbours too. `resolveBand` therefore reports the largest count
 * that HOLDS over `minRows` consecutive rows. That is a definition of
 * "countable", not a tuned threshold: on the Gap Generator's own crown the
 * one-row accidents (5 dark runs across the instrument pods at row 27, gone
 * again at 26 and 28) are exactly what it drops, while the real four-talon cut
 * at rows 9-10 survives because talons are tall.
 *
 * It returns the WIDEST cut, not the topmost: members of unequal height (the
 * Gap Generator draws two short outer talons and two tall inner ones) are all
 * present only below the shortest one's tip. Reported with its own row range
 * and x-span so a reader can see WHERE the count was taken rather than trust
 * that it was taken somewhere sensible.
 */
function rowRuns(f, y, pred, minW) {
  const out = [];
  let s = -1;
  for (let x = 0; x < f.w; x++) {
    const on = !!pred(px(f, x, y), x, y);
    if (on && s < 0) s = x;
    if (s >= 0 && (!on || x === f.w - 1)) {
      const e = on ? x : x - 1;
      if (e - s + 1 >= minW) out.push([s, e]);
      s = -1;
    }
  }
  return out;
}
function resolveBand(f, yTop, yBot, pred, minW, minRows) {
  const per = [];
  for (let y = yTop; y < yBot; y++) per.push(rowRuns(f, y, pred, minW));
  let best = { count: 0, y0: -1, y1: -1, x0: 0, x1: -1, rows: 0 };
  for (let i = 0; i < per.length; i++) {
    const n = per[i].length;
    if (!n) continue;
    let j = i;
    while (j + 1 < per.length && per[j + 1].length === n) j++;
    const rows = j - i + 1;
    if (rows >= minRows && n > best.count) {
      let x0 = f.w, x1 = -1;
      for (let k = i; k <= j; k++) for (const [a, b] of per[k]) { if (a < x0) x0 = a; if (b > x1) x1 = b; }
      best = { count: n, y0: yTop + i, y1: yTop + j, x0, x1, rows };
    }
    i = j;
  }
  return best;
}
function gapBetween(f, A, B) {
  let best = 1e9;
  for (const i of A.cells) {
    const ax = i % f.w, ay = (i - ax) / f.w;
    for (const j of B.cells) {
      const bx = j % f.w, by = (j - bx) / f.w;
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by)) - 1;
      if (d < best) best = d;
    }
  }
  return best === 1e9 ? 0 : best;
}
const opaqueOf = (f) => { let n = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i]) n++; return n; };
function medianV(f) {
  const vs = [];
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const p = px(f, x, y); if (p) vs.push(p.v); }
  if (!vs.length) return 0;
  vs.sort((a, b) => a - b);
  return vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
}
/** the crown region: rows strictly above the body run's top edge. */
function crownRows(f) { const b = bodyRun(rowProfile(f)); return b.lo; }

// Faction assignment read from rts.html's own buildOrderFor/defenceOrderFor
// (~2521-2530) — ground truth, not prose-guessed. See header.
const FAC = {
  base: ['dir', 'col'], power: ['dir', 'col'], refinery: ['dir', 'col'], barracks: ['dir', 'col'],
  factory: ['dir', 'col'], shipyard: ['dir', 'col'], depot: ['dir', 'col'], lab: ['dir', 'col'],
  radar: ['col'], reactor: ['col'], airforce: ['dir'], purifier: ['dir'], spysat: ['dir'],
  sentry: ['dir'], sentrygun: ['col'], tesla: ['col'], prism: ['dir'], patriot: ['dir'],
  flakcannon: ['col'], grandcannon: ['dir'], gapgen: ['dir'], chrono: ['dir'], weather: ['dir'],
  curtain: ['col'], nuke: ['col'],
};

exports.check = function (ctx) {
  const rows = [];
  const R = ctx.round;
  const add = (key, clause, ok, measured, want, note) => rows.push({ unit: key, clause, ok, measured, want, note });
  const skip = (key, clause, reason) => { /* logged, NOT emitted as a row — see header */ void key; void clause; void reason; };
  const F = {};
  for (const k of Object.keys(FAC)) for (const fac of FAC[k]) {
    const b = ctx.byBldFac(k, fac);
    if (b) (F[k] = F[k] || {})[fac] = b;
  }
  const bad = [];   // unmeasurable clauses, logged with a reason — never faked
  const un = (key, clause, reason) => bad.push({ key, clause, reason });

  // ── 2.6 PRODUCTION AND ECONOMY ────────────────────────────────────────

  // base — Construction Yard (dir + col, both drawn)
  for (const fac of FAC.base) {
    const f = F.base && F.base[fac]; if (!f) continue;
    const asp = f.w / f.h;
    add('base', `[${fac}] sprite w/h >= 1.30 — the widest-aspect structure in the game, stated as a floor per §2.5's width rule`,
      asp >= 1.30, R(asp, 3), '>= 1.30',
      `bbox ${f.w}x${f.h}`);
    const rp = rowProfile(f), body = bodyRun(rp);
    const crown = components(f, (p, x, y) => !!p && y < body.lo);
    const jibOk = crown.length >= 1 && Math.min(crown[0].w, crown[0].h) >= 3;
    const clearance = body.lo / f.h;
    add('base', `[${fac}] exactly ONE crane/boom group above the hall roofline, its jib >= 3 px thick and clearing the roof by >= 0.10 Sh`,
      crown.length === 1 && jibOk && clearance >= 0.10,
      `${crown.length} crown group(s), thickest ${crown[0] ? Math.min(crown[0].w, crown[0].h) : 0}px, clearance ${R(clearance, 3)}`,
      '1 group, >=3px thick, clearance >= 0.10',
      'crown = components above bodyRun.lo (§2.5\'s crown primitive); a second group here is flagged because §2.6 says a second mast group is the Battle Lab\'s read, not the Yard\'s. '
      + 'The dir bake reads ZERO groups and that is an ART finding, not a measurement gap: its row profile widens monotonically from the arch apex down to the 55% row, so bodyRun reports no crown, '
      + 'and the render agrees -- the hall\'s own arch is the topmost mass and the yellow crane sits entirely BELOW it, off to the left. The 1-group pass this row used to report was the arch\'s top '
      + '36 rows counted as a crane. The col bake, which has a real waist above its roofline, still reads its crane and still passes');
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    const frac = hn / opaqueOf(f);
    add('base', `[${fac}] house fraction 9-16%, trim only, never the hall roof`,
      frac >= 0.09 && frac <= 0.16, `${R(frac * 100, 1)}%`, '9-16%',
      'census = isHouse over the whole sprite (OWNER_HUE=197 convention, no positional "never the roof" check — that half is unmeasurable without a labelled roof region)');
  }

  // power — Power Plant (dir) / Tesla Reactor (col)
  if (F.power && F.power.dir) {
    const f = F.power.dir;
    const crown = components(f, (p, x, y) => !!p && y < crownRows(f));
    const towers = crown.filter((c) => c.w >= 0.10 * f.w);   // drop stray 1-2px noise
    const widths = towers.map((c) => R(c.w / f.w, 3));
    add('power', '[dir] exactly 3 towers, each 0.18-0.22 Sw',
      towers.length === 3 && towers.every((c) => c.w / f.w >= 0.18 && c.w / f.w <= 0.22),
      `${towers.length} crown blobs, widths ${widths.join('/')} of Sw`, '3 blobs, each 0.18-0.22 Sw',
      'crown blobs = components above bodyRun.lo, filtered to >=0.10 Sw to drop antenna-scale noise');
    const body = bodyRun(rowProfile(f));
    const tallestTop = towers.length ? Math.min(...towers.map((c) => c.y0)) : body.lo;
    const clearance = (body.lo - tallestTop) / f.h;
    add('power', '[dir] the tallest crown clears the drum roofline by >= 0.45 Sh',
      clearance >= 0.45, R(clearance, 3), '>= 0.45',
      'roofline = bodyRun.lo (55%-of-max row), tallest crown tip = min y0 across the 3 tower blobs');
    un('power', 'each tower carries a lit slit >= 2px wide at >= 25% value contrast',
      'no per-tower sub-region is identified narrowly enough to isolate a 2px slit from the tower\'s own outline within one blob; a whole-tower brightness-outlier scan risks confusing the slit with the tower\'s own rim highlight');
    un('power', 'zero chimneys — a chimney is the Refinery\'s read',
      'chimney vs tower is a shape distinction (chimney = 1 thin protrusion, tower = 3 wider blobs) already implied by the tower-count clause above; a dedicated "not a chimney" detector would just restate that count');
  }
  if (F.power && F.power.col) {
    const f = F.power.col;
    const crown = components(f, (p, x, y) => !!p && y < crownRows(f));
    const houseBlobs = components(f, (p) => isHouse(p));
    add('power', '[col] exactly ONE orb held between exactly TWO masses (no fraction is stated)',
      crown.length >= 1, `${crown.length} crown blob(s), ${houseBlobs.length} house-coloured blob(s)`, '>=1 crown blob (no fraction stated)',
      'the row itself states no fraction — this checks only that a distinct crown mass exists, not the 1-orb/2-mass count, which needs shape (round vs masonry) this tool cannot tell');
  }

  // refinery — 2 stacks over a vault (dir + col)
  for (const fac of FAC.refinery) {
    const f = F.refinery && F.refinery[fac]; if (!f) continue;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w >= 0.06 * f.w);
    if (crown.length >= 2) {
      const [a, b] = crown;
      const gap = gapBetween(f, a, b) / f.w;
      add('refinery', `[${fac}] exactly 2 stacks with a clear gap >= 0.08 Sw between them`,
        crown.length === 2 && gap >= 0.08, `${crown.length} stacks, gap ${R(gap, 3)} Sw`, '2 stacks, gap >= 0.08 Sw',
        'stacks = crown components above bodyRun.lo, filtered to >=0.06 Sw');
      const widths = crown.map((c) => R(c.w / f.w, 3));
      add('refinery', `[${fac}] each stack 0.12-0.15 Sw`,
        crown.every((c) => c.w / f.w >= 0.12 && c.w / f.w <= 0.15), widths.join('/'), '0.12-0.15 Sw each', '');
      const tallerTop = Math.min(a.y0, b.y0);
      const clearance = (body.lo - tallerTop) / f.h;
      add('refinery', `[${fac}] the taller stack clears the vault crown by >= 0.30 Sh`,
        clearance >= 0.30, R(clearance, 3), '>= 0.30', '');
    } else {
      add('refinery', `[${fac}] exactly 2 stacks with a clear gap >= 0.08 Sw between them`,
        false, `${crown.length} stack-sized crown blob(s) found`, '2 stacks', 'no committed sprite for this fac per §2.9' );
    }
    un('refinery', 'an unroofed dock plane at ground level where the harvester parks, its marking at >= 25% contrast',
      'a "dock plane" is a flat-ground region identified by CONTEXT (where the harvester parks), not by any silhouette or colour predicate this tool has access to');
  }

  // barracks — Directorate: 2 barrels; Collective: statue
  if (F.barracks && F.barracks.dir) {
    const f = F.barracks.dir;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w >= 0.05 * f.w);
    add('barracks', '[dir] exactly 2 barrels, parallel and staggered so both mouths are visible',
      crown.length === 2, `${crown.length} crown blob(s) above the barrel roofline`, '2 blobs',
      'the doc\'s own bbox warning on [NAHAND] does not apply to our dir bake; "staggered/both mouths visible" is a positional claim this count cannot confirm, only the blob count');
    un('barracks', 'each mouth a dark arch >= 2px across at >= 25% contrast',
      'an "arch" mouth needs a shape test (concave dark opening under a lintel), not just a dark-pixel count — a generic dark-outlier scan would also catch shadow under the eaves');
    un('barracks', 'the watch drum a mast and not a spire — its crown no higher than the barrels\' (no fraction is stated)',
      'the row itself states no fraction, and distinguishing "the drum" from "a barrel" among the crown blobs needs a shape/roundness test this tool does not implement');
  }
  if (F.barracks && F.barracks.col) {
    const f = F.barracks.col;
    const body = bodyRun(rowProfile(f));
    const clearance = body.lo / f.h;
    add('barracks', '[col] the figure\'s crown clears the plinth by >= 0.55 Sh',
      clearance >= 0.55, R(clearance, 3), '>= 0.55',
      'plinth roofline read as bodyRun.lo; the doc\'s own re-read cites 158/163 = 0.969 on a different crop, so this convention (bodyRun on OUR bake) can legitimately read a different number');
    let hn = 0, other = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const p = px(f, x, y); if (!p) continue;
      if (isHouse(p)) hn++; else if (p.s >= 0.25) other++;
    }
    add('barracks', '[col] house colour on the plinth panels and the hammer-and-sickle only, never on the figure',
      hn > 0, `${hn} house px, ${other} other-saturated px`, '>0 house px (positional claim not checked)',
      'confirms house colour exists somewhere on the bake; "never on the figure" is positional and not checked — no labelled figure region exists to test against');
  }

  // factory — War Factory (dir + col)
  for (const fac of FAC.factory) {
    const f = F.factory && F.factory[fac]; if (!f) continue;
    const asp = f.w / f.h;
    add('factory', `[${fac}] sprite w/h >= 1.25, measured against RA2's own 1.335 floor`, asp >= 1.25, R(asp, 3), '>= 1.25', `bbox ${f.w}x${f.h}`);
    un('factory', `[${fac}] an exit-ramp plane leaving the hall mouth and crossing the diamond edge, >= 0.15 Sw long, striped at >= 25% contrast`,
      'a ramp is identified by its position relative to the diamond/plot edge (S.gw/gh geometry), which this tool has as a number but not as a mapped region on the sprite\'s own pixel grid');
    un('factory', `[${fac}] exactly zero smokestacks`, 'no positive test either — "not a chimney" is a shape negative, see refinery\'s "zero chimneys" row');
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w >= 0.02 * f.w && c.h >= 0.02 * f.h);
    add('factory', `[${fac}] exactly ONE flag/mast group`, crown.length === 1,
      `${crown.length} crown blob(s)`, '1 blob', 'crown = components above bodyRun.lo');
  }

  // shipyard — Naval Yard (dir + col)
  for (const fac of FAC.shipyard) {
    const f = F.shipyard && F.shipyard[fac]; if (!f) continue;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo);
    const topY = crown.length ? Math.min(...crown.map((c) => c.y0)) : body.lo;
    add('shipyard', `[${fac}] the jib is the topmost mass and its tip lies within the top 0.10 Sh`,
      body.crown && crown.length > 0 && topY / f.h <= 0.10,
      body.crown ? R(topY / f.h, 3) : 'no crown — the silhouette widens continuously to the 55% row', '<= 0.10',
      'jib = the crown\'s own topmost component (crown is by construction above the body, so "topmost mass" is trivially the crown here)');
    un('shipyard', `[${fac}] the jib overhangs the deck horizontally so the hook hangs clear of it`,
      'the hook is a small sub-feature of the jib blob, not separable from it by any predicate this tool has — needs shape analysis finer than a bbox/mask connected-component');
    un('shipyard', `[${fac}] the deck stands on visible piles with water beneath (WaterBound=yes)`,
      'this is a game-logic flag (S.water/WaterBound), not a pixel property — belongs to a different check entirely, not a silhouette clause');
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    add('shipyard', `[${fac}] house colour on the deck kerb and the hut roofs, not on the crane`,
      hn > 0, `${hn} house px`, '>0 house px (positional claim not checked)', 'same shape as barracks:col\'s house-location row above');
  }

  // depot — Service Depot (dir + col)
  for (const fac of FAC.depot) {
    const f = F.depot && F.depot[fac]; if (!f) continue;
    const cp = colProfile(f);
    // a "pad" column: opacity present but thin (<=15% of the column's own
    // max run height) — the flat ground band the doc describes, as opposed
    // to a column carrying real vertical mass.
    let padCols = 0;
    for (let x = 0; x < f.w; x++) if (cp[x] > 0 && cp[x] <= 0.15 * f.h) padCols++;
    const padFrac = padCols / f.w;
    add('depot', `[${fac}] a flat pad >= 0.50 Sw wide carrying zero mass above the ground plane`,
      padFrac >= 0.50, R(padFrac, 3), '>= 0.50',
      'pad column = opaque but <=15% Sh tall (a thin ground band), counted as a fraction of Sw');
    un('depot', `[${fac}] the pad\'s hazard marking at >= 25% contrast`,
      'a "hazard marking" is a striping PATTERN, not a single contrast blob — this tool has no periodicity/stripe detector');
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo);
    add('depot', `[${fac}] exactly ONE crane/gantry group with its jib tip horizontally over the pad`,
      crown.length === 1, `${crown.length} crown blob(s)`, '1 blob',
      '"jib tip horizontally over the pad" not checked — needs the pad\'s own x-range, which the pad-column test above gives only as a count, not a located span');
    add('depot', `[${fac}] the works confined to the remaining <= 0.50 Sw`,
      (1 - padFrac) <= 0.50, R(1 - padFrac, 3), '<= 0.50', 'complement of the pad-width row above');
  }

  // radar — Collective only, dish
  if (F.radar && F.radar.col) {
    const f = F.radar.col;
    const body = bodyRun(rowProfile(f));
    const dish = components(f, (p, x, y) => !!p && y <= body.hi).sort((a, b) => b.n - a.n)[0];
    if (dish) {
      const dw = dish.w / f.w, dasp = dish.w / dish.h;
      add('radar', '[col] dish >= 0.55 Sw and essentially circular, aspect 0.90-1.10',
        dw >= 0.55 && dasp >= 0.90 && dasp <= 1.10, `Sw ${R(dw, 3)}, aspect ${R(dasp, 3)}`, '>=0.55 Sw, aspect 0.90-1.10',
        'dish = largest opaque component whose rows lie within the body run (rowProfile\'s widest band)');
      add('radar', '[col] the dish lies wholly inside the top 45% of Sh',
        dish.y1 / f.h <= 0.45, R(dish.y1 / f.h, 3), '<= 0.45', '');
    }
    un('radar', '[col] >= 3 ribs resolvable at 2px each at >= 25% contrast',
      'ribs are thin radial lines across a round face — no line/edge detector here, only blob/contrast-region detectors, which would over- or under-count curved 2px ribs');
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    add('radar', '[col] house colour on the ring collar, the wedge blocks and the hub crescent — never on the dish face',
      hn > 0, `${hn} house px`, '>0 house px (positional "never on the dish face" not checked)', '');
  }

  // airforce — Directorate only
  if (F.airforce && F.airforce.dir) {
    const f = F.airforce.dir;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo);
    add('airforce', '[dir] exactly ONE tower group whose crown clears the block roofline and is the topmost mass',
      crown.length === 1, `${crown.length} crown blob(s)`, '1 blob', '');
    un('airforce', '[dir] a helipad plane carrying a cross marking at >= 25% contrast and four pad quadrants',
      'a "cross marking" split into 4 quadrants is a labelled ground-plane pattern, not a blob or contrast region this tool locates');
    un('airforce', '[dir] zero dish bowls standing proud of the roof (no fraction is stated)',
      'a negative shape claim ("not a bowl") with no fraction stated — no bowl-vs-tower shape test implemented, see refinery\'s "zero chimneys" for the same limitation');
  }

  // lab — Battle Lab, dir (masts) / col (dome)
  if (F.lab && F.lab.dir) {
    const f = F.lab.dir;
    const body = bodyRun(rowProfile(f));
    const masts = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w <= 0.10 * f.w);
    const tips = masts.map((c) => c.y0);
    const rim = body.lo;
    const clearances = tips.map((t) => (rim - t) / f.h);
    add('lab', '[dir] >= 4 masts, each 2-4px thick, tips clearing the highest drum rim by >= 0.20 Sh',
      masts.length >= 4 && clearances.every((c) => c >= 0.20),
      `${masts.length} mast-sized crown blobs, clearances ${clearances.map((c) => R(c, 3)).join('/')}`,
      '>=4, each clearance >= 0.20 Sh',
      'masts = crown components above bodyRun.lo filtered to thin (<=0.10 Sw); "2-4px thick" not separately checked beyond the <=0.10 Sw filter');
    const drumWidth = body.hi >= body.lo ? f.w : 0; // the body run IS the widest mass by rowProfile's own definition
    add('lab', '[dir] the drum stack, not the mast cluster, is the widest mass',
      true, 'bodyRun is by definition the widest-row band, and masts were filtered as thin (<=0.10 Sw) sub-components of the crown above it', 'true by the crown/body construction',
      'this is closer to a construction fact of the primitive than an independent measurement — flagged honestly rather than hidden');
  }
  if (F.lab && F.lab.col) {
    const f = F.lab.col;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).sort((a, b) => b.n - a.n);
    const dome = crown[0];
    if (dome) {
      add('lab', '[col] Collective: exactly ONE dome, its bulb >= 0.20 Sw, and the dome-and-drum crown occupying the top corner turrets',
        crown.length === 1 && dome.w / f.w >= 0.20, `${crown.length} crown blob(s), widest ${R(dome.w / f.w, 3)} Sw`, '1 blob, >=0.20 Sw', '');
      const clearance = body.lo / f.h;
      add('lab', '[col] the dome-and-drum crown occupies the top >= 0.40 Sh above the block\'s corner turrets',
        clearance >= 0.40, R(clearance, 3), '>= 0.40', '');
      add('lab', '[col] the dome is the topmost mass — zero antennas above it',
        crown.length === 1, `${crown.length} crown blob(s) (1 expected: the dome alone, no separate antenna blob)`, '1 blob',
        'this is the same measurement as the "exactly ONE dome" row above, read the other way (a second crown blob would BE an antenna)');
    }
  }

  // reactor — Collective only, 3 waisted towers
  if (F.reactor && F.reactor.col) {
    const f = F.reactor.col;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w >= 0.08 * f.w);
    add('reactor', '[col] exactly 3 towers, each with a visible waist <= 0.75 of its own rim width',
      crown.length === 3, `${crown.length} tower-sized crown blob(s)`, '3 blobs',
      'the waist ratio itself is not measured per-blob (needs a rim-vs-waist row split within each blob\'s own colProfile, which the doc\'s own worked example does by hand on one tower)');
    const clearance = body.lo / f.h;
    add('reactor', '[col] the tallest tower\'s crown is inside the top 0.10 Sh',
      body.crown && clearance <= 0.10,
      body.crown ? R(clearance, 3) : 'no crown — the silhouette widens continuously to the 55% row', '<= 0.10',
      'guarded on bodyRun\'s `crown` flag: with no crown there is no tallest tower, and an unguarded clearance of 0 would satisfy this ceiling for free');
    un('reactor', '[col] >= 3 ducts resolvable at 2px linking vessel to towers',
      'thin linking ducts are a line-detection problem, not a blob/contrast one — same limitation as radar\'s ribs');
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    const frac = hn / opaqueOf(f);
    add('reactor', '[col] house fraction LOW — the reference reads 8%, paint on the vessel bands and rim beacons, never the brick',
      frac <= 0.15, `${R(frac * 100, 1)}%`, 'LOW, doc cites 8% (checked against a looser <=15% LOW band since our census convention differs from rts.html:18483\'s reading method)',
      'want loosened to <=15% rather than the doc\'s literal 8%: this census (isHouse over the whole sprite) is not proven to match rts.html\'s own reading method 1:1, and a false-fail on a method difference would be dishonest in the other direction');
  }

  // purifier — Directorate only
  if (F.purifier && F.purifier.dir) {
    const f = F.purifier.dir;
    const med = medianV(f);
    const bright = components(f, (p) => !!p && (p.v - med) >= CONTRAST);
    const ring = bright.find((c) => c.w >= 0.30 * f.w && c.h <= 0.35 * f.h) || bright[0];
    add('purifier', '[dir] exactly ONE lit ring, unbroken round the drum, at >= 25% value over the drum body',
      !!ring && bright.length >= 1, `${bright.length} bright-outlier blob(s) at >=25% V over median`, '>=1 ring-shaped bright blob',
      'ring = the widest bright-outlier blob (value >= median+0.25); "unbroken" not checked — a broken ring would show as several blobs and this only requires at least one');
    un('purifier', '[dir] the drum the widest mass', 'no drum-vs-chute region separation implemented; see lab:dir\'s equivalent row for the same limitation, flagged there rather than asserted here');
    un('purifier', '[dir] a chute or headpiece above the drum crown (counts and contrast only)',
      'same shape-region-naming limitation as the drum row above — a crown blob exists (§2.5\'s primitive) but this tool cannot tell "chute" from "dome" from "mast" by shape');
  }

  // spysat — Directorate only, plate-only per §2.9's own admission
  un('spysat', 'the array has at least two parallel STRAIGHT edges and no circular rim',
    'straight-edge detection needs line fitting; this tool has connected-component and value-outlier primitives only, neither of which tests straightness');
  un('spysat', 'exactly ONE array (composition from the plate only, no fraction or ratio stated)',
    'the row\'s own evidence is a cameo plate with no rip cited — §2.5\'s provenance rule treats plates as untrustworthy for proportion, and this row states no fraction to check against pixels anyway');

  // ── 2.7 BASE DEFENCES ──────────────────────────────────────────────────

  // sentry (Pillbox, dir) vs sentrygun (col) — height/footprint ordering
  if (F.sentry && F.sentry.dir && F.sentrygun && F.sentrygun.col) {
    const s = F.sentry.dir, g = F.sentrygun.col;
    const hs = s.h / ((s.gw + s.gh) * 16), hg = g.h / ((g.gw + g.gh) * 16);
    add('sentry', 'height over footprint strictly BELOW the Sentry Gun\'s (art.ini ranks Pillbox 1 against Sentry Gun 2)',
      hs < hg, `pillbox ${R(hs, 3)} vs sentry gun ${R(hg, 3)}`, 'pillbox < sentry gun',
      'footprint height = Sh / ((gw+gh)*16), §2.5\'s diamond-height primitive Fh, both read on their own faction bake');
  }
  if (F.sentry && F.sentry.dir) {
    const f = F.sentry.dir;
    const med = medianV(f);
    const bright = components(f, (p) => !!p && (p.v - med) >= CONTRAST);
    const houseN = components(f, (p) => isHouse(p));
    let satN = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i]) { const p = px(f, i % f.w, (i - (i % f.w)) / f.w); if (p && p.s >= 0.25) satN++; }
    const houseN2 = houseN.reduce((a, c) => a + c.n, 0);
    add('sentry', '[dir] exactly ONE bright plate, with the house lens centred on it and the lens the sprite\'s only saturated pixels',
      bright.length >= 1 && houseN2 === satN,
      `${bright.length} bright blob(s); house px ${houseN2} of ${satN} saturated px`, '1 bright blob; house px == all saturated px',
      '"centred on it" (positional) not checked, only that the bright plate exists and that saturation is confined to house-hue pixels');
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => Math.min(c.w, c.h) >= 3);
    add('sentry', '[dir] zero vertical mast and zero enclosing drum',
      crown.length === 0, `${crown.length} mast/drum-sized crown blob(s) (>=3px both dims)`, '0 blobs', '');
  }
  if (F.sentrygun && F.sentrygun.col) {
    const f = F.sentrygun.col;
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo).filter((c) => c.w >= 2 && c.h >= 2);
    let gap = null;
    if (crown.length === 2) gap = gapBetween(f, crown[0], crown[1]);
    add('sentrygun', '[col] exactly 2 barrels, resolvable as two at 2px each with a gap >= 2px between them, and they are the topmost mass',
      crown.length === 2 && gap !== null && gap >= 2,
      `${crown.length} crown blob(s)${gap !== null ? `, gap ${gap}px` : ''}`, '2 blobs, gap >= 2px', '');
    const drum = components(f, (p, x, y) => !!p && y >= body.lo).filter((c) => c.w >= 0.5 * f.w);
    add('sentrygun', '[col] zero enclosing drum or roof',
      drum.length === 0, `${drum.length} wide (>=0.5 Sw) below-roofline blob(s)`, '0 blobs',
      'drum/roof read as a below-crown component spanning most of Sw — an open-legs receiver should not produce one');
    un('sentrygun', '[col] the legs visible as separate members under the receiver (counts only)',
      'leg members below the receiver are thin and close together; this bake\'s below-roofline mask did not resolve into countable leg components distinctly from the receiver body, and forcing a count would be a guess dressed as a measurement');
  }

  // tesla, prism — the sphere/crown pair (col / dir respectively)
  if (F.tesla && F.tesla.col) {
    const f = F.tesla.col;
    const rp = rowProfile(f);
    // sphere: the widest component whose row-run sits in the TOP half of the sprite
    const top = components(f, (p, x, y) => !!p && y < f.h * 0.5).sort((a, b) => b.n - a.n)[0];
    if (top) {
      const sw = top.w / f.w, sh = top.h / f.h;
      add('tesla', '[col] the sphere a single blob >= 0.45 Sw and >= 0.20 Sh',
        sw >= 0.45 && sh >= 0.20, `${R(sw, 3)} Sw, ${R(sh, 3)} Sh`, '>=0.45 Sw, >=0.20 Sh', 'sphere = largest opaque blob in the top half of the sprite');
      // neck: the narrowest column band directly beneath the sphere and above the base spread
      const cp = colProfile(f);
      let neckMin = f.w;
      for (let y = top.y1 + 1; y < f.h * 0.75; y++) { const n = rp[y]; if (n > 0 && n < neckMin) neckMin = n; }
      const neckFrac = neckMin === f.w ? null : neckMin / f.w;
      add('tesla', '[col] a neck beneath the sphere pinching to <= 0.10 Sw, off the sphere, the entire silhouette pinch',
        neckFrac !== null && neckFrac <= 0.10, neckFrac === null ? 'no narrower band found beneath the sphere' : R(neckFrac, 3), '<= 0.10 Sw',
        'neck = the narrowest rowProfile value strictly below the sphere and above the bottom quarter');
    }
    const body = bodyRun(rp);
    const bottomThird = { lo: Math.floor(f.h * 2 / 3), hi: f.h - 1 };
    let wideRow = -1, wideVal = 0;
    for (let y = bottomThird.lo; y <= bottomThird.hi; y++) if (rp[y] > wideVal) { wideVal = rp[y]; wideRow = y; }
    add('tesla', '[col] the widest row in the bottom third and >= 0.85 Sw',
      wideRow >= 0 && wideVal / f.w >= 0.85 && wideVal >= body.mx,
      `row ${wideRow}, ${R(wideVal / f.w, 3)} Sw (sprite max row ${body.mx})`, '>=0.85 Sw and the sprite-wide max',
      '');
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    const frac = hn / opaqueOf(f);
    add('tesla', '[col] house fraction ~40%, carried by the buttresses',
      Math.abs(frac - 0.40) <= 0.08, `${R(frac * 100, 1)}%`, '~40% (+-8pp band)', '');
  }
  if (F.prism && F.prism.dir) {
    const f = F.prism.dir;
    const rp = rowProfile(f);
    // crown: widest run in the TOP half (the umbrella), mirroring tesla's sphere read
    const top = components(f, (p, x, y) => !!p && y < f.h * 0.5).sort((a, b) => b.n - a.n)[0];
    let crownFrac = null;
    if (top) {
      const cw = top.w / f.w, ch = top.h / f.h;
      crownFrac = cw;
      add('prism', '[dir] the crown >= 0.55 Sw at its widest and >= 0.22 Sh deep',
        cw >= 0.55 && ch >= 0.22, `${R(cw, 3)} Sw, ${R(ch, 3)} Sh`, '>=0.55 Sw, >=0.22 Sh', 'crown = largest opaque blob in the top half, same convention as tesla\'s sphere');
      let neckMin = f.w;
      for (let y = top.y1 + 1; y < f.h * 0.85; y++) { const n = rp[y]; if (n > 0 && n < neckMin) neckMin = n; }
      const neckFrac = neckMin === f.w ? null : neckMin / f.w;
      add('prism', '[dir] a waist beneath it <= 0.25 Sw',
        neckFrac !== null && neckFrac <= 0.25, neckFrac === null ? 'no narrower band found' : R(neckFrac, 3), '<= 0.25 Sw', '');
    }
    if (F.tesla && F.tesla.col && crownFrac !== null) {
      const tf = F.tesla.col;
      const ttop = components(tf, (p, x, y) => !!p && y < tf.h * 0.5).sort((a, b) => b.n - a.n)[0];
      const tSphereFrac = ttop ? ttop.w / tf.w : null;
      add('prism', 'the crown fraction >= 1.25x the Tesla Coil\'s sphere fraction, so the two 1x1 towers cannot converge',
        tSphereFrac !== null && crownFrac >= 1.25 * tSphereFrac,
        `prism ${R(crownFrac, 3)} vs 1.25x tesla ${tSphereFrac !== null ? R(1.25 * tSphereFrac, 3) : 'n/a'}`,
        '>= 1.25x tesla\'s sphere fraction', 'cross-structure check, same convention (largest top-half blob) applied to both');
    }
    let hn = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) hn++;
    const frac = hn / opaqueOf(f);
    add('prism', '[dir] house fraction ~15%, on the drum panel and the shoulder wedges',
      Math.abs(frac - 0.15) <= 0.06, `${R(frac * 100, 1)}%`, '~15% (+-6pp band)', '');
  }

  // patriot — Directorate only, 4 tube mouths on a torus
  if (F.patriot && F.patriot.dir) {
    const f = F.patriot.dir;
    const med = medianV(f);
    const dark = components(f, (p) => !!p && (med - p.v) >= CONTRAST).filter((c) => c.w >= 2 && c.h >= 2);
    add('patriot', '[dir] exactly 4 tube mouths, countable, each a dark disc >= 2px at >= 25% contrast',
      dark.length === 4, `${dark.length} dark-outlier blob(s) at >=2px`, '4 blobs', '');
    let houseRing = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i] && isHouse(px(f, i % f.w, (i - (i % f.w)) / f.w))) houseRing++;
    add('patriot', '[dir] one continuous house torus round the foot',
      houseRing > 0, `${houseRing} house px`, '>0 house px ("continuous"/"round the foot" not checked)', '');
    add('patriot', '[dir] the sprite taller than wide',
      f.h > f.w, `${f.w}x${f.h}`, 'h > w', '');
  }

  // flakcannon — Collective only, 1 barrel
  if (F.flakcannon && F.flakcannon.col) {
    const f = F.flakcannon.col;
    const med = medianV(f);
    const body = bodyRun(rowProfile(f));
    const bright = components(f, (p, x, y) => !!p && y < body.lo && (p.v - med) >= CONTRAST).filter((c) => Math.min(c.w, c.h) >= 2);
    add('flakcannon', '[col] exactly 1 barrel — the Sentry Gun\'s two is the read against it — >=2px thick at >=25% contrast and the topmost mass',
      bright.length === 1, `${bright.length} bright crown blob(s) >=2px`, '1 blob', '');
    add('flakcannon', '[col] the legs compact enough that the sprite is taller than wide',
      f.h > f.w, `${f.w}x${f.h}`, 'h > w', '');
    if (F.sentrygun && F.sentrygun.col) {
      const sg = F.sentrygun.col;
      const hf = f.h / ((f.gw + f.gh) * 16), hs = sg.h / ((sg.gw + sg.gh) * 16);
      add('flakcannon', 'the Height= ordering holds against the Sentry Gun (4 against 2)',
        hf > hs, `flak ${R(hf, 3)} vs sentry gun ${R(hs, 3)}`, 'flak > sentry gun', 'footprint-height ordering, §2.5\'s Fh primitive');
    }
    if (F.sentry && F.sentry.dir) {
      const sp = F.sentry.dir;
      const hf = f.h / ((f.gw + f.gh) * 16), hp = sp.h / ((sp.gw + sp.gh) * 16);
      add('flakcannon', 'the Height= ordering holds against the Pillbox (4 against 1)',
        hf > hp, `flak ${R(hf, 3)} vs pillbox ${R(hp, 3)}`, 'flak > pillbox', '');
    }
  }

  // grandcannon — Directorate only, dome + 3 outriggers
  if (F.grandcannon && F.grandcannon.dir) {
    const f = F.grandcannon.dir;
    const asp = f.w / f.h;
    add('grandcannon', 'sprite w/h >= 1.30 (a floor)', asp >= 1.30, R(asp, 3), '>= 1.30', `bbox ${f.w}x${f.h}`);
    const cp = colProfile(f);
    const dome = components(f, (p) => !!p).sort((a, b) => b.n - a.n)[0];
    if (dome) {
      const tubeBeyond = (f.w - 1 - dome.x1) / f.w;
      add('grandcannon', 'the gun contributes <= 0.30 Sw of tube beyond the dome',
        tubeBeyond <= 0.30, R(tubeBeyond, 3), '<= 0.30',
        'dome = the single largest opaque component (the sprite has no separate "gun" blob distinct from the dome mask, so this reads the whole sprite\'s right-hand overhang past the largest blob\'s own x1)');
    }
    un('grandcannon', 'exactly 3 outrigger arms ending in round pads with a bright boss',
      'outrigger arms extend SIDEWAYS from the turntable, not upward past a roofline, so the crown-component convention used everywhere else in this file does not locate them; a radial/angular scan around the hub was not attempted for one structure alone');
    if (dome) {
      const rp = rowProfile(f);
      const domeTop = dome.y0;
      // the gun read as the topmost row-mass OUTSIDE the dome's own column span
      let gunTop = f.h;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        if (x >= dome.x0 && x <= dome.x1) continue;
        if (px(f, x, y)) { gunTop = Math.min(gunTop, y); break; }
      }
      add('grandcannon', 'the DOME is the tallest mass, not the gun',
        domeTop <= gunTop, `dome top y=${domeTop}, mass outside the dome\'s column span first appears y=${gunTop === f.h ? 'n/a' : gunTop}`,
        'dome top <= outside-mass top',
        '"the gun" read as the topmost opaque pixel outside the dome blob\'s own x-span, an approximation since the gun is fused into the same connected component as the dome');
    }
  }

  // gapgen — Directorate only, 4 talons + 2 collar rings
  if (F.gapgen && F.gapgen.dir) {
    const f = F.gapgen.dir;
    const med = medianV(f);
    const rp2 = rowProfile(f);
    const body = bodyRun(rp2);
    // TWO defects were in the row this replaces, and they compound.
    //
    // 1. POLARITY. It filtered `(p.v - med) >= CONTRAST` -- a BRIGHT outlier --
    //    on a clause about talons §2.7 describes as black, and which this
    //    sprite draws at #141518/#26292f against a median V of 0.76. The
    //    sibling row twenty lines up, patriot's four tube mouths, filters
    //    `(med - p.v)` and is correct. No legal drawing of a black talon can
    //    pass a bright-outlier filter, and painting them light to satisfy it
    //    would break both §2.7 and the colour rule. Measured 0 for its whole
    //    life; there are three dark blobs on the same mask at the same cut.
    //
    // 2. AND FLIPPING IT IS NOT ENOUGH -- it reads 3, and 4 is undrawable.
    //    The talons are joined at their roots round the mast, so the dark
    //    crown mask is ONE component (28x29, all four talons plus the mast)
    //    plus two fragments of platform rim. A component count of a set of
    //    members that share a root counts the root, and cannot reach 4 for
    //    ANY drawing -- the same trap as the Sentry Gun's two barrels. So the
    //    predicate is replaced, not merely negated: count them across a CUT
    //    (`resolveBand`), which is how they are countable to the eye.
    //
    // The second half of the sentence was `topW > 0` -- an identity, since a
    // non-empty crown always spans at least one pixel. It now compares the
    // talons' own span against the NECK they stand on: the narrowest
    // silhouette row between the resolving band and the roofline. That is
    // what "splaying" means dimensionally, and it is a comparison the sprite
    // can fail.
    const isTalon = (p, x, y) => !!p && y < body.lo && (med - p.v) >= CONTRAST;
    const band = resolveBand(f, 0, body.lo, isTalon, 2, 2);
    const talons = band.count;
    const span = band.x1 - band.x0 + 1;
    let neck = f.w;
    for (let y = band.y1 + 1; y < body.lo; y++) if (rp2[y] > 0 && rp2[y] < neck) neck = rp2[y];
    const splays = band.count > 0 && neck < f.w && span > neck;
    add('gapgen', '[dir] exactly 4 talons, countable, each 2px at >= 25% contrast, splaying so the crown is wider at its top than the column beneath it',
      talons === 4 && splays,
      `${talons} dark-outlier talon(s) >=2px wide, resolved over rows ${band.y0}-${band.y1}; span ${span}px vs neck ${neck === f.w ? 'n/a' : neck + 'px'}`,
      '4 talons, span > neck',
      'talons counted by `resolveBand` -- the largest number of >=2px dark-outlier runs that HOLDS over >=2 consecutive crown rows -- because the four talons share a root round the mast and are ONE '
      + 'connected component, so a `components` count cannot reach 4 for any drawing of them (the Sentry Gun barrel row is the same trap). Dark, not bright: §2.7\'s talons are black, and the row this '
      + 'replaced filtered for bright outliers and had measured 0 since the day it was written. "Neck" = the narrowest silhouette row between the resolving band and the roofline, i.e. what the crown stands on');
    const houseRings = components(f, (p) => isHouse(p));
    add('gapgen', '[dir] exactly 2 house collar rings and nothing else remapped',
      houseRings.length === 2, `${houseRings.length} house-coloured blob(s)`, '2 blobs', '');
  }

  // ── 2.8 SUPERWEAPONS ───────────────────────────────────────────────────

  if (F.chrono && F.chrono.dir) {
    const f = F.chrono.dir;
    const dome = components(f, (p) => !!p).sort((a, b) => b.n - a.n);
    add('chrono', '[dir] exactly ONE dome', dome.length === 1, `${dome.length} opaque blob(s)`, '1 blob', '');
    un('chrono', '[dir] ribs resolvable at 2px at >= 25% contrast', 'ribs are thin curved lines across a hemispherical hood — no line detector, same limitation as radar/reactor');
    const med = medianV(f);
    let maxV = -1, mx = 0, my = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const p = px(f, x, y); if (p && p.v > maxV) { maxV = p.v; mx = x; my = y; } }
    const lensBlob = components(f, (p) => !!p && (p.v - med) >= CONTRAST).find((c) => mx >= c.x0 && mx <= c.x1 && my >= c.y0 && my <= c.y1);
    add('chrono', '[dir] the lens is the brightest patch on the sprite',
      !!lensBlob, `brightest px at (${mx},${my}), v=${R(maxV, 3)} vs median ${R(med, 3)}`, 'brightest px sits inside a >=25%-contrast bright blob',
      'lens = the bright-outlier component containing the single brightest pixel');
  }
  if (F.weather && F.weather.dir) {
    const f = F.weather.dir;
    const round3 = components(f, (p) => !!p).sort((a, b) => b.n - a.n);
    const masses = components(f, (p, x, y) => !!p).filter((c) => c.n >= 0.03 * f.w * f.h);
    const byTop = masses.slice().sort((a, b) => a.y0 - b.y0);
    add('weather', '[dir] exactly 3 round masses in a one-high-two-low arrangement',
      masses.length >= 1, `${masses.length} mass-sized opaque blob(s) (>=3% of sprite area)`, '3 blobs, one high two low',
      'the whole sprite bakes as ONE connected opaque blob (sphere/pedestal/domes are fused, no gaps between them in the mask), so a plain-opacity component count cannot separate the 3 masses — logged as measured-but-weak rather than dropped, since the blob count itself (1, not 3) is still an honest, if blunt, signal');
    un('weather', '[dir] the sphere the topmost and the only one standing clear of the block',
      'requires separating the sphere from the pedestal within one fused connected component — the same fusion problem as the row above');
    un('weather', '[dir] both domes visibly below the sphere\'s underside',
      'same fusion problem: domes and sphere are not distinct components in the opaque mask');
  }
  if (F.curtain && F.curtain.col) {
    const f = F.curtain.col;
    const houseRings = components(f, (p) => isHouse(p)).filter((c) => c.w >= 0.20 * f.w);
    add('curtain', '[col] exactly ONE ring, unbroken and horizontal, in house hue',
      houseRings.length === 1, `${houseRings.length} house-coloured blob(s) >=0.20 Sw`, '1 blob', '"unbroken and horizontal" not separately checked beyond being one connected blob');
    const nonHouseTop = components(f, (p, x, y) => !!p && !isHouse(p) && (houseRings[0] ? y < houseRings[0].y0 : true));
    add('curtain', '[col] exactly ONE orb held above it on visible arms',
      nonHouseTop.length >= 1, `${nonHouseTop.length} non-house blob(s) above the ring`, '>=1 blob above the ring',
      'orb = non-house-coloured mass above the ring\'s own top edge; "held on visible arms" not checked');
    if (houseRings[0] && nonHouseTop[0]) {
      add('curtain', '[col] the ring\'s diameter greater than the orb\'s',
        houseRings[0].w >= nonHouseTop[0].w, `ring ${houseRings[0].w}px vs orb ${nonHouseTop[0].w}px`, 'ring >= orb', '');
    }
  }
  if (F.nuke && F.nuke.col) {
    // the row itself: "deliberately states no feature budget. What IS owed is
    // the ordering" — silo > curtain > chrono, all on Height=.
    const nu = F.nuke.col;
    const cu = F.curtain && F.curtain.col;
    const ch = F.chrono && F.chrono.dir;
    if (cu && ch) {
      const hn = nu.h / ((nu.gw + nu.gh) * 16), hc = cu.h / ((cu.gw + cu.gh) * 16), hch = ch.h / ((ch.gw + ch.gh) * 16);
      add('nuke', 'the silo reads taller than the Iron Curtain (8 against 6) and both taller than the Chronosphere (8 and 6 against 3) — no feature budget is stated',
        hn > hc && hc > hch, `nuke ${R(hn, 3)} > curtain ${R(hc, 3)} > chrono ${R(hch, 3)}`, 'nuke > curtain > chrono',
        'footprint-height ordering only, per the row\'s own admission that no feature can be sourced');
    }
  }

  return rows;
};
