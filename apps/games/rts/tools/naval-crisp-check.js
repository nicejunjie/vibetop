#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const srv=await serve();let browser;const results=[];
 try{
  browser=await chromium.launch();
  for(const dpr of [1,2]){
   const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1500,height:1000}});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(srv.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
   const result=await page.evaluate(()=>{
    const H=window.__rtsTest,rows=[['aegis','dir'],['dolphin','dir'],['squid','col']],hashes=[],tracked=new Set();
    const c=document.createElement('canvas');c.width=1600;c.height=1200;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.fillStyle='#183b4b';g.fillRect(0,0,c.width,c.height);
    for(const owner of [0,1])for(let ri=0;ri<rows.length;ri++){
     const [key,fac]=rows[ri],atlas=H.spr().unit[owner][fac][key];
     for(let face=0;face<32;face++){
      const s=atlas[face];assertFrame(s,key,face);
      tracked.add(s.c);const d=s.g.getImageData(0,0,s.w,s.h).data;let hash=2166136261;
      for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
       const i=(y*s.w+x)*4;
       if((x===0||y===0||x===s.w-1||y===s.h-1)&&d[i+3]>96)throw Error('Clipped '+key+'/'+face+' at '+x+','+y+' in '+s.w+'x'+s.h);
      }
      for(const b of d)hash=Math.imul(hash^b,16777619)>>>0;
      hashes.push([owner,key,face,hash]);
      if(owner===0){
       const x=face%8*200,y=(ri*4+Math.floor(face/8))*100;
       g.fillStyle='#e9f0f3';g.font='11px sans-serif';g.fillText(key+' / '+face,x+6,y+14);
       // Keep native sprite size, with a shared canvas centre/ground anchor.
       g.drawImage(s.c,x+100-s.w/2,y+60-(s.h-40),s.w,s.h);
      }
     }
    }
    function assertFrame(s,key,face){if(!s||!s.crispVehicle||s.c.width!==s.w||s.c.height!==s.h)throw Error('Non-native '+key+'/'+face);}
    const live=H.startWith(4242,'normal','coastal',{});live.seen.fill(1);
    H.centerOn(28,20);let draws=0;
    const proto=CanvasRenderingContext2D.prototype,original=proto.drawImage;
    proto.drawImage=function(source,...args){
     if(tracked.has(source)&&this.canvas===document.querySelector('canvas')){
      if(this.imageSmoothingEnabled)throw Error('Filtered naval sprite');draws++;
     }
     return original.call(this,source,...args);
    };
    try{
     for(const [key,fac] of rows){
      live.units.length=0;live.side[0].fac=fac;
      const u=H.spawn(key,0,28,20);u.face=0;u.stopped=true;
      for(const zoom of [1,1.35,2]){
       const before=draws;H.zoom(zoom);H.render();
       if(draws===before)throw Error('No live draw for '+key+' at zoom '+zoom);
      }
     }
    }finally{proto.drawImage=original;}
    if(!draws)throw Error('No live naval draws');
    return {hashes,png:c.toDataURL().split(',')[1],draws};
   });
   assert.deepEqual(errors,[]);results.push(result.hashes);
   if(dpr===1)fs.writeFileSync(path.resolve(__dirname,'../art/out/naval-rotation.png'),Buffer.from(result.png,'base64'));
   console.log('DPR '+dpr+': '+result.hashes.length+' frames, '+result.draws+' live draws');
   await context.close();
  }
  assert.deepEqual(results[0],results[1]);console.log('PASS: naval native pixels, 32 bearings, both owners, clipping and live filtering. Not visual acceptance.');
 }finally{if(browser)await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
