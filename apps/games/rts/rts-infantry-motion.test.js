'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(){const W=load(source),H=W.__rtsTest,g=H.begin(98212,'normal',null,false,true);g.ai=null;g.units.length=0;return{W,H,g};}
test('Tanya building attack uses C4 animation, not a pistol tracer; damage stays unchanged',()=>{
 const {H,g}=setup(),u=H.spawn('tanya',0,15,15),b=H.build('power',1,16,15);b.make=0;
 H.api3.fire(g,u,b);assert.equal(u.plantAt,g.tick);assert.equal(b.dead,true);
 assert.equal(H.infantrySequence(u,false).st,'plant');
 assert.equal(g.shots.length,0);
 for(let n=0;n<6;n++){g.tick=u.plantAt+n*4;assert.equal(H.infantrySequence(u,false).ph,n);}
 g.tick=u.plantAt+24;assert.notEqual(H.infantrySequence(u,false).st,'plant');
});
test('Tanya pistol fire does not become a planting action',()=>{
 const {H,g}=setup(),u=H.spawn('tanya',0,15,15),v=H.spawn('conscript',1,16,15);
 H.api3.fire(g,u,v);assert.equal(u.plantAt,undefined);assert.equal(H.infantrySequence(u,false).st,'fire');
 assert.equal(g.shots.length,1);
});
test('movement overrides C4 recovery without locking player orders',()=>{
 const {H,g}=setup(),u=H.spawn('tanya',0,15,15);u.plantAt=g.tick;
 assert.equal(H.infantrySequence(u,true).st,'walk');
});
test('a winning C4 strike finishes its planting action before victory cheering',()=>{
 const {H,g}=setup(),u=H.spawn('tanya',0,15,15);u.plantAt=g.tick;
 g.over=1;g.overAt=g.tick;
 assert.equal(H.infantrySequence(u,true).st,'plant');
 g.tick+=24;assert.equal(H.infantrySequence(u,false).st,'cheer');
});
test('down and up traverse six joint poses, including a transition at tick zero',()=>{
 const {H,g}=setup(),u=H.spawn('rifle',0,15,15);u.prone=true;u.downAt=0;
 for(let i=0;i<12;i++){g.tick=i;const s=H.infantrySequence(u,false);assert.equal(s.st,'down');assert.equal(s.ph,i>>1);}
 g.tick=12;assert.equal(H.infantrySequence(u,false).st,'prone');
 u.prone=false;u.upAt=12;
 for(let i=0;i<12;i++){g.tick=12+i;const s=H.infantrySequence(u,false);assert.equal(s.st,'up');assert.equal(s.ph,i>>1);}
 g.tick=24;assert.equal(H.infantrySequence(u,false).st,'stand');
});
