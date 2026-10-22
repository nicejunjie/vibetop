'use strict';
// Saved Browser Lite tabs, per user, beside the cookie jar. The UI also keeps
// a device copy, but iOS can discard the page and return frame storage empty,
// so this copy restores tabs whenever the device has none.
const fs=require('node:fs');
const MAX_TABS=30,MAX_HISTORY=50,MAX_BYTES=80*1024;
const web=value=>typeof value==='string'&&value.length<=4096&&/^https?:\/\//i.test(value);
function clean(input) {
  if(!input||typeof input!=='object'||!Array.isArray(input.tabs))throw new Error('Invalid browser tabs');
  const tabs=input.tabs.filter(tab=>tab&&web(tab.url)).slice(-MAX_TABS).map(tab=>{
    const item={url:tab.url,title:typeof tab.title==='string'?tab.title.slice(0,200):''};
    if(Array.isArray(tab.history)) {
      const history=tab.history.filter(entry=>entry&&web(entry.url)).slice(-MAX_HISTORY)
        .map(entry=>({url:entry.url,documentId:typeof entry.documentId==='string'?entry.documentId.slice(0,100):''}));
      if(history.length){item.history=history;item.position=Math.min(Math.max(0,tab.position|0),history.length-1);}
    }
    return item;
  });
  let active=Math.min(Math.max(0,input.active|0),Math.max(0,tabs.length-1));
  const size=()=>Buffer.byteLength(JSON.stringify({tabs,active}));
  // Over budget: keep each tab's current entry, shorten history, then drop the oldest tabs.
  for(const keep of [20,5,0]) {
    if(size()<=MAX_BYTES)break;
    for(const tab of tabs)if(tab.history) {
      const start=Math.max(0,Math.min(tab.position-Math.floor(keep/2),tab.history.length-keep));
      tab.history=keep?tab.history.slice(start,start+keep):undefined;
      if(tab.history)tab.position-=start;else delete tab.position;
    }
  }
  while(size()>MAX_BYTES&&tabs.length>1){tabs.shift();active=Math.max(0,active-1);}
  return {tabs,active,saved:Date.now()};
}
class TabStore {
  constructor(file){this.file=file;}
  load() {
    if(!this.file)return null;
    try{return clean(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch{return null;}
  }
  save(input) {
    if(!this.file)return null;
    const saved=clean(input),temporary=this.file+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(saved),{mode:0o600});fs.renameSync(temporary,this.file);
    return saved;
  }
}
module.exports={TabStore,clean};
