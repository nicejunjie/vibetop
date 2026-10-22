'use strict';
const crypto=require('node:crypto');
// A worker is started before its source is uploaded (see client-bridge.js),
// so the page names the id: 32 random bytes, base64url.
const CLIENT_ID=/^[A-Za-z0-9_-]{43}$/;
// Ephemeral executable bytes belong to one exact document realm. This is not
// an upstream fetch API, and it never returns a different realm's source code.
class WorkerStore {
 constructor({now=()=>Date.now(),ttl=60000,maxBytes=32*1024*1024,maxEntries=64,maxTotalBytes=128*1024*1024,maxTotalEntries=256}={}) {
  Object.assign(this,{now,ttl,maxBytes,maxEntries,maxTotalBytes,maxTotalEntries});this.entries=new Map();this.bytes=0;
  this.waiters=new Map();this.failed=new Map();
 }
 collect() {
  for(const [id,item] of this.entries)if(item.expires<=this.now())this.remove(id);
  for(const [id,item] of this.failed)if(item.expires<=this.now())this.failed.delete(id);
 }
 remove(id) {const item=this.entries.get(id);if(item){this.bytes-=item.body.length;this.entries.delete(id);}}
 put(physical,body,metadata={},clientId) {
  this.collect();
  if(clientId!==undefined && (!CLIENT_ID.test(clientId)||this.entries.has(clientId)||this.failed.has(clientId)))throw new Error('Invalid worker id');
  const own=[...this.entries.values()].filter(item=>item.physical===physical);
  const ownBytes=own.reduce((sum,item)=>sum+item.body.length,0);
  if(!Buffer.isBuffer(body)||ownBytes+body.length>this.maxBytes||own.length>=this.maxEntries
    ||this.bytes+body.length>this.maxTotalBytes||this.entries.size>=this.maxTotalEntries)throw new Error('Worker source limit');
  const id=clientId??crypto.randomBytes(32).toString('base64url');
  this.entries.set(id,{physical,body:Buffer.from(body),metadata:Object.freeze({...metadata}),expires:this.now()+this.ttl});this.bytes+=body.length;
  this.settle(physical,id);
  return id;
 }
 // The upload failed or was abandoned: answer a waiting worker at once.
 fail(physical,clientId) {
  if(!CLIENT_ID.test(String(clientId))||this.entries.has(clientId))return;
  this.collect();
  if(this.failed.size<this.maxTotalEntries)this.failed.set(clientId,{physical,expires:this.now()+this.ttl});
  this.settle(physical,clientId);
 }
 settle(physical,id) {
  const list=this.waiters.get(id);if(!list)return;
  this.waiters.delete(id);
  for(const waiter of list)waiter(this.get(waiter.physical,id));
 }
 // Resolve with the source once it is uploaded, or null on failure or timeout.
 wait(physical,id,timeout=30000) {
  const ready=this.get(physical,id);
  if(ready||this.entries.has(id)||!CLIENT_ID.test(String(id))||this.failed.has(id))return Promise.resolve(ready);
  let count=0;for(const list of this.waiters.values())count+=list.length;
  if(count>=this.maxTotalEntries)return Promise.resolve(null);
  return new Promise(resolve=>{
    const list=this.waiters.get(id)||[];this.waiters.set(id,list);
    const timer=setTimeout(()=>{
      const at=list.indexOf(waiter);if(at>=0)list.splice(at,1);
      if(!list.length && this.waiters.get(id)===list)this.waiters.delete(id);
      resolve(null);
    },timeout);
    const waiter=Object.assign(body=>{clearTimeout(timer);resolve(body);},{physical});
    list.push(waiter);
  });
 }
 get(physical,id) {
  this.collect();const item=this.entries.get(id);
  if(!item||item.physical!==physical)return null;
  // A dropped worker response can be retried without running any server-side
  // action twice. Keep the realm-bound source until its short expiry.
  return item.body;
 }
}
module.exports={WorkerStore};
