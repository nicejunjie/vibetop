'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function browser() {
  let now = 0, tick, selected;
  const panels = [];
  const container = { appendChild(p) { panels.push(p); } };
  const w = {document: {hidden: false, createElement() {return {style: {}, setAttribute() {}, appendChild(b) {this.button=b;}, remove() {panels.splice(panels.indexOf(this),1);}};}},
    setInterval(fn) { tick=fn; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/terminal-frame.js','utf8'), {window:w, WeakMap, Date:{now:()=>now}});
  const health = w.TerminalFrameHealth(w,container,()=>selected);
  function frame(n, title='') { return {dataset:{n},contentWindow:{},contentDocument:{title},width:100,src:'',getBoundingClientRect(){return {width:this.width};}}; }
  return {health,panels,w,frame,select(f){selected=f;health.activate();},advance(ms){now+=ms;tick();}};
}
test('a failed page in a previously hidden terminal recovers on selection',()=>{
  const b=browser(), a=b.frame(1), failed=b.frame(2,'502 Bad Gateway'); a.contentWindow.term={};
  b.select(a); b.advance(60000); assert.equal(failed.src,'');
  b.select(failed); assert.match(b.panels[0].textContent,/Loading/);
  b.advance(5000); assert.equal(failed.src,'/t2/'); assert.equal(a.src,'');
});
test('a slow terminal gets time to initialize and activation reaches its guard',()=>{
  const b=browser(), f=b.frame(1); b.select(f); b.advance(30000); assert.equal(f.src,'');
  let activations=0; f.contentWindow.__vibetopConnectionActivate=()=>activations++;
  b.select(f); assert.equal(activations,1); assert.equal(b.panels.length,0);
  b.advance(60000); assert.equal(f.src,'');
});
test('hidden frames do not consume their connection timeout',()=>{
  const b=browser(), f=b.frame(1); b.select(f); f.width=0; b.advance(60000);
  assert.equal(f.src,''); f.width=100; b.select(f); b.advance(30000); assert.equal(f.src,'');
  b.advance(15000); assert.equal(f.src,'/t1/');
});
test('page retries stop and expose a manual retry for the selected frame',()=>{
  const b=browser(), f=b.frame(1); b.select(f);
  for(let i=0;i<4;i++)b.advance(45000);
  assert.match(b.panels[0].textContent,/could not load/);
  assert.equal(b.panels[0].button.textContent,'Retry connection');
  b.panels[0].button.onclick(); assert.match(b.panels[0].textContent,/Loading/);
});
