'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {engineRequire}=require('./engine.cjs');
test('the rewritten-script cache returns what it stored',()=>{
  const Cache=engineRequire('./src/classes/RammerheadJSMemCache');
  const cache=new Cache(1024*1024);
  cache.set('key','rewritten source');
  assert.equal(cache.get('key'),'rewritten source');
  assert.equal(cache.get('missing'),undefined);
});
