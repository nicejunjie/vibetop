'use strict';
// The 69 unit-art bodies: analysis, and the P1 rewrite that turns each one
// into a real function taking a single context object.
//
// A unit file is today the de-indented BODY of one branch of a bake function,
// spliced back in by tools/rts-build.py. Every free identifier in it is either
// a LOCAL of the bake function (-> a context key), a TOP-LEVEL name of the
// closure (-> a module import at P2b), or a browser global. The analysis
// resolves each one through the real scope chain at the `@@include` line, so a
// body that `var`-declares a name the bake function also uses is reported as a
// SHADOW rather than silently mistaken for a context key.

const acorn = require('acorn');
const { analyze, innermostScopeAt } = require('./scope');
const { die, findIncludes, readUnit, drawName, unitKind, unitClass, listUnitFiles } = require('./source');

const WRAP_PRE = 'function __unit__() {\n';
const WRAP_POST = '\n}\n';

// the chain of AST nodes containing `offset`, outermost first
function nodePath(root, offset) {
  const path = [];
  let node = root;
  for (;;) {
    path.push(node);
    let next = null;
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      const v = node[k];
      const arr = Array.isArray(v) ? v : [v];
      for (const c of arr) {
        if (c && typeof c.type === 'string' && c.start <= offset && offset < c.end) { next = c; break; }
      }
      if (next) break;
    }
    if (!next) return path;
    node = next;
  }
}

function isFn(n) { return n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'; }

function splitHeader(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('//')) i++;
  return { header: lines.slice(0, i), rest: lines.slice(i).join('\n') };
}

