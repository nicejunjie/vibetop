#!/usr/bin/env node
'use strict';
// Staged base/damage/loss; real repair, production and rebuilding inputs/time.
const assert=require('node:assert/strict'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser,page;const before=process.argv.includes('--before');
 const powerMode=process.argv.includes('--power'),prefix=powerMode?'production-power':'recovery';
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.addInitScript(()=>{localStorage.setItem('vibetop:rts:fac','col');localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6}));});
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  const fixture=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();g.ai=null;g.units.length=0;
   function put(key){
    const d=H.api.bspecFor(key,'col'),spots=[];
    for(let y=3;y<25;y++)for(let x=3;x<25;x++)if(H.api.canPlace(g,0,key,x,y)){
     let score=Math.hypot(x-12,y-14);
     for(const b of g.blds.filter(b=>!b.dead&&b.p===0))if(Math.max(x-(b.x+b.gw),b.x-(x+d.gw),y-(b.y+b.gh),b.y-(y+d.gh))<2)score+=20;
     spots.push({x,y,score});
    }
    spots.sort((a,b)=>a.score-b.score);if(!spots.length)throw Error('No fixture site '+key);
    const b=H.build(key,0,spots[0].x,spots[0].y);b.make=0;return b;
   }
   const power=put('power');put('refinery');put('barracks');const factory=put('factory');
   g.units.length=0;power.hp=power.maxhp/2;
   return {power:power.id,factory:factory.id,x:factory.x,y:factory.y,
    cx:factory.x+Math.floor((factory.gw-1)/2),cy:factory.y+Math.floor((factory.gh-1)/2),credits:g.side[0].credits};
  });
  const button=name=>page.locator('#plist button.pit').filter({has:page.locator('.nm',{hasText:new RegExp('^'+name+'$')})});
  async function point(x,y,dy=0){return page.evaluate(([x,y,dy])=>{
   const H=window.__rtsTest;H.centerOn(x,y);const p=H.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top+dy};
  },[x,y,dy]);}
  await page.keyboard.press('k');
  const pos=await page.evaluate(id=>{const b=window.__rtsTest.world().blds.find(b=>b.id===id);return{x:b.cx,y:b.cy};},fixture.power);
  const p=await point(pos.x,pos.y,-20);await page.mouse.click(p.x,p.y);
  await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).repair,fixture.power);
  const repairTip=await page.locator('#tip').innerText();
  await page.keyboard.press('Escape');
  await page.waitForFunction(id=>{const b=window.__rtsTest.world().blds.find(b=>b.id===id);return b.hp===b.maxhp&&!b.repair;},fixture.power,{timeout:15000});
  const charged=fixture.credits-await page.evaluate(()=>window.__rtsTest.world().side[0].credits);
  console.log(JSON.stringify({repairTip,charged,expected:45}));
  if(!before){assert.ok(repairTip.includes('Repairing Tesla Reactor'));assert.ok(Math.abs(charged-45)<0.01,'half-health repair costs 15% of the faction price, prorated');}
  await page.keyboard.press('r');await button('Rhino Tank').click();await button('Rhino Tank').click();
  await page.waitForFunction(()=>window.__rtsTest.world().side[0].queues.v.prog>0.08);
  async function toggleFactory(){
   await page.locator('[data-cmd="power"]').click();
   const b=await page.evaluate(id=>{const b=window.__rtsTest.world().blds.find(b=>b.id===id);return{x:b.cx,y:b.cy};},fixture.factory);
   const pos=await point(b.x,b.y);await page.mouse.click(pos.x,pos.y);await page.keyboard.press('Escape');
  }
  if(powerMode){await toggleFactory();await page.waitForFunction(id=>window.__rtsTest.world().blds.find(b=>b.id===id).offline,fixture.factory);}
  const held=await page.evaluate(({id,powerMode})=>{
   const H=window.__rtsTest,g=H.world();if(!powerMode)H.killBld(g.blds.find(b=>b.id===id));
   return{tick:g.tick,prog:g.side[0].queues.v.prog,credits:g.side[0].credits};
  },{id:fixture.factory,powerMode});
  await page.waitForFunction(t=>window.__rtsTest.world().tick>t+180,held.tick);
  const stalled=await page.evaluate(()=>{const g=window.__rtsTest.world();return{q:g.side[0].queues.v,c:g.side[0].credits};});
  console.log(JSON.stringify({progressBefore:held.prog,progressAfter:stalled.q.prog,creditsBefore:held.credits,creditsAfter:stalled.c}));
  const stamp=await button('Rhino Tank').locator('.qn').innerText();console.log('Lost-factory queue stamp:',stamp);
  await page.screenshot({path:path.resolve(__dirname,'../art/out/'+prefix+'-'+(before?'before':'waiting')+'.png')});
  if(before)return;
  assert.equal(stalled.q.prog,held.prog);assert.equal(stalled.q.list.length,2);assert.equal(stalled.c,held.credits);
  assert.equal(stamp,'WAIT');
  // Item tooltips are painted on a canvas, not text nodes in the DOM.
  await page.evaluate(()=>{
   window.__recoveryText=[];const proto=CanvasRenderingContext2D.prototype;
   window.__recoveryFillText=proto.fillText;
   proto.fillText=function(text,...args){window.__recoveryText.push(String(text));return window.__recoveryFillText.call(this,text,...args);};
  });
  await page.mouse.move(800,500);await button('Rhino Tank').hover();
  await page.waitForFunction(word=>window.__recoveryText.some(s=>s.includes(word+' War Factory')),powerMode?'Power on':'Rebuild');
  await page.evaluate(()=>{CanvasRenderingContext2D.prototype.fillText=window.__recoveryFillText;});
  if(powerMode){
   await toggleFactory();await page.waitForFunction(id=>!window.__rtsTest.world().blds.find(b=>b.id===id).offline,fixture.factory);
  }else{
  await page.keyboard.press('q');await button('War Factory').click();
  await page.waitForFunction(()=>window.__rtsTest.world().side[0].queues.b.ready==='factory',null,{timeout:90000});
  await button('War Factory').click();const dst=await point(fixture.cx,fixture.cy);await page.mouse.move(dst.x,dst.y);
  await page.waitForFunction(()=>window.__rtsTest.cursorKind()==='deploy');await page.mouse.click(dst.x,dst.y);
  }
  await page.waitForFunction(prog=>window.__rtsTest.world().side[0].queues.v.prog>prog,held.prog,{timeout:10000});
  await page.waitForFunction(()=>window.__rtsTest.world().units.some(u=>!u.dead&&u.p===0&&u.type==='rhino'),null,{timeout:45000});
  await page.screenshot({path:path.resolve(__dirname,'../art/out/'+prefix+'-resumed.png')});
  console.log('PASS: paid repair, preserved queue/credits, '+(powerMode?'power restored':'factory rebuilt')+' and resumed tank production');
 }catch(e){if(page)await page.screenshot({path:path.resolve(__dirname,'../art/out/recovery-failure.png')}).catch(()=>{});throw e;}
 finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
