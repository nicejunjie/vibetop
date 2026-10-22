(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.vibetopCreateMessageGate=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // A page reads event.origin synchronously, but mapping a realm host back to
  // the site's origin needs the server. A synchronous request per new sender
  // held Yahoo Finance's thread for 6.8 s (19 lookups), and on iPhone the whole
  // Vibetop UI froze with it. Instead hold a message from a sender whose origin
  // is not known yet, look it up asynchronously, then deliver it. Messages
  // behind a held one wait too, so delivery order never changes.
  return function createMessageGate({origins,lookUp,deliver,report}) {
    const held=[],pending=new Set();let delivering=false;
    function drain() {
      while(held.length && !pending.has(held[0].physical)) {
        const message=held.shift();
        delivering=true;
        // A throwing listener must not stop the rest, as in native dispatch.
        try{deliver(message);}catch(error){report(error);}
        finally{delivering=false;}
      }
    }
    function resolve(physical) {
      if(pending.has(physical))return;
      pending.add(physical);
      let settled=false;
      const done=origin=>{
        if(settled)return;settled=true;
        if(typeof origin==='string')origins.set(physical,origin);
        pending.delete(physical);drain();
      };
      try{lookUp(physical,done);}catch{done();}
    }
    // True when the message was held and will be delivered later.
    return function hold(physical,message) {
      if(delivering)return false;
      const known=physical==='null' || origins.has(physical);
      if(known && !held.length)return false;
      held.push({...message,physical});
      if(known)drain();else resolve(physical);
      return true;
    };
  };
});
