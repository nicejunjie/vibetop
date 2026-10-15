'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mainContext}=require('./realm-policy.cjs');
// Its own file: the gateway allows one browser profile per process.
// The page starts a blob worker before its source upload finishes (a
// synchronous upload froze Yahoo Finance for 10 s), so the worker's script
// request must wait for the upload rather than fail.
test('a worker started before its upload receives the rewritten source',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-worker-'));
  const source=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>page</p>');});
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const page=new URL(registry.scope.run({authorization},()=>gateway.url('http://shop.example/',{context:mainContext('http://shop.example')})));
  const auth=Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]));
  const call=(method,pathname,headers,body)=>new Promise((resolve,reject)=>{
    const req=http.request({socketPath,method,path:pathname,headers:{Host:page.host,'X-VT-Browser-Role':'auth',Referer:page.href,...auth,...headers}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text}));});
    req.on('error',reject);req.end(body);});
  const upload=(id,body)=>call('POST','/__vt/worker',{Origin:page.origin,'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors','Sec-Fetch-Site':'same-origin',
    'X-Browser-Worker-URL':'blob:'+page.origin+'/0f8fad5b-d9cb-469f-a165-70867728950e','X-Browser-Worker-Id':id,'Content-Type':'text/plain'},body);
  const start=id=>call('GET','/__vt/worker?id='+id,{'Sec-Fetch-Dest':'worker','Sec-Fetch-Mode':'same-origin','Sec-Fetch-Site':'same-origin'});
  try {
    const id='w'.repeat(43);
    const worker=start(id);
    await new Promise(r=>setTimeout(r,100));
    assert.equal((await upload(id,'fetch("/api/data");postMessage(1);')).status,200);
    const response=await worker;
    assert.equal(response.status,200);
    assert.match(response.text,/hammerhead\|script\|start/,'the source was rewritten before it ran');
    assert.notEqual((await upload(id,'postMessage(2)')).status,200,'an id cannot be reused');
    // A source that cannot be rewritten fails the waiting worker at once.
    const broken='x'.repeat(43),failing=start(broken),began=Date.now();
    await new Promise(r=>setTimeout(r,50));
    assert.notEqual((await upload(broken,'let = = ;')).status,200);
    assert.notEqual((await failing).status,200);
    assert.ok(Date.now()-began<5000,'did not wait for the timeout');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
