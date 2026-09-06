/**
 * §2's NAVAL and AIR budget clauses — the sixteen that had no measurement.
 *
 * `docs/clause-inventory.md` lists nine naval rows and seven air rows whose
 * `gated` column is `—`: honoured by intention only. Fifteen are measured
 * against the art here. The sixteenth (the Nighthawk's rotor span) is STRUCK
 * from §2.3, and it now carries a row of its own that checks THE STRIKE — the
 * two premises of the arithmetic, read out of the source — rather than
 * checking the airframe against a bar its own row makes unreachable. It is
 * flagged `struck: true`, counted apart in `clause.struck`, and the whole
 * argument is beside it at the foot of `exports.check`.
 *
 * ── CONVENTIONS, stated once, because the same clause measured two ways
 *    gives two answers (the trap EXAMPLE-infantry-gi.js exists to document).
 *
 * BAND / BEARING. Every measurement is taken off the BAKED bbox, which
 * includes the bow wave on every surface hull (8-13 rows of foam, ~20-25% of
 * the Carrier's height) and the contact shadow on the aircraft. Nothing is
 * computed from drawing coordinates. Unless a row says otherwise the bearing
 * is the BROADSIDE octant — `ctx.broadsideOct`, the one the aspect and size
 * gates read — because that is where §1.1's RA2 reference bboxes were taken.
 * Three clauses need a different bearing and each says which and why.
 *
 * OWNER HUE. The bake is the OWNER-0 sprite and owner 0 is `#4aa3db`
 * (`rts.html:19440`), so a house pixel is `h 190-220, s >= 0.50`. The
 * reference's own census uses `s > 0.40`; 0.50 is used here because the ships'
 * GLASS `#7fb6d8` sits at s 0.41 and would otherwise count as remap. This is
 * CONSERVATIVE — it misses anti-aliased owner pixels, so it reads the
 * Destroyer at 299 px against the empirical owner-0/owner-1 diff's 395.
 *
 * VALUE. HSV `v` = max(r,g,b)/255, matching the census in `art-metrics.js`.
 *
 * WHERE §2 STATES NO NUMBER the threshold is this file's reading and the row's
 * `note` says so. Nine of these fifteen rows state none.
 */
'use strict';
const fs = require('fs');
const path = require('path');

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

const OP = (f, x, y) =>
  x >= 0 && y >= 0 && x < f.w && y < f.h && f.mask[y * f.w + x] && f.rgba[(y * f.w + x) * 4 + 3] > 8;
const C = (f, x, y) => {
  const j = (y * f.w + x) * 4;
  return hsv(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]);
};
const AL = (f, x, y) => f.rgba[(y * f.w + x) * 4 + 3];
const OWN = (c) => c.s >= 0.50 && c.h >= 190 && c.h <= 220;

/** Connected components over a predicate, with the 1-px ring around each. */
function comps(f, pred, eight) {
  const D = eight
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const seen = new Uint8Array(f.w * f.h), out = [];
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = y * f.w + x;
    if (seen[i] || !OP(f, x, y) || !pred(C(f, x, y), x, y)) continue;
    const st = [[x, y]]; seen[i] = 1;
    let n = 0, x0 = x, x1 = x, y0 = y, y1 = y, vs = 0;
    const ring = [];
    while (st.length) {
      const p = st.pop(), cx = p[0], cy = p[1];
      n++; vs += C(f, cx, cy).v;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (const d of D) {
        const nx = cx + d[0], ny = cy + d[1], ni = ny * f.w + nx;
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        if (!OP(f, nx, ny) || !pred(C(f, nx, ny), nx, ny)) { if (OP(f, nx, ny)) ring.push([nx, ny]); continue; }
        if (seen[ni]) continue;
        seen[ni] = 1; st.push([nx, ny]);
      }
    }
    const rv = ring.length ? ring.reduce((s, p) => s + C(f, p[0], p[1]).v, 0) / ring.length : 1;
    out.push({ n, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, v: vs / n, ringV: rv });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** The four silhouette boundary profiles. -1 where the row/column is empty. */
function bounds(f) {
  const L = [], R = [], T = [], B = [];
  for (let y = 0; y < f.h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < f.w; x++) if (OP(f, x, y)) { if (lo < 0) lo = x; hi = x; }
    L.push(lo); R.push(hi);
  }
  for (let x = 0; x < f.w; x++) {
    let lo = -1, hi = -1;
    for (let y = 0; y < f.h; y++) if (OP(f, x, y)) { if (lo < 0) lo = y; hi = y; }
    T.push(lo); B.push(hi);
  }
  return [L, R, T, B];
}

/**
 * The longest CORNER-ANCHORED flat run on the silhouette.
 *
 * A raster curve is flat for several pixels at its apex, so a bare "longest
 * flat run" scores the Dolphin's belly (19 px) above the Landing Craft's whole
 * boxy hull (13) and measures nothing. A drawn straight EDGE has corners: the
 * boundary steps by >= 2 px at both ends of the run. A curve's apex steps by 1
 * at a time, and a run that dies off the end of the sprite is a taper, not a
 * corner, so a real neighbour is required at both ends.
 */
