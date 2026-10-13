"""Diagnostic baseline: unrewritten GitHub in a mobile WebKit iframe.

Only this disposable test removes frame-embedding response headers. Website
scripts and styles are untouched; asset requests are delayed 250 ms to expose
layout timing. Page errors remain in the output. This is not an acceptance pass.
"""
import asyncio,json,re
from playwright.async_api import async_playwright,expect
async def main():
 async with async_playwright() as p:
  b=await p.webkit.launch(executable_path='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh')
  c=await b.new_context(**{k:v for k,v in p.devices['iPhone 13'].items() if k!='default_browser_type'})
  async def headers(route):
   response=await route.fetch();h=dict(response.headers)
   h.pop('x-frame-options',None);h.pop('content-security-policy',None)
   await route.fulfill(response=response,headers=h)
  async def assets(route):
   await asyncio.sleep(.25)
   await route.continue_()
  await c.route('https://github.githubassets.com/**',assets)
  await c.route('https://github.com/**',headers)
  await c.route('https://fixture.test/',lambda route:route.fulfill(content_type='text/html',body='<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:390px;height:531px}</style><iframe sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals" src="https://github.com/python/cpython"></iframe>'))
  page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('https://fixture.test/',wait_until='domcontentloaded')
  frame=page.frame_locator('iframe');button=frame.get_by_role('button',name='View all files',exact=True)
  await button.wait_for(timeout=45000)
  await frame.locator('body').evaluate('''()=>new Promise(resolve=>{function ready(){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View all files');const k=b&&Object.keys(b).find(k=>k.startsWith('__reactProps$'));if(k&&typeof b[k].onClick==='function')resolve();else setTimeout(ready,100);}ready();})''')
  await button.click();await frame.locator('a[href*="/blob/main/README.rst"]:visible').first.click(timeout=45000)
  await expect(frame.get_by_role('heading',name=re.compile('This is Python version'))).to_be_visible(timeout=45000)
  print(json.dumps({'nativeIframe':True,'errors':errors,'status':'README loaded'}));await c.unroute_all(behavior='ignoreErrors');await b.close()
asyncio.run(main())
