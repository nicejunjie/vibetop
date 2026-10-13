"""Exercise the actual browser UI with owned sites, including a slow connection."""
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
    drop='--drop-responses' in sys.argv
    expect.set_options(timeout=60000 if slow else 10000)
    proc=await asyncio.create_subprocess_exec('node',str(Path(__file__).with_name('gateway-fixture.cjs')),
        env={**os.environ,'VT_REALM_TEST':'1','VT_FIXTURE_DELAY_MS':'250' if slow and engine=='webkit' else '0'},stdout=asyncio.subprocess.PIPE)
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
            lost=[]
            if drop:
                async def lose_response(route):
                    command=route.request.url.rsplit('/',1)[-1]
                    if command not in lost:
                        lost.append(command)
                        response=await route.fetch()
                        assert response.ok
                        await route.abort('connectionreset')
                    else:await route.continue_()
                await page.route('**/api/open',lose_response)
            if slow and engine=='chromium':
                cdp=await context.new_cdp_session(page)
                await cdp.send('Network.enable')
                await cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':250,'downloadThroughput':102400,'uploadThroughput':51200})
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/',safe=''))
            if drop:await page.get_by_role('button',name='Retry',exact=True).click()
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('#data')).to_contain_text('private_a=secret_a',timeout=60000)
            await expect(frame.locator('#module-bases')).to_have_text('one,two')
            await frame.locator('#button').click();await expect(frame.locator('#count')).to_have_text('1')
            await expect(page.locator('#status')).to_have_text('a.source-one.test')
            await page.get_by_role('button',name='New tab',exact=True).click()
            await expect(page.locator('#welcome')).to_be_visible()
            await page.get_by_role('textbox',name='Address or search').fill('http://b.source-two.test/')
            await page.get_by_role('textbox',name='Address or search').press('Enter')
            await expect(frame.locator('#data')).to_contain_text('visible_b=value_b',timeout=60000)
            await expect(frame.locator('#bytes-worker-result')).to_have_text('worker imported')
            await page.get_by_role('tab',name='Site a',exact=True).click()
            await expect(frame.locator('#count')).to_have_text('1')
            await page.get_by_role('tab',name='Site b',exact=True).click()
            await page.locator('.tab.active .close').click()
            await expect(frame.locator('#count')).to_have_text('1')
            await frame.locator('#next').click()
            await expect(frame.locator('#data')).to_contain_text('visible_b=value_b',timeout=60000)
            await expect(frame.locator('#bytes-worker-result')).to_have_text('worker imported')
            await expect(page.get_by_role('button',name='Back',exact=True)).to_be_enabled()
            await page.get_by_role('button',name='Back',exact=True).click()
            await expect(frame.locator('h1')).to_have_text('Site a',timeout=60000)
            await expect(frame.locator('#module-bases')).to_have_text('one,two')
            await expect(page.get_by_role('button',name='Forward',exact=True)).to_be_enabled()
            await page.get_by_role('button',name='Forward',exact=True).click()
            await expect(frame.locator('#data')).to_contain_text('visible_b=value_b',timeout=60000)
            await expect(frame.locator('#bytes-worker-result')).to_have_text('worker imported')
            await page.screenshot(path=f'/tmp/vt-browser-ui-{engine}.png')
            await page.evaluate('''async()=>{
                await fetch('/__test/expire',{method:'POST'});
                window.dispatchEvent(new Event('pageshow'));
            }''')
            await expect(page.locator('#status')).to_contain_text('session ended')
            async with page.expect_event('framenavigated',predicate=lambda f:f.parent_frame==page.main_frame and f.url.startswith('https://bl-')):
                await page.get_by_role('button',name='Retry',exact=True).click()
            await expect(page.locator('#status')).to_have_text('b.source-two.test')
            await expect(frame.locator('#data')).to_contain_text('visible_b=value_b')
            await expect(frame.locator('#bytes-worker-result')).to_have_text('worker imported')
            if drop:
                await page.route('**/api/approve',lose_response)
                await frame.locator('#submit-form').click()
                await page.get_by_role('button',name='Retry',exact=True).click()
                await expect(frame.locator('h1')).to_have_text('Submitted')
                seen=await page.evaluate('async()=>await(await fetch("/seen")).json()')
                submitted=[item for item in seen if item['path']=='/submitted']
                assert len(submitted)==1 and submitted[0]['body']=='message=hello+%26+goodbye',submitted
                assert lost==['open','approve'],lost
            unexpected=[error for error in errors if not ('/cors-deny' in error and 'access control checks' in error)]
            assert not unexpected,unexpected
            print(json.dumps({'engine':engine,'slow':slow,'network_simulation':('latency and bandwidth' if engine=='chromium' else 'fixture latency') if slow else 'none','lost_responses':drop,'status':'PASS','checks':['address bar','tabs retain page state','tab close','back','forward','expired session recovery','mobile layout' if engine=='webkit' else 'desktop layout']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
