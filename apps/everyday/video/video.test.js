// Hermetic unit tests for video.html's inline script.
//
// Pattern (see apps/everyday/browser/xpra-patches.test.js): read the real HTML,
// pull out the inline <script>, run it in a vm sandbox with a minimal fake DOM,
// then drive the REAL handlers the page installs rather than re-implementing
// its formatting/keyboard/volume logic here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "video.html"), "utf8");
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
    removeEventListener: function (type, fn) {
      var l = this._listeners[type]; if (!l) return;
      var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    },
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    remove: function () { if (this.parentNode) { var i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
    querySelectorAll: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); }); },
    querySelector: function (sel) { return this.children.filter(function (c) { return matchesSel(c, sel); })[0] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
    focus: function (opts) { this.focused = (this.focused || 0) + 1; this.lastFocusOpts = opts; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 40 }; },
    setPointerCapture: function () {},
  };
  return el;
}

function makeVideo() {
  var v = makeEl("video");
  v.paused = true;
  v.ended = false;
  v.muted = false;
  v.volume = 1;
  v.duration = 100;
  v.currentTime = 0;
  v.buffered = { length: 0, end: function () { return 0; } };
  v.textTracks = [];
  v._playCalls = 0; v._pauseCalls = 0;
  v.play = function () { this._playCalls++; this.paused = false; return { catch: function () {} }; };
  v.pause = function () { this._pauseCalls++; this.paused = true; };
  v.load = function () { this._loaded = (this._loaded || 0) + 1; };
  return v;
}

function load(opts) {
  opts = opts || {};
  var v = makeVideo();
  var ids = {
    "v": v,
    "stage": makeEl("div"),
    "msg": makeEl("div"),
    "name": makeEl("span"),
    "audio-ctl": makeEl("div"),
    "audio-sel": makeEl("select"),
    "sub-ctl": makeEl("div"),
    "sub-sel": makeEl("select"),
    "fs-btn": makeEl("button"),
    "play": makeEl("button"),
    "mute": makeEl("button"),
    "seek": makeEl("div"),
    "buf": makeEl("div"),
    "prog": makeEl("div"),
    "knob": makeEl("div"),
    "time": makeEl("span"),
    "vol": makeEl("input"),
    "close-btn": makeEl("button"),
    "cue": makeEl("div"),
  };
  ids["vol"].value = "1";
  var posted = [];
  var localStore = {};
  var winListeners = {};
  var docListeners = {};
  var fetchImpl = opts.fetch || function () {
    return Promise.resolve({ json: function () { return Promise.resolve({ ffmpeg: false }); } });
  };
  var sandbox = {
    console: { warn() {}, log() {}, error() {} },
    location: { search: "?" + (opts.qs || "path=" + encodeURIComponent("home/junjie/Videos/a.mp4")) },
    navigator: { userAgent: "test" },
    URLSearchParams: URLSearchParams,
    encodeURIComponent: encodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
      setItem: function (k, val) { localStore[k] = String(val); },
    },
    fetch: fetchImpl,
    document: {
      _listeners: docListeners,
      addEventListener: function (type, fn, capture) { (docListeners[type] = docListeners[type] || []).push({ fn: fn, capture: capture }); },
      removeEventListener: function () {},
      getElementById: function (id) { return ids[id] || null; },
      createElement: function (tag) { return makeEl(tag); },
      querySelectorAll: function () { return []; },
      body: makeEl("body"),
      activeElement: null,
      title: "",
      fullscreenElement: null,
      exitFullscreen: function () { return Promise.resolve(); },
    },
  };
  sandbox.window = sandbox;
  sandbox.window.parent = { postMessage: function (msg) { posted.push(msg); } };
  sandbox.window.addEventListener = function (type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); };
  sandbox.window.focus = function () { sandbox._focusCalls = (sandbox._focusCalls || 0) + 1; };

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "video.html-inline" }).runInContext(sandbox);

  return {
    sandbox: sandbox, ids: ids, v: v, posted: posted, winListeners: winListeners,
    fireDocPointerdown: function (ev) { (docListeners.pointerdown || []).forEach(function (l) { l.fn(ev); }); },
    fireDocKeydown: function (ev) { (docListeners.keydown || []).forEach(function (l) { l.fn(ev); }); },
  };
}

