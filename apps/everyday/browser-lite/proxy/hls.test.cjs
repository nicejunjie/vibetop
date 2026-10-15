'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead}=require('./engine.cjs');
const {rewritePlaylist,isHls}=require('./hls-patch.cjs');
const MASTER=['#EXTM3U',
  '#EXT-X-MEDIA:NAME="Audio",TYPE=AUDIO,GROUP-ID="audio-128000",URI="/amplify_video/1/pl/mp4a/128000/a.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=2176000,RESOLUTION=720x720,AUDIO="audio-128000"',
  '/amplify_video/1/pl/avc1/720x720/v.m3u8',
  '#EXT-X-MAP:URI="init.mp4"',
  'seg/0.m4s',
  ''].join('\n');
test('playlist URIs and URI attributes all go through the proxy replacer',()=>{
  const out=rewritePlaylist(MASTER,uri=>'P('+uri+')');
  assert.ok(out.includes('URI="P(/amplify_video/1/pl/mp4a/128000/a.m3u8)"'));
  assert.ok(out.includes('\nP(/amplify_video/1/pl/avc1/720x720/v.m3u8)\n'));
  assert.ok(out.includes('#EXT-X-MAP:URI="P(init.mp4)"'));
  assert.ok(out.includes('\nP(seg/0.m4s)\n'));
  assert.ok(out.includes('#EXT-X-STREAM-INF:BANDWIDTH=2176000,RESOLUTION=720x720,AUDIO="audio-128000"\n'));
  assert.ok(out.startsWith('#EXTM3U\n'));
});
test('HLS MIME types are recognized and others are not',()=>{
  for(const type of ['application/vnd.apple.mpegurl','application/x-mpegURL; charset=utf-8','audio/mpegurl','audio/x-mpegurl'])
    assert.equal(isHls(type),true,type);
  for(const type of ['','text/plain','application/json','video/mp4','application/vnd.apple.mpegurl-extra'])
    assert.equal(isHls(type),false,type);
});
test('the built engine resolves path-absolute playlist URIs against the playlist origin',async()=>{
  const Charset=hammerhead('processing/encoding/charset');
  const {process}=hammerhead('processing/resources');
  const charset=new Charset(); charset.set('utf-8',1);
  const ctx={destResBody:Buffer.from(MASTER),contentInfo:{encoding:'',charset,isHls:true},
    dest:{url:'https://video.example/amplify_video/1/pl/master.m3u8',protocol:'https:'},
    toProxyUrl:url=>'https://realm.example/s/'+url};
  const out=(await process(ctx)).toString();
  assert.ok(out.includes('URI="https://realm.example/s/https://video.example/amplify_video/1/pl/mp4a/128000/a.m3u8"'));
  assert.ok(out.includes('\nhttps://realm.example/s/https://video.example/amplify_video/1/pl/avc1/720x720/v.m3u8\n'));
  assert.ok(out.includes('#EXT-X-MAP:URI="https://realm.example/s/https://video.example/amplify_video/1/pl/init.mp4"'));
});
test('a <video> playlist request through the real gateway comes back rewritten, whole',{timeout:15000},async()=>{
  const http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {BrowserGateway}=require('./gateway.cjs');
  const {RealmOrigins}=require('./realm-origins.cjs');
  const {mainContext}=require('./realm-policy.cjs');
  const {EgressProxy}=require('./egress.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vt-hls-'));
  const ranges=[];
  const source=http.createServer((req,res)=>{ranges.push(req.headers.range);
    res.writeHead(200,{'content-type':'application/x-mpegURL'});res.end(MASTER);});
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const egress=new EgressProxy({resolve:async()=>[{address:'1.1.1.1',family:4}],
    connect:()=>net.createConnection({host:'127.0.0.1',port:source.address().port})});
  const registry=new RealmOrigins({uid:1000,profile:'a'.repeat(32),secret:'test',domain:'realms.proxy.example.com'});
  const identity={uid:1000,profile:'a'.repeat(32),epoch:1};
  const gateway=new BrowserGateway({registry,ingressIdentity:identity,engineSessionId:'stableTestEngine',
    externalProxy:await egress.listen(),parentOrigin:'https://ui.proxy.example.com'});
  const socketPath=path.join(temporary,'gateway.sock');await gateway.listen(socketPath);
  const authorization={...identity,lease:'b'.repeat(32),relay:'test.relay',expires:Math.floor(Date.now()/1000)+60};
  const url=new URL(registry.scope.run({authorization},()=>gateway.url('http://video.example/amplify_video/1/pl/master.m3u8?tag=1',
    {context:mainContext('http://video.example')})));
  try {
    for(const range of [undefined,'bytes=0-99']) {
      const headers={Host:url.host,'X-VT-Browser-Role':'auth','Sec-Fetch-Dest':'video','Sec-Fetch-Mode':'no-cors','Sec-Fetch-Site':'same-origin',
        ...Object.fromEntries(Object.entries(authorization).map(([key,value])=>['X-VT-Browser-'+key,String(value)]))};
      if(range)headers.Range=range;
      const body=await new Promise((resolve,reject)=>{
        http.request({socketPath,path:url.pathname+url.search,headers},res=>{let text='';res.setEncoding('utf8');
          res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve(text));}).on('error',reject).end();
      });
      assert.ok(!/\n\/amplify_video\//.test(body) && !body.includes('URI="/amplify_video'),'no path-absolute URI escapes: '+body);
      assert.match(body,/URI="https:\/\/[^"]+\/http:\/\/video\.example\/amplify_video\/1\/pl\/mp4a\/128000\/a\.m3u8"/);
      assert.match(body,/\nhttps:\/\/[^\n]+\/http:\/\/video\.example\/amplify_video\/1\/pl\/avc1\/720x720\/v\.m3u8\n/);
    }
    assert.deepEqual(ranges,[undefined,undefined],'playlist ranges are not forwarded');
  } finally {
    await gateway.close();await egress.close();
    await new Promise(resolve=>source.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
  }
});
