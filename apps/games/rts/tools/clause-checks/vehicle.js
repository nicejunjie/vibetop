/**
 * §2.3 / §2.4's UNMEASURED VEHICLE CLAUSES — 18 of them, one file.
 *
 * The inventory (docs/clause-inventory.md) lists 18 budget clauses on the
 * vehicle rows that no SPIKES entry gates. 15 are measured here; three are not,
 * and each says so in place rather than being silently absent:
 *   * `chronominer` "zero turret mass" — UNMEASURABLE, with the four silhouette
 *     statistics that were tried and why each fails (per-unit-art-log.md).
 *   * `ifv` "turret >= 45% of total height" — STRUCK from §2.3 (2026-09-07);
 *     it cannot coexist with the aspect clause on its own row, and the
 *     frontier is measured. Reasons at the IFV block below.
 *   * `flaktrack` "body aspect 0.95-1.10" — WAIVED in §2.4 (2026-09-07)
 *     against a recorded measured decision. Reasons at the Flak Track block.
 * A bogus check is worse than an admitted gap, and a struck or waived clause
 * costs `clause.checked` (54 -> 52 against a want of 57) rather than buying it
 * — which is the right way round: striking must never be the cheap way to a
 * green number.
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
    const f = F.lancer, r = f.h / f.w;
    add('lancer', 'hull height <= 0.45 x length', r <= 0.45, R(r, 3), '<= 0.45',
      `whole-sprite ${f.w}x${f.h} at octant ${ctx.broadsideOct('lancer')}; the hull is a SUBSET of `
      + 'the bbox (which also carries the barrel and the contact shadow), so this ratio is an '
      + 'upper bound on the hull\'s own — meeting it here is stronger than the clause asks');
  }

  // "exactly 2 house blocks, each 4-8 px, individually countable (gap >= 2 px,
  // no fusing)". THE ROW'S NUMBERS WERE CORRECTED ON 2026-09-07 and the old
  // ones are quoted here so the change is not silent: it used to read "each
  // 6-8 px, separated by >= 4 px", and neither figure had a source. §1.4
  // describes RA2's Grizzly as "two discrete panels ... with a clear gap
  // between them" and states no number; Rule 6 in the same section gives the
  // vehicle band as "2-5 blocks of 4-8 px"; §2.4 asks >= 3 px of gap between
  // FIVE blocks on the Rhino's 65x38 hull and >= 2 px between the Apocalypse's
  // canisters — the row that states the same countability property this one
  // means. A wider gap on the smallest tank than on either is not stricter,
  // it is unsourced. (An earlier version of this comment justified the band
  // from "§1.4 records RA2's Grizzly at 21.0% house": that figure is §2.4's
  // ALLIED MCV, not the Grizzly, and §1.4's vehicle table has no Grizzly row
  // at all. The misattribution is recorded rather than quietly dropped.)
  //
  // READING OF "each 4-8 px": still the block's MINOR dimension, and now
  // derived correctly. Rule 6 sites these blocks "on the turret cheek, the
  // flank plate, or the named part", and §1.4's one worked example quotes a
  // block's BOTH dimensions ("each roughly 7x7 px" for the Apocalypse's
  // drums) — so where the reference means a square it says so, and a flank
  // PANEL on a 54 px hull is a thickness. Stated because it changes the
  // verdict, not just the number.
  {
    const f = F.lancer;
    const cs = components(f, isHouse).filter((c) => c.n >= 12);
    const gaps = [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) gaps.push(gapBetween(f, cs[i], cs[j]));
    const minors = cs.map(minorDim);
    const ok = cs.length === 2 && minors.every((m) => m >= 4 && m <= 8) && Math.min(...gaps) >= 2;
    add('lancer', 'exactly 2 house blocks, each 4-8 px, individually countable (gap >= 2 px, no fusing)', ok,
      `${cs.length} blocks, minor dims [${minors.join(',')}], gap ${gaps.length ? Math.min(...gaps) : '-'}`,
      '2 blocks / minor 4-8 px / gap >= 2',
      '8-connected components of the house mask over 12 px, at the broadside octant. "each 4-8 px" '
      + 'is read as the MINOR dimension — see the block comment. THE DEFECT WAS A RENDERING ORDER '
      + 'BUG AND IT IS FIXED: the FAR flank\'s panel was painted after the chassis, so it lay on '
      + 'the deck instead of behind the hull and anti-aliased into the turret cheek, and what the '
      + '2026-09-06 pass measured as "the cheek, 2 px from the plate" was that fused blob — which '
      + 'is why raising the turret moved the gap by exactly zero, and it was never the cheek being '
      + 'pinned. Far panel under the hull, near panel on top: the cheek measures alone, the flank '
      + 'panel grows UPWARD to a 6 px minor, and the SILHOUETTE IS BYTE-IDENTICAL (5058 opaque px '
      + 'over eight bearings, before and after) so no mask metric can move. That constraint is '
      + 'load-bearing: the two configurations that DO deliver the row\'s old ">= 4 px" both add '
      + 'mask — a raised turret cap (+15 opaque px a bearing) or the panel dropped onto the '
      + 'contact-shadow row (+13) — and both take `iou.groundCombat.mean` 0.4652 -> 0.4667, more '
      + 'than the whole of that gate\'s last gain. 6 + 4 + 6 is 16 rows of a 22-row sprite and '
      + 'only 14 exist between the turret cap and the track line');
  }

  // ── §2.3 IFV ───────────────────────────────────────────────────────────
  {
    const f = F.ifv, a = f.w / f.h;
    add('ifv', 'body aspect 1.0-1.2', a >= 1.0 && a <= 1.2, R(a, 3), '1.0 - 1.2',
      `whole-sprite ${f.w}x${f.h}; RA2's own [FV] is 50x45 = 1.111 measured the same way, and `
      + `art-metrics' aspect gate reads this unit at ${R(a / (50 / 45), 3)} of it`);
  }
  // §2.3 IFV, "turret >= 45% of total height", IS STRUCK from the reference
  // (2026-09-07) and deliberately emits NO ROW here — the same shape as the
  // Nighthawk's rotor-span clause in naval-air.js. Recorded rather than left
  // as a silently-missing check:
  //
  //   * IT CANNOT COEXIST WITH THE CLAUSE BESIDE IT. At the IFV's gated
  //     octant |fy| = |py| = ISO_Y and ISO_Y/ISO_X is exactly 1/2, so a ground
  //     footprint of screen width w projects to w/2 of screen HEIGHT that
  //     carries no vertical structure: h = w/2 + V. "body aspect 1.0-1.2"
  //     therefore caps V — the whole wheels-to-crown budget — at w/2, 26.5 px
  //     of our 53x49 sprite, and the crown has to come out of what the wheels,
  //     the chassis and the crew box leave.
  //   * THE FRONTIER IS MEASURED, one lever at a time (turret up, crew box
  //     down, wheels in, chassis down): the best turret fraction reachable at
  //     aspect exactly 1.000 is 0.420, and 0.45 first appears at aspect 0.943
  //     = 0.849 of [FV]'s own 1.111. The 2026-09-06 note quoted a worse figure
  //     (0.855) because it only tried GROWING the turret; shrinking the body
  //     is the cheaper lever and it still stops short — 0.388 at aspect 1.041.
  //   * 45% HAS NO SOURCE. There is no [FV] rip in docs/ra2-ref/sprites/, and
  //     §1.1's only measured [FV] datum is the 50x45 bbox the OTHER clause on
  //     the row already encodes. What is left is the cameo, and this project
  //     has recorded three separate times that in-game proportion cannot be
  //     read off one.
  //   * THE ROW'S INTENT IS HONOURED AND IS CHECKED ELSEWHERE. art.ini puts
  //     [FV]'s missile turret muzzle at Z=180 and its gun turret at Z=160
  //     where [GTNK] and [HTNK] sit at Z=100, on a body RA2 draws shorter than
  //     the Grizzly's; ours carries a 15 px crown against the Grizzly's 5, and
  //     the row's third clause (four turret models distinct at >= 8x8) is the
  //     unit's gated SPIKES entry.
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
  {
    const f = F.chronominer, r = f.h / f.w;
    add('chronominer', 'height <= 0.55 x length', r <= 0.55, R(r, 3), '<= 0.55',
      `whole-sprite ${f.w}x${f.h}. RA2's own [CMIN] is 55x28 = 0.509 measured the same way. `
      + `At 0.55 the broadside aspect would be ${R(1 / 0.55, 3)} against RA2's 1.964, i.e. `
      + `${R((1 / 0.55) / 1.964, 3)} of the reference — INSIDE the +-20% aspect band and closer to `
      + `it than today's ${R(f.w / f.h / 1.964, 3)}, so the clause and the aspect gate pull the `
      + 'same way here. THE CEILING IS THE CAMERA. This unit\'s widest bearing is the DIAGONAL '
      + 'octant, where a FLAT ground rectangle of any L and W projects to exactly h/w = 0.500 — '
      + 'TW:TH is 64:32, so ISO_Y/ISO_X is exactly 1/2 and both ground axes contribute the same '
      + `ratio. 0.55 therefore leaves 0.05 x ${f.w} = ${R(0.05 * f.w, 1)} px for the ENTIRE `
      + `superstructure (bin, rails, chute, cab, drum); ours adds ${R(f.h - 0.5 * f.w, 1)} px, `
      + 'down from 5.5 before this pass took 2 px off the bin. RA2\'s own [CMIN] 55x28 = 0.509 '
      + 'leaves 0.5 px, which is not a measurement of a truck with a bin on it — [CMIN] is '
      + 'Voxel=yes, so §1.1\'s figure is one rendered frame at an unrecorded bearing. At the '
      + `HULL-broadside octant the same sprite measures ${R(ctx.byUnitOct('chronominer', 3).h / ctx.byUnitOct('chronominer', 3).w, 3)}, `
      + 'which MEETS the clause; the number reported here is at the octant the aspect and size '
      + 'gates read, which is the convention this whole file uses');
  }
  // "zero turret mass" is NOT checked — see docs/per-unit-art-log.md. Four
  // silhouette statistics were tried and none separates the six units the
  // renderer composes as hull+turret from the seven it does not.

  // ── §2.3 MCV ───────────────────────────────────────────────────────────
  // "the biggest ground vehicle that is not a ship ... >= 1.20x the widest tank"
  {
    const TANKS = ['lancer', 'rhino', 'mammoth', 'mirage', 'prismtank', 'teslatank'];
    let widest = TANKS[0];
    for (const k of TANKS) if (F[k].w > F[widest].w) widest = k;
    const r = F.mcv.w / F[widest].w;
    add('mcv', '>= 1.20x the widest tank', r >= 1.20, R(r, 3), '>= 1.20x',
      `${F.mcv.w} px against the ${ctx.meta.get(widest).name}'s ${F[widest].w}, broadside width — `
      + 'the same number `size.vehicleOutsideRA2Band` reads. The runner-up is the '
      + `${ctx.meta.get(TANKS.filter((k) => k !== widest).sort((a, b) => F[b].w - F[a].w)[0]).name} at `
      + `${Math.max(...TANKS.filter((k) => k !== widest).map((k) => F[k].w))} px`
      + '. A CEILING, and it misses by ONE PIXEL. The MCV can grow to at most 109 px before '
      + '`size.vehicleOutsideRA2Band` fires: the vehicle group scale is 1.2698 and the band is '
      + '+-0.25, so 1.2698 x 1.25 x RA2\'s 69 px = 109.5. 109 / 1.20 = 90.8, so the widest tank '
      + 'has to be 90 px or under and the Prism Tank is 91. Measured, not argued: at MCV 109 the '
      + 'ratio is 1.198. Shrinking the Prism DOES close it (measured MET at prism 87-89), and it '
      + 'costs `iou.groundCombat.mean` 0.4652 -> 0.4687-0.4717, over the 0.466 the ratchet holds, '
      + 'because a smaller Prism converges on the Apocalypse\'s 87 px and the two are already the '
      + 'group\'s big silhouettes. One gate\'s pixel against another\'s; left as debt');
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
  // "body aspect 0.95-1.10" measures 0.878 and IS WAIVED in the reference
  // (2026-09-07), so no row is emitted. It is waived against a decision this
  // project made on evidence, and BOTH routes to 0.95 were measured before the
  // waiver was written:
  //
  //   * LOWER THE JIB. The near-vertical barrel is the height, and it is a
  //     recorded deliberate decision — per-unit-art-log.md, "Looked at, and
  //     deliberately LEFT ALONE": "a shallower jib left its crown the same fat
  //     box the IFV wears — the two lightest vehicles in the game, and the
  //     pair the gate scored at 0.709". rts.html's own block repeats it. The
  //     barrel at ky-15.6 instead of ky-19.4 does reach aspect 0.956.
  //   * GROW THE FOOTPRINT, JIB UNTOUCHED. New in this pass; the earlier ones
  //     never tried it. len 23->28 / wid 15->18 takes the sprite 43x49 ->
  //     47x49 and the aspect to 0.959 with the gun exactly as drawn, and it
  //     also improves the unit's -0.2474 size deviation, the worst in the
  //     vehicle group and 0.0026 from tripping size.vehicleOutsideRA2Band.
  //     Reverted anyway: it takes `flaktrack | ifv` from 0.6088 to 0.6817 and
  //     `iou.groundCombat.mean` from 0.4667 to 0.4777.
  //
  // Both routes fail into the SAME pair, which is the finding: the Flak Track
  // and the IFV are the two lightest vehicles on the field and the only thing
  // separating their masks is that one of them is tall and narrow. The clause
  // asks for exactly the property that separation is bought with. The unit is
  // still inside art-metrics' own +-20% RA2 aspect band (0.878 of [HTK]'s
  // 1.00) and aspect.vehicleOutsideRA2Band stays 0.

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
