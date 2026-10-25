(function () {
  'use strict';
  // This file belongs only on the dedicated, trusted browser UI origin.
  // Two realm origins of the same user: bl-u<uid>-<hash>.<domain>, same uid.
  const REALM=/^bl-u(\d+)-[a-f0-9]{32}$/;
  function siblingRealm(origin,known) {
    try {
      const [a,b]=[origin,known].map(value=>{const url=new URL(value);if(url.protocol!=='https:')return null;const [first,...rest]=url.hostname.split('.');const m=REALM.exec(first);return m&&{uid:m[1],domain:rest.join('.')+':'+url.port};});
      return !!(a&&b&&a.uid===b.uid&&a.domain===b.domain);
    }catch{return false;}
  }
  class BrowserProxyController {
    constructor({frame,request,onState=()=>{},onError=()=>{},onOpen=null,onHistory=()=>{},allowPopup=()=>false,onFrame=()=>{},onClose=()=>{},openerIndex=()=>undefined}) {
      Object.assign(this,{frame,request,onState,onError,onOpen,onHistory,allowPopup,onFrame,onClose,openerIndex});this.state=null;this.serverState=null;this.sequence=0;this.approving=false;this.operations=Promise.resolve();
      this.clientId=window.crypto.randomUUID();this.tabId=window.crypto.randomUUID();this.operation=0;this.pending=null;
      this.listener=event=>this.message(event);window.addEventListener('message',this.listener);
      this.loadListener=()=>{if(this.readyBeforeLoad)this.readyBeforeLoad=false;else this.attach();};this.frame.addEventListener?.('load',this.loadListener);
    }
    enqueue(operation) {const result=this.operations.then(operation);this.operations=result.catch(()=>{});return result;}
    async recover() {
      if(!this.pending)return;
      const pending=this.pending,{command,body}=pending;
      try {
        const state=await this.request(command,body);
        if(this.pending!==pending)throw new Error('This browser session ended. Retry to reopen the page.');
        this.pending=null;
        if(state.tabId)this.serverState=state;
        return state;
      }catch(error){if(error.definitive){this.pending=null;if(error.reset)this.expire();}throw error;}
    }
    async command(command,body) {
      await this.recover();
      this.pending={command,body:{...body,clientId:this.clientId,operation:++this.operation}};
      return this.recover();
    }
    expire() {
      ++this.sequence;this.cancelTraversal();
      this.clientId=window.crypto.randomUUID();this.tabId=window.crypto.randomUUID();this.operation=0;
      this.pending=null;this.serverState=null;this.expired=true;
    }
    retry() {
      if(!this.pending)return this.open(this.state?.url||this.lastRequestedUrl);
      return this.enqueue(async()=>{const state=await this.recover();if(state?.entry)this.activate(state);});
    }
    async open(url) {
      this.lastRequestedUrl=url;
      const sequence=++this.sequence;
      return this.enqueue(async()=>{
        if(sequence!==this.sequence)return;
        await this.recover();
        const identity=this.serverState?{tabId:this.serverState.tabId,epoch:this.serverState.epoch+1}:{tabId:this.tabId,epoch:1};
        const opener=this.openerIndex();
        const state=await this.command('open',{url,...identity,...(Number.isInteger(opener) && opener>=0?{opener}:{})});this.serverState=state;
        if(sequence===this.sequence)this.activate(state,{fresh:true});
      });
    }
    cancelTraversal() {
      if(this.traversal){clearTimeout(this.traversal.timer);this.traversal.reject(new Error('The page changed during navigation.'));this.traversal=null;}
    }
    attach() {
      this.cancelTraversal();
      if(!this.state || this.expired)return;
      this.nonce=window.crypto.randomUUID();this.documentId=null;this.historySequence=-1;
      this.send({action:'attach'});
    }
    send(message) {
      this.frame.contentWindow.postMessage?.({type:'vibetop-browser-control',tabId:this.state.tabId,epoch:this.state.epoch,nonce:this.nonce,...message},this.state.origin);
    }
    traverse(targetEntryId) {
      const history=this.state?.history;
      if(this.expired || !history || history.documentId!==this.documentId)return Promise.reject(new Error('This page is no longer available.'));
      this.cancelTraversal();
      return new Promise((resolve,reject)=>{
        const requestId=window.crypto.randomUUID();
        const timer=setTimeout(()=>{if(this.traversal?.requestId===requestId){this.traversal=null;reject(new Error('The page did not respond. Try again.'));}},5000);
        this.traversal={requestId,timer,resolve,reject};
        this.send({action:'traverse',requestId,documentId:history.documentId,basisEntryId:history.entries[history.index].id,targetEntryId});
      });
    }
    // Toolbar navigations (address bar, reload, history to another document) get
    // a fresh frame, as a browser gives browser-initiated navigations a new
    // browsing context. Otherwise the old page stays alive until the new one
    // commits and can cancel it: claude.ai reloads itself when the navigation
    // aborts its chunk loads. Removing the frame also drops its entries from
    // the host page's joint session history.
    freshFrame() {
      const old=this.frame;
      if(!old?.parentNode || !old.ownerDocument || !(this.lastEntry||old.getAttribute('src')))return;
      const fresh=old.ownerDocument.createElement('iframe');
      for(const {name,value} of [...old.attributes])if(name!=='src' && name!=='name')fresh.setAttribute(name,value);
      // WebKit fires the empty frame's about:blank load during insertion; listen
      // only after the swap, or attach() would post to the detached old frame.
      old.removeEventListener('load',this.loadListener);old.replaceWith(fresh);
      this.frame=fresh;fresh.addEventListener('load',this.loadListener);this.lastEntry=null;this.onFrame(fresh);
    }
    activate(state,{fresh=false}={}) {
      this.cancelTraversal();
      if(!state || !Number.isSafeInteger(state.epoch) || typeof state.tabId!=='string'
        || new URL(state.entry).origin!==state.origin)throw new Error('Invalid browser response');
      this.state=state;this.serverState=state;this.expired=false;this.nonce=null;this.documentId=null;this.historySequence=-1;this.readyBeforeLoad=false;this.onState({...state,loading:true});
      if(fresh)this.freshFrame();
      // Cross-origin Location.replace is a native allowed operation. Preserve
      // WindowProxy identity without filling browser history with one-use entry
      // tickets whenever the toolbar changes address or follows a redirect.
      if((this.lastEntry||this.frame.getAttribute('src'))!==state.entry) {
        // WebKit's initial about:blank Location.replace omits the Referer.
        // Set src for that first load, then use native replacement thereafter.
        if(this.lastEntry||this.frame.getAttribute('src'))this.frame.contentWindow.location.replace(state.entry);
        else this.frame.src=state.entry;
        this.lastEntry=state.entry;
      }
    }
    async message(event) {
      const state=this.state,data=event.data;
      if(this.expired||!state||event.source!==this.frame.contentWindow||!data||typeof data!=='object')return;
      // A navigation challenge is answered on the destination's realm (one
      // round trip less); every other message must come from the tab's own.
      if(event.origin!==state.origin && !(data.type==='vibetop-browser-navigation' && siblingRealm(event.origin,state.origin)))return;
      if(data.type==='vibetop-browser-navigation') {
        if(this.approving||data.tabId!==state.tabId||data.epoch!==state.epoch||typeof data.challenge!=='string')return;
        const sequence=this.sequence;this.approving=true;
        try {
          await this.enqueue(async()=>{
            const recovered=await this.recover();
            if(recovered?.entry && sequence===this.sequence)this.activate(recovered);
            if(sequence!==this.sequence || this.serverState?.tabId!==state.tabId || this.serverState?.epoch!==state.epoch)return;
            const next=await this.command('approve',{challenge:data.challenge,tabId:state.tabId,epoch:state.epoch});this.serverState=next;
            if(sequence===this.sequence)this.activate(next);
          });
        }catch(error){if(sequence===this.sequence && this.state?.tabId===state.tabId && this.state?.epoch===state.epoch)this.onError(error);}
        finally{this.approving=false;}
      } else if(data.type==='vibetop-browser' && data.action==='ready') {
        if(data.tabId===state.tabId && data.epoch===state.epoch){this.readyBeforeLoad=true;this.attach();}
      } else if(data.type==='vibetop-browser' && data.action==='state') {
        try {
          if(data.tabId!==state.tabId || data.epoch!==state.epoch || !this.nonce || data.nonce!==this.nonce)return;
          const url=new URL(data.url),history=data.history;
          if(!['http:','https:'].includes(url.protocol)||url.origin!==new URL(state.url).origin)return;
          if(!history || typeof history.documentId!=='string' || history.documentId.length>128
            || (this.documentId && history.documentId!==this.documentId)
            || !Number.isSafeInteger(history.sequence) || history.sequence<this.historySequence
            || !Array.isArray(history.entries) || !history.entries.length || history.entries.length>50
            || !Number.isSafeInteger(history.index) || history.index<0 || history.index>=history.entries.length)return;
          const ids=new Set();
          for(const entry of history.entries) {
            if(typeof entry.id!=='string' || entry.id.length>128 || ids.has(entry.id) || typeof entry.url!=='string' || entry.url.length>16384 || new URL(entry.url).origin!==url.origin)return;
            ids.add(entry.id);
          }
          if(history.entries[history.index].url!==url.href)return;
          this.documentId=history.documentId;this.historySequence=history.sequence;
          this.state={...state,url:url.href,title:String(data.title||'').slice(0,1024),history,historyKind:data.historyKind,blocked:data.blocked===true,failed:data.failed===true,failure:['local','port'].includes(data.failure)?data.failure:''};
          this.onState({...this.state,loading:false});
        }catch{}
      } else if(data.type==='vibetop-browser' && data.action==='navigating') {
        // The page is leaving for another document: show progress now.
        if(data.tabId===state.tabId && data.epoch===state.epoch && this.nonce && data.nonce===this.nonce && this.state && !this.state.loading)
          this.onState({...this.state,loading:true});
      } else if(data.type==='vibetop-browser' && data.action==='traversed') {
        if(data.tabId===state.tabId && data.epoch===state.epoch && this.nonce && data.nonce===this.nonce
          && data.documentId===this.documentId && this.traversal?.requestId===data.requestId) {
          const pending=this.traversal;this.traversal=null;clearTimeout(pending.timer);
          if(data.failed)pending.reject(new Error('The page could not go back or forward. Try again.'));else pending.resolve();
        }
      } else if(data.type==='vibetop-browser' && data.action==='history') {
        if(data.tabId===state.tabId && data.epoch===state.epoch && this.nonce && data.nonce===this.nonce
          && data.documentId===this.documentId && Number.isInteger(data.delta))this.onHistory(data.delta);
      } else if(data.type==='vibetop-browser' && data.action==='open' && typeof data.url==='string') {
        // A popup: {name,features} claims the UI's spare frame; {index} navigates
        // a popup this page already holds (no new gesture needed).
        let popup=null;
        if(data.popup && typeof data.popup==='object') {
          if(Number.isInteger(data.popup.index) && data.popup.index>=0)popup={index:data.popup.index};
          else popup={name:String(data.popup.name||'').slice(0,64),features:String(data.popup.features||'').slice(0,256)};
        }
        if(!(popup && popup.index!==undefined) && !this.allowPopup())return;
        try{if(this.onOpen)this.onOpen(data.url,popup);else await this.open(data.url);}catch(error){this.onError(error);}
      } else if(data.type==='vibetop-browser' && data.action==='close') {
        if(data.tabId!==state.tabId || data.epoch!==state.epoch)return;
        const index=data.popup && typeof data.popup==='object' && Number.isInteger(data.popup.index) && data.popup.index>=0?data.popup.index:undefined;
        try{this.onClose(index);}catch(error){this.onError(error);}
      }
    }
    dispose() {
      ++this.sequence;this.cancelTraversal();window.removeEventListener('message',this.listener);this.frame.removeEventListener?.('load',this.loadListener);this.frame.remove();
      return this.enqueue(async()=>{await this.recover();return this.serverState?this.command('close',{tabId:this.serverState.tabId,epoch:this.serverState.epoch}):undefined;});
    }
  }
  window.BrowserProxyController=BrowserProxyController;
})();
