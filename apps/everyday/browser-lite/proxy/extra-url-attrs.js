(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.vibetopExtraUrlAttrs=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // URL attributes the engine's table misses: the browser fetched them straight
  // from the site, bypassing the proxy (video posters, captions, responsive
  // preloads). `ping` sends click beacons directly; it is optional by spec, so
  // it is dropped rather than rewritten. Shared by the server page pass and the
  // client's runtime HTML processing.
  const SINGLE={video:'poster',track:'src'};
  const SKIP=/^\s*(data|blob|about|javascript):/i;
  function processExtraUrlAttrs(adapter,el,{rewrite,rewriteSet,isProxied}) {
    let tag='';try{tag=String(adapter.getTagName(el)||'').toLowerCase();}catch{return;}
    const attr=SINGLE[tag];
    if(attr) {
      const value=adapter.getAttr(el,attr);
      if(value && !SKIP.test(value) && !isProxied(value))adapter.setAttr(el,attr,rewrite(value.trim()));
    } else if(tag==='link') {
      const value=adapter.getAttr(el,'imagesrcset');
      if(value && !isProxied(value.trim().split(/\s/)[0]))adapter.setAttr(el,'imagesrcset',rewriteSet(value));
    } else if((tag==='a'||tag==='area') && adapter.hasAttr(el,'ping'))adapter.removeAttr(el,'ping');
  }
  return {processExtraUrlAttrs,SINGLE};
});
