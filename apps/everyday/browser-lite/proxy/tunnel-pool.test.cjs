'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),https=require('node:https'),net=require('node:net');
const {execFileSync}=require('node:child_process');
const {hammerhead}=require('./engine.cjs');
function certificate(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vt-tunnel-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost',
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
