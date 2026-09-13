// The owner-0 house colour, read off the game rather than written down twice.
//
// Three clause-check modules used to open with `const OWNER_HUE = 197;` (or
// 203), a number somebody measured off the sprites on the day they wrote the
// check. Every house-colour clause then tested `hueGap(p.h, OWNER_HUE) <= 20`,
// so the whole family of them silently depended on the palette never moving.
//
// It moved. Taking the player colours onto RA2's own values swung the Allied
// blue from a sky #4aa3db (H203) to the navy #1c3e8c (H222) the rips actually
// use, which is 25 degrees away — outside every one of those tolerances. Nine
// clauses across vehicles, structures and infantry went from passing to
// reporting ZERO house pixels on sprites that are visibly still wearing house
// colour: `rhino 0 blocks`, `mammoth 0 canisters`, `tesla [col] 0%`,
// `sentry house px 0 of 366 saturated`. The art had not changed at all.
//
// So the hue is derived here, once, from the same two sources the game boots
// from: `OPT_DEF.colour` picks a row out of `HOUSE` in rts/opts.js. Parsing is
// deliberate and not a `require` — the game is 117 classic scripts sharing one
// global scope and cannot be loaded into node without a DOM.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RTS = path.resolve(__dirname, '..', '..');

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** HSV hue in degrees, 0-360, for a `#rrggbb` string. */
function hueOf(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Every house colour the options screen offers, in `HOUSE` order. */
function palette() {
  const src = fs.readFileSync(path.join(RTS, 'rts', 'opts.js'), 'utf8');
  const start = src.indexOf('var HOUSE = [');
  if (start < 0) throw new Error('house-hue: no HOUSE table in rts/opts.js');
  const body = src.slice(start, src.indexOf('];', start));
  const out = [];
  for (const m of body.matchAll(/\{\s*k:\s*'(\w+)',[^}]*c:\s*'(#[0-9a-fA-F]{6})'\s*\}/g)) {
    out.push({ k: m[1], c: m[2] });
  }
  if (!out.length) throw new Error('house-hue: HOUSE table parsed to nothing');
  return out;
}

/** The default colour index for an owner: 0 is the human, 1 the first AI. */
function defaultIndex(owner) {
  const src = fs.readFileSync(path.join(RTS, 'rts', 'opts.js'), 'utf8');
  const key = owner ? 'aiColour' : 'colour';
  const m = new RegExp(key + ':\\s*(\\d+)').exec(src);
  if (!m) throw new Error('house-hue: OPT_DEF.' + key + ' not found');
  return +m[1];
}

function colourOf(owner) { return palette()[defaultIndex(owner || 0)].c; }

/** The hue a house-colour census should look for, for owner 0 unless told otherwise. */
function ownerHue(owner) { return hueOf(colourOf(owner)); }

module.exports = { palette, defaultIndex, colourOf, ownerHue, hueOf, rgbOf };
