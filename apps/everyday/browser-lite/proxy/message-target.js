(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.vibetopMessageTarget=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const discard='https://vibetop-discard.invalid';
  // Resolve only relationships the sender already knows. A wrong/stale hint
  // safely misses the native targetOrigin check; never interrogate a recipient.
  return function targetOrigin({expected,documentOrigin,physicalOrigin,samePhysical,known,parent,child,sibling}){
    if(expected==='*')return '*';
    let origin;
    try{origin=new URL(expected==='/'?documentOrigin:expected).origin;}
    catch{throw new DOMException('Invalid target origin','SyntaxError');}
    if(origin==='null')return discard;
    if(samePhysical)return origin===documentOrigin?physicalOrigin:discard;
    try {
      const prior=known?.();
      if(prior?.original===origin)return prior.physical;
      const owner=parent?.();
      if(owner?.original===origin)return owner.physical;
      return child?.(origin) || sibling?.(origin) || discard;
    }catch{return discard;}
  };
});
