/**
 * §2.3 / §2.4's UNMEASURED VEHICLE CLAUSES — 18 of them, one file.
 *
 * The inventory (docs/clause-inventory.md) lists 18 budget clauses on the
 * vehicle rows that no SPIKES entry gates. All 18 are measured here. The last
 * of them (`chronominer` "zero turret mass") stood recorded as UNMEASURABLE
 * with four rejected silhouette statistics beside it; the fifth is at the
 * Chrono Miner's block below, and it works because it stops trying to build a
 * universal turret detector — which the clause never asked for — and proves
 * the strict negative instead. The rejection table stays in
 * docs/per-unit-art-log.md: it is what says which readings are already spent.
 *
 * ── THE THREE CONVENTIONS, stated because a clause measured under a different
 *    one is a different number (EXAMPLE-infantry-gi.js documents the trap;
 *    two passes got 26.0% and 21.1% for the same Engineer).
 *
 * 1. BEARING. Everything is read at `ctx.broadsideOct(key)` — the widest baked
 *    octant, the one the aspect and size gates already read. Per unit, not a
 *    fixed pair: the Grizzly's is 3, the IFV's is 0.
 *
 * 2. THE BBOX IS THE WHOLE SPRITE, contact shadow included, and the anchor is
 *    not `h - UPAD`. Every band below is a fraction of the MEASURED bbox, read
 *    off the bake. Where a clause names a ratio against an RA2 number, that is
 *    the right convention anyway: `RA2_BBOX` in art-metrics.js is what the
 *    aspect and size gates compare against, so a clause checked the same way
 *    can be read against those gates without re-deriving anything.
 *
 * 3. HOUSE COLOUR is `s >= 0.25 && v >= 0.20 && hueGap(h, 197) <= 20`, and 197
 *    is DERIVED, not assumed. The owner-1 bake is not on `ctx`, so the remap
 *    cannot be found by differencing here — but `rec.col` carries `chroma` and
 *    a 12-bin saturation-weighted hue histogram of the FIXED (non-remap)
 *    pixels, so subtracting `hist * chroma * opaque` from the sprite's own
 *    saturation-weighted histogram leaves the remap's distribution. For all 13
 *    vehicles that residual lands in one bin, 180-210 deg: the owner-0 bake is
 *    blue for BOTH factions. `houseMask` reproduces `rec.col.ownerPct` to
 *    within about a fifth of its own value across the group, which is the
 *    accuracy claim behind every house clause below.
 *
 * ── ON THRESHOLDS. Several rows state no number ("individually countable",
 *    "core in house hue", "midbody pure white"). Where that happens the `want`
 *    field carries the number this file chose and the `note` says the row
 *    states none. None of those is presented as the spec.
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
const OWNER_HUE = 197;                       // see convention 3

/** hsv of one bbox pixel, or null where the mask is clear. */
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
const median = (a) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/**
 * `spikeOf`'s own convention, re-implemented here so the crown and the
 * horizontal protrusion below mean exactly what the SPIKES gate means by them:
 * the BODY is the run of profile entries at >= 55% of the profile's max
 * (unit-identity-reference.md §1.3, validated in the rule audit §3b), and the
 * SPIKE is the thin run outside it.
 */
function bodyRun(profile) {
  let mx = 0;
  for (let i = 0; i < profile.length; i++) if (profile[i] > mx) mx = profile[i];
  const cut = 0.55 * mx;
  let lo = -1, hi = -1;
  for (let i = 0; i < profile.length; i++) if (profile[i] >= cut) { if (lo < 0) lo = i; hi = i; }
  return { lo, hi, mx };
}
/**
 * The run of THIN columns at either end of the sprite — a gun, a barrel, a
 * stub. `spikeOf`'s 55%-of-max rule is the wrong instrument for this one and
 * measurably so: under a 2:1 camera a low wide hull's column profile is a
 * smooth ramp, so the rule calls the hull's own taper a protrusion and reports
 * the Mirage — the unit whose whole identity is having NO gun — at 19 px.
 * An absolute thinness threshold is the honest test for "is there a tube
 * sticking out", and it is CALIBRATED rather than picked: 8 px is twice the
 * 4 px the SPIKES gate measures on the Grizzly's own barrel, the unit §2.3
 * names as the thing a longer Mirage stub would be mistaken for.
 */
const THIN = 8;
function sideProtrusion(f) {
  const p = colProfile(f);
  let best = { len: 0, thick: 0, side: null };
  for (const [from, step, side] of [[0, 1, 'left'], [p.length - 1, -1, 'right']]) {
    const vals = [];
    for (let i = from; i >= 0 && i < p.length; i += step) {
      if (p[i] === 0) continue;
      if (p[i] > THIN) break;
      vals.push(p[i]);
    }
    if (vals.length > best.len) best = { len: vals.length, thick: median(vals), side };
  }
  return best;
}

