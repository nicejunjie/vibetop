// Klondike rules, driven through the REAL solitaire.html.
//
// The page's game is one strict IIFE with no exports — not a single function is
// reachable by name from outside. So this suite does what a player does: it runs
// the real inline script in a vm over a fake DOM and then *plays*, firing the
// pointerdown/pointermove/pointerup the page itself listens for. Every rule
// assertion below is the shipped canToTab / canToFoundation / tryMove / draw /
// checkWin / undo deciding, never a copy of the rule written here — a copy would
// keep passing after the page drifts.
//
// The one thing the harness controls is the shuffle: Math.random is fed the
// exact Fisher-Yates draws that turn the page's own deck into the layout a test
// needs, so the deal is the page's deal and the cards are ours.
//
// Mutation proof: SOL_MUTATE="old==>new" patches the extracted script in memory
// (never the file) so each test can be shown to go red on a broken rule.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "solitaire.html"), "utf8");

// The page has two inline scripts (a one-line embedded-detection probe and the
// game); the game is the big one.
const INLINE = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let SRC = INLINE.sort((a, b) => b.length - a.length)[0];
assert.ok(SRC.includes("function canToTab"), "found the game script");

if (process.env.SOL_MUTATE) {
  const [from, to] = process.env.SOL_MUTATE.split("==>");
  assert.ok(SRC.includes(from), "mutation anchor present: " + from);
  SRC = SRC.split(from).join(to === undefined ? "" : to);
}

// ---------------------------------------------------------------- fake DOM ---
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUIT = ["♠", "♥", "♦", "♣"];
const name = (c) => RANK[c.r] + SUIT[c.s];

function mkStyle() {
  const s = {};
  Object.defineProperty(s, "setProperty", { value: (k, v) => { s[k] = v; }, enumerable: false });
  return s;
}
function parseSel(sel) {
  const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attr = sel.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
  return { classes, attr: attr ? [attr[1].replace(/^data-/, ""), attr[2]] : null };
}
class El {
  constructor(tag) {
    this.tagName = tag; this.className = ""; this.style = mkStyle();
    this.dataset = {}; this.childNodes = []; this.parentNode = null;
    this._html = ""; this._text = ""; this._h = {};
  }
  get children() { return this.childNodes; }
  get offsetWidth() { return 60; }
  get clientWidth() { return this.__cw !== undefined ? this.__cw : 700; }
  get clientHeight() { return this.__ch !== undefined ? this.__ch : 400; }
  get classList() {
    const self = this;
    const list = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add(...cs) { const l = list(); cs.forEach((c) => { if (!l.includes(c)) l.push(c); }); self.className = l.join(" "); },
      remove(...cs) { self.className = list().filter((c) => !cs.includes(c)).join(" "); },
      contains(c) { return list().includes(c); },
    };
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; this._html = String(v); }
  get innerHTML() { return this._html; }
  appendChild(n) {
    if (n && n.__frag) { n.childNodes.slice().forEach((c) => this.appendChild(c)); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.push(n); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  matches(sel) {
    const { classes, attr } = parseSel(sel);
    const mine = this.className.split(/\s+/);
    if (!classes.every((c) => mine.includes(c))) return false;
    if (attr) {
      const v = this.dataset[attr[0]];
      if (v === undefined) return false;
      if (attr[1] !== undefined && String(v) !== attr[1]) return false;
    }
    return true;
  }
  closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => n.childNodes.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); }
  removeEventListener() {}
  cloneNode() {
    const c = new El(this.tagName);
    c.className = this.className; c._html = this._html; c._text = this._text;
    Object.assign(c.dataset, this.dataset); Object.assign(c.style, this.style);
    this.childNodes.forEach((k) => c.appendChild(k.cloneNode(true)));
    return c;
  }
  // Geometry the page reads: 7 columns 60px wide on a 70px pitch, the top row at
  // y=0..84 and the tableau at y=100..500. A card inherits its column's x and
  // offsets down by its own style.top, exactly as the real layout does.
  getBoundingClientRect() {
    const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
    const p = this.parentNode;
    if (this.__row) return this.__row === "top" ? R(0, 0, 7 * 70, 84) : R(0, 100, 7 * 70, 400);
    if (p && p.__row) { const i = p.childNodes.indexOf(this); return p.__row === "top" ? R(i * 70, 0, 60, 84) : R(i * 70, 100, 60, 400); }
    const base = p && p.getBoundingClientRect ? p.getBoundingClientRect() : R(0, 0, 0, 0);
    return R(base.left, base.top + (parseFloat(this.style.top) || 0), 60, 84);
  }
}

