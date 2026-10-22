'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Its own file: the gateway allows one browser profile per process.
// A toolbar-opened page that server-redirects (Gmail: "/" -> "/mail/u/0/", then
// a passive accounts.google.com sign-in bounce) must keep working. The opening
// navigation's one-shot admission is spent on the first hop, so the browser's
// redirect-follow arrives with no admission and no content-realm source (its
// referer is the trusted toolbar origin). Before the fix the cross-origin guard
// denied it ("Browser request unavailable"); now a same-realm follow is allowed
// and a cross-origin one is captured for the toolbar's approval.
test('a toolbar-opened page that server-redirects is not denied',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-tbredir-'));
  // Upstream "shop.example": "/" immediately 303s to "/u/0/", which is the real
  // page. This mirrors mail.google.com's landing redirect.
  const source=http.createServer((req,res)=>{
    if(req.url==='/'){res.writeHead(303,{'Location':'/u/0/'});res.end();return;}
    res.writeHead(200,{'content-type':'text/html'});res.end('<p>inbox</p>');
  });
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const idHeaders=Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]));
  const req=(host,pathname,headers)=>new Promise((resolve,reject)=>http.request({socketPath,path:pathname,
    headers:{Host:host,'X-VT-Browser-Role':'auth',...idHeaders,...headers}},
    res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location}));}).on('error',reject).end());
  try {
    // Toolbar opens shop.example (as the controller's "open" does).
    const opened=registry.scope.run({authorization},()=>gateway.open('http://shop.example/',{tabId:'tab-1',epoch:1}));
    const entry=new URL(opened.entry);
    // The iframe loads the entry URL (referer = the toolbar/parent origin).
    const admit=await req(entry.host,entry.pathname+entry.search,{Referer:parentOrigin+'/','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site'});
    assert.equal(admit.status,303,'entry admits and redirects to the page');
    const page=new URL(admit.location);
    // The admitted page navigation: upstream 303s to /u/0/ on the same origin,
    // which the gateway rewrites and hands back for the browser to follow.
    const first=await req(page.host,page.pathname+page.search,{Referer:parentOrigin+'/','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site'});
    assert.equal(first.status,303,'the opened page server-redirects');
    const follow=new URL(first.location);
    assert.equal(follow.host,page.host,'the redirect stayed on the tab\'s own realm');
    // The browser follows the redirect: no admission left, referer still the
    // toolbar origin, so sec-fetch-site is same-site and there is no source.
    const landed=await req(follow.host,follow.pathname+follow.search,{Referer:parentOrigin+'/','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site'});
    assert.equal(landed.status,200,'the same-realm redirect-follow is allowed, not denied');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
