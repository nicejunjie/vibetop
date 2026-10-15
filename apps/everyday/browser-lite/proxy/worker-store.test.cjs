'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {WorkerStore}=require('./worker-store.cjs');
test('worker source allows network retries but cannot be read by another realm',()=>{
 const store=new WorkerStore(),source=Buffer.from('postMessage(1)'),id=store.put('https://a.example',source);
 source.fill(0);assert.equal(store.get('https://b.example',id),null);
 assert.equal(store.get('https://a.example',id).toString(),'postMessage(1)');
 assert.equal(store.get('https://a.example',id).toString(),'postMessage(1)');
});
test('abandoned worker registrations expire and reclaim bounded capacity',()=>{
 let now=0;const store=new WorkerStore({now:()=>now,ttl:10,maxBytes:3,maxEntries:1});
 const id=store.put('a',Buffer.from('abc'));assert.throws(()=>store.put('a',Buffer.from('d')));
 assert.doesNotThrow(()=>store.put('b',Buffer.from('abc')));
 now=10;assert.equal(store.get('a',id),null);assert.equal(store.bytes,0);
 assert.doesNotThrow(()=>store.put('b',Buffer.from('abc')));
});
// A worker starts before its upload finishes, so its script request waits.
test('a worker request waits for the page\'s upload, and a failed upload answers at once',async()=>{
  const store=new WorkerStore(),id='a'.repeat(43),other='b'.repeat(43);
  const waiting=store.wait('https://a.example',id,5000);
  store.put('https://a.example',Buffer.from('postMessage(1)'),{},id);
  assert.equal(String(await waiting),'postMessage(1)');
  assert.equal(await store.wait('https://b.example',id,5000),null,'another realm never waits for or receives it');
  assert.throws(()=>store.put('https://a.example',Buffer.from('x'),{},id),/Invalid worker id/);
  assert.throws(()=>store.put('https://a.example',Buffer.from('x'),{},'short'),/Invalid worker id/);
  const failing=store.wait('https://a.example',other,5000);
  store.fail('https://a.example',other);
  assert.equal(await failing,null);
  assert.equal(await store.wait('https://a.example',other,5000),null);
  assert.throws(()=>store.put('https://a.example',Buffer.from('x'),{},other),/Invalid worker id/);
  assert.equal(await store.wait('https://a.example','c'.repeat(43),20),null,'times out');
  assert.equal(store.waiters.size,0);
});
