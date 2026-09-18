'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(){const W=load(source),H=W.__rtsTest,g=H.begin(281711,'normal');g.ai=null;g.terrain.fill(W.__rtsTables.TER.GROUND);g.occ.fill(0);g.units.length=0;return{W,H,g};}
test('neither amphibious transport accepts warships, sea creatures or other transports',()=>{
 const {W,H,g}=setup();
 for(const type of ['lcraft','apc']){
  const tr=H.spawn(type,0,20,20);
  for(const [key,d] of Object.entries(W.__rtsTables.UNITS))if(d.cls==='n'){
   const u=H.spawn(key,0,21,20);assert.equal(H.api3.canBoard(g,tr,u),false,type+' must not carry '+key);
  }
 }
});
test('land infantry, tanks and harvesters still fit their intended transport classes',()=>{
 const {H,g}=setup(),tr=H.spawn('lcraft',0,20,20),ifv=H.spawn('ifv',0,25,20);
 for(const key of ['rifle','lancer','chronominer'])assert.equal(H.api3.canBoard(g,tr,H.spawn(key,0,21,20)),true,key);
 assert.equal(H.api3.canBoard(g,ifv,H.spawn('rifle',0,26,20)),true);
 assert.equal(H.api3.canBoard(g,ifv,H.spawn('lancer',0,26,20)),false);
});
test('an invalid naval boarding order loaded from an older save is cleared',()=>{
 const {H,g}=setup(),tr=H.spawn('lcraft',0,20,20),ship=H.spawn('destroyer',0,15,15);
 ship.order={t:'enter',id:tr.id,x:0,y:0};H.step(1);
 assert.equal(ship.order,null);assert.equal(ship.path,null);assert.equal(tr.pax.length,0);assert.equal(ship.dead,false);
});
