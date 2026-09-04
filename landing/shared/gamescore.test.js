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
      removeItem: (k) => store.delete(k),
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

test("the table keeps at most 10 rows, dropping the worst", () => {
  const { S } = sandbox();
  for (let v = 14; v >= 1; v--) S.record({ game: "sol", value: v, lower: true });
  assert.deepEqual(Array.from(S.list({ game: "sol", lower: true }), (e) => e.v),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("a run that misses the table reports rank 0 and no entry", () => {
  const { S } = sandbox();
  for (let v = 1; v <= 10; v++) S.record({ game: "sol", value: v, lower: true });
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

test("a legacy key the game keeps rewriting is not re-imported (the 1376-twice bug)", () => {
  const { S, store } = sandbox();
  // 2048 writes vt-2048-best on every move, so by the time the run ends the
  // "legacy" key holds THIS run's score. Importing it then listed the same
  // number twice — once undated from the import, once dated from the record.
  store.set("vt-2048-best", "1376");
  S.record({ game: "2048", value: 1376, seed: "vt-2048-best" });
  assert.deepEqual(Array.from(S.list({ game: "2048", seed: "vt-2048-best" }), (e) => e.v), [1376]);

  store.set("vt-2048-best", "2500");
  S.record({ game: "2048", value: 2500, seed: "vt-2048-best" });
  assert.deepEqual(Array.from(S.list({ game: "2048", seed: "vt-2048-best" }), (e) => e.v), [2500, 1376]);
});

test("the legacy import survives a read that happens before any record", () => {
  const { S, store } = sandbox();
  store.set("vibetop:circuit:best", "4200");
  S.list({ game: "circuit", seed: "vibetop:circuit:best" });      // page just looks
  store.delete("vibetop:circuit:best");                            // legacy key gone
  assert.deepEqual(Array.from(S.list({ game: "circuit", seed: "vibetop:circuit:best" }), (e) => e.v),
    [4200], "the imported row was persisted, not recomputed on every read");
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

// ---- stats layer ---------------------------------------------------------

test("stats start zero-filled, so callers never guard", () => {
  const { S } = sandbox();
  const s = S.stats("mine", "easy");
  assert.deepEqual({ n: s.n, w: s.w, cur: s.cur, best: s.best }, { n: 0, w: 0, cur: 0, best: 0 });
  assert.equal(Object.keys(s.x).length, 0);
});

test("finish counts games, wins, and the current streak", () => {
  const { S } = sandbox();
  S.finish("mine", "easy", true);
  S.finish("mine", "easy", true);
  S.finish("mine", "easy", false);
  const s = S.stats("mine", "easy");
  assert.deepEqual({ n: s.n, w: s.w, cur: s.cur, best: s.best }, { n: 3, w: 2, cur: 0, best: 2 });
});

test("a loss breaks the streak but never the record", () => {
  const { S } = sandbox();
  [true, true, true, false, true].forEach((won) => S.finish("sol", "", won));
  const s = S.stats("sol", "");
  assert.equal(s.best, 3, "longest streak survives the loss");
  assert.equal(s.cur, 1, "current streak restarted");
});

test("stats are per board, like the score lists", () => {
  const { S } = sandbox();
  S.finish("mine", "easy", true);
  S.finish("mine", "hard", false);
  assert.equal(S.stats("mine", "easy").n, 1);
  assert.equal(S.stats("mine", "easy").w, 1);
  assert.equal(S.stats("mine", "hard").w, 0);
});

test("extras keep a high-water mark: a worse run cannot walk it back", () => {
  const { S } = sandbox();
  S.finish("2048", "", false, { tile: 1024 });
  S.finish("2048", "", false, { tile: 256 });
  assert.equal(S.stats("2048", "").x.tile, 1024);
  S.finish("2048", "", true, { tile: 2048 });
  assert.equal(S.stats("2048", "").x.tile, 2048);
});

test("non-numeric extras are ignored rather than stored", () => {
  const { S } = sandbox();
  S.finish("circuit", "", false, { sector: 3, junk: "nope", nan: NaN });
  const x = S.stats("circuit", "").x;
  assert.equal(x.sector, 3);
  assert.equal("junk" in x, false);
  assert.equal("nan" in x, false);
});

test("reset clears scores, stats AND the legacy seed", () => {
  const { S, store } = sandbox();
  store.set("vt-2048-best", "9999");
  S.record({ game: "2048", value: 500 });
  S.finish("2048", "", true, { tile: 512 });
  S.reset("2048", ["vt-2048-best"]);
  assert.equal(S.list({ game: "2048", seed: "vt-2048-best" }).length, 0,
    "the seed must go too, or the wiped best comes straight back");
  assert.equal(S.stats("2048", "").n, 0);
});

test("corrupt stats JSON degrades to zeros instead of throwing", () => {
  const { S, store } = sandbox();
  store.set("vibetop:stats:mine", "{not json");
  assert.equal(S.stats("mine", "easy").n, 0);
  assert.doesNotThrow(() => S.finish("mine", "easy", true));
  assert.equal(S.stats("mine", "easy").n, 1);
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

// ---- the in-game leaderboard panel ---------------------------------------

test("panel draws each game's own stats and its own ranking", () => {
  const { S, doc } = sandbox();
  S.record({ game: "mine", board: "easy", value: 31, lower: true });
  S.record({ game: "mine", board: "easy", value: 44, lower: true });
  S.finish("mine", "easy", true);
  S.finish("mine", "easy", false);
  const el = doc.createElement("div");
  const n = S.panel(el, "mine", "easy");
  assert.equal(n, 2);
  assert.match(el.text, /PLAYED|Played/i);
  assert.match(el.text, /WIN RATE|Win rate/i);
  assert.match(el.text, /31s/, "times carry the game's own unit");
  assert.match(el.text, /Fastest times · Easy/);
});

test("panel is per board: another difficulty is another leaderboard", () => {
  const { S, doc } = sandbox();
  S.record({ game: "mine", board: "easy", value: 31, lower: true });
  const el = doc.createElement("div");
  assert.equal(S.panel(el, "mine", "hard"), 0);
  assert.match(el.text, /No cleared game yet on hard\./);
});

test("panel labels differ per game — this is not one shared board", () => {
  const { S, doc } = sandbox();
  S.record({ game: "sol", value: 104, lower: true });
  S.record({ game: "2048", value: 8800 });
  const sol = doc.createElement("div"); S.panel(sol, "sol", "");
  const g = doc.createElement("div"); S.panel(g, "2048", "");
  assert.match(sol.text, /Fewest moves/);
  assert.match(sol.text, /104 moves/);
  assert.match(g.text, /Highest scores/);
  assert.match(g.text, /8800/);
  assert.doesNotMatch(g.text, /moves/);
});

test("panel reports 2048's best tile and Circuit's furthest sector", () => {
  const { S, doc } = sandbox();
  S.finish("2048", "", false, { tile: 512 });
  S.finish("circuit", "", false, { sector: 3 });
  const a = doc.createElement("div"); S.panel(a, "2048", "");
  const c = doc.createElement("div"); S.panel(c, "circuit", "");
  assert.match(a.text, /512/);
  assert.match(c.text, /03/, "sector is zero-padded like the game's own HUD");
});

test("panel on an unknown game renders nothing rather than throwing", () => {
  const { S, doc } = sandbox();
  const el = doc.createElement("div");
  assert.equal(S.panel(el, "pinball", ""), 0);
  assert.equal(S.panel(null, "mine", ""), 0);
});

test("seedOf hands a game's Reset the legacy key it must also erase", () => {
  const { S } = sandbox();
  assert.deepEqual(Array.from(S.seedOf("2048")), ["vt-2048-best"]);
  assert.deepEqual(Array.from(S.seedOf("circuit")), ["vibetop:circuit:best"]);
  assert.equal(S.seedOf("mine").length, 0);
});

test("render injects its stylesheet exactly once", () => {
  const { S, doc } = sandbox();
  S.render(doc.createElement("div"), { game: "sol" });
  S.render(doc.createElement("div"), { game: "sol" });
  assert.equal(doc.head.children.filter((c) => c.id === "vtsc-css").length, 1);
});
