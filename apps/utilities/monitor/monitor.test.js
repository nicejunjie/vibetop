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

// A canvas context that answers every call the chart makes AND records the path
// it walked. The recording is what lets a test see what the chart DREW rather
// than only what the text beside it said — the two disagreed for years (a
// missing sensor read "--" in the text and a flat line on the floor in the
// chart), and only the vertex list can tell those apart.
function ctx2d() {
  const noop = () => {};
  const ops = [];
  const c = {
    ops,
    setTransform: noop, clearRect: noop, closePath: noop, stroke: noop, fill: noop,
    beginPath() { ops.push({ op: "beginPath", color: c.strokeStyle }); },
    // Isolated samples are drawn as dots. Recorded under the FILL colour, since
    // that is what a dot is painted with.
    arc(x, y, r) { ops.push({ op: "arc", x, y, r, color: c.fillStyle }); },
    moveTo(x, y) { ops.push({ op: "moveTo", x, y, color: c.strokeStyle }); },
    lineTo(x, y) { ops.push({ op: "lineTo", x, y, color: c.strokeStyle }); },
    strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "",
  };
  return c;
}
// Every vertex drawn in one dataset's colour, in order. The two series sharing a
// chart are told apart by colour, exactly as the eye does.
function vertices(canvasEl, color) {
  const ctx = canvasEl._ctx || {ops: []};
  return ctx.ops.filter((o) => (o.op === "moveTo" || o.op === "lineTo") && o.color === color);
}
// Dots drawn for samples with no neighbour to join to.
function dots(canvasEl, color) {
  const ctx = canvasEl._ctx || {ops: []};
  return ctx.ops.filter((o) => o.op === "arc" && o.color === color);
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
    // One context per canvas, kept, so its recorded path survives the frame.
    getContext: () => (e._ctx || (e._ctx = ctx2d())),
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

// Ids the real markup ships with a `hidden` attribute. Elements here are
// created lazily and were all born visible, which silently modelled the wrong
// page: an element the browser starts hidden (and that the script only ever
// UNhides) looked as though it were on screen from the first frame. Seeded from
// the real HTML so the harness and the browser agree on the starting state.
const HIDDEN_AT_REST = new Set(
  [...HTML.matchAll(/<[a-z]+\b[^>]*>/gi)]
    .filter((m) => /\shidden(?=[\s>=])/i.test(m[0]))
    .map((m) => (m[0].match(/\bid="([^"]+)"/) || [])[1])
    .filter(Boolean));

function load(opts) {
  opts = opts || {};
  const byId = {};
  const calls = [];
  let ticker = null;
  let clock = opts.now || 1e9;                 // seconds*1000, settable per test
  const doc = {
    hidden: false, _on: {},
    getElementById(id) {
      if (!byId[id]) {
        byId[id] = el(id.indexOf("chart") >= 0 ? "canvas" : "div");
        byId[id].hidden = HIDDEN_AT_REST.has(id);
      }
      return byId[id];
    },
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
      // The page talks to TWO endpoints now. One shared queue answered both,
      // so the history call silently ate a status payload and shifted every
      // frame after it — the harness has to tell them apart.
      if (String(url).indexOf("/api/system/history") === 0) {
        const h = opts.history === undefined ? { unavailable: true } : opts.history;
        if (h === null) return Promise.reject(new Error("offline"));
        // A fresh object per call, as response.json() gives. Handing back the
        // same one let the page's own push() mutate the fixture, so a later
        // frame saw a window the server never sent.
        const fresh = JSON.parse(JSON.stringify(h));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fresh) });
      }
      const p = queue.length > 1 ? queue.shift() : queue[0];
      if (p === undefined) return Promise.reject(new Error("offline"));
      // opts.httpStatus lets a test answer with a real HTTP error: fetch resolves
      // on a 403 or a 500, so that path is NOT the rejection above.
      const st = opts.httpStatus || 200;
      return Promise.resolve({ ok: st < 400, status: st, json: () => Promise.resolve(p) });
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
    clearPaths: () => Object.keys(byId).forEach((k) => byId[k]._ctx && (byId[k]._ctx.ops.length = 0)),
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
  assert.deepStrictEqual(h.calls.map((c) => c.url.split("?")[0]),
    ["/api/system/status", "/api/system/history"],
    "one live poll, plus the one-off seed that stops the charts opening blank");
  assert.ok(h.calls.every((c) => c.method === "GET"), "the monitor must only ever read");
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
  // The first sample has nothing to subtract from, so there is no rate to show.
  // This used to assert "0 B/s" — but 0 B/s is a MEASUREMENT meaning the link was
  // idle, and the chart opened with a real point on the floor to match. Blank is
  // the honest representation of "not measured yet". The original protection (it
  // must never be the raw COUNTER) is kept explicitly below.
  const first = h.id("net-stats").innerHTML;
  assert.ok(/↓ --/.test(first), `the first sample cannot know a rate: ${first}`);
  assert.ok(!/1000000|977 KB|1\.0 MB/.test(first),
    `the first sample must never render the counter as a rate: ${first}`);
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

// The GREEN line on the GPU card is utilisation, the BLUE one is VRAM; the same
// two colours carry CPU/GPU on the temperature and power cards.
const GREEN = "rgb(90,173,138)", BLUE = "rgb(90,138,176)";

test("a sensor the host does not have draws NO line — not a line along the floor", async () => {
  // A machine with no discrete GPU: util, VRAM, temp and power all absent, but
  // memory (the same chart geometry) present throughout.
  const none = { gpu_percent: null, gpu_vram_used_gb: null, gpu_vram_total_gb: null,
                 gpu_temp: null, gpu_power_w: null };
  const h = load({ payloads: [fullStatus(none)] });
  await h.settle();
  h.tick(); await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();           // the frame under test: 3 samples of history
  const floor = 100;                    // getBoundingClientRect().height in this harness
  for (const [chart, color, what] of [["gpu-chart", GREEN, "GPU utilisation"],
                                      ["gpu-chart", BLUE, "VRAM"],
                                      ["temp-chart", BLUE, "GPU temperature"],
                                      ["pwr-chart", BLUE, "GPU power"]]) {
    const pts = vertices(h.id(chart), color);
    assert.deepStrictEqual(pts.map((p) => p.y), [],
      `${what} was never reported, so nothing may be plotted for it — ` +
      `a run of points at y=${floor} is a line pinned to the bottom of the card, ` +
      `which is what a genuinely idle sensor looks like. Got: ` +
      JSON.stringify(pts.map((p) => p.y)));
  }
  // ...and the sensors the host DOES have are unaffected.
  assert.ok(vertices(h.id("mem-chart"), GREEN).length >= 3, "memory still draws");
  assert.ok(vertices(h.id("temp-chart"), GREEN).length >= 3, "the CPU temperature still draws");
});

test("a real zero still draws on the floor — absence and idleness must stay different", async () => {
  const h = load({ payloads: [fullStatus({ gpu_percent: 0 })] });
  await h.settle();
  h.tick(); await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const ys = vertices(h.id("gpu-chart"), GREEN).map((p) => p.y);
  assert.ok(ys.length >= 3, "an idle GPU is a measurement and must be plotted");
  assert.deepStrictEqual([...new Set(ys)], [100], "0% belongs on the floor of the card");
});

test("a sensor that comes and goes leaves a gap, and the line resumes after it", async () => {
  const h = load({ payloads: [
    fullStatus({ gpu_percent: 40 }), fullStatus({ gpu_percent: 44 }),
    fullStatus({ gpu_percent: null }),
    fullStatus({ gpu_percent: 60 }), fullStatus({ gpu_percent: 64 }),
  ] });
  await h.settle();
  for (let i = 0; i < 3; i++) { h.tick(); await h.settle(); }
  h.clearPaths();
  h.tick(); await h.settle();
  const ops = (h.id("gpu-chart")._ctx.ops).filter((o) => o.color === GREEN);
  const moves = ops.filter((o) => o.op === "moveTo");
  assert.strictEqual(moves.length, 2,
    "the missing sample must break the line in two, so the reading either side is not joined " +
    "through a value the host never gave: " + JSON.stringify(ops.map((o) => o.op + "@" + Math.round(o.y))));
  // The run-closing vertices at y=h are the shaded fill under each run, not data
  // points; the data points are everything down to the first close. None of them
  // may sit on the floor, because no sample here was 0.
  const data = ops.slice(0, ops.findIndex((o, i) => i > 0 && o.y === 100));
  assert.ok(!data.some((o) => o.y === 100),
    "no DATA point may land on the floor: the absent sample must be skipped, not drawn as 0");
});

// ---- when the poll itself stops ------------------------------------------

test("a failing poll says so instead of leaving a frozen page looking live", async () => {
  // One good frame, then the manager stops answering. Everything on this page
  // comes from that one 2s poll, and the page has a Pause button — so a chart
  // that stops moving reads as something the USER did.
  const h = load({ now: 1000000, payloads: [fullStatus(), undefined, undefined, fullStatus()] });
  await h.settle();
  // The observable is the TEXT (an element with none says nothing to anybody);
  // `hidden` is checked alongside it so an off-screen message doesn't count.
  const badge = h.id("poll-stale");
  assert.strictEqual(badge.textContent, "", "nothing to say while the poll is healthy");
  assert.ok(badge.hidden);

  h.setClock(1002000); h.tick(); await h.settle();
  assert.ok(badge.hidden, "one dropped request is not news");

  h.setClock(1004000); h.tick(); await h.settle();
  assert.ok(!badge.hidden, "after two missed polls the page must admit it is not updating");
  assert.match(badge.textContent, /\S/, "and must actually say something");
  assert.match(badge.textContent, /\d+\s*[smh]\b/,
    "and must say HOW OLD the figures on screen are, not merely that something is wrong: " +
    JSON.stringify(badge.textContent));

  // The last good frame is still on screen — that is deliberate, it is just no
  // longer presented as current.
  assert.strictEqual(h.id("h-host").textContent, "z20");

  // Recovery clears it with no reload.
  h.setClock(1006000); h.tick(); await h.settle();
  assert.ok(badge.hidden, "one good poll and the page is live again");
  assert.strictEqual(badge.textContent, "");
});

test("an HTTP error is a failed poll, not an empty host", async () => {
  // fetch resolves on a 403/500; without an r.ok check the body was parsed as a
  // status object with every field undefined, blanking a healthy readout.
  const h = load({ payloads: [fullStatus()], httpStatus: 403 });
  await h.settle();
  h.tick(); await h.settle();
  h.tick(); await h.settle();
  assert.match(h.id("poll-stale").textContent, /\S/,
    "a refused poll is a failed poll and must be reported as one");
  assert.notStrictEqual(h.id("h-host").textContent, "undefined");
});

test("an unreachable API keeps the last good frame on screen (marked stale)", async () => {
  const h = load({ payloads: [] });     // every fetch rejects
  await h.settle();
  h.tick();
  await h.settle();
  assert.ok(h.calls.length >= 2, "it keeps trying");
  assert.strictEqual(h.id("h-host").textContent, "", "and never blanks out with an error");
  assert.match(h.id("poll-stale").textContent, /\S/,
    "with nothing ever received, the page must say that rather than show empty fields");
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

// ---- wall power ----------------------------------------------------------
//
// The whole machine's draw, read from a smart plug rather than a sensor inside
// the box. Two things make it unlike every other series here: the row does not
// exist on a host with no plug, and the reading can vanish mid-session (the
// plug reboots, drops off Wi-Fi, gets unplugged) while the rest of the page
// carries on. The manager signals both the same way — by omitting the key — so
// these tests are about telling "no plug" from "plug went quiet" from "0W".

const VIOLET = "rgb(176,127,208)";

test("a host with no smart plug shows no wall row at all", async () => {
  const h = load({ payloads: [fullStatus()] });      // no wall_power_w
  await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, true,
    "an empty WALL line on every host that will never have a plug is clutter");
  assert.strictEqual(h.id("pwr-total").textContent, "185W total",
    "with no wall reading the CPU+GPU sum is still the total it always was");
});

test("a measured wall draw is the headline, and CPU+GPU stops claiming 'total'", async () => {
  const h = load({ payloads: [fullStatus({ wall_power_w: 240 })] });
  await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, false);
  assert.strictEqual(h.id("wall-pwr-text").textContent, "240W");
  const t = h.id("pwr-total").textContent;
  assert.ok(t.startsWith("240W wall"), `wall leads the headline, got ${t}`);
  assert.ok(t.includes("185W CPU+GPU"), `the components stay visible, got ${t}`);
  assert.ok(!t.includes("total"),
    `two numbers on one line both called "total" is the defect this avoids, got ${t}`);
});

test("a plug reporting nothing drawing shows 0W, not a dash", async () => {
  // The reporter's own plug reads 0.0W with nothing plugged into it. That is a
  // successful measurement and must not render as "unavailable".
  const h = load({ payloads: [fullStatus({ wall_power_w: 0 })] });
  await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, false);
  assert.strictEqual(h.id("wall-pwr-text").textContent, "0W");
  assert.ok(h.id("pwr-total").textContent.startsWith("0W wall"));
});