function analyzeUnits(src, model, cfg) {
  const includes = findIncludes(src);
  const onDisk = listUnitFiles();
  const problems = [];
  const seen = new Set();
  for (const inc of includes) {
    if (seen.has(inc.rel)) problems.push(`${src.where(inc.start)}: ${inc.rel} is included twice`);
    seen.add(inc.rel);
  }
  for (const f of onDisk) if (!seen.has(f)) problems.push(`${f}: on disk but never @@included`);

  const wholeFn = (cfg.units && cfg.units.wholeFunction) || {};
  const units = [];
  const chainsById = new Map();

  // Pick every export name up front: `draw<Kind>` unless the monolith already
  // has that name (it has a `drawPower()` of its own — the HUD power bar), in
  // which case the class-qualified `drawStructurePower` is used and reported.
  const taken = new Set(model.root.bindings.keys());
  const nameOf = new Map();
  const renames = [];
  for (const inc of includes) {
    const key = `${unitClass(inc.rel)}/${unitKind(inc.rel)}`;
    if (Object.prototype.hasOwnProperty.call(wholeFn, key)) continue;   // keeps its bake name
    const n = require('./source').drawNameFor(inc.rel, (x) => taken.has(x));
    if (n !== drawName(inc.rel)) renames.push({ rel: inc.rel, wanted: drawName(inc.rel), used: n });
    taken.add(n);
    nameOf.set(inc.rel, n);
  }
  const notes = renames.map((r) =>
    `${r.rel}: \`${r.wanted}\` is already a top-level name in the monolith — exported as \`${r.used}\``);

  for (const inc of includes) {
    const u = {
      rel: inc.rel, cls: unitClass(inc.rel), kind: unitKind(inc.rel), include: inc,
      key: `${unitClass(inc.rel)}/${unitKind(inc.rel)}`,
      abort: [], notes: [],
    };
    units.push(u);
    const text = readUnit(inc.rel);
    const { header, rest } = splitHeader(text);
    u.headerLines = header; u.restText = rest; u.bodyText = text;

    // ---- where it lands ------------------------------------------------ //
    const path = nodePath(src.iife, inc.start);
    const fns = path.filter(isFn);
    const hostFn = fns[fns.length - 1];
    if (!hostFn) { u.abort.push('no enclosing function'); continue; }
    u.hostFn = hostFn;
    u.hostFnName = hostFn.id ? hostFn.id.name : '(anonymous)';
    u.hostIsTopDecl = hostFn.type === 'FunctionDeclaration' && src.body.includes(hostFn);
    u.hostEmpty = hostFn.body.type === 'BlockStatement' && hostFn.body.body.length === 0;
    // for an IIFE wrapper (mcv) the locals come from the function around it
    u.ownerFn = (u.hostEmpty && hostFn.type === 'FunctionExpression') ? fns[fns.length - 2] : hostFn;
    u.ownerFnName = u.ownerFn && u.ownerFn.id ? u.ownerFn.id.name : '(anonymous)';

    // ---- the dispatch chain this branch belongs to --------------------- //
    let ifNode = null;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].type === 'IfStatement') { ifNode = path[i]; break; }
      if (isFn(path[i]) && path[i] !== hostFn) break;
    }
    if (ifNode && u.hostEmpty && hostFn.type === 'FunctionExpression') {
      // the mcv IIFE: its `if` is the chain
    }
    let chainRoot = ifNode;
    if (chainRoot) {
      for (;;) {
        const p = nodePath(src.iife, chainRoot.start);
        const parent = p[p.length - 2];
        if (parent && parent.type === 'IfStatement' && parent.alternate === chainRoot) chainRoot = parent;
        else break;
      }
    }
    u.chainRoot = chainRoot;

    // ---- extraction class ---------------------------------------------- //
    const whole = Object.prototype.hasOwnProperty.call(wholeFn, u.key);
    if (whole) {
      if (!u.hostIsTopDecl || !u.hostEmpty) u.abort.push(`sections.json calls it a whole-function file but the @@include is not the entire body of a top-level function (host ${u.hostFnName})`);
      if (wholeFn[u.key] !== u.hostFnName) u.abort.push(`sections.json says the whole function is ${wholeFn[u.key]}, the source says ${u.hostFnName}`);
      u.class = 'whole-function';
      u.fnName = u.hostFnName;
      u.signature = src.scriptText.slice(hostFn.start, hostFn.body.start + 1).replace(/^ +/, '');
    } else {
      u.fnName = nameOf.get(inc.rel);
      if (!chainRoot) u.abort.push('not a whole-function file and not inside an if/else dispatch chain');
    }

    // ---- parse the body in isolation ------------------------------------ //
    const wrapped = WRAP_PRE + text + WRAP_POST;
    let wast = null;
    try {
      wast = acorn.parse(wrapped, { ecmaVersion: 2022, sourceType: 'script', locations: true });
    } catch (e) {
      u.abort.push(`does not parse as a function body: ${e.message} (a depth-0 break/continue looks like this)`);
      u.class = u.class || 'ABORT';
      continue;
    }
    const wfn = wast.body[0];
    const delta = WRAP_PRE.length;
    const bres = analyze(wfn.body.body, { rootType: 'function', rootNode: wfn.body });
    u.wrapped = { text: wrapped, ast: wast, fn: wfn, delta, res: bres };

    // depth-0 return: a `return` whose nearest enclosing function is the body
    u.returns = bres.refs.length >= 0 ? findDepth0Returns(wfn) : [];
    u.hasReturn = u.returns.length > 0;
    const lastStmt = wfn.body.body[wfn.body.body.length - 1];
    u.endsWithReturn = !!lastStmt && lastStmt.type === 'ReturnStatement';

    if (!whole) {
      if (u.hasReturn) {
        if (!u.endsWithReturn) u.abort.push(`has a depth-0 \`return\` but does not END with one — the call site cannot be \`return ${u.fnName}(C);\``);
        u.class = 'early-return-from-bake';
      } else {
        u.class = 'plain';
      }
    }

    // ---- resolve every free identifier ---------------------------------- //
    const hostScope = innermostScopeAt(model.res.scopes, inc.start);
    if (!hostScope) { u.abort.push('no scope at the @@include line'); continue; }
    u.hostScope = hostScope;

    const readLocals = new Map();      // name -> { name, binding, reads, writes }
    const topRefs = new Map();
    const globals = new Set();
    const bodyLocals = new Map(bres.root.bindings);

    const classify = (name) => {
      const b = hostScope.lookup(name);
      if (!b) return { where: 'global', b: null };
      if (b.scope === model.root) return { where: 'top', b };
      return { where: 'local', b };
    };

    for (const r of bres.refs) {
      if (r.binding) continue;                       // resolved inside the body
      const c = classify(r.name);
      if (c.where === 'global') { globals.add(r.name); continue; }
      const bag = c.where === 'top' ? topRefs : readLocals;
      if (!bag.has(r.name)) bag.set(r.name, { name: r.name, binding: c.b, reads: 0, writes: 0 });
      bag.get(r.name).reads++;
    }
    for (const w of bres.writes) {
      if (w.binding) continue;
      const c = classify(w.name);
      if (c.where === 'global') { globals.add(w.name); continue; }
      const bag = c.where === 'top' ? topRefs : readLocals;
      if (!bag.has(w.name)) bag.set(w.name, { name: w.name, binding: c.b, reads: 0, writes: 0 });
      bag.get(w.name).writes++;
      bag.get(w.name).writeNodes = (bag.get(w.name).writeNodes || []).concat([w]);
    }

    u.contextKeys = [...readLocals.keys()].sort();
    u.readLocals = readLocals;
    u.writtenLocals = [...readLocals.values()].filter((x) => x.writes > 0).map((x) => x.name).sort();
    u.topRefs = topRefs;
    u.topNames = [...topRefs.keys()].sort();
    u.topWrites = [...topRefs.values()].filter((x) => x.writes > 0).map((x) => x.name).sort();
    u.globals = [...globals].sort();

    // ---- shadows: a body-local that is also a name of an enclosing scope - //
    u.shadows = [];
    for (const [name, b] of bodyLocals) {
      if (name === 'arguments') continue;
      const c = classify(name);
      if (c.where === 'global') continue;
      u.shadows.push({ name, kind: b.kind, of: c.where, binding: c.b });
    }
    u.shadows.sort((a, b) => (a.name < b.name ? -1 : 1));

    if (whole) {
      // the whole body IS the function: its "locals" are the parameters, and
      // there is no context object at all
      u.contextKeys = [];
    } else if (u.contextKeys.length === 0 && !u.hostEmpty) {
      u.notes.push('no context keys — the body reads no local of its bake function');
    }
    if (u.topWrites.some((n) => n !== 'VLIFT' && n !== 'NO_RIM')) {
      u.abort.push(`writes closure-level name(s) other than VLIFT/NO_RIM: ${u.topWrites.join(', ')}`);
    }
  }

  // ---- group the branches into dispatch chains -------------------------- //
  for (const u of units) {
    if (u.class === 'whole-function' || !u.chainRoot) continue;
    const id = u.chainRoot.start;
    if (!chainsById.has(id)) {
      const line = src.li.lineOf(u.chainRoot.start);
      const indent = ' '.repeat(u.chainRoot.start - src.li.startOf(line));
      chainsById.set(id, {
        id, root: u.chainRoot, host: u.ownerFn, hostName: u.ownerFnName,
        indent, line, fileLine: src.fileLine(line), units: [], keys: [],
      });
    }
    const ch = chainsById.get(id);
    ch.units.push(u);
    u.chain = ch;
  }
  const chains = [...chainsById.values()].sort((a, b) => a.id - b.id);
  for (const ch of chains) {
    const keys = new Set();
    for (const u of ch.units) for (const k of u.contextKeys) keys.add(k);
    ch.keys = [...keys].sort();
    // every key must be DECLARED above the construction point, or it is
    // `undefined` when the object is built
    for (const k of ch.keys) {
      const b = ch.units.map((u) => u.readLocals.get(k)).find(Boolean).binding;
      const declAt = b.node && typeof b.node.start === 'number' ? b.node.start : -1;
      if (b.kind === 'param' || b.kind === 'arguments') continue;
      if (declAt >= ch.root.start) {
        problems.push(`rts.src.html:${ch.fileLine}: context key \`${k}\` for the ${ch.hostName} chain is declared at ` +
          `rts.src.html:${src.lineOfOffset(declAt)}, BELOW the \`var C\` construction — ABORT`);
      }
    }
    // nothing may reassign a key between the construction point and a branch:
    // the only code that runs in between is the chain's own tests
    for (const w of model.res.writes) {
      if (!w.binding || w.binding.scope === model.root) continue;
      if (!ch.keys.includes(w.name)) continue;
      for (let n = ch.root; n; n = null) {
        for (const t of chainTests(n)) {
          if (w.node.start >= t.start && w.node.end <= t.end) {
            problems.push(`rts.src.html:${src.lineOfOffset(w.node.start)}: \`${w.name}\` is reassigned inside the ${ch.hostName} chain's own test — ABORT`);
          }
        }
      }
    }
  }

  // A body's `var` hoists into the bake function TODAY, so a sibling branch
  // that names it reads the hoisted binding, not the closure-level one. After
  // extraction the sibling would resolve to the module-level name instead.
  for (const ch of chains) {
    const declaredBy = new Map();
    for (const u of ch.units) for (const s of u.shadows || []) declaredBy.set(s.name, u);
    for (const u of ch.units) {
      for (const n of (u.contextKeys || []).concat(u.topNames || [])) {
        const other = declaredBy.get(n);
        if (other && other !== u) {
          problems.push(`${u.rel}: reads \`${n}\`, which ${other.rel} \`var\`-declares into the same bake function — ` +
            `the two branches do not agree on what that name is — ABORT`);
        }
      }
    }
  }

  return { units, chains, problems, notes, includes };
}

