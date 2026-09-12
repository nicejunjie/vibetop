#!/usr/bin/env node
// Iron Frontier — one file per unit's art, spliced VERBATIM into rts.html.
//
// Every unit's drawing code is a branch inside one of four bake functions
// (`bakeInfantry`, `bakeVehicle`'s `frame()`, `bakeShip`'s `frame()`,
// `bakeBuilding`) and leans on dozens of that function's locals — the canvas,
// the anchor, the shared helpers (`legs()`, `chassis()`, `apron()`…), the
// house colour. It cannot be a real module without threading all of that
// through by hand, and 13k lines of art is not a thing to re-plumb blind. So
// the split is TEXTUAL: `art/units/<class>/<kind>.js` holds the body of the
// branch, de-indented, and rts.html carries the same lines between a marker
// pair —
//
//         // @@ART vehicles/rhino
//         ...the branch body, unchanged...
//         // @@END vehicles/rhino
//
// The unit file is the one you EDIT; rts.html is the one that RUNS (and what
// every tool, test and deploy path loads — nothing else changed). This script
// keeps the two identical, in either direction:
//
//     node apps/games/rts/tools/art-split.js inject    # unit files -> rts.html
//     node apps/games/rts/tools/art-split.js extract   # rts.html   -> unit files
//     node apps/games/rts/tools/art-split.js check     # exit 1 + a per-unit report if they differ
//
// `rts-split.test.js` runs `check`, so a commit cannot carry a unit file that
// says one thing and an rts.html that draws another. A unit with several
// regions (the Kirov's own sheet in `bakeVehicle` vs. its aircraft body) is one
// file with several `// @@PART <name>` sections; the rts.html marker names the
// part as `// @@ART aircraft/kirov#sheet`, and an unnamed marker is `#main`.
//
// Also exported for the test: { parse, inject, extract, check }.
'use strict';
const fs = require('fs');
const path = require('path');

