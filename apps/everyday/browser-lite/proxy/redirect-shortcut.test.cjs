'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Its own file: the gateway allows one browser profile per process.
test('a cross-site link answers with the challenge page at once; a same-origin redirect needs no approval',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const {mainContext}=require('./realm-policy.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-redirect-'));
  const source=http.createServer((req,res)=>{
    if(req.url==='/login'){res.writeHead(302,{location:'/home'});res.end();return;}
    if(req.url==='/away'){res.writeHead(302,{location:'http://other.example/landing'});res.end();return;}
    res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>'+req.url+'</title><p>page</p>');
  });
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const get=(url,fetch)=>new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers:{Host:url.host,'X-VT-Browser-Role':'auth',Accept:'text/html',...fetch,
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));}).on('error',reject).end());
  try {
    const opened=registry.scope.run({authorization},()=>gateway.open('http://site.example/login',{tabId:'tab-1',epoch:1}));
    const fromUi={'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:parentOrigin+'/'};
    const entry=await get(new URL(opened.entry),fromUi);
    const pageUrl=new URL(entry.headers.location);
    const login=await get(pageUrl,fromUi);
    assert.equal(login.status,302,'a same-origin redirect stays a redirect');
    assert.equal(new URL(login.headers.location).host,pageUrl.host,'on the tab\'s own realm: '+login.headers.location);
    assert.ok(login.headers.location.endsWith('/http://site.example/home'),login.headers.location);
    // The browser follows it as an ordinary same-origin navigation.
    const home=await get(new URL(login.headers.location),{'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-origin',Referer:pageUrl.href});
    assert.equal(home.status,200);assert.ok(home.text.includes('<title>/home</title>'));
    // A cross-origin redirect still needs the toolbar's approval.
    const tab=gateway.tabs.get('tab-1');
    const away=await get(new URL(registry.scope.run({authorization},()=>gateway.url('http://site.example/away',{context:mainContext('http://site.example'),windowId:registry.realms.contextToken(mainContext('http://site.example'))+'~'+tab.token+'~test.relay'}))),
      {'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-origin',Referer:pageUrl.href});
    assert.equal(away.status,303);assert.ok(away.headers.location.includes('/__vt/navigation?id='),away.headers.location);
    // A link to another site: the destination realm answers with the challenge page itself (no 303).
    const link=new URL(registry.scope.run({authorization},()=>gateway.url('http://other.example/landing',{context:mainContext('http://site.example'),windowId:registry.realms.contextToken(mainContext('http://site.example'))+'~'+tab.token+'~test.relay'})));
    const challenge=await get(link,{'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:pageUrl.href});
    assert.equal(challenge.status,200,'challenge served directly');
    assert.match(challenge.headers['content-type'],/^text\/html/);
    assert.ok(challenge.text.includes('"type":"vibetop-browser-navigation"') && challenge.text.includes('"tabId":"tab-1"'),challenge.text);
    assert.match(challenge.headers['content-security-policy'],/frame-ancestors https:\/\/ui\.proxy\.example\.com/);
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