// ---- the spliced page --------------------------------------------------- //
//
// The shadow question ("does the bake function read this name after the
// branch?") can only be answered on the page as it actually RUNS, because a
// body's `var` hoists into the bake function only once it is spliced in. So
// build exactly what rts-build.py builds, parse that, and ask there.
function spliceScript(src, ua) {
  const lines = src.scriptText.split('\n');
  const byLine = new Map();
  for (const u of ua.units) byLine.set(u.include.scriptLine, u);
  const out = [];
  const regions = new Map();
  let off = 0;
  for (let i = 0; i < lines.length; i++) {
    const u = byLine.get(i + 1);
    if (!u) { out.push(lines[i]); off += lines[i].length + 1; continue; }
    const pad = u.include.indent;
    const body = u.bodyText.split('\n').map((s) => (s.trim() ? pad + s : ''));
    regions.set(u.rel, { start: off, end: off + body.join('\n').length });
    for (const b of body) { out.push(b); off += b.length + 1; }
  }
  const text = out.join('\n');
  const ast = acorn.parse(text, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  const iife = ast.body[0].expression.callee;
  const res = analyze(iife.body.body, { rootType: 'module', rootNode: iife.body });
  const li = require('./source').lineIndex(text);
  return { text, ast, iife, res, regions, li };
}

// For every shadow and every enclosing local a body writes: does the bake
// function READ that name after the branch? YES = the extraction would change
// behaviour and the tool must refuse.
function answerShadows(src, ua, spl) {
  const cases = [];
  const allRegions = [...spl.regions.values()];
  for (const u of ua.units) {
    const reg = spl.regions.get(u.rel);
    if (!reg) continue;
    const path = nodePath(spl.iife, reg.start);
    const fns = path.filter(isFn);
    // the function whose locals the body shares: skip an IIFE wrapper
    let owner = fns[fns.length - 1];
    if (owner && owner.type === 'FunctionExpression' && fns.length > 1 &&
        u.hostEmpty && u.hostFn.type === 'FunctionExpression') owner = fns[fns.length - 2];
    const scope = innermostScopeAt(spl.res.scopes, reg.start);
    const ask = (name, why) => {
      const b = scope ? scope.lookup(name) : null;
      const hits = [];
      if (b) {
        for (const r of b.refs) {
          if (r.node.start < reg.end) continue;                       // not after the branch
          if (!owner || r.node.start < owner.start || r.node.end > owner.end) continue;
          if (allRegions.some((g) => r.node.start >= g.start && r.node.start < g.end)) continue;
          hits.push(spl.li.lineOf(r.node.start));
        }
      }
      cases.push({
        unit: u.rel, name, why,
        ownerFn: owner && owner.id ? owner.id.name : u.ownerFnName,
        bindingKind: b ? b.kind : '(unresolved)',
        bindingScope: b ? (b.scope === spl.res.root ? 'top-level' : 'function-local') : '-',
        answer: hits.length ? 'YES' : 'NO',
        lines: hits.map((l) => `rts.html:${l}`),
      });
    };
    for (const s of u.shadows || []) ask(s.name, `body \`${s.kind}\` shadows a ${s.of === 'top' ? 'closure-level' : 'bake-local'} name`);
    for (const n of u.writtenLocals || []) ask(n, 'body ASSIGNS this local of the bake function');
  }
  return cases;
}

function chainTests(ifNode) {
  const out = [];
  for (let n = ifNode; n && n.type === 'IfStatement'; n = n.alternate) out.push(n.test);
  return out;
}

function findDepth0Returns(fnNode) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (isFn(n)) return;
    if (n.type === 'ReturnStatement') out.push(n);
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c); }
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  for (const s of fnNode.body.body) walk(s);
  return out;
}

