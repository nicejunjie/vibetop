// Hermetic unit tests for imageview.html's inline script.
//
// Pattern (see apps/everyday/browser/xpra-patches.test.js): read the real HTML,
// pull out the inline <script>, run it in a vm sandbox with a minimal fake DOM,
// then drive the REAL handlers the page installs (pointerdown, keydown, wheel,
// the prev/next buttons) rather than re-implementing step()/zoomAt() here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = path.join(__dirname, "imageview.html");
const HTML = fs.readFileSync(HTML_PATH, "utf8");

function extractScript(html) {
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no inline <script> found");
  return m[1];
}
const SRC = extractScript(HTML);

// ---- a tiny fake DOM: just enough for imageview.html's own code paths -----
function matchesSel(el, sel) {
  return sel.split(",").map(function (s) { return s.trim(); }).some(function (s) {
    if (s[0] === ".") return el.classList.contains(s.slice(1));
    return el.tagName && el.tagName.toLowerCase() === s.toLowerCase();
  });
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
    remove: function () {
      if (this.parentNode) {
        var i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
      }
    },
    querySelectorAll: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); }); },
    querySelector: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); })[0] || null; },
    closest: function (sel) {
      var n = this;
      while (n) { if (n.tagName && matchesSel(n, sel)) return n; n = n.parentNode; }
      return null;
    },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
    focus: function (opts) { this.focused = (this.focused || 0) + 1; this.lastFocusOpts = opts; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 300 }; },
  };
  return el;
}

function load(qs) {
  qs = qs || "path=" + encodeURIComponent("home/junjie/Pictures/a.png");
  var byId = {};
  ["name", "cnt", "dl", "close", "prev", "next"].forEach(function (id) {
    byId[id] = makeEl(id === "prev" || id === "next" ? "button" : "span");
  });
  var stage = makeEl("div");
  byId.stage = stage;

  var body = makeEl("body");
  var posted = [];
  var sandbox = {
    console: { warn() {}, log() {}, error() {} },
    location: { search: "?" + qs },
    navigator: { userAgent: "test" },
    URLSearchParams: URLSearchParams,
    encodeURIComponent: encodeURIComponent,
    fetch: function () { return Promise.resolve({ ok: false }); }, // no sibling list by default
    Image: function () { return makeEl("img"); },
    document: {
      _listeners: {},
      addEventListener: function (type, fn, capture) { (this._listeners[type] = this._listeners[type] || []).push({ fn: fn, capture: capture }); },
      removeEventListener: function () {},
      getElementById: function (id) { return byId[id] || null; },
      createElement: function (tag) { return makeEl(tag); },
      body: body,
      activeElement: body,
      title: "",
    },
  };
  sandbox.window = sandbox;
  sandbox.window.parent = { postMessage: function (msg) { posted.push(msg); } };
  var winListeners = {};
  sandbox.window.addEventListener = function (type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); };
  sandbox.window.focus = function () { sandbox.window._focusCalls = (sandbox.window._focusCalls || 0) + 1; };

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "imageview.html-inline" }).runInContext(sandbox);

  return {
    sandbox: sandbox, byId: byId, stage: stage, posted: posted, winListeners: winListeners,
    fireDocPointerdown: function (ev) {
      (sandbox.document._listeners.pointerdown || []).forEach(function (l) { l.fn(ev); });
    },
    fireWinKeydown: function (ev) {
      (winListeners.keydown || []).forEach(function (fn) { fn(ev); });
    },
  };
}

// ---------------------------------------------------------------------------
// THE FOCUS CONTRACT — the highest-value test in this batch.
// ---------------------------------------------------------------------------
test("focus contract: plain content claims the keyboard", function () {
  var s = load();
  var target = makeEl("div");
  s.fireDocPointerdown({ target: target });
  assert.strictEqual(s.sandbox.window._focusCalls, 1, "window.focus() must be called");
  assert.strictEqual(s.sandbox.document.body.tabIndex, -1, "body.tabIndex must be set to -1");
  assert.ok(s.sandbox.document.body.focused >= 1, "body.focus() must be called");
  // Cross-realm object from the vm sandbox: compare via JSON, not deepStrictEqual
  // (which also checks prototype identity across realms).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.sandbox.document.body.lastFocusOpts)), { preventScroll: true });
});

