'use strict';
// The analysis report, and the machine-readable form behind `--json`.

const M = require('./model');

function buildReport(ctx) {
  const { src, model, ua, shadowCases, ev } = ctx;
  const violations = M.orderViolations(model, ev);
  const transitive = M.transitiveOrderWarnings(model, ev);
  const cycles = M.cycleReport(model);

  const modules = model.sections.map((s) => {
    const ps = model.perSection.get(s.file);
    const declares = [...ps.declares];
    const exported = [...ps.exported].filter((n) => ps.declares.has(n));
    return {
      file: s.file,
      statements: s.all.length,
      moved: s.moved.map((m) => m.names.join(',')),
      lines: s.all.length ? `${Math.min(...s.all.map((x) => x.fileLine))}-${Math.max(...s.all.map((x) => x.fileLine))}` : '-',
      declares: declares.length,
      exported: exported.length,
      private: declares.length - exported.length,
      imports: [...model.imports.get(s.file)].map(([to, names]) => ({ to, names: [...names].sort() }))
        .sort((a, b) => (a.to < b.to ? -1 : 1)),
      loadStatements: ps.loadStmts.length,
    };
  });

  const setters = [...model.setters.values()]
    .sort((a, b) => (a.owner === b.owner ? (a.name < b.name ? -1 : 1) : (a.owner < b.owner ? -1 : 1)))
    .map((s) => ({
      name: s.name, setter: s.setter, owner: s.owner, kind: s.kind,
      sites: s.sites.length,
      forms: countBy(s.sites.map((x) => x.form)),
      from: [...new Set(s.sites.map((x) => x.from))].sort(),
    }));

  const units = ua.units.map((u) => ({
    file: u.rel, class: u.class || 'ABORT', fn: u.fnName,
    bake: u.ownerFnName, host: u.hostFnName,
    at: `rts.src.html:${u.include.fileLine}`,
    contextKeys: u.contextKeys || [],
    writesLocals: u.writtenLocals || [],
    topNames: u.topNames || [],
    topWrites: u.topWrites || [],
    depth0Return: !!u.hasReturn,
    shadows: (u.shadows || []).map((s) => `${s.name} (${s.of})`),
    abort: u.abort,
  }));

  return {
    generated: 'apps/games/rts/tools/modularize',
    source: { statements: model.stmts.length, topLevelBindings: model.root.bindings.size },
    anchors: model.anchors.map((a) => ({ file: a.file, line: a.fileLine, anchor: a.anchor })),
    anchorProblems: model.problems,
    moves: model.movedNotes,
    modules,
    setters,
    refusals: model.refusals.map((r) => ({ name: r.name, from: r.from, owner: r.owner, at: `rts.src.html:${r.line}`, why: r.why })),
    setterRenames: model.setterClashes,
    evalOrder: ev.order,
    orderViolations: violations,
    transitiveWarnings: dedupe(transitive),
    cycles: cycles.map((c) => ({ members: c.members, error: c.error, loadReadEdges: c.edges.filter((e) => e.loadRead.length) })),
    units,
    unitProblems: ua.problems,
    unitNotes: ua.notes || [],
    chains: ua.chains.map((c) => ({ at: `rts.src.html:${c.fileLine}`, bake: c.hostName, units: c.units.length, keys: c.keys })),
    shadowCases: shadowCases,
  };
}

