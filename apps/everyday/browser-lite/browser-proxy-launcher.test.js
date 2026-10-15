'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'browser-proxy-launcher.js'),'utf8');
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const CHROME='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
function run({ua,embedded,platform='MacIntel',touch=0}) {
  const el=()=>({hidden:true,textContent:'',remove(){this.removed=true;},prepend(){},append(){},submit(){}});
  const nodes={browser:el(),cover:el(),message:el(),retry:el()};
  const calls={fetch:0,open:[]};
  const window={addEventListener(){},open:(...args)=>calls.open.push(args)};
  window.parent=embedded?{}:window;
  const document={getElementById:id=>nodes[id],body:el(),createElement:()=>el()};
  const ctx={window,document,navigator:{userAgent:ua,platform,maxTouchPoints:touch},location:{href:'https://main.example/browser-lite.html',origin:'https://main.example'},
    crypto:{randomUUID:()=>'id'},fetch:()=>{calls.fetch++;return new Promise(()=>{});},AbortSignal:{timeout:()=>null},setTimeout,clearTimeout,URL};
  vm.runInNewContext(source,ctx);
  return {nodes,calls};
}
test('inside Vibetop on iPhone, Lite opens in its own tab without an opener',()=>{
  const {nodes,calls}=run({ua:IPHONE,embedded:true,platform:'iPhone',touch:5});
  assert.equal(calls.fetch,0,'must not sign in inside the shared-thread frame');
  assert.ok(nodes.browser.removed);assert.equal(nodes.retry.hidden,false);
  nodes.retry.onclick();
  assert.deepEqual(calls.open,[['https://main.example/browser-lite.html','_blank','noopener']]);
});
test('iPadOS reporting a desktop Mac still opens a tab',()=>{
  const {calls,nodes}=run({ua:IPHONE.replace('iPhone; CPU iPhone OS 18_7 like Mac OS X','Macintosh; Intel Mac OS X 10_15_7'),embedded:true,touch:5});
  assert.equal(calls.fetch,0);assert.equal(nodes.retry.hidden,false);
});
test('in its own tab, and in Chromium, Lite embeds as before',()=>{
  assert.equal(run({ua:IPHONE,embedded:false,platform:'iPhone',touch:5}).calls.fetch,1);
  assert.equal(run({ua:CHROME,embedded:true}).calls.fetch,1);
});
