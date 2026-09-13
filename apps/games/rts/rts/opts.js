// Iron Frontier — opts.js
// One subsystem of the game. Loaded as a native ES module; see rts/README.md.

'use strict';

// ===================================================================== //
//  Iron Frontier — an isometric skirmish RTS.
//
//  Everything below runs on a FIXED 60Hz step with a seeded PRNG and no
//  Math.random anywhere, so a given seed replays identically. That is not
//  neatness for its own sake: the AI balance harness (__rtsSim) runs whole
//  matches headless and asserts on the outcome, which is only meaningful
//  if the same seed produces the same match every time.
// ===================================================================== //

var STEP = 1000 / 60;          // ms per simulation tick

// --------------------------------------------------------------------- //
//  Skirmish options — RA2's setup screen, in one object.
//
//  Every default here reproduces the match the game played before the
//  options existed (10 000 credits, three opening infantry, short game,
//  crates on, superweapons on, a Construction Yard), so an untouched strip
//  replays a seed exactly as it did before — rts.test.js asserts that
//  against a recorded three-minute sim.
//
//  `speed` is RA2's 1-6 slider. The simulation is a FIXED 60Hz tick and
//  nothing in it may depend on wall clock, so the slider cannot change the
//  tick — it changes how many ticks a second of wall clock buys: 15 x
//  speed, i.e. 15/30/45/60/75/90 per second, which on a 60Hz display is
//  0.25 .. 1.5 sim ticks per rendered frame with no interpolation at all.
//  Speed 4 is exactly the old 60/s, RA2's "Fast" and our default.
// --------------------------------------------------------------------- //
var OPT_DEF = { credits: 10000, units: 3, short: true, crates: true,
                supers: true, speed: 4, bases: true, colour: 2, aiColour: 1 };

var OPT_CREDITS = [5000, 10000, 20000];

// RA2's eight multiplayer house colours. Index 2 (blue) and 1 (red) are the
// pair the game shipped with, so the default COL below is byte-identical.
// House colours sit where RA2's own do, not where a UI swatch would. Measured
// over the rips, both houses land on the same weighted lightness: the Allied
// blue runs #333366 / #333399 / #666699 and the Soviet red #663333 / #660000 /
// #990000, and each averages L 0.33. Ours were interface colours at L 0.50-0.69
// and read as painted plastic however carefully the cloth under them was toned.
// Saturation is CLAMPED, never lifted — RA2's blue is only S 0.35 — and the two
// defaults also take RA2's hue: its Allied colour is a navy (H240), not the sky
// blue we had, and its Soviet one a pure red, not a pink one.
var HOUSE = [
  { k: 'gold',   name: 'Gold',   c: '#8f7619' },
  { k: 'red',    name: 'Red',    c: '#8f1919' },
  { k: 'blue',   name: 'Blue',   c: '#1c3e8c' },
  { k: 'green',  name: 'Green',  c: '#2d7b35' },
  { k: 'orange', name: 'Orange', c: '#8f5019' },
  { k: 'teal',   name: 'Teal',   c: '#28807d' },
  { k: 'purple', name: 'Purple', c: '#652187' },
  { k: 'pink',   name: 'Pink',   c: '#8f1958' }
];

// The AI never wears the player's colour. Blue and red stay each other's
// opposite so the classic pairing survives; any other pick puts the AI in
// red, or blue if the player took red.
function aiHouse(h) { return h === 1 ? 2 : 1; }

function normOpts(o) {
  var r = {}, k;
  for (k in OPT_DEF) r[k] = OPT_DEF[k];
  if (o) for (k in OPT_DEF) if (o[k] !== undefined && o[k] !== null) r[k] = o[k];
  r.credits = OPT_CREDITS.indexOf(r.credits) < 0 ? OPT_DEF.credits : r.credits;
  r.units = Math.max(0, Math.min(10, r.units | 0));
  r.speed = Math.max(1, Math.min(6, r.speed | 0));
  r.short = !!r.short; r.crates = !!r.crates; r.supers = !!r.supers; r.bases = !!r.bases;
  r.colour = HOUSE[r.colour] ? (r.colour | 0) : OPT_DEF.colour;
  r.aiColour = HOUSE[r.aiColour] ? (r.aiColour | 0) : aiHouse(r.colour);
  if (r.aiColour === r.colour) r.aiColour = aiHouse(r.colour);
  return r;
}

// Local storage, wrapped so a browser with storage disabled (a private window,
// blocked site data) degrades to defaults instead of throwing on boot. Kept in
// this leaf module because preferences are read while other modules are still
// loading — see rts/README.md on load order.
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
