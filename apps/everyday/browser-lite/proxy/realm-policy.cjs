'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const {upstreamUrl}=require('./origin-policy.cjs');
const {toughCookie}=require('./engine.cjs');
function site(input) {
 const url=upstreamUrl(input);
 let domain;try{domain=toughCookie.getPublicSuffix(url.hostname);}catch{}
 return url.protocol+'//'+(domain||url.hostname);
}
// A context belongs to a document, not to the CDN serving its stylesheet. CSS
// and modules retain that context. A nested document creates a new context and
// taints the complete ancestor chain after its first cross-site ancestor.
function mainContext(url) {return {documentOrigin:upstreamUrl(url).origin,topSite:site(url),tainted:false};}
function childContext(parent,url) {
 const origin=upstreamUrl(url).origin;
 return {documentOrigin:origin,topSite:parent.topSite,
  tainted:parent.tainted || site(parent.documentOrigin)!==parent.topSite || site(origin)!==parent.topSite};
}
function contextKey(context) {return JSON.stringify([context.documentOrigin,context.topSite,context.tainted]);}
class RealmRegistry {
 constructor({uid,profile,secret,domain,port='',stateFile,maxRecords=100000}) {
  if(!Number.isSafeInteger(uid)||uid<0||!/^[a-f0-9]{32}$/.test(profile)||!secret||!/^[a-z0-9.-]+$/.test(domain))throw new Error('Invalid realm registry');
  Object.assign(this,{uid,profile,secret,domain,port:String(port),maxRecords});this.records=new Map();
  if(stateFile) {
   let saved='';try{saved=fs.readFileSync(stateFile,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
   const lines=saved.split('\n');
   // A crash can truncate the final unacknowledged append. Complete lines must
   // parse: silently forgetting an acknowledged source host breaks isolation.
   lines.pop();
   for(const line of lines)if(line){const record=JSON.parse(line);this.register(record.origin,record.context);}
   this.stateFile=stateFile;
   if(saved && !saved.endsWith('\n'))fs.truncateSync(stateFile,Buffer.byteLength(saved.slice(0,saved.lastIndexOf('\n')+1)));
  }
 }
 contextToken(context) {
  const data=Buffer.from(contextKey(context)).toString('base64url');
  const signature=crypto.createHmac('sha256',this.secret).update(this.profile+'\0context\0'+data).digest('base64url');
  return data+'.'+signature;
 }
 readContext(token) {
  if(typeof token!=='string'||token.length>2048)throw new Error('Invalid context');
  const [data,signature,...extra]=token.split('.');
  if(extra.length||!data||!signature)throw new Error('Invalid context');
  const expected=crypto.createHmac('sha256',this.secret).update(this.profile+'\0context\0'+data).digest();
  const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw new Error('Invalid context');
  const [documentOrigin,topSite,tainted]=JSON.parse(Buffer.from(data,'base64url').toString());
  if(upstreamUrl(documentOrigin).origin!==documentOrigin||site(topSite)!==topSite||typeof tainted!=='boolean')throw new Error('Invalid context');
  return {documentOrigin,topSite,tainted};
 }
 // Third-party hosts inside a document's context (CDNs, ad servers, beacons)
 // are named from a per-context key, so the document can name them itself
 // instead of a synchronous round trip per new origin. The key only yields
 // hosts the document could already obtain from /__vt/map; it cannot sign
 // contexts or name another context's hosts. Document hosts, where sites keep
 // storage, keep their original derivation.
 resourceKey(context) {
  return crypto.createHmac('sha256',this.secret).update(this.profile+'\0resource-realm\0'+contextKey(context)).digest();
 }
 digest(origin,context) {
  if(origin!==context.documentOrigin)return crypto.createHmac('sha256',this.resourceKey(context)).update(origin).digest('hex').slice(0,32);
  return crypto.createHmac('sha256',this.secret).update(this.profile+'\0realm\0'+origin+'\0'+contextKey(context)).digest('hex').slice(0,32);
 }
 hostAffixes() {return {prefix:`https://bl-u${this.uid}-`,suffix:`.${this.domain}${this.port?':'+this.port:''}`};}
 describe(url,context) {
  const origin=upstreamUrl(url).origin;
  // Validate both internal and recovered contexts through one canonical form.
  context=this.readContext(this.contextToken(context));
  const digest=this.digest(origin,context);
  const physical=`https://bl-u${this.uid}-${digest}.${this.domain}${this.port?':'+this.port:''}`;
  return {origin,context,physical,resourceOnly:origin!==context.documentOrigin};
 }
 register(url,context) {
  const record=this.describe(url,context);
  const {origin,physical}=record;context=record.context;
  const host=new URL(physical).host;
  if(this.records.has(host))return this.records.get(host);
  if(this.records.size>=this.maxRecords)throw new Error('Browser context storage limit');
  if(this.stateFile) {
   const fd=fs.openSync(this.stateFile,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);
   try{fs.writeFileSync(fd,JSON.stringify({origin,context})+'\n');fs.fdatasyncSync(fd);}finally{fs.closeSync(fd);}
  }
  this.records.set(host,record);return record;
 }
 recover(host,url,token) {
  const context=this.readContext(token),origin=upstreamUrl(url).origin;
  const digest=this.digest(origin,context);
  const expected=`bl-u${this.uid}-${digest}.${this.domain}${this.port?':'+this.port:''}`;
  if(expected!==host)throw new Error('Wrong realm host');
  return this.register(url,context);
 }
 original(physical) {try{const url=new URL(physical),record=this.records.get(url.host);return record?.physical===url.origin?record:null;}catch{return null;}}
}
function authorizeResource(source,target) {
 return !!source && contextKey(source.context)===contextKey(target.context);
}
function authorizeChild(source,target) {
 return !!source && !source.resourceOnly && !target.resourceOnly
  && contextKey(childContext(source.context,target.origin))===contextKey(target.context);
}
function cookieContext(record) {
 return !record.context.tainted && site(record.origin)===record.context.topSite ? 'strict':'none';
}
module.exports={RealmRegistry,site,mainContext,childContext,contextKey,authorizeResource,authorizeChild,cookieContext};
