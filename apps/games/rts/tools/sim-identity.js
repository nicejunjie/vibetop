#!/usr/bin/env node
// Iron Frontier — the simulation-identity gate for the module split.
//
// Runs the playtest soak matrix (docs/playtest.md §B: seeds × both faction
// orders × two difficulties, N game minutes) through `window.__rtsSim` in the
// vm sandbox and prints one JSON line per cell: the per-minute desync hash
// (`__rtsTest.hash(g)` = stateHash) and the run's return record. Two builds
// that print identical files simulate identically, tick for tick.
//
//   node apps/games/rts/tools/sim-identity.js --html <old single-page rts.html>  > old.jsonl
//   node apps/games/rts/tools/sim-identity.js --bundle                            > new.jsonl
//   diff old.jsonl new.jsonl      # MUST be empty
//
// `--bundle` loads the module tree through tools/lib/bundle-for-vm.js (the
// concatenated closure rts.test.js also runs). Options: --minutes N (default
// 30), --seeds a,b,c (default the six playtest seeds), --diffs x,y (default
// normal,hard), --quick (= 2 minutes, 2 seeds, for a smoke run).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { load, inlineScript } = require('./lib/vm-sandbox.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const quick = args.includes('--quick');
const minutes = +opt('--minutes', quick ? 2 : 30);
const seeds = opt('--seeds', quick ? '20260831,4242' : '20260831,20260832,4242,7,1234,99').split(',').map(Number);
const diffs = opt('--diffs', 'normal,hard').split(',');
const facs = [['dir', 'col'], ['col', 'dir']];

let source, label;
if (args.includes('--bundle')) {
  source = require('./lib/bundle-for-vm.js').source; label = 'bundle';
} else {
  const html = opt('--html', path.join(__dirname, '..', 'rts.html'));
  source = inlineScript(fs.readFileSync(html, 'utf8')); label = html;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

const W = load(source);
if (!W.__rtsSim || !W.__rtsTest) throw new Error('the loaded game exposes no __rtsSim/__rtsTest hooks');
const t0 = Date.now();
let n = 0;
for (const seed of seeds) for (const [fa, fb] of facs) for (const d of diffs) {
  const hashes = [];
  const rec = W.__rtsSim(seed, d, d, minutes * 60 * 60, fa, fb, (g) => hashes.push(g.tick + ':' + W.__rtsTest.hash(g)));
  process.stdout.write(JSON.stringify({ seed, facA: fa, facB: fb, diff: d, minutes, hashes, result: sortKeys(rec) }) + '\n');
  n++;
  process.stderr.write(`sim-identity: ${n} cells done (${((Date.now() - t0) / 1000).toFixed(0)}s) [${label}]\n`);
}
