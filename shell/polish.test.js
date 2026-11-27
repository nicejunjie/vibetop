const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Five visual fixes from the 2026-11-27 design review (Claude + Codex + Qwen
// Flash-Next, working from the same screenshots). Each one is a regression that
// is invisible to behaviour tests, so each is pinned at its source.
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const shell = read('shell/desktop.html');

test('the coach tip is a quiet capped pill, not a full-width blue bar', () => {
  const coach = read('shell/coach.js');
  assert.match(coach, /max-width:540px;margin:0 auto;/);
  assert.match(coach, /background:#1c2938;/);
  assert.doesNotMatch(coach, /background:#0a84ff/);
});

test('every app page sits on the shell background', () => {
  // Notes, Terminals, Config, Update and the Office editor were purple-navy
  // (#1a1a2e) against a #0e1117 shell, so switching apps shifted the hue.
  for (const p of ['apps/everyday/notes/notes.html', 'apps/everyday/terminal/terminals.html',
                   'apps/system/config/config.html', 'apps/system/update/update.html',
                   'apps/everyday/office/office-editor.html', 'apps/everyday/video/video.html',
                   'shell/desktop.html']) {
    assert.doesNotMatch(read(p), /#1a1a2e/i, p + ' still uses the old purple-navy');
  }
  assert.match(read('apps/everyday/notes/notes.html'), /body \{[^}]*background: #0e1117;/);
});

test('the Start menu dims what is behind it, harder on a phone, without blur', () => {
  const scrim = shell.match(/#menu-scrim \{[^}]*\}/g) || [];
  assert.equal(scrim.length, 2, 'base rule plus the phone rule');
  assert.match(scrim[0], /background: rgba\(6,9,14,0\.22\)/);
  assert.match(scrim[1], /background: rgba\(6,9,14,0\.62\)/);
  assert.doesNotMatch(scrim.join(''), /backdrop-filter/, 'the layer under it is live terminal frames');
});

test('Monitor keeps the load average and the CPU average apart', () => {
  const mon = read('apps/utilities/monitor/monitor.html');
  // Right floats sit in reverse source order: the gap goes on the RIGHT of the
  // second span. margin-left there produced "4.132.1% avg".
  assert.match(mon, /\.card-title \.avg \+ \.avg \{ margin-right: 16px; \}/);
  assert.doesNotMatch(mon, /id="load-avg" style="margin-left/);
  const txt = mon.match(/\.metric-bar-text \{[^}]*\}/);
  assert.ok(txt && /background: rgba\(13,17,23,0\.78\)/.test(txt[0]), 'bar labels carry their own backing');
});

test('on a phone only the app in front keeps its taskbar name, and stays in view', () => {
  const narrow = shell.match(/=== Narrow screens: scrollable taskbar[\s\S]*?\n  \}/);
  assert.ok(narrow);
  assert.match(narrow[0], /\.task-app:not\(\.active\) \.name \{ display: none; \}/);
  assert.equal((shell.match(/revealActiveTask\(\);/g) || []).length, 2, 'both render paths reveal the active button');
});
