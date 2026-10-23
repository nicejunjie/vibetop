'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {blocks}=require('./adblock-list.cjs');

test('known ad/tracker hosts are blocked, with subdomains',()=>{
  for(const host of ['doubleclick.net','static.doubleclick.net','googlesyndication.com',
    'pagead2.googlesyndication.com','google-analytics.com','ssl.google-analytics.com',
    'adnxs.com','ib.adnxs.com','criteo.com','taboola.com','scorecardresearch.com']) {
    assert.equal(blocks(host),true,host+' should be blocked');
  }
});

test('the Google family the carried session needs is NEVER blocked',()=>{
  for(const host of ['googlevideo.com','rr3---sn-x.googlevideo.com','www.youtube.com','youtube.com',
    'm.youtube.com','ytimg.com','i.ytimg.com','ggpht.com','yt3.ggpht.com','google.com','www.google.com',
    'accounts.google.com','mail.google.com','gstatic.com','fonts.gstatic.com','googleapis.com',
    'youtubei.googleapis.com','www.googleapis.com','googleusercontent.com','lh3.googleusercontent.com',
    'gmail.com','youtube-nocookie.com']) {
    assert.equal(blocks(host),false,host+' must never be blocked');
  }
});

test('ordinary sites are not blocked',()=>{
  for(const host of ['example.com','en.wikipedia.org','github.com','news.ycombinator.com',
    'cdn.jsdelivr.net','chatgpt.com','claude.ai','']) {
    assert.equal(blocks(host),false,host+' should pass');
  }
});

test('a lookalike that merely ends in a block label is not caught',()=>{
  // "notdoubleclick.net" must not match "doubleclick.net" (label boundary).
  assert.equal(blocks('notdoubleclick.net'),false);
  assert.equal(blocks('mycriteo.com'),false);
  // Trailing dot and case are normalised.
  assert.equal(blocks('DoubleClick.Net.'),true);
});
