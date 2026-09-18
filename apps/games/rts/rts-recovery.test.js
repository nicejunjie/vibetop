'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./tools/lib/vm-sandbox'),{source}=require('./tools/lib/bundle-for-vm');
for(const fac of ['dir','col'])test(fac+' building repair charges its own faction price',()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(7201,'normal');g.side[0].fac=fac;
 const st=g.start[0];H.build('base',0,st.x,st.y);
 const b=H.build('power',0,st.x+5,st.y+5);b.make=0;b.hp=b.maxhp/2;b.repair=true;
 const before=g.side[0].credits;H.step(610);
 assert.equal(b.hp,b.maxhp);assert.equal(b.repair,false);
 const expected=H.api.bspecFor('power',fac).cost*0.15*0.5;
 assert.ok(Math.abs(before-g.side[0].credits-expected)<0.001,
  `charged ${before-g.side[0].credits}, expected ${expected}`);
});

test('a captured reactor retains its faction price and the last repair tick is prorated',()=>{
 const W=load(source),H=W.__rtsTest,g=H.begin(7202,'normal');g.side[0].fac='col';
 const st=g.start[0];H.build('base',0,st.x,st.y);
 const b=H.build('power',0,st.x+5,st.y+5);b.make=0;
 // A captured structure keeps its own faction even in an Allied house.
 g.side[0].fac='dir';assert.equal(b.fac,'col');
 b.hp=b.maxhp-1;b.repair=true;
 const before=g.side[0].credits;H.step(12);
 assert.equal(b.hp,b.maxhp);assert.equal(b.repair,false);
 assert.ok(Math.abs(before-g.side[0].credits-600*0.15/b.maxhp)<0.001,
  'charge only for the missing point, using the captured reactor price');
});
