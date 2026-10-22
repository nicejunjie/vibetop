/* Tests for terminal-kbd.js — the mobile keyboard/dictation overlay injected
 * into every /tN/ page. The whole file is a touch/xterm/DOM IIFE, so rather than
 * execute it we regex-extract the one pure, safety-critical literal — the
 * KBD_KEY_BYTES map that the system key bar (esc/tab/^C/arrows) forwards to the
 * PTY — and pin its bytes (sw.test.js's extract-the-literal approach).
 *
 *   node --test terminal/
 *
 * These bytes are load-bearing: Enter MUST be CR (a TUI like Claude Code needs
 * \r, not \n), the horizontal trackpad slide sends Ctrl+F/Ctrl+B (cursor move,
 * NOT arrows), and a wrong control byte silently breaks the on-screen keys.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "terminal-kbd.js"), "utf8");

function extractKeyBytes() {
  const m = SRC.match(/var KBD_KEY_BYTES\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(m, "could not find KBD_KEY_BYTES map in terminal-kbd.js");
  // eslint-disable-next-line no-eval
  return vm.runInNewContext("(" + m[1] + ")");
}

test("system-key bar maps to the correct control bytes", () => {
  const b = extractKeyBytes();
  assert.equal(b.Escape, "\x1b");
  assert.equal(b.Tab, "\x09");
  assert.equal(b.CtrlC, "\x03");
  assert.equal(b.Enter, "\r", "Enter must be CR (\\r) for TUIs, not \\n");
  assert.equal(b.Backspace, "\x7f");
});

test("arrow keys send CSI cursor sequences", () => {
  const b = extractKeyBytes();
  assert.equal(b.ArrowUp, "\x1b[A");
  assert.equal(b.ArrowDown, "\x1b[B");
  assert.equal(b.ArrowRight, "\x1b[C");
  assert.equal(b.ArrowLeft, "\x1b[D");
});

test("horizontal trackpad slide sends emacs char-move, not arrows", () => {
  const b = extractKeyBytes();
  // Ctrl+F / Ctrl+B move the text cursor (harmless when nothing to move);
  // arrows would drive a TUI's menu/history instead — the documented reason.
  assert.equal(b.CtrlF, "\x06");
  assert.equal(b.CtrlB, "\x02");
});

test("tab activation tells xterm to reveal the latest output", () => {
  assert.match(SRC, /type === 'vibetop-show-latest'/);
  assert.match(SRC, /window\.term\.scrollToBottom\(\)/);
  assert.match(SRC, /followLatestUntil = Date\.now\(\) \+ 10000/);
  assert.match(SRC, /followLatestTimer = setInterval\(function \(\)/,
    'resize settling must continuously follow the bottom, not rely on fixed delays');
  assert.match(SRC, /requestAnimationFrame\(revealLatest\)/,
    "ring-buffer replay must keep following the bottom while activation is armed");
  const sharedHandler = SRC.indexOf("type === 'vibetop-show-latest'");
  const desktopReturn = SRC.indexOf('if (!isTouch) {');
  assert.ok(sharedHandler >= 0 && sharedHandler < desktopReturn,
    'show-latest listener must be registered before the desktop early return');
});

test("manual history navigation cancels activation's bottom-follow settle window", () => {
  assert.match(SRC, /function cancelLatest\(\) \{[\s\S]*?clearInterval\(followLatestTimer\)/);
  assert.match(SRC, /addEventListener\('wheel', cancelLatest/,
    'mouse-wheel scrollback must immediately stop bottom-following');
  assert.match(SRC, /while \(acc > 18\) \{ cancelLatest\(\); scrollGesture\(t, -1, c\.clientX, y\)/,
    'touch scrollback must immediately stop bottom-following');
  assert.match(SRC, /requestId <= cancelledLatestThrough\) return/,
    'late retries from any already-started activation must not re-arm after a user scroll');
});

test("terminal wrapper follows the live bottom after resize reflow", () => {
  const wrapper = fs.readFileSync(path.join(__dirname, 'terminals.html'), 'utf8');
  assert.match(wrapper, /wasAtLatest = \(b\.baseY - b\.viewportY\) <= 1/);
  assert.match(wrapper, /if \(wasAtLatest\) showLatest\(active\);/,
    'resize must preserve deliberate scrollback and only restore a previously live viewport');
  assert.doesNotMatch(wrapper, /resizeLatestTimer/,
    'resize must not create a fresh reveal request after the user has had time to scroll');
});

test("the terminal's own resize paths follow the live bottom", () => {
  assert.match(SRC, /function claimSize\(\) \{[\s\S]*?if \(atLatest\(\)\) armLatest\(\);[\s\S]*?var c = t\.cols/,
    'two-finger and double-click resize should follow only a live viewport');
  assert.doesNotMatch(SRC, /t\.onResize\(function \(\) \{\s*armLatest\(\);/,
    'a late resize event must not yank an already-scrolled viewport to the bottom');
});

function interactionHarness() {
  let now = 5000;
  const listeners = {}, sent = [], input = [];
  const term = { rows: 69, cols: 257, element: { clientWidth: 1800 },
    buffer: { active: { type: 'normal', baseY: 0, viewportY: 0 } }, input(s) { input.push(s); }, onScroll() {}, scrollToBottom() {} };
  class Socket {
    constructor() { this.readyState = 1; }
    addEventListener() {}
    removeEventListener() {}
    send(bytes) { sent.push(new TextDecoder().decode(bytes)); }
  }
  Object.assign(Socket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  const document = { hidden: false, querySelector: () => null, hasFocus: () => true };
  const window = { term, WebSocket: Socket, matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => (listeners[name] ||= []).push(fn) };
  vm.runInNewContext(SRC, { window, document, navigator: {}, Date: { now: () => now },
    TextEncoder, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    clearInterval() {}, requestAnimationFrame() {} });
  new window.WebSocket('ws://test/t1/ws');
  return { document, sent, input, term, geometry: () => window.__vibetopTerminalGeometry(), advance(ms) { now += ms; },
    emit(type, extra = {}) { for (const fn of listeners[type] || []) fn({ type, ...extra }); } };
}

test('click and typing reclaim desktop geometry without inserting terminal input', () => {
  const h = interactionHarness(); h.emit('pointerdown', { clientX: 0 });
  assert.deepEqual(h.sent, ['1{"columns":256,"rows":69}', '1{"columns":257,"rows":69}']);
  h.emit('keydown', { key: 'a' });
  assert.equal(h.sent.length, 2, 'continuous interaction is throttled');
  h.advance(1001); h.emit('keydown', { key: 'b' });
  assert.equal(h.sent.length, 4);
  assert.ok(h.sent.every(s => s.startsWith('1')), 'ownership sends only ttyd resize frames, never PTY input');
});

test('hidden desktop and deliberate history navigation do not claim ownership', () => {
  const h = interactionHarness();
  h.document.hidden = true; h.emit('pointerdown', { clientX: 0 });
  h.document.hidden = false; h.emit('keydown', { key: 'PageUp' });
  assert.equal(h.sent.length, 0);
});

for (const key of ['PageUp', 'PageDown']) {
  test(key + ' reaches the application instead of scrolling the browser', () => {
    const h = interactionHarness(); h.term.buffer.active.type = 'alternate';
    let prevented = false, stopped = false;
    h.emit('keydown', { key, preventDefault() { prevented = true; },
      stopImmediatePropagation() { stopped = true; } });
    assert.deepEqual(h.input, [key === 'PageUp' ? '\x1b[5~' : '\x1b[6~']);
    assert.ok(prevented && stopped, 'prevent browser scroll and duplicate xterm input');
    assert.equal(h.sent.length, 0, 'history navigation does not resize the session');
  });
}
test('normal scrollback and modified page keys keep native behavior', () => {
  const h = interactionHarness();
  h.emit('keydown', { key: 'PageUp' });
  h.term.buffer.active.type = 'alternate';
  h.emit('keydown', { key: 'PageUp', shiftKey: true });
  assert.deepEqual(h.input, []);
});

test('terminal geometry diagnostics never read the live rendering canvas', () => {
  const h = interactionHarness();
  let contextReads = 0;
  const canvas = { width: 1799, height: 1035,
    getContext() { contextReads++; return { getImageData() {
      return { data: new Uint8ClampedArray([0, 0, 0, 255]) };
    } }; } };
  h.term.buffer.active.getLine = () => ({ translateToString: () => 'visible output' });
  h.term.element.getBoundingClientRect = () => ({ width: 1800, height: 1040 });
  h.term.element.querySelector = selector => selector === '.xterm-text-layer' ? canvas : null;
  const snapshot = h.geometry();
  assert.equal(snapshot.canvasWidth, 1799);
  assert.equal(snapshot.canvasHeight, 1035);
  assert.equal(snapshot.visibleLines, h.term.rows);
  assert.equal(contextReads, 0, 'pixel readback can change Chrome canvas acceleration');
});
