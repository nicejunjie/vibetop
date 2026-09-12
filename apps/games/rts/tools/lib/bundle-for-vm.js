// Iron Frontier — the module tree as ONE classic script, for node's `vm`.
//
// The browser loads `rts/main.js` as native ES modules. Node's test harness
// (rts.test.js, tools/sim-identity.js) needs the same program as a single
// string it can boot in an isolated `vm` context — and it needs to boot it
// SEVERAL times in one process (the two-tab lobby tests), which rules out
// `import()` (one cached graph per process). So this walks the import graph
// from main.js, orders the modules the way ESM evaluates them (post-order over
// each module's imports in source order), strips the one-line import headers
// and the `export ` keywords, and concatenates the bodies inside one strict
// IIFE. That reproduces the closure the game was written as: every top-level
// name is visible to every other module, exactly as `import`/`export` make it.
//
// It is exact only because the emitter (tools/modularize) keeps two invariants,
// which rts-modules.test.js asserts on the tree:
//   * every `import` is a single line of the form
//       import { a, b } from './x.js';     or     import './x.js';
//   * `export ` appears only as a prefix on a declaration (no lists, no default)
// and one invariant this file checks itself: no two modules declare the same
// top-level name (legal in ESM, but the concatenation would silently merge them).
//
//   const { source, order, files } = require('./lib/bundle-for-vm.js');
//   // or, for a tree elsewhere: require('./lib/bundle-for-vm.js').bundle('/path/to/rts/main.js')
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const IMPORT_RE = /^import (?:\{[^}]*\} from )?'(\.\.?\/[\w./-]+\.js)';$/;
const EXPORT_RE = /^export (?=(?:var|let|const|function|class)\b)/gm;

/**
 * Top-level declared names of a module body.
 *
 * Column 0 is NOT the test: a unit-art module is `export function drawRhino(C)
 * {` wrapping a body that is kept VERBATIM, i.e. still at column 0 inside the
 * function. Reading those as module-level declarations reported 112 name
 * collisions that do not exist (`f0` in harrier and dolphin, …). So track
 * brace depth across the file and only count a declaration that really sits at
 * depth 0, skipping strings, comments, regexes and template holes.
 */
function topLevelNames(body, file) {
  const names = [];
  const lines = body.split('\n');
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (depth === 0) {
      let m = /^(?:async )?function\*? +([A-Za-z_$][\w$]*)/.exec(s) || /^class +([A-Za-z_$][\w$]*)/.exec(s);
      if (m) names.push(m[1]);
      else if ((m = /^(?:var|let|const) +/.exec(s))) {
        let text = s.slice(m[0].length), k = i;
        while (!statementEnds(text) && k + 1 < lines.length) text += '\n' + lines[++k];
        for (const n of declaratorNames(text)) names.push(n);
      }
    }
    depth += braceDelta(s);
    if (depth < 0) throw new Error(`bundle-for-vm: unbalanced braces above line ${i + 1}` + (file ? ' of ' + file : ''));
  }
  return names;
}

