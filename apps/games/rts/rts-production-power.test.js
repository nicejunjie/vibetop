'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(){
 const W=load(source),H=W.__rtsTest,g=H.begin(92301,'normal');g.ai=null;
 g.terrain.fill(W.__rtsTables.TER.GROUND);g.ore.fill(0);
 const buildings={};let x=5;
 for(const key of ['base','power','refinery','barracks','factory','airforce','shipyard']){
  buildings[key]=H.build(key,0,x,10);buildings[key].make=0;x+=6;
 }
 H.build('reactor',0,5,20);g.units.length=0;
 return{W,H,g,buildings};
}
for(const [lane,key,producer] of [['b','power','base'],['d','sentry','base'],['i','rifle','barracks'],['v','lancer','factory'],['a','harrier','airforce'],['n','destroyer','shipyard']]){
 test(lane+' queue retains money and progress while all producers are switched off',()=>{
  const {H,g,buildings}=setup(),q=g.side[0].queues[lane];q.list.push(key);H.step(30);
  assert.ok(q.prog>0);buildings[producer].offline=true;
  const prog=q.prog,credits=g.side[0].credits;H.step(60);
  assert.equal(q.prog,prog);assert.equal(g.side[0].credits,credits);assert.equal(q.list[0],key);
  buildings[producer].offline=false;H.step(30);assert.ok(q.prog>prog);
 });
}
test('spy blackout slows production despite nominal power surplus, then expires',()=>{
 const {H,g}=setup(),s=g.side[0];s.queues.v.list.push('lancer');H.step(30);
 const normal=s.queues.v.prog;s.queues.v.prog=0;s.blackout=g.tick+60;H.step(30);
 assert.ok(Math.abs(s.queues.v.prog/normal-0.5)<0.001);
 H.step(31);assert.equal(H.api.prodSpeed(g,0),1);
});

test('offline factories supply neither a speed bonus nor an exit, without losing primary selection',()=>{
 const {H,g,buildings}=setup(),first=buildings.factory,second=H.build('factory',0,44,20);
 second.make=0;H.setPrimary(first);assert.equal(H.buildFactor(0,'v'),0.8);
 first.offline=true;assert.equal(H.buildFactor(0,'v'),1);
 const q=g.side[0].queues.v;q.list.push('lancer');q.prog=0.99;
 H.step(30);assert.ok(!first.hold);assert.ok(second.hold||g.units.some(u=>u.type==='lancer'&&u.x>40));
 assert.equal(g.side[0].primary.v,first.id,'temporary fallback preserves chosen primary');
 first.offline=false;assert.equal(H.buildFactor(0,'v'),0.8);
});

test('power-off holds a completed vehicle inside the factory door',()=>{
 const {H,g,buildings}=setup(),b=buildings.factory;
 b.hold={key:'lancer',p:0,lane:'v',x:b.cx,y:b.cy+b.gh/2+1};b.door=60;b.offline=true;
 H.step(120);assert.ok(b.hold);assert.equal(b.door,60);assert.equal(g.units.length,0);
 b.offline=false;H.step(120);assert.ok(g.units.some(u=>u.type==='lancer'));
});

test('power cycling does not release a queue paused by the player',()=>{
 const {H,g,buildings}=setup(),q=g.side[0].queues.v;q.list.push('lancer');H.step(30);
 q.pause=true;const prog=q.prog;buildings.factory.offline=true;H.step(30);
 buildings.factory.offline=false;H.step(30);assert.equal(q.prog,prog);assert.equal(q.pause,true);
 q.pause=false;H.step(30);assert.ok(q.prog>prog);
});
