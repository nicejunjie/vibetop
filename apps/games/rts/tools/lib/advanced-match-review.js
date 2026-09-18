'use strict';
// A live-input strategy review, not an omniscient game-playing API.
// World reads measure outcomes; actions use sidebar, keyboard and map clicks.
const fs=require('node:fs'),path=require('node:path');
module.exports=async function({page,point,button,record,shot,faction,out,prefix}){
 const stateFile=(process.argv.find(a=>a.startsWith('--strategy-state='))||'').slice(17);
 const saved=stateFile?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
 const sov=faction==='col',events=saved.events||[],samples=saved.samples||[],airHistory=saved.airHistory||{},assigned=new Set(saved.assigned||[]);
 let stage=0,lastArmy=-9999,lastAir=-9999,lastCapture=-9999,lastSave=0,lastSample=-9999;
 const plan=['power','refinery','barracks','factory',sov?'radar':'airforce','power','lab',
  sov?'reactor':'power','factory','refinery','factory',...(sov?[]:['power','airforce']),
  'factory',...(sov?['cloningvats']:['power','spysat']),'refinery'];
 const defPlan=[sov?'sentrygun':'sentry',sov?'tesla':'grandcannon',sov?'flakcannon':'patriot',sov?'tesla':'prism',sov?'curtain':'weather',sov?'nuke':'chrono'];
 let defStage=saved.defStage||0;stage=saved.stage||0;
 const reviewState=()=>({stage,defStage,events,samples,airHistory,assigned:[...assigned]});
 async function event(label,data={}){events.push({tick:(await read()).tick,label,...data});console.log('advanced',label,JSON.stringify(data));await record(label);}
 async function read(){return page.evaluate(()=>{
  const H=window.__rtsTest,g=H.world(),s=g.side[0],T=window.__rtsTables;
  return{tick:g.tick,over:g.over,credits:s.credits,power:s.powerMade-s.powerUse,harv:s.harv,made:s.made,sw:s.sw,
   q:JSON.parse(JSON.stringify(s.queues)),
   units:g.units.filter(u=>!u.dead&&u.p===0).map(u=>({id:u.id,type:u.type,x:u.x,y:u.y,hp:u.hp,state:u.state,landed:u.landed,ammo:u.ammo,order:u.order,cargo:u.cargo,mineAt:u.mineAt,air:u.air})),
   blds:g.blds.filter(b=>!b.dead&&b.p===0).map(b=>({id:b.id,type:b.type,x:b.x,y:b.y,cx:b.cx,cy:b.cy,hp:b.hp,maxhp:b.maxhp,repair:b.repair,fac:b.fac})),
   enemies:g.units.filter(u=>!u.dead&&u.p===1&&g.seen[Math.round(u.y)*64+Math.round(u.x)]).map(u=>({id:u.id,type:u.type,x:u.x,y:u.y,air:u.air})),
   targets:g.blds.filter(b=>!b.dead&&b.p!==0&&g.seen[b.y*64+b.x]).map(b=>({id:b.id,type:b.type,p:b.p,x:b.x,y:b.y,cx:b.cx,cy:b.cy,hp:b.hp})),
   buildable:Object.keys(T.BLDS).filter(k=>H.api.canBuild(g,0,k,true)),
   trainable:Object.keys(T.UNITS).filter(k=>H.api.canBuild(g,0,k,false))};
 });}
 async function click(x,y,dy=0){await page.evaluate(([x,y])=>{const H=window.__rtsTest;H.centerOn(x,y);H.zoom(.85);},[x,y]);const p=await point(x,y,dy);await page.mouse.click(p.x,p.y);}
 async function clear(){const r=await page.locator('#cv').boundingBox();await page.locator('#cv').click({position:{x:r.width*.5,y:r.height*.8},button:'right',timeout:3000});}
 async function select(u){
  await clear();await click(u.x,u.y,u.air?-35:-6);
  if(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),u.id))return true;
  // N is the game's own next-object command, also works for airborne units.
  const count=(await read()).units.length;
  for(let i=0;i<count+1;i++){await page.keyboard.press('n');if(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),u.id))return true;}
  return false;
 }
 async function train(k,n=1){
  const spec=await page.evaluate(k=>window.__rtsTables.UNITS[k],k);await page.keyboard.press(spec.cls==='i'?'e':'r');
  for(let i=0;i<n;i++)await button(spec.name).click({timeout:3000});
 }
 async function start(k){
  const sp=await page.evaluate(k=>{const H=window.__rtsTest;return H.api.bspecFor(k,H.world().side[0].fac);},k);
  await page.keyboard.press(sp.cat==='def'?'w':'q');await button(sp.name).click({timeout:3000});
 }
 async function place(k){
  const site=await page.evaluate(k=>{
   const H=window.__rtsTest,g=H.world(),d=H.api.bspecFor(k,g.side[0].fac),bs=g.blds.filter(b=>b.p===0&&!b.dead);
   const ref=bs.filter(b=>b.type==='refinery').length,combat=!!d.dmg;
   const aim=k==='refinery'&&ref>0?{x:25,y:21}:combat?{x:21,y:20}:{x:13,y:13};
   const sites=[];
   for(let y=3;y<37;y++)for(let x=3;x<37;x++)if(H.api.canPlace(g,0,k,x,y)){
    if(g.units.some(u=>!u.dead&&!u.air&&u.x>x-2&&u.x<x+d.gw+1&&u.y>y-2&&u.y<y+d.gh+1))continue;
    let score=Math.hypot(x-aim.x,y-aim.y);
    for(const b of bs){const gap=Math.max(x-(b.x+b.gw),b.x-(x+d.gw),y-(b.y+b.gh),b.y-(y+d.gh));if(gap<1)score+=5;}
    // Don't pave resource patches or close the summit entrance.
    for(let yy=y;yy<y+d.gh;yy++)for(let xx=x;xx<x+d.gw;xx++)if(g.ore[yy*64+xx]>0)score+=20;
    if(x>27&&y>25)score+=30;
    sites.push({x:x+Math.floor((d.gw-1)/2),y:y+Math.floor((d.gh-1)/2),score});
   }
   return sites.sort((a,b)=>a.score-b.score)[0];
  },k);
  if(!site)return false;
  await start(k);await click(site.x,site.y);
  try{await page.waitForFunction(k=>{const g=window.__rtsTest.world();return g.side[0].queues[window.__rtsTables.BLDS[k].cat==='def'?'d':'b'].ready!==k;},k,{timeout:3000});}
  catch(e){
   const diagnostic=await page.evaluate(()=>({ui:window.__rts(),hover:window.__rtsTest.hover(),cursor:window.__rtsTest.cursorKind()}));
   await clear();await event('placement retry',{key:k,site,diagnostic});return false;
  }
  await event('built '+k,site);await shot('built-'+k+'-'+(await read()).tick);return true;
 }
 async function groupOrder(type,target,attack=true){
  const s=await read(),u=s.units.find(u=>u.type===type);if(!u||!await select(u))return;
  await page.keyboard.press('t');
  // T selects the visible same-type group, not every unit across the map.
  if(attack)await page.locator('[data-cmd="amove"]').click();
  await click(target.x,target.y);
 }
 const deadline=Date.now()+40*60*1000;
 try{
 while(Date.now()<deadline){
  let s=await read();if(s.over)break;
  if(s.tick-lastSample>=1800){
   samples.push({tick:s.tick,credits:Math.round(s.credits),power:s.power,harv:s.harv,made:s.made,units:s.units.length,blds:s.blds.map(b=>b.type),queues:s.q,sw:s.sw});lastSample=s.tick;
   fs.writeFileSync(path.join(out,prefix+'-advanced-progress.json'),JSON.stringify({events,samples},null,2));
   await shot('strategy-'+s.tick);
  }
  if(s.tick-lastSave>3600){fs.writeFileSync(path.join(out,prefix+'-checkpoint.json'),JSON.stringify(await page.evaluate(()=>window.__rtsTest.saveBlob())));fs.writeFileSync(path.join(out,prefix+'-strategy-state.json'),JSON.stringify(reviewState()));lastSave=s.tick;}
  for(const lane of ['b','d'])if(s.q[lane].ready)await place(s.q[lane].ready);
  s=await read();
  const count=k=>s.blds.filter(b=>b.type===k).length;
  if(!s.q.b.list.length&&!s.q.b.ready){
   let k;
   if(s.power<100&&count('power')&&s.buildable.includes(sov&&count('lab')?'reactor':'power'))k=sov&&count('lab')?'reactor':'power';
   else if(stage<plan.length)k=plan[stage];
   else if(count('factory')<6&&s.credits>5000)k='factory';
   if(k&&s.buildable.includes(k)){await start(k);if(k===plan[stage])stage++;}
  }
  if(!s.q.d.list.length&&!s.q.d.ready){
   const k=defPlan[defStage];if(k&&s.buildable.includes(k)&&s.credits>1500){await start(k);defStage++;}
  }
  // Short queues adapt as technology unlocks; no queue of obsolete tanks
  // blocks siege production for several minutes.
  if(s.q.v.list.length<2){
   const siege=sov?'v3':'prismtank',tank=sov?'rhino':'lancer',aa=sov?'flaktrack':'ifv';
   const n=k=>s.units.filter(u=>u.type===k).length;
   const miner=sov?'warminer':'chronominer';
   let k=n(miner)<3&&s.trainable.includes(miner)?miner:n(aa)<3?aa:n(siege)<Math.max(5,n(tank)/2)&&s.trainable.includes(siege)?siege:tank;
   if(!s.trainable.includes(k))k=tank;
   if(s.trainable.includes(k))await train(k,2);
  }
  if(s.q.i.list.length<2&&s.credits>1200){
   const inf=sov?'conscript':'rocket';
   const k=s.units.filter(u=>u.type==='engineer').length<2&&count('factory')?'engineer':inf;
   if(s.trainable.includes(k)&&(k==='engineer'||s.units.filter(u=>u.type===inf).length<18))await train(k,2);
  }
  if(!sov&&s.q.a&&!s.q.a.list.length&&s.trainable.includes('harrier')&&s.credits>1200)await train('harrier');
  // Repair is a real continuing expense, not a fixture heal.
  for(const b of s.blds.filter(b=>!b.repair&&b.hp<b.maxhp*.8)){
   await clear();await page.keyboard.press('k');await click(b.cx,b.cy);await clear();
  }
  // Move a miner to an independently scouted expansion seam, preserving the
  // game's own harvesting/unloading cycle rather than injecting income.
  if(count('refinery')>=2){
   const u=s.units.find(u=>/miner/.test(u.type)&&!assigned.has(u.id)&&u.cargo<10);
   if(u&&assigned.size<2&&await select(u)){
    const ore=await page.evaluate(()=>{const g=window.__rtsTest.world(),a=[];for(let y=17;y<34;y++)for(let x=18;x<33;x++)if(g.seen[y*64+x]&&g.ore[y*64+x]>0)a.push({x,y,v:g.ore[y*64+x],d:Math.hypot(x-27,y-25)});return a.sort((a,b)=>a.d-b.d)[0];});
    if(ore){await click(ore.x,ore.y);assigned.add(u.id);await event('expansion mining ordered',{id:u.id,...ore});}
   }
  }
  // Air sorties choose spotted targets outside the enemy base AA envelope.
  for(const u of s.units.filter(u=>u.type==='harrier')){
   const prev=airHistory[u.id]||{ammo:u.ammo,shots:0,reloads:0};
   if(u.ammo<prev.ammo)prev.shots+=prev.ammo-u.ammo;
   if(u.ammo>prev.ammo&&prev.shots)prev.reloads++;
   prev.ammo=u.ammo;prev.state=u.state;airHistory[u.id]=prev;
  }
  if(!sov&&s.tick-lastAir>900){
   const target=s.enemies.find(u=>!u.air&&u.x<38&&u.y<38);
   const u=s.units.find(u=>u.type==='harrier'&&u.ammo>0&&u.landed);
   if(target&&u&&await select(u)){await page.keyboard.press('t');await click(target.x,target.y,-5);lastAir=s.tick;await event('air sortie',{target:target.id});}
  }
  // Defend the approach until a meaningful mixed force and charged strategic
  // weapon exist. Then advance in stages rather than feed five tanks to coils.
  const fired=Object.values(s.sw).some(w=>w.fired>0),army=s.units.filter(u=>['lancer','rhino','prismtank','v3','mammoth'].includes(u.type));
  if(s.tick-lastArmy>1800){
   const threat=s.enemies.find(u=>!u.air&&u.x<27&&u.y<27);
   const objective=s.targets.filter(b=>b.p===1).sort((a,b)=>Math.hypot(a.cx-32,a.cy-32)-Math.hypot(b.cx-32,b.cy-32))[0];
   const target=threat||((fired&&army.length>=12)?(objective?{x:objective.cx,y:objective.cy}:{x:43,y:42}):army.length>=18?{x:30,y:29}:{x:21,y:21});
   for(const type of sov?['rhino','v3','flaktrack','conscript']:['lancer','prismtank','ifv','rocket'])await groupOrder(type,target);
   lastArmy=s.tick;await event('army posture',{target,army:army.length});
  }
  // Capture an oil derrick early, then an exposed enemy producer after scouting.
  if(s.tick-lastCapture>1800){
   const eng=s.units.find(u=>u.type==='engineer'&&!u.order);
   const target=s.targets.find(b=>b.p!==1&&b.type==='oilderrick')||s.targets.find(b=>b.p===1&&['barracks','factory'].includes(b.type));
   if(eng&&target&&await select(eng)){await click(target.cx,target.cy);lastCapture=s.tick;await event('engineer capture ordered',{engineer:eng.id,target});}
  }
  const captured=s.blds.find(b=>b.fac&&b.fac!==faction&&['factory','barracks'].includes(b.type));
  if(captured&&!events.some(e=>e.label==='captured production queued')){
   const k=captured.type==='factory'?(sov?'lancer':'rhino'):(sov?'rifle':'conscript');
   if(s.trainable.includes(k)){await train(k);await event('captured production queued',{building:captured.id,unit:k});}
  }
  for(const [k,w] of Object.entries(s.sw))if(w.ready&&['storm','nuke','curtain'].includes(k)){
   const target=k==='curtain'?army[0]:s.targets.find(b=>b.p===1&&['factory','lab','base'].includes(b.type));
   if(target){
    const title=k==='storm'?'Weather Control Device':k==='nuke'?'Nuclear Missile':'Iron Curtain';
    await clear();await page.locator('#swbar .swic[title="'+title+'"]').click();
    await click(target.cx??target.x,target.cy??target.y);await event('superweapon activated',{key:k,target});await shot('super-'+k);
   }
  }
  await page.waitForTimeout(1500);
 }
 const s=await read();if(!s.over)throw Error('Advanced match did not finish within 40 real minutes');
 await page.waitForFunction(()=>window.__rts().state==='over',null,{timeout:10000});
 await record('advanced finished');await page.screenshot({path:path.join(out,prefix+'-finished.png')});
 }finally{
  fs.writeFileSync(path.join(out,prefix+'-strategy-state.json'),JSON.stringify(reviewState()));
  fs.writeFileSync(path.join(out,prefix+'-advanced-review.json'),JSON.stringify({events,samples,airHistory,final:await read()},null,2));
 }
};
