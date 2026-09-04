/* Tests for terminal-kbd.js — the mobile keyboard/dictation overlay injected
 * into every /tN/ page. The whole file is a touch/xterm/DOM IIFE, so rather than
 * execute it we regex-extract the one pure, safety-critical literal — the
 * KBD_KEY_BYTES map that the system key bar (esc/tab/^C/arrows) forwards to the
 * PTY — and pin its bytes (sw.test.js's extract-the-literal approach).
 *
 *   node --test terminal/
 *
 * These bytes are load-bearing: Enter MUST be CR (a TUI like Claude Code needs
 * \r, not \n), the horizontal trackpad slide sends Ctrl+F/Ctrl+B (cursor move,
 * NOT arrows), and a wrong control byte silently breaks the on-screen keys.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "terminal-kbd.js"), "utf8");

function extractKeyBytes() {
  const m = SRC.match(/var KBD_KEY_BYTES\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(m, "could not find KBD_KEY_BYTES map in terminal-kbd.js");
  // eslint-disable-next-line no-eval
  return vm.runInNewContext("(" + m[1] + ")");
}

test("system-key bar maps to the correct control bytes", () => {
  const b = extractKeyBytes();
  assert.equal(b.Escape, "\x1b");
  assert.equal(b.Tab, "\x09");
  assert.equal(b.CtrlC, "\x03");
  assert.equal(b.Enter, "\r", "Enter must be CR (\\r) for TUIs, not \\n");
  assert.equal(b.Backspace, "\x7f");
});

test("arrow keys send CSI cursor sequences", () => {
  const b = extractKeyBytes();
  assert.equal(b.ArrowUp, "\x1b[A");
  assert.equal(b.ArrowDown, "\x1b[B");
  assert.equal(b.ArrowRight, "\x1b[C");
  assert.equal(b.ArrowLeft, "\x1b[D");
});

test("horizontal trackpad slide sends emacs char-move, not arrows", () => {
  const b = extractKeyBytes();
  // Ctrl+F / Ctrl+B move the text cursor (harmless when nothing to move);
  // arrows would drive a TUI's menu/history instead — the documented reason.
  assert.equal(b.CtrlF, "\x06");
  assert.equal(b.CtrlB, "\x02");
});

test("tab activation tells xterm to reveal the latest output", () => {
  assert.match(SRC, /type === 'vibetop-show-latest'/);
  assert.match(SRC, /window\.term\.scrollToBottom\(\)/);
  assert.match(SRC, /followLatestUntil = Date\.now\(\) \+ 10000/);
  assert.match(SRC, /followLatestTimer = setInterval\(function \(\)/,
    'resize settling must continuously follow the bottom, not rely on fixed delays');
  assert.match(SRC, /requestAnimationFrame\(revealLatest\)/,
    "ring-buffer replay must keep following the bottom while activation is armed");
  const sharedHandler = SRC.indexOf("type === 'vibetop-show-latest'");
  const desktopReturn = SRC.indexOf('if (!isTouch) {');
  assert.ok(sharedHandler >= 0 && sharedHandler < desktopReturn,
    'show-latest listener must be registered before the desktop early return');
});

test("manual history navigation cancels activation's bottom-follow settle window", () => {
  assert.match(SRC, /function cancelLatest\(\) \{[\s\S]*?clearInterval\(followLatestTimer\)/);
  assert.match(SRC, /addEventListener\('wheel', cancelLatest/,
    'mouse-wheel scrollback must immediately stop bottom-following');
  assert.match(SRC, /while \(acc > 18\) \{ cancelLatest\(\); t\.scrollLines\(-1\)/,
    'touch scrollback must immediately stop bottom-following');
  assert.match(SRC, /requestId <= cancelledLatestThrough\) return/,
    'late retries from any already-started activation must not re-arm after a user scroll');
});

test("terminal wrapper follows the live bottom after resize reflow", () => {
  const wrapper = fs.readFileSync(path.join(__dirname, 'terminals.html'), 'utf8');
  assert.match(wrapper, /wasAtLatest = \(b\.baseY - b\.viewportY\) <= 1/);
  assert.match(wrapper, /if \(wasAtLatest\) showLatest\(active\);/,
    'resize must preserve deliberate scrollback and only restore a previously live viewport');
  assert.doesNotMatch(wrapper, /resizeLatestTimer/,
    'resize must not create a fresh reveal request after the user has had time to scroll');
});

test("the terminal's own resize paths follow the live bottom", () => {
  assert.match(SRC, /function claimSize\(\) \{[\s\S]*?if \(atLatest\(\)\) armLatest\(\);[\s\S]*?var c = t\.cols/,
    'two-finger and double-click resize should follow only a live viewport');
  assert.doesNotMatch(SRC, /t\.onResize\(function \(\) \{\s*armLatest\(\);/,
    'a late resize event must not yank an already-scrolled viewport to the bottom');
});
