"""Hermetic browser regression: real shell CSS must allow coach-tip dismissal.
Run with a Python environment containing Playwright and its Chromium browser:
    python tests/e2e/coach-dismiss.py
No live server, account, or desktop preferences are touched.
"""
from pathlib import Path
import re

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
html = (ROOT / 'shell/desktop.html').read_text()
styles = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
coach = (ROOT / 'shell/coach.js').read_text()

with sync_playwright() as p:
    browser = p.chromium.launch()
    for window_mode in (False, True):
        for touch in (False, True):
            context = browser.new_context(has_touch=touch)
            page = context.new_page()
            page.route('http://coach.test/', lambda route: route.fulfill(
                content_type='text/html', body='<style>' + styles + '</style><body></body>'))
            page.goto('http://coach.test/')
            page.add_script_tag(content=coach)
            page.evaluate('wm => document.body.classList.toggle("wm", wm)', window_mode)
            page.evaluate('''() => vibeCoach({key: 'test:tip', text: 'Dismiss me'}, {bottom: 60})''')
            tip = page.locator('.vibe-coach')
            assert tip.is_visible()
            if touch:
                tip.tap(timeout=2000)
            else:
                tip.click(timeout=2000)
            assert tip.count() == 0
            assert page.evaluate('localStorage.getItem("test:tip")') == 'done'
            assert page.evaluate('''() => vibeCoach({key: 'test:tip', text: 'Dismiss me'})''') is None
            print(f'PASS window_mode={window_mode}, touch={touch}: dismissed and persisted')
            context.close()
    browser.close()
