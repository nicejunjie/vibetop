'use strict';
const {sameSite}=require('./cookie-policy.cjs');
// Incremental Fetch redirect-taint: the initiator differs from the previous
// response origin before a redirect can taint the serialized Origin header.
// https://fetch.spec.whatwg.org/#concept-request-redirect-taint
function redirectTaint(prior,initiator,previous,next) {
 if(prior==='cross-site')return prior;
 const from=new URL(previous).origin,to=new URL(next).origin;
 if(!sameSite(from,to)&&!sameSite(initiator,from))return 'cross-site';
 if(from!==to && initiator!==from)return 'same-site';
 return prior;
}
function navigationFetchSite(navigation,source,target) {
 if(navigation && navigation.sourceOrigin===null)return 'none';
 if(navigation?.crossSiteRedirect || navigation?.originTaint==='cross-site')return 'cross-site';
 if(!sameSite(source,target))return 'cross-site';
 return source===target && navigation?.originTaint!=='same-site'?'same-origin':'same-site';
}
module.exports={redirectTaint,navigationFetchSite};
