'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox');
const {source}=require('./tools/lib/bundle-for-vm');

test('renovated terrain remains symmetric, connected and deterministic across seeds',()=>{
 const W=load(source),H=W.__rtsTest,T=W.__rtsTables,A=H.api;
 for(const map of Object.keys(T.MAPS))for(const seed of [1,10,42,4242,90210]){
  const g=A.newState(seed,'normal',map),other=A.newState(seed,'normal',map);
  assert.deepEqual(g.terrain,other.terrain,map+' deterministic terrain');
  for(let i=0;i<4096;i++){
   assert.equal(g.gm[i],g.gm[4095-i],map+' material mirror');
   assert.equal(g.hf[i],g.hf[4095-i],map+' elevation mirror');
  }
  const [a,b]=g.start;
  assert.ok(A.astar(g,a.x,a.y,b.x,b.y)?.length,map+' seed '+seed+' land route');
  for(const s of g.start)for(let y=s.y-5;y<=s.y+5;y++)for(let x=s.x-5;x<=s.x+5;x++)
   assert.ok([T.TER.GROUND,T.TER.ROAD].includes(g.terrain[y*64+x]),map+' buildable deployment pad');
  if(map==='river'){
   assert.equal(g.bridges.length,6);
   for(const span of g.bridges)assert.equal(span.cells.length,8);
   const huts=g.blds.filter(b=>b.type==='bhut');assert.equal(huts.length,4);
   for(const b of huts)assert.notEqual(g.terrain[b.y*64+b.x],T.TER.WATER);
  }
  if(map==='coastal'){
   assert.ok(Array.from(g.terrain).filter(t=>t===T.TER.WATER).length>1100,'broad navigable bay');
   assert.equal(new Set(Array.from(g.wzone).filter(Boolean)).size,1,'one connected sea');
  }
  if(map==='gems'){
   assert.equal(g.hf[31*64+31],1,'plateau summit');
   assert.equal(g.hf[22*64+22],0,'rounded corner is low ground');
  }
 }
});

test('raised plateau remains selectable at each playable zoom',()=>{
 const H=load(source).__rtsTest;
 H.startWith(4242,'normal','gems',{});H.centerOn(31,31);
 for(const z of [.75,1,1.5,2]){
  H.zoom(z);
  for(let y=26;y<=37;y++)for(let x=26;x<=37;x++){
   const screen=H.toScreen(x,y),cell=H.fromScreen(screen.x,screen.y);
   assert.ok(Math.abs(cell.x-x)<.01&&Math.abs(cell.y-y)<.01,`zoom ${z}: ${x},${y} -> ${cell.x},${cell.y}`);
  }
 }
});

test('Gem Valley keeps a clear summit spine and two independent lowland routes',()=>{
 const W=load(source),H=W.__rtsTest,T=W.__rtsTables,A=H.api;
 for(const seed of [1,42,4242,90210]){
  const g=A.newState(seed,'normal','gems');
  for(const x of [19,31,44])for(let y=18;y<=45;y++){
   const i=y*64+x;
   assert.ok([T.TER.ROAD,T.TER.RAMP].includes(g.terrain[i]),`clear route ${x},${y}`);
   assert.equal(g.occ[i],0,`no neutral building blocks ${x},${y}`);
   assert.equal(g.ore[i],0,'no resource on traffic spine');
  }
  for(let i=0;i<4096;i++){
   assert.equal(g.terrain[i],g.terrain[4095-i],'authored terrain mirror');
   assert.equal(g.ore[i],g.ore[4095-i],'resource mirror');
  }
  for(const [x,y,kind,height] of [[27,30,T.TER.GEM,1],[36,33,T.TER.GEM,1],[14,38,T.TER.ORE,0],[49,25,T.TER.ORE,0]]){
   assert.equal(g.terrain[y*64+x],kind,'intended resource pocket');
   assert.equal(g.hf[y*64+x],height,'summit gems versus lowland ore');
   for(const start of g.start)assert.ok(A.astar(g,start.x,start.y,x,y)?.length,'both players can contest each pocket');
  }
  // A defended summit must not be the only way across the map.
  for(let y=22;y<=41;y++)for(let x=22;x<=41;x++)g.terrain[y*64+x]=T.TER.CLIFF;
  for(const x of [19,44]){
   const p=A.astar(g,x,18,x,45);
   assert.ok(p?.length,'flank survives closure of summit');
  }
 }
});
