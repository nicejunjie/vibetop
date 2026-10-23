'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Its own file: the gateway allows one browser profile per process.
// Google rejects a carried sign-in served under a phone's mobile UA ("this
// browser or app may not be secure") and forces an interactive sign-in the
// proxy cannot complete. The gateway pins Google-owned hosts to one desktop UA
// so every device looks like the same accepted desktop browser. This asserts
// the upstream request to a Google host carries the pinned UA while a non-Google
// host keeps the client's own UA.
const PINNED='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15';
const CLIENT='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15';
test('Google hosts get the pinned desktop UA upstream; other hosts keep the client UA',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-ua-'));
  const seen={};
  const source=http.createServer((req,res)=>{seen[req.headers.host]={ua:req.headers['user-agent'],hints:req.headers['sec-ch-ua']};res.writeHead(200,{'content-type':'text/html'});res.end('<p>ok</p>');});
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
  async function load(targetHost,tabId) {
    const opened=registry.scope.run({authorization},()=>gateway.open('http://'+targetHost+'/',{tabId,epoch:1}));
    const entry=new URL(opened.entry);
    const admit=await req(entry.host,entry.pathname+entry.search,{Referer:parentOrigin+'/','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site','User-Agent':CLIENT,'Sec-CH-UA':'"Not;A=Brand";v="99"'});
    const page=new URL(admit.location);
    await req(page.host,page.pathname+page.search,{Referer:parentOrigin+'/','Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-site','User-Agent':CLIENT,'Sec-CH-UA':'"Not;A=Brand";v="99"'});
  }
  try {
    await load('www.google.com','g');
    await load('example.com','e');
    assert.equal(seen['www.google.com'] && seen['www.google.com'].ua, PINNED, 'Google host gets the pinned desktop UA');
    assert.equal(seen['www.google.com'] && seen['www.google.com'].hints, undefined, 'Google host drops Chromium client hints');
    assert.equal(seen['example.com'] && seen['example.com'].ua, CLIENT, 'a non-Google host keeps the client UA');
  } finally {
    await gateway.close();await egress.close();await new Promise(r=>source.close(r));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
