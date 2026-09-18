#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();
  for(const type of ['radar','airforce']){
   const page=await browser.newPage({viewport:{width:1600,height:1000}});
   await page.addInitScript(()=>{
    localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6}));
    const orig=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(s,...args){if(this.canvas.id==='mini'&&s==='RADAR OFFLINE')window.radarOffDrawn=true;return orig.call(this,s,...args);};
   });
   await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
   await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
   const id=await page.evaluate(type=>{
    const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
    g.terrain.fill(window.__rtsTables.TER.GROUND);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
    H.build('power',0,15,15).make=0;const b=H.build(type,0,25,25);b.make=0;
    H.centerOn(25,25);H.zoom(1);return b.id;
   },type);
   async function toggle(){
    await page.locator('[data-cmd="power"]').click();
    const p=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().blds.find(b=>b.id===id),p=H.toScreen(b.cx,b.cy),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},id);
    await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
   }
   await toggle();await page.waitForFunction(()=>window.radarOffDrawn);
   const before=await page.evaluate(()=>window.__rtsTest.toScreen(25,25));
   await page.locator('#mini').click({position:{x:125,y:120}});
   const after=await page.evaluate(()=>window.__rtsTest.toScreen(25,25));assert.deepEqual(after,before);
   await page.screenshot({path:path.resolve(__dirname,'../art/out/radar-off-'+type+'.png')});
   await toggle();await page.waitForFunction(id=>!window.__rtsTest.world().blds.find(b=>b.id===id).offline,id);
   await page.locator('#mini').click({position:{x:125,y:120}});
   const restored=await page.evaluate(()=>window.__rtsTest.toScreen(25,25));assert.notDeepEqual(restored,before);
   console.log('PASS: '+type+' shutdown blanks and disables minimap; reactivation restores camera navigation');
   await page.close();
  }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
