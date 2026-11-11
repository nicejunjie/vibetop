// Slice, driven through the REAL page code (slice.html's inline script, run in
// a vm with a stub DOM — see the harness below).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// --- harness: run the page's REAL inline game script in a vm with a stub DOM.
// The page has no exports, so ONE line is spliced in before its boot() call to
// hand the closure's functions out; the splice asserts its anchor, so a
// restructured page fails loudly here instead of quietly testing nothing.
function loadGame(htmlPath, exportExpr, opts) {
  opts = opts || {};
  const HTML = fs.readFileSync(htmlPath, "utf8");
  const blocks = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).filter((s) => s.includes("function boot()"));
  assert.strictEqual(blocks.length, 1, "exactly one inline block owns the game");
  const ANCHOR = "\n  boot();\n";
  assert.strictEqual(blocks[0].split(ANCHOR).length - 1, 1, "the boot() kickoff anchor is unique");
  const src = blocks[0].replace(ANCHOR, "\n  window.__g = " + exportExpr + ";\n  boot();\n");

  const store = new Map();
  const noop = () => {};
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: noop });
      if (k === "measureText") return () => ({ width: 10 });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const els = {};
  function makeEl(id) {
    const cls = new Set();
    return {
      id, style: {}, dataset: {}, textContent: "", innerHTML: "", width: 0, height: 0,
      clientWidth: opts.w || 390, clientHeight: opts.h || 700, tagName: "DIV",
      listeners: {},
      classList: {
        add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
        contains: (c) => cls.has(c), toggle: (c, f) => ((f ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)),
      },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      getContext: () => ctx2d,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: opts.w || 390, height: opts.h || 700 }),
      setPointerCapture: noop, appendChild: noop, querySelectorAll: () => [], remove: noop,
    };
  }
  const docListeners = {};
  const document = {
    documentElement: makeEl("html"), head: makeEl("head"), hidden: false,
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
    createElement: () => makeEl(""),
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  const window = {
    devicePixelRatio: 1, addEventListener: noop, parent: null,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
    },
  };
  window.parent = window;
  const rafs = [];
  const sandbox = {
    window, document, localStorage: window.localStorage, navigator: {},
    requestAnimationFrame: (fn) => rafs.push(fn),
    setTimeout: (fn) => { sandbox.__timers.push(fn); return 1; }, clearTimeout: noop,
    MutationObserver: function () { this.observe = noop; },
    vibeConfirm: () => Promise.resolve(false),
    Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, Promise,
    __timers: [],
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const GS = fs.readFileSync(path.join(__dirname, "..", "..", "..", "shared", "gamescore.js"), "utf8");
  new vm.Script(GS, { filename: "gamescore.js" }).runInContext(sandbox);
  window.vibeScores = sandbox.window.vibeScores;
  sandbox.vibeScores = window.vibeScores;
  new vm.Script(src, { filename: path.basename(htmlPath) + " inline" }).runInContext(sandbox);
  return { g: window.__g, els, store, sandbox, docListeners, runTimers() { const t = sandbox.__timers.splice(0); t.forEach((f) => f()); } };
}
// --- end harness

const PAGE = process.env.VTSLICE_SRC || path.join(__dirname, "slice.html");
const EXPORT = "{ segHits: segHits, slice: slice, step: step, spawn: spawn, newGame: newGame," +
  " st: function () { return { items: items, halves: halves, lives: lives, score: score, state: state," +
  " combo: combo, maxCombo: maxCombo, sliced: sliced, W: W, H: H }; } }";

// Park an item at a spot, motionless, so a swipe can be aimed at it.
function park(g, kind, x, y) {
  const it = g.spawn(kind);
  it.x = x; it.y = y; it.vx = 0; it.vy = 0;
  return it;
}

