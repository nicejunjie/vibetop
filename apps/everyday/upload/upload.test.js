// Hermetic unit tests for upload.html's inline script.
//
// Pattern (see apps/everyday/browser/xpra-patches.test.js): read the real HTML,
// pull out the inline <script> (NOT the external /vibe-modal.js <script src=...>
// tag — the regex below only matches a bare <script> with no attributes), run
// it in a vm sandbox with a minimal fake DOM + fake XMLHttpRequest, then drive
// the REAL handlers the page installs.
//
// NOTE: unlike imageview.html and video.html, upload.html's inline script has
// NO pointerdown focus-claim listener at all (verified: `grep -n pointerdown
// apps/everyday/upload/upload.html` matches nothing, and /vibe-modal.js, the
// only other script the page loads, doesn't have one either). So there is no
// focus contract to test here — see the final report.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "upload.html"), "utf8");
function extractScript(html) {
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no inline <script> found");
  return m[1];
}
const SRC = extractScript(HTML);

function matchesSel(el, sel) {
  return sel.split(",").map(function (s) { return s.trim(); }).some(function (s) {
    if (s[0] === ".") return el.classList.contains(s.slice(1));
    return el.tagName && el.tagName.toLowerCase() === s.toLowerCase();
  });
}
function parseInnerHTML(html, makeElFn) {
  var out = [];
  var re = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
  var m;
  while ((m = re.exec(html))) {
    var el = makeElFn(m[1]);
    var cm = /class="([^"]*)"/.exec(m[2]);
    if (cm) cm[1].split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
    if (/\bhidden\b/.test(m[2])) el.hidden = true;
    el.textContent = m[3];
    out.push(el);
  }
  return out;
}
function makeEl(tag) {
  var cls = new Set();
  var el = {
    tagName: String(tag || "div").toUpperCase(),
    _listeners: {},
    style: {},
    attrs: {},
    children: [],
    parentNode: null,
    classList: {
      add: function (c) { cls.add(c); },
      remove: function (c) { cls.delete(c); },
      contains: function (c) { return cls.has(c); },
    },
    addEventListener: function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener: function () {},
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore: function (node, ref) {
      var i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
      node.parentNode = this;
      return node;
    },
    remove: function () { if (this.parentNode) { var i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
    querySelectorAll: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); }); },
    querySelector: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); })[0] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
  };
  Object.defineProperty(el, "className", {
    get: function () { return Array.from(cls).join(" "); },
    set: function (v) { cls.clear(); String(v).split(/\s+/).forEach(function (c) { if (c) cls.add(c); }); },
  });
  Object.defineProperty(el, "innerHTML", {
    get: function () { return this._html || ""; },
    set: function (v) {
      this._html = v;
      this.children = parseInnerHTML(v, makeEl);
      var self = this;
      this.children.forEach(function (c) { c.parentNode = self; });
    },
  });
  return el;
}

// ---- a fake XMLHttpRequest the test drives by hand (no real network) -------
function makeXhrClass(registry) {
  function FakeXHR() {
    this.upload = {};
    this.status = 0;
    this.responseText = "";
    this._aborted = false;
    registry.push(this);
  }
  FakeXHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
  FakeXHR.prototype.send = function (body) { this.body = body; };
  FakeXHR.prototype.abort = function () { this._aborted = true; if (this.onabort) this.onabort(); if (this.onloadend) this.onloadend(); };
  return FakeXHR;
}

function load(opts) {
  opts = opts || {};
  var ids = {};
  ["picker", "drop", "list", "send", "clear", "bar", "fill", "pct", "status", "dir",
    "folder", "folder-count", "queue-count", "refresh", "clear-folder", "open-files"].forEach(function (id) {
    ids[id] = makeEl(id === "send" || id === "clear" || id === "refresh" || id === "clear-folder" || id === "open-files" ? "button" : "div");
  });
  var xhrs = [];
  var fetchCalls = [];
  var confirmAnswer = true;
  var fetchImpl = opts.fetch || function (url, init) {
    fetchCalls.push({ url: url, init: init });
    if (String(url).indexOf("/api/upload/list") === 0) {
      return Promise.resolve({ json: function () { return Promise.resolve({ dir: "~/Uploads/", rel_to_home: "Uploads", files: [] }); } });
    }
    return Promise.resolve({ json: function () { return Promise.resolve({}); } });
  };
  var sandbox = {
    console: { warn() {}, log() {}, error() {} },
    location: { hostname: opts.hostname != null ? opts.hostname : "service.example.com" },
    fetch: fetchImpl,
    FormData: (function () {
      function FD() { this._entries = []; }
      FD.prototype.append = function (k, v, filename) { this._entries.push([k, v, filename]); };
      return FD;
    })(),
    XMLHttpRequest: makeXhrClass(xhrs),
    vibeConfirm: function () { return Promise.resolve(confirmAnswer); },
    document: {
      getElementById: function (id) { return ids[id] || null; },
      createElement: function (tag) { return makeEl(tag); },
    },
  };
  sandbox.window = sandbox;
  sandbox.window.top = opts.isTopWindow ? sandbox.window : { __other: true };

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "upload.html-inline" }).runInContext(sandbox);

  return {
    sandbox: sandbox, ids: ids, xhrs: xhrs, fetchCalls: fetchCalls,
    setConfirm: function (v) { confirmAnswer = v; },
    flush: function () { return new Promise(function (r) { setTimeout(r, 0); }); },
  };
}

