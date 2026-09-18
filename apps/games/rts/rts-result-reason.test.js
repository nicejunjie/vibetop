'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
test('scorecard distinguishes economic concession from levelling a base, for either player seat',()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(160916);g.tick=57567;
 for(const me of [0,1]){
  g.side[me].deadFor=0;g.side[1-me].deadFor=4501;
  assert.equal(H.resultDetail(g,true,me),'Enemy economy collapsed at 15:59.');
  assert.equal(H.resultDetail(g,false,1-me),'Your economy collapsed at 15:59.');
  g.side[1-me].deadFor=0;
  assert.equal(H.resultDetail(g,true,me),'Enemy base levelled in 15:59.');
 }
});
