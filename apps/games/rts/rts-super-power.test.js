'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
for(const [key,type] of [['chrono','chrono'],['storm','weather'],['curtain','curtain'],['nuke','nuke'],['para','airport']]){
 test(key+' pauses its countdown while its charger is manually OFF',()=>{
  const W=load(source),H=W.__rtsTest,g=H.begin(9901,'normal');g.ai=null;
  H.build('base',0,5,5);H.build('base',1,55,55);
  for(let i=0;i<4;i++)H.build('power',0,5+i*4,10);
  const b=H.build(type,0,25,25);b.make=0;H.step(10);
  const st=H.sw(0)[key],t=st.t;assert.ok(t>0);
  b.offline=true;H.step(120);assert.equal(st.t,t);
  H.swCharge(0,key);assert.equal(H.swFire(0,key,35,35,40,40),false);
  assert.equal(st.ready,true,'shutdown retains the earned charge');
  b.offline=false;assert.equal(H.swFire(0,key,35,35,40,40),true);
 });
}
test('another enabled charger keeps the shared timer running; losing all resets it',()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(9902,'normal');g.ai=null;
 H.build('base',0,5,5);H.build('base',1,55,55);
 for(let i=0;i<4;i++)H.build('power',0,5+i*4,10);
 const a=H.build('chrono',0,25,25),b=H.build('chrono',0,35,25);a.make=b.make=0;
 a.offline=true;H.step(120);assert.equal(H.sw(0).chrono.t,120);
 b.offline=true;H.step(120);assert.equal(H.sw(0).chrono.t,120);
 H.killBld(a);H.killBld(b);H.step(1);assert.equal(H.sw(0).chrono.t,0);
});
