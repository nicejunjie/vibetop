'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),https=require('node:https'),net=require('node:net');
const {execFileSync}=require('node:child_process');
const {hammerhead}=require('./engine.cjs');
function certificate(name='localhost'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-tunnel-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN='+name,'-addext','subjectAltName=DNS:'+name,
    '-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
  const pair={key:fs.readFileSync(path.join(dir,'key.pem')),cert:fs.readFileSync(path.join(dir,'cert.pem'))};
  fs.rmSync(dir,{recursive:true,force:true});
  return pair;
}
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return server.address().port;}
test('HTTPS through the egress reuses a capped pool of tunnels',async()=>{
  const {key,cert}=certificate();
  const site=https.createServer({key,cert},(req,res)=>setTimeout(()=>res.end('ok '+req.url),20));
  const sitePort=await listen(site);
  const tunnels=[],sockets=new Set();
  const proxy=http.createServer();
  proxy.on('connect',(req,client,head)=>{
    sockets.add(client);
    tunnels.push({target:req.url,auth:req.headers['proxy-authorization']});
    if(req.headers['proxy-authorization']!=='Basic secret'){client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');return;}
    const remote=net.connect(sitePort,'127.0.0.1');sockets.add(remote);remote.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote).pipe(client);});
    remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());
  });
  const proxyPort=await listen(proxy);
  const agentFor=hammerhead('request-pipeline/destination-request/agent').vtTunnelAgentFor;
  const settings={host:'127.0.0.1:'+proxyPort,hostname:'127.0.0.1',port:String(proxyPort),authHeader:'Basic secret'};
  assert.equal(agentFor(settings,'localhost:'+sitePort),agentFor({...settings},'localhost:'+sitePort));
  assert.notEqual(agentFor(settings,'localhost:'+sitePort),agentFor(settings,'other:443'));
  const get=(agent,i)=>new Promise((resolve,reject)=>https.get({host:'localhost',port:sitePort,path:'/'+i,agent,ca:cert},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve(body));}).on('error',reject));
  const agent=agentFor(settings,'localhost:'+sitePort);
  for(let i=0;i<5;i++)assert.equal(await get(agent,i),'ok /'+i);
  assert.equal(tunnels.length,1);
  assert.equal(tunnels[0].target,'localhost:'+sitePort);
  const bodies=await Promise.all(Array.from({length:40},(_,i)=>get(agent,'p'+i)));
  assert.equal(bodies.length,40);
  assert.ok(tunnels.length<=8,'opened '+tunnels.length+' tunnels for 40 requests');
  const wrong=agentFor({...settings,authHeader:'Basic wrong'},'localhost:'+sitePort);
  await assert.rejects(get(wrong,'x'),/Tunnel refused with 407/);
  for(const a of [agent,wrong,agentFor(settings,'other:443')])a.destroy();
  for(const s of sockets)s.destroy();
  site.closeAllConnections();proxy.closeAllConnections();
  await Promise.all([new Promise(r=>site.close(r)),new Promise(r=>proxy.close(r))]);
});
// Node reads extra trusted CAs only at startup, so the gateway runs in a child.
const H2_CHILD=String.raw`
const http=require('node:http'),http2=require('node:http2'),https=require('node:https'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BrowserGateway}=require('./gateway.cjs');const {RealmOrigins}=require('./realm-origins.cjs');
const {mainContext}=require('./realm-policy.cjs');const {EgressProxy}=require('./egress.cjs');
(async()=>{
  const {key,cert,h2}=JSON.parse(process.argv[1]);const versions=[];let connections=0;
  const handler=(req,res)=>{versions.push(req.httpVersion);setTimeout(()=>{res.setHeader('content-type','text/plain');res.end('ok '+req.url);},30);};
  const site=h2?http2.createSecureServer({key,cert,allowHTTP1:true},handler):https.createServer({key,cert},handler);
  site.on('secureConnection',()=>connections++);
  await new Promise(r=>site.listen(0,'127.0.0.1',r));const port=site.address().port;
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],connect:()=>net.createConnection({host:'127.0.0.1',port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-h2-'));const socketPath=path.join(dir,'g.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const origin='https://h2.example',page=new URL(registry.scope.run({authorization},()=>gateway.url(origin+'/',{context:mainContext(origin)})));
  const get=i=>{const url=new URL(registry.scope.run({authorization},()=>gateway.url(origin+'/asset/'+i+'.txt',{context:mainContext(origin)})));
    const headers={Host:url.host,'X-VT-Browser-Role':'auth','Sec-Fetch-Dest':'image','Sec-Fetch-Mode':'no-cors','Sec-Fetch-Site':'same-origin',Referer:page.href,
      ...Object.fromEntries(Object.entries(authorization).map(([k,v])=>['X-VT-Browser-'+k,String(v)]))};
    return new Promise((resolve,reject)=>http.request({socketPath,path:url.pathname+url.search,headers},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve(res.statusCode+' '+b));}).on('error',reject).end());};
  const bodies=await Promise.all(Array.from({length:60},(_,i)=>get(i)));
  console.log(JSON.stringify({bodies,versions,connections}));
  await gateway.close();await egress.close();site.close();fs.rmSync(dir,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});`;
for(const h2 of [true,false]) test(h2?'an h2 upstream gets every request over one HTTP/2 connection through the egress':'an HTTP/1.1-only upstream still works through the pooled tunnels',{timeout:30000},()=>{
  const {key,cert}=certificate('h2.example');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-ca-'));fs.writeFileSync(path.join(dir,'ca.pem'),cert);
  try {
    const out=execFileSync(process.execPath,['-e',H2_CHILD,JSON.stringify({key:String(key),cert:String(cert),h2})],
      {cwd:__dirname,env:{...process.env,NODE_EXTRA_CA_CERTS:path.join(dir,'ca.pem')},encoding:'utf8',timeout:25000});
    const {bodies,versions,connections}=JSON.parse(out.trim().split('\n').pop());
    assert.deepEqual(bodies,Array.from({length:60},(_,i)=>'200 ok /asset/'+i+'.txt'));
    if(h2) {
      assert.deepEqual([...new Set(versions)],['2.0']);
      assert.equal(connections,1,'one upstream connection for 60 requests');
    } else {
      assert.deepEqual([...new Set(versions)],['1.1']);
      assert.ok(connections<=9,'HTTP/1.1 stays within the pool: '+connections);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
