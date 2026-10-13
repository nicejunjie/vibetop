'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {hammerhead} = require('./engine.cjs');
const {formatSyncCookie,parseClientSyncCookieStr} = hammerhead('utils/cookie');
test('sync cookie round trip preserves security attributes', () => {
  const cookie = {isClientSync:true,sid:'profile',key:'session',value:'value',domain:'example.com',path:'/',
    expires:'Infinity',lastAccessed:new Date(),secure:true,sameSite:'strict',hostOnly:true};
  const parsed = parseClientSyncCookieStr(formatSyncCookie(cookie)).actual[0];
  assert.ok(formatSyncCookie(cookie).startsWith('__Host-c|'));
  assert.ok(formatSyncCookie(cookie).endsWith(';path=/;Secure'));
  assert.equal(parsed.secure,true);assert.equal(parsed.sameSite,'strict');assert.equal(parsed.hostOnly,true);
});
test('unprefixed Domain-cookie injection is ignored', () => {
  const cookie = {isClientSync:true,sid:'profile',key:'fixation',value:'attack',domain:'b.example',path:'/',expires:'Infinity',lastAccessed:new Date()};
  const forged = formatSyncCookie(cookie).replace('__Host-','');
  assert.deepEqual(parseClientSyncCookieStr(forged).actual,[]);
});
test('malformed sibling cookies cannot break sync parser', () => {
  for (const value of ['cw|sid|%XX|a|%2F||x||%XX=value','cw|sid|key|a|%2F||x||null=value','plain=value'])
    assert.doesNotThrow(()=>parseClientSyncCookieStr(value));
});
