'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/filesx.html', 'utf8');
const code = source.slice(source.indexOf('  var PHOTO_TYPES'), source.indexOf('  // -- inline editors:'));
function harness(names = ['one.JPG', 'two.png'], options = {}) {
  const requests = [], shares = [], toasts = [], label = {}, button = {setAttribute() {}, querySelector: () => label};
  const ctx = {IS_IOS: true, selCount: names.length,
    rows: names.map(name => ({name, isDir: false, size: 14, mtime: 1})),
    selNames: () => names, selPaths: () => names.map(n => '/photos/' + n), AbortController, File,
    navigator: {canShare: () => options.supported !== false, share(data) {
      shares.push(data); return options.reject ? Promise.reject(options.reject) : Promise.resolve();
    }}, document: {getElementById: () => button}, toast: (...args) => toasts.push(args),
    fetch: async (url, init) => {
      requests.push({url, init});
      if (options.wait) await options.wait;
      if (options.fail) return {ok: false};
      return {ok: true, blob: async () => new Blob(['original bytes'], {type: 'application/octet-stream'})};
    }};
  ctx.renderActions = () => ctx.syncDownloadPreparation();
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return {ctx, requests, shares, toasts, button, label,
    settle: () => new Promise(r => setImmediate(r)),
    select(next) {names = next; ctx.selCount = next.length; ctx.rows = next.map(name => ({name, isDir: false, size: 14, mtime: 1})); ctx.renderActions();}};
}
test('selection prepares images and Download directly shares originals synchronously', async () => {
  const h = harness(); h.ctx.renderActions(); await h.settle();
  assert.equal(h.requests.length, 2); assert.equal(h.shares.length, 0);
  h.ctx.doDownload(); assert.equal(h.shares.length, 1);
  assert.deepEqual(Array.from(h.shares[0].files, f => [f.name, f.type]), [['one.JPG', 'image/jpeg'], ['two.png', 'image/png']]);
  assert.equal(await h.shares[0].files[0].text(), 'original bytes');
  assert.equal(h.requests.length, 2); // Download does not fetch or create a dialog
});
test('Download stays unavailable during preparation rather than sharing partial files', async () => {
  let release; const wait = new Promise(r => {release = r;});
  const h = harness(undefined, {wait}); h.ctx.renderActions(); await h.settle();
  assert.equal(h.button.disabled, true); assert.equal(h.label.textContent, 'Preparing…');
  h.ctx.doDownload(); assert.equal(h.shares.length, 0);
  release(); await h.settle(); assert.equal(h.button.disabled, false);
  h.ctx.doDownload(); assert.equal(h.shares[0].files.length, 2);
});
test('changed selection aborts old preparation and never shares stale images', async () => {
  let release; const wait = new Promise(r => {release = r;});
  const h = harness(['old.jpg'], {wait}); h.ctx.renderActions(); await h.settle();
  h.select(['new.png']); assert.equal(h.requests[0].init.signal.aborted, true);
  release(); await h.settle(); h.ctx.doDownload();
  assert.deepEqual(Array.from(h.shares[0].files, f => f.name), ['new.png']);
});
test('clearing selection releases prepared files; unchanged refreshes reuse them', async () => {
  const h = harness(); h.ctx.renderActions(); await h.settle();
  h.ctx.renderActions(); await h.settle(); assert.equal(h.requests.length, 2);
  h.select([]); assert.equal(h.ctx.preparedDownload, null); assert.equal(h.requests[0].init.signal.aborted, true);
});
test('changed file metadata invalidates previously prepared bytes', async () => {
  const h = harness(['one.jpg']); h.ctx.renderActions(); await h.settle();
  h.ctx.rows[0].mtime = 2; h.ctx.renderActions(); await h.settle();
  assert.equal(h.requests.length, 2);
});
test('Download accepts mixed original files but excludes folders', () => {
  const h = harness(['one.jpg', 'archive.zip']); assert.equal(h.ctx.canDownloadSelection(), true);
  h.ctx.rows[0].isDir = true; assert.equal(h.ctx.canDownloadSelection(), false);
});
test('desktop selections do not prefetch and download each original without ZIP', async () => {
  const h = harness(['one.jpg', 'notes.txt']); h.ctx.IS_IOS = false;
  const downloads = []; h.ctx.nativeDownload = (url, name) => downloads.push({url, name});
  h.ctx.renderActions(); await h.settle(); assert.equal(h.requests.length, 0);
  h.ctx.doDownload(); assert.deepEqual(downloads.map(d => d.name), ['one.jpg', 'notes.txt']);
  assert(downloads.every(d => d.url.startsWith('/api/fs/download?path=')));
});
test('failed preparation retries on Download and never shares incomplete files', async () => {
  const options = {fail: true}, h = harness(undefined, options);
  h.ctx.renderActions(); await h.settle(); h.ctx.doDownload();
  assert.equal(h.shares.length, 0);
  options.fail = false; await h.settle(); h.ctx.doDownload(); assert.equal(h.shares.length, 1);
});
test('unsupported selections never share', async () => {
  const h = harness(undefined, {supported: false}); h.ctx.renderActions(); await h.settle();
  h.ctx.doDownload(); assert.equal(h.shares.length, 0); assert(h.toasts.length);
});
test('cancelled native share keeps Download ready without an error or intermediate dialog', async () => {
  const h = harness(undefined, {reject: {name: 'AbortError'}});
  h.ctx.renderActions(); await h.settle(); h.ctx.doDownload(); await h.settle();
  assert.equal(h.button.disabled, false); assert.equal(h.toasts.length, 0);
  h.ctx.doDownload(); assert.equal(h.shares.length, 2);
});
