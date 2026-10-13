"""Hermetic contracts for the optional Browser Lite protocol and root proxy."""
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
from unittest.mock import Mock, patch
import pytest

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/'apps/everyday/browser-lite/backend'
spec=importlib.util.spec_from_file_location('lite_core',BACKEND/'core.py')
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
spec=importlib.util.spec_from_file_location('lite_proxy',ROOT/'server/browser_lite.py')
proxy=importlib.util.module_from_spec(spec);spec.loader.exec_module(proxy)

@pytest.mark.parametrize('url',['file:///etc/passwd','javascript:alert(1)','chrome://settings','https://u:p@example.com','https://host:bad/','https:///missing',''])
def test_navigation_only_http_without_embedded_passwords(url):
    with pytest.raises(core.LiteError):core.validate_url(url)

@pytest.mark.parametrize('url',['https://example.com/a?q=x','http://localhost:8080/','http://127.0.0.1/'])
def test_same_network_capability_as_existing_browser(url):
    assert core.validate_url(url)==url


def test_css_urls_resolve_to_original_sheet_and_handle_escapes_comments():
    registered=[]
    css='/* url(ignore) */ .a{background:url("../img/a)b.png")} .b{src:u\\72l(../font/f.woff2)} .c{content:"url(not-a-resource)"}'
    result=core.rewrite_css(css,'https://example.com/css/theme/main.css',lambda u:registered.append(u) or str(len(registered)))
    assert registered==['https://example.com/css/img/a)b.png','https://example.com/css/font/f.woff2']
    assert 'url("lite-asset:1")' in result and 'url("lite-asset:2")' in result
    assert 'url(ignore)' in result and 'url(not-a-resource)' in result


def test_css_import_media_preserved_and_advanced_import_explicitly_unsupported():
    assert core.import_spec('"../common.css" screen and (min-width: 400px)','https://example.com/css/a.css')==('https://example.com/common.css','screen and (min-width: 400px)')
    assert core.import_spec('url("a.css") layer(test)','https://example.com/') is None
    assert core.import_spec('url("a.css") supports(display:grid)','https://example.com/') is None
    assert core.import_spec('"file:///secret"','https://example.com/') is None


def test_incremental_update_does_not_repeat_unchanged_graph():
    first=[{'id':1,'tag':'body','parent':0},{'id':2,'tag':'#text','parent':1,'text':'before'},{'id':3,'tag':'p','parent':1}]
    new=[first[0],{'id':2,'tag':'#text','parent':1,'text':'after'}]
    d=core.delta(first,new)
    assert d=={'put':[new[1]],'remove':[3]}
    assert core.delta(new,new)=={'put':[],'remove':[]}


def test_baseline_chunks_are_ordered_and_bounded():
    nodes=[{'id':i,'text':'a'*10000} for i in range(100)]
    blocks=core.chunks(nodes)
    assert len(blocks)>1 and [n for block in blocks for n in block]==nodes
    assert all(len(core.pack(block))<=core.CHUNK_BYTES+2 for block in blocks)


def test_deployed_frame_hash_matches_only_trusted_inline_script():
    html=(BACKEND.parent/'browser-lite-frame.html').read_text()
    inline=re.findall(r'<script>([\s\S]*?)</script>',html)
    assert len(inline)==1
    sha=base64.b64encode(hashlib.sha256(inline[0].encode()).digest()).decode()
    assert "script-src 'sha256-"+sha+"'" in html
    source=(BACKEND.parent/'browser-lite-renderer.js').read_text().replace('</script','<\\/script')
    assert inline[0]==source
    assert html.index('Content-Security-Policy')<html.index('<script>')
    assert "connect-src 'none'" in html and "form-action 'none'" in html
    assert "'unsafe-eval'" not in html and 'allow-same-origin' not in html


def test_browser_start_explicitly_enables_sandbox():
    agent=(BACKEND/'agent.py').read_text()
    assert 'chromium_sandbox=True' in agent and "'--no-sandbox'" not in agent


def test_root_proxy_binds_session_and_resource_to_authenticated_user():
    h=Mock();h.path='/api/browser-lite/resource';h.command='POST'
    body=json.dumps({'session':'s','resource':'r','user':'other','op':'anything'}).encode()
    h.headers={'Content-Length':str(len(body))};h.rfile=io.BytesIO(body)
    with patch.object(proxy,'_call',return_value={'ok':True}) as call:
        proxy.handle(h,'alice',[])
    assert call.call_args.args[0]=='alice'
    assert call.call_args.args[1]['op']=='resource'
    h._json.assert_called_once_with(200,{'ok':True})


def test_root_proxy_enforces_longpoll_limit_even_with_malicious_client():
    h=Mock();h.path='/api/browser-lite/updates';h.command='POST'
    proxy._slots[('alice','poll')]=3
    try:
        with patch.object(proxy,'_call') as call:proxy.handle(h,'alice',[])
        call.assert_not_called();h.send_response.assert_called_once_with(503)
        h.send_header.assert_any_call('Retry-After','2')
    finally:proxy._slots.clear()


def test_worker_backend_not_published_and_update_paths_are_specific():
    installer=(ROOT/'shell/install.sh').read_text()
    assert "! -path '*/backend/*'" in installer
    for path in ('server/terminal-manager.py','server/update-watchdog.py'):
        src=(ROOT/path).read_text()
        assert 'touched("apps/everyday/browser-lite/")' in src
        assert 'touched("apps/everyday/browser/")' in src
        assert 'INSTALL_DEPS' in src


def test_resource_caps_honor_stricter_existing_policy():
    props=proxy._caps(['--property','MemoryMax=1G','--property','CPUQuota=100%','--property','TasksMax=128'])
    assert 'MemoryMax=1G' in props and 'CPUQuota=100%' in props and 'TasksMax=128' in props
    props=proxy._caps(['--property','MemoryMax=8G','--property','CPUQuota=400%'])
    assert 'MemoryMax=2G' in props and 'CPUQuota=200%' in props


def test_unknown_operation_never_reaches_agent():
    h=Mock();h.path='/api/browser-lite/evaluate';h.command='POST'
    with patch.object(proxy,'_call') as call:proxy.handle(h,'alice',[])
    call.assert_not_called();assert h._json.call_args.args[0]==404
