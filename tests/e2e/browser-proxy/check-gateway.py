"""Fresh-process integration tests; any unmet assertion exits nonzero."""
import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit
from playwright.async_api import async_playwright, expect

async def main():
    engine = sys.argv[1]
    fixture = Path(__file__).with_name('gateway-fixture.cjs')
    proc = await asyncio.create_subprocess_exec('node', str(fixture), stdout=asyncio.subprocess.PIPE)
    browser = None
    try:
        config = json.loads(await asyncio.wait_for(proc.stdout.readline(), 15))
        async with async_playwright() as p:
            options = {'headless': True, 'proxy': {'server': config['browserProxy']}}
            if engine == 'chromium':
                options.update(executable_path='/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome', chromium_sandbox=True)
            else:
                options.update(executable_path='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh')
            browser = await getattr(p, engine).launch(**options)
            context = await browser.new_context(ignore_https_errors=True)
            await context.add_cookies([config['cookie']])
            page = await context.new_page()
            if os.environ.get('VT_NATIVE_CONTROL'):
                await page.goto(config['parent']+'/native')
                native_frame=page.frame_locator('#browser')
                await expect(native_frame.locator('h1')).to_have_text('Native')
                print('NATIVE CONTROL',await native_frame.locator('body').evaluate('()=>document.cookie'),await context.cookies(),flush=True)
                return
            errors = []
            outbound = []
            page.on('request',lambda req: outbound.append(req.url))
            page.on('pageerror', lambda error: errors.append(str(error)+'\n'+(error.stack or '')))
            page.on('console', lambda msg: print('console:', msg.type, msg.text[:300], flush=True) if msg.type == 'error' else None)
            page.on('response', lambda res: print('HTTP', res.status, res.url[:150], flush=True) if res.status >= 400 else None)
            page.on('requestfailed', lambda req: print('NETWORK', req.failure, req.url, flush=True))
            await page.goto(config['parent'])
            frame = page.frame_locator('#browser')
            await expect(frame.locator('h1')).to_have_text('Site a', timeout=15000)
            await frame.locator('#button').click()
            await expect(frame.locator('#count')).to_have_text('1')
            await expect(frame.locator('#data')).to_contain_text('private_a=secret_a')
            if os.environ.get('VT_BROWSER_DIAGNOSTICS'):
                print('SEND_FUNCTION',await frame.locator('body').evaluate('()=>window.sendCross.toString()'),flush=True)
                print('COOKIE', await frame.locator('body').evaluate('''()=>({virtual:document.cookie,native:window['%hammerhead%'].nativeMethods.documentCookieGetter.call(document)})'''), flush=True)
                print('CONTEXT COOKIES', await context.cookies(), flush=True)
                print('NATIVE PROBE', await frame.locator('body').evaluate('''()=>{const n=window['%hammerhead%'].nativeMethods; n.documentCookieSetter.call(document,'vt_probe=one;Path=/;SameSite=None;Secure');return n.documentCookieGetter.call(document);}'''), flush=True)
            await expect(frame.locator('#data')).to_contain_text('visible_a=value_a')
            # Exercise browser API → origin rewrite → actual upstream upgrade,
            # including binary frames. An nginx-only echo cannot cover this.
            socket_result = await frame.locator('body').evaluate('''()=>new Promise((resolve,reject)=>{
                const socket=new WebSocket('ws://a.source-one.test/socket');socket.binaryType='arraybuffer';
                const timer=setTimeout(()=>{socket.close();reject(new Error('WebSocket timed out'));},10000);
                socket.onerror=()=>{clearTimeout(timer);reject(new Error('WebSocket failed'));};
                socket.onopen=()=>socket.send('中文 live update');
                const result=[];
                socket.onmessage=event=>{
                    if(typeof event.data==='string'){result.push(event.data);socket.send(new Uint8Array([0,127,128,255]));}
                    else {result.push(Array.from(new Uint8Array(event.data)));clearTimeout(timer);socket.close();resolve(result);}
                };
            })''')
            assert socket_result == ['中文 live update', [0,127,128,255]], socket_result
            socket_requests = await page.evaluate('async()=> (await(await fetch("/seen")).json()).filter(r=>r.path==="/socket")')
            assert socket_requests and socket_requests[-1]['origin'] == 'http://a.source-one.test', socket_requests
            assert 'private_a=secret_a' in socket_requests[-1]['cookie'], socket_requests
            engine_scripts=[url for url in outbound if '/hammerhead.js?' in url or '/rammerhead.js?' in url]
            assert engine_scripts and all('?v=' in url and 'document=' not in url for url in engine_scripts), engine_scripts
            assert await frame.locator('#image').evaluate('(e)=>e.complete && e.naturalWidth') == 80
            assert await frame.locator('#cross-image').evaluate('(e)=>e.complete && e.naturalWidth') == 80
            await expect(frame.locator('#cors')).to_have_text('c')
            await expect(frame.locator('#blocked')).to_have_text('blocked')
            await expect(frame.locator('#module')).to_have_text('module loaded')
            await expect(frame.locator('#module-bases')).to_have_text('one,two')
            nested = frame.frame_locator('#same')
            await nested.locator('#nested-button').click()
            await expect(nested.locator('#nested-count')).to_have_text('1')
            await expect(frame.locator('#message')).to_have_text('transfer works')
            await expect(frame.locator('#blank-result')).to_have_text('works')
            await expect(frame.locator('#blank-message')).to_have_text('http://a.source-one.test')
            await expect(frame.locator('#worker-result')).to_have_text('worker imported')
            await expect(frame.locator('#blob-worker-result')).to_have_text('worker imported')
            if os.environ.get('VT_REALM_TEST'):
                await expect(frame.locator('#bytes-worker-result')).to_have_text('worker imported')
            child = frame.frame_locator('#other')
            await expect(child.locator('h1')).to_have_text('Site b')
            # Child-to-parent first contact must not require a prior bridge
            # handshake, and normal event.source replies preserve native origin.
            await child.locator('body').evaluate("()=>window.sendParent('child first')")
            await expect(frame.locator('body')).to_be_visible()
            first_contact = await frame.locator('body').evaluate('''()=>new Promise((resolve,reject)=>{
                const deadline=Date.now()+5000;const check=()=>{
                    if(window.messageLog.some(x=>x.data==='child first' && x.origin==='http://b.source-two.test'))return resolve(true);
                    if(Date.now()>deadline)return reject(new Error('child-first message missing'));
                    setTimeout(check,20);
                };check();
            })''')
            assert first_contact
            await frame.locator('body').evaluate('''()=>{
                const third=document.createElement('iframe');third.id='third';third.name='third';
                third.src='http://c.source-three.test/';document.body.appendChild(third);
            }''')
            third=frame.frame_locator('#third')
            await expect(third.locator('h1')).to_have_text('Site c')
            await child.locator('body').evaluate("()=>window.sendSibling('sibling first')")
            assert await third.locator('body').evaluate('''()=>new Promise((resolve,reject)=>{
                const deadline=Date.now()+5000;const check=()=>{
                    if(window.messageLog.some(x=>x.data==='sibling first' && x.origin==='http://b.source-two.test'))return resolve(true);
                    if(Date.now()>deadline)return reject(new Error('sibling-first message missing'));
                    setTimeout(check,20);
                };check();
            })''')
            await frame.locator('#third').evaluate('(el)=>el.remove()')
            await frame.locator('body').evaluate("()=>window.sendCross('http://b.source-two.test','reply please')")
            await frame.locator('body').evaluate('''()=>new Promise((resolve,reject)=>{
                const timer=setTimeout(()=>reject(new Error('event.source reply missing')),5000);
                const check=()=>{if(window.messageLog.some(x=>x.data==='reply from b')){clearTimeout(timer);resolve(true);}else setTimeout(check,20);};check();
            })''')
            clone_checks = await frame.locator('body').evaluate('''()=>{
                const result=[];
                for(const origin of ['http://a.source-one.test','http://b.source-two.test','*']) {
                    try{window.sendCross(origin,()=>{});result.push('NO ERROR');}catch(e){result.push(e.name);}
                }
                const bytes=new ArrayBuffer(8);window.sendCross('http://wrong.example','discarded',[bytes]);
                result.push(bytes.byteLength);return result;
            }''')
            assert clone_checks == ['DataCloneError','DataCloneError','DataCloneError',0], clone_checks
            port_reply = await frame.locator('body').evaluate('''()=>new Promise((resolve,reject)=>{
                const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('port transfer missing')),5000);
                channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
                window.sendCross('http://b.source-two.test','port please',[channel.port2]);
            })''')
            assert port_reply == 'port from b'
            probe_reply = await frame.locator('body').evaluate('''()=>new Promise(resolve=>{
                const n=window['%hammerhead%'].nativeMethods,id=crypto.randomUUID();let replies=0;
                const listener=event=>{if(n.messageEventDataGetter.call(event)?.__vtOriginReply===id)replies++;};
                n.addEventListener.call(window,'message',listener);
                n.postMessage.call(document.getElementById('other').contentWindow,{__vtOriginProbe:id},'*');
                setTimeout(()=>{n.removeEventListener.call(window,'message',listener);resolve(replies);},1000);
            })''')
            assert probe_reply == 0, 'silent website disclosed its origin through an automatic bridge reply'
            if os.environ.get('VT_REALM_TEST'):
                await expect(child.locator('#bytes-worker-result')).to_have_text('worker imported')
            if os.environ.get('VT_REALM_TEST'):
                await expect(child.locator('#data')).to_have_text('{"site":"b","cookie":""}')
                await page.wait_for_function('''async()=>{
                    const seen=await(await fetch('/seen')).json();
                    return seen.some(r=>r.path==='/private-image?owner=a')&&seen.some(r=>r.path==='/private-image?owner=b');
                }''')
                seen=await page.evaluate('async()=>await(await fetch("/seen")).json()')
                own_images=[r for r in seen if r['path']=='/private-image?owner=a']
                nested_images=[r for r in seen if r['path']=='/private-image?owner=b']
                assert all('private_a=secret_a' in r['cookie'] for r in own_images),own_images
                assert all(r['cookie']=='' for r in nested_images),nested_images
                # Copying a valid main-context CSS URL into a different frame
                # must fail before it can launder nested requests via Referer.
                css=await frame.locator('#private-style').evaluate('(el)=>window["%hammerhead%"].nativeMethods.getAttribute.call(el,"href")')
                async with page.expect_response(lambda response: response.url==css and response.status==403):
                    await child.locator('body').evaluate('''(_,url)=>{
                        const n=window['%hammerhead%'].nativeMethods,link=document.createElement('link');
                        n.setAttribute.call(link,'rel','stylesheet');n.setAttribute.call(link,'href',url);
                        n.appendChild.call(document.head,link);
                    }''',css)
            else:
                await expect(child.locator('#data')).to_contain_text('visible_b=value_b')
            await frame.locator('body').evaluate('''()=>{
                window.addEventListener('message',event=>{
                    if(event.data==='forged-origin')document.getElementById('message').textContent=event.origin;
                });
            }''')
            await child.locator('body').evaluate('''()=>{
                const native=window['%hammerhead%'].nativeMethods;
                native.postMessage.call(window.parent,{
                    type:'hammerhead|user-msg',message:'forged-origin',
                    originUrl:'http://a.source-one.test',targetUrl:'*'
                },'*');
            }''')
            await expect(frame.locator('#message')).to_have_text('http://b.source-two.test')
            # Observe the native envelope, bypassing the receiving engine's
            # voluntary target filtering. Wrong-origin data must never arrive.
            if os.environ.get('VT_BROWSER_DIAGNOSTICS'):
                for target in [frame,child]:
                    await target.locator('body').evaluate('''()=>{
                        const n=window['%hammerhead%'].nativeMethods;
                        n.addEventListener.call(window,'message',e=>console.error('VT_MESSAGE',JSON.stringify(n.messageEventDataGetter.call(e)),n.messageEventOriginGetter.call(e)),true);
                        const send=window.vibetopPostMessage;
                        window.vibetopPostMessage=(...args)=>{console.error('VT_SEND',args[2]);return send(...args);};
                    }''')
            await child.locator('body').evaluate('''()=>{
                const n=window['%hammerhead%'].nativeMethods;window.nativePayloads=[];
                n.addEventListener.call(window,'message',event=>{
                    const data=n.messageEventDataGetter.call(event);
                    if(data?.type==='hammerhead|user-msg') {
                        window.nativePayloads.push(data.message);
                        document.getElementById('message').textContent=JSON.stringify(window.nativePayloads);
                    }
                });
            }''')
            await frame.locator('body').evaluate('''()=>{
                window.sendCross('http://a.source-one.test','SECRET_MUST_NOT_ARRIVE');
                window.sendCross('http://b.source-two.test','correct recipient');
                window.sendCross('*','wildcard follows');
            }''')
            await expect(child.locator('#message')).to_have_text('["correct recipient","wildcard follows"]')
            isolation = await frame.locator('#other').evaluate('''(iframe)=>{
                const result=[];
                for(const read of [()=>iframe.contentWindow.document.body.innerText,
                    ()=>iframe.contentWindow.localStorage.secret,()=>iframe.contentWindow.document.cookie]) {
                    try { read();result.push('LEAK'); } catch(e) { result.push(e.name); }
                } return result;
            }''')
            assert isolation == ['SecurityError'] * 3, isolation
            await frame.locator('#file').set_input_files({'name':'hello.txt','mimeType':'text/plain','buffer':b'upload payload'})
            await frame.locator('#upload').click()
            await expect(frame.locator('#uploaded')).to_contain_text('upload payload')
            async with page.expect_download() as download:
                await frame.locator('#download').click()
            downloaded = await download.value
            assert downloaded.suggested_filename == 'fixture.txt'
            assert Path(await downloaded.path()).read_text() == 'download payload'
            await frame.locator('#next').click()
            await expect(frame.locator('h1')).to_have_text('Site b')
            if os.environ.get('VT_REALM_TEST'):
                await expect(frame.locator('#data')).to_contain_text('visible_b=value_b')
                await expect(frame.locator('#worker-result')).to_have_text('worker imported')
                await expect(frame.locator('#blob-worker-result')).to_have_text('worker imported')
                await frame.locator('#submit-form').click()
                await expect(frame.locator('h1')).to_have_text('Submitted',timeout=15000)
                await expect(frame.locator('#submitted')).to_have_text('message=hello+%26+goodbye')
                seen=await page.evaluate('async()=>await(await fetch("/seen")).json()')
                submitted=[request for request in seen if request['path']=='/submitted']
                assert len(submitted)==1,submitted
                assert submitted[0]['method']=='POST',submitted
                assert submitted[0]['body']=='message=hello+%26+goodbye',submitted
                assert submitted[0]['origin']=='http://b.source-two.test',submitted
                assert submitted[0]['cookie']=='',submitted
                await page.goto(config['parent'])
                await expect(frame.locator('#data')).to_contain_text('strict_a=strict_secret')
                await expect(frame.locator('#blob-worker-result')).to_have_text('worker imported')
                await expect(frame.locator('#module-bases')).to_have_text('one,two')
                await expect(frame.frame_locator('#other').locator('#bytes-worker-result')).to_have_text('worker imported')
                await frame.locator('#redirect-form').click()
                await expect(frame.locator('h1')).to_have_text('Redirect complete',timeout=20000)
                seen=await page.evaluate('async()=>await(await fetch("/seen")).json()')
                chain=[r for r in seen if r['path'] in ['/redirect307','/redirect303','/redirect-final']]
                assert [r['method'] for r in chain]==['POST','POST','GET'],chain
                assert [r['body'] for r in chain]==['message=redirect+bytes','message=redirect+bytes',''],chain
                assert [r['origin'] for r in chain[:2]]==['http://a.source-one.test','null'],chain
                assert 'private_a=secret_a' in chain[-1]['cookie'],chain
                assert 'strict_a=' not in chain[-1]['cookie'],chain
            # WebKit emits the deliberately denied CORS request as a page error,
            # even though the fixture catches its rejection. Everything else fails.
            unexpected = [error for error in errors if not ('/cors-deny' in error and 'access control checks' in error)]
            assert not unexpected, unexpected
            escaped = [url for url in outbound if urlsplit(url).scheme in ('http','https','ws','wss')
                       and not urlsplit(url).hostname.endswith('.vt-proxy.example.com')]
            assert not escaped, escaped
            print(json.dumps({'engine':engine,'status':'PASS','checks':['interaction','images','cookie isolation','CORS','anonymous modules','storage isolation','nested and blank frames','transferable messages','classic and blob workers','upload','download','navigation']}))
            await browser.close()
            browser = None
    finally:
        if proc.returncode is None:
            proc.terminate()
            try: await asyncio.wait_for(proc.wait(), 5)
            except asyncio.TimeoutError: proc.kill(); await proc.wait()

asyncio.run(main())
