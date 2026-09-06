#!/usr/bin/env node
/**
 * build-cycle.js — are a structure's six baked idle phases actually six?
 *
 * walk-cycle.js measures infantry: bake each phase of a named sequence and
 * count differing mask pixels between every pair. This is the same probe
 * pointed at the OTHER place the engine bakes a cyclic animation into whole
 * frames: `bakeOwned()` bakes every animated building key (see the list
 * below, mirrored from `bakeOwned`'s own `if (k === 'shipyard' || ...)`
 * guard) at `bph = 0, 1/6, 2/6, ... 5/6` into `A.frames`, and `drawBld`
 * cycles through them by `G.tick` exactly like `drawUnit` cycles a walk.
 * Nothing had ever measured whether those six bakes are six distinct
 * pictures.
 *
 *     node apps/games/rts/tools/build-cycle.js [key]
 *
 * With no argument, every animated building key is baked (both factions)
 * and reported sorted by (maskMin, colMin) ascending, worst first.
 *
 * Two independent diffs run on every phase pair, because a mask-only probe
 * (like walk-cycle.js's) is blind to a whole class of building animation:
 * a beacon or lens can pulse BRIGHTNESS/HUE at fixed geometry, changing not
 * one alpha-mask pixel while changing every RGB byte under it. `maskMin` is
 * the walk-cycle-style silhouette diff; `colMin` is a full RGBA byte diff of
 * the same pair. A pair is only a genuine "this phase is a wasted bake" bug
 * if BOTH are zero (`TRUE-identical`); mask-identical-but-colMin>0 is a
 * valid colour-only idle animation, not a defect, and is reported but not
 * flagged.
 *
 * ── What it found on 2026-09-06 (re-verified 2026-09-06, after fixing a
 *    ROOT-path bug in this file that was silently measuring the wrong repo
 *    checkout — see the ROOT comment below) ─────────────────────────────────
 *   26 animated keys x 2 factions = 52 rows. Three distinct outcomes:
 *
 *   1. FIXED — two real "claims six, delivers three/one" defects, the same
 *      species as the Attack Dog's walk (see walk-cycle.js's header):
 *        - spysat:  roof beacon alpha was a pure single-frequency
 *          `sin(bph*2pi)`, which at 6 equally-spaced samples always ties
 *          phases 0/3, 1/2 and 4/5 (three colliding pairs, half the bake
 *          wasted) — fixed with a +0.35 rad phase offset in rts.html, which
 *          eliminates every tie for a single-frequency sinusoid at 6 samples
 *          (only a phase that is a multiple of pi/6 can still collide).
 *        - psisensor: lens glow alpha was a pure DOUBLE-frequency
 *          `sin(bph*2pi*2)`, which structurally ties 0/3, 1/4 and 2/5 at 6
 *          samples (any pure function of 2*theta repeats every 3 of the 6
 *          steps — not fixable by a phase offset to that same term) — fixed
 *          in rts.html by blending in a small single-frequency `cos(bph*2pi)`
 *          term, which is pi-antiperiodic (opposite sign at phase k and
 *          k+3) and breaks the tie without changing the pulse rate.
 *      Both re-measured post-fix: colMin 31 (spysat, both factions) and 377
 *      (psisensor, both factions), zero TRUE-identical pairs either way.
 *
 *   2. INTENTIONAL, not a bug — radar:dir, reactor:dir, sentrygun:dir freeze
 *      across all 15 phase pairs (maskMin=colMin=0 everywhere). Each has an
 *      explicit `else { // Directorate never builds this (Soviet-only in
 *      RA2): plain block. }` fallback in its `bakeBuilding` branch — the
 *      frozen bake is unused/undisplayed art for a faction+building
 *      combination that never occurs in real play, not a wasted animation.
 *
 *   3. MINOR, documented but deliberately NOT fixed — sentry (dir+col) and
 *      flakcannon (dir+col) each have exactly one TRUE-identical pair (0/3);
 *      sentrygun:col has exactly one (4/5). All three are driven by a single
 *      `Math.sin(anP)` term used for a highlight sweep or barrel-angle
 *      wobble: a plain back-and-forth oscillation naturally revisits the
 *      same value once per half-cycle, so ONE pair ties by construction —
 *      structurally different, and far lower severity, than a full 3-pair
 *      collapse of the whole visible animation. Left alone per the brief:
 *      fix only what is clearly the same class of defect as the dog.
 *
 *   Every other row (factory, nuke, refinery, cloningvats, depot, purifier,
 *   barracks, power, lab, chrono, radar:col, weather, base, curtain, tesla,
 *   patriot, gapgen, prism, airforce, shipyard, ...) has maskMin=0 for at
 *   least one pair but colMin>0 for ALL pairs and zero TRUE-identical pairs:
 *   real, working colour-only idle animation (an ambient glow/pulse) that a
 *   mask-only probe would have wrongly flagged as "collapsed."
 *
 * Building sections do not share one sin/cos naming convention (the crane's
 * slew is `SWING`/`FALL`, the coil's arcs are `anS` alone, the dish is
 * `ph6`-indexed) so none of this could be caught by grepping for a missing
 * cosine term the way the dog's could be spotted by eye — every key had to
 * be baked and diffed.
 */
