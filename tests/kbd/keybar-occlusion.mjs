// Repro harness for "the key bar covers the line you type on" — v1.19.85 lift
// edition.
//
// The mechanism under test changed (docs/design-decisions.md, key-bar saga):
// /tN/ no longer scrolls its document at all. The DESKTOP computes bar top AND
// a lift from one instantaneous viewport reading (landing/keybar.js,
// VibeKeybar.compute) and applies the lift itself as a translateY on
// terminals.html's .frames container. This harness rebuilds the geometry the
// field beacons recorded on the reporting iPhone (frame bottom 806/430-scale
// here: frame 0..574, #sys-keybar top 521, keyboard from 638), hosts a REAL
// /tN/ terminal inside a mock of that shell (a .frames-equivalent container +
// the bar), runs the ACTUAL working-tree keybar.js + terminal-kbd.js, and
// asserts:
//   * the last NON-BLANK terminal row lands at/above the bar's top when the
//     bar is up (the lift), and stays there through TUI repaint storms;
//   * the /tN/ document NEVER scrolls (scrollTop pinned 0 — the no-scroll
//     contract that kills the per-tab divergence class of bug);
//   * a fresh, near-empty terminal is NOT lifted (its top-row prompt must stay
//     visible — contentBottom governs, not the frame bottom);
//   * hiding the bar releases the lift.
//
// It needs a live host + a session cookie, so it is NOT part of ./run-tests.sh.
// Run it against the WORKING TREE (keybar.js + terminal-kbd.js are injected via
// page.route, so you never have to deploy to test a change):
//
//   VT_COOKIE=$(sudo tools/mint-session-cookie.py junjie --value-only) node tests/kbd/keybar-occlusion.mjs
//
// Uses a THROWAWAY terminal (t41) — never one of the user's own sessions. Stop it
// afterwards:  curl -X POST -H "Cookie: vt_session=$VT_COOKIE" \
//                   http://127.0.0.1/api/terminals/41/stop
import { webkit } from '/home/junjie/vibe-coding/vibetop/tests/e2e/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs';
const C = process.env.VT_COOKIE;
const KEYBAR_SRC = fs.readFileSync('/home/junjie/vibe-coding/vibetop/landing/keybar.js', 'utf8');
// The mock shell: the terminal iframe inside a .frames-equivalent container
// (the element the desktop lifts), plus the fixed key bar. Geometry scaled from
// the beacon-recorded iPhone: frame 0..574, bar top 521 when "keyboard up".
const HOST = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:626px;overflow:hidden;background:#161b22}
#frames{position:absolute;left:0;top:0;width:100%;height:574px}
#f{position:absolute;inset:0;width:100%;height:100%;border:0}
#bar{position:fixed;left:0;top:521px;height:50px;right:0;background:rgba(20,20,22,.97);z-index:9000;display:none}</style>
<div id=frames><iframe id=f src="http://127.0.0.1/t41/"></iframe></div><div id=bar>
<script>${KEYBAR_SRC}<\/script>
<script>
  // What landing/desktop.html's syncBar does, distilled: one reading ->
  // VibeKeybar.compute -> bar + translateY(.frames), same turn. "Keyboard up"
  // is simulated by feeding compute() the beacon-recorded big-window state.
  // (In production the desktop reads contentBottom itself through the
  // same-origin frame chain; this harness's mock shell is on another PORT, so
  // the /tN/-internal read is done by the node driver and passed in.)
  var BAR_H = 50;
  window.setKeyboard = function (up, contentRel) {
    var fr = document.getElementById('frames');
    var appRect = { top: 0, bottom: 574 };            // natural frame rect (transform-free)
    var st = VibeKeybar.compute({
      vvTop: 0, vvH: up ? 571 : 626, innerH: 626, baseH: 626 + 300, barH: BAR_H,
      frameBottom: appRect.bottom,
      contentBottom: (contentRel == null) ? null : appRect.top + contentRel
    });
    // For the harness, gate on the caller's intent (the real desktop gates on
    // the real baseline; detection is unit-tested in keybar.test.js).
    var lift = up ? st.lift : 0;
    document.getElementById('bar').style.display = up ? 'block' : 'none';
    fr.style.transform = lift ? 'translateY(-' + lift + 'px)' : '';
    return { barTop: st.barTop, lift: lift };
  };
