#!/usr/bin/env node
'use strict';
// Controlled scene; the attack itself goes through real selection and clicks.
const path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser,page;
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const ids=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.begin(991232,'normal',null,true,true);
   g.ai=null;g.terrain.fill(window.__rtsTables.TER.GROUND);g.ore.fill(0);g.hf.fill(0);g.hiAny=false;g.seen.fill(1);
   H.build('base',0,5,5).make=0;const b=H.build('base',1,30,30);b.make=0;
   const u=H.spawn('tanya',0,27,30);H.centerOn(29,30);H.zoom(2);
   window.__plantFrames=[];const art=H.spr().unit[0].dir.tanya,fr=art.fr;
   art.fr=function(st,dir,ph){if(st==='plant'&&!window.__plantFrames.includes(ph))window.__plantFrames.push(ph);return fr(st,dir,ph);};
   return{unit:u.id,building:b.id,bx:b.cx,by:b.cy};
  });
  async function click(x,y,dy=0){const p=await page.evaluate(([x,y,dy])=>{const p=window.__rtsTest.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top+dy};},[x,y,dy]);await page.mouse.click(p.x,p.y);}
  await click(27,30,-14);assert.ok(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),ids.unit));
  await click(ids.bx,ids.by);
  await page.waitForFunction(()=>window.__plantFrames.length>0,null,{timeout:20000});
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/tanya-c4-live.png')});
  await page.waitForFunction(()=>window.__plantFrames.length===6,null,{timeout:5000});
  const frames=await page.evaluate(()=>window.__plantFrames);assert.deepEqual(frames,[0,1,2,3,4,5]);
  assert.deepEqual(errors,[]);console.log('PASS: a real building attack plays all six C4 frames; no browser errors. Inspect tanya-c4-live.png.');
 } catch(e){
  if(page){console.log(await page.evaluate(()=>{const H=window.__rtsTest,g=H.world();return{tick:g.tick,units:g.units.filter(u=>u.type==='tanya'),blds:g.blds,tip:document.getElementById('tip').textContent,frames:window.__plantFrames};}));await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/tanya-c4-failure.png')});}throw e;
 } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
