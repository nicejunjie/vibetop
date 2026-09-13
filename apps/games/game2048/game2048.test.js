// The 2048 rules, driven through the REAL game code.
//
// game2048.html ships its whole game as one inline <script> IIFE with no
// exports, so this test reads the page with fs, pulls that block out, runs it
// in a vm sandbox with only the DOM/host APIs it actually touches stubbed, and
// then calls the very functions the page installed — move(), canMove(), at(),
// setAt(), makeTile() — plus the real keydown listener it registered.
// Nothing here re-implements the merge or compaction maths: a copied formula
// would keep passing after the shipped one drifted, which is the whole point.
//
// The ONE piece of instrumentation is a single `window.__2048 = {…}` line
// spliced in just before the IIFE's final newGame() call, exporting those
// closure-bound functions unchanged. The splice asserts its anchor, so if the
// page is restructured this test fails loudly instead of quietly testing air.
//
// Every assertion below was mutation-proved: the mutation was applied to a
// scratch COPY of the page (never to the real file — that is all the VT2048_SRC
// hook is for), the test was watched go RED, and then GREEN again against the
// shipped page. Mutation -> the test it kills:
//   - drop ` && merged.indexOf(occ) < 0`  -> "a tile born of a merge cannot merge again"
//   - `if (!occ) { nr=tr; nc=tc; continue; }` -> `break`  -> the four-direction
//     compaction test (and the triple, quad, spawn-count, keyboard, game-over ones)
//   - `if (moved) {` -> `if (true) {`      -> "a move that changes nothing spawns nothing"
//   - `spawn();` -> `spawn(); spawn();`    -> "a move that does change the board spawns exactly one"
//   - canMove's trailing `return false;` -> `return true;`  -> the dead-board
//     assertion and the whole game-over test
//   - canMove's three empty-cell checks inverted -> the "an empty cell is a move" assertion
//   - `score += v` -> `score += 0`         -> the score + best-persistence tests
//   - `target.v *= 2` -> `target.v *= 1`   -> every merge-value assertion
// One honest gap: no single-line mutation of `if (!t) return true;` in canMove
// bites on its own — the neighbour check one cell earlier already returns true
// for a board with a hole, so that line is only reachable in combination (hence
// the three-way inversion above).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Default: the real shipped page. Overridable ONLY so a mutation run can point
// at a scratch copy — the real file is never written by this test.
const PAGE = process.env.VT2048_SRC || path.join(__dirname, "game2048.html");
const HTML = fs.readFileSync(PAGE, "utf8");

// The inline game block: every <script> WITHOUT src=, then the one that
// actually holds the game (not the one-line embedded-detection shim).
function gameScript() {
  const blocks = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => /function\s+canMove\s*\(/.test(s));
  assert.strictEqual(blocks.length, 1, "exactly one inline block owns the game logic");
  const src = blocks[0];
  // Splice the export in. Anchored on the IIFE's own kickoff call.
  const ANCHOR = "\n  newGame();\n";
  const hits = src.split(ANCHOR).length - 1;
  assert.strictEqual(hits, 1, "the newGame() kickoff anchor is still unique");
  return src.replace(ANCHOR, "\n  window.__2048 = { at: at, setAt: setAt, makeTile: makeTile," +
    " move: move, canMove: canMove, newGame: newGame, spawn: spawn, each: each };\n  newGame();\n");
}
const SRC = gameScript();

const N = 4;

// --- the DOM the page needs, and not one property more ---------------------
function makeEl(id) {
  const el = {
    id,
    className: "",
    textContent: "",
    dataset: {},
    style: {},
    children: [],
    parentNode: null,
    listeners: {},
    clientWidth: 600,
    clientHeight: 600,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(ch) { ch.parentNode = el; el.children.push(ch); return ch; },
    insertBefore(ch, ref) {
      const i = ref ? el.children.indexOf(ref) : -1;
      ch.parentNode = el;
      if (i < 0) el.children.push(ch); else el.children.splice(i, 0, ch);
      return ch;
    },
    remove() {
      const p = el.parentNode;
      if (!p) return;
      const i = p.children.indexOf(el);
      if (i >= 0) p.children.splice(i, 1);
      el.parentNode = null;
    },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, "");
      return el.children.filter((c) => String(c.className).split(/\s+/).indexOf(cls) >= 0);
    },
    addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
    removeEventListener() {},
    focus() {},
    get firstChild() { return el.children[0] || null; },
  };
  return el;
}

