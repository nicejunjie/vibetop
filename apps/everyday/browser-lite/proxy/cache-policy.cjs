'use strict';
// Browser caching for realm responses. Every response used to be forced to
// "no-store", so a slow link re-downloaded every stylesheet, script, image and
// font on each page view. A resource URL already names the user's realm host,
// context and tab, so the browser's cache is per user and per tab: let it keep
// what the site allows, as "private" so Cloudflare and other shared caches
// never store a realm response. Documents stay "no-store": they carry the
// bridge, sync cookies and per-navigation entries.
function realmCacheControl(upstream,{document=false}={}) {
  if(document)return 'no-store';
  const directives=String(upstream||'').split(',').map(part=>part.trim()).filter(Boolean);
  if(directives.some(part=>/^no-store$/i.test(part)))return 'no-store';
  const kept=directives.filter(part=>!/^(public|private|s-maxage=.*)$/i.test(part));
  return ['private',...kept].join(', ');
}
module.exports={realmCacheControl};
