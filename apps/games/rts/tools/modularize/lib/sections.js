'use strict';
// Cutting the IIFE body into sections.
//
// A section is anchored by the exact TEXT of the first top-level statement
// line it starts with (sections.json), never by a line number. Every
// top-level statement belongs to the LAST section whose anchor line is at or
// above it; the comment and blank lines between the previous statement and
// this one travel with this one, so a section boundary never orphans the
// banner comment that introduces it.

const fs = require('node:fs');
const path = require('node:path');
const { die } = require('./source');

function loadSections(file = path.join(__dirname, '..', 'sections.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Every top-level statement, with the text chunk that belongs to it.
//
// Statements that share a line (`wireCmdTips(cmdbar); wireCmdTips(sbtools);`)
// become ONE chunk: a chunk is always whole lines, so a boundary can never cut
// a line in half.
function chunkStatements(src) {
  const lines = src.scriptText.split('\n');
  const lineStart = (n) => src.li.startOf(n);                 // 1-based
  const info = src.body.map((node) => ({
    node, startLine: src.li.lineOf(node.start), endLine: src.li.lineOf(node.end - 1),
  }));
  // group statements that share a line
  const groups = [];
  for (let i = 0; i < info.length; i++) {
    const g = [info[i]];
    while (i + 1 < info.length && info[i + 1].startLine <= g[g.length - 1].endLine) { g.push(info[++i]); }
    groups.push(g);
  }

  const stmts = [];
  const bodyOfGroup = [];
  let prevEndLine = src.li.lineOf(src.iife.body.start);       // the `{` line
  let bi = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const first = g[0], last = g[g.length - 1];
    const col = first.node.start - lineStart(first.startLine);
    if (col !== 2) {
      die(`rts.src.html:${src.fileLine(first.startLine)}: top-level statement starts at column ${col}, expected 2 — the de-indent rule needs every top-level statement at 2 spaces`);
    }
    const tail = lines[last.endLine - 1].slice(last.node.end - lineStart(last.endLine)).trim();
    const tailOk = tail === '' || tail.startsWith('//') || (tail.startsWith('/*') && tail.endsWith('*/'));
    if (!tailOk) {
      die(`rts.src.html:${src.fileLine(last.endLine)}: top-level statement is followed by code on the same line (${JSON.stringify(tail)})`);
    }
    const firstLine = prevEndLine + 1;
    const chunkStart = lineStart(firstLine);
    const chunkEnd = last.endLine < lines.length ? lineStart(last.endLine + 1) : src.scriptText.length;
    const names = [];
    for (const s of g) for (const n of declaredNames(s.node)) names.push(n);
    const bodyIndices = g.map(() => bi++);
    for (const b of bodyIndices) bodyOfGroup[b] = gi;
    stmts.push({
      index: gi, node: first.node, nodes: g.map((s) => s.node), bodyIndices,
      startLine: first.startLine, endLine: last.endLine, firstLine,
      fileLine: src.fileLine(first.startLine),
      chunkStart, chunkEnd,
      text: src.scriptText.slice(chunkStart, chunkEnd),
      stmtLineInChunk: first.startLine - firstLine,
      names,
      executes: g.some((s) => s.node.type !== 'FunctionDeclaration'),
    });
    prevEndLine = last.endLine;
  }
  stmts.bodyOfGroup = bodyOfGroup;
  return stmts;
}

function declaredNames(node) {
  const { patternTargets } = require('./scope');
  if (node.type === 'FunctionDeclaration') return node.id ? [node.id.name] : [];
  if (node.type === 'ClassDeclaration') return node.id ? [node.id.name] : [];
  if (node.type === 'VariableDeclaration') {
    const out = [];
    for (const d of node.declarations) for (const id of patternTargets(d.id, [])) out.push(id.name);
    return out;
  }
  return [];
}

// Resolve every anchor to exactly one line of the inline script.
function resolveAnchors(src, cfg) {
  const lines = src.scriptText.split('\n');
  const anchors = [];
  const problems = [];
  for (const sec of cfg.sections) {
    for (const a of sec.anchors) {
      const hits = [];
      for (let i = 0; i < lines.length; i++) if (lines[i].startsWith(a)) hits.push(i + 1);
      if (hits.length !== 1) {
        problems.push(`sections.json: anchor for ${sec.file} matched ${hits.length} lines (want exactly 1): ${JSON.stringify(a)}` +
          (hits.length ? ` -> lines ${hits.map((h) => src.fileLine(h)).join(', ')}` : ''));
        continue;
      }
      anchors.push({ file: sec.file, anchor: a, line: hits[0], fileLine: src.fileLine(hits[0]) });
    }
  }
  anchors.sort((a, b) => a.line - b.line);
  return { anchors, problems };
}

function buildSections(src, cfg) {
  const stmts = chunkStatements(src);
  const { anchors, problems } = resolveAnchors(src, cfg);
  const order = [];
  for (const sec of cfg.sections) order.push(sec.file);

  const byFile = new Map();
  for (const f of order) byFile.set(f, { file: f, statements: [], moved: [] });

  let ai = -1;
  for (const st of stmts) {
    while (ai + 1 < anchors.length && anchors[ai + 1].line <= st.startLine) ai++;
    // the `'use strict'` directive and the file banner sit above the first
    // anchor; they belong to the first section
    st.section = ai < 0 ? anchors[0].file : anchors[ai].file;
    byFile.get(st.section).statements.push(st);
  }

  // `moves`: re-home a single declaration by name
  const moves = cfg.moves || {};
  const movedNotes = [];
  for (const [name, target] of Object.entries(moves)) {
    const hits = stmts.filter((s) => s.names.includes(name));
    if (hits.length !== 1) die(`sections.json moves: ${name} is declared by ${hits.length} top-level statements (want 1)`);
    const st = hits[0];
    if (!byFile.has(target)) die(`sections.json moves: ${name} -> ${target}: no such section`);
    if (st.section === target) { movedNotes.push(`${name}: already in ${target}`); continue; }
    const from = byFile.get(st.section);
    from.statements = from.statements.filter((s) => s !== st);
    st.movedFrom = st.section;
    st.section = target;
    byFile.get(target).moved.push(st);
    movedNotes.push(`${name}: ${st.movedFrom} -> ${target} (rts.src.html:${st.fileLine})`);
  }

  const sections = order.map((f) => {
    const s = byFile.get(f);
    return { file: f, statements: s.statements, moved: s.moved, all: s.statements.concat(s.moved) };
  });
  return { stmts, anchors, problems, sections, order, movedNotes };
}

module.exports = { loadSections, chunkStatements, resolveAnchors, buildSections, declaredNames };
