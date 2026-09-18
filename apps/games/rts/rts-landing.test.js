'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
function setup(kind){
 const W=load(source),H=W.__rtsTest,g=H.begin(4242,'normal','coastal'),T=W.__rtsTables.TER;
 g.units.length=0;g.blds.length=0;g.occ.fill(0);g.terrain.fill(T.WATER);g.ore.fill(0);
 for(let y=28;y<=36;y++)for(let x=28;x<=36;x++)g.terrain[y*64+x]=T.GROUND;
 const tr=H.spawn(kind,0,25,25);
 for(let i=0;i<4;i++)H.board(tr,H.spawn('rifle',0,25,25));
 return {H,g,T,tr};
}
for(const kind of ['lcraft','apc'])test(kind+' cannot unload across open water but can unload at a connected beach',()=>{
 const {H,g,T,tr}=setup(kind);
 assert.equal(H.unload(tr),0,'passengers cannot jump several water cells to the island');
 assert.equal(tr.pax.length,4);
 tr.x=27;tr.y=31;H.step(3);
 assert.equal(H.unload(tr),4,'an adjacent beach permits landing');
 const men=g.units.filter(u=>!u.dead&&u.type==='rifle');
 assert.equal(men.length,4);
 assert.ok(men.every(u=>g.terrain[Math.round(u.y)*64+Math.round(u.x)]===T.GROUND));
 assert.equal(new Set(men.map(u=>u.x+','+u.y)).size,4);
});
test('unloading cannot place passengers on the other side of a cliff ring',()=>{
 const {H,g,T,tr}=setup('lcraft');g.terrain.fill(T.GROUND);tr.x=30;tr.y=30;
 for(let y=29;y<=31;y++)for(let x=29;x<=31;x++)if(x!==30||y!==30)g.terrain[y*64+x]=T.CLIFF;
 H.step(3);
 assert.equal(H.unload(tr),0,'no walkable exit from the transport');
 assert.equal(tr.pax.length,4);
});

test('a small beach unloads only those who fit and retains the remaining passengers',()=>{
 const {H,g,T,tr}=setup('lcraft');g.terrain.fill(T.WATER);
 g.terrain[25*64+26]=T.GROUND;g.terrain[25*64+27]=T.GROUND;
 H.step(3);
 assert.equal(H.unload(tr),2);assert.equal(tr.pax.length,2);
 H.step(3);
 g.terrain[25*64+28]=T.GROUND;g.terrain[25*64+29]=T.GROUND;
 assert.equal(H.unload(tr),2);assert.equal(tr.pax.length,0);
 const men=g.units.filter(u=>!u.dead&&u.type==='rifle');
 assert.equal(men.length,4,'nobody is lost on a partial landing');
 assert.equal(new Set(men.map(u=>u.x+','+u.y)).size,4,'later passengers cannot overlap earlier arrivals');
});

test('a miner can land with its vehicle identity, health and rank intact',()=>{
 const {H,g,tr}=setup('lcraft');
 const miner=H.spawn('chronominer',0,25,25);miner.hp=300;miner.rank=2;
 assert.equal(H.board(tr,miner),true);
 assert.equal(H.unload(tr),0,'vehicles cannot jump across water either');
 tr.x=27;tr.y=31;H.step(3);
 assert.equal(H.unload(tr),5);
 const back=g.units.find(u=>!u.dead&&u.type==='chronominer');
 assert.ok(back);assert.equal(back.hp,300);assert.equal(back.rank,2);
 assert.equal(tr.pax.length,0);
});
