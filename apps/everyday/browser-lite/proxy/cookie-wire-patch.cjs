'use strict';
// Preserve attributes discarded by the testing engine's original sync format.
// Both sides use the same version; malformed sibling Domain cookies are ignored.
function patchCookieWire(source, client) {
  if (source.includes('function vtCookieFlags(')) return source;
  const one = (from,to) => {
    if (source.split(from).length !== 2) throw new Error('Cookie patch anchor changed: '+from);
    source = source.replace(from,to);
  };
  one('CLIENT_COOKIE_SYNC_KEY_FRAGMENT_COUNT = 8;', 'CLIENT_COOKIE_SYNC_KEY_FRAGMENT_COUNT = 9;');
  const flags = 'encodeURIComponent(JSON.stringify({secure:!!cookie.secure,sameSite:cookie.sameSite || "",hostOnly:!!cookie.hostOnly}))';
  if (client) one('.concat(lastAccessed, "|").concat(maxAge);', '.concat(lastAccessed, "|").concat(maxAge,"|",'+flags+');');
  else one('|${lastAccessed}|${maxAge}`;', '|${lastAccessed}|${maxAge}|${'+flags+'}`;');
  one('function parseSyncCookie(cookieStr) {', `function vtCookieFlags(value) {
    var flags = JSON.parse(decodeURIComponent(value));
    return {secure:flags.secure === true,hostOnly:flags.hostOnly === true,
      sameSite:['lax','strict','none'].indexOf(flags.sameSite) >= 0 ? flags.sameSite : undefined};
  }
  function parseSyncCookie(cookieStr) { try { return vtParseSyncCookie(cookieStr); } catch(e) { return null; } }
  function vtParseSyncCookie(cookieStr) {`);
  one('maxAge: parsedKey[7] ? parseInt(parsedKey[7], TIME_RADIX) : null,',
    'maxAge: parsedKey[7] ? parseInt(parsedKey[7], TIME_RADIX) : null, ...vtCookieFlags(parsedKey[8]),');
  if (client) {
    one("case 'httponly':", "case 'samesite': parsedCookie.sameSite = value && value.toLowerCase(); break;\n            case 'httponly':");
    one('if (!parsedCookie.domain)\r\n\t        parsedCookie.domain = hostname;',
      'if (!parsedCookie.domain) { parsedCookie.hostOnly = true; parsedCookie.domain = hostname; }');
  }
  return source;
}
function hardenCookieWire(source,client) {
  if (source.includes("return '__Host-' + (cookie.isServerSync")) return source;
  const one=(from,to)=>{
    if(source.split(from).length!==2)throw new Error('Cookie host binding anchor changed: '+from);
    source=source.replace(from,to);
  };
  one('return (cookie.isServerSync ?', "return '__Host-' + (cookie.isServerSync ?");
  one("key.split('|')", "key.startsWith('__Host-') && key.slice(7).split('|')");
  if(client) one('new RegExp("^[".concat(SYNCHRONIZATION_TYPE.server)', 'new RegExp("^__Host-[".concat(SYNCHRONIZATION_TYPE.server)');
  else one('new RegExp(`^[${exports.SYNCHRONIZATION_TYPE.server}', 'new RegExp(`^__Host-[${exports.SYNCHRONIZATION_TYPE.server}');
  source=source.replaceAll(';path=/',';path=/;Secure');
  return source;
}
// Native sync cookies are only a transport: the page's document.cookie is kept
// in memory. Server cookies delivered to a page stay behind as window-sync
// copies ("w") and script-set ones as "cw", forever, so every site visited
// added to one registrable domain's cookie budget (shared with Vibetop's own
// session). Bound them: server-sync and window-only copies last 10 minutes,
// client-set copies (still the transport to the server) an hour. Deletion
// strings are separate and unaffected.
function boundSyncCookieLifetime(source,client) {
  if (source.includes('vtSyncCookieAge')) return source;
  const age = 'function vtSyncCookieAge(cookie) { return cookie.isClientSync ? ";max-age=3600" : ";max-age=600"; }\n';
  const one = (from,to) => {
    if (source.split(from).length !== 2) throw new Error('Cookie lifetime anchor changed: '+from);
    source = source.replace(from,to);
  };
  if (client) {
    one('return "".concat(cookie.cookieStr, ";path=/;Secure");','return "".concat(cookie.cookieStr, ";path=/;Secure", vtSyncCookieAge(cookie));');
    one('return "".concat(formatSyncCookieKey(cookie), "=").concat(cookie.value, ";path=/;Secure");','return "".concat(formatSyncCookieKey(cookie), "=").concat(cookie.value, ";path=/;Secure", vtSyncCookieAge(cookie));');
    one('\tfunction formatSyncCookie(cookie) {','\t'+age+'\tfunction formatSyncCookie(cookie) {');
  } else {
    one('return `${cookie.cookieStr};path=/;Secure`;','return `${cookie.cookieStr};path=/;Secure${vtSyncCookieAge(cookie)}`;');
    one('return `${formatSyncCookieKey(cookie)}=${cookie.value};path=/;Secure`;','return `${formatSyncCookieKey(cookie)}=${cookie.value};path=/;Secure${vtSyncCookieAge(cookie)}`;');
    one('function formatSyncCookie(cookie) {',age+'function formatSyncCookie(cookie) {');
  }
  return source;
}
module.exports = {patchCookieWire,hardenCookieWire,boundSyncCookieLifetime};
