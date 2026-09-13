// Update — the in-app updater's state machine and the requests it makes.
//
// This is the most destructive surface in vibetop (it pulls and redeploys the
// host), so every one of these runs the page's REAL inline script in a vm
// sandbox with a stubbed fetch, and asserts on the request the page WOULD have
// sent. Nothing here can reach /api/update: fetch is a recorder.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "update.html"), "utf8");
const SRC = (function () {
  const b = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .filter((s) => s.indexOf("function runUpdate") >= 0);
  assert.strictEqual(b.length, 1, "expected exactly one main inline script");
  return b[0];
})();

function el(tag) {
  const e = {
    tagName: String(tag || "div").toUpperCase(),
    children: [], _attrs: {}, _on: {}, _q: {},
    style: {}, dataset: {},
    value: "", className: "", _text: "", _html: "",
    checked: false, disabled: false, hidden: false,
    addEventListener(t, fn) { (e._on[t] || (e._on[t] = [])).push(fn); },
    removeEventListener() {},
    appendChild(c) { e.children.push(c); return c; },
    setAttribute(k, v) { e._attrs[k] = String(v); },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    querySelector(sel) {
      const k = String(sel);
      if (e._q[k]) return e._q[k];
      if (k[0] === "." && String(e.innerHTML).indexOf(k.slice(1)) >= 0) return (e._q[k] = el("span"));
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return null; },
    // A click on a disabled control does nothing, exactly as in a browser —
    // that IS the mechanism keeping a second update from starting.
    fire(t, ev) {
      if (e.disabled && t === "click") return null;
      const evt = Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev || {});
      (e._on[t] || []).slice().forEach((fn) => fn.call(e, evt));
      return evt;
    },
    // Everything rendered into this element, text and markup alike.
    text() {
      return e._html + e._text + e.children.map((c) => (c.text ? c.text() : String(c.data || ""))).join("");
    },
  };
  Object.defineProperty(e, "textContent", { get() { return e._text; }, set(v) { e._text = String(v); e.children.length = 0; }, enumerable: true });
  Object.defineProperty(e, "innerHTML", {
    get() { return e._html; },
    set(v) { e._html = String(v); e.children.length = 0; e._q = {}; },
    enumerable: true,
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
  const reloads = [];
  // Each route is answered by a function the test supplies; unrouted paths
  // reject, so an unexpected call is loud instead of silently "working".
  const routes = Object.assign({ "/api/update": () => ({ commit: "abc1234", subject: "a commit", date: "2026-09-13", history: [] }) }, opts.routes || {});
  // What the confirm dialog returns, per call. Default: the user says yes.
  const confirms = [];
  const confirmQueue = (opts.confirms || []).slice();

  const doc = {
    hidden: false, _on: {},
    getElementById(id) { return byId[id] || (byId[id] = el("div")); },
    createElement(t) { return el(t); },
    createTextNode(t) { return { data: String(t), text: () => String(t) }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(t, fn) { (doc._on[t] || (doc._on[t] = [])).push(fn); },
    removeEventListener() {},
    documentElement: el("html"),
  };
  doc.body = el("body");

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: doc,
    location: { reload: () => reloads.push("self") },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    Promise, Math, JSON, Object, Array, String, Number, Error, Date,
    fetch(url, opt) {
      opt = opt || {};
      const u = String(url).split("?")[0];
      calls.push({ url: u, raw: String(url), method: opt.method || "GET", body: opt.body, headers: opt.headers || {}, cache: opt.cache });
      const r = routes[u];
      if (!r) return Promise.reject(new Error("no route for " + u));
      const out = r(opt);
      if (out && out.__reject) return Promise.reject(new Error("network"));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(out) });
    },
    vibeConfirm(message, o) {
      const answer = confirmQueue.length ? confirmQueue.shift() : true;
      confirms.push({ message: String(message), opts: o || {}, answer });
      return Promise.resolve(answer);
    },
    vibeAlert() {},
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = { location: { reload: () => reloads.push("top") } };
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "update.html" }).runInContext(sandbox);
  return {
    S: sandbox, byId, calls, confirms, timers, reloads, doc,
    id: (x) => doc.getElementById(x),
    route: (p, fn) => { routes[p] = fn; },
    answer: (v) => confirmQueue.push(v),
    runTimers: () => { const due = timers.splice(0); due.forEach((t) => t.fn()); },
    settle: () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r)))),
    posts: () => calls.filter((c) => c.method === "POST"),
  };
}

