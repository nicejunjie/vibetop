'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'document-history.js'),'utf8');

// YouTube binds a hidden about:blank iframe's History methods to the page's own
// history. No script runs in that frame, so only the parent can keep the URL
// proxied: a frame method called on the page's history must defer to it.
test("an iframe's History methods bound to the page's history use the page's proxying methods",()=>{
  const calls=[];
  const frameProto={pushState(...a){calls.push(['frame-native',this===frameHistory,a[2]]);},replaceState(...a){calls.push(['frame-native-replace',this===frameHistory,a[2]]);}};
  const frameHistory=Object.create(frameProto),frameWindow={history:frameHistory};
  const pageHistory={pushState(...a){calls.push(['page-proxied',a[2]]);},replaceState(...a){calls.push(['page-proxied-replace',a[2]]);}};
  class HTMLIFrameElement {}
  Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{configurable:true,get(){return frameWindow;}});
  Object.defineProperty(HTMLIFrameElement.prototype,'contentDocument',{configurable:true,get(){return {defaultView:frameWindow};}});
  const context={HTMLIFrameElement,WeakSet,Object};context.window=context;context.history=pageHistory;
  vm.createContext(context);vm.runInContext(source,context);
  const iframe=new HTMLIFrameElement();
  // What YouTube's bindHistoryStateFunctions does:
  iframe.contentWindow.history.pushState.bind(pageHistory)({}, '', '/watch?v=next');
  iframe.contentWindow.history.replaceState.bind(pageHistory)({}, '', 'https://www.youtube.com/watch?v=x');
  // The frame's own history still uses its native method.
  frameHistory.pushState({}, '', '/frame-own');
  assert.deepEqual(calls,[['page-proxied','/watch?v=next'],['page-proxied-replace','https://www.youtube.com/watch?v=x'],['frame-native',true,'/frame-own']]);
  // Reading the frame through contentDocument guards it too (idempotent).
  assert.equal(iframe.contentDocument.defaultView.history.pushState,frameProto.pushState);
});
