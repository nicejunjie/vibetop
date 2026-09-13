// Circuit Runner's physics, run for real.
//
// The game is one IIFE inside circuit.html with no exports, so this loads the
// REAL script text into a vm sandbox and boots it. Only the host APIs Node
// lacks are stubbed, and they are stubbed GENERICALLY — a 2D context whose
// drawing calls do nothing (the page never reads a pixel back: there is no
// getImageData/putImageData anywhere in it), elements that record classes and
// listeners, localStorage as a Map. The sibling shared/gamescore.js is loaded
// for real rather than shimmed. No game logic is reimplemented here: every
// number asserted below comes out of the shipped step() / updatePlayer() /
// collideX() / collideY() actually running.
//
// What is NOT covered, and cannot be without a browser: anything whose only
// output is pixels (drawTile/draw, the parallax and theme work), the WebAudio
// synthesis (with no AudioContext, audio() returns null and every SFX is the
// same no-op a sound-blocked browser takes), and the rAF pacing in tick()
// (requestAnimationFrame is inert here; the tests drive step() directly, which
// is the fixed-60Hz physics the accumulator feeds anyway).
//
// The page already exposes window.__crTest (place/input/step/spawn/tile) and
// window.__cr() for its Playwright specs; this file drives the same hooks in
// Node, so a physics regression is caught by `node --test` in a second instead
// of only by a browser run.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = process.env.CIRCUIT_HTML || path.join(__dirname, "circuit.html");
const HTML = fs.readFileSync(HTML_PATH, "utf8");

// The game script is the last <script> block in the file, the one with no src.
function gameSource(html) {
  const m = html.match(/<script>\s*\(function \(\) \{\s*'use strict';[\s\S]*?\n\}\)\(\);\s*<\/script>/);
  assert.ok(m, "could not find the game IIFE in circuit.html");
  return m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
}
const SRC = gameSource(HTML);
const GAMESCORE = fs.readFileSync(path.join(__dirname, "..", "..", "..", "shared", "gamescore.js"), "utf8");

// --- the host Node does not have -----------------------------------------
// A no-op 2D context. Every call the page makes is a draw; nothing is read
// back, so "do nothing" is a faithful headless canvas rather than a fake
// answer standing in for real logic.
function ctx2d() {
  const g = {
    canvas: null, fillStyle: "", strokeStyle: "", font: "", textAlign: "",
    globalAlpha: 1, imageSmoothingEnabled: true, lineWidth: 1,
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 0 }),
  };
  for (const k of ["save", "restore", "translate", "scale", "rotate", "beginPath", "closePath",
                   "clip", "rect", "arc", "moveTo", "lineTo", "stroke", "fill", "fillRect",
                   "clearRect", "strokeRect", "fillText", "strokeText", "drawImage",
                   "setTransform", "resetTransform", "putImageData"]) g[k] = () => {};
  return g;
}

function element(tag, doc) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    style: {}, dataset: {}, hidden: false, textContent: "", innerHTML: "", value: "",
    width: 0, height: 0, children: [], parentNode: null, _classes: new Set(), _on: {},
    classList: {
      add(...c) { c.forEach((x) => el._classes.add(x)); },
      remove(...c) { c.forEach((x) => el._classes.delete(x)); },
      toggle(c, on) { if (on === undefined) on = !el._classes.has(c); on ? el._classes.add(c) : el._classes.delete(c); return on; },
      contains(c) { return el._classes.has(c); },
    },
    getContext() { const g = ctx2d(); g.canvas = el; return g; },
    addEventListener(t, fn) { (el._on[t] = el._on[t] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    replaceChildren() { el.children.length = 0; },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => false,
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    setAttribute(k, v) { el[k] = v; }, getAttribute(k) { return el[k]; },
    removeAttribute(k) { delete el[k]; },
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 448, height: 240, top: 0, left: 0, right: 448, bottom: 240 }),
    requestFullscreen: () => Promise.resolve(),
    setPointerCapture() {}, releasePointerCapture() {},
    // a click/keydown the page installed, fired by hand
    fire(type, ev) { (el._on[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {}, stopPropagation() {}, target: el }, ev))); },
  };
  return el;
}