// ---- idle: reading the installed version --------------------------------

test("the page opens by READING the version — it never starts an update on its own", async () => {
  const h = load();
  await h.settle();
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.calls[0].url, "/api/update");
  assert.strictEqual(h.calls[0].method, "GET", "opening the app must not POST anything");
  assert.strictEqual(h.calls[0].cache, "no-store", "the version must never come from cache");
  assert.ok(/_=\d+/.test(h.calls[0].raw), "and is cache-busted in the URL too");
  assert.strictEqual(h.id("v-commit").textContent, "#abc1234");
  assert.strictEqual(h.id("v-subject").textContent, "a commit");
  assert.strictEqual(h.posts().length, 0);
});

test("an unreachable API leaves a readable message where the version goes", async () => {
  const h = load({ routes: { "/api/update": () => ({ __reject: true }) } });
  await h.settle();
  assert.strictEqual(h.id("v-commit").textContent, "could not read version");
});

test("a host with no git metadata shows the error, not a blank commit", async () => {
  const h = load({ routes: { "/api/update": () => ({ error: "not a git checkout" }) } });
  await h.settle();
  assert.strictEqual(h.id("v-commit").textContent, "not a git checkout");
  assert.ok(/No updates recorded yet/.test(h.id("history").innerHTML), "and an empty history says so");
});

// ---- checking is read-only ----------------------------------------------

test("Check for update POSTs only to the read-only check endpoint", async () => {
  const h = load({ routes: { "/api/update/check": () => ({ ok: true, behind: 2, commits: [{ commit: "aaa", subject: "one" }, { commit: "bbb", subject: "two" }] }) } });
  await h.settle();
  h.id("check-btn").fire("click");
  assert.ok(h.id("check-btn").disabled && h.id("update-btn").disabled, "both buttons are held while the probe runs");
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)), ["/api/update/check"]);
  assert.ok(h.calls.every((c) => !(c.url === "/api/update" && c.method === "POST")), "a check must never apply anything");
  assert.ok(/2 updates available/.test(h.id("check-result").innerHTML));
  assert.ok(h.id("update-btn").classList.contains("has-update"), "the Update button pulses once there is something to install");
  assert.ok(h.id("check-result").classList.contains("avail"));
  assert.ok(!h.id("check-btn").disabled && !h.id("update-btn").disabled, "and both buttons come back");
});

test("an up-to-date host says so and stops the Update button pulsing", async () => {
  const h = load({ routes: { "/api/update/check": () => ({ ok: true, behind: 0 }) } });
  await h.settle();
  h.id("update-btn").classList.add("has-update");
  h.id("check-btn").fire("click");
  await h.settle();
  assert.ok(/latest version/.test(h.id("check-result").innerHTML));
  assert.ok(h.id("check-result").classList.contains("latest"));
  assert.ok(!h.id("update-btn").classList.contains("has-update"));
});

test("a check that fails renders the error instead of claiming you are current", async () => {
  const h = load({ routes: { "/api/update/check": () => ({ ok: false, message: "github unreachable" }) } });
  await h.settle();
  h.id("check-btn").fire("click");
  await h.settle();
  assert.ok(h.id("check-result").classList.contains("err"));
  assert.ok(/github unreachable/.test(h.id("check-result").innerHTML));
  assert.ok(!h.id("update-btn").classList.contains("has-update"));
});

test("a commit subject from GitHub is escaped before it is spliced in", async () => {
  const h = load({ routes: { "/api/update/check": () => ({ ok: true, behind: 1, commits: [{ commit: "a<b", subject: '<img src=x onerror="x()">' }] }) } });
  await h.settle();
  h.id("check-btn").fire("click");
  await h.settle();
  const html = h.id("check-result").innerHTML;
  assert.ok(html.indexOf("<img") < 0, "no raw tag from a commit subject");
  assert.ok(html.indexOf("&lt;img") >= 0 && html.indexOf("a&lt;b") >= 0);
});

// ---- updating -----------------------------------------------------------

