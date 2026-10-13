"""Real browsing operations through the isolated public harness, never real accounts.
Start public-harness.cjs and pass its JSON output file. A blocked or broken site
is a failed acceptance check, not a skipped success.
"""
import asyncio
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit
from playwright.async_api import async_playwright, expect

async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('engine',choices=['chromium','webkit'])
    parser.add_argument('config_file')
    parser.add_argument('--sites',nargs='+',choices=['wikipedia','github','codemirror','google'],
                        default=['wikipedia','github','codemirror','google'])
    options=parser.parse_args()
    engine, config_file = options.engine, options.config_file
    selected=set(options.sites)
    config = json.loads(Path(config_file).read_text().strip().splitlines()[-1])
    results = []
    async with async_playwright() as p:
        options = dict(headless=True, proxy={'server': config['browserProxy']})
        if engine == 'chromium':
            options.update(executable_path='/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome', chromium_sandbox=True)
        else:
            options.update(executable_path='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh')
        browser = await getattr(p, engine).launch(**options)
        for name, url in [('wikipedia','https://www.wikipedia.org/'), ('github','https://github.com/python/cpython'),
                          ('codemirror','https://codemirror.net/try/'), ('google','https://www.google.com/')]:
            if name not in selected:continue
            device={k:v for k,v in p.devices['iPhone 13'].items() if k!='default_browser_type'} if engine=='webkit' else {}
            context = await browser.new_context(ignore_https_errors=True,**device)
            page = await context.new_page()
            errors, escaped, failed_requests, console_errors = [], [], [], []
            page.on('response',lambda response:failed_requests.append({'status':response.status,'path':response.url.rsplit('/https://',1)[-1][-240:]}) if response.status>=400 else None)
            page.on('console',lambda message:console_errors.append(message.text[:1000]) if message.type=='error' else None)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: escaped.append(r.url) if urlsplit(r.url).scheme in ('http','https','ws','wss')
                    and not (urlsplit(r.url).hostname or '').endswith('.vt-proxy.example.com') else None)
            try:
                await page.goto(config['parent']+'/app?url='+quote(url,safe=''), wait_until='domcontentloaded')
                frame = page.frame_locator('#stage > iframe:not([hidden])')
                if name == 'wikipedia':
                    await frame.locator('#searchInput').fill('Ada Lovelace')
                    await frame.locator('#searchInput').press('Enter')
                    await expect(frame.locator('#firstHeading')).to_have_text('Ada Lovelace',timeout=45000)
                    await expect(frame.locator('#mw-content-text')).to_contain_text('mathematician')
                    portrait=frame.locator('.infobox img').first
                    await portrait.scroll_into_view_if_needed()
                    loaded=await portrait.evaluate("""img=>new Promise(resolve=>{
                        if(img.complete)return resolve(img.naturalWidth>100);
                        const timer=setTimeout(()=>resolve(false),20000);
                        img.addEventListener('load',()=>{clearTimeout(timer);resolve(img.naturalWidth>100);},{once:true});
                        img.addEventListener('error',()=>{clearTimeout(timer);resolve(false);},{once:true});
                    })""")
                    assert loaded, 'Article portrait did not load within 20 seconds'
                elif name == 'github':
                    if engine=='webkit':
                        # GitHub serves this button before React attaches its
                        # click handler. Wait for the actual interactive control,
                        # rather than losing the only click during hydration.
                        await frame.get_by_role('button',name='View all files',exact=True).wait_for(timeout=45000)
                        await frame.locator('body').evaluate("""()=>new Promise((resolve,reject)=>{
                            const deadline=Date.now()+45000;
                            function ready(){
                                const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View all files');
                                const key=button && Object.keys(button).find(k=>k.startsWith('__reactProps$'));
                                if(key && typeof button[key].onClick==='function')return resolve();
                                if(Date.now()>deadline)return reject(new Error('GitHub file-list button did not hydrate'));
                                setTimeout(ready,100);
                            }ready();
                        })""")
                        await frame.get_by_role('button',name='View all files',exact=True).click(timeout=45000)
                    readme = frame.locator('a[href*="/blob/main/README.rst"]:visible').first
                    await readme.click(timeout=45000)
                    await expect(page.locator('#address')).to_have_value('https://github.com/python/cpython/blob/main/README.rst',timeout=45000)
                    await expect(frame.get_by_role('heading',name=re.compile('This is Python version'))).to_be_visible(timeout=45000)
                    await expect(frame.locator('body')).to_contain_text('README.rst')
                    await page.get_by_role('button',name='Back',exact=True).click()
                    if engine=='webkit':await expect(frame.get_by_role('button',name='View all files',exact=True)).to_be_visible(timeout=45000)
                    else:await expect(frame.locator('a[href*="/blob/main/README.rst"]:visible').first).to_be_visible(timeout=45000)
                elif name == 'codemirror':
                    editor = frame.frame_locator('iframe').locator('.cm-content')
                    await expect(editor).to_contain_text("console.log('hello')",timeout=45000)
                    await editor.click()
                    await editor.press('ControlOrMeta+End')
                    await editor.press('Enter')
                    await editor.press_sequentially('// Browser Lite editing works')
                    await expect(editor).to_contain_text('Browser Lite editing works')
                else:
                    await frame.locator('[name=q]').fill('Python programming language')
                    await frame.locator('[name=q]').press('Enter')
                    await expect(frame.locator('a h3').first).to_be_visible(timeout=45000)
                    assert await frame.locator('img').evaluate_all('(imgs)=>imgs.some(i=>i.complete && i.naturalWidth>0)')
                assert not errors, errors
                assert not escaped, escaped
                results.append({'site':name,'status':'PASS'})
            except Exception as exc:
                results.append({'site':name,'status':'FAIL','error':str(exc)[:1800], 'page_errors':errors[:5], 'escaped':escaped[:5], 'http_failures':failed_requests[:10], 'console_errors':console_errors[:5]})
            await page.screenshot(path=f'/tmp/vt-acceptance-{engine}-{name}.png')
            print(json.dumps(results[-1]),flush=True)
            await context.close()
        await browser.close()
    if any(result['status'] != 'PASS' for result in results):
        raise SystemExit(1)

asyncio.run(main())
