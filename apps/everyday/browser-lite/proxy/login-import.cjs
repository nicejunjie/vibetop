'use strict';
// Merge one site's logins from the full Browser into Browser Lite's first-party
// jar. The manager reads them (as the user -- including the user's own Google
// session, so Google services load signed in) and sends them with an
// address-bar "open". Lite keeps cookies it earned itself (Cloudflare's bot
// cookies are bound to the browser that solved them): a cookie Lite already has
// is replaced only when the Browser changed it after Lite's last sync of that
// site, e.g. a fresh sign-in there.
const {toughCookie}=require('./engine.cjs');
const SAME_SITE=new Set(['none','lax','strict']);
const MAX=150;
function validCookie(cookie,host) {
  if(!cookie||typeof cookie!=='object')return false;
  const {name,value,domain,path}=cookie;
  if(typeof name!=='string'||typeof value!=='string'||typeof domain!=='string'||typeof path!=='string')return false;
  if(!name||name.length+value.length>4096||!path.startsWith('/')||path.length>1024)return false;
  if(/[\0-\x1f\x7f;=]/.test(name)||/[\0-\x1f\x7f;]/.test(value))return false;
  const d=domain.toLowerCase();
  return cookie.hostOnly===true?host===d:(host===d||host.endsWith('.'+d));
}
function importLogins(jar,url,cookies,{lastSync=0,now=Date.now()}={}) {
  if(!Array.isArray(cookies)||!cookies.length)return 0;
  let host;
  try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))return 0;host=parsed.hostname.toLowerCase();}catch{return 0;}
  let changed=0;
  for(const cookie of cookies.slice(0,MAX)) {
    if(!validCookie(cookie,host))continue;
    const domain=cookie.domain.toLowerCase();
    const expires=Number.isFinite(cookie.expires)?new Date(cookie.expires):'Infinity';
    if(expires!=='Infinity' && expires.getTime()<=now)continue;
    const existing=jar._findCookieSync(domain,cookie.path,cookie.name);
    const live=existing && (existing.expires==='Infinity'||!existing.expires||new Date(existing.expires).getTime()>now);
    if(live && !(Number(cookie.updated)>lastSync))continue;
    if(live && existing.value===cookie.value)continue;
    jar._putCookieSync(new toughCookie.Cookie({key:cookie.name,value:cookie.value,domain,path:cookie.path,expires,
      secure:cookie.secure===true,httpOnly:cookie.httpOnly===true,hostOnly:cookie.hostOnly===true,
      sameSite:SAME_SITE.has(cookie.sameSite)?cookie.sameSite:'lax',
      creation:existing?.creation||new Date(now),lastAccessed:new Date(now)}));
    changed++;
  }
  return changed;
}
// When each site was last synced, kept beside the cookie jar. In memory alone it
// reset on every runtime restart, so the next open treated every carried cookie
// as "changed since the last sync" and replaced the fresher copies Lite had
// earned since. For Google that rolled Lite back to the full Browser's older
// session tokens, which a Lite used without the full Browser cannot afford.
const fs=require('node:fs');
const MAX_SITES=4096;
class SyncTimes {
  constructor(file){
    this.file=file;this.times=new Map();
    if(!file)return;
    try {
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      for(const [site,time] of Object.entries(saved&&typeof saved==='object'?saved:{}))
        if(typeof site==='string'&&Number.isSafeInteger(time)&&this.times.size<MAX_SITES)this.times.set(site,time);
    } catch {}
  }
  get(site){return this.times.get(site)||0;}
  set(site,time){
    this.times.delete(site);this.times.set(site,time);
    while(this.times.size>MAX_SITES)this.times.delete(this.times.keys().next().value);
    if(!this.file)return;
    const temporary=this.file+'.tmp';
    try{fs.writeFileSync(temporary,JSON.stringify(Object.fromEntries(this.times)),{mode:0o600});fs.renameSync(temporary,this.file);}catch{}
  }
}
module.exports={importLogins,SyncTimes};
