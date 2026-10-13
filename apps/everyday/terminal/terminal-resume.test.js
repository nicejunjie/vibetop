'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('./terminal-resume.js');
const prefix = '\x1b]777;vt-resume;';
const turn = () => new Promise(resolve => setImmediate(resolve));
function browser(stored) {
  const records = new Map(stored ? [['alice:/t1/', structuredClone(stored)]] : []);
  const timers = [];
  class Message {
    constructor(type, init) { this.type = type; this.data = init.data; this.stopped = false; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  class Socket {
    constructor() { this.listeners = {}; this.sent = []; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) { fn(e); if (e.stopped) break; } }
    send(data) { this.sent.push(data); }
    close() { this.closed = true; }
    packet(s) { this.dispatchEvent(new Message('message', {data: Uint8Array.from('0' + s, c => c.charCodeAt(0)).buffer})); }
    frame(f) { this.packet(prefix + JSON.stringify(f) + '\x07'); }
  }
  const store = {
    get(key) { const r = {}; queueMicrotask(() => { r.result = records.get(key); r.onsuccess(); }); return r; },
    put(value, key) { records.set(key, structuredClone(value)); }, delete(key) { records.delete(key); },
    openCursor() { const r = {}; queueMicrotask(() => { r.result = null; r.onsuccess(); }); return r; }
  };
  const w = { WebSocket: Socket, ArrayBuffer, MessageEvent: Message, location: {pathname: '/t1/'},
    fetch: async () => ({ok: true, json: async () => ({user: 'alice'})}),
    atob: s => Buffer.from(s, 'base64').toString('latin1'),
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout(id) { timers[id - 1] = () => {}; }, addEventListener() {},
    indexedDB: {open() { const r = {}; queueMicrotask(() => { r.result = {transaction: () => ({objectStore: () => store})}; r.onsuccess(); }); return r; }}
  };
  install(w);
  const ws = new w.WebSocket('ws://test/t1/ws');
  const output = [];
  ws.addEventListener('message', e => output.push(Buffer.from(e.data).subarray(1).toString('latin1')));
  return {w, ws, records, output, save: async () => { timers.splice(0).forEach(fn => fn()); await turn(); }};
}
const encoded = s => Buffer.from(s, 'latin1').toString('base64');
const cached = {epoch: 'a', offset: 10, chunks: [encoded('cached\r\n')], size: 8};
test('reload sends cached cursor, restores output, and appends only missing bytes', async () => {
  const b = browser(cached);
  b.ws.frame({ready: true}); await turn();
  assert.equal(b.ws.sent[0], '0' + prefix + '{"epoch":"a","offset":10}\x07');
  b.ws.frame({epoch: 'a', offset: 14, reset: false, data: encoded('new!')}); await turn();
  assert.equal(b.output.join(''), '\x1bccached\r\nnew!');
  await b.save();
  assert.equal(b.records.get('alice:/t1/').offset, 14);
});
test('expired/restarted session replaces cached history with full replay', async () => {
  const b = browser(cached); b.ws.frame({ready: true}); await turn();
  b.ws.frame({epoch: 'b', offset: 20, reset: true, data: encoded('fresh')}); await turn();
  assert.equal(b.output.join(''), '\x1bcfresh');
  await b.save();
  assert.deepEqual(b.records.get('alice:/t1/').chunks, [encoded('fresh')]);
});
test('control envelopes split at every packet boundary do not leak into xterm', async () => {
  const b = browser();
  const marker = prefix + '{"ready":true}\x07';
  for (const c of marker) b.ws.packet(c);
  await turn();
  assert.equal(b.output.join(''), '');
  assert.equal(b.ws.sent[0], '0' + prefix + '{}\x07');
});
test('unfinished full replay cannot persist an acknowledged cursor', async () => {
  const b = browser(cached); b.ws.frame({ready: true}); await turn();
  b.ws.frame({epoch: 'a', offset: null, reset: true, data: encoded('part')}); await turn();
  await b.save();
  assert.equal(b.records.has('alice:/t1/'), false);
});
test('restoring cached queries does not send old device probes to xterm', async () => {
  const chunk = 'ok\x1b[6n\x1b]11;?\x07end';
  const b = browser({...cached, chunks: [encoded(chunk)], size: chunk.length});
  b.ws.frame({ready: true}); await turn();
  b.ws.frame({epoch: 'a', offset: 10, reset: false, data: ''}); await turn();
  assert.equal(b.output.join(''), '\x1bcokend');
});
test('legacy daemon output passes through and queued keystrokes remain ordered', async () => {
  const b = browser(); b.ws.send('0hello');
  assert.equal(b.ws.sent.length, 0);
  b.ws.packet('prompt'); await turn();
  assert.equal(b.output.join(''), 'prompt');
  assert.deepEqual(b.ws.sent, ['0hello']);
});
test('keystrokes wait behind the resume handshake, never becoming protocol input', async () => {
  const b = browser(cached); b.ws.send('0typed');
  b.ws.frame({ready: true}); await turn();
  assert.equal(b.ws.sent.length, 1);
  b.ws.frame({epoch: 'a', offset: 10, reset: false, data: ''}); await turn();
  assert.equal(b.ws.sent[1], '0typed');
});
test('a shell respawn while connected clears old screen and cache', async () => {
  const b = browser(cached); b.ws.frame({ready: true}); await turn();
  b.ws.frame({epoch: 'a', offset: 10, reset: false, data: ''}); await turn();
  b.ws.frame({epoch: 'b', offset: 3, reset: true, data: encoded('new')}); await turn();
  assert.equal(b.output.join(''), '\x1bccached\r\n\x1bcnew');
  await b.save();
  assert.equal(b.records.get('alice:/t1/').epoch, 'b');
});
test('slow-link recovery discards an unfinished envelope before applying the reset', async () => {
  const b = browser(); b.ws.frame({ready: true}); await turn();
  b.ws.packet(prefix + '{"epoch":"a","offset":null,"data":"unfinished');
  b.ws.frame({epoch: 'a', offset: 10000, reset: true, data: encoded('latest screen')}); await turn();
  assert.equal(b.output.join(''), '\x1bclatest screen');
  assert.equal(b.ws.closed, undefined);
});
