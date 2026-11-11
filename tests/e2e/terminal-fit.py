#!/usr/bin/env python3
"""Real ttyd regression: the terminal grid always fits its frame.

ttyd re-fits only from a window 'resize' listener that exists while its socket
is open, so a frame resized during a connection gap used to keep a stale grid
(rows cut off below the frame, or a blank band underneath) and send that stale
size to the PTY on reconnect. terminal-kbd.js now owns the fit; this drives the
gaps for real: a private ttyd on a spare port, the same injected scripts as
prod, stopped and restarted under a live page.

Requires Playwright browsers and ttyd. Touches no vibetop session or service.
    python tests/e2e/terminal-fit.py [--engine webkit|chromium]
webkit runs as an iPhone with the touch code paths; chromium as a desktop.
"""
import argparse
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
TERM = ROOT / 'apps/everyday/terminal'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--engine', choices=['chromium', 'webkit'], default='webkit')
parser.add_argument('--executable', help='browser binary, if Playwright cannot find its own')
args = parser.parse_args()
touch = args.engine == 'webkit'

with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    PORT = probe.getsockname()[1]
tmp = pathlib.Path(tempfile.mkdtemp(prefix='vibetop-fit-test-'))
index = tmp / 'index.html'


def serve(custom):
    cmd = ['ttyd', '-W', '-i', '127.0.0.1', '-p', str(PORT)]
    if custom:
        cmd += ['-I', str(index)]
    cmd += ['-t', 'rendererType=canvas', '-t', 'reconnect=3', '-t', 'disableLeaveAlert=true',
            'bash', '--norc', '--noprofile']
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(('127.0.0.1', PORT), timeout=0.2).close()
            return proc
        except OSError:
            time.sleep(0.1)
    proc.kill()
    sys.exit('ttyd did not start')


def inline(path):
    return '<script>' + path.read_text().replace('</script>', '<\\/script>') + '</script>'


# ttyd's own page, with what server/install.sh's sub_filter injects in prod.
srv = serve(False)
page_src = urllib.request.urlopen(f'http://127.0.0.1:{PORT}/').read().decode('utf-8', 'surrogateescape')
srv.kill(); srv.wait()
anchor = 'this.terminal=new'
if anchor not in page_src:
    sys.exit('ttyd page has no "this.terminal=new" anchor (unsupported ttyd version)')
page_src = page_src.replace(anchor, '(window.__vibetopTtyd=this),' + anchor)
STUB = '''<script>(function(){
if(/touch/.test(location.hash)){var mm=window.matchMedia.bind(window);window.matchMedia=function(q){
  if(/pointer:\\s*coarse/.test(q))return{matches:true,media:q,addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){}};
  return mm(q)}}
window.__posts=[];var f=window.fetch.bind(window);window.fetch=function(u,o){
  if(typeof u==="string"&&u.indexOf("/api/")===0){try{window.__posts.push(JSON.parse(o.body))}catch(e){}
    return Promise.resolve(new Response("{}"))}
  return f(u,o)}})();</script>'''
inject = STUB + inline(TERM / 'terminal-connection.js') + inline(TERM / 'lib/kbd-input.js') + inline(TERM / 'terminal-kbd.js')
index.write_text(page_src.replace('</head>', inject + '</head>', 1), errors='surrogateescape')

STATE = """() => { const t = window.term, o = window.__vibetopTtyd; if (!t || !o) return null;
  let p = null; try { p = o.fitAddon.proposeDimensions(); } catch (e) {}
  return { rows: t.rows, cols: t.cols, want: p ? [p.cols, p.rows] : null,
           h: Math.round(t.element.getBoundingClientRect().height),
           sock: o.socket ? o.socket.readyState : null }; }"""
OUTER = ('<body style="margin:0"><div id=box style="height:700px;position:relative">'
         '<iframe id=f style="position:absolute;inset:0;width:100%%;height:100%%;border:0" '
         'src="http://127.0.0.1:%d/%s"></iframe></div></body>')
