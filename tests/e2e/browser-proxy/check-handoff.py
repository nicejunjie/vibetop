"""Google sign-in hand-off through the actual browser UI: the bar appears, and the
tab returns to the site by itself once the Browser's logins for it change."""
import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import quote
from playwright.async_api import async_playwright, expect

async def main():
    engine=sys.argv[1]
    expect.set_options(timeout=20000)
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
            page=await context.new_page()
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/',safe=''))
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('h1')).to_have_text('Site a')
            address=page.get_by_role('textbox',name='Address or search')
            # A Google-account service: the bar at once, no dead end.
            await address.fill('https://mail.google.com/'); await address.press('Enter')
            await expect(page.locator('#handoff')).to_be_visible()
            await expect(page.locator('#handoff-text')).to_contain_text('Google account')
            await expect(page.locator('#continue-here')).to_be_hidden()
            # Google sign-in reached from a site: the bar, and the tab comes back on its own.
            await address.fill('http://a.source-one.test/'); await address.press('Enter')
            await expect(frame.locator('h1')).to_have_text('Site a')
            await expect(page.locator('#handoff')).to_be_hidden()
            await address.fill('https://accounts.google.com/signin'); await address.press('Enter')
            await expect(page.locator('#handoff')).to_be_visible()
            await expect(page.locator('#handoff-text')).to_contain_text('continues on its own')
            await expect(page.locator('#continue-here')).to_be_visible()
            await expect(frame.locator('h1')).to_have_text('Site a',timeout=30000)
            await expect(address).to_have_value('http://a.source-one.test/')
            await expect(page.locator('#handoff')).to_be_hidden()
            checks=await page.evaluate('async()=>(await (await fetch("/__test/login-checks")).json()).loginChecks')
            assert checks>=3,checks
            await page.wait_for_timeout(5000)
            after=await page.evaluate('async()=>(await (await fetch("/__test/login-checks")).json()).loginChecks')
            assert after==checks,'polling stops once the tab has continued: %s -> %s'%(checks,after)
            print(json.dumps({'engine':engine,'status':'PASS','checks':['Google service bar','sign-in bar','auto-continue on login change','polling stops']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
