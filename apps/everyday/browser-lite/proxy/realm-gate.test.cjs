'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RealmRegistry,mainContext,childContext}=require('./realm-policy.cjs');
const {authorizeRequest}=require('./realm-gate.cjs');
function fixture(){const r=new RealmRegistry({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'proxy.example.com'});
 const a=r.register('https://a.example',mainContext('https://a.example'));
 return {r,a,b:r.register('https://b.example',childContext(a.context,'https://b.example')),css:r.register('https://cdn.example',a.context)};}
function headers(source,dest='image',extra={}){return {'sec-fetch-mode':dest==='iframe'?'navigate':'no-cors','sec-fetch-dest':dest,'sec-fetch-site':'same-site',referer:source.physical+'/',...extra};}
test('native WebSocket Origin proves context without Fetch Metadata',()=>{
 const {r,a,b,css}=fixture();
 for(const target of [a,css])assert.equal(authorizeRequest({origin:a.physical},target,r,{websocket:true}).allowed,true);
 for(const origin of [undefined,'null','https://unknown.example',b.physical])
  assert.equal(authorizeRequest({origin,referer:a.physical},a,r,{websocket:true}).allowed,false);
 assert.equal(authorizeRequest({origin:a.physical},a,r).allowed,false);
});
test('valid stylesheet chains retain document cookies but a foreign frame cannot load those stylesheet URLs',()=>{
 const {r,a,b,css}=fixture();
 assert.equal(authorizeRequest(headers(a,'style'),css,r).allowed,true);
 assert.equal(authorizeRequest(headers(css),a,r).allowed,true);
 assert.equal(authorizeRequest(headers(b,'style'),css,r).allowed,false);
 assert.equal(authorizeRequest(headers(b),a,r).allowed,false);
});
test('an unknown initiator cannot prime contextual CSS, including a copied signed target URL',()=>{
 const {r,css}=fixture();
 for(const dest of ['style','script','image'])assert.equal(authorizeRequest(headers(css,dest,{referer:undefined}),css,r).allowed,false);
 assert.equal(authorizeRequest(headers(css,'style',{origin:'null'}),css,r).allowed,false);
});
test('only a validated main transaction upgrades a nested frame context',()=>{
 const {r,a,b}=fixture();
 assert.equal(authorizeRequest(headers(a,'iframe'),b,r).allowed,true);
 assert.equal(authorizeRequest(headers(b,'iframe'),a,r).allowed,false);
 assert.equal(authorizeRequest(headers(b,'iframe'),a,r,{approvedMain:true}).allowed,true);
});
test('resource-only hosts cannot become execution contexts and service workers stay denied',()=>{
 const {r,a,css}=fixture();
 for(const dest of ['iframe','document','frame','worker','sharedworker','serviceworker','object','embed'])
  assert.equal(authorizeRequest(headers(a,dest),css,r).allowed,false,dest);
 assert.equal(authorizeRequest(headers(a,'worker',{'sec-fetch-site':'same-origin'}),a,r).allowed,true);
 assert.equal(authorizeRequest(headers(a,'sharedworker',{'sec-fetch-site':'same-origin'}),a,r).allowed,false);
 assert.equal(authorizeRequest(headers(a,'serviceworker',{'sec-fetch-site':'same-origin'}),a,r).allowed,false);
});
test('module dependency worker/cors metadata permits resources without promoting entries',()=>{
 const {r,a,b,css}=fixture();
 const dependency=headers(a,'worker',{'sec-fetch-mode':'cors',origin:a.physical});
 assert.equal(authorizeRequest(dependency,css,r,{workerModule:true}).allowed,true);
 assert.equal(authorizeRequest(dependency,css,r).allowed,false);
 for(const mode of ['same-origin','no-cors'])assert.equal(authorizeRequest({...dependency,'sec-fetch-mode':mode},css,r,{workerModule:true}).allowed,false);
 for(const dest of ['sharedworker','serviceworker','iframe'])assert.equal(authorizeRequest({...dependency,'sec-fetch-dest':dest},css,r,{workerModule:true}).allowed,false);
 assert.equal(authorizeRequest({...dependency,origin:b.physical},css,r,{workerModule:true}).allowed,false);
 assert.equal(authorizeRequest({...dependency,origin:'null'},css,r,{workerModule:true}).allowed,false);
});
