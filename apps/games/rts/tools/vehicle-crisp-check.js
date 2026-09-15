#!/usr/bin/env node
'use strict';
// Rendering invariants and contact sheets; never a visual-likeness score.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./lib/serve-rts');
const { chromium } = require(path.resolve(__dirname, '../../../../tests/e2e/node_modules/playwright'));
const roster = [
  ['lancer','dir'],['rhino','col'],['mammoth','col'],['mirage','dir'],
  ['teslatank','col'],['prismtank','dir'],['ifv','dir'],['flaktrack','col'],['v3','col'],
  ['harrier','dir'],['hornet','dir'],['nighthawk','dir'],['kirov','col'],
];
async function main() {
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch(); const results = [];
    for (const dpr of [1,2]) {
      const context = await browser.newContext({deviceScaleFactor:dpr});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(server.url+'/rts.html');
      await page.waitForFunction(() => !!window.__rtsTest);
      const result = await page.evaluate(rows => {
        const H = window.__rtsTest, hashes = [], tracked = new Set();
        function check(s, label) {
          if (!s.crispVehicle || s.w !== s.c.width || s.h !== s.c.height) throw Error('Non-native grid: '+label);
          tracked.add(s.c);
          const data = s.g.getImageData(0,0,s.w,s.h).data;
          let hash = 2166136261;
          for (const byte of data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
          hashes.push([label,hash]);
        }
        for (const owner of [0,1]) for (const [key,fac] of rows) {
          const art = H.spr().unit[owner][fac][key];
          const sets = [art,art.hull,art.turret,art.anim,art.empty].filter(Boolean);
          if (art.lay) sets.push(...Object.values(art.lay()));
          if (art.anim && art.anim.lay) sets.push(...Object.values(art.anim.lay()));
          if (art.turrets) for(let i=0;i<4;i++) sets.push(art.turrets(i));
          for (const set of sets) for (let face=0;face<32;face++) check(set[face],key+'/'+face);
        }
        const live = H.begin(9340,'normal',null,true,true); live.seen.fill(1);
        const start = live.start[0];
        rows.forEach(([key],i) => {
          const u=H.spawn(key,0,start.x+(i%4)*2,start.y+Math.floor(i/4)*2);
          u.stopped=true;u.face=4;
        });
        H.centerOn(start.x+3,start.y+3);
        const proto = CanvasRenderingContext2D.prototype, original = proto.drawImage;
        let draws=0;
        proto.drawImage=function(source,...args) {
          if (tracked.has(source) && this.canvas===document.querySelector('canvas')) {
            if(this.imageSmoothingEnabled) throw Error('Filtered vehicle layer');
            draws++;
          }
          return original.call(this,source,...args);
        };
        try { for(const zoom of [1,1.35,2]) { H.zoom(zoom);H.render(); } }
        finally { proto.drawImage=original; }
        if(!draws) throw Error('No live draws checked');
        function board(group, title, rowH) {
          const cellW=title==='Aircraft'?300:230;
          const c=document.createElement('canvas');c.width=160+4*cellW;c.height=70+group.length*rowH;
          const g=c.getContext('2d');g.imageSmoothingEnabled=false;
          g.fillStyle='#14202b';g.fillRect(0,0,c.width,c.height);
          g.fillStyle='#e9eff5';g.font='bold 20px sans-serif';g.fillText(title,16,27);
          g.font='13px sans-serif';g.fillText('Native 1x at left; fixed 2x in four bearings. Final column: flight variant where available.',16,50);
          group.forEach(([key,fac],ri)=>{
            const y=70+ri*rowH,owner=fac==='col'?1:0,art=H.spr().unit[owner][fac][key];
            g.fillStyle='#e9eff5';g.font='14px sans-serif';g.fillText(key,10,y+22);
            [0,0,12,20,28].forEach((face,ci)=>{
              const mag=ci===0?1:2, x=ci===0?5:160+(ci-1)*cellW, w=ci===0?150:cellW-4;
              g.fillStyle=ri%2?'#526448':'#485e3c';g.fillRect(x,y+30,w,rowH-34);
              const set=ci===4?(art.anim||art.empty||art):art;
              let layers=[set[face]];
              if(set.hull&&set.turret) layers=[set.hull[face],set.turret[face]];
              if(set.lay){const l=set.lay();layers=[l.hull[face],l.gond[face]];}
              layers.forEach(s=>{
                // Shared canvas anchor across parts; no per-layer fit or crop.
                const base=set[face], pixels=base.g.getImageData(0,0,base.w,base.h).data;
                let btop=base.h,bbottom=0;
                for(let py=0;py<base.h;py++)for(let px=0;px<base.w;px++)if(pixels[(py*base.w+px)*4+3]>16){btop=Math.min(btop,py);bbottom=Math.max(bbottom,py);}
                g.drawImage(s.c,x+w/2-s.w*mag/2,y+30+(rowH-34)/2-(btop+bbottom)*mag/2,s.w*mag,s.h*mag);
              });
            });
          });
          return c.toDataURL('image/png').split(',')[1];
        }
        return {hashes,draws,tanks:board(rows.slice(0,9),'Tanks and support vehicles',170),aircraft:board(rows.slice(9),'Aircraft',240)};
      },roster);
      assert.deepEqual(errors,[]); results.push(result.hashes);
      if(dpr===1)for(const key of ['tanks','aircraft'])fs.writeFileSync(path.resolve(__dirname,'../art/out/'+key+'-crisp-review.png'),Buffer.from(result[key],'base64'));
      console.log('DPR '+dpr+': '+result.hashes.length+' frames/layers; '+result.draws+' unfiltered live draws.');
      await context.close();
    }
    const changed=results[0].filter((frame,i)=>frame[1]!==results[1][i][1]);
    assert.equal(changed.length,0,'DPR changed vehicle pixels: '+[...new Set(changed.map(f=>f[0].split('/')[0]))].join(', '));
    console.log('PASS: native grids, DPR-independent pixels, unfiltered live layers at three zooms. Not a likeness test.');
  } finally {if(browser)await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
