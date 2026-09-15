#!/usr/bin/env node
'use strict';
// Rendering invariants only. This does not certify visual likeness.
const assert = require('node:assert/strict');
const path = require('node:path');
const { serve } = require('./lib/serve-rts');
const { chromium } = require(path.resolve(__dirname, '../../../../tests/e2e/node_modules/playwright'));
const roster = ['rifle','rocket','rocketeer','tanya','cleg','engineer','spy',
  'conscript','flak','teslatrooper','desolator','ivan','yuri'];
async function main() {
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch();
    const results=[];
    for (const dpr of [1,2]) {
      const context=await browser.newContext({deviceScaleFactor:dpr});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(server.url+'/rts.html');
      await page.waitForFunction(()=>!!window.__rtsTest);
      results.push(await page.evaluate(keys=>{
        const H=window.__rtsTest, frames=[], tracked=new Set();
        for(const owner of [0,1]) for(const key of keys) {
          const fac=['conscript','flak','teslatrooper','desolator','ivan','yuri'].includes(key)?'col':'dir';
          const art=H.spr().unit[owner][fac][key];
          for(const state of ['stand','walk','fire']) for(const face of [0,4,8,12,16,20,24,28]) {
            const s=art.fr(state,face,2); tracked.add(s.c);
            if(!s.crispInfantry||s.c.width!==s.w||s.c.height!==s.h)throw Error('Non-native grid: '+key);
            const data=s.g.getImageData(0,0,s.w,s.h).data;
            let hash=2166136261, opaque=0, ownerPixels=0;
            for(let i=0;i<data.length;i+=4) {
              const a=data[i+3];
              if(a>=128&&a!==255)throw Error('Soft body edge: '+key);
              if(a===255) {
                opaque++;
                if(owner===1&&data[i]>data[i+1]*1.5&&data[i]>data[i+2]*1.5)ownerPixels++;
              }
              for(let c=0;c<4;c++)hash=Math.imul(hash^data[i+c],16777619)>>>0;
            }
            if(!opaque)throw Error('Empty body: '+key);
            if(key==='rifle'&&owner===1&&!ownerPixels)throw Error('Lost red team colour');
            frames.push(hash);
          }
        }
        const live=H.begin(9340,'normal',null,true,true); live.seen.fill(1);
        const start=live.start[0];
        const u=H.spawn('rifle',0,start.x,start.y);u.stopped=true;u.face=4;
        H.centerOn(start.x,start.y);
        const proto=CanvasRenderingContext2D.prototype,original=proto.drawImage;
        let checked=0;
        proto.drawImage=function(source,...args){
          if(tracked.has(source)&&this.canvas===document.querySelector('canvas')) {
            if(this.imageSmoothingEnabled)throw Error('Infantry display is filtered');
            const m=this.getTransform(),x=args[0],y=args[1];
            const px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
            if(Math.abs(px-Math.round(px))>1e-6||Math.abs(py-Math.round(py))>1e-6)throw Error('Subpixel origin');
            checked++;
          }
          return original.call(this,source,...args);
        };
        try {for(const zoom of [1,1.35,2]){H.zoom(zoom);H.render();}}
        finally {proto.drawImage=original;}
        if(!checked)throw Error('No live infantry draws checked');
        return {frames,checked};
      },roster));
      assert.deepEqual(errors,[]);
      await context.close();
    }
    assert.deepEqual(results[0].frames,results[1].frames,'DPR changed sprite pixels');
    console.log('PASS: '+results[0].frames.length+' frames at DPR 1/2; opaque bodies, team colour, native grids; unfiltered pixel-aligned live draws at three zooms. Not a likeness test.');
  } finally { if(browser)await browser.close();server.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
