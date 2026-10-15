(function () {
  'use strict';
  const config = window.__vtBrowserConfig;
  // The Cookie Store API is not virtualized by the engine: page scripts wrote
  // real cookies onto the realm host (40+ on weather.com) that never reached
  // the site's cookie jar. Without it, sites fall back to document.cookie.
  try { delete Window.prototype.cookieStore; } catch {}
  try { if ('cookieStore' in window) Object.defineProperty(window, 'cookieStore', {configurable: true, value: undefined}); } catch {}
  delete window.__vtBrowserConfig;
  const engine = window['%hammerhead%'];
  const native = engine.nativeMethods;
  const origins = config.origins;
  const physicalOrigin = window.location.origin;
  const messageOrigins = new Map();
  // The browser's native MessageEvent.origin is the authority. A sender can
  // forge every field in Hammerhead's message envelope, including originUrl.
  window.vibetopMessageOrigin = function (physical) {
    if (messageOrigins.has(physical)) return messageOrigins.get(physical);
    let origin = physical;
    try {
      const xhr = new native.XMLHttpRequest();
      native.xhrOpen.call(xhr,'GET',physicalOrigin+'/__vt/origin?physical='+encodeURIComponent(physical),false);
      native.xhrSend.call(xhr);
      if (xhr.status !== 200) return physical;
      origin = JSON.parse(xhr.responseText).origin || physical;
    } catch {return physical;}
    messageOrigins.set(physical,origin);
    return origin;
  };
  // A site's silence must remain silence: never probe a recipient or disclose
  // its current origin through a bridge-generated reply. Normal incoming
  // application messages already disclose their native source/origin.
  const knownWindows=new WeakMap(), messageTargets=new Map();
  const resolveMessageTarget=window.vibetopMessageTarget;
  delete window.vibetopMessageTarget;
  native.addEventListener.call(window,'message',function(event){
    const origin=native.messageEventOriginGetter.call(event);
    if(event.source && origin!=='null')knownWindows.set(event.source,origin);
  });
  function isChild(owner,target) {
    try {for(let i=0;i<owner.frames.length;i++)if(owner.frames[i]===target)return true;}catch{}
    return false;
  }
  function messageTarget(origin,relation) {
    const key=relation+':'+origin;
    if(messageTargets.has(key))return messageTargets.get(key);
    const xhr=new native.XMLHttpRequest();
    const query='?origin='+encodeURIComponent(origin)+'&relation='+relation
      +(relation==='sibling'?'&parent='+encodeURIComponent(config.messageParent.physical):'');
    native.xhrOpen.call(xhr,'GET',physicalOrigin+'/__vt/message-target'+query,false);
    native.xhrSend.call(xhr);
    if(xhr.status!==200)throw new Error('Message destination unavailable');
    const physical=JSON.parse(xhr.responseText).physical;
    if(messageTargets.size>=256)messageTargets.delete(messageTargets.keys().next().value);
    messageTargets.set(key,physical);return physical;
  }
  window.vibetopPostMessage=function(target,args,targetOrigin) {
    let samePhysical=false;
    try {
      const physical=target.location.origin;
      samePhysical=physical===physicalOrigin || (physical==='null' && target.location.href==='about:blank' && !!target.document);
    }catch{}
    const destination=resolveMessageTarget({expected:targetOrigin,documentOrigin:config.documentOrigin,physicalOrigin,samePhysical,
      known:()=>{const physical=knownWindows.get(target);return physical?{physical,original:window.vibetopMessageOrigin(physical)}:null;},
      parent:()=>target===window.parent?config.messageParent:null,
      child:config.realmMode && isChild(window,target)?origin=>messageTarget(origin,'child'):null,
      sibling:config.realmMode && config.messageParent && target!==window && isChild(window.parent,target)?origin=>messageTarget(origin,'sibling'):null});
    // Exactly one native send on every path preserves synchronous clone errors,
    // transfer ownership and FIFO ordering, including messages that are dropped.
    args[0].targetUrl=targetOrigin==='*'?'*':new URL(targetOrigin==='/'?config.documentOrigin:targetOrigin).origin;
    return native.postMessage.call(target,args[0],destination,args[2]);
  };
  window.vibetopNativeOriginStorage = true;
  window.rammerheadDisableLocalStorageImplementation = true;
  const WorkerURL=native.URL, WorkerException=window.DOMException;
  const createWorkerBlob=WorkerURL.createObjectURL.bind(WorkerURL);
  const revokeWorkerBlob=WorkerURL.revokeObjectURL.bind(WorkerURL);
  const workerDiagnostic=window.console.warn.bind(window.console);
  const workerString=String;
  function workerDOMString(value) {
    if(typeof value==='symbol')throw new TypeError('Worker argument cannot be a Symbol');
    return workerString(value);
  }
  window.vibetopCreateWorker=function(input,options,base,map) {
    const original=workerDOMString(input);
    if(options!=null && typeof options!=='object' && typeof options!=='function')
      throw new TypeError('Worker options must be a dictionary');
    const normalized={credentials:'same-origin',name:'',type:'classic'};
    for(const key of ['credentials','name','type']) {
      const value=options==null?undefined:options[key];
      if(value!==undefined)normalized[key]=workerDOMString(value);
      if(key==='credentials' && !['omit','same-origin','include'].includes(normalized[key]))throw new TypeError('Invalid Worker credentials');
      if(key==='type' && !['classic','module'].includes(normalized[key]))throw new TypeError('Invalid Worker type');
    }
    let destination;
    try{destination=new WorkerURL(original,base);}catch{throw new WorkerException('Invalid Worker URL','SyntaxError');}
    let url,stage='mapping';
    try {
      url=map(original,config.realmMode && destination.protocol!=='blob:'?normalized.type:'classic');
      if(config.realmMode && destination.protocol==='blob:') {
        stage='reading';
        const read=new native.XMLHttpRequest();
        native.xhrOpen.call(read,'GET',destination.href,false);
        native.xhrOverrideMimeType.call(read,'text/javascript; charset=utf-8');
        native.xhrSend.call(read);
        if(read.status!==200)throw new Error('Worker source unavailable');
        stage='uploading';
        const upload=new native.XMLHttpRequest();
        native.xhrOpen.call(upload,'POST',physicalOrigin+'/__vt/worker',false);
        native.xhrSetRequestHeader.call(upload,'X-Browser-Worker-URL',destination.href);
        native.xhrSend.call(upload,read.responseText);
        if(upload.status!==200)throw new Error('Worker preparation unavailable');
        url=JSON.parse(upload.responseText).url;
        if(typeof url!=='string')throw new Error('Invalid Worker preparation');
      }
    } catch {
      workerDiagnostic('Browser Lite worker preparation failed',stage,destination.protocol,config.documentOrigin);
      // A dead, empty native Blob preserves the browser's asynchronous error
      // and termination behavior without ever executing unprocessed site code.
      url=createWorkerBlob(new native.Blob([],{type:'text/javascript'}));
      revokeWorkerBlob(url);
    }
    return new native.Worker(url,normalized);
  };
  const realmHost = window.vibetopRealmHost;
  // URL attributes and properties the engine leaves native: the browser fetched
  // them straight from the site (img/source srcset set by lazy loaders and Vue,
  // video posters, captions, responsive preloads; ping beacons).
  (function hookExtraUrls() {
    const extra = window.vibetopExtraUrlAttrs, url = engine.utils.url;
    const proxied = value => { try { return !!url.parseProxyUrl(String(value)); } catch { return false; } };
    const rewrite = value => url.getProxyUrl(url.resolveUrlAsDest(String(value).trim()));
    const rewriteSet = value => url.handleUrlsSet ? url.handleUrlsSet(rewrite, String(value)) : String(value).split(',').map(part => {
      const [first, ...rest] = part.trim().split(/\s+/); return [first && rewrite(first), ...rest].filter(Boolean).join(' '); }).join(', ');
    if (extra && engine.processors && engine.processors.domProcessor) {
      const processor = engine.processors.domProcessor, processElement = processor.processElement;
      processor.processElement = function (el, replacer) {
        const result = processElement.apply(this, arguments);
        try { extra.processExtraUrlAttrs(this.adapter, el, {rewrite, rewriteSet, isProxied: proxied}); } catch {}
        return result;
      };
    }
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      const attr = String(name).toLowerCase(), tag = String(this.tagName || '').toLowerCase();
      if ((tag === 'a' || tag === 'area') && attr === 'ping') return;
      if (extra && extra.SINGLE[tag] === attr && value && !/^\s*(data|blob|about|javascript):/i.test(value) && !proxied(value)) value = rewrite(value);
      else if (tag === 'link' && attr === 'imagesrcset' && value) value = rewriteSet(value);
      return setAttribute.call(this, name, value);
    };
    const hook = (proto, prop, attr, read) => {
      if (!proto) return;
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set) return;
      Object.defineProperty(proto, prop, {configurable: true, enumerable: desc.enumerable,
        get() { return read ? read.call(this, desc.get) : (this.getAttribute(attr) || ''); },
        set(value) { this.setAttribute(attr, String(value)); }});
    };
    const destination = function (getter) { const value = getter.call(this); try { return url.parseProxyUrl(value)?.destUrl || value; } catch { return value; } };
    hook(window.HTMLImageElement && HTMLImageElement.prototype, 'srcset', 'srcset');
    hook(window.HTMLSourceElement && HTMLSourceElement.prototype, 'srcset', 'srcset');
    hook(window.HTMLLinkElement && HTMLLinkElement.prototype, 'imageSrcset', 'imagesrcset');
    hook(window.HTMLVideoElement && HTMLVideoElement.prototype, 'poster', 'poster', destination);
    hook(window.HTMLTrackElement && HTMLTrackElement.prototype, 'src', 'src', destination);
    for (const proto of [window.HTMLAnchorElement && HTMLAnchorElement.prototype, window.HTMLAreaElement && HTMLAreaElement.prototype]) {
      const desc = proto && Object.getOwnPropertyDescriptor(proto, 'ping');
      if (desc) Object.defineProperty(proto, 'ping', {configurable: true, enumerable: desc.enumerable, get() { return ''; }, set() {}});
    }
  })();
  function mapOrigin(origin, iframe) {
    const key = iframe ? 'iframe:'+origin : origin;
    if (Object.prototype.hasOwnProperty.call(origins,key)) return origins[key];
    // Hosts in this document's own context are named locally: a synchronous
    // request per new origin blocked the page (and Vibetop with it) for ~14 s
    // of a weather.com load. A new iframe's context still comes from the server.
    if (config.realmMode && config.resourceKey && config.self && realmHost) {
      // A new iframe is named on this document's own host; the server sends
      // that navigation on to the child realm (Gateway.bindChildFrame).
      if (iframe || origin === config.documentOrigin) return origins[key] = config.self;
      return origins[key] = {physical: realmHost(config.resourceKey, origin, config.realmHost), windowId: config.self.windowId};
    }
    // Only the first occurrence of an origin needs a round trip. HTML/CSS
    // rewriting usually registered it already; dynamic imports use this fallback.
    const xhr = new native.XMLHttpRequest();
    native.xhrOpen.call(xhr, 'GET', physicalOrigin + '/__vt/map?origin=' + encodeURIComponent(origin)+(iframe?'&kind=iframe':''), false);
    native.xhrSend.call(xhr);
    if (xhr.status !== 200) throw new Error('Browser origin mapping failed');
    const mapped=JSON.parse(xhr.responseText);
    return origins[key] = config.realmMode ? mapped : mapped.physical;
  }
  window.overrideGetProxyUrl(original => function (url, options) {
    // Scripts may pass a URL already rewritten on another physical origin.
    // Hammerhead only recognizes its own two ports and otherwise nests it.
    try {
      const prior=engine.utils.url.parseProxyUrl(url);
      if (prior && prior.sessionId === config.sessionId) url=prior.destUrl;
    } catch {}
    const result = original(url, options);
    const parsed = engine.utils.url.parseProxyUrl(result);
    if (!parsed || !/^(https?|wss?):/.test(parsed.destUrl)) return result;
    const destination = new URL(parsed.destUrl.replace(/^ws:/,'http:').replace(/^wss:/,'https:'));
    const mapped = mapOrigin(destination.origin,config.realmMode && engine.utils.url.parseResourceType(parsed.resourceType).isIframe);
    let physical = config.realmMode ? mapped.physical : mapped;
    const proxy = new URL(result);
    if (config.realmMode) {
      const parts=proxy.pathname.split('/');
      parts[1]=parts[1].replace(/^[^!]+/,config.sessionId+'*'+mapped.windowId);
      proxy.pathname=parts.join('/');
    }
    if (/^wss?:/.test(proxy.protocol)) physical = physical.replace(/^http/,'ws');
    return physical + proxy.pathname + proxy.search + proxy.hash;
  });
  function originalUrl(url) {
    return engine.utils.url.parseProxyUrl(url)?.destUrl || url;
  }
  function send(message) {
    if (config.nested) return;
    native.postMessage.call(window.parent,
      Object.assign({type:'vibetop-browser'},config.navigation,message), config.parentOrigin);
  }
  const installHistory=window.vibetopInstallHistory;
  delete window.vibetopInstallHistory;
  const start = function () {
    // Keep new tabs inside the trusted Browser Lite app. The iframe's sandbox
    // independently prevents scripts from escaping into a top-level browser tab.
    const open = function (url) {
      if (url) send({action:'open',url:originalUrl(new URL(url,originalUrl(window.location.href)).href)});
      return null;
    };
    window.open = open;
    native.addEventListener.call(document,'click',function (event) {
      const link = event.target.closest && event.target.closest('a[href]');
      if (link && (link.target === '_blank' || event.ctrlKey || event.metaKey)) {
        event.preventDefault(); open(link.href);
      }
    },true);
    let previous='',nonce=null,journal=null,lastKind='sync',queuedHistory=[];
    // Bot walls (Cloudflare, DataDome, PerimeterX, Imperva) refuse a rewriting
    // proxy by design. Report one so the UI can offer the full Browser instead
    // of a blank or looping page; Browser Lite never tries to pass them.
    const BOT_TITLE=/^(just a moment|attention required! \| cloudflare|pardon our interruption|human verification)/i;
    // Not window._cf_chl_opt: Cloudflare's bot script sets it on ordinary pages.
    // Only a challenge page loads the challenge orchestrator (ordinary pages
    // load jsd/precursor), and a challenge page may keep the site's own title.
    const challengeLoaded=()=>{try{return performance.getEntriesByType('resource').some(e=>/\/cdn-cgi\/challenge-platform\/.*\/orchestrate\/(chl_page|managed|jsch|captcha)/.test(decodeURIComponent(e.name)));}catch{return false;}};
    const botWall=()=>!!(BOT_TITLE.test(document.title||'')||challengeLoaded()
      ||document.querySelector('iframe[src*="captcha-delivery.com"],#px-captcha,iframe[src*="challenges.cloudflare.com"]'));
    const update = function () {
      if(config.navigation && !nonce)return;
      const state={url:originalUrl(window.location.href),title:document.title,nonce,blocked:botWall(),
        ...(journal?{history:journal.snapshot(),historyKind:lastKind}:{})};
      const serialized=JSON.stringify(state);
      if(serialized!==previous){previous=serialized;send({action:'state',...state});}
    };
    if(config.navigation && !config.nested) {
      journal=installHistory({native,originalUrl,changed:kind=>{lastKind=kind;update();},
        navigate:delta=>{if(!nonce){if(queuedHistory.length<8)queuedHistory.push(delta);}else send({action:'history',nonce,documentId:journal.documentId,delta});}});
      // A same-frame link would append to the HOST page's joint session history.
      // Safari's edge swipe then previews that entry even after Browser Lite has
      // closed. The tab keeps its own journal, so follow such links by replacement.
      // Bubble phase on window: page handlers (routers) see and cancel it first.
      // This frame is the tab's top, so _top/_parent mean the tab itself; left
      // alone they target Vibetop's page, and Chrome drops the click as an
      // unsafe navigation (Google's "Sign in" link is target=_top).
      const tabTarget=target=>!target||/^_(self|top|parent)$/i.test(target);
      native.addEventListener.call(window,'click',event=>{
        if(event.defaultPrevented||event.button!==0||event.altKey||event.shiftKey||event.ctrlKey||event.metaKey)return;
        const link=event.target.closest&&event.target.closest('a[href],area[href]');
        if(!link||link.hasAttribute('download'))return;
        const target=link.target||document.querySelector('base[target]')?.target||'';
        if(!tabTarget(target))return;
        const physical=(link.tagName==='AREA'?native.areaHrefGetter:native.anchorHrefGetter).call(link);
        let url;try{url=new URL(physical);}catch{return;}
        if(url.origin===new URL(window.location.href).origin){event.preventDefault();window.location.replace(url.href);}
        else if(/^_(top|parent)$/i.test(target)){event.preventDefault();window.location.assign(url.href);}
      });
      native.addEventListener.call(window,'submit',event=>{
        const form=event.target;
        if(event.defaultPrevented||!form||form.tagName!=='FORM')return;
        const submitter=event.submitter;
        const target=(submitter&&submitter.getAttribute('formtarget'))||form.getAttribute('target')||document.querySelector('base[target]')?.target||'';
        if(!/^_(top|parent)$/i.test(target))return;
        if(submitter&&submitter.hasAttribute('formtarget'))native.setAttribute.call(submitter,'formtarget','_self');
        native.setAttribute.call(form,'target','_self');
      });
      native.addEventListener.call(window,'message',event=>{
        if(event.source!==window.parent || native.messageEventOriginGetter.call(event)!==config.parentOrigin)return;
        const data=event.data;
        if(!data || data.type!=='vibetop-browser-control' || data.tabId!==config.navigation.tabId || data.epoch!==config.navigation.epoch)return;
        event.stopImmediatePropagation();
        if(data.action==='attach' && typeof data.nonce==='string') {
          nonce=data.nonce;previous='';update();
          for(const delta of queuedHistory)send({action:'history',nonce,documentId:journal.documentId,delta});queuedHistory=[];
        }else if(data.action==='depth' && data.nonce===nonce && data.documentId===journal.documentId)journal.setDepth(data.depth);
        else if(data.action==='traverse' && data.nonce===nonce && data.documentId===journal.documentId) {
          try{journal.traverse(data);send({action:'traversed',nonce,documentId:journal.documentId,requestId:data.requestId});}
          catch{send({action:'traversed',nonce,documentId:journal.documentId,requestId:data.requestId,failed:true});}
        }
      });
      send({action:'ready'});
    }
    native.addEventListener.call(window,'load',update);
    setInterval(update,750);
    update();
  };
  (window.rammerheadStartListeners || (window.rammerheadStartListeners=[])).push(start);
})();
