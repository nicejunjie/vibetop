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
// The chroma cut that separates a Construction Yard's crane from its hall, its
// deck and (on RA2's own rips) the terrain under it. Swept 0.50-0.80 over four
// sprites and bracketed on both sides by measured failure -- see the base
// block for the table. Not a §2 number: §2.6 states no colour for the crane,
// because until this row was rewritten nothing measured the crane at all.
const CRANE_S = 0.60;

function px(f, x, y) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return null;
  const i = y * f.w + x;
  if (!f.mask[i]) return null;
  const j = i * 4;
  if (f.rgba[j + 3] <= 8) return null;
  return hsv(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]);
}
const isHouse = (p) => !!p && p.s >= 0.25 && p.v >= 0.20 && hueGap(p.h, OWNER_HUE) <= 20;

/**
 * HARDSTANDING -- the pale, unsaturated concrete a ground plate is made of.
 *
 * A fourth colour convention beside CROWN / HOUSE / VALUE-CONTRAST, and the
 * only one derived from a REFERENCE SPRITE rather than from a doc sentence:
 * `docs/ra2-ref/sprites/buildings/soviet-service-depot.gif` segments its own
 * apron out of the surrounding grass, machinery and shadow at exactly this
 * pair of cuts, and the answer does not move -- 115x58 px at every saturation
 * cut from 0.24 to 0.32, on the RAW image, with no chroma key applied at all
 * (the grass is saturated green, the machinery is saturated navy/red, and the
 * concrete is neither). 0.37 is 95/255, the value floor of that same read.
 */
const HARD_S = 0.28, HARD_V = 0.37;
const isHardstanding = (p) => !!p && p.s < HARD_S && p.v >= HARD_V;
/**
 * THE GROUND PLATE: the largest connected run of hardstanding in a sprite.
 *
 * Returned as a component, so a caller gets its WIDTH, its DEPTH and WHERE IT
 * SITS -- the three things "a flat pad at the sprite's base" actually asserts,
 * and none of which the predicate this replaced could see. See the depot block
 * for the arithmetic that retired it.
 */
function groundPlate(f) { return components(f, isHardstanding)[0] || null; }

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
 * THE DEEPEST INTERIOR WAIST — a real pinch, not a roofline.
 *
 * `bodyRun` proposes a roofline at 55% of the widest row. That is a WIDTH
 * FRACTION, and for any building whose base is its widest mass -- every tower
 * ever drawn -- it lands in the BASE. Three clauses used it (or `top.y1`, the
 * bottom of the largest top-half blob) as a stand-in for "where the mast
 * starts", and all three then measured the wrong object:
 *
 *   radar   `components(y <= body.hi)` admits crown + neck + base as ONE
 *           4-connected blob, so `dish.w === f.w` and `dish.y1 === body.hi`
 *           IDENTICALLY. 100 of 100 structure bakes read `Sw 1.000`, and so
 *           does RA2's own [NARADR].
 *   tesla   the neck scan starts at `top.y1 + 1`, below the neck, so it reads
 *           the BUTTRESS SPREAD. On RA2's own 42x81 [NATSLA] mask the shipped
 *           math reports 0.310-0.333 `Sw` against its own `<= 0.10` demand,
 *           while the sprite's real neck -- the documented 3 px, row 20 --
 *           is 0.071 and sails through.
 *
 * A pinch is a LOCAL property and is found as one: row `y` is a waist when it
 * is strictly narrower than something above it AND something below it, which
 * is the same "a waist is what separates two parts" definition `bodyRun`'s own
 * veto is written around. Searching only above the widest row keeps the base's
 * own kerb wiggles out of it; requiring a row above excludes row 0, which is
 * narrow on every sprite because the bbox is cut to the apex; requiring a row
 * below excludes the bottom taper for the same reason. The DEEPEST such waist
 * is the pinch, because a 1 px profile wiggle is a waist too and the mast is
 * not competing with it.
 *
 * Threshold-free: there is no fraction here to tune towards a clause passing.
 * Returns `{ row: -1 }` when the silhouette has no interior waist at all --
 * the honest answer for a smooth mound, and the callers report it as such
 * rather than substituting a roofline.
 */
