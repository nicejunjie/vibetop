'use strict';
const fs=require('node:fs');
function patchWorkerOrigins(engineRequire) {
 const file=engineRequire.resolve('testcafe-hammerhead/lib/client/worker-hammerhead.js');
 let source=fs.readFileSync(file,'utf8');

 const bootstrap='WorkerHammerhead._overrideImportScripts();';
 if(source.split(bootstrap).length!==2)throw new Error('Worker importScripts bootstrap anchor changed');
 if(!source.includes('if (!self.__vtModuleEntry) '+bootstrap))source=source.replace(bootstrap,'if (!self.__vtModuleEntry) '+bootstrap);
 function replaceChecked(before,after) {
  if(source.includes(after))return;
  if(source.split(before).length!==2)throw new Error('Worker physical location anchor changed');
  source=source.replace(before,()=>after);
 }
 replaceChecked('return globalContextInfo.global.location.toString();',
  'return vtWorkerNativeHref ? vtWorkerNativeHref.call(globalContextInfo.global.location) : globalContextInfo.global.location.toString();');
 replaceChecked("if (self.location.protocol !== 'blob:')",
  "if ((vtWorkerNativeProtocol ? vtWorkerNativeProtocol.call(self.location) : self.location.protocol) !== 'blob:')");
 replaceChecked('parseUrl(self.location.origin)',
  'parseUrl(vtWorkerNativeOrigin ? vtWorkerNativeOrigin.call(self.location) : self.location.origin)');
 const anchor='var index = new WorkerHammerhead();';
 if(source.split(anchor).length!==2)throw new Error('Worker origin patch anchor changed');
 const start='/* vt-worker-origin-start */',end='/* vt-worker-origin-end */';
 if(source.includes(start)){source=source.slice(0,source.indexOf(start))+source.slice(source.indexOf(end)+end.length).replace(/^\n/,'');}
 else if(source.includes(' var vtWorkerOrigins =')){source=source.slice(0,source.indexOf(' var vtWorkerOrigins ='))+source.slice(source.indexOf(anchor));}
 const patch=`${start}

 var vtWorkerPrototype=Object.getPrototypeOf(self.location);
 var vtWorkerNativeHref=Object.getOwnPropertyDescriptor(vtWorkerPrototype,'href').get;
 var vtWorkerNativeProtocol=Object.getOwnPropertyDescriptor(vtWorkerPrototype,'protocol').get;
 var vtWorkerNativeOrigin=Object.getOwnPropertyDescriptor(vtWorkerPrototype,'origin').get;
 var vtWorkerPhysicalHref=vtWorkerNativeHref.call(self.location);
 var vtWorkerOrigins = Object.create(null);
 var vtOriginalWorkerProxyUrl = getProxyUrl;
 function vtMapWorkerOrigin(origin) {
   if (vtWorkerOrigins[origin]) return vtWorkerOrigins[origin];
   var physicalOrigin = new nativeMethods.URL(vtWorkerPhysicalHref).origin;
   try {
     var xhr = new nativeMethods.XMLHttpRequest();
     nativeMethods.xhrOpen.call(xhr,'GET',physicalOrigin+'/__vt/map?origin='+encodeURIComponent(origin),false);
     nativeMethods.xhrSend.call(xhr);
     if (xhr.status !== 200) throw new TypeError('Worker origin mapping failed');
     return vtWorkerOrigins[origin] = JSON.parse(xhr.responseText).physical;
   }catch(error){throw new TypeError('Worker origin mapping failed');}
 }
 getProxyUrl = function(url,options) {
   var prior=parseProxyUrl(url);
   if(prior && prior.sessionId===settings.get().sessionId)url=prior.destUrl;
   var result = vtOriginalWorkerProxyUrl(url,options);
   var parsed = parseProxyUrl(result);
   if (!parsed || !/^https?:/.test(parsed.destUrl)) return result;
   var physical = vtMapWorkerOrigin(new URL(parsed.destUrl).origin);
   var rewritten = new URL(result);
   if(parseResourceType(parsed.resourceType).isWebSocket)physical=physical.replace(/^http/,'ws');
   return physical + rewritten.pathname + rewritten.search + rewritten.hash;
 };
 self.__vtWorkerProxyUrl=function(url,baseUrl){
   try {
     if(typeof url==='symbol')throw new TypeError('Module URL cannot be a Symbol');
     url=String(url);
     var normalized=(${require('./module-specifier.cjs').normalizeModuleSpecifier.toString()})(url,nativeMethods.URL);
     if(normalized===null)return url;
     url=normalized;
     if(!/^(?:\\/|\\.\\/|\\.\\.\\/)/.test(url) && !/^https?:/.test(url))throw new TypeError('Browser Lite module scheme is not supported');
     var graph=String(settings.get().windowId||'').split('~').length===3;
     return getProxyUrl(baseUrl?new URL(url,baseUrl).href:url,{resourceType:stringifyResourceType({isScript:true,isWorkerModule:graph}),charset:graph?'utf-8':undefined});
   }catch(error){return {[Symbol.toPrimitive]:function(){throw error;}};}
 };
 // Workers do not receive the window WebSocket sandbox. Route their native
 // constructor through the same origin mapper, preserving prototype/statics.
 if(nativeMethods.WebSocket) {
   var vtSocketUrls=new WeakMap();
   var vtNativeSocket=nativeMethods.WebSocket;
   var vtSocketWrapper=new Proxy(vtNativeSocket,{construct:function(target,args,newTarget){
     if(!args.length)return Reflect.construct(target,args,newTarget);
     if(typeof args[0]==='symbol')throw new TypeError('WebSocket URL cannot be a Symbol');
     var input=String(args[0]),destination;
     var entry=parseProxyUrl(vtWorkerPhysicalHref);
     try{destination=new nativeMethods.URL(input,entry?entry.destUrl:undefined);}catch(error){throw new DOMException('Invalid WebSocket URL','SyntaxError');}
     if(destination.protocol==='http:')destination.protocol='ws:';
     if(destination.protocol==='https:')destination.protocol='wss:';
     if(!/^wss?:$/.test(destination.protocol) || destination.href.indexOf('#')!==-1)throw new DOMException('Invalid WebSocket URL','SyntaxError');
     var mapped=getProxyUrl(destination.href,{resourceType:stringifyResourceType({isWebSocket:true})});
     var socket=Reflect.construct(target,args.length>1?[mapped,args[1]]:[mapped],newTarget===vtSocketWrapper?target:newTarget);
     vtSocketUrls.set(socket,destination.href);return socket;
   }});
   var vtSocketDescriptor=Object.getOwnPropertyDescriptor(vtNativeSocket.prototype,'url');
   if(vtSocketDescriptor && vtSocketDescriptor.configurable)Object.defineProperty(vtNativeSocket.prototype,'url',Object.assign({},vtSocketDescriptor,{get:function(){var value=vtSocketDescriptor.get.call(this);return vtSocketUrls.get(this)||value;}}));
   Object.defineProperty(vtNativeSocket.prototype,'constructor',{value:vtSocketWrapper,writable:true,configurable:true});
   self.WebSocket=vtSocketWrapper;
 }
 ${end}
 `;
 const oldRouting="Object.defineProperty(self,'__vtWorkerRouting',{value:Object.freeze({sessionId:settings.get().sessionId,windowId:settings.get().windowId})}); self.__vtWorkerRuntimeReady=true; /* vt-worker-routing */";
 const routing="Object.defineProperty(self,'__vtWorkerRouting',{value:Object.freeze({sessionId:settings.get().sessionId,windowId:settings.get().windowId,physicalHref:vtWorkerPhysicalHref})}); self.__vtWorkerRuntimeReady=true; /* vt-worker-routing */";
 if(source.includes(oldRouting))source=source.replace(oldRouting,routing);
 if(!source.includes('/* vt-worker-routing */'))source=source.replace(anchor,()=>anchor+'\n '+routing);
 const locationStart='/* vt-worker-location-start */',locationEnd='/* vt-worker-location-end */';
 if(source.includes(locationStart))source=source.slice(0,source.indexOf(locationStart))+source.slice(source.indexOf(locationEnd)+locationEnd.length);
 const install=require('./worker-location.cjs').installWorkerLocation.toString();
 source=source.replace(routing,()=>routing+"\n "+locationStart+" var vtWorkerEntry=parseProxyUrl(vtWorkerPhysicalHref); var vtWorkerOriginal=vtWorkerEntry?vtWorkerEntry.destUrl:(typeof self[INSTRUCTION.getWorkerSettings]==='function'?self[INSTRUCTION.getWorkerSettings]().originalUrl:null); if(vtWorkerOriginal)("+install+")(vtWorkerOriginal,nativeMethods.URL); "+locationEnd);
 fs.writeFileSync(file,source.replace(anchor,()=>patch+anchor));
 // Each imported module has its own lexical helper declarations. Delegate to
 // the worker bootstrap instead of leaving its dynamic-import helper a no-op.
 for(const header of [engineRequire.resolve('testcafe-hammerhead/lib/processing/script/header.js'),engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js')]){
   const before='function(u,d){return u}',after="function(u,d){return typeof self!=='undefined' && self.__vtWorkerProxyUrl?self.__vtWorkerProxyUrl(u,d):u}";
   let text=fs.readFileSync(header,'utf8');
   if(text.includes(after))continue;
   if(text.split(before).length!==2)throw new Error('Worker import header anchor changed');
   fs.writeFileSync(header,text.replace(before,()=>after));
 }

}
module.exports={patchWorkerOrigins};
