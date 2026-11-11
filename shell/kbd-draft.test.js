/* The desktop's hidden ⌨ input (Browser on touch) must show the IME draft.
 * #kbd-input is invisible and forwards nothing until a candidate is chosen, so
 * without the pill the pinyin being typed is visible nowhere.
 *   node --test shell/kbd-draft.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SRC = fs.readFileSync(path.join(__dirname, "desktop.html"), "utf8");

test("the draft pill follows the composition and is hidden when it ends", () => {
  assert.match(SRC, /input\.addEventListener\('compositionupdate', function\(e\) \{ showDraft\(e && e\.data\); \}\)/);
  assert.match(SRC, /composing = false; hideDraft\(\);/);
  assert.match(SRC, /function finalizeDictation\(\) \{[\s\S]{0,120}hideDraft\(\);/);
  assert.match(SRC, /showDraft\(input\.value\);/, "dictation drafts show too");
});

test("the draft pill is display-only", () => {
  const m = SRC.match(/function showDraft\(text\) \{[\s\S]*?\n    \}\n/);
  assert.ok(m, "showDraft not found");
  assert.doesNotMatch(m[0], /input\.value\s*=|sendText|sendKey|post\(/);
});
