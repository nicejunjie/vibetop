'use strict';
// The engine mirrors each script-visible server cookie to the browser as a
// "__Host-s|..." sync cookie on the physical host, which the page's client reads
// and deletes after its next XHR, fetch or document.cookie access. On a realm
// no page can read, nothing ever deletes them. Images and beacons to tracking
// origins piled up 150+ such cookies under one registrable domain, and the
// browser's per-site cookie cap then evicted the Vibetop session and Browser
// Lite's own credentials. Only send sync cookies a document on this realm can
// read, and expire stale ones the browser still carries.
const {cookieContext}=require('./realm-policy.cjs');
const SYNC_NAME=/^__Host-[sc]\|/;
const EXPIRED='=;path=/;Secure;expires=Thu, 01 Jan 1970 00:00:01 GMT';
function domainMatches(host,domain) {
  domain=String(domain||'').replace(/^\./,'').toLowerCase();
  return !!domain && (host===domain || host.endsWith('.'+domain));
}
function syncCookieDomain(name) {
  try {return decodeURIComponent(name.slice(7).split('|')[3]||'');} catch {return '';}
}
// May a document on this realm read a sync cookie with this name?
// A cross-site iframe (ad cookie-matching frames, mostly) gets none either:
// Safari blocks third-party cookies there, and weather.com alone left ~80.
function readable(name,realm) {
  if(realm.resourceOnly)return false;
  try{if(cookieContext(realm)!=='strict')return false;}catch{return false;}
  let host;try{host=new URL(realm.origin).hostname.toLowerCase();}catch{return false;}
  return domainMatches(host,syncCookieDomain(name));
}
function realmSyncCookies(output,realm,cookieHeader) {
  if(!realm)return output;
  const list=output===undefined?[]:[].concat(output);
  const kept=list.filter(line=>{
    const name=String(line).split('=',1)[0];
    return !SYNC_NAME.test(name) || String(line).includes('expires=Thu, 01 Jan 1970') || readable(name,realm);
  });
  const sending=new Set(kept.map(line=>String(line).split('=',1)[0]));
  for(const part of String(cookieHeader||'').split(';')) {
    const name=part.trim().split('=',1)[0];
    if(SYNC_NAME.test(name) && !readable(name,realm) && !sending.has(name)) {kept.push(name+EXPIRED);sending.add(name);}
  }
  // Never undefined: the engine keeps a header's original value when a transform
  // returns undefined, which sent sites' raw Set-Cookie lines to the browser.
  return kept;
}
module.exports={realmSyncCookies};
