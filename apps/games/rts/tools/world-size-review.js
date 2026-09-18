#!/usr/bin/env node
'use strict';
// Real renderer, fixed seed and zoom. Never fits individual objects to cells.
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const srv=await serve();let browser;
 try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(srv.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  const shots=await page.evaluate(()=>{
   const H=window.__rtsTest,out={};
   document.querySelectorAll('.show').forEach(e=>e.classList.remove('show'));
   document.body.classList.remove('atmenu');
   for(const map of ['frontier','lake','tundra','choke','river','coastal','gems']){
    const g=H.startWith(4242,'normal',map,{});g.seen.fill(1);
    H.centerOn(31.5,31.5);H.zoom(.75);H.render();
    out[map]=document.querySelector('canvas').toDataURL().split(',')[1];
   }
   for(const fac of ['dir','col']){
    const sea=H.startWith(4242,'normal','coastal',{});sea.seen.fill(1);sea.side[0].fac=fac;
    const yard=H.build('shipyard',0,22,22);if(yard)yard.make=0;
    sea.side[0].powerMade=10000;sea.side[0].powerUse=0;
    const fleet=fac==='dir'?['destroyer','aegis','carrier','dolphin','lcraft']:['sub','seascorp','dread','squid','apc'];
    fleet.forEach((k,i)=>{const u=H.spawn(k,0,27+i*1.8,21-i*.8);if(u){u.face=0;u.tface=0;u.stopped=true;}});
    H.centerOn(26,22);H.zoom(1);H.render();
    out['fleet-'+fac]=document.querySelector('canvas').toDataURL().split(',')[1];
    const g=H.startWith(4242,'normal','frontier',{});g.seen.fill(1);g.side[0].fac=fac;
    // Controlled base yard: retain the real renderer, footprints and anchors.
    g.units.length=0;g.blds.length=0;g.terrain.fill(0);g.ore.fill(0);g.occ.fill(0);
    for(const [k,x,y] of [['base',23,23],['factory',30,23],['barracks',22,30],['power',28,30],['refinery',35,28]]){
     const b=H.build(k,0,x,y);if(b)b.make=0;
    }
    g.side[0].powerMade=10000;g.side[0].powerUse=0;
    const keys=fac==='dir'?['rifle','ifv','lancer','mirage','chronominer','mcv','harrier','nighthawk']:['conscript','flaktrack','rhino','mammoth','warminer','mcv','teslatank','kirov'];
    keys.forEach((k,i)=>{const u=H.spawn(k,0,24+i*1.6,36-i*.2);if(u){u.face=12;u.tface=12;u.stopped=true;}});
    H.centerOn(29,29);H.zoom(1);H.render();
    out['base-'+fac]=document.querySelector('canvas').toDataURL().split(',')[1];
   }
   return out;
  });
  if(errors.length)throw Error(errors.join('\n'));
  const tag=(process.argv[2]||'current').replace(/[^a-z0-9_-]/gi,'');
  fs.mkdirSync(path.resolve(__dirname,'../art/out'),{recursive:true});
  for(const [name,png] of Object.entries(shots))fs.writeFileSync(path.resolve(__dirname,'../art/out/world-'+tag+'-'+name+'.png'),Buffer.from(png,'base64'));
  console.log('Rendered '+Object.keys(shots).join(', '));
 }finally{if(browser)await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
