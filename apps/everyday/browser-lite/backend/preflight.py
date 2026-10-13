#!/usr/bin/env python3
"""Run as the real nonroot service UID with the production systemd limits."""
import asyncio
import os
import tempfile
from playwright.async_api import async_playwright

async def main():
    if os.getuid()==0:raise RuntimeError('Sandbox preflight must run as a non-root user')
    async with async_playwright() as p:
        with tempfile.TemporaryDirectory(prefix='browser-lite-preflight-') as profile:
            context=await p.chromium.launch_persistent_context(profile,channel='chromium',headless=True,chromium_sandbox=True,args=['--enable-automation'])
            page=context.pages[0];session=await context.new_cdp_session(page)
            command=await session.send('Browser.getBrowserCommandLine')
            if '--no-sandbox' in command['arguments']:raise RuntimeError('Browser sandbox was disabled')
            await page.goto('chrome://sandbox')
            diagnostic=await page.locator('body').inner_text()
            if 'You are adequately sandboxed' not in diagnostic:raise RuntimeError('Chromium sandbox verification failed')
            await page.goto('about:blank');assert await page.evaluate('1+1')==2
            await context.close()
    print('Browser Lite preflight: nonroot Chromium namespace/seccomp sandbox and JavaScript verified')

if __name__=='__main__':asyncio.run(main())
