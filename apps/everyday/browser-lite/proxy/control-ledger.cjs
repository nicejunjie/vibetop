'use strict';
const crypto=require('node:crypto');
// One serialized command lane per trusted UI tab. Keep the latest outcome,
// including errors, so a lost response never repeats a mutation or POST approval.
// A lane outlives a phone keeping Safari in the background for hours (24 h, not
// 30 min): the page is still in the browser, only this record went quiet. At
// the open-lane limit the least recently used lane is evicted instead of
// refusing a new tab; its UI reloads that page when it next checks in.
class ControlLedger {
 constructor({perform,expire,now=()=>Date.now(),ttl=24*60*60*1000,limit=128}) {
  Object.assign(this,{perform,expire,now,ttl,limit});this.lanes=new Map();
 }
 collect() {
  for(const [id,lane] of this.lanes)if(lane.expires<=this.now()) {
   this.expire(lane.tabId);this.lanes.delete(id);
  }
 }
 run(command,{clientId,operation,...body},owner=null) {
  this.collect();
  if(typeof clientId!=='string'||! /^[a-f0-9-]{36}$/.test(clientId)
    ||!Number.isSafeInteger(operation)||operation<1)throw new Error('Invalid browser operation');
  let lane=this.lanes.get(clientId);
  if(!lane) {
   if(operation!==1)throw new Error('Browser tab expired');
   const open=[...this.lanes.entries()].filter(([,item])=>!item.closed);
   if(open.length>=this.limit)this.evict(open);
   if(this.lanes.size>=4096)this.evict([...this.lanes.entries()]);
   lane={operation:0,tabId:body.tabId,owner};this.lanes.set(clientId,lane);
  }
  if(lane.owner!==owner)throw new Error('Browser session mismatch');
  const fingerprint=crypto.createHash('sha256').update(command+'\0'+JSON.stringify(body)).digest('hex');
  lane.expires=this.now()+this.ttl;
  if(operation===lane.operation) {
   if(fingerprint!==lane.fingerprint)throw new Error('Browser operation changed');
   if(lane.error)throw new Error(lane.error);
   return lane.result;
  }
  if(operation!==lane.operation+1)throw new Error('Stale browser operation');
  if(lane.tabId && body.tabId!==lane.tabId)throw new Error('Browser tab changed');
  lane.operation=operation;lane.fingerprint=fingerprint;lane.error=null;lane.result=null;
  try {
   lane.result=this.perform(command,body);lane.tabId=lane.result.tabId||lane.tabId;lane.closed=!!lane.result.closed;
   return lane.result;
  }catch(error){lane.error=error.message;throw error;}
 }
 touch(clientId,owner=null) {
  this.collect();const lane=this.lanes.get(clientId);
  if(!lane)throw new Error('Browser tab expired');
  if(lane.owner!==owner)throw new Error('Browser session mismatch');
  lane.expires=this.now()+this.ttl;return {alive:true};
 }
 evict(entries) {
  const [id,lane]=entries.reduce((oldest,entry)=>entry[1].expires<oldest[1].expires?entry:oldest);
  this.expire(lane.tabId);this.lanes.delete(id);
 }
 revoke(owner) {
  for(const [id,lane] of this.lanes)if(lane.owner===owner){this.expire(lane.tabId);this.lanes.delete(id);}
 }
}
module.exports={ControlLedger};
