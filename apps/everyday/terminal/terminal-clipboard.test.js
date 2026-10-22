'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('./terminal-clipboard.js');
const turn = () => new Promise(resolve => setImmediate(resolve));
const osc = s => 'c;' + Buffer.from(s, 'utf8').toString('base64');
function browser({ platform = 'MacIntel', writeText = () => Promise.reject(new Error('NotAllowedError')), selection = false } = {}) {
  const written = [], copied = [], keydown = [];
  let handler = null, tick = null, allowedDuringCopy = null;
  const body = { children: [], appendChild(e) { this.children.push(e); }, removeChild(e) { this.children.splice(this.children.indexOf(e), 1); } };
  const w = {
    navigator: { platform, clipboard: { writeText: s => { written.push(s); return writeText(s); } } },
    atob: s => { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('InvalidCharacterError'); return Buffer.from(s, 'base64').toString('latin1'); }, TextDecoder,
    document: {
      body, activeElement: null,
      createElement: () => ({ style: {}, select() { this.selected = true; } }),
      execCommand(cmd) { allowedDuringCopy = w.__allowCopy; const ta = body.children.at(-1); copied.push(ta.selected ? ta.value : null); return cmd === 'copy'; }
    },
    addEventListener: (type, fn, capture) => { if (type === 'keydown') keydown.push({ fn, capture }); },
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { tick = null; },
    term: { hasSelection: () => selection, parser: { registerOscHandler(id, fn) { assert.equal(id, 52); handler = fn; } } }
  };
  install(w); tick();
  function key(init) {
    const e = Object.assign({ key: 'c', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
      prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }, init);
    keydown.forEach(l => l.fn(e)); return e;
  }
  return { w, written, copied, keydown, key, osc: data => handler(data), get allowedDuringCopy() { return allowedDuringCopy; }, get tick() { return tick; } };
}

test('registers an OSC 52 handler once the terminal exists, with a capturing keydown', () => {
  const b = browser();
  assert.equal(b.tick, null, 'polling stops after registration');
  assert.equal(b.keydown.length, 1); assert.equal(b.keydown[0].capture, true);
});

test('an OSC 52 write reaches the clipboard as decoded UTF-8', async () => {
  const b = browser({ writeText: () => Promise.resolve() });
  assert.equal(b.osc(osc('héllo — 世界\n')), true);
  assert.deepEqual(b.written, ['héllo — 世界\n']);
  await turn();
  const e = b.key({});
  assert.equal(e.prevented, false, 'after a successful write Cmd+C is left alone');
  assert.deepEqual(b.copied, []);
});

test('when Safari refuses the write, Cmd+C with no selection copies it in the gesture', async () => {
  const b = browser();
  b.osc(osc('copied in Claude')); await turn();
  const e = b.key({});
  assert.deepEqual(b.copied, ['copied in Claude']);
  assert.equal(b.allowedDuringCopy, true); assert.equal(b.w.__allowCopy, false);
  assert.equal(e.prevented, true); assert.equal(e.stopped, true);
  assert.equal(b.w.document.body.children.length, 0, 'the temporary textarea is removed');
});

test('an xterm selection keeps priority over the app-copied text', async () => {
  const b = browser({ selection: true });
  b.osc(osc('app text')); await turn();
  const e = b.key({});
  assert.deepEqual(b.copied, []); assert.equal(e.prevented, false);
});

test('other keys, modifiers and non-Mac platforms are never intercepted', async () => {
  const b = browser();
  b.osc(osc('x')); await turn();
  for (const init of [{ key: 'v' }, { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: false }])
    assert.equal(b.key(init).prevented, false);
  const linux = browser({ platform: 'Linux x86_64' });
  linux.osc(osc('x')); await turn();
  assert.equal(linux.key({ metaKey: false, ctrlKey: true }).prevented, false, 'Ctrl+C stays SIGINT');
  assert.deepEqual(linux.copied, []);
});

test('clipboard reads, empty, malformed and oversized writes are ignored', () => {
  const b = browser();
  for (const data of ['c;?', 'c;', 'nopayload', 'c;***not base64***', 'c;' + 'A'.repeat(1024 * 1024 + 4)])
    assert.equal(b.osc(data), true);
  assert.deepEqual(b.written, []);
  assert.equal(b.key({}).prevented, false);
});

test('the installer deploys the module and injects it into every terminal page', () => {
  const fs = require('node:fs'), path = require('node:path');
  const installer = fs.readFileSync(path.join(__dirname, '../../../server/install.sh'), 'utf8');
  assert.match(installer, /CLIP_VER=\$\(md5sum "\$TERM_APP_DIR\/terminal-clipboard\.js"/);
  assert.match(installer, /\/terminal-clipboard\.js\?v=\$\{CLIP_VER\}/);
  assert.match(installer, /"\$TERM_APP_DIR\/terminal-clipboard\.js" "\$LANDING_DIR\/terminal-clipboard\.js"/);
});
