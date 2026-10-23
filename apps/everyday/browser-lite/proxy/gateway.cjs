'use strict';
const {scriptCacheKey,cacheTab}=require('./script-cache-key.cjs');
// Marks the tab token inside cached rewritten scripts (per process, unguessable).
globalThis.vtCacheTabMark ||= 'vtTab'+require('node:crypto').randomBytes(12).toString('hex')+'x';
const workerModule=require('./worker-module-runtime.cjs');
// One user/profile per process. Production listens on a private Unix socket in a
// PrivateNetwork namespace; the root ingress must authenticate before routing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {LeaseConnections}=require('./lease-connections.cjs');
const {engineRequire, hammerhead, toughCookie} = require('./engine.cjs');
const Proxy = engineRequire('./src/classes/RammerheadProxy');
const Session = engineRequire('./src/classes/RammerheadSession');
const RammerheadJSMemCache = engineRequire('./src/classes/RammerheadJSMemCache');
const urls = hammerhead('utils/url');
const Context = hammerhead('request-pipeline/context');
require('./response-coalesce.cjs').installResponseCoalescing(Context);
const transforms = hammerhead('request-pipeline/header-transforms/transforms');
if(process.env.VT_BROWSER_DIAGNOSTICS==='1'){require('./stage-timing.cjs').installStageTiming(hammerhead('request-pipeline/stages'));require('./stage-timing.cjs').installRawCookieCheck(require('node:http'));}
const {requestOrigin, uniqueCookie} = require('./origin-policy.cjs');
const {cookieView,sameSite} = require('./cookie-policy.cjs');
const {rewriteImportMap} = require('./import-map.cjs');
const {framePolicies} = require('./frame-policy.cjs');
const {authorizeRequest,sourceRecord} = require('./realm-gate.cjs');
const {cookieContext,mainContext,childContext,authorizeChild,authorizeResource,site} = require('./realm-policy.cjs');
const {importLogins} = require('./login-import.cjs');
const {WorkerStore} = require('./worker-store.cjs');
const {NavigationTransactions} = require('./navigation.cjs');
const {BodyBudget} = require('./body-budget.cjs');
const {playlistRange} = require('./hls-patch.cjs');
const {realmSyncCookies} = require('./sync-cookie-policy.cjs');
const {CookieStore} = require('./cookie-store.cjs');
const {TabStore} = require('./tab-store.cjs');
const {ShortcutStore} = require('./shortcut-store.cjs');
const {PrefsStore} = require('./prefs-store.cjs');
const adblock = require('./adblock-list.cjs');
const {redirectTaint,navigationFetchSite,mainFrameFetchDest} = require('./redirect-policy.cjs');
const {ControlLedger} = require('./control-ledger.cjs');
const {realmCacheControl} = require('./cache-policy.cjs');
const {renderPageError} = require('./page-error.cjs');
const clientSource = fs.readFileSync(path.join(__dirname, 'client-bridge.js'), 'utf8');
const documentHistorySource=fs.readFileSync(path.join(__dirname,'document-history.js'),'utf8');
const messageTargetSource=fs.readFileSync(path.join(__dirname,'message-target.js'),'utf8');
const messageGateSource=fs.readFileSync(path.join(__dirname,'message-gate.js'),'utf8');
const sourceTextSource=fs.readFileSync(path.join(__dirname,'source-text.js'),'utf8');
const realmHostSource=fs.readFileSync(path.join(__dirname,'realm-host.js'),'utf8');
const extraUrlAttrsSource=fs.readFileSync(path.join(__dirname,'extra-url-attrs.js'),'utf8');
// The bridge (54 KB) is the same for every document; only its config line
// differs. It is a static, etag-versioned asset the browser keeps, instead
// of a no-store download per page and per iframe.
const bridgeSource=[messageTargetSource,messageGateSource,sourceTextSource,documentHistorySource,realmHostSource,extraUrlAttrsSource,clientSource].join('\n');
// Server page pass: URL attributes the engine's table misses (extra-url-attrs.js).
{
  const DomProcessor=hammerhead('processing/dom');
  const processElement=DomProcessor.prototype.processElement;
  if(!processElement.vtExtra) {
    const {processExtraUrlAttrs}=require('./extra-url-attrs.js');
    // Alibaba Cloud's WAF challenge (xueqiu.com) loops forever under Lite and
    // froze the page, and on iPhone all of Lite with it. Do not run it: past
    // its marker, the page's own scripts are disabled, and the bridge reports
    // a bot wall so the toolbar offers the full Browser. Nothing is solved.
    const challengeRoots=new WeakSet();
    const rootOf=node=>{while(node && node.parentNode)node=node.parentNode;return node;};
    const engineScript=(adapter,el)=>/hammerhead|\/__vt\/|(^|\/)(task|iframe-task|rammerhead|transport-worker)\.js/i.test((adapter.getAttr(el,'src')||'')+' '+(adapter.getAttr(el,'class')||''));
    DomProcessor.prototype.processElement=Object.assign(function(el,urlReplacer){
      try {
        const tag=String(this.adapter.getTagName(el)||'').toLowerCase();
        if(tag==='meta' && /^aliyun_waf/i.test(this.adapter.getAttr(el,'name')||''))challengeRoots.add(rootOf(el));
        else if(tag==='script' && challengeRoots.has(rootOf(el)) && !engineScript(this.adapter,el))this.adapter.setAttr(el,'type','text/vt-blocked-challenge');
      } catch {}
      const result=processElement.call(this,el,urlReplacer);
      if(typeof urlReplacer==='function')try{processExtraUrlAttrs(this.adapter,el,{rewrite:url=>urlReplacer(url),
        rewriteSet:value=>urls.handleUrlsSet(urlReplacer,value),isProxied:url=>!!urls.parseProxyUrl(url)});}catch{}
      return result;
    },{vtExtra:true});
  }
}
let installed = false;
function webUrl(value) { return String(value).replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'); }
// The desktop UA every Google request is pinned to (the full Browser is
// Chromium on Linux and the user's Mac is desktop Safari; Google accepts both,
// but rejects the same carried session under a phone's mobile UA). A desktop
// Safari UA matches the no-client-hints requests Lite sends; keep it current.
const GOOGLE_PINNED_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15';
const GOOGLE_UA_DOMAINS = ['google.com','youtube.com','youtube-nocookie.com','googleusercontent.com','googleapis.com','gstatic.com','ggpht.com','ytimg.com','googlevideo.com','gmail.com','withgoogle.com'];
const GOOGLE_COUNTRY_HOST = /(^|\.)google\.(com?\.)?[a-z]{2,3}$/;
const GOOGLE_CLIENT_HINTS = ['sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform','sec-ch-ua-platform-version','sec-ch-ua-full-version','sec-ch-ua-full-version-list','sec-ch-ua-arch','sec-ch-ua-model','sec-ch-ua-bitness','sec-ch-ua-wow64','sec-ch-ua-form-factors'];
function isGoogleHost(host) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (GOOGLE_COUNTRY_HOST.test(host)) return true;
  return GOOGLE_UA_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
}
function deny(res, code = 403) {
  if(process.env.VT_BROWSER_DIAGNOSTICS==='1')console.error('Browser request denied',code,new Error().stack.split('\n')[2]?.trim());
  if (res.writeHead) { res.writeHead(code, {'Cache-Control':'no-store'}); res.end('Browser request unavailable'); }
  else res.end(`HTTP/1.1 ${code} Forbidden\r\nConnection: close\r\n\r\n`);
  return true;
}
class BrowserGateway {
  constructor({registry, authority, externalProxy, parentOrigin,cookieFile,engineSessionId,relayCapability,ingressIdentity,trustedAncestors=[]}) {
    if (installed) throw new Error('Only one browser profile per process');
    if (!externalProxy) throw new Error('A guarded egress proxy is required');
    if (registry.protocol !== 'https:') throw new Error('Browser content requires HTTPS origins');
    installed = true;
    this.registry = registry; this.authority = authority; this.parentOrigin = new URL(parentOrigin).origin;
    this.ingressIdentity=ingressIdentity;
    if(ingressIdentity && (!registry.isRealm || ingressIdentity.uid!==registry.uid || ingressIdentity.profile!==registry.profile || !Number.isSafeInteger(ingressIdentity.epoch) || !engineSessionId))throw new Error('Invalid ingress identity');
    this.trustedAncestors=trustedAncestors.map(origin=>{const url=new URL(origin);if(url.protocol!=='https:')throw new Error('Invalid trusted ancestor');return url.origin;});
    for(const origin of [this.parentOrigin,...this.trustedAncestors]) {
      const host=new URL(origin).hostname;
      if(host===registry.domain || (host.endsWith('.'+registry.domain) && host.startsWith('bl-')))throw new Error('Trusted origins must not use the bl- realm namespace');
    }
    this.dependencies = new Map();
    this.tickets = new Map();
    this.admissions = new Map();
    this.partitionJars = new Map();
    this.workers = new WorkerStore();
    this.navigations=new NavigationTransactions();this.tabs=new Map();this.tabTokens=new Map();this.frameGrants=new Map();
    this.controls=new ControlLedger({perform:(command,body)=>{
      const tab=this.tabs.get(body.tabId),lease=this.registry.scope?.getStore()?.authorization?.lease;
      if(this.ingressIdentity && tab && tab.lease!==lease)throw new Error('Browser session mismatch');
      if(command==='open')return this.open(body.url,{tabId:body.tabId,epoch:body.epoch,opener:body.opener});
      if(command==='approve')return this.approveNavigation(body.challenge,{tabId:body.tabId,epoch:body.epoch});
      if(command==='close')return this.closeTab({tabId:body.tabId,epoch:body.epoch});
      throw new Error('Unknown browser command');
    },expire:tabId=>{const tab=this.tabs.get(tabId);if(tab)this.closeTab(tab);}});
    this.leases=new LeaseConnections({expire:lease=>this.controls.revoke(lease)});
    this.collectionTimer=setInterval(()=>{this.controls.collect();this.navigations.collect();},30000);this.collectionTimer.unref();
    this.replayBodies=new WeakMap();
    this.bodyBudget=new BodyBudget();
    this.cookieName = (registry.protocol === 'https:' ? '__Secure-' : '') + 'vt_browser_' + registry.profile;
    this.relayCapability=ingressIdentity?'':relayCapability||authority.sign('relay',86400);
    if(registry.isRealm)registry.relayCapability=this.relayCapability;
    // The stable engine ID retains cookie identity across restart. The expiring
    // public-only relay credential has its own field in the proxy descriptor.
    this.session = new Session({id:registry.isRealm?(engineSessionId||authority.engineSessionId()):this.relayCapability, disableShuffling:true,
      prependScripts:['/__vt/client.js','/__vt/bridge.js']});
    this.session.setExternalProxySettings(externalProxy.replace(/^http:\/\//,''));
    this.session.disableHttp2();
    this.cookieStore=new CookieStore({file:cookieFile});
    this.tabStore=new TabStore(cookieFile?path.join(path.dirname(cookieFile),'tabs.json'):null);
    this.shortcutStore=new ShortcutStore(cookieFile?path.join(path.dirname(cookieFile),'shortcuts.json'):null);this.cookieStore.get('main',this.session.cookies);
    // Ad blocker: on by default, per-user toggle synced like tabs/shortcuts. The
    // flag drives both the display-ad host block in gate() and (via the session)
    // the YouTube in-stream ad strip the engine runs.
    this.prefsStore=new PrefsStore(cookieFile?path.join(path.dirname(cookieFile),'prefs.json'):null);
    this.applyPrefs(this.prefsStore.load());
    this.session.requestHookEventProvider.hasRequestEventListeners = () => true;
    this.session.handleServiceMessage = async () => { throw new Error('Unsupported browser service command'); };
    if(registry.isRealm) {
      const task=this.session.getTaskScript;
      this.session.getTaskScript=async options=>{
        const req=registry.scope.getStore()?.req;
        if(!req?.vtRealm || req.vtRealm.resourceOnly)throw new Error('Unknown document context');
        const session=Object.create(this.session);
        session.pageLoadCount=this.session.pageLoadCount++;
        session.cookies=cookieView(this.jar(req.vtRealm),{role:req.vtRole,sourceOrigin:req.vtRealm.origin,
          targetOrigin:req.vtRealm.origin,sameSiteContext:cookieContext(req.vtRealm)});
        return task.call(session,options);
      };
    }
    // A site that cannot be reached gets an error page the tab can show and
    // the toolbar understands (page-error.cjs). A 502 never reached the tab:
    // Cloudflare swaps in its own page, which refuses to be framed.
    this.session.handlePageError = (ctx, error) => {
      if (ctx.res.headersSent) { ctx.res.end(); return; }
      const tab=registry.isRealm?this.tabTokens.get(String(ctx.windowId||'').split('~')[1]):null;
      const navigation=tab && tab.physical===ctx.req.vtRealm?.physical?{tabId:tab.tabId,epoch:tab.epoch}:null;
      const page=renderPageError({url:ctx.dest.url,error,navigation,parentOrigin:this.parentOrigin});
      ctx.res.writeHead(page.status,{...page.headers,'Content-Security-Policy':page.headers['Content-Security-Policy']
        +'; frame-ancestors '+[this.parentOrigin,...this.trustedAncestors].join(' ')});
      ctx.res.end(page.body);
    };
    this.installHooks();
    this.proxy = new Proxy({dontListen:true,crossDomainPort:null,disableLocalStorageSync:true,disableHttp2:true,
      jsCache:new RammerheadJSMemCache(192*1024*1024),
      getServerInfo:req => {
        let hostname='invalid';try {hostname=new URL(registry.protocol+'//'+req.headers.host).hostname;}catch{}
        return {hostname,port:registry.port || 443,protocol:registry.protocol};
      }});
    if(registry.isRealm)registry.wrap(this.proxy.server1);
    // The engine bundles (hammerhead.js alone is 590 KB) are addressed with
    // ?v=<etag>, so a new build is a new URL: let the browser keep them instead
    // of revalidating every 30 s, a round trip per script on every page load.
    this.proxy.options.staticContentCaching={maxAge:31536000,mustRevalidate:false};
    // Upstream "disabled" logging currently logs everything (rank 0). Avoid
    // putting browsing URLs and capabilities in the service journal.
    this.proxy.logger.logger = () => {};
    this.proxy.rewriteServerHeaders['referrer-policy'] = () => 'strict-origin-when-cross-origin';
    for (const header of ['link','nel','reporting-endpoints','report-to','speculation-rules','clear-site-data'])
      this.proxy.rewriteServerHeaders[header] = () => undefined;
    // Rammerhead installs compatibility transforms in its constructor/module;
    // override CORS only after loading it, using original upstream permission.
    this.installCors();
    this.proxy.openSessions.set(this.session.id,this.session);
    // Hammerhead dispatches an approved upgrade through its ordinary request
    // pipeline once more. Remember the actual request object: a second gate
    // would misclassify it and re-read already-stripped root identity headers.
    const upgrades=new WeakSet();
    this.proxy.onRequestPipeline.unshift((req,res) => upgrades.has(req)?false:this.gate(req,res));
    this.proxy.onUpgradePipeline.unshift((req,res) => {
      const handled=this.gate(req,res,true);
      if(handled===false)upgrades.add(req);
      return handled;
    });
    this.proxy.GET(workerModule.runtimePath,(req,res)=>{res.setHeader('Content-Type','application/javascript; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=31536000, immutable');res.end(workerModule.source);});
    this.proxy.GET('/__vt/bridge.js',{content:Buffer.from(bridgeSource),contentType:'application/javascript; charset=utf-8'});
    this.proxy.GET('/__vt/client.js',(req,res) => {
      res.setHeader('Content-Type','application/javascript'); res.setHeader('Cache-Control','no-store');
      const params = new URL(req.url,'http://internal').searchParams;
      const document = params.get('document');
      const origins = this.dependencies.get(req.headers.host+'\0'+document) || new Set([new URL(document).origin]);
      const config = {origins:Object.fromEntries([...origins].map(origin=>[origin,registry.isRealm?registry.map(origin):registry.register(origin)])),
        realmMode:!!registry.isRealm,documentOrigin:new URL(document).origin,parentOrigin:this.parentOrigin, sessionId:this.session.id, nested:params.get('nested') === '1'};
      // A document names its own context's third-party hosts locally (see
      // RealmRegistry.resourceKey); only iframes still need the server.
      if(registry.isRealm && req.vtRealm && !req.vtRealm.resourceOnly) {
        config.self=registry.map(config.documentOrigin);
        config.selfOrigin=registry.original(registry.protocol+'//'+req.headers.host);
        config.realmHost=registry.realms.hostAffixes();
        config.resourceKey=registry.realms.resourceKey(req.vtRealm.context).toString('base64url');
      }
      const tab=registry.isRealm && this.tabTokens.get(String(params.get('windowId')||'').split('~')[1]);
      if(tab && !config.nested && tab.physical==='https://'+req.headers.host)config.navigation={tabId:tab.tabId,epoch:tab.epoch,...(tab.opener!==undefined?{opener:tab.opener}:{})};
      const parent=registry.isRealm && registry.realm(params.get('parent'));
      if(parent && authorizeChild(parent,req.vtRealm))config.messageParent={physical:parent.physical,original:parent.origin};
      res.end('window.__vtBrowserConfig='+JSON.stringify(config).replace(/</g,'\\u003c')+';\n');
    });
    this.proxy.GET('/__vt/map',(req,res) => {
      try {
        const origin = new URL(req.url,registry.protocol+'//'+req.headers.host).searchParams.get('origin');
        const query=new URL(req.url,registry.protocol+'//'+req.headers.host).searchParams;
        const mapped=registry.isRealm?registry.map(origin,{resourceType:query.get('kind')==='iframe'?'i':undefined}):null;
        const physical = mapped?.physical || registry.register(origin);
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({physical,windowId:mapped?.windowId}));
      } catch { deny(res,400); }
    });
    this.proxy.GET('/__vt/origin',(req,res)=>{
      const physical=new URL(req.url,'http://internal').searchParams.get('physical');
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify({origin:registry.isRealm && registry.realm(physical)?.resourceOnly?null:registry.original(physical)}));
    });
    this.proxy.GET('/__vt/message-target',(req,res)=>{
      try {
        const query=new URL(req.url,'http://internal').searchParams;
        if(!registry.isRealm)throw new Error('Realm required');
        let owner=req.vtRealm;
        if(query.get('relation')==='sibling') {
          owner=registry.realm(query.get('parent'));
          if(!authorizeChild(owner,req.vtRealm))throw new Error('Invalid parent context');
        } else if(query.get('relation')!=='child' && query.get('relation')!=='top')throw new Error('Invalid relationship');
        const origin=new URL(query.get('origin')).origin;
        // Compute a hypothetical destination without storing a visited origin
        // or revealing whether any window currently uses this context.
        // "top": a popup tab or its opener, a main document of that origin.
        const target=registry.realms.describe(origin,query.get('relation')==='top'?mainContext(origin):childContext(owner.context,origin));
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({physical:target.physical}));
      }catch{deny(res,400);}
    });
    this.proxy.POST('/__vt/worker',async(req,res)=>{
      const clientId=req.headers['x-browser-worker-id'];
      try {
        const originalUrl=require('./worker-location.cjs').validatedBlobIdentity(req.headers['x-browser-worker-url'],req.vtRealm.physical);
        const body=await this.bodyBudget.read(req,this.workers.maxBytes);
        // Blob sources assembled from typed arrays, fetched responses or other
        // Blobs bypass the engine's string-only Blob hook. Rewrite every source
        // here as well, before it can make requests from the user's network.
        const script=hammerhead('processing/script').processScript(body.toString('utf8'),true,false,
          url=>this.url(new URL(url,req.vtRealm.origin).href,{resourceType:'s'}),undefined,false,
          {sessionId:this.session.id,windowId:registry.map(req.vtRealm.origin).windowId,origin:req.vtRealm.origin,originalUrl});
        if(!script.includes('/*hammerhead|script|start*/'))throw new Error('Worker syntax could not be rewritten');
        const id=this.workers.put(req.vtRealm.physical,Buffer.from(script),{originalUrl},clientId);
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({url:req.vtRealm.physical+'/__vt/worker?id='+id}));
      } catch {
        if(clientId!==undefined)this.workers.fail(req.vtRealm.physical,clientId);
        deny(res,400);
      }
    });
    this.proxy.GET('/__vt/worker',async(req,res)=>{
      const id=new URL(req.url,'http://internal').searchParams.get('id');
      // The page starts the worker before its upload finishes: wait for it.
      const source=await this.workers.wait(req.vtRealm.physical,id);
      if(!source)return deny(res,404);
      res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':this.workerPolicy()});
      res.end(source);
    });
  }
  workerPolicy() {
    const host='*.'+this.registry.domain+(this.registry.port?':'+this.registry.port:'');
    const source=this.registry.protocol+'//'+host;
    const socket=(this.registry.protocol==='https:'?'wss:':'ws:')+'//'+host;
    return 'default-src '+source+'; script-src '+source+" 'wasm-unsafe-eval'; connect-src "+source+' '+socket+' blob: data:'+'; worker-src '+source+"; object-src 'none'; base-uri 'none'";
  }
  url(destination,options={}) { return urls.getProxyUrl(destination,{sessionId:this.session.id,...options}); }
  // A page names a new cross-origin iframe on its own host (no synchronous
  // round trip; the child context's token needs the server's secret). The
  // document itself (same-origin, its own signed context) navigates the frame
  // here, and the frame is sent on to its real child realm. Grants nothing
  // /__vt/map?kind=iframe did not.
  bindChildFrame(req,res,physical,parsed) {
    if(req.method!=='GET'||req.headers['sec-fetch-dest']!=='iframe'||req.headers['sec-fetch-mode']!=='navigate'
      ||req.headers['sec-fetch-site']!=='same-origin'||!urls.parseResourceType(parsed.resourceType).isIframe)return false;
    const owner=this.registry.realm(physical);
    if(!owner||owner.resourceOnly)return false;
    let destination;try{destination=webUrl(parsed.destUrl);if(new URL(destination).origin===owner.origin)return false;}catch{return false;}
    const windowId=String(parsed.windowId||'');
    if(windowId.split('~')[0]!==this.registry.realms.contextToken(owner.context))return false;
    let target;
    try{target=this.registry.scope.run({req},()=>this.url(destination,{resourceType:parsed.resourceType,windowId,context:owner.context}));}
    catch{deny(res);return true;}
    // Frames created with referrerpolicy=no-referrer reach the child realm
    // with no provable source. This hop already verified it, so admit that
    // exact URL once, briefly, on the same sign-in.
    const now=Date.now();
    for(const [key,grant] of this.frameGrants)if(grant.expires<=now)this.frameGrants.delete(key);
    if(this.frameGrants.size<1024)this.frameGrants.set(new URL(target).href,{expires:now+60000,lease:req.vtLease,source:owner});
    res.writeHead(302,{'Location':target,'Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin'});res.end();
    return true;
  }
  applyPrefs(prefs) {
    this.adblock=!!(prefs&&prefs.adblock);
    // The engine reads this off the session to decide whether to strip YouTube
    // in-stream ads from the player API response.
    if(this.session)this.session.vtAdblock=this.adblock;
  }
  control(command,{authorization,cookies,...body}) {
    if(this.ingressIdentity && !this.validIngress(authorization))throw new Error('Invalid control identity');
    // Only the root manager adds cookies (the full Browser's, for this site).
    // Kept out of the ledger fingerprint: a retried open may carry a newer set.
    if(command==='open' && cookies!==undefined)this.syncLogins(body.url,cookies);
    // A link or redirect to another site: the manager adds that site's logins
    // after approving it, before the UI loads the entry. Not part of any lane.
    if(command==='logins'){if(typeof body.url!=='string')throw new Error('Invalid browser logins');this.syncLogins(body.url,cookies);return {ok:true};}
    const owner=authorization?.lease||null;
    if(command==='revoke-lease' && this.ingressIdentity){this.leases.revoke(owner,Number(authorization.expires));return {revoked:true};}
    if(this.ingressIdentity)this.leases.register(owner,Number(authorization.expires));
    if(command==='tabs') {
      // A restore report carries counts only, never addresses.
      const report=body.report;
      if(report&&typeof report==='object')console.log('Browser tabs restore source='+String(report.source).replace(/[^a-z]/g,'').slice(0,12)
        +' device='+String(report.device).replace(/[^a-z]/g,'').slice(0,12)+' count='+(Number(report.count)|0));
      if(body.save!==undefined)return {saved:!!this.tabStore.save(body.save)};
      return {tabs:this.tabStore.load()};
    }
    if(command==='shortcuts') {
      if(body.save!==undefined)return {saved:!!this.shortcutStore.save(body.save)};
      return {shortcuts:this.shortcutStore.load()};
    }
    if(command==='prefs') {
      if(body.save!==undefined){const prefs=this.prefsStore.save(body.save);if(prefs)this.applyPrefs(prefs);return {saved:!!prefs,prefs:prefs||this.prefsStore.load()};}
      return {prefs:this.prefsStore.load()};
    }
    if(command==='heartbeat') {
      if(!Array.isArray(body.clients)||body.clients.length>128)throw new Error('Invalid browser heartbeat');
      const expired=[];for(const id of body.clients){try{this.controls.touch(id,owner);}catch{expired.push(id);}}
      return {expired};
    }
    return this.registry.isRealm?this.registry.scope.run({authorization},()=>this.controls.run(command,body,owner)):this.controls.run(command,body);
  }
  syncLogins(url,cookies) {
    let key;try{key=site(url);}catch{return;}
    this.loginSync ||= new Map();
    // Google's shared session must always track the full Browser's (its
    // rotating anti-theft tokens sign Lite out if Lite keeps its own copies),
    // so a Google host re-adopts the carried session on every open.
    let googleHost=false;try{googleHost=isGoogleHost(new URL(url).hostname);}catch{}
    const now=Date.now(),changed=importLogins(this.session.cookies,url,cookies,{lastSync:this.loginSync.get(key)||0,now,force:googleHost});
    this.loginSync.set(key,now);if(this.loginSync.size>4096)this.loginSync.delete(this.loginSync.keys().next().value);
    if(changed)this.cookieStore.save();
  }
  validIngress(identity) {
    return !!identity && ['uid','profile','epoch'].every(key=>String(identity[key])===String(this.ingressIdentity[key]))
      && /^[a-f0-9]{32}$/.test(identity.lease||'') && typeof identity.relay==='string' && identity.relay.length<=2048 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(identity.relay);
  }
  jar(record) {
    if(!record || cookieContext(record)==='strict')return this.session.cookies;
    const key=record.context.topSite;
    if(!this.partitionJars.has(key))this.partitionJars.set(key,this.cookieStore.get('partition:'+key));
    return this.partitionJars.get(key);
  }
  open(destination,{sourceOrigin=null,tabId=crypto.randomUUID(),epoch=1,execution=null,crossSiteRedirect=false,redirectCount=0,originTaint='same-origin',opener=undefined}={}) {
    const now = Date.now();
    for (const [key,value] of this.tickets) if (value.expires < now) this.tickets.delete(key);
    if ([...this.tickets.values()].filter(entry=>entry.tabId!==tabId).length >= 128) throw new Error('Too many pending pages');
    let options={},prepared;
    if(this.registry.isRealm) {
      if(!Number.isSafeInteger(epoch)||epoch<1||typeof tabId!=='string'||tabId.length>128)throw new Error('Invalid tab');
      const prior=this.tabs.get(tabId);
      if(prior && epoch<=prior.epoch)throw new Error('Stale tab');
      if(!prior && this.tabs.size>=128)throw new Error('Too many browser tabs');
      const token=crypto.randomBytes(24).toString('base64url'),context=mainContext(destination);
      options={context,windowId:this.registry.realms.contextToken(context)+'~'+token};
      const lease=this.registry.scope.getStore()?.authorization?.lease||null;
      if(this.ingressIdentity && prior && prior.lease!==lease)throw new Error('Browser session mismatch');
      const tab={tabId,epoch,token,lease,origin:new URL(destination).origin,physical:this.registry.register(destination,context)};
      // A popup tab: the UI's frame number of its opener, so the popup's page
      // can find window.opener before its scripts run. A navigation the page
      // itself makes (opener===undefined) keeps the last one.
      if(Number.isInteger(opener) && opener>=0 && opener<4096)tab.opener=opener;
      else if(opener===undefined && prior && prior.opener!==undefined)tab.opener=prior.opener;
      prepared={tab,prior,token};
    }
    const url = this.url(destination,options);
    const target=new URL(url);
    if(prepared) {
      const {tab,prior,token}=prepared;
      if(prior)this.tabTokens.delete(prior.token);
      this.tabs.set(tabId,tab);this.tabTokens.set(token,tab);
      const executing=execution && this.navigations.tickets.get(execution.ticket)?.challenge;
      this.navigations.invalidateTab(tabId,epoch,executing);
      for(const [ticket,entry] of this.tickets)if(entry.tabId===tabId)this.tickets.delete(ticket);
      for(const [key,items] of this.admissions){const live=items.filter(item=>item.tabId!==tabId);if(live.length)this.admissions.set(key,live);else this.admissions.delete(key);}
    }
    const ticket = crypto.randomBytes(32).toString('base64url');
    this.tickets.set(ticket,{url,sourceOrigin,execution,tabId,epoch,crossSiteRedirect,redirectCount,originTaint,lease:prepared?.tab.lease,host:target.host,expires:now+120000});
    return {entry:target.origin+'/__vt/entry?ticket='+ticket,origin:target.origin,url:destination,tabId,epoch};
  }
  approveNavigation(challenge,{tabId,epoch}) {
    const tab=this.tabs.get(tabId),record=this.navigations.pending.get(challenge);
    if(!tab || tab.epoch!==epoch || !record)throw new Error('Stale navigation');
    const owner={tabId,epoch,sourceOrigin:tab.origin};
    const ticket=this.navigations.approve(challenge,owner);
    return this.open(record.url,{sourceOrigin:record.initiatorOrigin,crossSiteRedirect:record.crossSiteRedirect,redirectCount:record.redirectCount,originTaint:record.originTaint,tabId,epoch:epoch+1,execution:{ticket,owner}});
  }
  closeTab({tabId,epoch}) {
    const tab=this.tabs.get(tabId);if(!tab || tab.epoch!==epoch)throw new Error('Stale tab');
    this.navigations.invalidateTab(tabId,-1);this.tabs.delete(tabId);this.tabTokens.delete(tab.token);
    for(const [ticket,entry] of this.tickets)if(entry.tabId===tabId)this.tickets.delete(ticket);
    for(const [key,items] of this.admissions){const live=items.filter(item=>item.tabId!==tabId);if(live.length)this.admissions.set(key,live);else this.admissions.delete(key);}
    return {closed:true};
  }
  async captureNavigation(req,res,parsed,tab) {
    try {
      const body=await this.bodyBudget.read(req,this.navigations.maxBytesPerTab);
      const challenge=this.navigations.capture({url:parsed.destUrl,method:req.method,body,
        contentType:req.headers['content-type']||'',sourceOrigin:tab.origin,tabId:tab.tabId,epoch:tab.epoch});
      // The challenge page is served here, on the destination's realm, rather
      // than after a 303 to the tab's own realm: one round trip less on every
      // cross-site link. The toolbar accepts it from any realm of this user.
      this.challengePage(res,challenge,tab);
    } catch {deny(res,400);}
    return true;
  }
  challengePage(res,challenge,tab) {
    const nonce=crypto.randomBytes(20).toString('base64url');
    const message=JSON.stringify({type:'vibetop-browser-navigation',challenge,tabId:tab.tabId,epoch:tab.epoch}).replace(/</g,'\\u003c');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${[this.parentOrigin,...this.trustedAncestors].join(' ')}`});
    res.end(`<meta charset="utf-8"><title>Opening page</title><script nonce="${nonce}">parent.postMessage(${message},${JSON.stringify(this.parentOrigin)})</script>`);
  }
  installHooks() {
    const registry = this.registry, gateway = this;
    const httpUtils=hammerhead('utils/http'),fetchBody=httpUtils.fetchBody;
    httpUtils.fetchBody=req=>gateway.replayBodies.has(req)?Promise.resolve(gateway.replayBodies.get(req)):fetchBody(req);
    const getProxyUrl = urls.getProxyUrl;
    urls.getProxyUrl = function(destination, options) {
      const prior = urls.parseProxyUrl(destination);
      if (prior && prior.sessionId === gateway.session.id) destination=prior.destUrl;
      if (/^about:/.test(destination)) return getProxyUrl(destination,options);
      // A Location header or link may name a non-web scheme (Booking redirects
      // to itms-appss:) or embed user:pass@. Mapping such a target used to
      // throw inside Hammerhead's header transform and crash the runtime,
      // closing every tab. Leave other schemes untouched, as Hammerhead does,
      // drop embedded credentials, and fall back to about:blank otherwise.
      let parsed;try{parsed=new URL(destination);}catch{return getProxyUrl('about:blank',options);}
      if(!/^(https?|wss?):$/.test(parsed.protocol))return destination;
      if(parsed.username||parsed.password){parsed.username='';parsed.password='';destination=parsed.href;}
      try{return mapProxyUrl(destination,options);}catch{return getProxyUrl('about:blank',options);}
    };
    function mapProxyUrl(destination, options) {
      const mapped=registry.isRealm?registry.map(webUrl(destination),options):null;
      const physical = new URL(mapped?.physical || registry.register(webUrl(destination)));
      const websocket = /^wss?:/.test(destination);
      return getProxyUrl(destination,{...options,...(mapped?{windowId:mapped.windowId}:{}),proxyHostname:physical.hostname,
        proxyPort:physical.port || (physical.protocol === 'https:' ? 443 : 80),
        proxyProtocol:websocket ? physical.protocol.replace('http','ws') : physical.protocol});
    };
    const DomProcessor=hammerhead('processing/dom');
    const processScriptElement=DomProcessor.prototype._processScriptElement;
    DomProcessor.prototype._processScriptElement=function(script,replacer) {
      if(this.adapter.getAttr(script,'type')?.trim().toLowerCase()==='importmap') {
        try {this.adapter.setScriptContent(script,rewriteImportMap(this.adapter.getScriptContent(script),replacer));}catch{}
        return;
      }
      return processScriptElement.call(this,script,replacer);
    };
    const contentInfo=Context.prototype.buildContentInfo;
    Context.prototype.buildContentInfo=function() {
      const result=contentInfo.call(this);
      if(this.contentInfo.isCSS)this.contentInfo.isScript=false;
      if(registry.isRealm && this.req.vtRole==='auth' && this.req.headers['sec-fetch-mode']==='navigate'
        && !this.dest.isIframe && [301,302,303,307,308].includes(this.destRes.statusCode) && this.destRes.headers.location) {
        const tab=gateway.tabTokens.get(String(this.windowId||'').split('~')[1]);
        let sameOriginTarget=false;
        try{sameOriginTarget=new URL(this.destRes.headers.location,this.dest.url).origin===tab?.origin;}catch{}
        // A redirect within the tab's own origin (login POST -> 302 -> /home,
        // locale and trailing-slash redirects) stays an ordinary redirect the
        // browser follows on the same realm; only a cross-origin one needs the
        // toolbar's approval, a new epoch and cookie provenance.
        if(tab?.physical===this.req.vtRealm?.physical && !sameOriginTarget) {
          try {
            const destination=new URL(this.destRes.headers.location,this.dest.url).href;
            const status=this.destRes.statusCode;
            const method=(status===303 && this.req.method!=='HEAD')||([301,302].includes(status)&&this.req.method==='POST')?'GET':this.req.method;
            const challenge=gateway.navigations.capture({url:destination,method,body:['GET','HEAD'].includes(method)?Buffer.alloc(0):this.reqBody,
              contentType:['GET','HEAD'].includes(method)?'':this.req.headers['content-type']||'',
              sourceOrigin:tab.origin,tabId:tab.tabId,epoch:tab.epoch,
              initiatorOrigin:this.req.vtNavigation?this.req.vtNavigation.sourceOrigin:tab.origin,
              crossSiteRedirect:!!this.req.vtNavigation?.crossSiteRedirect||!sameSite(this.dest.url,destination),
              redirectCount:(this.req.vtNavigation?.redirectCount||0)+1,
              originTaint:redirectTaint(this.req.vtNavigation?.originTaint||'same-origin',this.req.vtNavigation?this.req.vtNavigation.sourceOrigin:tab.origin,this.dest.url,destination)});
            this.vtRedirectChallenge=tab.physical+'/__vt/navigation?id='+challenge;
          } catch {this.vtRedirectChallenge=tab.physical+'/__vt/navigation-error';}
          this.destRes.statusCode=303;
        }
      }
      return result;
    };
    Context.prototype.getProxyOrigin = function() {
      if(registry.isRealm)return registry.realm(this.req.headers.origin)?.physical || 'null';
      return registry.byOrigin.get(this.dest.reqOrigin) || 'null';
    };
    const resolveInjectable = Context.prototype.resolveInjectableUrl;
    const toProxyUrl = Context.prototype.toProxyUrl;
    Context.prototype.toProxyUrl = function(url,...args) {
      if (this.isPage || this.isIframe) {
        const key=this.req.headers.host+'\0'+this.dest.url;
        if (!gateway.dependencies.has(key)) {
          if (gateway.dependencies.size >= 512) gateway.dependencies.delete(gateway.dependencies.keys().next().value);
          gateway.dependencies.set(key,new Set([new URL(this.dest.url).origin]));
        }
        try { gateway.dependencies.get(key).add(new URL(webUrl(url)).origin); } catch {}
      }
      return toProxyUrl.call(this,url,...args);
    };
    Context.prototype.resolveInjectableUrl = function(url) {
      const asset=gateway.proxy.routes.get('GET '+url);
      if(asset?.isStatic) return resolveInjectable.call(this,url)+'?v='+asset.handler.etag;
      return resolveInjectable.call(this,url) + '?document=' + encodeURIComponent(this.dest.url)
        + '&cap=' + encodeURIComponent(registry.isRealm?registry.relay():gateway.relayCapability) + '&nested=' + (this.isIframe ? '1' : '0')
        + (this.isIframe && this.req.vtSource && authorizeChild(this.req.vtSource,this.req.vtRealm)?'&parent='+encodeURIComponent(this.req.vtSource.physical):'')
        + (registry.isRealm?'&windowId='+encodeURIComponent(this.windowId):'');
    };
    // Stock dispatch trusts descriptors and a shared mutable last-page Referer.
    // Only browser-supplied physical origin/referrer is authoritative here.
    const dispatch = Context.prototype.dispatch;
    Context.prototype.dispatch = function(...args) {
      const result = dispatch.apply(this,args);
      if (!result) return false;
      this.dest.reqOrigin = this.req.vtNavigation?.sourceOrigin || requestOrigin(this.req.headers,registry);
      this.dest.referer = undefined;
      const ref = this.req.headers.referer;
      if(this.req.vtNavigation) {
        if(this.req.vtNavigation.sourceOrigin)this.dest.referer=this.req.vtNavigation.sourceOrigin+'/';
      } else if (ref) {
        const parsed = urls.parseProxyUrl(ref);
        try {
          if (parsed && registry.verify(new URL(ref).host,webUrl(parsed.destUrl)))
            this.dest.referer = new URL(parsed.destUrl).origin === this.dest.domain ? parsed.destUrl : new URL(parsed.destUrl).origin + '/';
          else if (registry.original(ref)) this.dest.referer = registry.original(ref) + '/';
        } catch {}
      }
      const session = Object.create(this.session);
      session.cookies = cookieView(registry.isRealm?gateway.jar(this.req.vtRealm):this.session.cookies, {role:this.req.vtRole,credentials:this.dest.credentials,
        sourceOrigin:this.dest.reqOrigin,targetOrigin:this.dest.domain,method:this.req.method,
        sameSiteContext:this.req.vtCookieContext,
        navigation:registry.isRealm ? !!this.req.vtNavigation : !this.dest.isIframe && this.req.headers['sec-fetch-mode'] === 'navigate'});
      this.session = session;
      return true;
    };
    Context.prototype._applyClientSyncCookie = function() {
      if (this.req.vtRole !== 'auth') return;
      for (const value of this.parsedClientSyncCookie?.actual || []) {
        if (value.isClientSync && value.sid === this.session.id && !value.httpOnly) {
          if (value.secure && !this.dest.url.startsWith('https:')) continue;
          if (value.sameSite === 'none' && !value.secure) continue;
          if(this.req.vtRealm && cookieContext(this.req.vtRealm)==='none' && value.sameSite!=='none')continue;
          this.session.cookies._set(this.dest.url,new toughCookie.Cookie({...value,
            domain:value.hostOnly ? undefined : value.domain}),true);
        }
      }
    };
    // Do not let the stock global pending queue copy cookies into another site.
    gateway.session.takePendingSyncCookies = () => [];
  }
  installCors() {
    const location=transforms.responseTransforms.location;
    transforms.responseTransforms.location=(value,ctx)=>ctx.vtRedirectChallenge || location(value,ctx);
    transforms.forcedRequestTransforms.cookie = (_value,ctx) => ctx.session.cookies.getHeader(ctx.dest) || undefined;
    transforms.forcedRequestTransforms['sec-fetch-site'] = (_value,ctx) =>
      navigationFetchSite(ctx.req.vtNavigation,ctx.dest.reqOrigin,ctx.dest.domain);
    transforms.requestTransforms['sec-fetch-dest'] = (value,ctx) =>
      mainFrameFetchDest(value,ctx.req.headers['sec-fetch-mode'],ctx.dest.isIframe);
    transforms.requestTransforms['proxy-authorization'] = () => undefined;
    // The engine decodes gzip, deflate and br to rewrite a body, and zstd where
    // Node's zlib has it (zstd-patch.cjs), so the browser's own Accept-Encoding
    // goes out unchanged. Without zstd support a site that took it (Cloudflare's
    // challenge page) came back undecodable, a blank tab.
    const zstd=require('./zstd-patch.cjs').zstdSupported();
    transforms.requestTransforms['accept-encoding'] = value =>
      value === undefined || zstd ? value : String(value).split(',').map(part => part.trim()).filter(part => part && !/^zstd(\s*;.*)?$/i.test(part)).join(', ') || 'identity';
    transforms.requestTransforms.range = playlistRange;
    const setCookie=transforms.forcedResponseTransforms['set-cookie'].vtEngine||transforms.forcedResponseTransforms['set-cookie'];
    transforms.forcedResponseTransforms['set-cookie'] = Object.assign((value,ctx) =>
      realmSyncCookies(setCookie(value,ctx),this.registry.isRealm?ctx.req.vtRealm:null,ctx.req.headers.cookie),{vtEngine:setCookie});
    transforms.forcedRequestTransforms.origin = (_value,ctx) =>
      ctx.req.headers.origin || (ctx.req.vtNavigation && ctx.req.method==='POST') ? (ctx.req.vtNavigation?.originTaint && ctx.req.vtNavigation.originTaint!=='same-origin'?'null':ctx.dest.reqOrigin) : undefined;
    transforms.responseTransforms['access-control-allow-origin'] = (value,ctx) => {
      if (value === '*') return '*';
      return value === ctx.dest.reqOrigin ? ctx.getProxyOrigin() : undefined;
    };
    transforms.responseTransforms['x-frame-options'] = () => undefined;
    transforms.responseTransforms['referrer-policy'] = () => 'strict-origin-when-cross-origin';
    // The embed sandbox is enforced even if content discovers an unrewritten URL.
    transforms.forcedResponseTransforms['content-security-policy'] = (_value,ctx) =>
      ctx.req.vtWorkerCsp || framePolicies(ctx.destRes.headers,ctx.dest.url,this.registry,this.parentOrigin,this.trustedAncestors)
        .map(policy=>policy+'; sandbox allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock');
    transforms.forcedResponseTransforms['cache-control'] = (value,ctx) => {
      if(ctx.req.vtRole === 'relay')return 'no-store';
      if(!this.registry.isRealm)return 'private, no-cache';
      return realmCacheControl(value,{document:!!(ctx.isPage || ctx.isIframe || ctx.isWebSocket || ctx.dest.isEventSource)});
    };
  }
  gate(req,res,upgrade = false) {
    let ingressRole;
    if(this.ingressIdentity) {
      const identity=Object.fromEntries(['uid','profile','epoch','lease','relay','expires'].map(key=>[key,req.headers['x-vt-browser-'+key]]));
      ingressRole=req.headers['x-vt-browser-role'];
      if(!this.validIngress(identity)||!['auth','relay','entry'].includes(ingressRole))return deny(res,401);
      try{this.leases.track(identity.lease,Number(identity.expires),req.socket,res);}catch{return deny(res,401);}
      req.vtRelayCapability=identity.relay;req.vtLease=identity.lease;
    }
    const physical = this.registry.protocol+'//'+req.headers.host;
    let location; try { location = new URL(req.url,physical); } catch { return deny(res,400); }
    const parsed = urls.parseProxyUrl(physical+req.url);
    if(this.registry.isRealm) {
      if(parsed && !upgrade && this.bindChildFrame(req,res,physical,parsed))return true;
      if(parsed) {
        try{this.registry.recover(req.headers.host,webUrl(parsed.destUrl),parsed.windowId);}catch{return deny(res);}
      }
      req.vtRealm=this.registry.realm(physical);
      req.vtWindowId=parsed?.windowId || urls.parseProxyUrl(req.headers.referer)?.windowId || location.searchParams.get('windowId');
      if(!req.vtRealm)return deny(res,421);
    }
    if (!this.registry.original(physical)) {
      let referer;try{referer=urls.parseProxyUrl(req.headers.referer);}catch{}
      const candidates=[parsed?.destUrl,location.searchParams.get('document'),referer?.destUrl,
        this.tickets.get(location.searchParams.get('ticket'))?.url];
      for(let candidate of candidates) {
        try {candidate=urls.parseProxyUrl(candidate)?.destUrl || candidate;}catch{}
        if(candidate && this.registry.verify(req.headers.host,webUrl(candidate))) {this.registry.register(webUrl(candidate));break;}
      }
      if (!this.registry.original(physical)) return deny(res,421);
    }
    if (location.pathname === '/__vt/entry' && !upgrade && req.method === 'GET') {
      const ticket = location.searchParams.get('ticket');
      const entry = this.tickets.get(ticket);
      let fromParent = false;
      try { fromParent = new URL(req.headers.referer).origin === this.parentOrigin; } catch {}
      if (!entry || entry.host !== req.headers.host || entry.expires < Date.now()
          || (this.registry.isRealm && this.tabs.get(entry.tabId)?.epoch!==entry.epoch)
          || (this.ingressIdentity && (entry.lease!==req.vtLease || !['auth','entry'].includes(ingressRole)))
          || !fromParent || req.headers['sec-fetch-dest'] !== 'iframe') return deny(res);
      this.tickets.delete(ticket);
      if(this.registry.isRealm) {
        const key=new URL(entry.url).href;
        for(const [url,items] of this.admissions){const live=items.filter(item=>item.expires>Date.now());if(live.length)this.admissions.set(url,live);else this.admissions.delete(url);}
        this.admissions.set(key,[...(this.admissions.get(key)||[]),{sourceOrigin:entry.sourceOrigin,execution:entry.execution,tabId:entry.tabId,epoch:entry.epoch,crossSiteRedirect:entry.crossSiteRedirect,redirectCount:entry.redirectCount,originTaint:entry.originTaint,expires:Date.now()+120000}]);
      }
      const headers={'Location':entry.url,'Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin'};
      if(!this.ingressIdentity)headers['Set-Cookie']=`${this.cookieName}=${this.authority.sign('auth',86400)}; Domain=${this.registry.domain}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${this.registry.protocol === 'https:' ? '; Secure' : ''}`;
      res.writeHead(303,headers);
      res.end();return true;
    }
    const cookie = uniqueCookie(req.headers.cookie,this.cookieName);
    const auth = this.ingressIdentity?ingressRole==='auth':cookie && this.authority.verify(cookie,'auth');
    const cap = (this.registry.isRealm?String(parsed?.windowId||'').split('~')[2]:parsed?.sessionId) || location.searchParams.get('cap');
    const relay = this.ingressIdentity?ingressRole==='relay':this.authority.verify(cap,'relay');
    if (!auth && !relay) return deny(res,401);
    if (String(req.headers.cookie || '').split(';').filter(x=>x.trim().startsWith(this.cookieName+'=')).length > 1) return deny(res);
    req.vtRole = auth ? 'auth' : 'relay';
    if(location.pathname==='/__vt/navigation-error')return deny(res,502);
    if(location.pathname==='/__vt/navigation') {
      const record=this.navigations.pending.get(location.searchParams.get('id')),tab=record&&this.tabs.get(record.tabId);
      if(!auth||req.method!=='GET'||req.headers['sec-fetch-dest']!=='iframe'||req.headers['sec-fetch-mode']!=='navigate'
        ||!tab||tab.physical!==physical||tab.epoch!==record.epoch||record.state!=='CAPTURED'
        ||(this.ingressIdentity && tab.lease!==req.vtLease))return deny(res);
      this.challengePage(res,record.challenge,tab);return true;
    }
    // Headers supplied by the network client never become upstream credentials.
    for (const name of Object.keys(req.headers)) {
      if (/^(?:x-vt-|cf-|x-forwarded-|x-original-)/.test(name)
          || ['is-api-request','forwarded','x-real-ip','true-client-ip','cdn-loop'].includes(name)) delete req.headers[name];
    }
    if (parsed) {
      if (parsed.sessionId !== this.session.id || !this.registry.verify(req.headers.host,webUrl(parsed.destUrl))) return deny(res);
      // Google ties a carried sign-in to the device it was established on and
      // treats the same session served under a phone's mobile UA as a hijack:
      // it forces an interactive sign-in ("this browser or app may not be
      // secure") that a rewriting proxy cannot complete, so Gmail is unusable
      // from the phone even though the desktop works. The full Browser (where
      // the session lives) and the user's Mac both present a desktop UA, which
      // Google accepts. Pin Google-owned hosts to one desktop UA so every
      // device the user reaches Google through looks like the same accepted
      // desktop browser. See docs/design-decisions.md.
      try {
        if (isGoogleHost(new URL(webUrl(parsed.destUrl)).hostname)) {
          req.headers['user-agent'] = GOOGLE_PINNED_UA;
          for (const hint of GOOGLE_CLIENT_HINTS) delete req.headers[hint];
        }
      } catch {}
      // Ad blocker (network): refuse a known ad/tracker host so the subresource
      // never loads. Subresources only -- a top-level document navigation is
      // left alone -- and never a Google-owned host (adblock.blocks guards the
      // whole Google family, so the carried session and YouTube video survive).
      if (this.adblock && !upgrade && req.headers['sec-fetch-dest'] !== 'document') {
        try {
          if (adblock.blocks(new URL(webUrl(parsed.destUrl)).hostname)) {
            res.writeHead(204, {'Cache-Control': 'no-store'}); res.end(); return true;
          }
        } catch {}
      }
      if(urls.parseResourceType(parsed.resourceType).isWorkerModule && parsed.resourceType!==urls.getResourceTypeString({isScript:true,isWorkerModule:true}))return deny(res);
      if(upgrade!==!!urls.parseResourceType(parsed.resourceType).isWebSocket)return deny(res);
      if(upgrade && !this.registry.isRealm && !this.registry.original(req.headers.origin))return deny(res);
      req.vtCacheKey=scriptCacheKey({physical,sessionId:this.session.id,windowId:parsed.windowId,
        resourceType:parsed.resourceType,charset:parsed.charset,destination:parsed.destUrl,
        relay:req.vtRelayCapability||this.relayCapability});
      req.vtCacheTab=cacheTab(parsed.windowId);
      if(this.registry.isRealm) {
        let parent=false;try{parent=new URL(req.headers.referer).origin===this.parentOrigin;}catch{}
        const key=new URL(physical+req.url).href,items=this.admissions.get(key)||[];
        const candidate=parent && items.find(item=>item.expires>Date.now() && this.tabs.get(item.tabId)?.epoch===item.epoch);
        const tab=this.tabTokens.get(String(parsed.windowId||'').split('~')[1]);
        const source=sourceRecord(req.headers,req.vtRealm,this.registry.realms);
        let tabOwnNavigation=false;
        if(!upgrade && !candidate && req.headers['sec-fetch-mode']==='navigate' && req.headers['sec-fetch-dest']==='iframe'
          && !urls.parseResourceType(parsed.resourceType).isIframe && source?.origin!==new URL(parsed.destUrl).origin) {
          const leaseOk=!this.ingressIdentity || tab?.lease===req.vtLease;
          if(auth && tab?.physical===source?.physical && leaseOk && authorizeResource(source,req.vtRealm))return this.captureNavigation(req,res,parsed,tab);
          // A toolbar-initiated top-level navigation has no content realm as its
          // source: its referer is the trusted parent (toolbar) origin, so
          // sourceRecord returns null. When the opened page server-redirects,
          // the one-shot admission was spent on the first hop, so this follow
          // arrives without a candidate. If the redirect stayed on the tab's
          // own realm it is the tab loading its own site -- allow it. If it
          // crossed origin, capture it for the toolbar's approval, exactly as a
          // content-initiated cross-origin navigation would be. Gmail needs
          // both: "/" -> "/mail/u/0/" (same realm) and the passive
          // accounts.google.com sign-in bounce (cross origin, same site).
          else if(auth && parent && !source && tab && leaseOk) {
            if(tab.physical===physical)tabOwnNavigation=true;
            else return this.captureNavigation(req,res,parsed,tab);
          }
          else return deny(res);
        }
        let grant=null;
        if(!upgrade && !candidate && req.headers['sec-fetch-mode']==='navigate' && req.headers['sec-fetch-dest']==='iframe') {
          const found=this.frameGrants.get(key);
          if(found && found.expires>Date.now() && (!this.ingressIdentity || found.lease===req.vtLease)){grant=found;this.frameGrants.delete(key);}
        }
        const decision=authorizeRequest(req.headers,req.vtRealm,this.registry.realms,{approvedMain:!!candidate||!!grant||tabOwnNavigation,websocket:upgrade,workerModule:!!urls.parseResourceType(parsed.resourceType).isWorkerModule});
        if(!decision.allowed)return deny(res);
        req.vtSource=decision.source||grant?.source||null;
        if(candidate && decision.navigation) {
          req.vtNavigation=candidate;items.splice(items.indexOf(candidate),1);
          if(!items.length)this.admissions.delete(key);
          if(candidate.execution) {
            let replay;try{replay=this.navigations.dispatch(candidate.execution.ticket,candidate.execution.owner);}catch{return deny(res);}
            req.method=replay.method;
            if(replay.contentType)req.headers['content-type']=replay.contentType;
            req.headers['content-length']=String(replay.body.length);
            this.replayBodies.set(req,replay.body);
            res.once('close',()=>{this.navigations.complete(replay.id);this.replayBodies.delete(req);});
          }
        }
        req.vtCookieContext=cookieContext(req.vtRealm);
        if(req.vtNavigation && (req.vtNavigation.crossSiteRedirect || (req.vtNavigation.sourceOrigin && !sameSite(req.vtNavigation.sourceOrigin,parsed.destUrl))))
          req.vtCookieContext=['GET','HEAD'].includes(req.method)?'lax':'none';
      }
      if(req.headers['sec-fetch-dest']==='worker')req.vtWorkerCsp=this.workerPolicy();
      if(urls.parseResourceType(parsed.resourceType).isWorkerModule) {
       if(!this.registry.isRealm)return deny(res);
       try {
        if(req.headers['sec-fetch-mode']==='navigate')return deny(res);
        req.vtWorkerCsp=this.workerPolicy();
        const kind=urls.getResourceTypeString({isScript:true,isWorkerModule:true});
        const owner=this.registry.map(req.vtRealm.context.documentOrigin,{resourceType:kind,windowId:parsed.windowId});
        const runtime=workerModule.runtimeUrl(owner.physical,parsed.sessionId,parsed.windowId);
        req.vtProcessModule=(script,replacer)=>workerModule.processModule(script,url=>replacer(url,kind,'utf-8'),runtime,parsed.destUrl);
        req.vtCacheKey=scriptCacheKey({physical,sessionId:this.session.id,windowId:parsed.windowId,
          resourceType:kind,charset:'utf-8',destination:parsed.destUrl,relay:parsed.windowId.split('~')[2]})+'\0'+workerModule.revision;
        req.vtCacheTab=cacheTab(parsed.windowId);
       } catch {return deny(res);}
      }
      if (!upgrade && (!req.headers['sec-fetch-mode'] || !req.headers['sec-fetch-dest'])) return deny(res);
      if (req.headers['sec-fetch-mode'] === 'navigate') {
        if (!auth || req.headers['sec-fetch-dest'] !== 'iframe') return deny(res);
      }
      if (!auth && ['document','iframe','object','embed','serviceworker'].includes(req.headers['sec-fetch-dest'])) return deny(res);
      return false;
    }
    if(location.pathname==='/__vt/worker') {
      if(upgrade || !auth || !this.registry.isRealm || req.vtRealm.resourceOnly
        || sourceRecord(req.headers,req.vtRealm,this.registry.realms)?.physical!==physical)return deny(res);
      // WebKit omits Fetch Metadata on synchronous XHR. Exact browser-set
      // Origin still proves this POST came from the current document realm.
      if(req.method==='POST' && req.headers.origin===physical
        && (!req.headers['sec-fetch-dest']||req.headers['sec-fetch-dest']==='empty'))return false;
      if(req.method==='GET' && req.headers['sec-fetch-dest']==='worker')return false;
      return deny(res);
    }
    if (upgrade || req.method !== 'GET') return deny(res);
    const staticPaths = [workerModule.runtimePath,'/__vt/bridge.js','/hammerhead.js','/rammerhead.js','/worker-hammerhead.js','/transport-worker.js'];
    if (staticPaths.includes(location.pathname)) return false;
    if (!auth) return deny(res);
    if(this.registry.isRealm && req.vtRealm.resourceOnly)return deny(res);
    if (['/__vt/map','/__vt/origin','/__vt/message-target'].includes(location.pathname)) {
      if(this.registry.isRealm) {
        if(sourceRecord(req.headers,req.vtRealm,this.registry.realms)?.physical!==physical)return deny(res);
        return false;
      }
      if (requestOrigin(req.headers,this.registry) !== this.registry.original(physical)) return deny(res);
      return false;
    }
    if (['/task.js','/iframe-task.js','/__vt/client.js'].includes(location.pathname)) {
      // Script inclusion is not subject to CORS. A task script contains this
      // document's non-HttpOnly cookies, so another physical origin cannot load it.
      if(this.registry.isRealm) {
        if(sourceRecord(req.headers,req.vtRealm,this.registry.realms)?.physical!==physical)return deny(res);
      } else if (requestOrigin(req.headers,this.registry) !== this.registry.original(physical)) return deny(res);
      const document = location.searchParams.get('document');
      if (!document || !this.registry.verify(req.headers.host,document)) return deny(res);
      req.headers.referer = this.url(document);
      return false;
    }
    return deny(res); // Never use Hammerhead's arbitrary-path Referer fallback.
  }
  async listen(socketOrPort = 0) {
    await new Promise((resolve,reject) => {
      this.proxy.server1.once('error',reject);
      if (typeof socketOrPort === 'object') this.proxy.server1.listen(socketOrPort,resolve);
      else if (typeof socketOrPort === 'string') this.proxy.server1.listen(socketOrPort,resolve);
      else this.proxy.server1.listen(socketOrPort,'127.0.0.1',resolve);
    });
    if (typeof socketOrPort === 'string') fs.chmodSync(socketOrPort,0o600);
    return this.proxy.server1.address();
  }
  async close() {
    this.leases.close();
    clearInterval(this.collectionTimer);
    this.proxy.server1.closeAllConnections();
    await new Promise(resolve => this.proxy.server1.close(resolve));
  }
}
module.exports = {BrowserGateway};
