#!/usr/bin/env node
'use strict';
// Paired equal-difficulty AI controls: useful for detecting gross faction /
// spawn bias, not a substitute for human strategy or a claim of perfect balance.
const fs=require('node:fs'),path=require('node:path');
const {load}=require('./lib/vm-sandbox'),{source}=require('./lib/bundle-for-vm');
const W=load(source),runs=[];
const tag=(process.argv.find(a=>a.startsWith('--tag='))||'').slice(6).replace(/[^a-z0-9-]/gi,'');
const maps=(process.argv.find(a=>a.startsWith('--maps='))||'--maps=gems,frontier,coastal').slice(7).split(',');
const seeds=(process.argv.find(a=>a.startsWith('--seeds='))||'--seeds=160916,260916').slice(8).split(',').map(Number);
const minutes=Number((process.argv.find(a=>a.startsWith('--minutes='))||'--minutes=30').slice(10));
const assignments=(process.argv.find(a=>a.startsWith('--assignments='))||'--assignments=dir,col').slice(14).split(',');
const output=path.resolve(__dirname,'../art/out/'+(tag?tag+'-':'')+'balance-paired-review.json');
for(const map of maps)for(const seed of seeds){
 for(const a of assignments){
  const b=a==='dir'?'col':'dir';
  const samples=[];
  const result=W.__rtsSim(seed,'normal','normal',60*60*minutes,a,b,g=>{
   samples.push({tick:g.tick,sides:g.side.map(s=>({credits:Math.round(s.credits),harv:s.harv,made:s.made,power:s.powerMade-s.powerUse})),
    units:[0,1].map(p=>g.units.filter(u=>!u.dead&&u.p===p).length)});
  },map);
  const row={map,seed,a,b,...result,samples};runs.push(row);
  fs.writeFileSync(output,JSON.stringify({description:'Normal vs Normal; normal economy; '+minutes+' game-minute cap',maps,seeds,assignments,runs},null,2));
  console.log(JSON.stringify({...row,samples:undefined}));
 }
}
console.log('Completed',runs.length,'paired-control matches.');
