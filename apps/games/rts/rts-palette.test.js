// Every near-grey in the art must stay grey after the palette snap.
//
// WHY THIS TEST EXISTS. The bake quantises each channel to a multiple of 0x33
// (0/51/102/153/204/255) and then draws each surface through a shade ladder, so
// a colour is rendered at a dozen different factors. A grey whose channels are
// NOT equal survives that only by luck: `#4a4d53` is 74/77/83, which looks like
// slate in the source, and at factor 1.0 the three channels round to 51/102/102
// — pure TEAL. `#9aa0a8` throws #003333 at 0.16, #669999 at 0.80 and #ccccff at
// 1.42, so the same "grey" appears teal in shadow and lilac in light.
//
// This has shipped visibly at least six times: the Dolphin's fur, the Giant
// Squid reading as the RED player, blue-green speckle over every deck, the
// Dreadnought's tail fins as a teal block, the Aegis's stern, and seven
// separate greys in the Amphibious Transport at once. Each time it was found by
// eye, in a render, after the art had been called done. The user, on the last
// of them: "这个问题很普遍，不能再犯".
//
// So it is a test rather than a habit. Grey means EQUAL CHANNELS.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RTS = path.join(__dirname, 'rts');

/** Every .js under rts/units and rts/bake — the files that name colours. */
function artFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) artFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const GRID = [0, 51, 102, 153, 204, 255];
const snap = (v) => GRID.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// The factors the ship, vehicle and structure bakes actually pass to shade(),
// plus isoBox's own face grading (f * 1.18 and f * 0.80 around each of them).
const FACTORS = [0.16, 0.18, 0.20, 0.30, 0.34, 0.42, 0.46, 0.52, 0.55, 0.56, 0.60,
                 0.62, 0.64, 0.70, 0.72, 0.74, 0.80, 0.86, 0.92, 0.96, 1.00, 1.02,
                 1.04, 1.06, 1.10, 1.14, 1.16, 1.18, 1.22, 1.24, 1.28, 1.30, 1.34,
                 1.35, 1.40, 1.42, 1.46, 1.62, 1.66];

/** The rungs at which a colour stops being neutral once snapped. */
function splits(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const out = [];
  for (const f of FACTORS) {
    const R = snap(Math.min(255, Math.round(r * f)));
    const G = snap(Math.min(255, Math.round(g * f)));
    const B = snap(Math.min(255, Math.round(b * f)));
    if (!(R === G && G === B)) {
      out.push(`${f.toFixed(2)} -> #${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    }
  }
  return out;
}

test('a colour meant as grey stays grey at every rung of the shade ladder', () => {
  const bad = [];
  for (const file of [...artFiles(path.join(RTS, 'units')), ...artFiles(path.join(RTS, 'bake'))]) {
    const src = fs.readFileSync(file, 'utf8');
    // Only the code, not the prose: comments are full of hexes being discussed
    // as examples of this very bug.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/'(#[0-9a-fA-F]{6})'/g)) {
      const hex = m[1].toLowerCase();
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx === 0) continue;
      const sat = (mx - mn) / mx;
      // A deliberately TINTED colour is not this test's business: the khakis
      // (#847a64), the olives (#4a5240) and the sands are meant to carry a hue
      // and they sit at 0.20-0.24 saturation. Every grey that has actually
      // shipped this bug is far below that — #4a4d53 is 0.108, #9aa0a8 0.083,
      // #54575c 0.087, #75787d 0.064 — so 0.13 separates "meant to be neutral,
      // came out coloured" from "meant to be earth".
      // SATURATION, NOT ABSOLUTE SPREAD. Widening this to "spread <= 14 OR
      // saturation < 0.13" caught 487 more literals — and neutralising them
      // took hue.maxImpostor from 0.10 to 0.37, meaning a third of some unit
      // then read as the WRONG PLAYER's colour, and two more vehicles fell
      // below the achromatic floor. Those dark near-blacks (#12161b and its
      // like) carry a deliberate cool cast that is part of how units separate;
      // what they cost is a few #003333 pixels in deep shadow, which is a far
      // smaller price than a unit reading as the enemy's. The bar stays where
      // the measurements put it.
      if (r === g && g === b) continue;
      if (sat >= 0.13) continue;
      const s = splits(hex);
      if (s.length) {
        bad.push(`  ${path.relative(RTS, file)}  ${hex}  (${r}/${g}/${b})\n`
          + `      splits at ${s.length} rung${s.length > 1 ? 's' : ''}: ${s.slice(0, 3).join(', ')}`);
      }
    }
  }
  assert.equal(bad.length, 0,
    'these read as grey in the source and bake as teal, navy or lilac.\n'
    + 'Give each one EQUAL CHANNELS at the same luma — #4a4d53 becomes #4d4d4d:\n\n'
    + bad.join('\n'));
});
