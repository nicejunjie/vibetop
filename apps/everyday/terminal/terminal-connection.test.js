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
    constructor() { this.readyState = 0; this.listeners = {}; this.closed = 0; }
    addEventListener(k, cb) { (this.listeners[k] ||= []).push(cb); }
    close() { this.closed++; this.readyState = 3; }
    emit(k, data, code) {
      if (k === 'open') this.readyState = 1; if (k === 'close') this.readyState = 3;
      let stop = false;
      const event = { data, code, stopImmediatePropagation() { stop = true; } };
      for (const cb of this.listeners[k] || []) { cb(event); if (stop) break; }
    }
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
  b.advance(42000); assert.equal(b.reloads, 1);
  assert.equal(b.logs[0].guard[0].phase, 'startup');
});
test('CONNECTING socket cannot leave a black terminal indefinitely', () => {
  const b = browser(); new b.w.WebSocket('ws://test/t1/ws'); b.advance(45000);
  assert.equal(b.reloads, 1); assert.equal(b.logs[0].guard[0].state, 0);
});
test('open plus title/preferences is not proof of an attached terminal', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', new Uint8Array([49,65]).buffer); b.advance(45000);
  assert.equal(b.reloads, 1);
});
test('actual output clears failure UI and a quiet shell is never reloaded', () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  b.advance(3000); ws.emit('open'); ws.emit('message', new Uint8Array([48,65]).buffer);
  assert.equal(b.elements.length, 0); b.advance(3600000); assert.equal(b.reloads, 0);
  ws.emit('close'); b.advance(45000); assert.equal(b.reloads, 1);
});
test('three unsuccessful reloads stop with a manual retry; no reload loop', () => {
  const saved = new Map();
  for (let i = 0; i < 3; i++) { const b = browser(saved); b.advance(45000); assert.equal(b.reloads, 1); }
  const b = browser(saved); b.advance(45000);
  assert.equal(b.reloads, 0); assert.match(b.elements[0].textContent, /failed/);
  b.elements[0].child.onclick(); assert.equal(b.reloads, 1); assert.equal(saved.size, 0);
});
test('successful recovery resets retry budget and obsolete socket events are ignored', () => {
  const b = browser(new Map([['vt-terminal-retries:/t1/', '2']]));
  const old = new b.w.WebSocket('ws://test/t1/ws'), current = new b.w.WebSocket('ws://test/t1/ws');
  current.emit('open'); current.emit('message', '0prompt'); old.emit('close');
  b.advance(45000); assert.equal(b.reloads, 0); assert.equal(b.saved.size, 0);
  assert.equal(b.logs[0].guard[0].event, 'recovered');
});
test('blocked storage does not cause an infinite reload loop', () => {
  const b = browser(); b.w.sessionStorage.setItem = () => { throw Error('blocked'); };
  b.advance(45000); assert.equal(b.reloads, 0); assert.ok(b.elements[0].child);
});
test('page unload cancels watchdog and bfcache resume rearms it', () => {
  const b = browser(); b.events.pagehide(); b.advance(45000); assert.equal(b.reloads, 0);
  b.events.pageshow({ persisted: true }); b.advance(45000); assert.equal(b.reloads, 1);
});
test('late output recovers even after the automatic retry limit', () => {
  const b = browser(new Map([['vt-terminal-retries:/t1/', '3']]));
  const ws = new b.w.WebSocket('ws://test/t1/ws'); b.advance(45000);
  ws.emit('open'); ws.emit('message', '0prompt');
  assert.equal(b.elements.length, 0); assert.equal(b.saved.size, 0);
  ws.emit('close'); b.advance(45000); assert.equal(b.reloads, 1);
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

test('closed controller reconnects in place, disposes old listeners, and resets budget on output', async () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message', '0ready');
  let disposed = 0, tokens = 0, connects = 0, current;
  b.w.__vibetopTtyd = {socket:ws, dispose(){disposed++;}, refreshToken(){tokens++;},
    connect(){connects++; current = new b.w.WebSocket('ws://test/t1/ws'); this.socket=current;}};
  ws.emit('close', undefined, 1006);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disposed, 1); assert.equal(tokens, 1); assert.equal(connects, 1);
  assert.equal(b.reloads, 0); assert.equal(b.saved.get('vt-terminal-retries:/t1/'), '1');
  current.emit('open'); current.emit('message', '0recovered');
  assert.equal(b.saved.size, 0); b.advance(60000); assert.equal(b.reloads, 0);
});

test('hanging in-place token refresh still has a bounded foreground deadline', async () => {
  const b = browser(), ws = new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message','0ready');
  let connects=0;
  b.w.__vibetopTtyd = {socket:ws, dispose(){}, refreshToken(){return new Promise(()=>{});},connect(){connects++;}};
  ws.emit('close',undefined,1006); await new Promise(resolve=>setImmediate(resolve));
  b.advance(40000); assert.equal(b.reloads,0);
  b.advance(5000); assert.equal(b.reloads,1); assert.equal(connects,0);
});

