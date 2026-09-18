'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function scene(kind){
 const W=load(source),H=W.__rtsTest,g=H.begin(81003,'normal');g.ai=null;
 g.terrain.fill(W.__rtsTables.TER.GROUND);g.ore.fill(0);
 H.build('base',0,5,5);H.build('base',1,55,55);H.build('power',0,10,10);
 const b=H.build(kind,0,25,25);b.make=0;
 const target=H.spawn('mcv',1,29,25);target.hp=target.maxhp=100000;
 function power(){H.cmd('power',{id:b.id});H.step(W.__rtsNet.delay()+1);}
 return{H,g,b,target,power};
}
for(const kind of ['tesla','prism','sentrygun'])test(kind+' manual power-off stops firing and power-on resumes',()=>{
 const {H,b,target,power}=scene(kind);H.step(240);
 assert.ok(target.hp<100000,'powered defence should engage');
 power();assert.equal(b.offline,true);H.step(90);
 const hp=target.hp;H.step(1100);
 assert.equal(target.hp,hp,'an offline defence must not keep shooting on a healthy grid');
 power();assert.equal(b.offline,false);H.step(240);
 assert.ok(target.hp<hp,'reenabled defence should reacquire its target');
});

test('an offline Prism Tower cannot support its active neighbour',()=>{
 const {H,b}=scene('prism');const support=H.build('prism',0,22,25);
 support.make=0;support.offline=true;H.step(300);
 assert.ok(!support.supAt,'switched-off tower must not supply support beams');
});

test('manual power-off cancels a pending Tesla charge',()=>{
 const {H,b}=scene('tesla');
 for(let i=0;i<600&&!b.charging;i++)H.step(1);
 assert.ok(b.charging>0);b.offline=true;H.step(1);
 assert.equal(b.charging,0);assert.equal(b.chgT,null);assert.equal(b.target,null);
});

test('an offline Service Depot pauses repairs and resumes when enabled',()=>{
 const {H,b}=scene('depot');const tank=H.spawn('rhino',0,b.cx+2,b.cy);tank.hp=100;
 H.step(60);assert.ok(tank.hp>100);b.offline=true;
 const hp=tank.hp;H.step(60);assert.equal(tank.hp,hp);
 b.offline=false;H.step(60);assert.ok(tank.hp>hp);
});