function countBy(xs) {
  const m = {};
  for (const x of xs) m[x] = (m[x] || 0) + 1;
  return m;
}
function dedupe(xs) {
  const seen = new Set(), out = [];
  for (const x of xs) {
    const k = `${x.from}|${x.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function printReport(r, { verbose = false } = {}) {
  const L = console.log;
  L('Iron Frontier — monolith -> ES modules, analysis');
  L('='.repeat(78));
  L(`source            ${r.source.statements} top-level statements, ${r.source.topLevelBindings} names in one closure`);
  L(`modules           ${r.modules.length} sections + ${r.units.length} unit-art files`);
  L('');

  L('-- sections --------------------------------------------------------------');
  L('  module                 lines          stmts  decl  exp  priv  imports  load');
  for (const m of r.modules) {
    L('  ' + m.file.padEnd(20) + ' ' + m.lines.padStart(13) + '  ' +
      String(m.statements).padStart(5) + ' ' + String(m.declares).padStart(5) + ' ' +
      String(m.exported).padStart(4) + ' ' + String(m.private).padStart(5) + ' ' +
      String(m.imports.length).padStart(8) + ' ' + String(m.loadStatements).padStart(5));
  }
  if (r.moves.length) {
    L('');
    L('  re-homed declarations (sections.json `moves`):');
    for (const m of r.moves) L('    ' + m);
  }
  L('');

  L('-- cross-module writes ---------------------------------------------------');
  L(`  ${r.setters.length} top-level vars are written from another module -> ${r.setters.length} generated setters`);
  L('  owner               setter                  sites  forms                 written from');
  for (const s of r.setters) {
    const forms = Object.entries(s.forms).map(([k, v]) => `${k}x${v}`).join(' ');
    L('  ' + s.owner.padEnd(19) + ' ' + s.setter.padEnd(23) + ' ' + String(s.sites).padStart(5) + '  ' +
      forms.padEnd(21) + ' ' + s.from.join(' '));
  }
  if (r.setterRenames.length) {
    L('  renamed to avoid a clash with an existing declaration:');
    for (const c of r.setterRenames) L(`    ${c.name}: ${c.wanted} is taken in ${c.owner} -> ${c.setter}`);
  }
  L(`  REFUSED: ${r.refusals.length}`);
  for (const x of r.refusals) L(`    ${x.at}  ${x.name} (${x.from} -> ${x.owner}): ${x.why}`);
  L('');

  L('-- evaluation order ------------------------------------------------------');
  L('  ESM order (post-order DFS from main.js):');
  L('    ' + wrap(r.evalOrder.join(' '), 74, '    '));
  L(`  load-time reads that would land before their owner module: ${r.orderViolations.length}`);
  for (const v of r.orderViolations) {
    L(`    ERROR rts.src.html:${v.at}  ${v.from} reads ${v.name} (owner ${v.owner}) | ${v.snippet}`);
  }
  L(`  conservative transitive reach (a load-time statement naming a function that could read a later module's var): ${r.transitiveWarnings.length}`);
  if (verbose) for (const v of r.transitiveWarnings) L(`    note  ${v.from} -> ${v.name} (${v.owner}) at rts.src.html:${v.at}`);
  L('');

  L('-- cycles (Tarjan SCC over the import graph) ------------------------------');
  for (const c of r.cycles) {
    L(`  SCC of ${c.members.length}: ${c.error ? 'ERROR' : 'ok — every edge carries only function bindings'}`);
    L('    ' + wrap(c.members.join(' '), 74, '    '));
    for (const e of c.loadReadEdges) L(`    ERROR ${e.from} imports ${e.loadRead.join(', ')} from ${e.to} and READS it at load time`);
  }
  L('');

  L('-- unit art --------------------------------------------------------------');
  const byClass = countBy(r.units.map((u) => u.class));
  L('  ' + Object.entries(byClass).map(([k, v]) => `${k}: ${v}`).join(', '));
  L('  dispatch chains (one `var C = {…}` each):');
  for (const c of r.chains) L(`    ${c.at.padEnd(22)} ${c.bake.padEnd(14)} ${String(c.units).padStart(2)} units, ${String(c.keys.length).padStart(2)} keys`);
  L('');
  L('  file                                   class                   ctx  top  writes   d0ret');
  for (const u of r.units) {
    L('  ' + u.file.padEnd(38) + ' ' + u.class.padEnd(22) + ' ' +
      String(u.contextKeys.length).padStart(4) + ' ' + String(u.topNames.length).padStart(4) + '  ' +
      (u.topWrites.join(',') || '-').padEnd(14) + ' ' + (u.depth0Return ? 'yes' : 'no'));
    if (u.abort.length) for (const a of u.abort) L(`      ABORT ${u.file}: ${a}`);
  }
  if (r.unitNotes.length) {
    L('');
    for (const n of r.unitNotes) L('  NOTE ' + n);
  }
  if (r.unitProblems.length) {
    L('');
    for (const p of r.unitProblems) L('  ABORT ' + p);
  }
  L('');

  L('-- shadow / write-back cases ---------------------------------------------');
  L('  "does the bake function READ that name after the branch?" — answered on the');
  L('  SPLICED page (rts.html), because a body\'s `var` only hoists once spliced.');
  L('  ans  unit                                   name        binding          why');
  for (const c of r.shadowCases) {
    L('  ' + c.answer.padEnd(4) + ' ' + c.unit.padEnd(38) + ' ' + c.name.padEnd(11) + ' ' +
      c.bindingScope.padEnd(16) + ' ' + c.why + (c.lines.length ? '  AT ' + c.lines.join(' ') : ''));
  }
  const yes = r.shadowCases.filter((c) => c.answer === 'YES');
  L(`  ${r.shadowCases.length} cases, ${yes.length} YES (a YES means the extraction would change behaviour)`);
  L('');
}

function wrap(s, w, indent) {
  const out = [];
  let cur = '';
  for (const word of s.split(' ')) {
    if (cur && (cur + ' ' + word).length > w) { out.push(cur); cur = word; }
    else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) out.push(cur);
  return out.join('\n' + indent);
}

// `check`: the gate
function checkReport(r) {
  const fails = [];
  if (r.anchorProblems.length) fails.push(...r.anchorProblems.map((p) => 'anchor: ' + p));
  for (const x of r.refusals) fails.push(`refused write: ${x.at} ${x.name} (${x.from} -> ${x.owner}): ${x.why}`);
  for (const v of r.orderViolations) fails.push(`evaluation order: ${v.from} reads ${v.name} (owner ${v.owner}) at rts.src.html:${v.at} before ${v.owner} evaluates`);
  for (const c of r.cycles) for (const e of c.loadReadEdges) fails.push(`cycle: ${e.from} reads ${e.loadRead.join(', ')} from ${e.to} at load time, inside an SCC of ${c.members.length}`);
  for (const u of r.units) {
    if (u.class === 'ABORT') fails.push(`unit ${u.file}: not classified`);
    for (const a of u.abort) fails.push(`unit ${u.file}: ${a}`);
  }
  for (const p of r.unitProblems) fails.push('unit: ' + p);
  for (const c of r.shadowCases) {
    if (c.answer !== 'YES' && c.answer !== 'NO') fails.push(`shadow ${c.unit}:${c.name}: unanswered`);
    if (c.answer === 'YES') fails.push(`shadow ${c.unit}:${c.name}: ${c.ownerFn} READS it after the branch (${c.lines.join(' ')}) — extraction would change behaviour`);
  }
  return fails;
}

module.exports = { buildReport, printReport, checkReport };
