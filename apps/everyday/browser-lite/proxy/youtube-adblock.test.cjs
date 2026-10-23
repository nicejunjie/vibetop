'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stripPlayerAds,isPlayerUrl}=require('./youtube-adblock.cjs');

test('ad fields are removed, real playback data is kept',()=>{
  const player={
    responseContext:{visitorData:'x'},
    playabilityStatus:{status:'OK'},
    streamingData:{formats:[{itag:18,url:'https://rr3---sn.googlevideo.com/videoplayback?x=1'}]},
    videoDetails:{videoId:'abc',title:'Real video'},
    adPlacements:[{adPlacementRenderer:{}}],
    playerAds:[{playerLegacyDesktopWatchAdsRenderer:{}}],
    adSlots:[{}],
    adBreakHeartbeatParams:'deadbeef',
    playerConfig:{audioConfig:{loudnessDb:-7},adPlaybackConfig:{allowedAdFormats:['AD_FORMAT_X']}},
  };
  const out=JSON.parse(stripPlayerAds(JSON.stringify(player)));
  assert.equal('adPlacements' in out,false);
  assert.equal('playerAds' in out,false);
  assert.equal('adSlots' in out,false);
  assert.equal('adBreakHeartbeatParams' in out,false);
  assert.equal('adPlaybackConfig' in out.playerConfig,false);
  // Everything that makes the video play is untouched.
  assert.deepEqual(out.streamingData,player.streamingData);
  assert.deepEqual(out.videoDetails,player.videoDetails);
  assert.equal(out.playabilityStatus.status,'OK');
  assert.equal(out.playerConfig.audioConfig.loudnessDb,-7);
});

test('a response with no ad fields is returned unchanged',()=>{
  const clean=JSON.stringify({videoDetails:{videoId:'z'},streamingData:{}});
  assert.equal(stripPlayerAds(clean),clean);
});

test('malformed input is returned untouched so playback is never broken',()=>{
  assert.equal(stripPlayerAds('not json at all'),'not json at all');
  assert.equal(stripPlayerAds('null'),'null');
  assert.equal(stripPlayerAds('[1,2,3]'),'[1,2,3]');
  assert.equal(stripPlayerAds(''),'');
});

test('player endpoint URLs are recognised, ordinary ones are not',()=>{
  assert.equal(isPlayerUrl('https://www.youtube.com/youtubei/v1/player?key=x'),true);
  assert.equal(isPlayerUrl('https://www.youtube.com/youtubei/v1/next?key=x'),true);
  assert.equal(isPlayerUrl('https://m.youtube.com/youtubei/v1/reel_watch_sequence'),true);
  assert.equal(isPlayerUrl('https://www.youtube.com/youtubei/v1/log_event'),false);
  assert.equal(isPlayerUrl('https://www.youtube.com/watch?v=abc'),false);
});
