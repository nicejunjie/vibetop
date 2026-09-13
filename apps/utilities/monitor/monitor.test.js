// System Monitor — the maths between /api/system/status and what the user reads,
// and the polling gates that decide when the page asks for it at all.
//
// The page's real inline <script> runs in a vm sandbox against a minimal DOM;
// its own handlers are driven, so nothing here restates a formula. fetch is a
// stub that records every call — a test must never reach the live manager.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "monitor.html"), "utf8");
const SRC = (function () {
  const b = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .filter((s) => s.indexOf("function fmtRate") >= 0);
  assert.strictEqual(b.length, 1, "expected exactly one main inline script");
  return b[0];
})();

// A canvas context that records nothing but answers every call the chart makes.
function ctx2d() {
  const noop = () => {};
  return {
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, fill: noop, closePath: noop,
    strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "",
  };
}

function el(tag) {
  const e = {
    tagName: String(tag || "div").toUpperCase(),
    children: [], _attrs: {}, _on: {}, _q: {},
    style: {}, dataset: {},
    value: "", className: "", _text: "", _html: "",
    checked: false, disabled: false, hidden: false, width: 0, height: 0,
    addEventListener(t, fn) { (e._on[t] || (e._on[t] = [])).push(fn); },
    removeEventListener() {},
    appendChild(c) { e.children.push(c); return c; },
    setAttribute(k, v) { e._attrs[k] = String(v); },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    // innerHTML is a plain string here; a class selector resolves to a stub
    // whenever the markup mentions that class — all this page asks of it.
    querySelector(sel) {
      const k = String(sel);
      if (e._q[k]) return e._q[k];
      if (k[0] === "." && String(e.innerHTML).indexOf(k.slice(1)) >= 0) return (e._q[k] = el("span"));
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect: () => ({ width: 300, height: 100, top: 0, left: 0 }),
    getContext: () => ctx2d(),
    fire(t, ev) {
      const evt = Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, ev || {});
      (e._on[t] || []).slice().forEach((fn) => fn.call(e, evt));
    },
  };
  // The real DOM stringifies on assignment; a number written here must read back
  // as a number-shaped STRING or a test would pass on a value no user ever sees.
  Object.defineProperty(e, "textContent", {
    get() { return e._text; }, set(v) { e._text = String(v); }, enumerable: true,
  });
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
  let ticker = null;
  let clock = opts.now || 1e9;                 // seconds*1000, settable per test
  const doc = {
    hidden: false, _on: {},
    getElementById(id) { return byId[id] || (byId[id] = el(id.indexOf("chart") >= 0 ? "canvas" : "div")); },
    createElement(t) { return el(t); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(t, fn) { (doc._on[t] || (doc._on[t] = [])).push(fn); },
    removeEventListener() {},
    fire(t, ev) { (doc._on[t] || []).slice().forEach((fn) => fn.call(doc, ev || {})); },
  };
  doc.body = el("body");
  // A queue of payloads; each update() takes the next one (the last repeats).
  const queue = (opts.payloads || []).slice();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: doc,
    devicePixelRatio: 1,
    location: { origin: "https://host.test" },
    setInterval: (fn) => { ticker = fn; return 1; },
    clearInterval() {},
    setTimeout: (fn) => { return 0; },
    clearTimeout() {},
    Promise, Math, JSON, Object, Array, String, Number, Error,
    Date: { now: () => clock },
    fetch(url, opt) {
      calls.push({ url: String(url), method: (opt && opt.method) || "GET" });
      const p = queue.length > 1 ? queue.shift() : queue[0];
      if (p === undefined) return Promise.reject(new Error("offline"));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(p) });
    },
    addEventListener(t, fn) { (sandbox._on[t] || (sandbox._on[t] = [])).push(fn); },
    _on: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "monitor.html" }).runInContext(sandbox);
  return {
    S: sandbox, byId, calls, doc,
    id: (x) => doc.getElementById(x),
    tick: () => ticker && ticker(),
    message: (data, origin) => (sandbox._on.message || []).forEach((fn) => fn({ origin: origin || "https://host.test", data })),
    setClock: (ms) => { clock = ms; },
    settle: () => new Promise((r) => setImmediate(() => setImmediate(r))),
  };
}