function straightEdge(f) {
  let best = 0;
  for (const a of bounds(f)) {
    let i = 0;
    while (i < a.length) {
      if (a[i] < 0) { i++; continue; }
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[i]) j++;
      const b0 = i > 0 ? a[i - 1] : -1, b1 = j + 1 < a.length ? a[j + 1] : -1;
      if (b0 >= 0 && b1 >= 0 && Math.abs(b0 - a[i]) >= 2 && Math.abs(b1 - a[i]) >= 2)
        best = Math.max(best, j - i + 1);
      i = j + 1;
    }
  }
  return best;
}

/**
 * A GUN BARREL: a dark bar with daylight (or a big value step) above AND
 * below it. Colour alone does not work — the Aegis's own deckhouse faces are
 * darker over more pixels than the Destroyer's gun is long (19 px of dark
 * against 16), so a plain "longest dark run" says the missile cruiser is the
 * more heavily gunned ship. What separates a barrel from a shadowed wall is
 * that a barrel is ISOLATED in the vertical.
 */
function barrelRun(f) {
  const dark = (x, y) => OP(f, x, y) && C(f, x, y).v <= 0.22 && C(f, x, y).s <= 0.45;
  const clear = (x, y) => !OP(f, x, y) || C(f, x, y).v >= 0.34;
  let best = 0;
  for (let y = 1; y < f.h - 3; y++) {
    let x = 0;
    while (x < f.w) {
      if (!dark(x, y)) { x++; continue; }
      let e = x;
      while (e + 1 < f.w && dark(e + 1, y)) e++;
      const len = e - x + 1;
      if (len >= 5) {
        let free = 0;
        for (let q = x; q <= e; q++) if (clear(q, y - 2) && clear(q, y + 3)) free++;
        if (free / len >= 0.75 && len > best) best = len;
      }
      x = e + 1;
    }
  }
  return best;
}

/**
 * The shipped source, for the one clause whose subject is not a sprite. The
 * Nighthawk's struck rotor row is an argument about the CAMERA and about how
 * the disc is projected, and neither is in any bake — reading the constants
 * out of `rts.html` is the honest measurement rather than a proxy for one.
 * Same pattern, and the same reason, as the three SOURCE-CONSTANT rows in
 * `infantry.js`.
 */
const SRC = () => {
  try { return fs.readFileSync(path.join(__dirname, '..', '..', 'rts.html'), 'utf8'); }
  catch (e) { return ''; }
};
const num = (src, re, g) => { const m = src.match(re); return m ? Number(m[g]) : 0; };

const rowExtents = (f) => {
  const e = [];
  for (let y = 0; y < f.h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < f.w; x++) if (OP(f, x, y)) { if (lo < 0) lo = x; hi = x; }
    e.push(lo < 0 ? 0 : hi - lo + 1);
  }
  return e;
};