test('in-place failures retain backoff and stop both guard and native retries at the limit', async () => {
 const b=browser();let current=new b.w.WebSocket('ws://test/t1/ws'), disposed=0, connects=0;
 b.w.__vibetopTtyd={socket:current, dispose(){disposed++;}, refreshToken(){},connect(){connects++;current=new b.w.WebSocket('ws://test/t1/ws');this.socket=current;}};
 for(let i=0;i<3;i++){
  current.emit('close',undefined,1011);
  if(i>0){assert.equal(connects,i);b.advance(i===1?1000:4000);}
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(connects,i+1);
 }
 current.emit('close',undefined,1011);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(connects,3);assert.equal(disposed,4);assert.equal(b.reloads,0);
 assert.match(b.elements[0].textContent,/failed/);b.advance(60000);assert.equal(connects,3);
});
test('a background mobile page does not repeatedly reload disconnected terminals', () => {
  const b = browser(); b.w.document.hidden = true;
  b.advance(60000); assert.equal(b.reloads, 0);
  b.w.document.hidden = false; b.advance(500); assert.equal(b.reloads, 0);
  b.advance(45000); assert.equal(b.reloads, 1);
});
test('a slow connection gets 45 seconds and shows progress when activated', () => {
  const b=browser(); new b.w.WebSocket('ws://test/t1/ws');
  b.w.__vibetopConnectionActivate(); assert.match(b.elements[0].textContent,/Connecting/);
  b.advance(30000); assert.equal(b.reloads,0);
  b.advance(15000); assert.equal(b.reloads,1);
});
test('a CSS-hidden terminal pauses its watchdog until selected', () => {
  const b=browser(); let active=false;
  b.w.frameElement={classList:{contains:()=>active},getBoundingClientRect:()=>({width:active?100:0})};
  new b.w.WebSocket('ws://test/t1/ws'); b.advance(60000); assert.equal(b.reloads,0);
  active=true; b.w.__vibetopConnectionActivate(); b.advance(30000); assert.equal(b.reloads,0);
  b.advance(15000); assert.equal(b.reloads,1);
});
test('activation recovers a hidden CLOSED transport in place without reloading HTML', async () => {
  const b=browser(), ws=new b.w.WebSocket('ws://test/t1/ws');
  ws.emit('open'); ws.emit('message','0prompt');
  let connected=0, disposed=0;
  b.w.__vibetopTtyd={socket:ws,dispose(){disposed++;},refreshToken:()=>Promise.resolve(),connect(){connected++;}};
  b.w.document.hidden=true; b.advance(60000); ws.readyState=3;
  b.w.document.hidden=false; b.w.__vibetopConnectionActivate();
  for(let i=0;i<10;i++)await Promise.resolve();
  assert.equal(connected,1); assert.equal(disposed,1); assert.equal(b.reloads,0);
});
test('racing native and in-place reconnects leave one socket driving ttyd (no doubled keys)', async () => {
  const b = browser(), tokens = [], sockets = [], writes = [];
  let inits = 0;
  // A minimal ttyd Xterm controller; its listeners register AFTER the guard's,
  // and every opened socket runs initListeners() (one more onData handler).
  const ttyd = {
    socket: null,
    dispose() {},
    refreshToken() { return new Promise(resolve => tokens.push(resolve)); },
    connect() {
      const s = this.socket = new b.w.WebSocket('ws://test/t1/ws'); sockets.push(s);
      s.addEventListener('open', () => { inits++; });
      s.addEventListener('message', e => writes.push(e.data));
      s.addEventListener('close', e => { if (e.code !== 1000) this.refreshToken().then(() => this.connect()); });
    }
  };
  b.w.__vibetopTtyd = ttyd; ttyd.connect();
  sockets[0].emit('open'); sockets[0].emit('message', '0ready'); inits = 0; writes.length = 0;
  // Abnormal close while hidden: ttyd starts its own reconnect (token pending)...
  b.w.document.hidden = true; sockets[0].emit('close', undefined, 1006);
  // ...and on return the guard starts a second one before that token arrives.
  b.w.document.hidden = false; b.documentEvents.visibilitychange();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(tokens.length, 2);
  // The guard's token arrives first; ttyd's late callback connects unconditionally.
  const [nativeToken, guardToken] = tokens.splice(0);
  guardToken(); for (let i = 0; i < 10; i++) await Promise.resolve();
  nativeToken(); for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(sockets.length, 3);
  const [, stale, live] = sockets;
  assert.equal(stale.closed, 1); assert.equal(live.closed, 0);
  stale.emit('open'); live.emit('open');
  stale.emit('message', '0x'); live.emit('message', '0x');
  assert.equal(inits, 1, 'only the newest socket may run ttyd initListeners');
  assert.deepEqual(writes, ['0x'], 'only the newest socket may write output');
  stale.emit('close', undefined, 1006);
  assert.equal(tokens.length, 0, 'a superseded socket closing must not start another reconnect');
  assert.equal(b.reloads, 0);
});
