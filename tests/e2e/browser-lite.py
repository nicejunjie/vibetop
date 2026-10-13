#!/usr/bin/env python3
"""Host-safe Browser Lite end-to-end: independent profiles and fixture HTTP only.
Run with the optional runtime's Python; pass --engine webkit for a mobile client.
No production browser/session/network settings are changed.
"""
import argparse
import asyncio
import base64
import contextlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'apps/everyday/browser-lite/backend'))
from agent import Agent
from playwright.async_api import async_playwright
parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['chromium','webkit'],default='chromium')
parser.add_argument('--public',action='store_true');parser.add_argument('--throttle',action='store_true');args=parser.parse_args()
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=')
HTML='''<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body>
<svg width="20" height="20"><path d="M0 0L20 20"/></svg><h1>Remote fixture</h1><p id="dynamic">Starting</p><a id="hashlink" href="#bottom">Jump down</a><button id="increment">Increment</button><span id="counter">0</span><button id="confirm">Confirm</button><span id="confirmresult"></span>
<form id="form"><label>Search<input id="search" name="search"></label><button id="submit">Submit</button></form><p id="result"></p>
<input id="secret" type="password" value="never-mirror-password"><p><input id="checkbox" type="checkbox"> Checkbox</p><select id="select"><option value="a">Alpha</option><option value="b">Beta</option></select>
<canvas id="unsupported" width="100" height="50"></canvas><div id="imagebox"></div><img id="slowimage" src="/slow.png" alt="Slow image"><div style="height:1800px">Long page</div><p id="bottom">Bottom</p>
<script>window.remoteOnly=true;document.cookie='assetcookie=yes';document.querySelector('#dynamic').textContent='Remote JavaScript ran';
let n=0;document.querySelector('#increment').onclick=()=>document.querySelector('#counter').textContent=++n;
document.querySelector('#confirm').onclick=()=>document.querySelector('#confirmresult').textContent=confirm('Continue?')?'Accepted':'Declined';
document.querySelector('#form').onsubmit=e=>{e.preventDefault();document.querySelector('#result').textContent='Submitted '+document.querySelector('#search').value;};
const im=document.createElement('img');im.id='authimage';im.alt='Authenticated image';im.src='/auth.png';document.querySelector('#imagebox').append(im);
</script></body></html>'''

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def answer(self,status,body,mime='application/json'):
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.end_headers()
        with contextlib.suppress(BrokenPipeError,ConnectionResetError):self.wfile.write(body)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/me':return self.answer(200,b'{"user":"qa"}')
        if path=='/fixture':return self.answer(200,HTML.encode(),'text/html')
        if path=='/fixture.css':return self.answer(200,b'body{font-family:system-ui;color:rgb(10,60,100)}h1{font-size:28px}button,input{font-size:18px;padding:12px}','text/css')
        if path=='/slow.png':time.sleep(1.8);return self.answer(200,PNG,'image/png')
        if path=='/auth.png':return self.answer(200 if 'assetcookie=yes' in self.headers.get('Cookie','') else 403,PNG,'image/png')
        if path.startswith('/exfil'):self.server.exfil+=1;return self.answer(200,b'')
        target=ROOT/'apps/everyday/browser-lite'/path.lstrip('/')
        if not target.is_file() or target.parent!=ROOT/'apps/everyday/browser-lite':return self.answer(404,b'')
        return self.answer(200,target.read_bytes(),'text/html' if target.suffix=='.html' else 'application/javascript')
    def do_POST(self):
        if self.headers.get('Origin')=='null':return self.answer(403,b'{"ok":false}')
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));data['op']=self.path.split('/')[-1]
        try:
            result=asyncio.run_coroutine_threadsafe(self.server.agent.dispatch(data),self.server.loop).result(30)
            status=200 if result.get('ok') else result.get('status',503)
        except Exception as e:result={'ok':False,'message':str(e),'code':getattr(e,'code','error')};status=getattr(e,'status',503)
        if data['op']=='updates':self.server.update_bytes.append(len(json.dumps(result).encode()))
        self.answer(status,json.dumps(result).encode())

