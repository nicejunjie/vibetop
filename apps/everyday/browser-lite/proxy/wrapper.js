(function () {
  'use strict';
  const $=id=>document.getElementById(id),tabs=new Map();let active=null,popupUsed=0;
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
  // A keepalive fetch (the only kind that survives pagehide) may carry at most
  // 64 KB. Over this budget, keep each tab's current entry, shorten history,
  // then drop the oldest tabs, as the server's tab store does.
  const SAVE_BYTES=48*1024;
  function tabBudget(payload,limit=SAVE_BYTES){
    const size=()=>new TextEncoder().encode(JSON.stringify(payload)).length;
    for(const keep of [20,5,0]){
      if(size()<=limit)break;
      for(const tab of payload.tabs)if(tab.history){
        const start=Math.max(0,Math.min((tab.position|0)-Math.floor(keep/2),tab.history.length-keep));
        tab.history=keep?tab.history.slice(start,start+keep):undefined;
        if(tab.history)tab.position-=start;else delete tab.position;
      }
    }
    while(size()>limit&&payload.tabs.length>1){payload.tabs.shift();payload.active=Math.max(0,payload.active-1);}
    return payload;
  }
  function saveToServer(payload,now=false){
    if(LOCAL_ONLY)return;
    payload=tabBudget(payload);
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
  // A page may open a few windows per user gesture (sign-in flows open one,
  // then navigate or replace it); floods are still refused.
  setInterval(()=>{if(!navigator.userActivation?.isActive)popupUsed=0;},200);
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
  // The user's own Google session is carried in from the full Browser, so
  // Gmail, Drive and other Google services load already signed in -- no dead
  // end, no banner. This banner is only a fallback for an INTERACTIVE Google
  // sign-in (password / re-auth), which Google still refuses through a
  // rewriting proxy ("browser may not be secure"); the full Browser can
  // complete it, and this tab then continues on its own.
  const GOOGLE_SIGN_IN=/^accounts\.(google|youtube)\.com$/;
  function handoff(state,tab=active) {
    let host='';try{host=new URL(state?.url||'').hostname;}catch{}
    const signIn=GOOGLE_SIGN_IN.test(host);
    // Remember the site that sent us to Google, to return there signed in.
    if(tab && host && !signIn && !/(^|\.)google\.com$/.test(host))tab.returnUrl=state.url;
    const blocked=!signIn && state?.blocked===true && !state.loading;
    $('handoff').hidden=!(session&&(signIn||blocked));
    $('handoff-text').textContent=signIn?"If Google won't sign in here, sign in with the full Browser; this tab continues on its own once you have."
      :"This site's bot check doesn't accept Browser Lite. Open it in the full Browser instead.";
    $('continue-here').hidden=!(signIn && tab?.returnUrl);
    if(signIn && tab?.returnUrl)watchHandoff(tab);else if(tab)stopHandoffWatch(tab);
  }
  // After a Google sign-in was handed to the full Browser, the site's own
  // session appears in the Browser's cookies. Poll a fingerprint of them (the
  // manager never sends the cookies themselves) and return to the site with
  // its logins when it changes, so no "I've signed in" tap is needed. Bounded:
  // every 4 s for 15 minutes, only while the bar is up.
  function watchHandoff(tab) {
    if(tab.handoffWatch || LOCAL_ONLY)return;
    const url=tab.returnUrl,watch={url,baseline:undefined,until:Date.now()+15*60*1000};tab.handoffWatch=watch;
    const poll=async()=>{
      if(tab.handoffWatch!==watch || !tabs.has(tab.id))return;
      if(Date.now()>watch.until){stopHandoffWatch(tab);return;}
      try {
        const {digest}=await request('logins-check',{url});
        if(tab.handoffWatch!==watch)return;
        if(watch.baseline===undefined)watch.baseline=digest||'';
        else if((digest||'')!==watch.baseline && digest){stopHandoffWatch(tab);if(active===tab)go(url);else{tab.pendingUrl=url;}return;}
      } catch {}
      watch.timer=setTimeout(poll,4000);
    };
    poll();
  }
  function stopHandoffWatch(tab){if(tab.handoffWatch){clearTimeout(tab.handoffWatch.timer);delete tab.handoffWatch;}}
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
    if(state.failed)status("This page couldn't be loaded. Check the address or retry.",true);
    else status(state.loading?'Loading…':new URL(state.url).hostname);
    handoff(state,tab);
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
  // Popups. A page's window.open() must return a real window at once, so this
  // page always holds a spare, UI-owned blank iframe. The opener takes its
  // WindowProxy (the last of this page's frames: browsers index a parent's
  // frames in creation order, not DOM order) and asks for it to become a tab.
  // So the spare is re-created after every other iframe this page creates,
  // and frameOrder mirrors the browser's numbering. The popup is told its
  // opener's number with each open command (it reaches its page config).
  let spare=null;const frameOrder=[];
  function pageFrame(){const frame=document.createElement('iframe');frame.title='Webpage';frame.setAttribute('referrerpolicy','origin');frame.setAttribute('allow','fullscreen *');frame.setAttribute('allowfullscreen','');frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock');return frame;}
  function attachFrame(frame){$('stage').append(frame);frameOrder.push(frame);}
  function detachFrame(frame){const at=frameOrder.indexOf(frame);if(at>=0)frameOrder.splice(at,1);}
  function ensureSpare(){if(spare){detachFrame(spare);spare.remove();}spare=pageFrame();spare.hidden=true;attachFrame(spare);}
  const frameIndex=frame=>frameOrder.indexOf(frame);
  const openerIndex=tab=>{const index=tab.opener&&tabs.has(tab.opener.id)?frameIndex(tab.opener.frame):-1;return index>=0?index:undefined;};
  const tabAtFrame=index=>[...tabs.values()].find(tab=>frameIndex(tab.frame)===index);
  function openIn(tab,url){if(!tabs.has(tab.id))return;activate(tab);if(url)go(url);}
  function openPopup(opener,url,popup){
    if(popup.index!==undefined){const target=tabAtFrame(popup.index);if(target&&target.opener===opener)openIn(target,url);return;}
    if(!spare)ensureSpare();const frame=spare;spare=null;
    newTab(url,{frame,opener});ensureSpare();
  }
  function closeTab(tab){
    if(!tabs.has(tab.id))return;
    clearTimeout(tab.timer);tabs.delete(tab.id);tab.element.remove();detachFrame(tab.frame);tab.controller.dispose().catch(()=>{});closedByUser=true;
    if(active===tab){const next=tab.opener&&tabs.has(tab.opener.id)?tab.opener:[...tabs.values()].at(-1);if(next)activate(next);else newTab();}
    saveTabs();
  }
  // Tabs reorder by dragging. A mouse drags as soon as it moves sideways; a
  // finger first holds the tab, so a swipe still scrolls the tab strip. The new
  // order is the saved order (device and server), like a browser's.
  function syncTabOrder(){
    const order=[...$('tabs').children],sorted=[...tabs.values()].sort((a,b)=>order.indexOf(a.element)-order.indexOf(b.element));
    tabs.clear();for(const item of sorted)tabs.set(item.id,item);saveTabs();
  }
  function dragTab(tab){
    const element=tab.element;let start=null,dragging=false,hold=0,pointer=null,scroller=0;
    const strip=()=>$('tabs');
    function begin(){
      dragging=true;clearTimeout(hold);element.classList.add('dragging');
      try{element.setPointerCapture(pointer);}catch{}
    }
    function place(x){
      const others=[...strip().children].filter(item=>item!==element);
      const before=others.find(item=>{const box=item.getBoundingClientRect();return x<box.left+box.width/2;});
      if(before){if(element.nextElementSibling!==before)strip().insertBefore(element,before);}
      else if(strip().lastElementChild!==element)strip().append(element);
      // Near an edge, scroll the strip so off-screen tabs can be reached.
      const box=strip().getBoundingClientRect();clearInterval(scroller);
      const step=x<box.left+28?-12:x>box.right-28?12:0;
      if(step)scroller=setInterval(()=>{strip().scrollLeft+=step;},16);
    }
    function finish(){
      clearTimeout(hold);clearInterval(scroller);
      if(dragging){
        element.classList.remove('dragging');
        // The click that ends a mouse drag must not count as a tab click.
        const swallow=event=>{event.stopPropagation();event.preventDefault();};
        element.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>element.removeEventListener('click',swallow,true),0);
        syncTabOrder();
      }
      start=null;dragging=false;pointer=null;listen(false);
    }
    // Follow the pointer on the whole window once pressed: a fast mouse leaves
    // the tab before it has moved far enough to start a drag.
    const listen=on=>{for(const [name,handler] of [['pointermove',move],['pointerup',up],['pointercancel',up]])(on?window.addEventListener:window.removeEventListener).call(window,name,handler,true);};
    element.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('.close')||tabs.size<2)return;
      start={x:event.clientX,y:event.clientY};pointer=event.pointerId;listen(true);
      if(event.pointerType!=='mouse')hold=setTimeout(()=>{if(start){begin();navigator.vibrate?.(10);}},350);
    });
    function up(event){if(event.pointerId===pointer)finish();}
    function move(event){
      if(!start||event.pointerId!==pointer)return;
      if(!dragging){
        const moved=Math.abs(event.clientX-start.x),drift=Math.abs(event.clientY-start.y);
        // A finger that moves before the hold is a scroll, not a drag.
        if(event.pointerType!=='mouse'){if(moved>8||drift>8){clearTimeout(hold);start=null;pointer=null;listen(false);}return;}
        if(moved<6)return;begin();
      }
      event.preventDefault();place(event.clientX);
    }
    // Once a held tab is moving, the strip must not scroll under the finger.
    element.addEventListener('touchmove',event=>{if(dragging)event.preventDefault();},{passive:false});
    element.addEventListener('contextmenu',event=>{if(dragging||start)event.preventDefault();});
  }
  function newTab(url,{lazy=false,title='',history:savedHistory=null,frame=null,opener=null}={}) {
    const id=crypto.randomUUID(),element=document.createElement('div'),select=document.createElement('button'),close=document.createElement('button');
    frame=frame||pageFrame();
    element.className='tab';select.className='select';select.textContent='New tab';select.setAttribute('role','tab');close.className='close';close.textContent='×';close.setAttribute('aria-label','Close tab');
    element.append(select,close);$('tabs').append(element);
    if(!frame.isConnected){attachFrame(frame);ensureSpare();}
    const tab={id,frame,element,select,history:[],position:-1,state:null,opener};tabs.set(id,tab);
    tab.controller=new BrowserProxyController({frame,request,onFrame:fresh=>{const focused=document.activeElement===tab.frame;detachFrame(tab.frame);tab.frame=fresh;frameOrder.push(fresh);ensureSpare();if(focused)fresh.focus();},onState:state=>update(tab,state),openerIndex:()=>openerIndex(tab),
      onOpen:(target,popup)=>{if(popup)openPopup(tab,target,popup);else newTab(target);},onHistory:delta=>history(delta,tab),
      allowPopup:()=>{if(active!==tab||document.activeElement!==tab.frame||!navigator.userActivation?.isActive||popupUsed>=3)return false;popupUsed++;return true;},
      onClose:index=>{if(index===undefined){if(tab.opener)closeTab(tab);return;}const target=tabAtFrame(index);if(target&&target.opener===tab)closeTab(target);},
      onError:error=>{if(error.reset&&tab.state?.url){reopen(tab);return;}if(active===tab)status(error.message,true);}});
    select.onclick=()=>activate(tab);close.onclick=()=>closeTab(tab);dragTab(tab);
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
  // A page that has committed but not yet reported its history (still
  // loading when the user types the next address) must stay reachable with
  // Back, as in a browser; the next document replaces the frame before the
  // old one can report.
  function keepUnreported(tab){
    const url=tab.state?.url;
    if(!tab.state?.loading || !url || tab.history[tab.position]?.url===url)return;
    tab.history.splice(tab.position+1);tab.history.push({id:'pending-'+crypto.randomUUID(),url,documentId:'pending:'+crypto.randomUUID()});
    tab.position=tab.history.length-1;
  }
  async function go(value,retried=false) {
    const tab=active;tab.historyGeneration=(tab.historyGeneration||0)+1;tab.controller.cancelTraversal();if(!retried)keepUnreported(tab);if(tab.targetPosition?.epoch===undefined && tab.targetPosition?.previousPosition!==undefined)tab.position=tab.targetPosition.previousPosition;delete tab.targetPosition;tab.historyQueue=[];
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
  $('new-tab').onclick=()=>newTab();
  // Quick-launch shortcuts on the welcome screen. Saved per Vibetop user, on
  // this device and (like the tabs) on the server, so they follow to any
  // device. Until the user edits them the built-in set shows and nothing is
  // stored; the first add or remove commits the list as it then stands.
  const DEFAULT_SHORTCUTS=[{name:'Google',url:'https://www.google.com/'},{name:'Wikipedia',url:'https://www.wikipedia.org/'},{name:'GitHub',url:'https://github.com/'},{name:'X',url:'https://x.com/'},{name:'ChatGPT',url:'https://chatgpt.com/'},{name:'Claude',url:'https://claude.ai/'}];
  const SHORTCUT_KEY=profile?'vt-lite-shortcuts:'+profile:'',MAX_SHORTCUTS=24;
  let shortcuts=null;// null = never customised, so the defaults show
  const shortcutList=()=>shortcuts||DEFAULT_SHORTCUTS;
  function cleanShortcuts(list){
    if(!Array.isArray(list))return null;
    const seen=new Set(),out=[];
    for(const item of list){
      if(!item||typeof item.url!=='string')continue;
      let url;try{url=new URL(item.url);}catch{continue;}
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||seen.has(url.href))continue;seen.add(url.href);
      out.push({name:(typeof item.name==='string'&&item.name.trim()?item.name.trim():url.hostname.replace(/^www\./,'')).slice(0,60),url:url.href});
      if(out.length>=MAX_SHORTCUTS)break;
    }
    return out;
  }
  function renderShortcuts(){
    const box=$('shortcuts');box.textContent='';
    for(const item of shortcutList()){
      const tile=document.createElement('span');tile.className='shortcut';
      const open=document.createElement('button');open.type='button';open.className='open';open.textContent=item.name;open.title=item.url;open.onclick=()=>go(item.url);
      const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.name);
      remove.onclick=event=>{event.stopPropagation();removeShortcut(item.url);};
      tile.append(open,remove);box.append(tile);
    }
    const add=document.createElement('button');add.type='button';add.className='add';add.textContent='+ Add';add.setAttribute('aria-label','Add a shortcut');
    add.onclick=()=>{const form=$('add-shortcut');form.hidden=!form.hidden;if(!form.hidden)$('shortcut-url').focus();};
    box.append(add);
  }
  function persistShortcuts(){
    try{if(SHORTCUT_KEY)localStorage.setItem(SHORTCUT_KEY,JSON.stringify(shortcuts));}catch{}
    if(SHORTCUT_KEY&&!LOCAL_ONLY)request('shortcuts',{save:{shortcuts}}).catch(()=>{});
  }
  function addShortcut(name,value){
    let url;try{url=address(value);}catch(error){status(error.message,true);return false;}
    const list=shortcutList().slice();
    if(list.some(item=>item.url===url)){status('That shortcut is already here.');return true;}
    if(list.length>=MAX_SHORTCUTS){status('Remove a shortcut before adding another.',true);return false;}
    let host='';try{host=new URL(url).hostname.replace(/^www\./,'');}catch{}
    list.push({name:((name||'').trim()||host).slice(0,60),url});
    shortcuts=list;persistShortcuts();renderShortcuts();return true;
  }
  function removeShortcut(url){shortcuts=shortcutList().filter(item=>item.url!==url);persistShortcuts();renderShortcuts();}
  $('add-shortcut').onsubmit=event=>{event.preventDefault();if(addShortcut($('shortcut-name').value,$('shortcut-url').value)){$('shortcut-name').value='';$('shortcut-url').value='';$('add-shortcut').hidden=true;}};
  $('add-cancel').onclick=()=>{$('add-shortcut').hidden=true;$('shortcut-name').value='';$('shortcut-url').value='';};
  try{const raw=SHORTCUT_KEY?localStorage.getItem(SHORTCUT_KEY):null;if(raw){const parsed=cleanShortcuts(JSON.parse(raw));if(parsed)shortcuts=parsed;}}catch{}
  renderShortcuts();
  if(SHORTCUT_KEY&&!LOCAL_ONLY)request('shortcuts',{}).then(result=>{
    const parsed=cleanShortcuts(result&&result.shortcuts);
    if(parsed){shortcuts=parsed;try{localStorage.setItem(SHORTCUT_KEY,JSON.stringify(parsed));}catch{}renderShortcuts();}
  }).catch(()=>{});
  // Ad blocker toggle. On by default; synced per Vibetop user on this device
  // and (like the shortcuts and tabs) on the server, so it follows to any
  // device. Takes effect on the next page load, not retroactively.
  const ADBLOCK_KEY=profile?'vt-lite-adblock:'+profile:'';
  let adblockOn=(()=>{try{const v=ADBLOCK_KEY?localStorage.getItem(ADBLOCK_KEY):null;return v===null?true:v==='1';}catch{return true;}})();
  const setAdblockUI=on=>{if($('adblock-toggle'))$('adblock-toggle').checked=on;};
  setAdblockUI(adblockOn);
  function persistAdblock(){
    try{if(ADBLOCK_KEY)localStorage.setItem(ADBLOCK_KEY,adblockOn?'1':'0');}catch{}
    if(ADBLOCK_KEY&&!LOCAL_ONLY)request('prefs',{save:{adblock:adblockOn}}).catch(()=>{});
  }
  if($('adblock-toggle'))$('adblock-toggle').onchange=event=>{adblockOn=!!event.target.checked;persistAdblock();status(adblockOn?'Ad blocker on — reload a page to apply.':'Ad blocker off — reload a page to apply.');};
  if(ADBLOCK_KEY&&!LOCAL_ONLY)request('prefs',{}).then(result=>{
    const prefs=result&&result.prefs;
    if(prefs&&typeof prefs.adblock==='boolean'){adblockOn=prefs.adblock;setAdblockUI(adblockOn);try{localStorage.setItem(ADBLOCK_KEY,adblockOn?'1':'0');}catch{}}
  }).catch(()=>{});
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
  ensureSpare();
})();
