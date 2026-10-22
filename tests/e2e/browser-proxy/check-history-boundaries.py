"""Exercise state-preserving history through the actual Browser Lite toolbar."""
import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import quote
from playwright.async_api import async_playwright, expect

async def main():
    engine=sys.argv[1]
    slow='--slow' in sys.argv
    expect.set_options(timeout=60000 if slow else 10000)
    proc=await asyncio.create_subprocess_exec('node',str(Path(__file__).with_name('gateway-fixture.cjs')),
        env={**os.environ,'VT_REALM_TEST':'1'},stdout=asyncio.subprocess.PIPE)
    try:
        config=json.loads(await asyncio.wait_for(proc.stdout.readline(),15))
        async with async_playwright() as p:
            options={'headless':True,'proxy':{'server':config['browserProxy']}}
            if engine=='chromium':options.update(executable_path='/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome',chromium_sandbox=True)
            else:options.update(executable_path='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh')
            browser=await getattr(p,engine).launch(**options)
            device={k:v for k,v in p.devices['iPhone 13'].items() if k!='default_browser_type'} if engine=='webkit' else {'viewport':{'width':1280,'height':800}}
            context=await browser.new_context(ignore_https_errors=True,**device)
            await context.add_cookies([config['cookie']])
            page=await context.new_page();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)+'\n'+(error.stack or '')))
            page.on('response',lambda response:print('HTTP',response.status,response.url,flush=True) if response.status>=400 else None)
            page.on('requestfailed',lambda request:print('NETWORK',request.failure,request.url,flush=True))
            page.on('console',lambda message:print('CONSOLE',message.text,flush=True) if message.type=='error' else None)
            if slow:
                cdp=await context.new_cdp_session(page)
                await cdp.send('Network.enable')
                await cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':250,'downloadThroughput':102400,'uploadThroughput':51200})
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/history?slow=1',safe=''),wait_until='domcontentloaded')
            frame=page.frame_locator('#stage > iframe:not([hidden])');child=frame.locator('body')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await frame.locator('#draft').fill('draft while image pending')
            await frame.locator('#push').click()
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history?route=1')
            assert await child.evaluate('document.readyState')!='complete'
            await page.locator('#back').click()
            await page.evaluate("async()=>await fetch('/__test/release-images',{method:'POST'})")
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await expect(frame.locator('#draft')).to_have_value('draft while image pending')
            await expect(page.locator('#retry')).to_be_hidden()
            # Reload replaces the current toolbar slot, and go(0) does likewise.
            await page.locator('#reload').click()
            await expect(frame.locator('#draft')).to_have_value('')
            await expect(page.locator('#back')).to_be_disabled()
            reload_marker=await child.evaluate('window.documentMarker')
            await child.evaluate('()=>history.go(0)')
            initial=next(f for f in page.frames if f.parent_frame==page.main_frame and 'a.source-one.test' in f.url)
            await initial.wait_for_function('(marker)=>window.documentMarker && window.documentMarker!==marker',arg=reload_marker)
            await expect(page.locator('#back')).to_be_disabled()
            await expect(page.locator('#status')).to_have_text('a.source-one.test')
            # Same-origin full navigation retains server epoch, but rotates Document.
            marker=await child.evaluate('window.documentMarker')
            await frame.locator('#new-document').click()
            live=next(f for f in page.frames if f.parent_frame==page.main_frame and 'a.source-one.test' in f.url)
            await live.wait_for_function('(marker)=>window.documentMarker && window.documentMarker!==marker',arg=marker)
            await expect(page.locator('#back')).to_be_enabled()
            # Full-document Back remains a URL reopen, explicitly checked as such.
            await frame.locator('#draft').fill('second document')
            await page.locator('#back').click()
            await expect(frame.locator('#draft')).to_have_value('')
            await expect(page.locator('#forward')).to_be_enabled()
            await expect(page.locator('#back')).to_be_disabled()
            # Anchor reconciliation must retain the pre-anchor scroll position.
            await child.evaluate('()=>scrollTo(0,600)')
            await live.wait_for_function('scrollY===600')
            await frame.locator('#jump-anchor').click()
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history#anchor')
            await page.locator('#back').click()
            await live.wait_for_function('Math.abs(scrollY-600)<2')
            for host in ['b.source-two.test','c.source-three.test']:
                await page.locator('#address').fill('http://'+host+'/history')
                await page.locator('#address').press('Enter')
                await expect(page.locator('#status')).to_have_text(host)
                await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await page.locator('#back').evaluate('button=>{button.click();button.click();}')
            await expect(page.locator('#status')).to_have_text('b.source-two.test')
            await page.locator('#forward').click()
            await expect(page.locator('#status')).to_have_text('c.source-three.test')
            assert not errors,errors
            print(json.dumps({'engine':engine,'status':'PASS','checks':['navigation before load','reload/go(0) replace current entry','same-origin new document','explicit cross-document reopen','anchor scroll']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