test("a real 0W draws on the floor; a plug that went quiet draws nothing", async () => {
  const zero = load({ payloads: [fullStatus({ wall_power_w: 0 })] });
  await zero.settle(); zero.tick(); await zero.settle();
  zero.clearPaths(); zero.tick(); await zero.settle();
  const ys = vertices(zero.id("pwr-chart"), VIOLET).map((p) => p.y);
  assert.ok(ys.length >= 3, "an idle plug is a measurement and must be plotted");
  assert.deepStrictEqual([...new Set(ys)], [100], "0W belongs on the floor");

  const gone = load({ payloads: [fullStatus()] });   // key absent entirely
  await gone.settle(); gone.tick(); await gone.settle();
  gone.clearPaths(); gone.tick(); await gone.settle();
  assert.deepStrictEqual(vertices(gone.id("pwr-chart"), VIOLET).map((p) => p.y), [],
    "with no plug configured nothing may be plotted for wall power");
});

test("a configured plug that has never answered still shows its row", async () => {
  // "There is a meter here and it is quiet" is information. Waiting for a first
  // reading to admit the row exists would leave a mistyped address looking
  // exactly like no address at all.
  const h = load({ payloads: [fullStatus({ wall_plug: true })] });
  await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, false);
  assert.strictEqual(h.id("wall-pwr-text").textContent, "--");
});

