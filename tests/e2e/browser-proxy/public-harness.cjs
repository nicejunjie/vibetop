'use strict';
// Disposable public-site test bed. No real profiles or accounts. The rewriter is
// in a network namespace with no user home access, before any public page loads.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const http=require('node:http');
const https=require('node:https');
const net=require('node:net');
const {execFileSync}=require('node:child_process');
const proxyRoot=path.resolve(__dirname,'../../../apps/everyday/browser-lite/proxy');
const {EgressProxy}=require(path.join(proxyRoot,'egress.cjs'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-public-browser-'));
const unit='vibetop-browser-proxy-e2e-'+process.pid;
const parentOrigin='https://ui.vt-proxy.example.com:18994';
const config={uid:process.getuid(),profile:crypto.randomBytes(16).toString('hex'),secret:crypto.randomBytes(32).toString('hex'),
  epoch:1,domain:'vt-proxy.example.com',protocol:'https:',port:18995,parentOrigin,
  proxySocket:path.join(temporary,'proxy.sock'),controlSocket:path.join(temporary,'control.sock'),
  stateFile:path.join(temporary,'realms.jsonl'),
  cookieFile:path.join(temporary,'cookies.json'),
  egressSocket:path.join(temporary,'egress.sock'),egressSecret:crypto.randomBytes(32).toString('hex')};
let guard, ingress, parent, browserProxy;
let closing=false;
async function close() {
  if (closing) return;closing=true;
  try {execFileSync('sudo',['-n','systemctl','stop',unit],{stdio:'ignore'});}catch{}
  await guard?.close();ingress?.close();parent?.close();browserProxy?.close();
  fs.rmSync(temporary,{recursive:true,force:true});process.exit();
}
async function control(command,body) {
  return new Promise((resolve,reject)=>{
    const req=http.request({socketPath:config.controlSocket,path:'/'+command,method:'POST',headers:{'Content-Type':'application/json'}},res=>{
      let response='';res.on('data',chunk=>response+=chunk);res.on('end',()=>{
        if(res.statusCode!==200)reject(new Error(response));else resolve(JSON.parse(response));
      });
    });req.on('error',reject);req.end(JSON.stringify(body));
  });
}
async function main() {
  fs.writeFileSync(path.join(temporary,'config.json'),JSON.stringify(config),{mode:0o600});
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=vt-proxy.example.com',
    '-keyout',path.join(temporary,'key.pem'),'-out',path.join(temporary,'cert.pem')],{stdio:'ignore'});
  const tls={key:fs.readFileSync(path.join(temporary,'key.pem')),cert:fs.readFileSync(path.join(temporary,'cert.pem'))};
  guard=new EgressProxy({secret:config.egressSecret,deniedDomains:['nicejunjie.com','vt-proxy.example.com']});await guard.listen(config.egressSocket);
  execFileSync('sudo',['-n','systemd-run','--quiet','--collect','--unit='+unit,'--uid='+process.getuid(),'--gid='+process.getgid(),
    '-p','PrivateNetwork=yes','-p','NoNewPrivileges=yes','-p','ProtectSystem=strict','-p','ProtectHome=tmpfs',
    '-p','BindReadOnlyPaths='+proxyRoot,'-p','ReadWritePaths='+temporary,'-p','CapabilityBoundingSet=',
    '-p','RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6','/usr/bin/node',path.join(proxyRoot,'runtime.cjs'),path.join(temporary,'config.json')]);
  for(let i=0;!fs.existsSync(config.controlSocket);i++){
    if(i>100)throw new Error('Isolated runtime did not start: '+unit);
    await new Promise(r=>setTimeout(r,100));
  }
  ingress=https.createServer(tls,(req,res)=>{
    const upstream=http.request({socketPath:config.proxySocket,path:req.url,method:req.method,headers:req.headers},reply=>{
      res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
    });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
    res.on('close',()=>upstream.destroy());
  });
  ingress.on('upgrade',(req,socket,head)=>{
    const upstream=net.createConnection({path:config.proxySocket},()=>{
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n');
      if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });
  await new Promise(r=>ingress.listen(18995,'127.0.0.1',r));
  parent=https.createServer(tls,async(req,res)=>{
    try{
      if(req.url==='/controller.js') {res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(proxyRoot,'trusted-controller.js')));return;}
      const pathname=new URL(req.url,parentOrigin).pathname;
      const files={'/app':['wrapper.html','text/html'],'/wrapper.js':['wrapper.js','application/javascript'],'/ui-session.js':['ui-session.js','application/javascript'],'/wrapper.css':['wrapper.css','text/css']};
      if(files[pathname]){res.setHeader('Content-Type',files[pathname][1]);res.end(fs.readFileSync(path.join(proxyRoot,files[pathname][0])));return;}
      if(req.url.startsWith('/api/')) {
        if(req.method!=='POST'||req.headers.origin!==parentOrigin){res.writeHead(403);res.end();return;}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw new Error('Too large');chunks.push(chunk);}
        const result=await control(req.url.slice(5),JSON.parse(Buffer.concat(chunks)));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
      }
      const url=new URL(req.url,parentOrigin).searchParams.get('url') || 'https://www.wikipedia.org/';
      const clientId=crypto.randomUUID(),entry=await control('open',{url,clientId,operation:1,tabId:crypto.randomUUID(),epoch:1});
      res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
      res.end(`<!doctype html><meta name="referrer" content="origin"><title>Browser acceptance test</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
        <iframe id="browser" referrerpolicy="origin" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals" src="${entry.entry.replace(/&/g,'&amp;')}"></iframe>
        <script src="/controller.js"></script><script>window.browserStates=[];
        window.browserController=new BrowserProxyController({frame:document.getElementById('browser'),onState:state=>browserStates.push(state),onError:error=>console.error(error),
          request:async(command,body)=>{const response=await fetch('/api/'+command,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('Browser request failed');return response.json();}});
        browserController.clientId=${JSON.stringify(clientId)};browserController.operation=1;
        browserController.activate(${JSON.stringify(entry).replace(/</g,'\\u003c')});</script>`);
    }catch(error){res.writeHead(502);res.end(error.message)}
  });
  await new Promise(r=>parent.listen(18994,'127.0.0.1',r));
  // This browser-side test proxy resolves only our own test origins. Any escaped
  // original-site client request fails; all website access belongs in the guard.
  browserProxy=http.createServer((_req,res)=>{res.writeHead(403);res.end()});
  browserProxy.on('connect',(req,socket,head)=>{
    const target=new URL('https://'+req.url);
    if(!((target.hostname==='ui.vt-proxy.example.com' && target.port==='18994') ||
      (/^bl-u\d+-[a-f0-9]{32}\.vt-proxy\.example\.com$/.test(target.hostname) && target.port==='18995'))){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    const upstream=net.createConnection({host:'127.0.0.1',port:Number(target.port)},()=>{
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });
  await new Promise(r=>browserProxy.listen(18996,'127.0.0.1',r));
  console.log(JSON.stringify({parent:parentOrigin,browserProxy:'http://127.0.0.1:18996',unit}));
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);
main().catch(error=>{console.error(error.message);close()});
