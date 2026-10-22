#!/usr/bin/env python3
"""Terminal tab switching recovers a failed iframe without reloading the wrapper.
Uses routed fixtures and Chromium/WebKit; no production terminals are touched.
"""
import argparse
import pathlib
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/everyday/terminal'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--engine', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--browser-path')
args = parser.parse_args()
requests = {'/': 0, '/t1/': 0, '/t2/': 0}
with sync_playwright() as p:
    browser = getattr(p, args.engine).launch(headless=True, executable_path=args.browser_path)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route(request):
        path = urlsplit(request.request.url).path
        if path in requests:
            requests[path] += 1
        if path == '/':
            request.fulfill(body=(APP / 'terminals.html').read_text(), content_type='text/html')
        elif path == '/terminal-frame.js':
            request.fulfill(path=str(APP / 'terminal-frame.js'), content_type='application/javascript')
        elif path == '/tab-sync.js':
            request.fulfill(path=str(APP / 'lib/tab-sync.js'), content_type='application/javascript')
        elif path == '/api/terminals/status':
            request.fulfill(json={'running': [1, 2], 'order': [1, 2], 'schedules': []})
        elif path.startswith('/api/'):
            request.fulfill(json={})
        elif path == '/t2/' and requests[path] == 1:
            request.fulfill(status=502, body='<title>502 Bad Gateway</title>', content_type='text/html')
        else:
            request.fulfill(body='<body>Connected<script>window.term={scrollToBottom:function(){}};</script></body>', content_type='text/html')
    page.route('**/*', route)
    page.goto('http://vibetop.test/')
    page.locator('.tab[data-n="1"].active').wait_for()
    assert requests['/t2/'] == 0
    page.locator('.tab[data-n="2"]').click()
    page.get_by_role('status').filter(has_text='Loading terminal').wait_for()
    page.wait_for_function("document.getElementById('frame-2').contentWindow.term", timeout=10000)
    assert requests == {'/': 1, '/t1/': 1, '/t2/': 2}, requests
    page.locator('.tab[data-n="1"]').click()
    assert requests['/t1/'] == 1
    assert not errors, errors
    print(f'{args.engine}: switching tabs recovered the failed page; wrapper and working terminal loaded once')
    browser.close()