// ------------------------------------------------------------- the shuffle ---
const ALL = [];
for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) ALL.push({ r, s });
const idxOf = (c) => c.s * 13 + c.r - 1;

// Fisher-Yates draws that turn the page's freshly-built deck into `target`.
// target[51] is popped first by deal(), target[0..23] stay as the stock.
function randsFor(target) {
  assert.strictEqual(target.length, 52, "a full deck");
  const cur = ALL.map((_, i) => i);
  const want = target.map(idxOf);
  assert.strictEqual(new Set(want).size, 52, "every card exactly once");
  const out = [];
  for (let i = 51; i >= 1; i--) {
    const j = cur.indexOf(want[i]);
    assert.ok(j >= 0 && j <= i);
    out.push((j + 0.5) / (i + 1));           // floor(rand*(i+1)) === j
    const t = cur[i]; cur[i] = cur[j]; cur[j] = t;
  }
  return out;
}

// Build the 52-card deck for a layout.
//   spec.tab[p]  : cards for the TOP of pile p (last entry is the face-up card)
//   spec.draw    : the order cards come off the stock
// Everything unspecified is filled from whatever is left.
function deckFor(spec) {
  const taken = new Set();
  const take = (c) => { const k = idxOf(c); assert.ok(!taken.has(k), "card used twice: " + name(c)); taken.add(k); return c; };
  (spec.tab || []).forEach((pile) => (pile || []).forEach(take));
  (spec.draw || []).forEach(take);
  const pool = ALL.filter((c) => !taken.has(idxOf(c)));
  let pi = 0;
  const piles = [];
  for (let p = 0; p < 7; p++) {
    const given = (spec.tab && spec.tab[p]) || [];
    const pile = [];
    while (pile.length < p + 1 - given.length) pile.push(pool[pi++]);   // face-down filler
    piles.push(pile.concat(given));
  }
  const deck = new Array(52);
  let n = 0;
  for (let p = 0; p < 7; p++) for (let k = 0; k <= p; k++) deck[51 - n++] = piles[p][k];
  const draw = (spec.draw || []).slice().reverse();                     // last entry drawn first
  const stock = [];
  while (stock.length < 24 - draw.length) stock.push(pool[pi++]);
  for (let i = 0; i < 24; i++) deck[i] = stock.concat(draw)[i];
  return deck;
}

