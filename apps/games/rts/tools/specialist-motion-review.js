#!/usr/bin/env node
'use strict';
// Fixed anchors and magnification: exposes foot sliding and disconnected props.
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  for(const key of ['tanya','ivan','cleg']){
   const ref=fs.readFileSync(path.resolve(__dirname,'../docs/ra2-ref/sprites/library/'+key+'.gif')).toString('base64');
   const png=await page.evaluate(async({key,ref})=>{
    const c=document.createElement('canvas');c.width=1080;c.height=870;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.fillStyle='#14212c';g.fillRect(0,0,c.width,c.height);
    g.fillStyle='#edf2f6';g.font='18px sans-serif';g.fillText(key+' — RA2 animation samples; ours at fixed 4× and 1×',15,28);
    const decoder=new ImageDecoder({data:Uint8Array.from(atob(ref),c=>c.charCodeAt(0)),type:'image/gif'});
    await decoder.tracks.ready;const count=decoder.tracks.selectedTrack.frameCount;
    for(let j=0;j<6;j++){
     const {image}=await decoder.decode({frameIndex:Math.floor(j*(count-1)/5)});
     const q=document.createElement('canvas');q.width=image.displayWidth;q.height=image.displayHeight;
     const z=q.getContext('2d');z.drawImage(image,0,0);image.close();
     const d=z.getImageData(0,0,q.width,q.height).data;let x0=q.width,y0=q.height,x1=0,y1=0;
     for(let y=0;y<q.height;y++)for(let x=0;x<q.width;x++){let i=(y*q.width+x)*4;if(d[i+3]>128&&Math.max(d[i],d[i+1],d[i+2])>40){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
     g.drawImage(q,x0,y0,x1-x0+1,y1-y0+1,j*180+65,50,(x1-x0+1)*3,(y1-y0+1)*3);
    }
    decoder.close();
    const art=window.__rtsTest.spr().unit[1][key==='ivan'?'col':'dir'][key];
    for(const owner of [0,1])for(const face of [0,4,8,12,16,20,24,28]){
     const atlas=window.__rtsTest.spr().unit[owner][key==='ivan'?'col':'dir'][key];
     let feet=null;const poses=new Set();
     for(let ph=0;ph<6;ph++){
      const s=atlas.fr('fire',face,ph),gg=s.c.getContext('2d');
      const contact=Array.from(gg.getImageData(0,60,s.w,5).data).join(',');
      if(feet!==null&&contact!==feet)throw Error(key+': firing feet slide, owner '+owner+' facing '+face+' phase '+ph);
      feet=contact;poses.add(s.c.toDataURL());
     }
     if(poses.size<2)throw Error(key+': firing pose is frozen at facing '+face);
    }
    [['walk',4],['walk',12],['fire',4],['fire',12]].forEach(([state,face],row)=>{
     const yy=205+row*165;
     for(let ph=0;ph<6;ph++){
      const x=ph*180,s=art.fr(state,face,ph);
      g.fillStyle='#485e3c';g.fillRect(x+2,yy,176,161);
      g.fillStyle='#edf2f6';g.font='12px sans-serif';g.fillText(state+' / '+face+' / '+ph,x+8,yy+15);
      const by=63;
      g.drawImage(s.c, x+90-s.w*2, yy+132-by*4,s.w*4,s.h*4);
      g.drawImage(s.c,x+20-s.w/2,yy+151-by,s.w,s.h);
     }
    });
    return c.toDataURL().split(',')[1];
   },{key,ref});
   fs.writeFileSync(path.resolve(__dirname,'../art/out/motion-'+key+'-'+(process.argv[2]||'current')+'.png'),Buffer.from(png,'base64'));
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: specialist firing feet stay planted across six phases, eight bearings and both owners. Pose changes present; inspect PNGs for visual quality.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
