'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {hammerhead}=require('./engine.cjs');
const {processScript}=hammerhead('processing/script');
const cases=require('./optional-chain-cases.cjs');
function result(source){try{return {value:JSON.stringify(vm.runInNewContext(source))};}catch(error){return {error:error.name};}}
for(const [name,source] of Object.entries(cases))test('optional chains: '+name,()=>{
 const expected=result(source),processed=processScript(source,true,false);
 assert.deepEqual(result(processed),expected,processed);
});
for(const [name,source] of Object.entries({
 'direct eval still binds in default-parameter scope':`(function(arg=({replace(){}})?.replace(eval('var leaked=1'))){return typeof leaked;})()`,
 'arguments cannot replace the already captured method':`(()=>{const x={replace(){return 42;}};return x?.replace(x.replace=()=>99);})()`,
 'a function apply property is not consulted':`(()=>{function f(){return 42;}f.apply=()=>99;return ({replace:f})?.replace();})()`,
 'non-strict delete retains false result':`(()=>{const x={};Object.defineProperty(x,'href',{value:1});return delete x?.href;})()`
}))test('optional chains: '+name,()=>assert.deepEqual(result(processScript(source,true,false)),result(source)));
test('optional chains: concurrent async arrows keep each receiver across await',async()=>{
 const source=`(async()=>{const tasks=[];const f=async n=>({value:n,replace(v){return [this.value,v];}})?.replace(await new Promise(resolve=>tasks.push(()=>resolve(n+10))));const a=f(1),b=f(2);tasks[1]();tasks[0]();return Promise.all([a,b]);})()`;
 const native=await vm.runInNewContext(source),processed=await vm.runInNewContext(processScript(source,true,false));
 assert.equal(JSON.stringify(processed),JSON.stringify(native));
});

test('optional chains: repeated processing does not lower the carrier again',()=>{
 for(const source of Object.values(cases)){
  const once=processScript(source,false,false),twice=processScript(once,false,false);
  assert.equal((twice.match(/__vtChain\(/g)||[]).length,(once.match(/__vtChain\(/g)||[]).length,source);
  assert.deepEqual(result(processScript(twice,true,false)),result(source),source);
 }
});
test('optional chains: instrumented eval arguments remain processed inside guards',()=>{
 for(const source of ['a?.eval(source)','a?.child.eval(source).href','a?.eval.call(a,source)','a?.eval.apply(a,[source])'])
  assert.match(processScript(source,false,false),/__proc\$Script\(/,source);
 for(const source of ['a?.eval.bind(a)','a?.postMessage.bind(a)','a?.postMessage.call(a,message,"*")'])
  assert.match(processScript(source,false,false),/\.p\("(?:eval|postMessage)",[23]\)/,source);
});
test('optional chains: ordinary uninstrumented chains avoid carrier allocations',()=>{
 for(const source of ['a?.b.c','a?.b?.c','f?.(x)','a?.map(f)'])assert.equal(processScript(source,false,false),source);
});

test('optional chains: wrapped bare eval processes arguments exactly once',()=>{
 for(const source of ['eval?.(source)','eval?.call(null,source)','eval?.apply(null,[source])','(eval?.call)(null,source)','(eval?.apply)(null,[source])']){
  const processed=processScript(source,false,false);
  assert.equal((processed.match(/__get\$Eval\(/g)||[]).length,1,source);
  assert.doesNotMatch(processed,/__proc\$Script\(/,source);
 }
});
test('optional chains: tagged eval adapters process the substitution',()=>{
 for(const [method,mode] of [['call',1],['apply',2]]){
  const source='(window?.eval.'+method+')`tag${source}`';
  assert.match(processScript(source,false,false),new RegExp('false,'+mode+'\\)'));
 }
});