// Boot the real game. Returns the sandbox plus the hooks it publishes.
function boot(src) {
  const els = new Map();
  const doc = {
    hidden: false, fullscreenElement: null, _on: {},
    documentElement: null, body: null, head: null,
    getElementById(id) { if (!els.has(id)) els.set(id, element("div", doc)); return els.get(id); },
    createElement(tag) { return element(tag, doc); },
    createTextNode: (t) => ({ nodeValue: t }),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, fn) { (doc._on[t] = doc._on[t] || []).push(fn); },
    removeEventListener() {},
    exitFullscreen: () => Promise.resolve(),
    fire(type, ev) { (doc._on[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {}, stopPropagation() {} }, ev))); },
  };
  doc.documentElement = element("html", doc);
  doc.body = element("body", doc);
  doc.head = element("head", doc);

  const store = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document: doc,
    navigator: { userAgent: "node", maxTouchPoints: 0, vibrate: undefined, getGamepads: undefined },
    location: { origin: "http://localhost", href: "http://localhost/circuit.html", search: "" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    // The loop must not run itself: every test steps the physics explicitly.
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    performance: { now: () => 0 },
    devicePixelRatio: 1,
    innerWidth: 960, innerHeight: 540,
    // no AudioContext => audio() returns null and every SFX is a no-op, which
    // is the same path a browser with sound blocked takes.
    AudioContext: undefined, webkitAudioContext: undefined,
    _on: {},
    addEventListener(t, fn) { (sandbox._on[t] = sandbox._on[t] || []).push(fn); },
    removeEventListener() {},
    postMessage() {},
    Image: function Image() { return element("img", doc); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.parent = sandbox;          // window.parent === window => not embedded
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  // The sibling <script src="gamescore.js"> the page depends on: load the REAL
  // one (it is pure localStorage + DOM), not a shim.
  new vm.Script(GAMESCORE, { filename: "gamescore.js" }).runInContext(sandbox);
  new vm.Script(src, { filename: "circuit.html" }).runInContext(sandbox);
  return sandbox;
}

// --- level geometry, measured from the real builders ----------------------
// Sector 01 is full of pipes and blocks, so "walk right for 200 frames" only
// means anything on a stretch that is actually clear. These read the shipped
// tile array via window.__crBuild rather than hard-coding column numbers that
// would rot the moment a level is edited.
function geom(w, i) {
  const b = w.__crBuild(i || 0);
  const solid = new Set(b.T.SOLID);
  const at = (x, y) => (x < 0 || x >= b.w || y < 0 || y >= b.h ? 0 : b.tiles[y * b.w + x]);
  // a column you can stand in with `h` tiles of head room above the floor
  const walkable = (x, h) => {
    if (!solid.has(at(x, b.gy))) return false;
    for (let k = 1; k <= (h || 2); k++) if (solid.has(at(x, b.gy - k))) return false;
    return true;
  };
  return { b, solid, at, walkable };
}

// The LONGEST stretch of `h`-clear walkable columns in sector 01, so a test
// that runs or jumps has room to do it without meeting a pipe. Returns the
// column to start from: a few tiles in, facing the rest of the stretch.
function openRun(w, len, h) {
  const G = geom(w);
  // Stop well short of the flag: the longest clear stretch in a sector is its
  // run-up to the flagpole, and touching that hands control to startFlag() —
  // the player stops steering and every movement assertion reads zero.
  const limit = Math.min(G.b.w, (G.b.flagX || G.b.w) - 24);
  let run = 0, best = 0, bestEnd = 0;
  for (let x = 2; x < limit; x++) {
    run = G.walkable(x, h) ? run + 1 : 0;
    if (run > best) { best = run; bestEnd = x; }
  }
  assert.ok(best >= len, `sector 01 needs a ${len}-tile stretch with ${h || 2} tiles of head room, longest is ${best}`);
  return bestEnd - best + 2;
}

// A booted game, parked in a known place, with sound off and the level's own
// wandering enemies cleared so a physics test is about physics.
function game(src) {
  const w = boot(src || SRC);
  const T = w.__crTest;
  T.silence();
  const snap = () => w.__cr();
  const input = (o) => T.input(o || {});
  const step = (n) => T.step(n || 1);
  // Leave the title card the way the game does: begin sector 01, then step
  // through the real 'intro' state until it hands over to 'play'. Poking
  // `state` directly would skip startMusic/updateHud and stop being the
  // situation the player is actually in.
  T.level(0);
  for (let i = 0; i < 300 && snap().state !== "play"; i++) step(1);
  assert.strictEqual(snap().state, "play", "the intro handed over to play");
  T.clear();
  // Stand still on solid ground and settle, so every test starts grounded.
  // With no column given, pick a stretch long enough to run the whole length
  // of without meeting a pipe.
  const ground = (tx) => {
    T.place(tx === undefined ? openRun(w, 14, 5) : tx, GY - 1);
    input({});
    step(12);
    T.clear();
    assert.ok(snap().onGround, "the test starts on solid ground");
  };
  return { w, T, snap, input, step, ground };
}

// The physics constants, read out of the source text so a test that talks
// about MAX_RUN is talking about the shipped number.
function num(name) {
  const m = SRC.match(new RegExp("\\b" + name + "\\s*=\\s*(-?[0-9.]+)"));
  assert.ok(m, name + " not found in circuit.html");
  return parseFloat(m[1]);
}
const TS = num("TS"), GY = num("GY");
const ACC_WALK = num("ACC_WALK"), MAX_WALK = num("MAX_WALK");
const MAX_RUN = num("MAX_RUN"), FRICTION = num("FRICTION");
const JUMP_V = num("JUMP_V"), COYOTE = num("COYOTE"), JUMP_BUF = num("JUMP_BUF");
const GRAV_HOLD = num("GRAV_HOLD"), GRAV_FALL = num("GRAV_FALL");

// --- it boots at all -----------------------------------------------------

test("the game script boots headless and reaches its title screen", () => {
  const { snap, w } = game();
  assert.strictEqual(typeof w.__crTest, "object", "the test hooks are published");
  assert.ok(w.__crLevelCount >= 5, "all five sectors are registered");
  assert.ok(snap().level, "a level is loaded");
});

test("no sprite row is the wrong width", () => {
  // bake() records any pixel row whose length disagrees with the declared
  // width — an off-by-one there shifts every pixel to its right and is
  // invisible in a diff.
  const { w } = game();
  // The array comes from the vm realm, so copy it before comparing.
  assert.deepStrictEqual(Array.from(w.__crSpriteWarnings), [], "mis-sized sprite rows");
});

// --- ground movement -----------------------------------------------------

test("walking accelerates by ACC_WALK a frame and clamps at MAX_WALK", () => {
  const { snap, input, step, ground } = game();
  ground();
  input({ right: true });
  step(1);
  assert.ok(Math.abs(snap().vx - ACC_WALK) < 1e-9, "one frame of walk = ACC_WALK");
  step(60);                          // MAX_WALK/ACC_WALK is 18 frames
  assert.ok(Math.abs(snap().vx - MAX_WALK) < 1e-9, `walking tops out at MAX_WALK, got ${snap().vx}`);
});

test("running is faster than walking and never exceeds MAX_RUN", () => {
  const { snap, input, step, ground } = game();
  ground();
  input({ right: true, run: true });
  step(60);                          // MAX_RUN/ACC_RUN is 20 frames
  const vx = snap().vx;
  assert.ok(vx > MAX_WALK, "running beats walking");
  assert.ok(vx <= MAX_RUN + 1e-9, `never past MAX_RUN, got ${vx}`);
  assert.ok(Math.abs(vx - MAX_RUN) < 1e-9, "and actually reaches it");
});

test("letting go brings you to a dead stop, not an asymptote", () => {
  const { snap, input, step, ground } = game();
  ground();
  input({ right: true });
  step(60);
  const fast = snap().vx;
  input({});
  step(1);
  assert.ok(Math.abs(snap().vx - (fast - FRICTION)) < 1e-9, "friction is subtracted, not scaled");
  step(60);
  assert.strictEqual(snap().vx, 0, "and it reaches exactly zero");
});

test("turning at speed skids instead of flipping direction", () => {
  const { snap, input, step, ground } = game();
  ground();
  input({ right: true });
  step(60);
  input({ left: true });
  step(1);
  const vx = snap().vx;
  assert.ok(vx > 0, "still carrying rightward momentum one frame into the turn");
  assert.ok(vx < MAX_WALK - ACC_WALK, "but shedding it faster than plain acceleration");
});

// --- the jump ------------------------------------------------------------

test("a jump leaves the ground at JUMP_V, running adds to it", () => {
  const { snap, input, step, ground } = game();
  ground();
  input({ jump: true });
  step(1);
  assert.ok(Math.abs(snap().vy - (JUMP_V + GRAV_HOLD)) < 1e-9,
            "standing jump = JUMP_V, then one frame of held gravity");

  const g2 = game();
  g2.ground();
  g2.input({ right: true, run: true });
  g2.step(60);                        // at MAX_RUN
  g2.input({ right: true, run: true, jump: true });
  g2.step(1);
  assert.ok(g2.snap().vy < snap().vy, "a running jump launches harder");
});

test("a held jump rises higher than a tapped one (GRAV_HOLD vs GRAV_FALL)", () => {
  assert.ok(GRAV_HOLD < GRAV_FALL, "the held gravity must be the lighter one");
  const apex = (hold) => {
    const { snap, input, step, ground } = game();
    ground();
    const y0 = snap().py;
    input({ jump: true });
    let top = y0;
    for (let i = 0; i < 90; i++) {
      // A tap: the button is released after a single frame.
      if (!hold && i === 1) input({});
      step(1);
      top = Math.min(top, snap().py);
    }
    return (y0 - top) / TS;                      // tiles cleared
  };
  const held = apex(true), tap = apex(false);
  assert.ok(held > tap + 0.5, `held ${held.toFixed(2)}t must clear more than tap ${tap.toFixed(2)}t`);
  // The comment above JUMP_V promises four tiles with margin for a standing
  // jump, because the pipes in sector 01 are four tiles tall.
  assert.ok(held >= 4.0, `a standing jump must clear 4 tiles, got ${held.toFixed(2)}`);
  // JUMP_MIN floors the shortest hop: a 1-frame tap still leaves the ground
  // properly, so the button reads as proportional rather than 4x apart.
  assert.ok(tap >= 1.5, `even a tap is a real hop, got ${tap.toFixed(2)}`);
});

test("coyote time forgives a late jump, but only for COYOTE frames", () => {
  // Walk off the right-hand end of a ledge, wait N frames in the air, then
  // press jump. Inside the window it must fire; one frame past it must not.
  const tryAfter = (frames) => {
    const { w, snap, input, step, T } = game();
    T.place(8, 12);
    input({});
    step(12);
    assert.ok(snap().onGround, "starts grounded");
    // Step off the world's edge by teleporting into open air above a pit:
    // row 12 at a column with no ground under it. Sector 01 has a pit; find it.
    const b = w.__crBuild(0);
    const solid = new Set(b.T.SOLID);
    let pit = -1;
    for (let x = 20; x < b.w - 10 && pit < 0; x++) {
      if (!solid.has(b.tiles[b.gy * b.w + x]) && !solid.has(b.tiles[(b.gy + 1) * b.w + x])) pit = x;
    }
    assert.ok(pit > 0, "sector 01 has a pit to fall into");
    T.place(pit, 12);
    input({});
    step(frames);                       // falling, no ground under us
    assert.ok(!snap().onGround, "airborne");
    const vyBefore = snap().vy;
    input({ jump: true });
    step(1);
    return snap().vy < vyBefore;        // did the press launch us upward?
  };
  assert.ok(tryAfter(1), "a jump one frame after walking off must still fire");
  assert.ok(tryAfter(COYOTE - 1), `still inside the ${COYOTE}-frame window`);
  assert.ok(!tryAfter(COYOTE + 4), "well past the window it must be refused");
});

test("a jump pressed just before landing fires on landing (JUMP_BUF)", () => {
  // Hop, release, then re-press while still descending. The press must be
  // remembered and spent the instant the feet touch down, instead of being
  // eaten because it arrived one frame early — that eaten press is what the
  // buffer exists for, and on a touch screen it is most of them.
  const rejumpAfterPressing = (framesBeforeLanding) => {
    const { snap, input, step, ground } = game();
    ground();
    // How long is the hop? Measure it once, so the press can be timed against
    // the real arc rather than a guessed frame count.
    input({ jump: true });
    step(1);
    input({});
    const air = [];
    while (!snap().onGround && air.length < 300) { step(1); air.push(snap().py); }
    assert.ok(air.length > framesBeforeLanding + 2, "the hop lasted long enough to time a press inside");
    const total = air.length;

    // Same hop again, pressing `framesBeforeLanding` frames before touchdown.
    const g = game();
    g.ground();
    g.input({ jump: true });
    g.step(1);
    g.input({});
    for (let i = 0; i < total - framesBeforeLanding; i++) g.step(1);
    assert.ok(!g.snap().onGround, "still in the air when the press lands");
    g.input({ jump: true });                 // a fresh rising edge
    for (let i = 0; i < framesBeforeLanding + 2; i++) g.step(1);
    return g.snap().vy < 0;                  // did it launch again off the landing?
  };
  assert.ok(JUMP_BUF > 1, "there is a buffer to test");
  assert.ok(rejumpAfterPressing(3), "a press 3 frames before landing must still jump");
  assert.ok(rejumpAfterPressing(JUMP_BUF - 2), `a press ${JUMP_BUF - 2} frames early is inside JUMP_BUF`);
});

// --- tile collision ------------------------------------------------------

// A wall to run into: a column that is solid at head height, with several
// clear walkable columns to its left to build up speed in.
function wallColumn(w) {
  const G = geom(w);
  const gy = G.b.gy;
  const limit = Math.min(G.b.w, (G.b.flagX || G.b.w) - 8);
  for (let x = 6; x < limit; x++) {
    if (!G.solid.has(G.at(x, gy - 1))) continue;
    let clear = true;
    for (let k = 1; k <= 5; k++) if (!G.walkable(x - k, 3)) { clear = false; break; }
    if (clear) return { x, G };
  }
  return null;
}

test("running into a wall stops at the tile edge instead of entering it", () => {
  const { w, snap, input, step, T } = game();
  const found = wallColumn(w);
  assert.ok(found, "sector 01 has a wall to run into");
  T.place(found.x - 5, GY - 1);
  T.clear();
  const x0 = snap().px;
  input({ right: true, run: true });
  step(120);
  const s1 = snap();
  const PW = 11;                                 // small player width
  // collideX's box is [x, x+w-1]. The invariant is that no part of it ever
  // shares a column with the solid tile — that is exactly what a tunnelling
  // bug breaks, and it survives the 1px overhang the w-1 convention allows.
  assert.ok(Math.floor((s1.px + PW - 1) / TS) < found.x,
            `the collision box must stay out of column ${found.x}; player at ${s1.px}`);
  assert.ok(s1.px > x0, "it did move before being stopped");
  assert.ok(s1.px + PW > found.x * TS - TS,
            "and pressed right up against the wall, not stalled short");
  // Pinned: another second of holding run changes nothing.
  step(60);
  assert.ok(Math.abs(snap().px - s1.px) < 1,
            "held against the wall it goes nowhere, it does not creep through");
  assert.ok(Math.floor((snap().px + PW - 1) / TS) < found.x, "still outside the wall a second later");
});

test("open ground does not stop you: the same run with no wall keeps going", () => {
  const { w, snap, input, step, T } = game();
  T.place(openRun(w, 14, 5), GY - 1);
  T.clear();
  const x0 = snap().px;
  input({ right: true, run: true });
  step(60);
  assert.ok(snap().px > x0 + 4 * TS, "unobstructed running covers ground");
  assert.ok(snap().vx > 0, "and is still moving");
});

test("falling onto solid ground lands on top of it, grounded, with vy zeroed", () => {
  const { snap, step, input, T } = game();
  T.place(8, 4);                 // high above the ground rows
  input({});
  step(120);
  const s = snap();
  assert.strictEqual(s.vy, 0, "landing zeroes downward speed");
  assert.ok(s.onGround, "and marks grounded");
  // Player height is 15 while small; standing on row GY means feet at GY*TS.
  assert.ok(Math.abs((s.py + 15) - GY * TS) < 1e-9,
            `feet rest exactly on the ground row, py=${s.py}`);
});

test("a fast fall cannot tunnel through the floor", () => {
  const { snap, step, input, T } = game();
  T.place(8, 0);
  input({});
  step(300);                     // long enough to hit MAX_FALL and land
  const s = snap();
  assert.ok(s.onGround, "still caught by the floor at terminal velocity");
  assert.ok(s.py + 15 <= GY * TS + 0.001, "never ended up below the ground surface");
});

test("jumping into a ceiling stops you and cancels the rise", () => {
  // Sector 01's ? blocks sit 4 rows above the ground; standing under one and
  // jumping must bonk, not pass through.
  const { w, snap, input, step, T } = game();
  const b = w.__crBuild(0);
  const solid = new Set(b.T.SOLID);
  let col = -1;
  for (let x = 12; x < b.w - 4 && col < 0; x++) {
    for (let y = b.gy - 5; y < b.gy - 2; y++) {
      if (solid.has(b.tiles[y * b.w + x]) && !solid.has(b.tiles[(b.gy - 1) * b.w + x])) { col = x; break; }
    }
  }
  assert.ok(col > 0, "sector 01 has an overhead block");
  T.place(col, 12);
  input({});
  step(8);
  input({ jump: true });
  let bonked = false;
  for (let i = 0; i < 40; i++) {
    const before = snap().vy;
    step(1);
    if (before < 0 && snap().vy === 0) { bonked = true; break; }   // rise cancelled
  }
  assert.ok(bonked, "the head hit the block and the rise was cancelled");
});

// --- enemies -------------------------------------------------------------

test("landing on a goomba flattens it and bounces you off", () => {
  const { snap, input, step, T } = game();
  T.place(8, 12);
  input({});
  step(12);
  const p = snap();
  // Drop one right where we are standing, then fall onto it.
  const e = T.spawn("goomba", Math.round(p.px / TS), 12);
  assert.ok(e, "the hook placed an enemy");
  T.place(Math.round(p.px / TS), 9);       // above it
  input({});
  let stomped = false;
  for (let i = 0; i < 90 && !stomped; i++) {
    step(1);
    stomped = T.entsFull().some((x) => x.type === "goomba" && (x.flat || x.gone));
  }
  assert.ok(stomped, "the goomba was stomped");
  assert.ok(snap().vy < 0, "and the stomp bounced the player upward");
});

test("walking into a goomba from the side hurts instead of stomping it", () => {
  const { snap, input, step, T } = game();
  T.place(8, 12);
  input({});
  step(12);
  T.give("big");                            // so the hit shrinks rather than dies
  const p = snap();
  T.spawn("goomba", Math.round(p.px / TS) + 3, 12);
  input({ right: true });
  let hurt = false;
  for (let i = 0; i < 200 && !hurt; i++) { step(1); hurt = !snap().big; }
  assert.ok(hurt, "a side hit costs the power-up");
});

// --- levels --------------------------------------------------------------

test("every sector is built, sized and has a flag to reach", () => {
  const { w } = game();
  for (let i = 0; i < w.__crLevelCount; i++) {
    const b = w.__crBuild(i);
    assert.ok(b.w > 100, `sector ${i} is a real length (${b.w})`);
    assert.strictEqual(b.tiles.length, b.w * b.h, `sector ${i} tile array matches w*h`);
    assert.ok(b.flagX > 0 && b.flagX < b.w, `sector ${i} has a reachable flag`);
    assert.ok(b.start >= 0 && b.start < b.flagX, `sector ${i} starts before its flag`);
  }
});

test("the player spawns on solid ground in every sector", () => {
  const { w } = game();
  for (let i = 0; i < w.__crLevelCount; i++) {
    const b = w.__crBuild(i);
    const solid = new Set(b.T.SOLID);
    const under = [];
    for (let y = 0; y < b.h; y++) if (solid.has(b.tiles[y * b.w + b.start])) under.push(y);
    const wet = b.tiles.some((t) => t === b.T.WATER || t === b.T.SURF);
    assert.ok(under.length > 0 || wet, `sector ${i} start column has footing`);
  }
});
