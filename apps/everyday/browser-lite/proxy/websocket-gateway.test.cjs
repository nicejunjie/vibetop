'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {engineRequire}=require('./engine.cjs');
const {WebSocket,WebSocketServer}=engineRequire('ws');
const {BrowserGateway}=require('./gateway.cjs');
const {RealmOrigins}=require('./realm-origins.cjs');
const {mainContext}=require('./realm-policy.cjs');
const {EgressProxy}=require('./egress.cjs');

test('real root-mode WebSockets echo and close on only their device logout or expiry', {timeout:15000}, async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-ws-'));
 const source=http.createServer(),server=new WebSocketServer({noServer:true});let requests=0;
 source.on('upgrade',(req,socket,head)=>{
  requests++;assert.equal(req.headers.origin,'http://owned.example');
  assert.deepEqual(Object.keys(req.headers).filter(key=>key.startsWith('x-vt-')),[]);
  server.handleUpgrade(req,socket,head,client=>client.on('message',(data,binary)=>client.send(data,{binary})));
 });
 await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
 const egress=new EgressProxy({resolve:async host=>{
  assert.equal(host,'owned.example');return [{address:'1.1.1.1',family:4}];
 },connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
 const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
 const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
 const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',
  externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
 const socketPath=path.join(temporary,'gateway.sock');await gateway.listen(socketPath);
 const devices=new Set();
 const lease=(letter,seconds=60)=>({...identity,lease:letter.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+seconds});
 const first=lease('b'),second=lease('c');
 const url=new URL(registry.scope.run({authorization:first},()=>gateway.url('http://owned.example/socket',
  {context:mainContext('http://owned.example'),resourceType:'w'})));
 let gateCalls=0;const gate=gateway.gate.bind(gateway);
 gateway.gate=(...args)=>{gateCalls++;return gate(...args);};
 function connect(authorization,origin=url.origin.replace(/^ws/,'http'),pathname=url.pathname,extra={}){
  const headers={Host:url.host,Origin:origin,'X-VT-Browser-Role':'auth',
   ...Object.fromEntries(Object.entries(authorization).map(([key,value])=>['X-VT-Browser-'+key,String(value)])),...extra};
  if(origin===null)delete headers.Origin;
  const client=new WebSocket('ws://'+url.host+pathname,{headers,createConnection:()=>net.createConnection({path:socketPath})});devices.add(client);
  return new Promise((resolve,reject)=>{client.once('open',()=>resolve(client));client.once('error',reject);});
 }
 async function echo(client,value){const reply=once(client,'message');client.send(value);return (await reply)[0];}
 try {
  const a=await connect(first),b=await connect(second);
  assert.equal(gateCalls,2,'one authorization per actual upgrade');
  assert.equal((await echo(a,'中文')).toString(),'中文');
  assert.deepEqual(await echo(b,Buffer.from([0,127,128,255])),Buffer.from([0,127,128,255]));
  const before=requests;
  await assert.rejects(connect({...first,uid:1001}),/401/);
  await assert.rejects(connect(first,'null'),/403/);
  await assert.rejects(connect(first,null),/403/);
  const foreign=registry.register('http://foreign.example',mainContext('http://foreign.example'));
  await assert.rejects(connect(first,foreign),/403/);
  await assert.rejects(connect(first,undefined,url.pathname.replace('!w/','/')),/403/);
  await assert.rejects(connect(first,undefined,undefined,{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'iframe'}),/403/);
  assert.equal(gateway.navigations.pending.size,0);
  assert.equal(requests,before);
  const closed=once(a,'close');
  gateway.control('revoke-lease',{authorization:first});await closed;
  assert.equal((await echo(b,'still connected')).toString(),'still connected');
  await assert.rejects(connect(first),/401/);
  const expires=lease('d',2),c=await connect(expires);
  const expired=once(c,'close');await expired;
  assert.equal((await echo(b,'other device remains')).toString(),'other device remains');
  await assert.rejects(connect(expires),/401/);
 } finally {
  for(const client of devices)client.terminate();
  for(const client of server.clients)client.terminate();
  await gateway.close();await egress.close();server.close();
  await new Promise(resolve=>source.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
 }
});
