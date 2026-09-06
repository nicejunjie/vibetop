#!/usr/bin/env node
/**
 * veh-toggle-check.js — are a vehicle's two G.tick-selected art SETS
 * (base vs. "the other pose") actually different pictures, at every facing?
 *
 * walk-cycle.js and build-cycle.js both measure a CYCLIC bake: N phases of
 * one sequence, diffed against each other. Some non-infantry animation is
 * not cyclic at all — it is a plain two-state TOGGLE, where `bakeOwned()`
 * bakes a second full 32-facing sheet under a property on the base art
 * (`U.mine`, `U.anim`, `U.empty`) and `drawUnit` swaps the whole sheet in
 * by a `G.tick` bit test (see the `if (u.state === 'mining' && art.mine...`
 * block in `drawUnit`). That needs a different probe: not "do N phases of
 * ONE facing collapse", but "does facing F of the toggled sheet differ from
 * facing F of the base sheet, for every facing" — this tool.
 *
 *     node apps/games/rts/tools/veh-toggle-check.js
 *
 * Covers every such toggle in the game: the Chrono/War Miner's scoop-down
 * `mine` pose, the Kirov/Nighthawk's blade-advanced `anim` pose, and the
 * Harrier's racks-fired `empty` pose. Reports full-byte diff counts (not
 * just the alpha mask — a toggle can be a pure recolour) at all 32 facings,
 * per faction.
 *
 * ── What it found on 2026-09-06 ─────────────────────────────────────────
 * kirov.anim, nighthawk.anim and harrier.empty differ at every one of 32
 * facings, both factions — no collapse, all working as intended.
 *
 * chronominer.mine / warminer.mine differ at every facing for 'dir'
 * (Directorate), but for 'col' (Collective) the diff falls to LITERAL ZERO
 * at three consecutive facings (19, 20, 21 of 32 — a narrow arc around one
 * particular rear/three-quarter angle) and near-zero at the two facings on
 * either side (17-18, 22-23). At those exact facings a Collective-owned
 * harvester gives the player ZERO visual feedback that it is mining.
 *
 * This is NOT the trig-periodicity defect walk-cycle.js/build-cycle.js
 * fix (a `sin`/`cos` sampled at fixed phases tying frames by construction,
 * fixed by an offset or a companion term) — it reproduces at only a few of
 * 32 facings, is faction-specific despite `chronominer`'s and `warminer`'s
 * bake code being otherwise identical geometry, and every moving part in
 * the harv-specific `bakeVehicle` branch (drum drop `nz`, finger drop `fl`/
 * `ftop`, gear angle `ga0`) is a facing-projected GEOMETRIC offset, not a
 * periodic colour driver — so it needs isometric-projection debugging (is
 * the moving nose/scoop cluster passing behind the ore bin's z-order at
 * exactly that facing range for one faction's silhouette but not the
 * other's?), not a phase-offset. Left unfixed and reported here per the
 * brief: fix only what is clearly the same class of defect as the dog's
 * walk, and say so plainly otherwise.
 */
const path=require('path'),fs=require('fs'),http=require('http');
const ROOT=path.resolve(__dirname,'..','..','..','..'),RTS=path.join(ROOT,'apps/games/rts');
function pw(){try{return require('playwright');}catch(e){return require(path.join(ROOT,'tests/e2e/node_modules/playwright'));}}
(async()=>{
  const srv=http.createServer((rq,rp)=>{let f=rq.url.split('?')[0];if(f==='/')f='/rts.html';
    const c=[path.join(RTS,f),path.join(ROOT,f),path.join(ROOT,'shared',f)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
    if(!c){rp.writeHead(404);return rp.end();}rp.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':'text/html'});rp.end(fs.readFileSync(c));});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const {chromium}=pw();const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/rts.html#nomob`,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.__rtsTest&&window.__rtsTest.spr,null,{timeout:60000});
  const out=await pg.evaluate(()=>{
    const S=window.__rtsTest.spr();
    const cases=[['chronominer','mine'],['warminer','mine'],['kirov','anim'],['nighthawk','anim'],['harrier','empty']];
    const res=[];
    for(const [uk,prop] of cases){
      for(const fk of ['dir','col']){
        const art=S.unit[0][fk][uk];
        if(!art || !art[prop]) { res.push({uk,fk,prop,note:'NO SUCH ART / PROPERTY'}); continue; }
        const variant=art[prop];
        const diffs=[];
        for(let fi=0;fi<32;fi++){
          const a=art[fi], c2=variant[fi];
          if(!a||!c2){diffs.push({fi,note:'missing frame'});continue;}
          const ca=document.createElement('canvas');ca.width=a.w;ca.height=a.h;
          const ga=ca.getContext('2d');ga.imageSmoothingEnabled=false;ga.drawImage(a.c,0,0);
          const cb=document.createElement('canvas');cb.width=c2.w;cb.height=c2.h;
          const gb=cb.getContext('2d');gb.imageSmoothingEnabled=false;gb.drawImage(c2.c,0,0);
          if(a.w!==c2.w||a.h!==c2.h){diffs.push({fi,diff:'SIZE MISMATCH',aw:a.w,ah:a.h,bw:c2.w,bh:c2.h});continue;}
          const ida=ga.getImageData(0,0,a.w,a.h).data, idb=gb.getImageData(0,0,c2.w,c2.h).data;
          let n=0; for(let i=0;i<ida.length;i++) if(ida[i]!==idb[i]) n++;
          diffs.push({fi,diffBytes:n});
        }
        res.push({uk,fk,prop,diffs});
      }
    }
    return res;
  });
  for(const r of out){
    if(r.note) { console.log(`${r.uk}.${r.prop} (${r.fk}): ${r.note}`); continue; }
    const zero=r.diffs.filter(d=>d.diffBytes===0).map(d=>d.fi);
    const minD=Math.min(...r.diffs.map(d=>d.diffBytes===undefined?99999:d.diffBytes));
    console.log(`${r.uk}.${r.prop} (${r.fk}): minDiff=${minD}  ${zero.length? 'ZERO-DIFF FACINGS: '+zero.join(',') : 'no zero-diff facing'}`);
  }
  await b.close();srv.close();
})();
