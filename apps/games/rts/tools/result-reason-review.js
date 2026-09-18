#!/usr/bin/env node
'use strict';
// Re-render an actual terminal campaign save with the corrected scorecard.
// This is a presentation check, not another completed match.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const blob=JSON.parse(fs.readFileSync(process.argv[2]||'art/out/strategy-final-soviet-full-match-final-save.json','utf8'));
 const server=await serve(),browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.addInitScript(f=>localStorage.setItem('vibetop:rts:fac',f),blob.fac);
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const restoredCredits=await page.evaluate(b=>window.__rtsTest.loadBlob(b).side[0].credits,blob);
  assert.equal(restoredCredits,blob.g.side[0].credits,'restoration preserves the campaign bank');
  await page.waitForFunction(()=>window.__rts().state==='over',null,{timeout:10000});
  const text=await page.locator('body').innerText();
  assert.match(text,/Enemy economy collapsed at/);
  assert.ok(!text.includes('Enemy base levelled'));
  await page.screenshot({path:path.resolve(__dirname,'../art/out/economic-result-corrected.png')});
  console.log('PASS: actual economic-concession save displays the correct result reason. Presentation replay only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
