// @ts-check
// Multi-user isolation + session revocation — the security-critical coverage.
// Uses TWO real VM users (e2e = admin, e2e2 = plain), each with their own signed
// cookie, and asserts at the API boundary (reliable, no cross-browser rendering).
// Runs on one browser only (this is backend behavior, not a rendering concern).
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

const CK_A = process.env.VIBETOP_E2E_COOKIE;
const CK_B = process.env.VIBETOP_E2E_COOKIE2;
const USER_A = process.env.VIBETOP_E2E_USER || 'e2e';
const USER_B = process.env.VIBETOP_E2E_USER2 || 'e2e2';

function stateFor(baseURL, tok) {
  const u = new URL(baseURL);
  return { cookies: [{ name: 'vt_session', value: tok, domain: u.hostname, path: '/',
    httpOnly: true, secure: u.protocol === 'https:', sameSite: 'Lax' }], origins: [] };
}

test.describe('multi-user isolation (backend)', () => {
  backendOnly(test);
  test.skip(!CK_B, 'no second-user cookie provided (VIBETOP_E2E_COOKIE2)');

  test('each cookie resolves to its own Linux user', async ({ browser, baseURL }) => {
    const a = await browser.newContext({ storageState: stateFor(baseURL, CK_A) });
    const b = await browser.newContext({ storageState: stateFor(baseURL, CK_B) });
    expect((await (await a.request.get(baseURL + '/api/me')).json()).user).toBe(USER_A);
    expect((await (await b.request.get(baseURL + '/api/me')).json()).user).toBe(USER_B);
    await a.close(); await b.close();
  });

  test('notes are isolated per user (A cannot see B and vice versa)', async ({ browser, baseURL }) => {
    const a = await browser.newContext({ storageState: stateFor(baseURL, CK_A) });
    const b = await browser.newContext({ storageState: stateFor(baseURL, CK_B) });
    const secretA = 'A-only-' + Date.now();
    const secretB = 'B-only-' + Date.now();
    // Each writes their own note id "1".
    expect((await a.request.post(baseURL + '/api/notes', { data: { id: '1', content: secretA } })).ok()).toBeTruthy();
    expect((await b.request.post(baseURL + '/api/notes', { data: { id: '1', content: secretB } })).ok()).toBeTruthy();
    // Each reads back ONLY their own — proving per-user home resolution.
    expect((await (await a.request.get(baseURL + '/api/notes?id=1')).json()).content).toBe(secretA);
    expect((await (await b.request.get(baseURL + '/api/notes?id=1')).json()).content).toBe(secretB);
    await a.close(); await b.close();
  });

  test('the plain user is denied the operator-only surfaces (admin gate)', async ({ browser, baseURL }) => {
    const b = await browser.newContext({ storageState: stateFor(baseURL, CK_B) });
    // e2e2 is NOT an admin -> Claude-usage / Update / services-discover must 403.
    expect((await b.request.get(baseURL + '/api/claude/usage')).status()).toBe(403);
    expect((await b.request.post(baseURL + '/api/update', { data: {} })).status()).toBe(403);
    await b.close();
  });

  test('a cookieless request cannot execute a command as the operator (auth gate)', async ({ playwright, baseURL }) => {
    // The loopback-auth-bypass fix: no cookie -> /api/x/launch must 401, not run as
    // APP_USER. Use a FRESH request context so it carries no session cookie (the
    // default `request` fixture would inherit the project's storageState cookie).
    const rc = await playwright.request.newContext();
    const res = await rc.post(baseURL + '/api/x/launch', { data: { cmd: 'xterm' } });
    // The security property is "a cookieless request does NOT execute a command":
    // it must be rejected (4xx), never accepted (2xx). The exact code can be 401
    // (manager auth gate) or 400 (rejected earlier in the chain) — both prove no
    // command ran as the operator.
    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    await rc.dispose();
  });

  // Keep revocation LAST — it invalidates CK_B for any later use.
  test('logout-all revokes the user\'s existing session (token epoch)', async ({ browser, baseURL }) => {
    const b = await browser.newContext({ storageState: stateFor(baseURL, CK_B) });
    expect((await b.request.get(baseURL + '/api/me')).ok()).toBeTruthy();     // valid now
    expect((await b.request.post(baseURL + '/api/logout/all', { data: {} })).ok()).toBeTruthy();
    // The epoch cache is ~5s; poll until the old cookie is rejected.
    await expect.poll(async () => (await b.request.get(baseURL + '/api/me')).status(),
                      { timeout: 12_000, intervals: [500, 1000] }).toBe(401);
    await b.close();
  });
});
