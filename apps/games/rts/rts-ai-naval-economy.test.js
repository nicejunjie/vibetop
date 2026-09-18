'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
for(const map of ['gems','frontier','coastal'])test('AI naval investment requires a connected front: '+map,()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(160916,'normal',map);
 H.attachAI(0,'normal');H.attachAI(1,'normal');H.step(2);
 for(const ai of [g.ai2,g.ai]){
  assert.equal(ai.shore,map==='coastal');assert.equal(ai.shoreAt,2);
  assert.equal(ai.shoreZones.length>0,map==='coastal');
 }
 // This is AI strategy, not a restriction on player construction.
 if(map==='gems')assert.equal(H.apiN.hasShore(g,0),true);
});
test('old saved proximity-only naval cache is recomputed',()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(160916,'normal','gems');
 H.attachAI(1,'normal');g.ai.shore=true;g.ai.shoreAt=1;
 const restored=H.loadBlob(H.saveBlob());H.step(2);
 assert.equal(restored.ai.shore,false);assert.equal(restored.ai.shoreAt,2);
});
