// Reproduction harness for "the key bar covers the line you type on".
//
// This is the thing that was missing every previous round: a deterministic local
// repro. It rebuilds the geometry MEASURED off a real iPhone screenshot
// (docs/design-decisions.md) — terminal frame 0..574, #sys-keybar 521..571,
// taskbar 574..626, keyboard from 638 — drives a real terminal on the live host
// through it in Playwright WebKit, and asserts the active line clears the bar AND
// survives the TUI repaints that used to destroy the lift.
//
// It needs a live host + a session cookie, so it is NOT part of ./run-tests.sh.
// Run it against the WORKING TREE (it injects terminal/terminal-kbd.js via
// page.route, so you never have to deploy to test a change):
//
//   VT_COOKIE=$(sudo tools/mint-session-cookie.py junjie) node tests/kbd/keybar-occlusion.mjs
//
// Uses a THROWAWAY terminal (t41) — never one of the user's own sessions. Stop it
// afterwards:  curl -X POST -H "Cookie: vt_session=$VT_COOKIE" \
//                   http://127.0.0.1/api/terminals/41/stop
//
// To watch it FAIL the way the bug did, drop the page.route call so the deployed
// terminal-kbd.js is used instead.
import { webkit } from '/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs';
const C=process.env.VT_COOKIE;
// The shell mock reproduces the geometry measured off IMG_9243.png exactly:
//   terminal frame 0..574, #sys-keybar 521..571, taskbar 574..626, keyboard 638+.
const HOST=`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:626px;overflow:hidden;background:#161b22}
#f{position:absolute;left:0;top:0;width:100%;height:574px;border:0}
#bar{position:fixed;left:0;top:521px;height:50px;right:0;background:rgba(20,20,22,.97);z-index:9000}</style>
<iframe id=f src="http://127.0.0.1/t41/"></iframe><div id=bar></div>
<script>
  // What landing/desktop.html's postOcclusion() does: measure frame bottom - bar top.
  window.setOcclusion = function(){
    var r = document.getElementById('f').getBoundingClientRect();
    var px = Math.max(0, r.bottom - 521);
    document.getElementById('f').contentWindow.postMessage({type:'kbd-occlusion', px:px}, '*');
    return px;
  };
</script>`;
const srv=http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(HOST)});
await new Promise(r=>srv.listen(8794,'127.0.0.1',r));
const b=await webkit.launch();
const ctx=await b.newContext({viewport:{width:440,height:956},isMobile:true,hasTouch:true,deviceScaleFactor:3});
await ctx.addCookies([{name:'vt_session',value:C,domain:'127.0.0.1',path:'/'}]);
const pg=await ctx.newPage();
// Serve the WORKING-TREE terminal-kbd.js instead of the deployed one, so this
// proves the edit without touching the user's live stack.
await pg.route('**/terminal-kbd.js*', route => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: fs.readFileSync('/home/junjie/vibe-coding/vibetop/terminal/terminal-kbd.js','utf8') }));
await pg.goto('http://127.0.0.1:8794/',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(4500);
const f=pg.frames()[1];
const BAR_TOP=521;
// Where is the terminal's last row, in SCREEN coords?
const lastRowBottom = () => f.evaluate(() => {
  const t=window.term, se=document.scrollingElement||document.documentElement;
  const er=t.element.getBoundingClientRect();
  return { lastRowBottom:+(er.bottom).toFixed(1), scrollTop:se.scrollTop,
           rows:t.rows, rowH:+(er.height/t.rows).toFixed(2), cursorY:t.buffer.active.cursorY };
});
const fails=[];
const show=async(label)=>{ const m=await lastRowBottom();
  const clear = m.lastRowBottom <= BAR_TOP + 1;
  console.log(`${label.padEnd(34)} lastRowBottom=${String(m.lastRowBottom).padStart(6)}  scrollTop=${String(m.scrollTop).padStart(3)}  cursorY=${String(m.cursorY).padStart(3)}  ${clear?'CLEAR of the bar':'>>> UNDER THE BAR'}`);
  return {m, clear}; };

let r = await show('1. keyboard down (no occlusion)');
if (r.m.scrollTop !== 0) fails.push('idle state should not be scrolled');

const px = await pg.evaluate(()=>window.setOcclusion());
console.log(`\n   desktop measured occlusion = ${px}px (frame bottom 574 - bar top 521)\n`);
await pg.waitForTimeout(400);
r = await show('2. bar shown -> prompt lifted');
if (!r.clear) fails.push('after the bar appeared, the last row is still under it');

// THE regression: a TUI repaint parks the cursor at the top mid-render. This is
// exactly what zeroed the old design's scroll, permanently.
await f.evaluate(()=>window.term.write('\x1b[H'));
await pg.waitForTimeout(350);
r = await show('3. after TUI repaint (cursor home)');
if (!r.clear) fails.push('a TUI repaint pushed the terminal back under the bar (the old bug)');
await f.evaluate(()=>window.term.write('\x1b[30;1H'));
await pg.waitForTimeout(350);
r = await show('4. cursor back at the prompt');
if (!r.clear) fails.push('after the repaint finished, the prompt is under the bar');

// Repaint storm — Claude Code redraws constantly; the lift must not jitter.
for (let i=0;i<12;i++){ await f.evaluate(()=>{window.term.write('\x1b[H'); window.term.write('\x1b[30;1H');}); }
await pg.waitForTimeout(500);
r = await show('5. after 12 repaints (jitter check)');
if (!r.clear) fails.push('the lift did not survive a repaint storm');

// Keyboard closes -> everything must return to normal, nothing left scrolled.
await pg.evaluate(()=>document.getElementById('f').contentWindow.postMessage({type:'kbd-occlusion',px:0},'*'));
await pg.waitForTimeout(400);
r = await show('6. bar hidden -> back to normal');
if (r.m.scrollTop !== 0) fails.push('scroll not released when the bar hid (content would stay cut off)');

await b.close(); srv.close();
console.log(fails.length? '\nFAIL:\n'+fails.join('\n') : '\nPASS — the active line clears the bar and STAYS clear through TUI repaints.');
process.exit(fails.length?1:0);
