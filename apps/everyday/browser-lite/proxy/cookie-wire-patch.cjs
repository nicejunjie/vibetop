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
module.exports = {patchCookieWire,hardenCookieWire};
