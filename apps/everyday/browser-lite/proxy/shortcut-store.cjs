'use strict';
// Quick-launch shortcuts for the welcome screen, per user, beside the cookie
// jar. The UI also keeps a device copy; this copy follows the user to any
// device, just like the saved tabs do. Until the user edits them, nothing is
// stored and the UI shows its built-in set.
const fs=require('node:fs');
const MAX=24,MAX_NAME=60,MAX_BYTES=16*1024;
const web=value=>typeof value==='string'&&value.length<=4096&&/^https?:\/\//i.test(value);
function clean(input) {
  const list=Array.isArray(input)?input:(input&&Array.isArray(input.shortcuts)?input.shortcuts:null);
  if(!list)throw new Error('Invalid browser shortcuts');
  const seen=new Set(),shortcuts=[];
  for(const item of list) {
    if(!item||!web(item.url)||seen.has(item.url))continue;
    seen.add(item.url);
    shortcuts.push({name:typeof item.name==='string'?item.name.slice(0,MAX_NAME):'',url:item.url});
    if(shortcuts.length>=MAX)break;
  }
  const saved={shortcuts,saved:Date.now()};
  if(Buffer.byteLength(JSON.stringify(saved))>MAX_BYTES)throw new Error('Browser shortcuts too large');
  return saved;
}
class ShortcutStore {
  constructor(file){this.file=file;}
  load() {
    if(!this.file)return null;
    try{return clean(JSON.parse(fs.readFileSync(this.file,'utf8'))).shortcuts;}catch{return null;}
  }
  save(input) {
    if(!this.file)return null;
    const saved=clean(input),temporary=this.file+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(saved),{mode:0o600});fs.renameSync(temporary,this.file);
    return saved.shortcuts;
  }
}
module.exports={ShortcutStore,clean};
