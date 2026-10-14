'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {engineRequire}=require('./engine.cjs');
const {patchSource}=require('./cookie-perf-patch.cjs');
test('the served client remembers the cookie probe and skips identical syncs',()=>{
  const root=path.dirname(engineRequire.resolve('rammerhead/package.json'));
  const client=fs.readFileSync(path.join(root,'src/client/hammerhead.js'),'utf8');
  assert.ok(client.includes('vtCookiesWork'),'probe memo missing from the built client');
  assert.ok(client.includes('vtSyncedCookies'),'sync skip missing from the built client');
});
test('the patch is idempotent and refuses a changed upstream',()=>{
  const once=patchSource(fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8'));
  assert.equal(patchSource(once),once);
  assert.throws(()=>patchSource('function nothing() {}'),/anchor changed/);
});