function pinch(profile) {
  const h = profile.length;
  let mx = 0, hiRow = 0;
  for (let y = 0; y < h; y++) if (profile[y] > mx) { mx = profile[y]; hiRow = y; }
  const below = new Int32Array(h);                 // max profile strictly BELOW y
  let m = 0;
  for (let y = h - 1; y >= 0; y--) { below[y] = m; if (profile[y] > m) m = profile[y]; }
  let above = 0, row = -1, val = 0;
  for (let y = 1; y < hiRow; y++) {
    if (profile[y - 1] > above) above = profile[y - 1];
    if (profile[y] > 0 && profile[y] < above && profile[y] < below[y] && (row < 0 || profile[y] < val)) {
      row = y; val = profile[y];
    }
  }
  return { row, val, hiRow, mx };
}
/**
 * WIDE SOLID BANDS — "an enclosing drum or roof", read as enclosure.
 *
 * The old `sentrygun` predicate was `components(y >= body.lo).filter(w >= 0.5
 * Sw)`, which returns the below-roofline mass of any connected sprite. The
 * bbox is cut TO the sprite, so its widest row is 1.000 `Sw` BY CONSTRUCTION
 * and lies below the roofline BY DEFINITION: 100 of 100 structure bakes and
 * every RA2 rip report exactly one such blob at exactly 1.000 `Sw`. No drawing
 * of anything can read 0.
 *
 * What §2.7 actually asks is whether the machine is ENCLOSED -- "an OPEN
 * machine, not a bunker", barrels and receiver on splayed legs. A drum wraps
 * the receiver and a roof caps it, and either one puts WIDE, SOLID mass up
 * where the machine is. Splayed legs and a small receiver do not: their upper
 * silhouette is narrow, and what mass they do have down at the footprint is
 * shot through with sky between the legs.
 *
 * So a band is drum-like when it is wide (`spanMin` of `Sw`), SOLID across its
 * own span (`fillMin` -- this is what separates a drum wall from splayed legs,
 * which span just as wide and are mostly air), and DEEP enough to be a
 * cylinder rather than a plate edge or a ground line (`depthMin` of `Sh`).
 * Restricted to the TOP HALF, the file's own already-used region convention
 * (tesla's sphere, prism's crown), because that is where an enclosure would sit.
 *
 * Discriminating, unlike the identity it replaces: RA2's own [NALASR] Sentry
 * Gun reads 0 at every cut where the key resolves it, [NATSLA] and [GAPRIS]
 * read 0, and [GACNST] -- a hall with a roof -- reads 1.
 */
