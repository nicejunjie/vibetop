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
   const ref=H.build('refinery',0,22,22),oil=H.build('oilderrick',0,30,22);ref.make=oil.make=0;
   H.build('power',0,15,15).make=0;
   g.units.length=0;const dock=H.api3.refDock(g,ref),u=H.spawn('warminer',0,dock.x,dock.y);
   H.centerOn(26,22);H.zoom(1);return{ref:ref.id,oil:oil.id,u:u.id};
  });
  async function toggle(id){
   await page.locator('[data-cmd="power"]').click();
   const p=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().blds.find(b=>b.id===id),p=H.toScreen(b.cx,b.cy),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},id);
   await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
  }
  await toggle(ids.ref);await toggle(ids.oil);
  await page.waitForFunction(({ref,oil})=>window.__rtsTest.world().blds.filter(b=>b.id===ref||b.id===oil).every(b=>b.offline),ids);
  const before=await page.evaluate(({ref,u})=>{
   const g=window.__rtsTest.world(),a=g.units.find(a=>a.id===u);a.homeRef=g.blds.find(b=>b.id===ref);
   a.cargo=100;a.cargoV=100;a.state='toref';a.forcedDock=true;return{tick:g.tick,cash:g.side[0].credits};
  },ids);
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+400,before.tick);
  const held=await page.evaluate(id=>{const g=window.__rtsTest.world();return{cash:g.side[0].credits,cargo:g.units.find(u=>u.id===id).cargo};},ids.u);
  assert.deepEqual(held,{cash:before.cash,cargo:100});
  await page.mouse.move(50,80);await page.screenshot({path:path.resolve(__dirname,'../art/out/economic-offline.png')});
  await toggle(ids.ref);
  await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id).cargo===0,ids.u);
  assert.equal(await page.evaluate(()=>window.__rtsTest.credits(0)),before.cash+100);
  await toggle(ids.oil);
  await page.waitForFunction(c=>window.__rtsTest.credits(0)>c,before.cash+100);
  await page.mouse.move(50,80);await page.screenshot({path:path.resolve(__dirname,'../art/out/economic-online.png')});
  await toggle(ids.oil);
  await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).offline,ids.oil);
  const bonusCash=await page.evaluate(({ref,u})=>{
   const H=window.__rtsTest,g=H.world(),r=g.blds.find(b=>b.id===ref),a=g.units.find(a=>a.id===u),dock=H.api3.refDock(g,r);
   H.build('purifier',0,35,30).make=0;
   a.x=dock.x;a.y=dock.y;a.homeRef=r;a.cargo=100;a.cargoV=100;a.state='toref';return g.side[0].credits;
  },ids);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.plus')).some(e=>e.textContent==='+125'));
  assert.equal(await page.evaluate(()=>window.__rtsTest.credits(0)),bonusCash+125);
  console.log('PASS: real shutdown holds cargo and oil income, refinery resumes exact delivery, oil resumes payouts');
  console.log('PASS: purifier bonus is included in both bank credit and delivery popup');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