const RTS = path.join(__dirname, '..');
const HTML = path.join(RTS, 'rts.html');
const UNITS = path.join(RTS, 'art', 'units');
const ART_RE = /^( *)\/\/ @@ART ([a-z]+\/[a-z0-9-]+)(?:#([a-z0-9-]+))?\s*$/;
const END_RE = /^( *)\/\/ @@END ([a-z]+\/[a-z0-9-]+)(?:#([a-z0-9-]+))?\s*$/;
const PART_RE = /^\/\/ @@PART ([a-z0-9-]+)\b.*$/;

/** The enclosing `function name(` for a line, walking back to a 2-space-indented one. */
function enclosing(lines, i) {
  for (let k = i; k >= 0; k--) {
    const m = /^  function (\w+)\(/.exec(lines[k]);
    if (m) return m[1];
  }
  return '?';
}

/**
 * Every marked region of rts.html, in file order:
 * { unit, part, indent, open, close, body } where open/close are the marker
 * line indices and body the de-indented lines between them.
 */
function parse(html) {
  const lines = html.split('\n');
  const regions = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const a = ART_RE.exec(lines[i]), e = END_RE.exec(lines[i]);
    if (a) {
      if (cur) throw new Error(`rts.html:${i + 1}: @@ART ${a[2]} opened inside ${cur.unit}#${cur.part} (line ${cur.open + 1})`);
      cur = { unit: a[2], part: a[3] || 'main', indent: a[1].length, open: i, func: enclosing(lines, i) };
    } else if (e) {
      if (!cur) throw new Error(`rts.html:${i + 1}: @@END ${e[2]} with no open region`);
      const id = e[2] + '#' + (e[3] || 'main');
      if (id !== cur.unit + '#' + cur.part) throw new Error(`rts.html:${i + 1}: @@END ${id} closes ${cur.unit}#${cur.part}`);
      cur.close = i;
      const pad = ' '.repeat(cur.indent);
      cur.body = lines.slice(cur.open + 1, i).map((s, k) => {
        if (!s.trim()) return '';
        if (!s.startsWith(pad)) throw new Error(`rts.html:${cur.open + 2 + k}: line inside ${id} is indented less than its marker`);
        return s.slice(cur.indent);
      });
      regions.push(cur); cur = null;
    }
  }
  if (cur) throw new Error(`rts.html: @@ART ${cur.unit}#${cur.part} (line ${cur.open + 1}) is never closed`);
  const seen = new Set();
  for (const r of regions) {
    const id = r.unit + '#' + r.part;
    if (seen.has(id)) throw new Error(`rts.html: ${id} is marked twice`);
    seen.add(id);
  }
  return { lines, regions };
}

function unitPath(unit) { return path.join(UNITS, unit + '.js'); }

/** Render one unit file from its regions (in rts.html order). */
function render(unit, regions) {
  const rel = 'apps/games/rts/tools/art-split.js';
  const out = [
    `// Iron Frontier unit art — ${unit}`,
    `// Spliced VERBATIM into apps/games/rts/rts.html between \`// @@ART ${unit}\` and`,
    `// \`// @@END ${unit}\` (one pair per @@PART below). Edit HERE, then`,
    `//     node ${rel} inject`,
    `// — or edit rts.html and \`extract\`; rts-split.test.js fails while they differ.`,
    `// Every free identifier (the canvas \`g\`, the anchor, the helpers, \`col\`, \`sov\`…)`,
    `// is a local of the enclosing bake function: see apps/games/rts/art/units/README.md.`,
    '',
  ];
  for (const r of regions) {
    out.push(`// @@PART ${r.part} — inside ${r.func}() in rts.html`);
    out.push(...r.body);
  }
  return out.join('\n') + '\n';
}

/** Parts of a unit file: { name: bodyLines }. Everything before the first @@PART is header. */
function parseUnit(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  const parts = {};
  let name = null;
  for (const s of lines) {
    const m = PART_RE.exec(s);
    if (m) { name = m[1]; parts[name] = []; continue; }
    if (name) parts[name].push(s);
  }
  return parts;
}

/** Group regions by unit, preserving order. */
function byUnit(regions) {
  const m = new Map();
  for (const r of regions) { if (!m.has(r.unit)) m.set(r.unit, []); m.get(r.unit).push(r); }
  return m;
}

/** rts.html text with every region's body replaced from the unit files. */
function inject(html, readUnit) {
  const { lines, regions } = parse(html);
  const out = lines.slice();
  const missing = [];
  // bottom-up so earlier indices stay valid
  for (const r of regions.slice().reverse()) {
    const text = readUnit(r.unit);
    if (text == null) { missing.push(r.unit); continue; }
    const parts = parseUnit(text);
    if (!parts[r.part]) { missing.push(`${r.unit}#${r.part}`); continue; }
    const pad = ' '.repeat(r.indent);
    const body = parts[r.part].map((s) => (s.trim() ? pad + s : ''));
    out.splice(r.open + 1, r.close - r.open - 1, ...body);
  }
  if (missing.length) throw new Error('no unit file / part for: ' + missing.join(', '));
  return out.join('\n');
}

/** { unit: fileText } for every unit marked in rts.html. */
function extract(html) {
  const { regions } = parse(html);
  const files = {};
  for (const [unit, rs] of byUnit(regions)) files[unit] = render(unit, rs);
  return files;
}

/** Syntax-check a body the way the browser will see it: a strict function body. */
function syntaxErrors(files) {
  const errs = [];
  for (const unit of Object.keys(files)) {
    const parts = parseUnit(files[unit]);
    for (const p of Object.keys(parts)) {
      try { new Function('"use strict";\n' + parts[p].join('\n')); }
      catch (e) { errs.push(`${unit}#${p}: ${e.message}`); }
    }
  }
  return errs;
}

function readUnitFromDisk(unit) {
  const p = unitPath(unit);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * Compare rts.html with the unit files. Returns { ok, report, stale }:
 * stale lists each unit whose two copies differ and which side is newer.
 */
function check(html, readUnit, mtimeOf) {
  html = html == null ? fs.readFileSync(HTML, 'utf8') : html;
  readUnit = readUnit || readUnitFromDisk;
  mtimeOf = mtimeOf || ((p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0));
  const want = extract(html);                 // what the unit files SHOULD say, per rts.html
  const stale = [];
  const htmlM = mtimeOf(HTML);
  for (const unit of Object.keys(want)) {
    const have = readUnit(unit);
    if (have == null) { stale.push({ unit, why: 'unit file missing', fix: 'extract' }); continue; }
    if (parseUnitBodies(have) !== parseUnitBodies(want[unit])) {
      const newer = mtimeOf(unitPath(unit)) > htmlM ? 'unit file' : 'rts.html';
      stale.push({ unit, why: `differs (${newer} is newer)`, fix: newer === 'unit file' ? 'inject' : 'extract' });
    }
  }
  const lines = [];
  if (stale.length) {
    lines.push(`art-split: ${stale.length} unit(s) out of sync between rts.html and art/units/:`);
    for (const s of stale) lines.push(`  ${s.unit.padEnd(26)} ${s.why}  ->  node apps/games/rts/tools/art-split.js ${s.fix}`);
    lines.push('One direction per unit: `inject` copies the unit file INTO rts.html, `extract` copies rts.html OUT.');
    lines.push('If both sides were edited, diff them and settle the file by hand, then run either.');
  }
  return { ok: !stale.length, report: lines.join('\n'), stale, units: Object.keys(want).length };
}
/** The comparable content of a unit file: its parts, not its regenerated header. */
function parseUnitBodies(text) {
  const p = parseUnit(text);
  return Object.keys(p).map((k) => k + '\n' + p[k].join('\n')).join('\n\x00');
}

function main(argv) {
  const cmd = argv[0];
  const html = fs.readFileSync(HTML, 'utf8');
  if (cmd === 'extract') {
    const files = extract(html);
    let n = 0;
    for (const unit of Object.keys(files)) {
      const p = unitPath(unit);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== files[unit]) { fs.writeFileSync(p, files[unit]); n++; }
    }
    console.log(`art-split: ${Object.keys(files).length} units, ${n} file(s) written under art/units/`);
    return 0;
  }
  if (cmd === 'inject') {
    const errs = syntaxErrors(Object.fromEntries(Object.keys(extract(html)).map((u) => [u, readUnitFromDisk(u) || ''])));
    if (errs.length) { console.error('art-split: refusing to inject — syntax error in a unit file:\n  ' + errs.join('\n  ')); return 1; }
    const out = inject(html, readUnitFromDisk);
    if (out === html) { console.log('art-split: rts.html already matches art/units/'); return 0; }
    fs.writeFileSync(HTML, out);
    // the headers/part locators may have moved; keep the files' own copy exact too
    const files = extract(out);
    for (const unit of Object.keys(files)) if (readUnitFromDisk(unit) !== files[unit]) fs.writeFileSync(unitPath(unit), files[unit]);
    console.log('art-split: rts.html updated from art/units/');
    return 0;
  }
  if (cmd === 'check' || cmd === undefined) {
    const r = check(html);
    if (r.ok) { console.log(`art-split: rts.html and art/units/ agree (${r.units} units)`); return 0; }
    console.error(r.report);
    return 1;
  }
  console.error('usage: art-split.js check|inject|extract');
  return 2;
}

module.exports = { parse, parseUnit, render, inject, extract, check, syntaxErrors, HTML, UNITS, unitPath };
if (require.main === module) process.exit(main(process.argv.slice(2)));
