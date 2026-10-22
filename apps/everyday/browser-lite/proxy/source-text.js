(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.vibetopUnprocessSource=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Function.prototype.toString returned the rewritten source, so code that
  // reads its own text saw the engine's wrappers. Yahoo's ad script decodes
  // base64 spelled by the identifiers of one of its functions; `pc3[R]` came
  // back as `__get$(pc3,R)` and atob threw. Undo the engine's simple wrappers
  // (property get/set, method call, location get). Other rewrites stay as they
  // are, since they cannot be reversed exactly.
  const WRAPPER=/(?:__get\$Loc|__get\$|__set\$|__call\$|__vtChain)\(/g;
  const IDENT=/^[A-Za-z_$][\w$]*$/;
  const cache=new Map();
  // Index just past the bracket that closes the one opened at `open`,
  // skipping strings, template literals, comments and regex literals.
  function closing(text,open) {
    let depth=0;
    for(let i=open;i<text.length;i++) {
      const c=text[i];
      if(c==='"'||c==="'"||c==='`'){i=skipString(text,i);if(i<0)return -1;continue;}
      if(c==='/'&&text[i+1]==='/'){const end=text.indexOf('\n',i);if(end<0)return -1;i=end;continue;}
      if(c==='/'&&text[i+1]==='*'){const end=text.indexOf('*/',i+2);if(end<0)return -1;i=end+1;continue;}
      if(c==='/'&&regexAllowed(text,i)){i=skipRegex(text,i);if(i<0)return -1;continue;}
      if(c==='('||c==='['||c==='{')depth++;
      else if(c===')'||c===']'||c==='}'){depth--;if(depth===0)return i+1;if(depth<0)return -1;}
    }
    return -1;
  }
  function skipString(text,i) {
    const quote=text[i];
    for(let j=i+1;j<text.length;j++) {
      if(text[j]==='\\'){j++;continue;}
      if(quote==='`'&&text[j]==='$'&&text[j+1]==='{'){const end=closing(text,j+1);if(end<0)return -1;j=end-1;continue;}
      if(text[j]===quote)return j;
    }
    return -1;
  }
  function regexAllowed(text,i) {
    let j=i-1;while(j>=0&&/\s/.test(text[j]))j--;
    if(j<0)return true;
    if(/[\w$)\]]/.test(text[j]))return /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/.test(text.slice(Math.max(0,j-10),j+1));
    return true;
  }
  function skipRegex(text,i) {
    let inClass=false;
    for(let j=i+1;j<text.length;j++) {
      const c=text[j];
      if(c==='\\'){j++;continue;}
      if(c==='\n')return -1;
      if(inClass){if(c===']')inClass=false;continue;}
      if(c==='[')inClass=true;
      else if(c==='/'){while(/[a-z]/i.test(text[j+1]||''))j++;return j;}
    }
    return -1;
  }
  // Split "a,b,c" at top-level commas.
  function args(text) {
    const out=[];let start=0,depth=0;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"'||c==="'"||c==='`'){i=skipString(text,i);if(i<0)return null;continue;}
      if(c==='/'&&regexAllowed(text,i)&&text[i+1]!=='/'&&text[i+1]!=='*'){i=skipRegex(text,i);if(i<0)return null;continue;}
      if(c==='('||c==='['||c==='{')depth++;
      else if(c===')'||c===']'||c==='}')depth--;
      else if(c===','&&depth===0){out.push(text.slice(start,i));start=i+1;}
    }
    out.push(text.slice(start));
    return out;
  }
  function member(owner,key,optional) {
    const literal=/^(["'])([A-Za-z_$][\w$]*)\1$/.exec(key);
    if(literal&&IDENT.test(literal[2]))return owner+(optional?'?.':'.')+literal[2];
    return owner+(optional?'?.[':'[')+key+']';
  }
  // Owners that are not simple member chains need the parentheses the
  // wrapper made unnecessary.
  function owner(text) {return /^[\w$.\[\]"'?]+$|^\(.*\)$/.test(text)?text:'('+text+')';}
  function unwrap(name,list) {
    if(name==='__get$Loc')return list.length===1?list[0]:null;
    if(name==='__get$'&&(list.length===2||list.length===3&&/^(true|false)$/.test(list[2])))
      return member(owner(list[0]),list[1],list[2]==='true');
    if(name==='__set$'&&list.length===3)return member(owner(list[0]),list[1],false)+'='+list[2];
    if(name==='__call$'&&(list.length===3||list.length===4&&/^(true|false)$/.test(list[3]))&&/^\[[\s\S]*\]$/.test(list[2]))
      return member(owner(list[0]),list[1],list[3]==='true')+'('+list[2].slice(1,-1)+')';
    return null;
  }
  // Lite's optional-chain rewrite: __vtChain(base) then links, .n()?. before
  // an optional link, .p(key,mode) a property, .c([args],routed) a call, .v
  // the end. Anything else (super, tagged forms) is left as it is.
  function unchain(text,open,end) {
    let result=owner(reverse(text.slice(open+1,end-1).trim())),i=end,optional=false;
    for(;;) {
      if(text.startsWith('.n()?.',i)){optional=true;i+=5;continue;}
      if(text.startsWith('.v',i)&&!/[\w$]/.test(text[i+2]||''))return {text:result,end:i+2};
      const link=/^\.([pc])\(/.exec(text.slice(i,i+3));
      if(!link)return null;
      const close=closing(text,i+2);if(close<0)return null;
      const list=args(text.slice(i+3,close-1));if(!list)return null;
      if(link[1]==='p') {
        if(list.length!==2)return null;
        const key=reverse(list[0].trim()),named=/^(["'])([A-Za-z_$][\w$]*)\1$/.exec(key);
        result+=named&&IDENT.test(named[2])?(optional?'?.':'.')+named[2]:(optional?'?.[':'[')+key+']';
      } else {
        const call=list[0].trim();
        if(!/^\[[\s\S]*\]$/.test(call))return null;
        result+=(optional?'?.(':'(')+reverse(call.slice(1,-1))+')';
      }
      optional=false;i=close;
    }
  }
  function reverse(text) {
    let out='',last=0;WRAPPER.lastIndex=0;let match;
    while((match=WRAPPER.exec(text))) {
      const start=match.index;
      if(start>0&&/[\w$.]/.test(text[start-1]))continue;
      const open=start+match[0].length-1;let end=closing(text,open);
      if(end<0)break;
      if(match[0]==='__vtChain(') {
        const chain=unchain(text,open,end);
        if(!chain)continue;
        const padded=text[start-1]===' '&&text[chain.end]===' '&&start-1>=last;
        out+=text.slice(last,padded?start-1:start)+chain.text;last=padded?chain.end+1:chain.end;WRAPPER.lastIndex=last;
        continue;
      }
      const list=args(text.slice(open+1,end-1));
      const replaced=list&&unwrap(match[0].slice(0,-1),list.map(item=>reverse(item.trim())));
      if(replaced===null){continue;}
      // The engine pads each replacement with one space on both sides.
      const padded=text[start-1]===' '&&text[end]===' '&&start-1>=last;
      out+=text.slice(last,padded?start-1:start)+replaced;last=padded?end+1:end;WRAPPER.lastIndex=last;
    }
    return out+text.slice(last);
  }
  return function unprocessSource(text) {
    if(typeof text!=='string'||text.indexOf('__')<0||!/__(?:get|set|call)\$|__vtChain\(/.test(text))return text;
    let value=cache.get(text);
    if(value===undefined) {
      try{value=reverse(text);}catch{value=text;}
      if(cache.size>=512)cache.clear();
      cache.set(text,value);
    }
    return value;
  };
});
