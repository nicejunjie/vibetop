// Stack, driven through the REAL page code (stack.html's inline script, run in
// a vm with a stub DOM — see the harness below). Nothing here re-implements the
// cut maths; a copied formula would keep passing after the shipped one drifted.
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

const PAGE = process.env.VTSTACK_SRC || path.join(__dirname, "stack.html");
const EXPORT = "{ settle: settle, drop: drop, step: step, newGame: newGame," +
  " st: function () { return { tower: tower, cur: cur, state: state, combo: combo, perfects: perfects }; } }";

test("settle: exact-ish is perfect, an offset is cut, no overlap is a miss", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const top = { x: 100, w: 100 };
  const p = g.settle(top, { x: 103, w: 100 });
  assert.ok(p.perfect, "within the perfect tolerance");
  assert.deepEqual({ ...p.block }, { x: 100, w: 100 });
  assert.equal(p.cut, null);

  const right = g.settle(top, { x: 130, w: 100 });
  assert.ok(!right.perfect);
  assert.deepEqual({ ...right.block }, { x: 130, w: 70 });
  assert.deepEqual({ ...right.cut }, { x: 200, w: 30 });

  const left = g.settle(top, { x: 60, w: 100 });
  assert.deepEqual({ ...left.block }, { x: 100, w: 60 });
  assert.deepEqual({ ...left.cut }, { x: 60, w: 40 });

  assert.ok(g.settle(top, { x: 200, w: 100 }).miss, "touching edges is not overlap");
  assert.ok(g.settle(top, { x: -20, w: 100 }).miss, "fully left of the top is a miss");
  assert.equal(g.settle(top, { x: 50, w: 100 }).miss, undefined, "partial overlap is not a miss");
});

test("dropping builds the tower, trims it, and keeps the score + best", () => {
  const { g, els, store } = loadGame(PAGE, EXPORT);
  let s = g.st();
  const base = s.tower[0];
  s.cur.x = base.x + 20;                    // 20 off: cut, no perfect
  g.drop();
  s = g.st();
  assert.equal(s.tower.length, 2);
  assert.equal(s.tower[1].w, base.w - 20);
  assert.equal(s.combo, 0);
  assert.equal(els.score.textContent, 1);
  assert.equal(store.get("vt-stack-best"), "1");
  assert.equal(s.cur.w, s.tower[1].w, "the next block is as wide as the new top");
});

test("three perfects in a row grow the block back", () => {
  const { g } = loadGame(PAGE, EXPORT);
  let s = g.st();
  s.cur.x = s.tower[0].x + 30; g.drop();      // shrink first so there is room to grow
  const narrow = g.st().tower[1].w;
  for (let i = 0; i < 3; i++) { s = g.st(); s.cur.x = s.tower[s.tower.length - 1].x; g.drop(); }
  s = g.st();
  assert.equal(s.combo, 3);
  assert.equal(s.perfects, 3);
  assert.equal(s.tower[2].w, narrow, "perfect #1 keeps the width");
  assert.equal(s.tower[3].w, narrow, "perfect #2 keeps the width");
  assert.ok(s.tower[4].w > narrow, "perfect #3 grows it");
});

test("a complete miss ends the game and records it once", () => {
  const { g, els, sandbox, runTimers } = loadGame(PAGE, EXPORT);
  let s = g.st();
  s.cur.x = s.tower[0].x + 20; g.drop();
  s = g.st();
  s.cur.x = 290;                               // far right of a 160-wide-ish top
  s.tower[s.tower.length - 1].x = 0;
  g.drop();
  assert.equal(g.st().state, "over");
  g.drop();                                    // taps after the end do nothing
  assert.equal(g.st().tower.length, 2);
  runTimers();
  assert.ok(els.overlay.classList.contains("show"));
  const VS = sandbox.window.vibeScores;
  assert.equal(VS.stats("stack", "").n, 1);
  assert.deepEqual(Array.from(VS.list({ game: "stack" }), (e) => e.v), [1]);
});

test("the moving block bounces between its bounds", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const s = g.st();
  const d0 = s.cur.dir;
  for (let i = 0; i < 400; i++) g.step(0.016);
  assert.ok(s.cur.x >= -s.cur.w * 0.6 - 1e-9 && s.cur.x <= 300 - s.cur.w * 0.4 + 1e-9);
  let flipped = false;
  for (let i = 0; i < 400 && !flipped; i++) { g.step(0.016); if (s.cur.dir !== d0) flipped = true; }
  assert.ok(flipped, "it turned around");
});
