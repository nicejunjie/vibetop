// Services — the discovery list: what it renders from /api/services/discover,
// what a click sends, and when it polls.
//
// The page's real inline <script> runs in a vm sandbox against a minimal DOM and
// its own handlers are driven. fetch is a stub that records every request, so a
// test can assert on what the page WOULD send without anything reaching the
// manager or opening a browser window.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const SRC = (function () {
  const b = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .filter((s) => s.indexOf("function openInBrowser") >= 0);
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
    // innerHTML stays a string; a class selector resolves to a stub whenever the
    // markup mentions that class — exactly what this page asks of it.
    querySelector(sel) {
      const k = String(sel);
      if (e._q[k]) return e._q[k];
      if (k[0] === "." && String(e.innerHTML).indexOf('class="' + k.slice(1)) >= 0) return (e._q[k] = el("button"));
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return null; },
    fire(t, ev) {
      const evt = Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev || {});
      (e._on[t] || []).slice().forEach((fn) => fn.call(e, evt));
      return evt;
    },
  };
  Object.defineProperty(e, "textContent", { get() { return e._text; }, set(v) { e._text = String(v); }, enumerable: true });
  // Assigning innerHTML replaces the subtree, exactly as the real DOM does —
  // without that, a re-render appends to the previous one and a "list cleared"
  // assertion passes on a list that was never cleared.
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
  const posted = [];
  let ticker = null;
  const doc = {
    hidden: false, _on: {},
    getElementById(id) { return byId[id] || (byId[id] = el("div")); },
    createElement(t) { return el(t); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(t, fn) { (doc._on[t] || (doc._on[t] = [])).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (doc._on[t] || []).slice().forEach((fn) => fn.call(doc, ev || {})); },
  };
  doc.body = el("body");
  // One current payload, swappable mid-test: the page fires two immediate loads
  // at startup (its own + startPolling's), so a queue would desync.
  let payload = opts.payload;
  const offline = !("payload" in opts);
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: doc,
    location: { origin: "https://host.test" },
    setInterval: (fn) => { ticker = fn; return 7; },
    clearInterval: () => { ticker = null; },
    setTimeout: () => 0, clearTimeout() {},
    Promise, Math, JSON, Object, Array, String, Number, Error,
    fetch(url, opt) {
      calls.push({ url: String(url), method: (opt && opt.method) || "GET", body: opt && opt.body, headers: (opt && opt.headers) || {} });
      if (offline) return Promise.reject(new Error("offline"));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
    },
    addEventListener(t, fn) { (sandbox._on[t] || (sandbox._on[t] = [])).push(fn); },
    _on: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // Embedded means a DIFFERENT top window — the desktop shell's frame.
  sandbox.top = opts.embedded
    ? { postMessage: (m, o) => posted.push({ msg: m, origin: o }) }
    : sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "services/index.html" }).runInContext(sandbox);
  return {
    S: sandbox, byId, calls, posted, doc,
    id: (x) => doc.getElementById(x),
    hasTimer: () => ticker !== null,
    serve: (p) => { payload = p; },
    tick: () => ticker && ticker(),
    message: (data, origin) => (sandbox._on.message || []).forEach((fn) => fn({ origin: origin || "https://host.test", data })),
    settle: () => new Promise((r) => setImmediate(() => setImmediate(r))),
  };
}

const svc = (o) => Object.assign({ name: "Jellyfin", desc: "media server", port: 8096, url: "http://192.168.1.20:8096", health: "up" }, o);

// ---- what it renders -----------------------------------------------------

test("each discovered service becomes a card with its state, port and link", async () => {
  const h = load({ payload: { lan_ip: "192.168.1.20", services: [svc(), svc({ name: "Pi-hole", port: 80, health: "down", url: "http://192.168.1.20/" })] } });
  await h.settle();
  assert.deepStrictEqual([...new Set(h.calls.map((c) => String(c.url)))], ["/api/services/discover"]);
  assert.ok(h.calls.every((c) => c.method === "GET"), "discovery must be read-only");
  assert.strictEqual(h.id("host").textContent, "192.168.1.20", "the header names the host it scanned");
  const cards = h.id("grid").children;
  assert.strictEqual(cards.length, 2);
  assert.strictEqual(cards[0].tagName, "A", "a reachable service is a real link");
  assert.strictEqual(cards[0].getAttribute("target"), null);
  assert.strictEqual(cards[0].href, "http://192.168.1.20:8096");
  assert.strictEqual(cards[0].target, "_blank", "the card opens in the user's own browser");
  assert.strictEqual(cards[0].rel, "noopener");
  assert.ok(/class="dot up"/.test(cards[0].innerHTML), "a healthy service gets the green dot");
  assert.ok(/class="dot down"/.test(cards[1].innerHTML), "an unhealthy one gets the red dot");
  assert.ok(/>8096</.test(cards[0].innerHTML), "the port is shown");
  assert.strictEqual(h.id("empty").hidden, true);
});