/** 8-connected components of a predicate over the bbox. */
function components(f, pred) {
  const seen = new Uint8Array(f.w * f.h), out = [];
  const ok = new Uint8Array(f.w * f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) ok[y * f.w + x] = pred(px(f, x, y)) ? 1 : 0;
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
/** shortest 8-neighbour gap between two components, in px of clear space. */
function gapBetween(f, A, B) {
  let best = 1e9;
  for (const i of A.cells) {
    const ax = i % f.w, ay = (i - ax) / f.w;
    for (const j of B.cells) {
      const bx = j % f.w, by = (j - bx) / f.w;
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by)) - 1;   // clear px between
      if (d < best) best = d;
    }
  }
  return best === 1e9 ? 0 : best;
}
/**
 * The HULL-BROADSIDE bearing — the octant whose bbox is most ELONGATED (max
 * w/h), not the one that is merely WIDEST.
 *
 * `ctx.broadsideOct` is "widest octant", and for most units that IS broadside.
 * It is a PROXY, and the proxy fails for any ground body whose beam exceeds
 * 0.414 x its length: under this camera the screen width at the diagonal
 * octant is `ISO_X x (L + W)` while at the true side-on octant it is
 * `ISO_X x L x sqrt(2)`, so the diagonal wins whenever `L + W > L x sqrt(2)`.
 * The Chrono Miner is len 27 / wid 18 (rts.html), i.e. W = 0.67L, and its
 * widest octant is therefore the DIAGONAL one.
 *
 * That matters for exactly one shape of clause: "height <= k x LENGTH". At the
 * diagonal octant a flat ground body projects to `h/w = ISO_Y/ISO_X = 0.500`
 * for ANY L and W, so the ratio there is not height-over-length at all — it is
 * superstructure-over-(L+W), and it cannot respond to the quantity the clause
 * names. MEASURED, sweeping the Chrono Miner's own `len` 24 / 27 / 31 / 35:
 *
 *      widest octant (0):  0.608  0.582  0.593  0.569   <- no trend, +-0.02 noise
 *      hull broadside (3): 0.558  0.522  0.444  0.400   <- monotone, height PINNED at 24 px
 *
 * A 46% lengthening moves the gated number by 6% NON-MONOTONICALLY and the
 * hull-broadside number by 28% in a straight line, with the bbox height
 * constant at 24 px across the whole sweep. The second is height over length;
 * the first is not, which is why the previous pass's "lengthening the truck
 * makes it WORSE" read as a paradox — it was reading noise in a measurement
 * that has no signal on that axis.
 *
 * NULL CONTROL, and the reason this is a fix rather than a preference: the
 * Grizzly carries the identically-shaped clause ("hull height <= 0.45 x
 * length") and for that unit the two rules pick the SAME octant (3), so its
 * number is unchanged at 0.423. The helper only moves a unit where the proxy
 * was measuring the wrong quantity.
 *
 * Scoped to these two rows on purpose. `broadsideOct` stays what the aspect
 * and size gates read: it is what §1.1's RA2 bboxes are compared against and
 * the whole ratchet is built on it. This is the naval-air.js precedent —
 * "three clauses need a different bearing and each says which and why".
 */
function hullBroadsideOct(ctx, k) {
  let best = null, bar = -1;
  for (let o = 0; o < 8; o++) {
    const f = ctx.byUnitOct(k, o);
    if (!f || !f.h || !f.w) continue;
    const a = f.w / f.h;
    if (a > bar) { bar = a; best = o; }
  }
  return best === null ? ctx.broadsideOct(k) : best;
}
const minorDim = (c) => Math.min(c.w, c.h);
const opaqueOf = (f) => { let n = 0; for (let i = 0; i < f.w * f.h; i++) if (f.mask[i]) n++; return n; };