/** Net `{` minus `}` on a line, ignoring strings, comments and regex literals. */
function braceDelta(line) {
  let d = 0, i = 0, prev = '';
  while (i < line.length) {
    const c = line[i], two = line.slice(i, i + 2);
    if (two === '//') break;
    if (two === '/*') { const j = line.indexOf('*/', i + 2); if (j < 0) break; i = j + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { i = skipString(line, i); prev = 'x'; continue; }
    if (c === '/' && /[=(,:[!&|?{};+\-*%<>~^]/.test(prev)) { i = skipRegex(line, i); prev = 'x'; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return d;
}
/** True once `text` holds a complete statement (a `;` at bracket depth 0 outside strings/comments). */
function statementEnds(text) { return scan(text).ended; }
function declaratorNames(text) { return scan(text).names; }
function scan(text) {
  const names = [];
  let depth = 0, i = 0, expectName = true, ended = false, prev = '';
  const isIdStart = (c) => /[A-Za-z_$]/.test(c);
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (two === '//') { const j = text.indexOf('\n', i); i = j < 0 ? text.length : j; continue; }
    if (two === '/*') { const j = text.indexOf('*/', i + 2); i = j < 0 ? text.length : j + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i); prev = 'x'; continue; }
    if (c === '/' && /[=(,:\[!&|?{};+\-*%<>~^]|^$/.test(prev.trim() ? prev.trim().slice(-1) : '')) { i = skipRegex(text, i); prev = 'x'; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === ';') { ended = true; break; }
    else if (depth === 0 && c === ',') { expectName = true; i++; prev = c; continue; }
    if (expectName && isIdStart(c)) {
      let j = i; while (j < text.length && /[\w$]/.test(text[j])) j++;
      names.push(text.slice(i, j)); expectName = false; i = j; prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { names, ended };
}
function skipString(t, i) {
  const q = t[i]; i++;
  while (i < t.length) {
    if (t[i] === '\\') { i += 2; continue; }
    if (q === '`' && t[i] === '$' && t[i + 1] === '{') { i = skipTemplateExpr(t, i + 2); continue; }
    if (t[i] === q) return i + 1;
    i++;
  }
  return i;
}
function skipTemplateExpr(t, i) {
  let d = 1;
  while (i < t.length && d) {
    if (t[i] === '"' || t[i] === "'" || t[i] === '`') { i = skipString(t, i); continue; }
    if (t[i] === '{') d++; else if (t[i] === '}') d--;
    i++;
  }
  return i;
}
function skipRegex(t, i) {
  i++; let cls = false;
  while (i < t.length) {
    if (t[i] === '\\') { i += 2; continue; }
    if (t[i] === '[') cls = true; else if (t[i] === ']') cls = false;
    else if (t[i] === '/' && !cls) { i++; while (/[a-z]/.test(t[i] || '')) i++; return i; }
    else if (t[i] === '\n') return i;
    i++;
  }
  return i;
}

/** Walk the graph from `entry`; returns { order, files, source }. */
function bundle(entry) {
  entry = path.resolve(entry);
  const root = path.dirname(entry);
  const seen = new Map();            // abs path -> { rel, body, imports }
  const order = [];
  function visit(abs, from) {
    if (seen.has(abs)) return;
    if (!fs.existsSync(abs)) throw new Error(`bundle-for-vm: ${from} imports ${abs}, which does not exist`);
    const rel = path.relative(root, abs);
    const text = fs.readFileSync(abs, 'utf8');
    const imports = [];
    const kept = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('import ')) {
        const m = IMPORT_RE.exec(line);
        if (!m) throw new Error(`bundle-for-vm: ${rel}: import is not in the canonical single-line form: ${line}`);
        imports.push(path.resolve(path.dirname(abs), m[1]));
        kept.push('');                                        // keep line numbers
      } else kept.push(line);
    }
    const body = kept.join('\n').replace(EXPORT_RE, '');
    if (/^export\b/m.test(body)) throw new Error(`bundle-for-vm: ${rel}: an export that is not a declaration prefix`);
    const rec = { rel, body, imports };
    seen.set(abs, rec);
    for (const dep of imports) visit(dep, rel);                // post-order = ESM evaluation order
    order.push(rec);
  }
  visit(entry, '(entry)');
  // no two modules may declare the same top-level name
  const owner = new Map();
  for (const rec of order) for (const n of topLevelNames(rec.body, rec.rel)) {
    if (owner.has(n)) throw new Error(`bundle-for-vm: top-level name "${n}" is declared in both ${owner.get(n)} and ${rec.rel}`);
    owner.set(n, rec.rel);
  }
  const source = "(function () {\n'use strict';\n" +
    order.map((r) => `// ===== ${r.rel} =====\n${r.body}`).join('\n') +
    '\n})();\n';
  return { source, order: order.map((r) => r.rel), files: order, names: owner };
}

const DEFAULT_ENTRY = path.join(__dirname, '..', '..', 'rts', 'main.js');
let cached = null;
module.exports = {
  bundle, topLevelNames,
  get source() { return (cached = cached || bundle(DEFAULT_ENTRY)).source; },
  get order() { return (cached = cached || bundle(DEFAULT_ENTRY)).order; },
  get files() { return (cached = cached || bundle(DEFAULT_ENTRY)).files; },
};
