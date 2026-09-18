'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(){
 const W=load(source),H=W.__rtsTest,g=H.begin(9801,'normal');g.ai=null;
 g.terrain.fill(W.__rtsTables.TER.GROUND);g.ore.fill(0);
 H.build('base',0,5,5);H.build('base',1,55,55);
 const base=H.build('airforce',0,15,15);base.make=0;
 const plane=H.spawn('harrier',0,15,15);
 return{H,g,base,plane};
}
test('an offline airfield does not reload or repair a parked Harrier',()=>{
 const {H,base,plane}=setup();plane.ammo=0;plane.hp=50;base.offline=true;
 H.step(1200);assert.equal(plane.ammo,0);assert.equal(plane.hp,50);
 base.offline=false;H.step(1200);assert.ok(plane.ammo>0);assert.ok(plane.hp>50);
});
test('a fully armed grounded aircraft relocates when its airfield is destroyed',()=>{
 const {H,g,base,plane}=setup(),other=H.build('airforce',0,25,25);other.make=0;
 H.killBld(base);H.step(600);
 assert.equal(plane.pad,other.id);assert.equal(plane.landed,true);
 const slot=H.padSlot(other,plane.slot);assert.ok(Math.hypot(plane.x-slot.x,plane.y-slot.y)<0.1);
});
test('a stranded armed aircraft returns when a replacement airfield becomes available',()=>{
 const {H,base,plane}=setup();H.killBld(base);H.step(120);
 assert.equal(plane.landed,false);
 const other=H.build('airforce',0,25,25);other.make=0;H.step(600);
 assert.equal(plane.pad,other.id);assert.equal(plane.landed,true);
});
test('displaced aircraft reserve distinct replacement slots',()=>{
 const {H,g,base,plane}=setup();
 const second=H.spawn('harrier',0,15,15),other=H.build('airforce',0,25,25);other.make=0;
 H.killBld(base);H.step(900);
 assert.equal(plane.pad,other.id);assert.equal(second.pad,other.id);
 assert.notEqual(plane.slot,second.slot);assert.ok(plane.landed&&second.landed);
});
test('an explicit move overrides the displaced aircraft return intent',()=>{
 const {H,base,plane}=setup();H.killBld(base);H.step(10);
 plane.order={t:'move',x:35,y:35};H.step(900);
 assert.equal(plane.rtb,false);assert.equal(plane.order,null);
 assert.ok(Math.hypot(plane.x-35,plane.y-35)<1);
});
test('capture of the home airfield relocates its parked aircraft',()=>{
 const {H,base,plane}=setup(),other=H.build('airforce',0,25,25);other.make=0;
 base.p=1;H.step(900);assert.equal(plane.pad,other.id);assert.equal(plane.landed,true);
});