function load({ random = () => 0, storage = {} } = {}) {
  const timers = new Map();
  let seq = 1;
  const store = new Map(Object.entries(storage));   // set BEFORE the page boots
  const calls = { session: 0, migrate: [], record: [], render: [], finish: [], panel: [], reset: [] };
  const els = new Map();
  // Every looked-up element hangs off one detached root, so the page's
  // `scoreEl.parentNode.appendChild(...)` (the floating "+4") has somewhere to go.
  const root = makeEl("#root");
  const byId = (id) => {
    if (!els.has(id)) { const el = makeEl(id); root.appendChild(el); els.set(id, el); }
    return els.get(id);
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math: Object.assign(Object.create(Math), { random }),
    setTimeout(fn, ms) { const id = seq++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame(fn) { const id = seq++; timers.set(id, fn); return id; },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    vibeScores: {
      migrate(o) { calls.migrate.push(o); },
      session() { calls.session++; return "sess-" + calls.session; },
      record(o) { calls.record.push(o); return { entry: { id: 1 }, rank: 1, list: [] }; },
      render(el, o) { calls.render.push(o); },
      finish(game, board, won, extra) { calls.finish.push({ game, board, won, extra }); },
      panel(el, game, board) { calls.panel.push({ game, board }); },
      reset(game, seed) { calls.reset.push({ game, seed }); },
      seedOf(game) { return "vt-2048-best"; },
    },
    vibeConfirm: () => Promise.resolve(false),
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    listeners: {},
    getElementById: byId,
    querySelector: (s) => byId(s),
    createElement: () => makeEl(null),
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
    body: byId("body"),
    documentElement: byId("html"),
  };

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "game2048.html inline" }).runInContext(sandbox);

  const T = sandbox.__2048;
  assert.ok(T && typeof T.move === "function", "the game's own functions are reachable");

  // Fire every pending timer (merge DOM finalizers, showWin/showLose).
  const flush = () => {
    let guard = 0;
    while (timers.size && guard++ < 50) {
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      fn();
    }
  };
  // Read the LOGICAL board through the game's own at().
  const read = () => {
    const rows = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) { const t = T.at(r, c); row.push(t ? t.v : 0); }
      rows.push(row);
    }
    return rows;
  };
  // Seed a known board through the game's own setAt()/makeTile().
  const seed = (rows) => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = T.at(r, c);
      if (t) { t.el.remove(); T.setAt(r, c, null); }
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (rows[r][c]) T.makeTile(r, c, rows[r][c], false);
    }
  };
  const tiles = () => read().reduce((n, row) => n + row.filter((v) => v).length, 0);
  const score = () => Number(byId("score").textContent);
  const key = (k) => sandbox.document.listeners.keydown.forEach((fn) => fn({ key: k, preventDefault() {} }));

  return { T, sandbox, els, byId, store, calls, flush, read, seed, tiles, score, key };
}

const E = 0;
// Spawn placement is Math.random-driven: 0 puts the newcomer in the FIRST free
// cell, 0.99 in the LAST one (and makes it a 4). Tests that assert a whole row
// use AWAY so the spawn lands in the far corner and never muddies the reading.
const AWAY = () => 0.99;

test("the page boots and deals a fresh board", () => {
  const g = load();
  assert.strictEqual(g.tiles(), 2, "newGame() spawns exactly two tiles");
  assert.strictEqual(g.score(), 0);
  assert.strictEqual(g.calls.session, 1, "one leaderboard session id per game");
});

// --- the merge rule --------------------------------------------------------

