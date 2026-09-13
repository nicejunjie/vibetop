// The rules of Minesweeper, as the shipped page actually plays them.
//
// minesweeper.html keeps its whole game in one inline IIFE with no exports, so
// this loads the REAL script out of the HTML into a vm sandbox and drives it
// the only way a player can: through the pointer/mouse/context handlers it
// installs on the board, reading the result back off the cell elements it
// built. Nothing here re-implements a rule — a copied formula would keep
// passing after the shipped one drifts.
//
// Only the DOM surface the script touches is stubbed. Mine placement is made
// deterministic by replacing the sandbox's Math.random (never the game code).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = path.join(__dirname, "minesweeper.html");
const HTML = fs.readFileSync(HTML_PATH, "utf8");

// The page has three <script>s: gamescore.js, vibe-modal.js (both src=), a
// one-line embedded-check, and the game. Take the inline one that owns the
// rules, by name, so neither of the others can be picked up by accident.
function gameSource(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  const game = blocks.filter((b) => /function placeMines\s*\(/.test(b));
  assert.strictEqual(game.length, 1, "exactly one inline script holds the game");
  return game[0];
}
const SRC = gameSource(HTML);

const COLS = 9, ROWS = 9, MINES = 10;     // the 'easy' board the game boots into

// ---- the DOM the script expects ----------------------------------------

function makeEl(tag) {
  const cls = new Set();
  const el = {
    tagName: tag,
    children: [],
    dataset: {},
    textContent: "",
    hidden: false,
    disabled: false,
    value: "",
    clientWidth: 600,
    clientHeight: 600,
    style: { setProperty(k, v) { this[k] = v; } },
    _listeners: {},
    _attrs: {},
    _q: {},
    classList: {
      add() { for (const c of arguments) cls.add(c); },
      remove() { for (const c of arguments) cls.delete(c); },
      contains(c) { return cls.has(c); },
      toggle(c, on) { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; },
    },
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(n) {
      if (n && n.__frag) { n.children.forEach((c) => el.children.push(c)); n.children.length = 0; }
      else el.children.push(n);
      return n;
    },
    querySelector(sel) { if (!el._q[sel]) el._q[sel] = makeEl("option"); return el._q[sel]; },
    querySelectorAll() { return []; },
    getAttribute(k) { return el._attrs[k]; },
    setAttribute(k, v) { el._attrs[k] = v; },
    closest() { return null; },
    get className() { return Array.from(cls).join(" "); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    get innerHTML() { return ""; },
    set innerHTML(v) { if (!v) el.children.length = 0; },
  };
  return el;
}

// ---- deterministic mine placement ---------------------------------------

// placeMines shuffles a pool of eligible indices with Math.random. Feeding it
// 0 every time is the adversarial case for first-click safety: an unguarded
// shuffle would lay the mines on the LOWEST indices on the board.
const zeroRandom = () => 0;

// A chosen layout. This mirrors placeMines' pool+swap so it can compute the
// random sequence that lands the mines on `targets` — it is INPUT generation,
// never an oracle, and the "the rig really lands the mines where the tests say"
// test below checks it against the mine positions the real code reveals.
function riggedRandom(targets, safeIdx) {
  const ex = new Set([safeIdx]);
  const r = Math.floor(safeIdx / COLS), c = safeIdx % COLS;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) ex.add(nr * COLS + nc);
  }
  const pool = [];
  for (let i = 0; i < ROWS * COLS; i++) if (!ex.has(i)) pool.push(i);
  const seq = [];
  for (let m = 0; m < targets.length; m++) {
    const j = pool.indexOf(targets[m]);
    assert.ok(j >= m, "target " + targets[m] + " is not placeable with safe cell " + safeIdx);
    seq.push((j - m) / (pool.length - m));
    const t = pool[m]; pool[m] = pool[j]; pool[j] = t;
  }
  let k = 0;
  return () => (k < seq.length ? seq[k++] : 0);
}

// A mine wall down column 4, plus a corner mine, so a flood started on the
// right can never reach the left half.
const WALL = [0, 4, 13, 22, 31, 40, 49, 58, 67, 76];
const SAFE = 80;                    // bottom-right corner, far from the wall

// ---- the harness ---------------------------------------------------------

