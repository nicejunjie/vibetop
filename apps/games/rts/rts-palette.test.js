// Exercise the real palette processor, not a guessed six-level approximation.
// The former source-literal lint called every low-saturation tint "grey", even
// skin, ivory and paint, and applied six-level rules to native 12/16-level art.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RTS = path.join(__dirname, 'rts');
const context = vm.createContext({TW:48,TH:24});
vm.runInContext(fs.readFileSync(path.join(RTS,'bake/terrain.js'),'utf8'),context);
function processPixels(pixels, levels, preserve) {
  const id={data:new Uint8ClampedArray(pixels.flat())};
  const s={c:{width:pixels.length,height:1},g:{
    getImageData:()=>id,putImageData:()=>{}
  }};
  context.pixelate(s,levels,96,preserve);
  return id.data;
}
function artFiles(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?artFiles(p):e.name.endsWith('.js')?[p]:[];
  });
}
test('neutral steel stays neutral through every actual palette mode',()=>{
  // Three copies prevent frequency cleanup from dropping deliberately used
  // colours. All brightness values, including shade-ladder intermediate values.
  const pixels=[];
  for(let value=0;value<256;value++)for(let n=0;n<3;n++)pixels.push([value,value,value,255]);
  for(const [levels,preserve] of [[6,false],[12,true],[16,true]]) {
    const result=processPixels(pixels,levels,preserve);
    for(let i=0;i<result.length;i+=4){
      assert.equal(result[i],result[i+1]);
      assert.equal(result[i+1],result[i+2]);
      assert.equal(result[i+3],255);
    }
  }
});
test('authored material colours stay within one half-step in preserving modes',()=>{
  const colours=[];
  for(const file of [...artFiles(path.join(RTS,'units')),...artFiles(path.join(RTS,'bake'))]) {
    const code=fs.readFileSync(file,'utf8').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
    for(const m of code.matchAll(/'(#[0-9a-fA-F]{6})'/g))
      colours.push([1,3,5].map(start=>parseInt(m[1].slice(start,start+2),16)));
  }
  assert.ok(colours.length>100,'Art palette was not scanned');
  const pixels=[];
  for(const colour of colours)for(const factor of [.16,.35,.55,.8,1,1.18,1.42,1.66])
    pixels.push(colour.map(c=>Math.min(255,Math.round(c*factor))).concat(255));
  for(const levels of [12,16]){
    const result=processPixels(pixels,levels,true), bound=255/(levels-1)/2+.51;
    pixels.forEach((p,i)=>{for(let c=0;c<3;c++)
      assert.ok(Math.abs(result[i*4+c]-p[c])<=bound,'Material hue correction or palette merging changed an authored colour');
    });
  }
});
test('small material accents survive and ground shadow remains translucent',()=>{
  const pixels=[[90,90,90,255],[90,90,90,255],[90,90,90,255],
    [215,174,135,255],[153,220,225,255],[0,0,0,97],[200,200,200,20]];
  const result=processPixels(pixels,12,true);
  assert.ok(result[12]>result[13]&&result[13]>result[14],'Skin accent lost');
  assert.ok(result[18]>result[16],'Glass accent lost');
  assert.equal(result[23],97,'Shadow became an opaque slab');
  assert.equal(result[27],0,'Sub-threshold edge survived');
});