test("clearing the plug in Config retires the row instead of stranding a '--'", async () => {
  // The address is editable at runtime now, so the page must be able to go back
  // to having no wall row — it used to reveal the row and never hide it again.
  const h = load({ payloads: [
    fullStatus({ wall_plug: true, wall_power_w: 240 }),
    fullStatus({ wall_plug: true, wall_power_w: 244 }),
    fullStatus({ wall_plug: false }),               // address cleared in Config
  ] });
  await h.settle();
  h.tick(); await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, false);
  h.tick(); await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, true,
    "no plug configured, so no WALL row — not a row reading '--' forever");
  assert.ok(!h.id("pwr-card").className.includes("has-wall"),
    "and the card gives the height back to the chart");
  assert.strictEqual(h.id("pwr-total").textContent, "185W total",
    "the CPU+GPU sum goes back to being the total");
  h.clearPaths();
  h.tick(); await h.settle();
  assert.deepStrictEqual(vertices(h.id("pwr-chart"), VIOLET).map((p) => p.y), [],
    "and the old plug's line is gone from the chart");
});

test("a plug that drops out leaves the row in place reading '--', and the line breaks", async () => {
  // The manager withholds the key once a sample goes stale. The row must NOT
  // disappear — the card would resize under the user's eyes on a blip — and the
  // missing samples must break the series instead of being drawn as 0W.
  //
  // Counted as STROKE STARTS, not by looking for points on the floor: every
  // filled run closes itself with two baseline vertices at y=h, so `100` shows
  // up in the vertex list of any healthy series and proves nothing.
  const h = load({ payloads: [
    fullStatus({ wall_power_w: 240 }), fullStatus({ wall_power_w: 244 }),
    fullStatus(), fullStatus(),
    fullStatus({ wall_power_w: 250 }), fullStatus({ wall_power_w: 252 }),
  ] });
  await h.settle();
  h.tick(); await h.settle();
  h.tick(); await h.settle();                     // first frame with no reading
  assert.strictEqual(h.id("wall-pwr-row").hidden, false,
    "a blip must not make the row vanish and shove the card around");
  assert.strictEqual(h.id("wall-pwr-text").textContent, "--",
    "a withheld reading is unknown, not zero");
  h.tick(); await h.settle();
  h.tick(); await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();                     // history: 240 244 - - 250 252
  assert.strictEqual(h.id("wall-pwr-text").textContent, "252W", "and it recovers");
  const starts = vertices(h.id("pwr-chart"), VIOLET).filter((p) => p.op === "moveTo");
  assert.strictEqual(starts.length, 2,
    `the outage must split the series into two strokes; one stroke means the ` +
    `missing samples were plotted as 0W and the line joined straight across ` +
    `the gap. Got ${starts.length}`);
});

