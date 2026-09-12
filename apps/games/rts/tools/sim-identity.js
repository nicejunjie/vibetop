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
// normal,hard), --quick (= 2 minutes, 2 seeds, for a smoke run), --jobs N (default: all cores).
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
if (!args.includes('--html')) {
  // The default subject is this checkout's game: the files rts.html lists,
  // concatenated in load order. `--html <page>` is for comparing against an
  // older single-page build kept somewhere else.
  source = require('./lib/bundle-for-vm.js').source; label = 'this checkout';
} else if (args.includes('--bundle')) {
  const entry = opt('--entry', null);                 // default: apps/games/rts/rts/main.js
  const B = require('./lib/bundle-for-vm.js');
  source = entry ? B.bundle(entry).source : B.source; label = 'bundle' + (entry ? ':' + entry : '');
} else {
  const html = opt('--html', path.join(__dirname, '..', 'rts.html'));
  source = inlineScript(fs.readFileSync(html, 'utf8')); label = html;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

const cells = [];
for (const seed of seeds) for (const [fa, fb] of facs) for (const d of diffs) cells.push({ seed, facA: fa, facB: fb, diff: d });

function runCell(W, c) {
  const hashes = [];
  const rec = W.__rtsSim(c.seed, c.diff, c.diff, minutes * 60 * 60, c.facA, c.facB, (g) => hashes.push(g.tick + ':' + W.__rtsTest.hash(g)));
  return JSON.stringify({ seed: c.seed, facA: c.facA, facB: c.facB, diff: c.diff, minutes, hashes, result: sortKeys(rec) });
}

// One process per cell (--jobs N, default: every core) — a cell is a few
// minutes of single-threaded simulation, and the matrix is embarrassingly
// parallel. Output order is always matrix order, so two runs diff cleanly.
const cellIdx = opt('--cell', null);
if (cellIdx !== null) {
  const W = load(source);
  process.stdout.write(runCell(W, cells[+cellIdx]) + '\n');
} else {
  const jobs = Math.max(1, Math.min(cells.length, +opt('--jobs', require('node:os').availableParallelism())));
  const { spawn } = require('node:child_process');
  const t0 = Date.now();
  const out = new Array(cells.length);
  let next = 0, done = 0, running = 0;
  const base = process.argv.slice(1).filter((a, i, all) => !(a === '--jobs' || all[i - 1] === '--jobs'));
  function pump() {
    while (running < jobs && next < cells.length) {
      const i = next++; running++;
      const ch = spawn(process.execPath, [...base, '--cell', String(i)], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      ch.stdout.on('data', (d) => { buf += d; });
      ch.on('close', (code) => {
        if (code !== 0) { console.error(`sim-identity: cell ${i} failed (exit ${code})`); process.exit(1); }
        out[i] = buf.trim(); running--; done++;
        process.stderr.write(`sim-identity: ${done}/${cells.length} cells (${((Date.now() - t0) / 1000).toFixed(0)}s, ${jobs} jobs) [${label}]\n`);
        if (done === cells.length) process.stdout.write(out.join('\n') + '\n'); else pump();
      });
    }
  }
  pump();
}
