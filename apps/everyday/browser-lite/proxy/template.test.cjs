'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead,engineRequire}=require('./engine.cjs');
test('the page walk reaches elements inside <template>, nested ones included',()=>{
  const parse5=engineRequire(engineRequire.resolve('parse5',{paths:[engineRequire.resolve('testcafe-hammerhead/package.json')]}));
  const {walkElements}=hammerhead('utils/parse5');
  const root=parse5.parse('<!doctype html><body><template><img src="https://pixel.example/a"><template><img src="https://deep.example/b"></template><script>x()</script></template><img src="https://outside.example/c"></body>');
  const seen=[];
  walkElements(root,el=>{if(el.tagName==='img')seen.push(el.attrs.find(a=>a.name==='src').value);if(el.tagName==='script')seen.push('script');});
  assert.deepEqual(seen.sort(),['https://deep.example/b','https://outside.example/c','https://pixel.example/a','script']);
});
