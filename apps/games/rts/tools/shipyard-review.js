#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  const refs=['dir','col'].map(f=>fs.readFileSync(path.resolve(__dirname,'../docs/ra2-ref/sprites/library/shipyard-'+f+'.gif')).toString('base64'));
  const result=await page.evaluate(async refs=>{
   const H=window.__rtsTest,S=H.spr();
   const c=document.createElement('canvas');c.width=1500;c.height=1120;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
   g.fillStyle='#142d3b';g.fillRect(0,0,c.width,c.height);
   function bounds(c,black){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(d[i+3]>96&&(!black||Math.max(d[i],d[i+1],d[i+2])>28)){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}}
    return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
   const stats=[];
   for(let fi=0;fi<2;fi++){
    const fac=fi?'col':'dir',y=fi*560;
    const decoder=new ImageDecoder({data:Uint8Array.from(atob(refs[fi]),c=>c.charCodeAt(0)),type:'image/gif'});
    await decoder.tracks.ready;const count=decoder.tracks.selectedTrack.frameCount;
    const {image}=await decoder.decode({frameIndex:count-1});
    const rc=document.createElement('canvas');rc.width=image.displayWidth;rc.height=image.displayHeight;rc.getContext('2d').drawImage(image,0,0);image.close();decoder.close();
    const rb=bounds(rc,true);g.fillStyle='#f1f4f6';g.font='18px sans-serif';g.fillText(fac+' — RA2 completed construction frame (2×)',20,y+28);
    g.drawImage(rc,rb.x,rb.y,rb.w,rb.h,20,y+50,rb.w*2,rb.h*2);
    const art=S.bld[fi][fac].shipyard,s=art.s,b=bounds(s.c,false),k=s.c.width/s.w;
    g.fillText('Current shipyard (2×); destroyer below at the same scale',600,y+28);
    g.drawImage(s.c,b.x,b.y,b.w,b.h,600,y+50,b.w/k*2,b.h/k*2);
    const ship=S.unit[0].dir.destroyer[0],q=bounds(ship.c,false),kk=ship.c.width/ship.w;
    g.drawImage(ship.c,q.x,q.y,q.w,q.h,1180,y+330,q.w/kk*2,q.h/kk*2);
    stats.push({fac,frames:count,w:b.w/k,h:b.h/k});
   }
   return {png:c.toDataURL().split(',')[1],stats};
  },refs);
  if(errors.length)throw Error(errors.join('\n'));
  const tag=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'');
  fs.writeFileSync(path.resolve(__dirname,'../art/out/shipyards-'+tag+'.png'),Buffer.from(result.png,'base64'));
  console.log(JSON.stringify(result.stats));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
