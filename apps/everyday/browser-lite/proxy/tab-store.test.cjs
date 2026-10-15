'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {TabStore,clean}=require('./tab-store.cjs');
test('saved tabs round-trip through the per-user file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-tabs-')),store=new TabStore(path.join(dir,'tabs.json'));
  try {
    assert.equal(store.load(),null);
    store.save({tabs:[{url:'https://example.com/',title:'Example',history:[{url:'https://a.example/',documentId:'d1'},{url:'https://example.com/',documentId:'d2'}],position:1},
      {url:'https://news.ycombinator.com/',title:'HN'}],active:1});
    const loaded=store.load();
    assert.deepEqual(loaded.tabs.map(tab=>tab.url),['https://example.com/','https://news.ycombinator.com/']);
    assert.equal(loaded.active,1);assert.equal(loaded.tabs[0].position,1);
    assert.equal((fs.statSync(path.join(dir,'tabs.json')).mode&0o777),0o600);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('only web addresses, bounded sizes and sane indexes are kept',()=>{
  const saved=clean({tabs:[{url:'javascript:alert(1)'},{url:'file:///etc/passwd'},...Array.from({length:40},(_,i)=>({url:'https://s'+i+'.example/',title:'t'.repeat(500),
    history:Array.from({length:80},(_,j)=>({url:'https://h'+j+'.example/',documentId:'x'.repeat(300)})),position:999}))],active:-5});
  assert.equal(saved.tabs.length,30);assert.equal(saved.tabs[0].url,'https://s10.example/');
  assert.equal(saved.tabs[0].title.length,200);
  assert.ok(saved.tabs[0].history.length<=20,'history trimmed to fit');
  assert.equal(saved.tabs[0].history[saved.tabs[0].position].url,'https://h79.example/','the current entry is kept');
  assert.ok(Buffer.byteLength(JSON.stringify(saved))<=80*1024+64);assert.equal(saved.active,0);
  assert.throws(()=>clean({tabs:'nope'}),/Invalid/);
});
