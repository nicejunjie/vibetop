'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PrefsStore,clean,DEFAULTS}=require('./prefs-store.cjs');

test('prefs round-trip through the per-user file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-prefs-')),store=new PrefsStore(path.join(dir,'prefs.json'));
  try {
    // Default before anything is saved is ad-block ON.
    assert.deepEqual(store.load(),{adblock:true});
    store.save({prefs:{adblock:false}});
    assert.deepEqual(store.load(),{adblock:false});
    assert.equal((fs.statSync(path.join(dir,'prefs.json')).mode&0o777),0o600);
    store.save({prefs:{adblock:true}});
    assert.deepEqual(store.load(),{adblock:true});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('a bare settings object is accepted and coerced to booleans',()=>{
  assert.deepEqual(clean({adblock:0}).prefs,{adblock:false});
  assert.deepEqual(clean({adblock:'yes'}).prefs,{adblock:true});
  // Missing key falls back to the default.
  assert.deepEqual(clean({}).prefs,{adblock:DEFAULTS.adblock});
  assert.throws(()=>clean('nope'),/Invalid/);
  assert.throws(()=>clean([1,2]),/Invalid/);
});

test('a store with no file returns defaults and never throws',()=>{
  const store=new PrefsStore(null);
  assert.deepEqual(store.load(),{adblock:true});
  assert.equal(store.save({prefs:{adblock:false}}),null);
});
