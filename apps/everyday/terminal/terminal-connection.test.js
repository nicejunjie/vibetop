const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'terminal-connection.js'), 'utf8');
function browser(saved = new Map()) {
  let now = 0, reloads = 0, interval;
  const elements = [], events = {}, documentEvents = {}, logs = [];
  function element() { return { style: {}, setAttribute() {}, appendChild(e) { this.child = e; }, remove() { elements.splice(elements.indexOf(this), 1); } }; }
  class Socket {
    constructor() { this.readyState = 0; this.events = {}; }
    addEventListener(k, cb) { this.events[k] = cb; }
    emit(k, data, code) { if (k === 'open') this.readyState = 1; if (k === 'close') this.readyState = 3; this.events[k]?.({ data, code }); }
  }
  Object.assign(Socket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  const w = { WebSocket: Socket, ArrayBuffer, Uint8Array, navigator: { userAgent: 'test' },
    location: { pathname: '/t1/', reload() { reloads++; } },
    sessionStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
    document: { hidden: false, addEventListener: (k, cb) => { documentEvents[k] = cb; }, createElement: element, body: { appendChild(e) { elements.push(e); } } },
    fetch: (_, o) => { logs.push(JSON.parse(o.body)); return Promise.resolve(); },
    setInterval: cb => { interval = cb; return 1; }, clearInterval: () => { interval = null; },
    addEventListener: (k, cb) => { events[k] = cb; }
  };
  vm.runInNewContext(source, { window: w, Date: { now: () => now } });
  return { w, elements, logs, saved, events, documentEvents, advance(ms) { now += ms; interval?.(); }, get reloads() { return reloads; } };
}
test('stalled token fetch before any socket gets a visible status and bounded reload', () => {
  const b = browser(); b.advance(3000);
  assert.match(b.elements[0].textContent, /Connecting/);
  b.advance(27000); assert.equal(b.reloads, 1);
  assert.equal(b.logs[0].guard[0].phase, 'startup');
});
test('CONNECTING socket cannot leave a black terminal indefinitely', () => {
  const b = browser(); new b.w.WebSocket('ws://test/t1/ws'); b.advance(30000);
  assert.equal(b.reloads, 1); assert.equal(b.logs[0].guard[0].state, 0);
});
test('open plus title/preferences is not proof of an attached terminal', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', new Uint8Array([49,65]).buffer); b.advance(30000);
  assert.equal(b.reloads, 1);
});
test('actual output clears failure UI and a quiet shell is never reloaded', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  b.advance(3000); ws.emit('open'); ws.emit('message', new Uint8Array([48,65]).buffer);
  assert.equal(b.elements.length, 0); b.advance(3600000); assert.equal(b.reloads, 0);
  ws.emit('close'); b.advance(30000); assert.equal(b.reloads, 1);
});
test('three unsuccessful reloads stop with a manual retry; no reload loop', () => {
  const saved = new Map();
  for (let i = 0; i < 3; i++) { const b = browser(saved); b.advance(30000); assert.equal(b.reloads, 1); }
  const b = browser(saved); b.advance(30000);
  assert.equal(b.reloads, 0); assert.match(b.elements[0].textContent, /failed/);
  b.elements[0].child.onclick(); assert.equal(b.reloads, 1); assert.equal(saved.size, 0);
});
test('successful recovery resets retry budget and obsolete socket events are ignored', () => {
  const b = browser(new Map([['vt-terminal-retries:/t1/', '2']]));
  const old = new b.w.WebSocket('ws://test/t1/ws'), current = new b.w.WebSocket('ws://test/t1/ws');
  current.emit('open'); current.emit('message', '0prompt'); old.emit('close');
  b.advance(30000); assert.equal(b.reloads, 0); assert.equal(b.saved.size, 0);
  assert.equal(b.logs[0].guard[0].event, 'recovered');
});
test('blocked storage does not cause an infinite reload loop', () => {
  const b = browser(); b.w.sessionStorage.setItem = () => { throw Error('blocked'); };
  b.advance(30000); assert.equal(b.reloads, 0); assert.ok(b.elements[0].child);
});
test('page unload cancels watchdog and bfcache resume rearms it', () => {
  const b = browser(); b.events.pagehide(); b.advance(30000); assert.equal(b.reloads, 0);
  b.events.pageshow({ persisted: true }); b.advance(30000); assert.equal(b.reloads, 1);
});
test('late output recovers even after the automatic retry limit', () => {
  const b = browser(new Map([['vt-terminal-retries:/t1/', '3']]));
  const ws = new b.w.WebSocket('ws://test/t1/ws'); b.advance(30000);
  ws.emit('open'); ws.emit('message', '0prompt');
  assert.equal(b.elements.length, 0); assert.equal(b.saved.size, 0);
  ws.emit('close'); b.advance(30000); assert.equal(b.reloads, 1);
});
test('installer deploys the guard before keyboard script and removes synthetic Enter recovery', () => {
  const installer = fs.readFileSync(require('node:path').join(__dirname, '../../../server/install.sh'), 'utf8');
  assert.match(installer, /terminal-connection\.js.*CONN_VER/);
  assert.match(installer, /\$TERM_APP_DIR\/terminal-connection\.js" "\$LANDING_DIR\/terminal-connection\.js/);
  assert.ok(installer.indexOf('/terminal-connection.js?v=') < installer.indexOf('/terminal-kbd.js?v='));
  assert.doesNotMatch(installer, /function fireEnter/);
});


