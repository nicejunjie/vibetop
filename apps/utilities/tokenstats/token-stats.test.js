// Token Stats — the maths and formatting between the API payload and what the
// user reads.
//
// The page's inline <script> is loaded into a vm sandbox and its OWN functions
// are called; nothing here re-implements a formula, so a drift in the shipped
// one shows up as a failure instead of two copies agreeing with each other.
// fetch is stubbed and every call is recorded — this page is an admin surface
// and a test must never reach /api/claude/stats for real.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "token-stats.html"), "utf8");
const SRC = (function () {
  const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = blocks.filter((b) => b.indexOf("function niceScale") >= 0);
  assert.strictEqual(main.length, 1, "expected exactly one main inline script");
  return main[0];
})();

// ---- a minimal DOM: only what this page touches --------------------------
function el(tag) {
  const e = {
    tagName: String(tag || "div").toUpperCase(),
    children: [], _attrs: {}, _on: {}, _q: {},
    style: {}, dataset: {},
    value: "", className: "", _text: "", _html: "",
    checked: false, disabled: false, hidden: false, clientWidth: 900,
    addEventListener(t, fn) { (e._on[t] || (e._on[t] = [])).push(fn); },
    removeEventListener(t, fn) { const a = e._on[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    appendChild(c) { e.children.push(c); return c; },
    setAttribute(k, v) { e._attrs[k] = String(v); },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    querySelector() { return null; },
    querySelectorAll() { return e.children; },
    closest() { return null; },
    fire(t, ev) {
      const evt = Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev || {});
      (e._on[t] || []).slice().forEach((fn) => fn.call(e, evt));
    },
  };
  // Assigning innerHTML replaces the subtree, exactly as the real DOM does —
  // without that, a re-render appends to the previous one and a "list cleared"
  // assertion passes on a list that was never cleared.
  Object.defineProperty(e, "innerHTML", {
    get() { return e._html; },
    set(v) { e._html = String(v); e.children.length = 0; e._q = {}; },
    enumerable: true,
  });
  Object.defineProperty(e, "textContent", {
    get() { return e._text; }, set(v) { e._text = String(v); }, enumerable: true,
  });
  e.classList = {
    add(c) { if (!e.classList.contains(c)) e.className = (e.className + " " + c).trim(); },
    remove(c) { e.className = e.className.split(/\s+/).filter((x) => x && x !== c).join(" "); },
    toggle(c, on) { const want = on === undefined ? !e.classList.contains(c) : !!on; want ? e.classList.add(c) : e.classList.remove(c); },
    contains(c) { return e.className.split(/\s+/).indexOf(c) >= 0; },
  };
  return e;
}

function load(opts) {
  opts = opts || {};
  const byId = {};
  const calls = [];
  const timers = [];
  const doc = {
    hidden: false, _on: {},
    getElementById(id) { return byId[id] || (byId[id] = el("div")); },
    createElement(t) { return el(t); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { (doc._on[t] || (doc._on[t] = [])).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (doc._on[t] || []).slice().forEach((fn) => fn.call(doc, Object.assign({ preventDefault() {} }, ev || {}))); },
  };
  doc.body = el("body");

  // Every response is supplied by the test; nothing leaves the process.
  // Default: the API is unreachable. Tests that only exercise pure helpers then
  // never depend on a payload, and nothing ever leaves the process.
  const responder = opts.responder || (() => ({ ok: false, status: 0, json: () => Promise.resolve({}) }));
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: doc,
    innerWidth: opts.innerWidth || 1200,
    location: { origin: "https://host.test" },
    setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    Promise, Date, Math, JSON, Object, Array, String, Number, Error,
    fetch(url, opt) {
      calls.push({ url: String(url), method: (opt && opt.method) || "GET", opt: opt || {} });
      return Promise.resolve(responder(String(url), opt || {}));
    },
    addEventListener(t, fn) { (sandbox._on[t] || (sandbox._on[t] = [])).push(fn); },
    _on: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "token-stats.html" }).runInContext(sandbox);
  return { S: sandbox, byId, calls, timers, doc };
}

