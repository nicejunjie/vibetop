import asyncio
import sys
import re
from urllib.parse import urlsplit
from playwright.async_api import async_playwright, expect


async def main():
    engine = sys.argv[2]
    async with async_playwright() as playwright:
        browser_type = getattr(playwright, engine)
        executable = "/opt/vibetop/browser-lite/browsers/chromium-1243/chrome-linux64/chrome" if engine == "chromium" else "/opt/vibetop/browser-lite/test-browsers/webkit-2359/pw_run.sh"
        options = {"headless": True, "executable_path": executable, "proxy": {"server": "http://127.0.0.1:" + sys.argv[1]}}
        if engine == "chromium":
            options["chromium_sandbox"] = True
        browser = await browser_type.launch(**options)
        async def device(token):
            presentation = dict(playwright.devices["iPhone 13"]) if engine == "webkit" else {"viewport":{"width":1280,"height":800}}
            presentation.pop("default_browser_type", None)
            context = await browser.new_context(ignore_https_errors=True, **presentation)
            await context.add_cookies([{"name": "test_main", "value": token, "url": "https://vibetop.vt-browser.example.com", "secure": True, "httpOnly": True, "sameSite": "Lax"}])
            await context.add_init_script("""window.__vtCspFailures=[]; document.addEventListener('securitypolicyviolation', event => {
                window.__vtCspFailures.push({directive:event.effectiveDirective, blocked:event.blockedURI,
                    document:location.protocol === 'about:' ? location.href : location.hostname});
            });""")
            page = await context.new_page()
            page.set_default_timeout(45000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            # Playwright WebKit screenshot itself injects a stylesheet and can
            # trigger CSP. Require zero style failures BEFORE taking screenshots.
            page.on("console", lambda entry: errors.append(entry.text) if
                    entry.type == 'error' and 'Refused to apply a stylesheet' in entry.text else None)
            page.on("console", lambda entry: print("CONSOLE", re.sub(r'https?://[^\s\"\x27]+', '<url>', entry.text)[:600], flush=True) if entry.type == 'error' else None)
            page.on("requestfailed", lambda req: print("NETWORK", urlsplit(req.url).hostname, req.failure, flush=True))
            page.on("response", lambda response: print("HTTP", response.status, urlsplit(response.url).hostname, flush=True) if response.status>=400 else None)
            await page.goto("https://vibetop.vt-browser.example.com/", wait_until="domcontentloaded")
            try:
                await expect(page.locator("#cover")).to_be_hidden(timeout=60000)
            except AssertionError:
                await page.screenshot(path="/tmp/vt-frontdoor-failed-" + engine + ".png")
                print("Cookie metadata", [{key: item[key] for key in ('name', 'domain', 'path', 'secure', 'sameSite')} for item in await context.cookies()], flush=True)
                print("UI frames", [(urlsplit(frame.url).hostname, await frame.locator('body').inner_text()) for frame in page.frames], flush=True)
                print("UI errors", errors, flush=True)
                raise
            print("UI ready", token, flush=True)
            ui = page.frame_locator("#browser")
            await ui.get_by_role("textbox", name="Address or search").fill("https://www.wikipedia.org/")
            await ui.get_by_role("button", name="Go", exact=True).click()
            try:
                await expect(ui.frame_locator("iframe").locator("#searchInput")).to_be_visible(timeout=60000)
            except AssertionError:
                await page.screenshot(path="/tmp/vt-frontdoor-failed-" + engine + ".png")
                print("Page frames", [(urlsplit(item.url).hostname, (await item.locator('body').inner_text())[:1500]) for item in page.frames], flush=True)
                print("Page errors", [re.sub(r'https?://[^\s\"\x27]+', '<url>', item) for item in errors], flush=True)
                raise
            print("Wikipedia page ready", token, flush=True)
            frame = next(frame for frame in page.frames if frame.url.startswith("https://browser-lite."))
            content = next(item for item in page.frames if item.parent_frame == frame)
            await content.wait_for_load_state("load")
            assert await content.locator('img').evaluate_all('(images)=>images.some(img=>img.complete && img.naturalWidth>100)'), 'Default images did not load'
            for button in ('#new-tab', '#reload', '#back', '#forward', '.tab.active .close'):
                element = frame.locator(button)
                if await element.count():
                    bounds = await element.bounding_box()
                    assert bounds and bounds['width'] >= 44 and bounds['height'] >= 44, (button, bounds)
            await frame.evaluate("window.frontdoorMarker = 12345")
            return context, page, ui, frame, errors
        async def action(page, endpoint):
            assert await page.evaluate("async endpoint => (await fetch('/test/'+endpoint,{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}})).status", endpoint) == 200
        async def navigate(page, ui, frame, button):
            content = next(item for item in page.frames if item.parent_frame == frame)
            async with page.expect_event('framenavigated', predicate=lambda item: item == content):
                await ui.locator(button).click()
            await content.wait_for_load_state('load')
            await expect(ui.frame_locator('iframe').locator('#searchInput')).to_be_visible()
        try:
            context, page, ui, frame, errors = await device("device-a")
            for target in (page, frame):
                await target.evaluate("window.messageTypes=[];window.addEventListener('message',e=>messageTypes.push([e.data?.type,e.origin]))")
            # Lost UI credential is renewed through the existing Vibetop parent,
            # retaining the actual UI Document and its loaded child tab.
            await context.clear_cookies(name="__Host-vt_bl_ui")
            await frame.evaluate("window.dispatchEvent(new Event('pageshow'))")
            for _ in range(100):
                if any(cookie["name"] == "__Host-vt_bl_ui" for cookie in await context.cookies()):
                    break
                await asyncio.sleep(.1)
            else:
                print("Renewal status", await ui.locator('#status').inner_text(), await page.evaluate('messageTypes'), await frame.evaluate('messageTypes'), flush=True)
                raise AssertionError("UI credential was not renewed")
            assert await frame.evaluate("window.frontdoorMarker") == 12345
            await expect(ui.frame_locator("iframe").locator("#searchInput")).to_be_visible()
            # Root manager restart: next UI heartbeat adopts without reloading.
            await action(page, "restart-manager")
            await frame.evaluate("window.dispatchEvent(new Event('pageshow'))")
            await navigate(page, ui, frame, '#reload')
            # Runtime restart: stale lanes expire; explicit retry reopens GET.
            await action(page, "restart-rewriter")
            await frame.evaluate("window.dispatchEvent(new Event('pageshow'))")
            await expect(ui.locator("#retry")).to_be_visible()
            await navigate(page, ui, frame, '#retry')
            await expect(ui.locator("#retry")).to_be_hidden()
            await expect(ui.frame_locator("iframe").locator("#searchInput")).to_be_visible()
            second_context, second_page, second_ui, second_frame, second_errors = await device("device-b")
            await action(page, "logout")
            await frame.evaluate("window.dispatchEvent(new Event('pageshow'))")
            await expect(ui.locator("#retry")).to_be_visible()
            await navigate(second_page, second_ui, second_frame, '#reload')
            assert await second_frame.evaluate("window.frontdoorMarker") == 12345
            for current_page in (page, second_page):
                for current_frame in current_page.frames:
                    violations = await current_frame.evaluate('window.__vtCspFailures || []')
                    if violations:
                        print('CSP diagnostics', violations, flush=True)
            assert not errors and not second_errors, errors + second_errors
            await second_page.screenshot(path="/tmp/vt-frontdoor-" + engine + ".png")
            print("PASS:", engine, "real page, in-place renewal, restarts, per-device logout")
        finally:
            await browser.close()


asyncio.run(main())
