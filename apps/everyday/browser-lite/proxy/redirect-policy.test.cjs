'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {redirectTaint,navigationFetchSite}=require('./redirect-policy.cjs');
test('redirect origin taint follows the entire chain, including a return to the initiator',()=>{
 const a='https://a.example',b='https://b.test',c='https://c.invalid';
 assert.equal(redirectTaint('same-origin',a,a,b),'same-origin');
 assert.equal(redirectTaint('same-origin',a,b,c),'cross-site');
 assert.equal(redirectTaint('same-origin',a,b,a),'cross-site');
 assert.equal(redirectTaint('cross-site',a,a,a),'cross-site');
 assert.equal(redirectTaint('same-origin',a,b,b),'same-origin');
});
test('same-site redirects can still taint the Origin header',()=>{
 assert.equal(redirectTaint('same-origin','https://a.example.com','https://b.example.com','https://c.example.com'),'same-site');
});
test('typed URLs and redirect detours preserve Fetch Metadata semantics',()=>{
 const a='https://a.example.com';
 assert.equal(navigationFetchSite({sourceOrigin:null,crossSiteRedirect:true},'null',a),'none');
 assert.equal(navigationFetchSite({sourceOrigin:a,originTaint:'same-site'},a,a),'same-site');
 assert.equal(navigationFetchSite({sourceOrigin:a,crossSiteRedirect:true},a,a),'cross-site');
 assert.equal(navigationFetchSite(null,a,a),'same-origin');
});
