#!/usr/bin/env node
'use strict';
// Reference animation and fixed-scale pose boards; never a likeness score.
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser;
 try {
  browser=await chromium.launch();const page=await browser.newPage();
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  for(const key of (process.argv.includes('--all')?['tanya','conscript','rifle','rocket','flak','engineer','spy','ivan','cleg','teslatrooper','desolator','yuri','rocketeer']:['tanya','conscript','rifle'])) {
   const file=key;
   const format=key==='yuri'?'png':'gif';
   const ref=fs.readFileSync(path.resolve(__dirname,'../docs/ra2-ref/sprites/library/'+file+'.'+format)).toString('base64');
   const png=await page.evaluate(async({key,ref,format})=>{
    const c=document.createElement('canvas');c.width=1600;c.height=1120;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.fillStyle='#182630';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='16px sans-serif';
    g.fillText(key+' | reference animation samples (3x), current poses (4x + 1x)',12,22);
    const decoder=new ImageDecoder({data:Uint8Array.from(atob(ref),c=>c.charCodeAt(0)),type:'image/'+format});
    await decoder.tracks.ready;const count=decoder.tracks.selectedTrack.frameCount;
    for(let j=0;j<24;j++){
     const frame=Math.floor(j*(count-1)/23),{image}=await decoder.decode({frameIndex:frame});
     const x=j%12*133,y=35+Math.floor(j/12)*120;
     const q=document.createElement('canvas');q.width=image.displayWidth;q.height=image.displayHeight;
     const z=q.getContext('2d');z.drawImage(image,0,0);image.close();
     const pixels=z.getImageData(0,0,q.width,q.height).data;let x0=q.width,y0=q.height,x1=0,y1=0;
     for(let yy=0;yy<q.height;yy++)for(let xx=0;xx<q.width;xx++){
      const p=(yy*q.width+xx)*4;if(pixels[p+3]>128&&Math.max(pixels[p],pixels[p+1],pixels[p+2])>45){x0=Math.min(x0,xx);y0=Math.min(y0,yy);x1=Math.max(x1,xx);y1=Math.max(y1,yy);}
     }
     if(x1>=x0)g.drawImage(q,x0,y0,x1-x0+1,y1-y0+1,x+66-(x1-x0+1)*1.5,y+10,(x1-x0+1)*3,(y1-y0+1)*3);
     g.fillText(String(frame),x+3,y+115);
    } decoder.close();
    const art=window.__rtsTest.spr().unit[0][['conscript','flak','ivan','teslatrooper','desolator','yuri'].includes(key)?'col':'dir'][key];
    ['prone','crawl','down','up','death','plant'].forEach((state,row)=>{
     for(let j=0;j<8;j++) {
      const face=row===0?j*4:12,ph=row===0?0:j%6,s=art.fr(state,face,ph),x=j*200,y=285+row*138;
      g.fillStyle='#485e3c';g.fillRect(x+1,y,198,136);
      g.fillStyle='white';g.font='12px sans-serif';g.fillText(state+' d'+face+' f'+ph,x+5,y+16);
      g.drawImage(s.c,x+100-s.w*2,y+99-63*4,s.w*4,s.h*4);
      g.drawImage(s.c,x+100-s.w/2,y+129-63,s.w,s.h);
     }
    });
    return c.toDataURL().split(',')[1];
   },{key,ref,format});
   fs.writeFileSync(path.resolve(__dirname,'../art/out/ground-'+key+'-'+(process.argv[2]||'current')+'.png'),Buffer.from(png,'base64'));
  }
  const board=await page.evaluate(()=>{
   const keys=['rifle','rocket','rocketeer','tanya','cleg','engineer','spy','conscript','flak','teslatrooper','desolator','ivan','yuri'];
   const c=document.createElement('canvas');c.width=1200;c.height=keys.length*104;
   const g=c.getContext('2d');g.imageSmoothingEnabled=false;
   keys.forEach((key,row)=>{
    g.fillStyle=row%2?'#536447':'#485e3c';g.fillRect(0,row*104,1200,104);
    g.fillStyle='white';g.font='14px sans-serif';g.fillText(key,6,row*104+17);
    const fac=['conscript','flak','teslatrooper','desolator','ivan','yuri'].includes(key)?'col':'dir';
    const art=window.__rtsTest.spr().unit[0][fac][key];
    for(let d=0;d<8;d++){
     const s=art.fr('prone',d*4,0),x=120+d*132;
     g.drawImage(s.c,x-s.w*1.5,row*104+75-63*3,s.w*3,s.h*3);
     g.drawImage(s.c,x-s.w/2,row*104+100-63,s.w,s.h);
    }
   });return c.toDataURL().split(',')[1];
  });
  fs.writeFileSync(path.resolve(__dirname,'../art/out/ground-roster.png'),Buffer.from(board,'base64'));
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.begin(98212,'normal',null,true,true);
   g.ai=null;g.units.length=0;g.blds.length=0;g.occ.fill(0);g.terrain.fill(window.__rtsTables.TER.GROUND);g.ore.fill(0);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);g.tick=1000;
   H.build('base',0,5,5);H.build('base',1,55,55);
   ['rifle','tanya','conscript','spy','ivan','engineer','cleg','teslatrooper','yuri'].forEach((key,i)=>{
    const x=25+(i%3)*3,y=25+Math.floor(i/3)*3,u=H.spawn(key,0,x,y);
    u.prone=true;u.downAt=900;u.hitAt=1000;u.face=[4,12,28][i%3];
   });H.centerOn(28,28);H.zoom(1.35);H.render();
  });
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/ground-live.png')});
 } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