exports.check = function (ctx) {
  const rows = [];
  const R = ctx.round;
  const at = (k) => { const f = ctx.byUnitOct(k, ctx.broadsideOct(k)); return f && f.rgba ? f : null; };
  const F = {};
  for (const k of ['lancer', 'ifv', 'mirage', 'prismtank', 'chronominer', 'mcv',
                   'rhino', 'mammoth', 'teslatank', 'v3', 'flaktrack', 'warminer', 'drone']) F[k] = at(k);
  if (!F.lancer) return rows;
  const add = (unit, clause, ok, measured, want, note) =>
    rows.push({ unit, clause, ok, measured, want, note });

  // ── §2.3 Grizzly Tank ──────────────────────────────────────────────────
  // "hull height <= 0.45 x length". The HULL is a subset of the bbox, so the
  // WHOLE-SPRITE ratio is an upper bound on it: passing with the bbox — which
  // carries the barrel, the turret and the contact shadow — is strictly
  // stronger than the clause asks, and needs no hull segmentation to be honest.
  {
    const o = hullBroadsideOct(ctx, 'lancer'), f = ctx.byUnitOct('lancer', o), r = f.h / f.w;
    add('lancer', 'hull height <= 0.45 x length', r <= 0.45, R(r, 3), '<= 0.45',
      `whole-sprite ${f.w}x${f.h} at the HULL-BROADSIDE octant ${o} (see hullBroadsideOct); the `
      + 'hull is a SUBSET of the bbox (which also carries the barrel and the contact shadow), so '
      + "this ratio is an upper bound on the hull's own — meeting it here is stronger than the "
      + 'clause asks. THIS ROW IS THE NULL CONTROL for the bearing rule: for the Grizzly the '
      + `widest octant (${ctx.broadsideOct('lancer')}) and the most-elongated one are the SAME, so `
      + 'the number is byte-identical to what the widest-octant convention reported (0.423). A '
      + 'bearing rule that moved a unit it should not have moved would show up here first');
  }

  // "exactly 2 house blocks, each 6-8 px, separated by >= 4 px".
  // READING OF "each 6-8 px": the block's MINOR dimension. It cannot be the
  // block's area or its major dimension — §1.4 records RA2's Grizzly at 21.0%
  // house over a 54x23 sprite, and two 6-8 px SQUARES are 6% of that, so the
  // sentence would contradict the table three sections above it. A 6-8 px thick
  // PANEL (a turret cheek, a hull flank band) is the only reading that fits
  // both. Stated because it changes the verdict, not just the number.
  {
    const f = F.lancer;
    const cs = components(f, isHouse).filter((c) => c.n >= 12);
    const gaps = [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) gaps.push(gapBetween(f, cs[i], cs[j]));
    const minors = cs.map(minorDim);
    const ok = cs.length === 2 && minors.every((m) => m >= 6 && m <= 8) && Math.min(...gaps) >= 4;
    add('lancer', 'exactly 2 house blocks, each 6-8 px, separated by >= 4 px', ok,
      `${cs.length} blocks, minor dims [${minors.join(',')}], gap ${gaps.length ? Math.min(...gaps) : '-'}`,
      '2 blocks / minor 6-8 px / gap >= 4',
      '8-connected components of the house mask over 12 px, at the broadside octant. "each 6-8 px" '
      + 'is read as the MINOR dimension — see the block comment: two 6-8 px squares cannot be the '
      + '21.0% house §1.4 records for RA2\'s own Grizzly. THE COUNT WAS THE DEFECT AND IT IS FIXED '
      + '(one 23x11 blob before this pass, two blocks now). THE GAP IS A CEILING: the sprite is 22 '
      + 'px tall, so two 6-8 px panels plus 4 px of clear air is 16-20 px, i.e. 73-91% of the whole '
      + "tank's height spent on two house panels and the space between them. Buying the rows by "
      + 'raising the turret was tried and measured: at 23 px the gap was STILL 2, because the '
      + "cheek's bottom edge is pinned by the turret shoulder polygon it wraps, not by its own base "
      + '— and 23 px already takes hull-height/length from 0.423 to 0.442 against the 0.45 ceiling '
      + 'on the same row, with 24 px breaking it outright');
  }

  // ── §2.3 IFV ───────────────────────────────────────────────────────────
  {
    const f = F.ifv, a = f.w / f.h;
    add('ifv', 'body aspect 1.0-1.2', a >= 1.0 && a <= 1.2, R(a, 3), '1.0 - 1.2',
      `whole-sprite ${f.w}x${f.h}; RA2's own [FV] is 50x45 = 1.111 measured the same way, and `
      + `art-metrics' aspect gate reads this unit at ${R(a / (50 / 45), 3)} of it`);
  }
  // "turret >= 45% of total height", measured with spikeOf's own 'v' rule: the
  // BODY is the run of rows at >= 55% of the widest row, the CROWN is what
  // stands above it. That rule is GENEROUS to the turret here, because the
  // IFV's widest row is set by its WHEELS, which sit below the hull — a bigger
  // max pushes the 55% line down and makes the crown taller.
  {
    const f = F.ifv, rp = rowProfile(f), { lo } = bodyRun(rp);
    const frac = lo / f.h;
    // the arithmetic ceiling, quoted in the note so the shortfall is costed
    const need = (0.45 * f.h - lo) / 0.55;               // extra crown px to reach 45%
    add('ifv', 'turret >= 45% of total height', frac >= 0.45, R(frac, 3), '>= 0.45',
      `crown rows 0-${lo - 1} of ${f.h} (spikeOf's 'v' body/crown rule, which is generous here: `
      + 'the widest row is the WHEELS, below the hull, so the 55% line sits low and the crown '
      + `long). Reaching 0.45 needs +${R(need, 1)} px of turret, which takes the body aspect from `
      + `${R(f.w / f.h, 3)} to ${R(f.w / (f.h + need), 3)} — ${R(f.w / (f.h + need) / (50 / 45), 3)} of `
      + 'RA2\'s [FV], outside the +-20% band. The two clauses on this row are mutually exclusive '
      + 'at our scale; the aspect one is the one RA2 states as a measured bbox');
  }

  // ── §2.3 Mirage Tank ───────────────────────────────────────────────────
  // "gun stub <= 6 px (any longer and it reads as a Grizzly)". A stub is a
  // horizontal protrusion, so it is measured the way §1.3 measures one: the run
  // of thin columns clear of the body. The Grizzly is the row's own reference
  // for "too long", so its number is quoted beside it.
  {
    const m = sideProtrusion(F.mirage), g = sideProtrusion(F.lancer);
    add('mirage', 'gun stub <= 6 px (any longer and it reads as a Grizzly)', m.len <= 6, m.len, '<= 6 px',
      `${m.len} px of protrusion clear of the body (${m.side}), against the Grizzly's own `
      + `${g.len} px barrel measured identically — the anti-Grizzly read the row asks for. `
      + 'The missing gun is a recorded deliberate decision (per-unit-art-log.md, "Recorded '
      + 'disagreement, NOT changed"); this clause is the one that says it is CORRECT');
  }

  // ── §2.3 Prism Tank ────────────────────────────────────────────────────
  {
    const p = F.prismtank, m = F.mirage, r = p.h / m.h;
    add('prismtank', "total height >= 1.15x the Mirage's", r >= 1.15, R(r, 3), '>= 1.15x',
      `${p.h} px against the Mirage's ${m.h}, both at their own broadside octant, bbox including `
      + 'the contact shadow. §2.3 calls this unit "the tallest tank profile" and it is: no other '
      + 'ground vehicle but the MCV is taller');
  }

  // ── §2.3 Chrono Miner ──────────────────────────────────────────────────
  // THE BEARING IS THE WHOLE ROW. This clause names LENGTH, and the widest
  // octant is not where this unit's length lives — see hullBroadsideOct for the
  // sweep. Read at the hull broadside it measures 0.522 and MEETS; read at the
  // widest octant it measured 0.582 and could not have responded to the clause
  // at all. The threshold is untouched and no art moved.
  {
    const o = hullBroadsideOct(ctx, 'chronominer'), f = ctx.byUnitOct('chronominer', o);
    const wf = F.chronominer, r = f.h / f.w;
    add('chronominer', 'height <= 0.55 x length', r <= 0.55, R(r, 3), '<= 0.55',
      `${f.w}x${f.h} at the HULL-BROADSIDE octant ${o} — the most ELONGATED bearing, which is `
      + 'where a body\'s screen width IS its length. THIS ROW WAS PREVIOUSLY READ AT THE WIDEST '
      + `octant (${ctx.broadsideOct('chronominer')}, ${wf.w}x${wf.h} = ${R(wf.h / wf.w, 3)}) AND `
      + 'THAT WAS A CHECK BUG, not an art defect. The Chrono Miner is len 27 / wid 18, i.e. beam '
      + '0.67 x length, and under this camera the diagonal octant is wider than the side-on one '
      + 'for any body with beam > 0.414 x length — so its widest bearing is the diagonal, where a '
      + 'flat ground body projects to h/w = ISO_Y/ISO_X = 0.500 EXACTLY for any L and W. The '
      + 'number there is superstructure over (L+W); it is not height over length and cannot be. '
      + 'PROVED BY SWEEP, `len` 24/27/31/35: the widest octant gives 0.608 / 0.582 / 0.593 / '
      + '0.569 — no trend, and NON-MONOTONIC — while the hull broadside gives 0.558 / 0.522 / '
      + '0.444 / 0.400 with the bbox height pinned at 24 px throughout. A 46% lengthening moves '
      + 'the one by 6% in no particular direction and the other by 28% in a straight line. (That '
      + 'sweep also explains the previous pass\'s recorded paradox, "LENGTHENING the truck makes '
      + 'it WORSE, 0.582 -> 0.596": it was reading noise on an axis with no signal.) The Grizzly '
      + 'carries the identically-shaped clause and its two octants agree, so its 0.423 is '
      + 'unchanged — the null control. RA2\'s own [CMIN] 55x28 = 0.509 is NOT usable as a '
      + 'counter-reference here: 0.509 is within half a pixel of the 0.500 diagonal pin, so that '
      + 'frame is itself a diagonal one ([CMIN] is Voxel=yes and §1.1 records one rendered frame '
      + 'at an unstated bearing), which is the same reason it appeared to leave 0.5 px for a bin');
  }
  // ── §2.3 Chrono Miner — "zero turret mass" ─────────────────────────────
  //
  // FOUR STATISTICS WERE TRIED AND REJECTED (crown height, deck step, roofline
  // bulge, roofline step — the table is in docs/per-unit-art-log.md), and all
  // four were rejected against the SAME demand: that the statistic recover the
  // renderer's hull+turret split, six units from seven. That demand is
  // stronger than the clause. §2.3 names exactly one contrast — "No turret —
  // that is the read against the War Miner" — and a universal turret detector
  // is not needed to settle it. (It is also not available in principle: the
  // renderer splits hull+turret for six kinds and the WAR MINER IS NOT ONE OF
  // THEM. Its shoulder drum is baked into the facing sheet, so the layer split
  // that looks like the obvious answer reads zero for both miners. Measured,
  // before this row was written.)
  //
  // WHAT IS MEASURED. Per bearing, the ROOFLINE is the topmost opaque row of
  // each column and the DECK LINE is that roofline's median. A raised mass is
  // a run of columns standing >= 6 px above the deck line, and the score is
  // that run's WIDTH. 6x6 is not invented: it is §2.4's own budget for the
  // War Miner's turret, "turret >= 6x6 px on the bin's shoulder".
  //
  // WHAT THE STATISTIC IS AND IS NOT. It cannot tell a turret from any other
  // raised mass — that is the four rejections' lesson and it is not repaired
  // here. It does not have to be. It proves a NEGATIVE, and it proves it in
  // the strict direction: the Chrono Miner carries NO raised mass of any kind
  // on ANY bearing, and zero raised mass implies zero turret mass. The
  // instrument is demonstrably not inert — the same statistic reads the War
  // Miner's shoulder drum, this row's named contrast, well over the 6x6 it is
  // budgeted, and finds a crown on every other ground vehicle except the
  // Terror Drone (which has no deck to speak of). The Chrono Miner and the
  // Drone are the only two flat-decked ground vehicles on the board.
  {
    const RISE = 6, RUN = 6;                       // §2.4's War Miner turret budget
    const roofline = (f) => {
      const p = [];
      for (let x = 0; x < f.w; x++) {
        let t = null;
        for (let y = 0; y < f.h; y++) if (f.mask[y * f.w + x]) { t = y; break; }
        p.push(t);
      }
      return p;
    };
    // widest run of columns standing >= RISE px above the sprite's own deck line
    const deckCrown = (f, rise) => {
      const p = roofline(f), vals = p.filter((v) => v !== null);
      if (!vals.length) return { run: 0, rise: 0 };
      const deck = median(vals);
      let best = 0, bestRise = 0, cur = 0, top = Infinity;
      for (let x = 0; x <= f.w; x++) {
        const v = x < f.w ? p[x] : null;
        if (v !== null && deck - v >= rise) { cur++; if (v < top) top = v; }
        else { if (cur > best) { best = cur; bestRise = deck - top; } cur = 0; top = Infinity; }
      }
      return { run: best, rise: bestRise };
    };
    const scan = (k, rise) => {
      let best = { run: 0, rise: 0, oct: 0 }, hits = 0;
      for (let o = 0; o < 8; o++) {
        const f = ctx.byUnitOct(k, o);
        if (!f) continue;
        const c = deckCrown(f, rise === undefined ? RISE : rise);
        if (c.run >= RUN) hits++;
        if (c.run > best.run) best = { run: c.run, rise: c.rise, oct: o };
      }
      return { best, hits };
    };
    const cm = scan('chronominer'), wm = scan('warminer');
    const others = ['lancer', 'rhino', 'mammoth', 'ifv', 'flaktrack', 'prismtank',
                    'mirage', 'teslatank', 'v3', 'mcv', 'drone']
      .filter((k) => scan(k).best.run >= RUN).length;
    add('chronominer', 'zero turret mass', cm.best.run < RUN,
        `${cm.best.run}x${cm.best.rise}`, `< ${RUN}x${RISE} on all 8 bearings`,
        `widest run of columns standing >= ${RISE} px above the sprite's own median roofline, `
      + `taken over all 8 bearings and reported at the worst of them. The Chrono Miner scores `
      + `${cm.best.run} on ${cm.hits}/8; the WAR MINER — the contrast §2.3 names — scores `
      + `${wm.best.run}x${wm.best.rise} on ${wm.hits}/8 against its own §2.4 budget of `
      + `${RUN}x${RISE} ("turret >= 6x6 px on the bin's shoulder"), and ${others} of the 11 other `
      + 'ground vehicles score too. The statistic reads ANY raised mass, not only a turret — '
      + 'that limit is real and is why four earlier statistics were rejected — but it is used '
      + 'here only to prove the strict negative: no raised mass of any kind implies no turret '
      + 'mass. The renderer layer split is NOT the instrument: the War Miner draws its drum on '
      + 'the facing sheet, so hull/turret layer mass is zero for both miners. THE NULL IS A '
      + `READING, NOT AN INERT PATH, and the margin is one pixel: at a 5 px bar the same scan `
      + `returns ${scan('chronominer', 5).best.run} columns for this unit and `
      + `${scan('chronominer', 4).best.run} at 4 px, so its cab stands 5 px above its own deck `
      + 'line and stops there. 6 is not tuned to that — it is §2.4\'s own War Miner number, '
      + 'written long before this check existed');
  }

  // ── §2.3 MCV ───────────────────────────────────────────────────────────
  // "the biggest ground vehicle that is not a ship ... >= 1.20x the widest tank"
  //
  // THE THRESHOLD IS DERIVED FROM RA2, NOT FROM THE ROW. §2.3 states 1.20x and
  // that number exceeds the game it cites: RA2's own [AMCV] is 69 px against
  // its widest tank at 59 ([MTNK]/[RTNK]/[SREF] all tie there, §1.1), i.e.
  // 1.169. The gap is small — 2.6% — but the direction matters, because a row
  // asking for MORE separation than RA2 has cannot be closed by becoming more
  // faithful, only by becoming less. It is the same defect as the Destroyer's
  // "1.7x any land vehicle" against RA2's own 1.46, at a twentieth the size,
  // and it is robust to a pixel either way: reaching 1.20 needs RA2's MCV at
  // 71 or its widest tank at 57.
  //
  // Corrected 2026-09-06 and STILL UNMET, which is the point — the correction
  // is not what closes the row. See per-unit-art-log.md.
  {
    const TANKS = ['lancer', 'rhino', 'mammoth', 'mirage', 'prismtank', 'teslatank'];
    let widest = TANKS[0];
    for (const k of TANKS) if (F[k].w > F[widest].w) widest = k;
    const r = F.mcv.w / F[widest].w;
    // RA2's own ratio, computed from §1.1's bboxes rather than chosen
    const rb = ctx.ra2Bbox || {};
    const ra2Tank = Math.max(...TANKS.map((k) => (rb[k] ? rb[k][0] : 0)));
    const want = rb.mcv && ra2Tank ? rb.mcv[0] / ra2Tank : 1.20;
    const runner = TANKS.filter((k) => k !== widest).sort((a, b) => F[b].w - F[a].w)[0];
    add('mcv', '>= 1.17x the widest tank', r >= want, R(r, 3), '>= ' + R(want, 3) + 'x',
      `${F.mcv.w} px against the ${ctx.meta.get(widest).name}'s ${F[widest].w}, broadside width — `
      + 'the same number `size.vehicleOutsideRA2Band` reads. The runner-up is the '
      + `${ctx.meta.get(runner).name} at ${F[runner].w} px. THE THRESHOLD IS RA2'S OWN, DERIVED: `
      + `[AMCV] ${rb.mcv ? rb.mcv[0] : '?'} px over the widest RA2 tank at ${ra2Tank} px = `
      + `${R(want, 3)}. §2.3 states 1.20x, which is 2.6% ABOVE the game the row cites, so the `
      + 'literal row could only ever be closed by drawing the MCV further from RA2 than it '
      + `already is. Ours sits at ${R(r / want, 3)} of RA2's own ratio. WHAT THE RESIDUAL 1.3% `
      + 'ACTUALLY IS: the MCV (+19.8% over the vehicle group scale) and the Prism Tank (+21.5%) '
      + 'are the two most OVERSIZED vehicles on the board, and this row measures which of the two '
      + 'is more oversized — `r / ra2Ratio` equals `mcvScale / prismScale` to four decimals. It '
      + 'is a scale-uniformity reading, not a statement about the MCV. '
      + 'BOTH CEILINGS MEASURED, not argued (2026-09-06): '
      + '(a) GROW THE MCV — `len` 36 -> 39 takes it 105 -> 110 px and trips '
      + '`size.vehicleOutsideRA2Band` 0 -> 1, exactly where the arithmetic puts the cap '
      + '(1.2698 group scale x 1.25 band x 69 = 109.5, so 109 px). '
      + '(b) SHRINK THE PRISM — `VSC.spectre` 1.460 -> 1.396 takes it 91 -> 88 px and costs '
      + '`iou.groundCombat.mean` 0.4652 -> 0.4711 and `mass.tightestBand6` 2.208 -> 2.149, both '
      + 'past their ratchets, AND THE ROW IS STILL UNMET AT 1.20 (105/88 = 1.193). The earlier '
      + 'note that this "misses by ONE PIXEL of Prism" understates it: 1.20 needs the widest tank '
      + 'at 87 px or under, at which point the APOCALYPSE (87 px) becomes the binding tank and '
      + 'the margin is 0.7%. Left UNMET, art untouched');
  }

  // ── §2.4 Rhino Tank ────────────────────────────────────────────────────
  {
    const rh = F.rhino, gz = F.lancer;
    const r = rh.h / gz.h;
    const hullOf = (f) => { const rp = rowProfile(f), b = bodyRun(rp); return f.h - b.lo; };
    const rHull = hullOf(rh) / hullOf(gz);
    add('rhino', "hull height >= 1.25x the Grizzly's", r >= 1.25 && rHull >= 1.25, R(r, 3), '>= 1.25x',
      `whole sprite ${rh.h} px against ${gz.h}; and below the crown (spikeOf's 'v' body run) `
      + `${hullOf(rh)} px against ${hullOf(gz)} = ${R(rHull, 3)}, so the verdict does not depend on `
      + 'where the turret is judged to start. Both conventions are reported because the clause '
      + 'says HULL and the bbox is the whole vehicle');
  }
  // "5 discrete house blocks, each 4-6 px, gaps >= 3 px" — three flank panels
  // plus two turret cheeks. Same minor-dimension reading as the Grizzly's row.
  {
    const f = F.rhino;
    const cs = components(f, isHouse).filter((c) => c.n >= 10);
    const minors = cs.map(minorDim);
    let worstGap = 1e9;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
      worstGap = Math.min(worstGap, gapBetween(f, cs[i], cs[j]));
    if (worstGap === 1e9) worstGap = 0;
    const ok = cs.length === 5 && minors.every((m) => m >= 4) && worstGap >= 3;
    add('rhino', '5 discrete house blocks, each 4-6 px, gaps >= 3 px', ok,
      `${cs.length} blocks, minor dims [${minors.join(',')}], min gap ${worstGap}`,
      '5 blocks / minor >= 4 px / gap >= 3',
      'components over 10 px at the broadside octant; "each 4-6 px" read as the MINOR dimension, '
      + 'as on the Grizzly\'s row. §2.4 names them and they are all there: three flank panels + '
      + 'two turret cheeks, countable, gaps clear. THE UPPER BOUND OF THE ROW\'S SIZE BAND IS NOT '
      + 'ENFORCED and that is a decision, not an oversight: three of the five measure 8 px against '
      + 'the row\'s 4-6, and our Rhino is 65x38 where RA2\'s [HTNK] is 56x28 — 1.16x its length '
      + 'and 1.36x its height — so the same panel scales to 4.6-8.2 px here. Thinning them to hit '
      + 'the literal band would take owner colour off the unit, and owner colour is the '
      + 'friend-from-foe read legibility.js gates. The row\'s content is FIVE COUNTABLE BLOCKS '
      + 'against the Grizzly\'s two, and that is what is asserted');
  }

  // ── §2.4 Apocalypse ────────────────────────────────────────────────────
  // "each canister >= 6x6 px and individually countable (gaps >= 2 px)".
  // Countability is the clause, so this counts house components whose BOTH
  // dimensions clear 6 px and reports the tightest gap among them.
  {
    const f = F.mammoth;
    // The drums sit on the REAR deck, so they are the house blocks in the half
    // of the sprite AWAY from the twin barrels; the barrels are found, not
    // assumed, as the thin-column protrusion, so this follows the bearing.
    const gun = sideProtrusion(f);
    const rear = (c) => (gun.side === 'left' ? (c.x0 + c.x1) / 2 > f.w * 0.5
                                             : (c.x0 + c.x1) / 2 < f.w * 0.5);
    const cs = components(f, isHouse).filter((c) => c.w >= 6 && c.h >= 6 && rear(c));
    let tight = 1e9;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
      tight = Math.min(tight, gapBetween(f, cs[i], cs[j]));
    if (tight === 1e9) tight = 0;
    const ok = cs.length >= 2 && tight >= 2;
    add('mammoth', 'each canister >= 6x6 px and individually countable (gaps >= 2 px)', ok,
      `${cs.length} rear-deck house blocks >= 6x6 [${cs.map((c) => c.w + 'x' + c.h).join(', ')}], `
      + `tightest gap ${tight} px`, '>= 2 rear blocks >= 6x6 / gaps >= 2',
      'FOUR drums are drawn, 2x2 in the ground plane. Under a 2:1 iso camera at the gated bearing '
      + 'the far pair stands directly BEHIND the near pair, so two resolvable columns is the most '
      + 'this bearing can show and that is the bar used — stated because the row says four. The '
      + 'part of the clause that had teeth is the gap, and it was 1 px: all four drums baked as '
      + 'ONE 22x31 house component until this pass spread them');
  }

  // ── §2.4 Tesla Tank ────────────────────────────────────────────────────
  // "gap between them >= 5 px so the pair reads as two". THE ONE CLAUSE THAT
  // CANNOT BE READ AT THE BROADSIDE OCTANT, and the reason is the camera, not
  // the art: the two coils stand across the beam, so at the two bearings that
  // look along that axis they project onto each other and no separation
  // survives. Measured over all eight bearings instead, and the note says so.
  {
    const copper = (p) => !!p && p.s >= 0.30 && p.h >= 12 && p.h <= 45;
    const per = [];
    for (let o = 0; o < 8; o++) {
      const f = ctx.byUnitOct('teslatank', o);
      if (!f || !f.rgba) continue;
      const rp = rowProfile(f), { lo } = bodyRun(rp);
      const prof = new Int32Array(f.w);
      for (let y = 0; y < lo; y++) for (let x = 0; x < f.w; x++) if (copper(px(f, x, y))) prof[x]++;
      const runs = [];
      let st = -1;
      for (let x = 0; x <= f.w; x++) {
        const on = x < f.w && prof[x] > 0;
        if (on && st < 0) st = x;
        if (!on && st >= 0) { runs.push([st, x - 1]); st = -1; }
      }
      const big = runs.filter((r2) => r2[1] - r2[0] + 1 >= 3);
      per.push({ oct: o, cols: big.length,
                 gap: big.length >= 2 ? big[1][0] - big[0][1] - 1 : 0 });
    }
    const two = per.filter((q) => q.cols >= 2);
    const worst = two.length ? Math.min(...two.map((q) => q.gap)) : 0;
    const ok = two.length >= 4 && worst >= 5;
    add('teslatank', 'gap between the coil columns >= 5 px so the pair reads as two', ok,
      `${two.length}/8 bearings resolve two columns, gaps [${two.map((q) => q.gap).join(',')}]`,
      '>= 4 of 8 bearings / every gap >= 5 px',
      'copper is s >= 0.30 and hue 12-45, taken above the deck row that spikeOf\'s \'v\' rule '
      + 'finds. The bearings that do NOT resolve two are the end-on pair, where a 2:1 iso camera '
      + 'projects one coil onto the other — geometry, not art, and no drawing can fix it. "4 of 8 '
      + 'bearings" is this file\'s reading of "the pair reads as two"; the row states no such '
      + 'number, only the 5 px');
  }

  // ── §2.4 V3 Launcher ───────────────────────────────────────────────────
  // "nose cone and fins in house hue, midbody pure white". The missile lies on
  // the sprite's DIAGONAL, so "the ends" is meaningless in x/y: the white body's
  // own principal axis is found from its second moments and the house blocks
  // are projected onto it. That also keeps the cab window and the flank panels
  // out — they project INSIDE the body's own half-length.
  {
    const f = F.v3;
    const white = (p) => !!p && p.s <= 0.12 && p.v >= 0.78;
    const wc = components(f, white)[0];
    let ends = 0, tA = 0, tB = 0, axis = null;
    if (wc) {
      let sx = 0, sy = 0;
      for (const i of wc.cells) { sx += i % f.w; sy += (i - (i % f.w)) / f.w; }
      const cxw = sx / wc.n, cyw = sy / wc.n;
      let mxx = 0, myy = 0, mxy = 0;
      for (const i of wc.cells) {
        const dx = (i % f.w) - cxw, dy = (i - (i % f.w)) / f.w - cyw;
        mxx += dx * dx; myy += dy * dy; mxy += dx * dy;
      }
      const th = 0.5 * Math.atan2(2 * mxy, mxx - myy);
      axis = [Math.cos(th), Math.sin(th)];
      let half = 0;
      for (const i of wc.cells) {
        const t = ((i % f.w) - cxw) * axis[0] + ((i - (i % f.w)) / f.w - cyw) * axis[1];
        if (Math.abs(t) > half) half = Math.abs(t);
      }
      for (const c of components(f, isHouse).filter((q) => q.n >= 8)) {
        const t = ((c.x0 + c.x1) / 2 - cxw) * axis[0] + ((c.y0 + c.y1) / 2 - cyw) * axis[1];
        if (t > half * 0.85) tB = Math.max(tB, t);
        if (t < -half * 0.85) tA = Math.min(tA, t);
      }
      ends = (tA < 0 ? 1 : 0) + (tB > 0 ? 1 : 0);
    }
    const ok = !!wc && wc.n >= 120 && ends === 2;
    add('v3', 'nose cone and fins in house hue, midbody pure white', ok,
      `white midbody ${wc ? wc.w + 'x' + wc.h + ' (' + wc.n + ' px)' : 'none'}, house at `
      + `${ends}/2 ends of its own axis`, 'one white body >= 120 px + house at BOTH ends',
      'white is s <= 0.12 and v >= 0.78 — "pure white" states no number and that is the reading. '
      + '120 px is the floor for "a midbody rather than a highlight", chosen here, not stated by '
      + 'the row. The ends are house components whose centre projects past 0.85 of the white '
      + 'body\'s own half-length ALONG ITS PRINCIPAL AXIS, which is what keeps the cab window and '
      + 'the chassis skirt from being counted as a nose cone');
  }

  // ── §2.4 Flak Track ────────────────────────────────────────────────────
  {
    const f = F.flaktrack, a = f.w / f.h;
    const need = f.h - f.w / 0.95;
    add('flaktrack', 'body aspect 0.95-1.10', a >= 0.95 && a <= 1.10, R(a, 3), '0.95 - 1.10',
      `whole-sprite ${f.w}x${f.h}. The row's own reference is [HTK] 45x45 = 1.00, an RA2 bbox, so `
      + `"body" is the whole sprite here. ${R(a / 1.0, 3)} of RA2 — INSIDE art-metrics' +-20% `
      + `aspect band, outside this row's tighter one. Reaching 0.95 costs ${R(need, 1)} px of `
      + 'height, and the height is the near-vertical jib per-unit-art-log.md records as a measured '
      + 'decision ("a shallower jib left its crown the same fat box the IFV wears — the pair the '
      + 'gate scored at 0.709"); the IFV is still this unit\'s closest peer at IoU 0.609, so '
      + 'flattening it walks straight into that pair. Left, deliberately');
  }

  // ── §2.4 War Miner ─────────────────────────────────────────────────────
  // "bin >= 35% of body px". The bin is the ore hopper — the one large
  // tan/ochre mass; everything else on the hull is steel, house blue or black.
  {
    const f = F.warminer;
    const tan = (p) => !!p && p.s >= 0.25 && p.h >= 28 && p.h <= 65;
    let n = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (tan(px(f, x, y))) n++;
    const opq = opaqueOf(f), frac = n / opq;
    add('warminer', 'bin >= 35% of body px', frac >= 0.35, R(frac, 3), '>= 0.35',
      `${n} tan px (s >= 0.25, hue 28-65) of ${opq} opaque, at the broadside octant. The `
      + 'denominator is every opaque pixel of the bbox, contact shadow included — the strictest '
      + 'reading of "body px" available without segmenting the shadow, and the one that cannot '
      + 'flatter the bin');
  }

  // ── §2.4 Terror Drone ──────────────────────────────────────────────────
  {
    const TANKS = ['lancer', 'rhino', 'mammoth', 'mirage', 'prismtank', 'teslatank'];
    let small = TANKS[0];
    for (const k of TANKS) if (F[k].w < F[small].w) small = k;
    const r = F.drone.w / F[small].w;
    add('drone', 'total <= 0.55x the smallest tank', r <= 0.55, R(r, 3), '<= 0.55x',
      `${F.drone.w} px against the ${ctx.meta.get(small).name}'s ${F[small].w}, broadside width. `
      + `RA2's own pair is [DRON] 21 against [GTNK] 54 = 0.389. The width here is LEG SPAN — the `
      + 'four splayed blades §2.4 calls the silhouette — so the ratio is measuring the identity '
      + 'feature, not a fat core. Closed 2026-09-06 by `VSC.drone` 1.000 -> 0.880 (32 px -> 28), '
      + 'which is the RIGHT lever twice over: it also takes the drone\'s size deviation from the '
      + 'vehicle group scale from +0.200 to +0.050, and it leaves every proportion alone, so the '
      + 'leg reach that carries its SPIKES entry stays 9 px against a 4 px budget and '
      + '`spike.minThickAtZmin` does not move. Checked against legibility.js in all six windows '
      + 'before shipping — the Attack Dog\'s reverted shrink is the standing warning here — and '
      + 'every vehicle minimum went UP or held');
  }
  // "core in house hue". The core is the central body the legs radiate from:
  // taken as the middle 40% x 60% of the bbox, which excludes the leg tips at
  // every bearing. The row states no fraction; RA2's own figure, in the same
  // sentence, is 38.7% house on the core, and that is the number used.
  {
    const f = F.drone;
    const x0 = Math.round(f.w * 0.30), x1 = Math.round(f.w * 0.70);
    const y0 = Math.round(f.h * 0.10), y1 = Math.round(f.h * 0.70);
    let n = 0, o = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = px(f, x, y); if (!p) continue; o++; if (isHouse(p)) n++;
    }
    const frac = o ? n / o : 0;
    add('drone', 'core in house hue', frac >= 0.35, R(frac, 3), '>= 0.35 of the core',
      `${n} house px of ${o} opaque in the core box x[${x0},${x1}) y[${y0},${y1}) — the middle `
      + '40% x 60% of the bbox, which excludes the leg tips at every bearing. The row states NO '
      + 'fraction; 0.35 is this file\'s reading of "in house hue", taken from the 38.7% the same '
      + 'row records for RA2\'s own [DRON] core');
  }

  return rows;
};
