'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture() {
 const window={crypto:require('node:crypto'),addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./trusted-controller.js'),'utf8'),{window,URL,console,setTimeout,clearTimeout});
 const frame={contentWindow:{},src:'',getAttribute(){return this.src;},remove(){}},requests=[];
 frame.contentWindow.location={replace(url){frame.src=url;}};
 const controller=new window.BrowserProxyController({frame,request:(command,body)=>new Promise((resolve,reject)=>requests.push({command,body,resolve,reject}))});
 return {frame,requests,controller};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function state(epoch=1){return {tabId:'tab',epoch,url:'https://site'+epoch+'.example/',origin:'https://physical'+epoch+'.example',entry:'https://physical'+epoch+'.example/entry?ticket='+epoch};}
test('overlapping address changes use the acknowledged server epoch',async()=>{
 const {controller:c,requests:r,frame}=fixture();
 const first=c.open('https://site1.example');await tick();
 const second=c.open('https://site2.example');r[0].resolve(state(1));await tick();
 assert.equal(frame.src,'');assert.equal(r[1].body.epoch,2);
 r[1].resolve(state(2));await Promise.all([first,second]);assert.equal(frame.src,state(2).entry);
});
test('only the current WindowProxy, exact physical origin and epoch can approve',async()=>{
 const {controller:c,requests:r,frame}=fixture();c.activate(state());
 const valid={source:frame.contentWindow,origin:state().origin,data:{type:'vibetop-browser-navigation',tabId:'tab',epoch:1,challenge:'opaque'}};
 await c.message({...valid,source:{}});await c.message({...valid,origin:'https://evil.example'});
 await c.message({...valid,data:{...valid.data,epoch:2}});assert.equal(r.length,0);
 const accepted=c.message(valid);await tick();assert.equal(r.length,1);
 await c.message(valid);assert.equal(r.length,1);r[0].resolve(state(2));await accepted;
 assert.equal(frame.src,state(2).entry);
});
test('a delayed approval cannot overwrite a newer address-bar navigation',async()=>{
 const {controller:c,requests:r,frame}=fixture();c.activate(state());
 const approval=c.message({source:frame.contentWindow,origin:state().origin,data:{type:'vibetop-browser-navigation',tabId:'tab',epoch:1,challenge:'opaque'}});
 await tick();const newer=c.open('https://site3.example');r[0].resolve(state(2));await tick();
 assert.equal(frame.src,state(1).entry);assert.equal(r[1].body.epoch,3);
 r[1].resolve(state(3));await Promise.all([approval,newer]);assert.equal(frame.src,state(3).entry);
});
test('a lost open response is recovered before a new epoch is sent',async()=>{
 const {controller:c,requests:r,frame}=fixture();
 const first=c.open('https://site1.example');await tick();r[0].reject(new Error('Connection lost'));await assert.rejects(first);
 const second=c.open('https://site2.example');await tick();assert.deepEqual(r[1].body,r[0].body);
 r[1].resolve(state(1));await tick();assert.equal(r[2].body.epoch,2);assert.equal(r[2].body.operation,2);
 r[2].resolve(state(2));await second;assert.equal(frame.src,state(2).entry);
});
test('Retry recovers the same approval instead of submitting the form again',async()=>{
 const {controller:c,requests:r,frame}=fixture();c.activate(state());
 const message=c.message({source:frame.contentWindow,origin:state().origin,data:{type:'vibetop-browser-navigation',tabId:'tab',epoch:1,challenge:'opaque'}});
 await tick();r[0].reject(new Error('Connection lost'));await message;
 const retry=c.retry();await tick();assert.deepEqual(r[1].body,r[0].body);assert.equal(r[1].command,'approve');
 r[1].resolve(state(2));await retry;assert.equal(frame.src,state(2).entry);
});
test('a refused first open resets the lane and Retry retains the typed address',async()=>{
 const {controller:c,requests:r}=fixture();const first=c.open('https://site1.example');await tick();
 const error=Object.assign(new Error('Too many tabs'),{definitive:true,reset:true});r[0].reject(error);await assert.rejects(first);
 const retry=c.retry();await tick();assert.equal(r[1].body.operation,1);assert.notEqual(r[1].body.clientId,r[0].body.clientId);
 assert.equal(r[1].body.url,'https://site1.example');r[1].resolve(state());await retry;
});
test('a lease expiry cannot be overwritten by a delayed old control response',async()=>{
 const {controller:c,requests:r}=fixture();const open=c.open('https://site1.example');await tick();c.expire();
 r[0].resolve(state());await assert.rejects(open,/session ended/);assert.equal(c.serverState,null);
});

function historyEvent(c,frame,overrides={}) {
 const data={type:'vibetop-browser',action:'state',tabId:c.state.tabId,epoch:c.state.epoch,nonce:c.nonce,url:c.state.url,title:'SPA',
   history:{documentId:'document-1',sequence:1,index:0,entries:[{id:'entry-1',url:c.state.url}]},...overrides};
 return {source:frame.contentWindow,origin:c.state.origin,data};
}
test('history snapshots bind to current frame, epoch and document handshake',async()=>{
 const {controller:c,frame}=fixture();c.activate(state());c.attach();
 const event=historyEvent(c,frame),oldNonce=c.nonce;
 await c.message({...event,source:{}});await c.message({...event,origin:'https://other.example'});
 await c.message(historyEvent(c,frame,{epoch:2}));assert.equal(c.state.history,undefined);
 await c.message(event);assert.equal(c.documentId,'document-1');
 c.attach();await c.message(event);assert.equal(c.documentId,null);assert.notEqual(c.nonce,oldNonce);
 await c.message(historyEvent(c,frame,{history:{...event.data.history,documentId:'document-2'}}));
 assert.equal(c.documentId,'document-2');
 await c.message(historyEvent(c,frame,{history:{...event.data.history,sequence:99}}));assert.equal(c.documentId,'document-2');
});
test('history rejects old sequence, foreign URLs, duplicate IDs and excessive snapshots',async()=>{
 const {controller:c,frame}=fixture();c.activate(state());c.attach();
 const event=historyEvent(c,frame);await c.message(event);
 for(const history of [
  {...event.data.history,sequence:0},
  {...event.data.history,entries:[{id:'evil',url:'https://other.example/'}]},
  {...event.data.history,entries:[...event.data.history.entries,...event.data.history.entries]},
  {...event.data.history,entries:Array.from({length:51},(_,i)=>({id:String(i),url:c.state.url}))}
 ]){await c.message(historyEvent(c,frame,{title:'invalid',history}));assert.equal(c.state.title,'SPA');}
});
test('only matching traversal acknowledgement completes navigation; new document cancels it',async()=>{
 const {controller:c,frame}=fixture();c.activate(state());c.attach();await c.message(historyEvent(c,frame));
 let sent;frame.contentWindow.postMessage=data=>{sent=data;};
 const pending=c.traverse('entry-1');assert.equal(sent.basisEntryId,'entry-1');
 const packet={source:frame.contentWindow,origin:c.state.origin,data:{...sent,type:'vibetop-browser',action:'traversed'}};
 await c.message({...packet,data:{...packet.data,requestId:'wrong'}});assert.ok(c.traversal);
 await c.message(packet);await pending;assert.equal(c.traversal,null);
 const cancelled=c.traverse('entry-1');c.attach();await assert.rejects(cancelled,/page changed/);
});

test('late iframe load after ready does not cancel a live same-document traversal',async()=>{
 const {controller:c,frame}=fixture();c.activate(state());
 await c.message({source:frame.contentWindow,origin:c.state.origin,data:{type:'vibetop-browser',action:'ready',tabId:'tab',epoch:1}});
 await c.message(historyEvent(c,frame));let sent;frame.contentWindow.postMessage=data=>{sent=data;};
 const pending=c.traverse('entry-1'),nonce=c.nonce;c.loadListener();assert.equal(c.nonce,nonce);assert.ok(c.traversal);
 await c.message({source:frame.contentWindow,origin:c.state.origin,data:{...sent,type:'vibetop-browser',action:'traversed'}});await pending;
 c.loadListener();assert.notEqual(c.nonce,nonce);
});

test('queued old-page navigation does not approve a stale epoch after reopen',async()=>{
 const {controller:c,requests:r,frame}=fixture();const errors=[];c.onError=e=>errors.push(e);c.activate(state());
 const open=c.open('https://site2.example');await tick();
 const approve=c.message({source:frame.contentWindow,origin:state().origin,data:{type:'vibetop-browser-navigation',tabId:'tab',epoch:1,challenge:'old-click'}});
 r[0].resolve(state(2));await Promise.all([open,approve]);assert.equal(r.length,1);assert.deepEqual(errors,[]);
});

test('old-page click recovers and activates a lost reopen without approving its stale epoch',async()=>{
 const {controller:c,requests:r,frame}=fixture();const errors=[];c.onError=e=>errors.push(e);c.activate(state());
 const open=c.open('https://site2.example');await tick();r[0].reject(new Error('Connection lost'));await assert.rejects(open);
 const approve=c.message({source:frame.contentWindow,origin:state().origin,data:{type:'vibetop-browser-navigation',tabId:'tab',epoch:1,challenge:'old-click'}});
 await tick();assert.equal(r[1].command,'open');assert.deepEqual(r[1].body,r[0].body);
 r[1].resolve(state(2));await approve;assert.equal(r.length,2);assert.deepEqual(errors,[]);assert.equal(frame.src,state(2).entry);
});
test('toolbar navigations replace the frame so the old page cannot cancel them',async()=>{
 const window={crypto:require('node:crypto'),addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./trusted-controller.js'),'utf8'),{window,URL,console,setTimeout,clearTimeout});
 const doc={createElement:()=>element()},parent={};
 function element(){
  const el={attrs:new Map(),listeners:new Set(),parentNode:parent,ownerDocument:doc,contentWindow:{},
   get attributes(){return [...el.attrs].map(([name,value])=>({name,value}));},
   setAttribute(name,value){el.attrs.set(name,value);if(name==='src')el.src=value;},getAttribute(name){return name==='src'?(el.src||null):el.attrs.get(name)??null;},
   addEventListener(_t,f){el.listeners.add(f);},removeEventListener(_t,f){el.listeners.delete(f);},
   replaceWith(next){el.parentNode=null;el.replacedBy=next;},remove(){}};
  el.contentWindow.location={replace(url){el.src=url;el.replaced=url;}};
  return el;
 }
 const first=element();first.setAttribute('sandbox','allow-scripts');first.setAttribute('title','Webpage');
 const frames=[],requests=[];
 const c=new window.BrowserProxyController({frame:first,onFrame:f=>frames.push(f),request:(command,body)=>new Promise(resolve=>requests.push({command,body,resolve}))});
 const one=c.open('https://site1.example');await tick();requests[0].resolve(state(1));await one;
 assert.equal(first.src,state(1).entry);assert.equal(frames.length,0);
 const two=c.open('https://site2.example');await tick();requests[1].resolve(state(2));await two;
 const fresh=first.replacedBy;
 assert.ok(fresh && frames[0]===fresh && c.frame===fresh);
 assert.equal(fresh.src,state(2).entry);assert.equal(first.replaced,undefined);
 assert.equal(fresh.getAttribute('sandbox'),'allow-scripts');assert.equal(fresh.getAttribute('title'),'Webpage');
 assert.equal(first.listeners.size,0);assert.equal(fresh.listeners.size,1);
});
