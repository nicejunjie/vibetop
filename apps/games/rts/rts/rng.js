// Iron Frontier — rng.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

// --------------------------------------------------------------------- //
//  Deterministic PRNG (mulberry32). Every random draw in the game goes
//  through rnd() so a seed fully determines the match.
// --------------------------------------------------------------------- //
export var _seed = 1;

export function srand(s) { _seed = (s >>> 0) || 1; }

export function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rint(n) { return Math.floor(rnd() * n); }

// A SECOND generator, used only by sprite bakers. rnd() is the simulation's
// stream and a bake that borrowed it would move the match off its seed the
// day anything is baked lazily; keeping the art on its own LCG makes that
// impossible by construction.
var _bseed = 1;

export function bsr(v) { _bseed = (v >>> 0) || 1; }

export function brnd() {
  _bseed |= 0; _bseed = (_bseed + 0x9E3779B9) | 0;
  var t = Math.imul(_bseed ^ (_bseed >>> 16), 0x21F0AAAD);
  t = Math.imul(t ^ (t >>> 15), 0x735A2D97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export function bint(n) { return Math.floor(brnd() * n); }

// --- generated ---
// ESM import bindings are read-only, so a write from another module goes
// through the owner. Reads stay verbatim everywhere: the binding is live.
export function set_seed(v) { _seed = v; }
