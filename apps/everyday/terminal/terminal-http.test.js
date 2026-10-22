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

test('slow input response batches typing without crossing resize or duplicating retries', async () => {
  const accepted = new Map(), requests = []; let lose = true;
  const {w} = browser(async (url, options) => {
    if(url === '/api/clientlog') return {ok:true,json:async()=>({})};
    const body = JSON.parse(options.body);
    if(body.op === 'poll') return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));
    if(body.op === 'send') {
      requests.push(body);
      accepted.set(body.seq, atob(body.data));
      await delay(30);
      if(body.seq === 2 && lose) { lose = false; throw Error('lost response'); }
    }
    return {ok:true,json:async()=>({ok:true})};
  });
  const ws = new w.WebSocket('wss://test/t1/ws','tty');
  ws.onopen = () => {
    for(const key of 'abcdefghijkl') ws.send('0' + key);
    ws.send('1{"cols":80,"rows":24}');
    ws.send('0m'); ws.send('0n');
  };
  await delay(250);
  assert.deepEqual([...accepted.values()], ['0a','0bcdefghijkl','1{"cols":80,"rows":24}','0mn']);
  assert.equal(requests.length,5);
  assert.deepEqual(requests[1],requests[2]);
  assert.equal(ws.bufferedAmount,0);
  ws.close();
});

test('stream delivers split chunks immediately and deduplicates replay after disconnect', async () => {
  let streams = 0, push;
  const {w} = browser(async (url, options) => {
    if(url === '/api/clientlog') return {ok:true,json:async()=>({})};
    const body = JSON.parse(options.body);
    if(body.op === 'open') return {ok:true,json:async()=>({streaming:true})};
    if(body.op === 'stream') {
      streams++;
      const payload = JSON.stringify({frames:[{seq:1,binary:true,data:btoa('0hello')}],closed:false})+'\n';
      return {ok:true,body:new ReadableStream({start(controller) {
        controller.enqueue(new TextEncoder().encode(payload.slice(0,20)));
        controller.enqueue(new TextEncoder().encode(payload.slice(20)));
        push=controller;
        options.signal.addEventListener('abort',()=>{try{controller.error(Error('aborted'));}catch{}});
      }})};
    }
    return {ok:true,json:async()=>({ok:true})};
  });
  const ws = new w.WebSocket('wss://test/t1/ws','tty'); ws.binaryType='arraybuffer';
  const output=[]; ws.onmessage=e=>output.push(new TextDecoder().decode(e.data));
  await delay(45);
  assert.deepEqual(output,['0hello']); // before the HTTP response ends
  push.error(Error('lost stream'));
  await delay(35);
  assert.equal(streams,2);
  assert.deepEqual(output,['0hello']);
  ws.close();
});
