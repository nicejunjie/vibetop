'use strict';
const crypto=require('node:crypto');
// Ephemeral executable bytes belong to one exact document realm. This is not
// an upstream fetch API, and it never returns a different realm's source code.
class WorkerStore {
 constructor({now=()=>Date.now(),ttl=60000,maxBytes=32*1024*1024,maxEntries=64,maxTotalBytes=128*1024*1024,maxTotalEntries=256}={}) {
  Object.assign(this,{now,ttl,maxBytes,maxEntries,maxTotalBytes,maxTotalEntries});this.entries=new Map();this.bytes=0;
 }
 collect() {for(const [id,item] of this.entries)if(item.expires<=this.now())this.remove(id);}
 remove(id) {const item=this.entries.get(id);if(item){this.bytes-=item.body.length;this.entries.delete(id);}}
 put(physical,body,metadata={}) {
  this.collect();
  const own=[...this.entries.values()].filter(item=>item.physical===physical);
  const ownBytes=own.reduce((sum,item)=>sum+item.body.length,0);
  if(!Buffer.isBuffer(body)||ownBytes+body.length>this.maxBytes||own.length>=this.maxEntries
    ||this.bytes+body.length>this.maxTotalBytes||this.entries.size>=this.maxTotalEntries)throw new Error('Worker source limit');
  const id=crypto.randomBytes(32).toString('base64url');
  this.entries.set(id,{physical,body:Buffer.from(body),metadata:Object.freeze({...metadata}),expires:this.now()+this.ttl});this.bytes+=body.length;return id;
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