test("focus contract: form controls / links / contentEditable do not get claimed", function () {
  ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].forEach(function (tag) {
    var s = load();
    var target = makeEl(tag);
    s.fireDocPointerdown({ target: target });
    assert.strictEqual(s.sandbox.window._focusCalls || 0, 0, tag + " must not steal focus");
    assert.strictEqual(s.sandbox.document.body.focused || 0, 0, tag + " must not blur itself");
  });
  var s2 = load();
  var editable = makeEl("div");
  editable.isContentEditable = true;
  s2.fireDocPointerdown({ target: editable });
  assert.strictEqual(s2.sandbox.window._focusCalls || 0, 0, "contentEditable must not be claimed");
});

test("focus contract: never blurs an edit already in progress", function () {
  var s = load();
  var activeInput = makeEl("INPUT");
  s.sandbox.document.activeElement = activeInput;   // an edit is under way
  var target = makeEl("div");                        // pointerdown lands on ordinary content
  s.fireDocPointerdown({ target: target });
  assert.strictEqual(s.sandbox.window._focusCalls || 0, 0, "must not steal focus while an INPUT is active");
});

// ---------------------------------------------------------------------------
// Escape / arrow keys -> postMessage close-app, and step() navigation.
// ---------------------------------------------------------------------------
test("Escape posts close-app to the parent frame", function () {
  var s = load();
  s.fireWinKeydown({ key: "Escape" });
  assert.strictEqual(s.posted.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.posted[0])), { type: "close-app", app: "imageview" });
});

test("arrow keys are no-ops with no sibling list (never throws)", function () {
  var s = load();
  assert.doesNotThrow(function () {
    s.fireWinKeydown({ key: "ArrowLeft" });
    s.fireWinKeydown({ key: "ArrowRight" });
  });
});

// ---------------------------------------------------------------------------
// Path encoding: a path with spaces, # and % must survive into the image URL.
// ---------------------------------------------------------------------------
test("a filename with spaces, # and % is percent-encoded in the raw image URL", function () {
  var tricky = "home/junjie/My Pics/a #1 100%.png";
  var s = load("path=" + encodeURIComponent(tricky));
  var img = s.stage.children.filter(function (c) { return c.tagName === "IMG"; })[0];
  assert.ok(img, "an <img> must have been appended");
  assert.strictEqual(img.src, "/api/file/image?path=" + encodeURIComponent(tricky));
  assert.strictEqual(s.byId.name.textContent, "a #1 100%.png");
});

// ---------------------------------------------------------------------------
// step() navigation: real prev/next click handlers, driven via a resolved
// sibling-list fetch (no re-implementation of the sort/index logic here).
// ---------------------------------------------------------------------------
function loadWithSiblings() {
  var entries = ["a.png", "b.png", "c.png"];
  var s = load("path=" + encodeURIComponent("home/junjie/Pictures/b.png"));
  return s; // fetch stub below resolves synchronously via a controllable promise
}