function load(random) {
  const clock = { t: 1.7e12 };
  const timeouts = [];              // [id, fn] — fired by hand
  const intervals = [];
  let nextId = 1;
  const calls = [];                 // every vibeScores call the game makes
  const store = new Map();
  const els = new Map();
  const docListeners = {};

  const get = (id) => { if (!els.has(id)) els.set(id, makeEl("div")); return els.get(id); };
  get("wrap").clientWidth = 600;
  get("wrap").clientHeight = 600;

  const document = {
    getElementById: get,
    querySelector: () => null,
    createElement: (tag) => makeEl(tag),
    createDocumentFragment: () => { const f = makeEl("#frag"); f.__frag = true; return f; },
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
    body: makeEl("body"),
    documentElement: makeEl("html"),
  };

  const sandbox = {
    document,
    navigator: {},
    innerWidth: 1200,
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn) => { const id = nextId++; timeouts.push([id, fn]); return id; },
    clearTimeout: (id) => { const i = timeouts.findIndex((t) => t[0] === id); if (i >= 0) timeouts.splice(i, 1); },
    setInterval: (fn) => { const id = nextId++; intervals.push([id, fn]); return id; },
    clearInterval: (id) => { const i = intervals.findIndex((t) => t[0] === id); if (i >= 0) intervals.splice(i, 1); },
    addEventListener() {},
    removeEventListener() {},
    Date: { now: () => clock.t },
    vibeScores: {
      session() { calls.push(["session"]); return "sess-1"; },
      record(o) { calls.push(["record", o]); return { rank: 1, entry: { v: o.value, s: o.session } }; },
      finish() { calls.push(["finish"].concat(Array.prototype.slice.call(arguments))); },
      render(el, o) { calls.push(["render", o]); },
      panel() { calls.push(["panel"]); },
      reset() { calls.push(["reset"]); },
      seedOf() { return []; },
    },
    vibeConfirm: () => ({ then() {} }),
  };
  if (random) { const M = Object.create(Math); M.random = random; sandbox.Math = M; }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "minesweeper.html" }).runInContext(sandbox);

  const board = get("board");
  const cell = (i) => board.children[i];
  const fire = (el, type, ev) => (el._listeners[type] || []).slice().forEach((fn) => fn(ev));
  const fireDoc = (type, ev) => (docListeners[type] || []).slice().forEach((fn) => fn(ev));
  const evt = (i, extra) => Object.assign({
    target: cell(i), button: 0, buttons: 1, pointerType: "mouse",
    clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {},
  }, extra || {});

  // Every gesture moves the clock on, the way a real player's does: the game
  // swallows a pointerup landing within 200ms of a chord.
  function tap(i, extra) {
    clock.t += 1000;
    const ev = evt(i, extra);
    fire(board, "pointerdown", ev);
    fire(board, "pointerup", ev);
  }

  return {
    sandbox, calls, clock, board, cell, get,
    tap,
    rightClick(i) { clock.t += 1000; fireDoc("contextmenu", evt(i)); },
    // both-buttons chord: press with 3 buttons down, release over the cell
    chordClick(i) {
      clock.t += 1000;
      fire(board, "mousedown", evt(i, { buttons: 3 }));
      fireDoc("mouseup", evt(i, { buttons: 0 }));
    },
    longPress(i) {
      clock.t += 1000;
      fire(board, "pointerdown", evt(i, { pointerType: "touch" }));
      timeouts.splice(0).forEach(([, fn]) => fn());
      fire(board, "pointerup", evt(i, { pointerType: "touch" }));
    },
    key(k) { fireDoc("keydown", { key: k, preventDefault() {} }); },
    tick() { intervals.slice().forEach(([, fn]) => fn()); },
    open: (i) => cell(i).classList.contains("open"),
    txt: (i) => String(cell(i).textContent),
    has: (i, c) => cell(i).classList.contains(c),
    face: () => String(get("face").textContent),
    title: () => String(get("ovTitle").textContent),
    shown: () => get("overlay").classList.contains("show"),
    mineLed: () => String(get("mines").textContent),
    // Indices the board is currently showing as mines (only true after a loss,
    // which is the game's own way of telling you where they were).
    boomedMines() {
      const out = [];
      for (let i = 0; i < board.children.length; i++) if (String(cell(i).textContent) === "💣") out.push(i);
      return out;
    },
    all(pred) { const out = []; for (let i = 0; i < board.children.length; i++) if (pred(i)) out.push(i); return out; },
  };
}

const col = (i) => i % COLS;

// ---- the board exists at all --------------------------------------------

test("the page builds an easy board and arms it for play", () => {
  const g = load();
  assert.strictEqual(g.board.children.length, ROWS * COLS, "81 cells");
  assert.strictEqual(g.mineLed(), "010", "ten mines left to find");
  assert.strictEqual(g.face(), "🙂");
  assert.ok(g.calls.some((c) => c[0] === "session"), "a scoring session was opened");
});

// ---- first click is never a mine, and never a number ---------------------

