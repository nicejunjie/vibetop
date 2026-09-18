'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox');
const {source}=require('./tools/lib/bundle-for-vm');

function fixture(kind,adjacent){
 const W=load(source),H=W.__rtsTest,g=H.begin(4242,'normal','gems'),T=W.__rtsTables;
 g.units.length=0;g.blds.length=0;g.occ.fill(0);g.terrain.fill(T.TER.GROUND);g.ore.fill(0);
 g.side[0].fac=kind==='warminer'?'col':'dir';
 H.build('base',0,5,5);H.build('base',1,52,52);H.build('refinery',0,10,10);
 for(const [x,y,n,t] of [[26,24,30,T.TER.GEM],[27,24,adjacent?700:0,T.TER.GEM],[15,12,900,T.TER.ORE]]){
  if(n){g.terrain[y*64+x]=t;g.ore[y*64+x]=n;}
 }
 const u=H.spawn(kind,0,26,24);H.orderMove([u],26,24);
 return {H,g,u};
}

for(const kind of ['chronominer','warminer'])test(kind+' keeps a manually chosen expansion after the clicked tile is exhausted',()=>{
 const {H,g,u}=fixture(kind,true);
 for(let n=0;n<6000&&g.side[0].harv===0;n++)H.step(1);
 assert.ok(g.side[0].harv>0,'first gem load delivered');
 for(let n=0;n<6000&&u.state!=='mining';n++)H.step(1);
 assert.equal(u.mineAt?.x,27,'use the adjacent gem seam, not the closer ore beside the refinery');
 assert.equal(u.mineAt?.y,24);
});

test('an exhausted expansion falls back to other ore rather than retrying an empty field',()=>{
 const {H,g,u}=fixture('chronominer',false);
 for(let n=0;n<6000&&g.side[0].harv===0;n++)H.step(1);
 assert.ok(g.side[0].harv>0);
 for(let n=0;n<6000&&u.state!=='mining';n++)H.step(1);
 assert.equal(u.mineAt?.x,15);assert.equal(u.mineAt?.y,12);
});

test('a seam emptied while travelling preserves the field order, but a new move replaces it',()=>{
 const {H,g,u}=fixture('chronominer',true);
 g.terrain[24*64+26]=0;g.ore[24*64+26]=0;
 H.step(2);
 assert.equal(u.order?.t,'harvest');assert.equal(u.order?.x,26,'keep the original field anchor');
 assert.equal(u.mineAt?.x,27,'choose the neighbouring seam');
 H.orderMove([u],18,28);H.step(1);
 assert.equal(u.order?.t,'move','explicit movement still overrides the mining assignment');
});
