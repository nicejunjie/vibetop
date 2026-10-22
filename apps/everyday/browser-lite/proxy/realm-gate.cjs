'use strict';
const {authorizeResource,authorizeChild}=require('./realm-policy.cjs');
function samePhysical(value,record) {
 try{return new URL(value).origin===record.physical;}catch{return false;}
}
function sourceRecord(headers,target,registry) {
 if(headers.origin) {
  if(headers.origin==='null')return null;
  const record=registry.original(headers.origin);
  if(headers['sec-fetch-site']==='same-origin' && !samePhysical(headers.origin,target))return null;
  return record;
 }
 if(headers['sec-fetch-site']==='same-origin')return target;
 if(headers.referer)return registry.original(headers.referer);
 return null;
}
// Browser-controlled source headers prove entry into a context; signed target
// URLs only recover target metadata. Possessing or copying a URL is not proof.
function authorizeRequest(headers,target,registry,{approvedMain=false,websocket=false,workerModule=false}={}) {
 // Browser WebSocket handshakes omit Fetch Metadata and Referer. Their native
 // Origin is mandatory here; an actual upgrade is supplied by the server, never
 // inferred from a website-controlled request header or a copied proxy URL.
 if(websocket) {
  if(headers['sec-fetch-mode'] && headers['sec-fetch-mode']!=='websocket')return {allowed:false};
  const source=headers.origin && headers.origin!=='null' ? registry.original(headers.origin) : null;
  return {allowed:authorizeResource(source,target),source,navigation:false};
 }
 const mode=headers['sec-fetch-mode'],dest=headers['sec-fetch-dest'];
 if(!mode || !dest || !headers['sec-fetch-site'])return {allowed:false};
 if(['serviceworker','sharedworker','object','embed'].includes(dest))return {allowed:false};
 const source=sourceRecord(headers,target,registry);
 if(mode==='navigate' || ['document','iframe','frame'].includes(dest)) {
  if(mode!=='navigate' || dest!=='iframe' || target.resourceOnly)return {allowed:false};
  return {allowed:approvedMain || authorizeChild(source,target),source,navigation:true};
 }
 // Both engines use worker/cors for module dependencies, but worker/same-origin
 // for entries. A graph flag never promotes a resource-only host to an entry.
 const moduleDependency=workerModule && dest==='worker' && mode==='cors';
 if(['worker','sharedworker'].includes(dest) && !moduleDependency
    && (target.resourceOnly || !source || source.origin!==target.origin))return {allowed:false};
 return {allowed:authorizeResource(source,target),source,navigation:false};
}
module.exports={sourceRecord,authorizeRequest};
