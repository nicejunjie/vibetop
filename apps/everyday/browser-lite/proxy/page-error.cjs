'use strict';
// The page a tab shows when its site cannot be reached (DNS, refused, TLS,
// timeout). A browser shows its own error page at once; Lite used to answer
// 502 in plain text, which Cloudflare replaces with its branded page, whose
// X-Frame-Options then blanks the tab, so the toolbar stayed on "Loading…" for
// 45 s and then blamed a slow page. 503 passes through Cloudflare untouched.
// The page also speaks the tab bridge protocol (ready/attach/state), so the
// toolbar learns the load ended, shows the reason with Retry, and keeps the
// address in the tab's history like a browser does.
const crypto=require('node:crypto');
const js=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const escape=text=>String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// The egress refuses some destinations by policy (egress.cjs, X-VT-Blocked):
// the host's own networks and private addresses, so a page can't reach the
// user's LAN through Lite, and ports other than 80/443. That isn't a failure
// to retry; say what was refused and point at the full Browser, which can.
const BLOCKED={
  local:{title:"Browser Lite can't open local addresses",
    text:'is on your local network or is this server. Browser Lite only opens public websites, so no page can use it to reach your private devices.'},
  port:{title:"Browser Lite can't open this port",
    text:'uses a non-standard port. Browser Lite only opens websites on the standard web ports (80 and 443).'},
};
function pageErrorBlock(error) {
  const match=/VT-BLOCKED:(local|port)\b/.exec(String(error?.message||error||''));
  return match?match[1]:'';
}
function pageErrorReason(error) {
  const text=String(error?.message||error||'');
  if(/DNS|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text))return "The site's address could not be found.";
  if(/timeout|timed out|ETIMEDOUT/i.test(text))return 'The site took too long to respond.';
  if(/ECONNREFUSED/i.test(text))return 'The site refused the connection.';
  if(/certificate|handshake|TLS|SSL|EPROTO/i.test(text))return 'A secure connection to the site could not be made.';
  if(/ECONNRESET|socket hang up|EPIPE/i.test(text))return 'The site closed the connection.';
  return 'The site could not be reached.';
}
function renderPageError({url,error,navigation=null,parentOrigin=''}) {
  let host='';try{host=new URL(url).host;}catch{}
  const block=pageErrorBlock(error),reason=pageErrorReason(error),detail=String(error?.message||error||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').slice(0,300);
  const nonce=crypto.randomBytes(16).toString('base64url');
  const bridge=navigation&&parentOrigin?`
var tab=${js({tabId:navigation.tabId,epoch:navigation.epoch})},parentOrigin=${js(parentOrigin)},url=${js(url)};
var documentId='error:'+Math.random().toString(36).slice(2),entryId=documentId+':0';
function send(message){parent.postMessage(Object.assign({type:'vibetop-browser',tabId:tab.tabId,epoch:tab.epoch},message),parentOrigin);}
addEventListener('message',function(event){
  var data=event.data;
  if(event.source!==parent||event.origin!==parentOrigin||!data||data.type!=='vibetop-browser-control'||data.tabId!==tab.tabId||data.epoch!==tab.epoch)return;
  if(data.action==='attach')send({action:'state',nonce:data.nonce,url:url,title:document.title,failed:true,blocked:false,failure:${js(block)},historyKind:'sync',
    history:{documentId:documentId,sequence:0,index:0,entries:[{id:entryId,url:url}]}});
  else if(data.action==='traverse')send({action:'traversed',nonce:data.nonce,documentId:documentId,requestId:data.requestId,failed:true});
});
send({action:'ready'});`:'';
  const script=`<script nonce="${nonce}">(function(){
var retry=document.getElementById('retry');if(retry)retry.onclick=function(){location.reload();};${bridge}
})();</script>`;
  const csp="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'";
  return {status:503,nonce,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp},
    body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${block?'Address not allowed':'Page not available'}</title>
<style>html,body{margin:0;height:100%;font:16px system-ui,sans-serif;color:#1f2933;background:#f7f9fb}main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 6px;max-width:34em;line-height:1.45}.host{font-weight:600;word-break:break-all}.detail{font-size:12px;color:#6b7785;margin-top:10px;word-break:break-word}
button{margin-top:18px;font:inherit;min-height:44px;padding:0 22px;border-radius:9px;border:1px solid #9fb0c3;background:#fff;color:inherit;cursor:pointer}button:hover{background:#eef2f6}
@media(prefers-color-scheme:dark){html,body{color:#e7edf5;background:#10151d}button{background:#1b2533;border-color:#3d4f66}button:hover{background:#253247}.detail{color:#94a3b8}}</style></head>
<body><main>${block?`<h1>${escape(BLOCKED[block].title)}</h1><p><span class="host">${escape(host||url)}</span> ${escape(BLOCKED[block].text)}</p>
<p>Open it in the full Browser instead.</p>`:`<h1>This page can't be shown</h1><p>Browser Lite could not load <span class="host">${escape(host||url)}</span>.</p><p>${escape(reason)}</p>
<p class="detail">${escape(detail)}</p><button id="retry" type="button">Retry</button>`}</main>${script}</body></html>`};
}
module.exports={pageErrorBlock,pageErrorReason,renderPageError};
