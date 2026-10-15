(function () {
  'use strict';
  const $=id=>document.getElementById(id),tabs=new Map();let active=null,popupUsed=false;
  const parents=JSON.parse(document.querySelector('meta[name="vt-main-origins"]')?.content||'[]');
  const session=window.BrowserUISession?new BrowserUISession({parents}):null;
  // Open tabs survive a reload of this page (a Vibetop update, iOS discarding
  // the tab, a renewed session). Saved per Vibetop user, on this device only.
  const profile=document.querySelector('meta[name="vt-profile"]')?.content||'';
  const SAVE_KEY=profile?'vt-lite-tabs:'+profile:'',MAX_SAVED=30;let restoring=false,saveTimer;
  let closedByUser=false;
  // Back/forward survive too: each entry keeps its address and which document
  // it belonged to (same-document entries stay grouped).
  const MAX_HISTORY=50;
  function savedHistory(tab){
    const source=tab.pendingHistory||{entries:tab.history,position:tab.position};
    const entries=(source.entries||[]).filter(entry=>/^https?:/.test(entry?.url||''));
    if(!entries.length)return {};
    const start=Math.max(0,entries.length-MAX_HISTORY);
    return {history:entries.slice(start).map(entry=>({url:entry.url,documentId:String(entry.documentId||'')})),
      position:Math.min(Math.max(0,(source.position|0)-start),entries.length-start-1)};
  }
  function restoredHistory(item){
    if(!Array.isArray(item?.history))return null;
    const entries=item.history.filter(entry=>typeof entry?.url==='string'&&/^https?:/.test(entry.url)).slice(-MAX_HISTORY)
      .map((entry,index)=>({id:'restored-'+index,url:entry.url,documentId:'restored:'+String(entry.documentId||index).replace(/^(restored:)+/,'')}));
    if(!entries.length)return null;
    return {entries,position:Math.min(Math.max(0,item.position|0),entries.length-1)};
  }
  // Also kept by the server (per user): iOS can discard this page and hand
  // back empty frame storage, and the copy then follows the user to any device.
  let serverTimer;
  // A device can opt out of the shared copy (automated test browsers signed in
  // as a real user must never overwrite that user's tabs).
  const LOCAL_ONLY=(()=>{try{return localStorage.getItem('vt-lite-tabs-local-only')==='1';}catch{return false;}})();
  function saveToServer(payload,now=false){
    if(LOCAL_ONLY)return;
    clearTimeout(serverTimer);
    const send=()=>request('tabs',{save:payload}).catch(()=>{});
    if(now)send();else serverTimer=setTimeout(send,1500);
  }
  function saveTabs(now=false){
    if(!SAVE_KEY||restoring)return;clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      const saved=[...tabs.values()].map(tab=>({tab,url:tab.state?.url||tab.pendingUrl||'',title:tab.state?.title||tab.pendingTitle||'',...savedHistory(tab)}))
        .filter(item=>/^https?:/.test(item.url)).slice(-MAX_SAVED);
      const payload={tabs:saved.map(({url,title,history,position})=>({url,title,history,position})),active:Math.max(0,saved.findIndex(item=>item.tab===active))};
      try{localStorage.setItem(SAVE_KEY,JSON.stringify(payload));}catch{}
      // A fresh, empty start never overwrites the saved tabs; closing them does.
      if(saved.length||closedByUser)saveToServer(payload,now);
    },now?0:300);
  }
  setInterval(()=>{if(!navigator.userActivation?.isActive)popupUsed=false;},200);
  // No status bar: progress states show as a thin line under the toolbar, the
  // page address is already in the address bar, and anything else is a banner
  // (errors stay with Retry; other messages fade after a few seconds).
  const PROGRESS=new Set(['Loading…','Opening…','Retrying…']);let noticeTimer;
  function status(text,error=false){
    document.body.classList.toggle('loading',PROGRESS.has(text));clearTimeout(noticeTimer);
    const quiet=!error&&(PROGRESS.has(text)||text==='Ready'||!!active?.state&&text===new URL(active.state.url).hostname);
    $('notice').hidden=quiet;$('notice').classList.toggle('error',error);$('retry').hidden=!error;
    if(!quiet){$('status').textContent=text;if(!error)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},4000);}
  }
  // Address-bar opens carry "loginSync": the manager then attaches this site's
  // logins from the full Browser (never Google's).
  async function request(command,body,renewed=false) {
    if(command==='open')body={...body,loginSync:true};
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
    const blocked=!signIn && state?.blocked===true && !state.loading;
    $('handoff').hidden=!(session&&(signIn||blocked));
    $('handoff-text').textContent=signIn?"Google doesn't allow signing in through Browser Lite. Sign in with the full Browser, then come back."
      :"This site's bot check doesn't accept Browser Lite. Open it in the full Browser instead.";
    $('continue-here').hidden=!(signIn && tab?.returnUrl);
  }
  function update(tab,state) {
    if(!state.loading && tab.targetPosition && tab.targetPosition.epoch===undefined)return;
    if(state.loading && tab.targetPosition){
      if(tab.targetPosition.sequence===tab.controller.sequence){tab.targetPosition.epoch=state.epoch;tab.targetPosition.tabId=state.tabId;}else delete tab.targetPosition;
    }
    tab.state=state;tab.select.textContent=state.title||new URL(state.url).hostname;
    if(!state.loading)saveTabs();
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
    active=tab;saveTabs();
    for(const item of tabs.values()){const selected=item===tab;item.frame.hidden=!selected||!item.state;item.element.classList.toggle('active',selected);item.select.setAttribute('aria-selected',String(selected));}
    $('welcome').hidden=!!tab.state;$('address').value=tab.state?.url||'';handoff(tab.state);
    if(tab.state)update(tab,tab.state);else{status('Ready');$('back').disabled=true;$('forward').disabled=true;}
    // A restored tab loads only when first shown, not all at once on restore.
    if(tab.pendingUrl){
      const url=tab.pendingUrl;delete tab.pendingUrl;$('address').value=url;
      if(tab.pendingHistory){tab.history=tab.pendingHistory.entries;tab.position=tab.pendingHistory.position;delete tab.pendingHistory;}
      if(tab.history[tab.position]?.url===url)openInPlace(tab,url);else go(url);
    }
  }
  function newTab(url,{lazy=false,title='',history:savedHistory=null}={}) {
    const id=crypto.randomUUID(),frame=document.createElement('iframe'),element=document.createElement('div'),select=document.createElement('button'),close=document.createElement('button');
    frame.title='Webpage';frame.setAttribute('referrerpolicy','origin');frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock');
    element.className='tab';select.className='select';select.textContent='New tab';select.setAttribute('role','tab');close.className='close';close.textContent='×';close.setAttribute('aria-label','Close tab');
    element.append(select,close);$('tabs').append(element);$('stage').append(frame);
    const tab={id,frame,element,select,history:[],position:-1,state:null};tabs.set(id,tab);
    tab.controller=new BrowserProxyController({frame,request,onFrame:fresh=>{const focused=document.activeElement===tab.frame;tab.frame=fresh;if(focused)fresh.focus();},onState:state=>update(tab,state),onOpen:url=>newTab(url),onHistory:delta=>history(delta,tab),
      allowPopup:()=>{if(active!==tab||document.activeElement!==tab.frame||!navigator.userActivation?.isActive||popupUsed)return false;popupUsed=true;return true;},
      onError:error=>{if(error.reset&&tab.state?.url){reopen(tab);return;}if(active===tab)status(error.message,true);}});
    select.onclick=()=>activate(tab);close.onclick=()=>{
      clearTimeout(tab.timer);tabs.delete(id);element.remove();tab.controller.dispose().catch(()=>{});closedByUser=true;
      if(active===tab){const next=[...tabs.values()].at(-1);if(next)activate(next);else newTab();}
      saveTabs();
    };
    if(lazy){tab.pendingUrl=url;tab.pendingTitle=title;if(savedHistory)tab.pendingHistory=savedHistory;try{select.textContent=title||new URL(url).hostname;}catch{}return tab;}
    activate(tab);if(url)go(url);else $('address').focus();return tab;
  }
  // The server forgot this tab (it sat in the background for a day, or the
  // proxy restarted). Like a browser reloading a discarded tab: reload its page
  // now if it is showing, else when it is next shown. No error to dismiss.
  function reopen(tab) {
    const url=tab.state?.url;if(!url)return;
    tab.controller.expire();
    if(active!==tab){tab.pendingUrl=url;return;}
    if(tab.history[tab.position]?.url===url)openInPlace(tab,url);else go(url);
  }
  // Load a page into its existing history slot (a restored or reloaded tab),
  // the way Back/Forward opens another document, so the entry is replaced,
  // not duplicated, and the entries around it stay reachable.
  function openInPlace(tab,url,retried=false){
    tab.historyGeneration=(tab.historyGeneration||0)+1;tab.controller.cancelTraversal();tab.historyQueue=[];
    tab.targetPosition={position:tab.position,url,previousPosition:tab.position,sequence:tab.controller.sequence+1};
    status('Opening…');
    tab.controller.open(url).catch(error=>{
      if(error.reset&&!retried){tab.controller.expire();openInPlace(tab,url,true);return;}
      if(active===tab)status(error.message,true);
    });
  }
  async function go(value,retried=false) {
    const tab=active;tab.historyGeneration=(tab.historyGeneration||0)+1;tab.controller.cancelTraversal();if(tab.targetPosition?.epoch===undefined && tab.targetPosition?.previousPosition!==undefined)tab.position=tab.targetPosition.previousPosition;delete tab.targetPosition;tab.historyQueue=[];
    try{const url=address(value);status('Opening…');await tab.controller.open(url);}
    catch(error){
      if(error.reset&&!retried&&active===tab){tab.controller.expire();return go(value,true);}
      if(active===tab)status(error.message,true);
    }
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
  // Leave the address bar like a browser does, so it shows where the page goes
  // (it is not updated while focused) and the phone keyboard closes.
  $('navigate').onsubmit=event=>{event.preventDefault();$('address').blur();go($('address').value);};
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
  $('continue-here').onclick=()=>{if(active?.returnUrl)go(active.returnUrl);};
  $('dismiss').onclick=()=>{$('notice').hidden=true;};
  $('new-tab').onclick=()=>newTab();for(const button of document.querySelectorAll('[data-url]'))button.onclick=()=>go(button.dataset.url);
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='l'){event.preventDefault();$('address').focus();$('address').select();}});
  const heartbeat=()=>request('heartbeat',{clients:[...tabs.values()].filter(tab=>tab.controller.serverState).map(tab=>tab.controller.clientId)}).then(result=>{
    for(const tab of tabs.values())if(result.expired?.includes(tab.controller.clientId))reopen(tab);
  }).catch(error=>{if(error.authentication)status(error.message,true);});
  setInterval(heartbeat,30000);window.addEventListener('pageshow',heartbeat);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')heartbeat();});
  window.addEventListener('pagehide',event=>{if(!event.persisted)for(const tab of tabs.values())tab.controller.dispose().catch(()=>{});});
  function restoreFrom(saved,requested){
    restoring=true;
    const restored=saved.tabs.filter(item=>typeof item?.url==='string'&&/^https?:/.test(item.url)).slice(-MAX_SAVED)
      .map(item=>newTab(item.url,{lazy:true,title:typeof item.title==='string'?item.title.slice(0,200):'',history:restoredHistory(item)}));
    restoring=false;
    if(requested||!restored.length)newTab(requested);else activate(restored[Math.min(Math.max(0,saved.active|0),restored.length-1)]);
  }
  // Save at once when the page is hidden: that is when iOS discards it.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveTabs(true);});
  window.addEventListener('pagehide',()=>saveTabs(true));
  const requested=new URL(location.href).searchParams.get('url');
  let device='none',local=null;
  try{const raw=SAVE_KEY?localStorage.getItem(SAVE_KEY):null;if(raw){device='empty';local=JSON.parse(raw);if(local?.tabs?.length)device='ok';}}catch{device='error';}
  if(device==='ok'){
    restoreFrom(local,requested);
    request('tabs',{report:{source:'device',device,count:local.tabs.length}}).catch(()=>{});
  }else if(SAVE_KEY&&!LOCAL_ONLY){
    status('Opening…');
    request('tabs',{report:{source:'server',device,count:0}}).then(result=>result?.tabs?.tabs?.length?result.tabs:null,()=>null).then(saved=>{
      if(tabs.size)return;
      if(saved)restoreFrom(saved,requested);else newTab(requested);
    });
  }else newTab(requested);
})();
