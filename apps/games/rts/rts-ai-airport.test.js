'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
for(const fac of ['dir','col'])test('AI uses a captured airport even without another charged superweapon: '+fac,()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(160916,'normal');g.side[0].fac=fac;
 g.terrain.fill(W.__rtsTables.TER.GROUND);g.occ.fill(0);
 H.build('base',0,8,8);H.build('base',1,50,50);H.build('power',0,14,8);
 const airport=H.build('airport',0,18,8);g.blds.forEach(b=>b.make=0);
 H.spawn(fac==='col'?'warminer':'chronominer',0,12,16);H.spawn('warminer',1,48,45);
 H.attachAI(0,'normal');H.swCharge(0,'para');airport.offline=true;
 H.step(125);assert.equal(g.side[0].sw.para.fired,0,'disabled airport remains disabled');
 airport.offline=false;H.step(125);
 assert.equal(g.side[0].sw.para.fired,1);assert.equal(g.side[0].sw.para.ready,false);
 assert.equal(g.drops.length,1);assert.equal(g.drops[0].type,fac==='col'?'conscript':'rifle');
 assert.equal(g.terrain[Math.round(g.drops[0].y)*64+Math.round(g.drops[0].x)],W.__rtsTables.TER.GROUND);
 H.step(300);assert.equal(g.side[0].sw.para.fired,1,'cannot spend the same charge twice');
 assert.ok(g.units.filter(u=>u.p===0&&u.type===(fac==='col'?'conscript':'rifle')).length>0);
});
