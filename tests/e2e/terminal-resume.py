#!/usr/bin/env python3
"""Exercise incremental terminal replay through real ttyd and Playwright.

Requires Python Playwright, its browsers, and ttyd. Only disposable sessions
are started. Pass --browser-path when using a separately installed Chromium.
"""
import os, sys, time, subprocess, pathlib, socket, json, signal
from playwright.sync_api import sync_playwright
import argparse
parser = argparse.ArgumentParser(description='Disposable ttyd/browser test of cached scrollback recovery')
parser.add_argument('--browser-path')
parser.add_argument('--engine', choices=['chromium', 'webkit'], default='chromium')
args = parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[2]
script=root/'apps/everyday/terminal/vibetop-session'
instance=f'resume-test-{os.getpid()}'
path=f'/tmp/vibetop-session-{instance}.sock'
probe=socket.socket();probe.bind(('127.0.0.1',0));port=probe.getsockname()[1];probe.close()
import tempfile
logs=tempfile.TemporaryFile(mode='w+')
fixture_home=tempfile.TemporaryDirectory(prefix='vibetop-resume-home-')
daemon=subprocess.Popen([str(script),'serve',instance],stdout=logs,stderr=logs,start_new_session=True, cwd=fixture_home.name, env={**os.environ,'HOME':fixture_home.name})
ttyd=None
try:
 for _ in range(100):
  if os.path.exists(path+'.resume'):break
  time.sleep(.05)
 ttyd=subprocess.Popen(['/usr/bin/ttyd','-W','-i','127.0.0.1','-p',str(port),'-b','/t1','-t','rendererType=canvas','-t','scrollback=50000','-t','disableLeaveAlert=true',str(script),'attach',instance,'--resume'],stdout=logs,stderr=logs,start_new_session=True)
 with sync_playwright() as p:
  browser=getattr(p, args.engine).launch(headless=True, executable_path=args.browser_path, args=['--no-sandbox','--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets,LocalNetworkAccessChecksWebRTC'] if args.engine == 'chromium' else [])
  context=browser.new_context()
  page=context.new_page()
  page.on('pageerror',lambda error:print('PAGE ERROR',error,flush=True))
  def index(route):
   response=route.fetch()
   route.fulfill(response=response,body=response.text().replace('</head>','<script src="/terminal-resume.js"></script></head>'))
  page.route(f'http://127.0.0.1:{port}/t1/',index)
  page.route('**/terminal-resume.js',lambda r:r.fulfill(path=str(root/'apps/everyday/terminal/terminal-resume.js'),content_type='application/javascript'))
  page.route('**/api/me',lambda r:r.fulfill(json={'user':'resume-test'}))
  page.add_init_script('''window.wireBytes=0;const Native=window.WebSocket;window.WebSocket=function(...args){const ws=new Native(...args);window.activeSocket=ws;ws.addEventListener('message',e=>{if(e.isTrusted && e.data instanceof ArrayBuffer){window.wireBytes+=e.data.byteLength;} });return ws;};window.WebSocket.prototype=Native.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(k=>window.WebSocket[k]=Native[k]);''')
  time.sleep(.2)
  page.goto(f'http://127.0.0.1:{port}/t1/')
  page.wait_for_function("window.term && window.term.buffer.active.getLine(0)?.translateToString().length > 0",timeout=15000)
  page.evaluate("s => term.paste(s)", 'python3 -c \'for i in range(10000): print("HISTORY-%06d-"%i+"x"*80)\'')
  page.evaluate("s => activeSocket.send('0' + s)", '\r')
  def last_lines():
   return page.evaluate("Array.from({length:10},(_,i)=>term.buffer.active.getLine(Math.max(0,term.buffer.active.length-10+i))?.translateToString()).join('\\n')")
  for _ in range(100):
   if 'HISTORY-009999' in last_lines():break
   time.sleep(.1)
  assert 'HISTORY-009999' in last_lines(),last_lines()
  # Verify the generated history is durably cached before testing a warm reload.
  for _ in range(100):
   cached = page.evaluate("""() => new Promise(resolve => {
     const request = indexedDB.open('vt-terminal-output-v1', 1);
     request.onsuccess = () => {
       const read = request.result.transaction('output').objectStore('output').get('resume-test:/t1/');
       read.onsuccess = () => { request.result.close(); resolve({size:read.result?.size||0,offset:read.result?.offset}); };
     };
   })""")
   if cached['size'] >= 970000: break
   time.sleep(.1)
  assert cached['size'] >= 970000, cached
  before=page.evaluate('({bytes:wireBytes,lines:term.buffer.active.length})')
  page.reload()
  page.wait_for_function("window.term && Array.from({length:10},(_,i)=>term.buffer.active.getLine(Math.max(0,term.buffer.active.length-10+i))?.translateToString()).join('\\n').includes('HISTORY-009999')",timeout=15000)
  after=page.evaluate('({bytes:wireBytes,lines:term.buffer.active.length})')
  print(json.dumps({'first_load':before,'cached_reload':after}),flush=True)
  assert after['bytes']<10000,after
  assert after['lines']>=before['lines']-2,(before,after)
  page.evaluate("s => term.paste(s)", "printf 'DELTA-MARKER\\n'")
  page.evaluate("s => activeSocket.send('0' + s)", '\r')
  print('Input after resume works:', 'DELTA-MARKER' in last_lines(),flush=True)
  assert 'DELTA-MARKER' in last_lines()
  # Let output accumulate while this browser has no terminal connection.
  page.goto('about:blank')
  writer = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
  writer.connect(path)
  writer.sendall(b"printf 'MISSED-MARKER\\n'\r")
  time.sleep(.3)
  writer.close()
  page.goto(f'http://127.0.0.1:{port}/t1/')
  page.wait_for_function("window.term && Array.from({length:10},(_,i)=>term.buffer.active.getLine(Math.max(0,term.buffer.active.length-10+i))?.translateToString()).join('\\n').includes('MISSED-MARKER')",timeout=15000)
  missed = page.evaluate('({bytes:wireBytes,lines:term.buffer.active.length})')
  assert missed['bytes'] < 10000, missed
  print(json.dumps({'offline_delta':missed}), flush=True)
  # Alternate-screen applications must survive reconstruction too.
  full_screen = 'python3 -c \'import sys,time;sys.stdout.write("\\x1b[?1049h\\x1b[2J\\x1b[HFULL-SCREEN-MARKER");sys.stdout.flush();time.sleep(30)\''
  page.evaluate("s => term.paste(s)", full_screen)
  page.evaluate("s => activeSocket.send('0' + s)", '\r')
  page.wait_for_function("term.buffer.active.type === 'alternate'", timeout=10000)
  time.sleep(1)
  page.reload()
  time.sleep(1)
  page.wait_for_function("window.term && term.buffer.active.type === 'alternate' && Array.from({length:term.rows},(_,i)=>term.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('FULL-SCREEN-MARKER')", timeout=15000)
  print('Alternate screen survived cached reload', flush=True)
  browser.close()
finally:
 if ttyd:
  os.killpg(ttyd.pid,signal.SIGTERM);ttyd.wait(timeout=5)
 daemon.terminate();daemon.wait(timeout=5)
 for artifact in pathlib.Path('/tmp').glob(f'vibetop-session-{instance}.*'):
  artifact.unlink(missing_ok=True)
 logs.close()
 fixture_home.cleanup()
