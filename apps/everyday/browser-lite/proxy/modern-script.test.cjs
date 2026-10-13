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
