'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {zstdSupported}=require('./zstd-patch.cjs');
// Its own file: the gateway allows one browser profile per process.
test('a zstd-compressed page is decoded, rewritten and re-encoded',{timeout:15000,skip:!zstdSupported()},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-zstd-'));
  const accepts=[];
  const source=http.createServer((req,res)=>{accepts.push(req.headers['accept-encoding']);
    res.writeHead(200,{'content-type':'text/html','content-encoding':'zstd'});res.end(zlib.zstdCompressSync(Buffer.from('<!doctype html><title>z</title><p id="z">zstd page</p>')));});
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const get=(url,fetch)=>new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers:{Host:url.host,'X-VT-Browser-Role':'auth',Accept:'text/html','Accept-Encoding':'gzip, deflate, br, zstd',...fetch,
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject).end());
  try {
    const opened=registry.scope.run({authorization},()=>gateway.open('http://site.example/',{tabId:'tab-1',epoch:1}));
    const nav={'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:parentOrigin+'/'};
    const entry=await get(new URL(opened.entry),nav);
    const page=await get(new URL(entry.headers.location),nav);
    assert.equal(page.status,200);
    assert.equal(accepts.at(-1),'gzip, deflate, br, zstd','the browser\'s Accept-Encoding reaches the site unchanged');
    assert.equal(page.headers['content-encoding'],'zstd');
    const text=zlib.zstdDecompressSync(page.body).toString();
    assert.ok(text.includes('zstd page') && text.includes('hammerhead'),'decoded, rewritten, re-encoded: '+text.slice(0,200));
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
