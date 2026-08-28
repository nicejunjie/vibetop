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

// Was "two halves over one full-width row" — ceil(sqrt(3)) = 2 columns, which
// makes the odd window out twice the area of its neighbours. Reported as "really
// ugly"; three even columns now, wherever they fit.
test("tileGrid: 3 windows = three even columns on a landscape frame", () => {
  const g = W.tileGrid(3, BOX);
  assert.equal(g.length, 3);
  assert.equal(g[0].left, 0);
  assert.equal(g[1].left, 466);
  assert.equal(g[2].left, 932);
  g.forEach((t) => { assert.equal(t.top, 0); assert.equal(t.height, 800); });
  assert.equal(g[0].left + g[0].width, g[1].left);            // no gaps
  assert.equal(g[2].left + g[2].width, BOX.w);               // last column absorbs rounding
});

test("tileGrid: 3 windows STACK on a portrait frame (3 columns would be slivers)", () => {
  const g = W.tileGrid(3, { w: 700, h: 1200 });
  assert.equal(g.length, 3);
  g.forEach((t) => assert.equal(t.left, 0));                  // one column
  assert.equal(g[0].width, 700);
});

test("tileGrid: 3 windows fall back to 2 columns when 3 will not fit at MINW", () => {
  const g = W.tileGrid(3, { w: 800, h: 600 });                // 3*320 = 960 > 800
  assert.ok(g[1].left > 0 && g[1].left < 800);                // still two across
  assert.equal(g[2].left, 0);                                 // third drops to its own row
});

// ---- snap layouts (the ▢ palette) -----------------------------------------

test("layoutGeoms: zones tile the box exactly, with no gaps or overlap", () => {
  for (const key of ["halves", "thirds", "main2", "stacked", "quads", "columns"]) {
    const zs = W.layoutGeoms(key, BOX);
    assert.ok(zs, `${key} should fit a 1400x800 frame`);
    const area = zs.reduce((a, z) => a + z.width * z.height, 0);
    assert.equal(area, BOX.w * BOX.h, `${key} must cover the frame exactly`);
    zs.forEach((z) => {
      assert.ok(z.width >= W.MINW && z.height >= W.MINH, `${key} zone under the minimum`);
      assert.ok(z.left >= 0 && z.top >= 0);
      assert.ok(z.left + z.width <= BOX.w && z.top + z.height <= BOX.h);
    });
  }
});

test("layoutGeoms: returns null rather than slivers when a layout cannot fit", () => {
  assert.equal(W.layoutGeoms("thirds", { w: 800, h: 600 }), null);   // 3*320 > 800
  assert.equal(W.layoutGeoms("quads", { w: 1400, h: 300 }), null);   // half of 300 < MINH
  assert.ok(W.layoutGeoms("halves", { w: 800, h: 600 }));            // this one still fits
});

test("layoutGeoms: zone 0 is the main zone (the one you clicked from)", () => {
  assert.deepEqual(W.layoutGeoms("main2", BOX)[0], { left: 0, top: 0, width: 840, height: 800 });
});

// The zone count must MATCH the window count exactly. Offering a 2-zone layout to
// 3 open windows means the third is silently minimized when you pick it — reported
// as "I have 3 windows open, it shouldn't show 2-window layouts".
test("layoutsFor: one zone per open window, exactly", () => {
  const two = W.layoutsFor(BOX, 2).map((l) => l.key);
  assert.deepEqual(two.sort(), ["halves", "stacked"]);

  const three = W.layoutsFor(BOX, 3).map((l) => l.key);
  assert.deepEqual(three.sort(), ["main2", "thirds"]);
  assert.ok(!three.includes("halves"), "a 2-zone layout would minimize the 3rd window");
  assert.ok(!three.includes("stacked"), "a 2-zone layout would minimize the 3rd window");
  assert.ok(!three.includes("quads"), "a 4-zone layout would leave an empty zone");

  // 1400px fits 4x320 columns, so the 4-window count offers both 4-zone layouts.
  assert.deepEqual(W.layoutsFor(BOX, 4).map((l) => l.key).sort(), ["columns", "quads"]);
  // On a frame too narrow for four columns (4*320 > 1200), Quarters stands alone.
  assert.deepEqual(W.layoutsFor({ w: 1200, h: 800 }, 4).map((l) => l.key), ["quads"]);
});

test("layoutsFor: counts with no matching layout offer nothing at all", () => {
  assert.deepEqual(W.layoutsFor(BOX, 1), []);      // one window has nothing to choose
  assert.deepEqual(W.layoutsFor(BOX, 5), []);      // no 5-zone layout exists
  assert.deepEqual(W.layoutsFor(BOX, 0), []);
});

test("layoutsFor: still drops layouts that do not FIT, even at the right count", () => {
  // 3 windows on a frame too narrow for three 320px columns: thirds is out, and
  // 1+2's right column (0.4 * 800 = 320) is exactly at the minimum, so it stays.
  const narrow3 = W.layoutsFor({ w: 800, h: 600 }, 3).map((l) => l.key);
  assert.ok(!narrow3.includes("thirds"), "thirds needs 3*MINW");
  // A frame too short for stacked halves offers nothing for 2 windows.
  assert.deepEqual(W.layoutsFor({ w: 700, h: 380 }, 2).map((l) => l.key), ["halves"]);
});

test("tileGrid: 1 window fills the box; 0 → empty", () => {
  assert.deepEqual(W.tileGrid(1, BOX), [{ left: 0, top: 0, width: 1400, height: 800 }]);
  assert.deepEqual(W.tileGrid(0, BOX), []);
});

