'use strict';
// Pass-through bodies (JSON, XHR) reached the page in whatever pieces they
// crossed upstream, gateway, nginx and Cloudflare. Real servers send a small
// body in one burst, and some pages read only the first chunk of a fetch body
// (Yahoo's opus.js: one read(), then JSON.parse threw "Unterminated string").
// Send what arrives in the first short window, up to a cap, as one write;
// after that, stream as before, so long polls and event streams still flow.
function coalesce(source,target,{limit=64*1024,windowMs=40}={}) {
  let parts=[],size=0,timer=null,streaming=false,ended=false;
  const write=chunk=>{if(!target.write(chunk)){source.pause();target.once('drain',()=>source.resume());}};
  const flush=()=>{
    clearTimeout(timer);timer=null;streaming=true;
    if(parts.length){const body=parts.length===1?parts[0]:Buffer.concat(parts,size);parts=[];size=0;write(body);}
  };
  source.on('data',chunk=>{
    if(streaming){write(chunk);return;}
    parts.push(chunk);size+=chunk.length;
    if(size>=limit)flush();
    else if(!timer)timer=setTimeout(flush,windowMs);
  });
  source.on('end',()=>{ended=true;flush();target.end();});
  source.on('error',error=>{clearTimeout(timer);target.destroy(error);});
  target.on('close',()=>{clearTimeout(timer);if(!ended)source.destroy();});
}
function installResponseCoalescing(Context,options) {
  const original=Context.prototype.pipeNonProcessedResponse;
  if(original.vtCoalesce)return;
  Context.prototype.pipeNonProcessedResponse=async function() {
    if(this.serverInfo.cacheRequests)return original.call(this);
    coalesce(this.destRes,this.res,options);
  };
  Context.prototype.pipeNonProcessedResponse.vtCoalesce=true;
}
module.exports={coalesce,installResponseCoalescing};