test("a service whose URL is not http(s) is rendered inert — no link, no Browser button", async () => {
  const h = load({ payload: { services: [svc({ name: "odd", url: 'javascript:alert(1)//' })] } });
  await h.settle();
  const card = h.id("grid").children[0];
  assert.strictEqual(card.tagName, "DIV", "a non-http service must not become a clickable <a>");
  assert.strictEqual(card.href, undefined, "and carries no href at all");
  assert.ok(card.innerHTML.indexOf("javascript:") < 0, "the hostile scheme never reaches the markup");
  assert.strictEqual(card.querySelector(".ext"), null, "nothing to press that would open it");
});

test("a service name from a /proc cmdline cannot inject markup", async () => {
  const h = load({ payload: { services: [svc({ name: '<img src=x onerror="x()">', desc: '"><script>' })] } });
  await h.settle();
  const html = h.id("grid").children[0].innerHTML;
  assert.ok(html.indexOf("<img") < 0 && html.indexOf("<script") < 0, "no raw markup from a service name");
  assert.ok(html.indexOf("&lt;img") >= 0);
});

test("no services at all shows the empty state and clears any previous list", async () => {
  const h = load({ payload: { services: [svc()] } });
  await h.settle();
  assert.strictEqual(h.id("empty").hidden, true);
  h.serve({ services: [] });
  h.id("refresh").fire("click");
  await h.settle();
  assert.strictEqual(h.id("empty").hidden, false, "the empty state appears");
  assert.strictEqual(h.id("grid").children.length, 0, "and the stale cards are gone");
});

test("a malformed payload degrades to the empty state instead of throwing", async () => {
  for (const bad of [{}, { services: null }, { services: "nope" }, null]) {
    const h = load({ payload: bad });
    await h.settle();
    assert.strictEqual(h.id("empty").hidden, false, JSON.stringify(bad) + " should leave the empty state showing");
  }
});

// ---- what a click sends --------------------------------------------------

test("standalone, the Browser button POSTs the URL to the embedded browser", async () => {
  const h = load({ payload: { services: [svc()] } });
  await h.settle();
  const before = h.calls.length;
  const btn = h.id("grid").children[0].querySelector(".ext");
  const ev = btn.fire("click");
  const post = h.calls.slice(before);
  assert.strictEqual(post.length, 1);
  assert.strictEqual(post[0].url, "/api/browser/open");
  assert.strictEqual(post[0].method, "POST");
  assert.deepStrictEqual(JSON.parse(post[0].body), { url: "http://192.168.1.20:8096" });
  assert.strictEqual(post[0].headers["Content-Type"], "application/json");
});

test("embedded, it asks the shell instead of calling the API itself", async () => {
  // Through the tunnel an iframe's own fetch carries no Access cookie, so the
  // shell relay is the only path that works — going direct would silently fail.
  const h = load({ embedded: true, payload: { services: [svc()] } });
  h.message({ type: "services", data: { services: [svc()] } });
  const before = h.calls.length;
  h.id("grid").children[0].querySelector(".ext").fire("click");
  assert.strictEqual(h.calls.length, before, "embedded must not POST to /api/browser/open");
  assert.deepEqual(h.posted, [{ msg: { type: "open-in-browser", url: "http://192.168.1.20:8096" }, origin: "*" }]);
});

test("Refresh re-reads the list", async () => {
  const h = load({ payload: { services: [svc()] } });
  await h.settle();
  const before = h.calls.length;
  h.id("refresh").fire("click");
  await h.settle();
  assert.strictEqual(h.calls.length, before + 1);
  assert.strictEqual(h.calls[h.calls.length - 1].url, "/api/services/discover");
});

// ---- when it polls -------------------------------------------------------

test("embedded, the page never polls — the shell is the only poller", async () => {
  const h = load({ embedded: true, payload: { services: [] } });
  await h.settle();
  assert.strictEqual(h.hasTimer(), false, "a second poller would double the host scan cost");
  const relayed = { services: [svc({ name: "Relayed" })] };
  h.message({ type: "services", data: relayed });
  assert.strictEqual(h.id("grid").children.length, 1, "it renders from the shell's relay");
});

test("a relayed message from another origin is ignored", async () => {
  const h = load({ embedded: true, payload: { services: [] } });
  await h.settle();
  h.message({ type: "services", data: { services: [svc()] } }, "https://evil.test");
  assert.strictEqual(h.id("grid").children.length, 0, "a cross-origin relay must not paint the list");
});

test("standalone, polling stops while the tab is hidden and restarts when it is not", async () => {
  const h = load({ payload: { services: [] } });
  await h.settle();
  assert.strictEqual(h.hasTimer(), true);
  h.doc.hidden = true;
  h.doc.fire("visibilitychange");
  assert.strictEqual(h.hasTimer(), false, "a backgrounded tab must not keep scanning the host");
  const before = h.calls.length;
  h.doc.hidden = false;
  h.doc.fire("visibilitychange");
  await h.settle();
  assert.strictEqual(h.hasTimer(), true);
  assert.strictEqual(h.calls.length, before + 1, "and refreshes at once on return");
});

test("a failed discovery leaves the page alone rather than throwing", async () => {
  const h = load();                       // no payload: every fetch rejects
  await h.settle();
  assert.strictEqual(h.id("grid").children.length, 0);
  assert.strictEqual(h.id("host").textContent, "", "nothing is written from a failed scan");
});
