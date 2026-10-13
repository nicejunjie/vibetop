import asyncio,json,sys
from playwright.async_api import async_playwright
async def main():
 engine=sys.argv[1]
 async with async_playwright() as p:
  opts={'headless':True}
  if engine=='chromium':opts.update(executable_path='/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome',chromium_sandbox=True)
  else:opts.update(executable_path='/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh')
  b=await getattr(p,engine).launch(**opts);c=await b.new_context();page=await c.new_page();errs=[]
  page.on('pageerror',lambda e:errs.append(str(e)+'\n'+(e.stack or '')))
  page.on('response',lambda r:print('bad',r.status,r.url,flush=True) if r.status>=400 else None)
  try:
   await page.goto('http://a.vt-proxy.test:18990/fixtureprofile/http://a.vt-source.test:18985/',timeout=20000)
   await page.locator('#button').click();await page.wait_for_timeout(1500)
   print('frames',[f.url for f in page.frames],flush=True)
   print('count',await page.locator('#count').text_content(),'data',await page.locator('#data').text_content(),flush=True)
   print('isolation',await page.evaluate('''()=>{let f=document.querySelector('iframe');let result={};for(const [k,fn] of Object.entries({dom:()=>f.contentWindow.document.body.innerText,storage:()=>f.contentWindow.localStorage.secret,cookie:()=>f.contentWindow.document.cookie})){try{result[k]=fn()}catch(e){result[k]='BLOCKED:'+e.name}}return result}'''),flush=True)
   print('child',await page.frame_locator('#other').locator('#data').text_content(),flush=True)
   print('image',await page.locator('#image').evaluate('(e)=>e.naturalWidth'),flush=True)
   await page.locator('#next').click();await page.wait_for_timeout(1000)
   print('next',page.url, (await page.locator('body').inner_text())[:300],flush=True)
  except Exception as e:print('FAIL',str(e)[:600],flush=True)
  print('errors',json.dumps(errs[:15]),flush=True)
  await b.close()
asyncio.run(main())
