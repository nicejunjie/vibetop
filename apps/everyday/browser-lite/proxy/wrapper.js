(function () {
  'use strict';
  const $=id=>document.getElementById(id),tabs=new Map();let active=null,popupUsed=false;
  const parents=JSON.parse(document.querySelector('meta[name="vt-main-origins"]')?.content||'[]');
  const session=window.BrowserUISession?new BrowserUISession({parents}):null;
  setInterval(()=>{if(!navigator.userActivation?.isActive)popupUsed=false;},200);
  function status(text,error=false){$('status').textContent=text;$('status').parentElement.classList.toggle('error',error);$('retry').hidden=!error;}
  // Address-bar opens carry "loginSync": the manager then attaches this site's
  // logins from the full Browser (never Google's). One-shot after "I've signed in".
  let loginSync=true,syncOnce=false;
  try{loginSync=localStorage.getItem('vt-login-sync')!=='0';}catch{}
  async function request(command,body,renewed=false) {
    if(command==='open' && (loginSync||syncOnce)){body={...body,loginSync:true};syncOnce=false;}
    const response=await fetch('/api/'+command,{method:'POST',credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(response.status===401){
      if(session&&!renewed){try{await session.renew();return request(command,body,true);}catch(error){error.authentication=true;throw error;}}
      const error=new Error('Your session has ended. Reopen Browser Lite to sign in again.');error.authentication=true;throw error;
    }
    if(!response.ok){
      const data=await response.json().catch(()=>null),error=new Error('The page could not be opened. Check your connection and retry.');
      if(response.status===409 && data?.protocol==='vibetop-browser-control-v1' && data.clientId===body.clientId && data.operation===body.operation){error.message=data.message;error.definitive=true;error.reset=data.reset;}
      throw error;
    }
    return response.json();
  }
  function address(value) {
    value=value.trim();if(!value)throw new Error('Enter a website or search.');
    if(!/^[a-z][a-z\d+.-]*:/i.test(value))value=/\s/.test(value)||!value.includes('.')?'https://www.google.com/search?q='+encodeURIComponent(value):'https://'+value;
    const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Enter an http or https website address.');
    return url.href;
  }
  // Google refuses sign-in through a rewriting proxy. Offer the real Browser,
  // which keeps its own Google session, instead of a dead end.
  const GOOGLE_SIGN_IN=/^accounts\.(google|youtube)\.com$/;
  function handoff(state,tab=active) {
    let host='';try{host=new URL(state?.url||'').hostname;}catch{}
    const signIn=GOOGLE_SIGN_IN.test(host);
    // Remember the site that sent us to Google, to return there signed in.
    if(tab && host && !signIn && !/(^|\.)google\.com$/.test(host))tab.returnUrl=state.url;
    $('handoff').hidden=!(session&&signIn);
    $('continue-here').hidden=!(signIn && tab?.returnUrl);
  }
  function update(tab,state) {
    if(!state.loading && tab.targetPosition && tab.targetPosition.epoch===undefined)return;
    if(state.loading && tab.targetPosition){
      if(tab.targetPosition.sequence===tab.controller.sequence){tab.targetPosition.epoch=state.epoch;tab.targetPosition.tabId=state.tabId;}else delete tab.targetPosition;
    }
    tab.state=state;tab.select.textContent=state.title||new URL(state.url).hostname;
    if(!state.loading && state.history) {
      const journal=state.history,key=journal.documentId+':'+journal.sequence;
      if(tab.journalKey!==key) {
        let start=tab.history.findIndex(entry=>entry.documentId===journal.documentId);
        const replacement=journal.entries.map(entry=>({...entry,documentId:journal.documentId}));
        if(start<0) {
          const target=tab.targetPosition;
          const replacing=target && target.sequence===tab.controller.sequence && target.epoch===state.epoch && target.tabId===state.tabId;
          start=Math.min(replacing?target.position:tab.position+1,tab.history.length);
          if(!replacing)tab.history.splice(start);
          tab.history.splice(start,replacing?1:0,...replacement);delete tab.targetPosition;
        }else {
          let count=0;while(tab.history[start+count]?.documentId===journal.documentId)count++;
          tab.history.splice(start,count,...replacement);
          if(state.historyKind==='push')tab.history.splice(start+replacement.length);
        }
        tab.position=start+journal.index;tab.journalKey=key;
        tab.controller.send({action:'depth',documentId:journal.documentId,depth:tab.history.length-journal.entries.length});
      }
    }
    clearTimeout(tab.timer);
    if(state.loading)tab.timer=setTimeout(()=>{if(active===tab)status('This page is taking longer than expected. You can keep waiting or retry.',true);},45000);
    if(active!==tab)return;
    tab.frame.hidden=false;
    $('welcome').hidden=true;if(document.activeElement!==$('address'))$('address').value=state.url;
    $('back').disabled=tab.position<=0;$('forward').disabled=tab.position>=tab.history.length-1;
    status(state.loading?'Loading…':new URL(state.url).hostname);handoff(state,tab);
  }
  function activate(tab) {
    active=tab;
    for(const item of tabs.values()){const selected=item===tab;item.frame.hidden=!selected||!item.state;item.element.classList.toggle('active',selected);item.select.setAttribute('aria-selected',String(selected));}
    $('welcome').hidden=!!tab.state;$('address').value=tab.state?.url||'';handoff(tab.state);
    if(tab.state)update(tab,tab.state);else{status('Ready');$('back').disabled=true;$('forward').disabled=true;}
  }
  function newTab(url) {
    const id=crypto.randomUUID(),frame=document.createElement('iframe'),element=document.createElement('div'),select=document.createElement('button'),close=document.createElement('button');
    frame.title='Webpage';frame.setAttribute('referrerpolicy','origin');frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock');
    element.className='tab';select.className='select';select.textContent='New tab';select.setAttribute('role','tab');close.className='close';close.textContent='×';close.setAttribute('aria-label','Close tab');
    element.append(select,close);$('tabs').append(element);$('stage').append(frame);
    const tab={id,frame,element,select,history:[],position:-1,state:null};tabs.set(id,tab);
    tab.controller=new BrowserProxyController({frame,request,onState:state=>update(tab,state),onOpen:url=>newTab(url),onHistory:delta=>history(delta,tab),
      allowPopup:()=>{if(active!==tab||document.activeElement!==frame||!navigator.userActivation?.isActive||popupUsed)return false;popupUsed=true;return true;},
      onError:error=>{if(active===tab)status(error.message,true);}});
    select.onclick=()=>activate(tab);close.onclick=()=>{
      clearTimeout(tab.timer);tabs.delete(id);element.remove();tab.controller.dispose().catch(()=>{});
      if(active===tab){const next=[...tabs.values()].at(-1);if(next)activate(next);else newTab();}
    };
    activate(tab);if(url)go(url);else $('address').focus();return tab;
  }
  async function go(value) {
    const tab=active;tab.historyGeneration=(tab.historyGeneration||0)+1;tab.controller.cancelTraversal();if(tab.targetPosition?.epoch===undefined && tab.targetPosition?.previousPosition!==undefined)tab.position=tab.targetPosition.previousPosition;delete tab.targetPosition;tab.historyQueue=[];
    try{const url=address(value);status('Opening…');await tab.controller.open(url);}
    catch(error){if(active===tab)status(error.message,true);}
  }
  function history(delta,tab=active){
    tab.historyQueue ||= [];tab.historyQueue.push(delta);
    if(tab.historyBusy)return;
    tab.historyBusy=true;const generation=tab.historyGeneration||0;
    (async()=>{
      while(tab.historyQueue.length && tabs.has(tab.id) && generation===(tab.historyGeneration||0)) {
        const step=tab.historyQueue.shift();
        if(step===0){tab.targetPosition={position:tab.position,url:tab.state.url,sequence:tab.controller.sequence+1};await tab.controller.open(tab.state.url);tab.historyQueue=[];break;}
        const index=tab.position+step;if(index<0||index>=tab.history.length)continue;
        const target=tab.history[index];
        if(target.documentId===tab.controller.documentId)await tab.controller.traverse(target.id);
        else {tab.targetPosition={position:index,url:target.url,previousPosition:tab.position,sequence:tab.controller.sequence+1};tab.position=index;await tab.controller.open(target.url);tab.historyQueue=[];break;}
      }
    })().catch(error=>{if(generation!==(tab.historyGeneration||0))return;if(tab.targetPosition?.previousPosition!==undefined)tab.position=tab.targetPosition.previousPosition;if(!tab.controller.pending)delete tab.targetPosition;tab.historyQueue=[];if(active===tab)status(error.message,true);})
      .finally(()=>{tab.historyBusy=false;});
  }
  $('navigate').onsubmit=event=>{event.preventDefault();go($('address').value);};
  $('back').onclick=()=>history(-1);$('forward').onclick=()=>history(1);
  $('reload').onclick=()=>{if(active.state)history(0);};
  $('retry').onclick=()=>{
    const tab=active;tab.historyGeneration=(tab.historyGeneration||0)+1;tab.historyQueue=[];
    if(tab.targetPosition){delete tab.targetPosition.epoch;delete tab.targetPosition.tabId;if(!tab.controller.pending)tab.targetPosition.sequence=tab.controller.sequence+1;}
    status('Retrying…');const retry=tab.targetPosition && !tab.controller.pending?tab.controller.open(tab.targetPosition.url):tab.controller.retry();retry.catch(error=>{if(active===tab)status(error.message,true);});
  };
  $('open-browser').onclick=()=>{
    if(active?.state && session?.openInBrowser(active.state.url))status('Opening in Browser…');
    else status('Reopen Browser Lite from Vibetop, then retry.',true);
  };
  $('continue-here').onclick=()=>{if(active?.returnUrl){syncOnce=true;go(active.returnUrl);}};
  $('login-sync').checked=loginSync;
  $('login-sync').onchange=()=>{loginSync=$('login-sync').checked;try{localStorage.setItem('vt-login-sync',loginSync?'1':'0');}catch{}
    status(loginSync?'Pages you open will use your full Browser logins.':'Browser logins are not shared.');};
  $('new-tab').onclick=()=>newTab();for(const button of document.querySelectorAll('[data-url]'))button.onclick=()=>go(button.dataset.url);
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='l'){event.preventDefault();$('address').focus();$('address').select();}});
  const heartbeat=()=>request('heartbeat',{clients:[...tabs.values()].filter(tab=>tab.controller.serverState).map(tab=>tab.controller.clientId)}).then(result=>{
    for(const tab of tabs.values())if(result.expired?.includes(tab.controller.clientId)){
      tab.controller.expire();if(active===tab)status('This browser session ended. Retry to reopen the page.',true);
    }
  }).catch(error=>{if(error.authentication)status(error.message,true);});
  setInterval(heartbeat,30000);window.addEventListener('pageshow',heartbeat);
  window.addEventListener('pagehide',event=>{if(!event.persisted)for(const tab of tabs.values())tab.controller.dispose().catch(()=>{});});
  newTab(new URL(location.href).searchParams.get('url'));
})();
