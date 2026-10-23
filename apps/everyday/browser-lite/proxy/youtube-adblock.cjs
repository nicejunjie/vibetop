'use strict';
// Remove YouTube's in-stream (pre/mid/post-roll) ads by stripping the ad fields
// out of the youtubei/v1/player (and related) API response as it passes through
// the proxy. YouTube serves ad video from googlevideo.com -- the same host as
// the real video -- so the ads cannot be refused by domain; they are negotiated
// in this JSON. Removing these keys leaves the player with no ads to schedule.
//
// Best-effort and format-dependent (YouTube changes this over time -- expect
// occasional upkeep): on ANY parse failure the original body is returned
// untouched, so a format change can never break playback, only let an ad back
// in. The strip runs only when the per-user ad-block toggle is on (the engine
// gates it on this.session.vtAdblock). See docs/design-decisions.md
// "Browser Lite blocks ads".
const fs = require('node:fs');

// Self-contained (no closure refs) so build-engine.cjs can inline its source
// into the pinned engine the way the HLS playlist rewriter is inlined.
function stripPlayerAds(text) {
  var AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  var data;
  try { data = JSON.parse(text); } catch (e) { return text; }
  if (!data || typeof data !== 'object') return text;
  var changed = false;
  for (var i = 0; i < AD_KEYS.length; i++) {
    if (AD_KEYS[i] in data) { delete data[AD_KEYS[i]]; changed = true; }
  }
  if (data.playerConfig && typeof data.playerConfig === 'object' && 'adPlaybackConfig' in data.playerConfig) {
    delete data.playerConfig.adPlaybackConfig; changed = true;
  }
  return changed ? JSON.stringify(data) : text;
}

// The youtubei endpoints whose JSON carries the ad negotiation.
const PLAYER_URL = /\/youtubei\/v1\/(player|next|reel_watch_sequence|get_watch)(\?|$)/;
function isPlayerUrl(url) { return PLAYER_URL.test(String(url || '')); }

// Teach the pinned engine to buffer a signed-in user's youtubei player JSON (an
// ajax response, which Hammerhead otherwise streams untouched) and run it
// through an ad-stripping resource processor. Mirrors hls-patch.cjs. Gated on
// this.session.vtAdblock so there is zero cost when the toggle is off.
function patchYoutubeAds(engineRequire) {
  function patch(file, from, to) {
    let source = fs.readFileSync(file, 'utf8');
    if (source.includes(to)) return;
    if (source.split(from).length !== 2) throw new Error('YouTube ads patch anchor changed: ' + from);
    fs.writeFileSync(file, source.replace(from, () => to));
  }
  const lib = name => engineRequire.resolve('testcafe-hammerhead/lib/' + name);
  const context = lib('request-pipeline/context/index.js');
  patch(context,
    'const isHls = !this.isAjax &&',
    'const isYoutubeAds = this.isAjax && !!(this.session && this.session.vtAdblock)'
    + ' && ' + PLAYER_URL.toString() + '.test(this.dest.url)'
    + " && /json/i.test(contentType) && this.destRes.statusCode === 200;\n        const isHls = !this.isAjax &&");
  patch(context,
    'const requireProcessing = !this.isAjax &&',
    'const requireProcessing = isYoutubeAds || !this.isAjax &&');
  patch(context, '            isManifest,\n            isHls,\n', '            isManifest,\n            isHls,\n            isYoutubeAds,\n');
  const processor = '{shouldProcessResource: ctx => !!ctx.contentInfo.isYoutubeAds, '
    + 'processResource: (body, _ctx, _charset, _urlReplacer) => (' + stripPlayerAds + ')(body)}';
  patch(lib('processing/resources/index.js'),
    'const RESOURCE_PROCESSORS = [page_1.default, {shouldProcessResource: ctx => !!ctx.contentInfo.isHls,',
    'const RESOURCE_PROCESSORS = [page_1.default, ' + processor + ', {shouldProcessResource: ctx => !!ctx.contentInfo.isHls,');
  patch(engineRequire.resolve('./src/util/patchAsyncResourceProcessor.js'),
    'const RESOURCE_PROCESSORS = [pageProcessor, {shouldProcessResource: ctx => !!ctx.contentInfo.isHls,',
    'const RESOURCE_PROCESSORS = [pageProcessor, ' + processor + ', {shouldProcessResource: ctx => !!ctx.contentInfo.isHls,');
}

module.exports = { stripPlayerAds, isPlayerUrl, patchYoutubeAds, PLAYER_URL: PLAYER_URL.source };
