"""Popup sign-in through the actual browser UI: window.open returns a real window,
the popup reaches its opener, and closing it returns to the opener tab."""
import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import quote
from playwright.async_api import async_playwright, expect

async def main():
    engine=sys.argv[1]
    expect.set_options(timeout=15000)
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
            page.on('console',lambda message:print('CONSOLE',message.text,flush=True) if message.type=='error' else None)
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/popup-login',safe=''))
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            tabs=page.get_by_role('tab')
            await expect(frame.locator('h1')).to_have_text('Popup login')
            for button in ('#login','#login-blank'):
                await expect(tabs).to_have_count(1)
                await frame.locator(button).click()
                await expect(tabs).to_have_count(2,timeout=15000)
                opener=page.frame_locator('#stage > iframe >> nth=0')
                await expect(opener.locator('#handle')).to_have_text('window')
                await expect(opener.locator('#closed')).to_have_text('false')
                await expect(frame.locator('h1')).to_have_text('Authorize?')
                await expect(frame.locator('#opener')).to_have_text('has opener')
                await frame.locator('#authorize').click()
                await expect(tabs).to_have_count(1,timeout=20000)
                await expect(opener.locator('#closed')).to_have_text('true')
                await expect(frame.locator('h1')).to_have_text('Popup login')
                log=json.loads(await opener.locator('#messages').text_content())
                assert log and log[-1]=={'data':{'code':'42'},'origin':'http://a.source-one.test','sameSource':True},log
            # The opener closes a popup it still holds.
            await frame.locator('#login').click()
            await expect(tabs).to_have_count(2)
            await expect(frame.locator('h1')).to_have_text('Authorize?')
            await page.get_by_role('tab',name='Popup login',exact=True).click()
            await frame.locator('#close-popup').click()
            await expect(tabs).to_have_count(1)
            await expect(frame.locator('#closed')).to_have_text('true')
            assert not errors,errors
            print(json.dumps({'engine':engine,'status':'PASS','checks':['window.open returns a window','popup navigates (direct and blank-then-location)','opener in popup','callback postMessage reaches opener with event.source','window.close closes the tab','opener closes popup']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
