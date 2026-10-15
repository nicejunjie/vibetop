'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {engineRequire}=require('./engine.cjs');
const {createScriptWorkers}=require('./script-workers.cjs');
const processPath=engineRequire.resolve('testcafe-hammerhead/lib/processing/script/index.js');
const {processScript}=require(processPath);
const pad='var filler="'+'x'.repeat(40000)+'";\n';
const SAMPLES=[
  pad+'import a from "./a.js";export {b} from "https://cdn.example/b.js";import("./lazy.js").then(m=>m.go(location.href));',
  pad+'var w=window.top;for(var o=window;o!==top;o=o.parent){}eval("x");postMessage("m","*");document.cookie="a=1";',
  pad+'class K{#p=1;static s=2;get v(){return this.#p}}const {top:t}=r;label:for(;;){break label;}`tpl ${location}`;',
];
const resolver=(url,type)=>'https://bl-u1-'+Buffer.from(String(url)).toString('hex').slice(0,16)+'.example.test/S*W'+(type?'!'+type:'')+'/'+new URL(url,'https://site.example/app/page.html').href;
test('worker rewriting is byte-identical to main-thread rewriting',async()=>{
  const workers=createScriptWorkers({processPath,size:2});
  try {
    for(const script of SAMPLES) {
      const viaWorker=await workers(script,resolver,undefined,false);
      assert.equal(typeof viaWorker,'string');
      assert.equal(viaWorker,processScript(script,true,false,resolver,undefined,false));
    }
    const results=await Promise.all(SAMPLES.concat(SAMPLES).map(script=>workers(script,resolver,undefined,false)));
    results.forEach((code,i)=>assert.equal(code,processScript(SAMPLES[i%SAMPLES.length],true,false,resolver,undefined,false)));
  } finally {await workers.close();}
});
test('small scripts, unsafe substitutions and broken input stay on the main thread',async()=>{
  const workers=createScriptWorkers({processPath,size:1});
  try {
    assert.equal(await workers('var a=1;',resolver),null);
    assert.equal(await workers(SAMPLES[0],()=>'https://x.example/"quoted"'),null);
    assert.equal(typeof await workers(pad+'var = ;;; syntax error (',resolver),'string');
  } finally {await workers.close();}
});
