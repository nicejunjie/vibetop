#!/usr/bin/env python3
"""Verify actual image decode and resource isolation in the real Lite transport."""
import argparse,asyncio,base64,importlib.util,json,os,struct,sys,tempfile,threading,time,zlib
from pathlib import Path
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['chromium','webkit'],default='chromium');parser.add_argument('--throttle',action='store_true');parser.add_argument('--google',action='store_true');args=parser.parse_args()
saved=sys.argv;sys.argv=[saved[0]]
spec=importlib.util.spec_from_file_location('lite_e2e',Path(__file__).with_name('browser-lite.py'));common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common);sys.argv=saved
from playwright.async_api import async_playwright
PNG=common.PNG
# A valid uncompressible 320x320 PNG, above the explicit large-image threshold.
def chunk(k,data):return struct.pack('!I',len(data))+k+data+struct.pack('!I',zlib.crc32(k+data)&0xffffffff)
LARGE=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',320,320,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+os.urandom(960) for _ in range(320))))+chunk(b'IEND',b'')
HTML='''<!doctype html><html><head><link rel="stylesheet" href="/images.css"></head><body>
<h1>Image acceptance</h1><textarea id="query" role="combobox" rows="1" onkeydown="if(event.key==='Enter'){event.preventDefault();document.querySelector('#queryresult').textContent=this.value;}"></textarea><p id="queryresult"></p>
<svg id="vector" width="40" height="40" viewBox="0 0 40 40" aria-label="Vector image"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><rect id="vectorrect" width="40" height="40" fill="url(#paint)"/><script>fetch('/exfil-svg')</script><foreignObject><script>fetch('/exfil-foreign')</script></foreignObject></svg>
<img id="bigdata" src="BIGDATA" width="40" height="40">

<img id="ordinary" src="/pixel.png" alt="ordinary">
<img id="sized" width="40" height="40" src="/pixel.png?sized">
<img id="responsive" src="/pixel.png?fallback" srcset="/pixel.png?responsive 1x, /pixel.png?retina 2x">
<img id="streamed" src="/streamed.png" width="40" height="40">
<img id="delayed" src="/delayed.png" width="40" height="40">
<img id="redirect" src="/redirect.png" width="40" height="40">
<img id="inline" src="data:image/png;base64,PNG">
<img id="blob" alt="blob" width="40" height="40">
<img id="dynamic" src="/pixel.png?old" width="40" height="40">
<img id="svg" src="/safe.svg" width="40" height="40">
<img id="broken" src="/missing.png" alt="missing" width="40" height="40">
<div id="background" style="width:40px;height:40px;background-image:url('/pixel.png?background')"></div>
<div id="externalbackground" style="width:40px;height:40px"></div>
<button id="change" onclick="document.querySelector('#dynamic').src='/pixel.png?changed'">Change image</button>
<div style="height:1600px">Scroll down</div>
<img id="lazy" loading="lazy" src="/pixel.png?lazy" width="40" height="40">
<img id="jslazy" data-src="/pixel.png?jslazy" width="40" height="40">
<img id="large" src="/large.png" width="40" height="40">
<script>
const png=Uint8Array.from(atob('PNG'),c=>c.charCodeAt(0));
document.querySelector('#blob').src=URL.createObjectURL(new Blob([png],{type:'image/png'}));
new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting)e.target.src=e.target.dataset.src;}).observe(document.querySelector('#jslazy'));
</script></body></html>'''.replace('PNG',base64.b64encode(PNG).decode()).replace('BIGDATA','data:image/png;base64,'+base64.b64encode(PNG+b'X'*20000).decode())
class Handler(common.Handler):
 def do_GET(self):
  path=self.path.split('?')[0]
  if path.startswith('/exfil'):
   if '/image-fixture' not in self.headers.get('Referer',''):self.server.exfil+=1
   return self.answer(200,b'')
  if path=='/image-fixture':return self.answer(200,HTML.encode(),'text/html')
  if path=='/images.css':return self.answer(200,b'body{font-family:system-ui}img{margin:6px}#externalbackground{background-image:url(/pixel.png?external)}','text/css')
  if path=='/pixel.png':return self.answer(200,PNG,'image/png')
  if path=='/streamed.png':
   self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(PNG)));self.end_headers();self.wfile.write(PNG[:20]);self.wfile.flush();time.sleep(4);self.wfile.write(PNG[20:]);return
  if path=='/delayed.png':time.sleep(3);return self.answer(200,PNG,'image/png')
  if path=='/redirect.png':self.send_response(302);self.send_header('Location','/pixel.png?redirected');self.send_header('Content-Length','0');self.end_headers();return
  if path=='/large.png':return self.answer(200,LARGE,'image/png')
  if path=='/safe.svg':return self.answer(200,b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>','image/svg+xml')
  return super().do_GET()
async def main():
 os.environ['PLAYWRIGHT_BROWSERS_PATH']='/opt/vibetop/browser-lite/browsers'
 with tempfile.TemporaryDirectory(prefix='lite-image-qa-') as profile:
  agent=common.Agent(profile);server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.agent=agent;server.loop=asyncio.get_running_loop();server.exfil=0;server.update_bytes=[]
  threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
  async with async_playwright() as p:
   options={'headless':True}
   if args.engine=='chromium':options.update(channel='chromium',chromium_sandbox=True)
   else:options['executable_path']='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh'
   browser=await getattr(p,args.engine).launch(**options);context=await browser.new_context(viewport={'width':1100,'height':850} if args.engine=='chromium' else {'width':390,'height':844},has_touch=args.engine=='webkit');page=await context.new_page();failures=[]
   if args.throttle:
    cdp=await context.new_cdp_session(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':400,'downloadThroughput':50000,'uploadThroughput':20000})
   async def image(name):
    try:
     await asyncio.wait_for(page.frame_locator('#page').locator('#'+name).evaluate('(n)=>new Promise(resolve=>{function check(){if(n.complete&&n.naturalWidth>0)resolve();else setTimeout(check,50);}check();})'),12)
     print(name,'DECODED',flush=True)
    except Exception:
     remote=next(iter(agent.sessions.values()));original=await remote.page.locator('#'+name).evaluate('(n)=>({complete:n.complete,width:n.naturalWidth,src:n.currentSrc||n.src})');local=await page.frame_locator('#page').locator('#'+name).evaluate('(n)=>({complete:n.complete,width:n.naturalWidth,src:n.src,rid:n.__resource,rect:n.getBoundingClientRect().toJSON(),scroll:scrollY})');print(name,'FAIL','remote',original,'local',local,flush=True);failures.append(name);rid=remote.url_ids.get(original['src']);print('Resource state',rid,{k:v for k,v in remote.resources.get(rid,{}).items() if k!='body'},'body bytes',len(remote.resources.get(rid,{}).get('body') or b''),'node',next((n for n in remote.nodes if n.get('attrs',{}).get('id')==name),None),flush=True)
   try:
    await page.goto(base+'/browser-lite.html');await page.locator('#address').fill(base+'/image-fixture');await page.locator('#address').press('Enter');await page.frame_locator('#page').locator('h1').wait_for(timeout=25000)
    assert await page.locator('#images').is_checked()
    await page.locator('#images').check()
    assert await page.frame_locator('#page').locator('#vector').evaluate('(n)=>n.namespaceURI')=='http://www.w3.org/2000/svg'
    assert await page.frame_locator('#page').locator('#vectorrect').evaluate('(n)=>n.getBBox().width')==40
    assert await page.frame_locator('#page').locator('#vector script').count()==0
    for name in ['ordinary','sized','responsive','streamed','delayed','redirect','inline','bigdata','blob','dynamic','svg']:await image(name)
    for name in ['background','externalbackground']:
     try:
      await asyncio.wait_for(page.frame_locator('#page').locator('#'+name).evaluate('(n)=>new Promise(resolve=>{function check(){if(getComputedStyle(n).backgroundImage.includes("blob:"))resolve();else setTimeout(check,50);}check();})'),12);print(name,'BLOB LOADED',flush=True)
     except Exception:failures.append(name);print(name,'FAIL',flush=True)
    await page.frame_locator('#page').locator('#change').click();await image('dynamic')
    for name in ['lazy','jslazy']:
     await page.frame_locator('#page').locator('#'+name).scroll_into_view_if_needed();await image(name)
    await page.frame_locator('#page').locator('#large').scroll_into_view_if_needed()
    try:
     await page.frame_locator('#page').get_by_role('button',name='Load image',exact=True).click(timeout=12000);await image('large')
    except Exception:failures.append('large-button');print('large-button FAIL',flush=True)
    await page.screenshot(path='/tmp/browser-lite-images-'+args.engine+'.png')
    await page.frame_locator('#page').locator('#query').fill('semantic search');await page.frame_locator('#page').locator('#query').press('Enter')
    await page.frame_locator('#page').locator('#queryresult').filter(has_text='semantic search').wait_for(timeout=12000)
    assert server.exfil==0,server.exfil
    await page.locator('#images').uncheck();assert await page.frame_locator('#page').locator('#ordinary').evaluate('(n)=>n.naturalWidth')==0
    await page.locator('#images').check();await image('ordinary')
    await page.reload();await page.frame_locator('#page').locator('h1').wait_for(timeout=25000);assert await page.locator('#images').is_checked()
    await page.frame_locator('#page').locator('#ordinary').scroll_into_view_if_needed();await image('ordinary')
    print('IMAGE FAILURES',failures,flush=True)
    assert not failures,failures
    if args.google:
     f=page.frame_locator('#page')
     await page.locator('#address').fill('https://www.google.com/');await page.locator('#address').press('Enter')
     await asyncio.wait_for(f.locator('body').evaluate('()=>new Promise(resolve=>{function check(){if([...document.querySelectorAll("svg")].some(n=>n.getBoundingClientRect().width>=200))resolve();else setTimeout(check,100);}check();})'),30)
     await page.screenshot(path='/tmp/browser-lite-google-'+args.engine+'.png');print('Google homepage: logo and icons rendered',flush=True)
     field=f.locator('textarea[name="q"],input[name="q"]').first;await field.fill('red panda');await field.press('Enter')
     remote=next(iter(agent.sessions.values()));await remote.page.wait_for_url('**/search?**',wait_until='domcontentloaded',timeout=30000)
     await f.locator('body').filter(has_text='red panda').wait_for(timeout=30000)
     await page.screenshot(path='/tmp/browser-lite-google-search-'+args.engine+'.png');print('Google search: fill + Enter + result page PASS',flush=True)
     await page.locator('#address').fill('https://www.google.com/search?tbm=isch&q=red+panda');await page.locator('#address').press('Enter')
     await asyncio.wait_for(f.locator('body').evaluate('()=>new Promise(resolve=>{function check(){if([...document.images].filter(n=>n.naturalWidth>20).length>=3)resolve();else setTimeout(check,100);}check();})'),35)
     count=await f.locator('body').evaluate('()=>[...document.images].filter(n=>n.naturalWidth>20).length')
     await page.screenshot(path='/tmp/browser-lite-google-images-'+args.engine+'.png');print('Google image results:',count,'actual decoded thumbnails',flush=True)
   except Exception:
    remote=next(iter(agent.sessions.values()));print('FAILURE state',remote.page.url,remote.meta,'REMOTE TEXT',(await remote.page.locator('body').inner_text())[:800],'CLIENT TEXT',(await page.locator('body').inner_text())[:300],flush=True)
    await page.screenshot(path='/tmp/browser-lite-failure-'+args.engine+'.png');raise
   finally:
    await browser.close()
    for s in list(agent.sessions.values()):await s.close()
    if agent.context:await agent.context.close()
    if hasattr(agent,'pw'):await agent.pw.stop()
    server.shutdown()
asyncio.run(main())