// ------------------------------------------------------------------- load ----
function load(spec) {
  const ids = ["table", "toprow", "tabrow", "moves", "overlay", "confetti", "dragLayer", "helpOv",
    "ovMsg", "scores", "newBtn", "ovNew", "undoBtn", "lbOv", "lbBody", "lbBtn", "ovLb", "lbX",
    "lbReset", "helpBtn", "helpX"];
  const byId = {};
  ids.forEach((id) => { byId[id] = new El("div"); byId[id].dataset.id = id; });
  byId.table.__cw = 700; byId.table.__ch = 500;
  byId.toprow.__row = "top"; byId.tabrow.__row = "tab";
  byId.table.appendChild(byId.toprow); byId.table.appendChild(byId.tabrow);
  byId.table.appendChild(byId.overlay); byId.table.appendChild(byId.helpOv); byId.table.appendChild(byId.lbOv);
  byId.overlay.appendChild(byId.confetti); byId.overlay.appendChild(byId.ovMsg);

  const timers = []; let tid = 1;
  const body = new El("body");
  const docEl = new El("html");
  const scores = [];
  let clock = 1e6;
  const rands = randsFor(deckFor(spec || {}));
  let ri = 0;

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { timers.push([tid, fn]); return tid++; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t[0] === id); if (i >= 0) timers.splice(i, 1); },
    requestAnimationFrame: (fn) => { timers.push([tid, fn]); return tid++; },
    localStorage: { getItem: () => "1", setItem() {} },
    vibeConfirm: () => Promise.resolve(false),
    vibeScores: {
      session: () => { scores.push(["session"]); return "sess-1"; },
      record: (o) => { scores.push(["record", o]); return { rank: 1, entry: { v: o.value } }; },
      finish: (...a) => scores.push(["finish", ...a]),
      render: () => {}, panel: () => {}, reset: () => {}, seedOf: () => null,
    },
    _h: {},
    addEventListener(t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    removeEventListener() {},
  };
  const M = Object.create(Math);
  M.random = () => (ri < rands.length ? rands[ri++] : 0.5);
  sandbox.Math = M;
  const D = Object.create(Date);
  D.now = () => clock;
  sandbox.Date = D;
  sandbox.document = {
    getElementById: (id) => byId[id] || null,
    createElement: (t) => new El(t),
    createDocumentFragment: () => { const f = new El("frag"); f.__frag = true; return f; },
    documentElement: docEl,
    body,
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "solitaire.html" }).runInContext(sandbox);

  const flush = () => { for (let i = 0; i < 60 && timers.length; i++) timers.splice(0).forEach(([, fn]) => fn()); };
  flush();                                              // settle the deal cascade

  const fire = (el, type, ev) => (el._h[type] || []).forEach((fn) => fn(ev));
  const win = (type, ev) => (sandbox._h[type] || []).forEach((fn) => fn(ev));
  const pev = (x, y, target) => ({ clientX: x, clientY: y, target, pointerType: "mouse", preventDefault() {} });

  // ---- reading the table back out of the rendered DOM ----
  const cardName = (el) => {
    if (el.classList.contains("down")) return "##";
    const cor = el.querySelector(".cor");
    return cor ? cor.innerHTML.replace("<br>", "") : "?";
  };
  const tabEls = (p) => byId.tabrow.children[p].querySelectorAll(".pc");
  const tabPile = (p) => tabEls(p).map(cardName);
  const foundTop = (f) => { const e = byId.toprow.children[3 + f].querySelector(".pc"); return e ? cardName(e) : null; };
  const wasteEl = () => byId.toprow.children[1].querySelector(".pc");
  const wasteTop = () => { const e = wasteEl(); return e ? cardName(e) : null; };
  const stockEl = () => byId.toprow.children[0].childNodes[0];
  const stockEmpty = () => stockEl().classList.contains("slot");
  const state = () => JSON.stringify({
    t: [0, 1, 2, 3, 4, 5, 6].map(tabPile),
    f: [0, 1, 2, 3].map(foundTop),
    w: wasteTop(), stockEmpty: stockEmpty(), m: byId.moves.textContent,
  });

  // ---- gestures ----
  function press(el, x, y) { fire(byId.table, "pointerdown", pev(x, y, el)); }
  // Drag `el` so its top-left lands on (L,T): the press point rides the card.
  function dragTo(el, L, T) {
    const r = el.getBoundingClientRect();
    press(el, r.left + 5, r.top + 5);
    win("pointermove", pev(L + 5, T + 5));
    win("pointerup", pev(L + 5, T + 5));
    flush();
  }
  const toTab = (el, p) => dragTo(el, p * 70, 100);
  const toFound = (el, f) => dragTo(el, (3 + f) * 70, 0);
  function tap(el) {
    clock += 10;
    const r = el.getBoundingClientRect();
    press(el, r.left + 2, r.top + 2);
    win("pointerup", pev(r.left + 2, r.top + 2));
    flush();
  }
  const dtap = (el) => { tap(el); tap(el); };
  const click = (id) => { fire(byId[id], "click", {}); flush(); };
  const drawStock = () => { tap(stockEl()); };

  return { byId, state, tabPile, tabEls, foundTop, wasteTop, wasteEl, stockEl, stockEmpty,
           toTab, toFound, tap, dtap, click, drawStock, flush, scores, sandbox,
           won: () => byId.overlay.classList.contains("show") };
}

const c = (r, s) => ({ r, s });
const SP = 0, HE = 1, DI = 2, CL = 3;   // suit indices, as the page numbers them

// ------------------------------------------------------------------ tests ----

test("the page deals a real Klondike table", () => {
  const g = load({});
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map((p) => g.tabPile(p).length), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual([0, 1, 2, 3].map(g.foundTop), [null, null, null, null]);
  assert.strictEqual(g.wasteTop(), null);
  assert.strictEqual(g.stockEmpty(), false);
  // only the last card of each pile is face-up
  for (let p = 0; p < 7; p++) {
    const pile = g.tabPile(p);
    assert.ok(pile[pile.length - 1] !== "##", "pile " + p + " top is face up");
    assert.ok(pile.slice(0, -1).every((x) => x === "##"), "the rest are face down");
  }
  assert.ok(!g.won());
});

