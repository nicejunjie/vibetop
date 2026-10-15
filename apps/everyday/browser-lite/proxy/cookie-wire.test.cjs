'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {hammerhead,engineRequire} = require('./engine.cjs');
const {formatSyncCookie,parseClientSyncCookieStr,generateDeleteSyncCookieStr} = hammerhead('utils/cookie');
test('sync cookie round trip preserves security attributes', () => {
  const cookie = {isClientSync:true,sid:'profile',key:'session',value:'value',domain:'example.com',path:'/',
    expires:'Infinity',lastAccessed:new Date(),secure:true,sameSite:'strict',hostOnly:true};
  const parsed = parseClientSyncCookieStr(formatSyncCookie(cookie)).actual[0];
  assert.ok(formatSyncCookie(cookie).startsWith('__Host-c|'));
  // Native sync cookies are transport only: client-set ones live an hour.
  assert.ok(formatSyncCookie(cookie).endsWith(';path=/;Secure;max-age=3600'));
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
test('window and server sync copies expire in 10 minutes; deletions stay deletions', () => {
  const base = {sid:'profile',key:'k',value:'v',domain:'example.com',path:'/',expires:'Infinity',lastAccessed:new Date()};
  assert.ok(formatSyncCookie({...base,isWindowSync:true}).endsWith(';path=/;Secure;max-age=600'));
  assert.ok(formatSyncCookie({...base,isServerSync:true}).endsWith(';path=/;Secure;max-age=600'));
  const deletion = generateDeleteSyncCookieStr({syncKey:'__Host-w|profile|k|example.com|%2F|||'});
  assert.ok(!deletion.includes('max-age') && deletion.includes('expires=Thu, 01 Jan 1970'));
  const client = require('node:fs').readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.equal(client.split('vtSyncCookieAge(cookie)').length,4,'the helper plus both client formatters');
});
test('a deleted script cookie is a one-minute tombstone, a live one still an hour', () => {
  const base = {isClientSync:true,isWindowSync:true,sid:'profile',key:'dd_cookie_test_1',value:'',domain:'example.com',path:'/',lastAccessed:new Date()};
  assert.ok(formatSyncCookie({...base,expires:new Date(0)}).endsWith(';max-age=60'));
  assert.ok(formatSyncCookie({...base,expires:'Infinity',maxAge:0}).endsWith(';max-age=60'));
  assert.ok(formatSyncCookie({...base,expires:new Date(Date.now()+86400e3)}).endsWith(';max-age=3600'));
  const client = require('node:fs').readFileSync(engineRequire.resolve('testcafe-hammerhead/lib/client/hammerhead.js'),'utf8');
  assert.ok(client.includes('return ";max-age=60"'),'client copy not upgraded');
});
