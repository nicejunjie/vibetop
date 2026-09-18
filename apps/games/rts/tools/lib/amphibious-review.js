'use strict';
// Normal economy, production and UI orders. No spawn, terrain edits, grants,
// pause, damage injection or simulation stepping. The opposing AI stays live.
module.exports=async function({page,point,button,build,record,shot,resume}){
 async function select(id){
  const u=await page.evaluate(id=>{const H=window.__rtsTest,u=H.world().units.find(u=>u.id===id&&!u.dead);if(!u)throw Error('Lost unit '+id);H.centerOn(u.x,u.y);H.zoom(1);return{x:u.x,y:u.y};},id);
  const p=await point(u.x,u.y,-7);await page.mouse.click(p.x,p.y);
  if(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),id))return;
  // At a crowded beach a moving escort can cover the transport's click area.
  // Use the game's next-object key, not a direct selection-state assignment.
  const count=await page.evaluate(()=>{const g=window.__rtsTest.world();return g.units.filter(u=>u.p===0&&!u.dead).length+g.blds.filter(b=>b.p===0&&!b.dead).length;});
  for(let i=0;i<=count;i++){
   await page.keyboard.press('n');
   if(await page.evaluate(id=>window.__rtsTest.selected().some(u=>u.id===id),id))return;
  }
  throw Error('Could not select surviving unit '+id);
 }
 async function click(x,y,dy=0){await page.evaluate(p=>window.__rtsTest.centerOn(p.x,p.y),{x,y});const p=await point(x,y,dy);await page.mouse.click(p.x,p.y);}
 async function sail(boat,p){
  await select(boat);
  // Explicit movement mode prevents an escort crossing the destination pixel
  // from turning a navigation click into a new friendly-unit selection.
  await page.locator('[data-cmd="amove"]').click();await click(p.x,p.y);
 }
 async function queue(type,count,lane){await page.keyboard.press(lane);const name=await page.evaluate(k=>window.__rtsTables.UNITS[k].name,type);for(let i=0;i<count;i++)await button(name).click();}
 async function boardGroup(boat,ids){
  for(const type of ['rifle','rocket']){
   const id=await page.evaluate(({ids,type})=>window.__rtsTest.world().units.find(u=>ids.includes(u.id)&&!u.dead&&u.type===type)?.id,{ids,type});if(!id)continue;
   await select(id);await page.keyboard.press('t');
   const expected=await page.evaluate(id=>{const H=window.__rtsTest,b=H.world().units.find(u=>u.id===id);return Math.min(12,b.pax.length+H.selected().filter(u=>u.kind==='u'&&!u.dead).length);},boat);
   const b=await page.evaluate(id=>{const u=window.__rtsTest.world().units.find(u=>u.id===id);return{x:u.x,y:u.y};},boat);await click(b.x,b.y,-7);
   await page.waitForFunction(({id,n})=>window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead)?.pax?.length===n,{id:boat,n:expected},{timeout:30000});
  }
 }
 let boat;
 const savedBoat=resume?await page.evaluate(()=>window.__rtsTest.world().units.find(u=>u.p===0&&!u.dead&&u.type==='lcraft'&&u.pax.length)?.id):null;
 if(!savedBoat){
 await queue('lcraft',1,'r');await queue('destroyer',5,'r');
 await queue('rifle',6,'e');await queue('rocket',3,'e');
 if(!resume){await build('factory');await queue('lancer',12,'r');await build('power');await build('sentry');}
 await page.waitForFunction(()=>window.__rtsTest.world().units.some(u=>u.p===0&&!u.dead&&u.type==='lcraft'),null,{timeout:120000});
 boat=await page.evaluate(()=>window.__rtsTest.world().units.find(u=>u.p===0&&!u.dead&&u.type==='lcraft').id);
 // Hover transport comes onto our own clear ground: passengers need not walk
 // around a shipyard to reach an arbitrary point at the water's edge.
 const load=await page.evaluate(()=>{
  const H=window.__rtsTest,g=H.world(),T=window.__rtsTables.TER,c=[];
  for(let y=7;y<20;y++)for(let x=7;x<20;x++){
   let clear=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(g.terrain[(y+dy)*64+x+dx]!==T.GROUND||g.occ[(y+dy)*64+x+dx])clear=false;
   if(clear)c.push({x,y,d:Math.hypot(x-13,y-12)});
  }
  c.sort((a,b)=>a.d-b.d);return c[0];
 });
 await select(boat);await click(load.x,load.y);
 await page.waitForFunction(({id,p})=>{const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);if(!u)throw Error('Transport destroyed');return Math.hypot(u.x-p.x,u.y-p.y)<2.2;},{id:boat,p:load},{timeout:45000});
 const ids=await page.evaluate(()=>{const us=window.__rtsTest.world().units.filter(u=>u.p===0&&!u.dead);return us.filter(u=>u.type==='rifle').slice(0,6).concat(us.filter(u=>u.type==='rocket').slice(0,3)).map(u=>u.id);});
 if(ids.length<4)throw Error('Insufficient surviving landing infantry');
 await boardGroup(boat,ids);
 await record('normal-production landing force boarded');await shot('boarding');
 }else{
  boat=savedBoat;
  if(!boat)throw Error('Saved campaign has no loaded transport');
  await page.waitForFunction(id=>!window.__rtsTest.world().units.some(u=>!u.dead&&u.p===0&&u.order?.t==='enter'&&u.order.id===id),boat,{timeout:30000});
  await record('resumed normal-economy campaign with existing cargo');
 }
 // Cross the bay via open water, then touch the central island before the
 // hostile coast. This establishes a genuine sea crossing, not a land detour.
 const alreadyAtIsland=resume&&await page.evaluate(id=>{const g=window.__rtsTest.world(),u=g.units.find(u=>u.id===id);return Math.hypot(u.x-31.5,u.y-31.5)<5.5&&g.terrain[Math.round(u.y)*64+Math.round(u.x)]!==window.__rtsTables.TER.WATER;},boat);
 for(let leg=alreadyAtIsland?2:0;leg<2;leg++){
  const p=leg===0?{x:25,y:25}:await page.evaluate(()=>{
   const g=window.__rtsTest.world(),T=window.__rtsTables.TER,sites=[];
   for(let y=27;y<=36;y++)for(let x=27;x<=36;x++)if(g.seen[y*64+x]&&!g.occ[y*64+x]&&[T.GROUND,T.ORE,T.GEM,T.ROAD].includes(g.terrain[y*64+x]))sites.push({x,y,d:Math.hypot(x-31,y-31)});
   sites.sort((a,b)=>a.d-b.d);if(!sites.length)throw Error('No scouted clear island landing');return sites[0];
  });
  await record('sailing to '+JSON.stringify(p));
  await sail(boat,p);
  await page.waitForFunction(({id,p})=>{const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);if(!u)throw Error('Transport destroyed at sea');return Math.hypot(u.x-p.x,u.y-p.y)<1.5;},{id:boat,p},{timeout:60000});
 }
 await select(boat);await page.keyboard.press('d');
 await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead)?.pax?.length===0,boat,{timeout:10000});
 await record('island landing from normal economy');await shot('island-landed');
 // Passengers become new world entities on unloading; old boarding IDs refer
 // to removed entities. Discover the actual landed force on the island.
 let ids=await page.evaluate(()=>window.__rtsTest.world().units.filter(u=>u.p===0&&!u.dead&&['rifle','rocket'].includes(u.type)&&u.x>25&&u.x<39&&u.y>25&&u.y<39).map(u=>u.id));
 if(ids.length<4)throw Error('Landing did not put the force onto the island');
 // Reboard after a real disembarkation, continue to the enemy side, and order
 // the survivors inland. Landing alone is not the whole campaign check.
 await boardGroup(boat,ids);
 // The transport is not a gunboat. Send the existing escorts to engage the
 // defended harbour, and bring the passengers onto its scouted flank.
 const escort=await page.evaluate(()=>window.__rtsTest.world().units.find(u=>u.p===0&&!u.dead&&u.type==='destroyer')?.id);
 if(escort){await select(escort);await page.keyboard.press('t');await page.locator('[data-cmd="amove"]').click();await click(46,46);await record('escorts attacking hostile harbour');}
 for(const p of [{x:40,y:38},{x:46,y:40}]){
  await sail(boat,p);
  await page.waitForFunction(({id,p})=>{const u=window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead);if(!u)throw Error('Transport destroyed on hostile approach');return Math.hypot(u.x-p.x,u.y-p.y)<2;},{id:boat,p},{timeout:60000});
 }
 const beach=await page.evaluate(()=>{
  const g=window.__rtsTest.world(),T=window.__rtsTables.TER,sites=[];
  for(let y=36;y<49;y++)for(let x=43;x<55;x++)if(g.seen[y*64+x]&&!g.occ[y*64+x]&&[T.GROUND,T.ORE,T.GEM,T.ROAD].includes(g.terrain[y*64+x]))sites.push({x,y,d:Math.hypot(x-50,y-40)});
  sites.sort((a,b)=>a.d-b.d);if(!sites.length)throw Error('No scouted enemy beach');return sites[0];
 });
 await sail(boat,beach);
 await page.waitForFunction(({id,p})=>{const g=window.__rtsTest.world(),u=g.units.find(u=>u.id===id&&!u.dead);if(!u)throw Error('Transport destroyed on beach');return Math.hypot(u.x-p.x,u.y-p.y)<1.5&&g.terrain[Math.round(u.y)*64+Math.round(u.x)]!==window.__rtsTables.TER.WATER;},{id:boat,p:beach},{timeout:30000});
 await page.keyboard.press('d');
 await page.waitForFunction(id=>window.__rtsTest.world().units.find(u=>u.id===id&&!u.dead)?.pax?.length===0,boat,{timeout:10000});
 await record('hostile-coast landing');await shot('enemy-coast');
 ids=await page.evaluate(()=>window.__rtsTest.world().units.filter(u=>u.p===0&&!u.dead&&['rifle','rocket'].includes(u.type)&&u.x>40&&u.y>35).map(u=>u.id));
 if(!ids.length)throw Error('No landing force survived on the enemy coast');
 for(const type of ['rifle','rocket']){
  const id=await page.evaluate(({ids,type})=>window.__rtsTest.world().units.find(u=>ids.includes(u.id)&&u.type===type&&!u.dead)?.id,{ids,type});if(!id)continue;
  await select(id);await page.keyboard.press('t');await page.locator('[data-cmd="amove"]').click();await click(53,51);
 }
 await record('landed infantry ordered inland');await shot('inland-push');
};
