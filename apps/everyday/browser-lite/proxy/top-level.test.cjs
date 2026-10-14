'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {engineRequire}=require('./engine.cjs');
const {tabRoot}=require('./top-level-patch.cjs');
const realm=n=>'https://bl-u1000-'+n+'.example.test';
function frame(hostname,ancestors,parent){
  const win={location:{hostname,ancestorOrigins:ancestors},parent};
  win.window=win;return win;
}
function rootOf(win){return vm.runInNewContext('('+tabRoot+')()',{window:win,Object});}
test('the tab root is the topmost frame under Lite UI',()=>{
  const ui={},root=frame('bl-u1000-aa.example.test',['https://browser-lite.example.test','https://vibetop.example.test'],ui);
  assert.equal(rootOf(root),root);
  const child=frame('bl-u1000-bb.example.test',[realm('aa'),'https://browser-lite.example.test','https://vibetop.example.test'],root);
  assert.equal(rootOf(child),root);
  const grandchild=frame('bl-u1000-cc.example.test',[realm('bb'),realm('aa'),'https://browser-lite.example.test'],child);
  assert.equal(rootOf(grandchild),root);
});
test('other users\' realms and other domains are not part of the tab',()=>{
  const ui={},root=frame('bl-u1000-aa.example.test',['https://bl-u1001-zz.example.test'],ui);
  assert.equal(rootOf(root),root);
  const other=frame('bl-u1000-aa.example.test',['https://bl-u1000-zz.evil.test'],ui);
  assert.equal(rootOf(other),other);
});
test('without ancestorOrigins nothing is emulated',()=>{
  assert.equal(rootOf(frame('bl-u1000-aa.example.test',undefined,{})),null);
  assert.equal(rootOf(frame('www.example.test',[],{})),null);
});
test('the engines instrument top and parent for page code only',()=>{
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.match(client,/'location', 'top', 'parent',/);
  assert.match(client,/ top: \{ condition: isWindow,/);
  assert.match(client,/if \(vtNativeReferrer && !parseProxyUrl\(vtNativeReferrer\)\) return '';/);
  const {PROPERTIES}=require(engineRequire.resolve('testcafe-hammerhead/lib/processing/script/instrumented.js'));
  assert.deepEqual(PROPERTIES,['href','location','top','parent']);
  const worker=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/worker-hammerhead.js'),'utf8');
  assert.doesNotMatch(worker,/vt-top-level/);
});
