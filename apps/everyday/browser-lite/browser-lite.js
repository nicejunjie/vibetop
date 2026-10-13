(() => {
  'use strict';
  const $=id=>document.getElementById(id), frame=$('page');
  const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const channel=uid();let attach=uid(), session=null, generation=null, epoch=null, seq=0;
  let ticket=0, actionSeq=0, inputQueue=[], actionRunning=false, pollRunning=false, stopped=false;
  let frameReady=false, sessionReady=false, composing=false, received=0, meta={}, currentDialog=null, hovering=false;
  const failedFields=new Set();const pending=new Map(), resourceQueue=[], resourceSeen=new Set();let resourcesInFlight=0, resizeTimer;
  let front=!window.frameElement||window.frameElement.classList.contains('active');
  const shouldRun=()=>front&&!document.hidden;
  let userKey=null, savedURL='', deferredNavigation=null, stoppedReason=null;
  const readKey=(k)=>{try{return sessionStorage.getItem(k);}catch(_){return null;}};
  const writeKey=(k,v)=>{try{sessionStorage.setItem(k,v);}catch(_){}};
  function status(text,error=false){$('message').textContent=text;$('status').classList.toggle('error',error);}
  function cover(text,mode){
    const el=$('cover');el.hidden=!text;if(text)el.querySelector('h1').textContent=text;
    if(text && mode)el.querySelector('p').textContent=mode==='superseded'?'This page is open in another window. Take it over or start a separate page.':'Your displayed page has been kept. Reconnect to try again.';
    $('takeover').hidden=mode!=='superseded';$('newpage').hidden=!mode;$('reconnect').hidden=!mode||mode==='superseded';
  }
  function identity(){return {session,attach,generation,epoch};}
  async function api(path,body,timeout=25000){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const response=await fetch('/api/browser-lite/'+path,{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
      if(response.redirected || new URL(response.url).origin!==location.origin)throw Object.assign(Error('Sign in to Vibetop again.'),{code:'auth'});
      const text=await response.text();received+=new TextEncoder().encode(text).length;
      $('traffic').textContent=(received/1024).toFixed(received<10240?1:0)+' KB page data';
      let result;try{result=JSON.parse(text);}catch(_){throw Object.assign(Error('Connection interrupted. Reconnect to try again.'),{code:'network'});}
      if(!response.ok || !result.ok)throw Object.assign(Error(result.message||result.error||'Request failed.'),{code:result.code||String(response.status),data:result});
      return result;
    }finally{clearTimeout(timer);}
  }
  function send(type,data){frame.contentWindow.postMessage({channel,type,...data},'*');}
  function render(type,data){
    const request=uid();return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(request);reject(Error('Page renderer did not respond.'));},8000);
      pending.set(request,{resolve:()=>{clearTimeout(timer);resolve();},reject:e=>{clearTimeout(timer);reject(e);}});
      send(type,{...data,request});
    });
  }
  function metadata(data){
    if(!data)return;meta=data;
    if(data.url && data.url!=='about:blank'){
      savedURL=data.url;if(document.activeElement!==$('address'))$('address').value=data.url;
      if(userKey)writeKey(userKey+':url',data.url);
    }
    if(data.dialog && data.dialog.id!==currentDialog){
      currentDialog=data.dialog.id;$('dialogmessage').textContent=data.dialog.message;
      $('dialogvalue').hidden=data.dialog.type!=='prompt';$('dialogvalue').value=data.dialog.default||'';
      $('dialogcancel').hidden=data.dialog.type==='alert';if(!$('dialog').open)$('dialog').showModal();
    }else if(!data.dialog && currentDialog){$('dialog').close();currentDialog=null;}
    if(data.error)status(data.error,true);
    else if(data.loading)status('Loading…');
    else status(data.warnings?.length?data.warnings.join(' · '):'Connected · local scrolling');
  }
  function failure(e){
    status(e.message,true);
    if(e.code==='superseded'||e.code==='resume-busy'){stoppedReason='superseded';stopped=true;inputQueue=[];cover('Open in another window','superseded');}
    else if(e.code==='401'||e.code==='403'||e.code==='auth'){
      stoppedReason='auth';stopped=true;cover('Sign in to Vibetop again','auth');send('reset',{epoch:null});
    }else if(e.code==='expired'){stoppedReason='expired';stopped=true;cover('Session ended','expired');}
  }
  async function baseline(myTicket){
    if(composing){status('Finish typing to update the page.');while(composing && myTicket===ticket && !stopped)await new Promise(resolve=>setTimeout(resolve,100));}
    let cursor=0, snapshotSeq;
    do{
      const result=await api('updates',{...identity(),baseline:true,cursor});
      if(myTicket!==ticket || stopped)return;
      if(result.meta?.error){stoppedReason='paused';stopped=true;cover('Page needs attention','paused');status(result.meta.error,true);return;}
      if(cursor===0){epoch=result.epoch;seq=0;resourceSeen.clear();resourceQueue.length=0;await render('reset',{epoch});}
      await render('apply',{epoch,put:result.nodes,remove:[],styles:result.styles,meta:result.meta});
      metadata(result.meta);snapshotSeq=result.seq;
      if(result.nodes.length)cover(null);
      status(result.done?'Connected · local scrolling':'Loading page '+(cursor+1)+' / '+result.total+'…');
      if(result.done)break;cursor++;
    }while(true);
    if(myTicket!==ticket || stopped)return;
    seq=snapshotSeq;await api('ack',{...identity(),seq});
  }
  async function poll(){
    if(pollRunning||stopped||!sessionReady||!frameReady||!shouldRun())return;
    pollRunning=true;const myTicket=ticket;
    try{
      if(seq===0)await baseline(myTicket);
      else{
        const result=await api('updates',{...identity(),after:seq});
        if(myTicket!==ticket||stopped)return;
        if(result.kind==='resync'){seq=0;await baseline(myTicket);}
        else if(result.kind==='paused'){stoppedReason='paused';stopped=true;status(result.message,true);cover('Page needs attention','paused');}
        else{
          for(const packet of result.packets||[]){
            if(myTicket!==ticket||packet.epoch!==epoch||packet.seq!==seq+1){seq=0;break;}
            await render('apply',{...packet,epoch});seq=packet.seq;metadata(packet.meta);
          }
          if(seq)await api('ack',{...identity(),seq});
        }
      }
    }catch(e){
      failure(e);
      if(!stopped && e.code!=='stale' && e.code!=='resync'){status('Connection interrupted · retrying',true);await new Promise(r=>setTimeout(r,2000));}
      if(e.code==='stale'||e.code==='resync')seq=0;
    }finally{
      pollRunning=false;if(!stopped && shouldRun())setTimeout(poll,50);
    }
  }
  async function queueAction(data){
    if(!sessionReady){if(data.kind==='navigate'){deferredNavigation=data.url;status('Connecting before opening your address…');}return;}
    if(stopped){if(stoppedReason==='paused'&&['navigate','back','forward','reload'].includes(data.kind)){stopped=false;stoppedReason=null;cover(null);}else{status('Reconnect, take over, or open a new page before browsing.',true);return;}}
    if(data.kind!=='hover')inputQueue=inputQueue.filter(a=>a.kind!=='hover');
    if(data.kind==='hover'&&(actionRunning||inputQueue.length))return;
    // Coalesce unsent text updates; preserve click/Enter order and inputSeq.
    if(data.kind==='input'){
      const last=inputQueue[inputQueue.length-1];
      if(last && last.kind==='input' && last.node===data.node){inputQueue[inputQueue.length-1]=data;return;}
    }
    if(inputQueue.length>100){status('Too many pending actions. Wait for the connection.',true);return;}
    inputQueue.push(data);runActions();
  }
  async function runActions(){
    if(actionRunning)return;actionRunning=true;
    try{
      while(inputQueue.length && !stopped){
        const data=inputQueue.shift();
        if(data.submits&&failedFields.size){status('Some changes were not accepted. Edit the field before submitting.',true);continue;}
        const nav=['navigate','back','forward','reload'].includes(data.kind);
        if(nav){ticket++;status('Loading…');}
        const request={...identity(),...data,actionSeq:++actionSeq};
        try{
          let result;
          try{result=await api('action',request,22000);}catch(e){
            if(e.code==='network'||e.name==='AbortError'||e instanceof TypeError){
              status('Retrying the same action…',true);await new Promise(resolve=>setTimeout(resolve,500));
              result=await api('action',request,22000);
            }else throw e;
          }
          if(['input','select','check'].includes(data.kind))failedFields.delete(data.node);
          metadata(result.meta);
          if(nav){epoch=result.epoch;seq=0;}
        }catch(e){if(['input','select','check'].includes(data.kind))failedFields.add(data.node);if(data.kind!=='hover'){failure(e);if(!stopped)status(e.message,true);}}
        poll();
      }
    }finally{actionRunning=false;}
  }
  async function resourcePump(){
    while(resourceQueue.length && resourcesInFlight<3 && !stopped && shouldRun()){
      const item=resourceQueue.shift();if(item.epoch!==epoch)continue;
      resourcesInFlight++;const myTicket=ticket;
      api('resource',{...identity(),resource:item.resource,force:item.force},12000).then(result=>{
        if(myTicket===ticket && item.epoch===epoch)send('resource',{...result,resource:item.resource,epoch});
      }).catch(e=>{
        if(item.epoch===epoch)send('resourceError',{...item,code:e.code});if(['superseded','expired','401','403','auth'].includes(e.code))failure(e);
      }).finally(()=>{resourcesInFlight--;resourcePump();});
    }
  }
  addEventListener('message',e=>{
    if(e.source===parent && e.origin===location.origin && e.data?.type==='vibetop:active'){front=e.data.active==='browserlite';if(front){poll();resourcePump();resize();}return;}
    if(e.source!==frame.contentWindow||!e.data||typeof e.data!=='object')return;
    const d=e.data;
    if(d.type==='lite-frame-ready'){send('init',{images:$('images').checked});return;}
    if(d.channel!==channel)return;
    if(d.type==='ready'){frameReady=true;poll();return;}
    if(d.type==='applied'){const p=pending.get(d.request);if(p){pending.delete(d.request);p.resolve();}return;}
    if(d.type==='renderError'){const p=pending.get(d.request);if(p){pending.delete(d.request);p.reject(Error(d.message));}return;}
    if(stopped || d.epoch!==epoch)return;
    if(d.type==='composition'){composing=d.active===true;return;}
    if(d.type==='action'){
      const allowed=['click','input','select','check','key'];
      if(allowed.includes(d.kind)&&Number.isSafeInteger(d.node)&&d.node>0 && (!d.value || typeof d.value==='string'&&d.value.length<=64000))queueAction({kind:d.kind,node:d.node,value:d.value,checked:d.checked,key:d.key,inputSeq:d.inputSeq,epoch:d.epoch,submits:d.submits===true});
    }else if(d.type==='scroll'){
      const values=[d.node,d.anchor,d.offset,d.ratio,d.x];if(values.every(Number.isFinite)){
        const last=inputQueue[inputQueue.length-1];const data={kind:'scroll',epoch:d.epoch,...Object.fromEntries(['node','anchor','offset','ratio','x'].map(k=>[k,d[k]]))};
        if(last?.kind==='scroll')inputQueue[inputQueue.length-1]=data;else queueAction(data);
      }
    }else if(d.type==='hover'&&!hovering){
      hovering=true;setTimeout(()=>{hovering=false;},600);queueAction({kind:'hover',node:d.node,epoch:d.epoch});
    }else if(d.type==='resource'&&/^[a-f0-9]{24}$/.test(d.resource)&&(!resourceSeen.has(d.resource)||d.force===true)){
      resourceSeen.add(d.resource);if(resourceQueue.length<1000){resourceQueue.push({resource:d.resource,epoch,force:d.force===true});resourcePump();}
    }else if(d.type==='notice')status(d.message);
  });
  function normalize(value){
    value=value.trim();if(!value)return null;
    if(/^https?:\/\//i.test(value))return value;
    if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&!/^localhost:\d+/i.test(value))throw Error('Only HTTP and HTTPS addresses are supported.');
    if(!/\s/.test(value)&&(/\./.test(value)||/^localhost(?::\d+)?(?:\/|$)/.test(value)))return 'https://'+value;
    return 'https://www.google.com/search?q='+encodeURIComponent(value);
  }
  $('navigate').addEventListener('submit',e=>{e.preventDefault();try{const url=normalize($('address').value);if(url)queueAction({kind:'navigate',url});}catch(e){status(e.message,true);}});
  for(const kind of ['back','forward','reload'])$(kind).onclick=()=>queueAction({kind});
  $('images').onchange=()=>send('images',{enabled:$('images').checked});
  $('fallback').onclick=async()=>{
    if(!savedURL){status('Open a webpage first.');return;}
    try{
      const url=savedURL.replace(/[()']/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
      if(parent!==window){parent.postMessage({type:'open-in-browser',url},location.origin);status('Opened in Browser.');return;}
      const response=await fetch('/api/browser/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      if(!response.ok)throw Error('Could not open Browser.');status('Opened in Browser.');
    }catch(e){status(e.message,true);}
  };
  async function start(newPage=false,takeover=false){
    stopped=false;stoppedReason=null;composing=false;ticket++;sessionReady=false;seq=0;inputQueue=[];actionSeq=0;failedFields.clear();attach=uid();
    session=newPage?null:(userKey?readKey(userKey):null);
    let resumeIfIdle=false;
    if(!session && !newPage && userKey){try{session=localStorage.getItem(userKey+':last');resumeIfIdle=!!session;}catch(_){}}
    if(newPage){savedURL='';$('address').value='';if(userKey)writeKey(userKey+':url','');}
    status('Connecting…');
    try{
      const result=await api('session',{session,attach,resumeIfIdle:resumeIfIdle&&!takeover});
      session=result.session;generation=result.generation;epoch=result.epoch;sessionReady=true;
      if(userKey){writeKey(userKey,session);try{localStorage.setItem(userKey+':last',session);}catch(_){}}
      metadata(result.meta);if(shouldRun())await resize();poll();
      if(deferredNavigation){const url=deferredNavigation;deferredNavigation=null;queueAction({kind:'navigate',url});}
      else if(result.meta.url==='about:blank' && savedURL)queueAction({kind:'navigate',url:savedURL});
      if(takeover)cover(null);
    }catch(e){failure(e);if(!stopped){stopped=true;cover(e.code==='quota'?'All server pages are in use':'Could not start Browser Lite','error');}status(e.message,true);}
  }
  async function resize(){
    if(!sessionReady)return;const rect=frame.getBoundingClientRect();
    await queueAction({kind:'resize',width:Math.round(rect.width),height:Math.round(rect.height),dark:matchMedia('(prefers-color-scheme: dark)').matches,mobile:matchMedia('(pointer:coarse)').matches});
  }
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,200);});
  document.addEventListener('visibilitychange',()=>{if(shouldRun() && !stopped){resize();poll();resourcePump();}});
  $('reconnect').onclick=()=>start();$('takeover').onclick=()=>start(false,true);$('newpage').onclick=()=>start(true,true);
  async function pages(){
    $('pages').showModal();const box=$('pagelist');box.textContent='Loading…';
    try{
      const result=await api('pages',{kind:'list'});box.textContent='';
      for(const p of result.pages){
        const row=document.createElement('div');row.className='entry';
        const title=document.createElement('strong');title.textContent=p.title||'New page';row.appendChild(title);
        const url=document.createElement('small');url.textContent=p.url;row.appendChild(url);
        const open=document.createElement('button');open.textContent='Take over';
        open.onclick=()=>{writeKey(userKey,p.session);$('pages').close();start(false,true);};row.appendChild(open);
        const close=document.createElement('button');close.textContent='Close';
        close.onclick=async()=>{
          try{await api('pages',{session:p.session,kind:'close'});row.remove();if(p.session===session){stopped=true;sessionReady=false;send('reset',{epoch:null});cover('Page closed','closed');}}catch(e){status(e.message,true);}
        };row.appendChild(close);box.appendChild(row);
      }
    }catch(e){box.textContent=e.message;}
  }
  $('sessions').onclick=pages;$('pagesclose').onclick=()=>$('pages').close();$('addpage').onclick=()=>{$('pages').close();start(true,true);};
  const respondDialog=accept=>{
    queueAction({kind:'dialog',dialogId:currentDialog,accept,value:$('dialogvalue').value});$('dialog').close();
  };
  $('dialogok').onclick=()=>respondDialog(true);$('dialogcancel').onclick=()=>respondDialog(false);
  $('dialog').addEventListener('cancel',e=>{e.preventDefault();respondDialog(false);});
  fetch('/api/me').then(r=>{if(!r.ok)throw Error('Sign in to Vibetop first.');return r.json();}).then(me=>{
    userKey='vibetop:browser-lite:'+me.user;savedURL=readKey(userKey+':url')||'';start();
  }).catch(e=>{stopped=true;status(e.message,true);cover('Sign in to Vibetop first','auth');});
})();
