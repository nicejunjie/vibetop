'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {realmSyncCookies}=require('./sync-cookie-policy.cjs');
const sync=(domain,key='k')=>'__Host-s|sid|'+key+'|'+encodeURIComponent(domain)+'|%2F|||';
const {mainContext:mainCtx}=require('./realm-policy.cjs');
const doc={origin:'https://www.shop.example',resourceOnly:false,context:mainCtx('https://www.shop.example')};
const pixel={origin:'https://tracker.example',resourceOnly:true};
const {mainContext,childContext}=require('./realm-policy.cjs');
const adFrame={origin:'https://ads.example',resourceOnly:false,context:childContext(mainContext('https://www.shop.example'),'https://ads.example')};
test('a resource-only realm gets no sync cookies, and stale ones are expired',()=>{
  const out=realmSyncCookies([sync('tracker.example')+'=1;path=/;Secure','plain=1'],pixel,
    sync('tracker.example','old')+'=x; other=1; '+sync('tracker.example','old')+'=y');
  assert.deepEqual(out,['plain=1',sync('tracker.example','old')+'=;path=/;Secure;expires=Thu, 01 Jan 1970 00:00:01 GMT']);
  assert.equal(realmSyncCookies(undefined,pixel,'a=1'),undefined);
});
test('a document realm keeps sync cookies its page can read and drops foreign ones',()=>{
  const own=sync('shop.example')+'=1;path=/;Secure',host=sync('www.shop.example','h')+'=2;path=/;Secure';
  const foreign=sync('tracker.example')+'=3;path=/;Secure';
  const deletion='__Host-c|sid|x|shop.example|%2F|||=;path=/;Secure;expires=Thu, 01 Jan 1970 00:00:01 GMT';
  assert.deepEqual(realmSyncCookies([own,host,foreign,deletion],doc,''),[own,host,deletion]);
  assert.deepEqual(realmSyncCookies(undefined,doc,sync('tracker.example','t')+'=v; '+sync('shop.example','s')+'=w'),
    [sync('tracker.example','t')+'=;path=/;Secure;expires=Thu, 01 Jan 1970 00:00:01 GMT']);
});
test('outside realm mode the engine output is untouched',()=>{
  const out=[sync('anything.example')+'=1;path=/;Secure'];
  assert.equal(realmSyncCookies(out,null,'x=1'),out);
});
test('a real gateway leaves no sync cookies on a tracking-pixel realm',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');
  const {RealmOrigins}=require('./realm-origins.cjs');
  const {mainContext}=require('./realm-policy.cjs');
  const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-sync-'));
  const source=http.createServer((req,res)=>{
    const domain=req.headers.host.split(':')[0];
    res.writeHead(200,{'content-type':'image/gif','set-cookie':['id=1; Domain='+domain+'; Path=/','seen=1; Path=/']});res.end('GIF89a');
  });
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],
    connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',
    externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const socketPath=path.join(temporary,'gateway.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const context=mainContext('http://shop.example');
  const urlFor=destination=>new URL(registry.scope.run({authorization},()=>gateway.url(destination,{context})));
  const page=urlFor('http://shop.example/');
  function get(url,cookie) {
    const headers={Host:url.host,'X-VT-Browser-Role':'auth','Sec-Fetch-Dest':'image','Sec-Fetch-Mode':'no-cors',
      'Sec-Fetch-Site':url.host===page.host?'same-origin':'same-site',Referer:page.href,
      ...Object.fromEntries(Object.entries(authorization).map(([key,value])=>['X-VT-Browser-'+key,String(value)]))};
    if(cookie)headers.Cookie=cookie;
    return new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers},res=>{
      res.resume();res.on('end',()=>resolve({status:res.statusCode,cookies:res.headers['set-cookie']||[]}));}).on('error',reject).end());
  }
  try {
    const stale='__Host-s|stableTestEngine|old|tracker.example|%2F|||';
    const pixel=await get(urlFor('http://tracker.example/p.gif'),stale+'=1');
    assert.equal(pixel.status,200);
    assert.deepEqual(pixel.cookies.filter(line=>!line.includes('expires=Thu, 01 Jan 1970')),[],'no live sync cookies on a pixel realm');
    assert.ok(pixel.cookies.some(line=>line.startsWith(stale+'=;')),'the stale sync cookie is expired');
    const own=await get(urlFor('http://shop.example/p.gif'));
    assert.equal(own.status,200);
    assert.equal(own.cookies.filter(line=>/^__Host-s\|/.test(line)).length,2,'first-party sync cookies still reach the page: '+own.cookies);
  } finally {
    await gateway.close();await egress.close();
    await new Promise(resolve=>source.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
test('a cross-site iframe gets no sync cookies, as Safari blocks third-party cookies there',()=>{
  const own=sync('ads.example')+'=1;path=/;Secure';
  assert.equal(realmSyncCookies([own],adFrame,''),undefined);
  assert.deepEqual(realmSyncCookies(undefined,adFrame,sync('ads.example','old')+'=x'),[sync('ads.example','old')+'=;path=/;Secure;expires=Thu, 01 Jan 1970 00:00:01 GMT']);
});