test("segHits: the segment, not the infinite line, decides", () => {
  const { g } = loadGame(PAGE, EXPORT);
  assert.ok(g.segHits(0, 0, 100, 0, 50, 10, 12));
  assert.ok(!g.segHits(0, 0, 100, 0, 50, 20, 12));
  assert.ok(!g.segHits(0, 0, 100, 0, 130, 0, 12), "past the end of the stroke");
  assert.ok(g.segHits(0, 0, 100, 0, 108, 0, 12), "within r of the endpoint");
  assert.ok(g.segHits(5, 5, 5, 5, 0, 0, 8), "a zero-length segment is a point");
});

test("a swipe through a fruit slices it once and scores", () => {
  const { g, els, store } = loadGame(PAGE, EXPORT);
  const it = park(g, "fruit", 200, 300);
  assert.equal(g.slice(100, 300, 300, 300), 1);
  assert.ok(it.dead);
  assert.equal(g.slice(100, 300, 300, 300), 0, "a dead fruit is not sliced twice");
  const s = g.st();
  assert.equal(s.score, 1);
  assert.equal(s.halves.length, 2);
  assert.equal(els.score.textContent, 1);
  assert.equal(store.get("vt-slice-best"), "1");
  g.step(0.016);
  assert.equal(g.st().items.length, 0, "the sliced fruit leaves play");
});

test("three in one stroke is a combo worth a bonus", () => {
  const { g } = loadGame(PAGE, EXPORT);
  park(g, "fruit", 100, 300); park(g, "fruit", 200, 300); park(g, "fruit", 300, 300);
  g.slice(50, 300, 150, 300); g.slice(150, 300, 250, 300); g.slice(250, 300, 350, 300);
  assert.equal(g.st().score, 3);
  g.step(0.3);                                 // the combo window closes
  const s = g.st();
  assert.equal(s.score, 6, "3 fruit + a 3-point combo bonus");
  assert.equal(s.maxCombo, 3);
  assert.equal(s.combo, 0);
});

test("two separate cuts are not a combo", () => {
  const { g } = loadGame(PAGE, EXPORT);
  park(g, "fruit", 100, 300);
  g.slice(50, 300, 150, 300);
  g.step(0.3);
  park(g, "fruit", 200, 300);
  g.slice(150, 300, 250, 300);
  g.step(0.3);
  assert.equal(g.st().score, 2);
  assert.equal(g.st().maxCombo, 1);
});

test("touching a bomb ends the game and records it", () => {
  const { g, els, sandbox, runTimers } = loadGame(PAGE, EXPORT);
  park(g, "fruit", 100, 300);
  park(g, "bomb", 200, 300);
  g.slice(50, 300, 250, 300);
  const s = g.st();
  assert.equal(s.state, "over");
  assert.equal(s.score, 1);
  assert.equal(g.slice(0, 0, 400, 700), 0, "no slicing after the end");
  runTimers();
  assert.ok(els.overlay.classList.contains("show"));
  assert.equal(els.ovIcon.textContent, "💥");
  const VS = sandbox.window.vibeScores;
  assert.equal(VS.stats("slice", "").n, 1);
  assert.deepEqual(Array.from(VS.list({ game: "slice" }), (e) => e.v), [1]);
});

test("a dropped fruit costs a life; a dropped bomb does not; three is the end", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const H = g.st().H;
  const fall = (kind) => { const it = park(g, kind, 100, H + 200); it.vy = 10; g.step(0.001); };
  fall("bomb");
  assert.equal(g.st().lives, 3);
  fall("fruit"); assert.equal(g.st().lives, 2);
  fall("fruit"); assert.equal(g.st().lives, 1);
  assert.equal(g.st().state, "play");
  fall("fruit");
  assert.equal(g.st().lives, 0);
  assert.equal(g.st().state, "over");
});

test("a launched fruit rises into view and falls back out", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const { W, H } = g.st();
  for (let n = 0; n < 30; n++) {
    const it = g.spawn("fruit");
    let top = Infinity, steps = 0;
    while (g.st().items.includes(it) && steps++ < 2000) { g.step(0.01); top = Math.min(top, it.y); }
    assert.ok(top > 0 && top < H * 0.6, "peaked on screen (top=" + top + ")");
    assert.ok(it.x > -it.r && it.x < W + it.r, "came down roughly on screen");
    g.newGame();
  }
});
