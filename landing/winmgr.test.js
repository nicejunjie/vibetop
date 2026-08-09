/* Unit tests for winmgr.js — pure floating-window geometry.
 * `node --test landing/winmgr.test.js` (part of run-tests.sh). */
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("./winmgr.js");

const BOX = { w: 1400, h: 800 };

test("clampGeom keeps a window inside the box", () => {
  assert.deepEqual(W.clampGeom({ left: -50, top: -20, width: 400, height: 300 }, BOX),
                   { left: 0, top: 0, width: 400, height: 300 });
  // pushed past the right/bottom edge → snapped back so it stays fully visible
  assert.deepEqual(W.clampGeom({ left: 1300, top: 700, width: 400, height: 300 }, BOX),
                   { left: 1000, top: 500, width: 400, height: 300 });
});

test("clampGeom enforces the minimum size and caps at the box", () => {
  assert.deepEqual(W.clampGeom({ left: 0, top: 0, width: 10, height: 10 }, BOX),
                   { left: 0, top: 0, width: W.MINW, height: W.MINH });
  const g = W.clampGeom({ left: 0, top: 0, width: 9999, height: 9999 }, BOX);
  assert.equal(g.width, BOX.w); assert.equal(g.height, BOX.h);
});

test("resizeGeom: east/south grow width/height, left/top fixed", () => {
  const g = { left: 100, top: 100, width: 400, height: 300 };
  assert.deepEqual(W.resizeGeom(g, "se", 50, 40, BOX),
                   { left: 100, top: 100, width: 450, height: 340 });
});

test("resizeGeom: west/north move the left/top edge", () => {
  const g = { left: 200, top: 200, width: 400, height: 300 };
  // drag the NW corner up-left by (-30,-20): left/top move, size grows
  assert.deepEqual(W.resizeGeom(g, "nw", -30, -20, BOX),
                   { left: 170, top: 180, width: 430, height: 320 });
});

test("resizeGeom: shrinking past min pins the moving edge", () => {
  const g = { left: 200, top: 100, width: 400, height: 300 };
  // drag west edge right far enough to hit MINW; left must not overshoot the right edge
  const r = W.resizeGeom(g, "w", 999, 0, BOX);
  assert.equal(r.width, W.MINW);
  assert.equal(r.left, 200 + 400 - W.MINW);   // right edge (600) stays put
});

test("defaultGeom cascades and fits inside the box", () => {
  const a = W.defaultGeom(BOX, 0), b = W.defaultGeom(BOX, 1);
  assert.ok(b.left > a.left && b.top > a.top, "each window offset from the last");
  for (const g of [a, b, W.defaultGeom(BOX, 5)]) {
    assert.ok(g.left >= 0 && g.top >= 0);
    assert.ok(g.left + g.width <= BOX.w && g.top + g.height <= BOX.h, "stays fully on-screen");
  }
});

test("snapTarget: left/right edges snap to halves; top and middle are free", () => {
  assert.deepEqual(W.snapTarget(5, 400, BOX), { left: 0, top: 0, width: 700, height: 800 });      // left half
  assert.deepEqual(W.snapTarget(1398, 400, BOX), { left: 700, top: 0, width: 700, height: 800 }); // right half
  assert.equal(W.snapTarget(700, 5, BOX), null);      // top no longer maximizes (use the ▢ button)
  assert.equal(W.snapTarget(700, 400, BOX), null);    // middle → free move
});

test("tileGrid: 2 windows = side-by-side halves, no gap", () => {
  const g = W.tileGrid(2, BOX);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { left: 0, top: 0, width: 700, height: 800 });
  assert.deepEqual(g[1], { left: 700, top: 0, width: 700, height: 800 });
});

test("tileGrid: 4 windows = 2×2 quadrants covering the box", () => {
  const g = W.tileGrid(4, BOX);
  assert.equal(g.length, 4);
  assert.deepEqual(g[0], { left: 0, top: 0, width: 700, height: 400 });
  assert.deepEqual(g[3], { left: 700, top: 400, width: 700, height: 400 });
});

test("tileGrid: 3 windows = two halves over one full-width row", () => {
  const g = W.tileGrid(3, BOX);
  assert.equal(g.length, 3);
  assert.equal(g[0].width, 700); assert.equal(g[1].left, 700);   // top row: two halves
  assert.deepEqual(g[2], { left: 0, top: 400, width: 1400, height: 400 });  // bottom: full width
});

test("tileGrid: 1 window fills the box; 0 → empty", () => {
  assert.deepEqual(W.tileGrid(1, BOX), [{ left: 0, top: 0, width: 1400, height: 800 }]);
  assert.deepEqual(W.tileGrid(0, BOX), []);
});
