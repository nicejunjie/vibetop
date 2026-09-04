'use strict';
// The resize rings vs the tiled seam — the coupling that had no test.
//
// Two tiled windows are separated by a seam of `VibeWin.MARGIN / 2` px. Each
// window's resize ring reaches some distance OUTSIDE its own box so the seam is
// grabbable at all (bare #frames underneath is not). Those two numbers live in
// different files and nothing tied them together, so when MARGIN was tuned
// 20 -> 12 -> 10 (v1.19.201 / v1.19.208) the seam shrank to 5px while the rings
// still reached 10px out: each ring then covered the WHOLE seam plus ~5px INSIDE
// its neighbour, and CSS stacking handed every contested pixel to the higher-z
// window. Dragging the divider resized the wrong window, and the lower window's
// own corner grip hit-tested to its neighbour's opposite corner.
//
// The rule, with b = the window's 1px border and s = MARGIN / 2:
//
//     (r_e - b) + (r_w - b) === s      // no overlap AND no dead pixel
//     r_e - b === ceil(s / 2)          // odd seams give the extra px to e/s
//     r_w - b === floor(s / 2)
//
// This test is the coupling. It reads MARGIN from winmgr.js and the offsets from
// the CSS, so tuning MARGIN again fails here instead of silently breaking the
// divider. It asserts geometry the fix does not define — a ring could satisfy
// every assertion below at many different reaches; only the ones that tile the
// seam exactly pass.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BORDER = 1;                       // .win.floating border-width
const MARGIN = require('./winmgr.js').MARGIN;
const SEAM = MARGIN / 2;                // gapZones puts half a margin between tiles

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// Pull one CSS rule's numeric declarations. Anchored at line start so
// `.win-rz-e, .win-rz-w { cursor: ... }` cannot be mistaken for `.win-rz-e`.
function rule(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('^\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  assert.ok(m, 'no rule found for selector: ' + selector);
  const out = {};
  for (const decl of m[1].split(';')) {
    const d = decl.match(/([a-z-]+)\s*:\s*(-?\d+)px/);
    if (d) out[d[1]] = +d[2];
  }
  return out;
}

// Outside reach per direction, plus the inside reach, for one ring set.
// `base` supplies inherited declarations (the touch rules only override some).
function ring(css, prefix, base) {
  const at = (sel) => Object.assign({}, base && base[sel] || {}, rule(css, prefix + sel));
  const r = { n: at('n'), s: at('s'), e: at('e'), w: at('w'),
              ne: at('ne'), nw: at('nw'), se: at('se'), sw: at('sw') };
  return {
    raw: r,
    out: { n: -r.n.top, s: -r.s.bottom, e: -r.e.right, w: -r.w.left },
    inEdge: { n: r.n.height + r.n.top, s: r.s.height + r.s.bottom,
              e: r.e.width + r.e.right, w: r.w.width + r.w.left },
    inCorner: { ne: r.ne.width + r.ne.right, nw: r.nw.width + r.nw.left,
                se: r.se.width + r.se.right, sw: r.sw.width + r.sw.left },
  };
}

const SETS = (() => {
  const desk = read('desktop.html');
  const dbg = read('diagnostics/rzdbg.html');
  const base = {};
  for (const k of ['n','s','e','w','ne','nw','se','sw']) base[k] = rule(desk, '.win-rz-' + k);
  return [
    { name: 'desktop.html (mouse)', ring: ring(desk, '.win-rz-'), pad: 18 },
    { name: 'desktop.html (touch)', ring: ring(desk, 'body.is-touch .win-rz-', base), pad: 28 },
    { name: 'rzdbg.html replica', ring: ring(dbg, '.rz-'), pad: 18 },
  ];
})();

for (const set of SETS) {
  test('the two rings tile the ' + SEAM + 'px seam exactly — ' + set.name, () => {
    const o = set.ring.out;
    assert.strictEqual((o.e - BORDER) + (o.w - BORDER), SEAM,
      `east+west reach must fill the seam exactly: (${o.e}-1)+(${o.w}-1) != ${SEAM}`);
    assert.strictEqual((o.s - BORDER) + (o.n - BORDER), SEAM,
      `south+north reach must fill the seam exactly: (${o.s}-1)+(${o.n}-1) != ${SEAM}`);
  });

  test('the odd pixel goes to the leading edges — ' + set.name, () => {
    const o = set.ring.out;
    assert.strictEqual(o.e - BORDER, Math.ceil(SEAM / 2), 'east takes ceil(seam/2)');
    assert.strictEqual(o.w - BORDER, Math.floor(SEAM / 2), 'west takes floor(seam/2)');
    assert.strictEqual(o.s - BORDER, Math.ceil(SEAM / 2), 'south takes ceil(seam/2)');
    assert.strictEqual(o.n - BORDER, Math.floor(SEAM / 2), 'north takes floor(seam/2)');
  });

  test('each corner reaches exactly as far as the two edges it joins — ' + set.name, () => {
    const r = set.ring.raw;
    assert.strictEqual(r.ne.top, r.n.top, 'ne/n top');
    assert.strictEqual(r.ne.right, r.e.right, 'ne/e right');
    assert.strictEqual(r.nw.top, r.n.top, 'nw/n top');
    assert.strictEqual(r.nw.left, r.w.left, 'nw/w left');
    assert.strictEqual(r.se.bottom, r.s.bottom, 'se/s bottom');
    assert.strictEqual(r.se.right, r.e.right, 'se/e right');
    assert.strictEqual(r.sw.bottom, r.s.bottom, 'sw/s bottom');
    assert.strictEqual(r.sw.left, r.w.left, 'sw/w left');
  });

  test('the straight edges span the full side, corner reach to corner reach — ' + set.name, () => {
    const r = set.ring.raw;
    // n/s must run the width of the box plus each side's own outside reach, or a
    // pixel of the seam near a corner belongs to nobody.
    assert.strictEqual(r.n.left, r.w.left, 'n starts where w reaches');
    assert.strictEqual(r.n.right, r.e.right, 'n ends where e reaches');
    assert.strictEqual(r.s.left, r.w.left, 's starts where w reaches');
    assert.strictEqual(r.s.right, r.e.right, 's ends where e reaches');
    assert.strictEqual(r.e.top, r.n.top, 'e starts where n reaches');
    assert.strictEqual(r.e.bottom, r.s.bottom, 'e ends where s reaches');
    assert.strictEqual(r.w.top, r.n.top, 'w starts where n reaches');
    assert.strictEqual(r.w.bottom, r.s.bottom, 'w ends where s reaches');
  });

  test('the corner still clears the titlebar controls (v1.19.35 invariant) — ' + set.name, () => {
    for (const [k, v] of Object.entries(set.ring.inCorner)) {
      assert.ok(v < set.pad, `corner ${k} inside reach ${v} must stay under padding-right ${set.pad}`);
    }
  });

  test('the ring is still a usable grab target inside the window — ' + set.name, () => {
    for (const [k, v] of Object.entries(set.ring.inEdge)) {
      assert.ok(v >= 8, `edge ${k} inside reach ${v} must stay >= 8px (mouse-grabbable)`);
    }
  });
}

test('the diagnostic replica matches the shipped ring exactly', () => {
  const a = SETS[0].ring.out, b = SETS[2].ring.out;
  assert.deepStrictEqual(b, a, 'rzdbg.html must mirror desktop.html or it diagnoses nothing');
});
