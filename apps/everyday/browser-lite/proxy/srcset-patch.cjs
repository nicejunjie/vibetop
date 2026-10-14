'use strict';
// Hammerhead splits srcset on every comma, so a candidate URL that contains
// commas (CNN: "...?q=h_384,w_256,c_fill/f_webp 1x") becomes several broken
// URLs. Parse candidates the way browsers do: a URL runs to whitespace, and
// only a trailing comma or the comma after its descriptors ends a candidate.
const fs=require('node:fs');
function parseSrcset(input) {
  const candidates=[],space=/[\t\n\f\r ]/;
  let i=0;
  while(i<input.length) {
    while(i<input.length && (space.test(input[i]) || input[i]===','))i++;
    if(i>=input.length)break;
    const start=i;
    while(i<input.length && !space.test(input[i]))i++;
    let url=input.slice(start,i),descriptors='';
    if(/,$/.test(url))url=url.replace(/,+$/,'');
    else {
      const from=i;let depth=0;
      for(;i<input.length;i++) {
        const c=input[i];
        if(c==='(')depth++;
        else if(c===')' && depth)depth--;
        else if(c===',' && !depth)break;
      }
      descriptors=input.slice(from,i).trim().replace(/\s+/g,' ');
      i++;
    }
    if(url)candidates.push([url,descriptors]);
  }
  return candidates;
}
// Self-contained so it can be inlined into both engine copies.
function handleUrlsSet(handler, url) {
  var args=Array.prototype.slice.call(arguments,2);
  return PARSE(String(url)).map(function(c){return handler.apply(void 0,[c[0]].concat(args))+(c[1]?' '+c[1]:'');}).join(', ');
}
function source() {
  return handleUrlsSet.toString().replace('PARSE','('+parseSrcset.toString()+')');
}
function patchSrcset(engineRequire) {
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const marker='/* vt-srcset */';
  for(const [file,from] of [
    [lib('utils/url.js'),"function handleUrlsSet(handler, url, ...args) {\n    const resourceUrls = url.split(',');"],
    [lib('client/hammerhead.js'),"function handleUrlsSet(handler, url) {\r\n\t    var args = [];"]]) {
    let code=fs.readFileSync(file,'utf8');
    if(code.includes(marker))continue;
    if(code.split(from).length!==2)throw new Error('srcset patch anchor changed: '+file);
    // Rename the upstream function; ours takes its name and call sites.
    code=code.replace(from,()=>marker+source().replace(/\n/g,' ')+'\n'+from.replace('function handleUrlsSet','function vtUpstreamHandleUrlsSet'));
    fs.writeFileSync(file,code);
  }
  // setAttribute names are case-insensitive in HTML, but Hammerhead compares
  // 'srcset' exactly, so setAttribute('srcSet', list) (Airbnb's <picture>
  // sources) proxied the whole list as one URL and every image 404ed.
  const client=lib('client/hammerhead.js'),caseFrom="var isUrlsSet = attr === 'srcset';";
  let code=fs.readFileSync(client,'utf8');
  if(!code.includes('/* vt-srcset-case */')) {
    if(code.split(caseFrom).length!==2)throw new Error('srcset case anchor changed: '+client);
    fs.writeFileSync(client,code.replace(caseFrom,()=>"/* vt-srcset-case */var isUrlsSet = loweredAttr === 'srcset';"));
  }
}
module.exports={patchSrcset,parseSrcset,handleUrlsSet:new Function('return '+source())()};
