#!/usr/bin/env node
'use strict';
// Fixed-scale roster review. Bounds trim blank margins, never resize an item.
const fs=require('node:fs'),path=require('node:path');
const {serve}=require('./lib/serve-rts');
const {chromium}=require(path.resolve(__dirname,'../../../../tests/e2e/node_modules/playwright'));
(async()=>{
 const srv=await serve();let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage();
  await page.goto(srv.url+'/rts.html');await page.waitForFunction(()=>!!window.__rtsTest);
  const result=await page.evaluate(()=>{
   const H=window.__rtsTest,T=window.__rtsTables,S=H.spr(),sheets={},inventory=[];
   function bounds(s){const d=s.g.getImageData(0,0,s.c.width,s.c.height).data,k=s.c.width/s.w;let x0=s.c.width,y0=s.c.height,x1=0,y1=0;
    for(let y=0;y<s.c.height;y++)for(let x=0;x<s.c.width;x++)if(d[(y*s.c.width+x)*4+3]>96){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    return {x:x0/k,y:y0/k,w:(x1-x0+1)/k,h:(y1-y0+1)/k,k};}
   function sprite(art,face){return art.fr?art.fr('stand',face,0):Array.isArray(art)?art[face]:art.s||art;}
   function sheet(name,items,mag,cellW){
    const cols=4,rows=[];
    for(let i=0;i<items.length;i+=cols){const group=items.slice(i,i+cols);rows.push({items:group,h:Math.ceil(Math.max(...group.map(v=>v.b.h))*mag)+85});}
    const c=document.createElement('canvas');c.width=cols*cellW;c.height=60+rows.reduce((a,r)=>a+r.h,0);
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#12202a';g.fillRect(0,0,c.width,c.height);
    g.fillStyle='#eef3f7';g.font='20px sans-serif';g.fillText(name+' — fixed '+mag+'x, no individual fitting',14,30);
    let y=60;
    for(const row of rows){row.items.forEach((v,i)=>{const x=i*cellW,b=v.b,s=v.s;
      g.fillStyle='#465a3c';g.fillRect(x+3,y,cellW-6,row.h-4);
      g.fillStyle='#eef3f7';g.font='14px sans-serif';g.fillText(v.label,x+12,y+22);
      if(v.infantry){
        [4,12,20].forEach((face,j)=>{
          const q=sprite(v.art,face),z=bounds(q),xx=x+50+j*95;
          g.drawImage(q.c,z.x*z.k,z.y*z.k,z.w*z.k,z.h*z.k,xx-z.w,y+35,z.w*2,z.h*2);
          g.drawImage(q.c,z.x*z.k,z.y*z.k,z.w*z.k,z.h*z.k,xx-z.w/2,y+row.h-9-z.h,z.w,z.h);
        });
      }else g.drawImage(s.c,b.x*b.k,b.y*b.k,b.w*b.k,b.h*b.k,x+(cellW-b.w*mag)/2,y+35,b.w*mag,b.h*mag);
      if(v.building){
        const man=sprite(S.unit[0].dir.rifle,4),tank=sprite(S.unit[0].dir.lancer,0);
        [man,tank].forEach((q,j)=>{const z=bounds(q);g.drawImage(q.c,z.x*z.k,z.y*z.k,z.w*z.k,z.h*z.k,x+12+j*50,y+row.h-9-z.h,z.w,z.h);});
        g.fillStyle='#dde4e9';g.font='11px sans-serif';g.fillText('GI + Grizzly: same 1x scale',x+120,y+row.h-14);
      }
    });y+=row.h;}
    sheets[name]=c.toDataURL('image/png').split(',')[1];
   }
   const groups={infantry:[],ground:[],air:[],naval:[]};
   for(const [key,d] of Object.entries(T.UNITS)){
    for(const fac of key==='mcv'?['dir','col']:[d.fac||'dir']){
    const art=S.unit[fac==='col'?1:0][fac][key];if(!art)throw Error('Missing '+key);
    const group=d.cls==='i'?'infantry':d.air?'air':d.nav?'naval':'ground';
    const s=sprite(art,12),b=bounds(s);groups[group].push({s,b,label:key+' / '+fac+(group==='infantry'?' — 2× above, 1× below':''),art,infantry:group==='infantry'});
    inventory.push({kind:'unit',key,fac,group,w:b.w,h:b.h});
    }
   }
   for(const [name,items] of Object.entries(groups))if(items.length)sheet(name,items,2,name==='naval'?350:300);
   for(const name of ['ground','naval'])sheet(name+'-quarter',groups[name].map(v=>{const s=sprite(v.art,0);return {...v,s,b:bounds(s)};}),2,name==='naval'?350:300);
   for(const fac of ['dir','col']){
    const items=[];
    for(const [key,d] of Object.entries(T.BLDS)){
      if(d.fac&&d.fac!==fac)continue;
      const art=S.neut[key]||S.bld[fac==='col'?1:0][fac][key];if(!art)throw Error('Missing building '+key);
      const s=art.s,b=bounds(s);items.push({s,b,label:key+' / '+fac,building:true});
      inventory.push({kind:'building',key,fac,w:b.w,h:b.h});
    }
    sheet('buildings-'+fac,items,1,350);
   }
   return {sheets,inventory};
  });
  for(const [name,png] of Object.entries(result.sheets))fs.writeFileSync(path.resolve(__dirname,'../art/out/size-'+name+'.png'),Buffer.from(png,'base64'));
  fs.writeFileSync(path.resolve(__dirname,'../art/out/size-inventory.json'),JSON.stringify(result.inventory,null,2));
  console.log(JSON.stringify(result.inventory));
 }finally{if(browser)await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