test("prev/next clamp at the ends of the folder listing (no wraparound)", function (t, done) {
  var entries = ["a.png", "b.png", "c.png"];
  var byId = {};
  ["name", "cnt", "dl", "close", "prev", "next"].forEach(function (id) {
    byId[id] = makeEl(id === "prev" || id === "next" ? "button" : "span");
  });
  var stage = makeEl("div");
  var sandbox = {
    console: { warn() {}, log() {}, error() {} },
    location: { search: "?path=" + encodeURIComponent("home/junjie/Pictures/b.png") },
    navigator: { userAgent: "test" },
    URLSearchParams: URLSearchParams,
    encodeURIComponent: encodeURIComponent,
    fetch: function () {
      return Promise.resolve({ ok: true, json: function () {
        return Promise.resolve({ ok: true, entries: entries.map(function (n) { return { name: n, isDir: false }; }) });
      } });
    },
    Image: function () { return makeEl("img"); },
    document: {
      _listeners: {},
      addEventListener: function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
      removeEventListener: function () {},
      getElementById: function (id) { return byId[id] || stage || null; },
      createElement: function (tag) { return makeEl(tag); },
      body: makeEl("body"),
      activeElement: null,
      title: "",
    },
  };
  sandbox.document.getElementById = function (id) { return id === "stage" ? stage : (byId[id] || null); };
  sandbox.window = sandbox;
  sandbox.window.parent = { postMessage: function () {} };
  sandbox.window.addEventListener = function () {};
  sandbox.window.focus = function () {};
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "imageview.html-inline" }).runInContext(sandbox);

  // Let the fetch().then chain (a real microtask queue) resolve.
  setTimeout(function () {
    try {
      assert.strictEqual(byId.cnt.textContent, "2 / 3", "starts at b.png = index 1 of 3");
      assert.strictEqual(byId.prev.disabled, false);
      assert.strictEqual(byId.next.disabled, false);

      byId.next._listeners.click[0]();
      assert.strictEqual(byId.name.textContent, "c.png");
      assert.strictEqual(byId.next.disabled, true, "clamped at the last entry");
      byId.next._listeners.click[0]();   // one more: must be a no-op, not throw
      assert.strictEqual(byId.name.textContent, "c.png", "next beyond the end does not wrap to a.png");

      byId.prev._listeners.click[0](); byId.prev._listeners.click[0]();
      assert.strictEqual(byId.name.textContent, "a.png");
      assert.strictEqual(byId.prev.disabled, true, "clamped at the first entry");
      byId.prev._listeners.click[0]();
      assert.strictEqual(byId.name.textContent, "a.png", "prev before the start does not wrap to c.png");
      done();
    } catch (e) { done(e); }
  }, 0);
});

// ---------------------------------------------------------------------------
// Zoom: wheel zooms in/out and is clamped to [1, 6].
// ---------------------------------------------------------------------------
test("wheel zoom is clamped to 6x and back down to 1x, never past either bound", function () {
  var s = load();
  var img = s.stage.children.filter(function (c) { return c.tagName === "IMG"; })[0];
  var wheel = s.stage._listeners.wheel[0];
  function zoomFactor() {
    var m = /scale\(([\d.]+)\)/.exec(img.style.transform || "");
    return m ? parseFloat(m[1]) : 1;
  }
  for (var i = 0; i < 40; i++) {
    wheel({ deltaY: -1, clientX: 100, clientY: 100, preventDefault: function () {} });
  }
  assert.strictEqual(zoomFactor(), 6, "zoom must not exceed 6x");
  assert.ok(img.classList.contains("zoomed"));
  for (var j = 0; j < 40; j++) {
    wheel({ deltaY: 1, clientX: 100, clientY: 100, preventDefault: function () {} });
  }
  assert.strictEqual(img.classList.contains("zoomed"), false, "back to 1x drops the zoomed class");
  assert.strictEqual(img.style.transform, "translate(-50%, -50%)");
});

test("double-tap/double-click toggles zoom between 1x and 2.5x", function () {
  var s = load();
  var img = s.stage.children.filter(function (c) { return c.tagName === "IMG"; })[0];
  var pd = s.stage._listeners.pointerdown[0];
  pd({ target: makeEl("div"), timeStamp: 1000, clientX: 50, clientY: 50 });
  pd({ target: makeEl("div"), timeStamp: 1100, clientX: 51, clientY: 51 }); // within 350ms, 24px
  assert.ok(img.classList.contains("zoomed"), "double-tap zooms in to 2.5x");
  pd({ target: makeEl("div"), timeStamp: 2000, clientX: 51, clientY: 51 });
  pd({ target: makeEl("div"), timeStamp: 2100, clientX: 51, clientY: 51 });
  assert.strictEqual(img.classList.contains("zoomed"), false, "a second double-tap toggles back to 1x");
});
