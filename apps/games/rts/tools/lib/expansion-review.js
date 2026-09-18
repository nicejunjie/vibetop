'use strict';
const assert=require('node:assert/strict');
module.exports=async function({page,point,button,record,shot}){
 async function select(id){
  const u=await page.evaluate(id=>{
   const H=window.__rtsTest,u=H.world().units.find(u=>u.id===id&&!u.dead);
   if(!u)throw Error('Unit lost '+id);H.centerOn(u.x,u.y);H.zoom(1);return{x:u.x,y:u.y};
  },id);
  const p=await point(u.x,u.y,-8);await page.mouse.click(p.x,p.y);
  await page.waitForFunction(id=>window.__rtsTest.selected().some(u=>u.id===id),id,{timeout:3000});
 }
 async function clickAt(x,y){
  await page.evaluate(([x,y])=>window.__rtsTest.centerOn(x,y),[x,y]);
  const p=await point(x,y);await page.mouse.click(p.x,p.y);
 }
 await page.keyboard.press('e');await button('Engineer').click();
 await page.waitForFunction(()=>window.__rtsTest.world().units.some(u=>u.p===0&&u.type==='engineer'&&!u.dead),null,{timeout:60000});
 const eng=await page.evaluate(()=>window.__rtsTest.world().units.find(u=>u.p===0&&u.type==='engineer'&&!u.dead).id);
 await select(eng);await clickAt(27,18);
 await page.waitForFunction(id=>{
  const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);
  if(!u)throw Error('Engineer killed while approaching');return Math.hypot(u.x-27,u.y-18)<2;
 },eng,{timeout:45000});
 const oil=await page.evaluate(()=>{
  const H=window.__rtsTest,g=H.world(),b=g.blds.find(b=>b.type==='oilderrick'&&b.x===28&&b.y===20);
  if(!b||!g.seen[b.y*64+b.x])throw Error('Expected derrick not scouted');
  return{id:b.id,x:b.x,y:b.y};
 });
 await select(eng);await clickAt(oil.x,oil.y);
 await page.waitForFunction(id=>window.__rtsTest.world().blds.some(b=>b.id===id&&b.p===0),oil.id,{timeout:45000});
 await record('oil captured through engineer click');await shot('oil-captured');
 // Isolate the passive oil payment from miners by subtracting their recorded
 // delivery income. No production is active in this short observation window.
 const before=await page.evaluate(()=>{const g=window.__rtsTest.world();return{tick:g.tick,c:g.side[0].credits,h:g.side[0].harv};});
 await page.waitForFunction(t=>window.__rtsTest.world().tick>t+180,before.tick,{timeout:10000});
 const after=await page.evaluate(()=>{const s=window.__rtsTest.world().side[0];return{c:s.credits,h:s.harv};});
 const oilIncome=(after.c-before.c)-(after.h-before.h);
 assert.ok(oilIncome>0,'captured oil provides passive income');
 await record('passive oil income confirmed: '+Math.round(oilIncome));
 const miner=await page.evaluate(()=>window.__rtsTest.world().units.find(u=>u.p===0&&['chronominer','warminer'].includes(u.type)&&!u.dead).id);
 await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return u&&u.cargo<10;},miner,{timeout:45000});
 await select(miner);await clickAt(30,28);
 await page.waitForFunction(id=>{
  const g=window.__rtsTest.world(),u=g.units.find(u=>u.id===id&&!u.dead);
  return u&&Math.hypot(u.x-30,u.y-28)<1.5&&g.seen[30*64+27];
 },miner,{timeout:45000});
 await select(miner);await clickAt(27,30);
 await page.waitForFunction(id=>{
  const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);
  if(!u)throw Error('Expansion miner destroyed');
  return u.state==='mining'&&u.mineAt&&Math.hypot(u.mineAt.x-27,u.mineAt.y-30)<3&&u.cargoV>u.cargo+10;
 },miner,{timeout:60000});
 await page.evaluate(()=>window.__rtsTest.centerOn(27,30));
 await record('highland gems being harvested');await shot('gems-mining');
 await page.waitForFunction(id=>{
  const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);
  if(!u)throw Error('Expansion miner destroyed on return');
  return u.cargo===0&&u.x<24&&u.y<26;
 },miner,{timeout:60000});
 await record('gem cargo delivered');
 // A recurring expansion job must survive unloading while the selected seam
 // still contains gems. Do not accept a miner silently switching to base ore.
 await page.waitForFunction(id=>{
  const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);
  return u&&u.state==='mining'&&u.mineAt&&Math.hypot(u.mineAt.x-27,u.mineAt.y-30)<3;
 },miner,{timeout:60000});
 await page.evaluate(()=>window.__rtsTest.centerOn(27,30));
 await record('second highland harvesting cycle');await shot('second-cycle');
 await page.waitForFunction(()=>window.__rtsTest.world().ore[30*64+27]<1,null,{timeout:45000});
 await page.waitForFunction(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return u&&u.cargo===0&&u.x<24&&u.y<26;},miner,{timeout:60000});
 await page.waitForFunction(id=>{
  const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);
  if(u&&u.state==='mining'&&Math.hypot(u.x-27,u.y-30)>8)throw Error('Miner abandoned the expansion after one gem tile ran out');
  return u&&u.state==='mining'&&u.mineAt&&Math.hypot(u.mineAt.x-27,u.mineAt.y-30)<5;
 },miner,{timeout:60000});
 await page.evaluate(()=>window.__rtsTest.centerOn(27,30));
 await record('depleted tile replaced by adjacent gems');await shot('adjacent-seam');
 console.log('PASS: live engineer capture, oil income, highland delivery and continued expansion after seam depletion. Not a full-match verdict.');
};
