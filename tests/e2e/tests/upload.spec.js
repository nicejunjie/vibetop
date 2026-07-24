// @ts-check
// Upload round-trip: push a file through the real streaming multipart parser and
// confirm it lands + shows in the listing. Backend behavior -> one browser.
const { test, expect } = require('@playwright/test');
const { backendOnly } = require('../helpers');

test.describe('upload (backend)', () => {
  backendOnly(test);

  test('a multipart upload is stored and listed', async ({ page, baseURL }) => {
    const name = `e2e-upload-${Date.now()}.txt`;
    const body = 'hello from the e2e suite\n';
    // page.request carries the authed cookie from storageState.
    const up = await page.request.post(baseURL + '/api/upload', {
      multipart: { file: { name, mimeType: 'text/plain', buffer: Buffer.from(body) } },
    });
    expect(up.ok()).toBeTruthy();

    const list = await (await page.request.get(baseURL + '/api/upload/list')).json();
    const names = (list.files || []).map((f) => f.name || f);
    expect(names).toContain(name);
  });
});
