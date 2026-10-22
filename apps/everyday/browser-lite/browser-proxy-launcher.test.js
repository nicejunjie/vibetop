'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'browser-proxy-launcher.js'),'utf8');
// Run the launcher against stub DOM; `status` is what the bootstrap returns.
async function run({embedded,status}) {
  const el=()=>({hidden:true,textContent:'',remove(){},prepend(){},append(){},submit(){}});
  const nodes={browser:el(),cover:el(),message:el(),retry:el()};
  const calls={fetch:0,replaced:null};
  const window={addEventListener(){}};
  window.parent=embedded?{}:window;
  const location={href:'https://main.example/browser-lite.html',pathname:'/browser-lite.html',origin:'https://main.example',replace:url=>{calls.replaced=url;}};
  const fetch=async()=>{calls.fetch++;return {ok:status===200,status,json:async()=>({error:'Open Browser Lite from your HTTPS Vibetop session.'})};};
  vm.runInNewContext(source,{window,document:{getElementById:id=>nodes[id],body:el(),createElement:()=>el()},location,
    crypto:{randomUUID:()=>'id'},fetch,AbortSignal:{timeout:()=>null},setTimeout,clearTimeout,URL});
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,calls};
}
test('its own home-screen app, not yet signed in, goes to the Vibetop login and back',async()=>{
  const {calls}=await run({embedded:false,status:401});
  assert.equal(calls.replaced,'/login.html?next=%2Fbrowser-lite.html');
});
test('inside Vibetop a failed sign-in is reported in place, never redirected',async()=>{
  const {calls,nodes}=await run({embedded:true,status:401});
  assert.equal(calls.replaced,null);
  assert.match(nodes.message.textContent,/Vibetop session/);assert.equal(nodes.retry.hidden,false);
});
