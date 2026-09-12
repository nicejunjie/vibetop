// Iron Frontier — the game's files as ONE script, for node's `vm`.
//
// The game is 117 plain classic scripts listed in load order in `rts.html`.
// A browser runs them in that order and they share one global scope, which is
// what lets `combat.js` call `sfx()` from `ui/audio.js` with no ceremony — and
// what lets the page be opened by double-clicking it, with no server and no
// build (ES modules cannot: a `file://` page has no origin, so the browser
// refuses to load them).
//
// Node's test harness needs the same program as a single string it can boot in
// an isolated `vm` context — and boot it SEVERAL times in one process (the
// two-tab lobby tests) — so this reads the order out of `rts.html`, reads those
// files, and concatenates them inside one strict IIFE.
//
// `rts.html` is the single source of truth for load order. Nothing here parses
// JavaScript to find it: there is no import graph any more.
//
//   const { source, order, files } = require('./lib/bundle-for-vm.js');
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RTS = path.join(__dirname, '..', '..');
const SCRIPT_TAG = /<script src="(rts\/[^"]+\.js)"><\/script>/g;

// Strip JS comments, honouring strings, template holes and regex literals.
//
// The naive two-regex stripper the source-scanning tests used to carry is not
// safe on this program: a block-comment opener that lives inside a line comment
// or a string swallows everything up to the next closer anywhere in the file.
// It was quietly eating a third of it, which is how a test that "passes" can be
// scanning half of what it claims to.
function stripComments(text) {
  let out = '', i = 0, prev = '';
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (two === '//') { const j = text.indexOf('\n', i); i = j < 0 ? text.length : j; continue; }
    if (two === '/*') { const j = text.indexOf('*/', i + 2); i = j < 0 ? text.length : j + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { const j = skipString(text, i); out += text.slice(i, j); i = j; prev = 'x'; continue; }
    if (c === '/' && /[=(,:[!&|?{};+\-*%<>~^]/.test(prev)) { const j = skipRegex(text, i); out += text.slice(i, j); i = j; prev = 'x'; continue; }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** The `rts/…` script sources listed in a page, in load order. */
function loadOrder(page) {
  const html = fs.readFileSync(page || path.join(RTS, 'rts.html'), 'utf8');
  const order = [...html.matchAll(SCRIPT_TAG)].map((m) => m[1]);
  if (!order.length) throw new Error('bundle-for-vm: the page lists no rts/ scripts');
  return order;
}

/** { source, order, files } for the page's scripts, concatenated in load order. */
function bundle(page) {
  const root = page ? path.dirname(path.resolve(page)) : RTS;
  const order = loadOrder(page);
  const seen = new Set();
  const files = order.map((rel) => {
    if (seen.has(rel)) throw new Error(`bundle-for-vm: ${rel} is listed twice`);
    seen.add(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) throw new Error(`bundle-for-vm: the page lists ${rel}, which does not exist`);
    return { rel, body: fs.readFileSync(abs, 'utf8') };
  });
  const source = "(function () {\n'use strict';\n" +
    files.map((f) => `// ===== ${f.rel} =====\n${f.body}`).join('\n') +
    '\n})();\n';
  return { source, order, files };
}

// ---- the small scanner the load-order gate and the source tests share ----- //

/** Top-level declared names of a classic script (declarations at brace depth 0). */
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

/**
 * Every load-time statement that would call a function declared in a LATER
 * file. Classic scripts hoist per file, not across files, so this is the one
 * ordering rule the game has to keep, and the only thing a browser reports as
 * a bare ReferenceError on boot.
 *
 * A call inside a function body (an event handler, a helper) is fine and is not
 * reported: only the part of a line that actually runs while the page loads is
 * scanned, which is why the scan stops at the first `function` keyword.
 */
function forwardCalls(page) {
  const b = bundle(page);
  const declAt = new Map();
  b.files.forEach((f, i) => {
    for (const n of topLevelNames(f.body, f.rel)) if (!declAt.has(n)) declAt.set(n, { i, rel: f.rel });
  });
  const out = [];
  b.files.forEach((f, i) => {
    let depth = 0;
    stripComments(f.body).split('\n').forEach((ln, k) => {
      if (depth === 0 && /^[^ \t}]/.test(ln)) {
        const cut = ln.search(/\bfunction\b/);
        const head = cut < 0 ? ln : ln.slice(0, cut);
        for (const m of head.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
          const o = declAt.get(m[1]);
          if (o && o.i > i) out.push(`${f.rel}:${k + 1} calls ${m[1]}() at load time, but it is declared later, in ${o.rel}`);
        }
      }
      depth += braceDelta(ln);
    });
  });
  return [...new Set(out)];
}

let cached = null;
module.exports = {
  bundle, loadOrder, topLevelNames, stripComments, forwardCalls, braceDelta,
  get source() { return (cached = cached || bundle()).source; },
  get order() { return (cached = cached || bundle()).order; },
  get files() { return (cached = cached || bundle()).files; },
};
