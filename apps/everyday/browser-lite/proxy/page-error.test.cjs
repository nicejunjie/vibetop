'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pageErrorBlock,pageErrorReason,renderPageError}=require('./page-error.cjs');
test('upstream failures get a plain reason',()=>{
  assert.equal(pageErrorReason(new Error('Failed to find a DNS-record for the resource at https://x.invalid/')),"The site's address could not be found.");
  assert.equal(pageErrorReason({message:'getaddrinfo ENOTFOUND x'}),"The site's address could not be found.");
  assert.equal(pageErrorReason(new Error('Failed to complete a request to https://x/ within the timeout period')),'The site took too long to respond.');
  assert.equal(pageErrorReason(new Error('connect ECONNREFUSED 1.2.3.4:443')),'The site refused the connection.');
  assert.equal(pageErrorReason(new Error('unable to verify the first certificate')),'A secure connection to the site could not be made.');
  assert.equal(pageErrorReason(new Error('socket hang up')),'The site closed the connection.');
  assert.equal(pageErrorReason(new Error('Failed to establish tunneling connection via proxy')),'The site could not be reached.');
  assert.equal(pageErrorReason(undefined),'The site could not be reached.');
});
test('a destination refused by policy says why and offers no Retry',()=>{
  assert.equal(pageErrorBlock('Failed to complete a request: Error: Destination blocked (VT-BLOCKED:local)'),'local');
  assert.equal(pageErrorBlock(new Error('Destination blocked (VT-BLOCKED:port)')),'port');
  assert.equal(pageErrorBlock(new Error('getaddrinfo ENOTFOUND x')),'');
  const local=renderPageError({url:'http://192.168.68.43/',error:'Destination blocked (VT-BLOCKED:local)',navigation:{tabId:'tab-1',epoch:3},parentOrigin:'https://ui.example'});
  assert.equal(local.status,503);
  assert.ok(local.body.includes('can&#39;t open local addresses') && local.body.includes('192.168.68.43'),'names the refusal and the host');
  assert.ok(local.body.includes('full Browser'),'points at the full Browser');
  assert.ok(!local.body.includes('id="retry"') && !local.body.includes('VT-BLOCKED'),'no Retry, no internal marker');
  assert.ok(local.body.includes('failure:"local"'),'tells the toolbar the kind');
  const port=renderPageError({url:'https://1.1.1.1:8443/',error:'Destination blocked (VT-BLOCKED:port)'});
  assert.ok(port.body.includes('80 and 443'));
  assert.ok(renderPageError({url:'https://x/',error:'socket hang up',navigation:{tabId:'t',epoch:1},parentOrigin:'https://ui.example'}).body.includes('failure:""'));
});
test('the error page passes Cloudflare (503), frames, and talks to the tab only when it knows the tab',()=>{
  const error=new Error('x </script><script>alert(1)</script> ENOTFOUND');
  const page=renderPageError({url:'https://nowhere.example/a?b=<c>',error,navigation:{tabId:'tab-1',epoch:3},parentOrigin:'https://ui.example'});
  assert.equal(page.status,503);
  assert.equal(page.headers['Cache-Control'],'no-store');
  assert.equal(page.headers['X-Frame-Options'],undefined);
  assert.match(page.headers['Content-Security-Policy'],new RegExp("script-src 'nonce-"+page.nonce+"'"));
  assert.ok(page.body.includes('nowhere.example'),'names the host');
  assert.ok(page.body.includes('The site&#39;s address could not be found.'),'the reason, HTML-escaped');
  assert.ok(!page.body.includes('<script>alert'),'error text is escaped');
  assert.ok(!/url="https:\/\/nowhere\.example\/a\?b=<c>"/.test(page.body),'embedded JSON escapes <');
  assert.ok(page.body.includes('"tabId":"tab-1","epoch":3'),'the bridge carries the tab identity');
  assert.ok(page.body.includes("action:'state'") && page.body.includes('failed:true'),'reports a failed load to the toolbar');
  assert.ok(page.body.includes("location.reload()"),'Retry reloads');
  const plain=renderPageError({url:'https://nowhere.example/',error,navigation:null,parentOrigin:'https://ui.example'});
  assert.ok(!plain.body.includes('vibetop-browser-control'),'no bridge without a tab');
  assert.ok(plain.body.includes("location.reload()"),'Retry still works');
});
test('a page whose site cannot be reached gets the error page through the real gateway',{timeout:15000},async()=>{
  const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-page-error-'));
  // Every name fails to resolve: the egress refuses the tunnel.
  const egress=new EgressProxy({resolve:async()=>{throw Object.assign(new Error('getaddrinfo ENOTFOUND nowhere.example'),{code:'ENOTFOUND'});}});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const parentOrigin='https://ui.proxy.example.com';
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin});
  const socketPath=path.join(temporary,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const get=(url,referer)=>new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers:{Host:url.host,'X-VT-Browser-Role':'auth',
    Accept:'text/html,application/xhtml+xml','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site',Referer:referer,
    ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))}},res=>{let text='';res.setEncoding('utf8');
    res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));}).on('error',reject).end());
  try {
    const opened=registry.scope.run({authorization},()=>gateway.open('https://nowhere.example/path',{tabId:'tab-1',epoch:1}));
    const entry=await get(new URL(opened.entry),parentOrigin+'/');
    assert.equal(entry.status,303);
    const page=await get(new URL(entry.headers.location),parentOrigin+'/');
    assert.equal(page.status,503,'503 passes Cloudflare; 502 is replaced by its own page');
    assert.match(page.headers['content-type'],/^text\/html/);
    assert.equal(page.headers['x-frame-options'],undefined);
    assert.match(page.headers['content-security-policy'],/frame-ancestors https:\/\/ui\.proxy\.example\.com/);
    assert.ok(page.text.includes('nowhere.example') && page.text.includes("This page can't be shown"),page.text.slice(0,300));
    assert.ok(page.text.includes('"tabId":"tab-1","epoch":1'),'the page knows its tab, so the toolbar learns the load ended');
    // An IP address is its own site: this used to fail the realm context
    // check and leave the tab loading forever.
    for(const [index,url] of ['http://192.168.68.43/','https://192.168.68.43/'].entries()) {
      const opened=registry.scope.run({authorization},()=>gateway.open(url,{tabId:'tab-lan-'+index,epoch:1}));
      const entry=await get(new URL(opened.entry),parentOrigin+'/');
      assert.equal(entry.status,303,url);
      const page=await get(new URL(entry.headers.location),parentOrigin+'/');
      assert.equal(page.status,503,url);
      assert.ok(page.text.includes('can&#39;t open local addresses'),url+': '+page.text.slice(0,300));
      assert.ok(page.text.includes('failure:"local"'),url);
    }
  } finally {
    await gateway.close();await egress.close();fs.rmSync(temporary,{recursive:true,force:true});
  }
});
