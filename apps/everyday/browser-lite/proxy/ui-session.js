(function () {
  'use strict';
  // The parent list comes from root-owned deployment configuration, never from
  // a third-party page or query parameter. Fixtures without it need no handoff.
  class BrowserUISession {
    constructor({parents=[],parent=window.parent,origin=location.origin,fetcher=window.fetch.bind(window)}={}) {
      Object.assign(this,{parents:new Set(parents),parent,origin,fetcher});this.pending=null;this.parentOrigin=null;
      this.listener=event=>this.receive(event);window.addEventListener('message',this.listener);
      for(const allowed of this.parents)this.parent.postMessage({type:'vibetop-browser-ui-ready'},allowed);
    }
    receive(event) {
      if(event.source!==this.parent||!this.parents.has(event.origin)||!event.data||typeof event.data!=='object')return;
      const data=event.data;
      if(data.type==='vibetop-browser-host'){this.parentOrigin=event.origin;return;}
      const pending=this.pending;
      if(!pending||data.type!=='vibetop-browser-handoff'||data.id!==pending.id)return;
      if(typeof data.ticket!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(data.ticket))return pending.reject(new Error(data.error||'Sign in to Vibetop again, then retry.'));
      this.fetcher('/__vt/bootstrap',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:data.ticket}),signal:AbortSignal.timeout(20000)})
        .then(response=>{if(!response.ok)throw new Error('Browser sign-in could not be renewed. Retry.');pending.resolve();},pending.reject)
        .catch(pending.reject);
    }
    renew() {
      if(this.pending)return this.pending.promise;
      if(!this.parentOrigin)return Promise.reject(new Error('Reopen Browser Lite from Vibetop to sign in.'));
      const id=crypto.randomUUID(),pending={id};
      pending.promise=new Promise((resolve,reject)=>{pending.resolve=resolve;pending.reject=reject;});
      this.pending=pending;
      const timeout=setTimeout(()=>pending.reject(new Error('Sign-in renewal timed out. Check your connection and retry.')),25000);
      pending.promise=pending.promise.finally(()=>{clearTimeout(timeout);if(this.pending===pending)this.pending=null;});
      this.parent.postMessage({type:'vibetop-browser-renew',id},this.parentOrigin);
      return pending.promise;
    }
  }
  window.BrowserUISession=BrowserUISession;
})();