test("a card moves onto a tableau pile only one rank down and in the other colour", () => {
  // pile 0: 6♥ (red). pile 6: 7♠ (black) — the legal home for it.
  const legal = load({ tab: [[c(6, HE)], , , , , , [c(7, SP)]] });
  const before = legal.state();
  legal.toTab(legal.tabEls(0)[0], 6);
  assert.strictEqual(legal.tabPile(6).slice(-1)[0], "6♥", "red six onto the black seven");
  assert.deepStrictEqual(legal.tabPile(0), [], "and it left its own pile");
  assert.notStrictEqual(legal.state(), before);

  // same rank gap, same colour: 6♠ onto 7♠ is not a move.
  const colour = load({ tab: [[c(6, SP)], , , , , , [c(7, SP)]] });
  const b2 = colour.state();
  colour.toTab(colour.tabEls(0)[0], 6);
  assert.strictEqual(colour.state(), b2, "black on black must not move");
  assert.deepStrictEqual(colour.tabPile(0), ["6♠"]);

  // right colour, wrong rank: 5♥ is two under the 7♠.
  const rank = load({ tab: [[c(5, HE)], , , , , , [c(7, SP)]] });
  const b3 = rank.state();
  rank.toTab(rank.tabEls(0)[0], 6);
  assert.strictEqual(rank.state(), b3, "a two-rank gap must not move");

  // and the same rank is not "one lower" either
  const same = load({ tab: [[c(7, HE)], , , , , , [c(7, SP)]] });
  const b4 = same.state();
  same.toTab(same.tabEls(0)[0], 6);
  assert.strictEqual(same.state(), b4, "equal ranks must not move");
});

test("only a King fills an empty column", () => {
  // pile 0 is a lone Ace: send it to a foundation and the column is empty.
  const king = load({ tab: [[c(1, SP)], [c(9, CL), c(13, HE)]] });
  king.toFound(king.tabEls(0)[0], 0);
  assert.deepStrictEqual(king.tabPile(0), [], "column 0 is empty");
  assert.strictEqual(king.foundTop(0), "A♠");
  king.toTab(king.tabEls(1).slice(-1)[0], 0);
  assert.deepStrictEqual(king.tabPile(0), ["K♥"], "the King took the empty column");
  assert.strictEqual(king.tabPile(1).length, 1);

  const queen = load({ tab: [[c(1, SP)], [c(9, CL), c(12, HE)]] });
  queen.toFound(queen.tabEls(0)[0], 0);
  const before = queen.state();
  queen.toTab(queen.tabEls(1).slice(-1)[0], 0);
  assert.strictEqual(queen.state(), before, "a Queen may not take an empty column");
  assert.deepStrictEqual(queen.tabPile(0), []);
});

test("a foundation takes an Ace, then that suit in order, and nothing else", () => {
  const g = load({ tab: [[c(1, SP)], [c(9, CL), c(3, SP)], [c(9, DI), c(9, HE), c(2, HE)],
                         [c(8, CL), c(8, DI), c(8, HE), c(2, SP)]] });
  g.toFound(g.tabEls(0)[0], 0);
  assert.strictEqual(g.foundTop(0), "A♠", "an Ace starts an empty foundation");

  const afterAce = g.state();
  g.toFound(g.tabEls(1).slice(-1)[0], 0);        // 3♠ — right suit, wrong rank
  assert.strictEqual(g.state(), afterAce, "a three may not sit on an Ace");
  g.toFound(g.tabEls(2).slice(-1)[0], 0);        // 2♥ — right rank, wrong suit
  assert.strictEqual(g.state(), afterAce, "the wrong suit may not sit on the Ace");

  g.toFound(g.tabEls(3).slice(-1)[0], 0);        // 2♠ — the only legal one
  assert.strictEqual(g.foundTop(0), "2♠", "the next rank of the same suit is taken");

  // a non-Ace onto an EMPTY foundation is refused too
  const empty = g.state();
  g.toFound(g.tabEls(1).slice(-1)[0], 1);        // 3♠ onto empty foundation 1
  assert.strictEqual(g.state(), empty, "an empty foundation only takes an Ace");
});

