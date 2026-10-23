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
//
// Releases rebuild by re-running every patch over the previous release's
// already-patched node_modules, so each patch must leave the text other patches
// look for intact. These anchors sit clear of the HLS patch's inserted text
// (v1.38.136 inserted inside it, and the next rebuild's HLS patch threw).
const DECL = 'const isYoutubeAds = this.isAjax && !!(this.session && this.session.vtAdblock)'
  + ' && ' + PLAYER_URL.toString() + '.test(this.dest.url)'
  + ' && /json/i.test(contentType) && this.destRes.statusCode === 200;';
const PROCESSOR = '{shouldProcessResource: ctx => !!ctx.contentInfo.isYoutubeAds, '
  + 'processResource: (body, _ctx, _charset, _urlReplacer) => (' + stripPlayerAds + ')(body)}';
const engineFiles = engineRequire => {
  const lib = name => engineRequire.resolve('testcafe-hammerhead/lib/' + name);
  return {context: lib('request-pipeline/context/index.js'), resources: lib('processing/resources/index.js'),
    async: engineRequire.resolve('./src/util/patchAsyncResourceProcessor.js')};
};
function patchYoutubeAds(engineRequire) {
  function patch(file, from, to) {
    let source = fs.readFileSync(file, 'utf8');
    if (source.includes(to)) return;
    if (source.split(from).length !== 2) throw new Error('YouTube ads patch anchor changed: ' + from);
    fs.writeFileSync(file, source.replace(from, () => to));
  }
  const {context, resources, async} = engineFiles(engineRequire);
  patch(context, 'const requireProcessing = !this.isAjax &&',
    DECL + '\n        const requireProcessing = isYoutubeAds || !this.isAjax &&');
  patch(context, '            isManifest,\n            isHls,\n', '            isManifest,\n            isHls,\n            isYoutubeAds,\n');
  patch(resources, 'manifest_1.default, script_1.default', 'manifest_1.default, ' + PROCESSOR + ', script_1.default');
  patch(async, 'manifestProcessor, scriptProcessor', 'manifestProcessor, ' + PROCESSOR + ', scriptProcessor');
}
// Undo the v1.38.136 placement in a reused tree, so the HLS patch finds its own
// text again. Runs before the HLS patch; a no-op on a fresh or current tree.
function unpatchLegacyYoutubeAds(engineRequire) {
  function undo(file, legacy, original) {
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(legacy)) fs.writeFileSync(file, source.replace(legacy, () => original));
  }
  const {context, resources, async} = engineFiles(engineRequire);
  const legacyDecl = DECL + '\n        const isHls = !this.isAjax &&';
  if (fs.readFileSync(context, 'utf8').includes(legacyDecl)) {
    undo(context, legacyDecl, 'const isHls = !this.isAjax &&');
    undo(context, 'const requireProcessing = isYoutubeAds || !this.isAjax &&', 'const requireProcessing = !this.isAjax &&');
  }
  undo(resources, '[page_1.default, ' + PROCESSOR + ', ', '[page_1.default, ');
  undo(async, '[pageProcessor, ' + PROCESSOR + ', ', '[pageProcessor, ');
}

// The server strip above sees only ajax player responses. The home/watch feed
// ads ("Sponsored" cards) and a directly-opened video's pre-roll arrive inside
// the HTML (ytInitialData / ytInitialPlayerResponse) and in other youtubei JSON
// (browse, next). So a YouTube page also gets this script, prepended before the
// site's own: it prunes ad entries out of that data as YouTube assigns or
// parses it (the same approach as uBlock Origin's YouTube filters), and hides
// any ad element that still renders. Self-contained: it is sent as source.
function youtubePageAdblock() {
  if (window.__vtYtAdblock) return;
  window.__vtYtAdblock = true;
  var KEYS = {adPlacements: 1, playerAds: 1, adSlots: 1, adBreakHeartbeatParams: 1, adPlaybackConfig: 1, mastheadAd: 1};
  var ITEM = /^(adSlotRenderer|inFeedAdLayoutRenderer|adSlotAndLayoutRenderer|promotedSparklesWebRenderer|promotedVideoRenderer|compactPromotedVideoRenderer|searchPyvRenderer|bannerPromoRenderer|statementBannerRenderer|primetimePromoRenderer)$/;
  var HINT = /"(adPlacements|playerAds|adSlots|adSlotRenderer|mastheadAd|inFeedAdLayoutRenderer|promoted[A-Za-z]*Renderer|searchPyvRenderer|bannerPromoRenderer)"/;
  function isAd(item) {
    if (!item || typeof item !== 'object') return false;
    for (var key in item) {
      if (ITEM.test(key)) return true;
      if ((key === 'richItemRenderer' || key === 'richSectionRenderer') && item[key] && isAd(item[key].content)) return true;
    }
    return false;
  }
  function prune(value, depth) {
    if (!value || typeof value !== 'object' || depth > 80) return value;
    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) { if (isAd(value[i])) value.splice(i, 1); else prune(value[i], depth + 1); }
      return value;
    }
    for (var key in value) {
      if (KEYS[key]) delete value[key]; else prune(value[key], depth + 1);
    }
    return value;
  }
  window.__vtYtPrune = prune;
  var parse = JSON.parse;
  JSON.parse = function (text) {
    var value = parse.apply(this, arguments);
    try { if (typeof text === 'string' && text.length > 200 && HINT.test(text)) prune(value, 0); } catch (e) {}
    return value;
  };
  if (window.Response && Response.prototype.json) {
    var json = Response.prototype.json;
    Response.prototype.json = function () {
      return json.apply(this, arguments).then(function (value) { try { prune(value, 0); } catch (e) {} return value; });
    };
  }
  ['ytInitialData', 'ytInitialPlayerResponse', 'ytInitialReelWatchSequenceResponse'].forEach(function (name) {
    var held;
    try {
      Object.defineProperty(window, name, {configurable: true, enumerable: true,
        get: function () { return held; }, set: function (value) { try { held = prune(value, 0); } catch (e) { held = value; } }});
    } catch (e) {}
  });
  try {
    var style = document.createElement('style');
    style.textContent = 'ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,'
      + 'ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer,ytd-compact-promoted-video-renderer,ytd-search-pyv-renderer,'
      + '#masthead-ad,#player-ads,ytd-rich-item-renderer:has(ytd-ad-slot-renderer),ytd-rich-section-renderer:has(ytd-statement-banner-renderer),'
      + 'ytm-promoted-sparkles-web-renderer,ytm-companion-ad-renderer,ad-slot-renderer{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}
}
const YOUTUBE_HOST = /(^|\.)(youtube|youtube-nocookie)\.com$/i;
const pageScript = host => YOUTUBE_HOST.test(String(host || '')) ? '(' + youtubePageAdblock + ')();\n' : '';

module.exports = { stripPlayerAds, isPlayerUrl, patchYoutubeAds, unpatchLegacyYoutubeAds, pageScript, youtubePageAdblock, PLAYER_URL: PLAYER_URL.source };
