#!/usr/bin/env node
'use strict';
// Controlled real-map fixture; all boarding, sailing, unloading and subsequent
// movement go through mouse/keyboard input. Not a full naval match.
const path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser,page;
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>localStorage.setItem('vibetop:rts:map','coastal'));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const ids=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   const boat=H.spawn('lcraft',0,16,10),men=[H.spawn('rifle',0,14,10),H.spawn('engineer',0,14,11)];
   H.centerOn(16,10);H.zoom(1);return{boat:boat.id,men:men.map(u=>u.id)};
  });
  async function click(x,y,dy=0){const p=await page.evaluate(([x,y,dy])=>{
   const H=window.__rtsTest;H.centerOn(x,y);const p=H.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top+dy};
  },[x,y,dy]);await page.mouse.click(p.x,p.y);}
  async function select(id){const u=await page.evaluate(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);return{x:u.x,y:u.y};},id);await click(u.x,u.y,-8);
   await page.waitForFunction(id=>window.__rtsTest.selected().some(u=>u.id===id),id,{timeout:3000});}
  for(let i=0;i<ids.men.length;i++){
   await select(ids.men[i]);await click(16,10,-8);
   await page.waitForFunction(({boat,n})=>window.__rtsTest.world().units.find(u=>u.id===boat).pax?.length===n,{boat:ids.boat,n:i+1},{timeout:15000});
  }
  console.log('Boarded both infantry via clicks');
  await select(ids.boat);await click(25,25);
  await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return Math.hypot(u.x-25,u.y-25)<1.3;},ids.boat,{timeout:20000});
  await page.keyboard.press('d');
  await page.waitForTimeout(700);
  const cargo=await page.evaluate(id=>window.__rtsTest.world().units.find(u=>u.id===id).pax.length,ids.boat);
  assert.equal(cargo,2,'open water must not unload passengers onto a remote shore');
  assert.ok(await page.locator('#tip').getByText('Move closer to a clear shore to unload',{exact:true}).count(),'explain how to reach a valid unloading position');
  await click(31,31);
  await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return Math.hypot(u.x-31,u.y-31)<1.3;},ids.boat,{timeout:20000});
  await page.keyboard.press('d');
  await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id).pax.length===0,ids.boat,{timeout:5000});
  const landed=await page.evaluate(()=>window.__rtsTest.world().units.filter(u=>u.p===0&&!u.dead&&['rifle','engineer'].includes(u.type)).map(u=>({id:u.id,x:u.x,y:u.y})));
  assert.equal(landed.length,2);
  for(const u of landed){await select(u.id);await click(33,32);
   await page.waitForFunction(()=>document.querySelector('#tip').lastElementChild?.textContent==='Moving',null,{timeout:3000});
   await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return Math.hypot(u.x-33,u.y-32)<2;},u.id,{timeout:10000});}
  await page.evaluate(()=>{window.__rtsTest.centerOn(31,31);window.__rtsTest.render();});
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/naval-landing.png')});
  assert.deepEqual(errors,[]);console.log('PASS: boarding, sea crossing, no remote disembarkation, island landing and post-landing orders');
 }catch(e){if(page)await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/naval-landing-failure.png')}).catch(()=>{});throw e;}
 finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
