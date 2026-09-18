#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser,page;
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.addInitScript(()=>localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6})));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const id=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   g.terrain.fill(window.__rtsTables.TER.GROUND);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
   for(let i=0;i<4;i++)H.build('power',0,10+i*4,14).make=0;
   const b=H.build('nuke',0,25,25);b.make=0;H.centerOn(25,25);H.zoom(1);return b.id;
  });
  async function toggle(){
   await page.locator('[data-cmd="power"]').click();
   const p=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().blds.find(b=>b.id===id),p=H.toScreen(b.cx,b.cy),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},id);
   await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
  }
  await toggle();await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).offline,id);
  await page.waitForFunction(()=>document.querySelector('.swic .cd')?.textContent==='OFFLINE');
  const paused=await page.evaluate(()=>{const g=window.__rtsTest.world();return{tick:g.tick,t:g.side[0].sw.nuke.t};});
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+300,paused.tick);
  assert.equal(await page.evaluate(()=>window.__rtsTest.sw(0).nuke.t),paused.t);
  // Ready state is a fixture; this does not pretend to wait ten game minutes.
  await page.evaluate(()=>window.__rtsTest.swCharge(0,'nuke'));
  await page.locator('.swic').click();
  await page.waitForFunction(()=>document.querySelector('#tip').textContent.includes('Power on'));
  await page.mouse.move(50,80);await page.screenshot({path:path.resolve(__dirname,'../art/out/super-offline.png')});
  await toggle();await page.waitForFunction(()=>document.querySelector('.swic .cd')?.textContent==='READY');
  await page.locator('.swic').click();
  await page.waitForFunction(()=>document.querySelector('#tip').textContent.includes('click the target'));
  await page.keyboard.press('Escape');
  await page.screenshot({path:path.resolve(__dirname,'../art/out/super-online.png')});
  console.log('PASS: real Power clicks pause timer, OFFLINE persists when charged, reactivation restores targeting');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
