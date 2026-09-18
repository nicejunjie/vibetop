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
  const ids=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   g.terrain.fill(window.__rtsTables.TER.GROUND);g.ore.fill(0);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
   const a=H.build('airforce',0,22,22),b=H.build('airforce',0,30,22);a.make=b.make=0;
   H.build('power',0,15,15).make=0;
   const u=H.spawn('harrier',0,22,22);H.centerOn(26,22);H.zoom(1);
   return{a:a.id,b:b.id,u:u.id};
  });
  async function toggle(){
   await page.locator('[data-cmd="power"]').click();
   const p=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().blds.find(b=>b.id===id),p=H.toScreen(b.cx,b.cy),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},ids.a);
   await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
  }
  await toggle();await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).offline,ids.a);
  const tick=await page.evaluate(id=>{const g=window.__rtsTest.world(),u=g.units.find(u=>u.id===id);u.ammo=0;u.hp=50;return g.tick;},ids.u);
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+1200,tick,{timeout:20000});
  const off=await page.evaluate(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return{ammo:u.ammo,hp:u.hp};},ids.u);
  assert.deepEqual(off,{ammo:0,hp:50});
  await page.screenshot({path:path.resolve(__dirname,'../art/out/airfield-off.png')});
  await toggle();
  await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return u.ammo===2&&u.hp===u.maxhp;},ids.u,{timeout:30000});
  await page.evaluate(id=>{const H=window.__rtsTest;H.killBld(H.world().blds.find(b=>b.id===id));},ids.a);
  await page.waitForFunction(({u,b})=>{const a=window.__rtsTest.world().units.find(a=>a.id===u);return a.pad===b&&a.landed;},ids,{timeout:15000});
  await page.waitForFunction(id=>{const g=window.__rtsTest.world(),u=g.units.find(u=>u.id===id);return g.tick-u.landAt>40;},ids.u);
  await page.mouse.move(50,80);
  await page.screenshot({path:path.resolve(__dirname,'../art/out/airfield-relocated.png')});
  console.log('PASS: actual Power toggle stops service, reactivation rearms/repairs, destroyed home relocates armed aircraft');
 }catch(e){if(page)await page.screenshot({path:path.resolve(__dirname,'../art/out/airfield-failure.png')}).catch(()=>{});throw e;}
 finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
