#!/usr/bin/env node
'use strict';
// Real opening and power production; forced power deficit is a UI-only fixture.
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();
  for(const [fac,name] of [['col','Tesla Reactor'],['dir','Power Plant']]){
   const page=await browser.newPage({viewport:{width:1600,height:1000}});
   await page.addInitScript(fac=>{
    localStorage.setItem('vibetop:rts:fac',fac);
    localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6}));
   },fac);
   await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
   await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
   assert.ok((await page.locator('#tip').innerText()).includes('build a '+name));
   await page.locator('#plist button.pit').filter({has:page.locator('.nm',{hasText:new RegExp('^'+name+'$')})}).click();
   await page.waitForFunction(name=>document.querySelector('#tip').textContent.includes(name+' ready'),name,{timeout:65000});
   await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/faction-ready-'+fac+'.png')});
   // Pause the simulation before setting the deficit so power accounting
   // cannot overwrite the UI fixture. The normal panel refresh still runs.
   await page.keyboard.press('p');
   await page.evaluate(()=>{const g=window.__rtsTest.world();g.tick+=3000;g.side[0].powerMade=0;g.side[0].powerUse=100;});
   await page.waitForFunction(name=>document.querySelector('#tip').textContent.includes('Build a '+name+'.'),name,{timeout:10000});
   await page.evaluate(()=>{
    const g=window.__rtsTest.world();g.tick+=3000;
    g.side[0].powerMade=1000;g.side[0].powerUse=100;g.side[0].blackout=g.tick+600;
   });
   await page.waitForFunction(()=>document.querySelector('#tip').textContent.includes('Power sabotaged — production is slowed until the blackout ends.'),null,{timeout:10000});
   await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/faction-blackout-'+fac+'.png')});
   console.log('PASS',fac,'opening, completed building, low-power names and temporary blackout feedback');
   await page.close();
  }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
