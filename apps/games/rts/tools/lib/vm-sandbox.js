// Iron Frontier — the smallest DOM that lets the game boot inside node's `vm`.
//
// One sandbox per `load()`: its own `window`, `document`, `localStorage`, so two
// game instances can coexist in one process (the two-tab lobby tests in
// rts.test.js need exactly that). The render loop never starts
// (`requestAnimationFrame` returns 0) and `performance.now` is frozen at 0, so a
// loaded game is a pure simulation harness driven through `window.__rts*`.
//
//   const { load, inlineScript } = require('./lib/vm-sandbox.js');
//   const W = load(inlineScript(fs.readFileSync('rts.html', 'utf8')));   // the old single page
//   const W = load(require('./lib/bundle-for-vm.js').source);           // the module tree, concatenated
//
// `load(source, extra)` — `extra` is merged into the window before the script
// runs (a fake BroadcastChannel, setInterval, …), as rts.test.js has always done.
'use strict';
const vm = require('node:vm');

function stubCtx() {
  const noop = () => {};
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop,
    lineJoin: 'miter', miterLimit: 10, textBaseline: 'alphabetic',
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    fill: noop, stroke: noop, arc: noop, ellipse: noop, roundRect: noop, clip: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop, rect: noop,
    save: noop, restore: noop, scale: noop, translate: noop, rotate: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    getImageData: () => ({ data: [] }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  };
}
function stubEl() {
  const el = {
    style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => '' },
    dataset: {}, textContent: '', innerHTML: '', className: '', hidden: false, value: '0',
    width: 800, height: 600, _terr: null,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, removeChild: () => {}, setAttribute: () => {},
    getAttribute: () => 'b', setPointerCapture: () => {},
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  el.querySelector = () => stubEl();
  el.querySelectorAll = () => [];
  return el;
}

/** The ONE inline `<script>` block of a single-page rts.html (the pre-module shape). */
function inlineScript(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (blocks.length !== 1) throw new Error('expected exactly one inline <script> block, found ' + blocks.length);
  return blocks[0];
}

/** Boot `source` (a classic script) in a fresh sandbox window; returns that window. */
function load(source, extra, filename) {
  const store = {};
  const win = {
    devicePixelRatio: 1,
    addEventListener: () => {}, removeEventListener: () => {},
    requestAnimationFrame: () => 0,          // never start the render loop
    performance: { now: () => 0 },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    btoa: (b) => Buffer.from(b, 'binary').toString('base64'),
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    Buffer, ArrayBuffer, Int8Array, Int16Array, URL,
    setTimeout: () => 0,
    Math, JSON, Date, isNaN, parseInt, parseFloat,
    Float32Array, Int32Array, Uint8Array,
  };
  const doc = {
    getElementById: () => stubEl(),
    createElement: () => stubEl(),
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.assign(win, extra || {});
  win.window = win;
  win.document = doc;
  win.globalThis = win;
  vm.createContext(win);
  vm.runInContext(source, win, { filename: filename || 'rts.html' });
  return win;
}

module.exports = { load, inlineScript, stubCtx, stubEl };
