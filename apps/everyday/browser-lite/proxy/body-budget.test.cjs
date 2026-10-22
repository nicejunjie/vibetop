'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {BodyBudget}=require('./body-budget.cjs');
test('simultaneous incomplete uploads share capacity and release it on abort',async()=>{
 const budget=new BodyBudget({maxBytes:5,maxConcurrent:2}),a=new PassThrough(),b=new PassThrough();
 const first=budget.read(a),second=budget.read(b);
 a.write('123');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(budget.bytes,3);await assert.rejects(budget.read(new PassThrough()));
 const rejected=assert.rejects(second,/size limit/);b.write('456');await rejected;
 const aborted=assert.rejects(first);a.destroy(new Error('Disconnected'));await aborted;
 assert.equal(budget.bytes,0);assert.equal(budget.active,0);
});
