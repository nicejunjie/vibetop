'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {engineRequire}=require('./engine.cjs');
const {tabRoot}=require('./top-level-patch.cjs');
const realm=n=>'https://bl-u1000-'+n+'.example.test';
function frame(hostname,ancestors,parent){
  const win={location:{hostname,ancestorOrigins:ancestors},parent};
  win.window=win;return win;
}
function rootOf(win){return vm.runInNewContext('('+tabRoot+')()',{window:win,Object});}
test('the tab root is the topmost frame under Lite UI',()=>{
  const ui={},root=frame('bl-u1000-aa.example.test',['https://browser-lite.example.test','https://vibetop.example.test'],ui);
  assert.equal(rootOf(root),root);
  const child=frame('bl-u1000-bb.example.test',[realm('aa'),'https://browser-lite.example.test','https://vibetop.example.test'],root);
  assert.equal(rootOf(child),root);
  const grandchild=frame('bl-u1000-cc.example.test',[realm('bb'),realm('aa'),'https://browser-lite.example.test'],child);
  assert.equal(rootOf(grandchild),root);
});
test('other users\' realms and other domains are not part of the tab',()=>{
  const ui={},root=frame('bl-u1000-aa.example.test',['https://bl-u1001-zz.example.test'],ui);
  assert.equal(rootOf(root),root);
  const other=frame('bl-u1000-aa.example.test',['https://bl-u1000-zz.evil.test'],ui);
  assert.equal(rootOf(other),other);
});
test('without ancestorOrigins nothing is emulated',()=>{
  assert.equal(rootOf(frame('bl-u1000-aa.example.test',undefined,{})),null);
  assert.equal(rootOf(frame('www.example.test',[],{})),null);
});
test('the engines instrument top and parent for page code only',()=>{
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.match(client,/'location', 'top', 'parent',/);
  assert.match(client,/ top: \{ condition: isWindow,/);
  assert.match(client,/if \(vtNativeReferrer && !parseProxyUrl\(vtNativeReferrer\)\) return '';/);
  const {PROPERTIES}=require(engineRequire.resolve('testcafe-hammerhead/lib/processing/script/instrumented.js'));
  assert.deepEqual(PROPERTIES,['href','location','top','parent']);
  const worker=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/worker-hammerhead.js'),'utf8');
  assert.doesNotMatch(worker,/vt-top-level/);
});
const {hammerhead}=require('./engine.cjs');
function processed(source){return hammerhead('processing/script').processScript(source,false,false,url=>url);}
// A tab: native top (Vibetop) > Lite UI > tab root > child. Page code sees the
// root as top and as its own parent, through both instrumented forms.
function tabWorld(){
  const nativeTop={name:'vibetop'},ui={name:'ui',parent:nativeTop},root={name:'root',parent:ui},child={name:'child',parent:root};
  nativeTop.parent=nativeTop;
  const windows=new Set([nativeTop,ui,root,child]);
  const get=(owner,key)=>!windows.has(owner)?owner[key]:key==='top'?root:key==='parent'&&owner===root?root:owner[key];
  return {nativeTop,root,child,context:win=>({__get$:get,__set$:(o,k,v)=>(o[k]=v),__call$:(o,k,a)=>o[k](...a),__get$Loc:l=>l,__set$Loc:(l,v)=>v,
    __vt$top:v=>v===nativeTop?root:v,__vt$parent:v=>win===root&&v===win.parent?root:v,top:nativeTop,parent:win.parent,self:win,window:win})};
}
test('a walk up to bare `top` ends at the tab root instead of looping forever',()=>{
  const code=processed('var r=[],o=window;for(;o!==top;){r.push(o);o=o.parent;if(r.length>50)break;}var result=[r.length,self===top,parent===self];');
  assert.match(code,/__vt\$top\(top\)/);
  const {root,child,context}=tabWorld();
  const atChild=context(child);vm.runInNewContext(code,atChild);
  assert.equal(JSON.stringify(atChild.result),'[1,false,false]');
  const atRoot=context(root);vm.runInNewContext(code,atRoot);
  assert.equal(JSON.stringify(atRoot.result),'[0,true,true]');
});
test('a local `top` or `parent` keeps its own value and every syntax form still compiles',()=>{
  const code=processed([
    'function f(top,parent){return top+parent;}','const {top:t1}={top:3};','let [p1]=[4];','var o={top:1,parent:2,[`x`]:3};',
    'top:for(;;){break top;}','var s=typeof top;','class K{top(){return 1;} static parent=2;}','var el={style:{}};el.style.top="5px";',
    'try{}catch(top){}','for(var k in {}){}','var result=[f(1,2),t1,p1,o.top,s,el.style.top,(function(){const top=7;return top;})()];'].join('\n'));
  assert.doesNotThrow(()=>new vm.Script(code));
  const {root,context}=tabWorld();const ctx=context(root);vm.runInNewContext(code,ctx);
  assert.equal(JSON.stringify(ctx.result),'[3,3,4,1,"object","5px",7]');
});
test('the client bundle carries the same transformer and its helpers',()=>{
  const client=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.equal(client.split("name: 'vt-top-parent-get'").length,2);
  assert.match(client,/Object\.defineProperty\(window, '__vt\$top'/);
  assert.match(client,/Object\.defineProperty\(window, '__vt\$parent'/);
});
