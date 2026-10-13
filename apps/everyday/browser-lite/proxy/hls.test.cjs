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