const okJson = (obj) => ({ ok: true, status: 200, json: () => Promise.resolve(obj) });
// A shaped-but-empty stats payload, the same shape the manager returns.
function emptyStats() {
  const z = { in: 0, out: 0, cw: 0, cr: 0, tokens: 0, cost: 0, req: 0 };
  return {
    updated: 1700000000, windows: { today: { ...z }, yesterday: { ...z }, d7: { ...z }, d30: { ...z }, all: { ...z } },
    byDay: [], byHour: [], byModel: [], sessions: 0, activeDays: 0, firstDay: null, spanDays: 0, cacheHitRate: 0,
  };
}

// ---- formatting ----------------------------------------------------------

test("fmtTok switches unit exactly at each 1000x threshold", () => {
  const { S } = load();
  assert.strictEqual(S.fmtTok(999), "999");
  assert.strictEqual(S.fmtTok(1000), "1.0K");
  assert.strictEqual(S.fmtTok(1500), "1.5K");
  assert.strictEqual(S.fmtTok(999999), "1000.0K");
  assert.strictEqual(S.fmtTok(2.5e6), "2.5M");
  assert.strictEqual(S.fmtTok(3e9), "3.00B");
  assert.strictEqual(S.fmtTok(0), "0");
  assert.strictEqual(S.fmtTok(null), "0", "a missing count must read 0, not 'null'");
});

test("axisCost prints round tick labels, not raw floats", () => {
  const { S } = load();
  assert.strictEqual(S.axisCost(0), "$0");
  assert.strictEqual(S.axisCost(2.5), "$2.5");
  assert.strictEqual(S.axisCost(100), "$100");
  assert.strictEqual(S.axisCost(1500), "$1.5k");
  assert.strictEqual(S.axisCost(12000), "$12k");
});

test("middleEllipsis keeps both ends and never exceeds the budget", () => {
  const { S } = load();
  assert.strictEqual(S.middleEllipsis("short", 10), "short");
  const out = S.middleEllipsis("claude-opus-5-20260101-preview", 12);
  assert.strictEqual(out.length, 12);
  assert.ok(out.indexOf("…") > 0 && out.indexOf("…") < out.length - 1, "ellipsis in the middle");
  assert.ok(out.startsWith("claude"), "keeps the identifying head");
  assert.ok(out.endsWith("view"), "keeps the tail that distinguishes variants");
  assert.strictEqual(S.middleEllipsis(null, 5), "", "a missing model name must not print 'null'");
});

test("a model's colour follows its tier, and any Codex/GPT row gets the teal", () => {
  const { S } = load();
  assert.strictEqual(S.tier("claude-haiku-4-5"), "haiku");
  assert.strictEqual(S.tier("claude-sonnet-4"), "sonnet");
  assert.strictEqual(S.tier("mythos-preview"), "fable");
  assert.strictEqual(S.tier("claude-opus-5"), "opus");
  assert.strictEqual(S.tier(""), "opus", "unknown falls back to opus, not undefined");
  assert.strictEqual(S.color("Codex · gpt-5"), "#34a8a0");
  assert.strictEqual(S.color("gpt-4o"), "#34a8a0");
  assert.strictEqual(S.color("claude-haiku-4-5"), "#34a853");
  assert.notStrictEqual(S.color("Claude · claude-opus-5"), S.color("Codex · gpt-5"),
    "the two providers must not draw in the same colour");
});

// ---- the axis maths ------------------------------------------------------

