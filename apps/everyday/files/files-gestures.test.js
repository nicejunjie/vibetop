'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/filesx.html','utf8');
function preview(){
  const events={}, cls=new Set();
  const img={offsetWidth:400,offsetHeight:300,style:{},classList:{add:c=>cls.add(c),remove:c=>cls.delete(c)}};
  const body={classList:{add(){},remove(){}},querySelector:()=>img,contains:()=>true,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),setPointerCapture(){},releasePointerCapture(){},addEventListener(k,f){events[k]=f;}};
  const c=vm.createContext({qlBodyEl:body,VibePinch:require('../../../shared/pinch.js'),window:{addEventListener(){}},qlIsOpen:()=>true});
  const start=html.indexOf('  var qlZ = '),end=html.indexOf('  function qlClose()',start);
  vm.runInContext(html.slice(start,end),c);
  const event=(id,x)=>({pointerId:id,clientX:x,clientY:150,button:0,preventDefault(){}});
  return {c,events,event,img};
}
test('changing a Quick Look image forgets the preceding pinch',()=>{
  const {c,events,event}=preview();events.pointerdown(event(1,100));events.pointerdown(event(2,200));
  events.pointermove(event(2,250));assert.equal(c.qlZ,1.5);
  c.qlZoomReset();events.pointermove(event(2,300));assert.equal(c.qlZ,1);
});
test('a cancelled Quick Look gesture preserves the current zoom and stops panning',()=>{
  const {c,events,event}=preview();c.qlZoomTo(2,200,150);events.pointerdown(event(1,100));
  events.pointercancel(event(1,100));events.pointermove(event(1,350));assert.equal(c.qlZ,2);assert.equal(c.qlPX,0);
});
test('three fingers re-anchor to the remaining pair when one lifts',()=>{
  const {c,events,event}=preview();events.pointerdown(event(1,100));events.pointerdown(event(2,200));events.pointerdown(event(3,300));
  events.pointerup(event(1,100));events.pointermove(event(3,320));assert.equal(c.qlZ,1.2);
});
function listing(){
  let resolveStat;const navigated=[],opened=[],timers=[];
  const c=vm.createContext({seq:0,path:'/a',lpTimer:null,lpStart:null,lpFired:false,dragCand:null,drag:null,
    qlClose(){},clearSel(){},filterText:'',searchOpen:false,searchActive:false,searchSeq:0,selectMode:false,
    document:{activeElement:null,title:''},addrEl:{value:''},mainEl:{scrollTop:0,childNodes:[],innerHTML:'',appendChild(){}},
    setTimeout(fn,ms){timers.push({fn,ms});},clearTimeout(){},Promise,encodeURIComponent,HOME:'/a',baseOf:p=>p.split('/').pop(),
    renderCrumbs(){},closeMore(){},setNotice(){},renderList(){},sigOf:()=>'',renderError(){},applyView(){},stateEl(){},el(){},
    api(url){if(url.includes('/stat?'))return new Promise(resolve=>resolveStat=resolve);
      return Promise.resolve(url.includes('%2Fa%2Ffile')?{ok:false,code:'enotdir'}:{ok:true,entries:[]});},
    go(p){navigated.push(p);c.path=p;c.seq++;},openEntry(...a){opened.push(a);}});
  const a=html.indexOf('  function load(p,'),b=html.indexOf('\n  function refresh()',a);vm.runInContext(html.slice(a,b),c);
  return {c,navigated,opened,timers,stat:()=>resolveStat};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('late file-path stat cannot send a newly selected directory back to its parent',async()=>{
  const h=listing();h.c.load('/a/file');await settle();h.c.load('/b');await settle();
  h.stat()({ok:true,stat:{isDir:false}});await settle();assert.deepEqual(h.navigated,[]);assert.equal(h.c.path,'/b');
});
test('a delayed auto-open cannot launch an old file after another navigation',async()=>{
  const h=listing();h.c.load('/a/file');await settle();h.stat()({ok:true,stat:{isDir:false}});await settle();
  h.c.load('/b');await settle();h.timers.filter(t=>t.ms===150).forEach(t=>t.fn());assert.deepEqual(h.opened,[]);
});