failures = []

srv = serve(True)
try:
    with sync_playwright() as pw:
        launch = {'executable_path': args.executable} if args.executable else {}
        if touch:
            browser = pw.webkit.launch(**launch)
            ctx = browser.new_context(**pw.devices['iPhone 14 Pro Max'])
        else:
            browser = pw.chromium.launch(**launch)
            ctx = browser.new_context(viewport={'width': 1100, 'height': 800})
        page = ctx.new_page()
        page.set_content(OUTER % (PORT, '#touch' if touch else ''))

        def frame():
            return [f for f in page.frames if str(PORT) in f.url][0]

        def state():
            try:
                return frame().evaluate(STATE)
            except Exception:
                return None

        def wait(pred, ms=20000):
            end = time.time() + ms / 1000
            while time.time() < end:
                s = state()
                if s and pred(s):
                    return s
                page.wait_for_timeout(100)   # pumps events; time.sleep would not
            return state()

        def box(h):
            page.evaluate("h => { document.getElementById('box').style.height = h + 'px'; }", h)

        def show(on):
            page.evaluate("on => { document.getElementById('f').style.display = on ? 'block' : 'none'; }", on)

        def check(name, settle=2600):
            page.wait_for_timeout(settle)       # longer than the 2s watchdog
            s = state()
            ok = bool(s and s['want'] and s['want'] == [s['cols'], s['rows']])
            print('PASS' if ok else 'FAIL', name, s, flush=True)
            if not ok:
                failures.append(name)

        def restart_during(change):
            global srv
            srv.kill(); srv.wait()
            wait(lambda s: s['sock'] != 1, 5000)
            change()
            page.wait_for_timeout(300)
            srv = serve(True)

        wait(lambda s: s['sock'] == 1)
        page.wait_for_timeout(800)

        box(596)
        check('resize while connected', 900)

        # The frame shrinks while the socket is down: the bottom rows used to
        # stay cut off, and the stale size went to the PTY on reconnect.
        box(700); page.wait_for_timeout(700)
        restart_during(lambda: box(560))
        s = wait(lambda s: s['sock'] == 1)
        check('frame shrinks during a connection gap')
        if s and s['sock'] == 1:
            frame().evaluate("() => window.term.input('stty size\\r', true)")
            page.wait_for_timeout(900)
            said = frame().evaluate("""() => { const t = window.term, b = t.buffer.active, out = [];
              for (let i = 0; i < t.rows; i++) { const l = b.getLine(b.viewportY + i); if (l) out.push(l.translateToString(true)); }
              return out.filter(x => /^\\d+ \\d+$/.test(x)).pop() || null; }""")
            g = state()
            ok = said == '%d %d' % (g['rows'], g['cols'])
            print('PASS' if ok else 'FAIL', 'PTY size matches the grid after reconnect', said, flush=True)
            if not ok:
                failures.append('pty size')
        elif touch:
            failures.append('did not reconnect')

        # A background tab's frame changes size, then is shown.
        show(False); page.wait_for_timeout(300); box(580); page.wait_for_timeout(300); show(True)
        check('resized while the tab was hidden')

        # Hidden AND disconnected, frame grows: used to leave a blank band below.
        show(False); page.wait_for_timeout(200)
        restart_during(lambda: (box(690), page.wait_for_timeout(200), show(True)))
        wait(lambda s: s['sock'] == 1)
        check('frame grows while hidden and disconnected')

        # A hidden terminal must not be fitted (it would reshape the shared PTY).
        show(False); page.wait_for_timeout(300)
        before = state(); box(400); page.wait_for_timeout(2600); after = state()
        ok = bool(before and after and (before['cols'], before['rows']) == (after['cols'], after['rows']))
        print('PASS' if ok else 'FAIL', 'hidden terminal keeps its grid', flush=True)
        if not ok:
            failures.append('hidden fit')
        browser.close()
finally:
    srv.kill()

if failures:
    sys.exit('FAILED: ' + ', '.join(failures))
print('ok')