// A payload with every field the page reads, so a test can blank one at a time.
function fullStatus(over) {
  return Object.assign({
    cpu_cores: [10, 50, 95, 0], load_avg: [1.5, 2, 3],
    memory_used_gb: 8, memory_total_gb: 32,
    gpu_percent: 42, gpu_vram_used_gb: 2, gpu_vram_total_gb: 24,
    cpu_temp: 61, gpu_temp: 55, hostname: "z20", uptime: "3 days",
    terminals_running: 4, ips: { enp8s0: "192.168.1.20" },
    network: { enp8s0: { rx_bytes: 0, tx_bytes: 0 } },
    processes: [{ pid: 1, name: "systemd", cpu: 0.5, mem_mb: 12, user: "root" }],
    cpu_power_w: 85, gpu_power_w: 100,
    disk_total_gb: 1000, disk_used_gb: 500, disk_read_bytes: 0, disk_write_bytes: 0,
  }, over || {});
}

// ---- formatting ----------------------------------------------------------
//
// The page is an IIFE, so its helpers are not reachable by name; every one of
// these drives the real render path and reads what it wrote.

test("fmtRate picks its unit at each 1024x boundary", async () => {
  const h = load({
    payloads: [
      fullStatus({ disk_read_bytes: 999, disk_write_bytes: 1024 }),
      fullStatus({ disk_read_bytes: 1536, disk_write_bytes: 1048576 }),
      fullStatus({ disk_read_bytes: 1572864, disk_write_bytes: 1073741824 }),
    ],
  });
  await h.settle();
  assert.ok(/R 999 B\/s/.test(h.id("disk-stats").innerHTML), h.id("disk-stats").innerHTML);
  assert.ok(/W 1 KB\/s/.test(h.id("disk-stats").innerHTML), "1024 crosses into KB/s");
  h.tick(); await h.settle();
  assert.ok(/R 2 KB\/s/.test(h.id("disk-stats").innerHTML), "KB/s has no decimal");
  assert.ok(/W 1\.0 MB\/s/.test(h.id("disk-stats").innerHTML));
  h.tick(); await h.settle();
  assert.ok(/R 1\.5 MB\/s/.test(h.id("disk-stats").innerHTML));
  assert.ok(/W 1\.0 GB\/s/.test(h.id("disk-stats").innerHTML));
});

test("a core's colour band changes exactly at 40 / 70 / 90 percent", async () => {
  const h = load({ payloads: [fullStatus({ cpu_cores: [39.9, 40, 69.9, 70, 89.9, 90] })] });
  await h.settle();
  const band = {};
  h.id("cpu-grid").children.forEach(function (row) {
    band[row.querySelector(".core-bar").style.width] = row.querySelector(".core-bar").className;
  });
  assert.strictEqual(band["39.9%"], "core-bar lo");
  assert.strictEqual(band["40%"], "core-bar mid", "40 is the first mid core");
  assert.strictEqual(band["69.9%"], "core-bar mid");
  assert.strictEqual(band["70%"], "core-bar hi");
  assert.strictEqual(band["89.9%"], "core-bar hi");
  assert.strictEqual(band["90%"], "core-bar crit", "a pegged core must read as critical");
});

test("a scaled bar turns amber over 70% and red over 90% — and a fixed one never does", async () => {
  const h = load({
    payloads: [
      // gpu_percent stays pegged at 95 throughout: a fixed bar at 95% is the
      // case that catches the guard being dropped.
      fullStatus({ memory_used_gb: 8, memory_total_gb: 32, gpu_percent: 95 }),    // 25%
      fullStatus({ memory_used_gb: 24, memory_total_gb: 32, gpu_percent: 95 }),   // 75%
      fullStatus({ memory_used_gb: 31, memory_total_gb: 32, gpu_percent: 95 }),   // 96.9%
    ],
  });
  await h.settle();
  assert.strictEqual(h.id("mem-bar").style.background, "#5aad8a", "a quiet bar keeps its own colour");
  h.tick(); await h.settle();
  assert.strictEqual(h.id("mem-bar").style.background, "#c0935a", "75% is the amber warning");
  h.tick(); await h.settle();
  assert.strictEqual(h.id("mem-bar").style.background, "#b85c5c", "over 90% is the alarm colour");
  // The GPU/VRAM/power bars are declared fixed: a busy GPU is normal, not a fault.
  assert.strictEqual(h.id("gpu-bar").style.width, "95%");
  assert.strictEqual(h.id("gpu-bar").style.background, "#5aad8a",
    "a fixed bar at 95% must not borrow the warning palette — a busy GPU is normal, not a fault");
});