test("niceScale rounds up to a natural step and always spans 0..max", () => {
  const { S } = load();
  for (const raw of [0.3, 7, 37, 260, 1234, 99999]) {
    const sc = S.niceScale(raw);
    assert.ok(sc.max >= raw, `${raw}: the axis must contain the data`);
    assert.strictEqual(sc.ticks[0], 0, "the axis starts at zero");
    assert.ok(Math.abs(sc.ticks[sc.ticks.length - 1] - sc.max) < 1e-9, "the last tick is the max");
    assert.ok(sc.ticks.length >= 3 && sc.ticks.length <= 7, `${raw}: ${sc.ticks.length} ticks is not a readable axis`);
  }
  assert.deepStrictEqual([...S.niceScale(37).ticks], [0, 10, 20, 30, 40]);
  assert.strictEqual(S.niceScale(0).max, 1, "an all-zero day must not produce a 0-height axis (÷0)");
});

test("the x-axis thins its labels when the element is too narrow to hold them", () => {
  const { S, doc } = load();
  const axis = doc.getElementById("dayAxis");
  const labels = () => (axis.innerHTML.match(/<i /g) || []).length;
  axis.clientWidth = 900;
  S.buildXAxis("dayAxis", 30, 7, (i) => "May " + i, false, 52);
  assert.strictEqual(labels(), 7, "a wide axis gets the full tick count");
  axis.clientWidth = 120;      // a phone
  S.buildXAxis("dayAxis", 30, 7, (i) => "May " + i, false, 52);
  assert.strictEqual(labels(), 2, "a narrow axis keeps only the two ends");
  // and one <span> cell per bar either way, so labels line up with the bars
  assert.strictEqual((axis.innerHTML.match(/<span/g) || []).length, 30);
  S.buildXAxis("dayAxis", 0, 7, () => "x", false, 52);
  assert.strictEqual(axis.innerHTML, "", "no data means no axis, not NaN ticks");
});

// ---- combining the two providers ----------------------------------------

test("combine sums the windows and keeps each provider's share for the stack", () => {
  const { S } = load();
  const mk = (cost, tokens, extra) => Object.assign({ in: 1, out: 2, cw: 0, cr: 3, tokens, cost, req: 4 }, extra || {});
  const claude = {
    updated: 200, windows: { today: mk(1.005, 100), yesterday: mk(0, 0), d7: mk(2, 200), d30: mk(3, 300), all: mk(4, 400) },
    byDay: [Object.assign(mk(1, 10), { date: "2026-09-01" })], byHour: [Object.assign(mk(1, 10), { h: 5 })],
    byModel: [{ model: "claude-opus-5", cost: 1, req: 1 }], sessions: 2, activeDays: 3, firstDay: "2026-08-01", spanDays: 10, cacheHitRate: 1,
  };
  const codex = {
    updated: 100, windows: { today: mk(2.0001, 50), yesterday: mk(0, 0), d7: mk(1, 100), d30: mk(1, 100), all: mk(1, 100) },
    byDay: [Object.assign(mk(4, 40), { date: "2026-09-01" })], byHour: [Object.assign(mk(4, 40), { h: 5 })],
    byModel: [{ model: "gpt-5", cost: 9, req: 1 }], sessions: 1, activeDays: 1, firstDay: "2026-07-01", spanDays: 4, cacheHitRate: 0,
  };
  const c = S.combine(claude, codex);
  assert.strictEqual(c.windows.today.tokens, 150);
  assert.strictEqual(c.windows.today.cost, 3.0051, "cost is summed and rounded to 4dp, not floated");
  assert.strictEqual(c.updated, 100, "'updated' is the OLDER of the two — the data is only as fresh as its stalest half");
  assert.deepStrictEqual(c.byDay[0].claudeCost, 1);
  assert.deepStrictEqual(c.byDay[0].codexCost, 4);
  assert.strictEqual(c.byDay[0].cost, 5, "the stacked bar's total is the sum of its halves");
  assert.strictEqual(c.byDay[0].date, "2026-09-01", "the date survives the merge");
  assert.deepStrictEqual([...c.byModel.map((m) => m.model)], ["Codex · gpt-5", "Claude · claude-opus-5"],
    "models are prefixed by provider and sorted by cost, dearest first");
  assert.strictEqual(c.firstDay, "2026-07-01", "the span starts at the EARLIER first day");
  assert.strictEqual(c.sessions, 3);
  // 400 all-tokens at 100% vs 100 at 0% → token-weighted, not a flat average.
  assert.ok(Math.abs(c.cacheHitRate - 0.8) < 1e-9, "the cache hit rate is weighted by token volume");
});

