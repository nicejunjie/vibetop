'use strict';
// Rewriting a large script costs ~2 s of the gateway's single thread (ChatGPT
// alone ships 18 MB), and every other request waits behind it. Large scripts
// are rewritten on worker threads instead. The engine's URL replacer needs the
// gateway's realm state, so in the worker it returns a placeholder token and
// records its arguments; the gateway then substitutes the real URLs. The
// output is identical to rewriting on the main thread. A result that would need
// escaping in a string literal, or any worker failure, falls back to the
// main thread.
const {Worker}=require('node:worker_threads');
const crypto=require('node:crypto');
const WORKER_SOURCE=`
const {parentPort,workerData}=require('node:worker_threads');
const {processScript}=require(workerData.processPath);
parentPort.on('message',({id,script,swAllowed,nativeAutomation,nonce,base})=>{
  const calls=[];
  try {
    // Dynamic import parses resolver('./') for the document base: give it the real value.
    const resolver=(...args)=>{if(base!==null&&args.length===1&&args[0]==='./')return base;calls.push(args);return 'vt'+nonce+'u'+(calls.length-1)+'x';};
    parentPort.postMessage({id,code:processScript(script,true,false,resolver,swAllowed,nativeAutomation),calls});
  } catch (error) {parentPort.postMessage({id,error:String(error&&error.message||error)});}
});`;
const UNSAFE=/["'`\\\r\n\u2028\u2029]|\$\{/;
function createScriptWorkers({processPath,size=4,minLength=16*1024}) {
  const idle=[],waiting=[],pending=new Map(),all=new Set();let next=0,closed=false;
  function spawn() {
    const worker=new Worker(WORKER_SOURCE,{eval:true,workerData:{processPath}});all.add(worker);
    worker.unref();
    worker.on('message',message=>{
      const job=pending.get(message.id);pending.delete(message.id);
      release(worker);job?.resolve(message);
    });
    worker.on('error',()=>{});
    worker.on('exit',()=>{
      all.delete(worker);
      for(const [id,job] of pending)if(job.worker===worker){pending.delete(id);job.resolve({error:'worker exited'});}
      const at=idle.indexOf(worker);if(at>=0)idle.splice(at,1);
      if(!closed)idle.push(spawn());pump();
    });
    return worker;
  }
  for(let i=0;i<size;i++)idle.push(spawn());
  function release(worker){if(!closed){idle.push(worker);pump();}}
  function pump() {
    while(idle.length && waiting.length) {
      const worker=idle.shift(),{message,resolve}=waiting.shift();
      pending.set(message.id,{resolve,worker});worker.postMessage(message);
    }
  }
  function run(message){return new Promise(resolve=>{waiting.push({message:{...message,id:++next},resolve});pump();});}
  async function processScript(script,urlReplacer,swAllowed,nativeAutomation) {
    if(closed||typeof script!=='string'||script.length<minLength)return null;
    const nonce=crypto.randomBytes(8).toString('hex');
    let base=null;try{base=String(urlReplacer('./'));}catch{}
    const result=await run({script,swAllowed,nativeAutomation,nonce,base});
    if(result.error||typeof result.code!=='string')return null;
    const values=result.calls.map(args=>String(urlReplacer(...args)));
    if(values.some(value=>UNSAFE.test(value)))return null;
    let valid=true;
    const code=result.code.replace(new RegExp('vt'+nonce+'u(\\d+)x','g'),(_match,index)=>{
      const value=values[Number(index)];if(value===undefined){valid=false;return '';}return value;
    });
    return valid?code:null;
  }
  processScript.close=async()=>{
    closed=true;for(const {resolve} of waiting.splice(0))resolve({error:'closed'});
    await Promise.all([...all].map(worker=>worker.terminate()));
  };
  return processScript;
}
module.exports={createScriptWorkers};
