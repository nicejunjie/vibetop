#!/usr/bin/env python3
"""Reading-anchor regression against ttyd's actual page, with all WebSockets mocked.

Requires authenticated local vibetop, sudo cookie minting and Playwright browsers.
No real PTY connection, resize or input is sent. Output is entirely synthetic.
Use --source PATH --expect-broken to check a previous helper as a negative control.
"""
from pathlib import Path
import argparse
ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT/'apps/everyday/terminal/terminal-kbd.js')
parser.add_argument('--base', default='http://127.0.0.1')
parser.add_argument('--user', default='junjie')
parser.add_argument('--chromium', required=True)
parser.add_argument('--webkit', required=True)
parser.add_argument('--expect-broken', action='store_true')
args = parser.parse_args()
import json,subprocess,os
from playwright.sync_api import sync_playwright
cookie=subprocess.check_output(['sudo','-n','python3',str(ROOT/'tools/mint-session-cookie.py'),args.user],text=True).strip().splitlines()[-1]
name,value=cookie.split('=',1)
source=args.source.read_text()
lines=['history line '+str(i) for i in range(600)]
for start in [80,380]:
 lines[start:start+4]=['assistant','Response','----------------','unique passage '+str(start)]
with sync_playwright() as p:
 for engine,exe in [(p.chromium,args.chromium),(p.webkit,args.webkit)]:
  browser=engine.launch(executable_path=exe,headless=True)
  ctx=browser.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True)
  ctx.add_cookies([{'name':name,'value':value,'url':args.base}])
  page=ctx.new_page();sockets=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def phone_html(route):
   response=route.fetch();route.fulfill(response=response,body=response.text().replace('</head>', '<meta name=viewport content="width=device-width,initial-scale=1"></head>'))
  page.route(args.base+'/t4/',phone_html)
  # Disable profiling: unload keepalive requests can bypass Playwright routing.
  page.route('**/terminal-profile.js*',lambda r:r.fulfill(body='',content_type='text/javascript'))
  page.route('**/api/clientlog',lambda r:r.fulfill(json={}))
  page.route('**/terminal-kbd.js*',lambda r:r.fulfill(body=source,content_type='text/javascript'))
  def socket(route):
   sockets.append(route);sent=[False]
   def message(_):
    if not sent[0]:
     sent[0]=True;route.send(b'2{}');route.send(b'0'+('\r\n'.join(lines)+'\r\n').encode())
   route.on_message(message)
  page.route_web_socket('**/*',socket);page.goto(args.base+'/t4/')
  page.wait_for_function('window.term && window.term.buffer.active.baseY>450',timeout=4000);page.wait_for_timeout(700)
  page.evaluate("window.dispatchEvent(new WheelEvent('wheel'));term.scrollToLine(380)");page.wait_for_timeout(100)
  before_pixels=page.locator('.xterm-screen').screenshot()
  before=page.evaluate('({cols:term.cols,rows:term.rows,viewport:term.buffer.active.viewportY,reading:window.__vibetopTerminalReading()})')
  sockets[-1].send(b'0\x1b[3J\x1b[2J\x1b[H'+('\r\n'.join(lines[:200])+'\r\n').encode());page.wait_for_timeout(200)
  partial_pixels=page.locator('.xterm-screen').screenshot()
  held=page.evaluate("!!document.querySelector('[data-vt-reader-snapshot]')")
  partial=page.evaluate('({cols:term.cols,rows:term.rows,viewport:term.buffer.active.viewportY,reading:window.__vibetopTerminalReading()})')
  sockets[-1].send(b'0'+('\r\n'.join(lines[200:])+'\r\n').encode());page.wait_for_timeout(250)
  after=page.evaluate('({cols:term.cols,rows:term.rows,viewport:term.buffer.active.viewportY,reading:window.__vibetopTerminalReading(),line:term.buffer.active.getLine(term.buffer.active.viewportY+3).translateToString(true)})')
  print(json.dumps({'browser':engine.name,'before':before,'partial':partial,'held':held,'after':after,'errors':errors}),flush=True)
  if args.expect_broken:
   assert after['viewport']!=380,after
  else:
   assert held and before_pixels==partial_pixels,'partial redraw must preserve the displayed passage'
   assert after['viewport']==380 and after['line']=='unique passage 380',after
   page.wait_for_function("!document.querySelector('[data-vt-reader-snapshot]')")
   # A new scroll gesture must win even while the application is rebuilding.
   sockets[-1].send(b'0\x1b[3J\x1b[2J\x1b[H'+('\r\n'.join(lines[:200])+'\r\n').encode())
   page.wait_for_timeout(100)
   assert page.evaluate("!!document.querySelector('[data-vt-reader-snapshot]')")
   page.evaluate("window.dispatchEvent(new WheelEvent('wheel'));term.scrollToLine(40)")
   page.wait_for_timeout(80)
   assert not page.evaluate("!!document.querySelector('[data-vt-reader-snapshot]')")
   sockets[-1].send(b'0'+('\r\n'.join(lines[200:])+'\r\n').encode());page.wait_for_timeout(100)
   assert page.evaluate('term.buffer.active.viewportY')==40
   # A deleted passage cannot leave a stale snapshot over the live terminal.
   page.evaluate("window.dispatchEvent(new WheelEvent('wheel'));term.scrollToLine(380)");page.wait_for_timeout(100)
   sockets[-1].send(b'0\x1b[3J\x1b[2J\x1b[Hfirst replacement line\r\n')
   page.wait_for_timeout(100)
   assert page.evaluate("!!document.querySelector('[data-vt-reader-snapshot]')")
   page.wait_for_timeout(2200)
   assert not page.evaluate("!!document.querySelector('[data-vt-reader-snapshot]')")
   assert not errors,errors
   print(json.dumps({'browser':engine.name,'pixels_preserved':True,'navigation_yields':True,'snapshot_expiry':True,'real_pty_connections':0}),flush=True)
  ctx.close();browser.close()