// ---- the numbers the user reads -----------------------------------------

test("a full status payload renders the headline figures", async () => {
  const h = load({ payloads: [fullStatus()] });
  await h.settle();
  assert.deepStrictEqual(h.calls.map((c) => c.url), ["/api/system/status"]);
  assert.strictEqual(h.calls[0].method, "GET", "the monitor must only ever read");
  assert.strictEqual(h.id("cpu-avg").textContent, "38.8% avg (4 cores)");
  assert.strictEqual(h.id("load-avg").textContent, "load 1.50 2.00 3.00");
  assert.strictEqual(h.id("cpu-temp").textContent, "61°");
  assert.strictEqual(h.id("h-host").textContent, "z20");
  assert.strictEqual(h.id("h-terms").textContent, "4");
  assert.strictEqual(h.id("h-ips").textContent, "192.168.1.20 (enp8s0)");
  assert.strictEqual(h.id("mem-bar").style.width, "25%", "8 of 32 GB is a quarter of the bar");
  assert.strictEqual(h.id("pwr-total").textContent, "185W total");
});

test("the network rate is a delta over elapsed time, not the counter itself", async () => {
  const h = load({
    now: 1000000,
    payloads: [
      fullStatus({ network: { eth0: { rx_bytes: 1000000, tx_bytes: 0 } } }),
      fullStatus({ network: { eth0: { rx_bytes: 3097152, tx_bytes: 512000 } } }),
    ],
  });
  await h.settle();
  // The first sample has nothing to subtract from: 0, never the raw counter.
  assert.ok(/↓ 0 B\/s/.test(h.id("net-stats").innerHTML), "the first sample cannot know a rate");
  h.setClock(1002000);                     // exactly 2 seconds later
  h.tick();
  await h.settle();
  // (3097152-1000000)/2 = 1048576 B/s = 1.0 MB/s down; 512000/2 = 250 KB/s up.
  assert.ok(/↓ 1\.0 MB\/s/.test(h.id("net-stats").innerHTML), h.id("net-stats").innerHTML);
  assert.ok(/↑ 250 KB\/s/.test(h.id("net-stats").innerHTML), h.id("net-stats").innerHTML);
});

test("a counter reset (interface restart) does not print a wild negative rate as a huge one", async () => {
  const h = load({
    now: 1000000,
    payloads: [
      fullStatus({ network: { eth0: { rx_bytes: 5e9, tx_bytes: 0 } } }),
      fullStatus({ network: { eth0: { rx_bytes: 0, tx_bytes: 0 } } }),
    ],
  });
  await h.settle();
  h.setClock(1002000);
  h.tick();
  await h.settle();
  const shown = h.id("net-stats").innerHTML;
  assert.ok(/↓ -/.test(shown) || /↓ 0/.test(shown),
    "a reset counter reads as a negative or zero rate — never a plausible-looking huge one: " + shown);
});

test("a process name from /proc cannot inject markup into the list", async () => {
  const h = load({
    payloads: [fullStatus({ processes: [{ pid: 7, name: '<img src=x onerror="x()">', cpu: 91, mem_mb: 2048, user: "<b>root" }] })],
  });
  await h.settle();
  const html = h.id("proc-list").innerHTML;
  assert.ok(html.indexOf("<img") < 0, "no raw tag from a process name");
  assert.ok(html.indexOf("&lt;img") >= 0);
  assert.ok(html.indexOf("&lt;b&gt;root") >= 0, "the user column is escaped too");
  assert.ok(/proc-cpu hot/.test(html), "91% CPU is flagged hot");
  assert.ok(/2\.0G/.test(html), "2048 MB reads as 2.0G, not 2048M");
});

