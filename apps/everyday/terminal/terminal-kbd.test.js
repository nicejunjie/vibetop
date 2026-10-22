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

function readerHarness(source = SRC, saved = new Map()) {
  let now = 5000;
  const listeners = {}, scrolls = [], parsed = [], frames = [], timers = [], markers = [], erasers = [];
  let snapshotVisible = false;
  const screen = {querySelectorAll: () => [], appendChild() {snapshotVisible = true;},
    cloneNode() { return {style: {}, setAttribute() {}, querySelectorAll: () => [], remove() {snapshotVisible = false;}}; }};
  const lines = Array.from({length: 500}, (_, i) => 'history passage ' + i);
  const buffer = {type: 'normal', baseY: 470, viewportY: 470, cursorY: 29,
    getLine(i) { return lines[i] == null ? null : {translateToString() { return lines[i]; }}; }};
  const term = {rows:30, cols:54, element: {clientWidth:400, querySelector: () => screen}, parser: {registerCsiHandler(_, fn) {erasers.push(fn);}}, refresh() {}, buffer: {active:buffer},
    onScroll(fn) { scrolls.push(fn); }, onWriteParsed(fn) { parsed.push(fn); },
    scrollToLine(row) { buffer.viewportY = Math.min(buffer.baseY, row); scrolls.forEach(fn => fn()); },
    scrollToBottom() { this.scrollToLine(buffer.baseY); },
    registerMarker(offset) { const marker = {line:buffer.baseY + buffer.cursorY + offset, isDisposed:false, dispose() { this.isDisposed = true; }}; markers.push(marker); return marker; }};
  class Socket {
    constructor() { this.events = {}; }
    addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
    removeEventListener() {}
    emit(k) { (this.events[k] || []).forEach(fn => fn()); }
  }
  const window = {term, WebSocket:Socket, location:{pathname:'/t2/'}, matchMedia:() => ({matches:false}),
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); }};
  const document = {hidden:false, querySelector:() => null,
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); }};
  const prefix = source.slice(0, source.indexOf('  // Re-claim the shared PTY')) + '\n})();';
  vm.runInNewContext(prefix, {window, document, getComputedStyle: () => ({backgroundColor:'#222'}), Date:{now:() => now},
    sessionStorage:{getItem:k => saved.get(k), setItem:(k,v) => saved.set(k,v), removeItem:k => saved.delete(k)},
    setTimeout(fn, delay) { const t = {fn, delay, at:now+delay, cancelled:false}; timers.push(t); return t; }, clearTimeout(t) { if(t) t.cancelled=true; },
    setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame(fn) { frames.push(fn); }});
  return {buffer, term, lines, saved, window, markers, document,
    snapshotVisible: () => snapshotVisible,
    erase(replacement) { erasers.forEach(fn => fn([3])); markers.forEach(m => m.dispose());
      lines.splice(0, lines.length, ...replacement); buffer.baseY = Math.max(0, lines.length-term.rows);
      term.scrollToLine(0); parsed.forEach(fn => fn()); },
    emit(k, extra={}) { (listeners[k] || []).forEach(fn => fn({type:k,...extra})); },
    scroll(row) { term.scrollToLine(row); },
    output() { parsed.forEach(fn => fn()); },
    settle() { for (const t of timers.splice(0)) { if (!t.cancelled) { if(t.at<=now) t.fn(); else timers.push(t); } } for(let i=0; frames.length && i<30; i++) frames.shift()(); },
    advance(ms) { now+=ms; }};
}

test('history reading stays at its passage when output resets the viewport to older content', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle(); h.advance(1000);
  h.scroll(0); h.output(); h.settle(); assert.equal(h.buffer.viewportY,100);
});

test('ordinary typing leaves history and returns to the active input line', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle(); h.advance(1000);
  h.emit('keydown',{key:'a'}); assert.equal(h.buffer.viewportY,h.buffer.baseY);
  assert.equal(h.window.__vibetopTerminalReading().anchored,false);
  h.scroll(0); h.output(); h.settle();
  assert.equal(h.buffer.viewportY,h.buffer.baseY);
});

test('same-frame reconnect opens latest even when previously reading history', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle();
  const ws=new h.window.WebSocket('ws://test/t2/ws'); ws.emit('open');
  assert.equal(h.buffer.viewportY,h.buffer.baseY);
  h.lines.splice(0,20); h.buffer.baseY-=20; h.buffer.viewportY=0;
  ws.emit('message'); h.output(); h.settle();
  assert.equal(h.buffer.viewportY,h.buffer.baseY);
});

test('frame reload discards an older saved location and opens latest', () => {
  const saved=new Map([['vt-terminal-reader:/t2/', JSON.stringify({distance:370,cols:54,samples:[{offset:0,text:'history passage 100'}]})]]);
  const h=readerHarness(SRC,saved); h.window.__vibetopShowLatest(1);
  assert.equal(saved.size,0);
  h.buffer.viewportY=0;
  const ws=new h.window.WebSocket('ws://test/t2/ws'); ws.emit('open'); ws.emit('message');
  h.output(); h.settle(); assert.equal(h.buffer.viewportY,470);
  h.window.__vibetopShowLatest(1); assert.equal(h.buffer.viewportY,470);
});

