'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hammerhead}=require('./engine.cjs');
const {parseSrcset,handleUrlsSet}=require('./srcset-patch.cjs');
const CNN='https://media.cnn.com/a.jpg?c=2x3&q=h_384,w_256,c_fill/f_webp 1x, https://media.cnn.com/a.jpg?c=2x3&q=h_768,w_512,c_fill/f_webp 2x';
test('commas inside candidate URLs stay in the URL',()=>{
  assert.deepEqual(parseSrcset(CNN),[
    ['https://media.cnn.com/a.jpg?c=2x3&q=h_384,w_256,c_fill/f_webp','1x'],
    ['https://media.cnn.com/a.jpg?c=2x3&q=h_768,w_512,c_fill/f_webp','2x']]);
});
test('ordinary srcset forms still parse',()=>{
  assert.deepEqual(parseSrcset('a.png'),[['a.png','']]);
  assert.deepEqual(parseSrcset('a.png, b.png 2x'),[['a.png',''],['b.png','2x']]);
  // As in browsers, a comma with no whitespace after a bare URL is part of it.
  assert.deepEqual(parseSrcset('a.png,b.png 2x'),[['a.png,b.png','2x']]);
  assert.deepEqual(parseSrcset(' a.png 100w ,\n b.png   200w '),[['a.png','100w'],['b.png','200w']]);
  assert.deepEqual(parseSrcset('data:image/png;base64,AAAA 1x'),[['data:image/png;base64,AAAA','1x']]);
});
test('rewritten srcset is re-parseable with comma-bearing proxy URLs',()=>{
  const out=handleUrlsSet(url=>'https://realm/x/'+url,CNN);
  assert.deepEqual(parseSrcset(out).map(c=>c[0]),parseSrcset(CNN).map(c=>'https://realm/x/'+c[0]));
  const bare=handleUrlsSet(url=>url+',z','a.png, b.png');
  assert.deepEqual(parseSrcset(bare).map(c=>c[0]),['a.png,z','b.png,z']);
});
test('the built engine rewrites a comma-bearing srcset in HTML',()=>{
  const {handleUrlsSet:built}=hammerhead('utils/url');
  const out=built(url=>'https://realm/x/'+url,CNN);
  assert.equal(out,'https://realm/x/https://media.cnn.com/a.jpg?c=2x3&q=h_384,w_256,c_fill/f_webp 1x, '+
    'https://realm/x/https://media.cnn.com/a.jpg?c=2x3&q=h_768,w_512,c_fill/f_webp 2x');
});
