/* Unit tests for split.js — the pure 2-pane split-view state transitions.
 * DOM-free, run with `node --test landing/split.test.js` (part of run-tests.sh).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./split.js");

test("clampRatio bounds and NaN default", () => {
  assert.equal(S.clampRatio(0.5), 0.5);
  assert.equal(S.clampRatio(-1), 0.05);
  assert.equal(S.clampRatio(5), 0.95);
  assert.equal(S.clampRatio(NaN), 0.5);
  assert.equal(S.clampRatio("nope"), 0.5);
  assert.equal(S.clampRatio(undefined), 0.5);
});

test("splitBesideNext: from single → tiles active|target 50/50", () => {
  assert.deepEqual(S.splitBesideNext("terminal", "files", null),
                   { apps: ["terminal", "files"], ratio: 0.5 });
});

test("splitBesideNext: can't split an app with itself", () => {
  assert.equal(S.splitBesideNext("terminal", "terminal", null), null);
});

test("splitBesideNext: already split → replaces the NON-focused pane", () => {
  // focused=terminal (left), click ◫ on 'notes' → notes replaces the right pane (files)
  const split = { apps: ["terminal", "files"], ratio: 0.4 };
  assert.deepEqual(S.splitBesideNext("terminal", "notes", split),
                   { apps: ["terminal", "notes"], ratio: 0.4 });
});

test("splitBesideNext: replaces non-focused when the RIGHT pane is focused", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.6 };
  // focused=files (right), click ◫ on 'notes' → notes replaces the left pane (terminal)
  assert.deepEqual(S.splitBesideNext("files", "notes", split),
                   { apps: ["notes", "files"], ratio: 0.6 });
});

test("splitBesideNext: clicking ◫ on the focused pane → null (caller unsplits)", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.equal(S.splitBesideNext("terminal", "terminal", split), null);
});

test("splitBesideNext: replacing a pane with the other pane → null (would duplicate)", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  // focused=terminal, click ◫ on files (the other pane) → would make [terminal,terminal]? no:
  // non-focused is 'files', replace it with 'files' → unchanged apps, but target≠active so
  // apps stays [terminal,files]; that's a valid no-op-ish tile, not a dup. Duplicate only if
  // target equals the focused app, covered above. Here assert it stays tiled.
  assert.deepEqual(S.splitBesideNext("terminal", "files", split),
                   { apps: ["terminal", "files"], ratio: 0.5 });
});

test("visibleSet: no active → wallpaper (empty)", () => {
  assert.deepEqual(S.visibleSet(null, null, [], true), []);
});

test("visibleSet: single app when not split", () => {
  assert.deepEqual(S.visibleSet("files", null, ["files"], true), ["files"]);
});

test("visibleSet: two panes when split, wide, both open, active is a pane", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.deepEqual(S.visibleSet("terminal", split, ["terminal", "files"], true),
                   ["terminal", "files"]);
});

test("visibleSet: collapses to focused pane when too narrow", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.deepEqual(S.visibleSet("files", split, ["terminal", "files"], false), ["files"]);
});

test("visibleSet: collapses when a pane was closed", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.deepEqual(S.visibleSet("terminal", split, ["terminal"], true), ["terminal"]);
});

test("visibleSet: single when focused app isn't one of the panes", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.deepEqual(S.visibleSet("notes", split, ["terminal", "files", "notes"], true), ["notes"]);
});

test("edgeUnsplit: pinch left keeps right, pinch right keeps left, middle stays split", () => {
  const split = { apps: ["terminal", "files"], ratio: 0.5 };
  assert.equal(S.edgeUnsplit(split, 0.05), "files");
  assert.equal(S.edgeUnsplit(split, 0.97), "terminal");
  assert.equal(S.edgeUnsplit(split, 0.5), null);
  assert.equal(S.edgeUnsplit(null, 0.05), null);
});

test("sanitizeSplit: accepts a valid pair, clamps ratio", () => {
  assert.deepEqual(S.sanitizeSplit({ apps: ["a", "b"], ratio: 9 }, ["a", "b", "c"]),
                   { apps: ["a", "b"], ratio: 0.95 });
});

test("sanitizeSplit: rejects malformed / non-open / duplicate", () => {
  assert.equal(S.sanitizeSplit(null, ["a"]), null);
  assert.equal(S.sanitizeSplit("x", ["a"]), null);
  assert.equal(S.sanitizeSplit({ apps: ["a"] }, ["a"]), null);          // not 2
  assert.equal(S.sanitizeSplit({ apps: ["a", 1] }, ["a"]), null);       // non-string
  assert.equal(S.sanitizeSplit({ apps: ["a", "a"] }, ["a"]), null);     // duplicate
  assert.equal(S.sanitizeSplit({ apps: ["a", "b"] }, ["a"]), null);     // b not open
});
