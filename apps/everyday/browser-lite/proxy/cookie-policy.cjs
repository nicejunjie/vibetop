'use strict';
const {toughCookie} = require('./engine.cjs');
const {useCookieJar} = require('./origin-policy.cjs');
function sameSite(a, b) {
  try {
    a = new URL(a); b = new URL(b);
    const site = host => { try { return toughCookie.getPublicSuffix(host) || host; } catch { return host; } };
    return a.protocol === b.protocol && site(a.hostname) === site(b.hostname);
  } catch { return false; }
}
// A request-local view prevents anonymous concurrent CDN requests from changing
// the authenticated document's cookie behavior. The stored jar remains shared.
function cookieView(cookies, {role, credentials, sourceOrigin, targetOrigin, navigation = false, method = 'GET', sameSiteContext}) {
  const view = Object.create(cookies);
  const allowed = useCookieJar({role, credentials, sourceOrigin, targetOrigin});
  if (sameSiteContext !== undefined && !['strict','lax','none'].includes(sameSiteContext)) throw new Error('Invalid cookie context');
  const context = sameSiteContext ?? (sameSite(sourceOrigin, targetOrigin) ? 'strict'
    : navigation && ['GET', 'HEAD'].includes(method) ? 'lax' : 'none');
  view.getHeader = ({url}) => {
    if (!allowed) return null;
    // Browsers treat unspecified SameSite as Lax; tough-cookie otherwise treats
    // it as unrestricted. Filter unspecified cookies explicitly for subresources.
    return cookies._cookieJar.getCookiesSync(url, {http: true, sameSiteContext: context})
      .filter(cookie => context !== 'none' || cookie.sameSite === 'none')
      .map(cookie => cookie.cookieString()).join('; ') || null;
  };
  view.setByServer = (url, values) => {
    if (!allowed) return [];
    // Third-party non-navigation responses may only set SameSite=None cookies.
    const filtered = (Array.isArray(values) ? values : [values]).filter(value => {
      const cookie = toughCookie.Cookie.parse(value);
      return cookie && (cookie.sameSite !== 'none' || cookie.secure)
        && (context !== 'none' || navigation || cookie.sameSite === 'none');
    });
    return cookies.setByServer(url, filtered);
  };
  view.getClientString = url => allowed ? cookies._cookieJar.getCookiesSync(url,{http:false,sameSiteContext:context})
    .filter(cookie=>context!=='none' || cookie.sameSite==='none').map(cookie=>cookie.cookieString()).join('; ') : '';
  view.takePendingSyncCookies = () => []; // Never leak another document's cookies.
  return view;
}
module.exports = {sameSite, cookieView};
