'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// The toolbar saves tabs with a keepalive fetch (the only kind that survives
// pagehide, which is when iOS discards the page), and a keepalive body may be
// at most 64 KB. The payload must fit before it is sent.
function budget() {
  const source=fs.readFileSync(path.join(__dirname,'wrapper.js'),'utf8');
  const match=source.match(/const SAVE_BYTES=[^;]+;\n  function tabBudget\(payload,limit=SAVE_BYTES\)\{[\s\S]*?\n  \}\n/);
  assert.ok(match,'wrapper.js defines tabBudget');
  const context={TextEncoder};
  vm.runInNewContext(match[0]+'\nthis.tabBudget=tabBudget;this.SAVE_BYTES=SAVE_BYTES;',context);
  return context;
}
const size=payload=>Buffer.byteLength(JSON.stringify(payload));
function tabs(count,history,urlLength=200) {
  return {tabs:Array.from({length:count},(_,i)=>({url:'https://site'+i+'.example/'+'p'.repeat(urlLength),title:'Tab '+i,
    history:Array.from({length:history},(_,j)=>({url:'https://site'+i+'.example/'+j+'/'+'q'.repeat(urlLength),documentId:'d'+j})),position:history-1})),active:count-1};
}
test('the budget is under the keepalive limit and small payloads pass untouched',()=>{
  const {tabBudget,SAVE_BYTES}=budget();
  assert.ok(SAVE_BYTES<=60*1024,'keepalive bodies are capped at 64 KB in browsers');
  const small=tabs(3,5);const before=JSON.stringify(small);
  assert.equal(JSON.stringify(tabBudget(small)),before);
});
test('an oversized payload keeps every tab with a shortened history around the current entry',()=>{
  const {tabBudget,SAVE_BYTES}=budget();
  const big=tabs(30,50);assert.ok(size(big)>SAVE_BYTES);
  const trimmed=tabBudget(big);
  assert.ok(size(trimmed)<=SAVE_BYTES,'fits: '+size(trimmed));
  assert.equal(trimmed.tabs.length,30,'history is shortened before any tab is dropped');
  assert.equal(trimmed.active,29);
  for(const tab of trimmed.tabs){
    assert.ok(tab.history.length<=20);
    assert.match(tab.history[tab.position].url,/\/49\//,'the current entry stays current');
  }
});
test('only when histories are gone do the oldest tabs go, and the active index follows',()=>{
  const {tabBudget,SAVE_BYTES}=budget();
  const huge=tabs(30,0,4000);
  const trimmed=tabBudget(huge);
  assert.ok(size(trimmed)<=SAVE_BYTES);
  assert.ok(trimmed.tabs.length<30 && trimmed.tabs.length>=1);
  assert.equal(trimmed.tabs.at(-1).title,'Tab 29','the newest tabs survive');
  assert.equal(trimmed.active,trimmed.tabs.length-1);
});
