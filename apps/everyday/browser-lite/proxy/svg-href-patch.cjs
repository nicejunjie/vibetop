'use strict';
// Hammerhead proxies SVG references only in the old xlink:href form. SVG 2's
// plain href (<use href="/assets/icons.svg#x">, how React and ChatGPT render
// icons) kept the site path, which resolved against the realm itself, so the
// icons were missing. Treat href like xlink:href on the same SVG elements:
// rewrite in served HTML and setAttribute, keep "#id" local references, and
// let getAttribute return the original. SVG <a> and <image> already go through
// the ordinary href rule.
const fs=require('node:fs');
const TAG="['a', 'image'].indexOf(adapter.getTagName(el)) === -1";
function patchSvgHref(engineRequire) {
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const marker='/* vt-svg-href */';
  const dom=[
    ['IS_SVG_ELEMENT_WITH_XML_BASE_ATTR:',marker+"IS_SVG_ELEMENT_WITH_HREF_ATTR: function (el) { return adapter.isSVGElement(el) && adapter.hasAttr(el, 'href') && "+
      "SVG_XLINK_HREF_TAGS.indexOf(adapter.getTagName(el)) !== -1 && "+TAG+"; }, IS_SVG_ELEMENT_WITH_XML_BASE_ATTR:"],
    ['selector: selectors.IS_SVG_ELEMENT_WITH_XML_BASE_ATTR,',"selector: selectors.IS_SVG_ELEMENT_WITH_HREF_ATTR, urlAttr: 'href', "+
      "elementProcessors: [this._processSVGXLinkHrefAttr, this._processUrlAttrs] }, { selector: selectors.IS_SVG_ELEMENT_WITH_XML_BASE_ATTR,"]];
  const client=[
    ["else if (loweredAttr === 'xlink:href' &&","else if ((loweredAttr === 'xlink:href' || loweredAttr === 'href' && ['a', 'image'].indexOf(tagName) === -1) &&"],
    ['domProcessor.EVENTS.indexOf(loweredAttr) !== -1 ||',"domProcessor.EVENTS.indexOf(loweredAttr) !== -1 || (loweredAttr === 'href' || loweredAttr === 'xlink:href') && isSVGElement(el) ||"]];
  for(const [file,edits] of [[lib('processing/dom/index.js'),dom],[lib('client/hammerhead.js'),[...dom,...client]]]) {
    let code=fs.readFileSync(file,'utf8');
    if(code.includes(marker))continue;
    for(const [from,to] of edits) {
      if(code.split(from).length!==2)throw new Error('SVG href patch anchor changed: '+file+': '+from);
      code=code.replace(from,()=>to);
    }
    fs.writeFileSync(file,code);
  }
}
module.exports={patchSvgHref};
