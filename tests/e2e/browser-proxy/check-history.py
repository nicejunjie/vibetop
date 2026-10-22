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
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/history',safe=''))
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            marker=await frame.locator('body').evaluate('()=>window.documentMarker')
            await frame.locator('#draft').fill('unsaved 中文 draft')
            await frame.locator('#push').click()
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history?route=1')
            await frame.locator('#replace').click()
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history?replaced')
            await page.get_by_role('button',name='Back',exact=True).click()
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await expect(frame.locator('#draft')).to_have_value('unsaved 中文 draft')
            assert await frame.locator('body').evaluate('()=>window.documentMarker')==marker
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history')
            await page.get_by_role('button',name='Forward',exact=True).click()
            await expect(frame.locator('#route')).to_have_text('{"route":"replaced"}')
            await expect(frame.locator('#draft')).to_have_value('unsaved 中文 draft')
            await frame.locator('#site-back').click()
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await expect(page.locator('#address')).to_have_value('http://a.source-one.test/history')
            await frame.locator('#site-forward').click()
            await expect(frame.locator('#route')).to_have_text('{"route":"replaced"}')
            # Interleaving another iframe's routes must never traverse its history.
            await page.get_by_role('button',name='New tab',exact=True).click()
            await page.locator('#address').fill('http://b.source-two.test/history')
            await page.locator('#address').press('Enter')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await frame.locator('#draft').fill('second tab draft')
            await frame.locator('#push').click()
            await expect(page.locator('#address')).to_have_value('http://b.source-two.test/history?route=1')
            await page.get_by_role('tab').nth(0).click()
            await page.get_by_role('button',name='Back',exact=True).click()
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await expect(frame.locator('#draft')).to_have_value('unsaved 中文 draft')
            await page.get_by_role('tab').nth(1).click()
            await expect(frame.locator('#route')).to_have_text('{"route":1}')
            await expect(frame.locator('#draft')).to_have_value('second tab draft')
            # A new branch after Back discards Forward; replaceState does not add a step.
            await page.get_by_role('button',name='Back',exact=True).click()
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await frame.locator('#push').click()
            await expect(page.locator('#address')).to_have_value('http://b.source-two.test/history?route=2')
            await expect(page.get_by_role('button',name='Forward',exact=True)).to_be_disabled()
            child=frame.locator('body')
            native_length=await page.evaluate('history.length')
            await child.evaluate("""()=>{
                const value={route:'complex',map:new Map([['key',42]]),date:new Date('2020-01-01'),big:42n};value.self=value;
                History.prototype.pushState.call(history,value,'',location.href);
                value.map.set('key',99);history.state.map.set('key',100);
                history.pushState({route:'after'},'',location.href);
                window.lastPop=null;addEventListener('popstate',event=>{window.lastPop={same:event.state===history.state,trusted:event.isTrusted};});
                history.back();window.asyncState=history.state.route;
            }""")
            await expect(frame.locator('#route')).to_have_text('{"route":"complex"}')
            details=await child.evaluate("""()=>({route:history.state.route,map:history.state.map.get('key'),date:history.state.date.toISOString(),
                big:String(history.state.big),cycle:history.state.self===history.state,asyncState:window.asyncState,pop:window.lastPop})""")
            assert details=={'route':'complex','map':42,'date':'2020-01-01T00:00:00.000Z','big':'42','cycle':True,'asyncState':'after','pop':{'same':True,'trusted':False}},details
            assert await page.evaluate('history.length')==native_length
            before=await child.evaluate('history.length')
            invalid=await child.evaluate("""()=>{
                const failures=[];
                for(const [value,url] of [[()=>{},location.href],[{},'http://c.source-three.test/history']]){
                    try{history.pushState(value,'',url);failures.push('allowed');}catch(error){failures.push(error.name);}
                }
                return failures;
            }""")
            assert invalid==['DataCloneError','SecurityError'],invalid
            assert await child.evaluate('history.length')==before
            # Two queued calls must traverse two entries, without replaying the document.
            await child.evaluate('()=>{history.back();history.back();}')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await child.evaluate('()=>{history.forward();history.forward();}')
            await expect(frame.locator('#route')).to_have_text('{"route":"complex"}')
            await expect(frame.locator('#draft')).to_have_value('second tab draft')
            # A popstate handler can replace the entry currently being restored.
            await child.evaluate("""()=>{
                addEventListener('popstate',()=>history.replaceState({route:'handler'},'',location.href),{once:true});history.back();
            }""")
            await expect(frame.locator('#route')).to_have_text('{"route":2}')
            await expect(page.locator('#forward')).to_be_enabled()
            assert await child.evaluate('history.state.route')=='handler'
            await page.get_by_role('button',name='New tab',exact=True).click()
            await page.locator('#address').fill('http://c.source-three.test/history')
            await page.locator('#address').press('Enter')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            child=frame.locator('body')
            await child.evaluate("""()=>{scrollTo(0,600);history.pushState({route:1},'',location.href);scrollTo(0,1200);history.pushState({route:2},'',location.href);}""")
            await expect(page.locator('#back')).to_be_enabled()
            await page.locator('#back').click()
            await expect(frame.locator('#route')).to_have_text('{"route":1}')
            live=next(f for f in page.frames if f.parent_frame==page.main_frame and not f.is_detached() and 'c.source-three.test/history' in f.url)
            await live.wait_for_function('Math.abs(scrollY-1200)<2')
            await page.locator('#back').click()
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            await live.wait_for_function('Math.abs(scrollY-600)<2')
            await child.evaluate("""()=>{history.scrollRestoration='manual';history.pushState({route:3},'',location.href);scrollTo(0,900);history.back();}""")
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            assert await child.evaluate('scrollY')==900
            # Fragment changes must be reconciled, not silently overwrite a SPA step.
            await child.evaluate("()=>{location.hash='fragment';}")
            await expect(page.locator('#address')).to_have_value('http://c.source-three.test/history#fragment')
            await page.locator('#back').click()
            await expect(page.locator('#address')).to_have_value('http://c.source-three.test/history')
            await expect(frame.locator('#route')).to_have_text('{"route":0}')
            # Bounded history keeps the latest entries without native joint pushes.
            native_length=await page.evaluate('history.length')
            await child.evaluate("""()=>{for(let i=0;i<60;i++)history.pushState({route:i},'',location.href);}""")
            assert await child.evaluate('history.length')==50
            assert await page.evaluate('history.length')==native_length
            await child.evaluate('()=>history.back()')
            await expect(frame.locator('#route')).to_have_text('{"route":58}')
            await child.evaluate('()=>scrollTo(0,0)')
            await page.screenshot(path=f'/tmp/vt-history-{engine}.png')
            assert page.url.startswith(config['parent']+'/app?')
            assert not errors,errors
            print(json.dumps({'engine':engine,'status':'PASS','checks':['SPA push/replace','toolbar and site back/forward','unsaved draft and document identity','interleaved tabs','structured clone and errors','rapid traversal','auto/manual scroll','fragment reconciliation']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
