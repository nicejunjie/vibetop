#!/usr/bin/env node
'use strict';
// node tools/ra2-reference-library.js --download  # fetch missing curated files
// node tools/ra2-reference-library.js             # offline audit + rebuild index
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { sources, entries } = require('./ra2-reference-catalog');
const RTS = path.resolve(__dirname, '..');
const DIR = path.join(RTS, 'docs/ra2-ref');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const sourceURL = title => `https://cnc.fandom.com/wiki/File:${encodeURIComponent(title.replaceAll(' ', '_'))}`;
function imageURL(title) {
  const name = title.replaceAll(' ', '_');
  const hash = crypto.createHash('md5').update(name).digest('hex');
  return `https://static.wikia.nocookie.net/cnc_gamepedia_en/images/${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(name)}/revision/latest?format=original`;
}
function extension(bytes) {
  if (bytes.subarray(0,3).toString() === 'GIF') return 'gif';
  if (bytes.subarray(1,4).toString() === 'PNG') return 'png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'jpg';
  if (bytes.subarray(8,12).toString() === 'WEBP') return 'webp';
  throw Error('Response is not PNG, JPEG, GIF or WebP');
}
function roster() {
  const html = fs.readFileSync(path.join(RTS,'rts.html'),'utf8');
  const result = [];
  for (const [variable,type] of [['UNITS','unit'],['BLDS','building']]) {
    const match = html.match(new RegExp(`var ${variable} = (\\{[\\s\\S]*?\\n  \\});`));
    if (!match) throw Error(`Cannot read ${variable} roster`);
    const defs = vm.runInNewContext(`(${match[1]})`,{}, {timeout:1000});
    for (const [key,def] of Object.entries(defs)) {
      for (const faction of def.neut ? ['neutral'] : def.fac ? [def.fac] : ['dir','col']) {
        result.push({type,key,faction,name:def.name});
      }
    }
  }
  return result;
}
const identity = e => `${e.type}:${e.key}:${e.faction}`;
async function main() {
  fs.mkdirSync(path.join(DIR,'sprites/library'),{recursive:true});
  const previousFile = path.join(DIR,'manifest.json');
  const previous = fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile,'utf8')).sources : {};
  const results = {};
  const missingFiles = [];
  const work = Object.entries(sources);
  async function worker() {
    for (;;) {
      const item = work.shift();
      if (!item) break;
      const [id,source] = item;
      const titleChanged = previous[id] && previous[id].title !== source.title;
      let file = source.file || (!titleChanged && previous[id]?.file);
      if (!file && !titleChanged) file = ['gif','png','jpg','webp'].map(ext=>`sprites/library/${id}.${ext}`).find(f=>fs.existsSync(path.join(DIR,f)));
      try {
        if (!file || !fs.existsSync(path.join(DIR,file))) {
          if (!process.argv.includes('--download')) throw Error('file absent; use --download');
          const url = source.url || imageURL(source.title);
          const response = await fetch(url,{signal:AbortSignal.timeout(45000)});
          if (!response.ok) throw Error(`HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          file = `sprites/library/${id}.${extension(bytes)}`;
          fs.writeFileSync(path.join(DIR,file),bytes);
          console.log(`Downloaded ${id} (${bytes.length} bytes)`);
        }
        const bytes = fs.readFileSync(path.join(DIR,file));
        extension(bytes);
        results[id] = {...source,file,source:source.source || sourceURL(source.title),url:source.url || imageURL(source.title),sha256:digest(bytes),bytes:bytes.length};
      } catch (error) {
        missingFiles.push(`${id}: ${error.message}`);
        console.error(`MISSING ${id}: ${error.message}`);
      }
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  // Pillow decodes every frame: catches truncated animations and reports the
  // original dimensions, rather than accepting a successful HTTP response.
  const metadata = JSON.parse(execFileSync('python3',['-c',
    'import sys,json\nfrom PIL import Image\nout={}\nfor key,p in json.load(sys.stdin).items():\n im=Image.open(p)\n w,h=im.size\n n=getattr(im,"n_frames",1)\n for f in range(n):\n  im.seek(f); im.load()\n out[key]={"width":w,"height":h,"frames":n,"format":im.format}\nprint(json.dumps(out))'
  ],{input:JSON.stringify(Object.fromEntries(Object.entries(results).map(([id,s])=>[id,path.join(DIR,s.file)]))),maxBuffer:4*1024*1024}));
  for (const [id,data] of Object.entries(metadata)) Object.assign(results[id],data);
  const expected = roster();
  const listed = new Set(entries.map(identity));
  const missingEntries = expected.filter(e=>!listed.has(identity(e))).map(identity);
  const extraEntries = entries.filter(e=>!expected.some(x=>identity(x)===identity(e))).map(identity);
  const duplicateEntries = entries.map(identity).filter((id,i,ids)=>ids.indexOf(id)!==i);
  const brokenReferences = entries.flatMap(e=>e.refs.filter(id=>!results[id]).map(id=>`${identity(e)} -> ${id}`));
  const report = {
    unitTypes:new Set(expected.filter(e=>e.type==='unit').map(e=>e.key)).size,
    buildingTypes:new Set(expected.filter(e=>e.type==='building').map(e=>e.key)).size,
    expectedVariants:expected.length,listedVariants:entries.length,files:Object.keys(results).length,
    missingEntries,extraEntries,duplicateEntries,missingFiles,brokenReferences
  };
  const manifest = {schemaVersion:1,reviewDate:'2026-09-11',report,entries,sources:results};
  fs.writeFileSync(previousFile,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if ([missingEntries,extraEntries,duplicateEntries,missingFiles,brokenReferences].some(a=>a.length)) process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
