const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/terminal-profile.js', 'utf8');
function browser(until = 86400000) {
  let now = 0;
  const timers = [], logs = [], events = {}, documentEvents = {}, parsed = [];
  class Socket {
    constructor() {this.events = {}; this.readyState = 0;}
    addEventListener(k, fn) {(this.events[k] ||= []).push(fn);}
    emit(k, extra = {}) {if (k === 'open') this.readyState = 1; (this.events[k] || []).forEach(fn => fn(extra));}
  }
  Object.assign(Socket, {CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3});
  const storage = new Map();
  const w = {WebSocket: Socket, ArrayBuffer, Uint8Array, navigator: {userAgent:'test', onLine:true},
    location:{pathname:'/t2/'}, document:{hidden:false, addEventListener(k, fn) {documentEvents[k] = fn;}},
    sessionStorage:{getItem:k => storage.get(k),setItem:(k,v) => storage.set(k,v)},
    performance:{now:() => now, getEntriesByType(k) {return k === 'resource' ? [
      {name:'https://host/t2/token?secret=DO_NOT_LOG',startTime:10,duration:20,transferSize:100},
      {name:'https://host/private-sensitive-data',startTime:1}] : [{type:'navigate',domainLookupStart:1,domainLookupEnd:2,connectStart:2,connectEnd:5,requestStart:8,responseStart:10,responseEnd:15}];}},
    term:{onWriteParsed(fn) {parsed.push(fn);return {dispose() {}};}, buffer:{active:{viewportY:30,baseY:30}}},
    setTimeout(fn, ms) {const t = {fn, at:now+ms};timers.push(t);return t;},clearTimeout(t) {t.cancelled = true;},
    requestAnimationFrame(fn) {fn();},addEventListener(k, fn) {events[k] = fn;},
    fetch(_, args) {logs.push(JSON.parse(args.body));return Promise.resolve();}};
  const context = {module:{exports:{}},Date:{now:()=>now},URL,Math};
  vm.runInNewContext(source, context);context.module.exports(w, until);
  return {w, logs, events, documentEvents, Native:Socket,
    advance(ms) {now += ms;for (const t of timers.splice(0)) {if(t.at<=now&&!t.cancelled)t.fn();else if(!t.cancelled)timers.push(t);}},
    parse() {parsed.forEach(fn=>fn());}, rows() {return logs.flatMap(l=>l.guard);}};
}
test('profiling is inert without an active bounded deadline', () => {
  for (const until of [0, -1, 27*3600000]) {
    const b=browser(until);assert.equal(b.w.WebSocket,b.Native);assert.equal(b.logs.length,0);
  }
});
test('records handshake, first output and rendering without text, URL query or input', () => {
  const b=browser(), ws=new b.w.WebSocket('ws://host/t2/ws?secret=DO_NOT_LOG');
  b.advance(120);ws.emit('open');b.advance(80);
  ws.emit('message',{data:'0PRIVATE_TERMINAL_OUTPUT'});b.parse();
  b.events.keydown({key:'PRIVATE_TYPED_INPUT'});b.advance(5000);
  const rows=b.rows();assert.equal(rows.find(r=>r.event==='socket-open').handshake_ms,120);
  assert.equal(rows.find(r=>r.event==='first-output').open_to_output_ms,80);
  assert(rows.some(r=>r.event==='first-render'));
  const json=JSON.stringify(b.logs);assert(!json.includes('PRIVATE'));assert(!json.includes('DO_NOT_LOG'));assert(!json.includes('private-sensitive-data'));
  assert(json.includes('/t2/token'));
});
test('background transitions and close codes are captured without altering the connection', () => {
  const b=browser(), ws=new b.w.WebSocket('ws://host');ws.emit('open');
  b.w.document.hidden=true;b.documentEvents.visibilitychange();
  b.advance(60000);b.w.document.hidden=false;b.documentEvents.visibilitychange();
  ws.emit('close',{code:1006});assert(b.rows().some(r=>r.event==='socket-close'&&r.code===1006));
  assert(b.rows().some(r=>r.event==='visibility'&&r.hidden));
});
test('collects binary byte counts without decoding terminal text and stops at expiry', () => {
  const b=browser(6000), ws=new b.w.WebSocket('ws://host');ws.emit('open');
  ws.emit('message',{data:new Uint8Array([48,65,66]).buffer});b.parse();b.advance(1500);b.advance(3500);
  assert.equal(b.rows().find(r=>r.event==='replay-window').output_bytes,2);
  const count=b.logs.length;b.advance(2000);ws.emit('close',{code:1000});b.advance(10000);
  assert.equal(b.logs.length,count);
});

test('captures a backward viewport shift with intent and control counters, without terminal content', () => {
  const b=browser(), ws=new b.w.WebSocket('ws://host');
  const buffer=b.w.term.buffer.active;buffer.baseY=100;buffer.viewportY=100;buffer.type='normal';buffer.cursorY=20;
  b.w.__vibetopTerminalReading=()=>({following:true,anchored:false,navigating:false,marker_row:null,anchor_distance:null});
  ws.emit('open');ws.emit('message',{data:'0\x1b[2J\x1b[3J\x1b[H\x1b[?1049hPRIVATE_TEXT'});
  buffer.viewportY=0;b.w.__vibetopTraceTerminalScroll('parsed-write');b.advance(5000);
  const shift=b.rows().find(r=>r.event==='viewport-shift');
  assert(shift);assert.equal(shift.from_viewport,100);assert.equal(shift.viewport,0);
  assert.equal(shift.following,true);assert.equal(shift.navigation_age_ms,null);
  assert.equal(shift.controls.erase_screen,1);assert.equal(shift.controls.erase_scrollback,1);
  assert.equal(shift.controls.cursor_home,1);assert.equal(shift.controls.alternate_enter,1);
  assert(!JSON.stringify(b.logs).includes('PRIVATE_TEXT'));
});
test('manual navigation is distinguished from an automatic backward viewport shift', () => {
  const b=browser(), ws=new b.w.WebSocket('ws://host');
  const buffer=b.w.term.buffer.active;buffer.baseY=100;buffer.viewportY=100;
  ws.emit('open');ws.emit('message',{data:'0x'});
  b.w.__vibetopTraceTerminalScroll('navigation');buffer.viewportY=20;
  b.w.__vibetopTraceTerminalScroll('xterm-scroll');b.advance(5000);
  assert.equal(b.rows().find(r=>r.event==='viewport-shift').navigation_age_ms,0);
});
