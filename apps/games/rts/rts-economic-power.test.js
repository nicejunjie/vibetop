'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function scene(){
 const W=load(source),H=W.__rtsTest,g=H.begin(9910,'normal');g.ai=null;
 g.terrain.fill(W.__rtsTables.TER.GROUND);g.ore.fill(0);
 H.build('base',0,5,5);H.build('base',1,55,55);
 return{W,H,g};
}
test('manual shutdown stops oil income and hospital healing until reactivated',()=>{
 const {H,g}=scene(),oil=H.build('oilderrick',0,20,20),hospital=H.build('hospital',0,30,30);
 oil.make=hospital.make=0;oil.offline=hospital.offline=true;
 const u=H.spawn('rifle',0,29,30);u.hp=20;const cash=g.side[0].credits;
 H.step(300);assert.equal(g.side[0].credits,cash);assert.equal(u.hp,20);
 oil.offline=hospital.offline=false;H.step(300);
 assert.ok(g.side[0].credits>cash);assert.ok(u.hp>20);
});
test('offline purifier grants no bonus; online purifier restores it',()=>{
 const {H,g}=scene(),ref=H.build('refinery',0,20,20),pur=H.build('purifier',0,30,30);
 ref.make=pur.make=0;g.units.length=0;pur.offline=true;
 const dock=H.api3.refDock(g,ref),u=H.spawn('warminer',0,dock.x,dock.y);
 function deliver(){u.x=dock.x;u.y=dock.y;u.homeRef=ref;u.state='toref';u.cargo=100;u.cargoV=100;const cash=g.side[0].credits;H.step(1);return g.side[0].credits-cash;}
 assert.equal(deliver(),100);pur.offline=false;assert.equal(deliver(),125);
});
test('a loaded miner holds cargo at its disabled refinery and unloads after power-on',()=>{
 const {H,g}=scene(),ref=H.build('refinery',0,20,20);ref.make=0;g.units.length=0;ref.offline=true;
 const dock=H.api3.refDock(g,ref),u=H.spawn('warminer',0,dock.x,dock.y);
 u.homeRef=ref;u.state='toref';u.cargo=100;u.cargoV=100;const cash=g.side[0].credits;
 H.step(300);assert.equal(u.cargo,100);assert.equal(g.side[0].credits,cash);
 ref.offline=false;H.step(1);assert.equal(u.cargo,0);assert.equal(g.side[0].credits,cash+100);
});
for(const kind of ['warminer','chronominer'])test(kind+' can divert to an enabled refinery without losing cargo',()=>{
 const {H,g}=scene(),a=H.build('refinery',0,20,20),b=H.build('refinery',0,30,20);
 a.make=b.make=0;g.units.length=0;a.offline=true;
 const dock=H.api3.refDock(g,a),u=H.spawn(kind,0,dock.x,dock.y);
 u.homeRef=a;u.state='toref';u.cargo=100;u.cargoV=100;const cash=g.side[0].credits;
 H.step(900);assert.equal(u.homeRef.id,b.id);assert.equal(u.cargo,0);assert.equal(g.side[0].credits,cash+100);
});
test('explicit docking waits for its selected refinery instead of silently diverting',()=>{
 const {H,g}=scene(),a=H.build('refinery',0,20,20),b=H.build('refinery',0,30,20);
 a.make=b.make=0;g.units.length=0;a.offline=true;
 const dock=H.api3.refDock(g,a),u=H.spawn('warminer',0,dock.x,dock.y);
 u.homeRef=a;u.state='toref';u.forcedDock=true;u.cargo=100;u.cargoV=100;
 H.step(900);assert.equal(u.homeRef.id,a.id);assert.equal(u.cargo,100);
 a.offline=false;H.step(1);assert.equal(u.cargo,0);
});
test('a captured refinery cannot accept the former owner miner cargo',()=>{
 const {H,g}=scene(),a=H.build('refinery',0,20,20),b=H.build('refinery',0,30,20);
 a.make=b.make=0;g.units.length=0;
 const dock=H.api3.refDock(g,a),u=H.spawn('warminer',0,dock.x,dock.y);
 u.homeRef=a;u.state='toref';u.forcedDock=true;u.cargo=100;u.cargoV=100;
 a.p=1;H.step(1);assert.equal(u.cargo,100);assert.equal(u.homeRef.id,b.id);
 H.step(900);assert.equal(u.cargo,0);
});
test('a Chrono Miner does not teleport into a refinery captured during its charge',()=>{
 const {H,g}=scene(),ref=H.build('refinery',0,20,20);ref.make=0;g.units.length=0;
 const u=H.spawn('chronominer',0,40,40);u.homeRef=ref;u.state='warp';u.warpAt=0;u.cargo=100;u.cargoV=100;
 ref.p=1;H.step(1);assert.equal(u.x,40);assert.equal(u.y,40);assert.equal(u.cargo,100);
});