test('cleanly closed mobile terminal recovers promptly without waiting twelve seconds', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt');
  ws.emit('close', undefined, 1000); b.advance(500);
  assert.equal(b.reloads, 1);
  const recovery = b.logs.find(log => log.guard[0].event === 'clean-close');
  assert.equal(recovery.guard[0].elapsed, 0);
  assert.equal(b.logs[0].guard[0].close_code, 1000);
});

test('clean close while backgrounded waits until visible, then recovers immediately', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt');
  b.w.document.hidden = true; ws.emit('close', undefined, 1000);
  b.advance(60000); assert.equal(b.reloads, 0);
  b.w.document.hidden = false; b.documentEvents.visibilitychange();
  assert.equal(b.reloads, 1);
});

test('abnormal close immediately starts recovery rather than waiting for native retry', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt'); ws.emit('close', undefined, 1006);
  assert.equal(b.reloads, 1);
  assert.equal(b.logs.find(log => log.guard[0].event === 'closed-reconnect').guard[0].closed_wait_ms, 0);
});

test('failed clean-close recovery obeys the same retry limit', () => {
  const saved = new Map();
  for (let i = 0; i < 3; i++) {
    const b = browser(saved), ws = new b.w.WebSocket('ws://test/t1/ws');
    ws.emit('open'); ws.emit('close', undefined, 1000); b.advance(4000);
    assert.equal(b.reloads, 1);
  }
  const b = browser(saved), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('close', undefined, 1000); b.advance(4000);
  assert.equal(b.reloads, 0); assert.match(b.elements[0].textContent, /failed/);
});


test('foreground return immediately recovers an abnormally closed mobile socket', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt');
  b.w.document.hidden = true; ws.emit('close', undefined, 1006);
  b.advance(1000); assert.equal(b.reloads, 0);
  b.w.document.hidden = false; b.documentEvents.visibilitychange();
  assert.equal(b.reloads, 1);
});

test('foreground recovery catches a closed socket before its delayed close event', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt');
  ws.readyState = 3; b.events.focus();
  assert.equal(b.reloads, 1);
});

test('delayed close delivery is caught by the watchdog without a foreground event', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt'); ws.readyState = 3;
  b.advance(500); assert.equal(b.reloads, 1);
});

test('mobile no-status close recovers promptly rather than using startup timeout', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt'); ws.emit('close', undefined, 1005);
  b.advance(500); assert.equal(b.reloads, 1);
});


test('weak-link handshake and first output may take longer than the old deadline', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  b.advance(15000); assert.equal(b.reloads, 0);
  ws.emit('open'); b.advance(10000); assert.equal(b.reloads, 0);
  ws.emit('message', '0first weak-link output'); b.advance(60000);
  assert.equal(b.reloads, 0);
});

test('explicit offline state does not burn retries, and network return resumes recovery', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt'); b.w.navigator.onLine = false;
  ws.emit('close', undefined, 1006); b.advance(60000);
  assert.equal(b.reloads, 0); assert.equal(b.saved.size, 0);
  assert.match(b.elements[0].textContent, /Waiting for network/);
  b.w.navigator.onLine = true; b.events.online(); assert.equal(b.reloads, 1);
});

test('repeated closed connection failures back off before the retry limit', () => {
  for (const [count, delay] of [[1, 1000], [2, 4000]]) {
    const b = browser(new Map([['vt-terminal-retries:/t1/', String(count)]]));
    const ws = new b.w.WebSocket('ws://test/t1/ws'); ws.emit('close', undefined, 1006);
    b.advance(delay-1); assert.equal(b.reloads, 0);
    b.advance(1); assert.equal(b.reloads, 1);
  }
});


test('brief browser switches preserve the open socket and never reload its terminal', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message','0prompt');
  for (const duration of [100, 500, 5000, 60000]) {
    b.w.document.hidden = true; b.documentEvents.visibilitychange(); b.advance(duration);
    b.w.document.hidden = false; b.events.focus(); b.documentEvents.visibilitychange();
    assert.equal(b.reloads, 0); assert.equal(ws.readyState, 1);
  }
});

test('background suspension does not spend a pending weak-link connection deadline', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  b.advance(1000); b.w.document.hidden = true; b.documentEvents.visibilitychange();
  b.advance(60000); b.w.document.hidden = false; b.documentEvents.visibilitychange();
  assert.equal(b.reloads, 0);
  b.advance(15000); ws.emit('open'); ws.emit('message','0slow connection');
  assert.equal(b.reloads, 0);
});

test('close delivered during background suspension keeps recovery elapsed nonnegative', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0prompt');
  b.w.document.hidden = true; b.documentEvents.visibilitychange();
  b.advance(5000); ws.emit('close', undefined, 1006); b.advance(2000);
  b.w.document.hidden = false; b.documentEvents.visibilitychange();
  assert.equal(b.reloads, 1);
  const recovery = b.logs.at(-1).guard[0];
  assert.equal(recovery.elapsed, 0);
  assert.equal(recovery.closed_wait_ms, 2000);
});
