'use strict';
// Fixed, owned upstream sites only. This fixture cannot proxy the public web.
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const net = require('node:net');
const root = process.env.VT_TEST_PROXY_ROOT || path.resolve(__dirname,'../../../apps/everyday/browser-lite/proxy');
const {BrowserGateway} = require(path.join(root,'gateway.cjs'));
const {OriginRegistry} = require(path.join(root,'origin-policy.cjs'));
const {RealmOrigins} = require(path.join(root,'realm-origins.cjs'));
const {Capabilities} = require(path.join(root,'capability.cjs'));
const {EgressProxy} = require(path.join(root,'egress.cjs'));
const {WebSocketServer} = require(path.join(root,'engine.cjs')).engineRequire('ws');
const sites = ['a.source-one.test','b.source-two.test','c.source-three.test'];
const port = 18991, parentPort = 18992;
const options = {uid:1000,profile:'a'.repeat(32),secret:'fixture-only',domain:'realms.vt-proxy.example.com',protocol:'https:',port};
const registry = new (process.env.VT_REALM_TEST?RealmOrigins:OriginRegistry)(options);
const authority = new Capabilities({...options,epoch:1});
for (const hostname of sites) registry.register('http://'+hostname);
const seen = [],heldImages=new Set(),heldPages=new Set();let delayedVisits=0;
const source = http.createServer(async (req,res) => {
  const own = req.headers.host[0];
  const observation={host:req.headers.host,path:req.url,cookie:req.headers.cookie || '',origin:req.headers.origin,method:req.method};seen.push(observation);
  if(req.url.startsWith('/chain-shadow-alias-')){
    const index=Number(req.url.match(/alias-(\d+)/)[1]);
    const names=['globalThis','window','self','frames'].slice(0,index);
    res.setHeader('Content-Type','application/javascript');
    res.end(`const ${names.map(name=>name+'={}').join(',')}; document.body.dataset['alias'+${index}]=({location:{href:'local'}})?.location.href;export {};`);return;
  }
  if(req.url==='/chain-shadow-let.mjs'||req.url==='/chain-shadow-var.mjs'){
    const declaration=req.url.includes('-let')?'let':'var';
    res.setHeader('Content-Type','application/javascript');res.end(`${declaration} window={location:{href:'local'}};self.shadow${declaration}=window?.location.href;export {};`);return;
  }
  if(req.url==='/optional-chain.js' || req.url==='/optional-chain-worker.js'){
    const cases=require(path.join(root,'optional-chain-cases.cjs'));
    const checks=Object.entries(cases).map(([name,expression])=>`try{results[${JSON.stringify(name)}]={value:JSON.stringify(await (${expression}))};}catch(error){results[${JSON.stringify(name)}]={error:error.name};}`).join('\n');
    res.setHeader('Content-Type','application/javascript');
    res.end(`(async()=>{const results={};${checks}\nself.chainResults=results;${req.url.includes('worker')?'self.postMessage(results);':''}})();`);return;
  }
  if(req.url==='/optional-chain'){
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>Optional chain fixture</title><h1>Optional chains</h1><script src="/optional-chain.js"></script><script>
    new Worker('/optional-chain-worker.js').onmessage=e=>{window.workerChainResults=e.data;};
    window.chainMessages=[];addEventListener('message',e=>{if(e.origin==='http://b.source-two.test')window.chainMessages.push({data:e.data,origin:e.origin});});
    window.chainSend=function(kind){const target=frames[0],origin='http://b.source-two.test',data={kind};
      if(kind==='direct')target?.postMessage(data,origin);
      if(kind==='grouped')(target?.postMessage)(data,origin);
      if(kind==='tag')(target?.postMessage)\`tag\${origin}\`;
      if(kind==='call')target?.postMessage.call(target,data,origin);
      if(kind==='apply')target?.postMessage.apply(target,[data,origin]);
      if(kind==='bind')target?.postMessage.bind(target)(data,origin);
      if(kind==='value'){const send=target?.postMessage;send(data,origin);}
      if(kind==='optional-grouped')(target?.postMessage)?.(data,origin);
      if(kind==='grouped-call')(target?.postMessage.call)(target,data,origin);
      if(kind==='grouped-apply')(target?.postMessage.apply)(target,[data,origin]);
      if(kind==='grouped-bind')(target?.postMessage.bind)(target)(data,origin);
    };
    window.chainEval=function(){return [window?.eval('location.href'),({child:window})?.child.eval('location.href'),window?.eval.call(window,'location.href'),window?.eval.apply(window,['location.href']),window?.eval.bind(window)('location.href'),(window?.eval.call)(window,'location.href'),(window?.eval.apply)(window,['location.href']),(window?.eval.bind)(window)('location.href'),(window?.eval.call)?.(window,'location.href'),(window?.eval.call)\`tag\${'location.href'}\`,(window?.eval.apply)\`tag\${['location.href']}\`];};
    window.chainNavigate=function(kind){const target=frames[0],url='http://b.source-two.test/chain-child?'+kind;
      if(kind==='direct')target?.location.replace(url);
      if(kind==='grouped')(target?.location.replace)(url);
      if(kind==='optional-grouped')(target?.location.replace)?.(url);
      if(kind==='tag')(target?.location.replace)\`http://b.source-two.test/chain-child?tag\`;
    };
    </script><script type="module" src="/chain-shadow-let.mjs"></script><script type="module" src="/chain-shadow-var.mjs"></script><script type="module" src="/chain-shadow-alias-1.mjs"></script><script type="module" src="/chain-shadow-alias-2.mjs"></script><script type="module" src="/chain-shadow-alias-3.mjs"></script><script type="module" src="/chain-shadow-alias-4.mjs"></script><iframe src="http://b.source-two.test/chain-child"></iframe>`);return;
  }
  if(req.url.startsWith('/chain-child')){
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><h1>Chain child</h1><script>parent.postMessage({ready:location.href},'http://a.source-one.test');addEventListener('message',e=>{e.source.postMessage({kind:Array.isArray(e.data)?'tag':e.data.kind},e.origin);});</script>`);return;
  }
  if (req.url === '/api' || req.url.startsWith('/cors')) {
    if (req.url === '/cors-allow') res.setHeader('Access-Control-Allow-Origin','http://a.source-one.test');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({site:own,cookie:req.headers.cookie || ''}));return;
  }
  if(/^\/css-[abc]\.css$/.test(req.url)) {
    res.setHeader('Content-Type','text/css');
    res.end('#private-background { width:20px;height:20px;background-image:url("http://a.source-one.test/private-image?owner='+req.url[5]+'"); }');return;
  }
  if(req.url.startsWith('/private-image')) {
    res.setHeader('Content-Type','image/svg+xml');
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="'+(req.headers.cookie?.includes('private_a=secret_a')?'green':'red')+'"/></svg>');return;
  }
  if(req.url==='/worker-lab'){
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><h1>Worker laboratory</h1><script>document.cookie="worker_cookie=frompage; Path=/";window.runWorker=name=>new Promise(resolve=>{
                    let worker;const finish=value=>{clearTimeout(timer);worker?.terminate();resolve(value);};
                    const timer=setTimeout(()=>finish({error:'timeout'}),10000);
                    try{
                        if(name==='blobsocketrelative'){worker=new Worker(URL.createObjectURL(new Blob([\`try{new WebSocket('/socket');postMessage('opened');}catch(e){postMessage(e.name);}\`],{type:'text/javascript'})));}
                        else if(name==='blobunicode'||name==='blobstring'){const source='postMessage("你好🌍")';worker=new Worker(URL.createObjectURL(new Blob([name==='blobunicode'?new TextEncoder().encode(source):source],{type:'application/javascript'})));}
                        else worker=name==='blobdynamic'?new Worker(URL.createObjectURL(new Blob([new TextEncoder().encode("import('http://c.source-three.test/one/module.js').then(m=>postMessage(m.message));")],{type:'application/javascript'}))):new Worker('/worker-lab-'+name+'.js',name.startsWith('module')?{type:'module',credentials:name==='modulecredentialsomit'?'omit':name==='modulecredentialsinclude'?'include':'same-origin'}:{});
                        worker.onerror=e=>{e.preventDefault();finish(name==='moduleentryredirect'?'blocked':{error:e.message||'Worker error'});};
                        worker.onmessage=e=>finish((name==='bytes'||name==='modulebytes')?{bytes:Array.from(new Uint8Array(e.data)),detached:buffer.byteLength===0}:e.data);
                        var buffer;if(name==='bytes'||name==='modulebytes'){buffer=new Uint8Array([0,127,255]).buffer;worker.postMessage(buffer,[buffer]);}
                    }catch(e){finish({error:e.name+': '+e.message});}
                });
    window.workerFailure=function(kind,type='classic'){return new Promise(resolve=>{
      const url=kind==='mapping'?'http://worker-failure.source.test/worker.js':URL.createObjectURL(new Blob([new TextEncoder().encode('postMessage("source executed")')],{type:'text/javascript'}));
      if(kind==='revoked'||kind==='terminated')URL.revokeObjectURL(url);
      let worker;const handlers=[];const timer=setTimeout(()=>{worker?.terminate();resolve({stage:'timeout'});},5000);
      try{
        worker=new Worker(kind==='uppercase'?'BLOB:'+url.slice(5):kind==='whitespace'?' '+url:url,{type});
        worker.onerror=e=>{e.preventDefault();handlers.push('property');};
        worker.addEventListener('error',e=>{e.preventDefault();handlers.push('listener');clearTimeout(timer);worker.terminate();resolve({stage:'event',handlers});});
        worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve({stage:'message',value:e.data});};
        if(kind==='terminated'){worker.terminate();setTimeout(()=>{clearTimeout(timer);resolve({stage:'terminated',handlers});},100);}
      }catch(e){clearTimeout(timer);resolve({stage:'constructor',name:e.name});}
    });};
    window.workerErrors=function(){
      const run=fn=>{try{const worker=fn();worker?.terminate();return 'ok';}catch(error){return error.name;}};
      return {
        symbolUrl:run(()=>new Worker(Symbol('worker'))),
        malformedUrl:run(()=>new Worker('http://[')),
        crossOriginInvalid:run(()=>new Worker('http://invalid-options.source.test/worker.js',{type:'invalid'})),
        crossOrigin:run(()=>new Worker('http://b.source-two.test/worker-lab-bytes.js')),
        symbolName:run(()=>new Worker('/worker-lab-bytes.js',{name:Symbol('worker')})),
        invalidType:run(()=>new Worker('/worker-lab-bytes.js',{type:'invalid'})),
        invalidBlobType:run(()=>new Worker(URL.createObjectURL(new Blob([new TextEncoder().encode('postMessage(1)')],{type:'text/javascript'})),{type:'invalid'})),
        throwingBlobGetter:run(()=>new Worker(URL.createObjectURL(new Blob([new TextEncoder().encode('postMessage(1)')],{type:'text/javascript'})),{get credentials(){throw new RangeError('getter');}})),
        primitiveOptions:run(()=>new Worker('/worker-lab-bytes.js',1)),
        invalidCredentials:run(()=>new Worker('/worker-lab-bytes.js',{credentials:'invalid'})),
        withoutNew:run(()=>Worker('/worker-lab-bytes.js')),
        missingUrl:run(()=>new Worker()),
        nullOptions:run(()=>new Worker('/worker-lab-bytes.js',null))
      };
    };
    window.workerAbort=function(){
      const calls=[];let error;
      try{new Worker({toString(){calls.push('url');return 'http://invalid-options.source.test/worker.js';}}, {
        get credentials(){calls.push('credentials');return 'invalid';},
        get name(){calls.push('name');return 'unused';},
        get type(){calls.push('type');return 'classic';}
      });}catch(e){error=e.name;}
      return {calls,error};
    };
    window.workerOptions=function(){
      const calls=[];
      const url={toString(){calls.push('url');return '/worker-lab-bytes.js';}};
      const options={
        get credentials(){calls.push('credentials');return 'omit';},
        get name(){calls.push('name');return {toString(){calls.push('name value');return 'options probe';}};},
        get type(){calls.push('type');return 'classic';}
      };
      const worker=new Worker(url,options);worker.terminate();return calls;
    };
    </script>`);return;
  }
  if(req.url==='/worker-redirect/utf8-start.js'){res.writeHead(307,{Location:'/worker-redirect/utf8.js'});res.end();return;}
  if(req.url==='/worker-redirect/utf8.js'){res.setHeader('Content-Type','application/javascript; charset=windows-1252');res.end('export const message="你好🌍";');return;}
  if(req.url.startsWith('/worker-query.js')) {
    res.setHeader('Content-Type','application/javascript');
    res.end(req.url.includes('?leaf')?"export const value='query leaf';":"export async function load(){try{await import('?leaf');return 'loaded';}catch(e){return e.name==='TypeError'?'blocked':e.name;}}");return;
  }
  if(req.url.startsWith('/worker-proxy-base/')) {
    res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');
    res.end(req.url.endsWith('/leaf.js')?"export const value='proxy leaf';":"export async function load(){return (await import(new URL('./leaf.js',import.meta.url))).value;}");return;
  }
  if(req.url==='/worker-lab-moduleentryredirect.js'){res.writeHead(302,{Location:'http://c.source-three.test/worker-lab-module.js','Access-Control-Allow-Origin':'*'});res.end();return;}
  if(['/worker-redirect/static.js','/worker-redirect/dynamic.js'].includes(req.url)) {
    res.writeHead(302,{'Location':'/worker-redirect/final/dep.js','Access-Control-Allow-Origin':'*'});res.end();return;
  }
  if(req.url.startsWith('/worker-redirect/final/')) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/javascript');
    res.end(req.url.endsWith('/dep.js')?"export {value} from './sibling.js';":"export const value='redirect sibling';");return;
  }
  if(req.url.startsWith('/worker-lab-')&&req.url.endsWith('.js')){
    res.setHeader('Content-Type','application/javascript');
    const name=req.url.slice('/worker-lab-'.length,-3);
    const programs={
      fetch:`const r=await fetch('/api');postMessage(await r.json());`,
      omit:`const r=await fetch('/api',{credentials:'omit'});postMessage(await r.json());`,
      cors:`const r=await fetch('http://c.source-three.test/cors-allow');postMessage(await r.json());`,
      blocked:`try{await fetch('http://c.source-three.test/cors-blocked');postMessage('leaked');}catch(e){postMessage('blocked');}`,
      xhr:`const r=new XMLHttpRequest();r.open('GET','/api');r.onload=()=>postMessage(JSON.parse(r.responseText));r.onerror=()=>postMessage({error:'XHR failed'});r.send();`,
      dynamic:`const m=await import('/one/module.js');postMessage(m.message);`,
      dynamiccross:`const m=await import('http://c.source-three.test/one/module.js');postMessage(m.message);`,
      dynamicnested:`const m=await import('http://c.source-three.test/one/dynamic.js');postMessage(await m.load());`,
      dynamicblocked:`try{await import('http://c.source-three.test/worker-import.js');postMessage('leaked');}catch(e){postMessage('blocked');}`,
      dynamiceval:`const load=eval('(url)=>import(url)');const m=await load('http://c.source-three.test/one/module.js');postMessage(m.message);`,
      dynamicfunction:`const load=new Function('url','return import(url)');const m=await load('http://c.source-three.test/one/module.js');postMessage(m.message);`,
      location:`postMessage({isOriginal:location.href==='http://a.source-one.test/worker-lab-location.js',protocol:location.protocol,hostMatches:location.hostname==='a.source-one.test'});`,
      modulemappingfailure:`const result=[];let promise;try{promise=import('http://mapping-failure.source.test/leaf.js');result.push('promise');}catch(e){result.push('throw:'+e.name);}if(promise){try{await promise;result.push('loaded');}catch(e){result.push('reject:'+e.name);}}postMessage(result);`,
      moduleshadow:`const self={},Reflect={};const __vtModuleDispatch='site binding';const value=({location:7}).location;const module=await import('/one/module.js');postMessage([value,module.message,__vtModuleDispatch]);`,
      modulecontainmenttrusted:`self.__vtWorkerProxyUrl=u=>u;try{await import('https://ui.vt-proxy.example.com:18992/__test/trusted-module');postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentwasm:`const module=await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,10,1,6,97,110,115,119,101,114,0,0,10,6,1,4,0,65,42,11]));postMessage((await WebAssembly.instantiate(module)).exports.answer());`,
      modulecontainmentblobfetch:`const url=URL.createObjectURL(new Blob(['worker blob']));try{postMessage(await (await fetch(url)).text());}finally{URL.revokeObjectURL(url);}`,
      modulecontainmentdatafetch:`postMessage(await (await fetch('data:text/plain,worker%20data')).text());`,
      modulecontainmentnested:`const url=self.location.href.replace('worker-lab-modulecontainmentnested.js','worker-lab-containmentchild.js').replace('!sm!utf-8/','!s/');const child=new Worker(url);child.onmessage=e=>{postMessage(e.data);child.terminate();};child.onerror=e=>{e.preventDefault();postMessage('child error');};`,
      containmentchild:`try{await new Function("return fetch('http://c.source-three.test/cors-allow')")();postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentglobal:`self.__vtWorkerProxyUrl=u=>u;try{await import('http://c.source-three.test/one/module.js');postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentassignment:`__get$ProxyUrl=u=>u;await import('http://c.source-three.test/one/module.js');postMessage('loaded');`,
      modulecontainmentsocketerrors:`const out={};const cases={noNew:()=>WebSocket('/socket'),missing:()=>new WebSocket(),symbol:()=>new WebSocket(Symbol()),malformed:()=>new WebSocket('http://['),fragment:()=>new WebSocket('ws://a.source-one.test/socket#'),scheme:()=>new WebSocket('data:text/plain,a'),duplicate:()=>new WebSocket('ws://a.source-one.test/socket',['x','x']),invalidProtocol:()=>new WebSocket('ws://a.source-one.test/socket','has space'),conversion:()=>new WebSocket({toString(){throw new RangeError('conversion');}}),brand:()=>Object.getOwnPropertyDescriptor(WebSocket.prototype,'url').get.call({})};for(const [name,run] of Object.entries(cases)){try{run();out[name]='accepted';}catch(e){out[name]=e.name;}}postMessage(out);`,
      modulecontainmentsocket:`const socket=new WebSocket('ws://a.source-one.test/socket');socket.onopen=()=>socket.send('worker echo');socket.binaryType='arraybuffer';socket.onmessage=e=>{if(typeof e.data==='string'){socket.echo=e.data;socket.send(new Uint8Array([0,255,42]));}else{postMessage({echo:socket.echo,bytes:Array.from(new Uint8Array(e.data)),url:socket.url,instance:socket instanceof WebSocket,constant:WebSocket.OPEN,constructor:socket.constructor===WebSocket&&WebSocket.prototype.constructor===WebSocket});socket.close();}};socket.onerror=()=>postMessage('socket error');`,
      modulecontainmenthtml:`let a=1,b=1;a <!--b;const m=await import('http://c.source-three.test/one/module.js');postMessage(m.message);`,
      modulecontainmentstaticdata:`import 'data:text/javascript,import "http://c.source-three.test/one/module.js"';postMessage('loaded');`,
      modulecontainmenttimer:`try{setTimeout("postMessage('executed');import('http://c.source-three.test/one/module.js')",0);setTimeout(()=>postMessage('blocked'),100);}catch(e){postMessage('blocked');}`,
      modulecontainmenteval:`try{await eval("import('http://c.source-three.test/one/module.js')");postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentfunction:`try{await new Function("return import('http://c.source-three.test/one/module.js')")();postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentdata:`try{await import('data:text/javascript,import "http://c.source-three.test/one/module.js"');postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulecontainmentblob:`const u=URL.createObjectURL(new Blob(['import "http://c.source-three.test/one/module.js"'],{type:'text/javascript'}));try{await import(u);postMessage('loaded');}catch(e){postMessage('blocked');}finally{URL.revokeObjectURL(u);}`,
      modulecontainmentshadow:`{let __get$ProxyUrl=u=>u;try{await import(__get$ProxyUrl('http://c.source-three.test/one/module.js'));postMessage('loaded');}catch(e){postMessage('blocked');}}`,
      modulecontainmentparse:`const s=\`//# sourceMappingURL=x\`;import('http://c.source-three.test/one/module.js').then(()=>postMessage('loaded'));`,
      moduleurlspaces:`const out=[];for(const value of [' http://c.source-three.test/one/module.js ','\\thttp://c.source-three.test/one/module.js','ht\\ntp://c.source-three.test/one/module.js'])out.push((await import(value)).message);postMessage(out);`,
      modulestaticspaces:`import {message} from ' http://c.source-three.test/one/module.js ';postMessage(message);`,
      moduledotbare:`try{await import('.foo');postMessage('loaded');}catch(e){postMessage('blocked');}`,
      modulequery:`import {load} from '/worker-query.js';postMessage(await load());`,
      moduleproxyurl:`import {load} from 'http://c.source-three.test/worker-proxy-base/module.js';postMessage(await load());`,
      moduleimporterrors:`const result=[];for(const value of [Symbol('url'),{toString(){throw new RangeError('url');}}]){let pending;try{pending=import(value);result.push('promise');}catch(e){result.push('throw:'+e.name);continue;}try{await pending;result.push('loaded');}catch(e){result.push('reject:'+e.name);}}postMessage(result);`,
      modulehashbangcr:`#!/usr/bin/env node\rpostMessage('one');`,
      modulebytes:`onmessage=e=>{const bytes=new Uint8Array(e.data);bytes[0]=42;postMessage(bytes.buffer,[bytes.buffer]);};`,
      modulecorsredirect:`import * as first from 'http://c.source-three.test/worker-redirect/static.js';const second=await import('http://c.source-three.test/worker-redirect/static.js');postMessage([first.value,first===second]);`,
      modulecors:`import {message} from 'http://c.source-three.test/one/module.js';postMessage(message);`,
      modulecorsblocked:`try{await import('http://c.source-three.test/worker-import.js');postMessage('leaked');}catch(e){postMessage('blocked');}`,
      modulecredentialsinclude:`import {cookie} from '/worker-cycle/credentials.js';postMessage(cookie.includes('worker_cookie=frompage'));`,
      modulecredentialsomit:`import {cookie} from '/worker-cycle/credentials.js';postMessage(cookie);`,
      modulecredentialsdefault:`import {cookie} from '/worker-cycle/credentials.js';postMessage(cookie.includes('worker_cookie=frompage'));`,
      moduleearly:`import {result,pending} from '/worker-cycle/early-a.js';postMessage([result,(await pending).message]);`,
      moduleredirect:`import {value} from '/worker-redirect/static.js';const other=await import('/worker-redirect/dynamic.js');postMessage([value,other.value]);`,
      moduleimportscripts:`try{importScripts('http://worker-import-only.source.test/must-not-load.js');postMessage('unexpected');}catch(e){postMessage(e.name);}`,
      modulehashbang:`#!/usr/bin/env node\nimport {message} from '/one/module.js';postMessage(message);`,
      modulecycle:`import {twice} from '/worker-cycle/b.js';postMessage(twice());`,
      moduledependency:`import {result} from '/worker-cycle/fetch.js';postMessage(result);`,
      moduleself:`import './worker-lab-moduleself.js';self.selfModuleCount=(self.selfModuleCount||0)+1;setTimeout(()=>postMessage(self.selfModuleCount),0);`,
      module:`import {message} from '/one/module.js';postMessage(message);`,
      bytes:`onmessage=e=>{const bytes=new Uint8Array(e.data);bytes[0]=42;postMessage(bytes.buffer,[bytes.buffer]);};`
    };
    const code=programs[name]||(name==='containmentsocket'?programs.modulecontainmentsocket:null);
    if(!code){res.writeHead(404);res.end();return;}
    res.end(name.startsWith('module')?code:`(async()=>{try{${code}}catch(error){postMessage({error:error.name+': '+error.message});}})();`);return;
  }
  if (req.url === '/worker-import.js') {
    res.setHeader('Content-Type','application/javascript');res.end('self.importedValue="worker imported";');return;
  }
  if(req.url.startsWith('/worker-cycle/')){
    const programs={
      '/worker-cycle/early-a.js':"export {result,pending} from './early-b.js';export function early(){return ({location:7})?.location;}export function earlyLoad(){return import('/one/module.js');}",
      '/worker-cycle/early-b.js':"import {early,earlyLoad} from './early-a.js';export const result=early();export const pending=earlyLoad();",
      '/worker-cycle/credentials.js':'export const cookie='+JSON.stringify(req.headers.cookie||'')+';',
      '/worker-cycle/a.js':"import {twice} from './b.js';export function value(){return 1;}export function loop(){return twice();}",
      '/worker-cycle/b.js':"import {value} from './a.js';await Promise.resolve();export function twice(){return 2*value();}",
      '/worker-cycle/fetch.js':"const r=await (await fetch('/api')).json();export const result=[r.site,r.cookie.includes('worker_cookie=frompage')];"
    };
    res.setHeader('Content-Type','application/javascript');res.end(programs[req.url]||'throw new Error("unknown module")');return;
  }
  if(req.url==='/one/dynamic.js'){
    res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');
    res.end("export async function load(){const m=await import('./value.js');return m.value;}");return;
  }
  if (/^\/(one|two)\/module.js$/.test(req.url)) {
    res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');
    res.end('import {value} from "./value.js";export const message=value;');return;
  }
  if (/^\/(one|two)\/value.js$/.test(req.url)) {
    res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');
    res.end('export const value='+JSON.stringify(req.url.split('/')[1])+';');return;
  }
  if (req.url === '/worker.js') {
    res.setHeader('Content-Type','application/javascript');
    res.end('importScripts("http://c.source-three.test/worker-import.js");postMessage(self.importedValue);');return;
  }
  if (req.url === '/module.js') {
    res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');
    res.end('export const message="module loaded";');return;
  }
  if(req.url==='/slow-history-image.svg'){res.setHeader('Content-Type','image/svg+xml');heldImages.add(res);res.on('close',()=>heldImages.delete(res));return;}
  if (req.url === '/image.svg') {
    res.setHeader('Content-Type','image/svg+xml');
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>');return;
  }
  if (req.url === '/upload') {
    const chunks=[];for await (const chunk of req) chunks.push(chunk);
    res.setHeader('Content-Type','text/plain');res.end(Buffer.concat(chunks));return;
  }
  if(req.url==='/submitted') {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks).toString();
    observation.body=body;
    res.setHeader('Content-Type','text/html');
    res.end('<h1>Submitted</h1><pre id="submitted"></pre><script>document.getElementById("submitted").textContent='+JSON.stringify(body)+'</script>');return;
  }
  if(['/redirect307','/redirect303','/redirect-final'].includes(req.url)) {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);observation.body=Buffer.concat(chunks).toString();
    if(req.url==='/redirect307'){res.writeHead(307,{Location:'http://c.source-three.test/redirect303'});res.end();return;}
    if(req.url==='/redirect303'){res.writeHead(303,{Location:'http://a.source-one.test/redirect-final'});res.end();return;}
    res.setHeader('Content-Type','text/html');res.end('<h1>Redirect complete</h1>');return;
  }
  if (req.url === '/download') {
    res.setHeader('Content-Disposition','attachment; filename="fixture.txt"');res.end('download payload');return;
  }
  if (req.url.startsWith('/history')) {
    if(req.url==='/history-delayed' && delayedVisits++>0)await new Promise(resolve=>heldPages.add(resolve));
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><meta charset="utf-8"><title>History fixture</title>
      <h1>History fixture</h1>${req.url.includes("slow=1")?'<img src="/slow-history-image.svg">':''}<a id="new-document" href="/history-next">New document</a><a id="jump-anchor" href="#anchor" style="position:fixed;right:0;top:0">Jump to anchor</a><input id="draft" aria-label="Draft"><output id="route"></output>
      <button id="push">Push route</button><button id="replace">Replace route</button>
      <button id="site-back">Site back</button><button id="site-forward">Site forward</button>
      <script>
      window.documentMarker=crypto.randomUUID();let route=0;
      function render(){document.querySelector('#route').textContent=JSON.stringify(history.state===null?null:{route:history.state.route});}
      history.replaceState({route:0},'', ${JSON.stringify(req.url.split('?')[0])});render();
      document.querySelector('#push').onclick=()=>{history.pushState({route:++route},'', '/history?route='+route);render();};
      document.querySelector('#replace').onclick=()=>{history.replaceState({route:'replaced'},'', '/history?replaced');render();};
      document.querySelector('#site-back').onclick=()=>history.back();
      document.querySelector('#site-forward').onclick=()=>history.forward();
      addEventListener('popstate',render);
      </script><div style="height:1800px"></div><div id="anchor">Anchor</div><div style="height:1200px"></div>`);return;
  }
  // Popup sign-in: a opens b in a popup, b sends the popup back to a's
  // callback, which reports to its opener and closes itself.
  if (req.url === '/popup-login') {
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><meta charset="utf-8"><title>Popup login</title><h1>Popup login</h1>
    <button id="login">Sign in</button><button id="login-blank">Sign in (blank then navigate)</button><button id="close-popup">Close popup</button>
    <pre id="handle"></pre><pre id="closed"></pre><pre id="messages"></pre><script>
    window.popupLog=[];let w=null;
    function watch(){document.getElementById('handle').textContent=w===null?'null':(typeof w==='object'?'window':typeof w);
      setInterval(()=>{document.getElementById('closed').textContent=w?String(w.closed):'none';},100);}
    document.getElementById('login').onclick=()=>{w=window.open('http://b.source-two.test/oauth','oauth','width=500,height=600');watch();};
    document.getElementById('login-blank').onclick=()=>{w=window.open('','oauth2');watch();if(w)w.location.href='http://b.source-two.test/oauth';};
    document.getElementById('close-popup').onclick=()=>{if(w)w.close();};
    addEventListener('message',e=>{if(e.origin!=='http://a.source-one.test')return;popupLog.push({data:e.data,origin:e.origin,sameSource:e.source===w});
      document.getElementById('messages').textContent=JSON.stringify(popupLog);});
    </script>`);return;
  }
  if (req.url === '/oauth') {
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><meta charset="utf-8"><title>Site b oauth</title><h1>Authorize?</h1><p id="opener"></p><button id="authorize">Authorize</button><script>
    document.getElementById('opener').textContent=window.opener?'has opener':'no opener';
    document.getElementById('authorize').onclick=()=>{location.href='http://a.source-one.test/popup-callback?code=42';};
    </script>`);return;
  }
  if (req.url.startsWith('/popup-callback')) {
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><meta charset="utf-8"><title>Callback</title><p id="opener"></p><script>
    const opener=window.opener;document.getElementById('opener').textContent=opener?'has opener':'no opener';
    if(opener){opener.postMessage({code:new URL(location.href).searchParams.get('code')},'http://a.source-one.test');setTimeout(()=>window.close(),200);}
    </script>`);return;
  }
  if (req.url === '/nested') {
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><button id="nested-button">Nested</button><output id="nested-count">0</output><script>document.querySelector("button").onclick=()=>document.querySelector("output").textContent++;</script>');return;
  }
  res.setHeader('Content-Type','text/html');
  res.setHeader('Set-Cookie',[`private_${own}=secret_${own};HttpOnly;Path=/`,`strict_${own}=strict_secret;HttpOnly;Path=/;SameSite=Strict`]);
  res.end(`<!doctype html><meta charset="utf-8"><title>Site ${own}</title>
    <link id="private-style" rel="stylesheet" href="http://c.source-three.test/css-${own}.css"><div id="private-background"></div>
    <h1>Site ${own}</h1><button id="button">Count</button><output id="count">0</output>
    <img id="image" src="/image.svg"><pre id="data"></pre><pre id="cors"></pre><pre id="blocked"></pre><pre id="module"></pre><pre id="module-bases"></pre><output id="message"></output><output id="blank-result"></output><output id="blank-message"></output><output id="worker-result"></output><output id="blob-worker-result"></output><output id="bytes-worker-result"></output>
    <a id="next" href="http://b.source-two.test/">Next</a><a id="download" href="/download">Download</a>
    <input id="file" type="file"><button id="upload">Upload</button><pre id="uploaded"></pre>
    <form method="POST" action="http://a.source-one.test/submitted"><input name="message" value="hello & goodbye"><button id="submit-form">Submit form</button></form>
    <form method="POST" action="http://b.source-two.test/redirect307"><input name="message" value="redirect bytes"><button id="redirect-form">Redirect form</button></form>
    ${own==='a'?'<iframe id="same" src="/nested"></iframe><iframe id="other" src="http://b.source-two.test/"></iframe><img id="cross-image" src="http://c.source-three.test/image.svg">':''}
    <script>
      window.sendCross=(origin,payload,transfer)=>document.getElementById('other').contentWindow.postMessage(payload,origin,transfer);
      window.sendParent=payload=>window.parent.postMessage(payload,'http://a.source-one.test');
      window.sendSibling=payload=>window.parent.frames['third'].postMessage(payload,'http://c.source-three.test');
      window.messageLog=[];
      window.addEventListener('message',event=>{
        window.messageLog.push({data:event.data,origin:event.origin});
        if(event.data==='reply please')event.source.postMessage('reply from '+${JSON.stringify(own)},event.origin);
        if(event.data==='port please')event.ports[0].postMessage('port from '+${JSON.stringify(own)});
      });
      const worker=new Worker('/worker.js');worker.onmessage=event=>document.getElementById('worker-result').textContent=event.data;
      const blobCode='importScripts("http://c.source-three.test/worker-import.js");postMessage(self.importedValue);';
      const blobWorker=new Worker(URL.createObjectURL(new Blob([blobCode],{type:'text/javascript'})));
      blobWorker.onmessage=event=>document.getElementById('blob-worker-result').textContent=event.data;
      ${registry.isRealm?`const bytesWorker=new Worker(URL.createObjectURL(new Blob([new TextEncoder().encode(blobCode)],{type:'text/javascript'})));
      bytesWorker.onmessage=event=>document.getElementById('bytes-worker-result').textContent=event.data;`:''}
      const blank=document.createElement('iframe');document.body.appendChild(blank);
      blank.contentWindow.localStorage.setItem('blank-native','works');
      document.getElementById('blank-result').textContent=blank.contentWindow.localStorage.getItem('blank-native');
      blank.contentWindow.addEventListener('message',event=>{
        if(event.data==='blank-test')document.getElementById('blank-message').textContent=event.origin;
      });
      blank.contentWindow.postMessage('blank-test',location.origin);
      const channel = new MessageChannel();
      channel.port1.onmessage=event=>document.getElementById('message').textContent=event.data;
      window.addEventListener('message',event=>{if(event.data==='transfer-test')event.ports[0].postMessage('transfer works');});
      window.postMessage('transfer-test',{targetOrigin:location.origin,transfer:[channel.port2]});
      localStorage.setItem('secret','storage_${own}');document.cookie='visible_${own}=value_${own};Path=/';
      document.getElementById('button').onclick=()=>document.getElementById('count').textContent++;
      fetch('/api').then(r=>r.json()).then(x=>document.getElementById('data').textContent=JSON.stringify(x));
      document.getElementById('upload').onclick=async()=>{
        const form=new FormData();form.append('file',document.getElementById('file').files[0]);
        document.getElementById('uploaded').textContent=await (await fetch('/upload',{method:'POST',body:form})).text();
      };
      ${own==='a'?`fetch('http://c.source-three.test/cors-allow',{credentials:'omit'}).then(r=>r.json()).then(x=>document.getElementById('cors').textContent=x.site);
      fetch('http://c.source-three.test/cors-deny').then(()=>document.getElementById('blocked').textContent='LEAK').catch(()=>document.getElementById('blocked').textContent='blocked');`:''}
    </script>
    ${own==='a'?'<script type="module">import {message} from "http://c.source-three.test/module.js";document.getElementById("module").textContent=message;const first=await import("http://c.source-three.test/one/module.js");const second=await import("http://c.source-three.test/two/module.js");document.getElementById("module-bases").textContent=first.message+","+second.message;</script>':''}`);
});
const websocket = new WebSocketServer({noServer:true});
source.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/socket'){socket.destroy();return;}
  seen.push({host:req.headers.host,path:req.url,origin:req.headers.origin,cookie:req.headers.cookie||''});
  websocket.handleUpgrade(req,socket,head,client=>client.on('message',(data,binary)=>client.send(data,{binary})));
});
async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'vt-gateway-test-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=vt-proxy.example.com',
    '-keyout',path.join(temporary,'key.pem'),'-out',path.join(temporary,'cert.pem')],{stdio:'ignore'});
  const tls = {key:fs.readFileSync(path.join(temporary,'key.pem')),cert:fs.readFileSync(path.join(temporary,'cert.pem'))};
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress = new EgressProxy({resolve:async hostname=>{
    if (!sites.includes(hostname)) throw new Error('Unknown fixture');
    return [{address:'1.1.1.1',family:4}];
  },connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const gateway = new BrowserGateway({registry,authority,externalProxy:await egress.listen(),parentOrigin:'https://ui.vt-proxy.example.com:'+parentPort});
  if(process.env.VT_BROWSER_DIAGNOSTICS) {
    const gate=gateway.gate.bind(gateway);
    gateway.gate=(req,res,...rest)=>{
      const result=gate(req,res,...rest);
      if(req.url.includes('/worker-lab-modulecors.js'))console.error('WORKER_META',JSON.stringify({mode:req.headers['sec-fetch-mode'],dest:req.headers['sec-fetch-dest'],site:req.headers['sec-fetch-site']}));
      if(result && req.url!=='/favicon.ico')console.error('GATE',res.statusCode,req.url.slice(-180),JSON.stringify({origin:req.headers.origin,referer:req.headers.referer,site:req.headers['sec-fetch-site'],dest:req.headers['sec-fetch-dest'],mode:req.headers['sec-fetch-mode']}));
      return result;
    };
  }
  const socketPath = path.join(temporary,'proxy.sock');
  await gateway.listen(socketPath);
  let rejectWorkerPreparation=false;const workerCounts={uploads:0,invalidMaps:0,forbiddenImportScriptsMaps:0,trustedRequests:0};
  const fixtureDelay=Math.min(1000,Math.max(0,Number(process.env.VT_FIXTURE_DELAY_MS)||0));
  const ingress = https.createServer(tls,async(req,res)=>{
    if(fixtureDelay)await new Promise(resolve=>setTimeout(resolve,fixtureDelay));
    if(req.url==='/__vt/worker' && req.method==='POST')workerCounts.uploads++;
    if(req.url.startsWith('/__vt/map?') && req.url.includes('invalid-options.source.test'))workerCounts.invalidMaps++;
    if(req.url.startsWith('/__vt/map?') && req.url.includes('worker-import-only.source.test'))workerCounts.forbiddenImportScriptsMaps++;
    if(rejectWorkerPreparation && (req.url==='/__vt/worker'||req.url.startsWith('/__vt/map?'))){res.writeHead(503);res.end('fixture unavailable');req.resume();return;}
    if (req.url === '/__test/native') {
      res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','native_server=one;Secure;SameSite=None;Path=/');
      res.end('<!doctype html><script>document.cookie="native_client=one;Secure;SameSite=None;Path=/"</script><h1>Native</h1>');return;
    }
    const upstream = http.request({socketPath,path:req.url,method:req.method,headers:req.headers},reply=>{
      res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
    });
    upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
  });
  ingress.on('upgrade',(req,socket,head)=>{
    const upstream=net.createConnection({path:socketPath},()=>{
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries(req.headers).map(([key,value])=>`${key}: ${value}\r\n`).join('')+'\r\n');
      if(head.length)upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });
  await new Promise(r=>ingress.listen(port,'127.0.0.1',r));
  const parent = https.createServer(tls,async(req,res) => {
    if(fixtureDelay)await new Promise(resolve=>setTimeout(resolve,fixtureDelay));
    res.setHeader('Referrer-Policy','same-origin');
    if(req.url==='/__test/trusted-module'){workerCounts.trustedRequests++;res.setHeader('Content-Type','application/javascript');res.setHeader('Access-Control-Allow-Origin','*');res.end('export const sensitive=true;');return;}
    if(req.url==='/__test/worker-counts'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(workerCounts));return;}
    if(req.url.startsWith('/__test/worker-failure?') && req.method==='POST'){rejectWorkerPreparation=req.url.endsWith('on');res.end('{}');return;}
    if(req.url==='/controller.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(root,'trusted-controller.js')));return;}
    const pathname=new URL(req.url,'https://fixture').pathname;
    const files={'/app':['wrapper.html','text/html'],'/wrapper.js':['wrapper.js','application/javascript'],'/ui-session.js':['ui-session.js','application/javascript'],'/wrapper.css':['wrapper.css','text/css']};
    if(files[pathname]){res.setHeader('Content-Type',files[pathname][1]);res.end(fs.readFileSync(path.join(root,files[pathname][0])));return;}
    if(req.url.startsWith('/api/'))req.url=req.url.slice(4);
    if(req.url==='/__test/release-pages' && req.method==='POST'){for(const release of heldPages)release();heldPages.clear();res.end('{}');return;}
    if(req.url==='/__test/release-images' && req.method==='POST'){for(const image of heldImages)image.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');res.end('{}');return;}
    if(req.url==='/__test/expire' && req.method==='POST' && req.headers.origin==='https://ui.vt-proxy.example.com:'+parentPort) {
      for(const lane of gateway.controls.lanes.values())lane.expires=0;
      gateway.controls.collect();res.end('{}');return;
    }
    if(['/approve','/open','/close','/heartbeat'].includes(req.url) && req.method==='POST') {
      if(req.headers.origin!=='https://ui.vt-proxy.example.com:'+parentPort){res.writeHead(403);res.end();return;}
      let body;
      try {
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw new Error('Too large');chunks.push(chunk);}
        body=JSON.parse(Buffer.concat(chunks));const opened=gateway.control(req.url.slice(1),body);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(opened));
      }catch(error){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify(require(path.join(root,'control-errors.cjs')).controlError(error,body)));}return;
    }
    if (req.url === '/seen') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(seen));return;}
    res.setHeader('Content-Type','text/html');
    const opened=registry.isRealm?gateway.open('http://a.source-one.test/'):null;
    const target = req.url === '/native' ? registry.register('http://a.source-one.test')+'/__test/native'
      : opened?.entry || gateway.url('http://a.source-one.test/');
    res.end('<!doctype html><meta name="referrer" content="origin"><title>Browser fixture</title><iframe id="browser" referrerpolicy="origin" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" style="width:100%;height:800px" src="'+target+'"></iframe><script src="/controller.js"></script><script>const opened='+JSON.stringify(opened)+`;
      window.browserStates=[];window.browserController=new BrowserProxyController({frame:document.getElementById('browser'),onState:state=>browserStates.push(state),onError:error=>console.error(error),
        request:async(command,body)=>{const response=await fetch('/'+command,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('Navigation failed');return response.json();}});
      if(opened)browserController.activate(opened);</script>`);
  });
  await new Promise(r=>parent.listen(parentPort,'127.0.0.1',r));
  // Resolve only our fixed physical test namespace, without editing /etc/hosts.
  const browserProxy=http.createServer((req,res)=>{
    // Opt-in native baseline resolves only the three owned fixture origins.
    // It forwards no public hostname and never runs in ordinary proxy tests.
    let target;try{target=new URL(req.url);}catch{}
    if(process.env.VT_NATIVE_WORKERS==='1' && target?.protocol==='http:' && sites.includes(target.hostname) && !target.port){
      const upstream=http.request({host:'127.0.0.1',port:source.address().port,path:target.pathname+target.search,method:req.method,headers:{...req.headers,host:target.host}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
      req.pipe(upstream);res.on('close',()=>upstream.destroy());return;
    }
    res.writeHead(403);res.end();
  });
  browserProxy.on('upgrade',(req,client,head)=>{
    let target;try{target=new URL(req.url);}catch{client.destroy();return;}
    if(process.env.VT_NATIVE_WORKERS!=='1' || !['http:','ws:'].includes(target.protocol) || !sites.includes(target.hostname) || target.port){client.destroy();return;}
    const upstream=net.connect({host:'127.0.0.1',port:source.address().port},()=>{
      upstream.write('GET '+target.pathname+target.search+' HTTP/1.1\r\n'+Object.entries(req.headers).map(([k,v])=>k+': '+v+'\r\n').join('')+'\r\n');
      if(head.length)upstream.write(head);client.pipe(upstream).pipe(client);
    });
    upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());
  });
  browserProxy.on('connect',(req,client,head)=>{
    let target;try{target=new URL('https://'+req.url);}catch{client.destroy();return;}
    const nativeSocket=process.env.VT_NATIVE_WORKERS==='1' && sites.includes(target.hostname) && target.port==='80';
    if(!nativeSocket && (!target.hostname.endsWith('.vt-proxy.example.com') || ![String(port),String(parentPort)].includes(target.port))){client.destroy();return;}
    const upstream=net.connect({host:'127.0.0.1',port:nativeSocket?source.address().port:Number(target.port)},()=>{
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);
    });
    upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());
  });
  await new Promise(r=>browserProxy.listen(0,'127.0.0.1',r));
  console.log(JSON.stringify({parent:'https://ui.vt-proxy.example.com:'+parentPort,origins:registry.entries(),
    browserProxy:'http://127.0.0.1:'+browserProxy.address().port,
    cookie:{name:gateway.cookieName,value:authority.sign('auth',3600),domain:'.'+options.domain,path:'/',httpOnly:true,sameSite:'Lax',secure:true}}));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
    await gateway.close();await egress.close();source.close();parent.close();ingress.close();browserProxy.close();
    fs.rmSync(temporary,{recursive:true,force:true});process.exit();
  });
}
main().catch(e=>{console.error(e);process.exit(1)});