test("the power card grows for the wall row instead of shrinking its chart", async () => {
  // On narrow screens every metric card is a fixed 190px, so a third metric row
  // comes straight out of the chart — already the shortest thing on that page.
  // The class is what the stylesheet keys the extra height off; without it the
  // change is invisible here and only shows up on a phone.
  const none = load({ payloads: [fullStatus()] });
  await none.settle();
  assert.ok(!none.id("pwr-card").classList.contains("has-wall"),
    "a host with no plug keeps the standard card height");

  const h = load({ payloads: [fullStatus({ wall_power_w: 240 })] });
  await h.settle();
  assert.ok(h.id("pwr-card").classList.contains("has-wall"),
    "the card must claim back the row's height once the wall row is shown");
});

test("the power chart scales to the wall reading, not just to CPU and GPU", async () => {
  // Wall power is several times either component; without it in the y-axis the
  // violet line would run off the top of the card.
  const h = load({ payloads: [fullStatus({ wall_power_w: 600 })] });
  await h.settle(); h.tick(); await h.settle();
  const axis = h.id("pwr-yaxis").innerHTML;
  const top = parseInt(axis.match(/(\d+)W/)[1], 10);
  assert.ok(top >= 600, `the y-axis must cover the wall reading, got ${top}W`);
});

