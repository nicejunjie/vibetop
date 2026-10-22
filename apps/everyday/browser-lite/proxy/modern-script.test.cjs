'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {hammerhead}=require('./engine.cjs');
const {rewriteImportMap}=require('./import-map.cjs');
const {processScript}=hammerhead('processing/script');
test('top-level await does not silently bypass module URL rewriting',()=>{
  const output=processScript('import x from "https://cdn.example/x.js"; await x();',true,false,url=>'https://proxy.example/'+url);
  assert.ok(output.includes('https://proxy.example/https://cdn.example/x.js'));
});
test('class fields keep their keys and uninitialized fields emit valid JS',()=>{
  for(const source of ['class Example { location; postMessage; eval; constructor(){ this.location = 1; } }',
    'const example = new class { location; field; method(){return document.location;} };']) {
    const transformed=processScript(source,true,false);
    assert.doesNotThrow(()=>new vm.Script(transformed));
  }
});
test('bare module specifiers remain available to native import maps',()=>{
  const transformed=processScript('import React from "react"; import value from "./value.js";',true,false,url=>'https://proxy.example/s/https://site.example/'+url);
  assert.match(transformed,/from\s+"react"/);
  assert.ok(transformed.includes('https://proxy.example/s/https://site.example/./value.js'));
});
test('import maps rewrite values, URL keys and scopes without corrupting JSON',()=>{
  const result=JSON.parse(rewriteImportMap(JSON.stringify({imports:{react:'./react.js','./old.js':'./new.js',blocked:null},scopes:{'./components/':{react:'./alt.js'}}}),url=>'https://proxy/'+url));
  assert.equal(result.imports.react,'https://proxy/./react.js');
  assert.equal(result.imports['https://proxy/./old.js'],'https://proxy/./new.js');
  assert.equal(result.imports.blocked,null);
  assert.equal(result.scopes['https://proxy/./components/'].react,'https://proxy/./alt.js');
});

test('private field reads, writes and methods retain native semantics',()=>{
  const source=`new class {
    #value = 3; #map = new Map(); #method() { return this.#value; }
    run() { this.#value += 2; this.#map.set('answer', this.#method()); return this.#map.get('answer'); }
  }().run()`;
  const transformed=processScript(source,false,false);
  assert.doesNotMatch(transformed,/__get\$\(this,"(?:value|map|method)"/);
  assert.equal(vm.runInNewContext(transformed),5);
});

test('regenerating a destructured function retains private-member syntax',()=>{
  const source=`new class { #call({x}) { return x+1; } run({x}) { return this.#call?.({x}); } }().run({x:4})`;
  const transformed=processScript(source,false,false);
  assert.equal(vm.runInNewContext(transformed),5);
});
test('regenerated async generator methods keep both async and *',()=>{
  // Hammerhead regenerates whole nodes around some rewrites, which turned
  // TradingView's `async*createInterval(){...await...}` into a syntax error.
  const {engineRequire}=require('./engine.cjs');
  const {createRequire}=require('node:module');
  const hhRequire=createRequire(engineRequire.resolve('testcafe-hammerhead/package.json'));
  const {generate}=hhRequire('esotope-hammerhead');
  const {parse}=hhRequire('acorn-hammerhead');
  for(const source of ['class A{async*g(){await x;yield 1}static async*[k](){await y}}','({async*g(){await x;yield 1},*h(){yield 2},async i(){await z}})']) {
    const output=generate(parse(source,{ecmaVersion:13}));
    assert.doesNotThrow(()=>new vm.Script(output),output);
    assert.match(output,/async\s*\*\s*g/);
  }
  const fs=require('node:fs');
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes("($expr.value.async ? 'async ' : '') + '*'")&&client.includes("($val.async ? 'async ' : '') + '*'"),'client generator unpatched');
});
test('scripted images and video posters go through the proxy in the client',()=>{
  // Svelte clones <img> from templates, so the per-element createElement flag
  // never applied; posters were not a URL attribute at all.
  const fs=require('node:fs');
  const {engineRequire}=require('./engine.cjs');
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes("el[INTERNAL_PROPS.forceProxySrcForImage] || settings$1.get().forceProxySrcForImage) {"),'image setting unpatched');
  assert.ok(client.includes("poster: ['video'], /* vt */"),'poster not a URL attribute');
  assert.ok(client.includes("this.overrideUrlAttrDescriptors('poster', [window.HTMLVideoElement]);"),'poster property unpatched');
});
test('the engine setAttribute lets the page bridge adjust a value first',()=>{
  const fs=require('node:fs');
  const {engineRequire}=require('./engine.cjs');
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes('window.vibetopAttributeValue(el, attr, value)'),'setAttributeCore hook missing');
  const bridge=fs.readFileSync(require('node:path').join(__dirname,'client-bridge.js'),'utf8');
  assert.ok(bridge.includes('window.vibetopAttributeValue = function'),'bridge does not define the hook');
  assert.ok(!bridge.includes('Element.prototype.setAttribute = function'),'a bridge setAttribute wrapper is replaced by the engine and never runs');
});
test('rewritten method calls do not route through a page-replaced Function.prototype.call',()=>{
  const fs=require('node:fs');
  const {engineRequire}=require('./engine.cjs');
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  const start=client.indexOf('var vtReflectApply = Reflect.apply;');
  assert.ok(start>=0,'fastApply unpatched');
  const end=client.indexOf('\n\t}',start)+3;
  const fastApply=new Function(client.slice(start,end)+'\nreturn fastApply;')();
  const realCall=Function.prototype.call;
  let depth=0;
  // A page override whose own calls would be rewritten back into __call$.
  Function.prototype.call=function(...a){if(++depth>50)throw new RangeError('recursed');try{return fastApply(this,'apply',[a[0],a.slice(1)]);}finally{depth--;}};
  try {
    const obj={n:2,add(x,y){return this.n+x+y;}};
    assert.equal(fastApply(obj,'add',[3,4]),9);
    assert.equal(depth,0,'Function.prototype.call was consulted');
  } finally {Function.prototype.call=realCall;}
});
test('a unary operator over an exponentiation keeps its parentheses when regenerated',()=>{
  // The argument's text has no parentheses of its own; only the unary did.
  for(const source of ['var v = e => e >= 0 ? e ** .5 : -(Math.abs(e[k]) ** .5);','x = +(a[b] ** 2) * -(c[d] ** -(e[f] ** 2));','y = typeof (a[b] ** 2);']) {
    const transformed=processScript(source,true,false);
    assert.ok(transformed.includes('__get$('),'regenerated: '+transformed);
    assert.doesNotThrow(()=>new vm.Script(transformed),transformed);
  }
  const client=require('node:fs').readFileSync(require('./engine.cjs').engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes("$expr.argument.operator === '**'"),'the client copy of the generator carries the same fix');
});