// ---- degrading on a partial payload -------------------------------------

test("an empty payload leaves the page standing instead of throwing", async () => {
  const h = load({ payloads: [{}] });
  await h.settle();
  assert.strictEqual(h.id("cpu-temp").textContent, "--");
  assert.strictEqual(h.id("gpu-temp").textContent, "--");
  assert.strictEqual(h.id("h-host").textContent, "--");
  assert.strictEqual(h.id("load-avg").textContent, "", "no load average means no line, not 'undefined'");
  assert.strictEqual(h.id("mem-bar").style.width, "0%", "0 total GB must not become NaN%");
  assert.strictEqual(h.id("pwr-total").textContent, "--");
  assert.strictEqual(h.id("cpu-avg").textContent, "", "an empty core list must not print NaN% avg");
});

test("a host with no GPU shows dashes, not zeros pretending to be readings", async () => {
  const h = load({ payloads: [fullStatus({ gpu_percent: null, gpu_temp: null, gpu_vram_used_gb: null, gpu_vram_total_gb: null, gpu_power_w: null })] });
  await h.settle();
  assert.strictEqual(h.id("gpu-bar-text").textContent, "--");
  assert.strictEqual(h.id("vram-bar-text").textContent, "--");
  assert.strictEqual(h.id("gpu-temp").textContent, "--");
  assert.strictEqual(h.id("gpu-pwr-text").textContent, "--");
});

test("an unreachable API is swallowed — the last good frame stays on screen", async () => {
  const h = load({ payloads: [] });     // every fetch rejects
  await h.settle();
  h.tick();
  await h.settle();
  assert.ok(h.calls.length >= 2, "it keeps trying");
  assert.strictEqual(h.id("h-host").textContent, "", "and never blanks out with an error");
});

// ---- when it polls at all -----------------------------------------------

test("pausing stops the polling, and resuming starts it again", async () => {
  const h = load({ payloads: [fullStatus()] });
  await h.settle();
  const btn = h.id("pause-btn");
  btn.fire("click");
  assert.strictEqual(btn.textContent, "▶ Resume");
  assert.ok(btn.classList.contains("paused"));
  const before = h.calls.length;
  h.tick(); h.tick();
  await h.settle();
  assert.strictEqual(h.calls.length, before, "a paused monitor must not keep polling");
  btn.fire("click");
  assert.strictEqual(btn.textContent, "⏸ Pause");
  h.tick();
  await h.settle();
  assert.strictEqual(h.calls.length, before + 1);
});

test("the monitor stops polling when the shell says another app is in front", async () => {
  const h = load({ payloads: [fullStatus()] });
  await h.settle();
  h.message({ type: "vibetop:active", active: "files" });
  const before = h.calls.length;
  h.tick(); h.tick();
  await h.settle();
  assert.strictEqual(h.calls.length, before, "a backgrounded iframe must not poll every 2s");
  // Coming back refreshes immediately so the charts aren't stale.
  h.message({ type: "vibetop:active", active: "monitor" });
  await h.settle();
  assert.strictEqual(h.calls.length, before + 1, "returning refreshes at once");
});

test("a message from another origin cannot drive the monitor", async () => {
  const h = load({ payloads: [fullStatus()] });
  await h.settle();
  h.message({ type: "vibetop:active", active: "files" }, "https://evil.test");
  const before = h.calls.length;
  h.tick();
  await h.settle();
  assert.strictEqual(h.calls.length, before + 1, "a cross-origin message must be ignored");
});

test("a hidden tab does not poll", async () => {
  const h = load({ payloads: [fullStatus()] });
  await h.settle();
  h.doc.hidden = true;
  const before = h.calls.length;
  h.tick();
  await h.settle();
  assert.strictEqual(h.calls.length, before);
  h.doc.hidden = false;
  h.doc.fire("visibilitychange");
  await h.settle();
  assert.strictEqual(h.calls.length, before + 1, "becoming visible refreshes at once");
});
