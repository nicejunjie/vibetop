'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Its own file: the gateway allows one browser profile per process.
test('a script rewritten for one tab is reused by the next, with that tab\'s own token',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');
  const {mainContext}=require('./realm-policy.cjs');const {EgressProxy}=require('./egress.cjs');
  let rewrites=0;globalThis.vtProcessScriptAsync=async()=>{rewrites++;return null;};
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-cache-'));
  const source=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/javascript'});res.end('import("./lazy.js");var x=1;');});
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const context=mainContext('http://shop.example'),token=registry.realms.contextToken(context);
  async function load(tab) {
    const windowId=token+'~'+tab+'~test.relay';
    const url=new URL(registry.scope.run({authorization},()=>gateway.url('http://shop.example/app.js',{context,windowId,resourceType:'s'})));
    const page=new URL(registry.scope.run({authorization},()=>gateway.url('http://shop.example/',{context,windowId})));
    return new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname,headers:{Host:url.host,'X-VT-Browser-Role':'auth',
      'Sec-Fetch-Dest':'script','Sec-Fetch-Mode':'no-cors','Sec-Fetch-Site':'same-origin',Referer:page.href,
      ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,body:b}));}).on('error',reject).end());
  }
  try {
    const tabA='A'.repeat(32),tabB='B'.repeat(32);
    const first=await load(tabA);assert.equal(first.status,200);
    assert.equal(rewrites,1);
    const second=await load(tabB);assert.equal(second.status,200);
    assert.equal(rewrites,1,'the second tab reuses the rewritten script');
    assert.equal(second.body,first.body.split(tabA).join(tabB));
    assert.ok(!second.body.includes(tabA)&&!second.body.includes(globalThis.vtCacheTabMark),'no other tab token or placeholder leaks');
  } finally {
    delete globalThis.vtProcessScriptAsync;
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