test("combine survives a provider with no history at all", () => {
  const { S } = load();
  const c = S.combine(emptyStats(), emptyStats());
  assert.strictEqual(c.cacheHitRate, 0, "0 tokens must not divide by zero");
  assert.strictEqual(c.byDay.length, 0);
  assert.strictEqual(c.firstDay, null);
});

// ---- the page as it actually runs ----------------------------------------

test("the page loads both providers read-only and renders the combined view", async () => {
  const seen = [];
  const { S, byId, calls } = load({
    responder: (url) => { seen.push(url); return okJson(emptyStats()); },
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(calls.map((c) => c.url).sort(), ["/api/claude/stats", "/api/codex/stats"]);
  assert.ok(calls.every((c) => c.method === "GET"), "reading stats must never POST");
  assert.ok(calls.every((c) => c.opt.cache === "no-store"), "stats must not come from cache");
  assert.strictEqual(byId.pageTitle.textContent, "Combined usage");
  assert.ok(/cache hit 0%/.test(byId.cacheStat.textContent));
  assert.strictEqual(byId.refresh.textContent, "↻ refresh", "the button resets after the load settles");
});

test("a failed stats fetch degrades to a message instead of a blank page", async () => {
  const { byId } = load({ responder: () => ({ ok: false, status: 500, json: () => Promise.resolve({}) }) });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(byId.sub.textContent, "Failed to load stats.");
  assert.strictEqual(byId.refresh.textContent, "↻ refresh", "and the refresh button is usable again");
});

test("switching provider re-renders from the data already held — no refetch", async () => {
  const { S, byId, calls } = load({ responder: () => okJson(emptyStats()) });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const before = calls.length;
  const tabs = byId.providerTabs;
  const btn = el("button"); btn.dataset.provider = "codex"; btn.closest = () => btn;
  tabs.querySelectorAll = () => [btn];
  tabs.fire("click", { target: btn });
  assert.strictEqual(byId.pageTitle.textContent, "Codex usage");
  assert.strictEqual(calls.length, before, "a tab switch must not hit the API again");
  assert.strictEqual(byId.dayLegend.hidden, true, "the Claude/Codex legend is only for the combined view");
});

test("the day chart switches between cost and tokens without refetching", async () => {
  const { S, byId, calls } = load({
    responder: () => okJson(Object.assign(emptyStats(), {
      byDay: [{ date: "2026-09-01", cost: 2, tokens: 1000, claudeCost: 2, codexCost: 0, claudeTokens: 1000, codexTokens: 0 }],
    })),
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.ok(/\$2\.00/.test(byId.dayBars.innerHTML), "cost mode labels the bar in dollars");
  const before = calls.length;
  const b = el("button"); b.dataset.m = "tokens"; b.closest = () => b;
  byId.daymode.querySelectorAll = () => [b];
  byId.daymode.fire("click", { target: b });
  assert.ok(/1\.0K tok/.test(byId.dayBars.innerHTML), "token mode relabels the same bar");
  assert.strictEqual(calls.length, before, "a mode switch is client-side only");
});

test("a hostile model name is escaped before it reaches innerHTML", () => {
  const { S, byId } = load();
  S.renderModels([{ model: '<img src=x onerror="boom()">', cost: 1, req: 1, in: 1, out: 1, cr: 1 }]);
  assert.ok(byId.modelRows.innerHTML.indexOf("<img") < 0, "no raw tag may be spliced in");
  assert.ok(byId.modelRows.innerHTML.indexOf("&lt;img") >= 0);
});

test("no usage at all renders an empty-state row, not an empty table", () => {
  const { S, byId } = load();
  S.renderModels([]);
  assert.ok(/No usage recorded yet/.test(byId.modelRows.innerHTML));
});
