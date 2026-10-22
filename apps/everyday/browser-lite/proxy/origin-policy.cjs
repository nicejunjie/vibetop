'use strict';
const crypto = require('node:crypto');
const {Credentials} = require('./engine.cjs').hammerhead('utils/url');

function upstreamUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS address without embedded credentials');
  }
  return url;
}
class OriginRegistry {
  constructor({uid, profile, secret, domain, protocol = 'https:', port = '', limit = 4096}) {
    if (!Number.isSafeInteger(uid) || uid < 0 || !/^[a-f0-9]{32}$/.test(profile)) throw new Error('Invalid profile');
    if (!/^[a-z0-9.-]+$/.test(domain) || !['http:', 'https:'].includes(protocol)) throw new Error('Invalid proxy domain');
    this.uid = uid; this.profile = profile; this.secret = secret;
    this.domain = domain; this.protocol = protocol; this.port = String(port); this.limit = limit;
    this.byOrigin = new Map(); this.byHost = new Map();
  }
  hostname(origin) {
    const digest = crypto.createHmac('sha256', this.secret).update(this.profile + '\0' + origin).digest('hex').slice(0,32);
    return `bl-u${this.uid}-${digest}.${this.domain}`;
  }
  register(input) {
    const origin = upstreamUrl(input).origin;
    if (this.byOrigin.has(origin)) {
      const physical=this.byOrigin.get(origin);this.byOrigin.delete(origin);this.byOrigin.set(origin,physical);return physical;
    }
    if (this.byOrigin.size >= this.limit) {
      const oldest=this.byOrigin.keys().next().value;
      this.byHost.delete(new URL(this.byOrigin.get(oldest)).host);this.byOrigin.delete(oldest);
    }
    const host = this.hostname(origin);
    const physical = `${this.protocol}//${host}${this.port ? ':'+this.port : ''}`;
    this.byOrigin.set(origin, physical); this.byHost.set(new URL(physical).host, origin);
    return physical;
  }
  original(physical) {
    try {
      const url = new URL(physical);
      if (url.protocol !== this.protocol) return null;
      return this.byHost.get(url.host) || null;
    } catch { return null; }
  }
  verify(host, destination) {
    try {
      const expected=Buffer.from(this.hostname(upstreamUrl(destination).origin)+(this.port ? ':'+this.port : ''));
      const actual=Buffer.from(host);
      return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
    }
    catch { return false; }
  }
  entries() { return Object.fromEntries(this.byOrigin); }
  restore(origins) {
    if (!Array.isArray(origins)) throw new Error('Invalid saved origins');
    for (const origin of origins) this.register(origin);
  }
}
// A relay capability authenticates public network use only. It NEVER grants
// access to a profile cookie jar, even if the URL claims credentials=include.
function useCookieJar({role, credentials, sourceOrigin, targetOrigin}) {
  if (role !== 'auth' || credentials === Credentials.omit) return false;
  return credentials !== Credentials.sameOrigin || sourceOrigin === targetOrigin;
}
function uniqueCookie(header, name) {
  const values = String(header || '').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if (values.length !== 1) return null;
  return values[0].slice(name.length+1);
}
function requestOrigin(headers, registry) {
  if (headers.origin) return registry.original(headers.origin) || 'null';
  if (headers.referer) {
    try { return registry.original(new URL(headers.referer).origin) || 'null'; }
    catch { return 'null'; }
  }
  if (headers['sec-fetch-site'] === 'same-origin') {
    return registry.original(registry.protocol+'//'+headers.host) || 'null';
  }
  return 'null';
}
module.exports = {OriginRegistry, upstreamUrl, useCookieJar, uniqueCookie, requestOrigin};
