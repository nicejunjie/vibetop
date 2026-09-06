/**
 * A worked TEMPLATE for §2 clause checks, and a real one — the G.I.'s row.
 *
 * A module exports `check(ctx)` and returns one row per clause:
 *   { unit, clause, ok, measured, want, note }
 *
 * `ctx.byUnitOct(key, oct)` hands back one baked bearing as
 * `{ w, h, mask, rgba }` — mask is one byte per bbox pixel (0/1), rgba is four.
 * `ctx.broadsideOct(key)` is the bearing the aspect and size gates read.
 *
 * THE TRAP THIS FILE EXISTS TO DOCUMENT: the bbox includes the unit's CONTACT
 * SHADOW, and the anchor is not `h - UPAD`, so a band computed from the drawing
 * coordinates lands in the wrong place. Read bands off the bake as a fraction
 * of the MEASURED bbox, the way `band()` does below, and say which convention
 * you used — two passes measuring "the torso" with different bands got 26.0%
 * and 21.1% for the same Engineer.
 */
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

/** Every opaque pixel between two fractions of the bbox height. */
function band(f, f0, f1) {
  const out = [], y0 = Math.floor(f.h * f0), y1 = Math.ceil(f.h * f1);
  for (let y = y0; y < Math.min(y1, f.h); y++) for (let x = 0; x < f.w; x++) {
    const i = y * f.w + x;
    if (!f.mask[i]) continue;
    const j = i * 4;
    if (f.rgba[j + 3] <= 8) continue;
    out.push(hsv(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]));
  }
  return out;
}
const mean = (a, k) => (a.length ? a.reduce((s, p) => s + p[k], 0) / a.length : 0);

exports.check = function (ctx) {
  const rows = [];
  const gi = ctx.byUnitOct('rifle', ctx.broadsideOct('rifle'));
  const con = ctx.byUnitOct('conscript', ctx.broadsideOct('conscript'));
  if (!gi || !gi.rgba) return rows;

  // "helmet >= 5x3 in a value distinct from both torso and legs"
  // The helmet is the DESATURATED mass in the top fifth; the torso is the
  // owner-hued mass below it. Distinctness is judged on VALUE, as the row says.
  const helm = band(gi, 0, 0.22).filter((p) => p.s < 0.22);
  const torso = band(gi, 0.24, 0.52).filter((p) => p.s > 0.30);
  const legs = band(gi, 0.62, 0.92);
  const vH = mean(helm, 'v'), vT = mean(torso, 'v'), vL = mean(legs, 'v');
  const gap = Math.min(Math.abs(vH - vT), Math.abs(vH - vL));
  rows.push({
    unit: 'rifle', clause: 'helmet in a value distinct from both torso and legs',
    ok: gap >= 0.10, measured: ctx.round(gap, 3), want: '>= 0.10 value',
    note: `helmet ${ctx.round(vH, 3)}, torso ${ctx.round(vT, 3)}, legs ${ctx.round(vL, 3)}`
        + ' — 0.10 is this file\'s reading of "distinct"; the row states no number',
  });

  // "legs must read olive, not tan — the only thing separating him from a
  // Conscript", against the Conscript's own "legs tan/brown, >= 20 hue-degrees
  // off the GI's olive". One clause measured from BOTH rows at once.
  if (con && con.rgba) {
    const cl = band(con, 0.62, 0.92).filter((p) => p.s > 0.18);
    const gl = legs.filter((p) => p.s > 0.18);
    const hG = mean(gl, 'h'), hC = mean(cl, 'h');
    let d = Math.abs(hG - hC); if (d > 180) d = 360 - d;
    rows.push({
      unit: 'rifle', clause: "legs read olive, >= 20 hue-degrees off the Conscript's tan",
      ok: d >= 20, measured: ctx.round(d, 1), want: '>= 20 degrees',
      note: `GI legs hue ${ctx.round(hG, 0)}, Conscript legs hue ${ctx.round(hC, 0)}`,
    });
  }
  return rows;
};
