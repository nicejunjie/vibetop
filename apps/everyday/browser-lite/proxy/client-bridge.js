(function () {
  'use strict';
  const config = window.__vtBrowserConfig;
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
  function mapOrigin(origin, iframe) {
    const key = iframe ? 'iframe:'+origin : origin;
    if (Object.prototype.hasOwnProperty.call(origins,key)) return origins[key];
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
    const update = function () {
      if(config.navigation && !nonce)return;
      const state={url:originalUrl(window.location.href),title:document.title,nonce,
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
      native.addEventListener.call(window,'click',event=>{
        if(event.defaultPrevented||event.button!==0||event.altKey||event.shiftKey||event.ctrlKey||event.metaKey)return;
        const link=event.target.closest&&event.target.closest('a[href],area[href]');
        if(!link||link.hasAttribute('download'))return;
        const target=link.target||document.querySelector('base[target]')?.target||'';
        if(target&&target.toLowerCase()!=='_self')return;
        const physical=(link.tagName==='AREA'?native.areaHrefGetter:native.anchorHrefGetter).call(link);
        let url;try{url=new URL(physical);}catch{return;}
        if(url.origin!==new URL(window.location.href).origin)return;
        event.preventDefault();window.location.replace(url.href);
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
