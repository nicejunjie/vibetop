// Wheel/scroll behaviour of the xpra patch bundle.
//
// This loads the REAL browser/xpra-patches.js in a vm sandbox and drives the
// on_mousescroll it actually installs, rather than re-implementing the notch
// maths here — a copied formula would keep passing after the shipped one drifts.
// Only the handful of xpra APIs patch 2 touches are stubbed; every other patch
// throws into its own try/catch and warns, exactly as it would on an xpra whose
// API moved.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "xpra-patches.js"), "utf8");

// Build a fresh sandbox + client per test so accumulators never leak between them.
function load() {
  const timers = [];                        // [id, fn, delay] — fired manually
  let nextId = 1;
  function XpraClient() {}
  const sandbox = {
    XpraClient,
    PACKET_TYPES: { button_action: "button-action" },
    Utilities: { normalizeWheel: (e) => ({ pixelX: e.dx || 0, pixelY: e.dy || 0 }) },
    console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn, delay) => { const id = nextId++; timers.push([id, fn, delay]); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t[0] === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { const id = nextId++; timers.push([id, fn, 0]); return id; },
    // Listeners registered on `window` (the sandbox itself): patches 8-12 use them.
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    // A settable clock, so a test can make an absence short or long.
    __now: 1e6,
  };
  sandbox.Date = { now: () => sandbox.__now };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    addEventListener() {}, removeEventListener() {},
    getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
    body: { appendChild() {}, addEventListener() {} },
    hidden: false,
  };
  sandbox.navigator = { userAgent: "test", maxTouchPoints: 0 };
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: "xpra-patches.js" }).runInContext(sandbox);

  const sent = [];
  const client = Object.create(XpraClient.prototype);
  client.connected = true;
  client.server_readonly = false;
  client.mouse_grabbed = false;
  client.server_is_shadow = false;
  client.send = (pkt) => sent.push(pkt);
  // Own properties shadow patch 1's DOM-dependent getMouse.
  client.getMouse = () => ({ x: 10, y: 20 });
  client._keyb_get_modifiers = () => [];

  // One wheel event. dy>0 scrolls down.
  const wheel = (dy, dx = 0) =>
    client.on_mousescroll({ dy, dx, preventDefault() {} }, null);
  // Fire every pending timer — i.e. the gesture stopped and IDLE_MS elapsed.
  const rest = () => { const due = timers.splice(0); due.forEach(([, fn]) => fn()); };
  // Button ids: 4=up 5=down 6=left 7=right. Count press packets only (each
  // notch is a press+release pair).
  const notches = () => sent.filter((p) => p[3] === true).map((p) => p[2]);

  return { wheel, rest, notches, sent, client, sandbox };
}

const PX_PER_CLICK = 45;   // must track the constant in the bundle

test("the patch bundle installs a scroll handler at all", () => {
  const { wheel } = load();
  assert.strictEqual(typeof wheel, "function");
});

// --- the bug this change exists for -------------------------------------

test("a fine nudge that floors to zero still scrolls once the gesture stops", () => {
  const { wheel, rest, notches } = load();
  // Six 4px events = 24px total = 0.53 notch. Every event floors to 0 today,
  // so the page never moves however long you keep nudging.
  for (let i = 0; i < 6; i++) wheel(4);
  assert.deepStrictEqual(notches(), [], "nothing should be emitted while moving");
  rest();
  assert.deepStrictEqual(notches(), [5], "one notch down, rescued at rest");
});

test("the nudge is rescued in whichever direction it went", () => {
  const up = load();
  for (let i = 0; i < 6; i++) up.wheel(-4);
  up.rest();
  assert.deepStrictEqual(up.notches(), [4], "up");

  const right = load();
  for (let i = 0; i < 6; i++) right.wheel(0, 4);
  right.rest();
  assert.deepStrictEqual(right.notches(), [7], "right");
});

// --- and the ways it must NOT fire ---------------------------------------

test("a twitch under half a notch is ignored, but its travel is not thrown away", () => {
  const { wheel, rest, notches } = load();
  wheel(8);                       // 0.18 notch — a stray finger
  rest();
  assert.deepStrictEqual(notches(), [], "no phantom jump from a twitch");
  // The remainder is KEPT, so genuinely slow scrolling still gets there
  // eventually — the pre-existing carry behaviour must survive.
  for (let i = 0; i < 5; i++) wheel(8);
  assert.deepStrictEqual(notches(), [5], "48px total crossed a whole notch while moving");
});

test("a scroll that already worked gains no extra notch at rest", () => {
  const { wheel, rest, notches } = load();
  // 1.5 notches: one is emitted while moving, leaving 0.5 — exactly on the
  // flush threshold. Without the _wheelMoved guard this would drift a second
  // notch ~120ms after the user stopped.
  wheel(PX_PER_CLICK * 1.5);
  assert.deepStrictEqual(notches(), [5], "one notch while moving");
  rest();
  assert.deepStrictEqual(notches(), [5], "still one — no drift after the user stopped");
});

// --- steady state must be untouched --------------------------------------

test("steady scrolling stays proportional to pixels travelled", () => {
  const { wheel, notches } = load();
  // 20 events x 45px = exactly 20 notches, no floor inflation, no rounding gain.
  for (let i = 0; i < 20; i++) wheel(PX_PER_CLICK);
  assert.strictEqual(notches().length, 20);
  assert.ok(notches().every((b) => b === 5));
});

