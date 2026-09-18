#!/usr/bin/env node
'use strict';
const path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.addInitScript(()=>localStorage.setItem('vibetop:rts:map','coastal'));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const ids=await page.evaluate(()=>{const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   const tr=H.spawn('lcraft',0,16,10),ship=H.spawn('destroyer',0,20,15),man=H.spawn('rifle',0,14,10);
   H.centerOn(18,12);H.zoom(1);return{tr:tr.id,ship:ship.id,man:man.id};});
  async function click(x,y){const p=await page.evaluate(([x,y])=>{const H=window.__rtsTest,p=H.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top-8};},[x,y]);await page.mouse.click(p.x,p.y);}
  await click(20,15);assert.ok(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),ids.ship));
  await click(16,10);
  await page.waitForFunction(id=>window.__rtsTest.selected().some(u=>u.id===id),ids.tr,{timeout:3000});
  assert.notEqual(await page.evaluate(id=>window.__rtsTest.world().units.find(u=>u.id===id).order?.t,ids.ship),'enter');
  await click(14,10);await click(16,10);
  await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id).pax.length===1,ids.tr,{timeout:15000});
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/naval-boarding-guard.png')});
  console.log('PASS: clicking the craft with a Destroyer selected selects the craft, while the same click boards infantry.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
