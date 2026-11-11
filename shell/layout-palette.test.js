/* The snap-layout palette: a double click/tap on a tile applies it at once.
 * Pins the wiring in shell/desktop.html (the behaviour itself is exercised in
 * a real browser; see docs/design-decisions.md).
 *   node --test shell/layout-palette.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SRC = fs.readFileSync(path.join(__dirname, "desktop.html"), "utf8");

function makeTap(env) {
  const m = SRC.match(/var lastTap = 0;\s*var tap = function \(\) \{[\s\S]*?\n      \};/);
  assert.ok(m, "tap() not found in desktop.html");
  const ctx = Object.assign({ chosen: 0, applied: [], now: 0, L: { key: "halves" }, staged: { halves: ["a", "b"] } }, env);
  ctx.Date = { now: () => ctx.now };
  ctx.choose = () => { ctx.chosen++; };
  ctx.applyLayout = (k, board) => { ctx.applied.push([k, board]); };
  vm.runInNewContext(m[0] + "; this.tap = tap;", ctx);
  return ctx;
}

test("one click selects; a second within 400ms applies that tile's board", () => {
  const c = makeTap();
  c.now = 1000; c.tap();
  assert.equal(c.chosen, 1); assert.equal(c.applied.length, 0);
  c.now = 1300; c.tap();
  assert.equal(c.applied.length, 1);
  assert.equal(c.applied[0][0], "halves");
  assert.deepEqual(Array.from(c.applied[0][1]), ["a", "b"]);
});

test("two slow clicks never apply, and a triple click applies once", () => {
  const c = makeTap();
  c.now = 1000; c.tap(); c.now = 1500; c.tap();
  assert.equal(c.applied.length, 0);
  c.now = 1600; c.tap();                      // completes a double with the 1500 click
  c.now = 1700; c.tap();                      // starts over; must not apply again
  assert.equal(c.applied.length, 1);
});

test("plain tile clicks go through tap(); swaps and the Apply button do not", () => {
  assert.match(SRC, /tap\(\);\s+\/\/ a click selects \(twice = apply\)/);
  assert.match(SRC, /tap off the board = cancel\s+tap\(\);/);
  const stage = SRC.match(/var stage = function \(i, k\) \{[\s\S]*?\n      \};/);
  assert.ok(stage && /choose\(\);/.test(stage[0]) && !/tap\(\)/.test(stage[0]), "a swap must not count toward a double");
  assert.match(SRC, /applyBtn\.id = 'wl-apply'/, "the Apply button stays");
});

test("the caption names the shortcut on both pointer types", () => {
  assert.match(SRC, /double-tap a layout to apply it right away/);
  assert.match(SRC, /double-click a layout to apply it right away/);
});
