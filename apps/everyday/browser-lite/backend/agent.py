#!/usr/bin/env python3
"""Per-UID remote browsing agent. Manager only proxies its private Unix socket."""
import argparse
import asyncio
import base64
import collections
import contextlib
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import time
from urllib.parse import urlsplit
from core import (LiteError, pack, chunks, delta, validate_url, css_tokens,
                  rewrite_css, import_spec, SAFE_MIME, MAX_ASSET, MAX_BASELINE)
from playwright.async_api import async_playwright, Error as BrowserError

MAX_REQUEST = 256 * 1024
MAX_PAGES = 3
COLLECTOR = Path(__file__).with_name('collector.js').read_text()

class Session:
    def __init__(self, agent, page):
        self.agent, self.page = agent, page
        self.id = secrets.token_hex(16)
        self.attach = None
        self.attach_seen = set()
        self.bridge = '__bl_' + secrets.token_hex(16)
        self.epoch = 0
        self.seq = 0
        self.nodes = []
        self.meta = {'url':'about:blank','title':'New page'}
        self.styles = []
        self.css_headers = {}
        self.style_state = None
        self.css_dirty = True
        self.assets_dirty = True
        self.resources = {}
        self.url_ids = {}
        self.requests = {}
        self.revision = asyncio.Condition()
        self.lock = asyncio.Lock()
        self.capture_lock = asyncio.Lock()
        self.packets = collections.deque()
        self.pending_bytes = 0
        self.ack = 0
        self.paused = False
        self.results = collections.OrderedDict()
        self.last_action = 0
        self.input_seq = {}
        self.dialog = None
        self._dialog = None
        self.dialog_event = asyncio.Event()
        self.force_assets = False
        self.resyncs = 0
        self.last_used = time.monotonic()
        self.warnings = set()
        self.tasks = set()
        self.total_asset_bytes = 0
        self.loading = False
        self.closed = False
        self.baseline = None
        self.polling = False
        self.resource_slots = asyncio.Semaphore(3)

    def spawn(self, coro):
        task=asyncio.create_task(coro); self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        return task

    async def init(self):
        await self.page.add_init_script(COLLECTOR.replace('__BRIDGE_LITERAL__',json.dumps(self.bridge)))
        self.cdp=await self.page.context.new_cdp_session(self.page)
        await self.cdp.send('Network.enable', {'maxResourceBufferSize':MAX_ASSET,'maxTotalBufferSize':64*1024*1024})
        tree=await self.cdp.send('Page.getFrameTree');self.frame_id=tree['frameTree']['frame']['id'];self.loader_id=tree['frameTree']['frame'].get('loaderId')
        self.cdp.on('Page.frameNavigated',self.navigated)
        self.cdp.on('Page.navigatedWithinDocument',self.within_document)
        await self.cdp.send('Page.enable')
        await self.cdp.send('DOM.enable')
        await self.cdp.send('CSS.enable')
        self.cdp.on('CSS.styleSheetAdded',self.css_added)
        self.cdp.on('CSS.styleSheetChanged',lambda _:self.mark_css())
        self.cdp.on('CSS.mediaQueryResultChanged',lambda _:self.mark_css())
        self.cdp.on('CSS.styleSheetRemoved',lambda p:self.css_removed(p))
        self.cdp.on('Network.responseReceived',self.response)
        self.cdp.on('Network.loadingFinished',lambda p:self.spawn(self.cache_body(p)))
        self.cdp.on('Network.loadingFailed',lambda p:self.requests.pop(p.get('requestId'),None))
        self.page.on('dialog',self.on_dialog)
        self.page.on('download',lambda d:self.spawn(d.cancel()))
        self.page.on('popup',lambda p:self.spawn(self.agent.popup(p)))
        self.spawn(self.collect_loop())

    def mark_css(self):
        self.css_dirty=True

    def css_added(self,p):
        h=p['header']
        if h.get('frameId') and h['frameId']!=self.frame_id:return
        self.css_headers[h['styleSheetId']]=h;self.css_dirty=True

    def css_removed(self,p):
        self.css_headers.pop(p.get('styleSheetId'),None);self.css_dirty=True

    def within_document(self,p):
        if p.get('frameId')==self.frame_id:
            self.meta={**self.meta,'url':p.get('url',self.page.url)}
            self.spawn(self.capture(force=True,sync_scroll=True))

    def navigated(self,p):
        frame=p.get('frame',{})
        if frame.get('id')!=self.frame_id or frame.get('loaderId')==self.loader_id:return
        self.loader_id=frame.get('loaderId')
        self.epoch+=1;self.nodes=[];self.styles=[];self.css_headers={};self.css_dirty=True
        self.resources={};self.url_ids={};self.requests={};self.total_asset_bytes=0
        self.meta={'url':self.page.url,'title':'Loading…'}
        self.packets.clear();self.pending_bytes=0;self.paused=False;self.baseline=None;self.ack=0
        self.dialog=None;self._dialog=None;self.warnings.clear();self.resyncs=0
        self.spawn(self.notify())

    async def notify(self):
        async with self.revision:self.revision.notify_all()

    def response(self,p):
        if p.get('loaderId') and p['loaderId']!=self.loader_id:return
        if p.get('frameId') and p['frameId']!=self.frame_id:return
        r=p['response']
        if not (200<=r.get('status',0)<300 or r.get('status')==304):return
        url=r.get('url','');mime=r.get('mimeType','').split(';')[0].lower()
        if not url.startswith(('http://','https://','data:')):return
        if mime in SAFE_MIME or mime=='text/css':
            self.register(url,mime,observed=True)
            self.requests[p['requestId']]={'url':url,'mime':mime,'epoch':self.epoch}

    def register(self,url,mime=None,observed=False):
        if not isinstance(url,str) or len(url)>40000:return None
        if url.startswith('data:'):
            if len(url)>256*1024:return None
            mime=mime or url[5:].split(';')[0].split(',')[0].lower()
        elif not url.startswith(('http://','https://')):return None
        if url in self.url_ids:
            rid=self.url_ids[url]
            if mime and self.resources[rid].get('mime')!=mime:
                self.resources[rid]['mime']=mime;self.assets_dirty=True
            return rid
        if not observed and not url.startswith('data:'):return None
        if len(self.resources)>=1000:return None
        rid=secrets.token_hex(12);self.url_ids[url]=rid
        self.resources[rid]={'url':url,'mime':mime,'body':None,'epoch':self.epoch}
        self.css_dirty=True
        if observed:self.force_assets=True
        return rid

    async def cache_body(self,p):
        info=self.requests.pop(p.get('requestId'),None)
        if not info or info['epoch']!=self.epoch:return
        if p.get('encodedDataLength',0)>MAX_ASSET:return
        try:
            result=await self.cdp.send('Network.getResponseBody',{'requestId':p['requestId']})
            body=base64.b64decode(result['body']) if result.get('base64Encoded') else result['body'].encode()
            if info['epoch']==self.epoch:self.store_body(info['url'],body,info['mime'])
        except BrowserError:pass

    def store_body(self,url,body,mime):
        if len(body)>MAX_ASSET or self.total_asset_bytes+len(body)>32*1024*1024:return
        rid=self.register(url,mime)
        if rid and self.resources[rid]['body'] is None:
            self.resources[rid].update(body=body,mime=mime);self.total_asset_bytes+=len(body)

    async def resource_body(self,rid):
        entry=self.resources.get(rid)
        if not entry or entry['epoch']!=self.epoch:raise LiteError('resource','Resource expired.',404)
        if entry['body'] is not None:return entry
        epoch=self.epoch
        async with self.resource_slots:
            if entry['body'] is not None:return entry
            url=entry['url']
            if url.startswith('data:'):
                import urllib.parse
                head,raw=url.split(',',1);mime=head[5:].split(';')[0]
                body=base64.b64decode(raw) if ';base64' in head else urllib.parse.unquote_to_bytes(raw)
            else:
                # A context.request replay changes SameSite/PNA semantics. Never
                # replay an arbitrary authenticated GET just to mirror an asset.
                for _ in range(10):
                    await asyncio.sleep(.1)
                    if entry['body'] is not None:return entry
                raise LiteError('missing','The browser did not retain this resource. Use Browser for this image.',404)
            if epoch!=self.epoch:raise LiteError('stale','Page changed.',409)
            if mime not in SAFE_MIME and mime!='text/css':raise LiteError('mime','Unsupported resource type.',415)
            self.store_body(url,body,mime)
            if entry['body'] is None:raise LiteError('resource','Resource exceeds the cache budget.',413)
        return entry

    async def css_text(self,text,base,seen=None,depth=0):
        if len(text)>1024*1024:raise LiteError('complex','Stylesheet is too large.',413)
        seen=seen or set();out=[];pos=0
        for kind,start,end,value in css_tokens(text):
            out.append(rewrite_css(text[pos:start],base,self.register))
            if kind=='import':
                spec=import_spec(value,base)
                if spec and depth<4 and spec[0] not in seen:
                    rid=self.register(spec[0],'text/css')
                    try:
                        entry=await self.resource_body(rid)
                        inner=await self.css_text(entry['body'].decode('utf-8','replace'),spec[0],seen|{spec[0]},depth+1)
                        out.append('@media '+spec[1]+'{'+inner+'}' if spec[1] else inner)
                    except (LiteError,BrowserError):self.warnings.add('Some styles could not be loaded')
                else:self.warnings.add('Some imported styles are unsupported')
            else:
                out.append(rewrite_css(text[start:end],base,self.register))
            pos=end
        out.append(rewrite_css(text[pos:],base,self.register))
        return ''.join(out)

    async def capture(self,force=False,sync_scroll=False):
        if self.closed or self.paused or self.dialog:return
        async with self.capture_lock:
            epoch=self.epoch
            try:
                force=force or self.force_assets;self.force_assets=False
                raw=await asyncio.wait_for(self.page.evaluate('(r)=>window[r.key]?.snapshot(r.force)',{'key':self.bridge,'force':force}),3)
                if raw is not None and not isinstance(raw,dict):raise LiteError('collector','This page cannot be mirrored safely.',422)
                if not raw and not self.css_dirty and not self.assets_dirty and not force:return
                if raw and raw.get('tooLarge'):raise LiteError('complex','This page is too large for Browser Lite.',413)
                if raw is not None and not isinstance(raw,dict):raise LiteError('collector','This page cannot be mirrored safely.',422)
                nodes=raw.get('nodes',self.nodes) if raw else self.nodes
                if not isinstance(nodes,list) or len(nodes)>20000:raise LiteError('collector','Invalid or oversized page data.',422)
                for n in nodes:
                    if not isinstance(n,dict) or not isinstance(n.get('id'),int) or n['id']<1 or not isinstance(n.get('tag'),str) or len(n['tag'])>60 or not isinstance(n.get('attrs',{}),dict):raise LiteError('collector','This page cannot be mirrored safely.',422)
                    if not isinstance(n.get('parent'),int) or not isinstance(n.get('index'),int):raise LiteError('collector','Invalid page structure.',422)
                    if n['tag']=='#text' and (not isinstance(n.get('text'),str) or len(n['text'])>100000):raise LiteError('collector','Invalid page text.',422)
                    if len(n.get('attrs',{}))>100 or any(not isinstance(k,str) or not isinstance(v,str) or len(k)>80 or len(v)>12000 for k,v in n.get('attrs',{}).items()):raise LiteError('collector','Invalid page attributes.',422)
                    if 'props' in n and not isinstance(n['props'],dict):raise LiteError('collector','Invalid form data.',422)
                if raw:
                    for n in nodes:
                        attrs=n.get('attrs',{})
                        for name in ('src','poster'):
                            if attrs.get(name):attrs[name]='lite-asset:'+self.register(attrs[name]) if self.register(attrs[name]) else ''
                        if attrs.get('style'):attrs['style']=rewrite_css(attrs['style'],n.get('styleBase',raw['base']),self.register)
                        n.pop('styleBase',None)
                if raw and raw.get('styleState')!=self.style_state:self.css_dirty=True;self.style_state=raw.get('styleState')
                styles=self.styles
                if self.css_dirty:
                    self.css_dirty=False;styles=[]
                    ordered=[]
                    for sid,h in list(self.css_headers.items())[:100]:
                        if not h.get('ownerNode'):continue  # imports are expanded with their conditions
                        try:
                            obj=await self.cdp.send('DOM.resolveNode',{'backendNodeId':h['ownerNode']})
                            oid=obj['object']['objectId']
                            order=await self.cdp.send('Runtime.callFunctionOn',{'objectId':oid,'functionDeclaration':'function(){return this.getRootNode()===document ? {index:Array.from(document.querySelectorAll("style,link[rel~=stylesheet]")).indexOf(this),disabled:!!this.disabled,media:this.media||""} : null;}','returnByValue':True})
                            await self.cdp.send('Runtime.releaseObject',{'objectId':oid})
                            owner=order['result'].get('value')
                            if isinstance(owner,dict) and owner.get('index',-1)>=0 and not owner.get('disabled'):
                                ordered.append((owner['index'],sid,{**h,'media':str(owner.get('media',''))[:1000]}))
                        except BrowserError:pass
                    deadline=time.monotonic()+5
                    for _,sid,h in sorted(ordered):
                        if time.monotonic()>deadline:self.warnings.add('Some styles could not be loaded');break
                        try:
                            r=await self.cdp.send('CSS.getStyleSheetText',{'styleSheetId':sid})
                            css=await asyncio.wait_for(self.css_text(r['text'],h.get('sourceURL') or self.page.url),3)
                            if sum(map(len,styles))+len(css)>2*1024*1024:raise LiteError('complex','Page styles exceed the Lite budget.',413)
                            styles.append('@media '+h['media']+'{'+css+'}' if h.get('media') and h['media']!='all' else css)
                        except (BrowserError,asyncio.TimeoutError):self.warnings.add('Some styles could not be loaded')
                if epoch!=self.epoch:return
                meta=dict(self.meta)
                if raw:meta.update(url=raw['url'],title=raw['title'],htmlAttrs=raw.get('htmlAttrs',{}))
                if raw and sync_scroll:meta['scroll']={**raw.get('scroll',{}),'token':self.seq+1}
                meta.update(loading=self.loading,warnings=sorted(self.warnings),dialog=self.dialog,
                            inputSeq=self.input_seq.copy(),resourceTypes={rid:('font' if (e.get('mime') or '').startswith(('font/','application/font','application/x-font')) else 'image' if (e.get('mime') or '').startswith('image/') else 'unknown') for rid,e in self.resources.items()})
                if len(pack(nodes))+len(pack(styles))>MAX_BASELINE:raise LiteError('complex','This page exceeds the Lite budget.',413)
                initial=not self.nodes and self.ack==0
                changes=delta(self.nodes,nodes)
                packet_meta=dict(meta)
                if packet_meta.get('resourceTypes')==self.meta.get('resourceTypes'):packet_meta.pop('resourceTypes',None)
                packet={'put':changes['put'],'remove':changes['remove'],'meta':packet_meta}
                if styles!=self.styles:packet['styles']=styles
                changed=bool(changes['put'] or changes['remove'] or meta!=self.meta or styles!=self.styles)
                self.nodes,self.styles,self.meta=nodes,styles,meta
                self.assets_dirty=False
                if changed or force:
                    self.seq+=1
                    packet.update(seq=self.seq,epoch=self.epoch,attach=self.attach)
                    size=len(pack(packet))
                    if initial:
                        await self.notify();return
                    if self.pending_bytes+size>2*1024*1024:
                        self.packets.clear();self.pending_bytes=0;self.resyncs+=1
                        self.paused=self.resyncs>3
                        await self.notify();return
                    self.packets.append(packet);self.pending_bytes+=size
                    await self.notify()
            except asyncio.TimeoutError:
                return
            except BrowserError as e:
                if any(reason in str(e) for reason in ('Execution context was destroyed','Cannot find context','has been closed')):return
                self.meta={**self.meta,'error':'This page cannot be mirrored. Reconnect or open Browser.'};self.paused=True;await self.notify()
            except LiteError as e:
                self.meta['error']=e.message;self.paused=True;await self.notify()
            except Exception:
                self.meta={**self.meta,'error':'This page cannot be mirrored safely. Reconnect or open Browser.'};self.paused=True;await self.notify()

    async def collect_loop(self):
        while not self.closed:
            await asyncio.sleep(.5)
            if self.attach and time.monotonic()-self.last_used<20:
                try:await self.capture()
                except Exception:
                    self.meta={**self.meta,'error':'This page cannot be mirrored. Reconnect or open Browser.'}
                    self.paused=True;await self.notify()

    async def attach_to(self,attach):
        async with self.lock:
            return await self._attach_locked(attach)

    async def _attach_locked(self,attach):
        if attach in self.attach_seen and self.attach!=attach:
            raise LiteError('superseded','This page is open in another window.',409)
        if self.attach!=attach:
            self.attach_seen.add(attach);self.attach=attach
            self.ack=0;self.input_seq={};self.results.clear();self.last_action=0
            self.packets.clear();self.pending_bytes=0;self.paused=False
            self.baseline=None;self.resyncs=0;self.meta.pop('error',None);await self.notify()
        self.last_used=time.monotonic()
        await self.capture(force=True)
        return self.identity()

    def identity(self):
        return {'session':self.id,'attach':self.attach,'generation':self.agent.generation,'epoch':self.epoch,
                'meta':self.meta,'pages':self.agent.page_list()}

    def check(self,r):
        if r.get('generation')!=self.agent.generation:raise LiteError('expired','Browser Lite restarted. Reconnect to restore your address.',409)
        if r.get('attach')!=self.attach:raise LiteError('superseded','This page is open in another window.',409)
        self.last_used=time.monotonic()

    async def updates(self,r):
        self.check(r)
        if self.polling:raise LiteError('busy','An update request is already running.',429)
        self.polling=True
        try:
            if r.get('baseline'):
                cursor=int(r.get('cursor',0))
                if cursor==0 or self.baseline is None:
                    await self.capture(force=True)
                    self.baseline={'epoch':self.epoch,'seq':self.seq,'chunks':chunks(self.nodes),
                                   'styles':list(self.styles),'meta':dict(self.meta)}
                b=self.baseline
                if b['epoch']!=self.epoch:raise LiteError('stale','Page changed while loading.',409)
                if cursor<0 or cursor>=len(b['chunks']):raise LiteError('cursor','Invalid page cursor.')
                return {'kind':'baseline','nodes':b['chunks'][cursor],'styles':b['styles'] if cursor==0 else None,
                        'meta':b['meta'],'epoch':b['epoch'],'seq':b['seq'],'cursor':cursor,
                        'total':len(b['chunks']),'done':cursor==len(b['chunks'])-1}
            after=int(r.get('after',0))
            if after>self.seq:raise LiteError('resync','Page needs resynchronization.',409)
            if r.get('epoch')!=self.epoch:return {'kind':'resync','epoch':self.epoch}
            if self.paused:return {'kind':'paused','meta':self.meta,'message':self.meta.get('error','This page changes too quickly. Pause it or reconnect.')}
            if self.packets and after<self.packets[0]['seq']-1:return {'kind':'resync','epoch':self.epoch}
            if after<self.seq and not self.packets:return {'kind':'resync','epoch':self.epoch}
            if after==self.seq:
                async with self.revision:
                    with contextlib.suppress(asyncio.TimeoutError):await asyncio.wait_for(self.revision.wait(),15)
                self.check(r)
                if after<self.seq and not self.packets:return {'kind':'resync','epoch':self.epoch}
                if r.get('epoch')!=self.epoch:return {'kind':'resync','epoch':self.epoch}
            packets=[p for p in self.packets if p['seq']>after]
            # Throttled 2Hz collection + bounded batches. Too much backlog pauses,
            # rather than looping full snapshots on a hostile animated page.
            return {'kind':'patch','packets':packets[:4],'epoch':self.epoch,'seq':after if not packets else packets[min(3,len(packets)-1)]['seq']}
        finally:self.polling=False

    async def interact(self,operation):
        # A native dialog blocks click/press completion. Release the page action
        # queue as soon as it opens, so its answer is never queued behind itself.
        self.dialog_event.clear()
        task=asyncio.create_task(operation);waiter=asyncio.create_task(self.dialog_event.wait())
        try:
            done,_=await asyncio.wait((task,waiter),return_when=asyncio.FIRST_COMPLETED)
            if waiter in done and self.dialog:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError,BrowserError):await task
                return
            return await task
        finally:
            waiter.cancel()
            with contextlib.suppress(asyncio.CancelledError):await waiter

    async def action(self,r):
        self.check(r)
        async with self.lock:
            self.check(r)
            seq=int(r.get('actionSeq',0))
            if seq in self.results:return self.results[seq]
            if seq<=self.last_action:raise LiteError('duplicate','Action expired; it was not repeated.',409)
            self.last_action=seq
            kind=r.get('kind');epoch=self.epoch
            if kind not in ('navigate','back','forward','reload','resize','dialog') and r.get('epoch')!=epoch:
                raise LiteError('stale','Page changed. Try again.',409)
            try:
                if kind in ('navigate','back','forward','reload'):
                    if kind=='navigate':url=validate_url(r.get('url'))
                    self.loading=True;self.paused=False;self.meta.pop('error',None)
                    try:
                        if kind=='navigate':await self.page.goto(url,wait_until='domcontentloaded',timeout=15000)
                        elif kind=='reload':await self.page.reload(wait_until='domcontentloaded',timeout=15000)
                        elif kind=='back':await self.page.go_back(wait_until='domcontentloaded',timeout=15000)
                        else:await self.page.go_forward(wait_until='domcontentloaded',timeout=15000)
                    except BrowserError:
                        if not self.page.url.startswith(('http://','https://')):raise LiteError('navigation','Could not open this address.',502)
                    finally:self.loading=False
                elif kind=='resize':
                    width=max(280,min(2560,int(r.get('width',1000))));height=max(200,min(2000,int(r.get('height',800))))
                    mobile=bool(r.get('mobile'))
                    await self.page.set_viewport_size({'width':width,'height':height})
                    await self.cdp.send('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':mobile})
                    await self.cdp.send('Emulation.setTouchEmulationEnabled',{'enabled':mobile})
                    await self.cdp.send('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-color-scheme','value':'dark' if r.get('dark') else 'light'}]})
                    ua=self.agent.desktop_ua
                    if mobile:ua=ua.replace('X11; Linux x86_64','Linux; Android 14; Pixel 8').replace('Safari/537.36','Mobile Safari/537.36')
                    await self.cdp.send('Emulation.setUserAgentOverride',{'userAgent':ua})
                elif kind=='scroll':
                    await self.page.evaluate('(r)=>window[r.bridge]?.scroll(r.node,r.anchor,r.offset,r.ratio,r.x)',
                         {**{k:r.get(k,0) for k in ('node','anchor','offset','ratio','x')},'bridge':self.bridge})
                elif kind=='dialog':
                    dialog=self._dialog
                    if not dialog or r.get('dialogId')!=self.dialog['id']:raise LiteError('stale','Dialog expired.',409)
                    if r.get('accept'):await dialog.accept(str(r.get('value',''))[:4000])
                    else:await dialog.dismiss()
                    self._dialog=None;self.dialog=None
                else:
                    node=int(r.get('node',0))
                    handle=await self.page.evaluate_handle('(r)=>window[r.bridge]?.get(r.node)',{'bridge':self.bridge,'node':node})
                    element=handle.as_element()
                    try:
                        if not element or not await element.evaluate('(n)=>n.isConnected'):raise LiteError('node','This control is no longer available.',409)
                        self.check(r)
                        if self.epoch!=epoch:raise LiteError('stale','Page changed. Try again.',409)
                        if kind=='click':await self.interact(element.click(timeout=3500,no_wait_after=True))
                        elif kind=='hover':await element.hover(timeout=300)
                        elif kind=='input':
                            value=r.get('value','')
                            if not isinstance(value,str) or len(value)>64000:raise LiteError('input','Input is too long.')
                            await element.fill(value,timeout=3500);self.input_seq[str(node)]=int(r.get('inputSeq',0))
                        elif kind=='select':
                            await element.select_option(value=str(r.get('value','')),timeout=3500);self.input_seq[str(node)]=int(r.get('inputSeq',0))
                        elif kind=='check':
                            desired=bool(r.get('checked'))
                            if await element.is_checked()!=desired and not await element.is_visible():
                                label=await element.evaluate_handle('(n)=>n.labels?.[0]')
                                try:
                                    control=label.as_element()
                                    if not control:raise LiteError('control','This checkbox requires Browser.',422)
                                    await control.click(timeout=3500)
                                    if await element.is_checked()!=desired:raise LiteError('control','Checkbox did not accept the change.',422)
                                finally:await label.dispose()
                            else:await element.set_checked(desired,timeout=3500)
                            self.input_seq[str(node)]=int(r.get('inputSeq',0))
                        elif kind=='key':
                            key=r.get('key')
                            if key not in ('Enter','Tab','Escape','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'):raise LiteError('key','Unsupported key.')
                            await self.interact(element.press(key,timeout=3500))
                        else:raise LiteError('action','Unsupported action.')
                    finally:await handle.dispose()
                self.check(r)
                await self.capture(force=True,sync_scroll=kind in ('click','key','navigate','back','forward','reload'))
                result={'ok':True,**self.identity()}
            except BrowserError as e:
                result={'ok':False,'code':'control','message':'This control is blocked or did not respond. Try another control or open Browser.','status':422}
            except LiteError as e:
                result={'ok':False,'code':e.code,'message':e.message,'status':e.status}
            self.results[seq]=result
            while len(self.results)>64:self.results.popitem(last=False)
            return result

    def on_dialog(self,dialog):
        self._dialog=dialog;self.dialog_event.set()
        self.dialog={'id':secrets.token_hex(8),'type':dialog.type,'message':dialog.message[:4000],'default':dialog.default_value[:1000]}
        # Never evaluate page JS while a modal dialog blocks its execution.
        # Publish the dialog directly so the client can unblock the browser.
        self.meta={**self.meta,'dialog':self.dialog}
        self.seq+=1
        packet={'put':[],'remove':[],'meta':self.meta,'seq':self.seq,'epoch':self.epoch,'attach':self.attach}
        self.packets.append(packet);self.pending_bytes+=len(pack(packet));self.spawn(self.notify())
        async def expiry():
            await asyncio.sleep(45)
            if self._dialog==dialog:
                with contextlib.suppress(BrowserError):await dialog.dismiss()
                self._dialog=None;self.dialog=None;await self.capture(force=True)
        self.spawn(expiry())

    async def close(self):
        self.closed=True
        for task in self.tasks:task.cancel()
        with contextlib.suppress(BrowserError):await self.page.close()

