'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(){const W=load(source),H=W.__rtsTest,g=H.begin(160916,'normal','frontier');H.attachAI(0,'normal');return {W,H,g,ai:g.ai2};}
for(const fac of ['dir','col'])test('last-miner recovery prioritizes income and preserves paid miner progress: '+fac,()=>{
 const {H,g,ai}=setup();g.side[0].fac=fac;
 for(const [type,x,y] of [['base',8,8],['power',14,8],['refinery',8,15],['barracks',18,15],['factory',18,20]])H.build(type,0,x,y);
 const s=g.side[0],q=s.queues.v,key=fac==='col'?'warminer':'chronominer';
 q.list=[fac==='col'?'rhino':'lancer',fac==='col'?'rhino':'lancer'];q.paid=600;q.prog=.5;s.credits=2000;
 s.queues.i.list=[fac==='col'?'conscript':'rifle'];s.queues.a.pause=true;
 assert.equal(H.api.aiRecoverEconomy(g,ai,0),true);
 assert.deepEqual(Array.from(q.list),[key]);assert.equal(s.credits,2600,'only paid progress refunded');
 assert.equal(s.queues.i.pause,true);q.paid=200;q.prog=.2;
 H.api.aiRecoverEconomy(g,ai,0);assert.equal(q.paid,200);assert.equal(q.prog,.2);
 H.spawn(key,0,12,20);assert.equal(H.api.aiRecoverEconomy(g,ai,0),false);
 assert.equal(s.queues.i.pause,false);assert.equal(s.queues.a.pause,true,'pre-existing pauses are not cleared');
});
test('a functioning mining economy does not cancel the combat queue',()=>{
 const {H,g,ai}=setup();H.spawn('chronominer',0,10,10);g.side[0].queues.v.list=['lancer'];
 assert.equal(H.api.aiRecoverEconomy(g,ai,0),false);assert.equal(g.side[0].queues.v.list[0],'lancer');
});
test('recovery does not freeze production when only a foreign factory survives',()=>{
 const {H,g,ai}=setup();H.build('refinery',0,8,15);
 const factory=H.build('factory',0,18,20);factory.fac='col';g.side[0].fac='dir';
 g.side[0].queues.v.list=['rhino'];
 assert.equal(H.api.aiRecoverEconomy(g,ai,0),false);
 assert.equal(g.side[0].queues.v.list[0],'rhino');assert.equal(!!g.side[0].queues.i.pause,false);
});
test('emergency recovery actually produces a miner through the normal paid production loop',()=>{
 const {W,H,g}=setup();g.ai=null;g.terrain.fill(W.__rtsTables.TER.GROUND);
 H.build('base',1,50,50);H.spawn('warminer',1,48,45);
 for(const [type,x,y] of [['base',8,8],['power',14,8],['refinery',8,15],['barracks',18,15],['factory',18,20]])H.build(type,0,x,y);
 g.blds.forEach(b=>b.make=0);
 const s=g.side[0];s.credits=2000;s.queues.v.list=['lancer','lancer'];s.queues.v.paid=600;
 s.queues.i.list=['rifle','rifle'];
 H.step(4200);
 assert.ok(g.units.some(u=>!u.dead&&u.p===0&&u.type==='chronominer'),'paid replacement exits the factory');
 assert.equal(s.queues.i.pause,false,'normal production resumes automatically');
 assert.ok(s.credits<2600,'replacement was paid for, not spawned by the policy');
});
