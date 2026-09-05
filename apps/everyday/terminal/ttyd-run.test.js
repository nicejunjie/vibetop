// The terminal renderer is a correctness setting, not a preference.
//
// ttyd's bundled xterm.js defaults to rendererType "webgl". Its context-loss
// handler disposes the WebGL addon WITHOUT clearing its own reference and
// WITHOUT loading a fallback renderer (unlike the internal disposer, which does
// both). So once the GL context is lost — resizing a floating Terminal window
// was enough to do it — there is no renderer left, and no path back short of a
// full reload. The terminal goes blank while the PTY, the scrollback and the
// WebSocket are all still perfectly alive; switching tabs makes the text flash
// and vanish again, because something paints one frame and nothing sustains it.
//
// Reverting to the default would bring the whole failure class back silently,
// so pin it here.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'ttyd-run.sh');
const src = fs.readFileSync(SCRIPT, 'utf8');

test('ttyd is launched with the canvas renderer, never WebGL', () => {
  assert.match(src, /-t\s+rendererType=canvas/,
    'ttyd-run.sh must pass `-t rendererType=canvas`; without it ttyd defaults to ' +
    'the WebGL renderer, which blanks the terminal for good on GL context loss.');
  assert.doesNotMatch(src, /-t\s+rendererType=webgl/,
    'the WebGL renderer must not be selected explicitly either.');
});

test('the renderer flag reaches the real ttyd exec, not just a comment', () => {
  // Strip comment lines so a mention in the rationale above the exec cannot
  // satisfy the assertion on its own.
  const code = src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(code, /-t\s+rendererType=canvas/,
    'the flag must appear in executable code, not only in a comment');
  const execIdx = code.indexOf('exec "$TTYD"');
  assert.ok(execIdx !== -1, 'expected an `exec "$TTYD"` invocation');
  assert.ok(code.indexOf('-t rendererType=canvas') > execIdx,
    'the flag must be part of the ttyd exec argument list');
});