const path=require('path'),fs=require('fs'),http=require('http');
// Resolve relative to THIS file, not a hardcoded absolute path — walk-cycle.js
// hardcodes '/home/junjie/vibe-coding/vibetop', which silently serves the
// MAIN CHECKOUT's rts.html even when this tool is run from a worktree (found
// the hard way: a fix landed on disk here but every measurement kept showing
// the pre-fix numbers because the server was reading the other copy).
const ROOT=path.resolve(__dirname,'..','..','..','..'),RTS=path.join(ROOT,'apps/games/rts');
function pw(){try{return require('playwright');}catch(e){return require('/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright');}}
(async()=>{
  const srv=http.createServer((rq,rp)=>{let f=rq.url.split('?')[0];if(f==='/')f='/rts.html';
    const c=[path.join(RTS,f),path.join(ROOT,f),path.join(ROOT,'shared',f)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
    if(!c){rp.writeHead(404);return rp.end();}rp.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':'text/html'});rp.end(fs.readFileSync(c));});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const {chromium}=pw();const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/rts.html#nomob`,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.__rtsTest&&window.__rtsTest.spr,null,{timeout:60000});
  const FILTER=process.argv[2]||null;
  const out=await pg.evaluate((FILTER)=>{
    const S=window.__rtsTest.spr(), BLDS=window.__rtsTables.BLDS;
    const res=[];
    for(const k of Object.keys(BLDS)){
      if(FILTER && k!==FILTER) continue;
      for(const fk of ['dir','col']){
        const A=S.bld && S.bld[0] && S.bld[0][fk] && S.bld[0][fk][k];
        if(!A || !A.frames || A.frames.length<2) continue;   // not one of bakeOwned's animated keys
        const frames=A.frames.map(function(f){
          const c=document.createElement('canvas');c.width=f.w;c.height=f.h;
          const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(f.c,0,0);
          const id=g.getImageData(0,0,f.w,f.h).data;
          const m=new Uint8Array(f.w*f.h);
          for(let i=0,j=0;i<id.length;i+=4,j++) m[j]=id[i+3]>8?1:0;
          return {w:f.w,h:f.h,m:Array.from(m),rgba:Array.from(id)};
        });
        const pairs=[];
        for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
          const a=frames[i],c2=frames[j];
          if(a.w!==c2.w||a.h!==c2.h){pairs.push({i,j,diff:99999,cdiff:99999});continue;}
          let n=0;for(let t=0;t<a.m.length;t++) if(a.m[t]!==c2.m[t])n++;
          // colour diff: a phase can pulse a glow's brightness/hue WITHOUT
          // moving the silhouette at all — the mask above is blind to that,
          // exactly as it should be (mask == "did the POSE change"), but a
          // building whose only animation is a colour breathe would then
          // read as a false "collapse" if colour were never checked either.
          let cn=0;for(let t=0;t<a.rgba.length;t+=4){
            if(a.rgba[t]!==c2.rgba[t]||a.rgba[t+1]!==c2.rgba[t+1]||a.rgba[t+2]!==c2.rgba[t+2]||a.rgba[t+3]!==c2.rgba[t+3]) cn++;
          }
          pairs.push({i,j,diff:n,cdiff:cn});
        }
        const opaque=frames[0].m.reduce(function(s,v){return s+v;},0);
        res.push({key:k,fac:fk,n:frames.length,opaque,pairs});
      }
    }
    return res;
  },FILTER);
  const rows=out.map(u=>{
    const ds=u.pairs.map(p=>p.diff), cs=u.pairs.map(p=>p.cdiff);
    const min=Math.min(...ds), cmin=Math.min(...cs);
    // a pair only counts as truly identical if BOTH the silhouette mask AND
    // the full RGBA bytes match — mask==0 alone can be a valid colour-only
    // pulse (glow brightness/hue) rather than a frozen bake.
    const dup=u.pairs.filter(p=>p.diff===0), trueDup=u.pairs.filter(p=>p.diff===0&&p.cdiff===0);
    return {key:u.key,fac:u.fac,n:u.n,opaque:u.opaque,min,cmin,
      dupPairs:dup.map(p=>p.i+'/'+p.j),
      trueDupPairs:trueDup.map(p=>p.i+'/'+p.j)};
  }).sort((a,b)=>(a.min*100000+a.cmin)-(b.min*100000+b.cmin));
  console.log('BUILD CYCLE — animated structures, baked idle phases, pairwise diff (mask px / colour px)');
  console.log('key            fac  n  opaque  maskMin  colMin  mask-identical pairs           TRUE-identical (mask AND colour) pairs');
  for(const r of rows) console.log(`${r.key.padEnd(14)} ${r.fac.padEnd(4)} ${String(r.n).padEnd(2)} ${String(r.opaque).padEnd(7)} ${String(r.min).padEnd(8)} ${String(r.cmin).padEnd(7)} ${(r.dupPairs.length?r.dupPairs.join(' '):'-').padEnd(31)} ${r.trueDupPairs.length?r.trueDupPairs.join(' '):'-'}`);
  if(!rows.length) console.log('(no matching animated key — check the spelling against BLDS)');
  await b.close();srv.close();
})();
