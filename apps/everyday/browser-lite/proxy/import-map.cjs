'use strict';
// Serializable: used by both the server processor and the injected client engine.
function rewriteImportMap(content,resolve) {
  const map=JSON.parse(content);
  const urlLike=value=>/^(?:[./]|[a-zA-Z][a-zA-Z0-9+.-]*:)/.test(value);
  function imports(values) {
    if(!values || typeof values!=='object' || Array.isArray(values))return values;
    return Object.fromEntries(Object.entries(values).map(([key,value])=>[
      urlLike(key)?resolve(key,'s'):key,typeof value==='string'?resolve(value,'s'):value]));
  }
  if(map.imports)map.imports=imports(map.imports);
  if(map.scopes && typeof map.scopes==='object')
    map.scopes=Object.fromEntries(Object.entries(map.scopes).map(([scope,values])=>[resolve(scope,'s'),imports(values)]));
  // Rewriting changes script bytes; original integrity hashes no longer apply.
  delete map.integrity;
  return JSON.stringify(map);
}
module.exports={rewriteImportMap};
