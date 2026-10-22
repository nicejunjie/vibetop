'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {hammerhead} = require('./engine.cjs');
const {cookieView, sameSite} = require('./cookie-policy.cjs');
const Cookies = hammerhead('session/cookies');
function fixture() {
  const cookies = new Cookies();
  cookies.setByServer('https://b.example/', [
    'strict=s;Secure;SameSite=Strict', 'lax=l;Secure;SameSite=Lax',
    'default=d;Secure', 'thirdparty=t;Secure;SameSite=None', 'secret=h;Secure;HttpOnly;SameSite=None']);
  return cookies;
}
const options = {role:'auth', credentials:0, sourceOrigin:'https://a.example', targetOrigin:'https://b.example'};
test('schemeful site uses registrable domain, not physical proxy sibling', () => {
  assert.equal(sameSite('https://a.example.com', 'https://b.example.com'), true);
  assert.equal(sameSite('http://a.example.com', 'https://b.example.com'), false);
  assert.equal(sameSite('https://example.com', 'https://evil.com'), false);
});
test('cross-site resources only send explicit Secure SameSite=None', () => {
  const view = cookieView(fixture(), options);
  assert.equal(view.getHeader({url:'https://b.example/'}), 'thirdparty=t; secret=h');
});
test('navigation allows Lax but not Strict, same-site allows both', () => {
  const cookies = fixture();
  assert.equal(cookieView(cookies, {...options,navigation:true}).getHeader({url:'https://b.example/'}), 'lax=l; default=d; thirdparty=t; secret=h');
  assert.equal(cookieView(cookies, {...options,sourceOrigin:'https://b.example'}).getHeader({url:'https://b.example/'}), 'strict=s; lax=l; default=d; thirdparty=t; secret=h');
});
test('anonymous requests cannot read or mutate private jar concurrently', () => {
  const cookies = fixture();
  const anonymous = cookieView(cookies, {...options, role:'relay'});
  assert.equal(anonymous.getHeader({url:'https://b.example/'}), null);
  assert.deepEqual(anonymous.setByServer('https://b.example/', ['thirdparty=attacker;Secure;SameSite=None']), []);
  assert.equal(cookieView(cookies, options).getHeader({url:'https://b.example/'}), 'thirdparty=t; secret=h');
  assert.ok(!cookies.getClientString('https://b.example/').includes('secret='));
});

test('trusted ancestor context cannot become first-party on a same-origin descendant request',()=>{
 const view=cookieView(fixture(),{...options,sourceOrigin:'https://b.example',sameSiteContext:'none'});
 assert.equal(view.getHeader({url:'https://b.example/'}),'thirdparty=t; secret=h');
 assert.equal(view.getClientString('https://b.example/'),'thirdparty=t');
 assert.deepEqual(view.setByServer('https://b.example/',['strict=changed;Secure;SameSite=Strict']),[]);
});