// ---- emitting ----------------------------------------------------------- //

function wrapList(prefix, parts, contIndent, width = 100) {
  const lines = [];
  let cur = prefix;
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i] + (i === parts.length - 1 ? '' : ',');
    if (cur.trimEnd().length && (cur + ' ' + piece).length > width) {
      lines.push(cur.trimEnd());
      cur = contIndent + piece;
    } else {
      cur = cur.trimEnd().length && !cur.endsWith(' ') ? cur + ' ' + piece : cur + piece;
    }
  }
  lines.push(cur.trimEnd());
  return lines;
}

// the P1 unit file: header comment, the function, a prelude that unpacks the
// context, then the body byte-for-byte
function unitFileText(u) {
  const out = u.headerLines.slice();
  if (u.class === 'whole-function') {
    out.push(u.signature);
    out.push(u.restText);
    out.push('}');
    return out.join('\n') + '\n';
  }
  out.push(`function ${u.fnName}(C) {`);
  if (u.contextKeys.length) {
    const parts = u.contextKeys.map((k) => `${k} = C.${k}`);
    for (const l of wrapList('  var ', parts, '      ')) out.push(l);
    out[out.length - 1] += ';';
  }
  out.push(u.restText);
  out.push('}');
  return out.join('\n') + '\n';
}

