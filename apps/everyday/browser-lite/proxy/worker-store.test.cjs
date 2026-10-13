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
