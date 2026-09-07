#!/usr/bin/env node
// Run the SHIPPED structure clause math over an arbitrary {w,h,mask,rgba}
// record. The checker file is loaded VERBATIM from disk and only an export
// epilogue is appended, so nothing here can drift from what the gate runs.
//   node run-clause.js <structures.js> <key> <fac> <record.json> [gw gh]
'use strict';
const fs = require('fs'), path = require('path');

function loadChecker(p) {
  const src = fs.readFileSync(p, 'utf8');
  const epilogue = '\n;module.exports.__internals = { hsv, hueGap, OWNER_HUE, CONTRAST, px, isHouse,'
    + ' rowProfile, colProfile, bodyRun, components, gapBetween, opaqueOf, medianV, crownRows, FAC,'
    + ' rowRuns: typeof rowRuns === "function" ? rowRuns : null,'
    + ' resolveBand: typeof resolveBand === "function" ? resolveBand : null };\n';
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', '__filename', '__dirname', src + epilogue)
    (mod, mod.exports, require, p, path.dirname(p));
  return mod;
}

function recOf(j) {
  return { w: j.w, h: j.h, mask: Buffer.from(j.mask, 'base64'), rgba: Buffer.from(j.rgba, 'base64') };
}

function runOne(checkerPath, key, fac, rec, gw, gh) {
  const mod = loadChecker(checkerPath);
  const f = Object.assign({ key, fac, name: key, cat: 'x', gw, gh, edges: '' }, rec);
  const ctx = {
    round: (v, n) => { const m = Math.pow(10, n); return Math.round(v * m) / m; },
    byBldFac: (k, fc) => (k === key && fc === fac ? f : null),
    byUnitOct: () => null,
  };
  return mod.exports.check(ctx).filter((r) => r.unit === key);
}

module.exports = { loadChecker, recOf, runOne };

if (require.main === module) {
  const [chk, key, fac, recPath, gw, gh] = process.argv.slice(2);
  const j = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  const rec = recOf(Array.isArray(j) ? j.find((x) => x.key === key && x.fac === fac) : j);
  const rows = runOne(chk, key, fac, rec, +(gw || 4), +(gh || 4));
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.measured}   [want ${r.want}]\n        ${r.clause}`);
}
