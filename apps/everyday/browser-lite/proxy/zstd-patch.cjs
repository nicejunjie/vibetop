'use strict';
// Chrome offers "zstd" in Accept-Encoding. The engine decodes only gzip,
// deflate and br, so Lite used to strip zstd from the forwarded header, which
// made a Chrome user look like an older browser to the site. Node 22.15+ has
// zstd in zlib: decode and re-encode it like the others, and forward the
// browser's Accept-Encoding as it is.
const fs=require('node:fs');
function zstdSupported() { return typeof require('node:zlib').zstdDecompress==='function'; }
function patchZstd(engineRequire) {
  if(!zstdSupported())return;
  const file=engineRequire.resolve('testcafe-hammerhead/lib/processing/encoding/index.js');
  const marker='/* vt-zstd */';
  let code=fs.readFileSync(file,'utf8');
  if(code.includes(marker))return;
  const edit=(from,to)=>{if(code.split(from).length!==2)throw new Error('zstd patch anchor changed: '+JSON.stringify(from));code=code.replace(from,()=>to);};
  edit("        content = await (0, promisified_functions_1.brotliDecompress)(content, BROTLI_DECODING_OPTIONS);\n",
    "        content = await (0, promisified_functions_1.brotliDecompress)(content, BROTLI_DECODING_OPTIONS);\n"
    +"    else if (encoding === \"zstd\") "+marker+"\n        content = await new Promise((resolve, reject) => zlib_1.default.zstdDecompress(content, (error, output) => error ? reject(error) : resolve(output)));\n");
  edit("        return (0, promisified_functions_1.brotliCompress)(encodedContent, BROTLI_DECODING_OPTIONS);\n",
    "        return (0, promisified_functions_1.brotliCompress)(encodedContent, BROTLI_DECODING_OPTIONS);\n"
    +"    if (encoding === \"zstd\")\n        return new Promise((resolve, reject) => zlib_1.default.zstdCompress(encodedContent, (error, output) => error ? reject(error) : resolve(output)));\n");
  fs.writeFileSync(file,code);
}
module.exports={patchZstd,zstdSupported};