test("a fling is capped so it cannot burst the websocket", () => {
  const { wheel, notches } = load();
  wheel(PX_PER_CLICK * 500);              // a hard trackpad fling
  assert.strictEqual(notches().length, 10, "MAX_CLICKS per event");
});

test("each notch is a press/release pair, not a lone press", () => {
  const { wheel, sent } = load();
  wheel(PX_PER_CLICK);
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[0][3], true);
  assert.strictEqual(sent[1][3], false);
});

test("a disconnected, read-only or grabbed client sends nothing", () => {
  for (const off of ["connected", "server_readonly", "mouse_grabbed"]) {
    const { wheel, rest, notches, client } = load();
    client[off] = (off === "connected") ? false : true;
    for (let i = 0; i < 6; i++) wheel(4);
    rest();
    assert.deepStrictEqual(notches(), [], `${off} must gate the handler`);
  }
});

test("the idle flush cannot fire twice for one gesture", () => {
  const { wheel, rest, notches } = load();
  for (let i = 0; i < 6; i++) wheel(4);
  rest();
  rest();                                  // a second timer must not exist
  assert.deepStrictEqual(notches(), [5], "exactly one rescue notch");
});


// Patch 11: a button released outside the frame is released on the remote.
test("buttons the frame last saw pressed are released on the remote, once", () => {
  const { sent, client, sandbox } = load();
  const stuck = sandbox.__xpraStuckButtons;
  assert.ok(stuck, "patch 11 installed");
  client.topwindow = 7;
  stuck.set(1 | 2);                                     // left + right held when the pointer left
  assert.strictEqual(stuck.release(client), 2);
  const rel = sent.filter((p) => p[0] === "button-action");
  assert.deepStrictEqual(rel.map((p) => [p[1], p[2], p[3]]), [[7, 1, false], [7, 3, false]]);
  assert.strictEqual(stuck.get(), 0);
  assert.strictEqual(stuck.release(client), 0, "nothing left to release");
});

test("a stuck release is never sent to a disconnected or read-only server", () => {
  const { sent, client, sandbox } = load();
  const stuck = sandbox.__xpraStuckButtons;
  client.connected = false;
  stuck.set(1);
  assert.strictEqual(stuck.release(client), 0);
  assert.deepStrictEqual(sent, []);
  client.connected = true; client.server_readonly = true;
  stuck.set(1);
  assert.strictEqual(stuck.release(client), 0);
  assert.deepStrictEqual(sent, []);
});


// Patch 12: a quick switch back to the Browser must not ask the server for a
// full repaint (that is the flash); only a long absence does.
test("a short absence nudges locally and never repaints; a long one asks the server once", () => {
  const { sandbox, client, rest } = load();
  let resumes = 0; client.resume = () => resumes++;
  sandbox.client = client;
  const W = sandbox.__xpraWake;
  assert.ok(W, "patch 12 installed");
  sandbox.__now = 1000; W.away(); sandbox.__now = 6000; W.back();          // 5 s away: an app switch
  assert.strictEqual(resumes, 0, "no server repaint on a quick switch");
  W.back();                                                                  // a bare focus, never away
  assert.strictEqual(resumes, 0);
  W.away(); sandbox.__now = 6000 + W.LONG_AWAY + 1; W.back();               // a long absence
  assert.strictEqual(resumes, 1, "one repaint after a long absence");
  // The shell's activation message: another app's id records the absence, ours brings us back.
  const msg = (active) => sandbox.listeners.message.forEach((fn) => fn({ data: { type: "vibetop:active", active } }));
  sandbox.__now += 5000; msg("terminal"); sandbox.__now += 4000; msg("browser");
  rest();                                                                    // the deferred back()
  assert.strictEqual(resumes, 1, "a 4 s trip to another app: no repaint");
});

// Patch 8 (the keyboard grab) vs patch 12 (the repaint): the shell pumps EVERY
// visible window with its own id in window mode, which means "you are on
// screen", not "you are the focused app". Acting on that took the keyboard out
// of the app the user was actually clicking in — a click in Files selected the
// file and Space went to the Browser, 150ms later. Caught on the user's own
// screen by the #focusdbg panel:
//   pointerdown @filesx focus=filesx / click @filesx focus=browser/
test("a merely VISIBLE browser window does not grab the keyboard", () => {
  const { sandbox, rest } = load();
  const el = { focused: 0, focus() { this.focused++; } };
  sandbox.document.getElementById = (id) => (id === "pasteboard" ? el : null);
  let winFocus = 0;
  sandbox.window.focus = () => winFocus++;
  const send = (data) => sandbox.listeners.message.forEach((fn) => fn({ data }));

  // On screen but NOT focused: hands off the keyboard entirely.
  send({ type: "vibetop:active", active: "browser", focused: false });
  rest();
  assert.strictEqual(el.focused, 0, "no #pasteboard focus for a background window");
  assert.strictEqual(winFocus, 0, "and no window.focus() stealing top-level focus");

  // Genuinely switched to: it must still take the keyboard back.
  send({ type: "vibetop:active", active: "browser", focused: true });
  rest();
  assert.ok(el.focused > 0, "the focused Browser still grabs the keyboard");

  // An older shell sends no flag at all — unchanged behaviour.
  el.focused = 0;
  send({ type: "vibetop:active", active: "browser" });
  rest();
  assert.ok(el.focused > 0, "absent flag still means focused");
});
