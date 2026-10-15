'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {installStageTiming}=require('./stage-timing.cjs');
test('slow requests log host, kind and stage times, never the URL',async()=>{
  const lines=[];
  const stages=[async function fast(ctx){ctx.goToNextStage=true;},async function slow(ctx){await new Promise(r=>setTimeout(r,30));ctx.goToNextStage=false;}];
  installStageTiming(stages,{threshold:20,log:line=>lines.push(line)});
  installStageTiming(stages,{threshold:20,log:line=>lines.push('twice')});
  const ctx={dest:{host:'example.com',url:'https://example.com/secret?token=1'},contentInfo:{isScript:true}};
  for(const stage of stages){await stage(ctx);if(!ctx.goToNextStage)break;}
  assert.equal(lines.length,1);
  assert.match(lines[0],/^Browser slow request host=example\.com kind=script total=\d+ fast=\d+ slow=\d+$/);
  assert.ok(!lines[0].includes('secret') && !lines[0].includes('token'));
  const quick={dest:{host:'example.com'}};
  installStageTiming(stages,{threshold:1e9,log:line=>lines.push(line)});
  await stages[0](quick);
  assert.equal(lines.length,1);
});
