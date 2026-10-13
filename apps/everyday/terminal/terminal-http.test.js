const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('./terminal-http.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function browser(fetcher) {
  const natives = [], storage = new Map();
  class Socket extends EventTarget {
    constructor(url) { super(); this.url = url; this.protocol = 'tty'; this.extensions = ''; this.sent = []; natives.push(this); }
    send(data) { this.sent.push(data); }
    close() { this.closed = true; }
  }
  class Close extends Event { constructor(type, args) { super(type); Object.assign(this, args); } }
  const events = new EventTarget();
  const w = {addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), WebSocket: Socket, EventTarget, Event, MessageEvent, CloseEvent: Close,
    URL, ArrayBuffer, Blob, TextEncoder, TextDecoder, DOMException, AbortController,
    crypto: globalThis.crypto, btoa, atob, navigator: {userAgent: 'test'},
    location: {href: 'https://test/t1/', host: 'test'},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)},
    setTimeout: (fn, ms) => setTimeout(fn, ms === 8000 ? 20 : ms === 500 ? 1 : ms), clearTimeout,
    fetch: fetcher || (() => { throw Error('HTTP fallback should not run'); })};
  install(w);
  return {w, natives, storage};
}
test('healthy native socket keeps binary data, input and event ordering', async () => {
  const {w,natives} = browser();
  const ws = new w.WebSocket('wss://test/t1/ws', ['tty']);
  ws.binaryType = 'arraybuffer';
  natives[0].dispatchEvent(new Event('open'));
  assert.equal(ws.readyState, 1);
  let result, extra = false;
  ws.addEventListener('message', e => { result = e.data; e.stopImmediatePropagation(); });
  ws.onmessage = () => { extra = true; };
  const payload = new Uint8Array([48,65]).buffer;
  natives[0].dispatchEvent(new MessageEvent('message', {data:payload}));
  assert.equal(result,payload); assert.equal(extra,false);
  ws.send('input'); assert.deepEqual(natives[0].sent,['input']);
  await delay(30); assert.equal(ws.readyState,1);
  ws.close(); assert.equal(ws.readyState,3);
});
test('only same-host ttyd sockets are wrapped', () => {
  const {w,natives} = browser();
  const a = new w.WebSocket('wss://elsewhere/t1/ws','tty');
  const b = new w.WebSocket('wss://test/browser/ws','other');
  assert.equal(a,natives[0]); assert.equal(b,natives[1]);
});
test('stalled handshake switches to HTTP; lost input response retries same sequence', async () => {
  const requests = []; let polls = 0, sends = 0;
  const {w,natives} = browser(async (url, options) => {
    if (url === '/api/clientlog') return {ok:true,json:async()=>({})};
    const body=JSON.parse(options.body); requests.push(body);
    if(body.op==='send' && sends++===0) throw Error('response lost');
    if(body.op==='poll') {
      if(polls++===0) return {ok:true,json:async()=>({frames:[{seq:1,binary:true,data:'MGhp'}],closed:false})};
      return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));
    }
    return {ok:true,json:async()=>({ok:true})};
  });
  const ws = new w.WebSocket('wss://test/t1/ws','tty'); ws.binaryType='arraybuffer';
  let output=''; ws.onmessage=e=>{output+=new TextDecoder().decode(e.data);};
  ws.onopen=()=>ws.send('0echo hi\r');
  await delay(70);
  assert.equal(ws.readyState,1); assert.equal(natives[0].closed,true);
  assert.equal(output,'0hi');
  const inputs=requests.filter(r=>r.op==='send');
  assert.equal(inputs.length,2); assert.deepEqual(inputs[0],inputs[1]);
  assert.equal(ws.bufferedAmount,0);
  ws.close();
});