// ---------------------------------------------------------------------------
// No focus-contract test here, deliberately. The other viewers claim the
// keyboard on pointerdown because Safari on macOS only focuses form controls
// and links; this page has no keydown handler at all, so it has nothing to
// claim the keys FOR. Asserting the listener's absence was the first version of
// this file and was removed: it would fail the day someone correctly adds
// keyboard support, which is backwards. If this page ever gains a shortcut, it
// needs the claim — and a test like imageview's.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// fmtSize: human-readable sizes rendered into the queue item's .meta span.
// ---------------------------------------------------------------------------
test("fmtSize renders B/KB/MB/GB thresholds correctly in the queued item", function () {
  var s = load();
  var fakeList = { files: [{ name: "a", size: 500 }, { name: "b", size: 2048 }, { name: "c", size: 5 * 1048576 }, { name: "d", size: 2 * 1073741824 }] };
  s.ids.picker.files = fakeList.files;
  s.ids.picker._listeners.change[0]();
  var metas = s.ids.list.children.map(function (c) { return c.querySelector(".meta").textContent; });
  assert.deepStrictEqual(metas, ["500 B", "2.0 KB", "5.0 MB", "2.00 GB"]);
});

// ---------------------------------------------------------------------------
// Cloudflare tunnel size cap: only enforced when reached via a public hostname.
// ---------------------------------------------------------------------------
test("an oversize file is blocked over the public hostname but allowed on the LAN", function () {
  var big = { name: "big.bin", size: 150 * 1000 * 1000 };
  var pub = load({ hostname: "service.example.com" });
  pub.ids.picker.files = [big];
  pub.ids.picker._listeners.change[0]();
  var item = pub.ids.list.children[0];
  assert.ok(item.classList.contains("error"), "blocked over the tunnel");
  assert.strictEqual(item.querySelector(".retry").hidden, true, "a size-blocked file offers no retry (retrying the same path can't help)");
  assert.strictEqual(pub.ids.send.disabled, true, "nothing pending, Upload stays disabled");

  var lan = load({ hostname: "192.168.1.10" });
  lan.ids.picker.files = [big];
  lan.ids.picker._listeners.change[0]();
  var item2 = lan.ids.list.children[0];
  assert.ok(!item2.classList.contains("error"), "the same file is NOT blocked on the LAN");
  assert.strictEqual(lan.ids.send.disabled, false, "it is queued and Upload is enabled");
});

// ---------------------------------------------------------------------------
// Full upload lifecycle via the fake XHR: progress, success, and the three
// failure-reason mappings (413 / network / generic server error).
// ---------------------------------------------------------------------------
test("a successful upload marks the item done and updates the badge from progress", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "photo.png", size: 100 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();

  var xhr = s.xhrs[s.xhrs.length - 1];
  assert.strictEqual(xhr.method, "POST");
  assert.strictEqual(xhr.url, "/api/upload");
  xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  var item = s.ids.list.children[0];
  assert.strictEqual(item.querySelector(".badge").textContent, "50%");

  xhr.status = 200;
  xhr.responseText = JSON.stringify({ dir: "~/Uploads/" });
  xhr.onload();
  await s.flush();

  assert.ok(item.classList.contains("done"));
  assert.strictEqual(item.querySelector(".badge").textContent, "✓ Done");
  assert.strictEqual(s.ids.status.textContent, "Uploaded 1 file");
});

test("a 413 response is reported as a clear size-limit failure with a retry available", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "huge.mp4", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr = s.xhrs[s.xhrs.length - 1];
  xhr.status = 413;
  xhr.responseText = "";
  xhr.onload();
  await s.flush();
  var item = s.ids.list.children[0];
  assert.ok(item.classList.contains("error"));
  assert.strictEqual(item.querySelector(".reason").textContent, "File is larger than the server allows");
  assert.strictEqual(item.querySelector(".retry").hidden, false);
});

test("a network drop is reported distinctly from a server error, and a server {error} message is surfaced", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "a.bin", size: 10 }, { name: "b.bin", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr1 = s.xhrs[s.xhrs.length - 1];
  xhr1.onerror();
  await s.flush();
  var item1 = s.ids.list.children[0];
  assert.strictEqual(item1.querySelector(".reason").textContent, "Network dropped — check your connection and retry");

  var xhr2 = s.xhrs[s.xhrs.length - 1];
  xhr2.status = 500;
  xhr2.responseText = JSON.stringify({ error: "disk full" });
  xhr2.onload();
  await s.flush();
  var item2 = s.ids.list.children[1];
  assert.strictEqual(item2.querySelector(".reason").textContent, "disk full (500)");
});

