#!/usr/bin/env node
/**
 * walk-cycle.js — are the six animation frames actually six frames?
 *
 * Every other tool here measures a STILL: art-metrics.js bakes an idle unit,
 * legibility.js compares those bakes, unit-compare.js photographs one pose.
 * Animation had no measurement of any kind, and the code already knew the
 * failure mode — THE WALK's own comment says that on stride alone "phases 1
 * and 2 (and 4 and 5) come out identical and the walk reads as a three-frame
 * twitch again".
 *
 *     node apps/games/rts/tools/walk-cycle.js [walk|fire|leap]
 *
 * Bakes each infantry kind's phases at one facing and counts differing mask
 * pixels for every pair. A 0 means two frames are PIXEL-IDENTICAL.
 *
 * ── What it found on 2026-09-06 ───────────────────────────────────────────
 *   walk   dog  minDiff 0, identical pairs 0/3 1/2 4/5 — three distinct
 *          silhouettes out of six. Every other kind measured 6-15. FIXED.
 *   fire   clean, 6-25. The dog reports all-identical and that is CORRECT:
 *          DOG_SEQ has no `fire`, so it falls back to `stand`. A dog bites.
 *          Read a row against the unit's own sequence table before believing it.
 *   leap   clean, dog 102.
 *
 * ── The arithmetic, which generalises to any cyclic gait at six phases ─────
 * Stride `sin(t)` gives sin 60 = sin 120, so phases 1 and 2 match and 4 and 5
 * match. `abs(sin 2t)` folds its own sign away and repeats on the SAME pairs,
 * so it separates nothing. Both are also ZERO at phases 0 and 3. Separating
 * all six needs a term with the FULL cycle's period — `cos(t)`, which is +1
 * and -1 there. That is exactly what `cf` is for in the humanoid walk, and
 * what the dog's head nod is for now.
 */
const path=require('path'),fs=require('fs'),http=require('http');
const ROOT='/home/junjie/vibe-coding/vibetop',RTS=path.join(ROOT,'apps/games/rts');
function pw(){try{return require('playwright');}catch(e){return require(path.join(ROOT,'tests','e2e','node_modules','playwright'));}}
(async()=>{
  const srv=http.createServer((rq,rp)=>{let f=rq.url.split('?')[0];if(f==='/')f='/rts.html';
    const c=[path.join(RTS,f),path.join(ROOT,f),path.join(ROOT,'shared',f)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
    if(!c){rp.writeHead(404);return rp.end();}rp.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':'text/html'});rp.end(fs.readFileSync(c));});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const {chromium}=pw();const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/rts.html#nomob`,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.__rtsTest&&window.__rtsTest.spr,null,{timeout:30000});
  const SEQ=process.argv[2]||'fire';
  await pg.evaluate((q)=>{window.__SEQ__=q;},SEQ);
  const out=await pg.evaluate(()=>{
    const S=window.__rtsTest.spr(), U=window.__rtsTables.UNITS; const SEQ=window.__SEQ__;
    const res=[];
    for(const k of Object.keys(U)){
      const d=U[k]; if(d.cls!=='i') continue;
      const A=(S.unit&&S.unit[0]&&S.unit[0][d.fac||'dir'])?S.unit[0][d.fac||'dir'][k]:null;
      if(!A||!A.fr) continue;
      const face=3, frames=[];
      for(let ph=0;ph<(SEQ==="leap"?3:6);ph++){
        let f=null; try{ f=A.fr(SEQ,face,ph); }catch(e){}
        if(!f){frames.push(null);continue;}
        const c=document.createElement('canvas');c.width=f.w;c.height=f.h;
        const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(f.c,0,0);
        const id=g.getImageData(0,0,f.w,f.h).data;
        const m=new Uint8Array(f.w*f.h);
        for(let i=0,j=0;i<id.length;i+=4,j++) m[j]=id[i+3]>8?1:0;
        frames.push({w:f.w,h:f.h,m:Array.from(m)});
      }
      // pairwise differing-pixel counts between consecutive & all pairs
      const pairs=[];
      for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
        const a=frames[i],c2=frames[j];
        if(!a||!c2){pairs.push({i,j,diff:-1});continue;}
        if(a.w!==c2.w||a.h!==c2.h){pairs.push({i,j,diff:99999});continue;}
        let n=0;for(let t=0;t<a.m.length;t++) if(a.m[t]!==c2.m[t])n++;
        pairs.push({i,j,diff:n});
      }
      const opaque=frames[0]?frames[0].m.reduce((s,v)=>s+v,0):0;
      res.push({key:k,name:d.name,opaque,pairs});
    }
    return res;
  });
  const rows=out.map(u=>{
    const ds=u.pairs.filter(p=>p.diff>=0).map(p=>p.diff);
    const min=Math.min(...ds), dup=u.pairs.filter(p=>p.diff===0);
    return {key:u.key,name:u.name,opaque:u.opaque,min,dupPairs:dup.map(p=>p.i+'/'+p.j)};
  }).sort((a,b)=>a.min-b.min);
  console.log(SEQ.toUpperCase()+' CYCLE — 6 phases, facing 3, pairwise differing mask px');
  console.log('unit          opaque  minDiff  identical phase pairs');
  for(const r of rows) console.log(`${r.key.padEnd(13)} ${String(r.opaque).padEnd(7)} ${String(r.min).padEnd(8)} ${r.dupPairs.length?r.dupPairs.join(' '):'-'}`);
  await b.close();srv.close();
})();
