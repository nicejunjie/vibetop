'use strict';
// Reading the subject: rts.src.html's one inline script, the 69 unit-art
// files, and the `// @@include` lines that tie them together.

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const RTS = path.resolve(__dirname, '..', '..', '..');       // apps/games/rts
const SRC = path.join(RTS, 'rts.src.html');
const UNITS_DIR = path.join(RTS, 'art', 'units');
const INCLUDE_RE = /^( *)\/\/ @@include (\S+)\s*$/;

function die(msg) {
  const e = new Error(msg);
  e.loud = true;
  throw e;
}

// offset -> 1-based line
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return {
    starts,
    lineOf(off) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
      return lo + 1;
    },
    startOf(line) { return starts[line - 1]; },
    endOf(line) { return line < starts.length ? starts[line] : text.length; },
  };
}

function loadSource(srcPath = SRC, htmlOverride = null) {
  const html = htmlOverride === null ? fs.readFileSync(srcPath, 'utf8') : htmlOverride;
  const open = html.indexOf('<script>\n');
  if (open < 0) die(`${srcPath}: no bare <script> tag`);
  const scriptStart = open + '<script>'.length;                // the \n belongs to the script text
  const close = html.indexOf('</script>', scriptStart);
  if (close < 0) die(`${srcPath}: unterminated inline <script>`);
  const scriptText = html.slice(scriptStart, close);
  // the file line that script-relative line 1 sits on
  let nl = 0;
  for (let i = 0; i < scriptStart; i++) if (html[i] === '\n') nl++;
  const fileLineOffset = nl;                                   // fileLine = scriptLine + fileLineOffset

  const ast = acorn.parse(scriptText, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') {
    die(`${srcPath}: the inline script is not a single expression statement (found ${ast.body.length} statements)`);
  }
  const call = ast.body[0].expression;
  if (call.type !== 'CallExpression' || !/Function(Expression|Declaration)/.test(call.callee.type)) {
    die(`${srcPath}: the inline script is not an IIFE`);
  }
  const iife = call.callee;
  const body = iife.body.body;

  const li = lineIndex(scriptText);
  return {
    path: srcPath, html, scriptStart, scriptEnd: close, scriptText, fileLineOffset,
    ast, iife, body, li,
    fileLine: (scriptLine) => scriptLine + fileLineOffset,
    lineOfOffset: (off) => li.lineOf(off) + fileLineOffset,
    where: (off) => `rts.src.html:${li.lineOf(off) + fileLineOffset}`,
  };
}

// every `// @@include <rel>` line in the inline script, in source order
function findIncludes(src) {
  const lines = src.scriptText.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = INCLUDE_RE.exec(lines[i]);
    if (!m) continue;
    const scriptLine = i + 1;
    out.push({
      rel: m[2], indent: m[1], scriptLine, fileLine: src.fileLine(scriptLine),
      start: src.li.startOf(scriptLine), end: src.li.endOf(scriptLine),  // end includes the \n
      text: lines[i],
    });
  }
  return out;
}

function listUnitFiles(dir = UNITS_DIR) {
  const out = [];
  for (const cls of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, cls);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.js')) out.push(`art/units/${cls}/${f}`);
  }
  return out;
}

function readUnit(rel, root = RTS) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) die(`${rel}: no such unit file`);
  let text = fs.readFileSync(p, 'utf8');
  if (text.endsWith('\n')) text = text.slice(0, -1);          // rts-build.py drops the final newline
  return text;
}

// PascalCase export name: vehicles/rhino -> drawRhino, infantry/flak-trooper -> drawFlakTrooper
function pascal(kind) {
  return kind.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}
function unitKind(rel) { return path.basename(rel, '.js'); }
function unitClass(rel) { return path.basename(path.dirname(rel)); }
function drawName(rel) { return 'draw' + pascal(unitKind(rel)); }
// the monolith already has a `drawPower()` (the HUD's power bar), so the
// structure's art cannot be called that: fall back to the class-qualified name
const CLASS_SINGULAR = { infantry: 'Infantry', vehicles: 'Vehicle', aircraft: 'Aircraft', ships: 'Ship', structures: 'Structure' };
function drawNameFor(rel, taken) {
  const plain = drawName(rel);
  if (!taken(plain)) return plain;
  const q = 'draw' + (CLASS_SINGULAR[unitClass(rel)] || pascal(unitClass(rel))) + pascal(unitKind(rel));
  if (!taken(q)) return q;
  const a = q + 'Art';
  if (!taken(a)) return a;
  die(`${rel}: cannot pick an export name — ${plain}, ${q} and ${a} are all taken`);
  return null;
}

module.exports = {
  RTS, SRC, UNITS_DIR, INCLUDE_RE,
  die, lineIndex, loadSource, findIncludes, listUnitFiles, readUnit,
  pascal, unitKind, unitClass, drawName, drawNameFor,
};