test("the first click never hits a mine, even when every die roll says it should", () => {
  // Math.random()===0 means an unguarded shuffle lays the mines on the lowest
  // free indices — exactly where a player clicking the top-left would be.
  for (let i = 0; i < ROWS * COLS; i++) {
    const g = load(zeroRandom);
    g.tap(i);
    assert.ok(g.open(i), "cell " + i + " should open");
    assert.notStrictEqual(g.face(), "😵", "cell " + i + " blew up on the first click");
    assert.notStrictEqual(g.title(), "Boom!", "cell " + i + " blew up on the first click");
  }
});

test("the first click always opens onto empty space, not a number", () => {
  // The ring around the first cell is excluded too, so an opening click always
  // cascades instead of stranding the player on a lone '1'.
  for (let i = 0; i < ROWS * COLS; i++) {
    const g = load();                       // real randomness, 81 fresh games
    g.tap(i);
    assert.strictEqual(g.txt(i), "", "cell " + i + " opened as a number");
    assert.ok(g.all(g.open).length > 1, "cell " + i + " did not cascade");
  }
});

// ---- the rig the layout tests stand on -----------------------------------

test("the rigged layout really lands the mines where the tests say", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);                               // places the mines
  g.tap(WALL[1]);                            // walk into one: the board shows them all
  assert.deepStrictEqual(g.boomedMines(), WALL);
});

// ---- neighbour counts ----------------------------------------------------

test("each number counts the mines touching it", () => {
  // Math.random()===0 with a bottom-right opening puts the ten mines on 0..9:
  // the whole top row plus the cell under its left end. Opening the far corner
  // clears the rest of the board, so every number is on screen at once. The
  // expected digits below are hand-counted from that layout.
  const g = load(zeroRandom);
  g.tap(80);
  assert.deepStrictEqual(g.boomedMines(), [], "nothing should have exploded");
  assert.strictEqual(g.txt(10), "4", "r1c1 touches mines 0,1,2 and 9");
  assert.strictEqual(g.txt(11), "3", "r1c2 touches mines 1,2,3");
  assert.strictEqual(g.txt(14), "3", "r1c5 touches mines 4,5,6");
  assert.strictEqual(g.txt(16), "3", "r1c7 touches mines 6,7,8");
  assert.strictEqual(g.txt(17), "2", "r1c8 is a corner: only 7 and 8");
  assert.strictEqual(g.txt(18), "1", "r2c0 touches mine 9 alone");
  assert.strictEqual(g.txt(19), "1", "r2c1 touches mine 9 alone");
  assert.strictEqual(g.txt(20), "", "r2c2 touches nothing and stays blank");
  assert.strictEqual(g.txt(40), "", "the middle of the board is empty");
});

// ---- the cascade and where it must stop ----------------------------------

test("the cascade fills the open side and stops dead at the numbers", () => {
  // A wall of mines down column 4 (plus a mine in the far corner). Opening the
  // bottom-right corner must clear columns 5-8 and touch nothing beyond.
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  const opened = g.all(g.open);
  assert.ok(opened.every((i) => col(i) >= 5), "the cascade crossed the wall: " + opened.filter((i) => col(i) < 5));
  assert.strictEqual(opened.length, 36, "every cell of columns 5-8, and only those");
  // The boundary itself is revealed as numbers, and does not carry on.
  for (const i of [5, 14, 23, 32, 41, 50, 59, 68, 77]) {
    assert.ok(g.open(i), "column 5 cell " + i + " should be revealed");
    assert.ok(g.txt(i) !== "", "column 5 cell " + i + " should show a number");
  }
  for (const i of WALL) assert.ok(!g.open(i), "mine " + i + " must stay covered");
  assert.ok(!g.shown(), "the game is not over");
});

test("a flag stops the cascade dead and survives it", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.rightClick(60);                          // flag an empty cell in the open half
  assert.strictEqual(g.mineLed(), "009");
  g.tap(SAFE);
  assert.ok(!g.open(60), "the cascade revealed a flagged cell");
  assert.ok(g.has(60, "flag"), "and it is still flagged");
  assert.ok(g.open(59) && g.open(61), "the cascade went around it");
});

// ---- flags gate the reveal ----------------------------------------------

test("a flagged cell cannot be opened by a click, but a '?' can", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  g.rightClick(39);                          // none -> flag
  assert.ok(g.has(39, "flag"));
  assert.strictEqual(g.mineLed(), "009", "the counter says one is spoken for");
  g.tap(39);
  assert.ok(!g.open(39), "a flagged cell opened on a click");
  assert.ok(g.has(39, "flag"), "and it lost its flag doing it");

  g.rightClick(39);                          // flag -> ?
  assert.ok(g.has(39, "q"), "right-click cycles on to a question mark");
  assert.strictEqual(g.mineLed(), "010", "the '?' gives the mine back to the counter");
  g.tap(39);
  assert.ok(g.open(39), "a '?' is a note to self, not a lock");
  assert.strictEqual(g.txt(39), "3", "it touches the three wall mines beside it");
});

