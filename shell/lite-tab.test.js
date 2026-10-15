const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// WebKit shares one thread across a page and all its frames, so a Browser Lite
// site stuck in a loop froze Vibetop. Only a tab the top-level shell opens
// during the tap gets its own process (design-decisions.md, Browser Lite
// isolation), so there the Start menu opens Lite as a tab.
const shell = fs.readFileSync(path.join(__dirname, 'desktop.html'), 'utf8');
const detect = shell.match(/var LITE_IN_TAB = (\(function \(\) \{[\s\S]*?\}\)\(\));/)[1];
const inTab = (userAgent, platform = 'MacIntel', maxTouchPoints = 0) =>
  vm.runInNewContext(detect, { navigator: { userAgent, platform, maxTouchPoints } });

test('WebKit browsers get Browser Lite as a tab, Chromium and Firefox as a window', () => {
  assert.equal(inTab('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1', 'iPhone', 5), true);
  assert.equal(inTab('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', 'iPhone', 5), true);
  assert.equal(inTab('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15', 'MacIntel', 5), true);
  assert.equal(inTab('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15'), true);
  assert.equal(inTab('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), false);
  assert.equal(inTab('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0', 'Linux x86_64'), false);
});

test('the Start menu opens the tab first, inside the tap, without an opener', () => {
  const branch = shell.match(/if \(id === 'browserlite' && LITE_IN_TAB\) \{([\s\S]*?)\n    \}/)[1];
  const lines = branch.trim().split('\n').map((line) => line.trim());
  assert.match(lines[0], /^window\.open\(APPS\[id\]\.src, '_blank', 'noopener'\);/);
  assert.match(branch, /return;/);
});

test('a saved desktop never restores Browser Lite as a window on WebKit', () => {
  assert.match(shell, /if \(id === 'browserlite' && LITE_IN_TAB\) return;\s+\/\/ a tab there, never a restored window/);
});
