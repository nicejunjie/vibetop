#!/usr/bin/env node
'use strict';
// Stage forces, then use actual mouse selection/move orders and the live clock.
// This is a route probe, not a full-match balance verdict.
const path=require('node:path'),assert=require('node:assert/strict');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>localStorage.setItem('vibetop:rts:map','gems'));
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  await page.waitForFunction(()=>window.__rtsTest.opts()!==null);
  await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world();
   if(g.mapId!=='gems')throw Error('Wrong map');
   g.ai=null;g.ai2=null;g.units.length=0;g.seen.fill(1);
   H.centerOn(31.5,31.5);H.zoom(.75);
  });
  const at=async(x,y,dy=0)=>page.evaluate(([x,y,dy])=>{
   const p=window.__rtsTest.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();
   return {x:p.x+r.left,y:p.y+r.top+dy};
  },[x,y,dy]);
  for(const [name,x] of [['summit',31],['west',19],['east',44]]){
   const ids=await page.evaluate(x=>{
    const H=window.__rtsTest;
    H.centerOn(x,33.5);
    return [[0,0],[1,0],[0,-1],[1,-1]].map(([dx,dy])=>H.spawn('lancer',0,x+dx,19+dy).id);
   },x);
   const ps=await Promise.all([[x,18],[x+1,18],[x,19],[x+1,19]].map(([a,b])=>at(a,b)));
   const minX=Math.min(...ps.map(p=>p.x))-22,maxX=Math.max(...ps.map(p=>p.x))+22;
   const minY=Math.min(...ps.map(p=>p.y))-25,maxY=Math.max(...ps.map(p=>p.y))+12;
   await page.mouse.move(minX,minY);await page.mouse.down();
   await page.mouse.move(maxX,maxY,{steps:8});await page.mouse.up();
   const selected=await page.evaluate(()=>window.__rtsTest.selected().map(u=>u.id));
   assert.ok(ids.every(id=>selected.includes(id)),name+' selected all four tanks');
   // Aim beyond the exit: formation slots may legitimately stop a few cells
   // short of the clicked centre. Do not confuse that with a blocked ramp.
   await page.evaluate(()=>{window.__routeProbe={crossed:{}};});
   const dst=await at(x,47);
   assert.ok(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)===document.getElementById('cv'),dst),name+' destination is on the game canvas');
   await page.mouse.click(dst.x,dst.y);
   await page.waitForFunction(ids=>window.__rtsTest.world().units.filter(u=>ids.includes(u.id)).every(u=>u.order||u.y>20),ids,{timeout:3000});
   await page.waitForFunction(({ids,x,name})=>{
    const us=window.__rtsTest.world().units.filter(u=>ids.includes(u.id));
    for(const u of us)if(u.y>27&&u.y<37){
     if(Math.abs(u.x-x)>2.5)throw Error(name+' detoured away from its route');
     window.__routeProbe.crossed[u.id]=true;
    }
    return us.length===4&&us.every(u=>u.y>43&&window.__routeProbe.crossed[u.id]);
   },{ids,x,name},{timeout:Number(process.env.ROUTE_TIMEOUT_MS)||60000}).catch(async e=>{
    console.log(await page.evaluate(ids=>({view:window.__rts(),units:window.__rtsTest.world().units.filter(u=>ids.includes(u.id)).map(u=>({id:u.id,x:u.x,y:u.y,order:u.order,path:u.path,stuck:u.stuck}))}),ids));
    await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/gem-valley-route-failure.png')});
    throw e;
   });
   const positions=await page.evaluate(ids=>window.__rtsTest.world().units.filter(u=>ids.includes(u.id)).map(u=>({x:u.x,y:u.y})),ids);
   console.log(name+': all four tanks crossed via mouse orders',JSON.stringify(positions));
  }
  await page.evaluate(()=>{window.__rtsTest.centerOn(31.5,31.5);window.__rtsTest.render();});
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/gem-valley-route-probe.png')});
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
