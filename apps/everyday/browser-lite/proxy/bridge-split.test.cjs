'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Its own file: the gateway allows one browser profile per process.
test('a page gets a tiny per-document config and a cacheable shared bridge',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-bridge-'));
  const source=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>t</title><p>page</p>');});
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const get=(url,fetch)=>new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers:{Host:url.host,'X-VT-Browser-Role':'auth',...fetch,
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));}).on('error',reject).end());
  try {
    const opened=registry.scope.run({authorization},()=>gateway.open('http://site.example/',{tabId:'tab-1',epoch:1}));
    const nav={'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:parentOrigin+'/',Accept:'text/html'};
    const entry=await get(new URL(opened.entry),nav);
    const page=await get(new URL(entry.headers.location),nav);
    assert.equal(page.status,200);
    const config=page.text.indexOf('/__vt/client.js?document='),bridge=page.text.indexOf('/__vt/bridge.js?v=');
    assert.ok(config>=0 && bridge>config,'config script first, then the bridge: '+page.text.slice(0,600));
    const pageUrl=new URL(entry.headers.location);
    const configSrc=/src="([^"]*\/__vt\/client\.js[^"]*)"/.exec(page.text)[1].replace(/&amp;/g,'&');
    const configResponse=await get(new URL(configSrc,pageUrl),{'Sec-Fetch-Dest':'script','Sec-Fetch-Mode':'no-cors','Sec-Fetch-Site':'same-origin',Referer:pageUrl.href});
    assert.equal(configResponse.status,200);
    assert.ok(configResponse.text.startsWith('window.__vtBrowserConfig=') && configResponse.text.length<4096,'config only: '+configResponse.text.length);
    assert.equal(configResponse.headers['cache-control'],'no-store');
    const bridgeSrc=/src="([^"]*\/__vt\/bridge\.js[^"]*)"/.exec(page.text)[1].replace(/&amp;/g,'&');
    const bridgeResponse=await get(new URL(bridgeSrc,pageUrl),{'Sec-Fetch-Dest':'script','Sec-Fetch-Mode':'no-cors','Sec-Fetch-Site':'same-origin',Referer:pageUrl.href});
    assert.equal(bridgeResponse.status,200);
    assert.ok(bridgeResponse.text.includes('vibetopCreateWorker') && bridgeResponse.text.includes('vibetopInstallHistory'),'the whole bridge');
    assert.equal(bridgeResponse.headers['cache-control'],'max-age=31536000');
    assert.ok(bridgeResponse.headers.etag,'etag for revalidation');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
