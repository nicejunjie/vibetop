'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ControlLedger}=require('./control-ledger.cjs');
const clientId='12345678-1234-1234-1234-123456789abc';
test('lost open/approval responses replay outcomes without repeating side effects',()=>{
 let calls=0;const ledger=new ControlLedger({perform:()=>({tabId:'one',epoch:++calls}),expire(){}});
 const request={clientId,operation:1,tabId:'one',url:'https://example.com'};
 assert.equal(ledger.run('open',request).epoch,1);
 assert.equal(ledger.run('open',request).epoch,1);assert.equal(calls,1);
 assert.throws(()=>ledger.run('open',{...request,url:'https://other.example'}),/changed/);
 const next={clientId,operation:2,tabId:'one',challenge:'challenge'};
 assert.equal(ledger.run('approve',next).epoch,2);
 assert.equal(ledger.run('approve',next).epoch,2);assert.equal(calls,2);
 assert.throws(()=>ledger.run('open',request),/Stale/);
});
test('leases reclaim abandoned tabs; an expired approval cannot be replayed',()=>{
 let now=0;const expired=[];
 const ledger=new ControlLedger({now:()=>now,ttl:100,limit:1,perform:()=>({tabId:'one'}),expire:id=>expired.push(id)});
 ledger.run('open',{clientId,operation:1});now=90;ledger.touch(clientId);now=150;ledger.collect();assert.deepEqual(expired,[]);
 now=191;ledger.collect();assert.deepEqual(expired,['one']);assert.equal(ledger.lanes.size,0);
 assert.throws(()=>ledger.run('approve',{clientId,operation:2}),/expired/);
});
test('rejected operations are deterministic and do not repeat partial work',()=>{
 let calls=0;const ledger=new ControlLedger({perform:()=>{calls++;throw new Error('failure');},expire(){}});
 for(let i=0;i<2;i++)assert.throws(()=>ledger.run('approve',{clientId,operation:1}),/failure/);
 assert.equal(calls,1);
});
test('a different device lease cannot replay or advance another device lane',()=>{
 const ledger=new ControlLedger({perform:()=>({tabId:'one'}),expire(){}});
 ledger.run('open',{clientId,operation:1},'device-a');
 assert.throws(()=>ledger.run('open',{clientId,operation:1},'device-b'),/mismatch/);
 assert.throws(()=>ledger.run('open',{clientId,operation:2},'device-b'),/mismatch/);
 assert.throws(()=>ledger.touch(clientId,'device-b'),/mismatch/);
 assert.deepEqual(ledger.touch(clientId,'device-a'),{alive:true});
});
test('at the open-tab limit the least recently used lane gives way to a new tab',()=>{
 let now=0;const expired=[];
 const ledger=new ControlLedger({now:()=>now,limit:2,perform:(_command,body)=>({tabId:body.tabId}),expire:id=>expired.push(id)});
 const ids=['a','b','c'].map(c=>c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12));
 ledger.run('open',{clientId:ids[0],operation:1,tabId:'t0'});now=10;
 ledger.run('open',{clientId:ids[1],operation:1,tabId:'t1'});now=20;
 ledger.touch(ids[0]);now=30;
 assert.equal(ledger.run('open',{clientId:ids[2],operation:1,tabId:'t2'}).tabId,'t2');
 assert.deepEqual(expired,['t1']);
 assert.throws(()=>ledger.touch(ids[1]),/expired/);
 assert.deepEqual(ledger.touch(ids[0]),{alive:true});
});
test('a lane survives hours without a heartbeat',()=>{
 let now=0;const ledger=new ControlLedger({now:()=>now,perform:()=>({tabId:'one'}),expire(){}});
 ledger.run('open',{clientId,operation:1});now=6*60*60*1000;
 assert.deepEqual(ledger.touch(clientId),{alive:true});
});
