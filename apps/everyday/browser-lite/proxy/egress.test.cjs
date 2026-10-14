'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EgressProxy,publicAddress}=require('./egress.cjs');
for(const address of ['127.0.0.1','0.0.0.0','10.1.2.3','172.16.2.3','192.168.1.2','169.254.169.254','100.64.0.1','224.0.0.1','240.0.0.1','::','::1','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1','64:ff9b::a00:1','2002:7f00:1::1','2001:db8::1']) {
 test('deny '+address,()=>assert.equal(publicAddress(address),false));
}
test('public IPv4 and IPv6',()=>{
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true);
});
test('mixed public/private DNS fails closed',async()=>{
 const p=new EgressProxy({resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]});
 await assert.rejects(p.destination('mixed.example',443),/Destination/);
});
test('global IPv6 addresses on local networks and newly assigned addresses are denied',async()=>{
 let local={eth0:[{address:'2600:1700:abcd:1::5',cidr:'2600:1700:abcd:1::5/64'}]};
 const p=new EgressProxy({interfaces:()=>local});
 await assert.rejects(p.destination('2600:1700:abcd:1::99',443));
 local={eth0:[{address:'8.8.8.8',cidr:'8.8.8.8/32'}]};
 await assert.rejects(p.destination('8.8.8.8',443));
});
test('socket connects to checked IP, never repeats hostname lookup',async()=>{
 const {EventEmitter}=require('node:events');let checks=0;let target;
 const p=new EgressProxy({resolve:async()=>{checks++;return [{address:'8.8.8.8',family:4}]},
  connect:options=>{target=options;const s=new EventEmitter();s.setTimeout=()=>{};queueMicrotask(()=>s.emit('connect'));return s}});
 await p.open('public.example',443);assert.equal(checks,1);assert.equal(target.host,'8.8.8.8');
});
test('nonweb ports and local aliases are denied',async()=>{
 const p=new EgressProxy({resolve:async()=>[{address:'127.0.0.1',family:4}]});
 await assert.rejects(p.destination('localhost.example',443));
 await assert.rejects(p.destination('public.example',22));
});
test('loopback listener requires its own random proxy credential',async()=>{
 const p=new EgressProxy();await p.listen();
 try {const status=await new Promise((resolve,reject)=>{require('node:http').get('http://127.0.0.1:'+p.server.address().port+'/',r=>{r.resume();resolve(r.statusCode)}).on('error',reject)});assert.equal(status,407)}
 finally{await p.close()}
});

test('HTTP relay uses the pinned socket and strips proxy credentials',async()=>{
 const http=require('node:http');const net=require('node:net');let seen;
 const target=http.createServer((req,res)=>{seen=req.headers;res.end('public fixture')});
 await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const p=new EgressProxy({resolve:async()=>[{address:'8.8.8.8',family:4}],
   connect:options=>{assert.equal(options.host,'8.8.8.8');return net.createConnection({host:'127.0.0.1',port:target.address().port})}});
 await p.listen();
 try{
  const result=await new Promise((resolve,reject)=>{
   http.get({host:'127.0.0.1',port:p.server.address().port,path:'http://public.example/path',headers:{'Proxy-Authorization':p.authorization}},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>resolve([r.statusCode,b]))}).on('error',reject);
  });
  assert.deepEqual(result,[200,'public fixture']);assert.equal(seen.host,'public.example');assert.equal(seen['proxy-authorization'],undefined);
 }finally{await p.close();await new Promise(r=>target.close(r))}
});

test('own proxy domain is rejected before resolving a public tunnel address',async()=>{
 let resolutions=0;
 const proxy=new EgressProxy({deniedDomains:['nicejunjie.com'],resolve:async()=>{resolutions++;return [{address:'1.1.1.1',family:4}];}});
 for(const host of ['nicejunjie.com','bl-u1000-content.nicejunjie.com','VIBETOP.NICEJUNJIE.COM.'])await assert.rejects(proxy.destination(host,443),/not allowed/);
 assert.equal(resolutions,0);
 await proxy.destination('notnicejunjie.com',443);assert.equal(resolutions,1);
});
test('a burst past the connection limit waits for a slot instead of failing',async()=>{
 const {EventEmitter}=require('node:events');const sockets=[];
 const p=new EgressProxy({maxConnections:2,slotWait:2000,resolve:async()=>[{address:'8.8.8.8',family:4}],
  connect:()=>{const s=new EventEmitter();s.setTimeout=()=>{};s.destroy=()=>s.emit('close');sockets.push(s);queueMicrotask(()=>s.emit('connect'));return s}});
 await p.open('a.example',443);await p.open('b.example',443);
 const third=p.open('c.example',443);let done=false;third.then(()=>{done=true;});
 await new Promise(r=>setTimeout(r,50));assert.equal(done,false);
 sockets[0].destroy();await third;assert.equal(sockets.length,3);
});
test('the limit still fails once the wait expires',async()=>{
 const {EventEmitter}=require('node:events');
 const p=new EgressProxy({maxConnections:1,slotWait:50,resolve:async()=>[{address:'8.8.8.8',family:4}],
  connect:()=>{const s=new EventEmitter();s.setTimeout=()=>{};queueMicrotask(()=>s.emit('connect'));return s}});
 await p.open('a.example',443);
 await assert.rejects(p.open('b.example',443),/Connection limit/);
 assert.equal(p.waiters.length,0);
});
