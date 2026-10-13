// Isolated feasibility spike: fixed loopback fixtures only. Never production.
const http=require('node:http');
const {createRequire}=require('node:module');
const path=require('node:path');
const engineRoot=process.env.RAMMERHEAD_SOURCE;
if(!engineRoot)throw new Error('Set RAMMERHEAD_SOURCE to the pinned patched evaluation checkout');
const engineRequire=createRequire(path.join(engineRoot,'package.json'));
const Proxy=engineRequire('./src/classes/RammerheadProxy');
const Session=engineRequire('./src/classes/RammerheadSession');
const urls=engineRequire('testcafe-hammerhead/lib/utils/url');
const Context=engineRequire('testcafe-hammerhead/lib/request-pipeline/context');
const map={
 'http://a.vt-source.test:18985':'http://a.vt-proxy.test:18990',
 'http://b.vt-source.test:18985':'http://b.vt-proxy.test:18990',
 'http://c.vt-source.test:18985':'http://c.vt-proxy.test:18990'
};
const inverse=Object.fromEntries(Object.entries(map).map(([a,b])=>[b,a]));
const raw=urls.getProxyUrl;
urls.getProxyUrl=function(url,opts){
 let u;try{u=new URL(url)}catch{return raw(url,opts)}
 if(u.protocol==='about:') return raw(url,opts);
 const p=map[u.origin]; if(!p) throw new Error('Unmapped fixture origin '+u.origin);
 const target=new URL(p);
 return raw(url,{...opts,proxyHostname:target.hostname,proxyPort:target.port,proxyProtocol:target.protocol});
};
Context.prototype.getProxyOrigin=function(){
 return map[this.dest.reqOrigin] || this.req.headers.origin || map[this.dest.domain];
};
const resolveInjectable=Context.prototype.resolveInjectableUrl;
Context.prototype.resolveInjectableUrl=function(url){
 const result=resolveInjectable.call(this,url);
 return /\/(?:iframe-)?task\.js$/.test(url) ? result+'?document='+encodeURIComponent(this.dest.url) : result;
};
const dispatch=Context.prototype.dispatch;
Context.prototype.dispatch=function(...args){
 const result=dispatch.apply(this,args);
 if(result){
  const origin=this.req.headers.origin;
  const referer=this.req.headers.referer;
  const physicalReferer=referer && new URL(referer).origin;
  this.dest.reqOrigin=origin ? (inverse[origin] || 'null') : (inverse[physicalReferer] || this.dest.domain);
  if(referer){
   const parsed=urls.parseProxyUrl(referer);
   this.dest.referer=parsed && map[new URL(parsed.destUrl).origin]===physicalReferer ? parsed.destUrl : (inverse[physicalReferer] || 'null');
  }
 }
 return result;
};
const Cookie=engineRequire(engineRequire.resolve('tough-cookie',{paths:[engineRequire.resolve('testcafe-hammerhead')]})).Cookie;
Context.prototype._applyClientSyncCookie=function(){
 for(const c of this.parsedClientSyncCookie?.actual || []){
  if(c.isClientSync && c.sid===this.session.id && !c.httpOnly){
   this.session.cookies._set(this.dest.url,new Cookie(c),true);
  }
 }
};
const session=new Session({id:'fixtureprofile',disableShuffling:true,prependScripts:['/origin-map.js']});
const proxy=new Proxy({bindingAddress:'127.0.0.1',port:18990,crossDomainPort:null,disableLocalStorageSync:true,
 getServerInfo:req=>({hostname:new URL('http://'+req.headers.host).hostname,port:18990,crossDomainPort:18990,protocol:'http:'})});
session.handleServiceMessage=async function(){throw new Error('No fixture service commands allowed')};
proxy.openSessions.set(session.id,session);
proxy.GET('/origin-map.js',{content:`(function(){
const map=${JSON.stringify(map)};
window.rammerheadDisableLocalStorageImplementation=true;
window.overrideGetProxyUrl(original=>function(url,opts){
 let parsed=window['%hammerhead%'].utils.url.parseProxyUrl(url);
 if(parsed && Object.values(map).includes(new URL(url).origin)) url=parsed.destUrl;
 let u;try{u=new URL(url)}catch{return original(url,opts)}
 if(u.protocol==='about:')return original(url,opts);
 const physical=map[u.origin];if(!physical)throw new Error('Unmapped fixture origin '+u.origin);
 const p=new URL(physical);
 return original(url,Object.assign({},opts,{proxyHostname:p.hostname,proxyPort:p.port,proxyProtocol:p.protocol}));
});
})();`,contentType:'application/javascript'});
proxy.onRequestPipeline.push((req,res,info,isRoute)=>{
 const actual='http://'+req.headers.host;
 const upstream=inverse[actual];
 const deny=()=>{console.error('deny',req.url,'ref',req.headers.referer);res.writeHead(403);res.end('Origin mismatch');return true};
 if(!upstream)return deny();
 const parsed=urls.parseProxyUrl(actual+req.url);
 if(parsed && (parsed.sessionId!==session.id || new URL(parsed.destUrl).origin!==upstream))return deny();
 if(req.url.startsWith('/syncLocalStorage'))return deny();
 if(req.url.startsWith('/task.js') || req.url.startsWith('/iframe-task.js')){
  const documentUrl=new URL(req.url,actual).searchParams.get('document');
  let doc;try{doc=new URL(documentUrl)}catch{return deny()}
  if(doc.origin!==upstream)return deny();
  req.headers.referer=urls.getProxyUrl(doc.href,{sessionId:session.id});
 }
});
const fixture=http.createServer((req,res)=>{
 const own=new URL('http://'+req.headers.host).hostname[0];
 if(req.url==='/api') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({site:own,cookie:req.headers.cookie||''}));return}
 if(req.url==='/img.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>');return}
 res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie',`secret_${own}=private_${own}; HttpOnly; Path=/`);
 res.end(`<!doctype html><meta charset="utf-8"><title>Site ${own}</title><h1>Site ${own}</h1><input id="input"><button id="button">Count</button><output id="count">0</output><img id="image" src="/img.svg"><pre id="data"></pre><a id="next" href="http://b.vt-source.test:18985/">Next</a>${own==='a'?'<iframe id="other" src="http://b.vt-source.test:18985/"></iframe>':''}<script>
 localStorage.setItem('secret','storage_${own}');document.cookie='visible_${own}=value_${own};Path=/';
 document.getElementById('button').onclick=()=>document.getElementById('count').textContent++;
 fetch('/api').then(r=>r.json()).then(x=>document.getElementById('data').textContent=JSON.stringify(x));
 </script>`);
});fixture.listen(18985,'127.0.0.1');
console.log('Per-origin fixture on a.vt-proxy.test:18990/fixtureprofile/http://a.vt-source.test:18985/');
process.on('SIGTERM',()=>{proxy.close();fixture.close();process.exit()});
