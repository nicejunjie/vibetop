#!/usr/bin/env node
'use strict';
// Real production/placement/selection/orders, live clock, normal resources/AI.
// Hooks only inspect state and move the review camera. No spawn/give/step calls.
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const server=await serve();let browser,page,timer;const history=[],errors=[];
 const out=path.resolve(__dirname,'../art/out'),expansion=process.argv.includes('--expansion'),combined=process.argv.includes('--combined');
 const landing=process.argv.includes('--landing'),naval=process.argv.includes('--naval')||landing;
 const faction=process.argv.includes('--soviet')?'col':'dir';
 const advanced=process.argv.includes('--advanced');
 const difficulty=(process.argv.find(a=>a.startsWith('--difficulty='))||'--difficulty=normal').slice(13);
 const tag=(process.argv.find(a=>a.startsWith('--tag='))||'').slice(6).replace(/[^a-z0-9-]/gi,'');
 const prefix=(tag?tag+'-':'')+(faction==='col'?'soviet-':'')+(expansion?'expansion':combined?'combined':landing?'landing':naval?'naval':'match');
 const reportPrefix=(tag?tag+'-':'')+(faction==='col'?'soviet-':'')+(combined?'combined-':landing?'landing-':naval?'naval-':'');
 try{
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(({faction,naval,difficulty})=>{
   localStorage.setItem('vibetop:rts:map',naval?'coastal':'gems');localStorage.setItem('vibetop:rts:fac',faction);
   localStorage.setItem('vibetop:rts:diff',difficulty);
   localStorage.setItem('vibetop:rts:opts',JSON.stringify({speed:6}));
  },{faction,naval,difficulty});
  await page.goto(server.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  await page.locator('.card button').filter({hasText:'Start Game'}).first().click();
  await page.waitForFunction(()=>window.__rtsTest.opts()!==null);
  const resumeFile=(process.argv.find(a=>a.startsWith('--resume='))||'').slice(9);
  if(resumeFile)await page.evaluate(blob=>window.__rtsTest.loadBlob(blob),JSON.parse(fs.readFileSync(resumeFile,'utf8')));
  const snapshot=()=>page.evaluate(()=>{
   const g=window.__rtsTest.world();
   return {seed:g.seed,map:g.mapId,faction:g.side[0].fac,difficulty:g.diff,speed:g.opt.speed,tick:g.tick,over:g.over,credits:g.side[0].credits,
    own:g.units.filter(u=>u.p===0&&!u.dead).map(u=>({id:u.id,k:u.type,x:+u.x.toFixed(1),y:+u.y.toFixed(1),s:u.state,cargo:u.cargo,order:u.order?.t,stuck:u.stuck})),
    buildings:g.blds.filter(b=>b.p===0&&!b.dead).map(b=>b.type),
    enemyUnits:g.units.filter(u=>u.p===1&&!u.dead).length,enemyBuildings:g.blds.filter(b=>b.p===1&&!b.dead).length};
  });
  async function record(label){const s=await snapshot();history.push({label,...s});console.log(label,JSON.stringify(s));return s;}
  timer=setInterval(()=>record('progress').catch(()=>{}),30000);
  async function shot(label){await page.locator('#cv').screenshot({path:path.join(out,prefix+'-'+label+'.png')});}
  const point=async(x,y,dy=0)=>page.evaluate(([x,y,dy])=>{
   const p=window.__rtsTest.toScreen(x,y),r=document.getElementById('cv').getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top+dy};
  },[x,y,dy]);
  const button=name=>page.locator('#plist button.pit').filter({has:page.locator('.nm',{hasText:new RegExp('^'+name+'$')})});
  async function build(key,name){
   const lane=await page.evaluate(k=>window.__rtsTables.BLDS[k].cat==='def'?'d':'b',key);
   name=await page.evaluate(k=>{const H=window.__rtsTest;return H.api.bspecFor(k,H.world().side[0].fac).name;},key);
   await page.keyboard.press(lane==='d'?'w':'q');await button(name).click();
   await page.waitForFunction(({key,lane})=>{const g=window.__rtsTest.world();return g.over||g.side[0].queues[lane].ready===key;},{key,lane},{timeout:180000});
   if((await snapshot()).over)throw Error('Match ended during construction');
   await button(name).click();
   const site=await page.evaluate(key=>{
    const H=window.__rtsTest,g=H.world(),d=H.api.bspecFor(key,g.side[0].fac),sites=[];
    for(let y=3;y<25;y++)for(let x=3;x<25;x++)if(H.api.canPlace(g,0,key,x,y)){
     // Keep an apron between buildings. Prefer the front of the base, but
     // avoid placing the refinery farther from its opening resource fields.
     let score=Math.hypot(x-12,y-14);
     for(const b of g.blds.filter(b=>b.p===0&&!b.dead)){
      const bd=H.api.bspecFor(b.type,g.side[b.p].fac);
      const gap=Math.max(x-(b.x+bd.gw),b.x-(x+d.gw),y-(b.y+bd.gh),b.y-(y+d.gh));
      if(gap<2)score+=12;
     }
     sites.push({x,y,score,cx:x+Math.floor((d.gw-1)/2),cy:y+Math.floor((d.gh-1)/2)});
    }
    sites.sort((a,b)=>a.score-b.score);if(!sites.length)throw Error('No build site '+key);
    H.centerOn(12,13);H.zoom(.85);return sites[0];
   },key);
   const p=await point(site.cx,site.cy);await page.mouse.move(p.x,p.y);
   await page.waitForFunction(()=>window.__rtsTest.cursorKind()==='deploy',{},{timeout:3000});
   await page.mouse.click(p.x,p.y);
   await page.waitForFunction(({key,lane})=>window.__rtsTest.world().side[0].queues[lane].ready!==key,{key,lane},{timeout:3000});
   await record('placed '+key);await shot(key);
  }
  await record(resumeFile?'resumed saved campaign':'opening');
  if(advanced){
   await require('./lib/advanced-match-review')({page,point,button,record,shot,faction,out,prefix});
   fs.writeFileSync(path.join(out,reportPrefix+'full-match-final-save.json'),JSON.stringify(await page.evaluate(()=>window.__rtsTest.saveBlob())));
   if(errors.length)throw Error(errors.join('\n'));
   return;
  }
  if(!resumeFile){
  await build('power','Power Plant');await build('refinery','Refinery');
  await build('barracks','Barracks');
  if(expansion){
   await require('./lib/expansion-review')({page,point,button,record,shot});
   if(errors.length)throw Error(errors.join('\n'));
   return;
  }
  await build(naval?'shipyard':'factory');
  }
  if(landing)await require('./lib/amphibious-review')({page,point,button,build,record,shot,resume:!!resumeFile});
  const tankType=naval?(faction==='col'?'sub':'destroyer'):(faction==='col'?'rhino':'lancer');
  const tankName=await page.evaluate(k=>window.__rtsTables.UNITS[k].name,tankType);
  // Start the first factory immediately. Infrastructure construction must not
  // leave an expensive working production lane idle for several game minutes.
  await page.keyboard.press('r');
  for(let i=0;i<12;i++)await button(tankName).click();
  if(combined){
   await page.keyboard.press('e');
   const names=await page.evaluate(f=>[f==='col'?'conscript':'rifle',f==='col'?'flak':'rocket'].map(k=>window.__rtsTables.UNITS[k].name),faction);
   for(const name of names)for(let i=0;i<6;i++)await button(name).click();
   await build('power');await build(faction==='col'?'sentrygun':'sentry');
   await build(faction==='col'?'flakcannon':'patriot');
   // Now expand capacity while the first factory's already queued tanks keep
   // building. A full bank and one working factory is a strategy bottleneck.
   await build('factory');await build('barracks');
  }
  await page.keyboard.press('r');
  let wave=0,lastOrder=-99999;
  for(let pass=0;pass<180;pass++){
   const s=await snapshot();if(s.over){
    // The sim declares the result before the three-second celebration and
    // score card. Keep the browser alive through the actual end screen.
    await page.waitForFunction(()=>window.__rts().state==='over',null,{timeout:10000});
    await page.evaluate(()=>{const H=window.__rtsTest,s=H.world().start[0];H.centerOn(s.x,s.y);H.render();});
    await record('finished');await page.screenshot({path:path.join(out,prefix+'-finished.png')});break;
   }
   if(pass%6===0){
    const front=s.own.find(u=>u.k===tankType&&u.x>24)||s.own.find(u=>u.k===tankType);
    if(front)await page.evaluate(u=>window.__rtsTest.centerOn(u.x,u.y),front);
    await shot('combat-'+s.tick);
   }
   if(combined&&pass%3===0){
    const damaged=await page.evaluate(()=>window.__rtsTest.world().blds.filter(b=>b.p===0&&!b.dead&&!b.repair&&b.hp<b.maxhp*.85).map(b=>({x:b.cx,y:b.cy})));
    for(const b of damaged){
     await page.evaluate(b=>window.__rtsTest.centerOn(b.x,b.y),b);
     await page.keyboard.press('k');const p=await point(b.x,b.y);await page.mouse.click(p.x,p.y);await page.keyboard.press('Escape');
    }
    const iq=await page.evaluate(()=>window.__rtsTest.world().side[0].queues.i.list.length);
    if(iq<3&&s.credits>2000&&s.buildings.includes('barracks')){
     await page.keyboard.press('e');
     const name=await page.evaluate(f=>window.__rtsTables.UNITS[f==='col'?'flak':'rocket'].name,faction);
     for(let i=0;i<3;i++)await button(name).click();
    }
   }
   const tanks=s.own.filter(u=>u.k===tankType);
   if(tanks.length>=5&&s.tick-lastOrder>3600){
    const leader=tanks.find(u=>u.x<25&&u.y<25)||tanks[0];
    await page.evaluate(u=>{window.__rtsTest.centerOn(u.x,u.y);window.__rtsTest.zoom(.75);},leader);
    const p=await point(leader.x,leader.y,-8);await page.mouse.click(p.x,p.y);await page.keyboard.press('t');
    const selected=await page.evaluate(k=>window.__rtsTest.selected().filter(u=>u.type===k).length,tankType);
    if(selected){
     await page.locator('[data-cmd="amove"]').click();
     const target=naval?(wave++===0?{x:25,y:25}:{x:46,y:46}):(wave++===0?{x:31,y:32}:{x:53,y:51});
     await page.evaluate(p=>window.__rtsTest.centerOn(p.x,p.y),target);
     const dst=await point(target.x,target.y);await page.mouse.click(dst.x,dst.y);
     if(combined){
      // Give each complementary infantry group the same attack destination
      // through normal selection and orders; do not merely build them at home.
      for(const type of [faction==='col'?'conscript':'rifle',faction==='col'?'flak':'rocket']){
       const man=await page.evaluate(k=>window.__rtsTest.world().units.find(u=>u.p===0&&!u.dead&&u.type===k),type);
       if(!man)continue;
       await page.evaluate(u=>window.__rtsTest.centerOn(u.x,u.y),man);
       const mp=await point(man.x,man.y,-5);await page.mouse.click(mp.x,mp.y);await page.keyboard.press('t');
       if(!(await page.evaluate(k=>window.__rtsTest.selected().some(u=>u.type===k),type)))throw Error('Could not select supporting '+type);
       await page.locator('[data-cmd="amove"]').click();
       await page.evaluate(p=>window.__rtsTest.centerOn(p.x,p.y),target);
       const dp=await point(target.x,target.y);await page.mouse.click(dp.x,dp.y);
      }
     }
     lastOrder=s.tick;await record('attack wave '+wave);await shot('wave-'+wave);
    }
   }
   // Replenish through the sidebar, without changing credits or production.
   const queue=await page.evaluate(lane=>window.__rtsTest.world().side[0].queues[lane].list.length,naval?'n':'v');
   if(queue<3&&s.credits>1000&&s.buildings.includes(naval?'shipyard':'factory')){
    await page.keyboard.press('r');for(let i=0;i<3;i++)await button(tankName).click();
   }
   await page.waitForTimeout(5000);
  }
  const end=await record('final');
  fs.writeFileSync(path.join(out,reportPrefix+'full-match-final-save.json'),JSON.stringify(await page.evaluate(()=>window.__rtsTest.saveBlob())));
  if(!end.over)throw Error('Match did not reach a terminal result within review window');
  if(errors.length)throw Error(errors.join('\n'));
 }catch(e){if(page){
   await page.locator('#cv').screenshot({path:path.join(out,prefix+'-failure.png')}).catch(()=>{});
   const blob=await page.evaluate(()=>window.__rtsTest.saveBlob()).catch(()=>null);
   if(blob)fs.writeFileSync(path.join(out,reportPrefix+'failure-save.json'),JSON.stringify(blob));
  }throw e;}
 finally{
  clearInterval(timer);fs.writeFileSync(path.join(out,reportPrefix+(expansion?'expansion-review.json':'full-match-review.json')),JSON.stringify({history,errors},null,2));
  if(browser)await browser.close();server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
