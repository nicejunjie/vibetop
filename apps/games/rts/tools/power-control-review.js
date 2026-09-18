#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser,page;const before=process.argv.includes('--before');
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.addInitScript(()=>localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6})));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const ids=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   g.terrain.fill(window.__rtsTables.TER.GROUND);g.ore.fill(0);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
   const p=H.build('power',0,20,20),b=H.build('tesla',0,25,25);p.make=b.make=0;
   const u=H.spawn('mcv',1,29,25);u.hp=u.maxhp=100000;
   H.centerOn(25,25);H.zoom(1);return{b:b.id,u:u.id};
  });
  await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id).hp<100000,ids.u);
  async function toggle(){
   await page.locator('[data-cmd="power"]').click();
   const p=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().blds.find(b=>b.id===id),p=H.toScreen(b.cx,b.cy),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},ids.b);
   await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
  }
  await toggle();await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).offline,ids.b);
  const tick=await page.evaluate(()=>window.__rtsTest.world().tick);
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+100,tick);
  const hp=await page.evaluate(id=>window.__rtsTest.world().units.find(u=>u.id===id).hp,ids.u);
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+800,tick);
  const hpOff=await page.evaluate(id=>window.__rtsTest.world().units.find(u=>u.id===id).hp,ids.u);
  if(before)await page.waitForFunction(()=>window.__rtsTest.world().shots.some(s=>s.tesla),null,{timeout:10000});
  await page.screenshot({path:path.resolve(__dirname,'../art/out/power-off-'+(before?'before':'after')+'.png')});
  console.log(JSON.stringify({hpAfterOldShot:hp,hpWhileOffline:hpOff}));
  if(before)return;
  assert.equal(hpOff,hp,'a manually switched-off tower must not fire');
  await toggle();await page.waitForFunction(id=>!window.__rtsTest.world().blds.find(b=>b.id===id).offline,ids.b);
  await page.waitForFunction(({id,hp})=>window.__rtsTest.world().units.find(u=>u.id===id).hp<hp,{id:ids.u,hp:hpOff},{timeout:10000});
  await page.screenshot({path:path.resolve(__dirname,'../art/out/power-restored.png')});
  console.log('PASS: actual Power-button disable, no offline damage, and firing resumes after reactivation');
 }catch(e){if(page)await page.screenshot({path:path.resolve(__dirname,'../art/out/power-control-failure.png')}).catch(()=>{});throw e;}
 finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