// P1 rewrite of rts.src.html: the bodies leave the bake functions, a context
// object is built once per dispatch chain, and the @@include lines move to one
// top-level block above bakeAll()
function rewriteSource(src, ua) {
  const edits = [];                                   // { start, end, text }
  const incLines = [];

  for (const ch of ua.chains) {
    const parts = ch.keys.map((k) => `${k}: ${k}`);
    const lines = wrapList(`${ch.indent}var C = { `, parts, ch.indent + '          ');
    lines[lines.length - 1] += ' };';
    edits.push({ start: src.li.startOf(ch.line), end: src.li.startOf(ch.line), text: lines.join('\n') + '\n' });
  }

  for (const u of ua.units) {
    incLines.push(`  // @@include ${u.rel}`);
    if (u.class === 'whole-function') {
      // the monolith loses its copy of the function entirely
      const fnStart = src.li.startOf(src.li.lineOf(u.hostFn.start));
      const fnEnd = src.li.endOf(src.li.lineOf(u.hostFn.end - 1));
      edits.push({ start: fnStart, end: fnEnd, text: '' });
      continue;
    }
    const call = `${u.fnName}(C);`;
    if (u.hostEmpty && u.hostFn.type === 'FunctionExpression') {
      // `if (kind === 'mcv' && wantH) (function () { … })();` -> a plain call
      const p = nodePath(src.iife, u.include.start);
      const stmt = p.filter((n) => n.type === 'ExpressionStatement').pop();
      if (!stmt) die(`${u.rel}: the IIFE wrapper is not an expression statement`);
      edits.push({ start: stmt.start, end: stmt.end, text: call });
    } else if (u.class === 'early-return-from-bake') {
      // `if (key === 'shipyard') { … }` -> `if (key === 'shipyard') return drawShipyard(C);`
      const root = u.chainRoot;
      if (root.alternate || u.chain.units.length !== 1) {
        die(`${u.rel}: an early-return branch may not be part of a multi-arm chain`);
      }
      const test = src.scriptText.slice(root.test.start, root.test.end);
      const indent = u.chain.indent;
      const s = src.li.startOf(src.li.lineOf(root.start));
      const e = src.li.endOf(src.li.lineOf(root.end - 1));
      edits.push({ start: s, end: e, text: `${indent}if (${test}) return ${u.fnName}(C);\n` });
    } else {
      edits.push({ start: u.include.start, end: u.include.end, text: `${u.include.indent}${call}\n` });
    }
  }

  // the top-level definitions block, just above bakeAll()
  const bakeAll = src.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'bakeAll');
  if (!bakeAll) die('rts.src.html: no top-level function bakeAll()');
  const stmts = require('./sections').chunkStatements(src);
  const chunk = stmts.find((s) => s.nodes.includes(bakeAll));
  const block = ['  // ---- unit art: one function per unit (art/units/<class>/<kind>.js) ----']
    .concat(incLines).concat(['']).join('\n') + '\n';
  edits.push({ start: chunk.chunkStart, end: chunk.chunkStart, text: block });

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src.scriptText;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return src.html.slice(0, src.scriptStart) + out + src.html.slice(src.scriptEnd);
}

module.exports = { analyzeUnits, unitFileText, rewriteSource, spliceScript, answerShadows, nodePath, wrapList, splitHeader, WRAP_PRE, WRAP_POST };
