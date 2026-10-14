'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const {createEgressRelay}=require('./egress-relay.cjs');
test('the relay cap counts connections, not sockets',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-'));const sock=path.join(dir,'egress.sock');
  const upstream=net.createServer(socket=>socket.on('data',data=>socket.write(data)));
  await new Promise(resolve=>upstream.listen(sock,resolve));
  const relay=await createEgressRelay(sock,'secret',{maxConnections:2});
  const port=new URL(relay.url).port,clients=[];
  const open=()=>new Promise(resolve=>{
    const client=net.createConnection({port,host:'127.0.0.1'},()=>{client.write('ping');});
    clients.push(client);let got='';
    client.on('data',data=>{got+=data;if(got==='ping')resolve('echo');});
    client.on('close',()=>resolve(got==='ping'?'echo':'reset'));client.on('error',()=>{});
  });
  assert.equal(await open(),'echo');assert.equal(await open(),'echo');
  assert.equal(await open(),'reset');
  for(const client of clients)client.destroy();
  await relay.close();await new Promise(resolve=>upstream.close(resolve));fs.rmSync(dir,{recursive:true});
});
