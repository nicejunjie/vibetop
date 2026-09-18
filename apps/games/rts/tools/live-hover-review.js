#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser,page;const before=process.argv.includes('--before');
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const id=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   g.terrain.fill(window.__rtsTables.TER.GROUND);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
   const b=H.build('factory',0,25,25);b.make=0;H.centerOn(25,25);H.zoom(1);return b.id;
  });
  async function hover(x,y){const p=await page.evaluate(([x,y])=>{const H=window.__rtsTest,p=H.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top-8};},[x,y]);await page.mouse.move(p.x,p.y);}
  const center=await page.evaluate(id=>{const b=window.__rtsTest.world().blds.find(b=>b.id===id);return{x:b.cx,y:b.cy};},id);
  await hover(center.x,center.y);await page.waitForFunction(()=>!document.querySelector('#hov').hidden);
  await page.evaluate(id=>{window.__rtsTest.world().blds.find(b=>b.id===id).hp=500;},id);
  if(!before)await page.waitForFunction(()=>document.querySelector('#hovSub').textContent.includes('500/1000'));
  await page.evaluate(id=>{const H=window.__rtsTest;H.killBld(H.world().blds.find(b=>b.id===id));},id);
  if(before){await page.waitForTimeout(500);console.log('After destruction:',await page.locator('#hov').innerText());}
  else await page.waitForFunction(()=>document.querySelector('#hov').hidden);
  await page.screenshot({path:path.resolve(__dirname,'../art/out/live-hover-'+(before?'before':'after')+'.png')});
  if(before)return;
  await page.evaluate(()=>{window.__rtsTest.spawn('lancer',0,23,27);});
  await hover(23,27);await page.waitForFunction(()=>!document.querySelector('#hov').hidden);
  await page.evaluate(()=>{const g=window.__rtsTest.world(),u=g.units.find(u=>u.type==='lancer'&&u.p===0);u.x=30;u.y=30;});
  await page.waitForFunction(()=>document.querySelector('#hov').hidden);
  assert.ok(await page.locator('#hov').isHidden());
  console.log('PASS: stationary-pointer tooltip updates HP and clears destroyed/departed entities');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
