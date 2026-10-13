'use strict';
// Native HLS players (iOS/macOS Safari <video src=...m3u8>) resolve playlist
// URIs themselves, so a path-absolute "/amplify_video/..." escapes the proxy
// prefix and reaches the realm root. Rewrite HLS playlists fetched outside
// XHR/fetch; script players (hls.js) go through the client-side engine already.
const fs=require('node:fs');
const HLS_MIME=/^\s*(application|audio)\/(vnd\.apple\.mpegurl|x-mpegurl|mpegurl)\s*(;|$)/i;
function rewritePlaylist(playlist, urlReplacer) {
  return playlist.split('\n').map(raw=>{
    const line=raw.trim();
    if(!line)return raw;
    if(line[0]==='#')return raw.replace(/URI="([^"]*)"/g,(_m,uri)=>'URI="'+urlReplacer(uri)+'"');
    return urlReplacer(line);
  }).join('\n');
}
function patchHlsPlaylists(engineRequire) {
  function patch(file,from,to) {
    let source=fs.readFileSync(file,'utf8');
    if(source.includes(to))return;
    if(source.split(from).length!==2)throw new Error('HLS patch anchor changed: '+from);
    fs.writeFileSync(file,source.replace(from,()=>to));
  }
  const lib=name=>engineRequire.resolve('testcafe-hammerhead/lib/'+name);
  const context=lib('request-pipeline/context/index.js');
  patch(context,
    'const isManifest = contentTypeUtils.isManifest(contentType);',
    'const isManifest = contentTypeUtils.isManifest(contentType);\n        const isHls = !this.isAjax && '+HLS_MIME+'.test(contentType);');
  patch(context,
    'const requireAssetsProcessing = (isCSS || isScript || isManifest) &&',
    'const requireAssetsProcessing = (isCSS || isScript || isManifest || isHls) &&');
  patch(context,
    '!isTextPage && !isManifest && !isScript && !isForm && !isObject;',
    '!isTextPage && !isManifest && !isHls && !isScript && !isForm && !isObject;');
  patch(context,'            isManifest,\n','            isManifest,\n            isHls,\n');
  patch(lib('processing/resources/index.js'),
    'const RESOURCE_PROCESSORS = [page_1.default, manifest_1.default,',
    'const RESOURCE_PROCESSORS = [page_1.default, {shouldProcessResource: ctx => !!ctx.contentInfo.isHls, '+
      'processResource: (playlist, _ctx, _charset, urlReplacer) => ('+rewritePlaylist+')(playlist, urlReplacer)}, manifest_1.default,');
}
module.exports={patchHlsPlaylists,rewritePlaylist,isHls:type=>HLS_MIME.test(type||'')};