// The wall series is the one history this page does NOT build itself. It comes
// from the manager already placed on the plug's own clock, because the reading
// crosses a network: the moment a sample reaches this page is not the moment it
// was measured, and the manager's copy also carries repairs for minutes nobody
// could reach the device.

test("the wall line is taken from the server's series, not pushed per frame", async () => {
  const w = new Array(60).fill(null);
  for (let i = 40; i < 60; i++) w[i] = 200;        // 40s of history, then now
  const h = load({ payloads: [fullStatus({ wall_power_w: 200, wall_series: { t0: 1790000000, step: 2, w } })] });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const ys = vertices(h.id("pwr-chart"), VIOLET).filter((p) => p.op === "moveTo" || p.op === "lineTo");
  assert.ok(ys.length >= 20,
    `one frame must draw the server's whole window, not a single new point; got ${ys.length}`);
});

test("an outage the server reports as a gap is drawn as a gap, at its real width", async () => {
  // A 60s hole in the middle: the plug was unreachable, and the manager says so
  // by position. A page pushing one point per frame could only ever draw that
  // as a short break wherever it happened to resume.
  const w = new Array(60).fill(120);
  for (let i = 20; i < 50; i++) w[i] = null;       // 30 slots x 2s = 60s
  const h = load({ payloads: [fullStatus({ wall_power_w: 120, wall_series: { t0: 1790000000, step: 2, w } })] });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const starts = vertices(h.id("pwr-chart"), VIOLET).filter((p) => p.op === "moveTo");
  assert.strictEqual(starts.length, 2, "the hole splits the line into two strokes");
  const xs = vertices(h.id("pwr-chart"), VIOLET).map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span > 0, "and the strokes sit either side of it");
});

test("a server series replaces the local history rather than appending to it", async () => {
  // Two frames of the SAME window must not accumulate: the series is the whole
  // truth each time, and pushing it would double-count every point.
  const w = new Array(60).fill(null);
  w[59] = 300;
  const h = load({ payloads: [fullStatus({ wall_power_w: 300, wall_series: { t0: 1790000000, step: 2, w } })] });
  await h.settle();
  for (let i = 0; i < 4; i++) { h.tick(); await h.settle(); }
  h.clearPaths();
  h.tick(); await h.settle();
  const pts = vertices(h.id("pwr-chart"), VIOLET);
  assert.ok(pts.length <= 4,
    `a single known point cannot become a line; got ${pts.length} vertices`);
});

test("a manager with no series still drives the wall line the old way", async () => {
  // Deploys are not atomic: a page can outlive the manager that served it.
  const h = load({ payloads: [
    fullStatus({ wall_power_w: 100 }), fullStatus({ wall_power_w: 110 }),
    fullStatus({ wall_power_w: 120 }),
  ] });
  await h.settle();
  h.tick(); await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const pts = vertices(h.id("pwr-chart"), VIOLET).filter((p) => p.op === "moveTo" || p.op === "lineTo");
  assert.ok(pts.length >= 3, `the fallback must still plot a line; got ${pts.length}`);
});

