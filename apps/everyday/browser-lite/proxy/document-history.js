(function () {
  'use strict';
  // YouTube (and others) take pushState/replaceState from a hidden about:blank
  // iframe, to get untouched natives, and bind them to this page's history. No
  // script runs in that frame (its sandbox lacks allow-scripts), so its native
  // methods wrote the raw, unproxied URL into this page's history: the address
  // lost its realm prefix (relative URLs) or threw SecurityError (absolute
  // ones), and the page broke soon after. Guard such frames from here: their
  // History methods, called on another window's history, defer to that
  // history's own (proxying) methods.
  const guarded=new WeakSet();
  function guardFrame(win) {
    try {
      if(!win||win===window||guarded.has(win))return;
      const own=win.history,proto=own&&Object.getPrototypeOf(own);
      if(!proto)return;
      guarded.add(win);
      for(const name of ['pushState','replaceState']) {
        const nativeMethod=proto[name];
        if(typeof nativeMethod!=='function')continue;
        const method={[name](...args){
          if(this!==own){const target=this&&this[name];if(typeof target==='function'&&target!==method)return target.apply(this,args);}
          return nativeMethod.apply(this,args);
        }}[name];
        Object.defineProperty(proto,name,{configurable:true,writable:true,value:method});
      }
    } catch {}
  }
  if(typeof HTMLIFrameElement==='function') {
    for(const prop of ['contentWindow','contentDocument']) {
      const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,prop);
      if(!descriptor||!descriptor.get)continue;
      Object.defineProperty(HTMLIFrameElement.prototype,prop,{configurable:true,enumerable:descriptor.enumerable,get(){
        const value=descriptor.get.call(this);
        guardFrame(prop==='contentWindow'?value:value&&value.defaultView);
        return value;
      }});
    }
  }
  // Compatibility journal, not an authorization boundary. Native iframe history
  // belongs to the whole host page, so a virtual tab must not traverse it.
  window.vibetopInstallHistory=function({native,originalUrl,changed,navigate}) {
    const history=window.history,clone=window.structuredClone.bind(window),uuid=crypto.randomUUID.bind(crypto);
    const replace=history.replaceState,rawReplace=native.historyReplaceState;
    const dispatch=native.dispatchEvent,Pop=window.PopStateEvent,Hash=window.HashChangeEvent;
    const scroll=window.scrollTo.bind(window),raf=window.requestAnimationFrame.bind(window);
    const documentId=uuid();let entries=[],index=0,sequence=0,restoreGeneration=0;
    const maxEntries=50;let extraDepth=0;
    function read(id=uuid()) {return {id,url:originalUrl(location.href),physical:location.href,state:clone(history.state),x:scrollX,y:scrollY,restoration:history.scrollRestoration};}
    entries.push(read());
    function saveScroll(){const entry=entries[index];entry.x=scrollX;entry.y=scrollY;entry.restoration=history.scrollRestoration;}
    function announce(kind){sequence++;changed(kind);}
    function reconcile() {
      // Fragment changes (including script location.hash) bypass History methods.
      if(location.href===entries[index].physical)return false;
      entries.splice(index+1);entries.push(read());index=entries.length-1;
      if(entries.length>maxEntries){entries.shift();index--;}
      announce('push');return true;
    }
    function mutation(kind,args) {
      reconcile();saveScroll();restoreGeneration++;
      // The browser validates the original arguments and structured serialization
      // before any journal edit. Keep application state entirely unwrapped.
      replace.apply(history,args);
      const entry=read(kind==='replace'?entries[index].id:undefined);
      if(kind==='push') {
        entries.splice(index+1);entries.push(entry);index=entries.length-1;
        if(entries.length>maxEntries){entries.shift();index--;}
      }else entries[index]=entry;
      announce(kind);
    }
    function request(delta) {reconcile();navigate(Number(delta)>>0);}
    const methods={
      pushState:function(...args){if(this!==history)return native.historyPushState.apply(this,args);return mutation('push',args);},
      replaceState:function(...args){if(this!==history)return rawReplace.apply(this,args);return mutation('replace',args);},
      back:function(){if(this!==history)throw new TypeError('Illegal invocation');request(-1);},
      forward:function(){if(this!==history)throw new TypeError('Illegal invocation');request(1);},
      go:function(delta=0){if(this!==history)throw new TypeError('Illegal invocation');request(delta);}
    };
    for(const [name,value] of Object.entries(methods)) {
      Object.defineProperty(history,name,{configurable:true,writable:true,value});
      Object.defineProperty(History.prototype,name,{configurable:true,writable:true,value});
    }
    // Routers must use the supported History API, not a second native joint
    // history API. This is feature detection, never a security fence.
    if('navigation' in window)try{delete window.navigation;if('navigation' in window)Object.defineProperty(window,'navigation',{configurable:true,value:undefined});}catch{}
    Object.defineProperty(history,'length',{configurable:true,get:()=>extraDepth+entries.length});
    native.addEventListener.call(document,'click',()=>saveScroll(),true);
    native.addEventListener.call(window,'hashchange',()=>reconcile());
    native.addEventListener.call(window,'scroll',()=>{if(location.href===entries[index].physical)saveScroll();},{passive:true});
    for(const event of ['wheel','touchstart','pointerdown','keydown'])native.addEventListener.call(window,event,()=>{restoreGeneration++;},{passive:true,capture:true});
    return {
      documentId,
      setDepth(depth){if(Number.isSafeInteger(depth)&&depth>=0&&depth<=10000)extraDepth=depth;},
      snapshot(){reconcile();return {documentId,sequence,index,entries:entries.map(({id,url})=>({id,url}))};},
      traverse({basisEntryId,targetEntryId}) {
        reconcile();
        if(entries[index].id!==basisEntryId){announce('sync');return;}
        const next=entries.findIndex(entry=>entry.id===targetEntryId);
        if(next<0){announce('sync');return;}
        if(next===index){announce('sync');return;}
        saveScroll();const old=entries[index],target=entries[next],generation=++restoreGeneration;
        // Replay the exact validated physical URL; regenerating it can change
        // its per-tab token or relay capability.
        if(new URL(target.physical).origin!==location.origin)throw new Error('History origin changed');
        rawReplace.call(history,target.state,'',target.physical);
        index=next;history.scrollRestoration=target.restoration;
        const beforeX=scrollX,beforeY=scrollY,desiredX=target.x,desiredY=target.y;
        announce('traverse');
        dispatch.call(window,new Pop('popstate',{state:history.state}));
        if(new URL(old.url).hash!==new URL(target.url).hash)
          dispatch.call(window,new Hash('hashchange',{oldURL:old.url,newURL:target.url}));
        if(target.restoration==='auto')raf(()=>{
          if(generation===restoreGeneration && entries[index]===target && history.scrollRestoration==='auto' && scrollX===beforeX && scrollY===beforeY)scroll(desiredX,desiredY);
        });
      }
    };
  };
})();
