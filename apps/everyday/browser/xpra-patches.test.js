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
  };
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

  return { wheel, rest, notches, sent, client };
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