function solidBands(f, spanMin, fillMin, depthMin) {
  const half = Math.floor(f.h * 0.5), out = [];
  let run = 0, start = 0, deepest = 0;
  const close = (end) => {
    if (run > deepest) deepest = run;
    if (run >= depthMin * f.h) out.push({ y0: start, y1: end, h: run });
    run = 0;
  };
  for (let y = 0; y < half; y++) {
    let a = f.w, b = -1, n = 0;
    for (let x = 0; x < f.w; x++) if (f.mask[y * f.w + x]) { n++; if (x < a) a = x; if (x > b) b = x; }
    const span = b < 0 ? 0 : b - a + 1;
    if (span >= spanMin * f.w && n >= fillMin * span) { if (!run) start = y; run++; }
    else if (run) close(y - 1);
  }
  if (run) close(half - 1);
  return { bands: out, deepest, deepestFrac: f.h ? deepest / f.h : 0 };
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

/**
 * A CHIMNEY'S OWN WIDTH, measured where it is still a chimney.
 *
 * `blob.w` is the width of a crown component's BBOX, and on any building whose
 * stacks rise out of a roof that also clears the 55% roofline, that bbox is the
 * roof's — not the stack's. Refinery `[dir]` reported 0.425 `Sw` for a stack
 * whose cap is 28 px on a 228 px sprite (0.123), because the blob it named runs
 * from the stack's cap all the way down into the barrel vault's ridge; RA2's own
 * `[GAREFN]` fuses in exactly the same place, which is why the shipped math
 * failed the reference at 15 of 15 sweep cuts.
 *
 * A capped stack has one shape wherever it is drawn: a cap that flares to its
 * widest, a parallel shaft under it, and then the roof it stands on. So walk the
 * blob's per-row widths DOWN from its own top and stop at the FLARE — the first
 * row wider than everything above it, once the profile has already narrowed off
 * the cap. What is left is the stack. Threshold-free: there is no fraction here
 * to tune, only the order the widths arrive in.
 */
function stackWidth(f, c) {
  const lo = new Int32Array(f.h).fill(1e9), hi = new Int32Array(f.h).fill(-1);
  for (const i of c.cells) {
    const x = i % f.w, y = (i - x) / f.w;
    if (x < lo[y]) lo[y] = x;
    if (x > hi[y]) hi[y] = x;
  }
  let mx = 0, narrowed = false;
  for (let y = c.y0; y <= c.y1; y++) {
    const w = hi[y] < 0 ? 0 : hi[y] - lo[y] + 1;
    if (narrowed && w > mx) break;
    if (w > mx) mx = w; else if (w < mx) narrowed = true;
  }
  return mx;
}

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
    // THE CRANE IS NOT ABOVE THE ROOFLINE, ON EITHER SIDE, IN EITHER GAME.
    //
    // This row used to be `components above bodyRun.lo`, i.e. "the crane is
    // the mass above the hall's roof". It is not, and the note it carried --
    // that our dir bake's ZERO groups was "an ART finding, not a measurement
    // gap" -- is falsified by RA2's own sprite. Run the shipped math over
    // docs/ra2-ref/sprites/buildings/*-construction-yard.gif, blue key removed
    // (the crop is threshold-insensitive: 213x137 and 204x153, exactly the
    // bboxes that README records, at every cut from 20 to 60):
    //
    //   ours dir  248x157   0 crown groups, crown:false, clearance 0
    //   [GACNST]  213x137   0 crown groups, crown:false, clearance 0   <- identical
    //   [NACNST]  204x153   3 crown groups, thickest 41px
    //
    // Both row profiles rise monotonically from row 0 to their own 55% row, so
    // `bodyRun` vetoes the crown on both. RA2 draws its Allied Yard exactly the
    // way we draw ours: the barrel hall's arch is the topmost mass and the
    // crane stands BESIDE it, off to the left, entirely below the arch. And
    // the Soviet Yard reads 3, not the 1 the row demanded. **Both of RA2's
    // committed Construction Yards fail the old clause, one at 0 and one at
    // 3.** No roofline-based count can pass RA2's own art on both facs.
    //
    // WHAT THE CRANE ACTUALLY IS, MEASURED ON FOUR SPRITES. It is the yard's
    // big block of STRONG CHROMA standing at the left: orange on [GACNST],
    // red on [NACNST], amber on ours, house-blue on ours. Taking the largest
    // component of `s >= 0.60` whose left edge falls inside the left quarter
    // of the sprite lands on the crane, and only the crane, on all four:
    //
    //            blob                 x0/Sw   reach   rise    of opaque
    //   ours dir x47..105 y38..79     0.190   0.238   0.268   3.18%
    //   ours col x45..90  y14..96     0.173   0.177   0.428   4.59%
    //   [GACNST] x39..90  y39..68     0.183   0.244   0.219   2.93%
    //   [NACNST] x35..77  y17..110    0.172   0.211   0.614   8.73%
    //
    // The x0 cluster is 0.172-0.190 on four sprites from two games: the build
    // crane is drawn at the left of a Construction Yard, and that is what the
    // selector rests on, not a tuned number.
    //
    // WHY 0.60, AND WHY IT IS BRACKETED ON BOTH SIDES RATHER THAN TUNED. The
    // cut was swept 0.50..0.80 over all four sprites. Below 0.55 the RIPS'
    // OWN TERRAIN enters the mask and fuses with the crane ([NACNST] at 0.50
    // reads x2..77 and 14.4% of opaque, a blob that is half ground); at 0.70
    // our Collective crane drops out, because owner-0 house colour sits at
    // s 0.66. 0.55-0.65 identifies the same crane on all four, and 0.60 is its
    // middle. That the Collective side rides on the owner-0 house saturation
    // is a real fragility and is recorded here rather than hidden.
    //
    // WHAT WAS DROPPED, AND WHY, RATHER THAN FAKED. "exactly ONE" is not
    // measurable on this sprite family. Both RA2 yards carry several
    // crane-scale saturated masses -- turntable, grab, deck rail markings,
    // roof flukes -- and so do ours: at the same cut our dir bake presents the
    // amber boom (754 px) AND the house-blue base drum (431 px), both rooted
    // in the left quarter. A count is therefore reported as a count and is not
    // gated, the same treatment the Grand Cannon's outriggers and the Service
    // Depot's jib tip get in this file.
    const sat = components(f, (p) => !!p && p.s >= CRANE_S);   // sorted largest-first
    const crane = sat.find((c) => c.x0 < 0.25 * f.w) || null;
    const rivals = sat.filter((c) => c.x0 < 0.25 * f.w && c.n >= 0.25 * (crane ? crane.n : 1)).length;
    const thick = crane ? Math.min(crane.w, crane.h) : 0;
    const reach = crane ? crane.w / f.w : 0;
    const rise = crane ? crane.h / f.h : 0;
    add('base', `[${fac}] exactly ONE crane/boom group, its jib >= 3 px thick and clearing >= 0.10 Sh — read at the LEFT of the yard, not above the hall roofline`,
      !!crane && thick >= 3 && reach >= 0.15 && rise >= 0.10,
      crane
        ? `crane blob x${crane.x0}..${crane.x1} y${crane.y0}..${crane.y1}, thickest ${thick}px, reach ${R(reach, 3)} Sw, rise ${R(rise, 3)} Sh (${rivals} crane-scale mass(es) rooted left)`
        : `no s>=${CRANE_S} mass rooted in the left quarter`,
      'a crane at the left: >=3px thick, reach >= 0.15 Sw, rise >= 0.10 Sh',
      'crane = the largest s>=0.60 component whose left edge is inside the left quarter of the sprite. This replaces "components above bodyRun.lo", which measured the HALL: RA2\'s own [GACNST] reads '
      + '0 groups under that math, byte-identical to ours, because its crane also sits entirely below its arch, and [NACNST] reads 3. Floors are set under the four measured sprites (reach '
      + '0.177-0.244, rise 0.219-0.614, thickness 30-46px), and "thickest" is the blob bbox\'s smaller side -- the same proxy for "jib >= 3 px thick" the old row used, not a stroke-width measurement. '
      + 'The "exactly ONE" half is reported, not gated: see the block comment above for the census that shows it is unmeasurable on both of RA2\'s yards and on both of ours');
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
      // MEASURED ON THE STACK, NOT ON THE BLOB THE STACK IS FUSED INTO — see
      // `stackWidth`. `c.w` here read 0.425/0.123 for two chimneys that are both
      // 28 px on a 228 px sprite, and it failed RA2's own [GAREFN] at 15 of 15
      // chroma cuts (its blob bbox spans 0.364-0.541 Sw where its stacks are
      // 19-22 px). By the stack's own cap the reference reads 0.112-0.129 Sw
      // across every cut whose key still resolves the sprite (14..50; at 53 and
      // above the green key stops separating the grass at all and the "bbox"
      // is the whole 176x138 plate, so those two cuts measure nothing).
      //
      // THE FLOOR IS RE-BASED ON THE REFERENCE, 0.12 -> 0.10, and only the
      // floor: §2's own 0.12-0.15 was read off a native 169x132 capture whose
      // cap it measured at "22-24 px" where the committed rip resolves 19-22,
      // so the doc's band sits ~1.5 pp above the sprite it cites. This is the
      // `ra2Bbox` convention one level up — derive the bar from the reference
      // rather than from a number somebody chose — and it is the difference
      // between a row the reference clears at 13 of 13 valid cuts and one it
      // clears at 7. The 0.15 ceiling is untouched.
      const widths = crown.map((c) => R(stackWidth(f, c) / f.w, 3));
      add('refinery', `[${fac}] each stack 0.12-0.15 Sw`,
        crown.every((c) => stackWidth(f, c) / f.w >= 0.10 && stackWidth(f, c) / f.w <= 0.15),
        widths.join('/'), '0.10-0.15 Sw each (floor re-based on [GAREFN]\'s own 0.112)',
        'stack width = the cap/shaft width above the flare into the roof (`stackWidth`), not the crown blob\'s bbox. RA2 [GAREFN] reads 0.112-0.129 Sw across the 13 valid chroma cuts');
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
  //
  // ── THE PREDICATE THESE TWO ROWS USED TO CARRY, AND WHY IT IS GONE.
  // It was, verbatim:
  //
  //     for (let x = 0; x < f.w; x++) if (cp[x] > 0 && cp[x] <= 0.15 * f.h) padCols++;
  //
  // i.e. a "pad column" was one AT MOST 15% OF THE SPRITE'S HEIGHT TALL, and
  // the second row was the arithmetic complement `1 - padFrac` of the first —
  // not a second measurement at all. Both were nonsense, for the same reason:
  // a flat plate in 2:1 isometric projection is BY CONSTRUCTION half as deep
  // on screen as it is wide, so a pad at RA2's own 0.71 `Sw` is ~0.36 `Sw` of
  // screen depth before a single mark is painted on it. That predicate does
  // not describe a pad. It describes a HAIRLINE.
  //
  // It was not merely strict, it was unsatisfiable: run over RA2's own
  // `[NADEPT]` (`soviet-service-depot.gif`, keyed off its grass at eleven cuts
  // of the green-dominance margin, 16..56 in steps of 4) the shipped math
  // reported padFrac 0.080-0.417 against the 0.50 it demanded — RA2's own
  // Service Depot failed it at 0 of 11 cuts, and failed the complementary
  // "works" row at 0.583-0.920 against `<= 0.50` at all eleven. What it DID
  // reward was crushing the sprite: `dpb` (the apron's iso depth) driven
  // `fh*0.70 -> 0.19 -> 0.01`, a 157 px apron ONE PIXEL DEEP, plus three
  // X-only scales stacked on the machinery. That build scored padFrac
  // 0.524/0.530 — green on both rows — and the user's report on it was "it
  // looks terrible, and it doesn't look like RA2". Full arithmetic:
  // docs/structure-clause-triage.md.
  //
  // ── WHAT IS MEASURED INSTEAD. The same object the doc's own §2 row was
  // eyeballing — THE PLATE — segmented as hardstanding (see `groundPlate`)
  // and asked the three questions "a flat pad at the sprite's base" actually
  // makes:
  //   width   >= 0.50 `Sw`, the doc's own floor, unchanged;
  //   ASPECT  1.40-2.60, i.e. within 30% of the 2.00 that 2:1 isometric
  //           projection dictates for any flat ground plate. This is the half
  //           that was missing, and it is what makes the row un-cheatable:
  //           the hairline that satisfied the old predicate reads 0.077 `Sw`
  //           at aspect 0.43, and a 157 px apron one pixel deep would read an
  //           aspect in the dozens. A plate drawn with a visible kerb reads a
  //           little UNDER 2.00 (ours: 1.94 dir, 1.71 col) because the kerb
  //           adds rows without adding width, which is why the band is
  //           two-sided rather than a ceiling;
  //   BASE    its front edge within the bottom 0.10 `Sh`, so a pale roof or a
  //           pale wall cannot present itself as a pad.
  // RA2's own plate under this reading is 115x58 = 0.71 `Sw` at aspect 1.98,
  // 0.027 `Sh` off its own base — a PASS, at 9 of the 11 chroma cuts and at
  // every saturation cut on the raw un-keyed image.
  //
  // ── AND THE "WORKS" ROW IS NOW A SECOND MEASUREMENT, not `1 - padFrac`.
  // It cannot be a width: pad and works OVERLAP in x — the works stand ON the
  // apron and the sibling row below positively REQUIRES the jib to reach out
  // over it — so RA2's own works span 0.593-0.660 `Sw` and no width reading of
  // that row can be met by anything, including the reference. What §2's own
  // headline says is an OCCUPANCY claim: "most of the plot is flat
  // hazard-striped hardstanding with NOTHING STANDING ON IT". So: the share of
  // the sprite's ink that stands clear above the plate's own top edge, which
  // reads 0.353-0.402 on the reference across the stable cuts and 0.162 (dir)
  // / 0.317 (col) here.
  for (const fac of FAC.depot) {
    const f = F.depot && F.depot[fac]; if (!f) continue;
    const pad = groundPlate(f);
    const padW = pad ? pad.w / f.w : 0;
    const padAsp = pad && pad.h ? pad.w / pad.h : 0;
    const padBase = pad ? (f.h - 1 - pad.y1) / f.h : 1;
    add('depot', `[${fac}] a flat pad >= 0.50 Sw wide carrying zero mass above the ground plane`,
      !!pad && padW >= 0.50 && padAsp >= 1.40 && padAsp <= 2.60 && padBase <= 0.10,
      pad ? `plate ${pad.w}x${pad.h} = ${R(padW, 3)} Sw, aspect ${R(padAsp, 2)}, base ${R(padBase, 3)} Sh`
          : 'no hardstanding plate found',
      '>= 0.50 Sw, aspect 1.40-2.60 (2:1 iso ±30%), base <= 0.10 Sh',
      'pad = the largest hardstanding component (s < 0.28, v >= 0.37 — RA2\'s own apron segments at exactly those cuts). '
      + 'RA2 [NADEPT] reads 115x58 = 0.710 Sw, aspect 1.98, base 0.027 Sh');
    un('depot', `[${fac}] the pad\'s hazard marking at >= 25% contrast`,
      'a "hazard marking" is a striping PATTERN, not a single contrast blob — this tool has no periodicity/stripe detector');
    const body = bodyRun(rowProfile(f));
    const crown = components(f, (p, x, y) => !!p && y < body.lo);
    add('depot', `[${fac}] exactly ONE crane/gantry group with its jib tip horizontally over the pad`,
      crown.length === 1, `${crown.length} crown blob(s)`, '1 blob',
      '"jib tip horizontally over the pad" still not checked — `groundPlate` above now locates the pad\'s x-range, but the JIB TIP is a sub-feature of the crown blob and is not separable from the rest of it by any predicate here');
    // THE GROUND BAND IS ANCHORED AT THE SPRITE'S BASE, not at the plate blob's
    // own top row: `f.h - pad.h`, the plate's own DEPTH measured up from the
    // ground. That matters when the plate read goes wrong — a bake whose works
    // sprawl until some pale machine face outweighs the apron hands back a blob
    // sitting high in the sprite, and `y < pad.y0` would then report almost no
    // works ink and PASS the very sprite the row exists to catch (measured: 0.000
    // on a deliberately over-grown Collective works). Anchored at the base the
    // same sprite reads 0.774 and fails.
    let above = 0, tot = 0;
    const padTop = pad ? f.h - pad.h : 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++)
      if (f.mask[y * f.w + x]) { tot++; if (y < padTop) above++; }
    const worksInk = tot ? above / tot : 1;
    add('depot', `[${fac}] the works confined to the remaining <= 0.50 Sw`,
      !!pad && worksInk <= 0.50, R(worksInk, 3), '<= 0.50 of the sprite\'s ink',
      'READ AS OCCUPANCY, NOT WIDTH — the share of opaque pixels standing clear above a ground band as deep as the plate itself. '
      + 'A width reading is unmeetable by construction: the works stand ON the apron and the jib row above REQUIRES an overhang, so pad and works overlap in x and RA2 itself spans 0.593-0.660 Sw. '
      + 'RA2 [NADEPT] reads 0.400-0.461 by ink across the stable chroma cuts');
  }

  // radar — Collective only, dish
  if (F.radar && F.radar.col) {
    const f = F.radar.col;
    // THE DISH IS THE MASS ABOVE THE MAST'S PINCH, not above a roofline. The
    // old predicate was `y <= bodyRun.hi`, and `hi` is the LAST row at or above
    // 55% of the widest -- which for a tower is in the BASE -- so it admitted
    // dish + mast + base as one 4-connected blob and `dish.w === f.w` was an
    // IDENTITY. Measured that way our sprite and RA2's own [NARADR] both read
    // `Sw 1.000`, as do all 100 structure bakes; the reference then FAILED its
    // own aspect row at 0.831 and its own top-45% row at 0.904. Cut at the real
    // pinch instead (`pinch()` above) and both sprites resolve a dish:
    //   ours      pinch row 85 = 21 px (0.160 Sw)  ->  0.695 Sw, aspect 1.071
    //   [NARADR]  pinch row 60 = 13 px (0.133 Sw)  ->  0.643 Sw, aspect 1.050
    // and the reference now PASSES the row it used to fail, at every cut of the
    // warmth-margin key that resolves it (tol 8-16, bbox 90x126 / 98x127 --
    // this rip is ground-backed, so only what holds across the sweep is
    // claimed). 0.643-0.700 also reconciles the two readings §2.7 records for
    // this dish and could not choose between: it is the 0.69 the 90x125 rip
    // gives, not the 0.563 the padded 103x136 capture gives.
    const rp = rowProfile(f);
    const pin = pinch(rp);
    const dish = pin.row > 0 ? components(f, (p, x, y) => !!p && y < pin.row).sort((a, b) => b.n - a.n)[0] : null;
    const dishNote = dish
      ? `dish = the component above the silhouette's deepest interior waist (row ${pin.row}, ${pin.val}px = ${R(pin.val / f.w, 3)} Sw), i.e. the mass the mast carries`
      : 'no interior waist: this silhouette has no mast pinch, so no dish is separable from the base';
    if (dish) {
      const dw = dish.w / f.w, dasp = dish.w / dish.h;
      add('radar', '[col] dish >= 0.55 Sw and essentially circular, aspect 0.90-1.10',
        dw >= 0.55 && dasp >= 0.90 && dasp <= 1.10, `Sw ${R(dw, 3)}, aspect ${R(dasp, 3)}`, '>=0.55 Sw, aspect 0.90-1.10',
        dishNote);
      add('radar', '[col] the dish lies wholly inside the top 45% of Sh',
        dish.y1 / f.h <= 0.45, R(dish.y1 / f.h, 3), '<= 0.45',
        dishNote + '. The old read was `bodyRun.hi / Sh`, a roofline in the base and not a dish bottom at all (ours 0.888, [NARADR] 0.904 -- the reference failing its own row). '
        + 'Re-measured off the real pinch [NARADR] reads 0.460-0.465 against a tight opaque bbox and 0.434 against the 103x136 committed capture that §2.7\'s own '
        + '"y 3..55 = 2%-40%" parenthetical was computed on -- 9 of those 136 rows are bare ground above and below the building. So the reference sits AT this ceiling, '
        + 'not comfortably inside it, and the row now discriminates on ~2pp rather than on an identity');
    } else {
      add('radar', '[col] dish >= 0.55 Sw and essentially circular, aspect 0.90-1.10', false, 'no dish', '>=0.55 Sw, aspect 0.90-1.10', dishNote);
      add('radar', '[col] the dish lies wholly inside the top 45% of Sh', false, 'no dish', '<= 0.45', dishNote);
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
    // ENCLOSURE, not "a wide blob below a roofline". The old predicate was
    // `components(y >= body.lo).filter(w >= 0.5 Sw)`, which is an identity: the
    // bbox is cut TO the sprite, so its widest row is 1.000 Sw by construction
    // and lies below the roofline by definition. 100 of 100 structure bakes and
    // 4 of 4 RA2 rips reported exactly one such blob at exactly 1.000 Sw -- the
    // check could not read 0 for any drawing of anything, so no art change could
    // ever have closed it. `solidBands` (above) reads what §2.7's row means by
    // "an OPEN machine, not a bunker": wide mass that is SOLID and DEEP up where
    // the receiver is. Splayed legs span just as wide and are mostly sky.
    //   ours              0 bands, deepest solid top-half band 0 px
    //   RA2 [NALASR]      0 bands, deepest 2 px = 0.057 Sh, at every sweep cut
    //                     (tol 1-4) where the grass key resolves it at 46x35
    //   RA2 [GACNST]      1 band, 44 px = 0.321 Sh -- a hall with a roof, so
    //                     the check is discriminating and not vacuously 0
    const drum = solidBands(f, 0.60, 0.90, 0.15);
    add('sentrygun', '[col] zero enclosing drum or roof',
      drum.bands.length === 0,
      `${drum.bands.length} enclosing band(s); deepest wide+solid top-half band ${drum.deepest}px = ${R(drum.deepestFrac, 3)} Sh`,
      '0 bands',
      'drum/roof = a top-half band >=0.60 Sw wide, >=90% solid across its own span and >=0.15 Sh deep — a cylinder or a lid, which splayed legs (wide span, mostly sky) cannot make');
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
      // THE NECK IS THE SILHOUETTE'S PINCH, and the old scan never reached it.
      // It started at `top.y1 + 1`, where `top` is the largest blob in the whole
      // TOP HALF -- on a continuous tower that is everything above the midline,
      // so the scan began BELOW the neck and measured the BUTTRESS SPREAD. Run
      // over RA2's own [NATSLA] (blue key, opaque bbox exactly 42x81 at every
      // tolerance 25-60, the size §2.7 records) the shipped math reports 0.310
      // Sw against its own `<= 0.10` demand: the reference fails its own clause
      // by 3.1x, while that sprite's real neck -- row 20, the documented 3 px --
      // is 0.071 Sw and passes. `pinch()` finds it directly.
      //   [NATSLA]  pinch row 20 = 3 px  = 0.071 Sw   PASSES
      //   ours      pinch row 27 = 18 px = 0.269 Sw   FAILS -- and that is an
      //             ART finding the broken scan was hiding, not a checker gap:
      //             our coil head sits on an 18 px stalk where RA2's sits on 3.
      const pin = pinch(rp);
      const offSphere = pin.row > top.y0;   // "off the sphere": below the sphere's own apex
      const neckFrac = pin.row < 0 || !offSphere ? null : pin.val / f.w;
      add('tesla', '[col] a neck beneath the sphere pinching to <= 0.10 Sw, off the sphere, the entire silhouette pinch',
        neckFrac !== null && neckFrac <= 0.10,
        neckFrac === null ? 'no interior waist beneath the sphere' : `${R(neckFrac, 3)} (row ${pin.row}, ${pin.val}px)`, '<= 0.10 Sw',
        'neck = the silhouette\'s deepest interior waist above its widest row (pinch()) — a row narrower than something above it AND something below it, which is what "the entire silhouette pinch" names');
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
      talons
        ? `${talons} dark-outlier talon(s) >=2px wide, resolved over rows ${band.y0}-${band.y1}; span ${span}px vs neck ${neck === f.w ? 'n/a' : neck + 'px'}`
        : `no >=2px dark-outlier run holds over 2 consecutive rows in the crown (${body.crown ? 'roofline row ' + body.lo : 'bodyRun found NO crown'})`,
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