class Agent:
    def __init__(self,profile):
        self.profile=profile;self.generation=secrets.token_hex(12);self.sessions={};self.context=None
        self.started=time.monotonic();self.last_used=time.monotonic();self.start_lock=asyncio.Lock();self.session_lock=asyncio.Lock()

    def page_list(self):
        return [{'session':s.id,'url':s.meta.get('url',''),'title':s.meta.get('title',''),'idle':int(time.monotonic()-s.last_used)} for s in self.sessions.values()]

    async def start_browser(self):
        async with self.start_lock:
            if self.context:return
            self.pw=await async_playwright().start()
            self.context=await self.pw.chromium.launch_persistent_context(self.profile,channel='chromium',
                headless=True,chromium_sandbox=True,accept_downloads=False,
                args=['--no-first-run','--disable-background-networking','--enable-automation'])
            self.desktop_ua=await self.context.pages[0].evaluate('navigator.userAgent')
            for p in self.context.pages:await p.close()

    async def popup(self,page):
        opener=await page.opener()
        owner=next((s for s in self.sessions.values() if s.page==opener),None)
        url=page.url
        await page.close()
        if owner and url.startswith(('https://','http://')):
            owner.spawn(owner.page.goto(url,wait_until='domcontentloaded',timeout=15000))

    async def dispatch(self,r):
        self.last_used=time.monotonic()
        op=r.get('op')
        if op=='health':return {'ok':True,'generation':self.generation}
        if op=='pages':
            if r.get('kind')=='close':
                s=self.sessions.get(r.get('session'))
                if s:await s.close();del self.sessions[s.id]
            return {'ok':True,'pages':self.page_list()}
        if op=='session':
            attach=r.get('attach')
            if not isinstance(attach,str) or not (16<=len(attach)<=80):raise LiteError('attach','Invalid renderer identity.')
            async with self.session_lock:
                s=self.sessions.get(r.get('session'))
                if not s:
                    # Idempotent initial retry after a lost create response.
                    s=next((p for p in self.sessions.values() if attach in p.attach_seen),None)
                if not s:
                    if len(self.sessions)>=MAX_PAGES:raise LiteError('quota','Three pages are already open. Close one from Sessions.',429)
                    await self.start_browser()
                    page=await self.context.new_page()
                    s=Session(self,page);self.sessions[s.id]=s;await s.init()
                if r.get('resumeIfIdle') and s.attach is not None and s.attach!=attach and time.monotonic()-s.last_used<30:
                    raise LiteError('resume-busy','Your last page is open in another window. Take over or open a new page.',409)
                return {'ok':True,**await s.attach_to(attach)}
        s=self.sessions.get(r.get('session'))
        if not s:raise LiteError('expired','This page expired. Reconnect to restore your address.',409)
        s.check(r)
        if op=='updates':return {'ok':True,**await s.updates(r)}
        if op=='action':
            if r.get('kind')=='close':
                await s.close();del self.sessions[s.id];return {'ok':True,'pages':self.page_list()}
            return await s.action(r)
        if op=='ack':
            seq=int(r.get('seq',0))
            if seq<0 or seq>s.seq:raise LiteError('ack','Invalid update acknowledgement.')
            s.ack=max(s.ack,seq)
            while s.packets and s.packets[0]['seq']<=s.ack:
                s.pending_bytes-=len(pack(s.packets.popleft()))
            return {'ok':True}
        if op=='resource':
            entry=await s.resource_body(r.get('resource'))
            s.check(r)
            if entry['mime'] not in SAFE_MIME:raise LiteError('mime','Not an image or font.',415)
            if entry['mime'].startswith('image/') and len(entry['body'])>256*1024 and not r.get('force'):
                raise LiteError('large','Large image: click Load image to receive it.',413)
            return {'ok':True,'mime':entry['mime'],'body':base64.b64encode(entry['body']).decode(),'size':len(entry['body'])}
        raise LiteError('op','Unsupported operation.')

    async def client(self,reader,writer):
        try:
            raw=await asyncio.wait_for(reader.readline(),25)
            if len(raw)>MAX_REQUEST:raise LiteError('size','Request is too large.',413)
            r=json.loads(raw)
            if not isinstance(r,dict):raise LiteError('request','Invalid request.')
            result=await self.dispatch(r)
        except LiteError as e:result={'ok':False,'code':e.code,'message':e.message,'status':e.status}
        except (ValueError,TypeError,KeyError):result={'ok':False,'code':'request','message':'Invalid request.','status':400}
        except (BrowserError,OSError,asyncio.TimeoutError):result={'ok':False,'code':'browser','message':'Browser Lite could not complete this request. Reconnect or use Browser.','status':503}
        except Exception:result={'ok':False,'code':'browser','message':'Browser Lite is unavailable.','status':503}
        try:
            writer.write(pack(result)+b'\n');await writer.drain()
        finally:writer.close();await writer.wait_closed()

    async def reap(self):
        while True:
            await asyncio.sleep(30)
            for sid,s in list(self.sessions.items()):
                if time.monotonic()-s.last_used>3600:
                    await s.close();del self.sessions[sid]
            if not self.sessions and time.monotonic()-self.last_used>900:
                os.kill(os.getpid(),signal.SIGTERM)

async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sock',required=True);parser.add_argument('--profile',required=True)
    args=parser.parse_args();os.umask(0o077)
    sock=Path(args.sock)
    if sock.exists():sock.unlink()
    Path(args.profile).mkdir(parents=True,exist_ok=True,mode=0o700)
    agent=Agent(args.profile)
    server=await asyncio.start_unix_server(agent.client,path=str(sock),limit=MAX_REQUEST+1)
    os.chmod(sock,0o600)
    asyncio.create_task(agent.reap())
    async with server:await server.serve_forever()

if __name__=='__main__':asyncio.run(main())
