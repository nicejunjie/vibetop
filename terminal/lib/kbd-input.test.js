/* Unit tests for the mobile-terminal input state machine (kbd-input.js).
 *
 *   node --test terminal/lib/        (or: cd terminal/lib && node --test)
 *
 * No deps — node's built-in runner. These pin the keyboard/IME behaviour that has
 * regressed more than once: the cardinal rule is that IME composition (pinyin,
 * zhuyin, kana) must NEVER forward the intermediate buffer to the shell — only the
 * committed text on candidate selection. Plus the value-diff basics (immediate
 * chars, code-point-aware backspace) and the dictation safety net.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const KbdInput = require("./kbd-input.js");

// A deterministic clock: captures the single pending debounced flush so a test can
// fire it (or not) explicitly. Mirrors how sched()/cancel() use one timer.
function fakeClock() {
  let pending = null, seq = 0;
  return {
    setTimeout: (fn, ms) => { pending = { fn, ms, id: ++seq }; return pending.id; },
    clearTimeout: (id) => { if (pending && pending.id === id) pending = null; },
    fire() { const p = pending; pending = null; if (p) p.fn(); return !!p; },
    pendingMs: () => (pending ? pending.ms : null),
  };
}

function harness(opts = {}) {
  const sent = [];
  const clk = fakeClock();
  const fwd = KbdInput.create((b) => sent.push(b), {
    setTimeout: clk.setTimeout, clearTimeout: clk.clearTimeout, ...opts,
  });
  return { sent, clk, fwd, text: () => sent.join("") };
}

// ---- the cardinal regression: pinyin must not leak ---------------------------

test("IME: typing pinyin then selecting a candidate sends ONLY the committed text", () => {
  const h = harness();
  h.fwd.compositionStart();
  // pinyin builds up in the overlay (isComposing = true throughout)
  ["s", "sh", "sho", "shou", "shou ", "shou j", "shou ji"].forEach((v) => h.fwd.input(v, true));
  // the user pauses to look at candidates — a debounce is armed but NOT the shell echo
  assert.equal(h.text(), "", "nothing may reach the PTY mid-composition");
  // pick 手机
  h.fwd.compositionEnd("手机");
  h.clk.fire();                              // compositionEnd's short flush
  assert.equal(h.text(), "手机", "only the selected characters are sent");
});

test("IME: a normal-length pause mid-composition never echoes the raw pinyin", () => {
  const h = harness();
  h.fwd.compositionStart();
  h.fwd.input("ni hao", true);
  // Even if we ignore the (6s dictation) safety timer, no bytes should be buffered
  // out to the shell before compositionend.
  assert.equal(h.text(), "");
  assert.equal(h.fwd._state().lastSent, "");
  h.fwd.compositionEnd("你好");
  h.clk.fire();
  assert.equal(h.text(), "你好");
});

test("IME: replacing a candidate does not corrupt the line", () => {
  const h = harness();
  h.fwd.compositionStart();
  h.fwd.input("shouji", true);
  h.fwd.compositionEnd("手机");
  h.clk.fire();
  assert.equal(h.text(), "手机");           // no leading 'shouji', no stray backspaces
  assert.deepEqual(h.sent, ["手", "机"]);
});

// ---- value-diff basics -------------------------------------------------------

test("normal typing sends each new char immediately (no timer)", () => {
  const h = harness();
  h.fwd.input("h", false);
  h.fwd.input("he", false);
  h.fwd.input("hel", false);
  assert.equal(h.text(), "hel");
  assert.equal(h.clk.pendingMs(), null, "normal typing must not debounce");
});

test("editing emits code-point-aware backspaces for the removed tail", () => {
  const h = harness();
  h.fwd.input("abc", false);
  h.fwd.input("ab", false);                 // deleted 'c'
  assert.equal(h.sent.filter((b) => b === "\x7f").length, 1, "one DEL for one removed char");
  h.fwd.input("abX", false);                // replaced tail
  assert.equal(h.text().endsWith("X"), true);
});

test("an emoji is one delete, not two lone surrogates", () => {
  const h = harness();
  h.fwd.input("🎉", false);                  // astral char (2 UTF-16 units)
  h.fwd.input("", false);                    // clear it
  assert.equal(h.sent.filter((b) => b === "\x7f").length, 1, "one DEL removes the whole emoji");
});

test("Enter flushes the buffer, sends CR, and resets the mirror", () => {
  const h = harness();
  h.fwd.input("ls", false);
  h.fwd.enter("ls");
  assert.equal(h.text(), "ls\r");
  assert.equal(h.fwd._state().lastSent, "", "mirror reset for the next line");
});

// ---- dictation safety net (the trade-off, explicitly pinned) -----------------

test("dictation (long composition) still lands via the safety flush", () => {
  const h = harness({ composeSafetyMs: 500 });
  h.fwd.compositionStart();
  h.fwd.input("hello world", true);
  assert.equal(h.text(), "", "not yet — waiting out the safety window");
  h.clk.fire();                              // the safety timer fires (dictation stalled)
  assert.equal(h.text(), "hello world");
});

test("dictation's transient clear-to-empty is ignored mid-composition", () => {
  const h = harness();
  h.fwd.compositionStart();
  h.fwd.input("hello", true);
  h.fwd.compositionEnd("hello");
  h.clk.fire();
  assert.equal(h.text(), "hello");
  // a spurious empty revision WHILE composing must not emit backspaces
  h.fwd.compositionStart();
  h.fwd.input("", true);
  h.clk.fire();
  assert.equal(h.text(), "hello", "no stray DELs from the transient clear");
});