test("Update now asks first, and a cancelled confirm sends NOTHING", async () => {
  const h = load({ confirms: [false] });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.confirms.length, 1, "the destructive action is confirmed");
  assert.match(h.confirms[0].message, /GitHub/);
  assert.strictEqual(h.posts().length, 0, "declining must not POST /api/update");
});

test("a confirmed update POSTs force:false as JSON, and holds both buttons while it runs", async () => {
  let release;
  const pending = new Promise((r) => { release = r; });
  const h = load({ routes: { "/api/update": (opt) => (opt.method === "POST" ? pending : { commit: "abc1234", history: [] }) } });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  const post = h.posts()[0];
  assert.strictEqual(post.url, "/api/update");
  assert.deepStrictEqual(JSON.parse(post.body), { force: false }, "a normal update never forces");
  assert.strictEqual(post.headers["Content-Type"], "application/json");
  assert.ok(h.id("update-btn").disabled && h.id("check-btn").disabled, "both controls are locked in flight");
  assert.ok(/Updating/.test(h.id("status").textContent));
  assert.strictEqual(h.id("status").className, "status run");
  // A second press while it runs cannot start a second update.
  h.id("update-btn").fire("click");
  h.id("check-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 1, "no second update may be started while one is in flight");
  release({ ok: true, message: "Done.", changed: ["shell"], restart: false, log: [{ name: "git pull", ok: true, output: "x" }] });
  await h.settle();
  assert.ok(!h.id("update-btn").disabled, "the buttons come back when it finishes");
});

test("a successful update renders its log, re-reads the version and schedules the desktop reload", async () => {
  const h = load({
    routes: {
      "/api/update": (opt) => (opt.method === "POST"
        ? { ok: true, message: "Updated.", changed: ["shell", "terminal"], restart: false, log: [{ name: "git pull", ok: true, output: "Updating 1..2" }, { name: "deploy", ok: true, output: "" }] }
        : { commit: "def5678", subject: "new", history: [] }),
    },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  const steps = h.id("log").children;
  assert.strictEqual(steps.length, 2);
  assert.strictEqual(steps[0].className, "step ok");
  assert.ok(/git pull/.test(steps[0].text()));
  assert.strictEqual(h.id("status").className, "status ok");
  assert.strictEqual(h.id("v-commit").textContent, "#def5678", "the installed version is re-read afterwards");
  // The countdown is a timer, not an immediate navigation.
  assert.strictEqual(h.reloads.length, 0);
  assert.ok(/Reloading the desktop in 3s/.test(h.id("status").textContent));
});

test("a failed update is shown as failed, with the failing step, and nothing reloads", async () => {
  const h = load({
    routes: { "/api/update": (opt) => (opt.method === "POST"
      ? { ok: false, message: "Update failed.", log: [{ name: "git pull", ok: true, output: "" }, { name: "deploy", ok: false, output: "permission denied" }] }
      : { commit: "abc1234", history: [] }) },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.id("status").className, "status err");
  assert.ok(!/Reload the desktop/.test(h.id("status").textContent), "a failure must not claim success");
  const steps = h.id("log").children;
  assert.strictEqual(steps[1].className, "step err");
  assert.ok(/deploy {2}— failed/.test(steps[1].text()));
  assert.ok(/permission denied/.test(steps[1].text()));
  h.runTimers();
  assert.strictEqual(h.reloads.length, 0, "nothing may reload after a failed update");
});

test("an update that changes nothing does not reload the desktop", async () => {
  const h = load({
    routes: { "/api/update": (opt) => (opt.method === "POST"
      ? { ok: true, message: "Already up to date.", changed: [], restart: false, log: [] }
      : { commit: "abc1234", history: [] }) },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  h.runTimers(); h.runTimers();
  assert.strictEqual(h.reloads.length, 0, "'already up to date' must not bounce every open desktop");
});

test("when the manager restarts, the reload waits for it to come back", async () => {
  const h = load({
    routes: { "/api/update": (opt) => (opt.method === "POST"
      ? { ok: true, message: "Updated.", changed: ["server"], restart: true, log: [] }
      : { commit: "abc1234", history: [] }) },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  assert.ok(/reconnecting/.test(h.id("status").textContent));
  const waits = h.timers.map((t) => t.ms).sort((a, b) => a - b);
  assert.ok(waits[0] >= 5000, "it gives the restarting manager real time: " + waits.join(","));
  assert.strictEqual(h.reloads.length, 0, "and does not reload into a dead API");
});

test("a dropped request during the update is reported, not left spinning", async () => {
  const h = load({ routes: { "/api/update": (opt) => (opt.method === "POST" ? { __reject: true } : { commit: "abc1234", history: [] }) } });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.id("status").className, "status err");
  assert.match(h.id("status").textContent, /Request failed/);
  assert.ok(!h.id("update-btn").disabled && !h.id("check-btn").disabled, "the buttons are usable again");
});

// ---- held back by local edits -------------------------------------------

test("an update held back by local changes shows them and does NOT force by itself", async () => {
  const h = load({
    routes: { "/api/update": (opt) => (opt.method === "POST"
      ? { ok: false, blocked: "dirty", dirty: " M server/terminal-manager.py", log: [] }
      : { commit: "abc1234", history: [] }) },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 1, "being blocked must not auto-retry with force");
  assert.ok(h.id("blocked").classList.contains("show"));
  assert.ok(/terminal-manager\.py/.test(h.id("blocked").text()), "the user is told what is in the way");
  assert.strictEqual(h.id("status").className, "status err");
});

test("discarding local changes is confirmed again before force:true is sent", async () => {
  let blocked = true;
  const h = load({
    confirms: [true, false],
    routes: { "/api/update": (opt) => (opt.method === "POST"
      ? (blocked ? { ok: false, blocked: "dirty", dirty: " M x", log: [] } : { ok: true, message: "Updated.", changed: [], log: [] })
      : { commit: "abc1234", history: [] }) },
  });
  await h.settle();
  h.id("update-btn").fire("click");
  await h.settle();
  const discard = h.id("blocked").children.filter((c) => c.className === "btn-danger")[0];
  assert.ok(discard, "there is a discard button");
  // First press: the user says no at the second confirm.
  discard.fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 1, "declining the stash confirm must send nothing");
  // Second press: they confirm.
  blocked = false;
  discard.fire("click");
  await h.settle();
  const last = h.posts()[h.posts().length - 1];
  assert.strictEqual(h.posts().length, 2);
  assert.deepStrictEqual(JSON.parse(last.body), { force: true }, "only an explicit confirm may force");
  assert.match(h.confirms[h.confirms.length - 1].message, /stashed/);
});

// ---- history ------------------------------------------------------------

test("the update history renders each kind of event", async () => {
  const h = load({
    routes: { "/api/update": () => ({ commit: "abc1234", history: [
      { event: "deployed", to: "aaa1111", subject: "first install", time: 1757000000 },
      { event: "updated", from: "aaa1111", to: "bbb2222", time: 1757100000, commits: [{ commit: "bbb2222", subject: "a change" }] },
      { event: "failed", message: "deploy step failed", time: 1757200000 },
    ] }) },
  });
  await h.settle();
  const items = h.id("history").children;
  assert.strictEqual(items.length, 3);
  const text = items.map((i) => i.text());
  assert.ok(/Deployed {2}#aaa1111/.test(text[0]) && /first install/.test(text[0]));
  assert.ok(/#aaa1111 → #bbb2222/.test(text[1]) && /a change/.test(text[1]));
  assert.ok(/Update failed/.test(text[2]) && /deploy step failed/.test(text[2]));
  assert.deepStrictEqual(items.map((i) => i.className), ["hist-item evt-deployed", "hist-item evt-updated", "hist-item evt-failed"]);
});

test("clearing the history is confirmed, and only then POSTed", async () => {
  const h = load({ confirms: [false, true], routes: { "/api/update/history/clear": () => ({ ok: true }) } });
  await h.settle();
  h.id("hist-clear").fire("click");
  await h.settle();
  assert.strictEqual(h.posts().length, 0, "declining clears nothing");
  h.id("hist-clear").fire("click");
  await h.settle();
  assert.deepStrictEqual(h.posts().map((c) => String(c.url)), ["/api/update/history/clear"]);
  assert.ok(h.confirms[0].opts.danger, "and it is presented as a destructive action");
});
