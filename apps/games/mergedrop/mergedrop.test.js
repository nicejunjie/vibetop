// Merge Drop, driven through the REAL page code (mergedrop.html's inline
// script, run in a vm with a stub DOM — see the harness below). The physics is
// exercised as shipped: no constant or formula is copied in here.
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

const PAGE = process.env.VTMERGE_SRC || path.join(__dirname, "mergedrop.html");
const EXPORT = "{ step: step, drop: drop, addBall: addBall, newGame: newGame," +
  " ICONS: ICONS, RADII: RADII, POINTS: POINTS, BOX_W: BOX_W, BOX_H: BOX_H, LINE: LINE," +
  " aim: function (x) { aimX = x; }, hold: function (l) { held = l; }," +
  " st: function () { return { balls: balls, score: score, state: state, topLevel: topLevel," +
  " danger: danger, cool: cool }; } }";

function run(g, secs) { for (let t = 0; t < secs; t += 1 / 60) g.step(1 / 60); }

test("the animal ladder matches the leaderboard's copy in gamescore.js", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const GS = fs.readFileSync(path.join(__dirname, "..", "..", "..", "shared", "gamescore.js"), "utf8");
  const m = GS.match(/var MERGE_ICONS = (\[[^\]]*\]);/);
  assert.ok(m, "gamescore.js still declares MERGE_ICONS");
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), Array.from(g.ICONS));
  assert.equal(g.RADII.length, g.ICONS.length);
  assert.equal(g.POINTS.length, g.ICONS.length);
});

test("two of a kind touching become one of the next kind, and score", () => {
  const { g, els } = loadGame(PAGE, EXPORT);
  g.addBall(150, 400, 2); g.addBall(170, 400, 2);
  g.step(1 / 60);
  const s = g.st();
  assert.equal(s.balls.length, 1);
  assert.equal(s.balls[0].l, 3);
  assert.equal(s.score, g.POINTS[3]);
  assert.equal(s.topLevel, 3);
  assert.equal(els.score.textContent, g.POINTS[3]);
});

test("different kinds do not merge — they are pushed apart", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const a = g.addBall(150, 400, 2), b = g.addBall(160, 400, 3);
  run(g, 2);
  const s = g.st();
  assert.equal(s.balls.length, 2);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d >= a.r + b.r - 1, "no longer overlapping (d=" + d + ")");
});

test("a dropped ball falls and comes to rest on the floor", () => {
  const { g } = loadGame(PAGE, EXPORT);
  g.hold(4); g.aim(100);
  assert.ok(g.drop());
  run(g, 3);
  const b = g.st().balls[0];
  assert.ok(Math.abs(b.y - (g.BOX_H - b.r)) < 1, "resting on the floor (y=" + b.y + ")");
  assert.ok(Math.abs(b.y - b.py) < 0.01 && Math.abs(b.x - b.px) < 0.01, "and still");
});

test("dropping has a cooldown, and the aim is clamped inside the box", () => {
  const { g } = loadGame(PAGE, EXPORT);
  g.hold(5); g.aim(-500);
  assert.ok(g.drop());
  assert.ok(!g.drop(), "a second drop right away is refused");
  const b = g.st().balls[0];
  assert.equal(b.x, b.r, "clamped to the left wall");
  run(g, 0.5);
  g.aim(9999);
  assert.ok(g.drop());
  const c = g.st().balls[1];
  assert.equal(c.x, g.BOX_W - c.r);
});

test("a big pile settles: inside the box, no deep overlaps, at rest", () => {
  const { g } = loadGame(PAGE, EXPORT);
  // distinct-ish levels so the pile mostly stays a pile instead of merging away
  const lv = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 1, 2, 3, 4, 0, 2, 4];
  lv.forEach((l, i) => { g.hold(l); g.aim(30 + ((i * 97) % 300)); g.drop(); run(g, 0.5); });
  run(g, 6);
  const s = g.st();
  let worst = 0, moving = 0;
  for (const a of s.balls) {
    assert.ok(a.x >= a.r - 0.5 && a.x <= g.BOX_W - a.r + 0.5, "inside the walls");
    assert.ok(a.y <= g.BOX_H - a.r + 0.5, "above the floor");
    moving = Math.max(moving, Math.hypot(a.x - a.px, a.y - a.py));
    for (const b of s.balls) if (a !== b) worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
  }
  assert.ok(worst < 3, "deepest overlap " + worst.toFixed(2));
  assert.ok(moving < 0.2, "settled (max per-step motion " + moving.toFixed(3) + ")");
  assert.ok(s.score > 0, "some merges happened along the way");
});

test("two whales merge into nothing and a 100-point bonus", () => {
  const { g } = loadGame(PAGE, EXPORT);
  const top = g.ICONS.length - 1;
  g.addBall(120, 400, top); g.addBall(200, 400, top);
  g.step(1 / 60);
  assert.equal(g.st().balls.length, 0);
  assert.equal(g.st().score, 100);
});

test("a ball resting over the line ends the game; a fresh drop passing it does not", () => {
  const { g, sandbox, runTimers, els } = loadGame(PAGE, EXPORT);
  const y = g.LINE - 30;
  const hold = (b) => { b.x = b.px = 180; b.y = b.py = y; };
  const fresh = g.addBall(180, y, 6);           // born just now
  for (let i = 0; i < 50; i++) { hold(fresh); g.step(1 / 60); }
  assert.equal(g.st().state, "play", "under a second old: still falling, not stuck");
  fresh.born = -10;
  for (let i = 0; i < 60 && g.st().state === "play"; i++) { hold(fresh); g.step(1 / 60); }
  assert.ok(g.st().danger > 0.5 && g.st().state === "play", "warning before the end");
  for (let i = 0; i < 120 && g.st().state === "play"; i++) { hold(fresh); g.step(1 / 60); }
  assert.equal(g.st().state, "over");
  runTimers();
  assert.ok(els.overlay.classList.contains("show"));
  assert.equal(sandbox.window.vibeScores.stats("merge", "").n, 1);
});
