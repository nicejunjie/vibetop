'use strict';
// The model: sections x scope-resolved references = import edges, cross-module
// writes, load-time reads, evaluation order and the SCC report.
//
// Everything here is computed from the AST. The one thing a regex could get
// right is the anchor match, and even that is checked for uniqueness.

const path = require('node:path');
const { analyze } = require('./scope');
const { buildSections } = require('./sections');

function specifier(from, to) {
  let rel = path.posix.relative(path.posix.dirname(from), to);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// `G` -> `setG`. If the module already has a `setG` (ui/input.js really does
// have a hand-written `setCmdMode`), fall back to `__setG` rather than
// silently shadowing it.
function setterName(name, taken) {
  const base = 'set' + name[0].toUpperCase() + name.slice(1);
  if (!taken || !taken(base)) return base;
  let n = '__' + base;
  for (let i = 2; taken(n); i++) n = '__' + base + i;
  return n;
}

// classify a cross-module write: what the emitter can rewrite, and what it must refuse
function classifyWrite(w) {
  if (w.kind === 'destructuring') return { ok: false, why: 'destructuring assignment target' };
  if (w.kind === 'for-head') return { ok: false, why: 'for-in/of loop head target' };
  if (w.kind === 'update') {
    if (!w.statement) return { ok: false, why: `\`${w.name}${w.operator}\` used as a value` };
    return { ok: true, form: 'update' };
  }
  if (!w.statement) {
    // `a = b = c` / `if ((x = f()))` / `for (x = 0; …)` — the value is used
    return { ok: false, why: `assignment used as a value (parent ${w.parent ? w.parent.type : '?'})` };
  }
  return { ok: true, form: w.kind === 'simple' ? 'simple' : 'compound' };
}

function buildModel(src, cfg, opts = {}) {
  const { stmts, anchors, problems, sections, order, movedNotes } = buildSections(src, cfg);
  const res = analyze(src.body, { rootType: 'module', rootNode: src.iife.body });
  const root = res.root;

  // ---- who owns which top-level name ----------------------------------- //
  const ownerOf = new Map();                    // name -> { section, stmt, kind }
  for (const st of stmts) {
    for (const n of st.names) {
      if (!ownerOf.has(n)) ownerOf.set(n, { name: n, section: st.section, stmt: st, kind: st.node.type === 'FunctionDeclaration' ? 'function' : 'var' });
    }
  }
  for (const [name, b] of root.bindings) {
    if (!ownerOf.has(name)) ownerOf.set(name, { name, section: null, stmt: null, kind: b.kind });
  }
  const sectionOf = (st) => st.section;

  // ---- references between sections ------------------------------------- //
  const extraModules = opts.extraModules || [];   // unit modules, in emit mode
  const files = order.concat(extraModules.map((m) => m.file));

  const perSection = new Map();
  for (const f of files) {
    perSection.set(f, {
      file: f, declares: new Set(), reads: new Map(), writes: new Map(),
      loadStmts: [], exported: new Set(),
    });
  }
  for (const st of stmts) for (const n of st.names) perSection.get(st.section).declares.add(n);

  for (const r of res.refs) {
    if (!r.binding || r.binding.scope !== root) continue;
    const st = stmts[stmts.bodyOfGroup[r.top]];
    const from = st.section;
    const own = ownerOf.get(r.name);
    if (!own || own.section === from) continue;
    const m = perSection.get(from).reads;
    if (!m.has(r.name)) m.set(r.name, []);
    m.get(r.name).push(r);
  }

  const crossWrites = [];
  const refusals = [];
  for (const w of res.writes) {
    if (!w.binding || w.binding.scope !== root) continue;
    const st = stmts[stmts.bodyOfGroup[w.top]];
    const from = st.section;
    const own = ownerOf.get(w.name);
    if (!own || own.section === from) continue;
    const cls = classifyWrite(w);
    const rec = {
      name: w.name, from, owner: own.section, kind: w.kind, operator: w.operator,
      line: src.lineOfOffset(w.node.start), ok: cls.ok, form: cls.form, why: cls.why, w,
    };
    crossWrites.push(rec);
    if (!cls.ok) refusals.push(rec);
    const m = perSection.get(from).writes;
    if (!m.has(w.name)) m.set(w.name, []);
    m.get(w.name).push(rec);
  }

  // setters: an owner-module `set<Name>` for every top-level var written from elsewhere
  const setters = new Map();                     // name -> { name, setter, owner, sites }
  const setterClashes = [];
  const usedNames = new Set(ownerOf.keys());
  for (const rec of crossWrites) {
    const own = ownerOf.get(rec.name);
    if (!setters.has(rec.name)) {
      const s = setterName(rec.name, (n) => usedNames.has(n));
      if (s !== 'set' + rec.name[0].toUpperCase() + rec.name.slice(1)) {
        setterClashes.push({ name: rec.name, wanted: 'set' + rec.name[0].toUpperCase() + rec.name.slice(1), setter: s, owner: own.section });
      }
      usedNames.add(s);
      setters.set(rec.name, { name: rec.name, setter: s, owner: own.section, kind: own.kind, sites: [] });
    }
    setters.get(rec.name).sites.push(rec);
  }

  // what each module must export
  for (const [f, s] of perSection) {
    for (const [name] of s.reads) perSection.get(ownerOf.get(name).section).exported.add(name);
    for (const [name] of s.writes) {
      const st2 = setters.get(name);
      if (st2) perSection.get(st2.owner).exported.add(st2.setter);
    }
    void f;
  }
  // a compound / update cross-write also READS the name
  for (const rec of crossWrites) {
    if (rec.kind === 'compound' || rec.kind === 'update') {
      perSection.get(ownerOf.get(rec.name).section).exported.add(rec.name);
      const m = perSection.get(rec.from).reads;
      if (!m.has(rec.name)) m.set(rec.name, []);
    }
  }

  // ---- import graph ----------------------------------------------------- //
  const imports = new Map();                     // file -> Map(targetFile -> Set(names))
  for (const f of files) imports.set(f, new Map());
  const addImport = (from, to, name) => {
    if (from === to) return;
    const m = imports.get(from);
    if (!m.has(to)) m.set(to, new Set());
    m.get(to).add(name);
  };
  for (const [f, s] of perSection) {
    for (const [name] of s.reads) addImport(f, ownerOf.get(name).section, name);
    for (const [name] of s.writes) {
      const st2 = setters.get(name);
      if (st2) addImport(f, st2.owner, st2.setter);
    }
  }

  // ---- load-time statements and what they read at evaluation time ------- //
  const loadStmts = [];
  const immediateRefsByStmt = new Map();
  const allRefsByStmt = new Map();
  for (const r of res.refs) {
    const gi = stmts.bodyOfGroup[r.top];
    if (!allRefsByStmt.has(gi)) allRefsByStmt.set(gi, []);
    allRefsByStmt.get(gi).push(r);
    if (r.immediate) {
      if (!immediateRefsByStmt.has(gi)) immediateRefsByStmt.set(gi, []);
      immediateRefsByStmt.get(gi).push(r);
    }
  }
  for (const st of stmts) {
    if (!st.executes) continue;
    const irs = (immediateRefsByStmt.get(st.index) || []).filter((r) => r.binding && r.binding.scope === root);
    const reads = new Map();
    for (const r of irs) {
      const own = ownerOf.get(r.name);
      if (!own) continue;
      if (!reads.has(r.name)) reads.set(r.name, { name: r.name, kind: own.kind, owner: own.section, line: src.lineOfOffset(r.node.start) });
    }
    loadStmts.push({ stmt: st, section: st.section, reads, line: st.fileLine, snippet: firstLine(st) });
    perSection.get(st.section).loadStmts.push(st);
  }

  // transitive: what a load-time statement can reach through the top-level
  // functions it names (conservative — a named function is assumed callable)
  const fnReads = new Map();                     // fname -> Set(var names)
  const fnCalls = new Map();                     // fname -> Set(fn names)
  for (const st of stmts) {
    if (st.node.type !== 'FunctionDeclaration') continue;
    const f = st.names[0];
    const rs = new Set(), cs = new Set();
    for (const r of allRefsByStmt.get(st.index) || []) {
      if (!r.binding || r.binding.scope !== root) continue;
      const own = ownerOf.get(r.name);
      if (!own) continue;
      if (own.kind === 'function') cs.add(r.name); else rs.add(r.name);
    }
    fnReads.set(f, rs); fnCalls.set(f, cs);
  }
  const closure = new Map();
  for (const f of fnReads.keys()) closure.set(f, new Set(fnReads.get(f)));
  for (let changed = true, guard = 0; changed && guard < 200; guard++) {
    changed = false;
    for (const f of fnReads.keys()) {
      const c = closure.get(f);
      for (const g of fnCalls.get(f) || []) {
        for (const n of closure.get(g) || []) if (!c.has(n)) { c.add(n); changed = true; }
      }
    }
  }

  return {
    src, cfg, stmts, anchors, problems, sections, order, files, movedNotes,
    res, root, ownerOf, perSection, crossWrites, refusals, setters, setterClashes,
    setterNames: new Set([...setters.values()].map((s) => s.setter)),
    imports, loadStmts, closure, fnReads, fnCalls, immediateRefsByStmt, allRefsByStmt,
    sectionOf, extraModules,
  };
}

function firstLine(st) {
  const t = st.text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  return (t[0] || '').trim().slice(0, 90);
}

// ---- evaluation order and cycles ---------------------------------------- //

// post-order DFS from main.js; main.js's own import list is every module in
// section order, exactly as `emit` writes it
function evalOrder(model, entry = 'main.js') {
  const deps = (f) => {
    if (f === entry) return model.files.filter((x) => x !== entry);
    const m = model.imports.get(f) || new Map();
    return [...m.keys()].sort((a, b) => (specifier(f, a) < specifier(f, b) ? -1 : 1));
  };
  const seen = new Set();
  const out = [];
  const visit = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const d of deps(f)) visit(d);
    out.push(f);
  };
  visit(entry);
  for (const f of model.files) visit(f);        // anything unreachable still gets a slot
  const index = new Map(out.map((f, i) => [f, i]));
  return { order: out, index, deps };
}

