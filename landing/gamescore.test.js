/* Tests for gamescore.js — the best-scores table shared by the four games.
 *
 *   node --test landing/
 *
 * gamescore.js is a browser IIFE that assigns window.vibeScores. Same
 * zero-refactor approach as coach.test.js / sw.test.js: run the REAL source in
 * a vm sandbox with minimal localStorage + DOM stubs, then drive the public API.
 * Nothing here is deployed — *.test.js is never in the install allowlist.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "gamescore.js"), "utf8");

function makeEl(tag) {
  return {
    tagName: tag, id: "", className: "", textContent: "", children: [],
    ownerDocument: null,
    appendChild(c) { this.children.push(c); return c; },
    // flattened text of the subtree, for asserting what a card actually shows
    get text() {
      return this.children.length
        ? this.children.map((c) => c.text).join("|")
        : String(this.textContent);
    },
  };
}

function sandbox() {
  const store = new Map();
  const doc = {
    head: makeEl("head"),
    documentElement: makeEl("html"),
    getElementById: (id) => (id === "vtsc-css" ? doc._css : null),
    createElement: (t) => {
      const el = makeEl(t);
      el.ownerDocument = doc;
      return el;
    },
  };
  doc._css = null;
  doc.head.appendChild = function (c) { if (c.id === "vtsc-css") doc._css = c; this.children.push(c); return c; };
  const win = {
    document: doc,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  win.window = win;
  vm.createContext(win);
  new vm.Script(SRC, { filename: "gamescore.js" }).runInContext(win);
  return { S: win.vibeScores, store, doc };
}

// ---- ranking -------------------------------------------------------------

test("lower:true ranks the smallest value first (times, moves)", () => {
  const { S } = sandbox();
  S.record({ game: "mine", board: "easy", value: 40, lower: true });
  const r = S.record({ game: "mine", board: "easy", value: 31, lower: true });
  assert.equal(r.rank, 1);
  assert.deepEqual(Array.from(S.list({ game: "mine", board: "easy", lower: true }), (e) => e.v), [31, 40]);
});

test("lower:false ranks the biggest value first (points)", () => {
  const { S } = sandbox();
  S.record({ game: "2048", value: 900 });
  const r = S.record({ game: "2048", value: 12000 });
  assert.equal(r.rank, 1);
  assert.deepEqual(Array.from(S.list({ game: "2048" }), (e) => e.v), [12000, 900]);
});

test("boards are independent lists inside one game", () => {
  const { S } = sandbox();
  S.record({ game: "mine", board: "easy", value: 20, lower: true });
  S.record({ game: "mine", board: "hard", value: 300, lower: true });
  assert.deepEqual(Array.from(S.list({ game: "mine", board: "easy", lower: true }), (e) => e.v), [20]);
  assert.deepEqual(Array.from(S.list({ game: "mine", board: "hard", lower: true }), (e) => e.v), [300]);
});

test("the table keeps at most 5 rows, dropping the worst", () => {
  const { S } = sandbox();
  [5, 1, 4, 2, 6, 3].forEach((v) => S.record({ game: "sol", value: v, lower: true }));
  assert.deepEqual(Array.from(S.list({ game: "sol", lower: true }), (e) => e.v), [1, 2, 3, 4, 5]);
});

test("a run that misses the table reports rank 0 and no entry", () => {
  const { S } = sandbox();
  [1, 2, 3, 4, 5].forEach((v) => S.record({ game: "sol", value: v, lower: true }));
  const r = S.record({ game: "sol", value: 99, lower: true });
  assert.equal(r.rank, 0);
  assert.equal(r.entry, null);
});

// ---- one played game = one row -------------------------------------------

test("re-recording the same session replaces that row (2048: win card, then game over)", () => {
  const { S } = sandbox();
  const s = S.session();
  S.record({ game: "2048", value: 20000, session: s });   // hit the 2048 tile
  S.record({ game: "2048", value: 31000, session: s });   // kept going, then died
  assert.deepEqual(Array.from(S.list({ game: "2048" }), (e) => e.v), [31000]);
});

test("different sessions each keep their own row", () => {
  const { S } = sandbox();
  S.record({ game: "2048", value: 20000, session: S.session() });
  S.record({ game: "2048", value: 31000, session: S.session() });
  assert.deepEqual(Array.from(S.list({ game: "2048" }), (e) => e.v), [31000, 20000]);
});

test("session ids are unique", () => {
  const { S } = sandbox();
  assert.notEqual(S.session(), S.session());
});

// ---- legacy import -------------------------------------------------------

test("an existing single best is imported once, undated, and not duplicated", () => {
  const { S, store } = sandbox();
  store.set("vt-2048-best", "8888");
  let list = S.list({ game: "2048", seed: "vt-2048-best" });
  assert.deepEqual(Array.from(list, (e) => e.v), [8888]);
  assert.equal(list[0].t, 0, "imported best carries no date");

  S.record({ game: "2048", value: 100, seed: "vt-2048-best" });
  list = S.list({ game: "2048", seed: "vt-2048-best" });
  assert.deepEqual(Array.from(list, (e) => e.v), [8888, 100], "imported once, not on every call");
});

test("a missing or junk legacy key imports nothing", () => {
  const { S, store } = sandbox();
  store.set("vibetop:circuit:best", "0");
  assert.equal(S.list({ game: "circuit", seed: "vibetop:circuit:best" }).length, 0);
  store.set("vibetop:circuit:best", "nope");
  assert.equal(S.list({ game: "circuit", seed: "vibetop:circuit:best" }).length, 0);
});

test("corrupt stored JSON degrades to an empty table instead of throwing", () => {
  const { S, store } = sandbox();
  store.set("vibetop:scores:mine", "{not json");
  assert.equal(S.list({ game: "mine", board: "easy" }).length, 0);
  assert.doesNotThrow(() => S.record({ game: "mine", board: "easy", value: 10, lower: true }));
});

// ---- rendering -----------------------------------------------------------

test("render shows the top 3 with units, and marks the run just played", () => {
  const { S, doc } = sandbox();
  [50, 40, 30, 20].forEach((v) => S.record({ game: "mine", board: "easy", value: v, lower: true }));
  const mine = S.record({ game: "mine", board: "easy", value: 10, lower: true });
  const el = doc.createElement("div");
  const n = S.render(el, { game: "mine", board: "easy", lower: true, unit: "s", title: "Best times", highlight: mine.entry });
  assert.equal(n, 3, "top 3 only");
  assert.match(el.text, /Best times/);
  assert.match(el.text, /10s/);
  assert.match(el.text, /just now/);
  assert.doesNotMatch(el.text, /50s/, "4th place is off the visible table");
  assert.equal(el.children[1].children[0].className, "vtsc-me", "the new run's row is highlighted");
});

test("an empty table still says something (the bug that started this)", () => {
  const { S, doc } = sandbox();
  const el = doc.createElement("div");
  const n = S.render(el, { game: "mine", board: "hard", lower: true, empty: "No cleared game yet on hard." });
  assert.equal(n, 0);
  assert.match(el.text, /No cleared game yet on hard\./);
});

test("render injects its stylesheet exactly once", () => {
  const { S, doc } = sandbox();
  S.render(doc.createElement("div"), { game: "sol" });
  S.render(doc.createElement("div"), { game: "sol" });
  assert.equal(doc.head.children.filter((c) => c.id === "vtsc-css").length, 1);
});
