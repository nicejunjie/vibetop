#!/usr/bin/env node
'use strict';
// apps/games/rts/tools/modularize — the AST tool that splits the RTS monolith.
//
//   node index.js analyze [--json <file>] [-v]   the analysis report
//   node index.js check                          exit 1 on anything that blocks the split
//   node index.js units --out <dir> | --apply    P1: every unit's art becomes a function
//   node index.js emit  --out <dir>              P2b: the ES-module tree
//
// Dev-only (tools/ is never deployed). Reads rts.src.html + art/units/** and
// nothing it has itself written, so every mode is idempotent.

const fs = require('node:fs');
const path = require('node:path');

const S = require('./lib/source');
const SEC = require('./lib/sections');
const M = require('./lib/model');
const U = require('./lib/units');
const R = require('./lib/report');
const E = require('./lib/emit');

function loadAll(opts = {}) {
  const src = opts.html ? S.loadSource(S.SRC, opts.html) : S.loadSource();
  const cfg = SEC.loadSections();
  const model = M.buildModel(src, cfg, opts.model || {});
  const ua = U.analyzeUnits(src, model, cfg);
  return { src, cfg, model, ua };
}

function fullAnalysis() {
  const ctx = loadAll();
  const spl = U.spliceScript(ctx.src, ctx.ua);
  ctx.shadowCases = U.answerShadows(ctx.src, ctx.ua, spl);
  ctx.ev = M.evalOrder(ctx.model);
  ctx.spl = spl;
  return ctx;
}

function argv(name, args) {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
}

function main(args) {
  const mode = args[0] || 'analyze';

  if (mode === 'analyze') {
    const ctx = fullAnalysis();
    const rep = R.buildReport(ctx);
    R.printReport(rep, { verbose: args.includes('-v') || args.includes('--verbose') });
    const json = argv('--json', args);
    if (json) {
      fs.writeFileSync(json, JSON.stringify(rep, null, 2) + '\n');
      console.log(`wrote ${json}`);
    }
    return 0;
  }

  if (mode === 'check') {
    const ctx = fullAnalysis();
    const rep = R.buildReport(ctx);
    const fails = R.checkReport(rep);
    if (!fails.length) {
      console.log(`check: OK — ${rep.modules.length} modules, ${rep.units.length} unit files, ` +
        `${rep.setters.length} setters, 0 refused writes, 0 order violations, ` +
        `${rep.cycles.length} cycle(s) carrying only function bindings, ` +
        `${rep.shadowCases.length} shadow/write-back cases all answered NO.`);
      return 0;
    }
    console.error(`check: FAILED — ${fails.length} problem(s)`);
    for (const f of fails) console.error('  ' + f);
    return 1;
  }

  if (mode === 'units') {
    const apply = args.includes('--apply');
    const out = argv('--out', args);
    if (!apply && !out) { console.error('units: pass --out <dir> or --apply'); return 2; }
    const ctx = fullAnalysis();
    const rep = R.buildReport(ctx);
    const fails = R.checkReport(rep);
    if (fails.length) {
      console.error('units: refusing — `check` is not clean:');
      for (const f of fails) console.error('  ' + f);
      return 1;
    }
    const files = new Map();
    for (const u of ctx.ua.units) files.set(u.rel, U.unitFileText(u));
    const html = U.rewriteSource(ctx.src, ctx.ua);
    const root = apply ? S.RTS : path.resolve(out);
    write(path.join(root, 'rts.src.html'), html);
    for (const [rel, text] of files) write(path.join(root, rel), text);
    console.log(`units: ${files.size} unit files + rts.src.html -> ${apply ? 'the working tree' : root}`);
    console.log(`       ${ctx.ua.chains.length} context objects, ` +
      `${ctx.ua.units.filter((u) => u.class === 'whole-function').length} whole-function files, ` +
      `${ctx.ua.units.filter((u) => u.class === 'early-return-from-bake').length} early-return`);
    return 0;
  }

  if (mode === 'emit') {
    const out = argv('--out', args);
    if (!out) { console.error('emit: pass --out <dir>'); return 2; }
    return E.emit(path.resolve(out), { loadAll, fullAnalysis });
  }

  console.error(`unknown mode ${JSON.stringify(mode)} — analyze | check | units | emit`);
  return 2;
}

function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, loadAll, fullAnalysis, write };