test("a long press flags instead of opening", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  g.longPress(39);
  assert.ok(g.has(39, "flag"), "a long press should flag");
  assert.ok(!g.open(39), "and must not also open the cell underneath");
});

// ---- chording ------------------------------------------------------------

test("chording opens the neighbours only once the flags add up", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  g.tap(39);                                 // a lone '3' against the wall
  assert.strictEqual(g.txt(39), "3");
  const rest = [29, 30, 38, 47, 48];         // its non-mine neighbours

  g.rightClick(31); g.rightClick(40);        // two of its three mines flagged
  g.chordClick(39);
  for (const i of rest) assert.ok(!g.open(i), "cell " + i + " opened on a short count");

  g.rightClick(49);                          // now the count matches
  g.chordClick(39);
  for (const i of rest) assert.ok(g.open(i), "cell " + i + " should have been chorded open");
});

test("chording a covered or blank cell does nothing", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  const before = g.all(g.open).length;
  // 39 is covered, and its three mines are flagged: a chord that ignored
  // whether the number is showing would empty the cells around it.
  g.rightClick(31); g.rightClick(40); g.rightClick(49);
  g.chordClick(39);
  assert.ok(!g.open(39), "a covered cell was chorded open");
  for (const i of [29, 30, 38, 47, 48]) assert.ok(!g.open(i), "cell " + i + " opened off a covered number");
  g.chordClick(70);                          // open, but blank
  assert.strictEqual(g.all(g.open).length, before, "a chord with nothing to say opened cells");
});

// ---- losing --------------------------------------------------------------

test("walking into a mine ends the game and shows every mine", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  g.tap(4);                                  // a wall mine
  assert.strictEqual(g.face(), "😵");
  assert.strictEqual(g.title(), "Boom!");
  assert.ok(g.shown(), "the game-over card is up");
  assert.ok(g.has(4, "boom"), "the fatal cell is marked");
  assert.deepStrictEqual(g.boomedMines(), WALL, "every mine is on show");
  assert.ok(g.calls.some((c) => c[0] === "finish" && c[3] === false), "the loss was reported");

  const after = g.all(g.open).length;
  g.tap(60);
  assert.strictEqual(g.all(g.open).length, after, "the board still took a click after game over");
});

// ---- winning -------------------------------------------------------------

test("clearing every safe cell wins, flags the mines and records the time", () => {
  const g = load(zeroRandom);
  g.tap(80);                                 // this layout clears in one click
  assert.strictEqual(g.all(g.open).length, ROWS * COLS - MINES, "every safe cell is open");
  assert.strictEqual(g.face(), "😎");
  assert.strictEqual(g.title(), "Cleared!");
  assert.ok(g.shown(), "the win card is up");
  assert.strictEqual(g.mineLed(), "000", "the counter is emptied");
  for (let i = 0; i < MINES; i++) assert.ok(g.has(i, "flag"), "mine " + i + " is flagged for you");

  const rec = g.calls.find((c) => c[0] === "record");
  assert.ok(rec, "the time was offered to the leaderboard");
  assert.strictEqual(rec[1].game, "mine");
  assert.strictEqual(rec[1].board, "easy");
  assert.strictEqual(rec[1].lower, true, "a lower time is a better time");
  assert.strictEqual(rec[1].session, "sess-1", "tagged with this game's session");
  assert.strictEqual(typeof rec[1].value, "number");
  assert.ok(g.calls.some((c) => c[0] === "finish" && c[3] === true), "the win was reported");
});

test("the clock runs from the first click and stops at the end", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.clock.t += 3000; g.tick();
  assert.strictEqual(String(g.get("time").textContent), "000", "no clock before the first click");
  g.tap(SAFE);
  g.clock.t += 5000; g.tick();
  assert.strictEqual(String(g.get("time").textContent), "005");
  g.tap(4);                                  // boom
  g.clock.t += 9000; g.tick();
  assert.strictEqual(String(g.get("time").textContent), "005", "the clock kept running after the game ended");
});

// ---- a new game really is new -------------------------------------------

test("F2 deals a fresh board", () => {
  const g = load(riggedRandom(WALL, SAFE));
  g.tap(SAFE);
  g.tap(4);
  assert.strictEqual(g.face(), "😵");
  g.key("F2");
  assert.strictEqual(g.face(), "🙂");
  assert.strictEqual(g.mineLed(), "010");
  assert.strictEqual(g.all(g.open).length, 0, "the new board is covered");
  assert.ok(!g.shown(), "and the game-over card is gone");
});
