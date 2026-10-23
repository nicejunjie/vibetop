'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ShortcutStore,clean}=require('./shortcut-store.cjs');
test('saved shortcuts round-trip through the per-user file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-shortcuts-')),store=new ShortcutStore(path.join(dir,'shortcuts.json'));
  try {
    assert.equal(store.load(),null);
    store.save({shortcuts:[{name:'Example',url:'https://example.com/'},{name:'News',url:'https://news.ycombinator.com/'}]});
    const loaded=store.load();
    assert.deepEqual(loaded.map(item=>item.url),['https://example.com/','https://news.ycombinator.com/']);
    assert.equal(loaded[0].name,'Example');
    assert.equal((fs.statSync(path.join(dir,'shortcuts.json')).mode&0o777),0o600);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('a bare array is accepted too',()=>{
  assert.deepEqual(clean([{url:'https://example.com/'}]).shortcuts,[{name:'',url:'https://example.com/'}]);
});
test('only web addresses, bounded names, no duplicates, capped count',()=>{
  const saved=clean({shortcuts:[{url:'javascript:alert(1)'},{url:'file:///etc/passwd'},
    {name:'x'.repeat(200),url:'https://dupe.example/'},{name:'again',url:'https://dupe.example/'},
    ...Array.from({length:40},(_,i)=>({name:'s'+i,url:'https://s'+i+'.example/'}))]});
  assert.ok(saved.shortcuts.length<=24,'count capped');
  assert.equal(saved.shortcuts[0].url,'https://dupe.example/');
  assert.equal(saved.shortcuts.filter(item=>item.url==='https://dupe.example/').length,1,'duplicate dropped');
  assert.equal(saved.shortcuts[0].name.length,60,'name trimmed');
  assert.throws(()=>clean({shortcuts:'nope'}),/Invalid/);
  assert.throws(()=>clean('nope'),/Invalid/);
});
