'use strict';
const crypto=require('node:crypto');
const {upstreamUrl}=require('./origin-policy.cjs');
// This store is controlled only through the trusted wrapper's authenticated
// control socket. Content can see a challenge ID, never an execution ticket.
// State transitions are synchronous so approval, expiry and dispatch have one
// winner even when their HTTP handlers run concurrently.
class NavigationTransactions {
 constructor({now=()=>Date.now(), ttl=30000, approvedTtl=120000, maxPending=256, maxPerTab=8, maxBytes=64*1024*1024, maxBytesPerTab=8*1024*1024}={}) {
  Object.assign(this,{now,ttl,approvedTtl,maxPending,maxPerTab,maxBytes,maxBytesPerTab});
  this.pending=new Map();this.tickets=new Map();this.bytes=0;
 }
 collect() {
  for(const [id,record] of this.pending) {
   if(record.expires<=this.now() && record.state!=='DISPATCHING')this.cancel(id);
  }
 }
 capture({url,method='GET',body=Buffer.alloc(0),contentType='',sourceOrigin,tabId,epoch,initiatorOrigin=sourceOrigin,crossSiteRedirect=false,redirectCount=0,originTaint='same-origin'}) {
  this.collect();
  url=upstreamUrl(url).href;
  if(!['GET','HEAD','POST'].includes(method) || !Buffer.isBuffer(body)
    || typeof tabId!=='string' || !tabId || tabId.length>128
    || !Number.isSafeInteger(epoch) || typeof contentType!=='string' || /[\r\n]/.test(contentType))throw new Error('Invalid navigation');
  if(sourceOrigin!==null)sourceOrigin=upstreamUrl(sourceOrigin).origin;
  if(initiatorOrigin!==null)initiatorOrigin=upstreamUrl(initiatorOrigin).origin;
  if(!['same-origin','same-site','cross-site'].includes(originTaint))throw new Error('Invalid redirect origin');
  if(!Number.isSafeInteger(redirectCount)||redirectCount<0||redirectCount>20||typeof crossSiteRedirect!=='boolean')throw new Error('Invalid redirect chain');
  if(this.pending.size>=this.maxPending || this.bytes+body.length>this.maxBytes)throw new Error('Too many pending navigations');
  const owned=[...this.pending.values()].filter(record=>record.tabId===tabId);
  if(owned.length>=this.maxPerTab || owned.reduce((bytes,record)=>bytes+record.body.length,body.length)>this.maxBytesPerTab)throw new Error('Too many pending navigations in this tab');
  if(['GET','HEAD'].includes(method) && body.length)throw new Error('Unexpected navigation body');
  const challenge=crypto.randomBytes(32).toString('base64url');
  const record={challenge,url,method,body:Buffer.from(body),contentType,sourceOrigin,tabId,epoch,initiatorOrigin,crossSiteRedirect,redirectCount,originTaint,
   expires:this.now()+this.ttl,state:'CAPTURED'};
  this.pending.set(challenge,record);this.bytes+=body.length;
  return challenge;
 }
 approve(challenge,{tabId,epoch,sourceOrigin}) {
  this.collect();const record=this.pending.get(challenge);
  if(!record || record.state!=='CAPTURED' || record.tabId!==tabId || record.epoch!==epoch
    || record.sourceOrigin!==sourceOrigin)throw new Error('Stale navigation');
  const ticket=crypto.randomBytes(32).toString('base64url');
  record.state='APPROVED';record.expires=this.now()+this.approvedTtl;record.ticket=ticket;this.tickets.set(ticket,record);
  return ticket;
 }
 dispatch(ticket,{tabId,epoch}) {
  this.collect();const record=this.tickets.get(ticket);
  if(!record || record.state!=='APPROVED' || record.tabId!==tabId || record.epoch!==epoch)throw new Error('Stale navigation');
  this.tickets.delete(ticket);record.state='DISPATCHING';
  // Never return the mutable stored record to an asynchronous request handler.
  return {id:record.challenge,url:record.url,method:record.method,body:Buffer.from(record.body),
   contentType:record.contentType,sourceOrigin:record.sourceOrigin,initiatorOrigin:record.initiatorOrigin,crossSiteRedirect:record.crossSiteRedirect,redirectCount:record.redirectCount,originTaint:record.originTaint};
 }
 complete(id) {
  const record=this.pending.get(id);
  if(!record || record.state!=='DISPATCHING')throw new Error('Navigation is not running');
  this.remove(record);
 }
 cancel(id) {
  const record=this.pending.get(id);
  if(!record || record.state==='DISPATCHING')return false;
  this.remove(record);return true;
 }
 remove(record) {
  this.pending.delete(record.challenge);if(record.ticket)this.tickets.delete(record.ticket);
  this.bytes-=record.body.length;record.body.fill(0);record.state='COMPLETE';
 }
 invalidateTab(tabId,epoch,exceptChallenge=null) {
  for(const [id,record] of this.pending)if(record.tabId===tabId && record.epoch!==epoch && id!==exceptChallenge)this.cancel(id);
 }
}
module.exports={NavigationTransactions};