test("the stock deals through and recycles without losing or duplicating a card", () => {
  const g = load({});
  const first = [];
  for (let i = 0; i < 24; i++) {
    assert.strictEqual(g.stockEmpty(), false, "stock still has cards at draw " + i);
    g.drawStock();
    first.push(g.wasteTop());
  }
  assert.strictEqual(g.stockEmpty(), true, "24 draws empty the stock");
  assert.strictEqual(new Set(first).size, 24, "24 distinct cards came off the stock");

  g.drawStock();                                   // the ↻ redeal
  assert.strictEqual(g.stockEmpty(), false, "the waste went back under the stock");
  assert.strictEqual(g.wasteTop(), null, "and the waste is empty again");

  const second = [];
  for (let i = 0; i < 24; i++) { g.drawStock(); second.push(g.wasteTop()); }
  assert.deepStrictEqual(second, first, "the same 24 cards, in the same order, after a recycle");
  assert.strictEqual(g.stockEmpty(), true);
});

test("undo puts the table back exactly as it was", () => {
  const g = load({ tab: [[c(6, HE)], , , , , , [c(7, SP)]] });
  const before = g.state();
  g.toTab(g.tabEls(0)[0], 6);
  assert.notStrictEqual(g.state(), before, "the move landed");
  g.click("undoBtn");
  assert.strictEqual(g.state(), before, "undo restored the snapshot");
  assert.strictEqual(g.byId.moves.textContent, "0 moves");

  // a draw is undoable too, and undo stops at the start of the deal
  g.drawStock();
  const drawn = g.state();
  assert.notStrictEqual(drawn, before);
  g.click("undoBtn");
  assert.strictEqual(g.state(), before, "the draw came back");
  g.click("undoBtn");
  assert.strictEqual(g.state(), before, "an empty undo stack is harmless");
});

test("the win is declared only when all 52 cards are home", () => {
  // A deal that solves itself by foundation moves alone: each tableau pile is a
  // contiguous run of the play order with its earliest card on top, and the
  // stock comes off in order behind it.
  const order = [];
  for (let r = 1; r <= 13; r++) for (let s = 0; s < 4; s++) order.push(c(r, s));
  const tab = []; let n = 0;
  for (let p = 0; p < 7; p++) { tab.push(order.slice(n, n + p + 1).reverse()); n += p + 1; }
  const g = load({ tab, draw: order.slice(28) });

  assert.ok(!g.won(), "a fresh deal is not a win");
  let guard = 0;
  while (!g.won() && guard++ < 300) {
    const tops = [];
    for (let p = 0; p < 7; p++) { const e = g.tabEls(p); if (e.length) tops.push(e[e.length - 1]); }
    if (g.wasteEl()) tops.push(g.wasteEl());
    let moved = false;
    for (const el of tops) {
      const b = g.state();
      g.dtap(el);                                  // double-tap = send to foundation
      if (g.state() !== b) { moved = true; break; }
    }
    if (!moved) {
      assert.ok(!g.won(), "not a win while cards are still out");
      if (g.stockEmpty() && !g.wasteEl()) break;
      g.drawStock();
    }
  }
  assert.ok(g.won(), "the solved deal is declared a win (took " + guard + " rounds)");
  assert.deepStrictEqual([0, 1, 2, 3].map(g.foundTop).sort(), ["K♠", "K♣", "K♥", "K♦"].sort());
  assert.ok(/^Solved in \d+ moves\./.test(g.byId.ovMsg.textContent), g.byId.ovMsg.textContent);

  const rec = g.scores.find((s) => s[0] === "record");
  assert.ok(rec, "the win is offered to the leaderboard");
  assert.strictEqual(rec[1].game, "sol");
  assert.strictEqual(rec[1].lower, true);
  assert.ok(rec[1].value > 0 && rec[1].session === "sess-1");
  assert.ok(g.scores.some((s) => s[0] === "finish" && s[3] === true), "and recorded as a finished game");
});

test("a deal opens a scoring session and a redeal closes the old one", () => {
  const g = load({});
  assert.deepStrictEqual(g.scores[0], ["session"]);
  g.scores.length = 0;
  g.click("newBtn");
  assert.deepStrictEqual(g.scores[0], ["finish", "sol", "", false], "the abandoned deal is not a win");
  assert.deepStrictEqual(g.scores[1], ["session"], "and a new session starts");
});
