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
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function writeIndex(manifest) {
  const { report } = manifest;
  const cards = entries.map(e => {
    const refs = e.refs.map(id => resultsForIndex[id]).filter(Boolean);
    const pictures = refs.map(s => `<a class="picture" href="${escapeHTML(s.file)}" title="Open original file"><img loading="lazy" src="${escapeHTML(s.file)}" alt="${escapeHTML(e.name)} — ${escapeHTML(s.kind)}"><span>${escapeHTML(s.kind)} · ${s.width}×${s.height}${s.frames > 1 ? ` · ${s.frames} frames` : ''}</span></a>`).join('');
    const links = refs.map(s=>`<a href="${escapeHTML(s.source)}">${escapeHTML(s.title)}</a>`).join(' · ');
    return `<article data-type="${e.type}" data-faction="${e.faction}" data-search="${escapeHTML(`${e.key} ${e.name} ${e.ra2}`.toLowerCase())}"><header><b>${escapeHTML(e.name)}</b><code>${escapeHTML(e.key)}</code></header><p class="identity">${escapeHTML(e.ra2)} · ${escapeHTML(e.faction)}</p><div class="pictures">${pictures}</div><p class="source">${links}</p>${e.note ? `<p class="note">${escapeHTML(e.note)}</p>` : ''}</article>`;
  }).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RA2 in-game reference library</title>
<style>
:root{color-scheme:dark;font:14px/1.4 system-ui,sans-serif;background:#111820;color:#e8edf2}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:24px}h1{margin:0 0 6px;font-size:28px}.summary{color:#aebdca;margin:0 0 18px}.tools{position:sticky;top:0;z-index:2;display:flex;gap:8px;flex-wrap:wrap;padding:12px 0;background:#111820ee}.tools input,.tools button{border:1px solid #526170;background:#1d2832;color:#fff;padding:9px 12px;border-radius:4px}.tools input{min-width:260px;flex:1}.tools button.active{border-color:#66b7f0;background:#173d59}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}article{background:#19242d;border:1px solid #34434f;padding:12px;border-radius:6px;min-width:0}article[hidden]{display:none}header{display:flex;justify-content:space-between;gap:10px;font-size:17px}code{color:#83c8f5}.identity,.source,.note{margin:6px 0}.identity{color:#b6c5d1}.source{font-size:12px}.source a{color:#75c6ff}.note{color:#e8c988;font-size:12px}.pictures{display:flex;gap:7px;overflow:auto}.picture{min-width:0;flex:1;color:#aab9c5;text-decoration:none;font-size:11px}.picture img{width:100%;height:190px;object-fit:contain;image-rendering:pixelated;background:#0d1318;display:block}.picture span{display:block;padding-top:3px}footer{margin-top:22px;color:#90a1ae}
</style><main><h1>RA2 in-game reference library</h1><p class="summary">${report.unitTypes} unit types · ${report.buildingTypes} building types · ${report.listedVariants}/${report.expectedVariants} faction variants covered · ${report.files} source images. Generated from the live game roster on ${manifest.reviewDate}.</p>
<div class="tools"><input id="q" aria-label="Search" placeholder="Search name, game key or RA2 internal ID"><button class="active" data-filter="all">All</button><button data-filter="unit">Units</button><button data-filter="building">Buildings</button><button data-filter="dir">Allied</button><button data-filter="col">Soviet</button><button data-filter="neutral">Neutral</button></div><section class="grid">${cards}</section><footer>Images link to their full local files. Source titles link to the C&amp;C Wiki file pages. Menu cameos are excluded from this catalog.</footer></main>
<script>let filter='all',q='';const cards=[...document.querySelectorAll('article')];function show(){cards.forEach(c=>c.hidden=!((filter==='all'||c.dataset.type===filter||c.dataset.faction===filter)&&c.dataset.search.includes(q)))}document.querySelectorAll('button').forEach(b=>b.onclick=()=>{document.querySelector('.active').classList.remove('active');b.classList.add('active');filter=b.dataset.filter;show()});document.querySelector('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();show()}</script>`;
  fs.writeFileSync(path.join(DIR,'index.html'),html+'\n');
  const md = `# RA2 in-game reference library\n\nThis catalog covers the live game roster: **${report.unitTypes} unit types**, **${report.buildingTypes} building types**, and **${report.listedVariants}/${report.expectedVariants} faction-specific variants**. It contains **${report.files} local source images**. Open [the visual index](./index.html) to filter and inspect them.\n\nThe catalog deliberately excludes build-menu cameos. Vehicle references favor eight-bearing in-game sheets and voxel renders; infantry use original sprite animations; structures use idle, operating, firing, or deployment animations. Each source is downloaded by exact wiki title, decoded through every frame, checksummed, and linked to its source page.\n\nThe civilian roles in this game combine several regional RA2 structures. Their entries therefore name the closest Westwood object IDs and use full original mission or map renders as battle-scale references. Vanilla RA2 has only one completed mission gate, so the Soviet gate entry documents that limitation instead of inventing a Soviet source.\n\nRun \`node tools/ra2-reference-library.js --download\` to fetch missing files and rebuild the manifest and visual index. Running without \`--download\` performs an offline integrity and roster-coverage audit.\n`;
  fs.writeFileSync(path.join(DIR,'README.md'),md);
}
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
  const manifest = {schemaVersion:1,reviewDate:'2026-09-12',report,entries,sources:results};
  fs.writeFileSync(previousFile,JSON.stringify(manifest,null,2)+'\n');
  resultsForIndex = results;
  writeIndex(manifest);
  console.log(JSON.stringify(report,null,2));
  if ([missingEntries,extraEntries,duplicateEntries,missingFiles,brokenReferences].some(a=>a.length)) process.exitCode=1;
}
let resultsForIndex = {};
main().catch(error=>{console.error(error);process.exitCode=1;});
