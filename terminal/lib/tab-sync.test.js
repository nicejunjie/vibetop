/* Unit tests for the pure tab-set reconciliation (tab-sync.js).
 *
 *   node --test terminal/lib/        (or: cd terminal/lib && node --test)
 *
 * No deps — uses node's built-in test runner. These pin the race-window
 * behaviour that the v1.9.6..v1.9.10 fixes kept breaking: a just-opened tab must
 * not be dropped before the poll confirms it, a just-closed tab must not be
 * re-added by a lagging poll, and two clients must not grab the same free slot.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcile, nextAvailable } = require("./tab-sync.js");

const set = (...ns) => Object.fromEntries(ns.map((n) => [n, true]));

test("steady state: desired mirrors the running set", () => {
  const r = reconcile([1, 3, 5], {}, {});
  assert.deepEqual(r.desired, [1, 3, 5]);
  assert.deepEqual(r.pending, {});
  assert.deepEqual(r.closing, {});
});

test("desired list is ascending regardless of running order", () => {
  assert.deepEqual(reconcile([5, 1, 3], {}, {}).desired, [1, 3, 5]);
});

test("opened-elsewhere tab is added here", () => {
  // Another client started terminal 2; our poll now sees it.
  assert.deepEqual(reconcile([1, 2], {}, {}).desired, [1, 2]);
});

test("closed-elsewhere tab is dropped here", () => {
  // We had {1,2}; another client stopped 2; poll no longer lists it.
  assert.deepEqual(reconcile([1], {}, {}).desired, [1]);
});

test("pending keeps a just-opened tab the poll hasn't caught up to", () => {
  // We opened 4 locally (pending); the backend poll still only shows {1}.
  const r = reconcile([1], set(4), {});
  assert.deepEqual(r.desired, [1, 4]);          // 4 survives
  assert.deepEqual(r.pending, set(4));          // still pending — not yet confirmed
});

test("pending clears once the backend confirms the tab is running", () => {
  const r = reconcile([1, 4], set(4), {});
  assert.deepEqual(r.desired, [1, 4]);
  assert.deepEqual(r.pending, {});              // 4 now running → no longer pending
});

test("closing hides a just-closed tab the poll still lists", () => {
  // We stopped 2 locally (closing); the backend poll still reports it running.
  const r = reconcile([1, 2], {}, set(2));
  assert.deepEqual(r.desired, [1]);             // 2 stays hidden
  assert.deepEqual(r.closing, set(2));          // still closing — not yet confirmed gone
});

test("closing clears once the backend confirms the tab is stopped", () => {
  const r = reconcile([1], {}, set(2));
  assert.deepEqual(r.desired, [1]);
  assert.deepEqual(r.closing, {});              // 2 gone from running → closing cleared
});

test("closing wins over a stale pending for the same number", () => {
  // Pathological: 2 is both pending and closing and still shows running.
  // closing must subtract it out (it was just closed), and stay armed.
  const r = reconcile([2], set(2), set(2));
  assert.deepEqual(r.desired, []);
  assert.deepEqual(r.closing, set(2));
  assert.deepEqual(r.pending, {});              // running confirmed → pending dropped
});

test("string vs number set keys reconcile identically", () => {
  // The browser builds these from Object keys (strings) and array ints (numbers).
  const r = reconcile([1], { "4": true }, { "2": true });
  assert.deepEqual(r.desired, [1, 4]);
});

test("empty everywhere yields an empty desired (caller cold-starts)", () => {
  const r = reconcile([], {}, {});
  assert.deepEqual(r.desired, []);
});

test("does not mutate the input pending/closing objects", () => {
  const pending = set(4), closing = set(2);
  reconcile([1, 4], pending, closing);
  assert.deepEqual(pending, set(4), "input pending untouched");
  assert.deepEqual(closing, set(2), "input closing untouched");
});

// -- nextAvailable ---------------------------------------------------------

test("nextAvailable returns the lowest free slot", () => {
  assert.equal(nextAvailable([1, 2], null, 50), 3);
});

test("nextAvailable skips gaps to the first hole", () => {
  assert.equal(nextAvailable([1, 3], null, 50), 2);
});

test("nextAvailable also avoids numbers running on the backend", () => {
  // Tab bar shows {1}; backend already has 2 running (another client) → pick 3.
  assert.equal(nextAvailable([1], [2], 50), 3);
});

test("nextAvailable returns 0 when full", () => {
  const all = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.equal(nextAvailable(all, null, 50), 0);
});

test("nextAvailable handles an empty bar", () => {
  assert.equal(nextAvailable([], null, 50), 1);
});