// ---- history: the manager's 7-day ring ------------------------------------

// A click on one of the span pills. The handler reads data-span off the
// button that e.target.closest('button') resolves to, exactly as the browser
// delivers a click on the pill's own text node.
function spanBtn(span) {
  const b = el("button");
  b.setAttribute("data-span", span);
  b.closest = (sel) => (sel === "button" ? b : null);
  return b;
}

function histBody(over) {
  const n = 60;
  const flat = (v) => new Array(n).fill(v);
  return Object.assign({
    t0: 1790000000, step: 2, span: 120, tier: "fine",
    series: {
      memory_used_gb: flat(16), gpu_percent: flat(50), gpu_vram_used_gb: flat(12),
      cpu_temp: flat(60), gpu_temp: flat(55), cpu_power_w: flat(80),
      gpu_power_w: flat(90), wall_power_w: flat(200),
      net_rx_bps: flat(1000), net_tx_bps: flat(500),
      disk_read_bytes: flat(2000), disk_write_bytes: flat(1000),
    },
  }, over || {});
}

test("the page opens showing history instead of a blank chart", async () => {
  // The whole reason the recorder exists: one frame in, the chart is a full
  // window, not a single point that takes two minutes to become a line.
  const h = load({ payloads: [fullStatus()], history: histBody() });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const pts = vertices(h.id("pwr-chart"), "rgb(90,173,138)");
  assert.ok(pts.length >= 30,
    `the seeded window must be drawn whole; got ${pts.length} vertices`);
});

test("a manager without the ring still runs the page live", async () => {
  // Deploys are not atomic, and the feature is optional — neither is a reason
  // for the Monitor to stop working.
  const h = load({ payloads: [fullStatus(), fullStatus()], history: { unavailable: true } });
  await h.settle();
  h.tick(); await h.settle();
  assert.strictEqual(h.id("wall-pwr-row").hidden, true);
  assert.strictEqual(h.id("cpu-avg").textContent, "38.8% avg (4 cores)",
    "the live numbers are unaffected");
  h.clearPaths();
  h.tick(); await h.settle();
  assert.ok(vertices(h.id("pwr-chart"), "rgb(90,173,138)").length >= 3,
    "and the live series still builds itself, exactly as before the ring existed");
});

test("at a history span the wall line comes from the ring too", async () => {
  // The wall row has its own server-built series for the live view. At a wider
  // span that series covers the wrong window, so the ring's column wins.
  const h = load({
    payloads: [fullStatus({ wall_plug: true, wall_power_w: 7,
                            wall_series: { t0: 1790000000, step: 2, w: new Array(60).fill(7) } })],
    history: histBody({ span: 3600, step: 60 }),
  });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const data = vertices(h.id("pwr-chart"), VIOLET).slice(0, -2).map((p) => p.y);
  const cpu = vertices(h.id("pwr-chart"), "rgb(90,173,138)").slice(0, -2).map((p) => p.y);
  assert.strictEqual(data.length, 60);
  // Flatness alone cannot tell the ring's 200W from the live series' 7W — both
  // are flat. Height can: the ring's wall figure is ABOVE the ring's 80W CPU
  // line, and a spliced-in 7W would sit well below it. (y grows downward.)
  assert.ok(data[0] < cpu[0],
    `the wall line must be the ring's 200W, above the 80W CPU line; `
    + `got wall y=${data[0]} vs cpu y=${cpu[0]}`);
  assert.strictEqual(h.id("wall-pwr-text").textContent, "7W",
    "while the reading beside it stays live");
});

test("a history fetch that fails never blanks the live page", async () => {
  const h = load({ payloads: [fullStatus(), fullStatus()], history: null });
  await h.settle();
  h.tick(); await h.settle();
  assert.strictEqual(h.id("cpu-avg").textContent, "38.8% avg (4 cores)");
});

test("picking a span asks the server for it and stops pushing local points", async () => {
  const h = load({ payloads: [fullStatus()], history: histBody({ span: 3600, step: 60 }) });
  await h.settle();
  const before = h.calls.length;
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  const asked = h.calls.slice(before).map((c) => c.url).filter((u) => u.indexOf("history") >= 0);
  assert.strictEqual(asked.length, 1, "exactly one fetch for the new span");
  assert.ok(asked[0].indexOf("span=1h") >= 0, asked[0]);
  assert.ok(asked[0].indexOf("slots=60") >= 0, "asks for the chart's own width");
});

