'use strict';
// Network ad/tracker blocklist for Browser Lite. Lite fetches every subresource
// on the user's behalf, so refusing a known ad host at the gateway means the ad
// never loads. Conservative on purpose: a few hundred high-value ad/tracker
// registrable domains, not a 50k EasyList dump that would break page layout.
//
// Google is the hard case. The user carries their OWN Google session into Lite
// (Gmail/Drive/YouTube sign-in) and YouTube serves VIDEO from googlevideo.com --
// the same host as the real video -- so no Google-owned host is ever blocked
// here. The block list is therefore made only of registrable domains that are
// NOT under google.com, and a hardcoded NEVER list (the Google family) short-
// circuits to "allow" so one careless entry can never break sign-in or
// playback. YouTube's own in-stream ads are removed by youtube-adblock.cjs
// (stripping the player API JSON), not by blocking a domain. See
// docs/design-decisions.md "Browser Lite blocks ads".

// Registrable ad/tracker domains (and all their subdomains) that are blocked.
// Every entry is its own SLD -- none is under google.com/youtube.com.
const BLOCK = [
  // Google's separate ad/measurement domains (not needed by Gmail/Drive/YouTube)
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'googletagservices.com', '2mdn.net', 'app-measurement.com', 'admob.com',
  // Ad networks / exchanges / SSPs / DSPs
  'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'criteo.com',
  'criteo.net', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'quantserve.com',
  'quantcount.com', 'moatads.com', 'adsafeprotected.com', 'amazon-adsystem.com', 'casalemedia.com',
  '3lift.com', 'bidswitch.net', 'smartadserver.com', 'teads.tv', 'sharethrough.com', 'contextweb.com',
  'yieldmo.com', 'gumgum.com', 'indexww.com', 'spotxchange.com', 'spotx.tv', 'districtm.io',
  'adform.net', 'mathtag.com', 'bluekai.com', 'tapad.com', 'crwdcntrl.net', 'rlcdn.com',
  'agkn.com', 'demdex.net', 'everesttech.net', 'adroll.com', 'adsymptotic.com', 'servedbyadbutler.com',
  'adzerk.net', 'kargo.com', 'nativo.com', 'triplelift.com', 'yieldlab.net', 'improvedigital.com',
  // Analytics / session trackers commonly filtered as ads
  'hotjar.com', 'mixpanel.com', 'segment.com', 'segment.io', 'fullstory.com', 'mouseflow.com',
  'chartbeat.com', 'chartbeat.net', 'branch.io', 'amplitude.com', 'clarity.ms', 'optimizely.com',
  'krxd.net', 'exelator.com', 'adcolony.com', 'applovin.com', 'inmobi.com', 'mopub.com',
  'chartboost.com', 'flurry.com', 'bugsnag.com', 'nr-data.net',
  // Social pixels / tracking widgets
  'ads-twitter.com', 'analytics.twitter.com', 'connect.facebook.net',
  // Push / popup / content-recommendation ads
  'onesignal.com', 'pushcrew.com', 'propellerads.com', 'popads.net', 'popcash.net',
  'revcontent.com', 'mgid.com', 'adblade.com', 'zergnet.com', 'media.net', 'adtelligent.com',
];

// The Google family the carried session genuinely needs. Never blocked, even if
// a block entry were ever placed under one of these by mistake.
const NEVER = [
  'googlevideo.com', 'youtube.com', 'youtube-nocookie.com', 'ytimg.com', 'ggpht.com',
  'google.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', 'withgoogle.com',
  'gmail.com',
];

const BLOCK_SET = new Set(BLOCK), NEVER_SET = new Set(NEVER);

// Walk label suffixes of host (a.b.c -> a.b.c, b.c, c) against a Set.
// O(number of labels), independent of list size.
function suffixMatch(host, set) {
  for (let i = 0; i < host.length; i++) {
    if ((i === 0 || host[i - 1] === '.') && set.has(host.slice(i))) return true;
  }
  return false;
}

function blocks(host) {
  host = String(host || '').toLowerCase().replace(/\.+$/, '');
  if (!host || host.includes('/')) return false;
  if (suffixMatch(host, NEVER_SET)) return false;
  return suffixMatch(host, BLOCK_SET);
}

module.exports = { blocks, BLOCK, NEVER };
