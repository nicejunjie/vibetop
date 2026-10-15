'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const realmHost=require('./realm-host.js');
const {RealmRegistry,mainContext,contextKey}=require('./realm-policy.cjs');
const affixes={prefix:'https://bl-u7-',suffix:'.example.test'};
test('the page-side HMAC matches node crypto across block boundaries and key sizes',()=>{
  for(const keyLength of [1,32,64,65,200])for(const length of [0,1,55,56,63,64,65,119,120,300]) {
    const key=crypto.randomBytes(keyLength),origin='https://'+'a'.repeat(length)+'.example';
    const expected=crypto.createHmac('sha256',key).update(origin).digest('hex').slice(0,32);
    assert.equal(realmHost(key.toString('base64url'),origin,affixes),affixes.prefix+expected+affixes.suffix,keyLength+'/'+length);
  }
  const key=crypto.randomBytes(32);
  assert.equal(realmHost(key.toString('base64url'),'https://bücher.example',affixes),
    affixes.prefix+crypto.createHmac('sha256',key).update('https://bücher.example').digest('hex').slice(0,32)+affixes.suffix);
});
test('a page names its third-party hosts exactly as the registry does; document hosts keep their derivation',()=>{
  const registry=new RealmRegistry({uid:7,profile:'a'.repeat(32),secret:'test',domain:'example.test'});
  const context=mainContext('https://shop.example');
  const key=registry.resourceKey(context).toString('base64url');
  for(const origin of ['https://cdn.example','https://ads.tracker.example:8443','http://plain.example'])
    assert.equal(realmHost(key,origin,registry.hostAffixes()),registry.describe(origin,context).physical);
  const legacy=crypto.createHmac('sha256','test').update('a'.repeat(32)+'\0realm\0https://shop.example\0'+contextKey(context)).digest('hex').slice(0,32);
  assert.equal(registry.describe('https://shop.example/',context).physical,'https://bl-u7-'+legacy+'.example.test');
  assert.notEqual(registry.resourceKey(context).toString('hex'),registry.resourceKey(mainContext('https://other.example')).toString('hex'));
});
test('a real gateway serves a host the page named itself, and gives no key to resource hosts',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-realmhost-'));const hosts=[];
  const source=http.createServer((req,res)=>{hosts.push(req.headers.host);res.writeHead(200,{'content-type':'image/gif'});res.end('GIF89a');});
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
  function get(host,pathname,dest,mode,referer) {
    const headers={Host:host,'X-VT-Browser-Role':'auth','Sec-Fetch-Dest':dest,'Sec-Fetch-Mode':mode,'Sec-Fetch-Site':host===page.host?'same-origin':'same-site',Referer:referer,
      ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))};
    return new Promise((resolve,reject)=>http.request({socketPath,path:pathname,headers},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,body:b}));}).on('error',reject).end());
  }
  try {
    const client=await get(page.host,'/__vt/client.js?document='+encodeURIComponent('http://shop.example/')+'&windowId='+encodeURIComponent(windowId),'script','no-cors',page.href);
    assert.equal(client.status,200);
    const config=JSON.parse(client.body.slice('window.__vtBrowserConfig='.length,client.body.indexOf(';\n')));
    assert.ok(config.resourceKey && config.self && config.realmHost,'a document realm gets its context key');
    const cdn=new URL(realmHost(config.resourceKey,'http://cdn.example',config.realmHost));
    const image=await get(cdn.host,'/'+encodeURIComponent('stableTestEngine*'+config.self.windowId)+'/http://cdn.example/pixel.gif','image','no-cors',page.href);
    assert.equal(image.status,200,'the page-named host is served: '+image.body);
    assert.deepEqual(hosts,['cdn.example']);
    const resource=await get(cdn.host,'/__vt/client.js?document='+encodeURIComponent('http://cdn.example/'),'script','no-cors',page.href);
    if(resource.status===200)assert.ok(!resource.body.includes('resourceKey'),'no key for a resource-only host');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