exports.check = function (ctx) {
  const rows = [];
  const R = ctx.round;
  const bs = (k) => {
    const f = ctx.byUnitOct(k, ctx.broadsideOct(k));
    return f && f.rgba ? f : null;
  };
  const W = (k) => { const f = bs(k); return f ? f.w : 0; };
  // Every unit this file measures. A missing bake is art-metrics' own error to
  // report (`bakeErrors`, `missing`); this module returns nothing rather than
  // throwing a row that says "naval-air.js threw" and hides the real cause.
  for (const k of ['destroyer', 'aegis', 'carrier', 'dolphin', 'squid', 'lcraft', 'apc', 'sub',
                   'seascorp', 'nighthawk', 'harrier', 'hornet', 'kirov'])
    if (!bs(k)) return rows;

  // ══ NAVAL ═════════════════════════════════════════════════════════════

  // §2.3 Destroyer: "length >= 1.7x any land vehicle".
  // The strict reading ("any" = every) is the only one with content; the
  // existential reading is satisfied by the Terror Drone and says nothing.
  //
  // THE THRESHOLD IS DERIVED FROM RA2 AND THE ROW'S 1.7 IS ABOVE IT. §1.1 —
  // and the second column of this very row — gives [DEST] 101x41 and [AMCV]
  // 69x47, so RA2's own destroyer is 1.46x its own widest land vehicle. The
  // sentence asked for 16% more separation than the game it cites, which means
  // the literal row was unclosable by fidelity: you could only reach it by
  // drawing a fleet RA2 does not have. Corrected 2026-09-06, and it is STILL
  // UNMET by a mile, which is why correcting it is not a closure — see below.
  {
    const veh = Object.keys(ctx.units).filter((k) => ctx.units[k].group === 'vehicle');
    let big = null;
    for (const k of veh) if (!big || W(k) > W(big)) big = k;
    const ratio = W('destroyer') / W(big);
    // and the cause, measured: each group's own bake scale against RA2's
    // sprite widths (unit-identity-reference.md §1.1, mirrored in RA2_BBOX).
    const RA2W = { destroyer: 101, aegis: 91, carrier: 143, dread: 133, squid: 117, sub: 75,
      seascorp: 59, drone: 21, hornet: 27, flaktrack: 45, ifv: 50, teslatank: 52, lancer: 54,
      chronominer: 55, rhino: 56, mammoth: 59, warminer: 56, mirage: 59, prismtank: 59, v3: 63,
      nighthawk: 64, mcv: 69, harrier: 71, kirov: 139 };
    const scaleOf = (g) => {
      const v = Object.keys(ctx.units)
        .filter((k) => ctx.units[k].group === g && RA2W[k]).map((k) => W(k) / RA2W[k])
        .sort((a, b) => a - b);
      return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    };
    const sn = scaleOf('naval'), sv = scaleOf('vehicle');
    // RA2's own ratio, computed from §1.1 rather than chosen by anybody
    const rb = ctx.ra2Bbox || {};
    const ra2Veh = Math.max(...veh.map((k) => (rb[k] ? rb[k][0] : 0)));
    const want = rb.destroyer && ra2Veh ? rb.destroyer[0] / ra2Veh : 1.7;
    // the two bake scales that fully explain the measured number
    const sD = W('destroyer') / rb.destroyer[0], sB = W(big) / rb[big][0];
    rows.push({
      unit: 'destroyer', clause: 'length >= 1.46x any land vehicle',
      ok: ratio >= want, measured: R(ratio, 3), want: '>= ' + R(want, 2) + 'x',
      note: `destroyer ${W('destroyer')} px broadside against the widest land vehicle, `
          + `${ctx.units[big].name} at ${W(big)} px — she is SHORTER than a tank. `
          + `THE THRESHOLD IS RA2'S OWN, DERIVED: [DEST] ${rb.destroyer[0]} px over the widest `
          + `RA2 land vehicle ([AMCV] ${ra2Veh} px) = ${R(want, 3)}. §2.3 stated 1.7x, 16% ABOVE `
          + 'the game the row cites, and 1.7 would need a 179 px hull (Carrier 264 px on a 150 px '
          + 'sheet). CORRECTING IT CLOSES NOTHING AND IS NOT MEANT TO: at '
          + `${R(ratio, 3)} the row is still unmet by a factor of ${R(want / ratio, 2)}, and the `
          + 'SIGN is the defect. '
          + 'WHAT THIS CLAUSE ACTUALLY MEASURES is the cross-group bake scale, exactly: our '
          + `${R(ratio, 3)} = RA2's ${R(want, 3)} x (destroyer scale ${R(sD, 4)} / `
          + `${ctx.units[big].name} scale ${R(sB, 4)}), to four decimals. The fleet is baked at `
          + `${R(sn, 3)}x RA2's own sprite widths while the ground vehicles sit at ${R(sv, 3)}x — `
          + `a ${R(sv / sn, 2)}x CROSS-GROUP mismatch that NEITHER size gate can see, because `
          + '`size.navalOutsideRA2Band` and `size.vehicleOutsideRA2Band` both normalise against '
          + 'their own group\'s median. `size.crossGroupSpread` exists to hold it and is '
          + 'ratcheted at 1.607. '
          + 'CLOSING IT IS A WHOLE-ROSTER DECISION AND IS DELIBERATELY NOT TAKEN HERE: even the '
          + `faithful ${R(want, 2)} needs a ${Math.round(want * W(big))} px destroyer, i.e. `
          + `${R(want * W(big) / W('destroyer'), 3)}x on the fleet, which puts the Carrier at `
          + `${Math.round(W('carrier') * want * W(big) / W('destroyer'))} px on a 150 px sheet — `
          + 'and it spends the board\'s best-proportioned group (7 hulls, spread 1.06x, every '
          + 'hull within 5% of its scale) to do it. Left UNMET on purpose. per-unit-art-log.md.',
    });
  }

  // §2.3 Aegis Cruiser: "explicitly no barrel".
  {
    const a = barrelRun(bs('aegis')), d = barrelRun(bs('destroyer'));
    // the same runs WITHOUT the isolation test, to show what colour alone says
    const naive = (f) => {
      let best = 0;
      for (let y = 0; y < Math.floor(f.h * 0.62); y++) {
        let cur = 0;
        for (let x = 0; x < f.w; x++) {
          const d2 = OP(f, x, y) && C(f, x, y).v <= 0.22 && C(f, x, y).s <= 0.45;
          cur = d2 ? cur + 1 : 0;
          if (cur > best) best = cur;
        }
      }
      return best;
    };
    const na = naive(bs('aegis')), nd = naive(bs('destroyer'));
    rows.push({
      unit: 'aegis', clause: 'explicitly NO barrel',
      ok: a === 0, measured: a, want: '0 px of barrel',
      note: `longest vertically-isolated dark bar on her superstructure ${a} px, against the `
          + `Destroyer's ${d} px on the same detector — the live positive control, and it is `
          + 'her `barrel(L*0.66, 0, 6.2, 9, 3.0)` call, which the Aegis block does not have. '
          + '"Isolated" = daylight or a >= 0.34 value step 2 rows above and 3 rows below over '
          + `>= 75% of the run. Colour alone is worthless here: the plain longest dark run over `
          + `the same band reads the Aegis at ${na} and the Destroyer at ${nd}, i.e. it says the `
          + 'missile cruiser is the more heavily gunned of the two.',
    });
  }

  // §2.3 Aircraft Carrier: "3 visible parked airframes".
  {
    const f = bs('carrier');
    const pale = comps(f, (c) => c.v >= 0.60 && c.s <= 0.22, true)
      .filter((c) => c.n >= 20 && c.n <= 60 && c.w >= 6 && c.w <= 16 && c.h >= 3 && c.h <= 8);
    rows.push({
      unit: 'carrier', clause: '3 visible parked airframes',
      ok: pale.length === 3, measured: pale.length, want: 'exactly 3',
      note: `pale (v >= 0.60, s <= 0.22) 8-connected blobs of 20-60 px measuring 6-16 x 3-8 — `
          + `found ${pale.map((c) => c.w + 'x' + c.h).join(', ')}, evenly spaced along the deck. `
          + 'The size window is what separates them from the deck furniture: the dashed '
          + 'centreline\'s nine `#d9dde2` dashes are 6-7 x 1-3 and fall under the area bar, the '
          + 'island and the bow wave are 66 and 375 px and sit over it. The count is 3 at all '
          + 'four bearings that present the deck (octants 1/3/5/7); the four quarter bearings '
          + 'add island and wake fragments to the same window, which is why this is read at '
          + 'the broadside.',
    });
  }

  // §2.3 Dolphin: "no orthogonal edges anywhere" / §2.4 Squid: "zero straight
  // edges". One measurement, both rows, over ALL EIGHT bearings — the Dolphin's
  // detached-eye bug showed at octants 3/4/5 and NOT at her broadside 7.
  {
    const MACH = ['destroyer', 'aegis', 'carrier', 'dread', 'lcraft', 'sub', 'seascorp', 'apc'];
    const machine = MACH.map((k) => straightEdge(bs(k))).sort((a, b) => a - b);
    const med = machine[machine.length >> 1];
    for (const k of ['dolphin', 'squid']) {
      let worst = 0, at = 0;
      for (let o = 0; o < 8; o++) {
        const f = ctx.byUnitOct(k, o);
        if (!f || !f.rgba) continue;
        const s = straightEdge(f);
        if (s > worst) { worst = s; at = o; }
      }
      rows.push({
        unit: k,
        clause: k === 'dolphin' ? 'no orthogonal edges anywhere' : 'zero straight edges',
        ok: worst <= 10, measured: worst, want: '<= 10 px',
        note: `${worst} px, the longest CORNER-ANCHORED flat silhouette run over all EIGHT `
            + `bearings (worst at octant ${at}; the broadside alone would miss it — the `
            + 'Dolphin\'s detached-eye bug showed at octants 3/4/5 and not at her broadside 7). '
            + 'Both ends of a run must step >= 2 px onto a REAL neighbour, so a raster curve\'s '
            + 'apex and a taper off the end of the sprite do not count; without that test the '
            + 'Dolphin\'s belly scores 19 and the boxy Landing Craft 13 and the measurement is '
            + `upside down. §2 asks for ZERO, which no raster can give; 10 px is this file's `
            + `reading, set against the eight machine hulls of MACH, which measure `
            + `${machine[0]}-${machine[machine.length - 1]} with a median of ${med} at their `
            + 'broadside. Looked at: what remains is ONE SEGMENT of the plan polyline that '
            + 'approximates each animal (the Squid\'s 8-point `MANT` mantle at her shoulder, '
            + 'the Dolphin\'s 7-point `DOL` profile), projected nearly flat — not a drawn '
            + 'rectangle. A detached blob would score its own full width here, which is how a '
            + 'repeat of the eye bug gets caught rather than found by eye a second time.',
      });
    }
  }

  // §2.3 Landing Craft: "visible cargo when loaded".
  // The bake carries ONE state and it is the loaded one — `bakeShip` draws the
  // two crates and the vehicle block unconditionally — so the only sprite that
  // exists is the one this row is about.
  {
    const f = bs('lcraft');
    const well = comps(f, (c) => c.v <= 0.26, true)[0] || { x0: 0, y0: 0, x1: -1, y1: -1, w: 0, h: 0 };
    // Every condition is applied PER BLOCK and the reported number is the area
    // that survives all of them, so the measurement moves the same way as the
    // verdict. It was not written that way first: with the value step taken as
    // a MEAN over the surviving blocks, a build with the four cargo `box()`
    // calls disabled still reported 55 px (the well's five deck ribs, 0.8-wide
    // `#4d5347` strokes — mid-value and inside the well exactly as a crate is)
    // and failed only on the mean. A row whose number says 55 against a bar of
    // 16 and reads FAIL is a row nobody can act on.
    const cargo = comps(f, (c) => c.v >= 0.30 && c.v <= 0.66, true).filter((c) =>
      c.n >= 8 && Math.min(c.w, c.h) >= 3 && c.ringV <= 0.26 && c.v - c.ringV >= 0.12
      && c.x0 >= well.x0 - 1 && c.x1 <= well.x1 + 1 && c.y0 >= well.y0 - 1 && c.y1 <= well.y1 + 1);
    const area = cargo.reduce((s, c) => s + c.n, 0);
    const step = cargo.length ? cargo.reduce((s, c) => s + (c.v - c.ringV), 0) / cargo.length : 0;
    rows.push({
      unit: 'lcraft', clause: 'visible cargo when loaded',
      ok: area >= 16, measured: area,
      want: '>= 16 px of block >= 3 px thick standing >= 0.12 in value out of the well',
      note: `${cargo.length} block(s) `
          + `${cargo.map((c) => c.w + 'x' + c.h).join(', ') || '-'}, ${area} px, mean value step `
          + `${R(step, 3)} — blocks of mid value (0.30-0.66) at least 3 px thick standing inside `
          + `the well — the largest dark `
          + `(v <= 0.26) component, ${well.w}x${well.h} — with a ring mean of <= 0.26, i.e. `
          + 'surrounded by well floor rather than by hull. The row states no number; 16 px and '
          + '0.12 are this file\'s reading of "visible" (0.12 is roughly the step at which two '
          + 'greys separate at 1:1) — the well measures 0.19 and the crate faces 0.34, so the '
          + 'read is a value step and not a hue one. `bakeShip` draws the crates and the '
          + 'vehicle block UNCONDITIONALLY, so the only Landing Craft sprite that exists is the '
          + 'loaded one and "when loaded" is the whole of it. Proven against a build with those '
          + 'four `box()` calls disabled: this row goes to 0 there.',
    });
  }

  // §2.4 Amphibious Transport: "deck cavity visible as a house-hued interior".
  // The defect this replaces was the well painted `#1d201a`, value 0.11 — the
  // DARKEST thing on the craft — so the discriminating quantity is a house-hued
  // BLOCK sitting in a dark rim, below the bridge roof.
  {
    const f = bs('apc');
    const blocks = comps(f, OWN, true).filter((c) =>
      c.h >= 2 && c.n >= 6 && c.ringV <= c.v - 0.35
      && c.x0 > 0 && c.y0 > 0 && c.x1 < f.w - 1 && c.y1 < f.h - 1);
    // the topmost such block is the BRIDGE ROOF, which §2.4 names separately as
    // trim; the cavity is the next one down.
    const sorted = blocks.slice().sort((a, b) => a.y0 - b.y0 || b.n - a.n);
    const roof = sorted[0];
    // the LARGEST block that is not the roof, so the pick does not depend on
    // the order two equal-y fragments happen to come back in
    const cav = blocks.filter((c) => c !== roof).sort((a, b) => b.n - a.n)[0] || null;
    rows.push({
      unit: 'apc', clause: 'deck cavity visible as a house-hued interior',
      ok: !!cav && cav.n >= 12, measured: cav ? cav.n : 0, want: '>= 12 px',
      note: cav
        ? `interior house-hued BLOCKS (h >= 2 px, ring >= 0.35 value darker, not touching the `
          + `outline): ${blocks.length} — the topmost is the bridge roof (${sorted[0].w}x`
          + `${roof.h} at row ${roof.y0}, trim, named separately in §2.4) and the cavity floor `
          + `is the largest of the rest, ${cav.w}x${cav.h} = ${cav.n} px at row ${cav.y0}, value `
          + `${R(cav.v, 2)} inside a coaming at ${R(cav.ringV, 2)}. The h >= 2 test is what keeps the two rubbing strakes out: `
          + 'they are 42x1 and 11x1, stripes not blocks. The row states no number; 12 px is '
          + 'this file\'s reading. Before the 2026-09-05 fix this measured 0 — the floor was '
          + 'black and only the roof qualified — so the check is not made true by its own fix.'
        : 'no interior house-hued block found — the cavity is not house-hued',
    });
  }

  // §2.4 Typhoon: "conning tower the only vertical mass".
  {
    const f = bs('sub');
    const tops = [];
    for (let x = 0; x < f.w; x++) {
      let t = -1;
      for (let y = 0; y < f.h; y++) if (OP(f, x, y)) { t = y; break; }
      tops.push(t);
    }
    const on = tops.filter((t) => t >= 0).slice().sort((a, b) => a - b);
    const deck = on[on.length >> 1];                      // median top = the casing line
    // 3.64 px is `SPIKE_FLOOR` in art-metrics.js: 2 px at ZMIN 0.55. Anything
    // shorter is not a vertical MASS at the zoom the renderer has to survive.
    const cut = deck - 3.64;
    let runs = 0, cols = 0, prev = false;
    for (const t of tops) {
      const up = t >= 0 && t <= cut;
      if (up) { cols++; if (!prev) runs++; }
      prev = up;
    }
    rows.push({
      unit: 'sub', clause: 'conning tower the only vertical mass',
      ok: runs === 1, measured: runs, want: 'exactly 1',
      note: `columns standing more than 3.64 px above the casing line (median column top `
          + `y=${deck}) form ${runs} run(s) covering ${cols} of ${f.w} columns — the sail, `
          + 'periscopes included, and nothing else. 3.64 px is not invented: it is '
          + '`art-metrics.js`\'s own SPIKE_FLOOR, 2 px at ZMIN 0.55, i.e. the height at which '
          + 'a mass still reads at furthest zoom. The casing step forward stands 2 px and is '
          + 'correctly NOT counted as a second mass.',
    });
  }

  // §2.4 Sea Scorpion: "shortest armed hull afloat".
  {
    const hulls = ['destroyer', 'aegis', 'carrier', 'dread', 'seascorp', 'sub'];
    const lens = hulls.map((k) => [k, W(k)]).sort((a, b) => a[1] - b[1]);
    const ok = lens[0][0] === 'seascorp';
    rows.push({
      unit: 'seascorp', clause: 'shortest armed hull afloat',
      ok, measured: R(lens[1][1] / lens[0][1], 3), want: '> 1.00x the next hull',
      note: `armed hulls broadside: ${lens.map((p) => p[0] + ' ' + p[1]).join(', ')} — she is `
          + `${R(lens[1][1] / lens[0][1], 2)}x clear of the next. EXCLUDED and why: the Dolphin `
          + `(${W('dolphin')} px) and the Giant Squid (${W('squid')} px) are armed but are `
          + 'ANIMALS, and §2.3/§2.4 give both a row saying their outline is not a machine, so '
          + 'neither is a hull; the Landing Craft and the Amphibious Transport are hulls but '
          + 'carry no weapon. Reading "armed hull" as "armed warship" is the only one on which '
          + 'the sentence has content — under any other the Dolphin wins it.',
    });
  }

  // ══ AIR ═══════════════════════════════════════════════════════════════

  // §2.3 Nighthawk: "fuselage height <= 0.35 x length".
  // The rotor is a translucent blur disc and the mask counts it as body, so a
  // bbox measurement of "the fuselage" is a measurement of the disc. Alpha
  // separates them and the histogram says where: 655 of the 1320 px in the
  // bbox sit under alpha 128 (the disc), 573 over 224 (the airframe), and only
  // 92 in between — a clean valley. The cut is taken at 192, inside it.
  {
    const f = bs('nighthawk');
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, solid = 0, blur = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!OP(f, x, y)) continue;
      if (AL(f, x, y) >= 192) {
        solid++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      } else if (AL(f, x, y) < 128) blur++;
    }
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
    rows.push({
      unit: 'nighthawk', clause: 'fuselage height <= 0.35 x length',
      ok: fh / fw <= 0.35, measured: R(fh / fw, 3), want: '<= 0.35',
      note: `airframe ${fw}x${fh} px, isolated as the pixels at alpha >= 192 (${solid} of them) `
          + `against the rotor's ${blur} px under alpha 128; the whole bbox is ${f.w}x${f.h} and `
          + `would read ${R(f.h / f.w, 3)}, i.e. the disc and not the fuselage. Taking it off `
          + 'the bbox instead is the same class of error as measuring a ship\'s aspect through '
          + 'her bow wave.',
    });
  }

  // §2.3 Harrier: "wing span >= 1.5x fuselage width".
  // Both quantities are PLAN cross-axis lengths, so they must be read on a
  // screen axis that carries the sideways plan axis and nothing else. At face
  // 4 (octant 1) `fx = ISO_X*(cos a - sin a) = 0` for a = 45 degrees: screen X
  // is PURE sideways there, and — unlike screen Y at any bearing — it cannot
  // pick up the airframe's vertical thickness. So the ratio measured in screen
  // X at octant 1 is the plan ratio exactly, whatever the projection does.
  {
    const f = ctx.byUnitOct('harrier', 1) || bs('harrier');
    const e = rowExtents(f);
    const span = Math.max(...e);
    const valleys = [];
    for (let y = 0; y < f.h; y++) {
      if (e[y] < 4) continue;
      const up = Math.max(0, ...e.slice(0, y)), dn = Math.max(0, ...e.slice(y + 1));
      if (up >= 1.8 * e[y] && dn >= 1.8 * e[y]) valleys.push(e[y]);
    }
    const fus = valleys.length ? Math.min(...valleys) : 0;
    rows.push({
      unit: 'harrier', clause: 'wing span >= 1.5x fuselage width',
      ok: fus > 0 && span / fus >= 1.5, measured: fus ? R(span / fus, 2) : 0, want: '>= 1.50x',
      note: `at octant 1 (nose-on, the max-span bearing) the row-extent profile is fin 2 px, `
          + `tailplanes 22, FUSELAGE ${fus}, wing ${span} — the fuselage is the strict valley `
          + 'between the two lifting surfaces, defined as a row whose extent is beaten 1.8x on '
          + 'both sides. It agrees with the geometry to 5%: `bodyR` 2.35 gives a 4.7-unit '
          + 'fuselage under a 26.8-unit span = 5.70, measured 6.0. Octant 5 is the same bearing '
          + 'reversed and exposes no valley (the near wing overlaps the waist), which is why '
          + 'this is read at 1 rather than at whichever octant is widest.',
    });
  }

  // §2.3 Harrier: "nose cone >= 4 px".
  {
    let best = 0, oct = 0;
    for (const o of [3, 7]) {
      const f = ctx.byUnitOct('harrier', o);
      if (!f || !f.rgba) continue;
      // at faces 12 and 28 `py = 0`: forward is PURE screen X, so a cone's
      // length along the fuselage axis IS its width in pixels.
      // the nose is the near-white blob nearest an END of the sprite; the two
      // Maverick bodies (#e8ecf2) are the other near-white on the jet and sit
      // amidships under the wings.
      const white = comps(f, (c) => c.v >= 0.92 && c.s <= 0.12, true).filter((c) => c.n >= 6);
      let nose = null;
      for (const c of white) {
        const d = Math.min(c.x0, f.w - 1 - c.x1);
        if (!nose || d < nose.d) nose = { d, c };
      }
      if (nose && nose.c.w > best) { best = nose.c.w; oct = o; }
    }
    rows.push({
      unit: 'harrier', clause: 'nose cone >= 4 px',
      ok: best >= 4, measured: best, want: '>= 4 px',
      note: `the forward-most near-white (v >= 0.92, s <= 0.12) blob at octant ${oct}, measured `
          + 'along the fuselage axis — which is screen X at octants 3 and 7, where `py = 0` and '
          + 'forward is pure X. v >= 0.92 is the cut that separates `NOSE` #eef1f5 (0.96) from '
          + 'the `BELLY` #d5dae2 (0.886) it sits against. IT PASSES BY NOTHING: 4 px against a '
          + '4 px bar, and it is 5 only if the cut is dropped to 0.88, where the belly starts '
          + 'joining in. Left alone deliberately — the `else` branch that draws this nose is '
          + 'SHARED with the Hornet (only the Kirov splits off it), and the Hornet\'s own row '
          + 'is a "no more detail" maximum, so lengthening the cone is not a Harrier-only edit. '
          + 'Recorded in per-unit-art-log.md rather than chased.',
    });
  }

  // §2.3 Hornet: "do not add detail it cannot carry".
  // A maximum, not a floor — so it is measured against the aircraft that DO
  // have room. A "feature" is a connected region of one quantised colour of
  // >= 3 px: what a player could resolve as a separate part.
  {
    const featureCount = (f) => {
      const q = (v) => Math.round(v / 28) * 28;
      const seen = new Uint8Array(f.w * f.h);
      let n = 0, opaque = 0;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        if (!OP(f, x, y)) continue;
        opaque++;
        const i = y * f.w + x;
        if (seen[i]) continue;
        const j = i * 4;
        const key = q(f.rgba[j]) + ',' + q(f.rgba[j + 1]) + ',' + q(f.rgba[j + 2]);
        const st = [[x, y]]; seen[i] = 1; let c = 0;
        while (st.length) {
          const p = st.pop();
          c++;
          for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = p[0] + d[0], ny = p[1] + d[1], ni = ny * f.w + nx;
            if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h || seen[ni] || !OP(f, nx, ny)) continue;
            const jj = ni * 4;
            if (q(f.rgba[jj]) + ',' + q(f.rgba[jj + 1]) + ',' + q(f.rgba[jj + 2]) !== key) continue;
            seen[ni] = 1; st.push([nx, ny]);
          }
        }
        if (c >= 3) n++;
      }
      return { n, opaque, per100: n / opaque * 100 };
    };
    const h = featureCount(bs('hornet'));
    const peers = ['harrier', 'nighthawk', 'kirov'].map((k) => [k, featureCount(bs(k))]);
    const worst = Math.max(...peers.map((p) => p[1].per100));
    rows.push({
      unit: 'hornet', clause: 'do not add detail it cannot carry',
      ok: h.n === Math.min(h.n, ...peers.map((p) => p[1].n)) && h.per100 <= worst,
      measured: h.n, want: 'fewest of the four aircraft, and no denser per px than a peer',
      note: `${h.n} resolvable features on ${h.opaque} opaque px = ${R(h.per100, 1)} per 100 px, `
          + `against `
          + peers.map((p) => `${p[0]} ${p[1].n} (${R(p[1].per100, 1)}/100px)`).join(', ')
          + '. The row states no number and is a MAXIMUM, so it is read comparatively: the '
          + 'smallest airframe must carry the fewest parts outright AND must not be denser per '
          + 'pixel than an aircraft with room to spare. A feature is a 4-connected run of one '
          + 'colour quantised to 28 levels, >= 3 px — anything smaller is anti-aliasing.',
    });
  }

  // §2.4 Kirov: "span >= 2.0x the Harrier's ON SCREEN".
  {
    const r = W('kirov') / W('harrier');
    rows.push({
      unit: 'kirov', clause: "span >= 2.0x the Harrier's on screen",
      ok: r >= 2.0, measured: R(r, 3), want: '>= 2.00x',
      note: `Kirov ${W('kirov')} px broadside against the Harrier's ${W('harrier')}. "On screen" `
          + 'is now literal: the 1.30 that used to multiply the Kirov at draw time is inside '
          + '`VSC` and therefore inside the bake, so the sprite measured here is the sprite '
          + `drawn. RA2's own ratio is [ZEP] 139 / [ORCA] 71 = ${R(139 / 71, 2)}, which this `
          + 'sits above — and the Harrier grew 52 -> 60 px in the 2026-09-05 size pass, so the '
          + 'ratio came DOWN toward RA2 rather than up.',
    });
  }

  // §2.4 Kirov: "the existing 1.3x draw scale is a symptom of the bake being
  // too small". Not a pixel budget — a claim about the BAKE, and it is
  // checkable against RA2's own number: [ZEP] is 139 px on RA2's 60x30 cell
  // and ours is a 64x32 cell, so the faithful bake is 139 * 64/60 = 148 px.
  {
    const want = 139 * 64 / 60;
    const r = W('kirov') / want;
    rows.push({
      unit: 'kirov', clause: 'the bake is no longer too small (the 1.3x draw fudge)',
      ok: r >= 0.85 && r <= 1.15, measured: R(r, 3), want: '0.85-1.15 of RA2',
      note: `baked ${W('kirov')} px broadside against [ZEP]'s 139 px scaled by our tile ratio `
          + `64/60 = ${R(want, 0)} px — ${R(r, 3)} of reference, and the largest airframe in the `
          + 'game is no longer the one sprite on the field going through a bilinear upscale. '
          + '+-15% is this file\'s reading; the row states no number. It is deliberately '
          + 'tighter than `RA2_SIZE_BAND` (0.25), because that band is measured against a GROUP '
          + 'median and this row names an absolute.',
    });
  }

  // ── Nighthawk — "rotor span >= 1.25x fuselage length" [STRUCK] ─────────
  //
  // The sixteenth clause, and the only STRUCK one in §2. It is not measured
  // against the ART, because the row makes its own bar unreachable; what is
  // measured is THE STRIKE ITSELF, so the contradiction cannot quietly stop
  // being true while a permanently excused clause sits in the reference.
  //
  // THE PROOF, in three steps a reader can check:
  //
  //   1. The camera. `rts.html` sets `TW = 64, TH = 32` — a 2:1 diamond — so
  //      the screen-space projection of a circle lying in the ground plane is
  //      an ellipse of aspect (TW/2)/(TH/2) = 2.00 exactly. Both numbers are
  //      read out of the source below, not assumed.
  //   2. The rotor IS such a circle. The bake draws the disc as
  //      `rx = mrR * ISO_X * 1.4142, ry = mrR * ISO_Y * 1.4142`, and
  //      `ISO_Y / ISO_X = (TH/2)/(TW/2)`, so ry/rx = 1/2: a rotor of screen
  //      span S is exactly S/2 tall. Also read out of the source.
  //   3. Therefore span >= 1.25L forces height >= 0.625L, which caps
  //      length-over-height at 1/0.625 = 1.60 and width-over-height at
  //      S/(S/2) = 2.00. The SAME §2 row calls this airframe "the flattest"
  //      at [SHAD]'s 64x21 = 3.05. 1.60 < 3.05 and 2.00 < 3.05: the two
  //      clauses on the row cannot both be satisfied, under either reading of
  //      aspect.
  //
  // RA2 escapes the contradiction because its rotor is 1-2 px blade LINES,
  // which add span without adding a filled disc. Ours is a blur disc on
  // purpose — at alpha .09 the old one was ~1400 px three luminance points
  // off the grass, invisible to a player and counted as body by every mask
  // metric — and it is shipped knowingly at 0.84L. If either premise ever
  // changes (a camera that is not 2:1, or a rotor no longer drawn in the
  // ground plane) this row goes RED and the strike has to be re-argued.
  {
    const src = SRC();
    const tw = num(src, /var TW = (\d+(?:\.\d+)?), TH = (\d+(?:\.\d+)?);/, 1);
    const th = num(src, /var TW = (\d+(?:\.\d+)?), TH = (\d+(?:\.\d+)?);/, 2);
    // the disc drawn in the ground plane, off the same two ISO scalars
    const ground = /var rx = mrR \* ISO_X \* 1\.4142, ry = mrR \* ISO_Y \* 1\.4142;/.test(src)
                && /var ISO_X = TW \/ 2 \/ Math\.hypot\(TW \/ 2, TH \/ 2\);/.test(src)
                && /var ISO_Y = TH \/ 2 \/ Math\.hypot\(TW \/ 2, TH \/ 2\);/.test(src);
    const iso = tw && th ? (tw / 2) / (th / 2) : 0;      // ground circle -> ellipse aspect
    const SPAN = 1.25;                                    // the struck clause's own bar
    const hOverL = SPAN / iso;                            // 0.625 L of height, minimum
    const capL = hOverL ? 1 / hOverL : 0;                 // length / height ceiling  = 1.60
    const capW = iso;                                     // width  / height ceiling  = 2.00
    const rowAsp = (ctx.units.nighthawk || {}).ra2Aspect || 0;   // [SHAD] 64x21 = 3.05
    const holds = !!(ground && iso > 0 && rowAsp > 0 && capL < rowAsp && capW < rowAsp);
    rows.push({
      unit: 'nighthawk', clause: 'rotor span >= 1.25x fuselage length', struck: true,
      ok: holds, measured: R(capL, 2) + ' / ' + R(capW, 2), want: 'both below ' + R(rowAsp, 2),
      note: 'STRUCK from §2.3 — the check is of the STRIKE, not of the art. The tile is '
          + `${tw}x${th}, so a ground circle projects at aspect ${R(iso, 2)}; the rotor is drawn `
          + `in that plane (ry/rx = ISO_Y/ISO_X, source-verified: ${ground}), so a span of S is `
          + `S/${R(iso, 2)} tall. Span >= ${SPAN}L therefore forces height >= ${R(hOverL, 3)}L, `
          + `capping length/height at ${R(capL, 2)} and width/height at ${R(capW, 2)} — against `
          + `the ${R(rowAsp, 2)} the SAME ROW demands ([SHAD] 64x21, "the flattest airframe"). `
          + 'The two clauses are mutually exclusive; the span one is struck through in '
          + 'unit-identity-reference.md §2.3 and in docs/clause-inventory.md, and the disc ships '
          + 'knowingly at 0.84L. This row goes red if the camera stops being 2:1 or the disc '
          + 'stops being a ground-plane circle — i.e. if the contradiction ever dissolves.',
    });
  }

  return rows;
};
