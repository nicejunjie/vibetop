/* Unit tests for the X11 Launcher's inline script (x11launcher.html).
 *
 *   node --test apps/everyday/x11launcher/x11launcher.test.js
 *
 * Same harness pattern as apps/everyday/browser/xpra-patches.test.js: the REAL
 * inline <script> is pulled out of the shipped HTML and run in a vm sandbox with
 * a minimal fake DOM, a fake fetch and a virtual clock, then the handlers the
 * page installs are driven. No logic is re-implemented here.
 *
 * NOTE on scope: this launcher does NOT parse .desktop entries. It is a command
 * bar (POST /api/x/launch {cmd}) plus a 2s poll of /api/x/windows that renders
 * one tab per live window on :98 — so there is no Name/Exec/Icon or
 * NoDisplay/Hidden handling to test anywhere in the page.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = (() => {
  const html = fs.readFileSync(path.join(__dirname, "x11launcher.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length, "x11launcher.html must carry an inline script");
  return blocks[blocks.length - 1][1];
})();

function selMatch(n, sel) {
  const m = /^(?:\.([\w-]+))?(?:\[([\w-]+)="([^"]*)"\])?$/.exec(String(sel).trim());
  if (!m || (!m[1] && !m[2])) return false;
  if (m[1] && !n._cls.has(m[1])) return false;
  if (m[2] && n.dataset[m[2].replace(/^data-/, "")] !== m[3]) return false;
  return true;
}
function descend(n, out = []) { for (const c of n.childNodes) { out.push(c); descend(c, out); } return out; }
function makeEl(tag) {
  const e = {
    tagName: tag, childNodes: [], parentNode: null, dataset: {}, style: {},
    _txt: "", _cls: new Set(), _ls: {},
    get className() { return [...e._cls].join(" "); },
    set className(v) { e._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add(...c) { c.forEach((x) => e._cls.add(x)); },
      remove(...c) { c.forEach((x) => e._cls.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !e._cls.has(c) : !!f; if (on) e._cls.add(c); else e._cls.delete(c); return on; },
      contains(c) { return e._cls.has(c); },
    },
    get children() { return e.childNodes; },
    get textContent() { return e._txt + e.childNodes.map((c) => c.textContent).join(""); },
    set textContent(v) { e.childNodes.forEach((c) => { c.parentNode = null; }); e.childNodes = []; e._txt = String(v); },
    get innerHTML() { return ""; },
    set innerHTML(v) { e.childNodes.forEach((c) => { c.parentNode = null; }); e.childNodes = []; e._txt = String(v).replace(/<[^>]*>/g, ""); },
    appendChild(c) { c.parentNode = e; e.childNodes.push(c); return c; },
    insertBefore(c, ref) {
      const i = ref ? e.childNodes.indexOf(ref) : -1;
      c.parentNode = e;
      if (i < 0) e.childNodes.push(c); else e.childNodes.splice(i, 0, c);
      return c;
    },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) { e.childNodes.splice(i, 1); c.parentNode = null; } },
    remove() { if (e.parentNode) e.parentNode.removeChild(e); },
    addEventListener(t, fn) { (e._ls[t] = e._ls[t] || []).push(fn); },
    removeEventListener() {},
    closest(sel) { let n = e; while (n) { if (selMatch(n, sel)) return n; n = n.parentNode; } return null; },
    querySelector(sel) { return descend(e).find((n) => selMatch(n, sel)) || null; },
    querySelectorAll(sel) { return descend(e).filter((n) => selMatch(n, sel)); },
    focus() { e.focused = (e.focused || 0) + 1; },
  };
  return e;
}
function fire(target, type, props) {
  const ev = Object.assign({ type, target, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev._stop = true; } }, props);
  let n = target;
  while (n) {
    for (const fn of (n._ls[type] || []).slice()) fn.call(n, ev);
    if (ev._stop) break;
    n = n.parentNode;
  }
  return ev;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function makeHarness(opts = {}) {
  const calls = [];
  const h = { calls, windows: opts.windows || [], onFetch: null, store: Object.assign({}, opts.store) };
  let now = 0, seq = 1;
  const timers = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout(fn, ms) { const id = seq++; timers.push({ id, fn, at: now + (ms || 0) }); return id; },
    clearTimeout(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval(fn, ms) { const id = seq++; timers.push({ id, fn, at: now + (ms || 0), every: ms || 1 }); return id; },
    clearInterval(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    JSON, Math, Date, Object, Array, String, Number, Error, RegExp, Promise, parseInt,
    location: { origin: "https://host.test" },
    localStorage: {
      getItem: (k) => (h.store[k] === undefined ? null : h.store[k]),
      setItem: (k, v) => { h.store[k] = String(v); },
    },
    fetch(url, init) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      const rec = { url, method: (init && init.method) || "GET", body };
      calls.push(rec);
      if (h.onFetch) {
        const r = h.onFetch(rec);
        if (r !== undefined) return r === null ? Promise.reject(new Error("network")) : Promise.resolve(r);
      }
      const json = (o, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(o) });
      if (url === "/api/x/windows") return json({ windows: h.windows });
      return json({ ok: true });
    },
  };
  const ids = ["tabbar", "tabs", "cmd", "run", "canvas", "empty", "launching", "ltxt", "lhint", "ldismiss"];
  h.els = {};
  ids.forEach((id) => { h.els[id] = makeEl("div"); });
  h.els.tabbar.className = "tabbar empty";
  h.els.empty.className = "empty";
  h.els.launching.className = "launching";
  h.els.cmd.value = "";
  const doc = {
    _ls: {}, hidden: false,
    getElementById: (id) => h.els[id] || null,
    createElement: (t) => makeEl(t),
    addEventListener(t, fn) { (doc._ls[t] = doc._ls[t] || []).push(fn); },
    body: makeEl("body"),
  };
  doc.body.insertBefore = (c, ref) => { c.parentNode = doc.body; doc.body.childNodes.unshift(c); return c; };
  sandbox.document = doc;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._wls = {};
  sandbox.addEventListener = (t, fn) => { (sandbox._wls[t] = sandbox._wls[t] || []).push(fn); };

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "x11launcher.html#inline" }).runInContext(sandbox);

  h.doc = doc;
  h.tabsEl = h.els.tabs;
  h.advance = (ms) => {
    const target = now + ms;
    for (let guard = 0; guard < 5000; guard++) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > target) break;
      now = t.at;
      if (t.every) t.at = now + t.every; else timers.shift();
      t.fn();
    }
    now = target;
  };
  h.polls = () => calls.filter((c) => c.url === "/api/x/windows").length;
  h.posts = (url) => calls.filter((c) => c.method === "POST" && c.url === url);
  h.tabIds = () => h.tabsEl.children.map((el) => el.dataset.id);
  h.labels = () => h.tabsEl.children.map((el) => el.querySelector(".lbl").textContent);
  h.activeId = () => (h.tabsEl.children.find((el) => el._cls.has("active")) || { dataset: {} }).dataset.id;
  h.run = (cmd) => { h.els.cmd.value = cmd; fire(h.els.run, "click"); };
  h.message = (data, origin = "https://host.test") => (sandbox._wls.message || []).forEach((fn) => fn({ origin, data }));
  h.visibility = (hidden) => { doc.hidden = hidden; (doc._ls.visibilitychange || []).forEach((fn) => fn()); };
  h.launchingOn = () => h.els.launching._cls.has("on");
  h.launchingErr = () => h.els.launching._cls.has("err");
  h.coach = () => doc.body.childNodes.filter((n) => n._cls.has("coach"));
  h.sandbox = sandbox;
  return h;
}
async function boot(opts) {
  const h = makeHarness(opts);
  await flush();                    // the startPoll() refresh on load
  return h;
}

// --- the canvas + window list --------------------------------------------

test("the page points its canvas at the :98 X11 display", async () => {
  const h = await boot();
  assert.equal(h.els.canvas.src, "/x11-display/");
});

test("one tab per live window, titled, with an untitled fallback", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "GIMP" }, { id: "w2", title: "" }] });
  h.advance(2000); await flush();
  assert.deepEqual(h.tabIds(), ["w1", "w2"]);
  assert.deepEqual(h.labels(), ["GIMP", "(untitled)"]);
  assert.equal(h.els.tabbar._cls.has("empty"), false, "the tab bar shows once something is running");
  assert.ok(h.els.empty._cls.has("hidden"), "the 'nothing running' hint hides");
});

test("no windows means an empty tab bar and the hint back", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "GIMP" }] });
  h.advance(2000); await flush();
  h.windows = [];
  h.advance(2000); await flush();
  assert.deepEqual(h.tabIds(), []);
  assert.ok(h.els.tabbar._cls.has("empty"));
  assert.equal(h.els.empty._cls.has("hidden"), false);
});

test("a newly-appeared window takes focus — however it was started", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "GIMP" }] });
  h.advance(2000); await flush();
  assert.equal(h.activeId(), "w1");
  h.windows = [{ id: "w1", title: "GIMP" }, { id: "w2", title: "gnuplot" }];
  h.advance(2000); await flush();
  assert.equal(h.activeId(), "w2", "a window opened from a Terminal is focused too");
});

test("when the focused window disappears, focus falls back to a surviving one", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "A" }, { id: "w2", title: "B" }] });
  h.advance(2000); await flush();
  assert.equal(h.activeId(), "w2");
  h.windows = [{ id: "w1", title: "A" }];
  h.advance(2000); await flush();
  assert.equal(h.activeId(), "w1");
});

test("clicking a tab activates that window server-side", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "A" }, { id: "w2", title: "B" }] });
  h.advance(2000); await flush();
  fire(h.tabsEl.children[0], "click");
  await flush();
  assert.deepEqual(h.posts("/api/x/activate").map((c) => c.body.id), ["w1"]);
  assert.equal(h.activeId(), "w1");
});

test("the tab's × closes the window and does not also activate it", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "A" }, { id: "w2", title: "B" }] });
  h.advance(2000); await flush();
  fire(h.tabsEl.children[0].querySelector(".x"), "click");
  await flush();
  assert.deepEqual(h.posts("/api/x/close").map((c) => c.body.id), ["w1"]);
  assert.deepEqual(h.posts("/api/x/activate"), [], "× must not fall through to the tab");
});

// --- launching ------------------------------------------------------------

test("Run sends the trimmed command and clears the box on success", async () => {
  const h = await boot();
  h.run("  xterm -fa mono  ");
  await flush();
  assert.deepEqual(h.posts("/api/x/launch").map((c) => c.body.cmd), ["xterm -fa mono"]);
  assert.equal(h.els.cmd.value, "", "the box is ready for the next command");
  assert.ok(h.launchingOn(), "the progress overlay runs until the window appears");
  assert.equal(h.launchingErr(), false);
});

test("Enter in the command box launches too, and an empty command launches nothing", async () => {
  const h = await boot();
  h.els.cmd.value = "";
  fire(h.els.run, "click");
  fire(h.els.cmd, "keydown", { key: "Enter" });
  await flush();
  assert.deepEqual(h.posts("/api/x/launch"), [], "blank input must not be launched");
  assert.equal(h.launchingOn(), false, "and must not show a progress overlay");
  h.els.cmd.value = "xeyes";
  fire(h.els.cmd, "keydown", { key: "Enter" });
  await flush();
  assert.deepEqual(h.posts("/api/x/launch").map((c) => c.body.cmd), ["xeyes"]);
});

test("the overlay clears when a window that was not there before appears", async () => {
  const h = await boot({ windows: [{ id: "w1", title: "already running" }] });
  h.advance(2000); await flush();
  h.run("xeyes"); await flush();
  assert.ok(h.launchingOn());
  h.advance(2000); await flush();                    // same window list — still launching
  assert.ok(h.launchingOn(), "an unchanged window list does not end the launch");
  h.windows = [{ id: "w1", title: "already running" }, { id: "w2", title: "xeyes" }];
  h.advance(2000); await flush();
  assert.equal(h.launchingOn(), false, "the new window ends the launch");
  assert.equal(h.activeId(), "w2");
});

test("a rejected command surfaces the server's reason and keeps what you typed", async () => {
  const h = await boot();
  h.onFetch = (c) => (c.url === "/api/x/launch"
    ? { ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: "command not found: frefox" }) }
    : undefined);
  h.run("frefox");
  await flush();
  assert.ok(h.launchingOn() && h.launchingErr());
  assert.match(h.els.ltxt.textContent, /frefox/);
  assert.equal(h.els.lhint.textContent, "command not found: frefox");
  assert.equal(h.els.cmd.value, "frefox", "a rejected command is not wiped — you can fix it");
  // No window will ever arrive, so a later poll must not clear the error.
  h.windows = [{ id: "w9", title: "something else" }];
  h.advance(2000); await flush();
  assert.ok(h.launchingErr(), "the error stays until dismissed");
});

test("an unreachable server is reported, not left spinning for ever", async () => {
  const h = await boot();
  h.onFetch = (c) => (c.url === "/api/x/launch" ? null : undefined);
  h.run("xeyes");
  await flush();
  assert.ok(h.launchingErr());
  assert.equal(h.els.lhint.textContent, "Could not reach the server.");
  fire(h.els.ldismiss, "click");
  assert.equal(h.launchingOn(), false, "Dismiss clears the overlay");
  assert.equal(h.els.empty._cls.has("hidden"), false, "and the hint comes back");
});

test("a slow launch escalates its hint rather than lying about progress", async () => {
  const h = await boot();
  h.run("gimp"); await flush();
  assert.equal(h.els.lhint.textContent, "Some apps take a few seconds to start.");
  h.advance(25000); await flush();
  assert.match(h.els.lhint.textContent, /Still starting/);
});

// --- polling discipline ---------------------------------------------------

test("polling stops when another app is showing and resumes when we are", async () => {
  const h = await boot();
  h.advance(2000); await flush();
  const before = h.polls();
  h.message({ type: "vibetop:active", active: "terminal" });
  h.advance(6000); await flush();
  assert.equal(h.polls(), before, "no invisible wmctrl polling while another app is up");
  h.message({ type: "vibetop:active", active: "x11launcher" });
  await flush();
  assert.ok(h.polls() > before, "coming back polls immediately");
  const resumed = h.polls();
  h.advance(2000); await flush();
  assert.ok(h.polls() > resumed, "and the 2s poll is running again");
});

test("a hidden tab pauses the poll, and a foreground tab does not resume a background app", async () => {
  const h = await boot();
  h.message({ type: "vibetop:active", active: "terminal" });   // some other app is showing
  h.visibility(true);
  h.visibility(false);                                          // tab foregrounded again
  const before = h.polls();
  h.advance(6000); await flush();
  assert.equal(h.polls(), before, "the launcher must stay paused while it is not the active app");
});

test("a message from another origin is ignored", async () => {
  const h = await boot();
  h.message({ type: "vibetop:active", active: "terminal" }, "https://evil.test");
  const before = h.polls();
  h.advance(2000); await flush();
  assert.ok(h.polls() > before, "a cross-origin message must not be able to stop the poll");
});

// --- the coach banner -----------------------------------------------------

test("the coach tip shows on open, is capped, and a tap silences it for good", async () => {
  const h = await boot();
  h.advance(1200);
  assert.equal(h.coach().length, 1);
  assert.match(h.coach()[0].textContent, /⏻/);
  assert.equal(h.store["vibetop:x11hint:v1"], "1");

  const h3 = await boot({ store: { "vibetop:x11hint:v1": "3" } });
  h3.advance(1200);
  assert.equal(h3.coach().length, 0, "the max-showings cap is respected");

  const h2 = await boot({ store: { "vibetop:x11hint:v1": "1" } });
  h2.advance(1200);
  assert.equal(h2.coach().length, 1);
  fire(h2.coach()[0], "click");
  assert.equal(h2.coach().length, 0);
  assert.equal(h2.store["vibetop:x11hint:v1"], "done");
  const h4 = await boot({ store: { "vibetop:x11hint:v1": "done" } });
  h4.advance(1200);
  assert.equal(h4.coach().length, 0, "dismissed means never again");
});
