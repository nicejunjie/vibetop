'use strict';
const fs = require('fs'), path = require('path');
const OUT = process.env.ZZ_DUMP_OUT, BAKE = process.env.ZZ_BAKE_DIR;
const FAC = {
  base: ['dir','col'], power: ['dir','col'], refinery: ['dir','col'], barracks: ['dir','col'],
  factory: ['dir','col'], shipyard: ['dir','col'], depot: ['dir','col'], lab: ['dir','col'],
  radar: ['col'], reactor: ['col'], airforce: ['dir'], purifier: ['dir'], spysat: ['dir'],
  sentry: ['dir'], sentrygun: ['col'], tesla: ['col'], prism: ['dir'], patriot: ['dir'],
  flakcannon: ['col'], grandcannon: ['dir'], gapgen: ['dir'], chrono: ['dir'], weather: ['dir'],
  curtain: ['col'], nuke: ['col'],
};
const rowProfile = (f) => { const p=[]; for(let y=0;y<f.h;y++){let n=0;for(let x=0;x<f.w;x++) if(f.mask[y*f.w+x])n++; p.push(n);} return p; };
const colProfile = (f) => { const p=new Array(f.w).fill(0); for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++) if(f.mask[y*f.w+x])p[x]++; return p; };
exports.check = (ctx) => {
  if (!OUT && !BAKE) return [];
  const out = { blds: [], units: [] };
  for (const k of Object.keys(FAC)) for (const fac of FAC[k]) {
    const f = ctx.byBldFac(k, fac); if (!f) continue;
    out.blds.push({ key:k, fac, w:f.w, h:f.h, gw:f.gw, gh:f.gh, row:rowProfile(f), col:colProfile(f) });
    if (BAKE) { fs.writeFileSync(path.join(BAKE, `${k}-${fac}.rgba`), f.rgba); fs.writeFileSync(path.join(BAKE, `${k}-${fac}.mask`), f.mask); }
  }
  for (const r of ctx.recs) {
    const f = ctx.byUnitOct(r.key, r.oct); if (!f) continue;
    out.units.push({ key:r.key, oct:r.oct, w:f.w, h:f.h, row:rowProfile(f), col:colProfile(f) });
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out));
  return [];
};
