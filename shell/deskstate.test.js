'use strict';
// Two-device fixtures for the heartbeat's decisions. These are the cases that
// are miserable to reproduce by hand — you need two browsers, two users, and
// the right timing — and trivial to state as data. Every one of them is a bug
// this shell has actually had, or the invariant that prevents it.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./deskstate.js');

// -- isRunning: the green dot ----------------------------------------------

test('a terminal running on ANOTHER device lights this one\'s dot', () => {
  // Nothing open locally, no union entry — only the backend session count.
  assert.equal(S.isRunning('terminal', { open: [], running: [], terminalCount: 1 }), true);
  assert.equal(S.isRunning('terminal', { open: [], running: [], terminalCount: 0 }), false);
});

test('an app open on another instance lights the dot here', () => {
  assert.equal(S.isRunning('notes', { open: [], running: ['notes'] }), true);
  assert.equal(S.isRunning('notes', { open: ['notes'], running: [] }), true);
  assert.equal(S.isRunning('notes', { open: [], running: [] }), false);
});

test('Browser is NOT special-cased — the dot tracks the window, not the session', () => {
  // Its Chromium/xpra session is persistent, so a permanent green dot is
  // tempting; it made "close on all devices" look broken, because the window
  // closed everywhere and the dot never went dark.
  assert.equal(S.isRunning('browser', { open: [], running: [] }), false);
});

test('X11 Launcher tracks apps on :98, and that check comes FIRST', () => {
  // Open locally but nothing running on :98 → dark. This is the ordering
  // assertion: if the open/union checks ran first, this would be true.
  assert.equal(S.isRunning('x11launcher', { open: ['x11launcher'], running: [], xWinCount: 0 }), false);
  assert.equal(S.isRunning('x11launcher', { open: [], running: ['x11launcher'], xWinCount: 0 }), false);
  // Nothing open anywhere, but an orphaned GUI app still runs → lit.
  assert.equal(S.isRunning('x11launcher', { open: [], running: [], xWinCount: 1 }), true);
});

test('a missing state field is treated as "nothing", never as a crash', () => {
  assert.equal(S.isRunning('notes', {}), false);
  assert.equal(S.isRunning('notes'), false);
  assert.equal(S.isRunning('terminal', {}), false);
});

// -- resetDecision: logout-everywhere --------------------------------------

test('the first reply only sets a baseline — a late joiner must not self-destruct', () => {
  // The bug this prevents: open a second device long after a logout, see a
  // reset_epoch you have never seen, and wipe a desktop nobody asked to clear.
  assert.equal(S.resetDecision(null, 5), 'baseline');
  assert.equal(S.resetDecision(undefined, 5), 'baseline');
});

test('an ADVANCING epoch clears; the same or older one does nothing', () => {
  assert.equal(S.resetDecision(5, 6), 'clear');
  assert.equal(S.resetDecision(6, 6), 'none');
  assert.equal(S.resetDecision(6, 5), 'none');       // a stale/reordered reply
});

test('a reply with no epoch at all is inert', () => {
  assert.equal(S.resetDecision(6, undefined), 'none');
  assert.equal(S.resetDecision(null, null), 'none');
});

// -- closeTargetsFor: "close on all devices" -------------------------------

test('only apps named for THIS instance and actually open here are closed', () => {
  const targets = { notes: ['i-a', 'i-b'], files: ['i-b'] };
  assert.deepEqual(S.closeTargetsFor(targets, 'i-a', ['notes', 'files']), ['notes']);
  assert.deepEqual(S.closeTargetsFor(targets, 'i-b', ['notes', 'files']).sort(), ['files', 'notes']);
  assert.deepEqual(S.closeTargetsFor(targets, 'i-c', ['notes', 'files']), []);
});

test('an app named for me but not open here is not closed', () => {
  // No crash, no phantom close — we simply are not holding it.
  assert.deepEqual(S.closeTargetsFor({ notes: ['i-a'] }, 'i-a', []), []);
});

test('a malformed close_targets is ignored rather than throwing mid-heartbeat', () => {
  assert.deepEqual(S.closeTargetsFor(null, 'i-a', ['notes']), []);
  assert.deepEqual(S.closeTargetsFor({ notes: 'i-a' }, 'i-a', ['notes']), []);   // string, not array
  assert.deepEqual(S.closeTargetsFor({ notes: [] }, 'i-a', ['notes']), []);
});

// -- mintInstanceId --------------------------------------------------------

test('an instance id has the expected shape and is a pure function of its inputs', () => {
  const id = S.mintInstanceId(1756900000000, 0.123456789);
  assert.match(id, /^i-[0-9a-z]+-[0-9a-z]{1,6}$/);
  assert.equal(id, S.mintInstanceId(1756900000000, 0.123456789));
  assert.notEqual(id, S.mintInstanceId(1756900000001, 0.123456789));
});
