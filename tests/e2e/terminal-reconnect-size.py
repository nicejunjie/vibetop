#!/usr/bin/env python3
"""Mobile reconnect must claim visible geometry without any user interaction.
Actual ttyd HTML, mocked transports: no real terminal resize or input is sent.
"""
import argparse,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,default=root/'apps/everyday/terminal/terminal-kbd.js')
p.add_argument('--chromium',required=True);p.add_argument('--webkit',required=True)
p.add_argument('--expect-broken',action='store_true');a=p.parse_args()
name,value=subprocess.check_output(['sudo','-n','python3',str(root/'tools/mint-session-cookie.py'),'junjie'],text=True).strip().splitlines()[-1].split('=',1)
with sync_playwright() as pw:
 for engine,exe in [(pw.chromium,a.chromium),(pw.webkit,a.webkit)]:
  browser=engine.launch(executable_path=exe,headless=True)
  ctx=browser.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True)
  ctx.add_cookies([{'name':name,'value':value,'url':'http://127.0.0.1'}])
  ctx.add_init_script("window.testHidden=false;Object.defineProperty(document,'hidden',{get:()=>testHidden});const f=window.fetch;window.fetch=function(u,...a){return String(u).includes('/api/clientlog')?Promise.resolve(new Response('{}')):f.call(this,u,...a)}")
  page=ctx.new_page();sockets=[];claims=[];inputs=[]
  def html(route):
   r=route.fetch();route.fulfill(response=r,body=r.text().replace('</head>','<meta name=viewport content="width=device-width,initial-scale=1"></head>'))
  page.route('http://127.0.0.1/t4/',html)
  page.route('**/terminal-profile.js*',lambda r:r.fulfill(body='',content_type='text/javascript'))
  page.route('**/terminal-kbd.js*',lambda r:r.fulfill(body=a.source.read_text(),content_type='text/javascript'))
  def socket(route):
   sockets.append(route);initialized=[False];n=len(sockets)
   def message(data):
    if not initialized[0]:
     initialized[0]=True;route.send(b'2{}');route.send(b'0'+('\r\n'.join('replay '+str(i) for i in range(300))+'\r\npassive old layout').encode())
    elif isinstance(data,bytes) and data[:1]==b'1':
     shape=json.loads(data[1:]);claims.append((n,shape))
     route.send(b'0\x1b[3J\x1b[2J\x1b[H'+('\r\n'.join('current '+str(i) for i in range(300))+'\r\ncurrent prompt').encode())
    elif isinstance(data,bytes) and data[:1]==b'0':inputs.append(data)
   route.on_message(message)
  page.route_web_socket('**/*',socket);page.goto('http://127.0.0.1/t4/')
  page.wait_for_function('window.term && term.buffer.active.baseY>200');page.wait_for_timeout(1800)
  if a.expect_broken:
   claims.clear();sockets[-1].close(code=1011);page.wait_for_timeout(1600)
   assert not claims,'negative control already claimed geometry on reconnect'
   print(json.dumps({'browser':engine.name,'missing_claim_reproduced':True}),flush=True);browser.close();continue
  claims.clear();page.evaluate('window.savedTerm=term');sockets[-1].close(code=1011);page.wait_for_timeout(1600)
  assert len(claims)==2,claims
  assert page.evaluate('term.buffer.active.baseY===term.buffer.active.viewportY')
  assert page.evaluate("term.buffer.active.getLine(term.buffer.active.baseY+term.buffer.active.cursorY).translateToString(true)==='current prompt'")
  page.evaluate('window.savedTerm=term')
  sockets[-1].close(code=1011)
  page.wait_for_timeout(1600)
  assert len(sockets)==3 and len(claims)==4,(len(sockets),claims)
  assert page.evaluate('savedTerm===term && term.buffer.active.baseY===term.buffer.active.viewportY')
  # Intentionally reading before the replay-idle callback must win.
  sockets[-1].close(code=1011);page.wait_for_timeout(150)
  page.evaluate("window.dispatchEvent(new WheelEvent('wheel'));term.scrollToLine(20)")
  count=len(claims);page.wait_for_timeout(1000)
  assert len(claims)==count and page.evaluate('term.buffer.active.viewportY')==20
  # An already-open connection can finish replay while the browser is hidden.
  sockets[-1].close(code=1011);page.wait_for_timeout(150)
  page.evaluate("testHidden=true;document.dispatchEvent(new Event('visibilitychange'))")
  count=len(claims);page.wait_for_timeout(1100)
  assert len(claims)==count, 'background replay stole geometry ownership'
  page.evaluate("testHidden=false;document.dispatchEvent(new Event('visibilitychange'))")
  page.wait_for_timeout(700)
  assert len(claims)==count+2, 'foreground did not restore visible geometry'
  assert not inputs
  print(json.dumps({'browser':engine.name,'automatic_claims':4,'latest_without_gesture':True,'history_preserved':True}),flush=True)
  browser.close()