test("at a history span the server owns the series, not the page", async () => {
  // A page appending its own point per frame could only place it by arrival —
  // the same mistake the wall series exists to avoid, one span wider.
  const h = load({
    payloads: [fullStatus({ cpu_power_w: 10 }), fullStatus({ cpu_power_w: 10 })],
    history: histBody({ span: 3600, step: 60 }),
  });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();          // a live frame at 10W arrives
  const pts = vertices(h.id("pwr-chart"), "rgb(90,173,138)");
  // The last two vertices close the fill on the baseline; the data ends before
  // them. A locally appended 10W point would land exactly there.
  const data = pts.slice(0, -2).map((p) => Math.round(p.y));
  assert.strictEqual(data.length, 60, "the server's window, whole and unextended");
  assert.strictEqual(data[0], data[data.length - 1],
    "the server sent one flat level; a live sample appended by the page would "
    + "show up as a step at the right-hand end");
  assert.strictEqual(h.id("cpu-pwr-text").textContent, "10W",
    "while the NUMBER beside the chart stays live — it is 'now', not history");
});

test("switching span clears the old window rather than mixing two scales", async () => {
  const h = load({ payloads: [fullStatus()], history: null });
  await h.settle();
  h.tick(); await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("7d") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  assert.deepStrictEqual(vertices(h.id("pwr-chart"), "rgb(90,173,138)"), [],
    "a failed load at the new span shows nothing, not the old span's points");
});

test("returning to 2m resumes the live push", async () => {
  const h = load({ payloads: [fullStatus()], history: histBody() });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("2m") });
  for (let i = 0; i < 4; i++) { h.tick(); await h.settle(); }
  h.clearPaths();
  h.tick(); await h.settle();
  const pts = vertices(h.id("pwr-chart"), "rgb(90,173,138)");
  assert.ok(pts.length >= 3, `live pushing must resume; got ${pts.length}`);
});

test("a sample with no neighbour is drawn as a dot, not discarded", async () => {
  // What an idle night looks like in the 2m window: the recorder sampled every
  // 30s, so one slot in fifteen is known. A line needs two points, so this used
  // to draw an entirely empty card over real data.
  const w = new Array(60).fill(null);
  [5, 20, 35, 50].forEach((i) => { w[i] = 120; });
  const h = load({
    payloads: [fullStatus({ wall_plug: true, wall_power_w: 120 })],
    history: histBody({ series: Object.assign(histBody().series, { cpu_power_w: w }) }),
  });
  await h.settle();
  // At a history span the page stops appending live points; without this the
  // last two live samples form a run and draw a line at the right-hand edge.
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const green = "rgb(90,173,138)";
  assert.strictEqual(vertices(h.id("pwr-chart"), green).length, 0,
    "there is nothing to join, so no line may be drawn");
  assert.strictEqual(dots(h.id("pwr-chart"), green).length, 4,
    "but every measured sample must still appear");
});

test("a dot marks the sample's own value, not the floor", async () => {
  const w = new Array(60).fill(null);
  w[10] = 0; w[30] = 300;            // a real zero and a big draw
  const h = load({
    payloads: [fullStatus()],
    history: histBody({ series: Object.assign(histBody().series, { cpu_power_w: w }) }),
  });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const d = dots(h.id("pwr-chart"), "rgb(90,173,138)").sort((a, b) => a.x - b.x);
  assert.strictEqual(d.length, 2);
  assert.ok(d[0].y > d[1].y,
    `0W belongs below 300W on the card (y grows downward); got ${d[0].y} and ${d[1].y}`);
});

test("a run of two or more is still a line, not a row of dots", async () => {
  const w = new Array(60).fill(null);
  for (let i = 20; i < 40; i++) w[i] = 150;
  const h = load({
    payloads: [fullStatus()],
    history: histBody({ series: Object.assign(histBody().series, { cpu_power_w: w }) }),
  });
  await h.settle();
  h.id("span-pick").fire("click", { target: spanBtn("1h") });
  await h.settle();
  h.clearPaths();
  h.tick(); await h.settle();
  const green = "rgb(90,173,138)";
  assert.ok(vertices(h.id("pwr-chart"), green).length >= 20, "drawn as a line");
  assert.strictEqual(dots(h.id("pwr-chart"), green).length, 0, "and no dots");
});
