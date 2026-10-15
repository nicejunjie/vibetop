'use strict';
// Diagnostics only (VT_BROWSER_DIAGNOSTICS=1): time each request-pipeline stage
// and log requests slower than a threshold. It logs the destination host, the
// resource kind and stage durations only, never a URL, path, header or body.
function installStageTiming(stages,{threshold=1000,log=console.error}={}) {
  if(stages.vtTimed)return;
  stages.vtTimed=true;
  for(let i=0;i<stages.length;i++) {
    const stage=stages[i],name=stage.name||'stage'+i,last=i===stages.length-1;
    stages[i]=async function(ctx) {
      const timing=ctx.vtTiming||(ctx.vtTiming={start:Date.now(),stages:[]});
      const started=Date.now();
      try {await stage(ctx);}
      finally {
        timing.stages.push(name+'='+(Date.now()-started));
        const total=Date.now()-timing.start;
        if((last || !ctx.goToNextStage) && total>=threshold && !timing.logged) {
          timing.logged=true;
          let host='?';try{host=ctx.dest&&ctx.dest.host||'?';}catch{}
          const kind=ctx.contentInfo?(ctx.contentInfo.isScript?'script':ctx.contentInfo.isCSS?'css':ctx.isPage?'page':'other'):'?';
          log('Browser slow request host='+host+' kind='+kind+' total='+total+' '+timing.stages.join(' '));
        }
      }
    };
    Object.defineProperty(stages[i],'name',{value:name});
  }
}
// Diagnostics only: a response must never carry a site's raw Set-Cookie (only
// "__Host-" sync cookies). Log the code path that sent one: names and host
// only, never values or URLs.
function installRawCookieCheck(http,{log=console.error}={}) {
  const proto=http.ServerResponse.prototype;
  if(proto.vtRawCookieCheck)return;proto.vtRawCookieCheck=true;
  const check=(res,value)=>{
    const lines=[].concat(value||[]).map(String).filter(line=>!line.startsWith('__Host-')&&!line.startsWith('__Secure-vt_'));
    if(!lines.length)return;
    let host='?';try{host=new URL(res.req?.url?.split('/').slice(2).join('/').replace(/^[^h]*/,'')||'').host||'?';}catch{}
    log('Browser raw Set-Cookie names='+lines.map(line=>line.split('=',1)[0].slice(0,24)).join(',')+' status='+res.statusCode+' dest='+host
      +' via '+String(new Error().stack).split('\n').slice(3,8).map(line=>line.trim().replace(/^at /,'').replace(/\(.*\/(?=[^/]+:\d+:\d+\))/,'(')).join(' < '));
  };
  const setHeader=proto.setHeader;
  proto.setHeader=function(name,value){if(String(name).toLowerCase()==='set-cookie')check(this,value);return setHeader.call(this,name,value);};
  const writeHead=proto.writeHead;
  proto.writeHead=function(status,...rest){
    const headers=rest.find(item=>item&&typeof item==='object');
    if(headers){
      if(Array.isArray(headers)){for(let i=0;i<headers.length;i+=2)if(String(headers[i]).toLowerCase()==='set-cookie')check(this,headers[i+1]);}
      else for(const key of Object.keys(headers))if(key.toLowerCase()==='set-cookie')check(this,headers[key]);
    }
    return writeHead.call(this,status,...rest);
  };
}
module.exports={installStageTiming,installRawCookieCheck};