// ---------------------------------------------------------------------------
// THE FOCUS CONTRACT
// ---------------------------------------------------------------------------
test("focus contract: plain content claims the keyboard", function () {
  var s = load();
  s.fireDocPointerdown({ target: makeEl("div") });
  assert.strictEqual(s.sandbox._focusCalls, 1);
  assert.strictEqual(s.sandbox.document.body.tabIndex, -1);
  assert.ok(s.sandbox.document.body.focused >= 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.sandbox.document.body.lastFocusOpts)), { preventScroll: true });
});

test("focus contract: form controls / links / contentEditable do not get claimed", function () {
  ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].forEach(function (tag) {
    var s = load();
    s.fireDocPointerdown({ target: makeEl(tag) });
    assert.strictEqual(s.sandbox._focusCalls || 0, 0, tag + " must not steal focus");
  });
  var s2 = load();
  var editable = makeEl("div"); editable.isContentEditable = true;
  s2.fireDocPointerdown({ target: editable });
  assert.strictEqual(s2.sandbox._focusCalls || 0, 0);
});

test("focus contract: never blurs an edit already in progress", function () {
  var s = load();
  s.sandbox.document.activeElement = makeEl("TEXTAREA");
  s.fireDocPointerdown({ target: makeEl("div") });
  assert.strictEqual(s.sandbox._focusCalls || 0, 0);
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts drive the real video element.
// ---------------------------------------------------------------------------
test("ArrowRight/ArrowLeft seek by 5s, clamped to [0, duration]", function () {
  var s = load();
  s.v.currentTime = 2;
  var pd = 0;
  s.fireDocKeydown({ key: "ArrowLeft", target: { tagName: "BODY" }, preventDefault: function () { pd++; } });
  assert.strictEqual(s.v.currentTime, 0, "clamped at 0, not negative");
  assert.strictEqual(pd, 1, "handled keys call preventDefault");
  s.v.currentTime = 98;
  s.fireDocKeydown({ key: "ArrowRight", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v.currentTime, 100, "clamped at duration");
});

test("j/l skip 10s, digits 0-9 jump to percent of duration", function () {
  var s = load();
  s.v.currentTime = 50;
  s.fireDocKeydown({ key: "l", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v.currentTime, 60);
  s.fireDocKeydown({ key: "j", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v.currentTime, 50);
  s.fireDocKeydown({ key: "5", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v.currentTime, 50, "5/10 of 100 duration");
});

test("space/k toggles play, m mutes, an unhandled key is left alone (no preventDefault)", function () {
  var s = load();
  s.fireDocKeydown({ key: " ", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v._playCalls, 1);
  s.fireDocKeydown({ key: "k", target: { tagName: "BODY" }, preventDefault: function () {} });
  assert.strictEqual(s.v._pauseCalls, 1);
  var pdCount = 0;
  s.fireDocKeydown({ key: "z", target: { tagName: "BODY" }, preventDefault: function () { pdCount++; } });
  assert.strictEqual(pdCount, 0, "an unhandled key must not preventDefault");
});

test("keyboard shortcuts are suppressed while typing in a form control", function () {
  var s = load();
  s.v.currentTime = 50;
  s.fireDocKeydown({ key: "ArrowLeft", target: { tagName: "input" }, preventDefault: function () { throw new Error("must not fire"); } });
  assert.strictEqual(s.v.currentTime, 50, "an <input> target must keep its native arrow-key behaviour");
});

test("a modifier-chord (Ctrl/Cmd/Alt) is never intercepted", function () {
  var s = load();
  s.v.currentTime = 50;
  s.fireDocKeydown({ key: "ArrowLeft", ctrlKey: true, target: { tagName: "BODY" }, preventDefault: function () { throw new Error("must not fire"); } });
  assert.strictEqual(s.v.currentTime, 50);
});

// ---------------------------------------------------------------------------
// Close button: pauses playback, then tells the Files wrapper to close.
// ---------------------------------------------------------------------------
test("Close pauses the video and posts close-app/video to the parent", function () {
  var s = load();
  s.v.paused = false;
  s.ids["close-btn"]._listeners.click[0]();
  assert.strictEqual(s.v._pauseCalls, 1);
  assert.strictEqual(s.posted.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.posted[0])), { type: "close-app", app: "video" });
});

// ---------------------------------------------------------------------------
// Volume: applyVol clamps to [0,1] and un-mutes on a positive drag; mute
// button toggles, and 0-volume unmute picks 0.5 rather than staying silent.
// ---------------------------------------------------------------------------
test("dragging the volume slider clamps to [0,1] and unmutes on a positive value", function () {
  var s = load();
  s.v.muted = true;
  s.ids["vol"].value = "1.7";
  s.ids["vol"]._listeners.input[0]();
  assert.strictEqual(s.v.volume, 1, "clamped to 1");
  assert.strictEqual(s.v.muted, false, "a positive drag unmutes");

  s.ids["vol"].value = "-3";
  s.ids["vol"]._listeners.input[0]();
  assert.strictEqual(s.v.volume, 0, "clamped to 0");
});

test("mute button toggles, and unmuting from an explicit 0 picks an audible 0.5", function () {
  var s = load();
  s.v.volume = 0; s.v.muted = false;
  s.ids["mute"]._listeners.click[0]();
  assert.strictEqual(s.v.volume, 0.5, "0 -> audible on unmute click, not silently toggled");
  s.v.muted = false; s.v.volume = 0.8;
  s.ids["mute"]._listeners.click[0]();
  assert.strictEqual(s.v.muted, true, "a normal volume just toggles mute");
});

// ---------------------------------------------------------------------------
// Scrub state must not survive a pointer that ended off-element.
// ---------------------------------------------------------------------------
test("pointercancel / lostpointercapture / window blur all clear an in-progress scrub", function () {
  ["pointercancel", "lostpointercapture"].forEach(function (evtName) {
    var s = load();
    s.ids.seek._listeners.pointerdown[0]({ clientX: 10, pointerId: 1 });
    s.v.currentTime = 3; // sentinel: a move after clearing must NOT reach seekTo
    (s.ids.seek._listeners[evtName] || []).forEach(function (fn) { fn({}); });
    s.ids.seek._listeners.pointermove[0]({ clientX: 999 });
    assert.strictEqual(s.v.currentTime, 3, evtName + " must stop the scrub");
  });
  var s2 = load();
  s2.ids.seek._listeners.pointerdown[0]({ clientX: 10, pointerId: 1 });
  s2.v.currentTime = 3;
  s2.winListeners.blur.forEach(function (fn) { fn({}); });
  s2.ids.seek._listeners.pointermove[0]({ clientX: 999 });
  assert.strictEqual(s2.v.currentTime, 3, "window blur must stop the scrub");
});

// ---------------------------------------------------------------------------
// Path encoding in the media URL fetched from the server.
// ---------------------------------------------------------------------------
test("a path with spaces, # and % is percent-encoded in /api/video/info and media URLs", function () {
  var tricky = "home/junjie/My Videos/clip #1 100%.mkv";
  var infoCalls = [];
  var s = load({
    qs: "path=" + encodeURIComponent(tricky),
    fetch: function (url) {
      infoCalls.push(url);
      return Promise.resolve({ json: function () {
        return Promise.resolve({ ok: true, name: "clip.mkv", audio: [{ ai: 0 }], subs: [] });
      } });
    },
  });
  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.strictEqual(infoCalls[0], "/api/video/info?path=" + encodeURIComponent(tricky));
      assert.strictEqual(s.v.src, "/api/video/media?path=" + encodeURIComponent(tricky) + "&audio=0");
      resolve();
    }, 0);
  });
});