function orderViolations(model, ev) {
  const bad = [];
  for (const ls of model.loadStmts) {
    for (const r of ls.reads.values()) {
      if (r.kind === 'function') continue;       // instantiated at link time
      if (r.owner === ls.section) continue;
      if (ev.index.get(r.owner) > ev.index.get(ls.section)) {
        bad.push({ ...r, from: ls.section, at: ls.line, snippet: ls.snippet });
      }
    }
  }
  return bad;
}

// conservative second pass: load-time statement -> top-level functions it
// names -> everything those can read
function transitiveOrderWarnings(model, ev) {
  const out = [];
  for (const ls of model.loadStmts) {
    const seeds = new Set();
    for (const r of ls.reads.values()) if (r.kind === 'function') seeds.add(r.name);
    const reach = new Set();
    for (const s of seeds) for (const n of model.closure.get(s) || []) reach.add(n);
    for (const n of reach) {
      const own = model.ownerOf.get(n);
      if (!own || own.kind === 'function' || own.section === ls.section) continue;
      if (ev.index.get(own.section) > ev.index.get(ls.section)) {
        out.push({ name: n, owner: own.section, from: ls.section, at: ls.line, snippet: ls.snippet });
      }
    }
  }
  return out;
}

function tarjan(model) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
  const comps = [];
  let idx = 0;
  const strong = (v) => {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of (model.imports.get(v) || new Map()).keys()) {
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const c = [];
      for (;;) { const w = stack.pop(); onStack.delete(w); c.push(w); if (w === v) break; }
      comps.push(c);
    }
  };
  for (const f of model.files) if (!index.has(f)) strong(f);
  return comps.filter((c) => c.length > 1 || (model.imports.get(c[0]) || new Map()).has(c[0]));
}

// a cycle is only an error if one of its edges carries a var that the
// importing module READS at evaluation time
function cycleReport(model) {
  const comps = tarjan(model);
  return comps.map((c) => {
    const inSet = new Set(c);
    const edges = [];
    for (const f of c) {
      for (const [to, names] of model.imports.get(f) || new Map()) {
        if (!inSet.has(to)) continue;
        const loadRead = [];
        for (const n of names) {
          const own = model.ownerOf.get(n);
          if (own && own.kind === 'function') continue;
          if (model.setterNames.has(n)) continue;      // a generated setter is a function
          const ls = model.perSection.get(f).loadStmts;
          for (const st of ls) {
            const irs = (model.immediateRefsByStmt.get(st.index) || []).filter((r) => r.name === n);
            if (irs.length) { loadRead.push(n); break; }
          }
        }
        edges.push({ from: f, to, names: [...names], loadRead });
      }
    }
    return { members: c, edges, error: edges.some((e) => e.loadRead.length) };
  });
}

module.exports = { buildModel, evalOrder, orderViolations, transitiveOrderWarnings, cycleReport, tarjan, specifier, setterName, classifyWrite };
