'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {realmCacheControl}=require('./cache-policy.cjs');
test('resources keep what the site allows, as private; documents and no-store stay no-store',()=>{
  assert.equal(realmCacheControl('public, max-age=31536000, immutable'),'private, max-age=31536000, immutable');
  assert.equal(realmCacheControl('max-age=600, s-maxage=3600, must-revalidate'),'private, max-age=600, must-revalidate');
  assert.equal(realmCacheControl('PUBLIC,max-age=5'),'private, max-age=5');
  assert.equal(realmCacheControl('private, no-cache'),'private, no-cache');
  assert.equal(realmCacheControl(undefined),'private');
  assert.equal(realmCacheControl('no-store'),'no-store');
  assert.equal(realmCacheControl('no-cache, no-store, must-revalidate'),'no-store');
  assert.equal(realmCacheControl('public, max-age=600',{document:true}),'no-store');
});
test('through the real gateway an image is cacheable and a page is not; workers may eval',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const {mainContext}=require('./realm-policy.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-cache-'));
  const source=http.createServer((req,res)=>{
    if(req.url.startsWith('/logo.png')){res.writeHead(200,{'content-type':'image/png','cache-control':'public, max-age=31536000, immutable'});res.end(Buffer.from([137,80,78,71]));}
    else if(req.url.startsWith('/app.js')){res.writeHead(200,{'content-type':'text/javascript','cache-control':'public, max-age=3600'});res.end('console.log(1)');}
    else if(req.url.startsWith('/secret.json')){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('{}');}
    else{res.writeHead(200,{'content-type':'text/html','cache-control':'public, max-age=600'});res.end('<p>page</p>');}
  });
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const context=mainContext('http://site.example');
  const page=new URL(registry.scope.run({authorization},()=>gateway.url('http://site.example/',{context})));
  const get=(url,fetch)=>new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers:{Host:url.host,'X-VT-Browser-Role':'auth',
    'Sec-Fetch-Site':'same-origin',Referer:page.href,...fetch,
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));}).on('error',reject).end());
  const resource=(pathname,type)=>new URL(registry.scope.run({authorization},()=>gateway.url('http://site.example'+pathname,{context,resourceType:type})));
  try {
    const image=await get(resource('/logo.png'),{'Sec-Fetch-Dest':'image','Sec-Fetch-Mode':'no-cors',Accept:'image/*'});
    assert.equal(image.status,200);
    assert.equal(image.headers['cache-control'],'private, max-age=31536000, immutable');
    const script=await get(resource('/app.js','s'),{'Sec-Fetch-Dest':'script','Sec-Fetch-Mode':'no-cors',Accept:'*/*'});
    assert.equal(script.status,200);
    assert.equal(script.headers['cache-control'],'private, max-age=3600','a rewritten script is keyed by its tab in the URL, so it may be cached');
    const secret=await get(resource('/secret.json'),{'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors',Accept:'application/json'});
    assert.equal(secret.headers['cache-control'],'no-store');
    const opened=registry.scope.run({authorization},()=>gateway.open('http://site.example/',{tabId:'tab-1',epoch:1}));
    const entry=await get(new URL(opened.entry),{'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:parentOrigin+'/',Accept:'text/html'});
    const document=await get(new URL(entry.headers.location),{'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:parentOrigin+'/',Accept:'text/html'});
    assert.equal(document.status,200);
    assert.equal(document.headers['cache-control'],'no-store');
    const engine=gateway.proxy.routes.get('GET /hammerhead.js');
    const bundle=await get(new URL(page.origin+'/hammerhead.js?v='+engine.handler.etag),{'Sec-Fetch-Dest':'script','Sec-Fetch-Mode':'no-cors',Accept:'*/*'});
    assert.equal(bundle.status,200);
    assert.equal(bundle.headers['cache-control'],'max-age=31536000','the engine bundle is versioned by its etag in the URL');
    const transforms=require('./engine.cjs').hammerhead('request-pipeline/header-transforms/transforms');
    assert.equal(transforms.requestTransforms['accept-encoding']('gzip, deflate, br, zstd'),'gzip, deflate, br','the engine cannot decode zstd');
    assert.equal(transforms.requestTransforms['accept-encoding']('zstd'),'identity');
    assert.equal(transforms.requestTransforms['accept-encoding'](undefined),undefined);
    assert.match(gateway.workerPolicy(),/script-src https:\/\/\*\.realms\.proxy\.example\.com 'wasm-unsafe-eval';/,"workers do not get eval (design-decisions)");
    assert.match(gateway.workerPolicy(),/connect-src https:\/\/\*\.realms\.proxy\.example\.com wss:\/\/\*\.realms\.proxy\.example\.com blob: data:;/,'hosts stay restricted');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