test('manual history navigation after reconnect immediately cancels latest following', () => {
  const h=readerHarness(); const ws=new h.window.WebSocket('ws://test/t2/ws'); ws.emit('open');
  h.emit('wheel'); h.scroll(80); h.settle();
  h.buffer.viewportY=0; ws.emit('message'); h.output(); h.settle();
  assert.equal(h.buffer.viewportY,80);
});

test('new navigation replaces the live history anchor and returning to bottom clears it', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle();
  h.emit('wheel'); h.scroll(70); h.settle(); h.advance(1000);
  h.scroll(0); h.output(); h.settle(); assert.equal(h.buffer.viewportY,70);
  h.emit('wheel'); h.scroll(470); h.settle(); assert.equal(h.saved.size,0);
});


test('live output returns latest after a redraw beyond the reconnect settle period', () => {
  const h=readerHarness(); h.window.__vibetopShowLatest(1); h.advance(15000);
  h.buffer.viewportY=0; h.output(); h.settle();
  assert.equal(h.buffer.viewportY,h.buffer.baseY);
});

test('a queued live-follow callback yields to history navigation before it runs', () => {
  const h=readerHarness(); h.output();
  h.emit('wheel'); h.scroll(100); h.settle();
  assert.equal(h.buffer.viewportY,100);
  h.buffer.viewportY=0; h.output(); h.settle();
  assert.equal(h.buffer.viewportY,100);
});


test('split redraw waits for the actual passage rather than an earlier repeated heading', () => {
  const h = readerHarness();
  for (const row of [80, 380]) h.lines.splice(row, 3, 'assistant', 'Response', '----------------');
  h.emit('wheel'); h.scroll(380); h.settle();
  const complete = h.lines.slice();
  h.markers.forEach(m => m.dispose());
  h.lines.splice(200); h.buffer.baseY = 170; h.buffer.viewportY = 0;
  h.output(); h.settle();
  assert.equal(h.buffer.viewportY, 0, 'do not lock onto the earlier repeated heading');
  h.lines.splice(0, h.lines.length, ...complete); h.buffer.baseY = 470;
  h.output(); h.settle();
  assert.equal(h.buffer.viewportY, 380, 'recover the original passage once it arrives');
});

test('a marker surviving an in-place rewrite must still match the saved passage', () => {
  const h = readerHarness(); h.emit('wheel'); h.scroll(100); h.settle();
  const passage = h.lines.slice(100, 130);
  h.lines.splice(100, 30, ...Array(30).fill('rewritten content'));
  h.lines.splice(200, 30, ...passage);
  h.buffer.viewportY = 0; h.output(); h.settle();
  assert.equal(h.buffer.viewportY, 200, 'a valid row number is not proof of matching content');
});


test('missing passage at redraw timeout preserves distance instead of exposing oldest content', () => {
  const h = readerHarness(); h.emit('wheel'); h.scroll(442); h.settle();
  h.erase(Array.from({length: 500}, (_, i) => 'replacement passage ' + i)); h.settle();
  assert.equal(h.buffer.viewportY, 0);
  assert.equal(h.snapshotVisible(), true);
  h.advance(2100); h.settle();
  assert.equal(h.buffer.viewportY, 442, 'retain the 28-line distance from the new bottom');
  assert.equal(h.snapshotVisible(), false, 'uncover only after the fallback render');
  assert.equal(h.window.__vibetopTerminalReading().marker_row, 442);
  h.buffer.viewportY = 0; h.output(); h.settle();
  assert.equal(h.buffer.viewportY, 442, 'subsequent writes use the new passage anchor');
});

test('background redraw with a missing passage recovers on foreground before new output', () => {
  const h = readerHarness(); h.emit('wheel'); h.scroll(442); h.settle();
  h.document.hidden = true;
  h.erase(Array.from({length: 460}, (_, i) => 'replacement passage ' + i)); h.settle();
  h.advance(2100); h.settle();
  assert.equal(h.buffer.viewportY, 0);
  h.document.hidden = false; h.emit('visibilitychange'); h.settle();
  assert.equal(h.buffer.viewportY, 402, 'retain 28-line distance from the shorter replacement buffer');
});

test('history navigation cancels a pending missing-passage fallback', () => {
  const h = readerHarness(); h.emit('wheel'); h.scroll(442); h.settle();
  h.erase(Array.from({length: 500}, (_, i) => 'replacement passage ' + i)); h.settle();
  h.emit('wheel'); h.scroll(80); h.settle();
  h.advance(2100); h.settle();
  assert.equal(h.buffer.viewportY, 80);
  assert.equal(h.snapshotVisible(), false);
});


test('copy shortcuts and history keys keep the current reading position', () => {
  const h = readerHarness(); h.emit('wheel'); h.scroll(100); h.settle();
  h.emit('keydown', {key:'c', metaKey:true});
  h.emit('keydown', {key:'c', ctrlKey:true, shiftKey:true});
  h.emit('keydown', {key:'PageUp'}); h.settle();
  assert.equal(h.buffer.viewportY,100);
});

test('native committed text or paste returns to latest without synthesizing input', () => {
  const h = readerHarness(); const target = {};
  h.term.element.contains = node => node === target;
  for (const type of ['input','compositionend','paste']) {
    h.emit('wheel'); h.scroll(100); h.settle();
    h.emit(type, {target}); h.settle();
    assert.equal(h.buffer.viewportY,h.buffer.baseY);
  }
});
