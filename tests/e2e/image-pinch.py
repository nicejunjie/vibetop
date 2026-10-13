#!/usr/bin/env python3
"""Browser regression for continuous image zoom using a large image fixture."""
import argparse
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--html', default=str(ROOT/'apps/everyday/imageview/imageview.html'))
parser.add_argument('--engine', choices=['chromium','webkit'], default='chromium')
parser.add_argument('--browser-path')
args=parser.parse_args()
with sync_playwright() as p:
    browser=getattr(p,args.engine).launch(headless=True,executable_path=args.browser_path)
    page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        path=urlsplit(r.request.url).path
        if path=='/imageview.html':r.fulfill(path=args.html,content_type='text/html')
        elif path=='/pinch.js':r.fulfill(path=str(ROOT/'shared/pinch.js'),content_type='application/javascript')
        elif path=='/api/file/image':r.fulfill(body='<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><rect width="4000" height="3000" fill="royalblue"/></svg>',content_type='image/svg+xml')
        else:r.fulfill(json={'ok':True,'entries':[]})
    page.route('**/*',route)
    page.goto('http://vibetop.test/imageview.html?path=/tmp/large.svg')
    page.wait_for_function("document.querySelector('#stage img')?.naturalWidth === 4000")
    page.wait_for_timeout(400)
    base=page.locator('#stage img').bounding_box()['width']
    box=page.locator('#stage').bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
    def pointer(kind,ident,x):
        page.dispatch_event('#stage',kind,{'pointerId':ident,'pointerType':'touch','clientX':x,'clientY':cy,'button':0,'bubbles':True,'cancelable':True})
    pointer('pointerdown',1,cx-50);pointer('pointerdown',2,cx+50)
    ratios=[]
    for x in [cx+60,cx+70,cx+55,cx+50]:
        pointer('pointermove',2,x)
        ratios.append(page.locator('#stage img').bounding_box()['width']/base)
    for actual,expected in zip(ratios,[1.1,1.2,1.05,1]):assert abs(actual-expected)<.01,(ratios,base)
    pointer('pointerup',2,cx+50);pointer('pointerup',1,cx-50)
    page.dispatch_event('#stage','wheel',{'deltaY':-1,'ctrlKey':True,'clientX':cx,'clientY':cy,'bubbles':True,'cancelable':True})
    ratio=page.locator('#stage img').bounding_box()['width']/base
    assert 1<ratio<1.02,ratio
    assert not errors,errors
    print(args.engine,'pinch ratios:',ratios,'trackpad:',round(ratio,4))
    browser.close()