test("two adjacent equal tiles merge into one, and the merged value scores", () => {
  const g = load();
  g.seed([[2, 2, E, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  const before = g.score();
  assert.strictEqual(g.T.move(0, -1), true, "the board changed");
  assert.strictEqual(g.read()[0][0], 4, "a single 4 at the left edge");
  assert.strictEqual(g.score() - before, 4, "score gained the merged value");
});

test("a move merges at most one pair per line — three equal tiles do not chain", () => {
  const g = load({ random: AWAY });
  g.seed([[2, 2, 2, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.T.move(0, -1);
  const row = g.read()[0];
  assert.strictEqual(row[0], 4, "the pair nearest the wall merged");
  assert.strictEqual(row[1], 2, "the third tile followed but stayed a 2");
  assert.ok(row.indexOf(8) < 0, "nothing cascaded into an 8");
});

test("a tile born of a merge cannot merge again in the same move", () => {
  const g = load({ random: AWAY });
  g.seed([[2, 2, 4, 4], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.T.move(0, -1);
  const row = g.read()[0];
  assert.strictEqual(row[0], 4, "2+2");
  assert.strictEqual(row[1], 8, "4+4 — and the fresh 4 did not swallow it");
  assert.strictEqual(row[2], 0);
  assert.strictEqual(row[3], 0);
});

// --- compaction, all four directions ---------------------------------------

test("gaps close toward the direction of travel, in all four directions", () => {
  const row = (v) => [v[0], v[1], v[2], v[3]];
  const blank = () => [row([E, E, E, E]), row([E, E, E, E]), row([E, E, E, E]), row([E, E, E, E])];

  const left = load({ random: AWAY });
  const bl = blank(); bl[1] = [E, 2, E, 8];
  left.seed(bl);
  left.T.move(0, -1);
  assert.deepStrictEqual(left.read()[1], [2, 8, 0, 0], "left");

  const right = load({ random: AWAY });
  const br = blank(); br[1] = [2, E, 8, E];
  right.seed(br);
  right.T.move(0, 1);
  assert.deepStrictEqual(right.read()[1], [0, 0, 2, 8], "right");

  const up = load({ random: AWAY });
  const bu = blank(); bu[1][2] = 2; bu[3][2] = 8;
  up.seed(bu);
  up.T.move(-1, 0);
  assert.deepStrictEqual(up.read().map((r) => r[2]), [2, 8, 0, 0], "up");

  const down = load({ random: AWAY });
  const bd = blank(); bd[0][2] = 2; bd[2][2] = 8;
  down.seed(bd);
  down.T.move(1, 0);
  assert.deepStrictEqual(down.read().map((r) => r[2]), [0, 0, 2, 8], "down");
});

// --- score + best persistence ----------------------------------------------

test("score accumulates across moves and beats/persists the stored best", () => {
  const g = load({ random: () => 0 });
  assert.strictEqual(g.store.get("vt-2048-best"), undefined, "nothing stored yet");
  g.seed([[2, 2, E, E], [4, 4, E, E], [E, E, E, E], [E, E, E, E]]);
  g.T.move(0, -1);                       // 4 + 8
  assert.strictEqual(g.score(), 12, "sum of both merges");
  g.flush();
  g.seed([[4, 4, E, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.T.move(0, -1);                       // + 8
  assert.strictEqual(g.score(), 20);
  assert.strictEqual(g.store.get("vt-2048-best"), "20", "best written to storage");
  assert.strictEqual(Number(g.byId("best").textContent), 20);
});

test("a stored best is shown at boot and a worse run never walks it back", () => {
  const g = load({ random: () => 0, storage: { "vt-2048-best": "500" } });
  assert.strictEqual(Number(g.byId("best").textContent), 500, "loaded from storage");
  g.seed([[2, 2, E, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.T.move(0, -1);                       // scores 4 — far under 500
  assert.strictEqual(g.store.get("vt-2048-best"), "500", "a 4-point run never overwrites 500");
  assert.strictEqual(Number(g.byId("best").textContent), 500);
});

// --- spawning ---------------------------------------------------------------

test("a move that changes nothing spawns nothing", () => {
  const g = load({ random: () => 0 });
  g.seed([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  const before = g.tiles();
  assert.strictEqual(g.T.move(0, -1), false, "already compacted, no merges");
  assert.strictEqual(g.tiles(), before, "no phantom tile");
  const g2 = load({ random: () => 0 });
  g2.seed([[2, E, E, E], [4, E, E, E], [8, E, E, E], [16, E, E, E]]);
  assert.strictEqual(g2.T.move(0, -1), false, "column already against the left wall");
  assert.strictEqual(g2.tiles(), 4);
});

test("a move that does change the board spawns exactly one tile", () => {
  const g = load({ random: () => 0 });
  g.seed([[E, E, E, 2], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  assert.strictEqual(g.T.move(0, -1), true);
  assert.strictEqual(g.tiles(), 2, "the slid tile plus one newcomer");
  const g2 = load({ random: () => 0 });
  g2.seed([[2, 2, E, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g2.T.move(0, -1);
  assert.strictEqual(g2.tiles(), 2, "two became one, then one spawned");
});

// --- game over --------------------------------------------------------------

test("canMove sees an empty cell, sees an available merge, and knows a dead board", () => {
  const g = load({ random: () => 0 });
  g.seed([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, E]]);
  assert.strictEqual(g.T.canMove(), true, "an empty cell is a move");
  g.seed([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]]);
  assert.strictEqual(g.T.canMove(), true, "the 4,4 pair on the last row is a move");
  g.seed([[4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 8, 4]]);
  assert.strictEqual(g.T.canMove(), false, "full, and no two neighbours match");
});

test("the move that fills the last cell with no moves left ends the game", () => {
  // Spawn deterministically: the single empty cell, value 2 (Math.random < 0.9).
  const g = load({ random: () => 0 });
  g.seed([[4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2], [4, 8, 2, 2]]);
  assert.strictEqual(g.T.move(0, 1), true, "the last row merged rightwards");
  assert.deepStrictEqual(g.read()[3], [2, 4, 8, 4], "merge, slide, then the spawn");
  assert.strictEqual(g.T.canMove(), false, "nothing left anywhere");
  assert.deepStrictEqual(g.calls.finish, [], "the card is deferred, not instant");
  g.flush();
  assert.strictEqual(g.calls.finish.length, 1, "the run is recorded once");
  assert.strictEqual(g.calls.finish[0].game, "2048");
  assert.strictEqual(g.calls.finish[0].won, false);
  assert.strictEqual(g.calls.finish[0].extra.tile, 8, "the best tile on the dead board");
  assert.ok(g.byId("overlay").classList.contains("show"), "the game-over card is up");
  assert.strictEqual(g.T.move(0, -1), false, "a finished game ignores further moves");
});

// --- the player's actual path ----------------------------------------------

test("the arrow keys the page binds drive the real move", () => {
  // 'vt-2048-help' already set: the how-to-play card is NOT up, so keys reach
  // the board (on a first-ever visit the card is shown and swallows them).
  const g = load({ random: AWAY, storage: { "vt-2048-help": "1" } });
  g.seed([[E, E, 2, 2], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.key("ArrowLeft");
  assert.strictEqual(g.read()[0][0], 4, "ArrowLeft merged and compacted");
  g.seed([[E, E, E, E], [E, E, E, E], [2, E, E, E], [2, E, E, E]]);
  g.key("ArrowUp");
  assert.strictEqual(g.read()[0][0], 4, "ArrowUp merged to the top");
  assert.ok(g.byId("hint").style.display === "none", "the swipe hint retires after a real move");
});

test("keys are ignored while a card is open", () => {
  const g = load({ random: AWAY });
  assert.ok(g.byId("helpOv").classList.contains("show"), "a first visit opens how-to-play");
  g.seed([[2, 2, E, E], [E, E, E, E], [E, E, E, E], [E, E, E, E]]);
  g.key("ArrowLeft");
  assert.deepStrictEqual(g.read()[0], [2, 2, 0, 0], "the board did not move behind the card");
  g.key("Escape");
  assert.strictEqual(g.byId("helpOv").classList.contains("show"), false, "Escape closes it");
  g.key("ArrowLeft");
  assert.strictEqual(g.read()[0][0], 4, "and play resumes");
});
