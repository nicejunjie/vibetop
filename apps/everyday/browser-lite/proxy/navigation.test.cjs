'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NavigationTransactions}=require('./navigation.cjs');
const owner={tabId:'one',epoch:1,sourceOrigin:'https://source.example'};
function capture(store,extra={}) {return store.capture({...owner,url:'https://target.example/submit',method:'POST',body:Buffer.from('message=hello'),contentType:'application/x-www-form-urlencoded',...extra});}
test('POST executes exactly once and retains method, source and bytes',()=>{
 const s=new NavigationTransactions(),id=capture(s),ticket=s.approve(id,owner);
 assert.notEqual(id,ticket);
 assert.throws(()=>s.dispatch(id,owner));
 const request=s.dispatch(ticket,owner);
 assert.equal(request.method,'POST');assert.equal(request.body.toString(),'message=hello');assert.equal(request.sourceOrigin,owner.sourceOrigin);
 assert.throws(()=>s.dispatch(ticket,owner));assert.throws(()=>s.approve(id,owner));
 assert.equal(s.cancel(id),false);s.complete(id);assert.equal(s.bytes,0);
});
test('stale tab epochs and another tab cannot approve or execute',()=>{
 const s=new NavigationTransactions(),id=capture(s);
 assert.throws(()=>s.approve(id,{...owner,tabId:'other'}));
 assert.throws(()=>s.approve(id,{...owner,sourceOrigin:'https://target.example'}));
 const ticket=s.approve(id,owner);s.invalidateTab('one',2);assert.throws(()=>s.dispatch(ticket,owner));
});
test('expiry wins against late approval and preserves an already dispatched POST',()=>{
 let now=100;const s=new NavigationTransactions({now:()=>now,ttl:10}),id=capture(s);
 now=111;assert.throws(()=>s.approve(id,owner));assert.equal(s.bytes,0);
 const next=capture(s),ticket=s.approve(next,owner);s.dispatch(ticket,owner);
 now=200;s.collect();assert.equal(s.pending.get(next).state,'DISPATCHING');s.complete(next);
});
test('bounded pending bodies reject overflow and reclaim cancelled space',()=>{
 const s=new NavigationTransactions({maxBytes:13,maxPending:1}),id=capture(s);
 assert.throws(()=>capture(s));assert.equal(s.cancel(id),true);assert.doesNotThrow(()=>capture(s));
});
test('one tab cannot exhaust another tab navigation quota',()=>{
 const s=new NavigationTransactions({maxPerTab:2,maxBytesPerTab:26});
 capture(s);capture(s);assert.throws(()=>capture(s),/in this tab/);
 assert.doesNotThrow(()=>capture(s,{tabId:'other'}));
});
test('approval gives slow connections a fresh dispatch deadline',()=>{
 let now=0;const s=new NavigationTransactions({now:()=>now,ttl:30,approvedTtl:120});
 const id=capture(s);now=29;const ticket=s.approve(id,owner);now=140;
 assert.equal(s.dispatch(ticket,owner).method,'POST');
});
