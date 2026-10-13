"""Compare rewritten scripts with native execution and verify real window routing."""
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
            root=Path(__file__).resolve().parents[3]/'apps/everyday/browser-lite/proxy'
            process=await asyncio.create_subprocess_exec('node','-e',"const c=require('./optional-chain-cases.cjs');const {processScript}=require('./engine.cjs').hammerhead('processing/script');console.log(JSON.stringify({cases:c,processed:Object.fromEntries(Object.entries(c).map(([n,s])=>[n,processScript(s,false,false)]))}));",cwd=str(root),stdout=asyncio.subprocess.PIPE)
            output,_=await process.communicate();assert process.returncode==0
            corpus=json.loads(output)
            native=await context.new_page()
            expected=await native.evaluate("""async sources=>{const results={};for(const [name,source] of Object.entries(sources)){try{results[name]={value:JSON.stringify(await eval(source))};}catch(error){results[name]={error:error.name};}}return results;}""",corpus['cases'])
            await native.close()
            # This pinned WebKit has native optional-chain bugs, reproduced
            # on an unproxied about:blank page. Require the standard/V8 result
            # from the rewriter; report the native discrepancy rather than
            # teaching the rewriter to reproduce those engine bugs.
            native_deviations=[]
            known_webkit={
                'grouped missing chain call evaluates arguments then throws':({'value':'[]'},{'value':'["argument","TypeError"]'}),
                'grouped eval bind keeps short circuit boundary':({'value':None},{'value':'[1,"TypeError"]'}),
                'optional tag keeps template identity and receiver':({'value':'[null,"a",2]'},{'value':'[42,"a",2]'})}
            if engine=='webkit':
                for name,(native_bug,standard) in known_webkit.items():
                    if expected[name]!=standard:
                        assert expected[name]==native_bug,(name,expected[name])
                        native_deviations.append(name)
                        expected[name]=standard
            await page.goto(config['parent']+'/app?url='+quote('http://a.source-one.test/optional-chain',safe=''))
            frame=page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('h1')).to_have_text('Optional chains')
            inner=await page.locator('#stage > iframe:not([hidden])').element_handle()
            document=await inner.content_frame()
            await document.wait_for_function('window.chainResults && window.workerChainResults')
            await document.wait_for_function('self.shadowlet === "local" && self.shadowvar === "local"')
            await document.wait_for_function("[1,2,3,4].every(i=>document.body.dataset['alias'+i]==='local')")
            server=await document.evaluate('window.chainResults')
            worker=await document.evaluate('window.workerChainResults')
            client=await document.evaluate("""async sources=>{const results={},processed={};for(const [name,source] of Object.entries(sources)){processed[name]=window.__proc$Script(source);try{results[name]={value:JSON.stringify(await window.eval(processed[name]))};}catch(error){results[name]={error:error.name};}}return {results,processed};}""",corpus['cases'])
            failures=[]
            for mode,actual in [('server',server),('client',client['results']),('worker',worker)]:
                for name,value in expected.items():
                    if actual.get(name)!=value:failures.append({'mode':mode,'name':name,'expected':value,'actual':actual.get(name)})
            for name,source in corpus['processed'].items():
                if client['processed'][name]!=source:failures.append({'mode':'generator parity','name':name,'server':source,'client':client['processed'][name]})
            assert not failures,json.dumps(failures,indent=2)
            await document.wait_for_function('window.chainMessages.some(m=>m.data.ready)')
            for kind in ['direct','grouped','tag','call','apply','bind','value','optional-grouped','grouped-call','grouped-apply','grouped-bind']:
                await document.evaluate('kind=>window.chainSend(kind)',kind)
                try:await document.wait_for_function('kind=>window.chainMessages.some(m=>m.data.kind===kind)',arg=kind,timeout=10000)
                except:
                    print('RECEIVED',await document.evaluate('window.chainMessages'),flush=True)
                    raise
            values=await document.evaluate('window.chainEval()')
            assert values==['http://a.source-one.test/optional-chain']*11,values
            for kind in ['direct','grouped','tag','optional-grouped']:
                await document.evaluate('kind=>window.chainNavigate(kind)',kind)
                await document.wait_for_function('kind=>window.chainMessages.some(m=>m.data.ready==="http://b.source-two.test/chain-child?"+kind)',arg=kind)
            assert not errors,errors
            print(json.dumps({'engine':engine,'status':'PASS','cases':len(expected),'modes':['native','server','client dynamic eval','dedicated worker'],'generatorParity':True,'nativeEngineDeviations':native_deviations,'routing':['cross-origin postMessage direct/grouped/tag/call/apply/bind/value','eval direct/call/apply/bind','cross-origin Location.replace direct/grouped/tag']}))
            await browser.close()
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:await asyncio.wait_for(proc.wait(),5)
            except asyncio.TimeoutError:proc.kill();await proc.wait()

asyncio.run(main())
