"""Exercise state-preserving history through the actual Browser Lite toolbar."""
import asyncio
import json
import re
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
            await page.add_init_script("""(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===45000?150:ms,...args);})();""")
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/history-delayed',safe=''))
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await page.locator('#address').fill('http://b.source-two.test/history')
            await page.locator('#address').press('Enter')
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://b\.source-two\.test/'))
            await page.locator('#back').click()
            await expect(page.locator('#retry')).to_be_visible()
            await page.locator('#retry').click()
            await expect(page.locator('#retry')).to_be_visible()
            await page.evaluate("async()=>await fetch('/__test/release-pages',{method:'POST'})")
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://a\.source-one\.test/'))
            await expect(page.locator('#back')).to_be_disabled()
            await expect(page.locator('#forward')).to_be_enabled()
            await page.locator('#reload').click()
            await expect(page.locator('#retry')).to_be_visible()
            await page.locator('#retry').click()
            await expect(page.locator('#retry')).to_be_visible()
            await page.evaluate("async()=>await fetch('/__test/release-pages',{method:'POST'})")
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://a\.source-one\.test/'))
            await expect(page.locator('#back')).to_be_disabled()
            await expect(page.locator('#forward')).to_be_enabled()
            await page.locator('#forward').click()
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://b\.source-two\.test/'))
            # A lost control response is different from a slow document: Retry
            # must replay the same operation and retain the intended history slot.
            await page.locator('#new-tab').click()
            await page.locator('#address').fill('http://a.source-one.test/history')
            await page.locator('#address').press('Enter')
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://a\.source-one\.test/'))
            await page.locator('#address').fill('http://b.source-two.test/history')
            await page.locator('#address').press('Enter')
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://b\.source-two\.test/'))
            lose_next=False
            async def lose_open(route):
                nonlocal lose_next
                if lose_next:
                    lose_next=False
                    await route.fetch()
                    await route.abort('connectionreset')
                else:await route.continue_()
            await page.route('**/api/open',lose_open)
            for action in ['back','reload']:
                lose_next=True
                await page.locator('#'+action).click()
                await expect(page.locator('#retry')).to_be_visible()
                await page.locator('#retry').click()
                await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://a\.source-one\.test/'))
                await expect(page.locator('#back')).to_be_disabled()
                await expect(page.locator('#forward')).to_be_enabled()
            await page.locator('#forward').click()
            await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://b\.source-two\.test/'))
            for expiry in ['heartbeat','recovery']:
                lose_next=True
                await page.locator('#back').click()
                await expect(page.locator('#retry')).to_be_visible()
                await page.evaluate("async()=>await fetch('/__test/expire',{method:'POST'})")
                if expiry=='heartbeat':
                    await page.evaluate("window.dispatchEvent(new Event('pageshow'))")
                else:
                    await page.locator('#retry').click()
                # A forgotten lane reloads the page in place (v1.38.9x): no "session ended".
                if expiry=='recovery':
                    await page.locator('#retry').click()
                await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://a\.source-one\.test/'))
                await expect(page.locator('#back')).to_be_disabled()
                await expect(page.locator('#forward')).to_be_enabled()
                await page.locator('#forward').click()
                await expect(page.get_by_role('textbox',name='Address or search')).to_have_value(re.compile(r'^http://b\.source-two\.test/'))
            assert not errors,errors
            print(json.dumps({'engine':engine,'status':'PASS','checks':['slow Back then Retry retains target and Forward','slow Reload then Retry adds no history entry','lost Back and Reload control responses replay without duplicating history','expiry during failed Back retains intended target']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
