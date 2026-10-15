'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createMessageGate=require('./message-gate.js');
function setup(known={}) {
  const origins=new Map(Object.entries(known)),lookups=[],delivered=[],errors=[];
  const hold=createMessageGate({origins,lookUp:(physical,done)=>lookups.push({physical,done}),
    deliver:({id})=>{if(id==='throws')throw new Error('listener');delivered.push(id);},report:error=>errors.push(error.message)});
  return {origins,lookups,delivered,errors,hold};
}
test('a message from a known sender is delivered at once, without a lookup',()=>{
  const g=setup({'https://a.realm':'https://a.example'});
  assert.equal(g.hold('https://a.realm',{id:1}),false);
  assert.equal(g.hold('null',{id:2}),false);
  assert.deepEqual(g.lookups,[]);
});
test('an unknown sender is looked up once, asynchronously, and messages keep their order',()=>{
  const g=setup({'https://a.realm':'https://a.example'});
  assert.equal(g.hold('https://b.realm',{id:1}),true);
  assert.equal(g.hold('https://b.realm',{id:2}),true);
  // A known sender queues behind the held message rather than overtaking it.
  assert.equal(g.hold('https://a.realm',{id:3}),true);
  assert.equal(g.lookups.length,1);
  assert.deepEqual(g.delivered,[]);
  g.lookups[0].done('https://b.example');
  assert.deepEqual(g.delivered,[1,2,3]);
  assert.equal(g.origins.get('https://b.realm'),'https://b.example');
  assert.equal(g.hold('https://b.realm',{id:4}),false);
});
test('a message waits for every earlier sender\'s lookup',()=>{
  const g=setup();
  g.hold('https://b.realm',{id:1});g.hold('https://c.realm',{id:2});g.hold('https://b.realm',{id:3});
  assert.equal(g.lookups.length,2);
  g.lookups[1].done('https://c.example');
  assert.deepEqual(g.delivered,[]);
  g.lookups[0].done('https://b.example');
  assert.deepEqual(g.delivered,[1,2,3]);
});
test('a failed lookup still delivers, caches nothing, and a throwing listener does not stop the rest',()=>{
  const g=setup();
  g.hold('https://b.realm',{id:'throws'});g.hold('https://b.realm',{id:2});
  g.lookups[0].done(undefined);
  g.lookups[0].done('https://late.example');
  assert.deepEqual(g.delivered,[2]);
  assert.deepEqual(g.errors,['listener']);
  assert.equal(g.origins.has('https://b.realm'),false);
});
test('redelivery passes straight through the gate, and a throwing lookup does not strand messages',()=>{
  const origins=new Map(),delivered=[];let hold;
  hold=createMessageGate({origins,lookUp:()=>{throw new Error('offline');},
    deliver:({id})=>{assert.equal(hold('https://b.realm',{id:'inner'}),false);delivered.push(id);},report:()=>{}});
  assert.equal(hold('https://b.realm',{id:1}),true);
  assert.deepEqual(delivered,[1]);
});
