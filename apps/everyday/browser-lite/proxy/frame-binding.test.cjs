'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mainContext}=require('./realm-policy.cjs');
// Its own file: the gateway allows one browser profile per process.
test('a cross-origin iframe named on its parent host is sent on to its child realm',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const {childContext}=require('./realm-policy.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-frame-'));
  const source=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','set-cookie':['uid=1; Domain=widget.example; Path=/; SameSite=None; Secure','plain=2; Path=/']});res.end('<p>frame</p>');});
  await new Promise(r=>source.listen(0,'127.0.0.1',r));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const context=mainContext('http://shop.example');
  const page=new URL(registry.scope.run({authorization},()=>gateway.url('http://shop.example/',{context})));
  const windowId=decodeURIComponent(page.pathname.split('/')[1]).split('*')[1];
  const get=(host,pathname,site,referer=page.href)=>new Promise((resolve,reject)=>http.request({socketPath,path:pathname,headers:{Host:host,'X-VT-Browser-Role':'auth',
    'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':site,...(referer?{Referer:referer}:{}),
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location,cookies:res.headers['set-cookie']||[]}));}).on('error',reject).end());
  const late='/'+encodeURIComponent('stableTestEngine*'+windowId)+'!i/http://widget.example/embed';
  try {
    const hop=await get(page.host,late,'same-origin');
    assert.equal(hop.status,302);
    const expected=registry.realms.describe('http://widget.example',childContext(context,'http://widget.example')).physical;
    assert.equal(new URL(hop.location).origin,expected,'sent to the child realm of this document');
    const frame=await get(new URL(hop.location).host,new URL(hop.location).pathname,'same-site',page.origin+'/');
    assert.equal(frame.status,200);
    assert.ok(frame.cookies.every(line=>line.startsWith('__Host-')),'a cross-site frame never receives raw site cookies: '+frame.cookies);
    // A frame created with referrerpolicy=no-referrer: admitted once by the hop's grant.
    const quiet=await get(page.host,late,'same-origin');
    const target=new URL(quiet.location);
    assert.equal((await get(target.host,target.pathname,'same-site','')).status,200,'granted once without a Referer');
    assert.notEqual((await get(target.host,target.pathname,'same-site','')).status,200,'the grant is single-use');
    assert.notEqual((await get(page.host,late,'cross-site')).status,302,'only the document itself');
    const foreign=registry.realms.contextToken(mainContext('http://evil.example'))+'~~test.relay';
    assert.notEqual((await get(page.host,'/'+encodeURIComponent('stableTestEngine*'+foreign)+'!i/http://widget.example/embed','same-origin')).status,302,'only its own context');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
