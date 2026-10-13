(function () {
  'use strict';
  const frame=document.getElementById('browser'),cover=document.getElementById('cover'),message=document.getElementById('message'),retry=document.getElementById('retry');
  // Name the browsing context before insertion. Changing only an already-live
  // iframe's name attribute can make form.target open a new top-level window.
  frame.remove();frame.name='browser-lite-'+crypto.randomUUID();document.body.prepend(frame);
  let uiOrigin=null,loading=false,readyTimer;
  async function handoff() {
    const response=await fetch('/api/browser-lite/bootstrap',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Browser Lite could not connect. Retry shortly.');
    const action=new URL(data.action);
    if(action.protocol!=='https:'||action.origin!==data.origin||action.pathname!=='/__vt/bootstrap'||action.search||action.hash||action.username||action.password||! /^[A-Za-z0-9_-]{43}$/.test(data.ticket))throw new Error('Invalid Browser Lite sign-in response.');
    if(uiOrigin&&uiOrigin!==data.origin)throw new Error('Browser Lite configuration changed. Reopen the app.');
    uiOrigin=data.origin;return data;
  }
  function failed(error){message.textContent=error.message;retry.hidden=false;cover.hidden=false;}
  async function connect() {
    if(loading)return;loading=true;retry.hidden=true;message.textContent='Connecting…';
    try {
      const data=await handoff(),form=document.createElement('form'),ticket=document.createElement('input');
      form.method='POST';form.action=data.action;form.target=frame.name;form.hidden=true;ticket.name='ticket';ticket.value=data.ticket;form.append(ticket);document.body.append(form);form.submit();form.remove();
      clearTimeout(readyTimer);readyTimer=setTimeout(()=>failed(new Error('Browser Lite is taking longer than expected. Retry to reconnect.')),45000);
    } catch(error){failed(error);}finally{loading=false;}
  }
  window.addEventListener('message',async event=>{
    if(event.source!==frame.contentWindow||event.origin!==uiOrigin||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='vibetop-browser-ui-ready'){
      clearTimeout(readyTimer);cover.hidden=true;frame.contentWindow.postMessage({type:'vibetop-browser-host'},uiOrigin);
    } else if(event.data.type==='vibetop-browser-renew'&&typeof event.data.id==='string'&&event.data.id.length<=64){
      const id=event.data.id;
      try{const data=await handoff();frame.contentWindow.postMessage({type:'vibetop-browser-handoff',id,ticket:data.ticket},uiOrigin);}
      catch(error){frame.contentWindow.postMessage({type:'vibetop-browser-handoff',id,error:error.message},uiOrigin);}
    }
  });
  retry.onclick=connect;connect();
})();
