'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/filesx.html', 'utf8');
const photoCode = source.slice(source.indexOf('  var PHOTO_TYPES'), source.indexOf('  // -- download: single file direct;'));
function harness(names = ['one.JPG', 'two.png'], options = {}) {
  const elements = [], requests = [], shares = [];
  function el(tag, cls, text) {
    const node = {tag, cls, textContent: text, disabled: false, listeners: {},
      setAttribute() {}, appendChild() {}, focus() {}, remove() {this.removed = true;},
      addEventListener(type, cb) {this.listeners[type] = cb;}, click() {if (!this.disabled) this.listeners.click?.({target: this});}};
    elements.push(node); return node;
  }
  const ctx = {IS_IOS: true, modalOpen: false, selCount: names.length,
    rows: names.map(name => ({name, isDir: false})), selNames: () => names,
    selPaths: () => names.map(n => '/photos/' + n), el, AbortController, File,
    navigator: {canShare: () => options.supported !== false, share(data) {shares.push(data); return options.reject ? Promise.reject(options.reject) : Promise.resolve();}},
    document: {body: {appendChild() {}}, getElementById: () => ({focus() {}})},
    trapFocus: () => () => {}, fetch: async (url, init) => {
      requests.push({url, init});
      if (options.fail) return {ok: false};
      return {ok: true, blob: async () => new Blob(['original bytes'], {type: 'application/octet-stream'})};
    }};
  vm.createContext(ctx); vm.runInContext(photoCode, ctx);
  return {ctx, elements, requests, shares, settle: () => new Promise(r => setImmediate(r))};
}
test('multiple photos remain original typed files, and share only on the ready button tap', async () => {
  const h = harness(); h.ctx.doSavePhotos(); await h.settle();
  assert.equal(h.requests.length, 2);
  assert(h.requests.every(r => r.url.startsWith('/api/fs/download?path=')));
  assert.equal(h.shares.length, 0);
  h.elements.find(e => e.cls === 'mok').click();
  assert.equal(h.shares.length, 1); // synchronous click, no network wait
  assert.deepEqual(Array.from(h.shares[0].files, f => [f.name, f.type]), [['one.JPG', 'image/jpeg'], ['two.png', 'image/png']]);
  assert.equal(await h.shares[0].files[0].text(), 'original bytes');
});
test('Photos action excludes mixed files, folders and non-iOS browsers', () => {
  const h = harness(['one.jpg', 'archive.zip']); assert.equal(h.ctx.canSavePhotos(), false);
  const images = harness(); images.ctx.rows[0].isDir = true; assert.equal(images.ctx.canSavePhotos(), false);
  images.ctx.rows[0].isDir = false; images.ctx.IS_IOS = false; assert.equal(images.ctx.canSavePhotos(), false);
});
test('cancel aborts preparation without opening a share sheet', async () => {
  const h = harness(); h.ctx.doSavePhotos();
  h.elements.find(e => e.cls === 'mcancel').click(); await h.settle();
  assert.equal(h.requests.length, 0); assert.equal(h.shares.length, 0); assert.equal(h.ctx.modalOpen, false);
});
test('failed or unsupported selections cannot share incomplete photos', async () => {
  for (const options of [{fail: true}, {supported: false}]) {
    const h = harness(undefined, options); h.ctx.doSavePhotos(); await h.settle();
    assert.equal(h.elements.find(e => e.cls === 'mok').disabled, true);
    assert.equal(h.shares.length, 0);
  }
});
test('closing the native share sheet dismisses the preparation dialog quietly', async () => {
  const h = harness(undefined, {reject: {name: 'AbortError'}});
  h.ctx.doSavePhotos(); await h.settle(); h.elements.find(e => e.cls === 'mok').click(); await h.settle();
  assert.equal(h.ctx.modalOpen, false);
});
