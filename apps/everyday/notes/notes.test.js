/* Unit tests for the Notes app's inline script (notes.html).
 *
 *   node --test apps/everyday/notes/notes.test.js
 *
 * The page has no module boundary, so this loads the REAL inline <script> out of
 * the shipped HTML into a vm sandbox with a minimal fake DOM + a fake fetch, and
 * drives the handlers the page itself installs (input, click, the 2s tick
 * interval). Nothing here re-implements the page's logic: a copied debounce or a
 * copied URL regex would keep passing after notes.html drifted.
 *
 * What is pinned: the shared tab set converges (a disagreement settles instead of
 * ping-ponging — the bug family the Files app's tab sync had), autosave debounces
 * and never silently drops content when a save fails, and the link scanner keeps
 * a balanced trailing ')'.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = path.join(__dirname, "notes.html");
const SRC = (() => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length, "notes.html must carry an inline script");
  return blocks[blocks.length - 1][1];
})();

// --- the smallest DOM the page actually touches ---------------------------
function selMatch(n, sel) {
  const m = /^(?:\.([\w-]+))?(?:\[([\w-]+)="([^"]*)"\])?$/.exec(String(sel).trim());
  if (!m || (!m[1] && !m[2])) return false;
  if (m[1] && !n._cls.has(m[1])) return false;
  if (m[2]) {
    const k = m[2];
    const v = k === "data-id" ? n.dataset.id : k === "contenteditable" ? n.contentEditable : undefined;
    if (v !== m[3]) return false;
  }
  return true;
}
function descend(n, out = []) {
  for (const c of n.childNodes) { out.push(c); descend(c, out); }
  return out;
}
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
    set innerHTML(v) {
      e.childNodes.forEach((c) => { c.parentNode = null; }); e.childNodes = []; e._txt = "";
      for (const m of String(v).matchAll(/<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g)) {
        const c = makeEl(m[1]);
        const cls = /class="([^"]*)"/.exec(m[2]);
        if (cls) c.className = cls[1];
        c.textContent = m[3];
        e.appendChild(c);
      }
    },
    appendChild(c) { c.parentNode = e; e.childNodes.push(c); return c; },
    insertBefore(c, ref) {
      if (c.parentNode === e) e.childNodes.splice(e.childNodes.indexOf(c), 1);
      const i = ref ? e.childNodes.indexOf(ref) : -1;
      c.parentNode = e;
      if (i < 0) e.childNodes.push(c); else e.childNodes.splice(i, 0, c);
      return c;
    },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) { e.childNodes.splice(i, 1); c.parentNode = null; } },
    remove() { if (e.parentNode) e.parentNode.removeChild(e); },
    addEventListener(t, fn) { (e._ls[t] = e._ls[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = e._ls[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    matches(sel) { return selMatch(e, sel); },
    closest(sel) { let n = e; while (n) { if (selMatch(n, sel)) return n; n = n.parentNode; } return null; },
    querySelector(sel) { return descend(e).find((n) => selMatch(n, sel)) || null; },
    querySelectorAll(sel) { return descend(e).filter((n) => selMatch(n, sel)); },
    getBoundingClientRect() { return { left: 0, width: 100, top: 0, height: 20 }; },
    focus() { e.focused = (e.focused || 0) + 1; },
    get isContentEditable() { return e.contentEditable === "true"; },
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

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

// --- load the page --------------------------------------------------------
function makeHarness(opts = {}) {
  const state = {
    index: opts.index === undefined ? { tabs: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }], active: "a" } : opts.index,
    notes: Object.assign({ a: "alpha body", b: "beta body" }, opts.notes),
  };
  const calls = [];
  const h = { state, calls, onFetch: null, confirms: [], confirmAnswer: true };

  // virtual clock
  let now = 0, seq = 1;
  const timers = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout(fn, ms) { const id = seq++; timers.push({ id, fn, at: now + (ms || 0) }); return id; },
    clearTimeout(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval(fn, ms) { const id = seq++; timers.push({ id, fn, at: now + (ms || 0), every: ms || 1 }); return id; },
    clearInterval(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    JSON, Math, Date, Object, Array, String, Number, Error, RegExp, Promise, URL, encodeURIComponent,
    CSS: { escape: (s) => String(s).replace(/["\\]/g, "\\$&") },
    fetch(url, init) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      const rec = { url, method: (init && init.method) || "GET", body };
      calls.push(rec);
      if (h.onFetch) {
        const r = h.onFetch(rec);
        if (r !== undefined) return r === null ? Promise.reject(new Error("network")) : Promise.resolve(r);
      }
      const json = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o) });
      if (rec.method === "POST" && url === "/api/notes/tabs") {
        state.index = { tabs: body.tabs.map((t) => ({ id: t.id, name: t.name })), active: body.active };
        return json({ ok: true });
      }
      if (rec.method === "POST" && url === "/api/notes") { state.notes[body.id] = body.content; return json({ ok: true }); }
      if (url === "/api/notes") return json(state.index);
      if (url.startsWith("/api/notes?id=")) {
        const id = decodeURIComponent(url.slice("/api/notes?id=".length));
        return json({ content: state.notes[id] === undefined ? "" : state.notes[id] });
      }
      return json({ ok: true });
    },
    vibeConfirm(msg, o) { h.confirms.push({ msg, o }); return Promise.resolve(h.confirmAnswer); },
  };
  const doc = {
    _ls: {}, hidden: false,
    getElementById: (id) => h.els[id] || null,
    createElement: (t) => makeEl(t),
    createRange: () => ({ selectNodeContents() {} }),
    addEventListener(t, fn) { (doc._ls[t] = doc._ls[t] || []).push(fn); },
    removeEventListener() {},
    body: makeEl("body"),
  };
  sandbox.document = doc;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  sandbox.addEventListener = (t, fn) => { (sandbox._wls = sandbox._wls || {}), (sandbox._wls[t] = sandbox._wls[t] || []).push(fn); };

  h.els = {
    tabs: makeEl("div"), add: makeEl("button"), status: makeEl("span"),
    links: makeEl("div"), editor: makeEl("textarea"),
  };
  h.els.editor.value = "";
  h.els.editor.disabled = true;
  h.els.editor.selectionStart = h.els.editor.selectionEnd = 0;

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "notes.html#inline" }).runInContext(sandbox);

  h.sandbox = sandbox;
  h.doc = doc;
  h.tabsEl = h.els.tabs;
  h.editor = h.els.editor;
  h.status = h.els.status;
  h.linksEl = h.els.links;
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
  h.posts = (url) => calls.filter((c) => c.method === "POST" && c.url === url);
  h.type = (text) => { h.editor.value = text; fire(h.editor, "input"); };
  h.tabIds = () => h.tabsEl.children.map((el) => el.dataset.id);
  h.tabNames = () => h.tabsEl.children.map((el) => el.querySelector(".lbl").textContent);
  h.activeTab = () => (h.tabsEl.children.find((el) => el._cls.has("active")) || {}).dataset;
  h.chips = () => h.linksEl.children.map((c) => c.title);
  h.clickTab = (id) => fire(h.tabsEl.children.find((el) => el.dataset.id === id), "click");
  h.closeTab = (id) => {
    const tab = h.tabsEl.children.find((el) => el.dataset.id === id);
    fire(tab.querySelector(".x"), "click");
  };
  h.visibility = (hidden) => { doc.hidden = hidden; (doc._ls.visibilitychange || []).forEach((fn) => fn()); };
  return h;
}

async function boot(opts) {
  const h = makeHarness(opts);
  await flush();          // index fetch
  await flush();          // content fetch for the active note
  return h;
}

// --- init + the shared tab set -------------------------------------------

test("init adopts the server's tab set and opens the server's active note", async () => {
  const h = await boot();
  assert.deepEqual(h.tabIds(), ["a", "b"]);
  assert.deepEqual(h.tabNames(), ["Alpha", "Beta"]);
  assert.equal(h.activeTab().id, "a");
  assert.equal(h.editor.value, "alpha body");
  assert.equal(h.editor.disabled, false);
});

test("a server index with no tabs falls back to one note, never zero", async () => {
  const h = await boot({ index: { tabs: [], active: null } });
  assert.equal(h.tabIds().length, 1);
  assert.equal(h.editor.disabled, false, "the single fallback note must be editable");
});

test("an unchanged tab set is never re-POSTed by the poll", async () => {
  const h = await boot();
  const before = h.posts("/api/notes/tabs").length;
  h.advance(2000); await flush();
  h.advance(2000); await flush();
  h.advance(2000); await flush();
  assert.equal(h.posts("/api/notes/tabs").length, before,
    "three idle ticks must not push the same tab set again");
});

test("a local tab change is pushed once and then settles", async () => {
  const h = await boot();
  fire(h.els.add, "click");                       // add a note locally
  await flush();
  const afterAdd = h.posts("/api/notes/tabs").length;
  assert.ok(afterAdd >= 1, "adding a note pushes the new set");
  h.advance(2000); await flush();
  h.advance(2000); await flush();
  assert.equal(h.posts("/api/notes/tabs").length, afterAdd,
    "once the server agrees, the poll stops pushing — no ping-pong");
  assert.deepEqual(h.state.index.tabs.map((t) => t.id), h.tabIds());
});

test("a tab set changed on another device is adopted, and adoption is not pushed back", async () => {
  const h = await boot();
  // Another device renamed b and added c.
  h.state.index = { tabs: [{ id: "a", name: "Alpha" }, { id: "b", name: "Renamed" }, { id: "c", name: "Gamma" }], active: "b" };
  const before = h.posts("/api/notes/tabs").length;
  h.advance(2000); await flush();
  assert.deepEqual(h.tabIds(), ["a", "b", "c"]);
  assert.deepEqual(h.tabNames(), ["Alpha", "Renamed", "Gamma"]);
  assert.equal(h.activeTab().id, "a", "our open note must not be yanked away");
  // The hostage bug: adopting must update the local signature, or every later
  // tick pushes our just-adopted set straight back at the server for ever.
  h.advance(2000); await flush();
  h.advance(2000); await flush();
  assert.equal(h.posts("/api/notes/tabs").length, before,
    "adopting the server set must not cause a push back");
});

test("our note being closed elsewhere moves us to a surviving note", async () => {
  const h = await boot();
  h.state.index = { tabs: [{ id: "b", name: "Beta" }], active: "b" };
  h.advance(2000); await flush(); await flush();
  assert.deepEqual(h.tabIds(), ["b"]);
  assert.equal(h.activeTab().id, "b");
  assert.equal(h.editor.value, "beta body", "the surviving note is actually loaded");
});

test("closing the last note leaves a fresh one, never an empty tab bar", async () => {
  const h = await boot({ index: { tabs: [{ id: "a", name: "Alpha" }], active: "a" }, notes: { a: "" } });
  h.closeTab("a");
  await flush(); await flush();
  assert.equal(h.tabIds().length, 1);
  assert.notEqual(h.tabIds()[0], "a");
});

test("a note that was never opened here is fetched before it can be deleted", async () => {
  const h = await boot();
  h.confirmAnswer = false;
  h.closeTab("b");                    // b has content on the server, unread here
  await flush();
  assert.equal(h.confirms.length, 1, "content on the server must raise the confirm");
  assert.deepEqual(h.tabIds(), ["a", "b"], "declining keeps the note");
});

test("closing an empty note asks nothing", async () => {
  const h = await boot({ notes: { b: "" } });
  h.clickTab("b"); await flush();     // load b so its emptiness is known
  h.clickTab("a"); await flush();
  h.closeTab("b"); await flush();
  assert.equal(h.confirms.length, 0);
  assert.deepEqual(h.tabIds(), ["a"]);
});

// --- autosave -------------------------------------------------------------

test("autosave debounces: one POST per burst of typing, and not before 800ms", async () => {
  const h = await boot();
  h.type("h"); h.advance(300);
  h.type("he"); h.advance(300);
  h.type("hel");
  assert.equal(h.posts("/api/notes").length, 0, "nothing saved while still typing");
  h.advance(799);
  assert.equal(h.posts("/api/notes").length, 0, "the debounce is not shorter than 800ms");
  h.advance(1); await flush();
  const saves = h.posts("/api/notes");
  assert.equal(saves.length, 1, "one save for the whole burst");
  assert.equal(saves[0].body.content, "hel");
});

test("Ctrl+S saves at once without waiting for the debounce", async () => {
  const h = await boot();
  h.type("urgent");
  fire(h.editor, "keydown", { key: "s", ctrlKey: true });
  await flush();
  assert.deepEqual(h.posts("/api/notes").map((c) => c.body.content), ["urgent"]);
});

test("hiding the page flushes unsaved content instead of dropping it", async () => {
  const h = await boot();
  h.type("typed then backgrounded");
  h.visibility(true);
  await flush();
  assert.deepEqual(h.posts("/api/notes").map((c) => c.body.content), ["typed then backgrounded"]);
});

test("a failed save keeps the text, says so, and retries", async () => {
  const h = await boot();
  h.onFetch = (c) => (c.method === "POST" && c.url === "/api/notes" ? null : undefined);
  h.type("precious");
  h.advance(800); await flush();
  assert.equal(h.posts("/api/notes").length, 1);
  assert.match(h.status.textContent, /save failed/);
  assert.equal(h.editor.value, "precious", "the editor keeps the text");
  h.advance(3000); await flush();
  assert.equal(h.posts("/api/notes").length, 2, "the failed save is retried");
  h.onFetch = null;
  h.advance(3000); await flush();
  assert.equal(h.state.notes.a, "precious", "the retry eventually lands the content");
});

test("a background sync never clobbers content that has not been confirmed saved", async () => {
  const h = await boot();
  h.onFetch = (c) => (c.method === "POST" && c.url === "/api/notes" ? null : undefined);
  h.type("mine, unsaved");
  h.advance(800); await flush();            // save fails → unsaved stays true
  h.state.notes.a = "theirs, from another device";
  h.advance(2000); await flush();           // a poll tick
  assert.equal(h.editor.value, "mine, unsaved",
    "a remote body must not overwrite an edit that never saved");
});

test("a remote edit IS adopted once we are clean", async () => {
  const h = await boot();
  h.state.notes.a = "edited on the phone";
  h.advance(2000); await flush();
  assert.equal(h.editor.value, "edited on the phone");
  assert.equal(h.status.textContent, "synced");
});

test("switching notes flushes the outgoing note before loading the next", async () => {
  const h = await boot();
  h.type("half typed");
  h.clickTab("b"); await flush();
  assert.deepEqual(h.posts("/api/notes").map((c) => [c.body.id, c.body.content]), [["a", "half typed"]]);
  assert.equal(h.editor.value, "beta body");
});

test("a note whose body will not load stays disabled rather than saving over it", async () => {
  const h = await boot();
  h.onFetch = (c) => (c.url.startsWith("/api/notes?id=") ? { ok: false, status: 500, json: () => Promise.resolve({}) } : undefined);
  h.clickTab("b"); await flush();
  assert.equal(h.editor.disabled, true);
  assert.match(h.status.textContent, /load failed/);
  h.type("this should not be saved");
  h.advance(2000); await flush();
  assert.deepEqual(h.posts("/api/notes").filter((c) => c.body.id === "b"), [],
    "an unloaded note is never autosaved (it would overwrite the real body with '')");
});

// --- link chips -----------------------------------------------------------

test("a URL whose own path ends in a balanced ')' keeps it", async () => {
  const h = await boot();
  h.type("see https://en.wikipedia.org/wiki/Ra_(disambiguation) for more");
  h.advance(300);
  assert.deepEqual(h.chips(), ["https://en.wikipedia.org/wiki/Ra_(disambiguation)"]);
});

test("a URL wrapped in sentence parens loses only the unbalanced ')'", async () => {
  const h = await boot();
  h.type("(see https://example.com/docs)");
  h.advance(300);
  assert.deepEqual(h.chips(), ["https://example.com/docs"]);
  const h2 = await boot();
  h2.type("(see https://en.wikipedia.org/wiki/Ra_(god))");
  h2.advance(300);
  assert.deepEqual(h2.chips(), ["https://en.wikipedia.org/wiki/Ra_(god)"],
    "the URL's own paren survives; only the sentence's is stripped");
});

test("trailing sentence punctuation is stripped, and duplicates collapse", async () => {
  const h = await boot();
  h.type("a https://example.com/x. and https://example.com/x, again\nhttp://b.test/y!");
  h.advance(300);
  assert.deepEqual(h.chips(), ["https://example.com/x", "http://b.test/y"]);
});

test("the link bar hides itself when the note has no URLs", async () => {
  const h = await boot();
  h.type("https://example.com/");
  h.advance(300);
  assert.ok(h.linksEl._cls.has("on"));
  h.type("no links any more");
  h.advance(300);
  assert.equal(h.linksEl._cls.has("on"), false);
  assert.equal(h.linksEl.children.length, 0);
});

test("opening a chip hands the browser a URL with shell metacharacters escaped", async () => {
  const h = await boot();
  h.type("https://en.wikipedia.org/wiki/Ra_(god)");
  h.advance(300);
  fire(h.linksEl.children[0], "click");
  await flush();
  const open = h.posts("/api/browser/open");
  assert.equal(open.length, 1);
  assert.equal(open[0].body.url, "https://en.wikipedia.org/wiki/Ra_%28god%29");
});
