"""Real worker network/module/transfer operations through the realm gateway."""
import argparse
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import quote, urlsplit
from playwright.async_api import async_playwright, expect

async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('engine',choices=['chromium','webkit'])
    parser.add_argument('--network-only',action='store_true',help='Test the classic-worker network subset; generated code/location and module startup are separate gates')
    parser.add_argument('--containment-only',action='store_true',help='Negative module execution and routing probes')
    parser.add_argument('--native',action='store_true',help='Run unrewritten owned sites as a browser-engine baseline')
    options=parser.parse_args();containment_only=options.containment_only;engine=options.engine;network_only=options.network_only;native=options.native
    fixture=await asyncio.create_subprocess_exec('node',str(Path(__file__).with_name('gateway-fixture.cjs')),
        env={**os.environ,'VT_REALM_TEST':'1','VT_NATIVE_WORKERS':'1' if native else '0'},stdout=asyncio.subprocess.PIPE)
    try:
        config=json.loads(await asyncio.wait_for(fixture.stdout.readline(),15))
        async with async_playwright() as p:
            options={'headless':True,'proxy':{'server':config['browserProxy']}}
            options['executable_path']='/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome' if engine=='chromium' else '/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh'
            if engine=='chromium':options['chromium_sandbox']=True
            browser=await getattr(p,engine).launch(**options)
            device={k:v for k,v in p.devices['iPhone 13'].items() if k!='default_browser_type'} if engine=='webkit' else {}
            context=await browser.new_context(ignore_https_errors=True,**device)
            await context.add_cookies([config['cookie']])
            page=await context.new_page();escaped=[];errors=[];diagnostics=[];csp_blocked=set()
            context.on('request',lambda r:escaped.append(r) if urlsplit(r.url).scheme in ('http','https') and not (urlsplit(r.url).hostname or '').endswith('.vt-proxy.example.com') and not (native and urlsplit(r.url).hostname in ['a.source-one.test','b.source-two.test','c.source-three.test']) else None)
            context.on('requestfailed',lambda r:csp_blocked.add(r) if r.failure=='csp' else None)
            page.on('response',lambda r:print('HTTP',r.status,urlsplit(r.url).path.rsplit('/',1)[-1],flush=True) if r.status>=400 else None)
            page.on('requestfailed',lambda r:print('NETWORK',r.failure,urlsplit(r.url).path.rsplit('/',1)[-1],flush=True))
            page.on('console',lambda m:diagnostics.append(m.text) if m.text.startswith('Browser Lite worker preparation failed') else None)
            page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto('http://a.source-one.test/worker-lab' if native else config['parent']+'/app?url='+quote('http://a.source-one.test/worker-lab',safe=''))
            frame=page if native else page.frame_locator('#stage > iframe:not([hidden])')
            await expect(frame.locator('h1')).to_have_text('Worker laboratory')
            if containment_only:
                results={};escape_cases=[]
                for name in ['module','modulecors','modulecontainmenteval','modulecontainmentfunction','modulecontainmentdata','modulecontainmentblob','modulecontainmentshadow','modulecontainmentparse','modulecontainmenthtml','modulecontainmentstaticdata','modulecontainmenttimer','modulecontainmentnested','modulecontainmentglobal','modulecontainmentassignment','modulecontainmentsocket','containmentsocket','modulecontainmentsocketerrors','blobsocketrelative','modulecontainmentwasm','modulecontainmentblobfetch','modulecontainmentdatafetch']+([] if native else ['modulecontainmenttrusted']):
                    escaped_before=len(escaped)
                    results[name]=await frame.locator('body').evaluate('(_,name)=>window.runWorker(name)',name)
                    if len(escaped)>escaped_before:escape_cases.append(name)
                expected={name:('one' if name in ['module','modulecors','modulecontainmenthtml'] else 'loaded' if name=='modulecontainmentparse' else {'error':'Worker error'} if name in ['modulecontainmentshadow','modulecontainmentstaticdata','modulecontainmentassignment'] else 'blocked') for name in results}
                for socket_case in ['modulecontainmentsocket','containmentsocket']:
                    expected[socket_case]={'echo':'worker echo','bytes':[0,255,42],'url':'ws://a.source-one.test/socket','instance':True,'constant':1,'constructor':True}
                expected.update(blobsocketrelative='SyntaxError',modulecontainmentwasm=42,modulecontainmentblobfetch='worker blob',modulecontainmentdatafetch='worker data')
                expected['modulecontainmentsocketerrors']={**dict.fromkeys(['noNew','missing','symbol','brand'],'TypeError'),**dict.fromkeys(['malformed','fragment','scheme','duplicate','invalidProtocol'],'SyntaxError'),'conversion':'RangeError'}
                if native:
                    expected.update({name:'loaded' for name in ['modulecontainmenteval','modulecontainmentfunction','modulecontainmentdata','modulecontainmentblob','modulecontainmentshadow','modulecontainmentstaticdata','modulecontainmentnested','modulecontainmentglobal']})
                    expected['modulecontainmenttimer']='executed'
                    expected['modulecontainmentassignment']={'error':'Uncaught ReferenceError: __get$ProxyUrl is not defined' if engine=='chromium' else "ReferenceError: Can't find variable: __get$ProxyUrl"}
                # Native Chromium rejects this token sequence; WebKit accepts it.
                if engine=='chromium':expected['modulecontainmenthtml']={'error':'Worker error'}
                failed=[name for name in results if results[name]!=expected[name]]
                print(json.dumps({'engine':engine,'native':native,'scope':'module containment','results':results,'failed':failed,'escapedCount':len(escaped),'cspBlockedCount':sum(u in csp_blocked for u in escaped),'escapeCases':escape_cases,'escapedTargets':[{'host':urlsplit(u.url).hostname,'file':urlsplit(u.url).path.rsplit('/',1)[-1]} for u in escaped],'pageErrors':errors}),flush=True)
                if not native:
                    count_response=await context.request.get(config['parent']+'/__test/worker-counts')
                    assert (await count_response.json())['trustedRequests']==0, 'Worker reached trusted UI outside realm namespace'
                await browser.close()
                assert not failed and not [u for u in escaped if u not in csp_blocked] and not errors
                return
            results={}
            for name in ['fetch','omit','cors','blocked','xhr','dynamic','dynamiccross','dynamicnested','dynamicblocked','blobdynamic','blobunicode','blobstring','bytes']+([] if network_only else ['dynamiceval','dynamicfunction','location','module','modulecycle','moduledependency','moduleself','moduleearly','moduleredirect','moduleimportscripts','modulehashbang','modulecredentialsomit','modulecredentialsdefault','modulecredentialsinclude','modulebytes','modulecors','modulecorsblocked','moduleentryredirect','modulecorsredirect','modulequery','moduleproxyurl','moduleimporterrors','modulehashbangcr','moduleshadow','moduleurlspaces','modulestaticspaces','moduledotbare']):
                results[name]=await frame.locator('body').evaluate('(_,name)=>window.runWorker(name)',name)
            redirect_probe=None
            if not native:
                redirect_probe=await frame.locator('body').evaluate("""async()=>{
                    const hh=window['%hammerhead%'],u=hh.utils.url;
                    const current=u.parseProxyUrl(window.location.href),physical=new URL(window.location.href);
                    const kind=u.stringifyResourceType({isScript:true,isWorkerModule:true});
                    const target=u.getProxyUrl('http://a.source-one.test/worker-redirect/utf8-start.js',{
                        proxyHostname:physical.hostname,proxyPort:physical.port,proxyProtocol:physical.protocol,
                        sessionId:current.sessionId,windowId:current.windowId,resourceType:kind,charset:'utf-8'});
                    const invalidKinds=[];
                    for(const flag of ['m','sma'])invalidKinds.push((await hh.nativeMethods.fetch.call(window,target.replace('!'+kind+'!','!'+flag+'!'))).status);
                    const malformed=target.replace(current.windowId,current.windowId.split('~')[0]+'~tab');
                    const malformedStatus=(await hh.nativeMethods.fetch.call(window,malformed)).status;
                    const response=await hh.nativeMethods.fetch.call(window,target);
                    const parsed=u.parseProxyUrl(hh.nativeMethods.responseUrlGetter.call(response));
                    const text=await response.text();
                    return {malformedStatus,invalidKinds,status:response.status,kind:parsed.resourceType,charset:parsed.charset,
                        sameWindow:parsed.windowId===current.windowId,sameSession:parsed.sessionId===current.sessionId,
                        final:parsed.destUrl,unicode:text.includes('你好🌍')};
                }""")
            option_order=await frame.locator('body').evaluate('()=>window.workerOptions()')
            async def counts():return await (await context.request.get(config['parent']+'/__test/worker-counts')).json()
            preparations_before=await counts()
            abort_order=await frame.locator('body').evaluate('()=>window.workerAbort()')
            constructor_errors=await frame.locator('body').evaluate('()=>window.workerErrors()')
            after_invalid=await counts()
            invalid_preparations=after_invalid['uploads']-preparations_before['uploads']
            invalid_maps=after_invalid['invalidMaps']
            revoked=await frame.locator('body').evaluate("()=>window.workerFailure('revoked')")
            terminated=await frame.locator('body').evaluate("()=>window.workerFailure('terminated')")
            await context.request.post(config['parent']+'/__test/worker-failure?on')
            preparation=await frame.locator('body').evaluate("()=>window.workerFailure('preparation')")
            import_mapping=None if native else await frame.locator('body').evaluate("()=>window.runWorker('modulemappingfailure')")
            mapping=None if native else await frame.locator('body').evaluate("()=>window.workerFailure('mapping')")
            variants={}
            for kind in ['uppercase','whitespace']:
                before=await counts()
                variants[kind]=await frame.locator('body').evaluate('(_,kind)=>window.workerFailure(kind)',kind)
                after=await counts()
                variants[kind]['uploads']=after['uploads']-before['uploads']
            modules={}
            for kind in ['revoked','terminated','preparation']+([] if native else ['mapping']):
                modules[kind]=await frame.locator('body').evaluate('(_,kind)=>window.workerFailure(kind,"module")',kind)
            await context.request.post(config['parent']+'/__test/worker-failure?off')
            failures=[]
            if not native and import_mapping!=['promise','reject:TypeError']:failures.append('dynamic import mapping promise')
            if not native and redirect_probe!={'malformedStatus':403,'invalidKinds':[403,403],'status':200,'kind':'sm','charset':'utf-8','sameWindow':True,'sameSession':True,'final':'http://a.source-one.test/worker-redirect/utf8.js','unicode':True}:failures.append('module redirect descriptor/UTF-8')
            if preparations_before['forbiddenImportScriptsMaps']:failures.append('module importScripts performed origin mapping')
            if not native and preparations_before['uploads']<3:failures.append('missing positive upload control')
            for kind,value in variants.items():
                expected_variant={'stage':'message','value':'source executed','uploads':0} if native else {'stage':'event','handlers':['property','listener'],'uploads':1}
                if value!=expected_variant:failures.append(kind+' Blob preparation')
            for kind,value in modules.items():
                expected_module={'stage':'terminated','handlers':[]} if kind=='terminated' else ({'stage':'message','value':'source executed'} if native and kind=='preparation' else {'stage':'event','handlers':['property','listener']})
                if value!=expected_module:failures.append('module '+kind+' failure')
            if not native and (not diagnostics or any('.vt-proxy.' in d or 'source executed' in d or '__vt/' in d for d in diagnostics)):failures.append('preparation diagnostics')
            if not native and mapping!={'stage':'event','handlers':['property','listener']}:failures.append('mapping failure event')
            if revoked!={'stage':'event','handlers':['property','listener']}:failures.append('revoked Blob event')
            if terminated!={'stage':'terminated','handlers':[]}:failures.append('terminate before error')
            if preparation!=({'stage':'message','value':'source executed'} if native else {'stage':'event','handlers':['property','listener']}):failures.append('preparation failure event')
            if abort_order!={'calls':['url','credentials'],'error':'TypeError'}:failures.append('Worker conversion abort order')
            if invalid_maps:failures.append('invalid options mapped origin')
            if invalid_preparations:failures.append('invalid options uploaded Blob source')
            if constructor_errors!={**dict.fromkeys(['crossOriginInvalid','primitiveOptions','symbolUrl','symbolName','invalidType','invalidBlobType','invalidCredentials','withoutNew','missingUrl'],'TypeError'),'nullOptions':'ok','throwingBlobGetter':'RangeError','malformedUrl':'SyntaxError','crossOrigin':'ok' if engine=='webkit' else 'SecurityError'}:failures.append('Worker constructor errors')
            if option_order!=['url','credentials','name','name value','type']:failures.append('Worker option conversion')
            for name in ['fetch','xhr']:
                value=results[name]
                if not isinstance(value,dict) or value.get('site')!='a' or 'worker_cookie=frompage' not in value.get('cookie',''):failures.append(name)
            expected={'omit':{'site':'a','cookie':''},'dynamiccross':'one','dynamicnested':'one','dynamicblocked':'blocked','blobdynamic':'one','blobunicode':'你好🌍','blobstring':'你好🌍','cors':{'site':'c','cookie':''},'blocked':'blocked','dynamic':'one','module':'one','bytes':{'bytes':[42,127,255],'detached':True}}
            if network_only:expected.pop('module')
            else:expected.update(moduleurlspaces=['one','one','one'],modulestaticspaces='one',moduledotbare='blocked',moduleshadow=[7,'one','site binding'],modulequery='blocked',moduleproxyurl='proxy leaf',moduleimporterrors=['promise','reject:TypeError','promise','reject:RangeError'],modulehashbangcr='one',moduleentryredirect='blocked',modulecorsredirect=['redirect sibling',True],modulebytes={'bytes':[42,127,255],'detached':True},modulecors='one',modulecorsblocked='blocked',modulecredentialsinclude=True,modulecredentialsomit='',modulecredentialsdefault=True,moduleearly=[7,'one'],moduleredirect=['redirect sibling','redirect sibling'],moduleimportscripts='TypeError',modulehashbang='one',modulecycle=2,moduledependency=['a',True],moduleself=2 if engine=='webkit' else 1,dynamiceval='one',dynamicfunction='one',location={'isOriginal':True,'protocol':'http:','hostMatches':True})
            # The pinned native WebKit evaluates a module-worker self import twice.
            # Match its observed baseline explicitly; an extra proxy copy must fail.
            native_deviations=['module worker self import executes twice'] if engine=='webkit' and not network_only else []
            failures.extend(name for name,value in expected.items() if results[name]!=value)
            print(json.dumps({'engine':engine,'native':native,'scope':'classic network subset' if network_only else 'full worker matrix','status':'FAIL' if failures or escaped or errors else 'PASS','nativeEngineDeviations':native_deviations,'moduleRedirectProbe':redirect_probe,'optionOrder':option_order,'abortOrder':abort_order,'constructorErrors':constructor_errors,'invalidOptionsUploads':invalid_preparations,'revokedBlob':revoked,'terminatedBlob':terminated,'preparationFailure':preparation,'mappingFailure':mapping,'blobVariants':variants,'moduleFailures':modules,'importMappingFailure':import_mapping,'results':results,'failed':failures,'escaped':[r.url for r in escaped],'pageErrors':errors}),flush=True)
            await browser.close()
            assert not failures and not escaped and not errors
    finally:
        if fixture.returncode is None:
            fixture.terminate()
            try:await asyncio.wait_for(fixture.wait(),5)
            except asyncio.TimeoutError:fixture.kill();await fixture.wait()

asyncio.run(main())
