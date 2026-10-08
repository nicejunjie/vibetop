#!/usr/bin/env python3
"""Exercise actual ttyd HTML with synthetic sockets; never attach a real PTY."""
import argparse, subprocess, json
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--chromium', required=True)
p.add_argument('--webkit', required=True)
a = p.parse_args()
name, value = subprocess.check_output(['sudo','-n','python3',str(root/'tools/mint-session-cookie.py'),'junjie'],text=True).strip().splitlines()[-1].split('=',1)
source = (root/'apps/everyday/terminal/terminal-connection.js').read_text()
with sync_playwright() as pw:
 for engine, exe in [(pw.chromium,a.chromium),(pw.webkit,a.webkit)]:
  browser = engine.launch(executable_path=exe,headless=True)
  ctx = browser.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True)
  ctx.add_cookies([{'name':name,'value':value,'url':'http://127.0.0.1'}])
  ctx.add_init_script("""const fetchOriginal=window.fetch;window.fetch=function(url,...args){if(String(url).includes('/api/clientlog'))return Promise.resolve(new Response('{}'));return fetchOriginal.call(this,url,...args)};window.testHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.testHidden});const originalNow=Date.now;window.clockOffset=0;Date.now=()=>originalNow()+window.clockOffset;""")
  page=ctx.new_page(); sockets=[]; delay=[False]
  page.route('**/terminal-profile.js*',lambda r:r.fulfill(body='',content_type='text/javascript'))
  page.route('**/terminal-connection.js*',lambda r:r.fulfill(body=source,content_type='text/javascript'))
  def socket(route):
   sockets.append(route); sent=[False]
   def message(_):
    if not sent[0]:
     sent[0]=True;route.send(b'2{}')
     if not delay[0]: route.send(b'0ready\r\n')
   route.on_message(message)
  page.route_web_socket('**/*',socket)
  page.goto('http://127.0.0.1/t4/');page.wait_for_function("window.term && term.buffer.active.getLine(0).translateToString().includes('ready')")
  for milliseconds in [100,500,5000,60000]:
   page.evaluate("() => {testHidden=true;document.dispatchEvent(new Event('visibilitychange'))}")
   page.evaluate('(ms)=>clockOffset+=ms',milliseconds)
   page.evaluate("() => {testHidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))}")
   page.wait_for_timeout(550)
   assert len(sockets)==1, 'healthy browser switch rebuilt transport'
  page.evaluate('clockOffset=0')
  import time
  start=time.monotonic();sockets[-1].close(code=1011)
  page.wait_for_function("window.term && term.buffer.active.getLine(0).translateToString().includes('ready')")
  page.wait_for_timeout(100)
  while len(sockets)<2:
   page.wait_for_timeout(50)
   assert time.monotonic()-start<2
  recovery=(time.monotonic()-start)*1000
  assert recovery<2000
  delay[0]=True;page.reload();page.wait_for_function('window.term');page.wait_for_timeout(300)
  count=len(sockets)
  page.evaluate('clockOffset=25000');page.wait_for_timeout(650)
  assert len(sockets)==count, 'slow first output aborted'
  sockets[-1].send(b'0slow link ready\r\n');page.wait_for_timeout(100)
  page.evaluate('clockOffset=90000');page.wait_for_timeout(650)
  assert len(sockets)==count, 'quiet established shell timed out'
  print(json.dumps({'browser':engine.name,'healthy_switches':4,'mock_closed_recovery_ms':round(recovery),'slow_first_output_ms':25000,'passed':True}),flush=True)
  browser.close()