test("retryOne is a no-op while another batch/retry is already busy", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "a.bin", size: 10 }, { name: "b.bin", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  // Uploads run serially: only one XHR exists at a time. Fail the first, then
  // (once step() moves on) fail the second, so both end up with a live retry.
  var xhr1 = s.xhrs[s.xhrs.length - 1];
  xhr1.status = 500; xhr1.responseText = "";
  xhr1.onload();
  await s.flush();
  var xhr2 = s.xhrs[s.xhrs.length - 1];
  xhr2.status = 500; xhr2.responseText = "";
  xhr2.onload();
  await s.flush();
  var item1 = s.ids.list.children[0];
  var item2 = s.ids.list.children[1];
  assert.ok(item1.classList.contains("error") && item2.classList.contains("error"));

  // Retry item1: this leaves `busy` true until its promise settles.
  item1.querySelector(".retry")._listeners.click[0]();
  var xhrCountAfterFirstRetry = s.xhrs.length;
  // While that retry is still in flight, retrying item2 must be a no-op.
  item2.querySelector(".retry")._listeners.click[0]();
  assert.strictEqual(s.xhrs.length, xhrCountAfterFirstRetry, "no new XHR fired for item2 while busy");
  assert.ok(item2.classList.contains("error"), "item2 is left untouched, still failed");
});

test("retrying a failed item re-sends it and clears the error state on success", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "a.bin", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr1 = s.xhrs[s.xhrs.length - 1];
  xhr1.status = 500; xhr1.responseText = "";
  xhr1.onload();
  await s.flush();
  var item = s.ids.list.children[0];
  assert.ok(item.classList.contains("error"));

  item.querySelector(".retry")._listeners.click[0]();
  await s.flush();
  var xhr2 = s.xhrs[s.xhrs.length - 1];
  assert.notStrictEqual(xhr2, xhr1, "retry sends a fresh XHR");
  xhr2.status = 200; xhr2.responseText = "{}";
  xhr2.onload();
  await s.flush();
  assert.ok(item.classList.contains("done"));
  assert.ok(!item.classList.contains("error"));
});

test("removing a queued item aborts its in-flight XHR", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "a.bin", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr = s.xhrs[s.xhrs.length - 1];
  var item = s.ids.list.children[0];
  item.querySelector(".x")._listeners.click[0]();
  assert.ok(xhr._aborted, "the in-flight XHR must be aborted, not left running");
});

test("Clear aborts every in-flight upload before emptying the queue", async function () {
  var s = load();
  s.ids.picker.files = [{ name: "a.bin", size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr = s.xhrs[s.xhrs.length - 1];
  s.ids.clear._listeners.click[0]();
  assert.ok(xhr._aborted);
  assert.strictEqual(s.ids.list.children.length, 0);
});

// ---------------------------------------------------------------------------
// A filename with spaces, # and % is sent verbatim as the multipart filename
// (browsers, not this code, percent-encode the multipart header) — assert the
// exact File object/name reaches FormData.append untouched.
// ---------------------------------------------------------------------------
test("a tricky filename (spaces, #, %) reaches FormData.append unmodified", async function () {
  var s = load();
  var trickyName = "a #1 100% done.png";
  s.ids.picker.files = [{ name: trickyName, size: 10 }];
  s.ids.picker._listeners.change[0]();
  s.ids.send._listeners.click[0]();
  await s.flush();
  var xhr = s.xhrs[s.xhrs.length - 1];
  assert.strictEqual(xhr.body._entries[0][0], "file");
  assert.strictEqual(xhr.body._entries[0][2], trickyName);
});

// ---------------------------------------------------------------------------
// "Open in Files" is only offered when the upload dir is under the user's
// home AND we are actually embedded (not the top-level window).
// ---------------------------------------------------------------------------
test("Open in Files stays disabled at the top window or with no rel_to_home", async function () {
  var embeddedNoRel = load({
    isTopWindow: false,
    fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({ dir: "/mnt/x", rel_to_home: null, files: [] }); } }); },
  });
  await embeddedNoRel.flush();
  assert.strictEqual(embeddedNoRel.ids["open-files"].disabled, true, "no rel_to_home");

  var topLevel = load({ isTopWindow: true });
  await topLevel.flush();
  assert.strictEqual(topLevel.ids["open-files"].disabled, true, "top-level window, nowhere to postMessage");

  var embedded = load({ isTopWindow: false });
  await embedded.flush();
  assert.strictEqual(embedded.ids["open-files"].disabled, false, "embedded + rel_to_home present");
});
