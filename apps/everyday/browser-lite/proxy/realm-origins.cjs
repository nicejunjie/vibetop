'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {RealmRegistry,mainContext,childContext}=require('./realm-policy.cjs');
const {upstreamUrl}=require('./origin-policy.cjs');
const {hammerhead}=require('./engine.cjs');
const {parseResourceType,getResourceTypeString}=hammerhead('utils/url');
const workerModuleKind=getResourceTypeString({isScript:true,isWorkerModule:true});
// Adapter for the engine's global URL helpers. Request scope is asynchronous,
// never a mutable "last document" shared by simultaneous pages/CDN responses.
class RealmOrigins {
 constructor(config) {
  this.realms=new RealmRegistry(config);this.scope=new AsyncLocalStorage();
  Object.assign(this,{uid:config.uid,profile:config.profile,domain:config.domain,port:String(config.port||''),protocol:'https:',isRealm:true});
 }
 wrap(server) {
  for(const event of ['request','upgrade'])for(const listener of server.listeners(event)) {
   server.removeListener(event,listener);
   server.on(event,(req,...rest)=>this.scope.run({req},()=>listener.call(server,req,...rest)));
  }
 }
 realm(physical){return this.realms.original(physical);}
 original(physical){return this.realm(physical)?.origin||null;}
 recover(host,url,windowId) {
  return this.realms.recover(host,url,String(windowId||'').split('~')[0]);
 }
 current() {return this.scope.getStore()?.req?.vtRealm;}
 relay() {return this.scope.getStore()?.req?.vtRelayCapability || this.scope.getStore()?.authorization?.relay || this.relayCapability;}
 map(url,{resourceType,windowId,context}={}) {
  const owner=context || this.current()?.context || (windowId?this.realms.readContext(windowId.split('~')[0]):mainContext(url));
  const mapped=parseResourceType(resourceType).isIframe ? childContext(owner,url) : owner;
  const incoming=String(windowId || this.scope.getStore()?.req?.vtWindowId || '');
  if(parseResourceType(resourceType).isWorkerModule) {
   const fields=incoming.split('~');
   if(resourceType!==workerModuleKind || fields.length!==3 || !/^[A-Za-z0-9_-]+$/.test(fields[1]) || !/^[A-Za-z0-9_.-]+$/.test(fields[2]) || fields[0]!==this.realms.contextToken(mapped))
    throw new Error('Invalid worker module context');
   // The relay is descriptive here. Request admission independently checks
   // authentication; renewal must not silently change a native module identity.
   return {...this.realms.register(url,mapped),windowId:incoming};
  }
  const record=this.realms.register(url,mapped);
  const tab=incoming.split('~')[1];
  const relay=this.relay();
  return {...record,windowId:this.realms.contextToken(mapped)+'~'+(tab||'')+(relay?'~'+relay:'')};
 }
 register(url,context) {return this.map(url,{context}).physical;}
 verify(host,url) {
  const record=this.realm('https://'+host);
  try{return !!record && record.origin===upstreamUrl(url).origin;}catch{return false;}
 }
 entries() {return Object.fromEntries([...this.realms.records.values()].map(r=>[r.physical,{origin:r.origin,context:r.context}]));}
}
module.exports={RealmOrigins};
