'use strict';
const fs=require('node:fs');
// Register the graph kind everywhere a descriptor can be parsed/rebuilt. This
// does not enable module loading: runtime/header admission is a separate step.
function patchWorkerModuleKind(engineRequire) {
  for(const name of ['utils/url.js','client/hammerhead.js','client/worker-hammerhead.js']) {
    const file=engineRequire.resolve('testcafe-hammerhead/lib/'+name);
    const source=fs.readFileSync(file,'utf8');
    const before="{ name: 'isScript', flag: 's' },";
    const after=before+" { name: 'isWorkerModule', flag: 'm' },";
    if(source.includes(after))continue;
    if(source.split(before).length!==2)throw new Error('Worker module resource table changed: '+name);
    fs.writeFileSync(file,source.replace(before,()=>after));
  }
  function patch(name,before,after) {
    const file=engineRequire.resolve('testcafe-hammerhead/lib/'+name);
    const source=fs.readFileSync(file,'utf8');
    if(source.includes(after))return;
    // Upgrade the earlier UTF-8 setter, whose equal-value path did not lock priority.
    if(name==='request-pipeline/context/index.js' && source.includes("if (this.dest.isWorkerModule) charset.set('utf-8', 4);")) {
      fs.writeFileSync(file,source.replace("if (this.dest.isWorkerModule) charset.set('utf-8', 4);","if (this.dest.isWorkerModule) { charset.set('utf-8', 4); charset.priority = 4; }"));
      return patch(name,before,after);
    }
    if(source.split(before).length!==2)throw new Error('Worker module pipeline anchor changed: '+name);
    fs.writeFileSync(file,source.replace(before,()=>after));
  }
  patch('request-pipeline/header-transforms/transforms.js',
    'exports.forcedResponseTransforms = {',
    'exports.forcedResponseTransforms = { [builtin_header_names_1.default.contentSecurityPolicy]: (_src, ctx) => ctx.req.vtWorkerCsp || void 0,');
  const context='request-pipeline/context/index.js';
  patch(context,'const dest = parsedReferer.dest;',
    'const dest = { ...parsedReferer.dest, isWorkerModule: false };');
  patch(context,'isForm: !!parsedResourceType.isForm,',
    'isForm: !!parsedResourceType.isForm, isWorkerModule: !!parsedResourceType.isWorkerModule,');
  patch(context,'isForm, isScript,',
    'isForm, isScript, isWorkerModule: this.dest.isWorkerModule,');
  patch(context,'charset.fromUrl(this.dest.charset);',
    "charset.fromUrl(this.dest.charset);\n        if (this.dest.isWorkerModule) { charset.set('utf-8', 4); charset.priority = 4; }");
  patch('request-pipeline/header-transforms/transforms.js',
    'return ctx.toProxyUrl(url, isCrossDomain, ctx.contentInfo.contentTypeUrlToken);',
    "return ctx.toProxyUrl(url, isCrossDomain, ctx.contentInfo.contentTypeUrlToken, ctx.dest.isWorkerModule ? 'utf-8' : void 0);");

}
module.exports={patchWorkerModuleKind};
