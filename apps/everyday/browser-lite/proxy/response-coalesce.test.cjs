'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough,Writable}=require('node:stream');
const {coalesce}=require('./response-coalesce.cjs');
function sink() {
  const writes=[];let ended=false;
  const target=new Writable({write(chunk,_e,done){writes.push(chunk.toString());done();}});
  target.on('finish',()=>{ended=true;});
  return {target,writes,ended:()=>ended};
}
test('a small body that arrives in pieces leaves in one write',async()=>{
  const source=new PassThrough(),{target,writes,ended}=sink();
  coalesce(source,target,{windowMs:30});
  source.write('{"axid": "y-');source.write('abc"');source.end('}');
  await new Promise(resolve=>target.on('finish',resolve));
  assert.deepEqual(writes,['{"axid": "y-abc"}']);assert.ok(ended());
});
test('a slow stream flows after the first window instead of waiting for the end',async()=>{
  const source=new PassThrough(),{target,writes}=sink();
  coalesce(source,target,{windowMs:20});
  source.write('data: 1\n\n');
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.deepEqual(writes,['data: 1\n\n']);
  source.write('data: 2\n\n');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes,['data: 1\n\n','data: 2\n\n']);source.end();
});
test('the cap flushes a large burst at once and streams the rest',async()=>{
  const source=new PassThrough(),{target,writes}=sink();
  coalesce(source,target,{limit:8,windowMs:1000});
  source.write('12345');source.write('67890');source.write('abc');source.end();
  await new Promise(resolve=>target.on('finish',resolve));
  assert.deepEqual(writes,['1234567890','abc']);
});
test('a client that goes away stops the upstream body',async()=>{
  const source=new PassThrough(),{target}=sink();
  coalesce(source,target,{windowMs:1000});
  source.write('x');target.destroy();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(source.destroyed);
});
