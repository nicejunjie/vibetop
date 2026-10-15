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
module.exports={installStageTiming};
