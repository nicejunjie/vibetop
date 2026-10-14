'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {engineRequire}=require('./engine.cjs');
test('both client engines map realm-root URLs whatever the port spelling',()=>{
  for(const name of ['client/hammerhead.js','client/worker-hammerhead.js']) {
    const code=fs.readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/'+name),'utf8');
    const at=code.indexOf('/* vt-realm-root-port */');
    assert.ok(at>0,name);
    const start=code.lastIndexOf('if (parsedUrl.protocol === proxyServerProtocol',at);
    const condition=code.slice(start+3,code.lastIndexOf(')',at)+1).replace(/\s+/g,' ');
    const matches=new Function('parsedUrl','proxyServerProtocol','proxyHostname','proxyPort','return '+condition+';');
    const url=(protocol,hostname,port)=>({protocol,hostname,port});
    assert.equal(matches(url('https:','realm','') ,'https:','realm','443'),true);
    assert.equal(matches(url('https:','realm','443'),'https:','realm',''),true);
    assert.equal(matches(url('https:','realm',''),'https:','realm',''),true);
    assert.equal(matches(url('https:','realm','8443'),'https:','realm','443'),false);
    assert.equal(matches(url('https:','other',''),'https:','realm','443'),false);
    assert.equal(matches(url('http:','realm',''),'https:','realm','443'),false);
  }
});