async def check():
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/opt/vibetop/browser-lite/browsers')
    with tempfile.TemporaryDirectory(prefix='browser-lite-e2e-') as profile:
        agent=Agent(profile);server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        server.agent=agent;server.loop=asyncio.get_running_loop();server.exfil=0;server.update_bytes=[]
        threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
        async with async_playwright() as p:
            options={'headless':True}
            if args.engine=='chromium':options.update(channel='chromium',chromium_sandbox=True)
            else:options['executable_path']='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh'
            browser=await getattr(p,args.engine).launch(**options)
            context=await browser.new_context(viewport={'width':1100,'height':850} if args.engine=='chromium' else {'width':390,'height':844},has_touch=args.engine=='webkit')
            page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            wire=[]
            if args.throttle and args.engine=='chromium':
                network=await context.new_cdp_session(page);await network.send('Network.enable')
                network.on('Network.loadingFinished',lambda r:wire.append(r.get('encodedDataLength',0)))
                await network.send('Network.emulateNetworkConditions',{'offline':False,'latency':400,'downloadThroughput':50000,'uploadThroughput':20000})
            started=time.monotonic()
            try:
                await page.goto(base+'/browser-lite.html');await page.locator('#address').fill(base+'/fixture');await page.locator('#address').press('Enter')
                frame=page.frame_locator('#page');await frame.locator('#dynamic').filter(has_text='Remote JavaScript ran').wait_for(timeout=20000)
                assert await frame.locator('h1').evaluate('(n)=>getComputedStyle(n).color')=='rgb(10, 60, 100)'
                if args.throttle:
                    print('400kbps/400ms first styled content:',round(time.monotonic()-started,2),'s,',int(sum(wire)),'wire bytes')
                    before=sum(wire);await page.wait_for_timeout(10000);print('10sec idle additional wire bytes:',int(sum(wire)-before))
                assert '[path' not in await frame.locator('body').inner_text()
                assert await frame.locator('body').evaluate('()=>typeof window.remoteOnly')=='undefined'
                assert await frame.locator('#secret').input_value()==''
                assert await frame.locator('body').evaluate('()=>{try{return parent.document.cookie;}catch(e){return "blocked";}}')=='blocked'
                await page.locator('#images').check();await asyncio.wait_for(frame.locator('#slowimage').evaluate('(n)=>new Promise(resolve=>{const done=()=>{if(n.naturalWidth===1)resolve();else setTimeout(done,50);};done();})'),10)
                await page.locator('#images').uncheck()
                await frame.locator('#increment').click();await frame.locator('#counter').filter(has_text='1').wait_for(timeout=10000)
                await frame.locator('#search').fill('flight');await frame.locator('#search').press('Enter')
                await frame.locator('#result').filter(has_text='Submitted flight').wait_for(timeout=10000)
                await frame.locator('#confirm').click();await page.locator('#dialog').wait_for(timeout=10000);dialog_at=time.monotonic();await page.locator('#dialogok').click();await frame.locator('#confirmresult').filter(has_text='Accepted').wait_for(timeout=10000);assert time.monotonic()-dialog_at<2.5
                await frame.locator('#checkbox').check();await frame.locator('#select').select_option('b')
                remote=next(iter(agent.sessions.values()))
                await remote.page.wait_for_function("document.querySelector('#checkbox').checked && document.querySelector('#select').value === 'b'",timeout=12000)
                assert await remote.page.locator('#checkbox').is_checked()
                assert await remote.page.locator('#select').input_value()=='b'
                assert await frame.locator('#authimage').evaluate('(n)=>n.naturalWidth')==0
                await page.locator('#images').check()
                await page.wait_for_timeout(1200)
                assert await frame.locator('#authimage').evaluate('(n)=>n.naturalWidth')==1
                assert await frame.locator('body').inner_text() and 'canvas' in await frame.locator('body').inner_text()
                await frame.locator('#bottom').scroll_into_view_if_needed();await remote.page.wait_for_function('scrollY>500',timeout=12000)
                assert await remote.page.evaluate('scrollY')>500
                prior_epoch=remote.epoch;await frame.locator('#hashlink').click();await remote.page.wait_for_url('**#bottom',timeout=12000)
                assert remote.epoch==prior_epoch and remote.styles and len(remote.nodes)>0
                await asyncio.wait_for(frame.locator('body').evaluate('()=>new Promise(resolve=>{const check=()=>scrollY>500?resolve():setTimeout(check,50);check();})'),10)
                assert await frame.locator('h1').evaluate('(n)=>getComputedStyle(n).color')=='rgb(10, 60, 100)'
                # A refresh reconnects to the same remote page, retaining its JS state.
                sid=remote.id;await page.reload()
                try:await frame.locator('#counter').filter(has_text='1').wait_for(timeout=20000)
                except Exception:
                    print('Reload debug:',await page.locator('body').inner_text(), 'session state',len(remote.nodes),remote.epoch,remote.meta)
                    await page.screenshot(path='/tmp/browser-lite-reload-failure.png');raise
                assert sid in agent.sessions and len(agent.sessions)==1
                # Forged webpage content cannot execute JS or make external requests.
                await frame.locator('body').evaluate('''n=>{const s=document.createElement('script');s.textContent="window.injectionRan=true";document.head.appendChild(s);const st=document.createElement('style');st.textContent='body{background-image:url(/exfil-css)}';document.head.appendChild(st);fetch('/exfil-fetch').catch(()=>{});}''')
                await page.wait_for_timeout(300)
                assert await frame.locator('body').evaluate('()=>window.injectionRan') is None
                assert server.exfil==0
                # Duplicate tab: new attachment supersedes old, no ACK/reconnect pingpong.
                duplicate=await context.new_page()
                await duplicate.add_init_script('sessionStorage.setItem("vibetop:browser-lite:qa",'+json.dumps(sid)+');')
                await duplicate.goto(base+'/browser-lite.html')
                df=duplicate.frame_locator('#page');await df.locator('#counter').filter(has_text='1').wait_for(timeout=15000)
                await page.locator('#cover h1').filter(has_text='Open in another window').wait_for(timeout=5000)
                assert len(agent.sessions)==1
                await duplicate.reload();await df.locator('#counter').filter(has_text='1').wait_for(timeout=15000)
                assert len(agent.sessions)==1
                await duplicate.screenshot(path='/tmp/browser-lite-'+args.engine+'.png')
                assert not errors,errors
                print(args.engine,'PASS: remote JS/styles, trusted click, fill-before-Enter, checkbox/select, authenticated image, local scroll, reload, takeover, CSP/opaque isolation')
                print('Update response sizes:',server.update_bytes,'total',sum(server.update_bytes),'bytes')
                if args.public:
                    await duplicate.locator('#address').fill('https://en.wikipedia.org/wiki/Browser_engine');await duplicate.locator('#address').press('Enter')
                    await df.locator('body').filter(has_text='Browser engine').wait_for(timeout=25000)
                    await duplicate.wait_for_timeout(2500)
                    public_session=agent.sessions[sid]
                    print('Public styles:',len(public_session.styles),'stylesheet headers',len(public_session.css_headers),'sizes',[len(s) for s in public_session.styles])
                    print('Remote computed style:',await public_session.page.locator('body').evaluate('(n)=>getComputedStyle(n).fontFamily'))
                    print('Client computed style:',await df.locator('body').evaluate('(n)=>getComputedStyle(n).fontFamily'))
                    await duplicate.screenshot(path='/tmp/browser-lite-public-'+args.engine+'.png')
                    print('Public Wikipedia article rendered')
            finally:
                await context.close();await browser.close()
                for s in list(agent.sessions.values()):await s.close()
                if agent.context:await agent.context.close()
                if hasattr(agent,'pw'):await agent.pw.stop()
                server.shutdown()

if __name__=='__main__':asyncio.run(check())
