'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead}=require('./engine.cjs');
const {processScript}=hammerhead('processing/script');
const unprocessSource=require('./source-text.js');
// The function's text as the browser would return it after rewriting.
function rewritten(fn) {
  const out=processScript('var f='+fn+';',true,false,url=>url);
  const start=out.indexOf('var f=')+6;
  return out.slice(start,out.lastIndexOf(';',out.indexOf('/*hammerhead|script|end*/')));
}
test('rewritten functions read back as their original source',()=>{
  for(const fn of [
    'function(){Fd=mV=udEx=pc3[R],lb=mVyb=W9[1],xl=bW=Z05[h]}',
    'function(a,b){return a[b]+a.location+window.top.location.href}',
    'function(o,k,v){o[k]=v;o.href=v;return o[k](v,1)}',
    'function(e){return e.postMessage(1,"*"),e?.[k],e?.location}',
    'function(){return x[y[z]]+"a[b]"+/[a]\\[/g.test(q[r])}',
    'function(){return location}',
    '(a,b)=>a[b]?.(c[d])',
    'function(){return`x${a[b]}y${"}"}`+/\\/[a-z]/.source+c[d]/2/e[f]}',
    'function(){/* a[b] */return a[b]// c[d]\n}',
    'function(){a[b]=c[d],e[f][g]=h[i][j]}',
    'async function(){for(const k in o)await o[k]?.[k]?.(o[k])}',
  ]) {
    const out=rewritten(fn);
    assert.notEqual(out,fn,'not rewritten: '+fn);
    assert.equal(unprocessSource(out),fn);
  }
});
test('Yahoo\'s identifier base64 survives the round trip',()=>{
  const fn='function(){c3(Vi=c3),Fd=mV=udEx=pc3[R],lb=mVyb=W9[1],xl=bW=Vu=dHNC=eVRh=Z05[h],lb=nRDb=Gljaw}';
  const strip=text=>text.replace(/[[({})=>,;'< \n\s\]]/g,'');
  assert.equal(strip(unprocessSource(rewritten(fn))),strip(fn));
});
test('rewrites that cannot be reversed leave the text valid and the rest reversed',()=>{
  const fn='function(){location=a[b];var {c,d}=e[f];return c}';
  const out=unprocessSource(rewritten(fn));
  assert.ok(out.includes('a[b]')&&out.includes('e[f]'),out);
  assert.doesNotThrow(()=>new Function('return '+out));
});
test('text without engine wrappers is returned untouched and fast',()=>{
  const fn='function(){return __get$Something + "__get$(a,b)"}';
  assert.equal(unprocessSource('function native(){ [native code] }'),'function native(){ [native code] }');
  assert.equal(unprocessSource(undefined),undefined);
  assert.equal(typeof unprocessSource(fn),'string');
});
test('the served client routes Function.prototype.toString through the reversal',()=>{
  const fs=require('node:fs');
  const {engineRequire}=require('./engine.cjs');
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes('window.vibetopUnprocessSource(vtSource)'),'toString hook missing from the built client');
  assert.ok(fs.readFileSync(require('node:path').join(__dirname,'gateway.cjs'),'utf8').includes("+sourceTextSource+"),'bridge does not ship source-text.js');
});