<\/script>`;
const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(HOST); });
await new Promise(r => srv.listen(8794, '127.0.0.1', r));
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await ctx.addCookies([{ name: 'vt_session', value: C, domain: '127.0.0.1', path: '/' }]);
const pg = await ctx.newPage();
// Serve the WORKING-TREE terminal-kbd.js instead of the deployed one, so this
// proves the edit without touching the user's live stack.
await pg.route('**/terminal-kbd.js*', route => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: fs.readFileSync('/home/junjie/vibe-coding/vibetop/apps/everyday/terminal/terminal-kbd.js', 'utf8') }));
// Make sure the throwaway terminal exists before loading it.
await fetch('http://127.0.0.1/api/terminals/41/start', { method: 'POST', headers: { Cookie: 'vt_session=' + C } }).catch(() => {});
await new Promise(r => setTimeout(r, 1500));
await pg.goto('http://127.0.0.1:8794/', { waitUntil: 'domcontentloaded' });
const f = pg.frames()[1];
// Wait for xterm to come up inside /t41/ (poll, not a fixed sleep).
for (let i = 0; i < 60; i++) {
  const up = await f.evaluate(() => !!(window.term && window.term.element)).catch(() => false);
  if (up) break;
  await pg.waitForTimeout(500);
}
const BAR_TOP = 521;   // 571 - 50 (the harness's "keyboard-up" vvBottom is 571)

// /tN/-internal geometry (this is what the desktop reads through the
// same-origin chain in production; the harness reads it via the frame handle
// because its mock shell sits on another port).
const inner = () => f.evaluate(() => {
  const t = window.term;
  const se = document.scrollingElement || document.documentElement;
  const scr = t.element.querySelector('.xterm-screen') || t.element;
  const sr = scr.getBoundingClientRect();
  const rows = t.rows, rh = sr.height / rows;
  const buf = t.buffer.active, vpY = buf.viewportY || 0;
  let last = -1;
  for (let r = rows - 1; r >= 0; r--) {
    const ln = buf.getLine(vpY + r);
    if (ln && ln.translateToString(true) !== '') { last = r; break; }
  }
  return { contentRel: +(sr.top + (last + 1) * rh).toFixed(1),
           scrollTop: se.scrollTop, scrollRange: se.scrollHeight - se.clientHeight,
           lastRow: last, rows, cursorY: buf.cursorY };
});
// Screen coords = /tN/-internal + the lifted container's live rect.top.
const state = async () => {
  const m = await inner();
  const frTop = await pg.evaluate(() => document.getElementById('frames').getBoundingClientRect().top);
  return { ...m, lastRowBottom: +(frTop + m.contentRel).toFixed(1) };
};
const setKeyboard = async (up) => {
  const m = await inner();
  return pg.evaluate(([u, rel]) => window.setKeyboard(u, rel), [up, m.contentRel]);
};
const fails = [];
const show = async (label, wantClear) => {
  const m = await state();
  const clear = m.lastRowBottom <= BAR_TOP + 5;
  console.log(`${label.padEnd(36)} lastRowBottom=${String(m.lastRowBottom).padStart(6)}  scrollTop=${String(m.scrollTop).padStart(3)}  lastRow=${String(m.lastRow).padStart(3)}  ${clear ? 'CLEAR of the bar' : '>>> UNDER THE BAR'}`);
  if (m.scrollTop !== 0) fails.push(`${label}: /tN/ document scrolled (${m.scrollTop}px) — the no-scroll contract broke`);
  if (wantClear && !clear) fails.push(`${label}: last content row under the bar`);
  return m;
};

// 0. The /tN/ document must have NO scroll range at all now.
let m = await state();
if (m.scrollRange > 1) fails.push(`the /tN/ document is scrollable (range ${m.scrollRange}px) — the overlay overhang is back`);

// 1. Fill the screen like a TUI, then raise the "keyboard".
await f.evaluate(() => { let s = ''; for (let i = 1; i <= 60; i++) s += `line ${i}\r\n`; window.term.write(s); });
await pg.waitForTimeout(300);
await show('1. keyboard down (full terminal)', false);
const k = await setKeyboard(true);
console.log(`\n   compute -> barTop=${k.barTop} lift=${k.lift}\n`);
await pg.waitForTimeout(400);
await show('2. bar shown -> content lifted', true);

// 2. THE regression: a TUI repaint parks the cursor at the top mid-render. The
// lift derives from the last NON-BLANK row, so it must not move.
await f.evaluate(() => window.term.write('\x1b[H'));
await pg.waitForTimeout(300);
await show('3. after TUI repaint (cursor home)', true);
await f.evaluate(() => window.term.write('\x1b[30;1H'));
await pg.waitForTimeout(300);
await show('4. cursor back at the prompt', true);

// 3. Repaint storm — Claude Code redraws constantly; the lift must not jitter.
for (let i = 0; i < 12; i++) await f.evaluate(() => { window.term.write('\x1b[H'); window.term.write('\x1b[30;1H'); });
await setKeyboard(true);
await pg.waitForTimeout(400);
await show('5. after 12 repaints (jitter check)', true);

// 4. Keyboard closes -> lift released, nothing left shifted or scrolled.
await setKeyboard(false);
await pg.waitForTimeout(300);
m = await show('6. bar hidden -> back to normal', false);
if (m.lastRowBottom <= BAR_TOP) { /* fine — content naturally above */ }
const tf = await pg.evaluate(() => document.getElementById('frames').style.transform);
if (tf) fails.push(`lift not released when the bar hid (transform "${tf}")`);

// 5. Fresh terminal: clear the screen to one prompt-ish line at the top; with
// the bar up the lift must be ~0 (contentBottom governs) so the top line stays
// visible — the frame-bottom-only rule would have shoved it off-screen.
await f.evaluate(() => window.term.write('\x1b[2J\x1b[H$ '));
await pg.waitForTimeout(300);
const k2 = await setKeyboard(true);
await pg.waitForTimeout(300);
console.log(`\n   fresh-terminal compute -> lift=${k2.lift}`);
if (k2.lift > 40) fails.push(`fresh terminal got lifted ${k2.lift}px — its top-row prompt would be off-screen`);
m = await state();
if (m.lastRowBottom < 0) fails.push('fresh terminal content pushed above the screen top');
await setKeyboard(false);

await b.close(); srv.close();
console.log(fails.length ? '\nFAIL:\n' + fails.join('\n')
  : '\nPASS — content clears the bar, survives repaints, /tN/ never scrolls, fresh terminals stay put.');
process.exit(fails.length ? 1 : 0);