test("tileGrid: 2 windows on a PORTRAIT box stack instead of becoming slivers", () => {
  const portrait = { w: 656, h: 851 };            // iPad (gen 11) in portrait
  const g = W.tileGrid(2, portrait);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { left: 0, top: 0, width: 656, height: 425 });
  assert.deepEqual(g[1], { left: 0, top: 425, width: 656, height: 426 });
  // Side by side there would be 328px columns — under the 320 minimum once the
  // Tidy gutter is taken off, i.e. unresizable slivers.
  for (const t of g) assert.ok(t.width >= W.MINW && t.height >= W.MINH);
});

test("tileGrid: never asks for more columns than the box fits at MINW", () => {
  // A 656px-wide iPad in portrait fits exactly 2 minimum-width columns. The old
  // ceil(sqrt(5)) = 3 columns produced 218px tiles that the caller clamped up to
  // 320 — overlapping windows whose controls hit-tested to a neighbour.
  for (const box of [{ w: 656, h: 851 }, { w: 834, h: 1101 }, { w: 1194, h: 741 }, { w: 600, h: 867 }]) {
    const cap = W.tileCapacity(box);
    for (let n = 1; n <= cap; n++) {
      const tiles = W.tileGrid(n, box).map((t) => ({
        left: t.left + 8, top: t.top + 8,
        width: Math.max(W.MINW, t.width - 16), height: Math.max(W.MINH, t.height - 16),
      })).map((g) => W.clampGeom(g, box));
      for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        const ox = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
        assert.equal(ox * oy, 0, `overlap at ${box.w}x${box.h} n=${n} tiles ${i}/${j}`);
      }
    }
  }
});

test("tileCapacity: how many windows a frame can hold at the minimum size", () => {
  assert.equal(W.tileCapacity({ w: 656, h: 851 }), 2 * 4);
  assert.equal(W.tileCapacity({ w: 600, h: 867 }), 1 * 4);
  assert.equal(W.tileCapacity({ w: 1920, h: 987 }), 6 * 4);
  assert.ok(W.tileCapacity({ w: 100, h: 100 }) >= 1);   // never zero
});

test("zoneAssign: focused takes the main zone, the rest keep taskbar order", () => {
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], "b", 3, 0), ["b", "a", "c"]);
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], "a", 3, 0), ["a", "b", "c"]);
  // steered: a per-zone click sends the focused window to THAT zone
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], "b", 3, 2), ["a", "c", "b"]);
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], "a", 3, 1), ["b", "a", "c"]);
});

test("zoneAssign: no visible focused window -> plain taskbar order", () => {
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], null, 3, 2), ["a", "b", "c"]);
  assert.deepEqual(W.zoneAssign(["a", "b", "c"], "ghost", 3, 1), ["a", "b", "c"]);
});

test("zoneAssign: clamps the zone index and leaves overflow out", () => {
  // out-of-range main zone clamps to the last zone
  assert.deepEqual(W.zoneAssign(["a", "b"], "a", 2, 99), ["b", "a"]);
  assert.deepEqual(W.zoneAssign(["a", "b"], "a", 2, -5), ["a", "b"]);
  // more windows than zones: the extras are simply not assigned (caller minimizes)
  assert.deepEqual(W.zoneAssign(["a", "b", "c", "d"], "c", 3, 0), ["c", "a", "b"]);
  // fewer windows than zones never assigns undefined slots
  assert.deepEqual(W.zoneAssign(["a", "b"], "b", 3, 0), ["b", "a"]);
});

test("swapZones: swaps two occupants, guards bad indices", () => {
  assert.deepEqual(W.swapZones(["a", "b", "c"], 0, 2), ["c", "b", "a"]);
  assert.deepEqual(W.swapZones(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
  assert.deepEqual(W.swapZones(["a", "b", "c"], -1, 2), ["a", "b", "c"]);
  assert.deepEqual(W.swapZones(["a", "b", "c"], 0, 3), ["a", "b", "c"]);
  const inp = ["a", "b"];
  W.swapZones(inp, 0, 1);
  assert.deepEqual(inp, ["a", "b"], "input is not mutated");
});

test("zoneOccupancy: maps windows to the zones they exactly occupy", () => {
  const zones = W.layoutGeoms("main2", BOX);
  const geoms = { big: { ...zones[0] }, tr: { ...zones[1] }, br: { ...zones[2] } };
  assert.deepEqual(W.zoneOccupancy(zones, geoms), ["big", "tr", "br"]);
  // a few px off is still the same arrangement (nudge/rounding tolerance)
  geoms.tr = { left: zones[1].left + 2, top: zones[1].top - 2,
               width: zones[1].width + 1, height: zones[1].height - 1 };
  assert.deepEqual(W.zoneOccupancy(zones, geoms), ["big", "tr", "br"]);
});

test("zoneOccupancy: null when the arrangement is NOT this layout", () => {
  const zones = W.layoutGeoms("main2", BOX);
  // wrong count
  assert.equal(W.zoneOccupancy(zones, { a: { ...zones[0] }, b: { ...zones[1] } }), null);
  // a free-floating window claims no zone
  assert.equal(W.zoneOccupancy(zones, {
    a: { ...zones[0] }, b: { ...zones[1] },
    c: { left: 40, top: 40, width: 500, height: 400 } }), null);
  // two windows piled on one zone, none on another
  assert.equal(W.zoneOccupancy(zones, {
    a: { ...zones[0] }, b: { ...zones[1] }, c: { ...zones[1] } }), null);
  // beyond tolerance (tidy's GAP=8 insets must NOT read as the gapless layout)
  const off = { left: zones[2].left + 8, top: zones[2].top + 8,
                width: zones[2].width - 16, height: zones[2].height - 16 };
  assert.equal(W.zoneOccupancy(zones, { a: { ...zones[0] }, b: { ...zones[1] }, c: off }), null);
});
