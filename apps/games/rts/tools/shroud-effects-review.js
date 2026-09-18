#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {serve}=require('./lib/serve-rts');
const {chromium}=require('../../../../tests/e2e/node_modules/playwright');
(async()=>{
 const server=await serve();let browser;
 const before=process.argv.includes('--before'),tag=before?'before':'after';
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  await page.keyboard.press('p');
  const result=await page.evaluate(()=>{
   const H=window.__rtsTest,g=H.world(),cv=document.getElementById('cv'),ctx=cv.getContext('2d');
   g.units.length=0;g.blds.length=0;g.fx.length=0;g.shots.length=0;g.wrecks.length=0;
   g.crates.length=0;g.drops.length=0;g.bombs.length=0;g.occ.fill(0);g.seen.fill(0);
   g.terrain.fill(window.__rtsTables.TER.GROUND);g.ore.fill(0);g.hf.fill(0);g.hiAny=false;
   H.centerOn(32,32);H.zoom(1);
   const pixels=()=>{H.render();return ctx.getImageData(0,0,cv.width,cv.height).data;};
   function delta(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;}
   const cases={explosion:{fx:[{x:32,y:32,t:5,life:30,size:45}]},
    smoke:{fx:[{x:32,y:32,t:5,life:30,smoke:true}]},
    debris:{fx:[{x:32,y:32,t:5,life:30,deb:true,vx:1,vy:1,vz:3,spin:0.1,dw:8}]},
    crate:{fx:[{x:32,y:32,t:5,life:30,crateFx:true,glyph:'$'}]},
    shell:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,shell:true}]},
    rocket:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,rocket:true}]},
    beam:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,beam:true}]},
    tesla:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,tesla:true}]},
    link:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,link:true}]},
    v3:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,v3:true}]},
    bomb:{shots:[{x:30,y:32,tx:34,ty:32,t:5,life:20,id:1,bomb:true}]},
    flak:{shots:[{x:30,y:32,tx:34,ty:32,t:15,life:20,id:1,flak:true}]},
    parachute:{drops:[{p:1,men:[{x:32,y:32,fall:30,sway:0}]}]},
    wreck:{wrecks:[{type:'harrier',p:1,x:32,y:32,t:5,life:60,face:0,spin:0.1,alt0:40,vx:0,vy:0}]},
    ping:{fx:[{x:32,y:32,t:5,life:30,ping:true}]}};
   const results=[];
   const board=document.createElement('canvas');board.width=1920;board.height=1120;
   const bc=board.getContext('2d');bc.fillStyle='#111820';bc.fillRect(0,0,board.width,board.height);
   let tile=0;
   for(const seen of [0,1]){
    g.seen.fill(seen);g.fx=[];g.shots=[];g.wrecks=[];g.drops=[];const base=pixels();
    for(const [name,c] of Object.entries(cases)){
     g.fx=c.fx||[];g.shots=c.shots||[];g.wrecks=c.wrecks||[];g.drops=c.drops||[];
     results.push({name,seen,changed:delta(base,pixels())});
     const bx=(tile%6)*320,by=Math.floor(tile/6)*224,p=H.toScreen(32,32);tile++;
     bc.drawImage(cv,p.x-160,p.y-150,320,200,bx,by+24,320,200);
     bc.fillStyle='#f4f5f7';bc.font='14px sans-serif';bc.fillText(name+' / '+(seen?'explored':'unexplored'),bx+8,by+17);
    }
   }
   window.__shroudBoard=board.toDataURL();
   for(const [name,kind,hiddenX,expected] of [
    ['beam hidden middle','beam',32,0],['beam hidden origin','beam',30,0],
    ['rocket hidden head','rocket',31,0],['rocket visible head','rocket',30,1]
   ]){
    g.seen.fill(1);g.seen[32*64+hiddenX]=0;g.fx=[];g.shots=[];g.wrecks=[];g.drops=[];
    const base=pixels();g.shots=cases[kind].shots;
    results.push({name,seen:expected,changed:delta(base,pixels())});
   }
   g.seen.fill(0);g.fx=[...cases.explosion.fx,...cases.smoke.fx,...cases.crate.fx];
   g.shots=cases.rocket.shots;g.wrecks=cases.wreck.wrecks;H.render();
   return results;
  });
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/shroud-effects-'+tag+'.png')});
  const board=await page.evaluate(()=>window.__shroudBoard);
  fs.writeFileSync(path.resolve(__dirname,'../art/out/shroud-effects-board-'+tag+'.png'),Buffer.from(board.split(',')[1],'base64'));
  await page.evaluate(()=>{const H=window.__rtsTest;H.world().seen.fill(1);H.render();});
  await page.locator('#cv').screenshot({path:path.resolve(__dirname,'../art/out/shroud-effects-visible-'+tag+'.png')});
  console.log(JSON.stringify(result,null,2));
  if(!before)for(const r of result){
   if(!r.seen&&r.name!=='ping')assert.equal(r.changed,0,r.name+' leaks into unexplored ground');
   else assert.ok(r.changed>0,r.name+' should remain visible');
  }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
