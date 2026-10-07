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
  assert.match(SRC, /while \(acc > 18\) \{ cancelLatest\(\); t\.scrollLines\(-1\)/,
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

function readerHarness(source = SRC, saved = new Map()) {
  let now = 5000;
  const listeners = {}, scrolls = [], parsed = [], frames = [], timers = [], markers = [];
  const lines = Array.from({length: 500}, (_, i) => 'history passage ' + i);
  const buffer = {type: 'normal', baseY: 470, viewportY: 470, cursorY: 29,
    getLine(i) { return lines[i] == null ? null : {translateToString() { return lines[i]; }}; }};
  const term = {rows:30, cols:54, element: {clientWidth:400}, buffer: {active:buffer},
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
  const document = {hidden:false, querySelector:() => null};
  const prefix = source.slice(0, source.indexOf('  // Re-claim the shared PTY')) + '\n})();';
  vm.runInNewContext(prefix, {window, document, Date:{now:() => now},
    sessionStorage:{getItem:k => saved.get(k), setItem:(k,v) => saved.set(k,v), removeItem:k => saved.delete(k)},
    setTimeout(fn, delay) { const t = {fn, delay, cancelled:false}; timers.push(t); return t; }, clearTimeout(t) { if(t) t.cancelled=true; },
    setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame(fn) { frames.push(fn); }});
  return {buffer, term, lines, saved, window, markers,
    emit(k, extra={}) { (listeners[k] || []).forEach(fn => fn({type:k,...extra})); },
    scroll(row) { term.scrollToLine(row); },
    output() { parsed.forEach(fn => fn()); },
    settle() { for (const t of timers.splice(0)) { if(!t.cancelled && t.delay===0) t.fn(); } for(let i=0; frames.length && i<30; i++) frames.shift()(); },
    advance(ms) { now+=ms; }};
}

test('history reading stays at its passage when output resets the viewport to older content', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle(); h.advance(1000);
  h.scroll(0); h.output(); h.settle(); assert.equal(h.buffer.viewportY,100);
});

test('ordinary typing does not replace a history anchor with the repaint position', () => {
  const h=readerHarness(); h.emit('wheel'); h.scroll(100); h.settle(); h.advance(1000);
  h.emit('keydown',{key:'a'}); h.scroll(0); h.output(); h.settle();
  assert.equal(h.buffer.viewportY,100);
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
