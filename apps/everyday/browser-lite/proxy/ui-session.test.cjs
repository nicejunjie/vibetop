const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(fetcher=async()=>({ok:true})) {
 const messages=[],parent={postMessage:(data,origin)=>messages.push({data,origin})},window={addEventListener(){}};
 const context=vm.createContext({window,location:{origin:'https://ui.example.com'},fetch:fetcher,crypto:{randomUUID:()=> 'request-id'},AbortSignal,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(__dirname+'/ui-session.js','utf8'),context);
 const session=new window.BrowserUISession({parents:['https://main.example.com'],parent,fetcher});
 const message=(data,origin='https://main.example.com',source=parent)=>session.receive({data,origin,source});
 return {session,messages,parent,message};
}
test('renewal requires the configured parent WindowProxy and origin',async()=>{
 const f=fixture();f.message({type:'vibetop-browser-host'},'https://evil.example.com');
 await assert.rejects(f.session.renew(),/Reopen/);
 f.message({type:'vibetop-browser-host'},undefined,{});await assert.rejects(f.session.renew(),/Reopen/);
 f.message({type:'vibetop-browser-host'});const pending=f.session.renew();
 assert.equal(f.session.renew(),pending);assert.equal(f.messages.length,2);
 f.message({type:'vibetop-browser-handoff',id:'wrong',ticket:'a'.repeat(43)});
 f.message({type:'vibetop-browser-handoff',id:'request-id',ticket:'a'.repeat(43)});
 await pending;assert.equal(f.session.pending,null);
});
test('a failed handoff clears pending state and permits a fresh retry',async()=>{
 let count=0;const f=fixture(async()=>({ok:++count>1}));f.message({type:'vibetop-browser-host'});
 const first=f.session.renew();f.message({type:'vibetop-browser-handoff',id:'request-id',ticket:'a'.repeat(43)});
 await assert.rejects(first,/renewed/);const second=f.session.renew();
 f.message({type:'vibetop-browser-handoff',id:'request-id',ticket:'b'.repeat(43)});await second;
 assert.equal(count,2);
});
